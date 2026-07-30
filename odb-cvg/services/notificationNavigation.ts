import { router } from "expo-router";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "../config/firebaseConfig";
import type { NotificationTarget } from "../types/notifications";

export type NavigationErrorCode =
  | "content_not_found"
  | "invalid_target"
  | "permission_denied"
  | "restricted_scope_not_enrolled"
  | "navigation_error";

export type NavigationResult = { ok: true } | { ok: false; code: NavigationErrorCode; message: string };
export type TargetAvailability =
  | { available: true; route?: string }
  | { available: false; code: NavigationErrorCode; message: string };

function normalizeSubsectionPath(target: { subsectionPath?: string[]; subseccionPath?: string | null }): string {
  if (Array.isArray(target.subsectionPath)) {
    return target.subsectionPath.map((part) => String(part).trim()).filter(Boolean).join("/");
  }
  return (target.subseccionPath ?? "").split("/").map((part) => part.trim()).filter(Boolean).join("/");
}

function subsectionSegments(path: string): string[] {
  return path ? path.split("/").flatMap((id) => ["subsecciones", id]) : [];
}

function itemDocPath(target: { moduloId?: string; seccionId?: string; itemId?: string; subsectionPath?: string[]; subseccionPath?: string | null }): string[] | null {
  if (!target.moduloId || !target.seccionId || !target.itemId) return null;
  return ["modulos", target.moduloId, "secciones", target.seccionId, ...subsectionSegments(normalizeSubsectionPath(target)), "items", target.itemId];
}

function isRestrictedNode(data: any): boolean {
  return data?.esRestringida === true ||
    data?.restringida === true ||
    data?.requiereInscripcion === true ||
    data?.requiereCodigo === true ||
    typeof data?.codigoAcceso === "string" ||
    typeof data?.codigo === "string" ||
    data?.tipo === "comision";
}

async function nearestRestrictedPath(target: {
  moduloId?: string;
  seccionId?: string;
  subsectionPath?: string[];
  subseccionPath?: string | null;
}): Promise<string | null> {
  if (!target.moduloId || !target.seccionId) return null;
  const subsectionPath = normalizeSubsectionPath(target);
  const sectionSnap = await getDoc(doc(db, "modulos", target.moduloId, "secciones", target.seccionId));
  let restricted = sectionSnap.exists() && isRestrictedNode(sectionSnap.data()) ? "" : null;
  const parts = subsectionPath.split("/").filter(Boolean);
  for (let index = 0; index < parts.length; index += 1) {
    const current = parts.slice(0, index + 1).join("/");
    const snap = await getDoc(doc(db, "modulos", target.moduloId, "secciones", target.seccionId, ...subsectionSegments(current)));
    if (snap.exists() && isRestrictedNode(snap.data())) restricted = current;
  }
  return restricted;
}

async function alumnoTieneAcceso(target: {
  moduloId?: string;
  seccionId?: string;
  subsectionPath?: string[];
  subseccionPath?: string | null;
}): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid || !target.seccionId) return true;

  const userSnap = await getDoc(doc(db, "usuarios", uid));
  const rol = userSnap.data()?.rol;
  if (rol === "admin" || rol === "profesor") return true;
  if (rol !== "alumno") return false;

  const restrictedPath = await nearestRestrictedPath(target);
  if (restrictedPath === null) return true;

  const constraints = [
    where("alumnoId", "==", uid),
    where("seccionId", "==", target.seccionId),
  ];
  const snap = await getDocs(query(collection(db, "inscripciones"), ...constraints));
  if (snap.empty) return false;
  if (!restrictedPath) return true;

  return snap.docs.some((item) => {
    const path = (item.data().subseccionPath as string | undefined) ?? "";
    return path === restrictedPath || path.startsWith(`${restrictedPath}/`) || restrictedPath.startsWith(`${path}/`);
  });
}

