// hooks/useCronograma.ts
import {
    addDoc,
    collection,
    collectionGroup,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    Timestamp,
    updateDoc,
    where,
} from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";
import { auth, db } from "../config/firebaseConfig";
import {
  computeNextNotificationAt,
  DEFAULT_NOTIFICATION_SCHEDULE,
  sortReminders,
  type NotificationSchedule,
} from "../types/notifications";
import { enqueueNotificationJob, scheduleEventSourcePath } from "../services/notificationJobs";

export type EventoCronogramaTipo = "entrega" | "ateneo" | "parcial";

declare const __DEV__: boolean;

export const MODULO_GLOBAL = "NINGUNO_EN_ESPECIAL";
export const COMISION_GLOBAL = "NINGUNA_EN_ESPECIAL";
const SCHEDULE_TOLERANCE_MS = 8 * 60 * 1000;
const DEV_LOGS = typeof __DEV__ !== "undefined" && __DEV__;

export type EventoCronogramaScope = "global" | "course" | "commission";

export interface EventoCronograma {
  id: string;
  tipo: EventoCronogramaTipo;
  titulo: string;
  descripcion?: string;
  fecha: Date;
  moduloId?: string;
  moduloTitulo?: string;
  comisionSubseccionId?: string;
  comisionTitulo?: string;
  seccionId?: string;
  seccionTitulo?: string;
  subseccionPath?: string;
  scope?: EventoCronogramaScope;
  creadoPor?: string;
  /** Usado internamente para deduplicar entregas del alumno */
  _origenItemId?: string;
  notificationSchedule?: NotificationSchedule;
}

function resolveEventoScope(moduloId?: string, comisionSubseccionId?: string): EventoCronogramaScope {
  if (!moduloId || moduloId === MODULO_GLOBAL) return "global";
  if (!comisionSubseccionId || comisionSubseccionId === COMISION_GLOBAL) return "course";
  return "commission";
}

export interface EventoCronogramaInput {
  tipo: "ateneo" | "parcial";
  titulo: string;
  descripcion?: string;
  fecha: Date;
  moduloId: string;
  moduloTitulo: string;
  comisionSubseccionId: string;
  comisionTitulo: string;
  notificationSchedule?: NotificationSchedule;
}

interface UseCronogramaOptions {
  rol: string | null;
  uid: string | null;
}

