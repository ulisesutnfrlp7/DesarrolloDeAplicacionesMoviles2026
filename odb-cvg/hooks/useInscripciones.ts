import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../config/firebaseConfig";

export interface Inscripcion {
  id: string;
  alumnoId: string;
  moduloId: string;
  seccionId: string;
  tipo: "codigo" | "manual";
  codigoUsado: string | null;
  fechaInscripcion: any;
}

// Hook para admin: lista en tiempo real de todos los inscriptos de una sección.
export function useInscripcionesPorSeccion(seccionId: string | null) {
  const [inscripciones, setInscripciones] = useState<Inscripcion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedSeccionId, setLoadedSeccionId] = useState<string | null>(null);

  useEffect(() => {
    if (!seccionId) {
      setInscripciones([]);
      setLoadedSeccionId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, "inscripciones"),
      where("seccionId", "==", seccionId),
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setInscripciones(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Inscripcion),
        );
        setLoadedSeccionId(seccionId);
        setLoading(false);
      },
      (error) => {
        console.error("useInscripcionesPorSeccion error:", error);
        setLoadedSeccionId(seccionId);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [seccionId]);

  return {
    inscripciones,
    loading: loading || (!!seccionId && loadedSeccionId !== seccionId),
  };
}

// Hook para alumnos: retorna el set de seccionIds en los que está inscripto el usuario.
export function useMisInscripciones(uid: string | null) {
  const [seccionesInscritas, setSeccionesInscritas] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [loadedUid, setLoadedUid] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setSeccionesInscritas(new Set());
      setLoadedUid(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, "inscripciones"),
      where("alumnoId", "==", uid),
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setSeccionesInscritas(
          new Set(snapshot.docs.map((d) => d.data().seccionId as string)),
        );
        setLoadedUid(uid);
        setLoading(false);
      },
      () => {
        setLoadedUid(uid);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [uid]);

  return {
    seccionesInscritas,
    loading: loading || (!!uid && loadedUid !== uid),
  };
}

// Genera un código alfanumérico aleatorio de 8 caracteres (sin caracteres ambiguos).
export function generarCodigoAleatorio(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let codigo = "";
  for (let i = 0; i < 8; i++) {
    codigo += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return codigo;
}

// Inscribe al alumno actual usando un código. Valida el código antes de escribir.
export async function inscribirConCodigo(
  moduloId: string,
  seccionId: string,
  codigoIngresado: string,
  codigoActual: string,
  uid: string,
): Promise<void> {
  if (!codigoActual) {
    throw new Error(
      "Esta cursada aún no tiene código configurado. Consultá a la cátedra.",
    );
  }
  if (
    codigoIngresado.trim().toUpperCase() !== codigoActual.trim().toUpperCase()
  ) {
    throw new Error(
      "Código incorrecto. Verificá el código proporcionado por la cátedra.",
    );
  }
  // Verificar si ya está inscripto para evitar duplicados.
  const existing = await getDocs(
    query(
      collection(db, "inscripciones"),
      where("alumnoId", "==", uid),
      where("seccionId", "==", seccionId),
    ),
  );
  if (!existing.empty) return; // Ya inscripto, no hacer nada.

  await addDoc(collection(db, "inscripciones"), {
    alumnoId: uid,
    moduloId,
    seccionId,
    tipo: "codigo",
    codigoUsado: codigoIngresado.trim().toUpperCase(),
    fechaInscripcion: serverTimestamp(),
  });
}

// Admin: inscribe manualmente a un alumno sin código.
export async function inscribirManualmente(
  moduloId: string,
  seccionId: string,
  alumnoId: string,
): Promise<void> {
  const existing = await getDocs(
    query(
      collection(db, "inscripciones"),
      where("alumnoId", "==", alumnoId),
      where("seccionId", "==", seccionId),
    ),
  );
  if (!existing.empty) {
    throw new Error("Este alumno ya está inscripto en la cursada.");
  }
  await addDoc(collection(db, "inscripciones"), {
    alumnoId,
    moduloId,
    seccionId,
    tipo: "manual",
    codigoUsado: null,
    fechaInscripcion: serverTimestamp(),
  });
}

// Admin: revoca la inscripción individual de un alumno.
export async function revocarInscripcion(inscripcionId: string): Promise<void> {
  await deleteDoc(doc(db, "inscripciones", inscripcionId));
}

// Admin: genera un nuevo código y revoca TODAS las inscripciones de la cursada.
export async function regenerarCodigo(
  moduloId: string,
  seccionId: string,
): Promise<string> {
  const nuevoCodigo = generarCodigoAleatorio();

  const inscSnap = await getDocs(
    query(
      collection(db, "inscripciones"),
      where("seccionId", "==", seccionId),
    ),
  );

  const batch = writeBatch(db);

  batch.update(doc(db, "modulos", moduloId, "secciones", seccionId), {
    codigoAcceso: nuevoCodigo,
    fechaActualizacion: serverTimestamp(),
  });

  inscSnap.docs.forEach((d) => batch.delete(d.ref));

  await batch.commit();
  return nuevoCodigo;
}
