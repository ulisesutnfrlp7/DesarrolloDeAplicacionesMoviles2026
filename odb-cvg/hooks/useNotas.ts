// hooks/useNotas.ts
import {
    collection,
    doc,
    getDocs,
    onSnapshot,
    query,
    serverTimestamp,
    where,
    writeBatch
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../config/firebaseConfig";

export interface Nota {
  id: string;
  alumnoId: string;
  moduloId: string;
  seccionId: string;
  subseccionPath?: string;
  nombreExamen: string;
  nota: number;
  fechaCarga: any;
  cargadoPor: string;
}

export interface NotaInput {
  alumnoId: string;
  moduloId: string;
  seccionId: string;
  subseccionPath?: string;
  nombreExamen: string;
  nota: number;
}

// Escucha en tiempo real las notas de una sección+examen. Devuelve Map<alumnoId, nota>.
export function useNotasPorSeccion(
  seccionId: string | null,
  nombreExamen: string,
  subseccionPath?: string,
): Map<string, number> {
  const [notasMap, setNotasMap] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!seccionId || !nombreExamen.trim()) {
      setNotasMap(new Map());
      return;
    }
    const constraints = [
      where("seccionId", "==", seccionId),
      where("nombreExamen", "==", nombreExamen.trim()),
    ];
    if (subseccionPath !== undefined) {
      constraints.push(where("subseccionPath", "==", subseccionPath));
    }
    const q = query(collection(db, "notas"), ...constraints);
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const map = new Map<string, number>();
        snapshot.docs.forEach((d) => {
          const data = d.data();
          map.set(data.alumnoId as string, data.nota as number);
        });
        setNotasMap(map);
      },
      (error) => {
        console.error("useNotasPorSeccion error:", error);
      },
    );
    return () => unsubscribe();
  }, [seccionId, nombreExamen, subseccionPath]);

  return notasMap;
}

// Guarda (upsert) un lote de notas usando id compuesto para evitar duplicados.
export async function guardarNotas(notas: NotaInput[]): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("No autenticado");

  const batch = writeBatch(db);

  notas.forEach(({ alumnoId, moduloId, seccionId, subseccionPath, nombreExamen, nota }) => {
    const pathSegment = subseccionPath
      ? `_${subseccionPath.replace(/\//g, "_")}`
      : "";
    const id = `${seccionId}${pathSegment}_${alumnoId}_${nombreExamen.trim().replace(/ /g, "_")}`;
    const ref = doc(db, "notas", id);
    batch.set(ref, {
      alumnoId,
      moduloId,
      seccionId,
      subseccionPath: subseccionPath ?? "",
      nombreExamen: nombreExamen.trim(),
      nota,
      fechaCarga: serverTimestamp(),
      cargadoPor: user.uid,
    });
  });

  await batch.commit();
}

// Elimina todas las notas de un examen dado (admin only).
export async function eliminarNotasPorExamen(
  seccionId: string,
  nombreExamen: string,
  subseccionPath?: string,
): Promise<void> {
  const constraints = [
    where("seccionId", "==", seccionId),
    where("nombreExamen", "==", nombreExamen),
  ];
  if (subseccionPath !== undefined) {
    constraints.push(where("subseccionPath", "==", subseccionPath));
  }
  const q = query(collection(db, "notas"), ...constraints);
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);
  snapshot.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}
