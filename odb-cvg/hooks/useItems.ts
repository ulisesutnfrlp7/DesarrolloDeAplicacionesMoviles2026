import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc,} from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../config/firebaseConfig"; 

export type ItemTipo = "texto" | "pdf" | "imagen" | "documento" | "video" | "enlace";
export interface Item {
  id: string;
  tipo: ItemTipo;
  titulo: string;
  contenido: string;
  url: string; 
  storageRef: string;
  nombreArchivo: string;
  creadoPor: string;
  fechaCreacion: any;
  fechaActualizacion: any;
}

export type ItemInput = Omit<
  Item,
  "id" | "creadoPor" | "fechaCreacion" | "fechaActualizacion"
>;

export function useItems(moduloId: string, seccionId: string) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!moduloId || !seccionId) {
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, "modulos", moduloId, "secciones", seccionId, "items"),
      orderBy("fechaCreacion", "asc"),
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setItems(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Item));
        setLoading(false);
      },
      (error) => {
        console.error("useItems error:", error);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [moduloId, seccionId]);

  const crearItem = async (data: ItemInput) => {
    const user = auth.currentUser;
    if (!user) throw new Error("No autenticado");
    await addDoc(
      collection(db, "modulos", moduloId, "secciones", seccionId, "items"),
      {
        ...data,
        creadoPor: user.uid,
        fechaCreacion: serverTimestamp(),
        fechaActualizacion: serverTimestamp(),
      },
    );
  };

  const actualizarItem = async (itemId: string, data: Partial<ItemInput>) => {
    await updateDoc(
      doc(db, "modulos", moduloId, "secciones", seccionId, "items", itemId),
      {
        ...data,
        fechaActualizacion: serverTimestamp(),
      },
    );
  };

  const eliminarItem = async (itemId: string, storageRefPath?: string) => {
    await deleteDoc(
      doc(db, "modulos", moduloId, "secciones", seccionId, "items", itemId),
    );
  };

  return { items, loading, crearItem, actualizarItem, eliminarItem };
}