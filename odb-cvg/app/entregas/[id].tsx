// app/entregas/[id].tsx
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import * as IntentLauncher from "expo-intent-launcher";
import * as FileSystem from "expo-file-system/legacy";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator, BackHandler, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import ModalAlerta from "../../components/ui/ModalAlerta";
import ModalConfirmacion from "../../components/ui/ModalConfirmacion";
import ScreenHeader from "../../components/ui/ScreenHeader";
import { db } from "../../config/firebaseConfig";
import type { Item } from "../../hooks/useItems";
import type { EntregaAlumno } from "../../hooks/useEntregasAlumnos";
import { useEntregasAlumnos, useMiEntrega } from "../../hooks/useEntregasAlumnos";
import { useUserRole } from "../../hooks/useUserRole";

const formatearFecha = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const calcularAtraso = (fechaEntrega: any, fechaLimite?: string | null): string | null => {
  if (!fechaLimite || !fechaEntrega?.toDate) return null;
  const finDePlazo = new Date(`${fechaLimite}T23:59:59`);
  const entregado = fechaEntrega.toDate();
  const diffMs = entregado.getTime() - finDePlazo.getTime();
  if (diffMs <= 0) return null;

  const minutos = Math.floor(diffMs / 60000);
  const horas = Math.floor(minutos / 60);
  const dias = Math.floor(horas / 24);

  if (dias >= 1) return `${dias} día${dias === 1 ? "" : "s"}`;
  if (horas >= 1) return `${horas} hora${horas === 1 ? "" : "s"}`;
  if (minutos >= 1) return `${minutos} minuto${minutos === 1 ? "" : "s"}`;
  return "menos de un minuto";
};

