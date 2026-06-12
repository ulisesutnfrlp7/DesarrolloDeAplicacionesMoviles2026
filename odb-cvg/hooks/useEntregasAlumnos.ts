// hooks/useEntregasAlumnos.ts
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
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
}

export type EntregaAlumnoInput = Omit<EntregaAlumno, "id" | "alumnoId" | "alumnoNombre" | "fechaEntrega">;

const getEntregasCollection = (
  moduloId: string,
  seccionId: string,
  itemId: string,
  subseccionPath?: string,
) => {
  const subseccionSegments = (subseccionPath ?? "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((id) => ["subsecciones", id]);

  return collection(
    db,
    "modulos",
    moduloId,
    "secciones",
    seccionId,
    ...subseccionSegments,
    "items",
    itemId,
    "entregas_alumnos",
  );
};

// Para admin/profe: escucha TODAS las entregas del item
export function useEntregasAlumnos(
  moduloId: string,
  seccionId: string,
  itemId: string,
  subseccionPath?: string,
) {
  const [entregas, setEntregas] = useState<EntregaAlumno[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!moduloId || !seccionId || !itemId) { setLoading(false); return; }
    const q = query(
      getEntregasCollection(moduloId, seccionId, itemId, subseccionPath),
      orderBy("fechaEntrega", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setEntregas(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EntregaAlumno));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [moduloId, seccionId, itemId, subseccionPath]);

  return { entregas, loading };
}

// Para el alumno: solo su propia entrega
export function useMiEntrega(
  moduloId: string,
  seccionId: string,
  itemId: string,
  subseccionPath?: string,
) {
  const [miEntrega, setMiEntrega] = useState<EntregaAlumno | null>(null);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    if (!moduloId || !seccionId || !itemId || !uid) { setLoading(false); return; }
    const q = query(
      getEntregasCollection(moduloId, seccionId, itemId, subseccionPath),
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
    await addDoc(getEntregasCollection(moduloId, seccionId, itemId, subseccionPath), {
      ...data,
      alumnoId: user.uid,
      alumnoNombre: user.displayName ?? user.email ?? "Alumno",
      fechaEntrega: serverTimestamp(),
    });
  };

  return { miEntrega, loading, enviarEntrega };
}