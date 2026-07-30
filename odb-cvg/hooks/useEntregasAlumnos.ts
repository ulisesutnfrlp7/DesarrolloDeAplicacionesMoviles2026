// hooks/useEntregasAlumnos.ts
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../config/firebaseConfig";
import { enqueueNotificationJob, entregaSourcePath } from "../services/notificationJobs";

export interface EntregaAlumno {
  id: string;
  alumnoId: string;
  alumnoNombre: string;
  tipo: "texto" | "pdf" | "imagen" | "documento" | "video";
  titulo: string;
  contenido: string;
  url: string;
  storageRef: string;
  nombreArchivo: string;
  fechaEntrega: any;
  fechaActualizacion?: any;
  nota?: number | string | null;
  retroalimentacion?: string;
  requiereReentrega?: boolean;
  revisada?: boolean;
}

export type EntregaAlumnoInput = Omit<
  EntregaAlumno,
  | "id"
  | "alumnoId"
  | "alumnoNombre"
  | "fechaEntrega"
  | "fechaActualizacion"
  | "nota"
  | "retroalimentacion"
  | "requiereReentrega"
  | "revisada"
>;

export const getEntregasAlumnosCollection = (
  moduloId: string,
  seccionId: string,
  itemId: string,
  subseccionPath?: string | string[],
) => {
  const rawPath = Array.isArray(subseccionPath) ? subseccionPath.join("/") : (subseccionPath ?? "");
  
  const pathStr = decodeURIComponent(rawPath);

  const subseccionSegments = pathStr
    .split(/[\/,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((id) => ["subsecciones", id]);

  return collection(
    db, "modulos", moduloId, "secciones", seccionId, 
    ...subseccionSegments, "items", itemId, "entregas_alumnos"
  );
};

const getEntregaDoc = (
  moduloId: string,
  seccionId: string,
  itemId: string,
  entregaId: string,
  subseccionPath?: string | string[],
) => {
  return doc(getEntregasAlumnosCollection(moduloId, seccionId, itemId, subseccionPath), entregaId);
};

// Para admin/profe: escucha TODAS las entregas del item
export function useEntregasAlumnos(
  moduloId: string,
  seccionId: string,
  itemId: string,
  subseccionPath?: string | string[],
) {
  const [entregas, setEntregas] = useState<EntregaAlumno[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!moduloId || !seccionId || !itemId) { setLoading(false); return; }
    const q = query(
      getEntregasAlumnosCollection(moduloId, seccionId, itemId, subseccionPath),
      orderBy("fechaEntrega", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setEntregas(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EntregaAlumno));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [moduloId, seccionId, itemId, subseccionPath]);

  const actualizarCalificacion = async (
    entregaId: string,
    data: { nota: number | null; retroalimentacion: string; requiereReentrega: boolean },
  ) => {
    const anterior = entregas.find((entrega) => entrega.id === entregaId);
    const sourcePath = entregaSourcePath({ moduloId, seccionId, itemId, entregaId, subseccionPath });
    const decision = selectSubmissionNotificationEvent(anterior, data);
    console.log("submission_change_detected", {
      hadPreviousGrade: decision.hadPreviousGrade,
      gradeChanged: decision.gradeChanged,
      resubmissionChanged: decision.resubmissionChanged,
      sourcePathValid: sourcePath.includes("/entregas_alumnos/"),
    });

    await updateDoc(getEntregaDoc(moduloId, seccionId, itemId, entregaId, subseccionPath), {
      ...data,
      revisada: true,
      fechaActualizacion: serverTimestamp(),
    });

    if (decision.selectedEventType) {
      console.log("submission_notification_event_selected", {
        hadPreviousGrade: decision.hadPreviousGrade,
        gradeChanged: decision.gradeChanged,
        resubmissionChanged: decision.resubmissionChanged,
        selectedEventType: decision.selectedEventType,
        sourcePathValid: sourcePath.includes("/entregas_alumnos/"),
      });
      await enqueueNotificationJob({
        type: decision.selectedEventType,
        sourceId: entregaId,
        sourcePath,
        courseId: moduloId,
        sectionId: seccionId,
      });
    } else {
      console.log("submission_notification_skipped", {
        hadPreviousGrade: decision.hadPreviousGrade,
        gradeChanged: decision.gradeChanged,
        resubmissionChanged: decision.resubmissionChanged,
        selectedEventType: null,
        sourcePathValid: sourcePath.includes("/entregas_alumnos/"),
      });
    }
  };

  return { entregas, loading, actualizarCalificacion };
}

// Para el alumno: solo su propia entrega
export function useMiEntrega(
  moduloId: string,
  seccionId: string,
  itemId: string,
  subseccionPath?: string | string[],
) {
  const [miEntrega, setMiEntrega] = useState<EntregaAlumno | null>(null);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    if (!moduloId || !seccionId || !itemId || !uid) { setLoading(false); return; }
    const q = query(
      getEntregasAlumnosCollection(moduloId, seccionId, itemId, subseccionPath),
      where("alumnoId", "==", uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      setMiEntrega(snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as EntregaAlumno));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [moduloId, seccionId, itemId, uid, subseccionPath]);

  const enviarEntrega = async (data: EntregaAlumnoInput) => {
    const user = auth.currentUser;
    if (!user) throw new Error("No autenticado");
    await addDoc(getEntregasAlumnosCollection(moduloId, seccionId, itemId, subseccionPath), {
      ...data,
      alumnoId: user.uid,
      alumnoNombre: user.displayName ?? user.email ?? "Alumno",
      nota: null,
      retroalimentacion: "",
      requiereReentrega: false,
      revisada: false,
      fechaEntrega: serverTimestamp(),
    });
  };

  // Reentrega: el alumno modifica su propia entrega. Resetea nota y requiereReentrega
  // (vuelve a quedar pendiente de revisión), pero conserva la retroalimentación anterior.
  const actualizarEntrega = async (entregaId: string, data: EntregaAlumnoInput) => {
    await updateDoc(getEntregaDoc(moduloId, seccionId, itemId, entregaId, subseccionPath), {
      ...data,
      nota: null,
      requiereReentrega: false,
      revisada: false,
      fechaEntrega: serverTimestamp(),
      fechaActualizacion: serverTimestamp(),
    });
  };

  return { miEntrega, loading, enviarEntrega, actualizarEntrega };
}

export type SubmissionNotificationEvent =
  | "submission_grade"
  | "submission_grade_updated"
  | "submission_grade_with_resubmission"
  | "submission_grade_updated_with_resubmission"
  | "resubmission_requested"
  | "resubmission_updated";

export function normalizeSubmissionGrade(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? String(Number(value)) : null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.toLowerCase() === "ausente") return "ausente";
  const numeric = Number(raw.replace(",", "."));
  if (Number.isFinite(numeric)) return String(Number(numeric));
  return raw.toLowerCase();
}

export function selectSubmissionNotificationEvent(
  previous: Pick<EntregaAlumno, "nota" | "requiereReentrega" | "retroalimentacion" | "revisada"> | undefined,
  next: { nota: unknown; retroalimentacion?: string; requiereReentrega: boolean },
): {
  hadPreviousGrade: boolean;
  gradeChanged: boolean;
  resubmissionChanged: boolean;
  resubmissionRequestedNow: boolean;
  resubmissionRemovedNow: boolean;
  selectedEventType: SubmissionNotificationEvent | null;
} {
  const previousGrade = normalizeSubmissionGrade(previous?.nota);
  const nextGrade = normalizeSubmissionGrade(next.nota);
  const hadPreviousGrade = previousGrade !== null;
  const hasNextGrade = nextGrade !== null;
  const gradeChanged = previousGrade !== nextGrade;
  const previousResubmission = previous?.requiereReentrega === true;
  const nextResubmission = next.requiereReentrega === true;
  const resubmissionChanged = previousResubmission !== nextResubmission;
  const resubmissionRequestedNow = !previousResubmission && nextResubmission;
  const resubmissionRemovedNow = previousResubmission && !nextResubmission;
  const feedbackChanged = (previous?.retroalimentacion ?? "").trim() !== (next.retroalimentacion ?? "").trim();

  let selectedEventType: SubmissionNotificationEvent | null = null;
  if (!hadPreviousGrade && hasNextGrade && gradeChanged) {
    selectedEventType = resubmissionRequestedNow ? "submission_grade_with_resubmission" : "submission_grade";
  } else if (hadPreviousGrade && gradeChanged) {
    selectedEventType = nextResubmission ? "submission_grade_updated_with_resubmission" : "submission_grade_updated";
  } else if (resubmissionRequestedNow) {
    selectedEventType = "resubmission_requested";
  } else if (resubmissionRemovedNow) {
    selectedEventType = "submission_grade_updated";
  } else if (nextResubmission && feedbackChanged) {
    selectedEventType = "resubmission_updated";
  }

  return {
    hadPreviousGrade,
    gradeChanged,
    resubmissionChanged,
    resubmissionRequestedNow,
    resubmissionRemovedNow,
    selectedEventType,
  };
}