export default function EntregaDetalleScreen() {
  const { id, moduloId, seccionId, subseccionPath } = useLocalSearchParams<{
    id: string; moduloId: string; seccionId: string; subseccionPath?: string;
  }>();
  const { rol, loading: loadingRol } = useUserRole();
  const esDocente = rol === "admin" || rol === "profesor";

  const [item, setItem] = useState<Item | null>(null);
  const [loadingItem, setLoadingItem] = useState(true);

  const { miEntrega, loading: loadingMia, enviarEntrega, actualizarEntrega } = useMiEntrega(
    moduloId, seccionId, id, subseccionPath,
  );
  const { entregas, loading: loadingEntregas, actualizarCalificacion } = useEntregasAlumnos(
    moduloId, seccionId, id, subseccionPath,
  );

  const [modoEdicionEntrega, setModoEdicionEntrega] = useState(false);
  const [tipoEnvio, setTipoEnvio] = useState<"texto" | "pdf" | "imagen" | "documento">("texto");
  const [contenido, setContenido] = useState("");
  const [archivo, setArchivo] = useState<{ uri: string; nombre: string } | null>(null);
  const [archivoExistenteEntrega, setArchivoExistenteEntrega] = useState<{ nombre: string; url: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  const [hayCambiosEntrega, setHayCambiosEntrega] = useState(false);
  const [hayCambiosDocente, setHayCambiosDocente] = useState(false);
  const [modalDescartar, setModalDescartar] = useState(false);
  const [accionDescartar, setAccionDescartar] = useState<() => void>(() => () => {});

  const [modalDocente, setModalDocente] = useState<{
    titulo: string;
    mensaje: string;
    textoConfirmar: string;
    textoCancelar: string;
    onConfirm: () => void;
  } | null>(null);

  const [alerta, setAlerta] = useState<{
    visible: boolean; titulo: string; mensaje: string; tipo: "error" | "exito";
  }>({ visible: false, titulo: "", mensaje: "", tipo: "exito" });

  useEffect(() => {
    if (!moduloId || !seccionId || !id) return;
    const rawPath = Array.isArray(subseccionPath) ? subseccionPath.join("/") : (subseccionPath ?? "");
    const pathStr = decodeURIComponent(rawPath);
    const subseccionSegments = pathStr
      .split(/[\/,]/).map((s) => s.trim()).filter(Boolean)
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
      if (!perm.granted) {
        setAlerta({ visible: true, titulo: "Permiso denegado", mensaje: "Se necesita acceso a la galería.", tipo: "error" });
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (!res.canceled && res.assets[0]) {
        const fileSize = res.assets[0].fileSize || 0;
        if (fileSize > 10 * 1024 * 1024) {
          setAlerta({ visible: true, titulo: "Archivo muy pesado", mensaje: "Las imágenes no pueden superar los 10 MB.", tipo: "error" });
          return;
        }
        const ext = res.assets[0].uri.split(".").pop() ?? "jpg";
        setArchivo({ uri: res.assets[0].uri, nombre: `imagen_${Date.now()}.${ext}` });
        setHayCambiosEntrega(true);
      }
    } else {
      const res = await DocumentPicker.getDocumentAsync({
        type: tipoEnvio === "pdf" ? "application/pdf" : "*/*",
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets[0]) {
        if ((res.assets[0].size ?? 0) > 10 * 1024 * 1024) {
          setAlerta({ visible: true, titulo: "Archivo muy pesado", mensaje: "El archivo no puede superar los 10 MB.", tipo: "error" });
          return;
        }
        setArchivo({ uri: res.assets[0].uri, nombre: res.assets[0].name });
        setHayCambiosEntrega(true);
      }
    }
  };

  const visualizarArchivoLocal = async () => {
    if (!archivo) return;
    try {
      if (Platform.OS === "android") {
        const contentUri = await FileSystem.getContentUriAsync(archivo.uri);
        await IntentLauncher.startActivityAsync("android.intent.action.VIEW", { data: contentUri, flags: 1 });
      } else {
        await Linking.openURL(archivo.uri);
      }
    } catch {
      setAlerta({
        visible: true, titulo: "Aviso",
        mensaje: "No se pudo abrir la vista previa. Es posible que no tengas una app instalada para leer este tipo de archivo.",
        tipo: "error",
      });
    }
  };

  const uploadToCloudinary = async (uri: string, tipo: string, nombre: string) => {
    let resourceType = "raw";
    let mimeType = "application/octet-stream";
    if (tipo === "imagen") { resourceType = "image"; mimeType = "image/jpeg"; }
    if (tipo === "video") { resourceType = "video"; mimeType = "video/mp4"; }
    if (tipo === "pdf") { mimeType = "application/pdf"; }
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

  const yaRevisada = miEntrega?.revisada === true;
  const puedeEditarEntrega = miEntrega?.requiereReentrega === true || !yaRevisada;

  const iniciarEdicion = () => {
    if (!miEntrega) return;
    const tiposPermitidos = ["texto", "pdf", "imagen", "documento"] as const;
    setTipoEnvio(tiposPermitidos.includes(miEntrega.tipo as any) ? (miEntrega.tipo as any) : "documento");
    setContenido(miEntrega.contenido ?? "");
    setArchivo(null);
    setArchivoExistenteEntrega(
      miEntrega.url ? { nombre: miEntrega.nombreArchivo, url: miEntrega.url } : null,
    );
    setHayCambiosEntrega(false);
    setModoEdicionEntrega(true);
  };

  const handleEnviar = async () => {
    if (tipoEnvio === "texto" && !contenido.trim()) {
      setAlerta({ visible: true, titulo: "Campo vacío", mensaje: "Escribí algo antes de entregar.", tipo: "error" });
      return;
    }
    if (tipoEnvio !== "texto" && !archivo && !archivoExistenteEntrega) {
      setAlerta({ visible: true, titulo: "Sin archivo", mensaje: "Seleccioná un archivo.", tipo: "error" });
      return;
    }
    setSubiendo(true);
    try {
      let payload: any;
      if (tipoEnvio === "texto") {
        payload = { tipo: "texto", titulo: "Texto", contenido: contenido.trim(), url: "", storageRef: "", nombreArchivo: "" };
      } else if (archivo) {
        const cloud = await uploadToCloudinary(archivo.uri, tipoEnvio, archivo.nombre);
        payload = { tipo: tipoEnvio, titulo: archivo.nombre, contenido: "", url: cloud.url, storageRef: cloud.publicId, nombreArchivo: archivo.nombre };
      } else if (archivoExistenteEntrega && miEntrega) {
        payload = { tipo: tipoEnvio, titulo: miEntrega.titulo, contenido: "", url: miEntrega.url, storageRef: miEntrega.storageRef, nombreArchivo: miEntrega.nombreArchivo };
      }

      if (modoEdicionEntrega && miEntrega) {
        await actualizarEntrega(miEntrega.id, payload);
        setModoEdicionEntrega(false);
        setHayCambiosEntrega(false);
        setAlerta({ visible: true, titulo: "Reentregado", mensaje: "Tu entrega fue actualizada correctamente.", tipo: "exito" });
      } else {
        await enviarEntrega(payload);
        setHayCambiosEntrega(false);
        setAlerta({ visible: true, titulo: "¡Entregado!", mensaje: "Tu entrega fue enviada correctamente.", tipo: "exito" });
      }
    } catch {
      setAlerta({ visible: true, titulo: "Error", mensaje: "No se pudo enviar la entrega. Intentá nuevamente.", tipo: "error" });
    } finally {
      setSubiendo(false);
    }
  };

  const handleAtras = () => {
    if (hayCambiosEntrega || hayCambiosDocente) {
      setAccionDescartar(() => () => {
        setHayCambiosEntrega(false);
        setHayCambiosDocente(false);
        router.back();
      });
      setModalDescartar(true);
    } else {
      router.back();
    }
  };

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (hayCambiosEntrega || hayCambiosDocente) {
          setAccionDescartar(() => () => {
            setHayCambiosEntrega(false);
            setHayCambiosDocente(false);
            router.back();
          });
          setModalDescartar(true);
          return true;
        }
        return false;
      };
      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => subscription.remove();
    }, [hayCambiosEntrega, hayCambiosDocente]),
  );

  if (loadingItem || loadingRol) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo="" mostrarHome />
        <View style={styles.centered}><ActivityIndicator size="large" color="#25B471" /></View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#F5F5F5" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
    >
      <ScreenHeader titulo={item?.titulo ?? "Entrega"} onBack={handleAtras} mostrarHome />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {(item?.descripcionEntrega || item?.archivoConsignaUrl || item?.fechaLimite !== undefined) ? (
          <View style={styles.consignaCard}>
            <Text style={styles.consignaTitulo}>Consigna</Text>
            {item?.descripcionEntrega ? (
              <Text style={styles.consignaTexto}>{item.descripcionEntrega}</Text>
            ) : null}

            {item?.archivoConsignaUrl ? (
              <TouchableOpacity
                style={styles.archivoConsignaBtn}
                onPress={() => WebBrowser.openBrowserAsync(item.archivoConsignaUrl!)}
              >
                <Ionicons name="document-attach-outline" size={16} color="#0F4A32" />
                <Text style={styles.archivoConsignaBtnText} numberOfLines={1}>
                  {item.archivoConsignaNombre || "Ver archivo adjunto"}
                </Text>
              </TouchableOpacity>
            ) : null}

            <Text style={styles.fechaLimite}>
              ⏰ {item?.fechaLimite ? `Fecha límite: ${formatearFecha(item.fechaLimite)}` : "Sin fecha límite de entrega"}
            </Text>
          </View>
        ) : null}

        {esDocente ? (
          <DocenteVista
            entregas={entregas}
            loading={loadingEntregas}
            fechaLimite={item?.fechaLimite}
            actualizarCalificacion={actualizarCalificacion}
            setAlerta={setAlerta}
            setHayCambiosDocente={setHayCambiosDocente}
            setModalDocente={setModalDocente}
          />
        ) : (
          <>
            {loadingMia ? (
              <ActivityIndicator color="#25B471" style={{ marginTop: 32 }} />
            ) : miEntrega && !modoEdicionEntrega ? (
              <View style={styles.yaEntregadoCard}>
                <Ionicons
                  name={miEntrega.requiereReentrega ? "alert-circle" : "checkmark-circle"}
                  size={40}
                  color={miEntrega.requiereReentrega ? "#DC2626" : "#25B471"}
                />
                <Text style={styles.yaEntregadoTitulo}>
                  {miEntrega.requiereReentrega ? "El profesor solicitó una reentrega" : "¡Ya entregaste!"}
                </Text>

                {miEntrega.tipo === "texto" ? (
                  <Text style={styles.yaEntregadoSub}>{miEntrega.contenido}</Text>
                ) : (
                  <TouchableOpacity
                    style={styles.archivoConsignaBtn}
                    onPress={() => miEntrega.url && WebBrowser.openBrowserAsync(miEntrega.url)}
                  >
                    <Ionicons name="eye-outline" size={16} color="#0F4A32" />
                    <Text style={styles.archivoConsignaBtnText} numberOfLines={1}>
                      Visualizar archivo: {miEntrega.nombreArchivo}
                    </Text>
                  </TouchableOpacity>
                )}

                {(() => {
                  const atraso = calcularAtraso(miEntrega.fechaEntrega, item?.fechaLimite);
                  return atraso ? (
                    <View style={styles.tardeBadge}>
                      <Ionicons name="time-outline" size={14} color="#B45309" />
                      <Text style={styles.tardeBadgeText}>Entregaste fuera de fecha (atraso: {atraso})</Text>
                    </View>
                  ) : null;
                })()}

                {(typeof miEntrega.nota === "number") && (
                  <View style={styles.notaBadge}>
                    <Text style={styles.notaBadgeText}>Nota: {miEntrega.nota}/100</Text>
                  </View>
                )}

                {miEntrega.retroalimentacion ? (
                  <View style={styles.retroCard}>
                    <Text style={styles.retroTitulo}>Retroalimentación del profesor</Text>
                    <Text style={styles.retroTexto}>{miEntrega.retroalimentacion}</Text>
                  </View>
                ) : null}

                {puedeEditarEntrega ? (
                  <TouchableOpacity style={styles.editarBtn} onPress={iniciarEdicion}>
                    <Ionicons name="create-outline" size={18} color="#0F4A32" />
                    <Text style={styles.editarBtnText}>
                      {miEntrega.requiereReentrega ? "Reentregar" : "Modificar entrega"}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.plazoVencidoText}>
                    Tu entrega ya fue calificada. No podés modificarla a menos que el profesor solicite una reentrega.
                  </Text>
                )}
              </View>
            ) : (
              <>
                <Text style={styles.seccionTitulo}>
                  {modoEdicionEntrega ? "Modificar tu entrega" : "Tu entrega"}
                </Text>

                <View style={styles.tipoRow}>
                  {(["texto", "pdf", "imagen", "documento"] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.tipoBtn, tipoEnvio === t && styles.tipoBtnSelected]}
                      onPress={() => { setTipoEnvio(t); setArchivo(null); setArchivoExistenteEntrega(null); setHayCambiosEntrega(true); }}
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
                    onChangeText={(v) => { setContenido(v); setHayCambiosEntrega(true); }}
                    multiline
                    textAlignVertical="top"
                  />
                ) : archivo ? (
                  <View style={styles.archivoSeleccionadoWrapper}>
                    <View style={styles.archivoDetalleCard}>
                      <Ionicons name="checkmark-circle" size={22} color="#25B471" />
                      <Text style={styles.archivoSeleccionadoNombre} numberOfLines={1}>{archivo.nombre}</Text>
                    </View>
                    <View style={styles.botonesArchivoRow}>
                      <TouchableOpacity style={styles.btnVisualizar} onPress={visualizarArchivoLocal}>
                        <Ionicons name="eye-outline" size={18} color="#FFFFFF" />
                        <Text style={styles.btnVisualizarText}>Visualizar archivo</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.btnReemplazar} onPress={elegirArchivo}>
                        <Ionicons name="refresh-outline" size={18} color="#0F4A32" />
                        <Text style={styles.btnReemplazarText}>Reemplazar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : archivoExistenteEntrega ? (
                  <View style={styles.archivoSeleccionadoWrapper}>
                    <View style={styles.archivoDetalleCard}>
                      <Ionicons name="document-attach-outline" size={22} color="#25B471" />
                      <Text style={styles.archivoSeleccionadoNombre} numberOfLines={1}>{archivoExistenteEntrega.nombre}</Text>
                      <Text style={styles.archivoActualBadge}>Actual</Text>
                    </View>
                    <View style={styles.botonesArchivoRow}>
                      <TouchableOpacity
                        style={styles.btnVisualizar}
                        onPress={() => WebBrowser.openBrowserAsync(archivoExistenteEntrega.url)}
                      >
                        <Ionicons name="eye-outline" size={18} color="#FFFFFF" />
                        <Text style={styles.btnVisualizarText}>Visualizar archivo</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.btnReemplazar} onPress={elegirArchivo}>
                        <Ionicons name="refresh-outline" size={18} color="#0F4A32" />
                        <Text style={styles.btnReemplazarText}>Reemplazar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.fileBtn} onPress={elegirArchivo}>
                    <Ionicons name="cloud-upload-outline" size={20} color="#0F4A32" />
                    <Text style={styles.fileBtnText}>Seleccionar archivo</Text>
                  </TouchableOpacity>
                )}

                <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
                  {modoEdicionEntrega && (
                    <TouchableOpacity
                      style={styles.cancelarBtn}
                      onPress={() => {
                        if (hayCambiosEntrega) {
                          setAccionDescartar(() => () => {
                            setHayCambiosEntrega(false);
                            setModoEdicionEntrega(false);
                          });
                          setModalDescartar(true);
                        } else {
                          setModoEdicionEntrega(false);
                        }
                      }}
                      disabled={subiendo}
                    >
                      <Text style={styles.cancelarBtnText}>Cancelar</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.enviarBtn, { flex: 1 }, subiendo && { opacity: 0.6 }]}
                    onPress={handleEnviar}
                    disabled={subiendo}
                  >
                    {subiendo
                      ? <ActivityIndicator color="#FFFFFF" />
                      : <Text style={styles.enviarBtnText}>{modoEdicionEntrega ? "Guardar reentrega" : "Entregar"}</Text>}
                  </TouchableOpacity>
                </View>
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

      <ModalConfirmacion
        visible={modalDescartar}
        titulo="¿Descartar cambios?"
        mensaje={esDocente ? "Tenés calificaciones sin guardar. Si salís ahora, perderás el progreso." : "Tenés cambios sin guardar en tu entrega. Si salís ahora, perderás el progreso."}
        textoConfirmar="Descartar cambios"
        textoCancelar="Seguir\neditando"
        onConfirm={() => {
          setModalDescartar(false);
          accionDescartar();
        }}
        onCancel={() => setModalDescartar(false)}
      />
      <ModalConfirmacion
        visible={modalDocente !== null}
        titulo={modalDocente?.titulo || ""}
        mensaje={modalDocente?.mensaje || ""}
        textoConfirmar={modalDocente?.textoConfirmar || "Confirmar"}
        textoCancelar={modalDocente?.textoCancelar || "Cancelar"}
        onConfirm={() => modalDocente?.onConfirm()}
        onCancel={() => setModalDocente(null)}
      />
    </KeyboardAvoidingView>
  );
}

