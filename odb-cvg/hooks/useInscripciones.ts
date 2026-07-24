//hooks/useInscripciones.ts
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where, writeBatch,} from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../config/firebaseConfig";

export interface Inscripcion {
  id: string;
  alumnoId: string;
  moduloId: string;
  seccionId: string;
  subseccionPath?: string;
  subseccionIds?: string[];
  subseccionTitulo?: string;
  tipoAcceso?: "seccion" | "subseccion";
  tipo: "codigo" | "manual";
  codigoUsado: string | null;
  fechaInscripcion: any;
  multiComisionAutorizada?: boolean;
}

export interface InscripcionConComision extends Inscripcion {
  cambioComision?: boolean;
  comisionAnteriorTitulo?: string;
  fechaCambioComision?: any;
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

async function obtenerTituloSubseccion(
  moduloId: string,
  seccionId: string,
  subseccionPath: string,
): Promise<string> {
  try {
    const snap = await getDoc(
      doc(db, "modulos", moduloId, "secciones", seccionId, ...getSubseccionPathSegments(subseccionPath)),
    );
    return snap.exists() ? ((snap.data().titulo as string) ?? "otra comisión") : "otra comisión";
  } catch {
    return "otra comisión";
  }
}

function idPermisoMultiComision(alumnoId: string, seccionId: string) {
  return `${alumnoId}_${seccionId}`;
}

// Consulta si un admin/profesor ya habilitó a este alumno a estar en 2+ comisiones de esta sección.
export async function tienePermisoMultiComision(alumnoId: string, seccionId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "permisos_multi_comision", idPermisoMultiComision(alumnoId, seccionId)));
  return snap.exists();
}

// Admin/profesor: habilita manualmente al alumno a pertenecer a más de una comisión en esta sección.
export async function otorgarPermisoMultiComision(
  alumnoId: string,
  seccionId: string,
  moduloId: string,
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("No autenticado");
  await setDoc(doc(db, "permisos_multi_comision", idPermisoMultiComision(alumnoId, seccionId)), {
    alumnoId,
    seccionId,
    moduloId,
    otorgadoPor: uid,
    fechaOtorgado: serverTimestamp(),
  });
}

