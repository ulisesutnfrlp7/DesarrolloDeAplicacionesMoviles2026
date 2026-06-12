// app/entregas/[id].tsx
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import ModalAlerta from "../../components/ui/ModalAlerta";
import ScreenHeader from "../../components/ui/ScreenHeader";
import { db } from "../../config/firebaseConfig";
import type { Item } from "../../hooks/useItems";
import { useEntregasAlumnos, useMiEntrega } from "../../hooks/useEntregasAlumnos";
import { useUserRole } from "../../hooks/useUserRole";
import * as FileSystem from "expo-file-system/legacy";

export default function EntregaDetalleScreen() {
  const { id, moduloId, seccionId, subseccionPath } = useLocalSearchParams<{
    id: string; moduloId: string; seccionId: string; subseccionPath?: string;
  }>();
  const { rol, loading: loadingRol } = useUserRole();
  const esDocente = rol === "admin" || rol === "profesor";

  const [item, setItem] = useState<Item | null>(null);
  const [loadingItem, setLoadingItem] = useState(true);

  // Para alumnos
  const { miEntrega, loading: loadingMia, enviarEntrega } = useMiEntrega(
    moduloId, seccionId, id, subseccionPath,
  );
  // Para admin/profe
  const { entregas, loading: loadingEntregas } = useEntregasAlumnos(
    moduloId, seccionId, id, subseccionPath,
  );

  const [tipoEnvio, setTipoEnvio] = useState<"texto" | "pdf" | "imagen" | "documento">("texto");
  const [contenido, setContenido] = useState("");
  const [archivo, setArchivo] = useState<{ uri: string; nombre: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [alerta, setAlerta] = useState<{
    visible: boolean; titulo: string; mensaje: string; tipo: "error" | "exito";
  }>({ visible: false, titulo: "", mensaje: "", tipo: "exito" });

  useEffect(() => {
    if (!moduloId || !seccionId || !id) return;
    const subseccionSegments = (subseccionPath ?? "")
      .split("/").map((s) => s.trim()).filter(Boolean)
      .flatMap((seg) => ["subsecciones", seg]);
    getDoc(doc(db, "modulos", moduloId, "secciones", seccionId, ...subseccionSegments, "items", id))
      .then((snap) => {
        setItem(snap.exists() ? ({ id: snap.id, ...snap.data() } as Item) : null);
        setLoadingItem(false);
      })
      .catch(() => setLoadingItem(false));
  }, [moduloId, seccionId, id, subseccionPath]);

  const elegirArchivo = async () => {
    if (tipoEnvio === "imagen") {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setAlerta({ visible: true, titulo: "Permiso denegado", mensaje: "Se necesita acceso a la galería.", tipo: "error" }); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (!res.canceled && res.assets[0]) {
        const ext = res.assets[0].uri.split(".").pop() ?? "jpg";
        setArchivo({ uri: res.assets[0].uri, nombre: `imagen_${Date.now()}.${ext}` });
      }
    } else {
      const res = await DocumentPicker.getDocumentAsync({
        type: tipoEnvio === "pdf" ? "application/pdf" : "*/*",
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets[0]) {
        if ((res.assets[0].size ?? 0) > 10 * 1024 * 1024) {
          setAlerta({ visible: true, titulo: "Archivo muy pesado", mensaje: "El archivo no puede superar los 10 MB.", tipo: "error" }); return;
        }
        setArchivo({ uri: res.assets[0].uri, nombre: res.assets[0].name });
      }
    }
  };

  const uploadToCloudinary = async (uri: string, tipo: string, nombre: string) => {
    let resourceType = "raw";
    let mimeType = "application/octet-stream";
    if (tipo === "imagen") { resourceType = "image"; mimeType = "image/jpeg"; }
    const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || "";
    const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "";
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;
    const uploadResult = await FileSystem.uploadAsync(url, uri, {
      httpMethod: "POST", uploadType: 1 as any, fieldName: "file",
      mimeType, parameters: { upload_preset: UPLOAD_PRESET },
    });
    const result = JSON.parse(uploadResult.body);
    if (uploadResult.status !== 200) throw new Error(result.error?.message || "Error al subir");
    return { url: result.secure_url, publicId: result.public_id };
  };

  const handleEnviar = async () => {
    if (tipoEnvio === "texto" && !contenido.trim()) {
      setAlerta({ visible: true, titulo: "Campo vacío", mensaje: "Escribí algo antes de entregar.", tipo: "error" }); return;
    }
    if (tipoEnvio !== "texto" && !archivo) {
      setAlerta({ visible: true, titulo: "Sin archivo", mensaje: "Seleccioná un archivo.", tipo: "error" }); return;
    }
    setSubiendo(true);
    try {
      if (tipoEnvio === "texto") {
        await enviarEntrega({ tipo: "texto", titulo: "Texto", contenido: contenido.trim(), url: "", storageRef: "", nombreArchivo: "" });
      } else {
        const cloud = await uploadToCloudinary(archivo!.uri, tipoEnvio, archivo!.nombre);
        await enviarEntrega({ tipo: tipoEnvio, titulo: archivo!.nombre, contenido: "", url: cloud.url, storageRef: cloud.publicId, nombreArchivo: archivo!.nombre });
      }
      setAlerta({ visible: true, titulo: "¡Entregado!", mensaje: "Tu entrega fue enviada correctamente.", tipo: "exito" });
    } catch {
      setAlerta({ visible: true, titulo: "Error", mensaje: "No se pudo enviar la entrega. Intentá nuevamente.", tipo: "error" });
    } finally {
      setSubiendo(false);
    }
  };

  if (loadingItem || loadingRol) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo="" mostrarHome />
        <View style={styles.centered}><ActivityIndicator size="large" color="#25B471" /></View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
      <ScreenHeader titulo={item?.titulo ?? "Entrega"} mostrarHome />
      <ScrollView contentContainerStyle={styles.content}>

        {/* Consigna */}
        {item?.descripcionEntrega ? (
          <View style={styles.consignaCard}>
            <Text style={styles.consignaTitulo}>Consigna</Text>
            <Text style={styles.consignaTexto}>{item.descripcionEntrega}</Text>
            {item.fechaLimite ? (
              <Text style={styles.fechaLimite}>⏰ Fecha límite: {item.fechaLimite}</Text>
            ) : null}
          </View>
        ) : null}

        {/* Vista DOCENTE: lista de entregas de alumnos */}
        {esDocente ? (
          <>
            <Text style={styles.seccionTitulo}>Entregas recibidas</Text>
            {loadingEntregas ? (
              <ActivityIndicator color="#25B471" style={{ marginTop: 16 }} />
            ) : entregas.length === 0 ? (
              <Text style={styles.vacio}>Ningún alumno ha entregado todavía.</Text>
            ) : (
              entregas.map((e) => (
                <View key={e.id} style={styles.entregaCard}>
                  <View style={styles.entregaHeader}>
                    <View style={styles.entregaIconBg}>
                      <Ionicons name="person-outline" size={16} color="#0F4A32" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.entregaAlumno}>{e.alumnoNombre}</Text>
                      <Text style={styles.entregaFecha}>
                        {e.fechaEntrega?.toDate
                          ? e.fechaEntrega.toDate().toLocaleDateString("es-AR")
                          : ""}
                      </Text>
                    </View>
                    {e.tipo !== "texto" && e.url ? (
                      <TouchableOpacity onPress={() => router.push(`/entregas/visor?url=${encodeURIComponent(e.url)}` as any)}>
                        <Ionicons name="open-outline" size={20} color="#25B471" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {e.tipo === "texto" && e.contenido ? (
                    <Text style={styles.entregaContenido}>{e.contenido}</Text>
                  ) : (
                    <Text style={styles.entregaNombreArchivo}>{e.nombreArchivo}</Text>
                  )}
                </View>
              ))
            )}
          </>
        ) : (
          /* Vista ALUMNO */
          <>
            {loadingMia ? (
              <ActivityIndicator color="#25B471" style={{ marginTop: 32 }} />
            ) : miEntrega ? (
              /* Ya entregó */
              <View style={styles.yaEntregadoCard}>
                <Ionicons name="checkmark-circle" size={40} color="#25B471" />
                <Text style={styles.yaEntregadoTitulo}>¡Ya entregaste!</Text>
                <Text style={styles.yaEntregadoSub}>
                  {miEntrega.tipo === "texto"
                    ? miEntrega.contenido
                    : miEntrega.nombreArchivo}
                </Text>
              </View>
            ) : (
              /* Formulario de entrega */
              <>
                <Text style={styles.seccionTitulo}>Tu entrega</Text>

                {/* Selector de tipo */}
                <View style={styles.tipoRow}>
                  {(["texto", "pdf", "imagen", "documento"] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.tipoBtn, tipoEnvio === t && styles.tipoBtnSelected]}
                      onPress={() => { setTipoEnvio(t); setArchivo(null); }}
                    >
                      <Text style={[styles.tipoBtnText, tipoEnvio === t && styles.tipoBtnTextSelected]}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {tipoEnvio === "texto" ? (
                  <TextInput
                    style={[styles.input, { height: 140 }]}
                    placeholder="Escribí tu respuesta aquí..."
                    placeholderTextColor="#9CA3AF"
                    value={contenido}
                    onChangeText={setContenido}
                    multiline
                    textAlignVertical="top"
                  />
                ) : (
                  <TouchableOpacity style={styles.fileBtn} onPress={elegirArchivo}>
                    <Ionicons name="cloud-upload-outline" size={20} color="#0F4A32" />
                    <Text style={styles.fileBtnText}>
                      {archivo ? archivo.nombre : "Seleccionar archivo"}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.enviarBtn, subiendo && { opacity: 0.6 }]}
                  onPress={handleEnviar}
                  disabled={subiendo}
                >
                  {subiendo
                    ? <ActivityIndicator color="#FFFFFF" />
                    : <Text style={styles.enviarBtnText}>Entregar</Text>}
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </ScrollView>

      <ModalAlerta
        visible={alerta.visible}
        titulo={alerta.titulo}
        mensaje={alerta.mensaje}
        tipo={alerta.tipo}
        onClose={() => setAlerta((p) => ({ ...p, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  consignaCard: {
    backgroundColor: "#FEF3C7", borderRadius: 12, padding: 16,
    marginBottom: 20, borderLeftWidth: 4, borderLeftColor: "#F59E0B",
  },
  consignaTitulo: { fontSize: 12, fontWeight: "700", color: "#B45309", textTransform: "uppercase", marginBottom: 6 },
  consignaTexto: { fontSize: 14, color: "#374151", lineHeight: 20 },
  fechaLimite: { fontSize: 13, color: "#B45309", marginTop: 8, fontWeight: "600" },
  seccionTitulo: { fontSize: 17, fontWeight: "700", color: "#11181C", marginBottom: 12 },
  vacio: { fontSize: 14, color: "#9CA3AF", fontStyle: "italic" },
  entregaCard: {
    backgroundColor: "#FFFFFF", borderRadius: 10, padding: 14,
    marginBottom: 10, elevation: 1,
  },
  entregaHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  entregaIconBg: { width: 30, height: 30, borderRadius: 8, backgroundColor: "#E8F5E9", justifyContent: "center", alignItems: "center" },
  entregaAlumno: { fontSize: 14, fontWeight: "700", color: "#11181C" },
  entregaFecha: { fontSize: 12, color: "#9CA3AF" },
  entregaContenido: { fontSize: 13, color: "#374151", lineHeight: 18, marginTop: 4 },
  entregaNombreArchivo: { fontSize: 13, color: "#6B7280", marginTop: 4 },
  yaEntregadoCard: {
    backgroundColor: "#F0FDF4", borderRadius: 12, padding: 24,
    alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#BBF7D0",
  },
  yaEntregadoTitulo: { fontSize: 18, fontWeight: "700", color: "#0F4A32" },
  yaEntregadoSub: { fontSize: 14, color: "#6B7280", textAlign: "center" },
  tipoRow: { flexDirection: "row", gap: 8, marginBottom: 14, flexWrap: "wrap" },
  tipoBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1.5, borderColor: "#0F4A32", backgroundColor: "#FFFFFF",
  },
  tipoBtnSelected: { backgroundColor: "#0F4A32" },
  tipoBtnText: { fontSize: 13, fontWeight: "600", color: "#0F4A32" },
  tipoBtnTextSelected: { color: "#FFFFFF" },
  input: {
    backgroundColor: "#FFFFFF", borderRadius: 10, borderWidth: 1,
    borderColor: "#E5E7EB", padding: 14, fontSize: 15, color: "#11181C",
  },
  fileBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#FFFFFF", borderRadius: 10, borderWidth: 1.5,
    borderColor: "#E5E7EB", borderStyle: "dashed", padding: 14,
  },
  fileBtnText: { fontSize: 14, color: "#6B7280", flex: 1 },
  enviarBtn: {
    backgroundColor: "#25B471", borderRadius: 12, paddingVertical: 15,
    alignItems: "center", marginTop: 20,
  },
  enviarBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },
});