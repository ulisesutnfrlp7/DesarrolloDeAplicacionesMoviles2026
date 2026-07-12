// hooks/useCronograma.ts
import {
    addDoc,
    collection,
    collectionGroup,
    deleteDoc,
    doc,
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

export type EventoCronogramaTipo = "entrega" | "ateneo" | "parcial";

export const MODULO_GLOBAL = "NINGUNO_EN_ESPECIAL";
export const COMISION_GLOBAL = "NINGUNA_EN_ESPECIAL";

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
  creadoPor?: string;
  /** Usado internamente para deduplicar entregas del alumno */
  _origenItemId?: string;
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
}

interface UseCronogramaOptions {
  rol: string | null;
  uid: string | null;
}

// Replica la lógica de path de useItems.ts para construir la ref de la colección items
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
                creadoPor: data.creadoPor,
              } as EventoCronograma;
            })
            .filter(Boolean) as EventoCronograma[];

          if (esAlumno) {
            eventosManualRef.current = todos.filter((e) => {
              // Eventos sin moduloId (datos legacy) o globales → visibles a todos
              if (!e.moduloId || e.moduloId === MODULO_GLOBAL) return true;
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
              const fecha = parseFecha(data.fechaLimite);
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
          // Alumno: solo entregas de sus secciones inscritas
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
                  const fecha = parseFecha(data.fechaLimite);
                  if (!fecha) return null;
                  return {
                    id: `entrega_${d.id}`,
                    tipo: "entrega" as const,
                    titulo: data.titulo ?? "Sin título",
                    descripcion: data.descripcionEntrega || undefined,
                    fecha,
                    moduloId,
                    seccionId,
                    subseccionPath: subseccionPath || undefined,
                    _origenItemId: d.id,
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
    await addDoc(collection(db, "eventos_cronograma"), {
      tipo: data.tipo,
      titulo: data.titulo,
      descripcion: data.descripcion ?? "",
      fecha: Timestamp.fromDate(data.fecha),
      moduloId: data.moduloId,
      moduloTitulo: data.moduloTitulo,
      comisionSubseccionId: data.comisionSubseccionId,
      comisionTitulo: data.comisionTitulo,
      creadoPor: user.uid,
      fechaCreacion: serverTimestamp(),
    });
  };

  const editarEvento = async (id: string, data: Partial<EventoCronogramaInput>) => {
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
    if (data.fecha instanceof Date) updates.fecha = Timestamp.fromDate(data.fecha);
    await updateDoc(doc(db, "eventos_cronograma", id), updates);
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
