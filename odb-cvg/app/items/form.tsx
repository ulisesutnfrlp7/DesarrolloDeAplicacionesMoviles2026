//app/items/form.tsx
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { router, Stack, useFocusEffect, useLocalSearchParams,} from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Linking} from "react-native";
import ModalAlerta from "../../components/ui/ModalAlerta";
import ModalConfirmacion from "../../components/ui/ModalConfirmacion";
import { db } from "../../config/firebaseConfig";
import type { ItemTipo } from "../../hooks/useItems";
import { useItems } from "../../hooks/useItems";
import { useUserRole } from "../../hooks/useUserRole";
import ScreenHeader from "../../components/ui/ScreenHeader";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";

const TIPOS: { key: ItemTipo; label: string; icono: string }[] = [
  { key: "texto", label: "Texto", icono: "document-text-outline" },
  { key: "enlace", label: "Enlace", icono: "link-outline" },
  { key: "pdf", label: "PDF", icono: "document-outline" },
  { key: "imagen", label: "Imagen", icono: "image-outline" },
  { key: "video", label: "Video", icono: "videocam-outline" },
  { key: "documento", label: "Doc.", icono: "attach-outline" },
];

export default function ItemFormScreen() {
  const { moduloId, seccionId, subseccionId, subseccionPath, itemId } = useLocalSearchParams<{
    moduloId: string;
    seccionId: string;
    subseccionId?: string;
    subseccionPath?: string;
    itemId?: string;
  }>();
  const modoEdicion = !!itemId;
  const currentSubseccionPath = subseccionPath ?? subseccionId;

  const { rol, loading: loadingRol } = useUserRole();
  const { crearItem, actualizarItem } = useItems(moduloId, seccionId, currentSubseccionPath);

  const [tipo, setTipo] = useState<ItemTipo>("texto");
  const [titulo, setTitulo] = useState("");
  const [contenido, setContenido] = useState("");
  const [urlEnlace, setUrlEnlace] = useState("");
  const [archivo, setArchivo] = useState<{
    uri: string;
    nombre: string;
  } | null>(null);
  const [archivoExistente, setArchivoExistente] = useState<{
    nombre: string;
    url: string;
    storageRef: string;
  } | null>(null);
  const [permiteCargaProfesor, setPermiteCargaProfesor] = useState(false);
  const [cargandoPermiso, setCargandoPermiso] = useState(true);
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

  useEffect(() => {
    if (!moduloId || !seccionId) {
      setCargandoPermiso(false);
      return;
    }
    const cargarPermiso = async () => {
      try {
        const subseccionSegments = (currentSubseccionPath ?? "")
          .split("/")
          .map((segment) => segment.trim())
          .filter(Boolean)
          .flatMap((id) => ["subsecciones", id]);
        const snap = await getDoc(
          doc(db, "modulos", moduloId, "secciones", seccionId, ...subseccionSegments),
        );
        setPermiteCargaProfesor(snap.exists() ? snap.data().permiteCargaProfesor === true : false);
      } catch (error) {
        console.error("Error al cargar permiso de carga:", error);
        setPermiteCargaProfesor(false);
      } finally {
        setCargandoPermiso(false);
      }
    };
    cargarPermiso();
  }, [moduloId, seccionId, currentSubseccionPath]);

  // Cargar datos del item existente en modo edición
  useEffect(() => {
    if (!modoEdicion || !itemId) return;
    const cargar = async () => {
      try {
        const subseccionSegments = (currentSubseccionPath ?? "")
          .split("/")
          .map((segment) => segment.trim())
          .filter(Boolean)
          .flatMap((id) => ["subsecciones", id]);
        const snap = await getDoc(
          doc(db, "modulos", moduloId, "secciones", seccionId, ...subseccionSegments, "items", itemId),
        );
        if (snap.exists()) {
          const data = snap.data();
          setTipo(data.tipo ?? "texto");
          setTitulo(data.titulo ?? "");
          setContenido(data.contenido ?? "");
          if (data.tipo === "enlace") {
            setUrlEnlace(data.url ?? "");
          }
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
  }, [itemId, currentSubseccionPath]);

const uploadToCloudinary = async (uri: string, tipo: string, nombre: string) => {
  let resourceType = 'raw'; 
  let mimeType = 'application/octet-stream';

  if (tipo === 'imagen') {
    resourceType = 'image';
    const ext = nombre.split('.').pop()?.toLowerCase() || 'jpg';
    mimeType = `image/${ext === 'png' ? 'png' : 'jpeg'}`;
  } else if (tipo === 'video') {
    resourceType = 'video';
    const ext = nombre.split('.').pop()?.toLowerCase() || 'mp4';
    mimeType = `video/${ext}`;
  } else if (tipo === 'pdf') {
    mimeType = 'application/pdf';
  }

  const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || ''; 
  const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || '';
  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;

  if (Platform.OS === 'web') {
    const data = new FormData();
    data.append('upload_preset', UPLOAD_PRESET);
    
    try {
      const fileResponse = await fetch(uri);
      const blob = await fileResponse.blob();
      data.append('file', blob, nombre);
    } catch (error) {
      console.error("Error convirtiendo a Blob en Web:", error);
    }

    const response = await fetch(url, {
      method: 'POST',
      body: data,
      headers: {
        'Accept': 'application/json',
      },
    });

    const result = await response.json();
    
    if (!response.ok) {
      console.error("Cloudinary Error Detallado:", result);
      throw new Error(result.error?.message || "Error al subir el archivo");
    }

    return { url: result.secure_url, publicId: result.public_id };

  } else {
    // EN CELULAR: Usamos expo-file-system nativo
    try {
      const uploadResult = await FileSystem.uploadAsync(url, uri, {
        httpMethod: 'POST',
        uploadType: 1 as any, 
        fieldName: 'file',
        mimeType: mimeType,
        parameters: {
          upload_preset: UPLOAD_PRESET,
        },
      });

      const result = JSON.parse(uploadResult.body);

      if (uploadResult.status !== 200) {
        console.error("Cloudinary Error Detallado:", result);
        throw new Error(result.error?.message || "Error al subir el archivo");
      }

      return {
        url: result.secure_url,
        publicId: result.public_id,
      };
    } catch (error) {
      console.error("Error de FileSystem:", error);
      throw new Error("Falló la subida nativa del archivo");
    }
  }
};

  const elegirArchivo = async () => {
    // Definimos los límites en bytes (1MB = 1024 * 1024 bytes)
    const LIMITE_10MB = 10 * 1024 * 1024;
    const LIMITE_100MB = 100 * 1024 * 1024;

    if (tipo === "imagen" || tipo === "video") {
      const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permiso.granted) {
        setAlerta({ visible: true, titulo: "Permiso denegado", mensaje: "Se necesita acceso a la galería.", tipo: "error", cerrarAlSalir: false });
        return;
      }
      
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: tipo === "imagen" ? ['images'] : ['videos'],
        allowsEditing: false,
        quality: 0.85,
      });
      
      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        
        // VALIDACIÓN DE TAMAÑO PARA GALERÍA
        const fileSize = asset.fileSize || 0;
        if (tipo === "imagen" && fileSize > LIMITE_10MB) {
          setAlerta({ visible: true, titulo: "Archivo muy pesado", mensaje: "Las imágenes no pueden superar los 10 MB. Por favor, elegí otra.", tipo: "error", cerrarAlSalir: false });
          return;
        }
        if (tipo === "video" && fileSize > LIMITE_100MB) {
          setAlerta({ visible: true, titulo: "Video muy pesado", mensaje: "Los videos no pueden superar los 100 MB. Por favor, elegí otro más corto o comprimido.", tipo: "error", cerrarAlSalir: false });
          return;
        }

        const extension = asset.uri.split(".").pop() ?? (tipo === "video" ? "mp4" : "jpg");
        setArchivo({
          uri: asset.uri,
          nombre: `${tipo}_${Date.now()}.${extension}`,
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

        // VALIDACIÓN DE TAMAÑO PARA DOCUMENTOS/PDF
        const fileSize = asset.size || 0;
        if (fileSize > LIMITE_10MB) {
          setAlerta({ visible: true, titulo: "Documento muy pesado", mensaje: "Los documentos y PDFs no pueden superar los 10 MB. Podés intentar comprimirlo en alguna web gratuita.", tipo: "error", cerrarAlSalir: false });
          return;
        }

        setArchivo({ uri: asset.uri, nombre: asset.name });
        setHayCambios(true);
      }
    }
  };

  const visualizarArchivo = async () => {
    if (!archivo) return;
    try {
      if (Platform.OS === "android") {
        // 1. Convertimos la ruta file:// a una ruta segura content://
        const contentUri = await FileSystem.getContentUriAsync(archivo.uri);
        
        // 2. visor nativo de Android, le damos permisos de lectura
        await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
          data: contentUri,
          flags: 1,
        });
      } else {
        await Linking.openURL(archivo.uri);
      }
    } catch (error) {
      console.error("Error al abrir archivo local:", error);
      setAlerta({ 
        visible: true, 
        titulo: "Aviso", 
        mensaje: "No se pudo abrir la vista previa. Es posible que no tengas una app instalada para leer este tipo de archivo.", 
        tipo: "error", 
        cerrarAlSalir: false 
      });
    }
  };

  const handleGuardar = async () => {
    const puedeGuardar =
      rol === "admin" || (rol === "profesor" && !modoEdicion && permiteCargaProfesor);
    if (!puedeGuardar) {
      setAlerta({ visible: true, titulo: "Sin permiso", mensaje: "No tenÃ©s permiso para cargar contenido en esta secciÃ³n.", tipo: "error", cerrarAlSalir: false });
      return;
    }
    if (!titulo.trim() && tipo !== "texto") {
      setAlerta({ visible: true, titulo: "Campo requerido", mensaje: "El título no puede estar vacío.", tipo: "error", cerrarAlSalir: false });
      return;
    }
    if (tipo === "enlace" && !urlEnlace.trim()) {
      setAlerta({ visible: true, titulo: "Campo requerido", mensaje: "Por favor ingresá un enlace válido.", tipo: "error", cerrarAlSalir: false });
      return;
    }
    if (tipo !== "texto" && tipo !== "enlace" && !archivo && !modoEdicion) {
      setAlerta({ visible: true, titulo: "Sin archivo", mensaje: "Por favor seleccioná un archivo.", tipo: "error", cerrarAlSalir: false });
      return;
    }

    setSubiendo(true);
    try {
      if (modoEdicion && itemId) {
        if (tipo === "texto") {
          await actualizarItem(itemId, { titulo: titulo.trim() || "Texto", contenido: contenido.trim() });
        } else if (tipo === "enlace") {
          await actualizarItem(itemId, { titulo: titulo.trim() || "Enlace", url: urlEnlace.trim() });
        } else if (archivo) {
          const cloudRes = await uploadToCloudinary(archivo.uri, tipo, archivo.nombre);
          
          await actualizarItem(itemId, {
            titulo: titulo.trim() || archivo.nombre,
            url: cloudRes.url,
            storageRef: cloudRes.publicId,
            nombreArchivo: archivo.nombre,
          });
        } else {
          await actualizarItem(itemId, { titulo: titulo.trim() || archivoExistente?.nombre || "" });
        }
        setAlerta({ visible: true, titulo: "Actualizado", mensaje: "El elemento fue actualizado correctamente.", tipo: "exito", cerrarAlSalir: true });
      } else {
        if (tipo === "texto") {
           await crearItem({ tipo: "texto", titulo: titulo.trim() || "Texto", contenido: contenido.trim(), url: "", storageRef: "", nombreArchivo: "" });
        } else if (tipo === "enlace") {
           await crearItem({ tipo: "enlace", titulo: titulo.trim() || "Enlace", contenido: "", url: urlEnlace.trim(), storageRef: "", nombreArchivo: "" });
        } else {
          const cloudRes = await uploadToCloudinary(archivo!.uri, tipo, archivo!.nombre);
          
          await crearItem({
            tipo,
            titulo: titulo.trim() || archivo!.nombre,
            contenido: "",
            url: cloudRes.url,
            storageRef: cloudRes.publicId,
            nombreArchivo: archivo!.nombre,
          });
        }
        setAlerta({ visible: true, titulo: "Guardado", mensaje: "El elemento fue agregado correctamente.", tipo: "exito", cerrarAlSalir: true });
      }
    } catch (error) {
      console.error(error);
      setAlerta({ visible: true, titulo: "Error", mensaje: "No se pudo guardar el archivo. Intentá nuevamente.", tipo: "error", cerrarAlSalir: false });
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

  if (loadingRol || cargandoDatos || cargandoPermiso) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo="" mostrarHome />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#25B471" />
        </View>
      </View>
    );
  }

  const accesoPermitido =
    rol === "admin" || (rol === "profesor" && !modoEdicion && permiteCargaProfesor);

  if (!accesoPermitido) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo="" mostrarHome />
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={48} color="#CBD5E0" />
          <Text style={styles.sinPermisoText}>No tenés permiso para acceder a esta pantalla.</Text>
          <TouchableOpacity style={styles.volverBtn} onPress={() => router.back()}>
            <Text style={styles.volverBtnText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScreenHeader
          titulo={modoEdicion ? "Editar elemento" : "Agregar elemento"}
          onBack={handleAtras}
          mostrarHome
        />
        <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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

        {tipo === "enlace" && (
          <>
            <Text style={styles.label}>URL del Enlace *</Text>
            <TextInput
              style={styles.input}
              placeholder="https://www.youtube.com/..."
              placeholderTextColor="#9CA3AF"
              value={urlEnlace}
              onChangeText={(v) => {
                setUrlEnlace(v);
                setHayCambios(true);
              }}
              autoCapitalize="none"
              keyboardType="url"
            />
          </>
        )}

        {/* Selector de archivo para tipos que NO son texto y NO son enlace */}
        {(tipo !== "texto" && tipo !== "enlace") && (
          <>
            <Text style={styles.label}>
              Archivo{!modoEdicion && <Text style={styles.required}> *</Text>}
            </Text>

            {modoEdicion && archivoExistente && !archivo && (
              <View style={styles.archivoActualContainer}>
                <Ionicons name="document-attach-outline" size={18} color="#25B471" />
                <Text style={styles.archivoActualText} numberOfLines={1}>
                  {archivoExistente.nombre}
                </Text>
                <Text style={styles.archivoActualBadge}>Actual</Text>
              </View>
            )}

            {!archivo ? (
              // VISTA 1: AÚN NO SE SELECCIONÓ ARCHIVO
              <>
                <TouchableOpacity
                  style={styles.filePickerBtn}
                  onPress={elegirArchivo}
                  disabled={subiendo}
                >
                  <Ionicons name="cloud-upload-outline" size={22} color="#0F4A32" />
                  <Text style={styles.filePickerText} numberOfLines={1}>
                    {modoEdicion ? "Reemplazar archivo (opcional)" : "Seleccionar archivo"}
                  </Text>
                </TouchableOpacity>

                <View style={styles.infoContainer}>
                  <Ionicons name="information-circle-outline" size={16} color="#6B7280" />
                  <Text style={styles.infoText}>
                    {tipo === "video" 
                      ? "Tamaño máximo permitido: 100 MB." 
                      : "Tamaño máximo permitido: 10 MB."}
                  </Text>
                </View>
              </>
            ) : (
              // VISTA 2: ARCHIVO SELECCIONADO (CONFIRMACIÓN)
              <View style={styles.archivoSeleccionadoWrapper}>
                <View style={styles.archivoDetalleCard}>
                  <Ionicons name="checkmark-circle" size={24} color="#25B471" />
                  <Text style={styles.archivoSeleccionadoNombre} numberOfLines={1}>
                    {archivo.nombre}
                  </Text>
                </View>

                {/* Los 2 botones */}
                <View style={styles.botonesArchivoRow}>
                  <TouchableOpacity 
                    style={styles.btnVisualizar} 
                    onPress={visualizarArchivo} 
                    disabled={subiendo}
                  >
                    <Ionicons name="eye-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.btnVisualizarText}>Visualizar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.btnReemplazar} 
                    onPress={elegirArchivo} 
                    disabled={subiendo}
                  >
                    <Ionicons name="refresh-outline" size={18} color="#0F4A32" />
                    <Text style={styles.btnReemplazarText}>Reemplazar</Text>
                  </TouchableOpacity>
                </View>

                {/* Cartel de advertencia */}
                <View style={styles.advertenciaContainer}>
                  <Ionicons name="warning-outline" size={20} color="#B45309" />
                  <Text style={styles.advertenciaText}>
                    Revisá tu archivo antes de subirlo. Recordá que una vez guardado, solo el administrador podrá borrarlo.
                  </Text>
                </View>
              </View>
            )}
          </>
        )}

        {/* Botones de acción */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleAtras}
            disabled={ subiendo}
          >
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveBtn, (subiendo) && styles.saveBtnDisabled]}
            onPress={handleGuardar}
            disabled={subiendo}
          >
            {(subiendo) ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ActivityIndicator color="#FFFFFF" />
                <Text style={styles.saveBtnText}>Guardando...</Text>
              </View>
            ) : (
              <Text style={styles.saveBtnText}>
                {modoEdicion ? "Guardar Cambios" : "Confirmar"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
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
  actionButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 28,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    color: "#6B7280",
    fontSize: 16,
    fontWeight: "700",
  },
  saveBtn: {
    flex: 1,
    backgroundColor: "#25B471",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
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
  infoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  infoText: {
    fontSize: 12,
    color: "#6B7280",
  },
  archivoSeleccionadoWrapper: {
    marginTop: 8,
    gap: 12,
  },
  archivoDetalleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F0FFF4",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  archivoSeleccionadoNombre: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#11181C",
  },
  botonesArchivoRow: {
    flexDirection: "row",
    gap: 10,
  },
  btnVisualizar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#25B471",
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnVisualizarText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  btnReemplazar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#0F4A32",
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnReemplazarText: {
    color: "#0F4A32",
    fontWeight: "700",
    fontSize: 14,
  },
  advertenciaContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFBEB",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FEF3C7",
    marginTop: 2,
  },
  advertenciaText: {
    flex: 1,
    fontSize: 13,
    color: "#92400E",
    lineHeight: 18,
  },
});
