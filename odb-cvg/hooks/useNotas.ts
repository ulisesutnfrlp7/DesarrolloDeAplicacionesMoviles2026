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

export type ValorNota = number | "Ausente";

export interface Nota {
  id: string;
  alumnoId: string;
  moduloId: string;
  seccionId: string;
  subseccionPath?: string;
  nombreExamen: string;
  nota: ValorNota;
  fechaCarga: any;
  cargadoPor: string;
}

export interface NotaInput {
  alumnoId: string;
  moduloId: string;
  seccionId: string;
  subseccionPath?: string;
  nombreExamen: string;
  nota: ValorNota;
}

function construirIdNota(seccionId: string, alumnoId: string, nombreExamen: string, subseccionPath?: string) {
  const pathSegment = subseccionPath
    ? `_${subseccionPath.replace(/\//g, "_")}`
    : "";
  return `${seccionId}${pathSegment}_${alumnoId}_${nombreExamen.trim().replace(/ /g, "_")}`;
}

// Escucha en tiempo real las notas de una sección+examen. Devuelve Map<alumnoId, nota>.
export function useNotasPorSeccion(
  seccionId: string | null,
  nombreExamen: string,
  subseccionPath?: string,
): Map<string, ValorNota> {
  const [notasMap, setNotasMap] = useState<Map<string, ValorNota>>(new Map());

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
        const map = new Map<string, ValorNota>();
        snapshot.docs.forEach((d) => {
          const data = d.data();
          map.set(data.alumnoId as string, normalizarValorNota(data.nota));
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
    const id = construirIdNota(seccionId, alumnoId, nombreExamen, subseccionPath);
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

export async function reemplazarNotasPorExamen(
  seccionId: string,
  nombreExamen: string,
  notas: NotaInput[],
  subseccionPath?: string,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("No autenticado");

  const constraints = [
    where("seccionId", "==", seccionId),
    where("nombreExamen", "==", nombreExamen),
  ];
  if (subseccionPath !== undefined) {
    constraints.push(where("subseccionPath", "==", subseccionPath));
  }

  const snapshot = await getDocs(query(collection(db, "notas"), ...constraints));
  const batch = writeBatch(db);
  snapshot.docs.forEach((d) => batch.delete(d.ref));

  notas.forEach(({ alumnoId, moduloId, seccionId, subseccionPath, nombreExamen, nota }) => {
    const id = construirIdNota(seccionId, alumnoId, nombreExamen, subseccionPath);
    batch.set(doc(db, "notas", id), {
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

export function normalizarValorNota(value: unknown): ValorNota {
  if (value === "Ausente") return "Ausente";
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const limpia = value.trim();
    if (limpia.toLowerCase() === "ausente") return "Ausente";
    const numero = Number(limpia.replace(",", "."));
    if (Number.isFinite(numero)) return numero;
  }
  return 0;
}

export function esNotaAusente(value: unknown): value is "Ausente" {
  return value === "Ausente";
}

export function obtenerNotaNumerica(value: unknown): number | null {
  const nota = normalizarValorNota(value);
  return typeof nota === "number" ? nota : null;
}

export function formatearValorNota(value: unknown): string {
  const nota = normalizarValorNota(value);
  if (nota === "Ausente") return "Ausente";
  return Number.isInteger(nota) ? String(nota) : nota.toFixed(1).replace(".", ",");
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
