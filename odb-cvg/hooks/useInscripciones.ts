import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
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
  subseccionPath?: string;
  subseccionIds?: string[];
  tipoAcceso?: "seccion" | "subseccion";
  tipo: "codigo" | "manual";
  codigoUsado: string | null;
  fechaInscripcion: any;
}

export interface ContextoInscripcionEfectivo {
  tipoAcceso: "seccion" | "subseccion";
  seccionId: string;
  subseccionPath?: string;
  requiereInscripcion: boolean;
}

const getSubseccionPathSegments = (subseccionPath?: string) =>
  (subseccionPath ?? "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .flatMap((id) => ["subsecciones", id]);

function normalizarSubseccionPath(subseccionPath?: string | null): string {
  return (subseccionPath ?? "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
}

export async function resolverContextoInscripcion(
  moduloId: string,
  seccionId: string,
  subseccionPath?: string | null,
): Promise<ContextoInscripcionEfectivo> {
  const pathActual = normalizarSubseccionPath(subseccionPath);
  const ids = pathActual ? pathActual.split("/") : [];

  for (let length = ids.length; length > 0; length -= 1) {
    const candidato = ids.slice(0, length).join("/");
    const snap = await getDoc(
      doc(
        db,
        "modulos",
        moduloId,
        "secciones",
        seccionId,
        ...getSubseccionPathSegments(candidato),
      ),
    );
    if (snap.exists() && snap.data().esRestringida === true) {
      return {
        tipoAcceso: "subseccion",
        seccionId,
        subseccionPath: candidato,
        requiereInscripcion: true,
      };
    }
  }

  const seccionSnap = await getDoc(doc(db, "modulos", moduloId, "secciones", seccionId));
  if (seccionSnap.exists() && seccionSnap.data().esRestringida === true) {
    return {
      tipoAcceso: "seccion",
      seccionId,
      subseccionPath: "",
      requiereInscripcion: true,
    };
  }

  return {
    tipoAcceso: pathActual ? "subseccion" : "seccion",
    seccionId,
    subseccionPath: pathActual,
    requiereInscripcion: false,
  };
}

export function useContextoInscripcionEfectivo(
  moduloId?: string | null,
  seccionId?: string | null,
  subseccionPath?: string | null,
) {
  const [contexto, setContexto] = useState<ContextoInscripcionEfectivo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let activo = true;
    if (!moduloId || !seccionId) {
      setContexto(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    resolverContextoInscripcion(moduloId, seccionId, subseccionPath)
      .then((resultado) => {
        if (activo) setContexto(resultado);
      })
      .catch((error) => {
        console.log("resolverContextoInscripcion error:", error);
        if (activo) {
          setContexto({
            tipoAcceso: subseccionPath ? "subseccion" : "seccion",
            seccionId,
            subseccionPath: normalizarSubseccionPath(subseccionPath),
            requiereInscripcion: false,
          });
        }
      })
      .finally(() => {
        if (activo) setLoading(false);
      });

    return () => {
      activo = false;
    };
  }, [moduloId, seccionId, subseccionPath]);

  return { contexto, loading };
}

// Hook para admin: lista en tiempo real de todos los inscriptos de una sección.
export function useInscripcionesPorSeccion(seccionId: string | null, subseccionPath?: string | null) {
  const [inscripciones, setInscripciones] = useState<Inscripcion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedSeccionId, setLoadedSeccionId] = useState<string | null>(null);
  const [loadedSubseccionPath, setLoadedSubseccionPath] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!seccionId) {
      setInscripciones([]);
      setLoadedSeccionId(null);
      setLoadedSubseccionPath(undefined);
      setLoading(false);
      return;
    }
    setLoading(true);
    const constraints = [where("seccionId", "==", seccionId)];
    if (subseccionPath) {
      constraints.push(where("subseccionPath", "==", subseccionPath));
    }
    const q = query(collection(db, "inscripciones"), ...constraints);
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setInscripciones(
          snapshot.docs
            .map((d) => ({ id: d.id, ...d.data() }) as Inscripcion)
            .filter((insc) => {
              if (subseccionPath === undefined) return true;
              const path = insc.subseccionPath ?? "";
              return path === (subseccionPath ?? "");
            }),
        );
        setLoadedSeccionId(seccionId);
        setLoadedSubseccionPath(subseccionPath);
        setLoading(false);
      },
      (error) => {
        console.error("useInscripcionesPorSeccion error:", error);
        setLoadedSeccionId(seccionId);
        setLoadedSubseccionPath(subseccionPath);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [seccionId, subseccionPath]);

  return {
    inscripciones,
    loading:
      loading ||
      (!!seccionId && (loadedSeccionId !== seccionId || loadedSubseccionPath !== subseccionPath)),
  };
}