async function assertDocExists(path: string[]): Promise<boolean> {
  const snap = await getDoc(doc(db, path[0], ...path.slice(1)));
  return snap.exists() && isAvailableData(snap.data());
}

function isAvailableData(data: any): boolean {
  if (!data) return false;
  return data.eliminado !== true &&
    data.deleted !== true &&
    data.archivado !== true &&
    data.archived !== true &&
    data.deshabilitado !== true &&
    data.disabled !== true &&
    data.oculto !== true &&
    data.hidden !== true &&
    data.visibleAlumno !== false &&
    data.publicado !== false &&
    data.activo !== false;
}

async function sectionHierarchyAvailable(target: {
  moduloId?: string;
  seccionId?: string;
  subsectionPath?: string[];
  subseccionPath?: string | null;
}): Promise<boolean> {
  if (!target.moduloId || !target.seccionId) return false;
  const sectionSnap = await getDoc(doc(db, "modulos", target.moduloId, "secciones", target.seccionId));
  if (!sectionSnap.exists() || !isAvailableData(sectionSnap.data())) return false;
  const parts = normalizeSubsectionPath(target).split("/").filter(Boolean);
  for (let index = 0; index < parts.length; index += 1) {
    const current = parts.slice(0, index + 1).join("/");
    const snap = await getDoc(doc(db, "modulos", target.moduloId, "secciones", target.seccionId, ...subsectionSegments(current)));
    if (!snap.exists() || !isAvailableData(snap.data())) return false;
  }
  return true;
}

export async function resolveNotificationTargetAvailability(target: NotificationTarget): Promise<TargetAvailability> {
  if (target.kind === "schedule_event") {
    if (!target.eventId) return { available: false, code: "invalid_target", message: "La notificacion tiene un destino invalido." };
    const exists = await assertDocExists(["eventos_cronograma", target.eventId]);
    if (!exists) return { available: false, code: "content_not_found", message: "El evento ya no esta disponible." };
    return { available: true };
  }

  if (target.kind === "tp_sheet") {
    if (!target.planillaId) return { available: false, code: "invalid_target", message: "La notificacion tiene un destino invalido." };
    if (target.moduloId && !(await sectionHierarchyAvailable(target))) return { available: false, code: "content_not_found", message: "La planilla ya no esta disponible." };
    const hasAccess = await alumnoTieneAcceso(target);
    if (!hasAccess) return { available: false, code: "restricted_scope_not_enrolled", message: "El recurso ya no esta disponible." };
    const snap = await getDoc(doc(db, "vistas_planillas_alumnos", auth.currentUser?.uid ?? "", "planillas", target.planillaId));
    if (!snap.exists() || !isAvailableData(snap.data())) return { available: false, code: "content_not_found", message: "La planilla ya no esta disponible." };
    return { available: true };
  }

  if (target.kind === "content") {
    const path = itemDocPath(target);
    if (!path) return { available: false, code: "invalid_target", message: "La notificacion tiene un destino invalido." };
    if (!(await sectionHierarchyAvailable(target))) return { available: false, code: "content_not_found", message: "El contenido ya no esta disponible." };
    const exists = await assertDocExists(path);
    if (!exists) return { available: false, code: "content_not_found", message: "El contenido ya no esta disponible." };
    const hasAccess = await alumnoTieneAcceso(target);
    if (!hasAccess) return { available: false, code: "restricted_scope_not_enrolled", message: "El recurso ya no esta disponible." };
    return { available: true };
  }

  if (target.kind === "delivery") {
    const path = itemDocPath(target);
    if (!path) return { available: false, code: "invalid_target", message: "La notificacion tiene un destino invalido." };
    if (!(await sectionHierarchyAvailable(target))) return { available: false, code: "content_not_found", message: "La entrega ya no esta disponible." };
    const exists = await assertDocExists(path);
    if (!exists) return { available: false, code: "content_not_found", message: "La entrega ya no esta disponible." };
    const hasAccess = await alumnoTieneAcceso(target);
    if (!hasAccess) return { available: false, code: "restricted_scope_not_enrolled", message: "El recurso ya no esta disponible." };
    return { available: true };
  }

  if (target.kind === "grade") {
    if (!(await sectionHierarchyAvailable(target))) return { available: false, code: "content_not_found", message: "La calificacion ya no esta disponible." };
    const hasAccess = await alumnoTieneAcceso(target);
    if (!hasAccess) return { available: false, code: "restricted_scope_not_enrolled", message: "El recurso ya no esta disponible." };
    if (target.entregaItemId && target.moduloId) {
      const path = itemDocPath({ ...target, itemId: target.entregaItemId });
      if (!path) return { available: false, code: "invalid_target", message: "La notificacion tiene un destino invalido." };
      const exists = await assertDocExists(path);
      if (!exists) return { available: false, code: "content_not_found", message: "La entrega ya no esta disponible." };
    }
    return { available: true };
  }

  return { available: false, code: "invalid_target", message: "Destino no soportado." };
}