export async function revocarPermisoMultiComision(alumnoId: string, seccionId: string): Promise<void> {
  await deleteDoc(doc(db, "permisos_multi_comision", idPermisoMultiComision(alumnoId, seccionId)));
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
      "Esta cursada aún no tiene código configurado. Consultá en la Asignatura.",
    );
  }
  if (
    codigoIngresado.trim().toUpperCase() !== codigoActual.trim().toUpperCase()
  ) {
    throw new Error(
      "Código incorrecto. Verificá el código proporcionado por la Asignatura.",
    );
  }

  // Ya inscripto exactamente en esta misma comisión: no hacer nada.
  const existingConstraints = [
    where("alumnoId", "==", uid),
    where("seccionId", "==", seccionId),
  ];
  if (subseccionPath) existingConstraints.push(where("subseccionPath", "==", subseccionPath));
  const existing = await getDocs(query(collection(db, "inscripciones"), ...existingConstraints));
  const yaInscripto = existing.docs.some(
    (d) => ((d.data().subseccionPath as string | undefined) ?? "") === (subseccionPath ?? ""),
  );
  if (yaInscripto) return;

  // Buscamos el título de la subsección actual antes de guardar
  let subseccionTitulo = "";
  if (subseccionPath) {
    subseccionTitulo = await obtenerTituloSubseccion(moduloId, seccionId, subseccionPath);
  }

  // La lógica de "comisión" solo aplica quando se ingresa a una SUBSECCIÓN dentro de una sección.
  if (subseccionPath) {
    const todasSnap = await getDocs(
      query(
        collection(db, "inscripciones"),
        where("alumnoId", "==", uid),
        where("seccionId", "==", seccionId),
      ),
    );
    const otraComisionDoc = todasSnap.docs.find((d) => {
      const path = (d.data().subseccionPath as string | undefined) ?? "";
      return path !== "" && path !== subseccionPath;
    });

    if (otraComisionDoc) {
      const permiteMulti = await tienePermisoMultiComision(uid, seccionId);

      if (!permiteMulti) {
        // El alumno YA está en otra comisión de esta sección y no tiene permiso multi-comisión.
        // No se le permite auto-cambiarse: debe pedirle al profesor/admin que lo mueva.
        throw new Error(
          "Ya estás inscripto en otra comisión de esta sección. No podés cambiarte por tu cuenta: pedile a tu profesor o administrador que te mueva de comisión.",
        );
      }

      // Tiene permiso explícito: se agrega sin borrar la anterior.
      await addDoc(collection(db, "inscripciones"), {
        alumnoId: uid,
        moduloId,
        seccionId,
        subseccionPath,
        subseccionIds: getSubseccionIds(subseccionPath),
        subseccionTitulo,
        tipoAcceso: "subseccion",
        tipo: "codigo",
        codigoUsado: codigoIngresado.trim().toUpperCase(),
        fechaInscripcion: serverTimestamp(),
        multiComisionAutorizada: true,
      });
      return;
    }
  }

  // Sin conflicto: inscripción normal.
  await addDoc(collection(db, "inscripciones"), {
    alumnoId: uid,
    moduloId,
    seccionId,
    subseccionPath: subseccionPath ?? "",
    subseccionIds: getSubseccionIds(subseccionPath),
    subseccionTitulo,
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

  // Buscamos el título de la subsección actual antes de guardar
  let subseccionTitulo = "";
  if (subseccionPath) {
    subseccionTitulo = await obtenerTituloSubseccion(moduloId, seccionId, subseccionPath);
  }

  await addDoc(collection(db, "inscripciones"), {
    alumnoId,
    moduloId,
    seccionId,
    subseccionPath: subseccionPath ?? "",
    subseccionIds: getSubseccionIds(subseccionPath),
    subseccionTitulo,
    tipoAcceso: subseccionPath ? "subseccion" : "seccion",
    tipo: "manual",
    codigoUsado: null,
    fechaInscripcion: serverTimestamp(),
  });
}

// Devuelve, por alumnoId, el historial de comisiones de forma enriquecida
export function useComisionesPorSeccion(seccionId: string | null) {
  const [porAlumno, setPorAlumno] = useState<
    Record<string, { 
      cambioComision: boolean; 
      comisionAnteriorTitulo?: string; 
      comisionActualTitulo?: string; 
      multiComision: boolean; 
      comisionesActuales: string[];
    }>
  >({});

  useEffect(() => {
    if (!seccionId) {
      setPorAlumno({});
      return;
    }
    const q = query(collection(db, "inscripciones"), where("seccionId", "==", seccionId));
    const unsubscribe = onSnapshot(q, (snap) => {
      const agrupado: Record<string, any[]> = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        const alumnoId = data.alumnoId as string;
        (agrupado[alumnoId] ??= []).push(data);
      });
      const resultado: typeof porAlumno = {};
      
      Object.entries(agrupado).forEach(([alumnoId, inscs]) => {
        const conCambio = inscs.find((i) => i.cambioComision === true);
        const conSubseccion = inscs.filter((i) => (i.subseccionPath ?? "") !== "");

        let comisionActualTitulo: string | undefined = undefined;
        let comisionesActuales: string[] = [];

        if (conSubseccion.length > 0) {
          comisionesActuales = conSubseccion.map(i => i.subseccionTitulo || "Comisión sin nombre");
          if (conSubseccion.length === 1) {
            comisionActualTitulo = comisionesActuales[0];
          } else {
            // Estado inconsistente (0 o 2+ activas): no dejamos undefined
            comisionActualTitulo = comisionesActuales.join(", ") || "sin comisión activa";
          }
        } else {
          comisionActualTitulo = "sin comisión activa";
        }

        resultado[alumnoId] = {
          cambioComision: !!conCambio,
          comisionAnteriorTitulo: conCambio?.comisionAnteriorTitulo,
          comisionActualTitulo,
          multiComision: conSubseccion.length > 1,
          comisionesActuales,
        };
      });
      setPorAlumno(resultado);
    });
    return () => unsubscribe();
  }, [seccionId]);

  return porAlumno;
}

// Para el panel admin: qué alumnos tienen permiso de multi-comisión en una sección dada.
export function usePermisosMultiComisionSeccion(seccionId: string | null) {
  const [permitidos, setPermitidos] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!seccionId) {
      setPermitidos(new Set());
      return;
    }
    const q = query(collection(db, "permisos_multi_comision"), where("seccionId", "==", seccionId));
    const unsubscribe = onSnapshot(q, (snap) => {
      setPermitidos(new Set(snap.docs.map((d) => d.data().alumnoId as string)));
    });
    return () => unsubscribe();
  }, [seccionId]);
  return permitidos;
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