// Replica la logica de path de useItems.ts para construir la ref de la coleccion items
function buildItemsCollection(
  moduloId: string,
  seccionId: string,
  subseccionPath?: string,
) {
  const rawPath = subseccionPath ?? "";
  const pathStr = decodeURIComponent(rawPath);
  const subseccionSegments = pathStr
    .split(/[/,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((id) => ["subsecciones", id]);
  return collection(db, "modulos", moduloId, "secciones", seccionId, ...subseccionSegments, "items");
}

function parseFecha(valor: unknown): Date | null {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  if (valor instanceof Timestamp) return valor.toDate();
  if (typeof valor === "string") {
    const d = new Date(valor);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof valor === "object" && valor !== null && typeof (valor as any).toDate === "function") {
    return (valor as any).toDate();
  }
  return null;
}

function parseFechaLimiteEntrega(fechaLimiteAt: unknown, fechaLimite: unknown, fechaLimiteHora?: unknown): Date | null {
  const canonical = parseFecha(fechaLimiteAt);
  if (canonical) return canonical;
  if (typeof fechaLimite !== "string" || !fechaLimite.trim()) return null;
  const hora = typeof fechaLimiteHora === "string" && /^\d{2}:\d{2}$/.test(fechaLimiteHora)
    ? fechaLimiteHora
    : "23:59";
  const parsed = new Date(`${fechaLimite.trim()}T${hora}:00-03:00`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function pathInfoFromItemPath(path: string): {
  moduloId: string;
  seccionId: string;
  subseccionPath: string;
  itemId: string;
  subseccionesCount: number;
} | null {
  const segs = path.split("/");
  const moduloIndex = segs.indexOf("modulos");
  const seccionesIndex = segs.indexOf("secciones");
  const itemsIndex = segs.lastIndexOf("items");
  if (moduloIndex < 0 || seccionesIndex < 0 || itemsIndex < 0) return null;
  const moduloId = segs[moduloIndex + 1];
  const seccionId = segs[seccionesIndex + 1];
  const itemId = segs[itemsIndex + 1];
  if (!moduloId || !seccionId || !itemId) return null;
  const between = segs.slice(seccionesIndex + 2, itemsIndex);
  const subsecciones: string[] = [];
  for (let index = 0; index < between.length; index += 2) {
    if (between[index] === "subsecciones" && between[index + 1]) {
      subsecciones.push(between[index + 1]);
    }
  }
  return {
    moduloId,
    seccionId,
    subseccionPath: subsecciones.join("/"),
    itemId,
    subseccionesCount: subsecciones.length,
  };
}

function isRestrictedNode(data: any): boolean {
  return data?.esRestringida === true ||
    data?.restringida === true ||
    data?.requiereInscripcion === true ||
    data?.requiereCodigo === true ||
    typeof data?.codigoAcceso === "string" ||
    typeof data?.codigo === "string";
}

function isAvailableItem(data: any): boolean {
  return data?.eliminado !== true &&
    data?.deleted !== true &&
    data?.archivado !== true &&
    data?.archived !== true &&
    data?.deshabilitado !== true &&
    data?.disabled !== true &&
    data?.oculto !== true &&
    data?.hidden !== true &&
    data?.publicado !== false &&
    data?.activo !== false;
}

async function nearestRestrictedScope(info: { moduloId: string; seccionId: string; subseccionPath: string }): Promise<string | null> {
  let restricted: string | null = null;
  const sectionSnap = await getDoc(doc(db, "modulos", info.moduloId, "secciones", info.seccionId));
  if (sectionSnap.exists() && isRestrictedNode(sectionSnap.data())) restricted = "";

  const ids = info.subseccionPath.split("/").filter(Boolean);
  for (let length = 1; length <= ids.length; length += 1) {
    const candidate = ids.slice(0, length).join("/");
    const snap = await getDoc(
      doc(
        db,
        "modulos",
        info.moduloId,
        "secciones",
        info.seccionId,
        ...candidate.split("/").flatMap((id) => ["subsecciones", id]),
      ),
    );
    if (snap.exists() && isRestrictedNode(snap.data())) restricted = candidate;
  }
  return restricted;
}

function studentCanSeeDelivery(
  inscripciones: Array<{ moduloId: string; seccionId: string; subseccionPath: string }>,
  info: { moduloId: string; seccionId: string },
  restrictedScope: string | null,
): boolean {
  if (restrictedScope === null) return true;
  return inscripciones.some((insc) => {
    if (insc.moduloId !== info.moduloId || insc.seccionId !== info.seccionId) return false;
    const path = insc.subseccionPath ?? "";
    if (restrictedScope === "") return true;
    return path === restrictedScope ||
      path.startsWith(`${restrictedScope}/`) ||
      restrictedScope.startsWith(`${path}/`);
  });
}

function logStudentDelivery(event: string, payload: Record<string, unknown>) {
  if (!DEV_LOGS) return;
  console.log(event, payload);
}

export function useCronograma({ rol, uid }: UseCronogramaOptions) {
  const [eventos, setEventos] = useState<EventoCronograma[]>([]);
  const [eventosLoaded, setEventosLoaded] = useState(false);
  const [entregasLoaded, setEntregasLoaded] = useState(false);

  const eventosManualRef = useRef<EventoCronograma[]>([]);
  const entregasRef = useRef<EventoCronograma[]>([]);

  const combinar = useCallback(() => {
    const combined = [...eventosManualRef.current, ...entregasRef.current];
    combined.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    setEventos(combined);
  }, []);

  // Inscripciones del alumno cargadas una vez; usadas para filtrar eventos segmentados.
  const inscripcionesAlumnoRef = useRef<Array<{ moduloId: string; subseccionPath: string }>>([]);

  // ── Listener en tiempo real para eventos_cronograma ──────────────────────
  useEffect(() => {
    if (!uid || !rol) return;

    setEventosLoaded(false);

    const setupListener = (
      inscripciones: Array<{ moduloId: string; subseccionPath: string }>,
    ) => {
      const q = query(collection(db, "eventos_cronograma"), orderBy("fecha", "asc"));
      const esAlumno = rol === "alumno";

      return onSnapshot(
        q,
        (snap) => {
          const todos = snap.docs
            .map((d) => {
              const data = d.data();
              const fecha = parseFecha(data.fecha);
              if (!fecha) return null;
              return {
                id: d.id,
                tipo: data.tipo as "ateneo" | "parcial",
                titulo: data.titulo ?? "",
                descripcion: data.descripcion || undefined,
                fecha,
                moduloId: (data.moduloId as string) || MODULO_GLOBAL,
                moduloTitulo: data.moduloTitulo || undefined,
                comisionSubseccionId: (data.comisionSubseccionId as string) || COMISION_GLOBAL,
                comisionTitulo: data.comisionTitulo || undefined,
                scope: (data.scope as EventoCronogramaScope | undefined) ?? resolveEventoScope(data.moduloId, data.comisionSubseccionId),
                creadoPor: data.creadoPor,
                notificationSchedule: data.notificationSchedule ?? DEFAULT_NOTIFICATION_SCHEDULE,
              } as EventoCronograma;
            })
            .filter(Boolean) as EventoCronograma[];

          if (esAlumno) {
            eventosManualRef.current = todos.filter((e) => {
              // Eventos sin moduloId (datos legacy) o globales → visibles a todos
              if (!e.moduloId || e.moduloId === MODULO_GLOBAL || e.scope === "global") return true;
              if (e.scope === "course" || !e.comisionSubseccionId || e.comisionSubseccionId === COMISION_GLOBAL) {
                return inscripciones.some((i) => i.moduloId === e.moduloId);
              }
              // Evento segmentado: mostrar solo si el alumno está en esa comisión
              return inscripciones.some(
                (i) =>
                  i.moduloId === e.moduloId &&
                  i.subseccionPath
                    .split("/")
                    .filter(Boolean)
                    .includes(e.comisionSubseccionId ?? ""),
              );
            });
          } else {
            eventosManualRef.current = todos;
          }

          setEventosLoaded(true);
          combinar();
        },
        (err) => {
          console.error("useCronograma eventos_cronograma error:", err);
          setEventosLoaded(true);
        },
      );
    };

    let unsub: (() => void) | undefined;

    if (rol === "alumno") {
      // Cargar inscripciones primero, luego iniciar el listener
      getDocs(query(collection(db, "inscripciones"), where("alumnoId", "==", uid)))
        .then((snap) => {
          const inscripciones = snap.docs.map((d) => {
            const data = d.data();
            return {
              moduloId: data.moduloId as string,
              subseccionPath: (data.subseccionPath as string | undefined) ?? "",
            };
          });
          inscripcionesAlumnoRef.current = inscripciones;
          unsub = setupListener(inscripciones);
        })
        .catch((err) => {
          console.error("useCronograma inscripciones error:", err);
          unsub = setupListener([]);
        });
    } else {
      unsub = setupListener([]);
    }

    return () => unsub?.();
  }, [uid, rol, combinar]);

  // ── Fetch de entregas (one-time al montar, según rol) ────────────────────
  useEffect(() => {
    if (!uid || !rol) return;

    let activo = true;
    setEntregasLoaded(false);

    const fetchEntregas = async () => {
      try {
        let entregasDocs: EventoCronograma[] = [];

        if (rol === "admin" || rol === "profesor") {
          // Consulta global mediante collectionGroup
          const snap = await getDocs(
            query(collectionGroup(db, "items"), where("tipo", "==", "entrega")),
          );
          entregasDocs = snap.docs
            .map((d) => {
              const data = d.data();
              const fecha = parseFechaLimiteEntrega(data.fechaLimiteAt, data.fechaLimite, data.fechaLimiteHora);
              if (!fecha) return null;
              // Extraer moduloId y seccionId del path: modulos/{id}/secciones/{id}/...
              const segs = d.ref.path.split("/");
              return {
                id: `entrega_${d.id}`,
                tipo: "entrega" as const,
                titulo: data.titulo ?? "Sin título",
                descripcion: data.descripcionEntrega || undefined,
                fecha,
                moduloId: segs[1] ?? "",
                seccionId: segs[3] ?? "",
                _origenItemId: d.id,
              } as EventoCronograma;
            })
            .filter(Boolean) as EventoCronograma[];
        } else {
          // Alumno: entregas inscritas y entregas publicas visibles por acceso.
          const inscSnap = await getDocs(
            query(collection(db, "inscripciones"), where("alumnoId", "==", uid)),
          );
          const inscripciones = inscSnap.docs.map((d) => {
            const data = d.data();
            return {
              moduloId: data.moduloId as string,
              seccionId: data.seccionId as string,
              subseccionPath: (data.subseccionPath as string | undefined) ?? "",
            };
          });

          const results = await Promise.all(
            inscripciones.map(async ({ moduloId, seccionId, subseccionPath }) => {
              if (!moduloId || !seccionId) return [];
              const col = buildItemsCollection(moduloId, seccionId, subseccionPath);
              const snap = await getDocs(query(col, where("tipo", "==", "entrega")));
              return snap.docs
                .map((d) => {
                  const data = d.data();
                  const fecha = parseFechaLimiteEntrega(data.fechaLimiteAt, data.fechaLimite, data.fechaLimiteHora);
                  if (!fecha) return null;
                  return {
                    id: `entrega_${d.ref.path.replace(/\//g, "_")}`,
                    tipo: "entrega" as const,
                    titulo: data.titulo ?? "Sin título",
                    descripcion: data.descripcionEntrega || undefined,
                    fecha,
                    moduloId,
                    seccionId,
                    subseccionPath: subseccionPath || undefined,
                    _origenItemId: d.ref.path,
                  } as EventoCronograma;
                })
                .filter(Boolean) as EventoCronograma[];
            }),
          );

          // Deduplicar por _origenItemId (inscripciones en distintas subsecciones pueden solapar)
          const seen = new Set<string>();
          entregasDocs = results.flat().filter((e) => {
            if (seen.has(e._origenItemId!)) return false;
            seen.add(e._origenItemId!);
            return true;
          });

          const allDeliveriesSnap = await getDocs(
            query(collectionGroup(db, "items"), where("tipo", "==", "entrega")),
          );

          const deliveriesByAccess = await Promise.all(
            allDeliveriesSnap.docs.map(async (d) => {
              const data = d.data();
              const info = pathInfoFromItemPath(d.ref.path);
              if (!info) {
                logStudentDelivery("student_schedule_delivery_skipped", {
                  itemId: d.id,
                  motivo: "invalid_path",
                });
                return null;
              }

              logStudentDelivery("student_schedule_delivery_loaded", {
                itemId: info.itemId,
                moduloId: info.moduloId,
                seccionId: info.seccionId,
                subsecciones: info.subseccionesCount,
                tieneFechaLimiteAt: Boolean(data.fechaLimiteAt),
              });

              if (!isAvailableItem(data)) {
                logStudentDelivery("student_schedule_delivery_skipped", {
                  itemId: info.itemId,
                  moduloId: info.moduloId,
                  seccionId: info.seccionId,
                  subsecciones: info.subseccionesCount,
                  tieneFechaLimiteAt: Boolean(data.fechaLimiteAt),
                  motivo: "unavailable_item",
                });
                return null;
              }

              const fecha = parseFechaLimiteEntrega(data.fechaLimiteAt, data.fechaLimite, data.fechaLimiteHora);
              if (!fecha) {
                logStudentDelivery("student_schedule_delivery_skipped", {
                  itemId: info.itemId,
                  moduloId: info.moduloId,
                  seccionId: info.seccionId,
                  subsecciones: info.subseccionesCount,
                  tieneFechaLimiteAt: Boolean(data.fechaLimiteAt),
                  motivo: "missing_or_invalid_deadline",
                });
                return null;
              }

              const restrictedScope = await nearestRestrictedScope(info);
              const audienceType = restrictedScope === null ? "public" : "restricted";
              if (!studentCanSeeDelivery(inscripciones, info, restrictedScope)) {
                logStudentDelivery("student_schedule_delivery_skipped", {
                  itemId: info.itemId,
                  moduloId: info.moduloId,
                  seccionId: info.seccionId,
                  subsecciones: info.subseccionesCount,
                  tieneFechaLimiteAt: Boolean(data.fechaLimiteAt),
                  fechaNormalizada: fecha.toISOString(),
                  mesCalculado: `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`,
                  alcance: audienceType,
                  motivo: "restricted_not_enrolled",
                });
                return null;
              }

              logStudentDelivery("student_schedule_delivery_added", {
                itemId: info.itemId,
                moduloId: info.moduloId,
                seccionId: info.seccionId,
                subsecciones: info.subseccionesCount,
                tieneFechaLimiteAt: Boolean(data.fechaLimiteAt),
                fechaNormalizada: fecha.toISOString(),
                mesCalculado: `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`,
                alcance: audienceType,
              });

              return {
                id: `entrega_${info.moduloId}_${info.seccionId}_${info.subseccionPath.replace(/\//g, "_")}_${info.itemId}`,
                tipo: "entrega" as const,
                titulo: data.titulo ?? "Sin titulo",
                descripcion: data.descripcionEntrega || undefined,
                fecha,
                moduloId: info.moduloId,
                seccionId: info.seccionId,
                subseccionPath: info.subseccionPath || undefined,
                _origenItemId: d.ref.path,
              } as EventoCronograma;
            }),
          );

          deliveriesByAccess.filter((e): e is EventoCronograma => Boolean(e)).forEach((e) => {
            if (seen.has(e._origenItemId!)) return;
            seen.add(e._origenItemId!);
            entregasDocs.push(e);
          });
        }

        if (activo) {
          entregasRef.current = entregasDocs;
          setEntregasLoaded(true);
          combinar();
        }
      } catch (err) {
        console.error("useCronograma fetchEntregas error:", err);
        if (activo) setEntregasLoaded(true);
      }
    };

    fetchEntregas();
    return () => {
      activo = false;
    };
  }, [uid, rol, combinar]);

  // ── CRUD (solo admin) ─────────────────────────────────────────────────────
  const crearEvento = async (data: EventoCronogramaInput) => {
    const user = auth.currentUser;
    if (!user) throw new Error("No autenticado");
    const ref = await addDoc(collection(db, "eventos_cronograma"), {
      tipo: data.tipo,
      titulo: data.titulo,
      descripcion: data.descripcion ?? "",
      fecha: Timestamp.fromDate(data.fecha),
      moduloId: data.moduloId,
      moduloTitulo: data.moduloTitulo,
      comisionSubseccionId: data.comisionSubseccionId,
      comisionTitulo: data.comisionTitulo,
      scope: resolveEventoScope(data.moduloId, data.comisionSubseccionId),
      notificationSchedule: buildScheduleForSave(data.fecha, data.notificationSchedule),
      creadoPor: user.uid,
      fechaCreacion: serverTimestamp(),
    });
    await enqueueNotificationJob({
      type: "schedule_event_created",
      sourceId: ref.id,
      sourcePath: scheduleEventSourcePath(ref.id),
      courseId: data.moduloId,
      sectionId: undefined,
    });
  };

  const editarEvento = async (id: string, data: Partial<EventoCronogramaInput>) => {
    const currentSnap = await getDoc(doc(db, "eventos_cronograma", id));
    const before = currentSnap.data();
    const updates: Record<string, unknown> = {};
    if (data.tipo !== undefined) updates.tipo = data.tipo;
    if (data.titulo !== undefined) updates.titulo = data.titulo;
    // Siempre incluimos estos campos aunque sean string vacío / sentinel,
    // para que el usuario pueda modificarlos en la edición.
    updates.descripcion = data.descripcion ?? "";
    updates.moduloId = data.moduloId ?? MODULO_GLOBAL;
    updates.moduloTitulo = data.moduloTitulo ?? "";
    updates.comisionSubseccionId = data.comisionSubseccionId ?? COMISION_GLOBAL;
    updates.comisionTitulo = data.comisionTitulo ?? "";
    updates.scope = resolveEventoScope(data.moduloId, data.comisionSubseccionId);
    if (data.fecha instanceof Date) updates.fecha = Timestamp.fromDate(data.fecha);
    if (data.notificationSchedule !== undefined || data.fecha instanceof Date) {
      let fechaParaSchedule = data.fecha instanceof Date ? data.fecha : null;
      if (!fechaParaSchedule) {
        fechaParaSchedule = parseFecha(before?.fecha) ?? new Date();
      }
      updates.notificationSchedule = buildScheduleForSave(
        fechaParaSchedule,
        data.notificationSchedule,
      );
    }
    await updateDoc(doc(db, "eventos_cronograma", id), updates);
    if (eventRelevantHash(before) !== eventRelevantHash({ ...before, ...updates })) {
      await enqueueNotificationJob({
        type: "schedule_event_updated",
        sourceId: id,
        sourcePath: scheduleEventSourcePath(id),
        courseId: String(updates.moduloId ?? before?.moduloId ?? MODULO_GLOBAL),
        sectionId: String(updates.seccionId ?? before?.seccionId ?? ""),
      });
    }
  };

  const eliminarEvento = async (id: string) => {
    await deleteDoc(doc(db, "eventos_cronograma", id));
  };

  return {
    eventos,
    loading: !eventosLoaded || !entregasLoaded,
    crearEvento,
    editarEvento,
    eliminarEvento,
  };
}

function eventRelevantHash(event: any) {
  const fecha = parseFecha(event?.fecha);
  return JSON.stringify({
    tipo: event?.tipo ?? "",
    titulo: event?.titulo ?? "",
    descripcion: event?.descripcion ?? "",
    fecha: fecha?.toISOString() ?? "",
    moduloId: event?.moduloId ?? MODULO_GLOBAL,
    comisionSubseccionId: event?.comisionSubseccionId ?? COMISION_GLOBAL,
    ubicacion: event?.ubicacion ?? event?.lugar ?? "",
    schedule: normalizeSchedule(event?.notificationSchedule),
  });
}

function normalizeSchedule(schedule: any) {
  if (!schedule) return null;
  return {
    enabled: !!schedule.enabled,
    reminders: sortReminders(schedule.reminders ?? []).map((reminder) => ({
      amount: reminder.amount,
      unit: reminder.unit,
      offsetMinutes: reminder.offsetMinutes,
    })),
  };
}

function buildScheduleForSave(
  fecha: Date,
  schedule?: NotificationSchedule,
): NotificationSchedule {
  const current = schedule ?? DEFAULT_NOTIFICATION_SCHEDULE;
  const reminders = sortReminders(current.reminders ?? []);
  const processed = {};
  const next = current.enabled
    ? computeNextNotificationAt(fecha, reminders, processed, new Date(), SCHEDULE_TOLERANCE_MS)
    : null;
  return {
    enabled: !!current.enabled,
    version: Math.max(1, (current.version ?? 0) + 1),
    reminders,
    nextNotificationAt: next ? Timestamp.fromDate(next) : null,
    processed,
  };
}
