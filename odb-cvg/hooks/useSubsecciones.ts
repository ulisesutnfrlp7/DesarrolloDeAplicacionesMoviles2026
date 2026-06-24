import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../config/firebaseConfig";

export interface Subseccion {
  id: string;
  titulo: string;
  creadoPor: string;
  fechaCreacion: any;
  fechaActualizacion: any;
  permiteCargaProfesor?: boolean;
  permiteNotas?: boolean;
  permitePlanillas?: boolean;
  esRestringida?: boolean;
  codigoAcceso?: string | null;
}

export type SubseccionInput = Pick<Subseccion, "titulo"> & {
  permiteCargaProfesor?: boolean;
  permiteNotas?: boolean;
  permitePlanillas?: boolean;
  esRestringida?: boolean;
  codigoAcceso?: string | null;
};

const getSubseccionPathSegments = (subseccionPath?: string) =>
  (subseccionPath ?? "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .flatMap((id) => ["subsecciones", id]);

const getSubseccionesCollection = (
  moduloId: string,
  seccionId: string,
  parentPath?: string,
) =>
  collection(
    db,
    "modulos",
    moduloId,
    "secciones",
    seccionId,
    ...getSubseccionPathSegments(parentPath),
    "subsecciones",
  );

const getSubseccionDoc = (
  moduloId: string,
  seccionId: string,
  subseccionPath: string,
) =>
  doc(
    db,
    "modulos",
    moduloId,
    "secciones",
    seccionId,
    ...getSubseccionPathSegments(subseccionPath),
  );

export function useSubsecciones(moduloId: string, seccionId: string, parentPath?: string) {
  const [subsecciones, setSubsecciones] = useState<Subseccion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!moduloId || !seccionId) {
      setLoading(false);
      return;
    }
    const q = query(
      getSubseccionesCollection(moduloId, seccionId, parentPath),
      orderBy("fechaCreacion", "asc"),
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setSubsecciones(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Subseccion),
        );
        setLoading(false);
      },
      (error) => {
        console.error("useSubsecciones error:", error);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [moduloId, seccionId, parentPath]);

  const crearSubseccion = async (data: SubseccionInput) => {
    const user = auth.currentUser;
    if (!user) throw new Error("No autenticado");
    await addDoc(getSubseccionesCollection(moduloId, seccionId, parentPath), {
      ...data,
      permiteCargaProfesor: data.permiteCargaProfesor ?? false,
      permiteNotas: data.permiteNotas ?? false,
      permitePlanillas: data.permitePlanillas ?? false,
      esRestringida: data.esRestringida ?? false,
      codigoAcceso: data.esRestringida ? (data.codigoAcceso ?? null) : null,
      creadoPor: user.uid,
      fechaCreacion: serverTimestamp(),
      fechaActualizacion: serverTimestamp(),
    });
  };

  const actualizarSubseccion = async (
    subseccionPath: string,
    data: Partial<SubseccionInput>,
  ) => {
    await updateDoc(getSubseccionDoc(moduloId, seccionId, subseccionPath), {
      ...data,
      fechaActualizacion: serverTimestamp(),
    });
  };

  const eliminarSubseccion = async (subseccionPath: string) => {
    await deleteDoc(getSubseccionDoc(moduloId, seccionId, subseccionPath));
  };

  return {
    subsecciones,
    loading,
    crearSubseccion,
    actualizarSubseccion,
    eliminarSubseccion,
  };
}