export async function navigateToNotificationTarget(target: NotificationTarget): Promise<NavigationResult> {
  try {
    const availability = await resolveNotificationTargetAvailability(target);
    if (!availability.available) {
      return { ok: false, code: availability.code, message: availability.message };
    }

    if (target.kind === "schedule_event") {
      router.push("/(tabs)/cronograma" as any);
      return { ok: true };
    }

    if (target.kind === "tp_sheet") {
      router.push({
        pathname: "/secciones/planilla-detalle",
        params: { planillaId: target.planillaId, modo: "alumno" },
      } as any);
      return { ok: true };
    }

    if (target.kind === "grade") {
      const subseccionPath = normalizeSubsectionPath(target);
      if (target.entregaItemId && target.moduloId) {
        router.push({
          pathname: `/entregas/${target.entregaItemId}`,
          params: {
            moduloId: target.moduloId,
            seccionId: target.seccionId,
            ...(subseccionPath ? { subseccionPath } : {}),
          },
        } as any);
      } else {
        router.push({
          pathname: "/secciones/mis-notas",
          params: {
            moduloId: target.moduloId,
            seccionId: target.seccionId,
            ...(subseccionPath ? { subseccionPath } : {}),
          },
        } as any);
      }
      return { ok: true };
    }

    if (target.kind === "delivery") {
      const subseccionPath = normalizeSubsectionPath(target);
      router.push({
        pathname: `/entregas/${target.itemId}`,
        params: {
          moduloId: target.moduloId,
          seccionId: target.seccionId,
          ...(subseccionPath ? { subseccionPath } : {}),
        },
      } as any);
      return { ok: true };
    }

    if (target.kind === "content") {
      const subseccionPath = normalizeSubsectionPath(target);
      if (subseccionPath) {
        const segments = subseccionPath.split("/").filter(Boolean);
        const lastId = segments[segments.length - 1];
        router.push({
          pathname: `/subsecciones/${lastId}`,
          params: {
            moduloId: target.moduloId,
            seccionId: target.seccionId,
            subseccionPath,
            itemId: target.itemId,
          },
        } as any);
      } else {
        router.push({
          pathname: `/secciones/${target.seccionId}`,
          params: { moduloId: target.moduloId, itemId: target.itemId },
        } as any);
      }
      return { ok: true };
    }

    return { ok: false, code: "invalid_target", message: "Destino no soportado." };
  } catch (error) {
    console.error("navigateToNotificationTarget error:", error);
    return { ok: false, code: "navigation_error", message: "No se pudo verificar el recurso. Revisá tu conexion e intentá nuevamente." };
  }
}

export function actionLabelForTarget(target: NotificationTarget): string {
  if (target.kind === "content") return "Ver contenido";
  if (target.kind === "grade") return "Ver calificacion";
  if (target.kind === "tp_sheet") return "Ver planilla";
  if (target.kind === "delivery") return "Ver entrega";
  return "Ver evento";
}
