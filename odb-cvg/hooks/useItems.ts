//hooks/useItems.ts
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../config/firebaseConfig";
import CryptoJS from 'crypto-js';

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

export type ItemInput = Omit<Item, "id" | "creadoPor" | "fechaCreacion" | "fechaActualizacion">;

// Función auxiliar para borrar en Cloudinary
const deleteFromCloudinary = async (publicId: string, tipo: ItemTipo) => {
  if (!publicId) return;

  const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || '';
  const apiKey = process.env.EXPO_PUBLIC_CLOUDINARY_API_KEY || '';
  const apiSecret = process.env.EXPO_PUBLIC_CLOUDINARY_API_SECRET || '';

  let resourceType = 'raw';
  if (tipo === 'imagen') resourceType = 'image';
  if (tipo === 'video') resourceType = 'video';

  const timestamp = Math.floor(Date.now() / 1000).toString();

  const stringToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = CryptoJS.SHA1(stringToSign).toString();

  const formData = new FormData();
  formData.append("public_id", publicId);
  formData.append("api_key", apiKey);
  formData.append("timestamp", timestamp);
  formData.append("signature", signature);

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`;

  try {
    const res = await fetch(url, { method: 'POST', body: formData });
    const data = await res.json();
    console.log("Respuesta de borrado Cloudinary:", data);
  } catch (error) {
    console.error("Error al borrar en Cloudinary:", error);
  }
};

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
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setItems(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Item));
      setLoading(false);
    }, (error) => {
      console.error("useItems error:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [moduloId, seccionId]);

  const crearItem = async (data: ItemInput) => {
    const user = auth.currentUser;
    if (!user) throw new Error("No autenticado");
    await addDoc(collection(db, "modulos", moduloId, "secciones", seccionId, "items"), {
      ...data,
      creadoPor: user.uid,
      fechaCreacion: serverTimestamp(),
      fechaActualizacion: serverTimestamp(),
    });
  };

  const actualizarItem = async (itemId: string, data: Partial<ItemInput>) => {
    await updateDoc(doc(db, "modulos", moduloId, "secciones", seccionId, "items", itemId), {
      ...data,
      fechaActualizacion: serverTimestamp(),
    });
  };

  const eliminarItem = async (item: Item) => {
    console.log(`[ELIMINAR] Iniciando borrado de: ${item.titulo}`);
    
    if (item.storageRef && item.tipo !== "texto" && item.tipo !== "enlace") {
      if (item.url && item.url.includes("firebasestorage")) {
        console.log("[ELIMINAR] Era un archivo viejo de Firebase. Se omite Cloudinary.");
      } else {
        console.log(`[ELIMINAR] Mandando a borrar publicId: ${item.storageRef}`);
        await deleteFromCloudinary(item.storageRef, item.tipo);
      }
    }

    await deleteDoc(doc(db, "modulos", moduloId, "secciones", seccionId, "items", item.id));
    console.log("[ELIMINAR] Documento borrado de la base de datos con éxito.");
  };

  return { items, loading, crearItem, actualizarItem, eliminarItem };
}