interface DocenteVistaProps {
  entregas: EntregaAlumno[];
  loading: boolean;
  fechaLimite?: string | null;
  actualizarCalificacion: (entregaId: string, data: { nota: number | null; retroalimentacion: string; requiereReentrega: boolean }) => Promise<void>;
  setAlerta: (a: { visible: boolean; titulo: string; mensaje: string; tipo: "error" | "exito" }) => void;
  setHayCambiosDocente: (cambios: boolean) => void;
  setModalDocente: (modal: any) => void;
}

function DocenteVista({ entregas, loading, fechaLimite, actualizarCalificacion, setAlerta, setHayCambiosDocente, setModalDocente }: DocenteVistaProps) {
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [notaInput, setNotaInput] = useState("");
  const [retroInput, setRetroInput] = useState("");
  const [requiereReentregaInput, setRequiereReentregaInput] = useState(false);
  const [guardandoCal, setGuardandoCal] = useState(false);

  const entregaYaCalificada = (e: EntregaAlumno) =>
    typeof e.nota === "number" || !!e.retroalimentacion?.trim() || e.requiereReentrega === true;

  const abrirExpandido = (entrega: EntregaAlumno) => {
    setExpandidoId(entrega.id);
    setNotaInput(typeof entrega.nota === "number" ? String(entrega.nota) : "");
    setRetroInput(entrega.retroalimentacion ?? "");
    setRequiereReentregaInput(entrega.requiereReentrega === true);
  };

  const hayCambiosCalificacion = useCallback((entrega: EntregaAlumno) => {
    const notaOriginal = typeof entrega.nota === "number" ? String(entrega.nota) : "";
    const retroOriginal = entrega.retroalimentacion ?? "";
    const reentregaOriginal = entrega.requiereReentrega === true;
    return (notaInput !== notaOriginal || retroInput !== retroOriginal || requiereReentregaInput !== reentregaOriginal);
  }, [notaInput, retroInput, requiereReentregaInput]);

  useEffect(() => {
    if (expandidoId) {
      const e = entregas.find(x => x.id === expandidoId);
      setHayCambiosDocente(e ? hayCambiosCalificacion(e) : false);
    } else {
      setHayCambiosDocente(false);
    }
  }, [notaInput, retroInput, requiereReentregaInput, expandidoId, entregas, hayCambiosCalificacion, setHayCambiosDocente]);

  const toggleExpandir = (entrega: EntregaAlumno) => {
    if (expandidoId === entrega.id) {
      if (hayCambiosCalificacion(entrega)) {
        setModalDocente({
          titulo: "¿Descartar cambios?",
          mensaje: "Tenés cambios sin guardar en esta calificación. Si cerrás ahora, perderás el progreso.",
          textoConfirmar: "Descartar cambios",
          textoCancelar: "Seguir\neditando",
          onConfirm: () => {
            setModalDocente(null);
            setExpandidoId(null);
          }
        });
        return;
      }
      setExpandidoId(null);
      return;
    }

    if (expandidoId) {
      const entregaAbierta = entregas.find(e => e.id === expandidoId);
      if (entregaAbierta && hayCambiosCalificacion(entregaAbierta)) {
        setModalDocente({
          titulo: "¿Descartar cambios?",
          mensaje: "Tenés cambios sin guardar. Guardá o descartá los cambios antes de abrir otra entrega.",
          textoConfirmar: "Descartar cambios",
          textoCancelar: "Seguir\neditando",
          onConfirm: () => {
            setModalDocente(null);
            abrirExpandido(entrega);
          }
        });
        return;
      }
    }

    if (entregaYaCalificada(entrega)) {
      setModalDocente({
        titulo: "Editar entrega calificada",
        mensaje: `Estás por editar la entrega de ${entrega.alumnoNombre}. ¿Desea continuar?`,
        textoConfirmar: "Sí, continuar",
        textoCancelar: "Cancelar",
        onConfirm: () => {
          setModalDocente(null);
          abrirExpandido(entrega);
        }
      });
      return;
    }
    abrirExpandido(entrega);
  };

  const guardarCalificacionConfirmado = async (entrega: EntregaAlumno) => {
    setGuardandoCal(true);
    try {
      await actualizarCalificacion(entrega.id, {
        nota: notaInput.trim() ? Number(notaInput.trim()) : null,
        retroalimentacion: retroInput.trim(),
        requiereReentrega: requiereReentregaInput,
      });
      setAlerta({ visible: true, titulo: "Guardado", mensaje: "La calificación se guardó correctamente.", tipo: "exito" });
      setExpandidoId(null);
    } catch {
      setAlerta({ visible: true, titulo: "Error", mensaje: "No se pudo guardar la calificación. Intentá nuevamente.", tipo: "error" });
    } finally {
      setGuardandoCal(false);
    }
  };

  const handleGuardarCalificacion = (entrega: EntregaAlumno) => {
    if (notaInput.trim()) {
      if (!/^\d{1,3}$/.test(notaInput.trim())) {
        setAlerta({ visible: true, titulo: "Nota inválida", mensaje: "La nota debe ser un número entero entre 0 y 100.", tipo: "error" });
        return;
      }
      const notaNum = Number(notaInput.trim());
      if (notaNum < 0 || notaNum > 100) {
        setAlerta({ visible: true, titulo: "Nota inválida", mensaje: "La nota debe estar entre 0 y 100.", tipo: "error" });
        return;
      }
    }
    if (entregaYaCalificada(entrega)) {
      setModalDocente({
        titulo: "Confirmar cambios",
        mensaje: `Editó la entrega de ${entrega.alumnoNombre}. ¿Desea guardar los nuevos cambios?`,
        textoConfirmar: "Sí, guardar",
        textoCancelar: "Cancelar",
        onConfirm: () => {
          setModalDocente(null);
          guardarCalificacionConfirmado(entrega);
        }
      });
      return;
    }
    guardarCalificacionConfirmado(entrega);
  };

  return (
    <>
      <Text style={styles.seccionTitulo}>Entregas recibidas</Text>
      {loading ? (
        <ActivityIndicator color="#25B471" style={{ marginTop: 16 }} />
      ) : entregas.length === 0 ? (
        <Text style={styles.vacio}>Ningún alumno ha entregado todavía.</Text>
      ) : (
        entregas.map((e) => {
          const expandido = expandidoId === e.id;
          return (
            <View key={e.id} style={styles.entregaCard}>
              <TouchableOpacity style={styles.entregaHeader} onPress={() => toggleExpandir(e)} activeOpacity={0.7}>
                <View style={styles.entregaIconBg}>
                  <Ionicons name="person-outline" size={16} color="#0F4A32" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.entregaAlumno}>{e.alumnoNombre}</Text>
                  <Text style={styles.entregaFecha}>
                    {e.fechaEntrega?.toDate ? e.fechaEntrega.toDate().toLocaleDateString("es-AR") : ""}
                    {typeof e.nota === "number" ? `  ·  Nota: ${e.nota}/100` : ""}
                    {e.requiereReentrega ? "  ·  Reentrega solicitada" : ""}
                  </Text>
                  {(() => {
                    const atraso = calcularAtraso(e.fechaEntrega, fechaLimite);
                    return atraso ? (
                      <Text style={styles.entregaTardeText}>⏰ Fuera de fecha (atraso: {atraso})</Text>
                    ) : null;
                  })()}
                </View>
                <Ionicons name={expandido ? "chevron-up-outline" : "chevron-down-outline"} size={18} color="#9CA3AF" />
              </TouchableOpacity>

              {expandido && (
                <View style={styles.entregaExpandida}>
                  {e.tipo === "texto" ? (
                    <Text style={styles.entregaContenido}>{e.contenido || "(sin contenido)"}</Text>
                  ) : (
                    <TouchableOpacity
                      style={styles.archivoConsignaBtn}
                      onPress={() => {
                        if (e.url) {
                          WebBrowser.openBrowserAsync(e.url);
                        } else {
                          setAlerta({ visible: true, titulo: "Sin archivo", mensaje: "Esta entrega no tiene un archivo adjunto válido.", tipo: "error" });
                        }
                      }}
                    >
                      <Ionicons name="eye-outline" size={16} color="#0F4A32" />
                      <Text style={styles.archivoConsignaBtnText} numberOfLines={1}>
                        Visualizar archivo: {e.nombreArchivo || "archivo"}
                      </Text>
                    </TouchableOpacity>
                  )}

                  <Text style={styles.labelCal}>Nota (0-100)</Text>
                  <TextInput
                    style={styles.inputCal}
                    placeholder="Sin calificar"
                    placeholderTextColor="#9CA3AF"
                    value={notaInput}
                    onChangeText={(v) => setNotaInput(v.replace(/[^0-9]/g, "").slice(0, 3))}
                    keyboardType="number-pad"
                    maxLength={3}
                  />

                  <Text style={styles.labelCal}>Retroalimentación</Text>
                  <TextInput
                    style={[styles.inputCal, { height: 90, textAlignVertical: "top" }]}
                    placeholder="Comentarios para el alumno..."
                    placeholderTextColor="#9CA3AF"
                    value={retroInput}
                    onChangeText={setRetroInput}
                    multiline
                  />

                  <TouchableOpacity
                    style={styles.reentregaToggle}
                    onPress={() => setRequiereReentregaInput((v) => !v)}
                  >
                    <Ionicons
                      name={requiereReentregaInput ? "checkbox" : "square-outline"}
                      size={20}
                      color="#0F4A32"
                    />
                    <Text style={styles.reentregaToggleText}>Solicitar reentrega a este alumno</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.enviarBtn, guardandoCal && { opacity: 0.6 }]}
                    onPress={() => handleGuardarCalificacion(e)}
                    disabled={guardandoCal}
                  >
                    {guardandoCal
                      ? <ActivityIndicator color="#FFFFFF" />
                      : <Text style={styles.enviarBtnText}>Guardar calificación</Text>}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })
      )}      
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 120 },
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
  entregaHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  entregaIconBg: { width: 30, height: 30, borderRadius: 8, backgroundColor: "#E8F5E9", justifyContent: "center", alignItems: "center" },
  entregaAlumno: { fontSize: 14, fontWeight: "700", color: "#11181C" },
  entregaFecha: { fontSize: 12, color: "#9CA3AF" },
  entregaContenido: { fontSize: 13, color: "#374151", lineHeight: 18, marginTop: 4 },
  entregaNombreArchivo: { fontSize: 13, color: "#6B7280", marginTop: 4 },
  entregaExpandida: {
    marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#F3F4F6",
  },
  labelCal: { fontSize: 12, fontWeight: "600", color: "#374151", marginTop: 10, marginBottom: 4 },
  inputCal: {
    backgroundColor: "#F9FAFB", borderRadius: 8, borderWidth: 1, borderColor: "#E5E7EB",
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#11181C",
  },
  reentregaToggle: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  reentregaToggleText: { fontSize: 13, color: "#374151", fontWeight: "500" },
  archivoConsignaBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FFFFFF", borderRadius: 8, borderWidth: 1, borderColor: "#E5E7EB",
    paddingHorizontal: 12, paddingVertical: 10, marginTop: 10,
  },
  archivoConsignaBtnText: { fontSize: 13, color: "#0F4A32", fontWeight: "600", flex: 1 },
  yaEntregadoCard: {
    backgroundColor: "#F0FDF4", borderRadius: 12, padding: 24,
    alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#BBF7D0",
  },
  yaEntregadoTitulo: { fontSize: 18, fontWeight: "700", color: "#0F4A32", textAlign: "center" },
  yaEntregadoSub: { fontSize: 14, color: "#6B7280", textAlign: "center" },
  notaBadge: {
    backgroundColor: "#E8F5E9", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6, marginTop: 4,
  },
  notaBadgeText: { fontSize: 14, fontWeight: "700", color: "#0F4A32" },
  retroCard: {
    width: "100%", backgroundColor: "#FFFFFF", borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: "#E5E7EB", marginTop: 4,
  },
  tardeBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#FEF3C7", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6, marginTop: 4,
  },
  tardeBadgeText: { fontSize: 12, fontWeight: "600", color: "#B45309" },
  entregaTardeText: { fontSize: 11, color: "#B45309", fontWeight: "600", marginTop: 2 },
  retroTitulo: { fontSize: 12, fontWeight: "700", color: "#374151", marginBottom: 4 },
  retroTexto: { fontSize: 13, color: "#6B7280", lineHeight: 18 },
  editarBtn: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12,
    backgroundColor: "#E8F5E9", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10,
  },
  editarBtnText: { fontSize: 14, fontWeight: "700", color: "#0F4A32" },
  plazoVencidoText: { fontSize: 13, color: "#9CA3AF", textAlign: "center", marginTop: 8, fontStyle: "italic" },
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
  archivoSeleccionadoWrapper: { marginTop: 4, gap: 12 },
  archivoDetalleCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#F0FFF4", paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 10, borderWidth: 1, borderColor: "#BBF7D0",
  },
  archivoSeleccionadoNombre: { flex: 1, fontSize: 14, fontWeight: "600", color: "#11181C" },
  archivoActualBadge: {
    fontSize: 11, fontWeight: "700", color: "#25B471", backgroundColor: "#DCFCE7",
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
  },
  botonesArchivoRow: { flexDirection: "row", gap: 10 },
  btnVisualizar: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "#25B471", paddingVertical: 12, borderRadius: 10,
  },
  btnVisualizarText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  btnReemplazar: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "#FFFFFF", borderWidth: 1.5, borderColor: "#0F4A32", paddingVertical: 12, borderRadius: 10,
  },
  btnReemplazarText: { color: "#0F4A32", fontWeight: "700", fontSize: 14 },
  enviarBtn: {
    backgroundColor: "#25B471", borderRadius: 12, paddingVertical: 15,
    alignItems: "center", justifyContent: "center", marginTop: 14,
  },
  enviarBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },
  cancelarBtn: {
    flex: 1, backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1.5,
    borderColor: "#E5E7EB", paddingVertical: 15, alignItems: "center", justifyContent: "center",
  },
  cancelarBtnText: { color: "#6B7280", fontSize: 16, fontWeight: "700" },
});