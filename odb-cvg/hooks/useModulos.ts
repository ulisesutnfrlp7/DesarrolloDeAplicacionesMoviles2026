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
  orden?: number;
  creadoPor: string;
  fechaCreacion: any;
  fechaActualizacion: any;
}

export type ModuloInput = Pick<Modulo, "titulo" | "descripcionCorta" | "icono">;

function ordenarModulos(modulos: Modulo[]) {
  return [...modulos].sort((a, b) => {
    const ordenA = typeof a.orden === "number" ? a.orden : null;
    const ordenB = typeof b.orden === "number" ? b.orden : null;

    if (ordenA !== null && ordenB !== null) return ordenA - ordenB;
    if (ordenA !== null) return -1;
    if (ordenB !== null) return 1;
    return 0;
  });
}

export function useModulos() {
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "modulos"), orderBy("fechaCreacion", "asc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as Modulo,
        );
        setModulos(ordenarModulos(docs));
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
    const modulosSnap = await getDocs(collection(db, "modulos"));
    const ordenes = modulosSnap.docs
      .map((d) => d.data().orden)
      .filter((orden): orden is number => typeof orden === "number");
    const orden = ordenes.length > 0
      ? Math.max(...ordenes) + 1
      : modulosSnap.size;

    await addDoc(collection(db, "modulos"), {
      ...data,
      orden,
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

  const guardarOrdenModulos = async (modulosOrdenados: Modulo[]) => {
    const batch = writeBatch(db);
    modulosOrdenados.forEach((modulo, index) => {
      batch.update(doc(db, "modulos", modulo.id), {
        orden: index,
        fechaActualizacion: serverTimestamp(),
      });
    });
    await batch.commit();
  };

  return {
    modulos,
    loading,
    crearModulo,
    actualizarModulo,
    eliminarModulo,
    guardarOrdenModulos,
  };
}
