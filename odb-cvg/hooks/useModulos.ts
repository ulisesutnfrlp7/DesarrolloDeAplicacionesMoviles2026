import {
    addDoc,
    collection,
    doc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
    writeBatch,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../config/firebaseConfig";

export interface Modulo {
  id: string;
  titulo: string;
  descripcionCorta: string;
  icono: string;
  creadoPor: string;
  fechaCreacion: any;
  fechaActualizacion: any;
}

export type ModuloInput = Pick<Modulo, "titulo" | "descripcionCorta" | "icono">;

export function useModulos() {
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "modulos"), orderBy("fechaCreacion", "asc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setModulos(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Modulo),
        );
        setLoading(false);
      },
      (error) => {
        console.error("useModulos error:", error);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, []);

  const crearModulo = async (data: ModuloInput) => {
    const user = auth.currentUser;
    if (!user) throw new Error("No autenticado");
    await addDoc(collection(db, "modulos"), {
      ...data,
      creadoPor: user.uid,
      fechaCreacion: serverTimestamp(),
      fechaActualizacion: serverTimestamp(),
    });
  };

  const actualizarModulo = async (id: string, data: Partial<ModuloInput>) => {
    await updateDoc(doc(db, "modulos", id), {
      ...data,
      fechaActualizacion: serverTimestamp(),
    });
  };

  const eliminarModulo = async (id: string) => {
    const batch = writeBatch(db);
    const seccionesSnap = await getDocs(
      collection(db, "modulos", id, "secciones"),
    );
    seccionesSnap.forEach((seccionDoc) => batch.delete(seccionDoc.ref));
    batch.delete(doc(db, "modulos", id));
    await batch.commit();
  };

  return { modulos, loading, crearModulo, actualizarModulo, eliminarModulo };
}
