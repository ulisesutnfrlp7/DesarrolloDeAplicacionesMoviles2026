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
  nota?: number | null;
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
    await updateDoc(getEntregaDoc(moduloId, seccionId, itemId, entregaId, subseccionPath), {
      ...data,
      revisada: true,
      fechaActualizacion: serverTimestamp(),
    });
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