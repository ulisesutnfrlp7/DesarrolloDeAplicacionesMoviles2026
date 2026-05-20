import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import {
  router,
  Stack,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import ModalAlerta from "../../components/ui/ModalAlerta";
import ModalConfirmacion from "../../components/ui/ModalConfirmacion";
import { db, storage } from "../../config/firebaseConfig";
import type { ItemTipo } from "../../hooks/useItems";
import { useItems } from "../../hooks/useItems";
import { useUserRole } from "../../hooks/useUserRole";

const TIPOS: { key: ItemTipo; label: string; icono: string }[] = [
  { key: "texto", label: "Texto", icono: "document-text-outline" },
  { key: "pdf", label: "PDF", icono: "document-outline" },
  { key: "imagen", label: "Imagen", icono: "image-outline" },
  { key: "documento", label: "Documento", icono: "attach-outline" },
];

export default function ItemFormScreen() {
  const { moduloId, seccionId, itemId } = useLocalSearchParams<{
    moduloId: string;
    seccionId: string;
    itemId?: string;
  }>();
  const modoEdicion = !!itemId;

  const { rol, loading: loadingRol } = useUserRole();
  const { crearItem, actualizarItem } = useItems(moduloId, seccionId);

  const [tipo, setTipo] = useState<ItemTipo>("texto");
  const [titulo, setTitulo] = useState("");
  const [contenido, setContenido] = useState("");
  const [archivo, setArchivo] = useState<{
    uri: string;
    nombre: string;
  } | null>(null);
  const [archivoExistente, setArchivoExistente] = useState<{
    nombre: string;
    url: string;
    storageRef: string;
  } | null>(null);
  const [cargandoDatos, setCargandoDatos] = useState(!!itemId);
  const [subiendo, setSubiendo] = useState(false);
  const [hayCambios, setHayCambios] = useState(false);
  const [modalDescartar, setModalDescartar] = useState(false);
  const [alerta, setAlerta] = useState<{
    visible: boolean;
    titulo: string;
    mensaje: string;
    tipo: "error" | "exito";
    cerrarAlSalir: boolean;
  }>({
    visible: false,
    titulo: "",
    mensaje: "",
    tipo: "exito",
    cerrarAlSalir: false,
  });

  // Al cambiar de tipo, limpiar el archivo recién seleccionado (no el existente)
  useEffect(() => {
    setArchivo(null);
  }, [tipo]);

  // Cargar datos del item existente en modo edición
  useEffect(() => {
    if (!modoEdicion || !itemId) return;
    const cargar = async () => {
      try {
        const snap = await getDoc(
          doc(db, "modulos", moduloId, "secciones", seccionId, "items", itemId),
        );
        if (snap.exists()) {
          const data = snap.data();
          setTipo(data.tipo ?? "texto");
          setTitulo(data.titulo ?? "");
          setContenido(data.contenido ?? "");
          if (data.url) {
            setArchivoExistente({
              nombre: data.nombreArchivo ?? "",
              url: data.url ?? "",
              storageRef: data.storageRef ?? "",
            });
          }
        }
      } catch (error) {
        console.error("Error al cargar item:", error);
      } finally {
        setCargandoDatos(false);
      }
    };
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const elegirArchivo = async () => {
    if (tipo === "imagen") {
      const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permiso.granted) {
        setAlerta({
          visible: true,
          titulo: "Permiso denegado",
          mensaje: "Se necesita acceso a la galería para seleccionar imágenes.",
          tipo: "error",
          cerrarAlSalir: false,
        });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
      });
      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        const extension = asset.uri.split(".").pop() ?? "jpg";
        setArchivo({
          uri: asset.uri,
          nombre: `imagen_${Date.now()}.${extension}`,
        });
        setHayCambios(true);
      }
    } else {
      const result = await DocumentPicker.getDocumentAsync({
        type: tipo === "pdf" ? "application/pdf" : "*/*",
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        setArchivo({ uri: asset.uri, nombre: asset.name });
        setHayCambios(true);
      }
    }
  };

  const handleGuardar = async () => {
    if (!titulo.trim() && tipo !== "texto") {
      setAlerta({
        visible: true,
        titulo: "Campo requerido",
        mensaje: "El título no puede estar vacío.",
        tipo: "error",
        cerrarAlSalir: false,
      });
      return;
    }
    if (tipo !== "texto" && !archivo && !modoEdicion) {
      setAlerta({
        visible: true,
        titulo: "Sin archivo",
        mensaje: "Por favor seleccioná un archivo antes de guardar.",
        tipo: "error",
        cerrarAlSalir: false,
      });
      return;
    }

    setSubiendo(true);
    try {
      if (modoEdicion && itemId) {
        // ── Modo edición ────────────────────────────────────────────────────
        if (tipo === "texto") {
          if (!contenido.trim() && !titulo.trim()) {
            setAlerta({
              visible: true,
              titulo: "Campos vacíos",
              mensaje: "Ingresá al menos un título o contenido.",
              tipo: "error",
              cerrarAlSalir: false,
            });
            setSubiendo(false);
            return;
          }
          await actualizarItem(itemId, {
            titulo: titulo.trim() || "Texto",
            contenido: contenido.trim(),
          });
        } else if (archivo) {
          // Reemplazar con nuevo archivo
          const storageRefPath = `modulos/${moduloId}/secciones/${seccionId}/${Date.now()}_${archivo.nombre}`;
          const fileRef = ref(storage, storageRefPath);
          const response = await fetch(archivo.uri);
          const blob = await response.blob();
          await uploadBytes(fileRef, blob);
          const url = await getDownloadURL(fileRef);
          await actualizarItem(itemId, {
            titulo: titulo.trim() || archivo.nombre,
            url,
            storageRef: storageRefPath,
            nombreArchivo: archivo.nombre,
          });
        } else {
          // Mantener archivo existente, solo actualizar título
          await actualizarItem(itemId, {
            titulo: titulo.trim() || archivoExistente?.nombre || "",
          });
        }
        setAlerta({
          visible: true,
          titulo: "Actualizado",
          mensaje: "El elemento fue actualizado correctamente.",
          tipo: "exito",
          cerrarAlSalir: true,
        });
      } else {
        // ── Modo creación ───────────────────────────────────────────────────
        if (tipo === "texto") {
          if (!contenido.trim() && !titulo.trim()) {
            setAlerta({
              visible: true,
              titulo: "Campos vacíos",
              mensaje: "Ingresá al menos un título o contenido.",
              tipo: "error",
              cerrarAlSalir: false,
            });
            setSubiendo(false);
            return;
          }
          await crearItem({
            tipo: "texto",
            titulo: titulo.trim() || "Texto",
            contenido: contenido.trim(),
            url: "",
            storageRef: "",
            nombreArchivo: "",
          });
        } else {
          const storageRefPath = `modulos/${moduloId}/secciones/${seccionId}/${Date.now()}_${archivo!.nombre}`;
          const fileRef = ref(storage, storageRefPath);
          const response = await fetch(archivo!.uri);
          const blob = await response.blob();
          await uploadBytes(fileRef, blob);
          const url = await getDownloadURL(fileRef);
          await crearItem({
            tipo,
            titulo: titulo.trim() || archivo!.nombre,
            contenido: "",
            url,
            storageRef: storageRefPath,
            nombreArchivo: archivo!.nombre,
          });
        }
        setAlerta({
          visible: true,
          titulo: "Guardado",
          mensaje: "El elemento fue agregado correctamente.",
          tipo: "exito",
          cerrarAlSalir: true,
        });
      }
    } catch {
      setAlerta({
        visible: true,
        titulo: "Error",
        mensaje: "No se pudo guardar. Intentá nuevamente.",
        tipo: "error",
        cerrarAlSalir: false,
      });
    } finally {
      setSubiendo(false);
    }
  };

  const handleCerrarAlerta = () => {
    const debeVolver = alerta.cerrarAlSalir;
    setAlerta((prev) => ({ ...prev, visible: false }));
    if (debeVolver) router.back();
  };

  const handleAtras = () => {
    if (hayCambios) {
      setModalDescartar(true);
    } else {
      router.back();
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        if (hayCambios) {
          setModalDescartar(true);
          return true;
        }
        return false;
      };
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress,
      );
      return () => subscription.remove();
    }, [hayCambios]),
  );

  if (loadingRol || cargandoDatos) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "",
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => router.back()}
                style={{ marginLeft: 4 }}
              >
                <Ionicons name="arrow-back" size={24} color="#0F4A32" />
              </TouchableOpacity>
            ),
          }}
        />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#25B471" />
        </View>
      </>
    );
  }

  if (rol !== "admin" && rol !== "profesor") {
    return (
      <>
        <Stack.Screen
          options={{
            title: "",
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => router.back()}
                style={{ marginLeft: 4 }}
              >
                <Ionicons name="arrow-back" size={24} color="#0F4A32" />
              </TouchableOpacity>
            ),
          }}
        />
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={48} color="#CBD5E0" />
          <Text style={styles.sinPermisoText}>
            No tenés permiso para acceder a esta pantalla.
          </Text>
          <TouchableOpacity
            style={styles.volverBtn}
            onPress={() => router.back()}
          >
            <Text style={styles.volverBtnText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen
        options={{
          title: modoEdicion ? "Editar elemento" : "Agregar elemento",
          headerLeft: () => (
            <TouchableOpacity onPress={handleAtras} style={{ marginLeft: 4 }}>
              <Ionicons name="arrow-back" size={24} color="#0F4A32" />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Selector de tipo — bloqueado en modo edición */}
        <Text style={styles.label}>Tipo de Contenido</Text>
        <View style={styles.tipoGrid}>
          {TIPOS.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[
                styles.tipoOption,
                tipo === t.key && styles.tipoOptionSelected,
                modoEdicion && tipo !== t.key && styles.tipoOptionDisabled,
              ]}
              onPress={() => {
                if (!modoEdicion) {
                  setTipo(t.key);
                  setHayCambios(true);
                }
              }}
              activeOpacity={modoEdicion ? 1 : 0.7}
            >
              <Ionicons
                name={t.icono as any}
                size={22}
                color={tipo === t.key ? "#FFFFFF" : "#0F4A32"}
              />
              <Text
                style={[
                  styles.tipoLabel,
                  tipo === t.key && styles.tipoLabelSelected,
                ]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Título */}
        <Text style={styles.label}>Título{tipo === "texto" ? "" : " *"}</Text>
        <TextInput
          style={styles.input}
          placeholder={
            tipo === "texto"
              ? "Título opcional"
              : "Nombre descriptivo del archivo"
          }
          placeholderTextColor="#9CA3AF"
          value={titulo}
          onChangeText={(v) => {
            setTitulo(v);
            setHayCambios(true);
          }}
          maxLength={100}
        />

        {/* Contenido para tipo texto */}
        {tipo === "texto" && (
          <>
            <Text style={styles.label}>Contenido</Text>
            <Text style={styles.hint}>
              Podés usar Markdown: **negrita**, *cursiva*, # Título, - listas
            </Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Escribí el texto aquí..."
              placeholderTextColor="#9CA3AF"
              value={contenido}
              onChangeText={(v) => {
                setContenido(v);
                setHayCambios(true);
              }}
              multiline
              textAlignVertical="top"
            />
          </>
        )}

        {/* Selector de archivo para tipos no-texto */}
        {tipo !== "texto" && (
          <>
            <Text style={styles.label}>
              Archivo{!modoEdicion && <Text style={styles.required}> *</Text>}
            </Text>
            {modoEdicion && archivoExistente && !archivo && (
              <View style={styles.archivoActualContainer}>
                <Ionicons
                  name="document-attach-outline"
                  size={18}
                  color="#25B471"
                />
                <Text style={styles.archivoActualText} numberOfLines={1}>
                  {archivoExistente.nombre}
                </Text>
                <Text style={styles.archivoActualBadge}>Actual</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.filePickerBtn}
              onPress={elegirArchivo}
              disabled={subiendo}
            >
              <Ionicons
                name={
                  archivo ? "checkmark-circle-outline" : "cloud-upload-outline"
                }
                size={22}
                color={archivo ? "#25B471" : "#0F4A32"}
              />
              <Text
                style={[
                  styles.filePickerText,
                  archivo && styles.filePickerTextSelected,
                ]}
                numberOfLines={1}
              >
                {archivo
                  ? archivo.nombre
                  : modoEdicion
                    ? "Reemplazar archivo (opcional)"
                    : "Seleccionar archivo"}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {/* Botón guardar */}
        <TouchableOpacity
          style={[styles.saveBtn, subiendo && styles.saveBtnDisabled]}
          onPress={handleGuardar}
          disabled={subiendo}
        >
          {subiendo ? (
            <View style={styles.saveBtnLoading}>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.saveBtnText}>Subiendo...</Text>
            </View>
          ) : (
            <Text style={styles.saveBtnText}>
              {modoEdicion ? "Guardar Cambios" : "Agregar"}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <ModalAlerta
        visible={alerta.visible}
        titulo={alerta.titulo}
        mensaje={alerta.mensaje}
        tipo={alerta.tipo}
        onClose={handleCerrarAlerta}
      />
      <ModalConfirmacion
        visible={modalDescartar}
        titulo="¿Descartar cambios?"
        mensaje="Tenés cambios sin guardar. Si salís ahora, perderás el progreso."
        textoConfirmar="Descartar cambios"
        textoCancelar="Mantenerme"
        onConfirm={() => {
          setModalDescartar(false);
          router.back();
        }}
        onCancel={() => setModalDescartar(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  content: { padding: 20, paddingBottom: 48 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
    marginTop: 18,
  },
  required: { color: "#DC2626" },
  hint: {
    fontSize: 12,
    color: "#9CA3AF",
    marginBottom: 6,
    marginTop: -4,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#11181C",
  },
  inputMultiline: {
    height: 180,
    paddingTop: 12,
  },
  tipoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 4,
  },
  tipoOption: {
    flex: 1,
    minWidth: "45%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#0F4A32",
    backgroundColor: "#FFFFFF",
  },
  tipoOptionSelected: {
    backgroundColor: "#0F4A32",
    borderColor: "#0F4A32",
  },
  tipoOptionDisabled: {
    opacity: 0.35,
  },
  tipoLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F4A32",
  },
  tipoLabelSelected: {
    color: "#FFFFFF",
  },
  filePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  filePickerText: {
    flex: 1,
    fontSize: 14,
    color: "#6B7280",
  },
  filePickerTextSelected: {
    color: "#11181C",
    fontWeight: "500",
  },
  saveBtn: {
    marginTop: 28,
    backgroundColor: "#25B471",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnLoading: { flexDirection: "row", gap: 10, alignItems: "center" },
  saveBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },
  sinPermisoText: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 12,
    marginBottom: 20,
  },
  volverBtn: {
    backgroundColor: "#0F4A32",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  volverBtnText: { color: "#FFFFFF", fontWeight: "600", fontSize: 15 },
  archivoActualContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F0FFF4",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  archivoActualText: {
    flex: 1,
    fontSize: 13,
    color: "#374151",
  },
  archivoActualBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: "#25B471",
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
});
