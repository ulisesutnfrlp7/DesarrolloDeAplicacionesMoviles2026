// hooks/useUserProfile.ts
import { doc, onSnapshot, setDoc, writeBatch } from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../config/firebaseConfig";
import { desencriptarDato, encriptarDato } from "../utils/crypto";

export interface PerfilUsuario {
  nombre?: string;
  legajo?: string;
  dni?: string;
  telefono?: string;
  legajoBloqueado?: boolean;
  dniBloqueado?: boolean;
}

function normalizarLegajo(legajo: string): string {
  return legajo.trim().toUpperCase();
}

export function useUserProfile() {
  const [perfil, setPerfil] = useState<PerfilUsuario>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }
    const unsubscribe = onSnapshot(doc(db, "usuarios", uid), (snap) => {
      const data = snap.data();
      setPerfil({
        nombre: data?.nombre ?? "",
        legajo: data?.legajo ?? "",
        dni: data?.dniEncriptado ? desencriptarDato(data.dniEncriptado) : "",
        telefono: data?.telefono ?? "",
        legajoBloqueado: !!data?.legajo,
        dniBloqueado: !!data?.dniEncriptado,
      });
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Se usa UNA sola vez: fija legajo (único entre todas las cuentas) y DNI de forma permanente.
  const completarDatosFijos = async (datos: {
    legajo: string;
    legajoConfirmacion: string;
    dni?: string;
    dniConfirmacion?: string;
  }) => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("No hay usuario autenticado.");

    if (!datos.legajo?.trim()) {
      throw new Error("El legajo es obligatorio.");
    }
    if (datos.legajo.trim() !== datos.legajoConfirmacion.trim()) {
      throw new Error("Los dos legajos ingresados no coinciden.");
    }
    if (datos.dni && datos.dni.trim() !== (datos.dniConfirmacion ?? "").trim()) {
      throw new Error("Los dos DNI ingresados no coinciden.");
    }

    const legajoNormalizado = normalizarLegajo(datos.legajo);
    const legajoDocId = encodeURIComponent(legajoNormalizado);

    const batch = writeBatch(db);
    batch.set(doc(db, "legajos_index", legajoDocId), {
      uid,
      creadoEn: new Date(),
    });
    batch.set(
      doc(db, "usuarios", uid),
      {
        legajo: datos.legajo.trim(),
        ...(datos.dni ? { dniEncriptado: encriptarDato(datos.dni) } : {}),
      },
      { merge: true },
    );

    try {
      await batch.commit();
    } catch (e: any) {
      if (e.code === "permission-denied") {
        throw new Error("Ese legajo ya está registrado en otra cuenta.");
      }
      throw e;
    }
  };

  // Se usa cuando el legajo ya está cargado y falta solo el DNI.
  const completarDNI = async (dni: string, dniConfirmacion: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("No hay usuario autenticado.");

    if (!dni?.trim()) {
      throw new Error("El DNI es obligatorio.");
    }
    if (dni.trim() !== dniConfirmacion.trim()) {
      throw new Error("Los dos DNI ingresados no coinciden.");
    }

    await setDoc(
      doc(db, "usuarios", uid),
      { dniEncriptado: encriptarDato(dni.trim()) },
      { merge: true },
    );
  };

  // Se puede usar las veces que haga falta: nombre y teléfono.
  const actualizarDatosEditables = async (datos: { nombre?: string; telefono?: string }) => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("No hay usuario autenticado.");

    await setDoc(
      doc(db, "usuarios", uid),
      {
        ...(datos.nombre !== undefined ? { nombre: datos.nombre.trim() } : {}),
        ...(datos.telefono !== undefined ? { telefono: datos.telefono.trim() } : {}),
      },
      { merge: true },
    );
  };

  const perfilCompleto = !!perfil.legajo && perfil.legajo.trim().length > 0;

  return {
    perfil,
    loading,
    perfilCompleto,
    completarDatosFijos,
    completarDNI,
    actualizarDatosEditables,
  };
}