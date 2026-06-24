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

export interface Seccion {
  id: string;
  titulo: string;
  creadoPor: string;
  fechaCreacion: any;
  fechaActualizacion: any;
  esRestringida?: boolean;
  codigoAcceso?: string | null;
  permiteCargaProfesor?: boolean;
  permiteNotas?: boolean;
  permitePlanillas?: boolean;
}

export type SeccionInput = Pick<Seccion, "titulo"> & {
  esRestringida?: boolean;
  codigoAcceso?: string | null;
  permiteCargaProfesor?: boolean;
  permiteNotas?: boolean;
  permitePlanillas?: boolean;
};

export function useSecciones(moduloId: string) {
  const [secciones, setSecciones] = useState<Seccion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!moduloId) {
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, "modulos", moduloId, "secciones"),
      orderBy("fechaCreacion", "asc"),
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setSecciones(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Seccion),
        );
        setLoading(false);
      },
      (error) => {
        console.error("useSecciones error:", error);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [moduloId]);

  const crearSeccion = async (data: SeccionInput) => {
    const user = auth.currentUser;
    if (!user) throw new Error("No autenticado");
    await addDoc(collection(db, "modulos", moduloId, "secciones"), {
      ...data,
      permiteCargaProfesor: data.permiteCargaProfesor ?? false,
      permiteNotas: data.permiteNotas ?? false,
      permitePlanillas: data.permitePlanillas ?? false,
      creadoPor: user.uid,
      fechaCreacion: serverTimestamp(),
      fechaActualizacion: serverTimestamp(),
    });
  };

  const actualizarSeccion = async (
    seccionId: string,
    data: Partial<SeccionInput>,
  ) => {
    await updateDoc(doc(db, "modulos", moduloId, "secciones", seccionId), {
      ...data,
      fechaActualizacion: serverTimestamp(),
    });
  };

  const eliminarSeccion = async (seccionId: string) => {
    await deleteDoc(doc(db, "modulos", moduloId, "secciones", seccionId));
  };

  return {
    secciones,
    loading,
    crearSeccion,
    actualizarSeccion,
    eliminarSeccion,
  };
}