// Hook para alumnos: retorna el set de seccionIds en los que está inscripto el usuario.
export function useMisInscripciones(uid: string | null) {
  const [seccionesInscritas, setSeccionesInscritas] = useState<Set<string>>(
    new Set(),
  );
  const [accesosInscritos, setAccesosInscritos] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [loadedUid, setLoadedUid] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setSeccionesInscritas(new Set());
      setAccesosInscritos(new Set());
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
        const secciones = new Set<string>();
        const accesos = new Set<string>();
        snapshot.docs.forEach((d) => {
          const data = d.data();
          const seccionId = data.seccionId as string;
          const subseccionPath = (data.subseccionPath as string | undefined) ?? "";
          secciones.add(seccionId);
          accesos.add(subseccionPath ? `${seccionId}::${subseccionPath}` : seccionId);
        });
        setSeccionesInscritas(secciones);
        setAccesosInscritos(accesos);
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
    accesosInscritos,
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

function getSubseccionIds(subseccionPath?: string): string[] {
  return subseccionPath?.split("/").filter(Boolean) ?? [];
}

// Inscribe al alumno actual usando un código. Valida el código antes de escribir.
export async function inscribirConCodigo(
  moduloId: string,
  seccionId: string,
  codigoIngresado: string,
  codigoActual: string,
  uid: string,
  subseccionPath?: string,
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
  const existingConstraints = [
    where("alumnoId", "==", uid),
    where("seccionId", "==", seccionId),
  ];
  if (subseccionPath) existingConstraints.push(where("subseccionPath", "==", subseccionPath));
  const existing = await getDocs(query(collection(db, "inscripciones"), ...existingConstraints));
  const yaInscripto = existing.docs.some(
    (d) => ((d.data().subseccionPath as string | undefined) ?? "") === (subseccionPath ?? ""),
  );
  if (yaInscripto) return; // Ya inscripto, no hacer nada.

  await addDoc(collection(db, "inscripciones"), {
    alumnoId: uid,
    moduloId,
    seccionId,
    subseccionPath: subseccionPath ?? "",
    subseccionIds: getSubseccionIds(subseccionPath),
    tipoAcceso: subseccionPath ? "subseccion" : "seccion",
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
  subseccionPath?: string,
): Promise<void> {
  const existingConstraints = [
    where("alumnoId", "==", alumnoId),
    where("seccionId", "==", seccionId),
  ];
  if (subseccionPath) existingConstraints.push(where("subseccionPath", "==", subseccionPath));
  const existing = await getDocs(query(collection(db, "inscripciones"), ...existingConstraints));
  const yaInscripto = existing.docs.some(
    (d) => ((d.data().subseccionPath as string | undefined) ?? "") === (subseccionPath ?? ""),
  );
  if (yaInscripto) {
    throw new Error("Este alumno ya está inscripto en la cursada.");
  }
  await addDoc(collection(db, "inscripciones"), {
    alumnoId,
    moduloId,
    seccionId,
    subseccionPath: subseccionPath ?? "",
    subseccionIds: getSubseccionIds(subseccionPath),
    tipoAcceso: subseccionPath ? "subseccion" : "seccion",
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
  subseccionPath?: string,
): Promise<string> {
  const nuevoCodigo = generarCodigoAleatorio();

  const constraints = [where("seccionId", "==", seccionId)];
  if (subseccionPath) {
    constraints.push(where("subseccionPath", "==", subseccionPath));
  }
  const inscSnap = await getDocs(query(collection(db, "inscripciones"), ...constraints));

  const batch = writeBatch(db);

  const targetRef = subseccionPath
    ? doc(
        db,
        "modulos",
        moduloId,
        "secciones",
        seccionId,
        ...subseccionPath
          .split("/")
          .filter(Boolean)
          .flatMap((id) => ["subsecciones", id]),
      )
    : doc(db, "modulos", moduloId, "secciones", seccionId);

  batch.update(targetRef, {
    codigoAcceso: nuevoCodigo,
    fechaActualizacion: serverTimestamp(),
  });

  inscSnap.docs
    .filter((d) => ((d.data().subseccionPath as string | undefined) ?? "") === (subseccionPath ?? ""))
    .forEach((d) => batch.delete(d.ref));

  await batch.commit();
  return nuevoCodigo;
}
