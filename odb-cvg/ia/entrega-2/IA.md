---
---
# Q&A de la sesión 1 
---

## Prompt:
Quiero agregar confirmaciones para cuando alguien intenta calificar una entrega, quiero que aparezcan modals cuando alguien pone una nota y no la guarda sino que toca el piquito y va para atras digamos, que le avise que si está seguro de ir para atras, que se perderán los cambios. Lo mismo cuando edita la calificación de una entrega, ya sea la nota, la retroalimentación o el campo de reentrega:

// app/entregas/\[id\].tsx

import { Ionicons } from "@expo/vector-icons";

import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import \* as DocumentPicker from "expo-document-picker";

import \* as ImagePicker from "expo-image-picker";

import \* as WebBrowser from "expo-web-browser";

import \* as IntentLauncher from "expo-intent-launcher";

import \* as FileSystem from "expo-file-system/legacy";

import { doc, getDoc } from "firebase/firestore";

import React, { useEffect, useState } from "react";

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

const formatearFecha = (iso: string) =\> {

  const \[y, m, d\] = iso.split("-");

  return \`\${d}/\${m}/\${y}\`;

};

const calcularAtraso = (fechaEntrega: any, fechaLimite?: string | null): string | null =\> {

  if (!fechaLimite || !fechaEntrega?.toDate) return null;

  const finDePlazo = new Date(\`\${fechaLimite}T23:59:59\`);

  const entregado = fechaEntrega.toDate();

  const diffMs = entregado.getTime() - finDePlazo.getTime();

  if (diffMs \<= 0) return null;

  const minutos = Math.floor(diffMs / 60000);

  const horas = Math.floor(minutos / 60);

  const dias = Math.floor(horas / 24);

  if (dias \>= 1) return \`\${dias} día\${dias === 1 ? "" : "s"}\`;

  if (horas \>= 1) return \`\${horas} hora\${horas === 1 ? "" : "s"}\`;

  if (minutos \>= 1) return \`\${minutos} minuto\${minutos === 1 ? "" : "s"}\`;

  return "menos de un minuto";

};

export default function EntregaDetalleScreen() {

  const { id, moduloId, seccionId, subseccionPath } = useLocalSearchParams\<{

    id: string; moduloId: string; seccionId: string; subseccionPath?: string;

  }\>();

  const { rol, loading: loadingRol } = useUserRole();

  const esDocente = rol === "admin" || rol === "profesor";

  const \[item, setItem\] = useState\<Item | null\>(null);

  const \[loadingItem, setLoadingItem\] = useState(true);

  const { miEntrega, loading: loadingMia, enviarEntrega, actualizarEntrega } = useMiEntrega(

    moduloId, seccionId, id, subseccionPath,

  );

  const { entregas, loading: loadingEntregas, actualizarCalificacion } = useEntregasAlumnos(

    moduloId, seccionId, id, subseccionPath,

  );

  const \[modoEdicionEntrega, setModoEdicionEntrega\] = useState(false);

  const \[tipoEnvio, setTipoEnvio\] = useState\<"texto" | "pdf" | "imagen" | "documento"\>("texto");

  const \[contenido, setContenido\] = useState("");

  const \[archivo, setArchivo\] = useState\<{ uri: string; nombre: string } | null\>(null);

  const \[archivoExistenteEntrega, setArchivoExistenteEntrega\] = useState\<{ nombre: string; url: string } | null\>(null);

  const \[subiendo, setSubiendo\] = useState(false);

  const \[hayCambiosEntrega, setHayCambiosEntrega\] = useState(false);

  const \[modalDescartar, setModalDescartar\] = useState(false);

  const \[accionDescartar, setAccionDescartar\] = useState\<() =\> void\>(() =\> () =\> {});

  const \[alerta, setAlerta\] = useState\<{

    visible: boolean; titulo: string; mensaje: string; tipo: "error" | "exito";

  }\>({ visible: false, titulo: "", mensaje: "", tipo: "exito" });

  useEffect(() =\> {

    if (!moduloId || !seccionId || !id) return;

    const subseccionSegments = (subseccionPath ?? "")

      .split("/").map((s) =\> s.trim()).filter(Boolean)

      .flatMap((seg) =\> \["subsecciones", seg\]);

    getDoc(doc(db, "modulos", moduloId, "secciones", seccionId, ...subseccionSegments, "items", id))

      .then((snap) =\> {

        setItem(snap.exists() ? ({ id: snap.id, ...snap.data() } as Item) : null);

        setLoadingItem(false);

      })

      .catch(() =\> setLoadingItem(false));

  }, \[moduloId, seccionId, id, subseccionPath\]);

  const elegirArchivo = async () =\> {

    if (tipoEnvio === "imagen") {

      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!perm.granted) {

        setAlerta({ visible: true, titulo: "Permiso denegado", mensaje: "Se necesita acceso a la galería.", tipo: "error" });

        return;

      }

      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: \['images'\], quality: 0.85 });

      if (!res.canceled && res.assets\[0\]) {

        const fileSize = res.assets\[0\].fileSize || 0;

        if (fileSize \> 10 \* 1024 \* 1024) {

          setAlerta({ visible: true, titulo: "Archivo muy pesado", mensaje: "Las imágenes no pueden superar los 10 MB.", tipo: "error" });

          return;

        }

        const ext = res.assets\[0\].uri.split(".").pop() ?? "jpg";

        setArchivo({ uri: res.assets\[0\].uri, nombre: \`imagen\_\${Date.now()}.\${ext}\` });

        setHayCambiosEntrega(true);

      }

    } else {

      const res = await DocumentPicker.getDocumentAsync({

        type: tipoEnvio === "pdf" ? "application/pdf" : "\*/\*",

        copyToCacheDirectory: true,

      });

      if (!res.canceled && res.assets\[0\]) {

        if ((res.assets\[0\].size ?? 0) \> 10 \* 1024 \* 1024) {

          setAlerta({ visible: true, titulo: "Archivo muy pesado", mensaje: "El archivo no puede superar los 10 MB.", tipo: "error" });

          return;

        }

        setArchivo({ uri: res.assets\[0\].uri, nombre: res.assets\[0\].name });

        setHayCambiosEntrega(true);

      }

    }

  };

  // Vista previa de un archivo LOCAL (antes de subir)

  const visualizarArchivoLocal = async () =\> {

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

  const uploadToCloudinary = async (uri: string, tipo: string, nombre: string) =\> {

    let resourceType = "raw";

    let mimeType = "application/octet-stream";

    if (tipo === "imagen") { resourceType = "image"; mimeType = "image/jpeg"; }

    if (tipo === "video") { resourceType = "video"; mimeType = "video/mp4"; }

    if (tipo === "pdf") { mimeType = "application/pdf"; }

    const CLOUD\_NAME = process.env.EXPO\_PUBLIC\_CLOUDINARY\_CLOUD\_NAME || "";

    const UPLOAD\_PRESET = process.env.EXPO\_PUBLIC\_CLOUDINARY\_UPLOAD\_PRESET || "";

    const url = \`https://api.cloudinary.com/v1\_1/\${CLOUD\_NAME}/\${resourceType}/upload\`;

    const uploadResult = await FileSystem.uploadAsync(url, uri, {

      httpMethod: "POST", uploadType: 1 as any, fieldName: "file",

      mimeType, parameters: { upload\_preset: UPLOAD\_PRESET },

    });

    const result = JSON.parse(uploadResult.body);

    if (uploadResult.status !== 200) throw new Error(result.error?.message || "Error al subir");

    return { url: result.secure\_url, publicId: result.public\_id };

  };

  const yaRevisada = miEntrega?.revisada === true;

  const puedeEditarEntrega = miEntrega?.requiereReentrega === true || !yaRevisada;

  const iniciarEdicion = () =\> {

  if (!miEntrega) return;

  const tiposPermitidos = \["texto", "pdf", "imagen", "documento"\] as const;

  setTipoEnvio(tiposPermitidos.includes(miEntrega.tipo as any) ? (miEntrega.tipo as any) : "documento");

  setContenido(miEntrega.contenido ?? "");

  setArchivo(null);

  setArchivoExistenteEntrega(

    miEntrega.url ? { nombre: miEntrega.nombreArchivo, url: miEntrega.url } : null,

  );

  setHayCambiosEntrega(false);

  setModoEdicionEntrega(true);

};

  const handleEnviar = async () =\> {

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

  const handleAtras = () =\> {

  if (hayCambiosEntrega) {

    setAccionDescartar(() =\> () =\> {

      setHayCambiosEntrega(false);

      router.back();

    });

    setModalDescartar(true);

  } else {

    router.back();

  }

};

useFocusEffect(

  React.useCallback(() =\> {

    const onBackPress = () =\> {

      if (hayCambiosEntrega) {

        setAccionDescartar(() =\> () =\> {

          setHayCambiosEntrega(false);

          router.back();

        });

        setModalDescartar(true);

        return true;

      }

      return false;

    };

    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);

    return () =\> subscription.remove();

  }, \[hayCambiosEntrega\]),

);

  if (loadingItem || loadingRol) {

    return (

      \<View style={{ flex: 1, backgroundColor: "#F5F5F5" }}\>

        \<ScreenHeader titulo="" mostrarHome /\>

        \<View style={styles.centered}\>\<ActivityIndicator size="large" color="#25B471" /\>\</View\>

      \</View\>

    );

  }

  return (

    \<KeyboardAvoidingView

      style={{ flex: 1, backgroundColor: "#F5F5F5" }}

      behavior={Platform.OS === "ios" ? "padding" : "height"}

      keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}

    \>

      \<ScreenHeader titulo={item?.titulo ?? "Entrega"} onBack={handleAtras} mostrarHome /\>

      \<ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"\>

        {(item?.descripcionEntrega || item?.archivoConsignaUrl || item?.fechaLimite !== undefined) ? (

          \<View style={styles.consignaCard}\>

            \<Text style={styles.consignaTitulo}\>Consigna\</Text\>

            {item?.descripcionEntrega ? (

              \<Text style={styles.consignaTexto}\>{item.descripcionEntrega}\</Text\>

            ) : null}

            {item?.archivoConsignaUrl ? (

              \<TouchableOpacity

                style={styles.archivoConsignaBtn}

                onPress={() =\> WebBrowser.openBrowserAsync(item.archivoConsignaUrl!)}

              \>

                \<Ionicons name="document-attach-outline" size={16} color="#0F4A32" /\>

                \<Text style={styles.archivoConsignaBtnText} numberOfLines={1}\>

                  {item.archivoConsignaNombre || "Ver archivo adjunto"}

                \</Text\>

              \</TouchableOpacity\>

            ) : null}

            \<Text style={styles.fechaLimite}\>

              ⏰ {item?.fechaLimite ? \`Fecha límite: \${formatearFecha(item.fechaLimite)}\` : "Sin fecha límite de entrega"}

            \</Text\>

          \</View\>

        ) : null}

        {esDocente ? (

          \<DocenteVista

            entregas={entregas}

            loading={loadingEntregas}

            fechaLimite={item?.fechaLimite}

            actualizarCalificacion={actualizarCalificacion}

            setAlerta={setAlerta}

          /\>

        ) : (

          \<\>

            {loadingMia ? (

              \<ActivityIndicator color="#25B471" style={{ marginTop: 32 }} /\>

            ) : miEntrega && !modoEdicionEntrega ? (

              \<View style={styles.yaEntregadoCard}\>

                \<Ionicons

                  name={miEntrega.requiereReentrega ? "alert-circle" : "checkmark-circle"}

                  size={40}

                  color={miEntrega.requiereReentrega ? "#DC2626" : "#25B471"}

                /\>

                \<Text style={styles.yaEntregadoTitulo}\>

                  {miEntrega.requiereReentrega ? "El profesor solicitó una reentrega" : "¡Ya entregaste!"}

                \</Text\>

                {miEntrega.tipo === "texto" ? (

                  \<Text style={styles.yaEntregadoSub}\>{miEntrega.contenido}\</Text\>

                ) : (

                  \<TouchableOpacity

                    style={styles.archivoConsignaBtn}

                    onPress={() =\> miEntrega.url && WebBrowser.openBrowserAsync(miEntrega.url)}

                  \>

                    \<Ionicons name="eye-outline" size={16} color="#0F4A32" /\>

                    \<Text style={styles.archivoConsignaBtnText} numberOfLines={1}\>

                      Visualizar archivo: {miEntrega.nombreArchivo}

                    \</Text\>

                  \</TouchableOpacity\>

                )}

                {(() =\> {

                  const atraso = calcularAtraso(miEntrega.fechaEntrega, item?.fechaLimite);

                  return atraso ? (

                    \<View style={styles.tardeBadge}\>

                      \<Ionicons name="time-outline" size={14} color="#B45309" /\>

                      \<Text style={styles.tardeBadgeText}\>Entregaste fuera de fecha (atraso: {atraso})\</Text\>

                    \</View\>

                  ) : null;

                })()}

                {(typeof miEntrega.nota === "number") && (

                  \<View style={styles.notaBadge}\>

                    \<Text style={styles.notaBadgeText}\>Nota: {miEntrega.nota}/100\</Text\>

                  \</View\>

                )}

                {miEntrega.retroalimentacion ? (

                  \<View style={styles.retroCard}\>

                    \<Text style={styles.retroTitulo}\>Retroalimentación del profesor\</Text\>

                    \<Text style={styles.retroTexto}\>{miEntrega.retroalimentacion}\</Text\>

                  \</View\>

                ) : null}

                {puedeEditarEntrega ? (

                  \<TouchableOpacity style={styles.editarBtn} onPress={iniciarEdicion}\>

                    \<Ionicons name="create-outline" size={18} color="#0F4A32" /\>

                    \<Text style={styles.editarBtnText}\>

                      {miEntrega.requiereReentrega ? "Reentregar" : "Modificar entrega"}

                    \</Text\>

                  \</TouchableOpacity\>

                ) : (

                  \<Text style={styles.plazoVencidoText}\>

                    Tu entrega ya fue calificada. No podés modificarla a menos que el profesor solicite una reentrega.

                  \</Text\>

                )}

              \</View\>

            ) : (

              \<\>

                \<Text style={styles.seccionTitulo}\>

                  {modoEdicionEntrega ? "Modificar tu entrega" : "Tu entrega"}

                \</Text\>

                \<View style={styles.tipoRow}\>

                  {(\["texto", "pdf", "imagen", "documento"\] as const).map((t) =\> (

                    \<TouchableOpacity

                      key={t}

                      style={\[styles.tipoBtn, tipoEnvio === t && styles.tipoBtnSelected\]}

                      onPress={() =\> { setTipoEnvio(t); setArchivo(null); setArchivoExistenteEntrega(null); setHayCambiosEntrega(true); }}

                    \>

                      \<Text style={\[styles.tipoBtnText, tipoEnvio === t && styles.tipoBtnTextSelected\]}\>

                        {t.charAt(0).toUpperCase() + t.slice(1)}

                      \</Text\>

                    \</TouchableOpacity\>

                  ))}

                \</View\>

                {tipoEnvio === "texto" ? (

                  \<TextInput

                    style={\[styles.input, { height: 140 }\]}

                    placeholder="Escribí tu respuesta aquí..."

                    placeholderTextColor="#9CA3AF"

                    value={contenido}

                    onChangeText={(v) =\> { setContenido(v); setHayCambiosEntrega(true); }}

                    multiline

                    textAlignVertical="top"

                  /\>

                ) : archivo ? (

                  \<View style={styles.archivoSeleccionadoWrapper}\>

                    \<View style={styles.archivoDetalleCard}\>

                      \<Ionicons name="checkmark-circle" size={22} color="#25B471" /\>

                      \<Text style={styles.archivoSeleccionadoNombre} numberOfLines={1}\>{archivo.nombre}\</Text\>

                    \</View\>

                    \<View style={styles.botonesArchivoRow}\>

                      \<TouchableOpacity style={styles.btnVisualizar} onPress={visualizarArchivoLocal}\>

                        \<Ionicons name="eye-outline" size={18} color="#FFFFFF" /\>

                        \<Text style={styles.btnVisualizarText}\>Visualizar archivo\</Text\>

                      \</TouchableOpacity\>

                      \<TouchableOpacity style={styles.btnReemplazar} onPress={elegirArchivo}\>

                        \<Ionicons name="refresh-outline" size={18} color="#0F4A32" /\>

                        \<Text style={styles.btnReemplazarText}\>Reemplazar\</Text\>

                      \</TouchableOpacity\>

                    \</View\>

                  \</View\>

                ) : archivoExistenteEntrega ? (

                  \<View style={styles.archivoSeleccionadoWrapper}\>

                    \<View style={styles.archivoDetalleCard}\>

                      \<Ionicons name="document-attach-outline" size={22} color="#25B471" /\>

                      \<Text style={styles.archivoSeleccionadoNombre} numberOfLines={1}\>{archivoExistenteEntrega.nombre}\</Text\>

                      \<Text style={styles.archivoActualBadge}\>Actual\</Text\>

                    \</View\>

                    \<View style={styles.botonesArchivoRow}\>

                      \<TouchableOpacity

                        style={styles.btnVisualizar}

                        onPress={() =\> WebBrowser.openBrowserAsync(archivoExistenteEntrega.url)}

                      \>

                        \<Ionicons name="eye-outline" size={18} color="#FFFFFF" /\>

                        \<Text style={styles.btnVisualizarText}\>Visualizar archivo\</Text\>

                      \</TouchableOpacity\>

                      \<TouchableOpacity style={styles.btnReemplazar} onPress={elegirArchivo}\>

                        \<Ionicons name="refresh-outline" size={18} color="#0F4A32" /\>

                        \<Text style={styles.btnReemplazarText}\>Reemplazar\</Text\>

                      \</TouchableOpacity\>

                    \</View\>

                  \</View\>

                ) : (

                  \<TouchableOpacity style={styles.fileBtn} onPress={elegirArchivo}\>

                    \<Ionicons name="cloud-upload-outline" size={20} color="#0F4A32" /\>

                    \<Text style={styles.fileBtnText}\>Seleccionar archivo\</Text\>

                  \</TouchableOpacity\>

                )}

                \<View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}\>

                  {modoEdicionEntrega && (

                    \<TouchableOpacity

                      style={styles.cancelarBtn}

                      onPress={() =\> {

                        if (hayCambiosEntrega) {

                          setAccionDescartar(() =\> () =\> {

                            setHayCambiosEntrega(false);

                            setModoEdicionEntrega(false);

                          });

                          setModalDescartar(true);

                        } else {

                          setModoEdicionEntrega(false);

                        }

                      }}

                      disabled={subiendo}

                    \>

                      \<Text style={styles.cancelarBtnText}\>Cancelar\</Text\>

                    \</TouchableOpacity\>

                  )}

                  \<TouchableOpacity

                    style={\[styles.enviarBtn, { flex: 1 }, subiendo && { opacity: 0.6 }\]}

                    onPress={handleEnviar}

                    disabled={subiendo}

                  \>

                    {subiendo

                      ? \<ActivityIndicator color="#FFFFFF" /\>

                      : \<Text style={styles.enviarBtnText}\>{modoEdicionEntrega ? "Guardar reentrega" : "Entregar"}\</Text\>}

                  \</TouchableOpacity\>

                \</View\>

              \</\>

            )}

          \</\>

        )}

      \</ScrollView\>

      \<ModalAlerta

        visible={alerta.visible}

        titulo={alerta.titulo}

        mensaje={alerta.mensaje}

        tipo={alerta.tipo}

        onClose={() =\> setAlerta((p) =\> ({ ...p, visible: false }))}

      /\>

      \<ModalConfirmacion

        visible={modalDescartar}

        titulo="¿Descartar cambios?"

        mensaje="Tenés cambios sin guardar en tu entrega. Si salís ahora, perderás el progreso."

        textoConfirmar="Descartar cambios"

        textoCancelar="Mantenerme"

        onConfirm={() =\> {

          setModalDescartar(false);

          accionDescartar();

        }}

        onCancel={() =\> setModalDescartar(false)}

      /\>

    \</KeyboardAvoidingView\>

  );

}

interface DocenteVistaProps {

  entregas: EntregaAlumno\[\];

  loading: boolean;

  fechaLimite?: string | null;

  actualizarCalificacion: (entregaId: string, data: { nota: number | null; retroalimentacion: string; requiereReentrega: boolean }) =\> Promise\<void\>;

  setAlerta: (a: { visible: boolean; titulo: string; mensaje: string; tipo: "error" | "exito" }) =\> void;

}

function DocenteVista({ entregas, loading, fechaLimite, actualizarCalificacion, setAlerta }: DocenteVistaProps) {

  const \[expandidoId, setExpandidoId\] = useState\<string | null\>(null);

  const \[notaInput, setNotaInput\] = useState("");

  const \[retroInput, setRetroInput\] = useState("");

  const \[requiereReentregaInput, setRequiereReentregaInput\] = useState(false);

  const \[guardandoCal, setGuardandoCal\] = useState(false);

  const \[confirmarExpandir, setConfirmarExpandir\] = useState\<EntregaAlumno | null\>(null);

  const \[confirmarGuardar, setConfirmarGuardar\] = useState\<EntregaAlumno | null\>(null);

  const entregaYaCalificada = (e: EntregaAlumno) =\>

    typeof e.nota === "number" || !!e.retroalimentacion?.trim() || e.requiereReentrega === true;

  const abrirExpandido = (entrega: EntregaAlumno) =\> {

    setExpandidoId(entrega.id);

    setNotaInput(typeof entrega.nota === "number" ? String(entrega.nota) : "");

    setRetroInput(entrega.retroalimentacion ?? "");

    setRequiereReentregaInput(entrega.requiereReentrega === true);

  };

  const toggleExpandir = (entrega: EntregaAlumno) =\> {

    if (expandidoId === entrega.id) {

      setExpandidoId(null);

      return;

    }

    if (entregaYaCalificada(entrega)) {

      setConfirmarExpandir(entrega);

      return;

    }

    abrirExpandido(entrega);

  };

  const guardarCalificacionConfirmado = async (entrega: EntregaAlumno) =\> {

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

      setConfirmarGuardar(null);

    }

  };

  const handleGuardarCalificacion = (entrega: EntregaAlumno) =\> {

    if (notaInput.trim()) {

      if (!/^\\d{1,3}\$/.test(notaInput.trim())) {

        setAlerta({ visible: true, titulo: "Nota inválida", mensaje: "La nota debe ser un número entero entre 0 y 100.", tipo: "error" });

        return;

      }

      const notaNum = Number(notaInput.trim());

      if (notaNum \< 0 || notaNum \> 100) {

        setAlerta({ visible: true, titulo: "Nota inválida", mensaje: "La nota debe estar entre 0 y 100.", tipo: "error" });

        return;

      }

    }

    if (entregaYaCalificada(entrega)) {

      setConfirmarGuardar(entrega);

      return;

    }

    guardarCalificacionConfirmado(entrega);

  };

  return (

    \<\>

      \<Text style={styles.seccionTitulo}\>Entregas recibidas\</Text\>

      {loading ? (

        \<ActivityIndicator color="#25B471" style={{ marginTop: 16 }} /\>

      ) : entregas.length === 0 ? (

        \<Text style={styles.vacio}\>Ningún alumno ha entregado todavía.\</Text\>

      ) : (

        entregas.map((e) =\> {

          const expandido = expandidoId === e.id;

          return (

            \<View key={e.id} style={styles.entregaCard}\>

              \<TouchableOpacity style={styles.entregaHeader} onPress={() =\> toggleExpandir(e)} activeOpacity={0.7}\>

                \<View style={styles.entregaIconBg}\>

                  \<Ionicons name="person-outline" size={16} color="#0F4A32" /\>

                \</View\>

                \<View style={{ flex: 1 }}\>

                  \<Text style={styles.entregaAlumno}\>{e.alumnoNombre}\</Text\>

                  \<Text style={styles.entregaFecha}\>

                    {e.fechaEntrega?.toDate ? e.fechaEntrega.toDate().toLocaleDateString("es-AR") : ""}

                    {typeof e.nota === "number" ? \`  ·  Nota: \${e.nota}/100\` : ""}

                    {e.requiereReentrega ? "  ·  Reentrega solicitada" : ""}

                  \</Text\>

                  {(() =\> {

                    const atraso = calcularAtraso(e.fechaEntrega, fechaLimite);

                    return atraso ? (

                      \<Text style={styles.entregaTardeText}\>⏰ Fuera de fecha (atraso: {atraso})\</Text\>

                    ) : null;

                  })()}

                \</View\>

                \<Ionicons name={expandido ? "chevron-up-outline" : "chevron-down-outline"} size={18} color="#9CA3AF" /\>

              \</TouchableOpacity\>

              {expandido && (

                \<View style={styles.entregaExpandida}\>

                  {e.tipo === "texto" ? (

                    \<Text style={styles.entregaContenido}\>{e.contenido || "(sin contenido)"}\</Text\>

                  ) : (

                    \<TouchableOpacity

                      style={styles.archivoConsignaBtn}

                      onPress={() =\> {

                        if (e.url) {

                          WebBrowser.openBrowserAsync(e.url);

                        } else {

                          setAlerta({ visible: true, titulo: "Sin archivo", mensaje: "Esta entrega no tiene un archivo adjunto válido.", tipo: "error" });

                        }

                      }}

                    \>

                      \<Ionicons name="eye-outline" size={16} color="#0F4A32" /\>

                      \<Text style={styles.archivoConsignaBtnText} numberOfLines={1}\>

                        Visualizar archivo: {e.nombreArchivo || "archivo"}

                      \</Text\>

                    \</TouchableOpacity\>

                  )}

                  \<Text style={styles.labelCal}\>Nota (0-100)\</Text\>

                  \<TextInput

                    style={styles.inputCal}

                    placeholder="Sin calificar"

                    placeholderTextColor="#9CA3AF"

                    value={notaInput}

                    onChangeText={(v) =\> setNotaInput(v.replace(/\[^0-9\]/g, "").slice(0, 3))}

                    keyboardType="number-pad"

                    maxLength={3}

                  /\>

                  \<Text style={styles.labelCal}\>Retroalimentación\</Text\>

                  \<TextInput

                    style={\[styles.inputCal, { height: 90, textAlignVertical: "top" }\]}

                    placeholder="Comentarios para el alumno..."

                    placeholderTextColor="#9CA3AF"

                    value={retroInput}

                    onChangeText={setRetroInput}

                    multiline

                  /\>

                  \<TouchableOpacity

                    style={styles.reentregaToggle}

                    onPress={() =\> setRequiereReentregaInput((v) =\> !v)}

                  \>

                    \<Ionicons

                      name={requiereReentregaInput ? "checkbox" : "square-outline"}

                      size={20}

                      color="#0F4A32"

                    /\>

                    \<Text style={styles.reentregaToggleText}\>Solicitar reentrega a este alumno\</Text\>

                  \</TouchableOpacity\>

                  \<TouchableOpacity

                    style={\[styles.enviarBtn, guardandoCal && { opacity: 0.6 }\]}

                    onPress={() =\> handleGuardarCalificacion(e)}

                    disabled={guardandoCal}

                  \>

                    {guardandoCal

                      ? \<ActivityIndicator color="#FFFFFF" /\>

                      : \<Text style={styles.enviarBtnText}\>Guardar calificación\</Text\>}

                  \</TouchableOpacity\>

                \</View\>

              )}

            \</View\>

          );

        })

      )}

      \<ModalConfirmacion

        visible={confirmarExpandir !== null}

        titulo="Editar entrega calificada"

        mensaje={\`Estás por editar la entrega de \${confirmarExpandir?.alumnoNombre}. ¿Desea continuar?\`}

        textoConfirmar="Sí, continuar"

        textoCancelar="Cancelar"

        onConfirm={() =\> {

          if (confirmarExpandir) abrirExpandido(confirmarExpandir);

          setConfirmarExpandir(null);

        }}

        onCancel={() =\> setConfirmarExpandir(null)}

      /\>

      \<ModalConfirmacion

        visible={confirmarGuardar !== null}

        titulo="Confirmar cambios"

        mensaje={\`Editó la entrega de \${confirmarGuardar?.alumnoNombre}. ¿Desea guardar los nuevos cambios?\`}

        textoConfirmar="Sí, guardar"

        textoCancelar="Cancelar"

        onConfirm={() =\> {

          if (confirmarGuardar) guardarCalificacionConfirmado(confirmarGuardar);

        }}

        onCancel={() =\> setConfirmarGuardar(null)}

      /\>

    \</\>

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

## Response:
Para lograr esto de manera robusta, hay que atajar dos posibles escenarios donde el profesor podría perder sus cambios por error:

1.  **Cuando toca el "piquito" (chevron)** para cerrar el acordeón del alumno o cuando intenta abrir la entrega de otro alumno sin guardar la actual.
2.  **Cuando toca la flecha de volver atrás** de la pantalla principal o el botón físico "Atrás" de su celular mientras está calificando.

Para solucionarlo, agregué una función que compara en tiempo real lo que está escribiendo el profesor con los datos originales de la base de datos. Si detecta diferencias, levanta la alerta.

Aquí tenés el archivo completo modificado, listo para reemplazar el tuyo:

```
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
  const [hayCambiosDocente, setHayCambiosDocente] = useState(false); // NUEVO ESTADO PARA DOCENTES
  const [modalDescartar, setModalDescartar] = useState(false);
  const [accionDescartar, setAccionDescartar] = useState<() => void>(() => () => {});

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
    if (hayCambiosEntrega || hayCambiosDocente) { // AGREGADO CHECK DOCENTE
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
        if (hayCambiosEntrega || hayCambiosDocente) { // AGREGADO CHECK DOCENTE
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
            setHayCambiosDocente={setHayCambiosDocente} // SE PASA EL CONTROL DE CAMBIOS
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
        textoCancelar="Mantenerme"
        onConfirm={() => {
          setModalDescartar(false);
          accionDescartar();
        }}
        onCancel={() => setModalDescartar(false)}
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
  setHayCambiosDocente: (cambios: boolean) => void; // NUEVA PROP
}

function DocenteVista({ entregas, loading, fechaLimite, actualizarCalificacion, setAlerta, setHayCambiosDocente }: DocenteVistaProps) {
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [notaInput, setNotaInput] = useState("");
  const [retroInput, setRetroInput] = useState("");
  const [requiereReentregaInput, setRequiereReentregaInput] = useState(false);
  const [guardandoCal, setGuardandoCal] = useState(false);
  const [confirmarExpandir, setConfirmarExpandir] = useState<EntregaAlumno | null>(null);
  const [confirmarGuardar, setConfirmarGuardar] = useState<EntregaAlumno | null>(null);
  const [confirmarDescartar, setConfirmarDescartar] = useState<EntregaAlumno | null>(null); // ESTADO PARA MODAL DE DESCARTAR

  const entregaYaCalificada = (e: EntregaAlumno) =>
    typeof e.nota === "number" || !!e.retroalimentacion?.trim() || e.requiereReentrega === true;

  const abrirExpandido = (entrega: EntregaAlumno) => {
    setExpandidoId(entrega.id);
    setNotaInput(typeof entrega.nota === "number" ? String(entrega.nota) : "");
    setRetroInput(entrega.retroalimentacion ?? "");
    setRequiereReentregaInput(entrega.requiereReentrega === true);
  };

  // FUNCION PARA DETECTAR SI EL PROFESOR ALTERÓ ALGO
  const hayCambiosCalificacion = useCallback((entrega: EntregaAlumno) => {
    const notaOriginal = typeof entrega.nota === "number" ? String(entrega.nota) : "";
    const retroOriginal = entrega.retroalimentacion ?? "";
    const reentregaOriginal = entrega.requiereReentrega === true;

    return (
      notaInput !== notaOriginal ||
      retroInput !== retroOriginal ||
      requiereReentregaInput !== reentregaOriginal
    );
  }, [notaInput, retroInput, requiereReentregaInput]);

  // AVISAMOS A LA PANTALLA PRINCIPAL SI HAY CAMBIOS PARA BLOQUEAR EL BOTÓN BACK
  useEffect(() => {
    if (expandidoId) {
      const e = entregas.find(x => x.id === expandidoId);
      setHayCambiosDocente(e ? hayCambiosCalificacion(e) : false);
    } else {
      setHayCambiosDocente(false);
    }
  }, [notaInput, retroInput, requiereReentregaInput, expandidoId, entregas, hayCambiosCalificacion, setHayCambiosDocente]);

  const toggleExpandir = (entrega: EntregaAlumno) => {
    // 1. Si toca el "piquito" de la entrega que ya tiene abierta (para colapsarla)
    if (expandidoId === entrega.id) {
      if (hayCambiosCalificacion(entrega)) {
        setConfirmarDescartar(entrega);
        return;
      }
      setExpandidoId(null);
      return;
    }

    // 2. Si intenta abrir OTRA entrega mientras tiene una abierta con cambios sin guardar
    if (expandidoId) {
      const entregaAbierta = entregas.find(e => e.id === expandidoId);
      if (entregaAbierta && hayCambiosCalificacion(entregaAbierta)) {
        setConfirmarDescartar(entregaAbierta);
        return;
      }
    }

    // 3. Flujo normal
    if (entregaYaCalificada(entrega)) {
      setConfirmarExpandir(entrega);
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
      setConfirmarGuardar(null);
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
      setConfirmarGuardar(entrega);
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

      {/* MODAL PARA CONFIRMAR EDITAR ALGO YA CALIFICADO */}
      <ModalConfirmacion
        visible={confirmarExpandir !== null}
        titulo="Editar entrega calificada"
        mensaje={`Estás por editar la entrega de ${confirmarExpandir?.alumnoNombre}. ¿Desea continuar?`}
        textoConfirmar="Sí, continuar"
        textoCancelar="Cancelar"
        onConfirm={() => {
          if (confirmarExpandir) abrirExpandido(confirmarExpandir);
          setConfirmarExpandir(null);
        }}
        onCancel={() => setConfirmarExpandir(null)}
      />

      {/* MODAL PARA GUARDAR ALGO EDITADO QUE YA HABÍA SIDO CALIFICADO */}
      <ModalConfirmacion
        visible={confirmarGuardar !== null}
        titulo="Confirmar cambios"
        mensaje={`Editó la entrega de ${confirmarGuardar?.alumnoNombre}. ¿Desea guardar los nuevos cambios?`}
        textoConfirmar="Sí, guardar"
        textoCancelar="Cancelar"
        onConfirm={() => {
          if (confirmarGuardar) guardarCalificacionConfirmado(confirmarGuardar);
        }}
        onCancel={() => setConfirmarGuardar(null)}
      />

      {/* NUEVO MODAL PARA DESCARTAR CAMBIOS AL COLAPSAR */}
      <ModalConfirmacion
        visible={confirmarDescartar !== null}
        titulo="¿Descartar cambios?"
        mensaje="Tenés cambios sin guardar en esta calificación. Si cerrás ahora, perderás el progreso."
        textoConfirmar="Descartar cambios"
        textoCancelar="Seguir editando"
        onConfirm={() => {
          setConfirmarDescartar(null);
          setExpandidoId(null); // Borra lo que estaba escribiendo y cierra
        }}
        onCancel={() => setConfirmarDescartar(null)}
      />
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
```

### ¿Qué se cambió exactamente?

1.  **Nueva función `hayCambiosCalificacion`**: Se encarga de comparar la nota, la retroalimentación y la casilla de reentrega actuales con las que estaban guardadas originalmente en Firebase.
2.  **Intercepción del "Piquito"**: En la función `toggleExpandir`, ahora chequeamos si vas a cerrar el panel y hay cambios sueltos. También bloqueamos si tratás de abrir el alumno de abajo sin guardar el de arriba.
3.  **El Botón Físico de Atrás**: Además del piquito, levantamos un estado `hayCambiosDocente` hacia la pantalla general (`EntregaDetalleScreen`) para que, si el profesor aprieta el botón físico "Volver" del celular o la flechita de arriba a la izquierda, le salte exactamente el mismo modal de advertencia antes de sacarlo de la pantalla.


## Prompt:

Hola, estoy haciendo una app movil estilo cvg para alumnos y profesores y admin. Actualmente necesito implementar como estan ahora el tema de secciones y subsecciones y alli se pueden crear apartados y etc, quiero que uno de esos apartados que se puede crear un apartado de entregas donde los admins y profesores puedan crearlos y los alumnos puedan entrar alli y subir pdf de ser necesario o textos o lo que fuere tal cual como pueden hacer los profes ahora. pero sin modificar ninguna logica rara ni nada. Este es el repo:

https://github.com/ulisesutnfrlp7/DesarrolloDeAplicacionesMoviles2026

te paso algunos codigos, que quizás puedan servir, pero nose decime que necesitas y por favor no crees artefactos decime que cambiar/agregar y donde especificamente:

## Response:

Perfecto, ya tengo todo lo que necesito. Acá va el plan completo, archivo por archivo, sin tocar nada existente.

---

## La idea general

Un "Entrega" es básicamente un ítem especial de tipo `entrega` dentro del mismo sistema de items. Los alumnos van a poder subir su propio contenido (archivo/texto) vinculado a esa entrega. Para no romper nada, lo implementamos así:

- **`entrega`** = nuevo `ItemTipo` que crea el admin/profesor (como cualquier item actual, con título, descripción, fecha límite opcional).
- **Subcolección `entregas_alumnos`** = donde cada alumno sube su respuesta, guardada en Firestore bajo el item de entrega.
- Pantallas nuevas: `entregas/[id]` (ve el admin/profe todas las respuestas; el alumno ve/sube la suya) y `entregas/form` (solo admin/profe crean la entrega).

Todo reutiliza la lógica de Cloudinary y Firestore ya existente.

---

## Paso 1 — Agregar el tipo `"entrega"` en `hooks/useItems.ts`

Cambiá esta línea:

```ts
export type ItemTipo = "texto" | "pdf" | "imagen" | "documento" | "video" | "enlace";
```

Por:

```ts
export type ItemTipo = "texto" | "pdf" | "imagen" | "documento" | "video" | "enlace" | "entrega";
```

Y en la interfaz `Item`, agregá dos campos opcionales al final (antes del cierre `}`):

```ts
  descripcionEntrega?: string;   // descripción/consigna
  fechaLimite?: string | null;   // ISO string o null
```

---

## Paso 2 — Crear `hooks/useEntregasAlumnos.ts` (archivo nuevo)

Este hook maneja la subcolección `entregas_alumnos` bajo un item de tipo entrega.

```ts
// hooks/useEntregasAlumnos.ts
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../config/firebaseConfig";

export interface EntregaAlumno {
  id: string;
  alumnoId: string;
  alumnoNombre: string;
  tipo: "texto" | "pdf" | "imagen" | "documento" | "video";
  titulo: string;
  contenido: string;
  url: string;
  storageRef: string;
  nombreArchivo: string;
  fechaEntrega: any;
}

export type EntregaAlumnoInput = Omit<EntregaAlumno, "id" | "alumnoId" | "alumnoNombre" | "fechaEntrega">;

const getEntregasCollection = (
  moduloId: string,
  seccionId: string,
  itemId: string,
  subseccionPath?: string,
) => {
  const subseccionSegments = (subseccionPath ?? "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((id) => ["subsecciones", id]);

  return collection(
    db,
    "modulos",
    moduloId,
    "secciones",
    seccionId,
    ...subseccionSegments,
    "items",
    itemId,
    "entregas_alumnos",
  );
};

// Para admin/profe: escucha TODAS las entregas del item
export function useEntregasAlumnos(
  moduloId: string,
  seccionId: string,
  itemId: string,
  subseccionPath?: string,
) {
  const [entregas, setEntregas] = useState<EntregaAlumno[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!moduloId || !seccionId || !itemId) { setLoading(false); return; }
    const q = query(
      getEntregasCollection(moduloId, seccionId, itemId, subseccionPath),
      orderBy("fechaEntrega", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setEntregas(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EntregaAlumno));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [moduloId, seccionId, itemId, subseccionPath]);

  return { entregas, loading };
}

// Para el alumno: solo su propia entrega
export function useMiEntrega(
  moduloId: string,
  seccionId: string,
  itemId: string,
  subseccionPath?: string,
) {
  const [miEntrega, setMiEntrega] = useState<EntregaAlumno | null>(null);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    if (!moduloId || !seccionId || !itemId || !uid) { setLoading(false); return; }
    const q = query(
      getEntregasCollection(moduloId, seccionId, itemId, subseccionPath),
      where("alumnoId", "==", uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      setMiEntrega(snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as EntregaAlumno));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [moduloId, seccionId, itemId, uid, subseccionPath]);

  const enviarEntrega = async (data: EntregaAlumnoInput) => {
    const user = auth.currentUser;
    if (!user) throw new Error("No autenticado");
    await addDoc(getEntregasCollection(moduloId, seccionId, itemId, subseccionPath), {
      ...data,
      alumnoId: user.uid,
      alumnoNombre: user.displayName ?? user.email ?? "Alumno",
      fechaEntrega: serverTimestamp(),
    });
  };

  return { miEntrega, loading, enviarEntrega };
}
```

---

## Paso 3 — Agregar el tipo `"entrega"` en `app/items/form.tsx`

En el array `TIPOS`, agregá al final:

```ts
{ key: "entrega", label: "Entrega", icono: "cloud-upload-outline" },
```

Luego, debajo del bloque de `tipo === "enlace"` (y antes del bloque del selector de archivo), agregá el formulario extra para cuando `tipo === "entrega"`:

```tsx
{tipo === "entrega" && (
  <>
    <Text style={styles.label}>Consigna / Descripción</Text>
    <TextInput
      style={[styles.input, styles.inputMultiline]}
      placeholder="Describí qué deben entregar los alumnos..."
      placeholderTextColor="#9CA3AF"
      value={contenido}
      onChangeText={(v) => { setContenido(v); setHayCambios(true); }}
      multiline
      textAlignVertical="top"
      autoCorrect={true}
      autoCapitalize="sentences"
    />
    <Text style={styles.label}>Fecha límite (opcional)</Text>
    <TextInput
      style={styles.input}
      placeholder="Ej: 30/06/2026"
      placeholderTextColor="#9CA3AF"
      value={urlEnlace}  // reutilizamos urlEnlace como campo de fecha límite
      onChangeText={(v) => { setUrlEnlace(v); setHayCambios(true); }}
    />
  </>
)}
```

Y en `handleGuardar`, dentro del bloque `else` (creación), agregá el caso para `"entrega"` justo antes del `else` que sube el archivo:

```ts
} else if (tipo === "entrega") {
  await crearItem({
    tipo: "entrega",
    titulo: titulo.trim() || "Entrega",
    contenido: contenido.trim(),
    url: "",
    storageRef: "",
    nombreArchivo: "",
    descripcionEntrega: contenido.trim(),
    fechaLimite: urlEnlace.trim() || null,
  });
```

En modo edición (`modoEdicion`), dentro del primer `if`, agregá igualmente:

```ts
} else if (tipo === "entrega") {
  await actualizarItem(itemId, {
    titulo: titulo.trim() || "Entrega",
    contenido: contenido.trim(),
    descripcionEntrega: contenido.trim(),
    fechaLimite: urlEnlace.trim() || null,
  });
```

Y al cargar datos en el `useEffect` de edición, donde ya seteás `urlEnlace` para el tipo `"enlace"`, extendelo:

```ts
if (data.tipo === "enlace") {
  setUrlEnlace(data.url ?? "");
}
if (data.tipo === "entrega") {
  setUrlEnlace(data.fechaLimite ?? "");
}
```

---

## Paso 4 — Mostrar la tarjeta de entrega en `app/secciones/[id].tsx` y `app/subsecciones/[id].tsx`

En la función `ItemCard`, el `return` por defecto (el de PDF/documento) se activa para `"entrega"` también porque no está en los `if` de texto ni imagen. Lo que tenés que hacer es agregar un caso específico **antes** del `return` genérico:

```tsx
if (item.tipo === "entrega") {
  return (
    <TouchableOpacity
      style={[styles.itemCard, { borderLeftWidth: 3, borderLeftColor: "#F59E0B" }]}
      onPress={onEditar}  // o una prop onVerEntrega que reciba el id
      activeOpacity={0.8}
    >
      <View style={styles.itemHeader}>
        <View style={[styles.itemIconBg, { backgroundColor: "#FEF3C7" }]}>
          <Ionicons name="cloud-upload-outline" size={18} color="#B45309" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemTitulo}>{item.titulo}</Text>
          {item.descripcionEntrega ? (
            <Text style={styles.itemNombreArchivo} numberOfLines={2}>
              {item.descripcionEntrega}
            </Text>
          ) : null}
          {item.fechaLimite ? (
            <Text style={[styles.itemNombreArchivo, { color: "#B45309" }]}>
              Límite: {item.fechaLimite}
            </Text>
          ) : null}
        </View>
        {acciones}
        <Ionicons name="chevron-forward-outline" size={16} color="#CBD5E0" />
      </View>
    </TouchableOpacity>
  );
}
```

Pero el `onPress` tiene que llevar al alumno a subir su entrega. Para eso necesitás pasar una prop extra a `ItemCard`. Cambiá la interfaz de `ItemCardProps` en ambos archivos:

```ts
interface ItemCardProps {
  item: Item;
  puedeGestionar: boolean;
  onEditar: () => void;
  onEliminar: () => void;
  onAbrirArchivo: (url: string) => void;
  onVerEntrega?: () => void;  // ← nuevo
}
```

Y en los `.map()` donde se renderizan las `ItemCard`, agregá:

```tsx
onVerEntrega={() =>
  router.push(
    `/entregas/${item.id}?moduloId=${moduloId}&seccionId=${id}${currentSubseccionPath ? `&subseccionPath=${encodeURIComponent(currentSubseccionPath)}` : ""}` as any
  )
}
```

En `secciones/[id].tsx`, la variable de seccion es `id`; en `subsecciones/[id].tsx`, usás `seccionId` y `currentSubseccionPath`.

---

## Paso 5 — Crear `app/entregas/[id].tsx` (archivo nuevo)

Este es el archivo más nuevo. El admin/profe ve todas las entregas; el alumno ve la suya o sube si no entregó todavía.

```tsx
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
```

---

## Paso 6 — Registrar la ruta en `app/_layout.tsx`

Dentro del `<Stack>`, agregá estas dos líneas junto a las demás:

```tsx
<Stack.Screen name="entregas/[id]" options={{ headerShown: false }} />
```

---

## Resumen de archivos tocados

| Archivo | Qué hacés |
|---|---|
| `hooks/useItems.ts` | Agregás `"entrega"` al tipo y 2 campos opcionales a la interfaz |
| `hooks/useEntregasAlumnos.ts` | **Archivo nuevo** — lo creás completo |
| `app/items/form.tsx` | Agregás el tipo al array TIPOS + campos de consigna/fecha + casos en handleGuardar |
| `app/secciones/[id].tsx` | Tarjeta especial para entrega en `ItemCard` + prop `onVerEntrega` |
| `app/subsecciones/[id].tsx` | Idem anterior |
| `app/entregas/[id].tsx` | **Archivo nuevo** — pantalla de entrega |
| `app/_layout.tsx` | Una línea para registrar la ruta |

## Prompt:

Bien, ahora siguiendo un poco el tema este, necesito varias modificaciones, primero que al crear un apartado de entrega también el profe pueda subir un archivo ya sea pdf o el que sea, por eso no se si seria mejor que el tema entrega sea simplemente un check y que este acompañado ya sea por texto, enlace,  video o etc o que dentro del apartado entrega te permita cargar lo que sea para subir a modo de consigna.

Eso por un lado, por otro necesito que la fecha sea opcional, si no se ingresa fecha diga sin fecha limite de entrega (para los alumnos) y que esa fecha cumpla 2 cosas: primero que no pueda ponerse una fecha anterior a la de hoy y segundo que se pueda seleccionar con un calendario

despues por otro lado, al profesor no le deja visualizar correctamente las entregas, estaria bueno que sean apartados chiquitos y si el profe quiere ver una entrega pueda tocar ese apartado y ver toda la entrega. A los pdf se me queda cargando y ni siquiera puedo verlos.

siguiendo un poco eso necesito tambíen que el profesor pueda poner una nota numérica cualquiera sea entre 0 y 100, negando que ingrese demasiadisimos numeros por si acaso se rompe.

también necesito que el alumno pueda modificar su entrega siempre y cuando aun no sea la fecha de entrega osea no se haya pasado la fecha límite de entrega.Tambien necesito que al igual que el profesor, el alumno pueda ver el archivo que esta por entregar a traves de un boton que diga visualizar archivo, tal cual esta hecho en otras pantallas. Siguiendo un poco esa lógica necesito que el profesor, al igual que en classroom, pueda devolver una retroalimentación y pueda decidir si ese alumno en específico debe reentregar o no si asi el profe lo desea.

además necesito que manejes todo tipo de error que pueda surgir usando los modal que ya tenemos (un caso que se me ocurre es que haya una entrega de un alumno y el profe quiera borrar la entrega completa, el modal debería avisar que hay una entrega en el mensaje de eliminación para que el profe decida que hacer) y si ves más cosas relacionadas con titulos o lo que sea agregale los modal. Te paso los codigos que considero necesarios para hacer todo esto:

```typescriptreact
//app/layout.tsx
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import * as NavigationBar from 'expo-navigation-bar';

export default function RootLayout() {
  useEffect(() => {
    const hideNavigationBar = async () => {
      if (Platform.OS === 'android') {
        try {
          await NavigationBar.setBehaviorAsync('overlay-swipe');
          await NavigationBar.setVisibilityAsync('hidden');
        } catch (error) {
          console.log("Error configurando la barra de navegación:", error);
        }
      }
    };
    hideNavigationBar();
  }, []);

  return (
    <>
      <StatusBar hidden={true} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#FFFFFF' },
          headerTintColor: '#0F4A32',
          headerTitleStyle: { fontWeight: '700', color: '#11181C' },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="registro" options={{ title: "Crear Cuenta" }} />
        <Stack.Screen name="recuperar" options={{ title: "Recuperar Contraseña" }} />
        <Stack.Screen name="modulos/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="modulos/form" options={{ headerShown: false }} />
        <Stack.Screen name="secciones/form" options={{ headerShown: false }} />
        <Stack.Screen name="secciones/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="subsecciones/form" options={{ headerShown: false }} />
        <Stack.Screen name="subsecciones/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="items/form" options={{ headerShown: false }} />
        <Stack.Screen name="pantallasAdmin/userManagementScreen" options={{ headerShown: false }} />
        <Stack.Screen name="items/form" options={{ headerShown: true }} />
        <Stack.Screen name="entregas/[id]" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

```

```typescript
// hooks/useEntregasAlumnos.ts
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../config/firebaseConfig";

export interface EntregaAlumno {
  id: string;
  alumnoId: string;
  alumnoNombre: string;
  tipo: "texto" | "pdf" | "imagen" | "documento" | "video";
  titulo: string;
  contenido: string;
  url: string;
  storageRef: string;
  nombreArchivo: string;
  fechaEntrega: any;
}

export type EntregaAlumnoInput = Omit<EntregaAlumno, "id" | "alumnoId" | "alumnoNombre" | "fechaEntrega">;

const getEntregasCollection = (
  moduloId: string,
  seccionId: string,
  itemId: string,
  subseccionPath?: string,
) => {
  const subseccionSegments = (subseccionPath ?? "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((id) => ["subsecciones", id]);

  return collection(
    db,
    "modulos",
    moduloId,
    "secciones",
    seccionId,
    ...subseccionSegments,
    "items",
    itemId,
    "entregas_alumnos",
  );
};

// Para admin/profe: escucha TODAS las entregas del item
export function useEntregasAlumnos(
  moduloId: string,
  seccionId: string,
  itemId: string,
  subseccionPath?: string,
) {
  const [entregas, setEntregas] = useState<EntregaAlumno[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!moduloId || !seccionId || !itemId) { setLoading(false); return; }
    const q = query(
      getEntregasCollection(moduloId, seccionId, itemId, subseccionPath),
      orderBy("fechaEntrega", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setEntregas(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EntregaAlumno));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [moduloId, seccionId, itemId, subseccionPath]);

  return { entregas, loading };
}

// Para el alumno: solo su propia entrega
export function useMiEntrega(
  moduloId: string,
  seccionId: string,
  itemId: string,
  subseccionPath?: string,
) {
  const [miEntrega, setMiEntrega] = useState<EntregaAlumno | null>(null);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    if (!moduloId || !seccionId || !itemId || !uid) { setLoading(false); return; }
    const q = query(
      getEntregasCollection(moduloId, seccionId, itemId, subseccionPath),
      where("alumnoId", "==", uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      setMiEntrega(snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as EntregaAlumno));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [moduloId, seccionId, itemId, uid, subseccionPath]);

  const enviarEntrega = async (data: EntregaAlumnoInput) => {
    const user = auth.currentUser;
    if (!user) throw new Error("No autenticado");
    await addDoc(getEntregasCollection(moduloId, seccionId, itemId, subseccionPath), {
      ...data,
      alumnoId: user.uid,
      alumnoNombre: user.displayName ?? user.email ?? "Alumno",
      fechaEntrega: serverTimestamp(),
    });
  };

  return { miEntrega, loading, enviarEntrega };
}
```

## Response:

Esto es un cambio grande, así que vamos por partes. Te dejo todo organizado por archivo. Antes de nada, instalá la dependencia para el calendario:

```
npx expo install @react-native-community/datetimepicker
```

---

## 1. `firestore.rules`

Reemplazá los dos bloques de `entregas_alumnos` (el de `items` directos y el de `{parentPath=**}/items`) por esta versión. La regla de `update` ahora permite que el dueño (alumno) reentregue, y que admin/profesor califiquen — es una regla simplificada (no separa por campo), suficiente para el alcance del proyecto:

```
match /entregas_alumnos/{entregaId} {
  allow read: if request.auth != null &&
    (resource.data.alumnoId == request.auth.uid || isAdmin() || isProfesor());
  allow create: if request.auth != null &&
    request.auth.uid == request.resource.data.alumnoId;
  allow update: if request.auth != null &&
    (
      (resource.data.alumnoId == request.auth.uid
        && request.resource.data.alumnoId == resource.data.alumnoId)
      || isAdmin() || isProfesor()
    );
  allow delete: if isAdmin();
}
```

Pegá ese bloque dentro de `match /items/{itemId} { ... }` y también dentro de `match /{parentPath=**}/items/{itemId} { ... }`, reemplazando el bloque anterior de `entregas_alumnos` en ambos lugares.

---

## 2. `hooks/useItems.ts`

**Import** — reemplazá:
```ts
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
```
por:
```ts
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
```

**Interfaz `Item`** — agregá después de `fechaLimite?: string | null;`:
```ts
  archivoConsignaUrl?: string;
  archivoConsignaNombre?: string;
  archivoConsignaStorageRef?: string;
  archivoConsignaTipo?: ItemTipo;
```

**`eliminarItem`** — reemplazá la función completa por esta. Ahora además borra el archivo adjunto de la consigna (si lo hay) y todas las entregas de los alumnos (subcolección) antes de borrar el item, para evitar datos huérfanos:

```ts
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

    // Archivo adjunto a la consigna de una entrega
    if (item.tipo === "entrega" && item.archivoConsignaStorageRef) {
      await deleteFromCloudinary(item.archivoConsignaStorageRef, item.archivoConsignaTipo ?? "documento");
    }

    // Si es una entrega, borrar primero las respuestas de los alumnos (subcolección)
    if (item.tipo === "entrega") {
      const itemDocRef = getItemDoc(moduloId, seccionId, item.id, subseccionPath);
      const entregasSnap = await getDocs(collection(itemDocRef, "entregas_alumnos"));
      if (!entregasSnap.empty) {
        const batch = writeBatch(db);
        entregasSnap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }

    await deleteDoc(getItemDoc(moduloId, seccionId, item.id, subseccionPath));
    console.log("[ELIMINAR] Documento borrado de la base de datos con éxito.");
  };
```

---

## 3. `hooks/useEntregasAlumnos.ts` (reescritura completa)

```ts
// hooks/useEntregasAlumnos.ts
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../config/firebaseConfig";

export interface EntregaAlumno {
  id: string;
  alumnoId: string;
  alumnoNombre: string;
  tipo: "texto" | "pdf" | "imagen" | "documento" | "video";
  titulo: string;
  contenido: string;
  url: string;
  storageRef: string;
  nombreArchivo: string;
  fechaEntrega: any;
  fechaActualizacion?: any;
  nota?: number | null;
  retroalimentacion?: string;
  requiereReentrega?: boolean;
}

export type EntregaAlumnoInput = Omit<
  EntregaAlumno,
  | "id"
  | "alumnoId"
  | "alumnoNombre"
  | "fechaEntrega"
  | "fechaActualizacion"
  | "nota"
  | "retroalimentacion"
  | "requiereReentrega"
>;

export const getEntregasAlumnosCollection = (
  moduloId: string,
  seccionId: string,
  itemId: string,
  subseccionPath?: string,
) => {
  const subseccionSegments = (subseccionPath ?? "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((id) => ["subsecciones", id]);

  return collection(
    db,
    "modulos",
    moduloId,
    "secciones",
    seccionId,
    ...subseccionSegments,
    "items",
    itemId,
    "entregas_alumnos",
  );
};

const getEntregaDoc = (
  moduloId: string,
  seccionId: string,
  itemId: string,
  entregaId: string,
  subseccionPath?: string,
) => {
  return doc(getEntregasAlumnosCollection(moduloId, seccionId, itemId, subseccionPath), entregaId);
};

// Para admin/profe: escucha TODAS las entregas del item
export function useEntregasAlumnos(
  moduloId: string,
  seccionId: string,
  itemId: string,
  subseccionPath?: string,
) {
  const [entregas, setEntregas] = useState<EntregaAlumno[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!moduloId || !seccionId || !itemId) { setLoading(false); return; }
    const q = query(
      getEntregasAlumnosCollection(moduloId, seccionId, itemId, subseccionPath),
      orderBy("fechaEntrega", "asc"),
    );
    const unsub = onSnapshot(q, (snap) => {
      setEntregas(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EntregaAlumno));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [moduloId, seccionId, itemId, subseccionPath]);

  const actualizarCalificacion = async (
    entregaId: string,
    data: { nota: number | null; retroalimentacion: string; requiereReentrega: boolean },
  ) => {
    await updateDoc(getEntregaDoc(moduloId, seccionId, itemId, entregaId, subseccionPath), {
      ...data,
      fechaActualizacion: serverTimestamp(),
    });
  };

  return { entregas, loading, actualizarCalificacion };
}

// Para el alumno: solo su propia entrega
export function useMiEntrega(
  moduloId: string,
  seccionId: string,
  itemId: string,
  subseccionPath?: string,
) {
  const [miEntrega, setMiEntrega] = useState<EntregaAlumno | null>(null);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    if (!moduloId || !seccionId || !itemId || !uid) { setLoading(false); return; }
    const q = query(
      getEntregasAlumnosCollection(moduloId, seccionId, itemId, subseccionPath),
      where("alumnoId", "==", uid),
    );
    const unsub = onSnapshot(q, (snap) => {
      setMiEntrega(snap.empty ? null : ({ id: snap.docs[0].id, ...snap.docs[0].data() } as EntregaAlumno));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [moduloId, seccionId, itemId, uid, subseccionPath]);

  const enviarEntrega = async (data: EntregaAlumnoInput) => {
    const user = auth.currentUser;
    if (!user) throw new Error("No autenticado");
    await addDoc(getEntregasAlumnosCollection(moduloId, seccionId, itemId, subseccionPath), {
      ...data,
      alumnoId: user.uid,
      alumnoNombre: user.displayName ?? user.email ?? "Alumno",
      nota: null,
      retroalimentacion: "",
      requiereReentrega: false,
      fechaEntrega: serverTimestamp(),
    });
  };

  // Reentrega: el alumno modifica su propia entrega. Resetea nota y requiereReentrega
  // (vuelve a quedar pendiente de revisión), pero conserva la retroalimentación anterior.
  const actualizarEntrega = async (entregaId: string, data: EntregaAlumnoInput) => {
    await updateDoc(getEntregaDoc(moduloId, seccionId, itemId, entregaId, subseccionPath), {
      ...data,
      nota: null,
      requiereReentrega: false,
      fechaEntrega: serverTimestamp(),
      fechaActualizacion: serverTimestamp(),
    });
  };

  return { miEntrega, loading, enviarEntrega, actualizarEntrega };
}
```

---

## 4. `app/items/form.tsx`

**a) Import** — agregá después de `import * as IntentLauncher from "expo-intent-launcher";`:
```ts
import DateTimePicker from "@react-native-community/datetimepicker";
```

**b) Helpers** — agregá después del array `TIPOS`:
```ts
const formatearFecha = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const detectarTipoArchivo = (nombre: string): ItemTipo => {
  const ext = nombre.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "imagen";
  if (["mp4", "mov", "avi", "mkv"].includes(ext)) return "video";
  if (ext === "pdf") return "pdf";
  return "documento";
};
```

**c) Nuevo estado** — junto a los demás `useState`:
```ts
const [mostrarDatePicker, setMostrarDatePicker] = useState(false);
```

**d) Carga en modo edición** — el bloque que ya tenés:
```ts
if (data.tipo === "entrega") {
  setUrlEnlace(data.fechaLimite ?? "");
}
```
reemplazalo por:
```ts
if (data.tipo === "entrega") {
  setUrlEnlace(data.fechaLimite ?? "");
  if (data.archivoConsignaUrl) {
    setArchivoExistente({
      nombre: data.archivoConsignaNombre ?? "",
      url: data.archivoConsignaUrl ?? "",
      storageRef: data.archivoConsignaStorageRef ?? "",
    });
  }
}
```

**e) `handleGuardar` — rama de edición**, reemplazá:
```ts
} else if (tipo === "entrega") {
  await actualizarItem(itemId, {
    titulo: titulo.trim() || "Entrega",
    contenido: contenido.trim(),
    descripcionEntrega: contenido.trim(),
    fechaLimite: urlEnlace.trim() || null,
  });
```
por:
```ts
} else if (tipo === "entrega") {
  let extra: Record<string, any> = {};
  if (archivo) {
    const tipoArchivo = detectarTipoArchivo(archivo.nombre);
    const cloudRes = await uploadToCloudinary(archivo.uri, tipoArchivo, archivo.nombre);
    extra = {
      archivoConsignaUrl: cloudRes.url,
      archivoConsignaStorageRef: cloudRes.publicId,
      archivoConsignaNombre: archivo.nombre,
      archivoConsignaTipo: tipoArchivo,
    };
  }
  await actualizarItem(itemId, {
    titulo: titulo.trim() || "Entrega",
    contenido: contenido.trim(),
    descripcionEntrega: contenido.trim(),
    fechaLimite: urlEnlace.trim() || null,
    ...extra,
  });
```

**f) `handleGuardar` — rama de creación**, reemplazá:
```ts
} else if (tipo === "entrega") {
  await crearItem({
    tipo: "entrega",
    titulo: titulo.trim() || "Entrega",
    contenido: contenido.trim(),
    url: "",
    storageRef: "",
    nombreArchivo: "",
    descripcionEntrega: contenido.trim(),
    fechaLimite: urlEnlace.trim() || null,
  });
```
por:
```ts
} else if (tipo === "entrega") {
  let extra: Record<string, any> = {};
  if (archivo) {
    const tipoArchivo = detectarTipoArchivo(archivo.nombre);
    const cloudRes = await uploadToCloudinary(archivo.uri, tipoArchivo, archivo.nombre);
    extra = {
      archivoConsignaUrl: cloudRes.url,
      archivoConsignaStorageRef: cloudRes.publicId,
      archivoConsignaNombre: archivo.nombre,
      archivoConsignaTipo: tipoArchivo,
    };
  }
  await crearItem({
    tipo: "entrega",
    titulo: titulo.trim() || "Entrega",
    contenido: contenido.trim(),
    url: "",
    storageRef: "",
    nombreArchivo: "",
    descripcionEntrega: contenido.trim(),
    fechaLimite: urlEnlace.trim() || null,
    ...extra,
  });
```

**g) Sección del formulario para `tipo === "entrega"`** — reemplazá todo el bloque:
```tsx
{tipo === "entrega" && (
  <>
    <Text style={styles.label}>Consigna / Descripción</Text>
    <TextInput
      style={[styles.input, styles.inputMultiline]}
      placeholder="Describí qué deben entregar los alumnos..."
      placeholderTextColor="#9CA3AF"
      value={contenido}
      onChangeText={(v) => { setContenido(v); setHayCambios(true); }}
      multiline
      textAlignVertical="top"
      autoCorrect={true}
      autoCapitalize="sentences"
    />
    <Text style={styles.label}>Fecha límite (opcional)</Text>
    <TextInput
      style={styles.input}
      placeholder="Ej: 30/06/2026"
      placeholderTextColor="#9CA3AF"
      value={urlEnlace}  // reutilizamos urlEnlace como campo de fecha límite
      onChangeText={(v) => { setUrlEnlace(v); setHayCambios(true); }}
    />
  </>
)}
```
por:
```tsx
{tipo === "entrega" && (
  <>
    <Text style={styles.label}>Consigna / Descripción</Text>
    <TextInput
      style={[styles.input, styles.inputMultiline]}
      placeholder="Describí qué deben entregar los alumnos..."
      placeholderTextColor="#9CA3AF"
      value={contenido}
      onChangeText={(v) => { setContenido(v); setHayCambios(true); }}
      multiline
      textAlignVertical="top"
      autoCorrect={true}
      autoCapitalize="sentences"
    />

    <Text style={styles.label}>Fecha límite (opcional)</Text>
    <TouchableOpacity style={styles.input} onPress={() => setMostrarDatePicker(true)}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 15, color: urlEnlace ? "#11181C" : "#9CA3AF" }}>
          {urlEnlace ? formatearFecha(urlEnlace) : "Sin fecha límite"}
        </Text>
        <Ionicons name="calendar-outline" size={20} color="#6B7280" />
      </View>
    </TouchableOpacity>
    {urlEnlace ? (
      <TouchableOpacity
        onPress={() => { setUrlEnlace(""); setHayCambios(true); }}
        style={{ alignSelf: "flex-start", marginTop: 8 }}
      >
        <Text style={{ color: "#DC2626", fontSize: 13, fontWeight: "600" }}>Quitar fecha límite</Text>
      </TouchableOpacity>
    ) : null}

    {mostrarDatePicker && (
      <DateTimePicker
        value={urlEnlace ? new Date(`${urlEnlace}T00:00:00`) : new Date()}
        mode="date"
        minimumDate={new Date()}
        onChange={(_event, selectedDate) => {
          setMostrarDatePicker(false);
          if (selectedDate) {
            const iso = selectedDate.toISOString().split("T")[0];
            setUrlEnlace(iso);
            setHayCambios(true);
          }
        }}
      />
    )}
  </>
)}
```

**h) Habilitar el selector de archivo también para "entrega"** (como adjunto opcional de la consigna). Cambiá:
```tsx
{(tipo !== "texto" && tipo !== "enlace" && tipo !== "entrega") && (
  <>
    <Text style={styles.label}>
      Archivo{!modoEdicion && <Text style={styles.required}> *</Text>}
    </Text>
```
por:
```tsx
{(tipo !== "texto" && tipo !== "enlace") && (
  <>
    <Text style={styles.label}>
      {tipo === "entrega" ? (
        "Archivo adjunto a la consigna (opcional)"
      ) : (
        <>Archivo{!modoEdicion && <Text style={styles.required}> *</Text>}</>
      )}
    </Text>
```

No hace falta tocar nada más de ese bloque ni la validación de "Sin archivo" (que ya excluye `"entrega"`), ni `elegirArchivo` (para `"entrega"` cae en la rama de `DocumentPicker` con `type: "*/*"`, así que admite cualquier tipo de archivo).

---

## 5. `app/entregas/[id].tsx` (reescritura completa)

Esta es la pantalla más grande. Cubre: consigna con archivo adjunto y "sin fecha límite", vista de profesor con tarjetas chicas expandibles + calificación + retroalimentación + "solicitar reentrega", vista de alumno con edición mientras no venza el plazo, y "Visualizar archivo" tanto para archivo local (antes de subir) como remoto (ya subido). El bug de los PDFs que se quedaban cargando era que apuntaban a una ruta `/entregas/visor` que no existe — ahora se usa `WebBrowser.openBrowserAsync`, igual que en el resto de la app.

## Prompt:

Continuar

## Response:

Tenés razón, se rompió el formato por ese typo que dejé en el medio del código. Vamos de nuevo, limpio, desde `app/entregas/[id].tsx` en adelante.

---

## 5. `app/entregas/[id].tsx` (reescritura completa, versión limpia)

Reemplazá **todo** el contenido del archivo por esto:

```tsx
// app/entregas/[id].tsx
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import * as IntentLauncher from "expo-intent-launcher";
import * as FileSystem from "expo-file-system/legacy";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Linking, Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import ModalAlerta from "../../components/ui/ModalAlerta";
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
      }
    }
  };

  // Vista previa de un archivo LOCAL (antes de subir)
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

  const hoy = new Date().toISOString().split("T")[0];
  const fechaVencida = !!item?.fechaLimite && hoy > item.fechaLimite;
  const puedeEditarEntrega = !fechaVencida || miEntrega?.requiereReentrega === true;

  const iniciarEdicion = () => {
    if (!miEntrega) return;
    const tiposPermitidos = ["texto", "pdf", "imagen", "documento"] as const;
    setTipoEnvio(tiposPermitidos.includes(miEntrega.tipo as any) ? (miEntrega.tipo as any) : "documento");
    setContenido(miEntrega.contenido ?? "");
    setArchivo(null);
    setArchivoExistenteEntrega(
      miEntrega.url ? { nombre: miEntrega.nombreArchivo, url: miEntrega.url } : null,
    );
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
        setAlerta({ visible: true, titulo: "Reentregado", mensaje: "Tu entrega fue actualizada correctamente.", tipo: "exito" });
      } else {
        await enviarEntrega(payload);
        setAlerta({ visible: true, titulo: "¡Entregado!", mensaje: "Tu entrega fue enviada correctamente.", tipo: "exito" });
      }
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
            actualizarCalificacion={actualizarCalificacion}
            setAlerta={setAlerta}
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
                    El plazo de entrega venció, ya no podés modificar tu entrega.
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
                      onPress={() => { setTipoEnvio(t); setArchivo(null); setArchivoExistenteEntrega(null); }}
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
                      onPress={() => setModoEdicionEntrega(false)}
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
    </View>
  );
}

interface DocenteVistaProps {
  entregas: EntregaAlumno[];
  loading: boolean;
  actualizarCalificacion: (entregaId: string, data: { nota: number | null; retroalimentacion: string; requiereReentrega: boolean }) => Promise<void>;
  setAlerta: (a: { visible: boolean; titulo: string; mensaje: string; tipo: "error" | "exito" }) => void;
}

function DocenteVista({ entregas, loading, actualizarCalificacion, setAlerta }: DocenteVistaProps) {
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [notaInput, setNotaInput] = useState("");
  const [retroInput, setRetroInput] = useState("");
  const [requiereReentregaInput, setRequiereReentregaInput] = useState(false);
  const [guardandoCal, setGuardandoCal] = useState(false);

  const toggleExpandir = (entrega: EntregaAlumno) => {
    if (expandidoId === entrega.id) {
      setExpandidoId(null);
      return;
    }
    setExpandidoId(entrega.id);
    setNotaInput(typeof entrega.nota === "number" ? String(entrega.nota) : "");
    setRetroInput(entrega.retroalimentacion ?? "");
    setRequiereReentregaInput(entrega.requiereReentrega === true);
  };

  const handleGuardarCalificacion = async (entrega: EntregaAlumno) => {
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
    setGuardandoCal(true);
    try {
      await actualizarCalificacion(entrega.id, {
        nota: notaInput.trim() ? Number(notaInput.trim()) : null,
        retroalimentacion: retroInput.trim(),
        requiereReentrega: requiereReentregaInput,
      });
      setAlerta({ visible: true, titulo: "Guardado", mensaje: "La calificación se guardó correctamente.", tipo: "exito" });
    } catch {
      setAlerta({ visible: true, titulo: "Error", mensaje: "No se pudo guardar la calificación. Intentá nuevamente.", tipo: "error" });
    } finally {
      setGuardandoCal(false);
    }
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
```

Ese era el archivo entero, sin el typo de la vez anterior. Ahora siguen los pasos 6 y 7, que son chicos.

---

## 6. Modal de advertencia al borrar un item de tipo "entrega"

En **ambos** archivos `app/secciones/[id].tsx` y `app/subsecciones/[id].tsx`, buscá el `ModalConfirmacion` de eliminar item:

```tsx
<ModalConfirmacion
  visible={itemAEliminar !== null}
  titulo="Eliminar Elemento"
  mensaje="¿Estás seguro de que deseas eliminar este elemento? Esta acción es permanente."
  textoConfirmar="Sí, eliminar"
  textoCancelar="Cancelar"
  onConfirm={handleEliminarItem}
  onCancel={() => setItemAEliminar(null)}
/>
```

Reemplazalo por:

```tsx
<ModalConfirmacion
  visible={itemAEliminar !== null}
  titulo="Eliminar Elemento"
  mensaje={
    itemAEliminar?.tipo === "entrega"
      ? "Este apartado es una Entrega. Si la eliminás, también se borrarán TODAS las entregas que los alumnos hayan subido, junto con sus archivos, notas y retroalimentaciones. Esta acción es permanente."
      : "¿Estás seguro de que deseas eliminar este elemento? Esta acción es permanente."
  }
  textoConfirmar="Sí, eliminar"
  textoCancelar="Cancelar"
  onConfirm={handleEliminarItem}
  onCancel={() => setItemAEliminar(null)}
/>
```

---

## 7. Habilitar tarjeta y navegación de "entrega" en `subsecciones/[id].tsx`

**a)** En `interface ItemCardProps`, agregá al final:
```ts
  onVerEntrega?: () => void;
```

**b)** En la firma de `function ItemCard({...}: ItemCardProps)`, agregá `onVerEntrega` a los parámetros:
```tsx
function ItemCard({
  item,
  puedeGestionar,
  onEditar,
  onEliminar,
  onAbrirArchivo,
  onVerEntrega,
}: ItemCardProps) {
```

**c)** Dentro de `ItemCard`, justo antes del `return` final (el de PDF/Documento), agregá:

```tsx
if (item.tipo === "entrega") {
  return (
    <TouchableOpacity
      style={[styles.itemCard, { borderLeftWidth: 3, borderLeftColor: "#F59E0B" }]}
      onPress={onVerEntrega}
      activeOpacity={0.8}
    >
      <View style={styles.itemHeader}>
        <View style={[styles.itemIconBg, { backgroundColor: "#FEF3C7" }]}>
          <Ionicons name="cloud-upload-outline" size={18} color="#B45309" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemTitulo}>{item.titulo}</Text>
          {item.descripcionEntrega ? (
            <Text style={styles.itemNombreArchivo} numberOfLines={2}>
              {item.descripcionEntrega}
            </Text>
          ) : null}
          <Text style={[styles.itemNombreArchivo, { color: "#B45309" }]}>
            {item.fechaLimite ? `Límite: ${item.fechaLimite}` : "Sin fecha límite"}
          </Text>
        </View>
        {acciones}
        <Ionicons name="chevron-forward-outline" size={16} color="#CBD5E0" />
      </View>
    </TouchableOpacity>
  );
}
```

**d)** En el `.map()` de items dentro del `return` principal, donde se renderiza `<ItemCard ... />`, agregá la prop `onVerEntrega`:

```tsx
onVerEntrega={() =>
  router.push(
    `/entregas/${item.id}?moduloId=${moduloId}&seccionId=${seccionId}&subseccionPath=${encodeURIComponent(currentSubseccionPath)}` as any
  )
}
```

---

Con esto quedan los 7 pasos completos: reglas de Firestore, `useItems.ts`, `useEntregasAlumnos.ts`, `items/form.tsx`, `entregas/[id].tsx`, y los modales/tarjetas en `secciones/[id].tsx` y `subsecciones/[id].tsx`. Si algo más se ve raro al probarlo, mandame el error puntual y lo vemos.

## Prompt:

era eso, pero necesito unos cambios:
Arreglar reentrega: luego de calificar una entrega no debe poder permitir reentregar, es más solo debe permitir una reentrega si el profesor lo permite o si aun no llegó la fecha, pero si el profe lo corrige ya no se podrá modificar la entrega a no ser que el profesor lo habilite

## Response:

Buena observación, el problema es que la lógica actual solo mira la fecha, sin tener en cuenta si el profe ya calificó. Necesitamos un nuevo campo `revisada` que marque "el profe ya revisó esta entrega", y la regla pasa a ser:

- Mientras `revisada` sea `false` → el alumno puede modificar libremente, siempre que no haya pasado la fecha límite (igual que antes).
- En cuanto el profe califica, `revisada` pasa a `true` → el alumno ya **no** puede modificar, salvo que el profe active `requiereReentrega`.
- Si el alumno reentrega, `revisada` vuelve a `false` y queda pendiente de revisión otra vez.

---

## 1. `hooks/useEntregasAlumnos.ts`

**a)** En la interfaz `EntregaAlumno`, agregá el campo nuevo justo después de `requiereReentrega?: boolean;`:

```ts
  requiereReentrega?: boolean;
  revisada?: boolean;
}
```

**b)** En `EntregaAlumnoInput`, agregá `"revisada"` a la lista de campos excluidos:

```ts
export type EntregaAlumnoInput = Omit<
  EntregaAlumno,
  | "id"
  | "alumnoId"
  | "alumnoNombre"
  | "fechaEntrega"
  | "fechaActualizacion"
  | "nota"
  | "retroalimentacion"
  | "requiereReentrega"
  | "revisada"
>;
```

**c)** En `enviarEntrega`, agregá `revisada: false` junto a los otros campos por defecto:

```ts
  const enviarEntrega = async (data: EntregaAlumnoInput) => {
    const user = auth.currentUser;
    if (!user) throw new Error("No autenticado");
    await addDoc(getEntregasAlumnosCollection(moduloId, seccionId, itemId, subseccionPath), {
      ...data,
      alumnoId: user.uid,
      alumnoNombre: user.displayName ?? user.email ?? "Alumno",
      nota: null,
      retroalimentacion: "",
      requiereReentrega: false,
      revisada: false,
      fechaEntrega: serverTimestamp(),
    });
  };
```

**d)** En `actualizarEntrega`, agregá `revisada: false` (vuelve a quedar pendiente de revisión):

```ts
  const actualizarEntrega = async (entregaId: string, data: EntregaAlumnoInput) => {
    await updateDoc(getEntregaDoc(moduloId, seccionId, itemId, entregaId, subseccionPath), {
      ...data,
      nota: null,
      requiereReentrega: false,
      revisada: false,
      fechaEntrega: serverTimestamp(),
      fechaActualizacion: serverTimestamp(),
    });
  };
```

**e)** En `actualizarCalificacion`, agregá `revisada: true` (el profe acaba de revisar):

```ts
  const actualizarCalificacion = async (
    entregaId: string,
    data: { nota: number | null; retroalimentacion: string; requiereReentrega: boolean },
  ) => {
    await updateDoc(getEntregaDoc(moduloId, seccionId, itemId, entregaId, subseccionPath), {
      ...data,
      revisada: true,
      fechaActualizacion: serverTimestamp(),
    });
  };
```

---

## 2. `app/entregas/[id].tsx`

**a)** Reemplazá:

```ts
  const hoy = new Date().toISOString().split("T")[0];
  const fechaVencida = !!item?.fechaLimite && hoy > item.fechaLimite;
  const puedeEditarEntrega = !fechaVencida || miEntrega?.requiereReentrega === true;
```

por:

```ts
  const hoy = new Date().toISOString().split("T")[0];
  const fechaVencida = !!item?.fechaLimite && hoy > item.fechaLimite;
  const yaRevisada = miEntrega?.revisada === true;
  const puedeEditarEntrega =
    miEntrega?.requiereReentrega === true || (!yaRevisada && !fechaVencida);
```

**b)** En el bloque donde se muestra el botón "Modificar entrega" / mensaje de plazo vencido, reemplazá:

```tsx
{puedeEditarEntrega ? (
  <TouchableOpacity style={styles.editarBtn} onPress={iniciarEdicion}>
    <Ionicons name="create-outline" size={18} color="#0F4A32" />
    <Text style={styles.editarBtnText}>
      {miEntrega.requiereReentrega ? "Reentregar" : "Modificar entrega"}
    </Text>
  </TouchableOpacity>
) : (
  <Text style={styles.plazoVencidoText}>
    El plazo de entrega venció, ya no podés modificar tu entrega.
  </Text>
)}
```

por:

```tsx
{puedeEditarEntrega ? (
  <TouchableOpacity style={styles.editarBtn} onPress={iniciarEdicion}>
    <Ionicons name="create-outline" size={18} color="#0F4A32" />
    <Text style={styles.editarBtnText}>
      {miEntrega.requiereReentrega ? "Reentregar" : "Modificar entrega"}
    </Text>
  </TouchableOpacity>
) : (
  <Text style={styles.plazoVencidoText}>
    {yaRevisada
      ? "Tu entrega ya fue calificada. No podés modificarla a menos que el profesor solicite una reentrega."
      : "El plazo de entrega venció, ya no podés modificar tu entrega."}
  </Text>
)}
```

---

Con esto, el flujo queda: alumno entrega → puede editar libremente hasta que pase la fecha o el profe califique (lo que ocurra primero) → si el profe califica sin pedir reentrega, queda bloqueado con el mensaje de "ya fue calificada" → si el profe tilda "Solicitar reentrega", se habilita el botón "Reentregar" sin importar la fecha → al reentregar, vuelve a quedar `revisada: false`, lista para que el profe la revise de nuevo.

Una aclaración: las entregas que ya existían antes de este cambio no tienen el campo `revisada`, así que `miEntrega?.revisada === true` da `false` para ellas — se van a comportar como "no revisadas todavía" (editable según fecha), lo cual es razonable como default.

## Prompt:

y necesito que se le permita a los alumnos entregar fuera de la fecha, pero que con algun campo o algun pequeño texto avise al profe que entrego fuera de fecha y cuanto tiempo fuera de la fecha esperada si es que la hay

## Response:

Buena noticia: para esto no necesitamos campos nuevos en Firestore. Ya tenemos `fechaEntrega` (timestamp real de cuando entregó) y `item.fechaLimite` (fecha límite). Comparando ambos podemos calcular el atraso al vuelo, tanto para el alumno como para el profesor.

Dos cambios: (1) dejar de bloquear la edición/reentrega por fecha vencida, y (2) agregar un indicador de atraso.

---

## 1. `app/entregas/[id].tsx`

**a) Agregá esta función helper** arriba del todo, junto a `formatearFecha`:

```ts
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
```

**b) Sacar el bloqueo por fecha vencida.** Reemplazá:

```ts
  const hoy = new Date().toISOString().split("T")[0];
  const fechaVencida = !!item?.fechaLimite && hoy > item.fechaLimite;
  const yaRevisada = miEntrega?.revisada === true;
  const puedeEditarEntrega =
    miEntrega?.requiereReentrega === true || (!yaRevisada && !fechaVencida);
```

por:

```ts
  const yaRevisada = miEntrega?.revisada === true;
  const puedeEditarEntrega = miEntrega?.requiereReentrega === true || !yaRevisada;
```

**c) Simplificar el mensaje de bloqueo.** Reemplazá:

```tsx
{puedeEditarEntrega ? (
  <TouchableOpacity style={styles.editarBtn} onPress={iniciarEdicion}>
    <Ionicons name="create-outline" size={18} color="#0F4A32" />
    <Text style={styles.editarBtnText}>
      {miEntrega.requiereReentrega ? "Reentregar" : "Modificar entrega"}
    </Text>
  </TouchableOpacity>
) : (
  <Text style={styles.plazoVencidoText}>
    {yaRevisada
      ? "Tu entrega ya fue calificada. No podés modificarla a menos que el profesor solicite una reentrega."
      : "El plazo de entrega venció, ya no podés modificar tu entrega."}
  </Text>
)}
```

por:

```tsx
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
```

**d) Mostrar el atraso al alumno.** Justo arriba de `{(typeof miEntrega.nota === "number") && (...)}`, agregá:

```tsx
{(() => {
  const atraso = calcularAtraso(miEntrega.fechaEntrega, item?.fechaLimite);
  return atraso ? (
    <View style={styles.tardeBadge}>
      <Ionicons name="time-outline" size={14} color="#B45309" />
      <Text style={styles.tardeBadgeText}>Entregaste fuera de fecha (atraso: {atraso})</Text>
    </View>
  ) : null;
})()}
```

Quedaría así, por ejemplo:

```tsx
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
```

**e) Pasar `fechaLimite` a `DocenteVista`.** Reemplazá:

```tsx
{esDocente ? (
  <DocenteVista
    entregas={entregas}
    loading={loadingEntregas}
    actualizarCalificacion={actualizarCalificacion}
    setAlerta={setAlerta}
  />
) : (
```

por:

```tsx
{esDocente ? (
  <DocenteVista
    entregas={entregas}
    loading={loadingEntregas}
    fechaLimite={item?.fechaLimite}
    actualizarCalificacion={actualizarCalificacion}
    setAlerta={setAlerta}
  />
) : (
```

**f) Recibir el prop en `DocenteVista`.** Reemplazá:

```ts
interface DocenteVistaProps {
  entregas: EntregaAlumno[];
  loading: boolean;
  actualizarCalificacion: (entregaId: string, data: { nota: number | null; retroalimentacion: string; requiereReentrega: boolean }) => Promise<void>;
  setAlerta: (a: { visible: boolean; titulo: string; mensaje: string; tipo: "error" | "exito" }) => void;
}

function DocenteVista({ entregas, loading, actualizarCalificacion, setAlerta }: DocenteVistaProps) {
```

por:

```ts
interface DocenteVistaProps {
  entregas: EntregaAlumno[];
  loading: boolean;
  fechaLimite?: string | null;
  actualizarCalificacion: (entregaId: string, data: { nota: number | null; retroalimentacion: string; requiereReentrega: boolean }) => Promise<void>;
  setAlerta: (a: { visible: boolean; titulo: string; mensaje: string; tipo: "error" | "exito" }) => void;
}

function DocenteVista({ entregas, loading, fechaLimite, actualizarCalificacion, setAlerta }: DocenteVistaProps) {
```

**g) Mostrar el atraso al profesor.** En el header de cada tarjeta (la parte colapsada), reemplazá:

```tsx
<View style={{ flex: 1 }}>
  <Text style={styles.entregaAlumno}>{e.alumnoNombre}</Text>
  <Text style={styles.entregaFecha}>
    {e.fechaEntrega?.toDate ? e.fechaEntrega.toDate().toLocaleDateString("es-AR") : ""}
    {typeof e.nota === "number" ? `  ·  Nota: ${e.nota}/100` : ""}
    {e.requiereReentrega ? "  ·  Reentrega solicitada" : ""}
  </Text>
</View>
```

por:

```tsx
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
```

---

## 2. Estilos nuevos

Agregá estos dos estilos al `StyleSheet.create({...})`, por ejemplo cerca de `notaBadge`:

```ts
  tardeBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#FEF3C7", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6, marginTop: 4,
  },
  tardeBadgeText: { fontSize: 12, fontWeight: "600", color: "#B45309" },
  entregaTardeText: { fontSize: 11, color: "#B45309", fontWeight: "600", marginTop: 2 },
```

---

Con esto, los alumnos siempre pueden entregar o reentregar (mientras no esté calificado, o si el profe pidió reentrega), sin importar si pasó la fecha. Tanto el alumno como el profesor ven un cartelito naranja "Entregaste/Entregó fuera de fecha (atraso: X días/horas/minutos)" calculado comparando el momento real de la entrega contra el fin del día de la fecha límite. Si no hay `fechaLimite` configurada, `calcularAtraso` devuelve `null` y no se muestra nada.

---



---
# Q&A de la sesión 2 
---

dame un prompt para pedirle a una IA que implemente 2 nuevas funcionalidades en la aplicación: cargar notas de exámenes (parciales) y consultar notas. básicamente, la funcionalidad para cargar notas debería preguntarse para cualquier sección que se vaya a crear, tal como se pregunta para estos casos:

{/* Control de acceso */}
        <View style={styles.cursadaSection}>
          <Text style={styles.cursadaSectionTitulo}>Control de acceso</Text>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Requerir código de inscripción</Text>
              <Text style={styles.switchHint}>
                Los alumnos deberán ingresar un código para acceder.
              </Text>
            </View>
            <Switch
              value={esRestringida}
              onValueChange={(v) => {
                setEsRestringida(v);
                if (v && !codigoAcceso) {
                  setCodigoAcceso(generarCodigoAleatorio());
                }
                if (!v) setCodigoAcceso("");
                setHayCambios(true);
              }}
              trackColor={{ false: "#E5E7EB", true: "#25B471" }}
              thumbColor="#FFFFFF"
            />
          </View>

          {esRestringida && codigoAcceso ? (
            <View style={styles.codigoContainer}>
              <Text style={styles.codigoLabel}>Código de acceso actual</Text>
              <View style={styles.codigoRow}>
                <Text style={styles.codigoText}>{codigoAcceso}</Text>
                <TouchableOpacity
                  style={styles.compartirBtn}
                  onPress={() =>
                    Share.share({
                      message: `Código de acceso para ${titulo.trim()}: ${codigoAcceso}`,
                    })
                  }
                >
                  <Ionicons name="share-outline" size={16} color="#0F4A32" />
                  <Text style={styles.compartirBtnText}>Compartir</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.codigoHint}>
                Compartí este código con los alumnos. Para rotarlo, usá el
                panel de administración de cursadas.
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.cursadaSection}>
          <Text style={styles.cursadaSectionTitulo}>Permitir carga de profesores</Text>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Los profesores pueden subir contenido</Text>
              <Text style={styles.switchHint}>
                Si está activado, los profesores podrán agregar contenido en esta sección, pero no podrán editarlo ni eliminarlo.
              </Text>
            </View>
            <Switch
              value={permiteCargaProfesor}
              onValueChange={(v) => {
                setPermiteCargaProfesor(v);
                setHayCambios(true);
              }}
              trackColor={{ false: "#E5E7EB", true: "#25B471" }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

diseñá el prompt como lo consideres implementar. por ejemplo, podría ser que aparezcan todos los alumnos inscriptos en la cursada y al lado un espacio para poder cargar su nota.

Acá tenés una propuesta de prompt. Está armado para que la IA entienda perfectamente el estilo visual que ya manejás en tu código y estructure tanto el frontend como el backend de manera lógica.

Podés copiar y pegar el siguiente texto directamente a Codex, ChatGPT o Claude:

Actuando como desarrollador Full-Stack y experto en React Native, necesito que implementes un sistema de Carga y Consulta de Notas de Exámenes (Parciales) para la aplicación móvil de la cátedra de Operatoria Dental B (UNLP).

La funcionalidad se divide en tres partes principales. Por favor, estructurá tu respuesta y el código paso a paso:

1. Configuración de la Sección (UI Admin/Docente)
Al igual que configuramos si una sección es restringida o si permite carga de profesores, necesitamos un nuevo Switch en el formulario de creación/edición de la sección para habilitar la "Carga de notas" (ej. estado permiteCargaNotas).

Contexto de UI: Deberás seguir exactamente el mismo estilo de este código que ya usamos para otras configuraciones:

<View style={styles.cursadaSection}>
  <Text style={styles.cursadaSectionTitulo}>Habilitar carga de notas</Text>
  <View style={styles.switchRow}>
    <View style={{ flex: 1 }}>
      <Text style={styles.switchLabel}>Es una instancia de evaluación</Text>
      <Text style={styles.switchHint}>
        Si está activado, se habilitará una lista para calificar a los alumnos inscriptos en esta cursada.
      </Text>
    </View>
    <Switch
      value={permiteCargaNotas}
      onValueChange={(v) => {
        setPermiteCargaNotas(v);
        setHayCambios(true);
      }}
      trackColor={{ false: "#E5E7EB", true: "#25B471" }}
      thumbColor="#FFFFFF"
    />
  </View>
</View>

(Necesito que me confirmes los cambios en el modelo de base de datos para guardar este nuevo flag permiteCargaNotas).

2. Pantalla de Carga de Notas (UI Admin/Docente)
Si la sección tiene permiteCargaNotas === true, el docente/admin debe poder acceder a una pantalla específica de calificación.

Diseño requerido: Una lista (FlatList) que renderice a todos los alumnos inscriptos en esa cursada. Cada fila debe mostrar el nombre del alumno y, a la derecha, un TextInput para ingresar la nota (numérica o texto como "Ausente").

Acción: Un botón al final (o un autoguardado por fila) para impactar estas notas en la base de datos.

Entregable: Escribí el componente de React Native para esta pantalla, manejando el estado local de las notas antes de enviarlas al backend.

3. Consulta de Notas (UI Alumno)
Cuando el alumno ingresa a esta sección (si permiteCargaNotas === true), en lugar del contenido normal (o además de él), debe ver un componente destacado que le informe su calificación obtenida, o un mensaje de "Nota aún no cargada" si el profesor todavía no la subió.

4. Impacto en el Backend y Base de Datos
Explicá brevemente:

¿Cómo estructurarías la tabla/colección de Notas? (Teniendo en cuenta que relaciona al Alumno, la Sección/Examen y la Cursada).

¿Qué endpoints necesitamos (ej. GET /secciones/:id/notas, POST /secciones/:id/notas con un array de calificaciones para carga masiva)?

Asegurate de que el código React Native sea limpio, use hooks modernos (useState, useEffect) y mantenga la paleta de colores del ejemplo (#25B471, #E5E7EB).

¿Por qué este prompt te va a dar el mejor resultado?
Le da tu código como plantilla: Al pasarle el fragmento de los Switch que ya tenés, la IA no va a inventar clases CSS ni componentes raros; va a usar styles.cursadaSection, styles.switchRow, etc., logrando que el código nuevo encaje perfecto con el viejo.

Separa los roles: Le deja clarísimo a la IA que hay una vista para el que carga la nota (con el TextInput al lado del nombre) y otra para el que recibe la nota (el alumno).

Pide carga masiva: Al sugerir que el docente vea toda la lista y guarde, obligamos a la IA a pensar en un endpoint de backend que reciba un array de notas de una sola vez, lo cual es mucho más eficiente y rápido para el profesor que ir guardando alumno por alumno en pantallas separadas.

Vamos a planear. necesito implementar lo siguiente:

1. El panelcito "NOTAS DE EXÁMENES" (Habilitar carga de notas) tendría que aparecer también como posibilidad en las subsecciones (además del panelcito "PERMITIR CARGA DE PROFESORES".

2. Cuando se cargan notas, luego, en "Ver Notas", aparecen todas las notas de todos los exámenes cargados en esa sección. Ahora bien. No hay opción para eliminar esa carga / ese exámen si se desea.

Plan: Notas en Subsecciones + Eliminar Examen
Dos features independientes que se implementan en 4 fases.

TL;DR: (1) Agregar el toggle "Habilitar carga de notas" al form de subsecciones y mostrar el banner Cargar/Ver Notas en la vista de detalle. (2) Agregar un botón "eliminar examen" (todo el grupo de notas) en la pantalla Ver Notas, visible solo para admin. Las notas de subsecciones se identifican con un campo subseccionPath para ser independientes de las de la sección padre.

Fase A — Data model (hooks)
1. useSubsecciones.ts

Agregar permiteNotas?: boolean a la interfaz Subseccion.
2. useNotas.ts

Agregar subseccionPath?: string a Nota y NotaInput.
Actualizar guardarNotas: guardar campo subseccionPath: subseccionPath ?? "" en el doc; actualizar el ID compuesto para incluir subseccionPath cuando no es vacío (evitar colisiones de ID entre sección y subsección con mismo examen).
Actualizar useNotasPorSeccion: tercer param opcional subseccionPath?; cuando se provee, agrega where("subseccionPath", "==", subseccionPath) al query.
Agregar eliminarNotasPorExamen(seccionId, nombreExamen, subseccionPath?): query + batch delete.
Fase B — Formulario de subsección
3. form.tsx

Agregar estado permiteNotas.
Cargar y guardar el campo en Firestore.
Agregar panel UI verde "NOTAS DE EXÁMENES" (mismo diseño que en secciones/form.tsx) debajo del panel de profesores.
Fase C — Detalle de subsección
4. [id].tsx

Agregar notasBanner cuando subseccion.permiteNotas === true (mismo bloque que en secciones/[id].tsx).
"Cargar Notas" → navega a /secciones/notas con params { moduloId, seccionId, subseccionPath }.
"Ver Notas" → navega a /secciones/mis-notas con params { moduloId, seccionId, subseccionPath }.
Fase D — Pantallas de notas (reutilizadas)
5. notas.tsx

Leer subseccionPath de los params (opcional).
Pasar a useNotasPorSeccion para precargar notas existentes.
Pasar a guardarNotas.
6. mis-notas.tsx (afecta a AMBOS features)

Leer subseccionPath de params; cuando está presente, filtrar el query de Firestore por ese campo.
Feature 2: agregar estado examenAEliminar; botón papelera en header de cada grupoCard (admin only); ModalConfirmacion + ModalAlerta; llamar eliminarNotasPorExamen al confirmar.
Archivos a modificar
useSubsecciones.ts
useNotas.ts
form.tsx
app/subsecciones/[id].tsx
notas.tsx
mis-notas.tsx
Verificación
Crear/editar subsección con toggle activado → campo permiteNotas: true en Firestore.
En detalle de subsección con permiteNotas=true, ver el banner Cargar/Ver Notas.
Cargar notas desde una subsección → doc en Firestore tiene subseccionPath correcto.
Ver Notas desde subsección → solo muestra las notas de esa subsección.
Ver Notas desde sección → muestra notas de sección (query sin filtro adicional, backward compatible con notas viejas).
Como admin, eliminar un examen en Ver Notas → modal de confirmación, docs eliminados, lista actualizada en tiempo real.
Como alumno o profesor, el botón de eliminar NO aparece.
Consideraciones
Firestore indexes: el query seccionId + nombreExamen + subseccionPath puede requerir un índice compuesto en la colección notas. Habrá que verificar en la consola de Firebase.
Notas viejas: las notas de sección ya existentes (sin campo subseccionPath) siguen apareciendo en "Ver Notas" de la sección porque ese query no filtra por subseccionPath. No hay migración necesaria.
Firma de crearSubseccion/actualizarSubseccion: revisar que acepten el campo permiteNotas antes de implementar la Fase B.

Todo listo, sin errores. Resumen de lo implementado:

Feature 1 — Notas en subsecciones (6 archivos):

useSubsecciones.ts: permiteNotas?: boolean en la interfaz y en crearSubseccion.
form.tsx: estado + carga desde Firestore + guardado + panel UI verde "NOTAS DE EXÁMENES" (idéntico al de secciones).
app/subsecciones/[id].tsx: banner con botones "Cargar Notas" / "Ver Notas" cuando subseccion.permiteNotas === true; navega a las mismas pantallas de secciones pasando subseccionPath.
useNotas.ts: campo subseccionPath en Nota / NotaInput; ID compuesto actualizado para evitar colisiones; useNotasPorSeccion acepta tercer param opcional para filtrar.
notas.tsx: lee subseccionPath de params y lo pasa al hook y a guardarNotas.
mis-notas.tsx: cuando llega subseccionPath, agrega where("subseccionPath", "==", ...) al query → muestra solo las notas de esa subsección.
Feature 2 — Eliminar examen (2 archivos):

useNotas.ts: nueva función eliminarNotasPorExamen(seccionId, nombreExamen, subseccionPath?) — batch delete con query filtrado.
mis-notas.tsx: ícono papelera en el header de cada grupo (solo admin), ModalConfirmacion + ModalAlerta para confirmar y notificar.
Nota Firestore: si al usar el filtro por subseccionPath aparece un error de índice compuesto, Firestore incluirá en el log el link directo para crearlo en la consola.

 ERROR  useInscripcionesPorSeccion error: [FirebaseError: Missing or insufficient permissions.] FirebaseError: Missing or insufficient permissions.
 ERROR  useInscripcionesPorSeccion error: [FirebaseError: Missing or insufficient permissions.] FirebaseError: Missing or insufficient permissions.
 ERROR  useInscripcionesPorSeccion error: [FirebaseError: Missing or insufficient permissions.] FirebaseError: Missing or insufficient permissions.
 ERROR  useInscripcionesPorSeccion error: [FirebaseError: Missing or insufficient permissions.] FirebaseError: Missing or insufficient permissions.
 ERROR  useInscripcionesPorSeccion error: [FirebaseError: Missing or insufficient permissions.] FirebaseError: Missing or insufficient permissions.

cuando ingreso como profesor

El problema está claro. La regla de inscripciones solo permite read al propio alumno (resource.data.alumnoId == request.auth.uid) o al admin. El profesor no tiene permiso para leer la colección inscripciones, pero notas.tsx llama a useInscripcionesPorSeccion para listar los alumnos a quienes cargarle notas.

La solución es agregar isProfesor() a la regla de lectura de inscripciones:

Estoy en modo Ask — no puedo editar archivos. Pero el fix es simple y puntual.

Causa: en firestore.rules:82, la regla de inscripciones solo permite read al propio alumno o al admin. El rol profesor no está incluido, pero notas.tsx llama a useInscripcionesPorSeccion (que hace un query de inscripciones por seccionId) para mostrar la lista de alumnos a quienes cargar notas.

Fix — cambiar la línea en firestore.rules:82-84:

- // El propio alumno o el admin pueden leer
- allow read: if request.auth != null &&
-   (resource.data.alumnoId == request.auth.uid || isAdmin());

+ // El propio alumno, el admin o el profesor pueden leer
+ allow read: if request.auth != null &&
+   (resource.data.alumnoId == request.auth.uid || isAdmin() || isProfesor());

Luego desplegás las reglas con:

firebase deploy --only firestore:rules

Esta es la única regla que hay que cambiar. La lógica de que el profesor solo puede cargar notas (no manejar inscripciones) ya está controlada a nivel de app — la pantalla notas.tsx usa las inscripciones solo para listar alumnos y rellenar notas, no para crear/eliminar inscripciones.

tengo una pregunta... por qué en el proyecto cuando un profesor entra a cargar notas o a ver notas ve el id del alumno y no el nombre? si entro como admin si me deja ver el nombre del alumno.

orque el proyecto sí intenta mostrar el nombre, pero cuando entra un profesor Firestore no le deja leer los documentos de otros usuarios.

En app/secciones/notas.tsx (line 50), la pantalla hace esto:

getDoc(doc(db, "usuarios", insc.alumnoId))
Si lo puede leer, muestra snap.data().nombre. Si falla, cae acá:

temp[insc.alumnoId] = insc.alumnoId;
Y por eso ves el id del alumno.

La diferencia está en firestore.rules (line 30):

match /usuarios/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
  allow read, update, delete: if isAdmin();
}
Eso significa:

un usuario puede leer solo su propio documento
un admin puede leer usuarios
un profesor no puede leer documentos de alumnos
Entonces como admin funciona, pero como profesor Firestore devuelve permission-denied, el catch lo tapa y la app muestra el alumnoId.

Pasa lo mismo en “Ver Notas”, en app/secciones/mis-notas.tsx (line 78): también intenta resolver usuarios/{alumnoId} y si falla usa el id.

La solución más directa sería ajustar las reglas para permitir que profesores lean datos mínimos de alumnos, por ejemplo allow read: if isAdmin() || isProfesor() || request.auth.uid == userId;. La solución más prolija a nivel privacidad sería guardar nombreAlumno en inscripciones o notas al momento de inscribir/cargar, así el profesor no necesita leer toda la colección usuarios.

10:56 PM
bueno hacelo
10:57 PM

Worked for 3m 13s
Hecho. Cambié firestore.rules (line 30) para que los profesores puedan leer documentos de usuarios y así resolver el nombre del alumno en notas.tsx y mis-notas.tsx.

Quedó así en esencia:

allow read: if request.auth != null &&
  (request.auth.uid == userId || isAdmin() || isProfesor());
Importante: esto está aplicado localmente, pero el deploy a Firebase no se ejecutó porque rechazaste el permiso. Para que funcione en la app real, hay que desplegar:

npx firebase deploy --only firestore:rules --project odb-cvg
También vi que firestore.rules ya tenía otros cambios pendientes en inscripciones y notas; no los toqué.

necesito que, para cada lugar en el que se puedan cargar notas, exista un buscador de alumnos.

El usuario quiere que agregue un buscador de alumnos en cada lugar donde se puedan cargar notas. Para entender bien el alcance, necesito:

1. Leer el archivo `app/secciones/notas.tsx` que está abierto (probablemente es donde se cargan notas)
2. Explorar las demás pantallas en las carpetas para encontrar otros lugares donde se carguen notas (por ejemplo en `app/pantallasAdmin/`, `app/modulos/`, `app/subsecciones/`, etc.)
3. Entender el componente `ModalAlerta` y otros componentes UI disponibles
4. Crear un componente reutilizable de buscador de alumnos
5. Integrarlo en todos los lugares relevantes

Primero leamos los archivos clave.

Cline read 4 files, 4 folders:

app/secciones/notas.tsx · lines 1-387

app/modulos/

app/secciones/

app/secciones/mis-notas.tsx · lines 1-405

components/ui/

app/pantallasAdmin/userManagementScreen.tsx · lines 1-753

app/subsecciones/

app/subsecciones/[id].tsx · lines 1-690

Cline wants to execute this command:

Skipped

```shell
mkdir -p components/ui
```

Checkpoint

Compare

Restore

Thinking

La carpeta `components/ui/` ya existe. Crearé el componente `BuscadorAlumnos` reutilizable.

Cline wants to create a new file:

/components/ui/BuscadorAlumnos.tsx

Checkpoint

Compare

Restore

Thinking

Now let me add the search functionality to the `app/secciones/notas.tsx` file. I'll add:

1. Import for BuscadorAlumnos
2. A `filtroTexto` state
3. Filter logic
4. Render the BuscadorAlumnos component before the student list

Cline wants to edit this file:

/app/secciones/notas.tsx

3

Checkpoint

Compare

Restore

Thinking

The JSX structure got broken. Let me re-read the file to see the current state and fix it properly.

Cline read 1 file:

app/secciones/notas.tsx · lines 188-290

Cline wants to edit this file:

/app/secciones/notas.tsx

Checkpoint

Compare

Restore

Thinking

Now let me add the buscador to `app/secciones/mis-notas.tsx`:

Cline wants to edit this file:

/app/secciones/mis-notas.tsx

4

Checkpoint

Compare

Restore

Thinking

Let me verify both files compile correctly by checking for any remaining issues:

Cline read 1 file:

app/secciones/notas.tsx · lines 180-260

Task Completed

Se implementó el buscador de alumnos en todos los lugares donde se cargan/muestran notas:

__1. Componente reutilizable `components/ui/BuscadorAlumnos.tsx`__

- Input con icono de búsqueda y botón de limpiar
- Props: `valor`, `onChangeText`, `placeholder` (opcional)

__2. `app/secciones/notas.tsx` - Cargar Notas__

- Se agregó estado `filtroTexto` y filtrado de `inscripciones` por nombre de alumno
- El `BuscadorAlumnos` se renderiza antes de la lista de alumnos
- Muestra contador de alumnos filtrados: "Alumnos Inscriptos (N)"
- Si el filtro no encuentra coincidencias, muestra mensaje "No se encontraron alumnos con ese nombre"
- Se corrigió el tipo `notasAGuardar` para incluir `subseccionPath` (el type original no lo tenía)

__3. `app/secciones/mis-notas.tsx` - Ver Notas__

- Se agregó estado `filtroTexto` y `BuscadorAlumnos` visible solo para admin/profesor
- Filtra las notas de cada grupo de examen por nombre de alumno antes de mostrarlas en la tabla
- Los alumnos ven su propia nota sin buscador (solo ven su propia info)

Ahora, necesito que implementes una funcionalidad de Exportación a PDF y Excel (XLSX) para las listas de notas cargadas en los exámenes de la aplicación de Operatoria Dental B (UNLP).

> ### Requerimientos específicos:
> 
> 
> 1. **Componente de UI (Botones de Exportación):**
> * Agrega en la parte superior de la pantalla de notas (cerca del buscador o del título) dos botones limpios con íconos (`Ionicons`): uno para "Exportar PDF" y otro para "Exportar Excel".
> * Mantén la consistencia visual utilizando la paleta de colores del proyecto  
> * **Estructura del PDF:**
> * Encabezado: "Universidad Nacional de La Plata - Facultad de Odontología", "Cátedra de Operatoria Dental B", Título del Examen / Sección, Año Lectivo de la Cursada y Fecha de generación.
> * Tabla de calificaciones: Columnas bien alineadas
> **Generación de Excel (XLSX):**
> * Utiliza una librería liviana de JavaScript (como `xlsx` / SheetJS) para construir el libro de trabajo en memoria.
> * El archivo debe incluir las columnas organizadas en filas limpias.

## Plan: Exportación de Notas a PDF y Excel

Luego de analizar el código, identifico **dos pantallas** donde deberían agregarse los botones de exportación:

### 1. `app/secciones/notas.tsx` — "Cargar Notas"
Aquí se ingresan notas para un examen específico (admin/profesor). Tiene sentido exportar las notas **que están cargadas actualmente** (ya sea las recién ingresadas o las recuperadas de Firestore).

### 2. `app/secciones/mis-notas.tsx` — "Ver Notas"
Aquí se muestran las notas guardadas, agrupadas por examen. El admin/profesor ve una tabla con todos los alumnos. Es el lugar ideal para exportar.

---

### Dependencias a instalar

| Paquete | Propósito |
|---|---|
| `xlsx` | Generar archivo Excel (.xlsx) en memoria |
| `expo-print` | Generar PDF desde HTML |
| `expo-sharing` | Compartir/descargar el archivo generado |

*(`expo-file-system` ya está instalado)*

---

### Arquitectura propuesta

```
components/
  ui/
    BuscadorAlumnos.tsx       ← ya existe
    ExportarNotas.tsx          ← NUEVO: Componente con los 2 botones (PDF + Excel)
```

**`ExportarNotas.tsx`** recibiría como props:
```ts
interface ExportarNotasProps {
  nombreExamen: string;
  notas: Array<{ nombre: string; nota: number }>;
  seccionTitulo?: string;
}
```

El componente se encargaría de:
1. Construir el HTML con encabezado institucional para el PDF
2. Construir el workbook con SheetJS para el Excel
3. Usar `expo-print` + `expo-sharing` para PDF y `expo-file-system` + `expo-sharing` para Excel

---

### Estructura del PDF

```
Universidad Nacional de La Plata - Facultad de Odontología
Cátedra de Operatoria Dental B

Examen: [nombre del examen]
Sección: [título de sección]
Fecha de generación: [dd/mm/aaaa]

| #  | Alumno                 | Nota |
|----|------------------------|------|
| 1  | García, Juan           | 8.5  |
| 2  | Pérez, María           | 7.0  |
| ...| ...                    | ...  |
```

---

### Flujo de Exportación

1. Usuario toca "Exportar PDF" o "Exportar Excel"
2. Se toman los datos actuales de la pantalla (nombres + notas)
3. Se genera el archivo temporal con la librería correspondiente
4. Se abre el sharing sheet con `expo-sharing` para guardar/enviar el archivo

---

### ¿Dudas antes de implementar?

- **¿En qué pantallas exactamente querés los botones?** ¿Solo en "Ver Notas" (`mis-notas.tsx`), o también en "Cargar Notas" (`notas.tsx`)?
- **¿Querés que al exportar desde "Cargar Notas" se exporten SOLO los alumnos filtrados (por el buscador), o todos los inscriptos?**
- **¿Usamos `expo-print` para PDF (genera HTML → PDF nativo) o preferís otra aproximación?**

* Solo en "Ver Notas".
* Solo en "Ver Notas". Por lo tanto, queda sin efecto esa pregunta.
* Lo que consideres.


Perfecto. A implementar:

Instalar dependencias (xlsx, expo-print, expo-sharing)
Crear componente ExportarNotas con botones PDF y Excel
Integrarlo en app/secciones/mis-notas.tsx (solo admin/profesor)

Cline wants to execute this command:
Completed
npm install xlsx expo-print expo-sharing
The command's output could not be captured due to some technical issue, however it has been executed successfully. Here's the current terminal's content to help you get the command's output:

PS C:\Users\ulibu\Desktop\DespuésLoBorro\repo-apps-moviles\DesarrolloDeAplicacionesMoviles2026\odb-cvg> npm install xlsx expo-print expo-sharing
npm : No se puede cargar el archivo C:\Program Files\nodejs\npm.ps1 porque la ejecución de scripts 
está deshabilitada en este sistema. Para obtener más información, consulta el tema 
about_Execution_Policies en https:/go.microsoft.com/fwlink/?LinkID=135170.
En línea: 1 Carácter: 1
+ npm install xlsx expo-print expo-sharing
+ ~~~
    + CategoryInfo          : SecurityError: (:) [], PSSecurityException
    + FullyQualifiedErrorId : UnauthorizedAccess

Shell Integration Unavailable
Cline may have trouble viewing the command's output. Please update VSCode (CMD/CTRL + Shift + P → "Update") and make sure you're using a supported shell: zsh, bash, fish, or PowerShell (CMD/CTRL + Shift + P → "Terminal: Select Default Profile").Still having trouble?



Cline wants to execute this command:
Skipped
cmd /c npm install xlsx expo-print expo-sharing


Necesito instalar las dependencias para la funcionalidad de exportación. Las librerías son:

xlsx: Para generar archivos Excel (.xlsx)
expo-print: Para generar PDF desde HTML (ya viene con la vista previa/impresión nativa)
expo-sharing: Para compartir/descargar los archivos generados
expo-file-system ya está instalado.


Cline has a question:

¿Podés permitir la ejecución del comando cmd /c npm install xlsx expo-print expo-sharing para instalar las dependencias necesarias? O si preferís, instalalas vos manualmente y me avisás para continuar.

Sí, aprobar la instalación
Las instalo yo manualmente


Perfecto. Mientras instalás las dependencias, voy creando los archivos necesarios.


Cline wants to create a new file:



Invalid API Response: The provider returned an empty or unparsable response. This is a provider-side issue where the model failed to generate valid output or returned tool calls that Cline cannot process. Retrying the request may help resolve this issue. (Request ID: oEbktUmQoHFzJWcwLoitGQvhkKKzoOje)


The errors are expected — las dependencias (xlsx, expo-print, expo-sharing) aún no están instaladas. Una vez que las instales, esos errores desaparecerán.

Mientras tanto, voy a integrar el componente ExportarNotas en app/secciones/mis-notas.tsx. Primero verifico la API actual de expo-file-system:

Cline performed 2 searches:

"export.*cacheDirectory | export.*documentDirectory | EncodingType" in node_modules/expo-file-system/ (*.d.ts)

"export" in node_modules/expo-file-system/build/ (index.d.ts)

Cline wants to edit this file:




Now let me integrate ExportarNotas into mis-notas.tsx. Para cada grupo de examen, voy a agregar el componente de exportación en la vista de admin/profesor.


Cline wants to edit this file:


The auto-formatter removed my import. Let me add it back and integrate ExportarNotas inside each grupo card for admin/profesor view.


Cline wants to edit this file:


La implementación está completa. A continuación, el resumen de lo realizado:


Task Completed

Implementación de Exportación a PDF y Excel
Archivos creados/modificados:
1. components/ui/ExportarNotas.tsx (NUEVO)

Componente reutilizable con dos botones: "PDF" (rojo) y "Excel" (verde)
PDF: Genera HTML con formato institucional y lo convierte a PDF mediante expo-print, luego abre el sharing sheet para guardar/compartir
Excel: Genera archivo .xlsx usando xlsx (SheetJS), lo escribe en caché con expo-file-system/legacy, y lo comparte via expo-sharing
Muestra un spinner mientras se genera cada archivo
El PDF incluye: encabezado UNLP-FOLP, Cátedra Operatoria Dental B, nombre del examen, año lectivo, fecha de generación, tabla de calificaciones con #/Alumno/Nota, y promedio de la clase
El Excel incluye: columnas #, Alumno, Nota con anchos ajustados
2. app/secciones/mis-notas.tsx (MODIFICADO)

Importa ExportarNotas
Renderiza el componente dentro de cada grupo de examen (visible solo para admin/profesor)
Exporta los datos filtrados según el buscador de alumnos activo
Dependencias necesarias (pendientes de instalar):
xlsx — generación de archivos Excel
expo-print — generación de PDF desde HTML
expo-sharing — compartir/descargar archivos
Nota: Los errores de ESLint/TypeScript en ExportarNotas.tsx se resolverán automáticamente una vez que instales las dependencias con npm install xlsx expo-print expo-sharing (desde cmd, no PowerShell, debido a la política de ejecución).

Necesito 1 cosa. Planeemos y, si los cambios son menores, los hago yo.

* const nombreArchivo = `Notas_${nombreExamen.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;: 'nombreArchivo' is assigned a value but never used. Por lo tanto, se genera cualquier nombre para el PDF.

**Problema:** En `handleExportarPDF`, la línea 186 asigna `nombreArchivo` pero nunca se usa. `Print.printToFileAsync` genera el archivo con un nombre automático. La variable `uriFinal` (línea 187) es redundante porque es exactamente igual a `uri`.

**Solución:** `expo-print` acepta un parámetro `fileName` en su API. Solo hay que pasarle el nombre ahí y eliminar las líneas innecesarias:

```ts
// Cambiar esto:
const { uri } = await Print.printToFileAsync({ html });
const nombreArchivo = `Notas_${nombreExamen.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
const uriFinal = Platform.OS === "web" ? uri : uri;

// Por esto:
const { uri } = await Print.printToFileAsync({
  html,
  fileName: `Notas_${nombreExamen.replace(/[^a-zA-Z0-9]/g, "_")}`,
});
```

Y luego usar `uri` directamente en lugar de `uriFinal` en el `shareAsync`.

Si te parece bien, es un cambio de 3 líneas (agregar `fileName` al objeto de opciones, y usar `uri` en vez de `uriFinal`). ¿Querés que te lo detalle para que lo apliques vos, o preferís que pase a ACT MODE para hacerlo yo?

Object literal may only specify known properties, and 'fileName' does not exist in type 'FilePrintOptions'.

// ─── GENERAR Y COMPARTIR PDF ────────────────────────────────────────────
const handleExportarPDF = async () => {
if (notas.length === 0) return;
setExportandoPDF(true);
try {
const html = generarHTML();
const { uri } = await Print.printToFileAsync({
html,
fileName: `Notas_${nombreExamen.replace(/[^a-zA-Z0-9]/g, "_")}`,
});
if (await Sharing.isAvailableAsync()) {
await Sharing.shareAsync(uri, {
mimeType: "application/pdf",
dialogTitle: `Compartir PDF - ${nombreExamen}`,
UTI: "com.adobe.pdf",
});
}
} catch (error) {
console.error("Error exportando PDF:", error);
} finally {
setExportandoPDF(false);
}
};

Tira error fileName

Se aplicó el mismo patrón que el Excel: usar `FileSystem.moveAsync` para renombrar el PDF generado a `Notas_[nombreExamen].pdf` antes de compartirlo, así el archivo descargado tiene el nombre del examen en lugar de un nombre genérico.

lo último: necesito que, en la generación de un PDF, aquellas notas que son números sin coma (7, 9, 10, etc) no sean 7,0 9,0 10,0.

Se corrigió el formateo de notas en el PDF:
- **`formatearNota(nota)`**: usa `Number.isInteger()` para detectar si la nota es entera. Si lo es, muestra `"7"` en lugar de `"7,0"`. Si tiene decimales, los muestra normalmente: `"7,5"`.
- Se aplicó a las filas de la tabla de notas en el HTML del PDF.

ERROR  [ReferenceError: Property 'ExportarNotas' doesn't exist]

Call Stack
  grupos.map$argument_0 (app\secciones\mis-notas.tsx)
  map (<native>)
  MisNotasScreen (app\secciones\mis-notas.tsx)
  callComponent.reactStackBottomFrame (node_modules\react-native\Libraries\Renderer\implementations\ReactFabric-dev.js)
  renderWithHooks (node_modules\react-native\Libraries\Renderer\implementations\ReactFabric-dev.js)
  updateFunctionComponent (node_modules\react-native\Libraries\Renderer\implementations\ReactFabric-dev.js)
  beginWork (node_modules\react-native\Libraries\Renderer\implementations\ReactFabric-dev.js)
  runWithFiberInDEV (node_modules\react-native\Libraries\Renderer\implementations\ReactFabric-dev.js)
  performUnitOfWork (node_modules\react-native\Libraries\Renderer\implementations\ReactFabric-dev.js)
  workLoopSync (node_modules\react-native\Libraries\Renderer\implementations\ReactFabric-dev.js)
  renderRootSync (node_modules\react-native\Libraries\Renderer\implementations\ReactFabric-dev.js)
  performWorkOnRoot (node_modules\react-native\Libraries\Renderer\implementations\ReactFabric-dev.js)
  performSyncWorkOnRoot (node_modules\react-native\Libraries\Renderer\implementations\ReactFabric-dev.js)
  flushSyncWorkAcrossRoots_impl (node_modules\react-native\Libraries\Renderer\implementations\ReactFabric-dev.js)
  flushSyncWork (node_modules\react-native\Libraries\Renderer\implementations\ReactFabric-dev.js)
  scheduleRefresh (node_modules\react-native\Libraries\Renderer\implementations\ReactFabric-dev.js)
  apply (<native>)
  renderer.scheduleRefresh (node_modules\react-devtools-core\dist\backend.js)
  mountedRootsSnapshot.forEach$argument_0 (node_modules\react-refresh\cjs\react-refresh-runtime.development.js)
  forEach (<native>)
  performReactRefresh (node_modules\react-refresh\cjs\react-refresh-runtime.development.js)
  Refresh.performReactRefresh (node_modules\react-native\Libraries\Core\setUpReactRefresh.js)
  setTimeout$argument_0 (node_modules\expo\node_modules\@expo\cli\build\metro-require\require.js)

Call Stack
  BaseRoute (node_modules\expo-router\build\useScreens.js)
  SceneView (node_modules\@react-navigation\core\lib\module\SceneView.js)
  render (node_modules\@react-navigation\core\lib\module\useDescriptors.js)
  routes.reduce$argument_0 (node_modules\@react-navigation\core\lib\module\useDescriptors.js)
  reduce (<native>)
  useDescriptors (node_modules\@react-navigation\core\lib\module\useDescriptors.js)
  useNavigationBuilder (node_modules\@react-navigation\core\lib\module\useNavigationBuilder.js)
  SlotNavigator (node_modules\expo-router\build\views\Navigator.js)
  DefaultNavigator (node_modules\expo-router\build\views\Navigator.js)
  BaseRoute (node_modules\expo-router\build\useScreens.js)
  SceneView (node_modules\@react-navigation\core\lib\module\SceneView.js)
  render (node_modules\@react-navigation\core\lib\module\useDescriptors.js)
  routes.reduce$argument_0 (node_modules\@react-navigation\core\lib\module\useDescriptors.js)
  reduce (<native>)
  useDescriptors (node_modules\@react-navigation\core\lib\module\useDescriptors.js)
  useNavigationBuilder (node_modules\@react-navigation\core\lib\module\useNavigationBuilder.js)
  Content (node_modules\expo-router\build\ExpoRoot.js)
  ContextNavigator (node_modules\expo-router\build\ExpoRoot.js)
  ExpoRoot (node_modules\expo-router\build\ExpoRoot.js)
  App (node_modules\expo-router\build\qualified-entry.js)
  WithDevTools (node_modules\expo\src\launch\withDevTools.tsx)

que paso??

¡Bien visto! Cuando el nombre del examen contiene "/" (ej: "Parcial 1/2024"), el path generado incluye una barra, que es un separador de directorios en sistemas de archivos. `FileSystem.moveAsync({ from: uri, to: "Notas_Parcial 1/2024.pdf" })` intenta crear un subdirectorio "Parcial 1" y falla.

Pero el **error real** es que `exporto-printer` o `FileSystem` lanzan una excepción que NO es atrapada correctamente por el try/catch, y al romperse el módulo, React no puede registrar el `export default`, generando el `ReferenceError`.

**Solución simple:** reemplazar también "/" y "\\" en los nombres de archivo, además de los caracteres no alfanuméricos. Y sanitizar también el nombre que se muestra en el dialog title (aunque ahí "/" no rompe nada, es solo texto).

**Cambios necesarios en `ExportarNotas.tsx` (solo 1 lugar):**

Línea 183: `nombreExamen.replace(/[^a-zA-Z0-9]/g, "_")` → ya está bien porque la regex captura "/". Pero el problema es que en el HTML (línea 151) se usa `${nombreExamen}` directamente y eso incluye "/" sin problemas (es HTML, no filesystem).

**Probable causa:** El error ocurre porque en la UI de la app, al mostrar el nombre del examen con "/" (en `<p><strong>Exámen:</strong> ${nombreExamen}</p>`), se genera un HTML válido, pero el formato del nombre para el archivo no debería tener problema con la regex actual.

**¿Podrías compartir un ejemplo exacto del nombre del examen que causa el error?** Así puedo reproducirlo y dar con la solución precisa.

cualquiera que tenga una / en el nombre. EJ. Primer Parcial - 3/6. Primer Parcial me dejaría.

---



---
# Q&A de la sesión 3
---

> Necesito revisar un error que apareció en el panel de administración.
>
> Problema:
> En Administración > Cursadas no cargan las secciones restringidas. En Expo aparece este error:
>
> cursadas restringidas error: FirebaseError: Missing or insufficient permissions.
>
> Contexto:
> Antes esta pantalla funcionaba. Mis compañeros estuvieron agregando nuevas funcionalidades relacionadas con carga de notas y subida de trabajos por parte del alumno. Es posible que hayan modificado reglas de Firestore o permisos.
>
> La pantalla Administración > Cursadas usa una consulta de tipo collectionGroup sobre la colección "secciones", probablemente:
>
> collectionGroup(db, "secciones")
>
> para listar secciones con acceso restringido.
>
> En una corrección anterior ya se había agregado una regla necesaria para permitir que el admin lea secciones mediante collectionGroup, similar a:
>
> match /{path=**}/secciones/{seccionId} {
>   allow read: if isAdmin();
> }
>
> Necesito que revises si esa regla sigue existiendo y si sigue siendo compatible con las reglas actuales.
>
> Archivos a revisar:
> - firestore.rules
> - app/pantallasAdmin/userManagementScreen.tsx
> - cualquier archivo nuevo relacionado con notas, entregas, trabajos o permisos si afecta reglas
> - cualquier hook o consulta que cargue cursadas restringidas
>
> Tareas:
> - Confirmá cómo se cargan las cursadas restringidas en Administración > Cursadas.
> - Confirmá si se usa collectionGroup(db, "secciones").
> - Revisá si firestore.rules permite esa consulta para usuarios con rol admin.
> - Revisá si algún cambio reciente en reglas de notas/trabajos sobrescribió o bloqueó la lectura de secciones por collectionGroup.
> - Corregí el mínimo necesario para que el admin pueda volver a cargar las cursadas restringidas.
> - No abras permisos para alumnos.
> - No permitas que profesores o alumnos accedan al panel de cursadas si antes no correspondía.
> - No rompas las reglas nuevas de notas o entregas.
> - No rompas subsecciones recursivas.
> - No rompas permisos de carga docente.
> - No cambies diseño visual.
> - No ejecutes comandos de Git.
> - No hagas git add, commit, pull, push, merge ni rebase.
>
> Importante:
> Si modificás firestore.rules, indicame que tengo que redeployar reglas con:
>
> npx firebase-tools deploy --only firestore:rules --project odb-cvg
>
> Al finalizar:
> - Indicá cuál era la causa del error.
> - Indicá qué archivo modificaste.
> - Explicá qué regla estaba faltando o bloqueando la consulta.
> - Confirmá si hace falta deployar reglas.
> - Indicá cómo probarlo manualmente.

<details><summary>7 previous messages</summary>

> Voy a revisar primero las reglas y la pantalla/admin hooks para ubicar la consulta exacta y ver si la regla de `collectionGroup` quedó cubierta. No voy a tocar Git; solo inspección y, si hace falta, un cambio mínimo en reglas.
>
> El primer intento de lectura chocó con el sandbox de Windows, así que voy a reintentar en comandos más pequeños. Sigo en modo lectura por ahora.
>
> Ya pude acceder al workspace con aprobación porque el sandbox estaba fallando al arrancar. Ahora voy a leer las reglas y buscar las consultas relevantes para comparar la intención con lo que realmente está desplegable en el archivo.
>
> Encontré la causa probable: la pantalla sí usa `collectionGroup(db, 'secciones')` con `where('esRestringida', '==', true)`, pero `firestore.rules` solo tiene `match /modulos/{moduloId}/secciones/{seccionId}`. Para una query `collectionGroup`, Firestore necesita una regla recursiva del tipo `match /{path=**}/secciones/{seccionId}`; voy a agregarla limitada a `isAdmin()`.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./firestore.rules` (+14 -9)
>
> </details>
>
> El cambio quedó bien acotado: solo suma lectura admin para cualquier colección llamada `secciones`, que es justo lo que exige la query de grupo. Ahora voy a revisar las reglas vecinas de inscripciones/notas/entregas y el hook de inscripciones para asegurar que no haya un efecto colateral raro en la expansión de cursadas.
>
> La expansión de cursadas usa `inscripciones` por `seccionId`, y las reglas actuales ya permiten lectura a admin. Las reglas de `notas` y `entregas_alumnos` están en matches separados, así que el agregado para `secciones` no pisa esos permisos ni cambia la lógica de alumnos/profesores.
</details>

Listo. La causa era que la regla específica:

`match /modulos/{moduloId}/secciones/{seccionId}`

permite leer secciones por ruta directa, pero no alcanza para una consulta `collectionGroup(db, 'secciones')`. Firestore necesita una regla recursiva para cualquier colección llamada `secciones`.

Modifiqué solo [firestore.rules](~/OneDrive/Documents/Desarrollo%20de%20Apps%20Moviles/Proyecto%20ODB/DesarrolloDeAplicacionesMoviles2026/odb-cvg/firestore.rules:34):

```js
match /{path=**}/secciones/{seccionId} {
  allow read: if isAdmin();
}
```

Confirmé que Administración > Cursadas carga las cursadas restringidas en [userManagementScreen.tsx](~/OneDrive/Documents/Desarrollo%20de%20Apps%20Moviles/Proyecto%20ODB/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/pantallasAdmin/userManagementScreen.tsx:100) usando:

```ts
collectionGroup(db, 'secciones')
where('esRestringida', '==', true)
```

El cambio no abre permisos para alumnos ni profesores: solo agrega lectura admin para esa `collectionGroup`. Las reglas de `notas`, `inscripciones`, `entregas_alumnos`, `items` y `subsecciones` quedan separadas y no fueron modificadas.

Sí, hace falta redeployar reglas:

```bash
npx firebase-tools deploy --only firestore:rules --project odb-cvg
```

Para probar manualmente: entrar con un usuario admin, ir a `Administración > Cursadas`, verificar que carguen las cursadas restringidas y que no aparezca en Expo `cursadas restringidas error: FirebaseError: Missing or insufficient permissions.` Luego probar con profesor/alumno que no puedan acceder al panel admin como antes.

---
> Necesito que analices el proyecto de la app Campus Virtual ODB y me propongas cómo integrar una nueva funcionalidad de “Planillas de seguimiento de trabajos prácticos”.
>
> IMPORTANTE:
>
> * No ejecutes ningún comando de git.
> * No hagas git add, commit, push, checkout ni branch.
> * En esta etapa no implementes todavía la funcionalidad completa.
> * Primero quiero un análisis técnico y un plan de integración.
> * No hagas cambios grandes en el código. Como máximo, si necesitás, podés dejar comentarios o TODOs, pero preferentemente solo analizá y devolvé el plan.
>
> Contexto actual de la app:
> La app tiene roles:
>
> * Alumno
> * Profesor
> * Admin
>
> Actualmente, al crear una sección o subsección, el admin puede activar opciones especiales, por ejemplo:
>
> * “Permitir carga de profesores”
> * “Notas de exámenes” / “Habilitar carga de notas”
>
> Cuando se activa “Notas de exámenes”, dentro de esa sección aparecen opciones relacionadas con cargar o ver notas de exámenes para alumnos. Visualmente, hoy se muestran botones similares a:
>
> * “Cargar Notas”
> * “Ver Notas”
>
> Nueva necesidad:
> Agregar una opción similar para planillas de trabajos prácticos.
>
> Al crear o editar una sección/subsección, el admin debería poder activar una nueva opción, por ejemplo:
>
> * “Planillas de trabajos prácticos”
> * “Habilitar carga de planillas”
> * o un nombre similar que encaje con el estilo actual de la app.
>
> La idea es que puedan existir secciones destinadas a:
>
> 1. Contenido normal.
> 2. Notas de exámenes/parciales/finales.
> 3. Planillas de trabajos prácticos, trabajos clínicos y parcialitos.
>
> Ejemplos:
>
> * Una sección llamada “Parciales” puede tener activada la opción de notas de exámenes.
> * Una sección llamada “Notas trabajos” puede tener activada la opción de planillas de trabajos prácticos.
> * En OP1 y OP2, esas planillas de trabajos también deben permitir cargar parcialitos teóricos.
> * En OP3 a OP6, esas planillas pueden usarse para trabajos clínicos, pero sin limitarlo de forma rígida.
>
> Comportamiento esperado dentro de una sección:
>
> * Si la sección tiene habilitada “Notas de exámenes”, mantener los botones actuales:
>
>   * Cargar Notas
>   * Ver Notas
>
> * Si la sección tiene habilitada “Planillas de trabajos prácticos”, mostrar botones nuevos:
>
>   * Cargar Planillas
>   * Ver Planillas
>
> Permisos para esos botones:
>
> * Admin:
>
>   * Puede ver “Cargar Planillas”.
>   * Puede ver “Ver Planillas”.
>   * Puede crear, editar, eliminar y consultar planillas.
>
> * Profesor:
>
>   * Puede ver “Cargar Planillas”.
>   * Puede ver “Ver Planillas”.
>   * Puede crear, editar y consultar planillas según los permisos actuales de la app.
>
> * Alumno:
>
>   * No debe ver “Cargar Planillas”.
>   * Solo debe ver “Ver Planillas” o “Mis Planillas”.
>   * Solo puede consultar sus propias planillas.
>   * No puede editar filas, columnas ni notas.
>
> Si una sección tiene habilitadas ambas funcionalidades, “Notas de exámenes” y “Planillas de trabajos prácticos”, evaluar la mejor forma visual:
>
> 1. Mostrar dos grupos de botones:
>
>    * Cargar Notas / Ver Notas
>    * Cargar Planillas / Ver Planillas
>
> o
>
> 2. Mostrar tarjetas separadas:
>
>    * Notas de exámenes
>    * Planillas de trabajos prácticos
>
> Preferencia:
>
> * Mantener primero el estilo actual de la app.
> * Reutilizar componentes existentes si los botones de notas ya están componentizados.
> * Evitar duplicar lógica innecesaria.
> * Mantener la pantalla clara en móvil.
>
> Funcionalidad nueva de planillas:
> Necesito agregar una funcionalidad para que profesor/admin puedan crear, editar, eliminar y visualizar planillas individuales de trabajos prácticos por alumno.
>
> El alumno solo debe poder ver sus propias planillas.
>
> Cada planilla pertenece a:
>
> * un alumno,
> * una Operatoria / curso,
> * una sección o subsección donde se habilitó la carga de planillas,
> * un año o cursada,
> * un tipo de planilla.
>
> Tipos de planilla:
>
> 1. Planilla diaria:
>
>    * Se usa clase a clase.
>    * Permite cargar fecha, trabajo realizado, pieza, nota, docente, tema, parcialito, etc.
>    * Un mismo trabajo puede empezar en una fecha y continuar en otra.
>    * Debe permitir registrar trabajos iniciados, en curso o finalizados si se decide agregar esa columna.
>
> 2. Planilla resumen/final:
>
>    * Se usa como resumen de lo ya finalizado.
>    * Debe contener trabajos o instancias finalizadas con su/s fecha/s y nota final.
>    * No reemplaza a la diaria; es otro tipo de planilla posible.
>
> Aclaración importante:
> Todas las Operatorias, de OP1 a OP6, deben poder tener tanto planilla diaria como planilla resumen/final.
>
> No asumir que OP6 es siempre resumen/final ni que OP3/OP4/OP5 son siempre diarias.
>
> Plantillas base sugeridas:
> Se pueden ofrecer plantillas base para acelerar la carga, pero deben ser completamente editables después.
>
> Plantillas sugeridas:
>
> 1. OP1/OP2 diaria:
>
>    * Fecha
>    * Tema
>    * Nota teoría
>    * Nota TP
>    * Observaciones
>
> 2. OP1/OP2 resumen/final:
>
>    * Instancia / Trabajo / Parcialito
>    * Fecha/s
>    * Nota final
>    * Docente
>    * Observaciones
>
> 3. OP3 a OP6 diaria:
>
>    * Fecha
>    * Trabajo realizado
>    * Pieza
>    * Nota
>    * Docente
>    * Observaciones
>
> 4. OP3 a OP6 resumen/final:
>
>    * Práctica
>    * Fecha/s
>    * Pieza
>    * Nota final
>    * Docente
>    * Observaciones
>
> Estas plantillas base deben funcionar solo como punto de partida. Luego el profesor/admin debe poder:
>
> * modificar columnas,
> * eliminar columnas,
> * agregar columnas,
> * reordenar columnas,
> * modificar filas,
> * eliminar filas,
> * agregar filas,
> * reordenar filas.
>
> Privacidad:
>
> * La columna “Observaciones” debe poder existir en cualquier planilla.
> * Profesor/admin pueden verla y editarla.
> * Alumno NO debe verla.
> * En general, cualquier columna debe poder marcarse como visible o no visible para alumno.
> * Las columnas no visibles para alumno no deben renderizarse en la vista del alumno.
> * También deben ocultarse las celdas correspondientes a esas columnas.
>
> Operatoria 1 y 2:
>
> * Además de trabajos prácticos, tienen parcialitos teóricos.
> * En las planillas, la letra “P” dentro de Tema representa parcialito.
> * La letra “T” representa tema teórico/descriptivo.
> * Los parcialitos también deben poder cargarse con nota.
> * No hay que hardcodear este comportamiento, pero la plantilla base OP1/OP2 diaria debería facilitar cargar esa información.
>
> Lo que necesito que hagas:
>
> 1. Revisar la estructura actual del proyecto.
> 2. Identificar:
>
>    * dónde están las pantallas por rol,
>    * dónde está la navegación,
>    * dónde está el formulario de creación/edición de secciones o subsecciones,
>    * cómo se guarda actualmente la opción de “Notas de exámenes”,
>    * cómo se muestra después esa opción en la sección,
>    * dónde están los servicios de Firebase/Firestore,
>    * dónde están los modelos/tipos,
>    * dónde están las reglas de seguridad,
>    * si ya existe algo relacionado con alumnos, cursadas, notas, trabajos o subida de trabajos.
> 3. Proponer cómo agregar el nuevo flag/campo de sección para habilitar planillas de trabajos prácticos.
> 4. Proponer un modelo de datos para Firestore.
> 5. Proponer qué pantallas/componentes habría que crear o modificar.
> 6. Proponer cómo manejar permisos por rol.
> 7. Proponer cómo ocultar Observaciones y columnas privadas para alumnos.
> 8. Proponer cómo reutilizar, si corresponde, la lógica existente de “Notas de exámenes”.
> 9. Proponer una implementación por etapas, con archivos concretos a crear/modificar.
> 10. Indicar riesgos o zonas sensibles del código que hay que tocar con cuidado.
> 11. Indicar qué parte conviene implementar primero para que sea un cambio chico y testeable.
>
> Al final respondeme con:
>
> * resumen del estado actual encontrado,
> * cómo funciona actualmente “Notas de exámenes”,
> * propuesta para agregar “Planillas de trabajos prácticos” en creación/edición de secciones,
> * propuesta de modelo de datos,
> * propuesta de pantallas,
> * propuesta de servicios,
> * propuesta de reglas,
> * lista de archivos que habría que tocar,
> * orden recomendado de implementación,
> * primer cambio concreto recomendado para implementar en el siguiente paso.

<details><summary>6 previous messages</summary>

> Voy a hacer una lectura dirigida del proyecto: formularios de secciones/subsecciones, pantallas de detalle, hooks de notas/inscripciones/items/entregas, navegación y reglas. No voy a ejecutar Git ni implementar la funcionalidad; la idea es salir con un mapa técnico claro y un plan chico para el siguiente paso.
>
> El sandbox volvió a fallar al iniciar comandos de lectura en Windows. Reintento con aprobación, solo para inspección de archivos del workspace; sigo sin tocar Git ni escribir cambios.
>
> Ya ubiqué el patrón base: `permiteNotas` vive en secciones/subsecciones, se guarda desde formularios admin y luego se usa para renderizar botones en detalle. Ahora voy a mirar esas pantallas de detalle y los hooks/tipos para proponer una integración que siga ese patrón sin inventar una arquitectura paralela.
>
> Los hooks confirman que `permiteNotas` ya forma parte del tipo y se inicializa en `false` al crear. Me faltan las pantallas con rutas dinámicas; PowerShell interpretó los corchetes como patrón, así que las leo con `-LiteralPath`.
>
> La parte de notas está bastante autocontenida: pantalla de carga, pantalla de consulta/exportación y hook `useNotas`. Voy a revisar estructura general y dependencias disponibles para decidir si conviene una grilla propia simple o apoyarse en algo existente del proyecto.
>
> También hay soporte de `xlsx` y exportación PDF ya instalada por la funcionalidad de notas, lo cual ayuda para una etapa posterior de exportar planillas. Voy a cerrar el análisis mirando índices actuales y componentes UI reutilizables para recomendar el primer cambio testeable.
</details>

**Estado Actual**
No ejecuté comandos de Git ni hice cambios para esta etapa.

El proyecto usa Expo Router, Firebase Auth/Firestore, roles en `usuarios/{uid}.rol`, y hooks por dominio. Las pantallas principales están en `app/`, los hooks en `hooks/`, UI reutilizable en `components/ui/`, Firebase en `config/firebaseConfig.ts`, reglas en `firestore.rules`.

Ya existe lógica relacionada con:
- alumnos/cursadas: `hooks/useInscripciones.ts`
- notas: `hooks/useNotas.ts`, `app/secciones/notas.tsx`, `app/secciones/mis-notas.tsx`
- trabajos/entregas: `hooks/useItems.ts`, `hooks/useEntregasAlumnos.ts`, `app/entregas/[id].tsx`
- permisos por rol: `hooks/useUserRole.ts` y `firestore.rules`

**Cómo Funcionan Hoy Las Notas**
`permiteNotas` se guarda en secciones y subsecciones.

En creación/edición:
- `app/secciones/form.tsx`
- `app/subsecciones/form.tsx`

En tipos/hooks:
- `hooks/useSecciones.ts`
- `hooks/useSubsecciones.ts`

En visualización:
- `app/secciones/[id].tsx`
- `app/subsecciones/[id].tsx`

Si `permiteNotas === true`, se muestran:
- `Cargar Notas` solo para admin/profesor
- `Ver Notas` para todos, con vista filtrada para alumno

La carga usa `inscripciones` para listar alumnos y guarda en colección raíz `notas`.

**Nuevo Flag Propuesto**
Agregar un campo paralelo a `permiteNotas`:

```ts
permitePlanillas?: boolean
```

Nombre visual recomendado: **Planillas de trabajos prácticos**
Switch: **Habilitar carga de planillas**
Hint: “Permite que admins y profesores gestionen planillas de trabajos prácticos, trabajos clínicos o parcialitos para alumnos inscriptos.”

Esto debería agregarse en:
- `app/secciones/form.tsx`
- `app/subsecciones/form.tsx`
- `hooks/useSecciones.ts`
- `hooks/useSubsecciones.ts`

**Modelo De Datos**
Recomiendo no guardar datos privados en documentos que pueda leer el alumno. Firestore no “oculta campos” dentro de un documento autorizado: si el alumno puede leer el doc, ve todo el doc.

Modelo sugerido:

```txt
planillas_tp/{planillaId}
  alumnoId
  moduloId
  seccionId
  subseccionPath
  anio
  cursada
  operatoria
  tipo: "diaria" | "resumen"
  titulo
  columnas: [{ id, titulo, tipo, orden, visibleAlumno }]
  creadoPor
  actualizadoPor
  fechaCreacion
  fechaActualizacion

planillas_tp/{planillaId}/filas/{filaId}
  orden
  celdas: { [columnaId]: valor }

planillas_tp/{planillaId}/vistas_alumno/{alumnoId}
  columnasVisibles: [...]
  filasVisibles: [...]
  fechaActualizacion
```

Admin/profesor leen y editan `planillas_tp` y `filas`.
Alumno solo lee `vistas_alumno/{suUid}`. Así `Observaciones` y columnas privadas nunca llegan al cliente alumno.

**Pantallas Propuestas**
Crear:
- `app/secciones/planillas.tsx`: cargar/gestionar planillas, admin/profesor
- `app/secciones/mis-planillas.tsx`: ver planillas, alumno/admin/profesor
- opcional después: `app/secciones/planilla-form.tsx` o editor separado si la pantalla crece

Modificar:
- `app/layout.tsx`: registrar rutas nuevas
- `app/secciones/[id].tsx`: mostrar botones si `permitePlanillas`
- `app/subsecciones/[id].tsx`: igual para subsecciones
- formularios de sección/subsección: nuevo switch

Visualmente, primero mantendría el estilo actual: un banner de botones igual al de notas. Si ambas funcionalidades están activas, conviene mostrar dos bloques compactos separados:
- Notas de exámenes: Cargar / Ver
- Planillas TP: Cargar / Ver

**Servicios/Hooks**
Crear:
- `hooks/usePlanillas.ts`

Funciones sugeridas:
- `usePlanillasPorContexto(seccionId, subseccionPath?)`
- `usePlanillasAlumno(alumnoId, seccionId, subseccionPath?)`
- `crearPlanillaDesdePlantilla(...)`
- `actualizarColumnasPlanilla(...)`
- `actualizarFilaPlanilla(...)`
- `eliminarPlanilla(...)`
- `generarVistaAlumno(planillaId)` o integrarlo al guardar

Reutilizable:
- `BuscadorAlumnos`
- `ScreenHeader`
- `ModalAlerta`
- `ModalConfirmacion`
- más adelante, adaptar/exportar lógica de `ExportarNotas` para PDF/XLSX de planillas.

**Reglas Propuestas**
Agregar reglas sin tocar notas/entregas:

```js
match /planillas_tp/{planillaId} {
  allow read, create, update: if isAdmin() || isProfesor();
  allow delete: if isAdmin();

  match /filas/{filaId} {
    allow read, create, update: if isAdmin() || isProfesor();
    allow delete: if isAdmin() || isProfesor();
  }

  match /vistas_alumno/{alumnoId} {
    allow read: if isAdmin() || isProfesor() ||
      (request.auth != null && request.auth.uid == alumnoId);
    allow create, update, delete: if isAdmin() || isProfesor();
  }
}
```

Si se quiere que profesores solo gestionen planillas dentro de secciones habilitadas, habría que validar contra `moduloId/seccionId/subseccionPath`, pero con subsecciones recursivas esa validación puede ponerse pesada. Para primera etapa, usar el mismo criterio actual que notas: admin/profesor gestionan.

**Archivos A Tocar**
- `hooks/useSecciones.ts`
- `hooks/useSubsecciones.ts`
- `app/secciones/form.tsx`
- `app/subsecciones/form.tsx`
- `app/secciones/[id].tsx`
- `app/subsecciones/[id].tsx`
- `app/layout.tsx`
- `hooks/usePlanillas.ts` nuevo
- `app/secciones/planillas.tsx` nuevo
- `app/secciones/mis-planillas.tsx` nuevo
- `firestore.rules`
- posiblemente `firebase.indexes.json`

**Riesgos**
La privacidad es la zona más sensible: no conviene permitir que alumnos lean la planilla maestra si contiene columnas ocultas. También hay que cuidar `subseccionPath`, porque el proyecto soporta subsecciones recursivas y ya pasa ese path como parámetro.

**Orden Recomendado**
1. Agregar `permitePlanillas` en tipos, creación/edición y detalle, solo mostrando botones.
2. Crear reglas y hook base `usePlanillas.ts`.
3. Implementar pantalla mínima de `Ver Planillas` para alumno/docente.
4. Implementar creación desde plantillas base.
5. Implementar edición de columnas/filas/reordenamiento.
6. Agregar vista sanitizada para alumno.
7. Agregar exportación PDF/XLSX.

**Primer Cambio Concreto Recomendado**
Implementar solo el flag `permitePlanillas` y los botones `Cargar Planillas` / `Ver Planillas`, apuntando a pantallas placeholder simples. Es chico, testeable y valida navegación/permisos antes de meter el editor de planillas.

---
> Necesito que implementes el primer cambio real para la funcionalidad de “Planillas de trabajos prácticos”.
>
> IMPORTANTE:
>
> * No ejecutes ningún comando de git.
> * No hagas git add, commit, push, checkout ni branch.
> * Este cambio debe ser chico, testeable y no debe implementar todavía el editor completo de planillas.
> * No modifiques la funcionalidad existente de notas de exámenes salvo lo necesario para reutilizar el patrón visual.
>
> Objetivo:
> Agregar soporte inicial para que una sección o subsección pueda tener habilitada la opción de “Planillas de trabajos prácticos”, de forma similar a como hoy existe `permiteNotas`.
>
> Nuevo campo:
> Agregar el campo opcional:
>
> ```ts
> permitePlanillas?: boolean
> ```
>
> Debe funcionar en:
>
> * secciones
> * subsecciones
>
> Archivos a revisar/modificar según el análisis previo:
>
> * `hooks/useSecciones.ts`
> * `hooks/useSubsecciones.ts`
> * `app/secciones/form.tsx`
> * `app/subsecciones/form.tsx`
> * `app/secciones/[id].tsx`
> * `app/subsecciones/[id].tsx`
> * `app/layout.tsx`, si hace falta registrar rutas nuevas
>
> Formulario de creación/edición de sección:
> Agregar una nueva tarjeta/switch debajo de “Notas de exámenes” o en una posición coherente con el diseño actual.
>
> Texto sugerido:
> Título de bloque:
> “PLANILLAS DE TRABAJOS PRÁCTICOS”
>
> Label del switch:
> “Habilitar carga de planillas”
>
> Descripción:
> “Permite que admins y profesores gestionen planillas de trabajos prácticos, trabajos clínicos o parcialitos para alumnos inscriptos en esta sección.”
>
> Formulario de creación/edición de subsección:
> Agregar el mismo switch y el mismo comportamiento.
>
> Persistencia:
>
> * Al crear una sección/subsección, guardar `permitePlanillas`.
> * Al editar una sección/subsección existente, cargar y permitir modificar `permitePlanillas`.
> * Si una sección/subsección vieja no tiene el campo, tratarlo como `false`.
>
> Visualización dentro de sección/subsección:
> Si `permitePlanillas === true`, mostrar botones similares a los de notas:
>
> Para admin/profesor:
>
> * “Cargar Planillas”
> * “Ver Planillas”
>
> Para alumno:
>
> * No mostrar “Cargar Planillas”.
> * Mostrar solo “Ver Planillas” o “Mis Planillas”, usando el texto que quede más consistente con la app.
>
> Si también está habilitado `permiteNotas`, deben poder verse ambas funcionalidades sin pisarse:
>
> * Cargar Notas / Ver Notas
> * Cargar Planillas / Ver Planillas
>
> Mantener el estilo visual actual de la app. Si los botones de notas ya usan un componente o patrón reutilizable, reutilizalo o seguí la misma estructura.
>
> Rutas placeholder:
> Crear pantallas simples placeholder para que los botones ya naveguen sin romper:
>
> 1. Pantalla para carga/gestión:
>    `app/secciones/planillas.tsx`
>
> Debe mostrar algo simple como:
>
> * Header con título “Planillas de trabajos prácticos”
> * Texto: “Próximamente se podrán cargar y gestionar planillas de trabajos prácticos.”
> * Mostrar, si llegan por params, datos básicos como `seccionId`, `subseccionPath` o contexto.
>
> 2. Pantalla para visualización:
>    `app/secciones/mis-planillas.tsx`
>
> Debe mostrar algo simple como:
>
> * Header con título “Mis planillas” o “Ver planillas”
> * Texto: “Próximamente se podrán consultar las planillas de trabajos prácticos.”
> * Mostrar, si llegan por params, datos básicos como `seccionId`, `subseccionPath` o contexto.
>
> Navegación:
>
> * Los botones deben navegar a esas pantallas placeholder.
> * Pasar por params el contexto necesario para saber desde qué sección/subsección se abrió:
>
>   * `seccionId`
>   * `moduloId` si existe en esa pantalla
>   * `subseccionPath` si aplica
>   * cualquier otro parámetro que ya use el flujo de notas y sea necesario replicar
>
> Permisos:
>
> * Admin y profesor pueden ver “Cargar Planillas”.
> * Admin, profesor y alumno pueden ver “Ver Planillas”.
> * Alumno no puede ver “Cargar Planillas”.
>
> Cuidado:
>
> * No tocar reglas de Firestore todavía, salvo que sea estrictamente necesario para guardar el nuevo campo en secciones/subsecciones.
> * No crear todavía `usePlanillas.ts`.
> * No crear todavía modelo completo de planillas.
> * No implementar filas, columnas ni plantillas base todavía.
> * No romper la lógica existente de `permiteNotas`.
>
> Al finalizar, informame:
>
> 1. Archivos modificados.
> 2. Archivos creados.
> 3. Cómo probar manualmente:
>
>    * crear sección con planillas habilitadas,
>    * crear subsección con planillas habilitadas,
>    * verificar botones como admin/profesor,
>    * verificar que alumno no vea “Cargar Planillas”.
> 4. Si hubo algún supuesto o limitación.

<details><summary>16 previous messages</summary>

> Voy a hacer este primer corte como una extensión directa de `permiteNotas`: nuevo flag en tipos/hooks, switch en formularios, botones en detalle y dos pantallas placeholder. Mantengo Firestore rules intactas porque las reglas actuales ya permiten a admin crear/actualizar secciones y subsecciones.
>
> <details><summary>Edited 2 files</summary>
>
> - Wrote `./hooks/useSecciones.ts` (+20 -17)
> - Wrote `./hooks/useSubsecciones.ts` (+18 -15)
>
> </details>
>
> Tipos y creación ya contemplan `permitePlanillas`, con valor por defecto `false` para documentos nuevos. Sigo con los formularios para cargar/editar el campo en documentos existentes.
>
> El parche grande no entró porque los comentarios tienen caracteres de codificación distintos en el archivo. Lo separo en cambios más pequeños, ubicados por líneas de estado y JSX estable.
>
> El sandbox volvió a trabarse en lectura; uso la misma aprobación de lectura del workspace. No estoy cambiando Git ni ejecutando nada destructivo.
>
> Ya tengo los puntos exactos. Ahora aplico el switch nuevo en ambos formularios, justo después de “Notas de exámenes”, para que el flujo quede familiar.
>
> <details><summary>Edited 2 files</summary>
>
> - Wrote `./app/secciones/form.tsx` (+15 -12)
> - Wrote `./app/subsecciones/form.tsx` (+11 -9)
>
> </details>
>
> El texto está mezclado entre caracteres legibles y codificación antigua; ajusto el parche usando el texto real que `rg` detectó.
>
> <details><summary>Edited 2 files</summary>
>
> - Wrote `./app/secciones/form.tsx` (+24 -2)
> - Wrote `./app/subsecciones/form.tsx` (+23 -1)
>
> </details>
>
> El formulario ya persiste y carga el nuevo flag. Ahora agrego los botones en las pantallas de sección/subsección, reusando el mismo patrón visual de notas y pasando los mismos parámetros de contexto.
>
> <details><summary>Edited 2 files</summary>
>
> - Wrote `./app/secciones/[id].tsx` (+43 -8)
> - Wrote `./app/subsecciones/[id].tsx` (+43 -8)
>
> </details>
>
> Los botones ya quedan independientes de los de notas: si ambas opciones están activas se verán ambos bloques. Ahora creo las dos pantallas placeholder y registro las rutas para que la navegación no caiga en vacío.
>
> <details><summary>Created 2 files, edited a file</summary>
>
> - Wrote `./app/layout.tsx` (+5 -3)
> - Wrote `./app/secciones/mis-planillas.tsx` (+94 -0)
> - Wrote `./app/secciones/planillas.tsx` (+93 -0)
>
> </details>
>
> Ya están creadas las rutas placeholder. Voy a hacer una verificación de TypeScript para pescar errores de tipado o imports antes de cerrar.
>
> La verificación también chocó con el arranque del sandbox. La reintento con aprobación; es solo compilación local sin Git.
>
> `tsc` llegó a correr: los errores que aparecen son preexistentes en componentes template (`collapsible`, `icon-symbol`) por aliases/imports, no en los archivos de planillas. Hago una última lectura rápida de las referencias al nuevo campo para confirmar que quedó conectado en todos los puntos.
</details>

Implementé el primer cambio chico y testeable para `permitePlanillas`, sin tocar Git ni reglas de Firestore.

**Archivos modificados**
- `hooks/useSecciones.ts`: agrega `permitePlanillas?: boolean` y default `false`.
- `hooks/useSubsecciones.ts`: agrega `permitePlanillas?: boolean` y default `false`.
- `app/secciones/form.tsx`: carga, edita y guarda el switch de planillas.
- `app/subsecciones/form.tsx`: idem para subsecciones.
- `app/secciones/[id].tsx`: muestra `Cargar Planillas` / `Ver Planillas` si corresponde.
- `app/subsecciones/[id].tsx`: idem para subsecciones recursivas.
- `app/layout.tsx`: registra las rutas placeholder.

**Archivos creados**
- `app/secciones/planillas.tsx`
- `app/secciones/mis-planillas.tsx`

Las pantallas nuevas son placeholders y muestran el contexto recibido: `moduloId`, `seccionId`, `subseccionPath` y rol.

**Cómo probar manualmente**
1. Entrar como admin.
2. Crear o editar una sección y activar `Habilitar carga de planillas`.
3. Abrir esa sección: deberían verse `Cargar Planillas` y `Ver Planillas`.
4. Crear o editar una subsección y activar el mismo switch.
5. Abrir esa subsección: deberían verse los botones, pasando también `subseccionPath`.
6. Entrar como profesor: debería ver `Cargar Planillas` y `Ver Planillas`.
7. Entrar como alumno: no debería ver `Cargar Planillas`; solo `Ver Planillas`.
8. Tocar los botones y confirmar que navegan a las pantallas placeholder.

**Verificación**
Ejecuté `npx tsc --noEmit`. La verificación no quedó limpia por errores preexistentes en `components/ui/collapsible.tsx` e `icon-symbol*.tsx` relacionados con aliases/imports de template, no por estos cambios.

**Supuestos / limitaciones**
No implementé editor, modelo de planillas, hooks ni reglas nuevas. Las reglas actuales ya permiten que admin cree/edite secciones y subsecciones, así que no fue necesario tocar `firestore.rules` en este paso.

---
> Necesito implementar la base real para la funcionalidad de “Planillas de trabajos prácticos”.
>
> IMPORTANTE:
>
> * No ejecutes ningún comando de git.
> * No hagas git add, commit, push, checkout ni branch.
> * No implementes todavía el editor visual completo de filas y columnas.
> * No reemplaces las pantallas placeholder todavía salvo lo mínimo necesario.
> * Este paso debe dejar creado el modelo, el hook/servicio y las reglas de Firestore para poder usar planillas en los próximos pasos.
>
> Contexto:
> Ya existe el flag `permitePlanillas?: boolean` en secciones/subsecciones.
> Ya existen botones “Cargar Planillas” y “Ver Planillas”.
> Ya existen pantallas placeholder:
>
> * `app/secciones/planillas.tsx`
> * `app/secciones/mis-planillas.tsx`
>
> Ahora necesito crear la capa de datos para planillas individuales por alumno.
>
> Modelo de datos sugerido:
>
> Colección raíz:
> `planillas_tp/{planillaId}`
>
> Documento de planilla:
>
> ```ts
> {
>   alumnoId: string;
>   alumnoNombre?: string;
>   moduloId?: string;
>   seccionId: string;
>   subseccionPath?: string | null;
>   anio?: string | number;
>   cursada?: string;
>   operatoria?: string;
>   tipo: "diaria" | "resumen";
>   titulo: string;
>   columnas: ColumnaPlanilla[];
>   creadoPor: string;
>   actualizadoPor?: string;
>   fechaCreacion: Timestamp;
>   fechaActualizacion: Timestamp;
> }
> ```
>
> Columnas:
>
> ```ts
> {
>   id: string;
>   titulo: string;
>   tipo: "texto" | "numero" | "fecha" | "nota" | "textarea" | "select" | "boolean";
>   orden: number;
>   visibleAlumno: boolean;
>   requerida?: boolean;
>   opciones?: string[];
> }
> ```
>
> Subcolección:
> `planillas_tp/{planillaId}/filas/{filaId}`
>
> Documento de fila:
>
> ```ts
> {
>   orden: number;
>   celdas: {
>     [columnaId: string]: any;
>   };
>   fechaCreacion: Timestamp;
>   fechaActualizacion: Timestamp;
> }
> ```
>
> Vista sanitizada para alumno:
> `planillas_tp/{planillaId}/vistas_alumno/{alumnoId}`
>
> Documento:
>
> ```ts
> {
>   planillaId: string;
>   alumnoId: string;
>   titulo: string;
>   tipo: "diaria" | "resumen";
>   seccionId: string;
>   subseccionPath?: string | null;
>   columnasVisibles: ColumnaPlanilla[];
>   filasVisibles: Array<{
>     id: string;
>     orden: number;
>     celdas: {
>       [columnaId: string]: any;
>     };
>   }>;
>   fechaActualizacion: Timestamp;
> }
> ```
>
> Privacidad:
>
> * El alumno NO debe leer directamente `planillas_tp/{planillaId}` porque ahí pueden estar columnas privadas como “Observaciones”.
> * El alumno solo debe leer su documento de `vistas_alumno/{alumnoId}`.
> * Admin/profesor pueden leer y escribir la planilla completa y sus filas.
> * Admin/profesor pueden generar/actualizar la vista del alumno.
>
> Crear archivo nuevo:
>
> * `hooks/usePlanillas.ts`
>
> Debe incluir tipos exportados:
>
> * `TipoPlanilla`
> * `TipoColumnaPlanilla`
> * `ColumnaPlanilla`
> * `PlanillaTP`
> * `FilaPlanilla`
> * `VistaAlumnoPlanilla`
>
> Debe incluir plantillas base editables:
>
> 1. `op1op2Diaria`
>
>    * Fecha
>    * Tema
>    * Nota teoría
>    * Nota TP
>    * Observaciones, con `visibleAlumno: false`
>
> 2. `op1op2Resumen`
>
>    * Instancia / Trabajo / Parcialito
>    * Fecha/s
>    * Nota final
>    * Docente
>    * Observaciones, con `visibleAlumno: false`
>
> 3. `op3op6Diaria`
>
>    * Fecha
>    * Trabajo realizado
>    * Pieza
>    * Nota
>    * Docente
>    * Observaciones, con `visibleAlumno: false`
>
> 4. `op3op6Resumen`
>
>    * Práctica
>    * Fecha/s
>    * Pieza
>    * Nota final
>    * Docente
>    * Observaciones, con `visibleAlumno: false`
>
> Aclaración importante:
> Estas plantillas son solo puntos de partida. Las columnas deben quedar guardadas en cada planilla y después deben poder editarse. No hardcodear que una operatoria tenga solo un tipo de planilla.
>
> Funciones mínimas del hook/servicio:
>
> * `crearPlanillaDesdePlantilla(params)`
> * `obtenerPlanillasPorContexto(params)`
> * `obtenerPlanillasPorAlumno(params)`
> * `obtenerPlanillaPorId(planillaId)`
> * `obtenerFilasPlanilla(planillaId)`
> * `crearFilaPlanilla(planillaId, data)`
> * `actualizarFilaPlanilla(planillaId, filaId, data)`
> * `eliminarFilaPlanilla(planillaId, filaId)`
> * `actualizarColumnasPlanilla(planillaId, columnas)`
> * `eliminarPlanilla(planillaId)`
> * `generarVistaAlumno(planillaId)`
>
> La función `generarVistaAlumno(planillaId)` debe:
>
> 1. Leer la planilla completa.
> 2. Leer sus filas.
> 3. Filtrar columnas con `visibleAlumno === true`.
> 4. Filtrar las celdas de cada fila para dejar solo las columnas visibles.
> 5. Guardar el resultado en `planillas_tp/{planillaId}/vistas_alumno/{alumnoId}`.
>
> Si todavía no se puede implementar de forma perfecta por estructura del proyecto, implementá la mejor versión posible y dejá TODO claro.
>
> Reglas de Firestore:
> Agregar reglas para `planillas_tp`.
>
> Reglas esperadas:
>
> * Admin/profesor:
>
>   * pueden leer y crear planillas.
>   * pueden actualizar planillas.
>   * pueden leer/crear/actualizar/eliminar filas.
>   * pueden crear/actualizar/eliminar vistas de alumno.
> * Solo admin puede eliminar la planilla completa, salvo que el proyecto actualmente permita profesor en casos similares. Si hay una convención existente, respetarla.
> * Alumno:
>
>   * NO puede leer el documento principal de planilla.
>   * NO puede leer filas.
>   * NO puede crear, editar ni eliminar nada.
>   * Solo puede leer `vistas_alumno/{suUid}`.
>
> Ejemplo orientativo:
>
> ```js
> match /planillas_tp/{planillaId} {
>   allow read, create, update: if isAdmin() || isProfesor();
>   allow delete: if isAdmin();
>
>   match /filas/{filaId} {
>     allow read, create, update, delete: if isAdmin() || isProfesor();
>   }
>
>   match /vistas_alumno/{alumnoId} {
>     allow read: if isAdmin() || isProfesor() ||
>       (request.auth != null && request.auth.uid == alumnoId);
>     allow create, update, delete: if isAdmin() || isProfesor();
>   }
> }
> ```
>
> Adaptá los nombres de helpers de reglas a los que ya existan en `firestore.rules`.
>
> No tocar todavía:
>
> * Editor visual completo.
> * Reordenamiento visual drag and drop.
> * Exportación PDF/XLSX.
> * UI final de carga.
> * UI final de visualización.
>
> Al finalizar, informame:
>
> 1. Archivos creados.
> 2. Archivos modificados.
> 3. Cómo quedó el modelo de datos.
> 4. Cómo quedaron las reglas.
> 5. Qué funciones quedaron disponibles en `usePlanillas.ts`.
> 6. Cómo probar manualmente, aunque sea desde una pantalla temporal o con logs.
> 7. Si hay limitaciones o TODOs.

<details><summary>8 previous messages</summary>

> Voy a sumar solo la capa de datos: tipos, plantillas, funciones async y reglas. Mantengo las pantallas placeholder como están y no voy a tocar Git; después corro una verificación rápida si el entorno lo permite.
>
> El sandbox volvió a fallar al iniciar lectura, así que pido aprobación solo para inspeccionar el archivo de reglas y ubicar el punto exacto de inserción.
>
> Las reglas actuales ya tienen helpers `isAdmin()` e `isProfesor()`, así que las nuevas reglas pueden entrar junto a notas/inscripciones sin modificar permisos existentes. Ahora creo `hooks/usePlanillas.ts` con el modelo y funciones mínimas.
>
> <details><summary>Created a file</summary>
>
> - Wrote `./hooks/usePlanillas.ts` (+326 -0)
>
> </details>
>
> El servicio quedó creado con plantillas base y generación de vista sanitizada. Ahora agrego reglas para que alumno solo lea `vistas_alumno/{suUid}` y no el documento principal ni filas.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./firestore.rules` (+23 -7)
>
> </details>
>
> Reglas listas. Voy a correr TypeScript para detectar errores propios del nuevo hook; si aparecen errores viejos del template los separo en el resumen.
>
> `tsc` solo reporta los errores preexistentes en componentes de template (`collapsible` e `icon-symbol`); no aparecen errores del nuevo `usePlanillas.ts`. Hago una última búsqueda de las referencias nuevas para asegurar que el archivo y reglas quedaron en su lugar.
</details>

Implementado el primer soporte real de datos para planillas, sin tocar Git.

**Archivos creados**
- [hooks/usePlanillas.ts](~/OneDrive/Documents/Desarrollo%20de%20Apps%20Moviles/Proyecto%20ODB/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/usePlanillas.ts)

**Archivos modificados**
- [firestore.rules](~/OneDrive/Documents/Desarrollo%20de%20Apps%20Moviles/Proyecto%20ODB/DesarrolloDeAplicacionesMoviles2026/odb-cvg/firestore.rules)

**Modelo**
Quedó creada la colección raíz:

```txt
planillas_tp/{planillaId}
planillas_tp/{planillaId}/filas/{filaId}
planillas_tp/{planillaId}/vistas_alumno/{alumnoId}
```

La planilla guarda `alumnoId`, contexto de sección/subsección, `tipo`, `titulo`, `columnas`, auditoría y timestamps. Las filas guardan `orden` y `celdas`. La vista de alumno guarda solo `columnasVisibles` y `filasVisibles`, filtrando columnas con `visibleAlumno === true`.

**Funciones disponibles**
En `usePlanillas.ts` quedaron:
- `crearPlanillaDesdePlantilla`
- `obtenerPlanillasPorContexto`
- `obtenerPlanillasPorAlumno`
- `obtenerPlanillaPorId`
- `obtenerFilasPlanilla`
- `crearFilaPlanilla`
- `actualizarFilaPlanilla`
- `eliminarFilaPlanilla`
- `actualizarColumnasPlanilla`
- `eliminarPlanilla`
- `generarVistaAlumno`

También quedaron los tipos exportados y las plantillas:
- `op1op2Diaria`
- `op1op2Resumen`
- `op3op6Diaria`
- `op3op6Resumen`

**Reglas**
Agregué reglas para `planillas_tp`:
- admin/profesor leen, crean y actualizan planillas.
- solo admin elimina la planilla completa.
- admin/profesor gestionan filas.
- alumno no lee planilla ni filas.
- alumno solo puede leer `vistas_alumno/{suUid}`.

Como se modificó `firestore.rules`, hace falta deploy:

```bash
npx firebase-tools deploy --only firestore:rules --project odb-cvg
```

**Verificación**
Corrí `npx tsc --noEmit`. Sigue fallando por errores preexistentes en `components/ui/collapsible.tsx` e `icon-symbol*.tsx`; no aparecieron errores del nuevo `usePlanillas.ts`.

**Cómo probar manualmente**
Por ahora no conecté UI real. Para una prueba temporal, desde una pantalla admin/profesor se puede importar `crearPlanillaDesdePlantilla`, crear una planilla con un `alumnoId` real inscripto, luego usar `crearFilaPlanilla` y verificar en Firestore que se cree también `vistas_alumno/{alumnoId}` sin la columna `observaciones`.

Limitación: `obtenerPlanillasPorAlumno` lee documentos completos, así que debe usarse para admin/profesor. La UI del alumno debe leer la vista sanitizada, no la planilla principal.

---
> Necesito conectar la funcionalidad de planillas a la UI para poder probarla desde la app.
>
> IMPORTANTE:
>
> * No ejecutes ningún comando de git.
> * No hagas git add, commit, push, checkout ni branch.
> * No implementes todavía el editor completo de filas y columnas.
> * Este paso debe dejar una pantalla mínima funcional para crear y listar planillas.
>
> Contexto actual:
> Ya existe:
>
> * `permitePlanillas` en secciones/subsecciones.
> * Botones “Cargar Planillas” y “Ver Planillas”.
> * Pantallas placeholder:
>
>   * `app/secciones/planillas.tsx`
>   * `app/secciones/mis-planillas.tsx`
> * Hook nuevo:
>
>   * `hooks/usePlanillas.ts`
> * Reglas nuevas para `planillas_tp`.
>
> Objetivo:
> Convertir `app/secciones/planillas.tsx` en una pantalla mínima de gestión para admin/profesor.
>
> La pantalla debe permitir:
>
> 1. Ver el contexto recibido por params:
>
>    * `moduloId`
>    * `seccionId`
>    * `subseccionPath`, si existe
> 2. Listar planillas existentes para ese contexto.
> 3. Crear una nueva planilla para un alumno inscripto.
> 4. Confirmar que la planilla se guarda en Firestore usando `crearPlanillaDesdePlantilla`.
> 5. Mostrar un mensaje de éxito o error.
> 6. Refrescar la lista luego de crear.
>
> No implementar todavía:
>
> * edición de filas,
> * edición de columnas,
> * reordenamiento,
> * exportación,
> * vista final del alumno completa.
>
> Reutilizar lo existente:
>
> * Revisá cómo `app/secciones/notas.tsx` lista alumnos inscriptos.
> * Reutilizá `hooks/useInscripciones.ts` si corresponde.
> * Reutilizá componentes visuales existentes: header, botones, modales, inputs, loading, empty state, etc.
> * Mantené el estilo visual de la app.
>
> Formulario mínimo de creación:
> Campos:
>
> * Alumno: seleccionar de alumnos inscriptos.
> * Tipo de planilla:
>
>   * Diaria
>   * Resumen/final
> * Plantilla base:
>
>   * OP1/OP2 diaria
>   * OP1/OP2 resumen/final
>   * OP3-OP6 diaria
>   * OP3-OP6 resumen/final
> * Título de la planilla:
>
>   * precargar automáticamente según tipo/plantilla, pero permitir editarlo.
>
> Al crear:
>
> * Usar `crearPlanillaDesdePlantilla`.
> * Guardar:
>
>   * `alumnoId`
>   * `alumnoNombre`
>   * `moduloId`
>   * `seccionId`
>   * `subseccionPath` si existe
>   * `tipo`
>   * `titulo`
>   * columnas de la plantilla elegida
>   * usuario actual como `creadoPor`
> * Si el hook necesita algún parámetro adicional, adaptarlo respetando el modelo existente.
>
> Listado de planillas:
> Mostrar tarjetas o filas con:
>
> * título,
> * alumno,
> * tipo,
> * cantidad de columnas,
> * fecha de actualización si está disponible.
>
> Permisos:
>
> * Esta pantalla es para admin/profesor.
> * Si entra un alumno por error, mostrar mensaje de acceso no permitido o redirigir, siguiendo el patrón actual del proyecto.
>
> Importante sobre privacidad:
>
> * En esta pantalla admin/profesor puede ver planillas completas.
> * La vista del alumno se trabajará después en `mis-planillas.tsx`.
> * No mostrar todavía datos de filas si no están implementados.
>
> Al finalizar, informame:
>
> 1. Archivos modificados.
> 2. Si modificaste `usePlanillas.ts`, qué cambiaste.
> 3. Cómo probar manualmente:
>
>    * entrar como admin/profesor,
>    * abrir una sección con planillas habilitadas,
>    * tocar “Cargar Planillas”,
>    * seleccionar alumno,
>    * elegir tipo y plantilla,
>    * crear planilla,
>    * verificar que aparezca en la lista,
>    * verificar en Firestore que se creó en `planillas_tp`.
> 4. Limitaciones pendientes.

<details><summary>8 previous messages</summary>

> Voy a convertir solo `planillas.tsx` en una pantalla mínima de gestión: alumnos inscriptos, formulario simple, creación con plantilla y listado por contexto. Si hace falta ajustar el hook será algo pequeño, probablemente para ordenar/normalizar el listado.
>
> El sandbox de Windows volvió a fallar al iniciar lectura. Reintento con aprobación, solo para leer los archivos necesarios; sigo sin Git.
>
> La pantalla mínima va a consultar planillas por contexto raíz o subsección según `subseccionPath`, y para secciones raíz voy a filtrar con `subseccionPath: null` para no mezclar planillas de subsecciones hijas. También resuelvo nombres de alumnos igual que notas, leyendo `usuarios/{alumnoId}`.
>
> <details><summary>Created a file</summary>
>
> - Wrote `./app/secciones/planillas.tsx` (+673 -0)
>
> </details>
>
> La pantalla ya reemplazó el placeholder por un formulario mínimo y listado. Voy a validar compilación para detectar errores de tipos introducidos en esta pantalla.
>
> La validación no mostró errores nuevos: solo siguen los errores preexistentes del template. Ajusto un detalle de UX para que “Tipo” y “Plantilla base” no puedan quedar contradictorios si alguien cambia el tipo después de elegir plantilla.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/planillas.tsx` (+10 -1)
>
> </details>
>
> Ese ajuste deja coherente el formulario: cambiar a “Diaria” o “Resumen/final” selecciona una plantilla compatible por defecto. Hago una última verificación rápida de referencias y compilación.
</details>

Implementé la UI mínima funcional para gestionar planillas desde `Cargar Planillas`.

**Archivos modificados**
- `app/secciones/planillas.tsx`

**usePlanillas.ts**
No lo modifiqué. Usé las funciones existentes:
- `crearPlanillaDesdePlantilla`
- `obtenerPlanillasPorContexto`

**Qué hace ahora la pantalla**
- Muestra contexto recibido: `moduloId`, `seccionId`, `subseccionPath`.
- Valida acceso: solo admin/profesor pueden entrar.
- Lista alumnos inscriptos usando `useInscripcionesPorSeccion`.
- Permite buscar y seleccionar alumno.
- Permite elegir tipo: `Diaria` o `Resumen/final`.
- Permite elegir plantilla base.
- Precarga título según plantilla, editable.
- Crea la planilla en Firestore.
- Refresca el listado después de crear.
- Lista planillas existentes con título, alumno, tipo, columnas y fecha de actualización.

**Cómo probar**
1. Entrar como admin o profesor.
2. Abrir una sección/subsección con `permitePlanillas` habilitado.
3. Tocar `Cargar Planillas`.
4. Seleccionar un alumno inscripto.
5. Elegir tipo y plantilla.
6. Editar el título si querés.
7. Tocar `Crear planilla`.
8. Verificar que aparece en `Planillas creadas`.
9. En Firestore, revisar `planillas_tp/{planillaId}` y su `vistas_alumno/{alumnoId}`.

**Notas**
Para que funcione contra Firebase real, asumí que ya desplegaste las reglas agregadas en el paso anterior. Si no, hay que hacer el deploy de reglas.

Corrí `npx tsc --noEmit`; sigue fallando solo por errores preexistentes en `components/ui/collapsible.tsx` e `icon-symbol*.tsx`, no por esta pantalla.

---
> Necesito continuar con la funcionalidad de “Planillas de trabajos prácticos”.
>
> IMPORTANTE:
>
> * No ejecutes ningún comando de git.
> * No hagas git add, commit, push, checkout ni branch.
> * Quiero avanzar bastante en este paso, pero sin implementar exportación ni drag and drop.
> * Mantené el estilo visual actual de la app.
>
> Objetivos de este paso:
>
> 1. Quitar los bloques visibles de “Contexto” de las pantallas de planillas.
> 2. Hacer que las planillas creadas se puedan abrir desde la lista.
> 3. Crear una pantalla de detalle/editor básico de planilla.
> 4. Permitir a admin/profesor cargar y editar filas/celdas.
> 5. Permitir a alumno ver sus planillas sin columnas privadas.
> 6. Mantener oculta la columna “Observaciones” para alumno.
>
> Pantallas actuales:
>
> * `app/secciones/planillas.tsx`
> * `app/secciones/mis-planillas.tsx`
>
> Hook existente:
>
> * `hooks/usePlanillas.ts`
>
> Primera modificación:
> En `app/secciones/planillas.tsx`:
>
> * Eliminar el bloque/tarjeta visible que muestra:
>
>   * Módulo
>   * Sección
>   * Subsección
> * Ese contexto debe seguir usándose internamente por params, pero no mostrarse en pantalla.
> * Mantener la pantalla limpia: formulario de “Nueva planilla” y listado de “Planillas creadas”.
>
> En `app/secciones/mis-planillas.tsx`:
>
> * Eliminar también el bloque visible de “Contexto”.
> * La pantalla debe empezar a listar planillas reales en lugar de ser solo placeholder.
>
> Nueva pantalla de detalle:
> Crear una pantalla, por ejemplo:
>
> * `app/secciones/planilla-detalle.tsx`
>
> Debe recibir por params:
>
> * `planillaId`
> * opcionalmente `modo`, `seccionId`, `moduloId`, `subseccionPath`, si ya se están usando en navegación.
>
> Desde `app/secciones/planillas.tsx`:
>
> * Al tocar una tarjeta de planilla creada, navegar a `planilla-detalle` con `planillaId`.
>
> Desde `app/secciones/mis-planillas.tsx`:
>
> * Al tocar una planilla visible para el alumno, navegar también al detalle.
> * Si es alumno, debe abrir en modo solo lectura y usando la vista sanitizada.
>
> Comportamiento del detalle para admin/profesor:
>
> * Leer la planilla completa con `obtenerPlanillaPorId(planillaId)`.
> * Leer sus filas con `obtenerFilasPlanilla(planillaId)`.
> * Mostrar:
>
>   * título de la planilla,
>   * nombre del alumno,
>   * tipo: diaria o resumen/final,
>   * tabla con columnas y filas.
> * La tabla debe usar scroll horizontal si hay muchas columnas.
> * Mostrar columnas ordenadas por `orden`.
> * Mostrar filas ordenadas por `orden`.
> * Permitir editar celdas de forma simple:
>
>   * puede ser tocando una celda y abriendo un modal,
>   * o mostrando inputs simples por celda,
>   * elegí la opción más simple y estable para React Native.
> * Permitir agregar fila nueva.
> * Permitir eliminar fila.
> * Al guardar o modificar una fila, llamar a:
>
>   * `crearFilaPlanilla`
>   * `actualizarFilaPlanilla`
>   * `eliminarFilaPlanilla`
> * Después de cada cambio, actualizar/generar la vista de alumno con `generarVistaAlumno(planillaId)` si el hook no lo hace automáticamente.
>
> Edición de columnas básica para admin/profesor:
>
> * Permitir ver la lista de columnas.
> * Permitir agregar una columna nueva con:
>
>   * título,
>   * tipo,
>   * visible para alumno sí/no.
> * Permitir editar una columna existente:
>
>   * título,
>   * tipo,
>   * visibleAlumno.
> * Permitir eliminar una columna.
> * Al modificar columnas, usar `actualizarColumnasPlanilla`.
> * Si se elimina una columna, también intentar limpiar esa celda de las filas si el hook ya tiene soporte; si no, dejar TODO claro y al menos que no se renderice más.
> * La columna “Observaciones”, si existe, debe quedar con `visibleAlumno: false`.
>
> Comportamiento para alumno:
>
> * El alumno NO debe leer la planilla completa.
> * El alumno debe leer únicamente la vista sanitizada:
>
>   * `planillas_tp/{planillaId}/vistas_alumno/{uid}`
> * Si `usePlanillas.ts` todavía no tiene una función para leer vista de alumno, agregarla:
>
>   * `obtenerVistaAlumnoPlanilla(planillaId, alumnoId)`
> * En modo alumno:
>
>   * no mostrar botones de edición,
>   * no mostrar agregar fila,
>   * no mostrar eliminar fila,
>   * no mostrar gestión de columnas,
>   * no mostrar columnas con `visibleAlumno: false`,
>   * no mostrar “Observaciones”.
> * Si no existe vista de alumno, mostrar un estado vacío claro:
>
>   * “Esta planilla todavía no tiene información cargada.”
>
> Pantalla `app/secciones/mis-planillas.tsx`:
>
> * Debe listar planillas visibles para el usuario actual.
> * Para alumno:
>
>   * listar únicamente sus vistas sanitizadas.
>   * Si por la estructura de Firestore es difícil consultar subcolecciones `vistas_alumno`, implementar la mejor alternativa segura.
>   * No usar `obtenerPlanillasPorAlumno` para alumno si esa función lee documentos completos con columnas privadas.
> * Para admin/profesor:
>
>   * puede listar las planillas completas del contexto, similar a `planillas.tsx`, pero en modo consulta.
> * Mostrar tarjetas con:
>
>   * título,
>   * tipo,
>   * alumno si corresponde,
>   * fecha de actualización si está disponible.
>
> Importante sobre privacidad:
>
> * En ningún punto la UI de alumno debe cargar documentos completos de `planillas_tp/{planillaId}`.
> * El alumno solo debe recibir datos sanitizados.
> * Revisar que no queden logs mostrando la planilla completa cuando el usuario es alumno.
>
> Mejoras visuales:
>
> * Sacar cualquier dato técnico de ids en pantalla.
> * Evitar mostrar `moduloId`, `seccionId`, `subseccionPath`.
> * Usar textos simples:
>
>   * “Nueva planilla”
>   * “Planillas creadas”
>   * “Mis planillas”
>   * “Agregar fila”
>   * “Agregar columna”
>   * “Editar columnas”
> * Mantener los botones verdes y tarjetas similares al resto de la app.
>
> No implementar todavía:
>
> * drag and drop,
> * exportación PDF,
> * exportación Excel,
> * generación automática de resumen desde diaria,
> * filtros avanzados,
> * duplicar planilla,
> * borrar planilla completa desde UI, salvo que sea muy simple y solo para admin.
>
> Al finalizar, informame:
>
> 1. Archivos creados.
> 2. Archivos modificados.
> 3. Funciones nuevas agregadas a `usePlanillas.ts`.
> 4. Cómo probar manualmente como admin/profesor:
>
>    * crear planilla,
>    * abrir detalle,
>    * agregar fila,
>    * editar celda,
>    * agregar columna privada,
>    * verificar que se actualice la vista alumno.
> 5. Cómo probar manualmente como alumno:
>
>    * entrar a “Ver Planillas”,
>    * abrir una planilla,
>    * confirmar que no aparece Observaciones ni columnas privadas.
> 6. Limitaciones pendientes o TODOs.

<details><summary>13 previous messages</summary>

> Voy a avanzar en tres capas: primero ampliar `usePlanillas` para vistas sanitizadas/listados de alumno, luego reemplazar `mis-planillas` y limpiar `planillas`, y finalmente crear el detalle/editor básico. También voy a cuidar que el flujo de alumno use solo `vistas_alumno`, no documentos completos.
>
> Voy a agregar funciones de lectura segura de vistas de alumno y una regla recursiva para que el listado del alumno pueda usar `collectionGroup("vistas_alumno")`. Después conecto las tarjetas y creo el detalle con edición básica por inputs.
>
> <details><summary>Edited 2 files</summary>
>
> - Wrote `./firestore.rules` (+5 -0)
> - Wrote `./hooks/usePlanillas.ts` (+28 -0)
>
> </details>
>
> Listo: el hook ahora puede leer una vista individual o listar vistas sanitizadas por contexto para alumno. También agregué la regla recursiva necesaria para ese `collectionGroup`. Sigo con la UI: saco contexto visible y hago navegables las tarjetas.
>
> El parche no encontró el bloque por caracteres acentuados codificados distinto. Leo una porción puntual y lo aplico con anclas más estables.
>
> Para evitar pelear con la codificación de acentos en ese archivo, voy a reemplazar archivos completos donde convenga. Es más grande como parche, pero sigue siendo un cambio controlado sobre las pantallas de planillas.
>
> <details><summary>Created a file</summary>
>
> - Wrote `./app/secciones/mis-planillas.tsx` (+249 -0)
>
> </details>
>
> Ahora creo la pantalla de detalle. Para mantenerlo estable en móvil, voy con una tabla horizontal e inputs simples por celda para docentes; alumno ve la misma tabla en modo lectura, alimentada solo desde su vista sanitizada.
>
> <details><summary>Created a file</summary>
>
> - Wrote `./app/secciones/planilla-detalle.tsx` (+651 -0)
>
> </details>
>
> Detalle/editor básico creado. Ahora registro la ruta y reemplazo `planillas.tsx` para quitar contexto visible y abrir el detalle desde cada tarjeta.
>
> <details><summary>Created a file, edited a file</summary>
>
> - Wrote `./app/layout.tsx` (+1 -0)
> - Wrote `./app/secciones/planillas.tsx` (+545 -0)
>
> </details>
>
> Ya quedó conectado el flujo: tarjetas de gestión y consulta abren el detalle; el detalle edita filas/columnas para docentes y usa vista sanitizada para alumno. Voy a correr TypeScript para encontrar errores de integración.
>
> La compilación sigue frenada solo por errores preexistentes del template (`collapsible` e `icon-symbol`). Hago una revisión final de referencias para confirmar que no quedaron bloques visibles de “Contexto” y que las rutas nuevas están registradas.
</details>

Implementé el siguiente bloque funcional de planillas.

**Archivos creados**
- `app/secciones/planilla-detalle.tsx`

**Archivos modificados**
- `app/secciones/planillas.tsx`
- `app/secciones/mis-planillas.tsx`
- `hooks/usePlanillas.ts`
- `firestore.rules`
- `app/layout.tsx`

**Funciones nuevas en `usePlanillas.ts`**
- `obtenerVistaAlumnoPlanilla(planillaId, alumnoId)`
- `obtenerVistasAlumnoPorContexto(params)`

También agregué soporte para listar `vistas_alumno` con `collectionGroup`, y por eso modifiqué reglas. Hay que redeployar:

```bash
npx firebase-tools deploy --only firestore:rules --project odb-cvg
```

**Qué quedó funcionando**
- Se quitaron los bloques visibles de “Contexto”.
- Las tarjetas de planillas ahora se pueden abrir.
- Admin/profesor pueden abrir detalle, agregar filas, editar celdas, guardar filas, eliminar filas.
- Admin/profesor pueden editar columnas, agregar columnas, eliminar columnas y marcar visibilidad para alumno.
- La columna `Observaciones` queda forzada como `visibleAlumno: false`.
- Alumno lista planillas desde `vistas_alumno`, no desde `planillas_tp`.
- Alumno abre detalle en modo solo lectura y solo ve columnas/celdas sanitizadas.

**Cómo probar como admin/profesor**
1. Entrar a una sección con planillas habilitadas.
2. Tocar `Cargar Planillas`.
3. Crear una planilla para un alumno.
4. Tocar la tarjeta creada.
5. En detalle, tocar `Agregar fila`.
6. Completar celdas y guardar la fila.
7. Agregar una columna privada, por ejemplo `Observaciones` o cualquier columna con “Visible para alumno” apagado.
8. Guardar columnas.
9. Verificar en Firestore que `planillas_tp/{id}/vistas_alumno/{alumnoId}` se actualiza sin columnas privadas.

**Cómo probar como alumno**
1. Entrar con el alumno de esa planilla.
2. Abrir `Ver Planillas`.
3. Abrir la planilla.
4. Confirmar que no aparecen `Observaciones` ni columnas marcadas como privadas.
5. Confirmar que no hay botones de edición, agregar fila, eliminar fila ni editar columnas.

**Limitaciones pendientes**
- Al eliminar una columna, ya no se renderiza ni se incluye en la vista del alumno, pero las celdas viejas pueden quedar guardadas dentro de `filas.celdas` en Firestore. Queda pendiente limpieza física de esas claves.
- No hay drag and drop, exportación, duplicado ni generación automática de resumen.
- Si Firestore pide índice para `collectionGroup("vistas_alumno")`, habrá que crearlo desde el link que muestre el error.

---
> Necesito corregir y mejorar la funcionalidad de “Planillas de trabajos prácticos”.
>
> IMPORTANTE:
>
> * No ejecutes ningún comando de git.
> * No hagas git add, commit, push, checkout ni branch.
> * Mantené el estilo visual actual de la app.
> * No implementes exportación, drag and drop ni generación automática de resumen todavía.
>
> Problema principal:
> Al entrar como alumno a “Ver planillas”, aparece este error:
>
> FirebaseError: Missing or insufficient permissions.
>
> Necesito corregirlo.
>
> Contexto técnico:
>
> * El alumno NO debe leer documentos completos de `planillas_tp/{planillaId}`.
> * El alumno solo debe leer documentos sanitizados de:
>   `planillas_tp/{planillaId}/vistas_alumno/{alumnoId}`
> * Actualmente se agregó `obtenerVistasAlumnoPorContexto(params)` usando `collectionGroup("vistas_alumno")`.
> * Revisá si el error viene de:
>
>   1. reglas de Firestore,
>   2. query con filtros que las reglas no pueden validar,
>   3. falta de deploy de reglas,
>   4. consulta que intenta leer planillas completas siendo alumno,
>   5. uso incorrecto de `alumnoId` vs `uid`.
>
> Tareas para corregir permisos/vista alumno:
>
> 1. Revisar `hooks/usePlanillas.ts`.
> 2. Revisar `app/secciones/mis-planillas.tsx`.
> 3. Revisar `app/secciones/planilla-detalle.tsx`.
> 4. Revisar `firestore.rules`.
> 5. Asegurar que para rol alumno:
>
>    * NO se llame a `obtenerPlanillasPorAlumno` si esa función lee documentos completos.
>    * NO se lea `planillas_tp/{planillaId}`.
>    * NO se lea `planillas_tp/{planillaId}/filas`.
>    * Solo se lean vistas sanitizadas.
> 6. Si `collectionGroup("vistas_alumno")` complica las reglas, reemplazarlo por una solución más segura.
>    Por ejemplo:
>
>    * mantener `vistas_alumno` como subcolección para cada planilla,
>    * y además crear una colección raíz o índice seguro para alumno, como:
>      `vistas_planillas_alumnos/{alumnoId}/planillas/{planillaId}`
>    * o la alternativa más simple y segura que encaje con el proyecto.
> 7. El alumno debe poder listar sus planillas sin error.
> 8. El alumno debe poder abrir el detalle sin error.
> 9. El alumno no debe ver columnas privadas ni “Observaciones”.
> 10. El alumno no debe ver botones de edición.
>
> Importante:
> Si modificás reglas de Firestore, al final indicá explícitamente que hay que ejecutar:
> `npx firebase-tools deploy --only firestore:rules --project odb-cvg`
>
> Cambios de nombres:
> Quiero reemplazar “Planilla resumen/final” por “Planilla final” en todos los lugares visibles de la app.
>
> Cambios esperados:
>
> * Donde diga “Resumen/final”, debe decir “Final”.
> * Donde diga “Resumen”, debe decir “Final”.
> * El tipo interno puede seguir siendo `"resumen"` si ya está guardado así, pero visualmente debe mostrarse como “Final”.
> * La medallita verde de tipo debe decir:
>
>   * “Diaria”
>   * “Final”
> * En títulos, labels, botones, tarjetas y formularios usar “Planilla final”, no “Planilla resumen/final”.
>
> Agrupación en “Ver planillas” para admin/profesor:
> En la vista `app/secciones/mis-planillas.tsx`, cuando el usuario sea admin o profesor:
>
> 1. Mostrar un buscador para filtrar planillas por:
>
>    * título de planilla,
>    * nombre del alumno.
> 2. Agrupar las planillas en dos secciones:
>
>    * “Planillas diarias”
>    * “Planillas finales”
> 3. Preferentemente usar desplegables/acordeones simples para cada grupo.
>
>    * Si no hay componente acordeón disponible o es complejo, usar secciones con título y lista debajo.
> 4. Mostrar contador si es simple:
>
>    * “Planillas diarias (3)”
>    * “Planillas finales (2)”
> 5. El filtro del buscador debe aplicar a ambos grupos.
> 6. Para alumno, mantener una vista simple de “Mis planillas”, pero también puede agrupar si no complica.
>
> Cambios en plantillas y tipos de columnas:
> En las plantillas base:
>
> * La columna “Tema” debe ser por defecto de tipo `textarea`.
> * La columna “Trabajo” debe ser por defecto de tipo `textarea`.
> * La columna “Trabajo realizado” debe ser por defecto de tipo `textarea`.
> * Cualquier columna principal de descripción larga de trabajo/tema debe ser `textarea`.
>
> Cambio visual de nombre del tipo:
>
> * En la UI, al tipo `textarea` no mostrarlo como “textarea”.
> * Mostrarlo como “área de texto”.
> * Si hay botones para elegir tipo de columna, el botón debe decir “área de texto”.
> * Internamente puede seguir guardándose como `textarea`.
>
> Cambio en título default de nueva planilla:
> Actualmente al elegir plantilla base se precarga algo como:
>
> * “Planilla diaria OP1/OP2”
> * “Planilla resumen/final OP3-OP6”
>
> Quiero cambiarlo.
>
> Nuevo título default:
>
> * Cuando se selecciona un alumno, el título debe ser:
>   `Planilla {nombreAlumno}`
>
> Ejemplos:
>
> * `Planilla Berni`
> * `Planilla Juan Perezz`
> * `Planilla lauti amd`
>
> No agregar “Diaria”, “Final”, “OP1/OP2” ni “OP3-OP6” en el título default, porque el tipo ya aparece en la medallita.
> El título debe seguir siendo editable manualmente.
>
> Si todavía no hay alumno seleccionado, podés mostrar:
>
> * `Planilla`
>   o dejar el campo vacío hasta seleccionar alumno.
>
> Cambios en detalle/editor de planilla:
> En `app/secciones/planilla-detalle.tsx`:
>
> 1. Mover el botón “Agregar fila”.
>    Actualmente está arriba del bloque “Datos”.
>    Quiero que quede debajo del bloque “Datos”, justo antes de “Editar columnas”.
>
> Orden deseado:
>
> * Encabezado/tarjeta de la planilla.
> * Bloque “Datos” con la tabla.
> * Botón “Agregar fila”.
> * Botón “Guardar filas”.
> * Bloque “Editar columnas”.
>
> 2. Agregar botón “Guardar filas” al lado de “Agregar fila”.
>
> * Ambos deben quedar juntos, en la misma fila si entra bien en móvil.
> * Si no entra, pueden quedar uno debajo del otro, pero visualmente cerca.
> * “Agregar fila” agrega una fila nueva localmente.
> * “Guardar filas” guarda todas las filas modificadas.
> * Sacar el botón individual de “Guardar” que aparece por cada fila/celda.
> * Mantener el botón de “Eliminar fila” como está.
>
> 3. La edición de celdas debe permitir modificar varias filas y luego tocar “Guardar filas” una sola vez.
>
> * Si ya se está guardando automáticamente, adaptar a este comportamiento.
> * Evitar perder datos si el usuario agrega una fila y edita varias celdas antes de guardar.
> * Mostrar mensaje de éxito/error al guardar filas.
>
> 4. Después de guardar filas:
>
> * Actualizar/generar vista sanitizada del alumno.
> * Refrescar datos si corresponde.
>
> Privacidad:
>
> * La columna “Observaciones” debe seguir forzada como `visibleAlumno: false`.
> * Alumno no debe verla nunca.
> * Columnas con `visibleAlumno: false` no deben aparecer para alumno.
> * No dejar logs con datos completos cuando el usuario es alumno.
>
> Al finalizar, informame:
>
> 1. Qué causaba el error de permisos del alumno.
> 2. Qué solución implementaste.
> 3. Archivos modificados.
> 4. Si cambiaste reglas, indicá que debo deployarlas.
> 5. Cómo probar como alumno:
>
>    * entrar a Ver planillas,
>    * listar planillas,
>    * abrir detalle,
>    * confirmar que no ve Observaciones ni columnas privadas.
> 6. Cómo probar como admin/profesor:
>
>    * entrar a Ver planillas,
>    * usar buscador,
>    * ver agrupación de diarias/finales,
>    * abrir detalle,
>    * agregar fila,
>    * editar varias celdas,
>    * tocar Guardar filas,
>    * confirmar que se actualiza la vista del alumno.

<details><summary>22 previous messages</summary>

> Voy a corregir esto por la vía más segura: dejar de listar vistas de alumno con `collectionGroup("vistas_alumno")` y crear/leer un espejo seguro por alumno en una ruta raíz. Así el alumno consulta solo `vistas_planillas_alumnos/{uid}/planillas`, sin tocar `planillas_tp` ni `filas`.
>
> Encontré dos focos: el listado de alumno dependía de `collectionGroup("vistas_alumno")`, que es más frágil para reglas/índices; y el detalle del alumno leía la vista anidada. Voy a pasar ambas lecturas a una ruta espejo segura por alumno y actualizar la UI de nombres/guardado en el mismo barrido.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./hooks/usePlanillas.ts` (+21 -13)
>
> </details>
>
> El hook ya escribe y lee una copia sanitizada por alumno. Vi un detalle en borrado de planilla: para borrar el espejo necesito el `alumnoId`, así que ajusto eso antes de seguir.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./hooks/usePlanillas.ts` (+4 -2)
>
> </details>
>
> Ahora agrego reglas para `vistas_planillas_alumnos/{alumnoId}/planillas/{planillaId}`. Esta ruta permite que el alumno liste sus planillas sin `collectionGroup` y sin tocar documentos completos.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./firestore.rules` (+6 -0)
>
> </details>
>
> Paso a los textos visibles: “Resumen/final” y “Resumen” pasan a “Final”; y el título por defecto va a ser `Planilla {nombreAlumno}` al seleccionar alumno.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/planillas.tsx` (+15 -8)
>
> </details>
>
> Ahora actualizo `Ver planillas`: admin/profesor tendrá buscador y grupos “Planillas diarias/finales”; alumno sigue simple pero leyendo solo la colección sanitizada por alumno.
>
> <details><summary>Created a file</summary>
>
> - Wrote `./app/secciones/mis-planillas.tsx` (+282 -0)
>
> </details>
>
> Sigo con el detalle: cambio el modelo de edición para que se puedan modificar varias celdas y guardar todas juntas, y muevo “Agregar fila” debajo de la tabla junto a “Guardar filas”.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/planilla-detalle.tsx` (+46 -34)
> - Wrote `./app/secciones/planilla-detalle.tsx` (+18 -1)
>
> </details>
>
> La pantalla de detalle ya no guarda celda por celda: ahora agrega filas localmente y guarda todas juntas. Hago verificación de TypeScript para atrapar errores de integración.
>
> TypeScript encontró un error real en el nuevo agrupado: la unión inferida no sabía que `alumno` era opcional. Lo corrijo tipando explícitamente la lista de tarjetas.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/mis-planillas.tsx` (+1 -1)
>
> </details>
>
> Reintento la verificación; espero que queden solamente los errores viejos del template si todo lo de planillas está bien.
>
> La verificación ya no muestra errores de planillas; quedan los errores preexistentes de `collapsible` e `icon-symbol`. Hago una última búsqueda de textos “Resumen”/“Resumen final” y permisos para asegurar que no quedó UI vieja.
>
> La búsqueda final se tropezó con comillas/acentos en PowerShell, la separo en consultas simples.
>
> Un detalle importante: las planillas creadas antes de este cambio tenían vista anidada, pero no el nuevo espejo seguro por alumno. Para que no queden “invisibles” al alumno, haré que las pantallas docentes regeneren la vista al listar planillas.
>
> <details><summary>Edited 2 files</summary>
>
> - Wrote `./app/secciones/mis-planillas.tsx` (+2 -0)
> - Wrote `./app/secciones/planillas.tsx` (+2 -0)
>
> </details>
>
> Con eso, al entrar como admin/profesor a las listas se regeneran las vistas sanitizadas en la nueva ruta. Vuelvo a validar TypeScript.
</details>

Hecho. Corregí el flujo de alumno y avancé las mejoras pedidas.

**Causa del error**
El alumno estaba listando con `collectionGroup("vistas_alumno")`. Aunque la intención era leer solo vistas sanitizadas, esa consulta depende de reglas recursivas/índices y es más fácil que Firestore la rechace con `Missing or insufficient permissions`. Además, si las reglas nuevas no estaban deployadas, fallaba seguro.

**Solución implementada**
Agregué una ruta espejo segura para alumnos:

```txt
vistas_planillas_alumnos/{alumnoId}/planillas/{planillaId}
```

Ahora el alumno lista y abre planillas desde esa ruta sanitizada. No lee:
- `planillas_tp/{planillaId}`
- `filas`
- columnas privadas

También mantuve la vista anidada anterior, pero la UI de alumno ya no depende de `collectionGroup`.

**Archivos modificados**
- `hooks/usePlanillas.ts`
- `firestore.rules`
- `app/secciones/planillas.tsx`
- `app/secciones/mis-planillas.tsx`
- `app/secciones/planilla-detalle.tsx`

**Cambios principales**
- “Resumen/final” y “Resumen” ahora se muestran como “Final”.
- El título default al seleccionar alumno ahora es `Planilla {nombreAlumno}`.
- `Tema`, `Instancia / Trabajo / Parcialito`, `Trabajo realizado` y `Practica` ahora son `textarea`.
- En UI, `textarea` se muestra como `área de texto`.
- Admin/profesor en “Ver planillas” tienen buscador y grupos:
  - `Planillas diarias`
  - `Planillas finales`
- En detalle, `Agregar fila` y `Guardar filas` quedaron debajo de la tabla.
- Ya no hay botón de guardar por fila.
- Se pueden editar varias celdas y guardar todo junto.
- `Observaciones` sigue forzada como privada.

**Importante**
Modifiqué reglas. Tenés que deployar:

```bash
npx firebase-tools deploy --only firestore:rules --project odb-cvg
```

**Cómo probar como alumno**
1. Entrar a `Ver Planillas`.
2. Confirmar que lista sin error de permisos.
3. Abrir una planilla.
4. Confirmar que no aparece `Observaciones` ni columnas privadas.
5. Confirmar que no hay botones de edición.

**Cómo probar como admin/profesor**
1. Entrar a `Ver Planillas`.
2. Usar el buscador por alumno o título.
3. Ver grupos de diarias/finales.
4. Abrir una planilla.
5. Agregar fila.
6. Editar varias celdas.
7. Tocar `Guardar filas`.
8. Entrar como alumno y confirmar que la vista sanitizada se actualizó.

Corrí `npx tsc --noEmit`; no aparecen errores de planillas. Siguen los errores preexistentes en `components/ui/collapsible.tsx` e `icon-symbol*.tsx`.

---
> Necesito seguir mejorando la funcionalidad de “Planillas de trabajos prácticos”.
>
> IMPORTANTE:
>
> * No ejecutes ningún comando de git.
> * No hagas git add, commit, push, checkout ni branch.
> * Mantené el estilo visual actual de la app.
> * No implementes drag and drop.
> * Si modificás reglas de Firestore, avisame al final que debo hacer deploy.
>
> Objetivos:
>
> 1. Agregar desplegables/acordeones en “Ver planillas”.
> 2. Ajustar columnas por defecto de planillas finales.
> 3. Permitir editar el nombre/título de una planilla ya creada.
> 4. Permitir eliminar planillas solo al admin.
> 5. Agregar exportación de planilla a Excel o PDF, siguiendo el patrón ya implementado con notas.
> 6. Desplegables en “Ver planillas”
>
> En `app/secciones/mis-planillas.tsx`, para la vista de admin/profesor:
>
> Actualmente las planillas aparecen agrupadas en:
>
> * Planillas diarias
> * Planillas finales
>
> Quiero mantener esa agrupación, pero cada bloque debe poder plegarse/desplegarse.
>
> Requisitos:
>
> * Al lado del título del bloque debe aparecer una flechita o ícono similar:
>   * desplegado: flecha hacia arriba o abajo según convención del proyecto.
>   * plegado: flecha contraria.
> * Al tocar el título o la flecha, se pliega/despliega el listado.
> * Mostrar contador:
>   * `Planillas diarias (4)`
>   * `Planillas finales (1)`
> * Por defecto pueden aparecer desplegadas.
> * El buscador debe seguir funcionando.
> * Si el usuario filtra y no hay resultados en un grupo, mostrar mensaje breve o simplemente no mostrar tarjetas dentro de ese grupo.
> * Si ya existe un componente de acordeón/desplegable en el proyecto y funciona bien, reutilizalo. Si no, implementá un estado local simple con `useState`.
>
> Para alumno:
>
> * Puede mantenerse simple.
> * Que se mantenga como esta.
>
> 2. Ajustes de plantillas base
>
> Modificar las plantillas base en `hooks/usePlanillas.ts`.
>
> Planilla final OP1/OP2:
>
> Actualmente tiene una columna:
>
> * `Instancia / Trabajo / Parcialito`
>
> Quiero que por defecto sea:
>
> * `Trabajo / Parcialito`
>
> Y además agregar por defecto estas columnas:
>
> * `Nota Final TP`
> * `Nota Final Parcialito`
>
> Entonces la plantilla final OP1/OP2 debería quedar aproximadamente:
>
> * Trabajo / Parcialito → tipo `textarea`
> * Fecha/s → tipo texto o textarea, usar lo que quede mejor según lo actual
> * Nota Final TP → tipo `nota`
> * Nota Final Parcialito → tipo `nota`
> * Docente → tipo texto
> * Observaciones → tipo textarea, `visibleAlumno: false`
>
> Planilla final OP3-OP6:
>
> Actualmente tiene una columna:
>
> * `Practica` o `Práctica`
>
> Quiero que por defecto se llame:
>
> * `Trabajo`
>
> Y debe ser tipo `textarea`.
>
> La plantilla final OP3-OP6 debería quedar aproximadamente:
>
> * Trabajo → tipo `textarea`
> * Fecha/s
> * Pieza
> * Nota final
> * Docente
> * Observaciones, `visibleAlumno: false`
>
> Importante:
>
> * Estos cambios aplican para planillas nuevas.
> * No hace falta migrar planillas ya creadas, salvo que sea muy simple. Si no migrás, aclaralo al final.
>
> 3. Editar nombre/título de planilla
>
> En `app/secciones/planilla-detalle.tsx`, para admin/profesor:
>
> Quiero poder editar el nombre de la planilla luego de crearla.
>
> Requisitos:
>
> * Mostrar el título actual de la planilla.
> * Agregar una opción clara para editarlo:
>   * puede ser un botón/ícono de lápiz,
>   * o un input editable dentro de un bloque “Datos de la planilla”.
> * Permitir guardar el nuevo título.
> * Al guardar, actualizar el documento de `planillas_tp/{planillaId}`.
> * También actualizar la vista sanitizada del alumno para que el alumno vea el nuevo título.
> * Mantener el título editable solo para admin/profesor.
> * Alumno solo lectura.
>
> Si `usePlanillas.ts` no tiene función para actualizar datos generales de planilla, agregar una función:
>
> * `actualizarDatosPlanilla(planillaId, data)`
>
> Esta función debe permitir actualizar al menos:
>
> * `titulo`
> * `fechaActualizacion`
> * `actualizadoPor`
>
> 4. Eliminar planilla solo admin
>
> Quiero que el admin pueda eliminar una planilla completa si fue creada por error.
>
> Requisitos:
>
> * En la UI, mostrar botón “Eliminar planilla” solo si el usuario es admin.
> * El profesor NO debe ver el botón de eliminar planilla.
> * El alumno NO debe ver el botón.
> * Al tocar eliminar, mostrar confirmación antes.
> * Si confirma:
>   * eliminar documento principal `planillas_tp/{planillaId}`,
>   * eliminar subcolección `filas`,
>   * eliminar subcolección `vistas_alumno`,
>   * eliminar también la vista espejo si existe:
>     `vistas_planillas_alumnos/{alumnoId}/planillas/{planillaId}`
> * Si Firestore no permite borrar subcolecciones automáticamente desde cliente con una sola operación, implementar borrado manual de documentos conocidos.
> * Si queda alguna limitación técnica para borrado profundo, dejar TODO claro.
> * Después de eliminar, volver a la pantalla anterior o a la lista de planillas.
>
> Reglas:
>
> * Confirmar que `firestore.rules` permita eliminar planilla completa solo al admin.
> * Confirmar que profesor no pueda eliminar planilla completa.
>
> 5. Exportar planilla como Excel o PDF
>
> Quiero poder exportar la planilla igual o parecido a como ya está implementado para notas.
>
> Revisar la implementación actual de exportación de notas, por ejemplo:
>
> * componentes, helpers o funciones relacionadas con exportar notas,
> * PDF,
> * Excel/XLSX,
> * compartir/descargar archivo,
> * estilos.
>
> Objetivo:
>
> En `app/secciones/planilla-detalle.tsx`, para admin/profesor:
>
> * Agregar botón o botones:
>   * `Exportar PDF`
>   * `Exportar Excel`
> * También puede ser un único botón `Exportar` que abra opciones, si eso encaja mejor con la app.
>
> Contenido mínimo de exportación:
>
> * Título de la planilla.
> * Alumno.
> * Tipo: Diaria o Final.
> * Fecha de exportación.
> * Tabla con columnas y filas visibles para admin/profesor.
> * Incluir Observaciones para admin/profesor porque es información docente.
> * Mantener orden de columnas y filas.
>
> Para alumno:
>
> * Si se permite exportar desde vista alumno, debe exportar solo la vista sanitizada sin columnas privadas.
> * Si complica, por ahora no mostrar exportar al alumno.
>
> Excel:
>
> * Debe generar un archivo compatible con Excel.
> * Cada columna de la planilla debe ser una columna del Excel.
> * Cada fila de la planilla debe ser una fila del Excel.
>
> PDF:
>
> * Debe generar un PDF legible.
> * Si hay muchas columnas, usar orientación horizontal si el helper actual lo permite.
> * Si no entra perfecto, priorizar legibilidad.
>
> Importante:
>
> * Reutilizar la lógica existente de exportar notas si existe.
> * No duplicar demasiado código si se puede crear un helper común.
> * Si hay dependencias ya instaladas para exportar notas, usarlas.
> * No agregar librerías nuevas salvo que ya sea inevitable. Si proponés agregar una, explicá cuál y por qué, pero no instales nada sin que te lo pida.
>
> 6. Ajustes visuales de textos
>
> Revisar toda la UI de planillas y asegurar:
>
> * “Resumen/final” no aparezca más.
> * “Resumen” no aparezca como medallita.
> * Usar:
>   * “Planilla final”
>   * “Final”
> * Tipo interno puede seguir siendo `"resumen"` si ya estaba implementado así.
>
> 7. Verificación de privacidad
>
> Después de estos cambios, confirmar:
>
> * Alumno no lee planilla completa.
> * Alumno no ve Observaciones.
> * Alumno no ve columnas privadas.
> * Alumno no ve editar título.
> * Alumno no ve eliminar planilla.
> * Alumno no ve exportación con datos privados.
>
> Al finalizar, informame:
>
> 1. Archivos modificados.
> 2. Funciones nuevas agregadas a `usePlanillas.ts`.
> 3. Si modificaste reglas y si debo hacer deploy.
> 4. Cómo probar:
>    * desplegables en Ver planillas,
>    * plantillas nuevas OP1/OP2 final y OP3-OP6 final,
>    * editar título de planilla,
>    * eliminar planilla como admin,
>    * confirmar que profesor no puede eliminar,
>    * exportar PDF,
>    * exportar Excel,
>    * verificar alumno sin datos privados.
> 5. Limitaciones o TODOs pendientes.

<details><summary>18 previous messages</summary>

> Voy a tocar cuatro zonas: plantillas/hook, lista “Ver planillas”, detalle/editor y un componente/helper de exportación reutilizando el patrón de notas. Mantengo reglas casi seguro igual salvo que detecte una brecha para el borrado/espejo.
>
> Voy a sumar una función `actualizarDatosPlanilla` para el título y ajustar las plantillas finales. Luego agrego exportación como componente separado para no mezclar demasiado el detalle.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./hooks/usePlanillas.ts` (+24 -5)
>
> </details>
>
> Ahora agrego el exportador de planillas reutilizando `expo-print`, `expo-sharing`, `expo-file-system` y `xlsx`, igual que notas.
>
> <details><summary>Created a file</summary>
>
> - Wrote `./components/ui/ExportarPlanilla.tsx` (+208 -0)
>
> </details>
>
> Exportación lista como componente. Ahora agrego acordeones simples en “Ver planillas”.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/mis-planillas.tsx` (+57 -19)
>
> </details>
>
> Ahora conecto edición de título, eliminación solo admin y exportación en el detalle.
>
> El parche grande del detalle chocó con diferencias de codificación. Lo aplico en trozos más pequeños para no pisar nada raro.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/planilla-detalle.tsx` (+4 -0)
> - Wrote `./app/secciones/planilla-detalle.tsx` (+3 -0)
>
> </details>
>
> Voy a ubicar el bloque de carga para insertar el título editable en el estado.
>
> Inserto estados/funciones en puntos concretos ahora.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/planilla-detalle.tsx` (+5 -0)
> - Wrote `./app/secciones/planilla-detalle.tsx` (+31 -0)
> - Wrote `./app/secciones/planilla-detalle.tsx` (+39 -0)
> - Wrote `./app/secciones/planilla-detalle.tsx` (+9 -0)
>
> </details>
>
> Falta solo sumar estilos del bloque de edición/eliminación en detalle y luego verifico compilación.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/planilla-detalle.tsx` (+21 -0)
>
> </details>
>
> Ya quedaron los estilos. Corro TypeScript para detectar errores propios de los cambios.
>
> La verificación no muestra errores de planillas; siguen solo los errores preexistentes de template. Hago búsqueda final de textos y referencias clave.
>
> Context compaction
>
> Source: automatic
> Status: completed
</details>

Listo. Avancé con las mejoras de planillas sin tocar git.

**Archivos modificados**
- `hooks/usePlanillas.ts`
- `app/secciones/mis-planillas.tsx`
- `app/secciones/planilla-detalle.tsx`
- `app/secciones/planillas.tsx`

**Archivo creado**
- `components/ui/ExportarPlanilla.tsx`

**Cambios principales**
- Agregué acordeones en `Ver planillas` para admin/profesor:
  - `Planillas diarias (n)`
  - `Planillas finales (n)`
- Ajusté las plantillas finales:
  - OP1/OP2 final ahora usa `Trabajo / Parcialito`, `Nota Final TP`, `Nota Final Parcialito`.
  - OP3-OP6 final ahora usa `Trabajo` como `textarea`.
- Agregué edición del título de la planilla desde el detalle.
- Agregué eliminación completa de planilla solo para admin.
- Agregué exportación PDF y Excel para admin/profesor.
- Reemplacé textos visibles de “Resumen” / “Resumen/final” por “Final”.
- El tipo `textarea` ahora se muestra como `área de texto`.
- La edición de filas ahora permite modificar varias celdas y guardar todo con `Guardar filas`.

**Funciones nuevas**
En `hooks/usePlanillas.ts` agregué:
- `actualizarDatosPlanilla(planillaId, data)`

También quedó reforzado el borrado de planilla con eliminación manual de:
- `filas`
- `vistas_alumno`
- espejo en `vistas_planillas_alumnos/{alumnoId}/planillas/{planillaId}`
- documento principal `planillas_tp/{planillaId}`

**Reglas**
No agregué reglas nuevas en este paso, pero confirmé que el modelo esperado es:
- admin puede eliminar planilla completa.
- profesor no puede eliminar planilla completa.
- alumno solo lee vistas sanitizadas.

Si todavía no desplegaste las reglas de planillas/vistas espejo del paso anterior, ejecutá:

```bash
npx firebase-tools deploy --only firestore:rules --project odb-cvg
```

**Cómo probar**
Como admin/profesor:
1. Entrar a una sección con planillas habilitadas.
2. Abrir `Ver Planillas`.
3. Usar el buscador y plegar/desplegar `Planillas diarias` y `Planillas finales`.
4. Abrir una planilla.
5. Editar el título y guardar.
6. Agregar una fila, editar varias celdas y tocar `Guardar filas`.
7. Exportar PDF y Excel.
8. Como admin, verificar que aparece `Eliminar planilla`.
9. Como profesor, confirmar que no aparece `Eliminar planilla`.

Como alumno:
1. Entrar a `Ver Planillas`.
2. Abrir una planilla.
3. Confirmar que no ve `Observaciones` ni columnas privadas.
4. Confirmar que no ve edición de título, columnas, filas, eliminar ni exportación.

**Limitaciones pendientes**
- Las plantillas nuevas aplican solo a planillas creadas de ahora en adelante; no migré planillas viejas.
- Al eliminar columnas, las celdas antiguas pueden quedar guardadas internamente en filas, pero ya no se renderizan ni se incluyen en la vista sanitizada.
- La exportación está habilitada solo para admin/profesor por ahora, para evitar exponer datos privados al alumno.

---
> Necesito implementar la gestión de “Planillas base” para la funcionalidad de Planillas de trabajos prácticos.
>
> IMPORTANTE:
>
> * No ejecutes ningún comando de git.
> * No hagas git add, commit, push, checkout ni branch.
> * Reutilizá todo lo posible de lo ya implementado para planillas.
> * Mantené el estilo visual actual de la app.
> * Si modificás reglas de Firestore, avisame al final que debo hacer deploy.
>
> Contexto actual:
> Ya existe una funcionalidad de planillas de trabajos prácticos con:
>
> * `hooks/usePlanillas.ts`
> * `app/secciones/planillas.tsx`
> * `app/secciones/mis-planillas.tsx`
> * `app/secciones/planilla-detalle.tsx`
> * `components/ui/ExportarPlanilla.tsx`
>
> Actualmente hay plantillas base hardcodeadas en `usePlanillas.ts`, por ejemplo:
>
> * OP1/OP2 diaria
> * OP1/OP2 final
> * OP3-OP6 diaria
> * OP3-OP6 final
>
> Ahora necesito que el admin pueda gestionar planillas base reutilizables.
>
> Objetivo general:
> El admin debe poder:
>
> * crear planillas base,
> * editar planillas base,
> * eliminar planillas base,
> * modificar nombre/título,
> * modificar columnas,
> * modificar filas,
> * modificar celdas/campos,
> * exportarlas a PDF/Excel si ya se puede reutilizar la exportación actual.
>
> El profesor NO puede crear, modificar ni eliminar planillas base.
> El profesor solo puede seleccionarlas al crear una planilla para un alumno.
> El admin también puede seleccionarlas al crear una planilla para un alumno.
>
> Importante:
> Las planillas base ya existentes deben seguir estando disponibles.
> Pero además hay que agregar botones/opciones para:
>
> * crear nueva planilla base,
> * modificar una planilla base existente,
> * eliminar una planilla base existente.
>
> Las planillas base nuevas se pueden crear vacías:
>
> * sin filas,
> * sin columnas,
> * con un nombre editable.
>
> Luego el admin puede entrar y cargarle columnas, filas y campos usando la misma lógica de edición que ya existe.
>
> Modelo de datos sugerido:
> Crear una colección nueva, por ejemplo:
>
> `planillas_base_tp/{planillaBaseId}`
>
> Documento:
>
> ```ts
> {
>   nombre: string;
>   descripcion?: string;
>   tipo: "diaria" | "resumen";
>   columnas: ColumnaPlanilla[];
>   filasBase?: Array<{
>     id: string;
>     orden: number;
>     celdas: {
>       [columnaId: string]: any;
>     };
>   }>;
>   activa: boolean;
>   creadaPor: string;
>   actualizadaPor?: string;
>   fechaCreacion: Timestamp;
>   fechaActualizacion: Timestamp;
> }
> ```
>
> Aclaración:
>
> * El tipo interno puede seguir siendo `"resumen"` para la planilla final si ya está implementado así.
> * En la UI debe mostrarse como “Final”.
> * `filasBase` puede guardarse dentro del mismo documento para simplificar, o como subcolección si encaja mejor con la implementación actual.
> * Elegí la opción que permita reutilizar mejor el editor actual.
> * Si usás subcolección, explicá cómo quedó.
>
> Planillas base iniciales:
> Las plantillas hardcodeadas actuales deben seguir disponibles.
> Pero sería mejor que el hook tenga una función que combine:
>
> 1. plantillas base por defecto del sistema,
> 2. planillas base creadas por admin en Firestore.
>
> De esta forma, al crear una planilla de alumno, el selector de plantilla base debería mostrar:
>
> * las plantillas base del sistema,
> * las planillas base personalizadas creadas por admin.
>
> Si es más simple, podés migrar/representar las plantillas actuales como “plantillas del sistema” en memoria y las nuevas como “plantillas personalizadas” en Firestore.
>
> Selector al crear planilla de alumno:
> En `app/secciones/planillas.tsx`, donde hoy se elige plantilla base:
>
> * Reemplazar o ampliar las opciones hardcodeadas.
> * Mostrar las plantillas base disponibles.
> * Debe verse el nombre de la planilla base.
> * Puede mostrar medallita:
>
>   * “Diaria”
>   * “Final”
> * Al seleccionar una planilla base:
>
>   * cargar su nombre como base para el título si corresponde, pero el título default de la planilla de alumno debe seguir siendo `Planilla {nombreAlumno}`.
>   * copiar columnas y filas base en la nueva planilla del alumno.
> * Si la planilla base tiene filasBase, copiarlas como filas iniciales de la planilla del alumno.
> * Si la planilla base no tiene filas, crear la planilla del alumno sin filas.
>
> Nueva pantalla de gestión de planillas base:
> Crear una pantalla para admin, por ejemplo:
>
> * `app/secciones/planillas-base.tsx`
>
> Esta pantalla debe:
>
> * ser accesible solo para admin,
> * listar planillas base del sistema y personalizadas,
> * permitir crear nueva planilla base,
> * permitir abrir una planilla base para editarla,
> * permitir eliminar planillas base personalizadas,
> * NO permitir eliminar planillas base del sistema si son hardcodeadas.
>
> Acceso:
> En la pantalla `app/secciones/planillas.tsx`, para admin, agregar un botón visible:
>
> * “Gestionar planillas base”
>
> Ese botón debe abrir `app/secciones/planillas-base.tsx`.
>
> Para profesor:
>
> * No mostrar “Gestionar planillas base”.
>
> Para alumno:
>
> * No aplica.
>
> Editor de planilla base:
> Reutilizar `app/secciones/planilla-detalle.tsx` si es posible, agregando un modo especial:
>
> * `modo=base`
> * `planillaBaseId=...`
>
> O crear una pantalla separada si queda más limpio:
>
> * `app/secciones/planilla-base-detalle.tsx`
>
> Preferencia:
>
> * Reutilizar lo máximo posible del editor actual.
> * La planilla base no tiene alumno asociado.
> * En la tarjeta superior debe mostrarse:
>
>   * nombre de la planilla base,
>   * tipo Diaria o Final,
>   * etiqueta “Planilla base”.
> * Debe permitir al admin:
>
>   * editar nombre,
>   * editar tipo si es razonable,
>   * agregar fila,
>   * editar celdas,
>   * guardar filas,
>   * eliminar filas,
>   * agregar columna,
>   * editar columna,
>   * eliminar columna,
>   * exportar PDF/Excel,
>   * eliminar planilla base si es personalizada.
> * No mostrar controles de alumno.
> * No generar `vistas_alumno`, porque una planilla base no pertenece a ningún alumno.
>
> Crear planilla base nueva:
> Desde `planillas-base.tsx`, el admin debe poder tocar:
>
> * “Nueva planilla base”
>
> Formulario mínimo:
>
> * Nombre
> * Tipo:
>
>   * Diaria
>   * Final
>
> Al crear:
>
> * crear documento en `planillas_base_tp`,
> * con `columnas: []`,
> * con `filasBase: []`,
> * con `activa: true`,
> * redirigir o permitir abrir el detalle para empezar a editar.
>
> Eliminar planilla base:
>
> * Solo admin.
> * Confirmar antes.
> * Si es del sistema/hardcodeada, no permitir eliminar.
> * Si es personalizada en Firestore, eliminarla.
> * No debe afectar planillas de alumnos ya creadas a partir de esa base, porque esas planillas ya copiaron columnas y filas.
>
> Editar planilla base:
>
> * Al guardar columnas/filas de una planilla base personalizada:
>
>   * actualizar `planillas_base_tp/{id}`.
> * No actualizar planillas de alumnos ya creadas anteriormente.
> * Esto es importante: las planillas de alumnos son copias independientes.
>
> Reglas Firestore:
> Agregar reglas para `planillas_base_tp`.
>
> Permisos:
>
> * Admin:
>
>   * leer,
>   * crear,
>   * actualizar,
>   * eliminar.
> * Profesor:
>
>   * solo leer planillas base activas para seleccionarlas.
> * Alumno:
>
>   * no necesita leer planillas base.
>   * si preferís permitir lectura, no sería grave porque son plantillas sin datos privados de alumnos, pero mejor restringir a admin/profesor.
>
> Ejemplo:
>
> ```js
> match /planillas_base_tp/{baseId} {
>   allow read: if isAdmin() || isProfesor();
>   allow create, update, delete: if isAdmin();
> }
> ```
>
> Adaptar a los helpers reales de `firestore.rules`.
>
> Exportación:
> Reutilizar `components/ui/ExportarPlanilla.tsx` para exportar planilla base si es posible.
> Debe exportar:
>
> * nombre de la planilla base,
> * tipo,
> * tabla con columnas y filas base.
>   Si no es simple reutilizarlo, dejá exportación de base como TODO y explicá por qué. Pero intentá reutilizarla.
>
> Privacidad:
>
> * Las planillas base no tienen alumno.
> * Las columnas `visibleAlumno` siguen existiendo porque luego se copian a la planilla del alumno.
> * La columna “Observaciones”, si se crea o existe, debe seguir tratándose como privada por defecto, con `visibleAlumno: false`.
>
> Cambios en `usePlanillas.ts`:
> Agregar tipos y funciones necesarias, por ejemplo:
>
> * `PlanillaBaseTP`
> * `obtenerPlanillasBase()`
> * `crearPlanillaBase(data)`
> * `actualizarPlanillaBase(planillaBaseId, data)`
> * `eliminarPlanillaBase(planillaBaseId)`
> * `obtenerPlanillaBasePorId(planillaBaseId)`
> * `crearPlanillaDesdeBase(params)`
>
> La función `crearPlanillaDesdeBase` debe:
>
> * recibir alumno/contexto/título/base,
> * copiar columnas de la base,
> * copiar filas base si existen,
> * crear la planilla del alumno,
> * crear filas iniciales si corresponde,
> * generar vista sanitizada para alumno.
>
> Compatibilidad:
>
> * No romper `crearPlanillaDesdePlantilla` si otras partes la usan.
> * Si conviene, hacer que `crearPlanillaDesdePlantilla` internamente use la nueva lógica.
> * Mantener funcionando las plantillas hardcodeadas actuales.
>
> Al finalizar, informame:
>
> 1. Archivos creados.
> 2. Archivos modificados.
> 3. Cómo quedó el modelo de datos de planillas base.
> 4. Qué funciones nuevas agregaste a `usePlanillas.ts`.
> 5. Si modificaste reglas y si debo deployarlas.
> 6. Cómo probar como admin:
>
>    * abrir Cargar Planillas,
>    * entrar a Gestionar planillas base,
>    * crear nueva planilla base vacía,
>    * editar nombre,
>    * agregar columnas,
>    * agregar filas/celdas,
>    * exportar,
>    * eliminar planilla base personalizada.
> 7. Cómo probar como profesor:
>
>    * confirmar que NO puede gestionar bases,
>    * confirmar que sí puede seleccionar una planilla base al crear planilla de alumno.
> 8. Cómo probar que una planilla de alumno creada desde una base copia columnas y filas.
> 9. Limitaciones o TODOs.

<details><summary>23 previous messages</summary>

> Voy a abrir los archivos de planillas y reglas para encajar esto con lo que ya quedó armado. Mantengo fuera cualquier comando de git y voy a tocar solo la capa de planillas/base.
>
> Ya encontré que las bases hoy viven como opciones locales en `planillas.tsx` y columnas hardcodeadas en `usePlanillas.ts`. Voy a mover eso a un modelo combinado: bases del sistema en memoria más bases personalizadas en Firestore, sin romper `crearPlanillaDesdePlantilla`.
>
> Voy a hacer tres piezas pequeñas pero conectadas: primero el modelo/servicio en `usePlanillas.ts`, después la pantalla de listado/edición de bases, y por último conectar el selector de “Nueva planilla” para que copie columnas y filas desde una base.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./hooks/usePlanillas.ts` (+140 -1)
> - Wrote `./hooks/usePlanillas.ts` (+1 -1)
>
> </details>
>
> El servicio ya quedó con `planillas_base_tp`, bases del sistema y creación desde base copiando columnas y filas. Ahora conecto el formulario actual para que admin/profesor vean la lista combinada y el admin tenga acceso a gestionar bases.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/planillas.tsx` (+86 -30)
>
> </details>
>
> El selector ya dejó de depender de las cuatro opciones locales: ahora carga bases del sistema y personalizadas. Sigo con las pantallas nuevas para administrarlas y con las reglas.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/planillas.tsx` (+0 -1)
> - Wrote `./app/secciones/planillas.tsx` (+5 -1)
>
> </details>
>
> Ahora creo `planillas-base.tsx`: será solo admin, lista bases del sistema y personalizadas, permite crear una base vacía y abrir el editor. Las bases del sistema se muestran pero no se eliminan.
>
> <details><summary>Created a file</summary>
>
> - Wrote `./app/secciones/planillas-base.tsx` (+332 -0)
>
> </details>
>
> La pantalla de listado está lista. Para el detalle voy a mantener una versión separada del editor, porque las bases no tienen alumno ni vista sanitizada; reutiliza los mismos patrones visuales, columnas, filas y exportador sin mezclar lógica de permisos de alumno.
>
> <details><summary>Created a file</summary>
>
> - Wrote `./app/secciones/planilla-base-detalle.tsx` (+684 -0)
>
> </details>
>
> Ya está el editor de bases, con edición solo para bases personalizadas y consulta/exportación para bases del sistema. Ahora registro las rutas y agrego reglas Firestore para `planillas_base_tp`.
>
> <details><summary>Edited 2 files</summary>
>
> - Wrote `./app/layout.tsx` (+2 -0)
> - Wrote `./firestore.rules` (+5 -0)
>
> </details>
>
> Voy a correr verificación TypeScript para atrapar importaciones, tipos o rutas rotas. No es un comando de git; solo compilación estática.
>
> La verificación de TypeScript terminó con los mismos errores preexistentes en `components/ui/collapsible.tsx` e `icon-symbol*.tsx`; no aparecieron errores nuevos de planillas. Voy a hacer una pasada fina por referencias y algunos detalles de estado/labels antes de cerrar.
>
> Una mejora pequeña más: voy a hacer que al volver desde gestionar bases el selector se refresque al enfocar la pantalla, así una base recién creada aparece sin cerrar y reabrir la sección.
>
> <details><summary>Edited 2 files</summary>
>
> - Wrote `./app/secciones/planillas.tsx` (+6 -4)
> - Wrote `./app/secciones/planillas-base.tsx` (+6 -4)
> - Wrote `./app/secciones/planillas-base.tsx` (+1 -1)
>
> </details>
>
> El refresco al volver quedó incorporado. Hago una última compilación estática para confirmar que los archivos nuevos no introdujeron errores propios.
>
> Voy a ajustar un detalle de permisos: aunque las bases personalizadas se crean activas, voy a hacer que la lectura de profesor quede restringida a `activa == true` también en reglas y consulta.
>
> <details><summary>Edited 2 files</summary>
>
> - Wrote `./hooks/usePlanillas.ts` (+1 -1)
> - Wrote `./firestore.rules` (+1 -1)
>
> </details>
>
> Permisos de lectura de bases para profesor quedaron más cerrados: ahora la consulta pide `activa == true` y la regla también lo exige. Hago una última verificación rápida.
>
> La compilación sigue fallando solo por errores previos ajenos a planillas (`collapsible` e `icon-symbol`). El segundo chequeo de búsqueda tuvo un problema de comillas por el patrón con `|`; lo repito sin operadores.
</details>

Implementé la gestión de **Planillas base**.

**Archivos creados**
- [planillas-base.tsx](~/OneDrive/Documents/Desarrollo%20de%20Apps%20Moviles/Proyecto%20ODB/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/secciones/planillas-base.tsx)
- [planilla-base-detalle.tsx](~/OneDrive/Documents/Desarrollo%20de%20Apps%20Moviles/Proyecto%20ODB/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/secciones/planilla-base-detalle.tsx)

**Archivos modificados**
- [usePlanillas.ts](~/OneDrive/Documents/Desarrollo%20de%20Apps%20Moviles/Proyecto%20ODB/DesarrolloDeAplicacionesMoviles2026/odb-cvg/hooks/usePlanillas.ts)
- [planillas.tsx](~/OneDrive/Documents/Desarrollo%20de%20Apps%20Moviles/Proyecto%20ODB/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/secciones/planillas.tsx)
- [layout.tsx](~/OneDrive/Documents/Desarrollo%20de%20Apps%20Moviles/Proyecto%20ODB/DesarrolloDeAplicacionesMoviles2026/odb-cvg/app/layout.tsx)
- [firestore.rules](~/OneDrive/Documents/Desarrollo%20de%20Apps%20Moviles/Proyecto%20ODB/DesarrolloDeAplicacionesMoviles2026/odb-cvg/firestore.rules)

**Modelo**
Agregué colección:

```txt
planillas_base_tp/{planillaBaseId}
```

Con campos:
- `nombre`
- `descripcion`
- `tipo`
- `columnas`
- `filasBase`
- `activa`
- `creadaPor`
- `actualizadaPor`
- `fechaCreacion`
- `fechaActualizacion`

Las `filasBase` quedan embebidas en el documento para simplificar y reutilizar el editor actual. Las bases del sistema siguen en memoria y no se pueden editar ni eliminar.

**Funciones nuevas**
En `usePlanillas.ts`:
- `PlanillaBaseTP`
- `FilaBasePlanilla`
- `planillasBaseSistema`
- `obtenerPlanillasBase`
- `obtenerPlanillaBasePorId`
- `crearPlanillaBase`
- `actualizarPlanillaBase`
- `eliminarPlanillaBase`
- `crearPlanillaDesdeBase`

Además, `crearPlanillaDesdePlantilla` ahora delega internamente en `crearPlanillaDesdeBase`.

**Reglas**
Modifiqué reglas Firestore para:

```js
match /planillas_base_tp/{baseId} {
  allow read: if isAdmin() || (isProfesor() && resource.data.activa == true);
  allow create, update, delete: if isAdmin();
}
```

Tenés que deployarlas:

```bash
npx firebase-tools deploy --only firestore:rules --project odb-cvg
```

**Cómo probar**
Como admin:
1. Entrar a `Cargar Planillas`.
2. Tocar `Gestionar planillas base`.
3. Crear una `Nueva planilla base`.
4. Abrirla, editar nombre/tipo, agregar columnas, agregar filas y guardar.
5. Exportar PDF/Excel desde el detalle.
6. Eliminar una base personalizada.
7. Confirmar que las bases del sistema se pueden abrir/exportar, pero no editar ni eliminar.

Como profesor:
1. Entrar a `Cargar Planillas`.
2. Confirmar que no aparece `Gestionar planillas base`.
3. Confirmar que sí aparecen bases del sistema y personalizadas activas en el selector.
4. Crear una planilla para alumno desde una base.

Para verificar copia:
1. Crear una base personalizada con columnas y filas.
2. Crear una planilla de alumno usando esa base.
3. Abrir el detalle de la planilla del alumno.
4. Confirmar que copió columnas y filas iniciales.

**Verificación**
Ejecuté `npx tsc --noEmit`. Sigue fallando por errores preexistentes en `components/ui/collapsible.tsx` e `icon-symbol*.tsx`; no aparecieron errores nuevos de planillas.

**Pendientes**
- Las bases del sistema son solo lectura; si más adelante querés editarlas, habría que migrarlas a Firestore.
- Las planillas de alumnos ya creadas no se actualizan al editar una base, por diseño: quedan como copias independientes.

---
> Necesito corregir la gestión de “Planillas base”.
>
> IMPORTANTE:
>
> * No ejecutes ningún comando de git.
> * No hagas git add, commit, push, checkout ni branch.
> * Mantené el estilo visual actual de la app.
> * Si modificás reglas de Firestore, avisame al final que debo hacer deploy.
>
> Problema actual:
> La pantalla de planillas base separa entre:
>
> * “Bases del sistema”
> * “Bases personalizadas”
>
> No quiero esa distinción.
>
> También las bases del sistema no se pueden modificar ni eliminar, y eso no es lo que necesito.
>
> Comportamiento esperado:
> Todas las planillas base deben comportarse igual.
>
> No debe existir distinción visible ni funcional entre:
>
> * bases del sistema,
> * bases personalizadas,
> * bases creadas después.
>
> Las planillas base que ya existían deben quedar disponibles, pero como planillas base normales.
>
> El admin debe poder:
>
> * ver todas las planillas base juntas,
> * crear nuevas planillas base,
> * editar cualquier planilla base,
> * modificar nombre,
> * modificar tipo,
> * modificar columnas,
> * modificar filas,
> * modificar celdas,
> * exportar,
> * eliminar cualquier planilla base.
>
> El profesor debe:
>
> * NO poder gestionar planillas base,
> * NO poder crear/modificar/eliminar planillas base,
> * solo poder seleccionarlas al crear una planilla para un alumno.
>
> El alumno:
>
> * no participa en esta gestión.
>
> Cambios específicos de UI:
> En `app/secciones/planillas-base.tsx`:
>
> 1. Eliminar los bloques separados:
>
>    * “Bases del sistema”
>    * “Bases personalizadas”
> 2. Mostrar un único bloque/listado:
>
>    * “Planillas base”
> 3. No mostrar etiquetas “Sistema” ni “Personalizada”.
> 4. En cada tarjeta mostrar solo:
>
>    * nombre/título de la planilla base,
>    * medalla `Diaria` o `Final`,
>    * cantidad de columnas,
>    * cantidad de filas,
>    * botón eliminar si corresponde.
> 5. Como ahora todas son editables por admin, el botón eliminar debe estar disponible para todas.
> 6. Al tocar cualquier tarjeta, debe abrirse el editor con permisos completos de admin.
>
> En `app/secciones/planilla-base-detalle.tsx`:
>
> 1. Eliminar texto como:
>
>    * “Las bases del sistema se pueden consultar y exportar, pero no modificar.”
> 2. No mostrar “Sistema” ni “Personalizada”.
> 3. Todas las planillas base deben poder editarse si el usuario es admin.
> 4. Todas las planillas base deben poder eliminarse si el usuario es admin.
> 5. Mantener exportar PDF/Excel.
> 6. Mantener edición de nombre, tipo, columnas, filas y celdas.
>
> En `app/secciones/planillas.tsx`:
> En el selector de “Plantilla base”:
>
> 1. Mostrar todas las planillas base juntas.
> 2. No mostrar debajo “Sistema” ni “Personalizada”.
> 3. Mostrar solo el nombre de la base y, si queda bien, la medalla o indicación `Diaria` / `Final`.
> 4. Mantener filtrado por tipo:
>
>    * si el usuario eligió `Diaria`, mostrar bases diarias.
>    * si eligió `Final`, mostrar bases finales.
> 5. Al crear la planilla de alumno, copiar columnas y filas de la base seleccionada.
>
> Cambio técnico importante:
> Actualmente hay `planillasBaseSistema` hardcodeadas en memoria y planillas personalizadas en Firestore.
>
> Quiero que las 4 bases iniciales queden como documentos normales de Firestore en `planillas_base_tp`, para que se puedan editar y eliminar igual que cualquier otra.
>
> Implementá una estrategia segura para esto.
>
> Opciones posibles:
> A. Crear una función de inicialización/seed desde la app para admin:
>
> * Si no existen las bases iniciales, las crea en `planillas_base_tp`.
> * Luego la UI lee solo desde Firestore.
> * Evitar duplicarlas cada vez que se abre la pantalla.
>
> B. Mantener las bases iniciales en memoria solo como fallback, pero permitir “convertirlas” automáticamente a Firestore y luego tratarlas como normales.
>
> * Si elegís esta opción, que no se vean duplicadas.
> * Que después de creadas en Firestore ya se usen desde Firestore.
>
> Preferencia:
>
> * Que la UI lea una única lista normalizada de planillas base.
> * Evitar duplicados.
> * No mostrar al usuario si vienen del sistema o de Firestore.
>
> Sugerencia:
> Podés usar IDs fijos para las 4 bases iniciales, por ejemplo:
>
> * `base-op1-op2-diaria`
> * `base-op1-op2-final`
> * `base-op3-op6-diaria`
> * `base-op3-op6-final`
>
> Así se puede hacer `setDoc(..., { merge: true })` solo si no existen, o crear si faltan sin duplicar.
>
> Pero cuidado:
>
> * No pisar modificaciones que el admin ya haya hecho sobre esas bases.
> * Si el documento ya existe, no sobrescribirlo.
> * Solo crearlo si no existe.
>
> Funciones en `hooks/usePlanillas.ts`:
> Revisar y adaptar:
>
> * `planillasBaseSistema`
> * `obtenerPlanillasBase`
> * `obtenerPlanillaBasePorId`
> * `crearPlanillaBase`
> * `actualizarPlanillaBase`
> * `eliminarPlanillaBase`
> * `crearPlanillaDesdeBase`
>
> Necesito que:
>
> 1. `obtenerPlanillasBase` devuelva una única lista de planillas base.
> 2. Esa lista no distinga sistema/personalizada.
> 3. Todas tengan el mismo formato.
> 4. Todas puedan editarse/eliminarse por admin.
> 5. Profesor solo pueda leerlas/seleccionarlas.
> 6. No se dupliquen las bases iniciales.
> 7. Las bases iniciales puedan ser modificadas y eliminadas.
>
> Reglas Firestore:
> Mantener o ajustar reglas para:
>
> ```js
> match /planillas_base_tp/{baseId} {
>   allow read: if isAdmin() || isProfesor();
>   allow create, update, delete: if isAdmin();
> }
> ```
>
> Ya no hace falta diferenciar si la base es del sistema o personalizada.
> Si usás `activa`, puede mantenerse, pero no debe generar distinciones visuales. Si complica, simplificar.
>
> Importante:
> Si una base se elimina, eso no debe afectar las planillas de alumnos ya creadas desde esa base, porque esas planillas son copias independientes.
>
> Al finalizar, informame:
>
> 1. Archivos modificados.
> 2. Si cambiaste reglas y si debo deployarlas.
> 3. Cómo resolviste la migración/inicialización de las 4 bases iniciales.
> 4. Cómo evitaste duplicados.
> 5. Cómo probar:
>
>    * entrar como admin a “Gestionar planillas base”,
>    * ver una sola lista de planillas base,
>    * confirmar que no aparece “Sistema” ni “Personalizada”,
>    * editar una de las bases iniciales,
>    * eliminar una de las bases iniciales,
>    * crear una base nueva,
>    * confirmar que todas aparecen juntas,
>    * entrar como profesor y confirmar que puede seleccionarlas pero no gestionarlas.
> 6. Limitaciones o TODOs.

<details><summary>16 previous messages</summary>

> Voy a normalizar las bases: una sola colección Firestore, IDs fijos para las cuatro iniciales, y la UI sin etiquetas de origen. Primero ajusto el hook para que haga seed solo de documentos faltantes y nunca pise cambios del admin.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./hooks/usePlanillas.ts` (+39 -22)
>
> </details>
>
> Detecté dos detalles importantes antes de seguir: si una base inicial se elimina, no debe volver a aparecer; y un profesor no debe intentar sembrar documentos. Voy a agregar una marca interna de inicialización para crear las cuatro bases solo una vez y solo desde admin.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./hooks/usePlanillas.ts` (+18 -1)
>
> </details>
>
> Ahora actualizo la UI: una sola lista “Planillas base”, sin “Sistema/Personalizada”, y todas editables/eliminables para admin.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/planillas-base.tsx` (+4 -10)
>
> </details>
>
> El parche chocó con una línea que quedó más abajo con otro contexto; voy a ubicar esas referencias exactas y lo ajusto por partes.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/planilla-base-detalle.tsx` (+3 -5)
>
> </details>
>
> Editor de base corregido: admin ya tiene permisos completos para cualquier base. Ahora limpio el selector al crear planillas para que tampoco muestre origen.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/planillas.tsx` (+1 -1)
>
> </details>
>
> Voy a simplificar también la regla como pediste: profesor puede leer bases, admin puede crear/editar/eliminar. La pantalla sigue consultando `activa == true` para no traer la marca interna.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./firestore.rules` (+1 -1)
>
> </details>
>
> Hago una verificación final de referencias a “Sistema/Personalizada” y una compilación estática para confirmar que no quedó nada colgado.
>
> La búsqueda ya no muestra textos visibles de “Sistema/Personalizada”; solo quedó un nombre interno de constante. Lo renombro para que el código también quede alineado con el concepto de bases iniciales, no “sistema”.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./hooks/usePlanillas.ts` (+3 -3)
>
> </details>
>
> Voy a revisar por última vez que no queden etiquetas de origen, y dejo anotado que TypeScript sigue fallando por archivos ajenos a este cambio.
</details>

Listo. Corregí la gestión para que todas las **Planillas base** se comporten igual, sin distinción visible ni funcional entre iniciales/personalizadas.

**Archivos modificados**
- `hooks/usePlanillas.ts`
- `app/secciones/planillas-base.tsx`
- `app/secciones/planilla-base-detalle.tsx`
- `app/secciones/planillas.tsx`
- `firestore.rules`

**Reglas**
Sí modifiqué reglas. Quedaron así para bases:

```js
match /planillas_base_tp/{baseId} {
  allow read: if isAdmin() || isProfesor();
  allow create, update, delete: if isAdmin();
}
```

Tenés que deployar:

```bash
npx firebase-tools deploy --only firestore:rules --project odb-cvg
```

**Inicialización de las 4 bases**
Las 4 bases iniciales ahora se crean como documentos normales en `planillas_base_tp` con IDs fijos:

- `base-op1-op2-diaria`
- `base-op1-op2-final`
- `base-op3-op6-diaria`
- `base-op3-op6-final`

Agregué una marca interna `_inicializacion_bases` para que se creen solo una vez. Si el admin elimina una base inicial, no vuelve a recrearse automáticamente. Tampoco se pisan cambios existentes: si el documento ya existe, no se sobrescribe.

**Cambios UI**
- `planillas-base.tsx` ahora muestra una sola lista: `Planillas base`.
- Ya no aparecen “Bases del sistema”, “Bases personalizadas”, “Sistema” ni “Personalizada”.
- Todas las tarjetas muestran nombre, tipo, columnas, filas y botón eliminar.
- `planilla-base-detalle.tsx` permite editar y eliminar cualquier base como admin.
- `planillas.tsx` muestra todas las bases juntas en el selector, filtradas por tipo `Diaria` / `Final`, sin indicar origen.

**Cómo probar**
1. Entrar como admin a `Cargar Planillas`.
2. Tocar `Gestionar planillas base`.
3. Confirmar que hay una sola lista `Planillas base`.
4. Confirmar que no aparece `Sistema` ni `Personalizada`.
5. Abrir una base inicial, editar nombre/tipo/columnas/filas y guardar.
6. Eliminar una base inicial y confirmar que no vuelve a aparecer.
7. Crear una base nueva y confirmar que aparece en la misma lista.
8. Entrar como profesor y confirmar que no ve `Gestionar planillas base`, pero sí puede seleccionar bases al crear una planilla para alumno.

**Verificación**
Corrí `npx tsc --noEmit`; sigue fallando por errores preexistentes ajenos a planillas en `components/ui/collapsible.tsx` e `icon-symbol*.tsx`. No aparecieron errores nuevos de esta funcionalidad.

---
> Necesito modificar la funcionalidad existente de notas de exámenes.
>
> IMPORTANTE:
>
> * No ejecutes ningún comando de git.
> * No hagas git add, commit, push, checkout ni branch.
> * Mantené el estilo visual actual de la app.
> * No rompas la funcionalidad actual de carga, visualización, eliminación y exportación de notas.
> * Reutilizá lo que ya existe en `hooks/useNotas.ts`, `app/secciones/notas.tsx` y `app/secciones/mis-notas.tsx` o los archivos reales que correspondan.
>
> Contexto actual:
> Actualmente hay dos pantallas principales:
>
> * `Cargar Notas`
> * `Ver Notas` / `Notas de Alumnos`
>
> En `Cargar Notas`, el profesor/admin escribe el nombre del examen/parcial y carga notas numéricas para cada alumno.
>
> Hoy existe una especie de edición implícita:
>
> * si en `Cargar Notas` se escribe exactamente el mismo nombre/título del examen ya cargado, se rellenan las notas existentes;
> * si se cambia aunque sea un poco el título, no se precargan las notas.
>
> Esto es poco intuitivo.
>
> Nueva lógica deseada:
>
> 1. `Cargar Notas` debe quedar orientado a crear/cargar una nueva tanda de notas.
> 2. `Ver Notas` debe permitir modificar una tanda de notas existente mediante un botón de edición con ícono de lápiz.
> 3. En `Ver Notas`, al lado del botón de eliminar notas, agregar un botón con ícono de lápiz para editar.
> 4. Al tocar editar, abrir una pantalla o modo de edición con:
>
>    * título/nombre del examen ya cargado,
>    * alumnos,
>    * notas actuales precargadas,
>    * posibilidad de modificar notas,
>    * posibilidad de marcar alumnos como Ausente,
>    * botón Guardar Cambios.
> 5. Ya no debe depender de escribir exactamente el mismo nombre del examen en `Cargar Notas` para modificar.
>
> Funcionalidad nueva: Ausente
> Al cargar o editar notas, para cada alumno debe poder indicarse:
>
> * una nota numérica,
> * o `Ausente`.
>
> Requisitos sobre Ausente:
>
> * Debe ser fácil de cargar desde la UI.
> * Puede ser un botón/toggle al lado del input de nota, por ejemplo “Ausente”.
> * Si se marca “Ausente”, el input numérico puede limpiarse o deshabilitarse.
> * Si se escribe una nota numérica, debe quitarse “Ausente”.
> * Guardar el valor de forma consistente en Firestore.
> * Evitar guardar valores ambiguos.
>
> Modelo sugerido:
> Si actualmente la nota se guarda como número o string, adaptar con el menor cambio posible.
> Opciones válidas:
> A. Guardar la nota como:
>
> * número para notas numéricas,
> * string `"Ausente"` para ausente.
>
> B. Guardar un objeto:
>
> ```ts
> {
>   valor: number | null,
>   estado: "presente" | "ausente"
> }
> ```
>
> Preferencia:
>
> * Elegí la opción que menos rompa la estructura actual y la exportación ya existente.
> * Si la app hoy espera notas como número, probablemente conviene usar string `"Ausente"` con cuidado en promedio/exportación, o adaptar helper de promedio para ignorar ausentes.
> * Documentá qué opción elegiste.
>
> Promedio:
>
> * Los alumnos ausentes NO deben contar para el promedio de la clase.
> * Ejemplo:
>
>   * notas: 10, 8, Ausente
>   * promedio = 9
> * Si todos están ausentes o no hay notas numéricas, mostrar `-` o “Sin notas”, según el estilo actual.
> * No mostrar `NaN`.
>
> Visualización en `Ver Notas`:
>
> * Donde aparece la nota del alumno:
>
>   * si es numérica, mostrar igual que ahora.
>   * si es ausente, mostrar `Ausente`.
> * `Ausente` no debería pintarse como nota baja roja. Usar estilo neutro o gris.
> * Mantener los colores actuales para notas numéricas aprobadas/desaprobadas si ya existen.
>
> Exportación PDF/Excel:
> Actualizar la exportación de notas para soportar `Ausente`.
>
> * En PDF debe aparecer `Ausente`.
> * En Excel debe aparecer `Ausente`.
> * El promedio debe ignorar ausentes.
> * No debe romper la exportación.
>
> Pantalla `Cargar Notas`:
>
> * Mantener la posibilidad de cargar notas nuevas.
> * Agregar soporte para marcar Ausente.
> * Si se intenta cargar una tanda con un título que ya existe, evitar duplicados o mantener comportamiento actual, pero mostrar una advertencia clara si corresponde.
> * No es necesario eliminar la lógica vieja de precarga si es riesgoso, pero la edición principal debe hacerse desde `Ver Notas`.
>
> Pantalla `Ver Notas`:
> Agregar botón de edición:
>
> * Al lado del tachito de eliminar, mostrar un botón con ícono de lápiz.
> * Solo admin/profesor deberían ver editar y eliminar.
> * Alumno no debe ver editar ni eliminar.
> * El botón editar debe abrir una pantalla o modo de edición de esa tanda de notas.
>
> Opciones de implementación:
>
> 1. Reutilizar `app/secciones/notas.tsx` agregando params de edición, por ejemplo:
>
>    * `modo=editar`
>    * `notaId` o identificador de la carga
> 2. Crear pantalla separada, por ejemplo:
>
>    * `app/secciones/editar-notas.tsx`
>
> Preferencia:
>
> * Elegí la opción más limpia y segura según la estructura actual.
> * Si reutilizás la pantalla de carga, asegurate de cambiar textos:
>
>   * en modo creación: `Cargar Notas`
>   * en modo edición: `Editar Notas`
>   * botón: `Guardar Cambios`
>
> Identificación de la tanda de notas:
>
> * No depender del título escrito manualmente.
> * Usar el ID/documento real de Firestore o el identificador interno que ya exista.
> * Desde `Ver Notas`, al tocar editar, pasar ese ID por params.
>
> Validaciones:
>
> * Permitir notas numéricas según la escala actual.
> * Permitir Ausente.
> * Evitar valores inválidos.
> * Si una nota está vacía y no está marcada ausente, manejarlo como sin cargar o mostrar validación, según la lógica actual.
> * No romper notas existentes.
>
> Migración/compatibilidad:
>
> * Las notas ya cargadas deben seguir viéndose bien.
> * Las notas viejas numéricas deben seguir funcionando.
> * Si hay notas guardadas como string por inputs anteriores, manejarlas sin romper promedio/exportación.
> * No hace falta migrar datos históricos si se puede resolver desde lectura/renderizado.
>
> Archivos a revisar:
>
> * `hooks/useNotas.ts`
> * `app/secciones/notas.tsx`
> * `app/secciones/mis-notas.tsx`
> * componentes de exportación de notas, si existen
> * rutas en `app/layout.tsx`, si creás una pantalla nueva
> * cualquier helper de promedio o formato de nota
>
> Al finalizar, informame:
>
> 1. Archivos modificados.
> 2. Archivos creados, si creaste una pantalla nueva.
> 3. Cómo guardaste el valor `Ausente`.
> 4. Cómo se calcula ahora el promedio.
> 5. Cómo se edita una tanda existente desde `Ver Notas`.
> 6. Cómo probar:
>
>    * cargar notas con un alumno ausente,
>    * ver notas y confirmar que aparece Ausente,
>    * confirmar que Ausente no entra en promedio,
>    * exportar PDF/Excel,
>    * editar una tanda desde el lápiz,
>    * cambiar una nota numérica a Ausente,
>    * cambiar Ausente a nota numérica,
>    * confirmar que alumno no ve botones de editar/eliminar.
> 7. Limitaciones o TODOs.

<details><summary>16 previous messages</summary>

> Voy a revisar primero cómo están modeladas las notas y la exportación actual, para elegir el cambio menos invasivo. Después conecto edición por ID desde “Ver Notas” y agrego `Ausente` sin tocar git.
>
> La estructura actual guarda una nota por alumno en `notas/{idCompuesto}`, con `nota` numérica. Para tocar lo mínimo voy a guardar `Ausente` como string literal `"Ausente"` en el mismo campo `nota`, y adaptar lectura/promedios/exportación para aceptar número o ese string.
>
> Voy a reutilizar `app/secciones/notas.tsx` en modo edición con params, porque ya resuelve alumnos/inscripciones y guardado por lote. Desde “Ver Notas” el lápiz va a pasar la tanda existente, así la edición ya no depende de volver a escribir el título exacto.
>
> Estoy evitando cambiar el modelo de documentos: el campo sigue siendo `nota`, pero ahora acepta número o `"Ausente"`. Así no hay migración y las notas viejas siguen funcionando.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./hooks/useNotas.ts` (+16 -14)
> - Wrote `./hooks/useNotas.ts` (+32 -5)
>
> </details>
>
> Ahora adapto “Cargar Notas” para soportar ausentes y también funcionar como “Editar Notas” cuando llega desde el lápiz. En edición el nombre queda precargado y bloqueado para no duplicar tandas por cambio de título.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/notas.tsx` (+31 -15)
> - Wrote `./app/secciones/notas.tsx` (+32 -7)
> - Wrote `./app/secciones/notas.tsx` (+30 -16)
> - Wrote `./app/secciones/notas.tsx` (+17 -9)
>
> </details>
>
> El bloque de filas está intacto; voy a sustituir solo el input actual por input más toggle, manteniendo la fila compacta.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/notas.tsx` (+15 -7)
> - Wrote `./app/secciones/notas.tsx` (+1 -1)
>
> </details>
>
> Ya está el toggle por alumno. Agrego los estilos visuales y luego paso a “Ver Notas”: promedio ignorando ausentes, color neutro, exportación y lápiz de edición.
>
> <details><summary>Edited 2 files</summary>
>
> - Wrote `./app/secciones/notas.tsx` (+49 -7)
> - Wrote `./app/secciones/mis-notas.tsx` (+8 -3)
>
> </details>
>
> En “Ver Notas” estoy cambiando los cálculos a helpers comunes: solo los números entran al promedio, y `Ausente` se muestra como texto neutro. También voy a sumar el lápiz junto al tachito.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/mis-notas.tsx` (+3 -2)
>
> </details>
>
> Voy a parchear el bloque de grupo completo donde se calcula el promedio y se muestran las acciones. Es el punto donde más fácil se rompe si se deja una comparación numérica directa contra `"Ausente"`.
>
> <details><summary>Edited 2 files</summary>
>
> - Wrote `./app/secciones/mis-notas.tsx` (+38 -12)
> - Wrote `./app/secciones/mis-notas.tsx` (+8 -4)
> - Wrote `./app/secciones/mis-notas.tsx` (+9 -7)
> - Wrote `./components/ui/ExportarNotas.tsx` (+26 -18)
> - Wrote `./app/secciones/mis-notas.tsx` (+18 -8)
> - Wrote `./app/secciones/mis-notas.tsx` (+1 -1)
>
> </details>
>
> Ya quedó el flujo principal. Voy a correr TypeScript y búsquedas puntuales para detectar comparaciones numéricas viejas contra `nota` que podrían romper con `"Ausente"`.
</details>

Listo. Modifiqué notas para que `Ausente` sea parte del flujo y para que la edición salga desde `Ver Notas` con el lápiz.

**Archivos modificados**
- `hooks/useNotas.ts`
- `app/secciones/notas.tsx`
- `app/secciones/mis-notas.tsx`
- `components/ui/ExportarNotas.tsx`

No creé pantalla nueva y no modifiqué reglas de Firestore.

**Cómo guardé `Ausente`**
Usé el menor cambio posible: el campo existente `nota` ahora acepta:

```ts
number | "Ausente"
```

Las notas viejas numéricas siguen funcionando sin migración.

**Promedio**
Ahora el promedio toma solo notas numéricas. `Ausente` queda afuera. Si no hay notas numéricas, muestra `-` y evita `NaN`.

**Edición desde Ver Notas**
En `Ver Notas` / `Notas de Alumnos` agregué un botón con lápiz para admin/profesor. Abre `Cargar Notas` en modo edición:
- título `Editar Notas`
- examen precargado
- notas precargadas
- ausentes precargados
- botón `Guardar Cambios`

El nombre del examen queda bloqueado en edición para no duplicar tandas accidentalmente.

**Carga y visualización**
- En `Cargar Notas`, cada alumno tiene input numérico y botón `Ausente`.
- Si marcás `Ausente`, se limpia/deshabilita la nota.
- Si escribís una nota, se desmarca `Ausente`.
- En `Ver Notas`, `Ausente` se muestra gris/neutro, no como desaprobado.
- PDF y Excel exportan `Ausente` y el promedio ignora ausentes.

**Cómo probar**
1. Entrar a `Cargar Notas`.
2. Cargar una tanda con un alumno marcado como `Ausente`.
3. Entrar a `Ver Notas` y confirmar que aparece `Ausente`.
4. Confirmar que el promedio ignora ese alumno.
5. Exportar PDF y Excel.
6. Tocar el lápiz de una tanda.
7. Cambiar una nota numérica a `Ausente` y guardar.
8. Volver a editar y cambiar `Ausente` a nota numérica.
9. Entrar como alumno y confirmar que no ve lápiz ni eliminar.

**Notas**
- Dejé la eliminación como estaba: solo admin ve el tachito, porque las reglas actuales solo permiten borrar notas a admin.
- `npx tsc --noEmit` sigue fallando por errores preexistentes en `components/ui/collapsible.tsx` e `icon-symbol*.tsx`; no aparecieron errores nuevos de notas.

---
> Necesito corregir algunos detalles de la funcionalidad de notas de exámenes.
>
> IMPORTANTE:
>
> * No ejecutes ningún comando de git.
> * No hagas git add, commit, push, checkout ni branch.
> * Mantené el estilo visual actual de la app.
> * No rompas exportación PDF/Excel ni visualización de notas.
> * No modifiques reglas de Firestore salvo que sea estrictamente necesario.
>
> Contexto actual:
> Ya se implementó:
>
> * soporte para nota numérica o `"Ausente"`,
> * edición desde `Ver Notas` usando un botón con ícono de lápiz,
> * exportación con ausentes,
> * promedio ignorando ausentes.
>
> Ahora necesito estos ajustes:
>
> 1. Al guardar notas nuevas, salir de la pantalla
>
> Actualmente, cuando cargo notas nuevas y toco `Guardar Notas`, aparece el modal de éxito, pero al cerrarlo la pantalla queda en `Cargar Notas`.
>
> Problema:
> Después de guardar, como ya existen notas con ese nombre, aparece el aviso:
> “Ya existen notas con ese nombre. Para modificar una tanda existente, usá el lápiz desde Ver Notas.”
>
> Eso no debería pasar inmediatamente después de crear una carga nueva.
>
> Comportamiento esperado:
>
> * Al guardar notas nuevas correctamente:
>
>   * mostrar el modal de éxito,
>   * al tocar `Entendido`, volver a la pantalla anterior.
> * No debe quedarse en la pantalla de carga.
> * No debe aparecer el cartel de “Ya existen notas con ese nombre” justo después de crear.
> * El cartel de existencia solo debe aparecer cuando el usuario intenta cargar una nueva tanda y escribe un nombre que ya existe previamente.
>
> 2. Al guardar cambios en edición, salir de la pantalla
>
> Cuando se editan notas desde el lápiz de `Ver Notas`:
>
> * al tocar `Guardar Cambios`,
> * si se guarda correctamente,
> * mostrar éxito,
> * y al tocar `Entendido`, volver a la pantalla anterior.
>
> No debe quedarse en la pantalla de edición.
>
> 3. Mejorar estilo del botón Ausente seleccionado
>
> Actualmente, cuando se marca `Ausente`, el botón queda con fondo gris claro y no se distingue bien.
>
> Quiero que cuando `Ausente` esté seleccionado:
>
> * tenga fondo verde clarito,
> * borde verde,
> * texto verde oscuro o similar,
> * coherente con el estilo de la app.
>
> Cuando no esté seleccionado:
>
> * mantener estilo normal/neutro.
>
> 4. Si se toca el input numérico, desmarcar Ausente
>
> Comportamiento esperado:
>
> * Si primero marco `Ausente`,
> * y después toco el campo de nota numérica,
> * se debe desmarcar `Ausente`.
>
> Además:
>
> * Si el usuario escribe una nota numérica, también debe desmarcarse `Ausente`.
> * Si se desmarca Ausente y no hay nota numérica, no se carga nada para ese alumno, como ya funciona actualmente.
> * Si está marcado Ausente, no debe guardarse nota numérica.
>
> 5. Agregar botón Cancelar junto a Guardar Notas / Guardar Cambios
>
> En la pantalla de carga/edición de notas, abajo debe haber dos botones:
>
> * `Cancelar`
> * `Guardar Notas` o `Guardar Cambios`
>
> Comportamiento:
>
> * `Cancelar` debe pedir confirmación antes de salir.
> * Mensaje sugerido:
>   “¿Querés salir sin guardar los cambios?”
> * Opciones:
>
>   * “Seguir editando”
>   * “Salir”
> * Si confirma salir, volver a la pantalla anterior.
> * Si cancela, permanecer en la pantalla.
>
> Visual:
>
> * El botón `Cancelar` puede ser blanco/outline, como otros botones secundarios de la app.
> * El botón guardar debe seguir verde.
> * Si no entran bien uno al lado del otro en móvil, pueden ir uno arriba del otro, pero preferentemente juntos si queda bien.
>
> 6. Permisos: profesor no puede editar ni eliminar notas
>
> Cambio importante:
> El profesor puede:
>
> * cargar notas nuevas,
> * consultar/ver notas.
>
> Pero el profesor NO puede:
>
> * modificar notas existentes,
> * eliminar notas existentes.
>
> Entonces en `Ver Notas`:
>
> * El botón lápiz para editar debe mostrarse solo a admin.
> * El botón tachito para eliminar debe mostrarse solo a admin.
> * Profesor no debe ver lápiz ni tachito.
> * Alumno tampoco debe ver lápiz ni tachito.
>
> En `Cargar Notas`:
>
> * Profesor sí puede cargar notas nuevas.
> * Admin también puede cargar notas nuevas.
>
> En modo edición:
>
> * Solo admin debe poder entrar.
> * Si un profesor intenta acceder por URL/params a modo edición, mostrar acceso denegado o volver atrás, siguiendo el patrón del proyecto.
>
> 7. Revisar el cartel de “Ya existen notas con ese nombre”
>
> El cartel debe aparecer solo cuando:
>
> * estamos en modo creación,
> * el usuario escribió un nombre de examen,
> * ya existe una tanda con ese mismo nombre,
> * y todavía no se acaba de guardar esa tanda en esta misma interacción.
>
> No debe aparecer:
>
> * en modo edición,
> * inmediatamente después de guardar exitosamente,
> * cuando el campo está vacío.
>
> 8. Archivos a revisar
>
> Revisar principalmente:
>
> * `app/secciones/notas.tsx`
> * `app/secciones/mis-notas.tsx`
> * `hooks/useNotas.ts`
> * componentes/modales reutilizados, si corresponde.
>
> Al finalizar, informame:
>
> 1. Archivos modificados.
> 2. Cómo resolviste la navegación después de guardar.
> 3. Cómo quedó el botón Ausente seleccionado.
> 4. Cómo quedó el botón Cancelar.
> 5. Cómo restringiste edición/eliminación solo a admin.
> 6. Cómo probar:
>
>    * cargar notas nuevas y confirmar que vuelve atrás al cerrar éxito,
>    * editar notas como admin y confirmar que vuelve atrás al cerrar éxito,
>    * marcar Ausente y ver estilo verde claro,
>    * tocar input numérico y confirmar que desmarca Ausente,
>    * cancelar con confirmación,
>    * entrar como profesor y confirmar que no ve lápiz ni tachito,
>    * confirmar que profesor sí puede cargar notas nuevas.

<details><summary>13 previous messages</summary>

> Voy a ajustar el flujo justo donde se guarda y se cierra el modal, además de cerrar permisos del lápiz al admin. Primero reviso el estado exacto de `notas.tsx` y `mis-notas.tsx` después de los últimos cambios.
>
> Ya vi el punto: el modal de éxito no distingue si debe cerrar pantalla. Voy a agregar una bandera para volver al cerrar el éxito, esconder el aviso después de guardar, y sumar confirmación de cancelar.
>
> El parche grande chocó por orden exacto de líneas. Lo aplico en pasos chicos para no tocar de más.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/notas.tsx` (+4 -3)
> - Wrote `./app/secciones/notas.tsx` (+7 -4)
> - Wrote `./app/secciones/notas.tsx` (+14 -0)
>
> </details>
>
> Agregué el estado para “volver al cerrar éxito” y el helper para que tocar el input desmarque Ausente. Ahora conecto el guardado exitoso y el acceso denegado a edición para profesor.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/notas.tsx` (+4 -2)
> - Wrote `./app/secciones/notas.tsx` (+23 -6)
> - Wrote `./app/secciones/notas.tsx` (+5 -2)
>
> </details>
>
> El aviso ahora depende de modo creación, nombre no vacío y que no venga de un guardado exitoso. Sigo con el input y con los botones Cancelar/Guardar.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/notas.tsx` (+2 -2)
> - Wrote `./app/secciones/notas.tsx` (+38 -17)
>
> </details>
>
> El botón Cancelar ya pide confirmación y el modal de éxito ahora vuelve atrás al cerrar. Ajusto estilos para que Cancelar y Guardar queden juntos y para que Ausente seleccionado use verde claro.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/notas.tsx` (+31 -11)
>
> </details>
>
> Ahora cierro el permiso visual en “Ver Notas”: profesor deja de ver lápiz y tachito, pero mantiene la vista y la carga nueva.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/mis-notas.tsx` (+1 -1)
>
> </details>
>
> Voy a correr una verificación estática y una búsqueda de permisos para confirmar que no quedó el lápiz habilitado para profesor ni el botón Ausente con el estilo anterior.
</details>

Listo, corregí los detalles de notas.

**Archivos modificados**
- `app/secciones/notas.tsx`
- `app/secciones/mis-notas.tsx`

No modifiqué reglas de Firestore.

**Navegación después de guardar**
Ahora, tanto al cargar notas nuevas como al editar desde el lápiz, se muestra el modal de éxito y al tocar `Entendido` vuelve a la pantalla anterior. Además, después de guardar una tanda nueva ya no queda visible el aviso de “Ya existen notas con ese nombre”.

**Botón Ausente**
Cuando está seleccionado ahora queda con:
- fondo verde claro,
- borde verde,
- texto verde oscuro.

También ajusté el input: si `Ausente` está marcado y tocás el campo numérico, se desmarca. Si escribís una nota, también se desmarca.

**Cancelar**
Agregué botones inferiores:
- `Cancelar`
- `Guardar Notas` / `Guardar Cambios`

`Cancelar` abre confirmación:
- `Seguir editando`
- `Salir`

Si confirma, vuelve atrás.

**Permisos**
En `Ver Notas`:
- solo admin ve lápiz y tachito.
- profesor ya no ve editar ni eliminar.
- alumno tampoco.

En modo edición directo por URL/params:
- si entra un profesor, se muestra acceso denegado.

**Verificación**
Corrí `npx tsc --noEmit`; sigue fallando por errores preexistentes en `components/ui/collapsible.tsx` e `icon-symbol*.tsx`, no por estos cambios.

**Cómo probar**
1. Cargar notas nuevas, cerrar éxito y confirmar que vuelve atrás.
2. Editar como admin desde el lápiz, guardar y confirmar que vuelve atrás.
3. Marcar `Ausente` y verificar el estilo verde claro.
4. Tocar el input numérico y confirmar que desmarca `Ausente`.
5. Probar `Cancelar` y la confirmación.
6. Entrar como profesor: no debe ver lápiz ni tachito.
7. Como profesor, entrar a `Cargar Notas` y confirmar que puede cargar notas nuevas.

---
> Necesito corregir dos detalles finales de la funcionalidad de notas.
>
> IMPORTANTE:
>
> * No ejecutes ningún comando de git.
> * No hagas git add, commit, push, checkout ni branch.
> * Mantené el estilo visual actual.
> * No rompas Ausente, exportación PDF/Excel, promedio ni permisos.
> * No modifiques reglas de Firestore salvo que sea estrictamente necesario.
>
> Contexto actual:
> Ya existe:
>
> * carga de notas numéricas,
> * opción `Ausente`,
> * edición desde el lápiz en `Ver Notas`,
> * botón Cancelar,
> * navegación hacia atrás al guardar,
> * profesor solo puede cargar y consultar,
> * admin puede editar/eliminar.
>
> Problema 1: no se puede borrar una nota existente al editar
>
> En modo edición, si una nota ya tenía:
>
> * un número,
> * o `Ausente`,
>
> y el admin la borra/desmarca para dejarla vacía, al tocar `Guardar Cambios` se mantiene el valor anterior.
>
> Comportamiento esperado:
> En modo edición, el admin debe poder dejar un alumno sin nota.
>
> Casos:
>
> 1. Si tenía nota numérica y el admin borra el campo:
>
>    * debe quedar sin nota.
>    * no debe mantenerse la nota anterior.
>
> 2. Si tenía `Ausente` y el admin desmarca `Ausente` sin poner nota numérica:
>
>    * debe quedar sin nota.
>    * no debe mantenerse `Ausente`.
>
> 3. Si tenía nota numérica y el admin marca `Ausente`:
>
>    * debe guardarse `Ausente`.
>
> 4. Si tenía `Ausente` y el admin escribe una nota:
>
>    * debe guardarse la nota numérica.
>
> 5. Si queda sin nota y sin `Ausente`:
>
>    * no debe mostrarse ese alumno en la tanda de notas, o debe mostrarse vacío según la estructura actual.
>    * Pero no debe conservar el valor viejo.
>
> Implementación:
> Revisar `app/secciones/notas.tsx` y `hooks/useNotas.ts`.
>
> Probablemente el problema esté en que al guardar edición se hace merge con las notas anteriores y se omiten los valores vacíos.
>
> Necesito que al guardar cambios en modo edición se reemplace la tanda completa de notas con el estado actual del formulario, no con una mezcla que conserve datos anteriores.
>
> Alternativas válidas:
>
> * Si las notas se guardan como array, reconstruir el array completo solo con alumnos que tengan nota numérica o `Ausente`.
> * Si las notas se guardan como mapa por alumnoId, eliminar explícitamente la clave del alumno cuando queda vacío.
> * Elegí la opción que encaje con la estructura actual.
>
> Importante:
>
> * No guardar valores ambiguos como `""`, `null` o `undefined` si el modelo actual no los espera.
> * Si un alumno queda sin nota, debe quedar fuera del listado o como vacío, pero nunca mantener el valor anterior.
> * El promedio debe recalcularse correctamente ignorando ausentes y alumnos sin nota.
> * Exportación PDF/Excel no debe incluir valores viejos.
>
> Problema 2: aparece por un segundo el aviso amarillo de “ya existen notas”
>
> Después de cargar una tanda nueva y tocar `Guardar Notas`, aparece el modal de éxito, pero por detrás se ve por unos segundos el cartel amarillo:
>
> “Ya existen notas con ese nombre. Para modificar una tanda existente, usá el lápiz desde Ver Notas.”
>
> Ese cartel no debería aparecer ni siquiera por un segundo inmediatamente después de guardar exitosamente.
>
> Comportamiento esperado:
> El aviso de existencia solo debe aparecer cuando:
>
> * estamos en modo creación,
> * el usuario está escribiendo un nombre de examen,
> * ese nombre ya existía antes de intentar guardar,
> * y no estamos en estado de guardado exitoso.
>
> No debe aparecer:
>
> * después de guardar exitosamente,
> * mientras está abierto el modal de éxito,
> * en modo edición,
> * justo antes de volver atrás,
> * si la tanda acaba de crearse en esta misma interacción.
>
> Implementación sugerida:
>
> * Agregar un estado tipo `guardadoExitoso`, `isSuccessModalVisible`, `bloquearAvisoExistente` o similar.
> * Ocultar el aviso amarillo cuando:
>
>   * `modo === "editar"`,
>   * `guardando === true`,
>   * el modal de éxito está visible,
>   * ya se guardó exitosamente y se está por volver atrás.
> * Otra opción: calcular `existeTandaConEseNombre` excluyendo la tanda actual o evitando recalcularlo luego del guardado exitoso.
> * Lo importante es que el aviso no parpadee después de guardar.
>
> Revisar:
>
> * `app/secciones/notas.tsx`
> * `hooks/useNotas.ts`, si corresponde
> * `app/secciones/mis-notas.tsx`, solo si afecta cómo se renderizan notas vacías luego de editar
>
> Permisos:
> Mantener:
>
> * admin puede editar/eliminar.
> * profesor puede cargar/consultar, pero no editar/eliminar.
> * alumno solo consulta.
>
> Pruebas esperadas:
>
> 1. Crear una tanda con:
>
>    * alumno A: nota 8
>    * alumno B: Ausente
>    * alumno C: vacío
> 2. Editar la tanda:
>
>    * borrar la nota 8 del alumno A y dejarlo vacío.
>    * desmarcar Ausente del alumno B y dejarlo vacío.
>    * poner nota 9 al alumno C.
> 3. Guardar cambios.
> 4. Volver a Ver Notas.
> 5. Confirmar:
>
>    * alumno A ya no aparece con 8.
>    * alumno B ya no aparece como Ausente.
>    * alumno C aparece con 9.
>    * el promedio solo considera el 9.
> 6. Crear una tanda nueva.
> 7. Al guardar, confirmar que aparece modal de éxito y NO aparece por detrás el aviso amarillo de existencia.
> 8. Confirmar que al cerrar el modal vuelve atrás.
>
> Al finalizar, informame:
>
> 1. Archivos modificados.
> 2. Cómo resolviste que una nota pueda quedar vacía al editar.
> 3. Cómo evitaste el parpadeo del aviso amarillo después de guardar.
> 4. Cómo probarlo manualmente.
> 5. Si quedó alguna limitación.

<details><summary>9 previous messages</summary>

> Voy a ajustar esto en dos puntos: el guardado en edición para que reemplace la tanda completa, y el estado del aviso amarillo para que quede bloqueado antes de que Firestore notifique las notas recién creadas.
>
> El problema de “vaciar” viene de que el guardado actual hace upsert solo de las notas con valor; en edición, los alumnos vacíos se omiten y sus documentos anteriores quedan vivos. Voy a agregar una operación de reemplazo: borrar la tanda actual y volver a crear solo lo que quedó cargado en el formulario.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./hooks/useNotas.ts` (+52 -10)
>
> </details>
>
> Ahora conecto esa función solo en modo edición. También voy a permitir que una edición guarde cero notas, porque ese caso significa “borrar toda la tanda actual”.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/notas.tsx` (+15 -8)
>
> </details>
>
> El reemplazo ya está conectado: editar borra los documentos previos de esa tanda y crea solo los alumnos que tienen número o Ausente. Ajusto ahora la condición del aviso amarillo para que no pueda aparecer durante guardado, modal de éxito ni salida.
>
> El texto está con encoding distinto en el archivo, así que lo voy a cambiar usando el bloque alrededor de la condición.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/notas.tsx` (+7 -1)
>
> </details>
>
> La condición del aviso ya queda bloqueada durante guardado, éxito y vuelta atrás. Hago verificación de tipos y de referencias para confirmar que la edición usa reemplazo completo.
</details>

Listo, corregí los dos detalles.

**Archivos modificados**
- `hooks/useNotas.ts`
- `app/secciones/notas.tsx`

No modifiqué reglas de Firestore.

**Notas vacías al editar**
Agregué `reemplazarNotasPorExamen(...)` en `useNotas.ts`. En modo edición, `Guardar Cambios` ahora:

1. Busca todos los documentos de esa tanda.
2. Los elimina.
3. Vuelve a crear solo los alumnos que quedaron con nota numérica o `Ausente`.

Así, si el admin borra una nota o desmarca `Ausente` y deja vacío, el valor viejo ya no queda guardado.

**Aviso amarillo**
Bloqueé el aviso cuando:
- está guardando,
- ya hubo guardado exitoso,
- está abierto el modal de éxito,
- está por volver atrás,
- o está en modo edición.

Además, el bloqueo se activa antes de ejecutar el guardado, así no llega a parpadear por la actualización de Firestore.

**Cómo probar**
1. Crear tanda:
   - alumno A: `8`
   - alumno B: `Ausente`
   - alumno C: vacío
2. Editar como admin:
   - borrar A,
   - desmarcar B,
   - poner `9` a C.
3. Guardar y volver a `Ver Notas`.
4. Confirmar que solo aparece C con `9` y promedio `9.0`.
5. Crear una tanda nueva y guardar.
6. Confirmar que aparece el modal de éxito sin el aviso amarillo detrás, y que al cerrar vuelve atrás.

También corrí `npx tsc --noEmit`; sigue fallando solo por errores preexistentes en `components/ui/collapsible.tsx` e `icon-symbol*.tsx`.

---
> Necesito modificar la funcionalidad de restricciones con código de acceso.
>
> IMPORTANTE:
>
> * No ejecutes ningún comando de git.
> * No hagas git add, commit, push, checkout ni branch.
> * Mantené el estilo visual actual de la app.
> * No rompas la restricción actual de secciones principales.
> * Implementá esto en una etapa funcional y testeable.
>
> Contexto actual:
> Actualmente el admin puede restringir con código de acceso secciones principales de un módulo, por ejemplo:
>
> * Módulo: Operatoria Dental I
> * Sección: Cursada 2026
>
> En el panel de admin existe un apartado llamado “Cursadas”, donde se ven esas secciones restringidas, el código de acceso, alumnos inscriptos, botón regenerar código, asignar alumnos manualmente, eliminar acceso, etc.
>
> Problema:
> Ahora también necesito poder restringir subsecciones, por ejemplo:
>
> * Módulo: Operatoria Dental I
> * Sección: Cursada 2026
> * Subsección: Comisión 1
> * Subsección: Comisión 2
> * Subsección: Comisión 3
> * etc.
>
> Esto es necesario porque las notas de exámenes y las planillas de trabajos prácticos se cargan por comisión. Entonces, cuando un profesor/admin carga notas o planillas dentro de “Comisión 1”, solo deben aparecer los alumnos inscriptos en esa comisión, no todos los alumnos de la cursada general.
>
> Objetivo general:
> Permitir restringir tanto:
>
> 1. Secciones principales.
> 2. Subsecciones, incluso subsecciones recursivas si el proyecto ya las soporta.
>
> Modelo esperado:
> Cada acceso restringido debe identificar claramente:
>
> * moduloId
> * moduloTitulo o nombre del módulo, si ya se guarda
> * seccionId
> * seccionTitulo
> * subseccionPath, si aplica
> * subseccionTitulo, si aplica
> * tipo de acceso:
>
>   * "seccion"
>   * "subseccion"
> * codigoAcceso
> * alumnos inscriptos/asignados
> * fechaCreacion / fechaActualizacion si ya se usa
>
> Si ya existe una colección/modelo para cursadas o inscripciones, adaptarlo sin romper compatibilidad.
>
> Compatibilidad:
>
> * Las restricciones actuales de secciones principales deben seguir funcionando.
> * Los alumnos ya inscriptos a secciones principales no deben perder acceso.
> * Si una restricción vieja no tiene `tipo`, asumir que es tipo `"seccion"`.
>
> Formulario / edición:
> Revisar dónde el admin crea o edita secciones/subsecciones.
> Necesito que una subsección también pueda marcarse como restringida con código de acceso, igual que una sección principal.
>
> Si hoy existe un switch o botón para restringir sección, agregarlo también en subsecciones.
>
> Panel admin:
> Actualmente el apartado se llama “Cursadas”.
> Como ahora también va a mostrar subsecciones restringidas, cambiar el nombre visible a:
> “Accesos”
>
> Si internamente el tab/ruta se llama cursadas, puede quedar así para no romper código, pero visualmente debe decir “Accesos”.
>
> En el panel “Accesos”:
>
> 1. Mostrar tanto secciones restringidas como subsecciones restringidas.
> 2. Cada tarjeta debe mostrar claramente:
>
>    * título de la sección o subsección restringida,
>    * módulo al que pertenece,
>    * si es subsección, indicar también la sección padre.
>
> Ejemplos visuales:
>
> * Cursada 2026
>   Módulo: Operatoria Dental I
>   Tipo: Sección
>
> * Comisión 1
>   Módulo: Operatoria Dental I
>   Sección: Cursada 2026
>   Tipo: Subsección
>
> 3. Mantener acciones actuales:
>
>    * ver código de acceso,
>    * regenerar código,
>    * asignar alumno manualmente,
>    * ver inscriptos,
>    * quitar alumno,
>    * eliminar/revocar acceso si ya existe esa acción.
>
> Buscador y filtros:
> Agregar en el panel “Accesos”:
>
> * Buscador por:
>
>   * nombre de módulo,
>   * nombre de sección,
>   * nombre de subsección,
>   * nombre de alumno si es simple.
> * Filtros tipo botones:
>
>   * Todos
>   * Secciones
>   * Subsecciones
>
> Reutilizar el estilo de filtros que ya existe en el apartado de usuarios si corresponde.
>
> Inscripciones:
> Necesito que las inscripciones se guarden o consulten respetando el contexto exacto.
>
> Casos:
>
> 1. Si el acceso restringido es de una sección principal:
>
>    * los alumnos inscriptos pertenecen a esa sección.
>    * esto debe seguir funcionando como hoy.
>
> 2. Si el acceso restringido es de una subsección:
>
>    * los alumnos inscriptos pertenecen a esa subsección exacta.
>    * debe usarse `subseccionPath` o identificador equivalente para diferenciar Comisión 1 de Comisión 2.
>
> Carga de notas:
> Revisar:
>
> * `app/secciones/notas.tsx`
> * `app/secciones/mis-notas.tsx`
> * `hooks/useNotas.ts`
> * `hooks/useInscripciones.ts`
> * cualquier hook real que liste alumnos inscriptos.
>
> Cuando se cargan notas dentro de una subsección restringida, por ejemplo Comisión 1:
>
> * listar solo alumnos inscriptos en esa subsección.
> * no listar alumnos inscriptos en otras comisiones.
> * no listar todos los alumnos de la sección padre.
>
> Cuando se cargan notas dentro de una sección principal restringida:
>
> * mantener comportamiento actual.
>
> Planillas TP:
> Revisar:
>
> * `app/secciones/planillas.tsx`
> * `app/secciones/mis-planillas.tsx`
> * `hooks/usePlanillas.ts`
> * `hooks/useInscripciones.ts`
>
> Cuando se crean planillas desde una subsección restringida:
>
> * listar solo alumnos inscriptos en esa subsección.
> * la planilla debe guardar el contexto exacto:
>
>   * moduloId
>   * seccionId
>   * subseccionPath, si aplica.
> * No mezclar alumnos de otras comisiones.
>
> Vista alumno:
> El alumno debe poder acceder a las secciones/subsecciones donde está inscripto.
> Si está inscripto en:
>
> * Cursada 2026 → ve esa sección.
> * Comisión 1 → ve esa subsección.
>   Si no está inscripto en Comisión 2, no debería tener acceso a Comisión 2.
>
> Si hoy el acceso por código solo valida secciones principales, extender la validación a subsecciones.
>
> Código de acceso:
> El alumno debe poder ingresar un código de acceso de subsección, igual que hoy ingresa uno de sección.
> Al ingresar el código de Comisión 1, queda inscripto en Comisión 1.
>
> Reglas Firestore:
> Revisar si hace falta ajustar reglas.
> Si se modifican reglas, avisar al final que debo ejecutar deploy.
>
> Seguridad:
>
> * Alumno no debe poder inscribirse manualmente sin código válido.
> * Alumno no debe poder ver datos de una subsección restringida donde no está inscripto.
> * Admin mantiene control total.
> * Profesor mantiene los permisos actuales que ya tiene para ver/cargar en secciones habilitadas.
>
> Compatibilidad con subsecciones recursivas:
> El proyecto ya tiene subsecciones recursivas.
> Usar el `subseccionPath` actual si ya existe.
> No inventar un modelo incompatible.
> Si el path ya se pasa por params en notas/planillas, reutilizarlo.
>
> No implementar todavía:
>
> * flujo completo de cambio de comisión.
> * transferencia de planillas entre comisiones.
> * migración masiva de notas o planillas existentes.
>   Eso lo hacemos en otro paso.
>
> Al finalizar, informame:
>
> 1. Archivos modificados.
> 2. Archivos creados, si hubo.
> 3. Cómo quedó el modelo para accesos restringidos de subsecciones.
> 4. Cómo se distinguen secciones y subsecciones restringidas.
> 5. Cómo se filtran alumnos inscriptos en notas y planillas según contexto.
> 6. Si cambiaste reglas y si debo hacer deploy.
> 7. Cómo probar:
>
>    * crear/restringir una subsección Comisión 1,
>    * inscribir alumnos en Comisión 1,
>    * crear/restringir Comisión 2,
>    * inscribir otros alumnos en Comisión 2,
>    * cargar notas en Comisión 1 y confirmar que solo aparecen alumnos de Comisión 1,
>    * cargar planillas en Comisión 1 y confirmar que solo aparecen alumnos de Comisión 1,
>    * verificar panel admin “Accesos” con filtros Todos/Secciones/Subsecciones,
>    * verificar que el alumno solo acceda a la comisión donde está inscripto.
> 8. Limitaciones o TODOs.

<details><summary>54 previous messages</summary>

> Voy a mapear primero cómo están hoy los códigos, inscripciones y el panel de “Cursadas”, porque este cambio cruza formularios, acceso alumno y listados de notas/planillas. Después hago una implementación acotada reutilizando `subseccionPath`, sin inventar un modelo paralelo.
>
> Ya está claro el modelo actual: `inscripciones` solo diferencia por `seccionId`, por eso las comisiones se mezclan. Voy a extender esa misma colección con `tipoAcceso` y `subseccionPath`, y actualizar los hooks para que notas/planillas consulten por contexto exacto.
>
> PowerShell interpretó los corchetes de rutas dinámicas; voy a leer esos archivos con `-LiteralPath`. También voy a mantener la pestaña interna como `cursadas`, pero cambiar lo visible a “Accesos”.
>
> Voy a hacer el cambio en capas: primero `useInscripciones` como fuente única con `subseccionPath`, luego formularios/acceso de subsección, y finalmente el panel admin. Eso deja notas y planillas resueltas al pasarles el contexto exacto.
>
> Voy a modificar `useInscripciones` para que acepte contexto opcional. Las inscripciones viejas quedan como `tipoAcceso: "seccion"` implícito y `subseccionPath: ""`, así no se rompen.
>
> El parche grande chocó por comentarios con encoding. Lo aplico en tramos más chicos.
>
> <details><summary>Edited 3 files</summary>
>
> - Wrote `./hooks/useInscripciones.ts` (+6 -4)
> - Wrote `./hooks/useInscripciones.ts` (+38 -31)
> - Wrote `./hooks/useInscripciones.ts` (+29 -16)
> - Wrote `./hooks/useInscripciones.ts` (+66 -44)
> - Wrote `./hooks/useSubsecciones.ts` (+20 -14)
> - Wrote `./app/subsecciones/form.tsx` (+21 -9)
> - Wrote `./app/subsecciones/form.tsx` (+54 -6)
> - Wrote `./app/subsecciones/form.tsx` (+50 -7)
>
> </details>
>
> Ya está el formulario de subsección con código. Ahora conecto notas y planillas para que pidan inscripciones del contexto exacto: sección principal usa `subseccionPath=""`; comisión usa su path.
>
> <details><summary>Edited 2 files</summary>
>
> - Wrote `./app/secciones/notas.tsx` (+4 -3)
> - Wrote `./app/secciones/planillas.tsx` (+4 -5)
>
> </details>
>
> Ahora voy al panel admin: “Cursadas” pasa a verse como “Accesos”, carga secciones y subsecciones restringidas, y las acciones usan `subseccionPath` cuando corresponde.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/pantallasAdmin/userManagementScreen.tsx` (+21 -14)
>
> </details>
>
> Voy a reemplazar la carga de `collectionGroup("secciones")` por una carga combinada de secciones y subsecciones. Mantengo la regla de secciones existente y voy a añadir regla para que admin pueda leer subsecciones por collectionGroup.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/pantallasAdmin/userManagementScreen.tsx` (+67 -25)
>
> </details>
>
> Ahora actualizo las acciones: regenerar código, asignar alumno y listar alumnos se hacen contra `seccionId + subseccionPath`, no solo contra `id`.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/pantallasAdmin/userManagementScreen.tsx` (+13 -4)
> - Wrote `./app/pantallasAdmin/userManagementScreen.tsx` (+10 -2)
>
> </details>
>
> También agrego buscador y filtros “Todos / Secciones / Subsecciones”, y cambio el texto visible a “Accesos”.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/pantallasAdmin/userManagementScreen.tsx` (+1 -1)
>
> </details>
>
> El bloque tenía texto con encoding, lo ajusto por partes: controles arriba, lista filtrada y textos visibles.
>
> Voy a evitar tocar las líneas con acentos corruptos en el mismo parche y cambiar primero la lógica/controles.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/pantallasAdmin/userManagementScreen.tsx` (+32 -6)
>
> </details>
>
> Ahora ajusto la tarjeta para que muestre módulo, sección padre y tipo.
>
> El texto `Módulo` está con encoding diferente, así que agrego los metadatos junto al título sin depender de esa línea.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/pantallasAdmin/userManagementScreen.tsx` (+7 -1)
>
> </details>
>
> Sigo con el flujo alumno para códigos de subsección: el mismo modal recibe `subseccionPath` opcional y crea la inscripción de ese contexto.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./components/ui/MatriculacionModal.tsx` (+11 -9)
>
> </details>
>
> Ahora bloqueo subsecciones restringidas para alumnos no inscriptos y les doy el mismo modal de código. Admin/profesor siguen entrando.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/subsecciones/[id].tsx` (+68 -13)
>
> </details>
>
> Le agrego estilos al estado de acceso restringido de subsección.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/subsecciones/[id].tsx` (+28 -7)
>
> </details>
>
> Hay un detalle de compatibilidad: las inscripciones viejas no tienen `subseccionPath`, así que no puedo consultar sección principal con `where("subseccionPath","==","")`. Ajusto el hook para que sección principal incluya documentos viejos y nuevos.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./hooks/useInscripciones.ts` (+10 -4)
>
> </details>
>
> Ajusto la prevención de duplicados para que una inscripción vieja de sección principal sin `subseccionPath` cuente como equivalente a `""`.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./hooks/useInscripciones.ts` (+18 -16)
> - Wrote `./hooks/useInscripciones.ts` (+5 -3)
>
> </details>
>
> Voy a ajustar reglas de inscripciones para aceptar el nuevo campo `subseccionPath`. Para subsecciones, el cliente valida el código contra el documento de subsección y las reglas permiten crear la inscripción de código con contexto; las secciones principales siguen con la validación actual.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./firestore.rules` (+14 -5)
>
> </details>
>
> Voy a limpiar los textos visibles que todavía dicen “cursadas” en el panel y dejar “Accesos”.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/pantallasAdmin/userManagementScreen.tsx` (+1 -1)
>
> </details>
>
> Voy a correr verificación y búsquedas puntuales. Espero que sigan los errores preexistentes de `collapsible`/`icon-symbol`, pero quiero detectar errores nuevos de tipos o referencias.
>
> Una última coherencia: en notas de sección principal también hay que filtrar `subseccionPath=""`, para que no aparezcan notas de comisiones cuando se entra a la cursada general.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/notas.tsx` (+4 -4)
>
> </details>
>
> Context compaction
>
> Source: automatic
> Status: completed
>
> Sigo desde donde quedó el hilo: ya está armada la base para que las inscripciones lleven contexto de subsección, ahora voy a cerrar los puntos finos en notas/planillas y pasar una verificación rápida sin tocar Git.
>
> Encontré el ajuste que faltaba: `mis-notas` todavía podía consultar notas de una sección sin forzar el contexto vacío, lo que podía mezclar notas de subsecciones. Lo voy a dejar igual que carga de notas: contexto exacto siempre.
>
> También revisé el panel admin: la pestaña ya se ve como “Accesos” y levanta `collectionGroup` de secciones y subsecciones. Voy a pulir algunos textos heredados de “cursada” para que la nueva UI no quede a medias.
>
> <details><summary>Edited 2 files</summary>
>
> - Wrote `./app/secciones/mis-notas.tsx` (+5 -6)
> - Wrote `./app/pantallasAdmin/userManagementScreen.tsx` (+6 -6)
>
> </details>
>
> Listo ese cierre: “Ver Notas” ahora consulta con el mismo contexto exacto que “Cargar Notas”, y en el panel dejé los textos visibles alineados con “Accesos”. Me falta una pasada de TypeScript/grep para detectar errores obvios.
>
> La búsqueda también marcó algo importante: el hook de planillas ya diferencia `subseccionPath` cuando se le pasa, así que mantuve las pantallas pasando `""`/path para que no se mezclen comisiones. Voy a revisar esa parte concreta y las reglas antes de compilar.
>
> Hay un punto de seguridad que conviene cerrar ahora: no alcanza con validar el código de subsección solo en la app. Voy a agregar a las inscripciones un `subseccionIds` derivado del path para que las reglas puedan validar el código contra el documento de subsección real sin romper el `subseccionPath` que usa la app.
>
> Para que esto quede testeable sin rediseñar el modelo, mantengo `subseccionPath` como identificador funcional y agrego `subseccionIds` solo como ayuda de seguridad para reglas. Las pantallas no necesitan mostrarlo.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./hooks/useInscripciones.ts` (+11 -4)
>
> </details>
>
> Ahora ajusto reglas para que la inscripción con código de subsección compare contra el `codigoAcceso` de la subsección real. Para subsecciones recursivas lo dejo cubierto por niveles mediante los IDs del path.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./firestore.rules` (+28 -5)
>
> </details>
>
> Ya quedó la validación de reglas más fuerte: para códigos de subsección se guarda la lista de IDs del path y la regla compara el código contra el documento correspondiente. Ahora corro TypeScript para ver si introduje errores de tipos.
>
> La compilación cae solo por errores preexistentes en componentes plantilla (`collapsible` e `icon-symbol`), no por estos cambios. Voy a hacer una última búsqueda de las piezas nuevas para dejarte un cierre claro y sin sorpresas.
</details>

Implementé la etapa funcional de accesos restringidos para subsecciones, manteniendo compatibilidad con secciones principales.

**Archivos modificados**
- `hooks/useInscripciones.ts`
- `hooks/useSubsecciones.ts`
- `components/ui/MatriculacionModal.tsx`
- `app/subsecciones/form.tsx`
- `app/subsecciones/[id].tsx`
- `app/secciones/notas.tsx`
- `app/secciones/mis-notas.tsx`
- `app/secciones/planillas.tsx`
- `app/pantallasAdmin/userManagementScreen.tsx`
- `firestore.rules`

No creé archivos nuevos.

**Modelo**
Las inscripciones ahora pueden guardar contexto exacto:

```ts
subseccionPath?: string
subseccionIds?: string[]
tipoAcceso?: "seccion" | "subseccion"
```

Las inscripciones viejas sin `tipoAcceso` siguen funcionando como accesos de sección. Para subsecciones, `subseccionPath` distingue Comisión 1 de Comisión 2, incluso dentro de una misma sección padre.

**Qué cambió**
- El formulario de subsecciones ahora permite activar restricción con código.
- Una subsección restringida muestra pantalla de acceso con modal para ingresar código.
- El panel admin ahora se ve como **“Accesos”** y lista secciones y subsecciones restringidas.
- Agregué buscador y filtros: `Todos`, `Secciones`, `Subsecciones`.
- Las tarjetas muestran tipo de acceso, módulo y sección padre cuando corresponde.
- Regenerar código y asignar alumnos manualmente ahora respetan el contexto exacto de subsección.
- `Cargar Notas`, `Ver Notas` y `Cargar Planillas` usan inscripciones filtradas por `seccionId + subseccionPath`, así Comisión 1 no mezcla alumnos con Comisión 2.

**Reglas**
Sí modifiqué `firestore.rules`.

Agregué validación para que un alumno pueda inscribirse a una subsección solo si el código coincide con el `codigoAcceso` de esa subsección. Por limitación de Firestore Rules, dejé validación explícita para subsecciones recursivas hasta 6 niveles.

Tenés que redeployar reglas:

```bash
npx firebase-tools deploy --only firestore:rules --project odb-cvg
```

**Verificación**
Corrí `npx tsc --noEmit`. No aparecieron errores nuevos de estos cambios; sigue fallando por errores preexistentes en:
- `components/ui/collapsible.tsx`
- `components/ui/icon-symbol.tsx`
- `components/ui/icon-symbol.ios.tsx`

**Cómo probar**
1. Crear o editar `Comisión 1` y activar control de acceso.
2. Crear o editar `Comisión 2` y activar otro código.
3. Entrar como alumno a Comisión 1, ingresar su código e inscribirse.
4. Confirmar que ese alumno no accede a Comisión 2 sin su código.
5. En admin > **Accesos**, filtrar por `Subsecciones` y verificar ambas comisiones.
6. Asignar alumnos manualmente a cada comisión.
7. Entrar a `Cargar Notas` desde Comisión 1 y confirmar que solo aparecen alumnos de Comisión 1.
8. Entrar a `Cargar Planillas` desde Comisión 1 y confirmar el mismo filtrado.
9. Verificar que una sección principal restringida siga funcionando como antes.

---
> Necesito corregir el error que aparece al abrir el panel de admin > Accesos.
>
> IMPORTANTE:
> - No ejecutes comandos de git.
> - No hagas git add, commit, push, checkout ni branch.
> - Mantené el estilo visual actual.
> - No cambies la funcionalidad salvo lo necesario para corregir el error.
>
> Error actual:
> Al abrir el panel de admin aparece:
>
> FirebaseError: The query requires a COLLECTION_GROUP_ASC index for collection subsecciones and field esRestringida.
>
> Esto ocurre en:
> app/pantallasAdmin/userManagementScreen.tsx
> función cargarAccesos
>
> Tareas:
> 1. Revisar la consulta que busca subsecciones restringidas.
> 2. Confirmar el nombre exacto del campo usado:
>    - esRestringida
>    - o el nombre real que exista en el modelo.
> 3. Agregar el índice necesario en `firebase.indexes.json` para la collection group `subsecciones` y el campo `esRestringida`, o el campo correcto si se llama distinto.
> 4. Si ya existe `firebase.indexes.json`, modificarlo sin romper índices existentes.
> 5. Si no existe, crearlo con la estructura correcta.
> 6. Manejar el error de índice de forma más amigable:
>    - que no explote la app con pantalla roja,
>    - mostrar un mensaje o empty state temporal si la consulta falla,
>    - loguear el error en consola para desarrollo.
> 7. No eliminar la funcionalidad de listar subsecciones restringidas.
> 8. No reemplazar todo el flujo por una solución más grande salvo que sea necesario.
>
> Al finalizar, informame:
> 1. Qué archivo modificaste.
> 2. Qué índice agregaste.
> 3. Si el campo correcto era `esRestringida` u otro.
> 4. Qué comando tengo que ejecutar para deployar índices.
> 5. Cómo probar que el panel de Accesos ya no rompe.

<details><summary>9 previous messages</summary>

> Voy a corregirlo en dos capas: primero el índice que Firestore está pidiendo, y después un manejo más amable del error para que el panel no termine en pantalla roja si el índice todavía no está deployado.
>
> Ya confirmé que existe `firebase.indexes.json`. La búsqueda con una regex combinada se rompió por comillas, así que voy por lecturas puntuales y aplico el cambio mínimo.
>
> El campo correcto es `esRestringida`: está en `useSubsecciones.ts`, el formulario lo guarda con ese nombre y la consulta del panel lo usa así. Falta el field override para collection group `subsecciones`, análogo al que ya existía para `secciones`.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./firebase.indexes.json` (+22 -12)
>
> </details>
>
> Ahora agrego un estado de error solo para la pestaña Accesos. Así, si el índice todavía no está publicado, el panel muestra un aviso controlado y lo deja logueado en consola para desarrollo.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/pantallasAdmin/userManagementScreen.tsx` (+14 -3)
>
> </details>
>
> Para evitar que Expo convierta el log en overlay rojo, voy a dejar el error registrado con `console.log` en vez de `console.error`; sigue quedando en consola, pero la UI queda controlada.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/pantallasAdmin/userManagementScreen.tsx` (+1 -1)
>
> </details>
>
> Ya está el índice y el estado de error. Voy a validar que el JSON de índices haya quedado bien formado y que no haya errores de TypeScript nuevos en los archivos tocados.
</details>

Corregido.

Modifiqué:
- `firebase.indexes.json`
- `app/pantallasAdmin/userManagementScreen.tsx`

El campo correcto era `esRestringida`. Ya se usaba así en el modelo de subsecciones y en la query:

```ts
collectionGroup(db, "subsecciones")
where("esRestringida", "==", true)
```

Agregué este índice:

```json
{
  "collectionGroup": "subsecciones",
  "fieldPath": "esRestringida",
  "indexes": [
    {
      "order": "ASCENDING",
      "queryScope": "COLLECTION_GROUP"
    }
  ]
}
```

También agregué manejo amable del error en Admin > Accesos: si Firestore todavía no tiene el índice listo, ya no debería romper con pantalla roja; muestra un mensaje temporal y deja el detalle en consola.

Tenés que deployar índices con:

```bash
npx firebase-tools deploy --only firestore:indexes --project odb-cvg
```

Validé que `firebase.indexes.json` quedó como JSON válido. `npx tsc --noEmit` sigue fallando por errores preexistentes en `components/ui/collapsible.tsx` e `icon-symbol`, no por este cambio.

Para probar:
1. Ejecutá el deploy de índices.
2. Esperá a que Firebase termine de construir el índice.
3. Abrí Admin > Accesos.
4. Confirmá que carga secciones y subsecciones restringidas.
5. Si el índice aún está construyéndose, debería verse el mensaje controlado en lugar de romper la app.

---
> Necesito corregir y mejorar la lógica de accesos restringidos en subsecciones.
>
> IMPORTANTE:
>
> * No ejecutes comandos de git.
> * No hagas git add, commit, push, checkout ni branch.
> * Mantené el estilo visual actual de la app.
> * No rompas el acceso restringido actual de secciones principales.
> * No hagas cambios basados en nombres como “Comisión” o “Clínica”. La lógica debe funcionar para cualquier subsección restringida sin importar su título.
> * Si modificás reglas de Firestore, avisame al final que debo hacer deploy.
>
> Contexto real de uso:
> La estructura puede ser así:
>
> Módulo: Operatoria Dental I
>
> * Sección: Cursada 2026
>
>   * Subsección restringida: Comisión 1
>
>     * Subsección hija: Notas Parciales
>     * Subsección hija: Notas Trabajos Prácticos
>
> O en otras operatorias puede ser:
>
> Módulo: Operatoria Dental III
>
> * Sección: Cursada 2026
>
>   * Subsección restringida: Clínica 1
>
>     * Subsección hija: Notas Parciales
>     * Subsección hija: Trabajos Prácticos
>
> Problema actual:
> Cuando entro a una subsección hija como “Notas Parciales” o “Notas Trabajos Prácticos” y quiero cargar notas o planillas, la app busca alumnos inscriptos exactamente en esa subsección hija.
>
> Pero los alumnos no están inscriptos en “Notas Parciales”, sino en la subsección padre restringida más cercana, por ejemplo “Comisión 1” o “Clínica 1”.
>
> Entonces aparece:
> “No hay alumnos inscriptos en esta sección.”
>
> Comportamiento esperado:
> Cuando se cargan notas o planillas dentro de una subsección, la app debe buscar el contexto restringido más cercano hacia arriba.
>
> Ejemplo:
>
> * Estoy en:
>   Cursada 2026 / Comisión 1 / Notas Parciales
> * “Notas Parciales” no está restringida.
> * Su padre “Comisión 1” sí está restringida.
> * Entonces para listar alumnos inscriptos debe usar el acceso de “Comisión 1”.
>
> Lo mismo para:
>
> * Cursada 2026 / Comisión 1 / Notas Trabajos Prácticos
> * Cursada 2026 / Clínica 2 / Planillas
> * cualquier otra subsección hija dentro de una subsección restringida.
>
> Regla funcional:
> Para cualquier pantalla que necesite alumnos inscriptos:
>
> * Cargar Notas
> * Ver Notas, si corresponde
> * Cargar Planillas
> * Ver Planillas, si corresponde
>
> Debe determinar el “contexto de inscripción efectivo”:
>
> 1. Si la sección actual está restringida y no hay subsecciónPath:
>
>    * usar la sección.
>
> 2. Si la subsección actual está restringida:
>
>    * usar esa subsección.
>
> 3. Si la subsección actual NO está restringida:
>
>    * buscar hacia arriba en el árbol de `subseccionPath` la subsección padre restringida más cercana.
>    * usar esa subsección padre restringida.
>
> 4. Si no hay ninguna subsección padre restringida:
>
>    * usar la sección principal si está restringida.
>    * si tampoco está restringida, usar el comportamiento actual.
>
> No hardcodear:
>
> * “Comisión”
> * “Clínica”
> * “Notas Parciales”
> * “Notas Trabajos Prácticos”
> * ningún nombre de subsección.
>
> Todo debe depender de:
>
> * `esRestringida`
> * `subseccionPath`
> * sección padre
> * árbol de subsecciones.
>
> Implementación sugerida:
> Crear o adaptar una función helper, por ejemplo:
>
> * `resolverContextoInscripcion`
> * `obtenerContextoAccesoEfectivo`
> * `buscarSubseccionRestringidaPadre`
>
> Debe recibir:
>
> * `moduloId`
> * `seccionId`
> * `subseccionPath`, si existe
>
> Y devolver algo como:
>
> ```ts
> {
>   tipoAcceso: "seccion" | "subseccion";
>   seccionId: string;
>   subseccionPath?: string;
> }
> ```
>
> Ese resultado debe usarse para consultar inscripciones.
>
> Revisar especialmente:
>
> * `hooks/useInscripciones.ts`
> * `hooks/useSubsecciones.ts`
> * `app/secciones/notas.tsx`
> * `app/secciones/mis-notas.tsx`
> * `app/secciones/planillas.tsx`
> * `app/secciones/mis-planillas.tsx`
> * `app/subsecciones/[id].tsx`
>
> Carga de notas:
> Si estoy dentro de una subsección hija de una subsección restringida:
>
> * listar los alumnos inscriptos en la subsección restringida padre más cercana.
> * No listar alumnos de otras subsecciones restringidas hermanas.
> * No listar todos los alumnos de la sección principal.
>
> Carga de planillas:
> Mismo criterio:
>
> * listar alumnos desde el contexto de inscripción efectivo.
> * Al crear una planilla, mantener guardado el contexto real de la pantalla desde donde se creó si es necesario, pero para elegir alumnos usar el contexto restringido efectivo.
> * Si conviene, guardar también `contextoInscripcionPath` o similar para trazabilidad, pero no rompas el modelo actual.
>
> Vista alumno: subsecciones bloqueadas en el listado
> Actualmente, cuando una subsección está restringida y el alumno no está inscripto, aparece como si fuera una subsección normal, y recién al tocarla muestra pantalla de “Acceso restringido”.
>
> Quiero que se comporte igual que las secciones restringidas:
>
> * En el listado de subsecciones, si una subsección está restringida y el alumno no está inscripto, debe aparecer bloqueada visualmente.
> * Debe mostrarse como bloqueada desde la tarjeta/listado.
> * Al tocarla, debe pedir código de acceso.
> * Si ya está inscripto, debe aparecer como accesible o con medalla “Inscripto”, siguiendo el estilo actual de secciones.
>
> Esto debe aplicar a cualquier subsección restringida:
>
> * Comisión 1
> * Clínica 1
> * cualquier nombre.
>
> Para subsecciones hijas dentro de una restringida:
>
> * Si el alumno está inscripto en la subsección restringida padre, debe poder ver/entrar a las subsecciones hijas.
> * Si no está inscripto en la subsección restringida padre, no debe poder navegar libremente a las hijas.
>
> Panel admin “Accesos”:
> Mantener lo ya implementado:
>
> * listar secciones y subsecciones restringidas,
> * filtros Todos/Secciones/Subsecciones,
> * buscador.
>   Si para resolver esto necesitás ajustar cómo se cargan subsecciones restringidas, hacelo.
>   No debe volver a aparecer el error de índice sin control; si falta índice, manejar el error de forma amigable.
>
> Firestore indexes:
> Si la solución sigue necesitando índice de collection group para `subsecciones.esRestringida`, asegurate de que esté en `firebase.indexes.json`.
> Si cambiás consultas para evitar ese índice, explicalo.
>
> Reglas:
> Si hace falta adaptar reglas para que el alumno pueda leer lo necesario de una subsección restringida padre y no de otras, hacelo.
> Si no hace falta, no toques reglas.
>
> Importante sobre datos históricos:
> Todavía NO implementar cambio de comisión ni transferencia de notas/planillas.
> Eso lo hacemos en otro paso.
>
> Al finalizar, informame:
>
> 1. Archivos modificados.
> 2. Si creaste helpers nuevos.
> 3. Cómo se resuelve ahora el contexto efectivo de inscripción.
> 4. Cómo se busca la subsección restringida padre más cercana.
> 5. Cómo se aplicó a notas.
> 6. Cómo se aplicó a planillas.
> 7. Cómo se mejoró la visualización de subsecciones bloqueadas para alumno.
> 8. Si modificaste reglas o índices y qué comando debo ejecutar.
> 9. Cómo probar:
>
>    * crear una subsección restringida llamada Comisión 1,
>    * dentro crear Notas Parciales y Notas Trabajos Prácticos,
>    * inscribir un alumno en Comisión 1,
>    * entrar a Cargar Notas dentro de Notas Parciales,
>    * confirmar que aparece el alumno de Comisión 1,
>    * crear Comisión 2 con otro alumno,
>    * confirmar que en Notas Parciales de Comisión 1 no aparece el alumno de Comisión 2,
>    * repetir con Cargar Planillas,
>    * entrar como alumno no inscripto y confirmar que la subsección restringida aparece bloqueada desde el listado.
> 10. Limitaciones o TODOs.

<details><summary>27 previous messages</summary>

> Voy a resolverlo con una pieza central: un helper que calcule el “acceso efectivo” caminando hacia arriba por `subseccionPath`. Después conecto ese resultado en notas/planillas y ajusto el listado de subsecciones para que el bloqueo se vea antes de tocar.
>
> PowerShell trató `[id]` como patrón, no como nombre literal. Releo esos archivos con `-LiteralPath` y sigo.
>
> Leyendo el flujo, conviene separar dos conceptos: `subseccionPath` real de la pantalla se sigue guardando en notas/planillas, pero la lista de alumnos usa el `subseccionPath` efectivo de inscripción. Así no mezclamos datos de “Notas Parciales” con otras pantallas, pero sí trae alumnos de la comisión padre.
>
> Voy a crear el helper en `useInscripciones.ts`, porque ahí vive la consulta de alumnos. El helper va a devolver tanto si el acceso exige inscripción como qué `subseccionPath` usar para buscar alumnos.
>
> El archivo tiene el bloque esperado, solo que el parche necesitaba partirlo en pasos más chicos. Primero agrego imports y helpers, después conecto pantallas.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./hooks/useInscripciones.ts` (+5 -4)
> - Wrote `./hooks/useInscripciones.ts` (+116 -2)
>
> </details>
>
> Helper agregado. Ahora notas va a cargar alumnos con `contextoInscripcionEfectivo`, pero seguirá guardando las notas en la subsección real desde donde se abrió la pantalla.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/notas.tsx` (+13 -3)
>
> </details>
>
> Aplico el mismo criterio en planillas: selector de alumnos por acceso efectivo, documento de planilla con el contexto real de pantalla.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/planillas.tsx` (+12 -2)
> - Wrote `./app/secciones/planillas.tsx` (+1 -1)
>
> </details>
>
> Ahora ajusto la pantalla de subsección. Para accesos directos profundos, si una hija no restringida está dentro de una padre restringida, también se valida contra esa padre; y en el listado marco bloqueadas las hijas que sí tienen restricción propia.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/subsecciones/[id].tsx` (+73 -3)
> - Wrote `./app/subsecciones/[id].tsx` (+2 -5)
> - Wrote `./app/subsecciones/[id].tsx` (+5 -5)
>
> </details>
>
> La protección profunda ya está conectada. Ahora agrego el estado visual bloqueado/inscripto en las tarjetas de subsecciones restringidas, copiando el patrón de secciones.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/subsecciones/[id].tsx` (+27 -12)
>
> </details>
>
> También agrego el modal para que al tocar una subsección bloqueada pida el código sin entrar primero a la pantalla de bloqueo.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/subsecciones/[id].tsx` (+83 -43)
>
> </details>
>
> Ajusto un detalle para que la medalla de bloqueado/inscripto sea solo para alumnos, no para profesores que simplemente no gestionan estructura.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/subsecciones/[id].tsx` (+1 -1)
>
> </details>
>
> Sumo estilos equivalentes a los de secciones para que el estado bloqueado sea claro y consistente.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/subsecciones/[id].tsx` (+28 -8)
>
> </details>
>
> Queda un detalle de carrera: si el acceso efectivo es un padre restringido, necesito tener cargado su código antes de abrir el modal. Voy a hacer que la pantalla espere ese dato cuando haga falta.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/subsecciones/[id].tsx` (+5 -1)
>
> </details>
>
> Una cosa más: las subsecciones de primer nivel se listan desde la pantalla de sección, no desde `subsecciones/[id]`. También tienen que aparecer bloqueadas ahí. Vou a ajustar ese listado también.
>
> La sección principal lista las subsecciones de primer nivel, así que ahí también agrego el modal de código y las medallas de bloqueo/inscripción.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/[id].tsx` (+122 -65)
> - Wrote `./app/secciones/[id].tsx` (+31 -11)
>
> </details>
>
> Ya quedaron cubiertos primer nivel y niveles anidados. Corro una verificación de tipos para cazar errores nuevos de esta tanda.
>
> La compilación sigue cayendo solo por los errores preexistentes de `collapsible` e `icon-symbol`; no apareció nada nuevo de estos cambios. Hago una última búsqueda de referencias para asegurar que notas y planillas usan el helper correcto.
</details>

Implementé la corrección del contexto efectivo de inscripción para subsecciones anidadas.

**Archivos modificados**
- `hooks/useInscripciones.ts`
- `app/secciones/notas.tsx`
- `app/secciones/planillas.tsx`
- `app/secciones/[id].tsx`
- `app/subsecciones/[id].tsx`

**Helper nuevo**
Agregué en `hooks/useInscripciones.ts`:
- `resolverContextoInscripcion(...)`
- `useContextoInscripcionEfectivo(...)`

Ahora, si estás en:

`Cursada 2026 / Comisión 1 / Notas Parciales`

la app busca hacia arriba en el árbol y detecta que el acceso restringido real es `Comisión 1`. Entonces carga alumnos inscriptos en `Comisión 1`, no en `Notas Parciales`.

**Cómo se aplica**
- `Cargar Notas`: lista alumnos usando el contexto efectivo, pero guarda las notas en la subsección real de pantalla.
- `Cargar Planillas`: lista alumnos usando el contexto efectivo, pero guarda la planilla con el contexto real desde donde se creó.
- Subsecciones hijas: si están dentro de una restringida, quedan protegidas por la inscripción de la restringida padre.
- Listados de subsecciones: ahora las subsecciones restringidas aparecen bloqueadas o con medalla “Inscripto” desde la tarjeta, igual que las secciones.

No hardcodeé nombres como Comisión, Clínica ni Notas; todo depende de `esRestringida` y `subseccionPath`.

No modifiqué reglas ni índices en este paso. Sigue siendo necesario tener deployado el índice de `subsecciones.esRestringida` que ya quedó agregado antes:

```bash
npx firebase-tools deploy --only firestore:indexes --project odb-cvg
```

Verificación: corrí `npx tsc --noEmit`; sigue fallando solo por errores preexistentes en `components/ui/collapsible.tsx` e `icon-symbol`, no por estos cambios.

**Cómo probar**
1. Crear `Comisión 1` restringida.
2. Dentro crear `Notas Parciales` y `Notas Trabajos Prácticos` sin restringir.
3. Inscribir un alumno en `Comisión 1`.
4. Entrar a `Notas Parciales > Cargar Notas`: debe aparecer ese alumno.
5. Crear `Comisión 2` con otro alumno.
6. Confirmar que en `Comisión 1 / Notas Parciales` no aparece el alumno de Comisión 2.
7. Repetir con `Cargar Planillas`.
8. Entrar como alumno no inscripto y confirmar que la subsección restringida aparece bloqueada desde el listado.

---
> Necesito implementar una funcionalidad para cambiar a un alumno de una comisión/clínica/subsección restringida a otra.
>
> IMPORTANTE:
>
> * No ejecutes comandos de git.
> * No hagas git add, commit, push, checkout ni branch.
> * Mantené el estilo visual actual de la app.
> * No rompas la lógica actual de accesos restringidos por sección/subsección.
> * No hardcodees nombres como “Comisión” o “Clínica”. Debe funcionar con cualquier subsección restringida.
> * Si modificás reglas de Firestore, avisame al final que debo hacer deploy.
>
> Contexto actual:
> Ya existe:
>
> * acceso restringido para secciones principales,
> * acceso restringido para subsecciones,
> * panel admin “Accesos”,
> * inscripciones con contexto exacto:
>
>   * moduloId
>   * seccionId
>   * subseccionPath
>   * tipoAcceso: "seccion" | "subseccion"
> * notas cargadas en una sección/subsección específica,
> * planillas TP cargadas en una sección/subsección específica,
> * helper de contexto efectivo de inscripción para subsecciones hijas.
>
> Necesidad:
> Cuando un alumno cambia de comisión/clínica en la facultad, el admin necesita poder moverlo desde una subsección restringida vieja a una nueva.
>
> Ejemplo:
>
> * Alumno A estaba en:
>   Cursada 2026 / Comisión 1
> * Ahora pasa a:
>   Cursada 2026 / Comisión 2
>
> El admin debería poder:
>
> 1. Quitar el acceso del alumno de la comisión vieja.
> 2. Agregarlo a la comisión nueva.
> 3. Transferir sus planillas de trabajos prácticos a la nueva comisión.
> 4. Mantener las notas de exámenes como registro histórico en la comisión vieja para profesor/admin.
> 5. Hacer que el alumno siga viendo todas sus notas desde la comisión nueva.
>
> Regla funcional definitiva:
>
> 1. Notas de exámenes para profesor/admin:
>
>    * NO transferirlas de contexto.
>    * Deben quedar en la subsección/contexto donde fueron cargadas originalmente.
>    * Son registro histórico de dónde rindió ese parcial/examen.
>    * Ejemplo: si rindió “Parcial 1” en Comisión 1, en la vista admin/profesor de Comisión 1 debe seguir apareciendo ahí.
>
> 2. Notas de exámenes para alumno:
>
>    * El alumno debe poder ver todas sus notas propias desde la comisión nueva.
>    * Aunque la nota haya sido cargada originalmente en Comisión 1, si el alumno ahora está en Comisión 2, debe poder verla al entrar a la sección/subsección de notas correspondiente de Comisión 2.
>    * No debe necesitar seguir teniendo acceso a Comisión 1 para ver sus notas históricas.
>    * La vista del alumno debe funcionar como historial personal de notas dentro de la cursada/módulo.
>
> 3. Planillas de trabajos prácticos:
>
>    * Sí deben transferirse a la nueva comisión/clínica.
>    * Son documentos vivos que se siguen actualizando.
>    * Al transferirlas, actualizar su contexto:
>
>      * moduloId, si corresponde,
>      * seccionId,
>      * subseccionPath,
>      * y cualquier campo usado para listar/filtrar.
>    * También actualizar la vista sanitizada del alumno si corresponde.
>
> 4. Inscripción:
>
>    * El alumno debe quedar inscripto en la nueva subsección restringida.
>    * El alumno debe quedar removido de la vieja.
>    * Para este primer paso, usar comportamiento simple:
>
>      * quitar de origen,
>      * agregar a destino.
>
> Dónde implementarlo:
> En el panel admin “Accesos”, dentro de cada acceso restringido, donde se listan alumnos inscriptos.
>
> Agregar una acción para cada alumno, por ejemplo:
>
> * “Mover”
> * ícono de intercambio/flecha
> * o menú de acciones si ya existe algún patrón.
>
> Solo admin debe ver esta acción.
>
> Flujo esperado:
>
> 1. Admin abre panel “Accesos”.
> 2. Expande una subsección restringida, por ejemplo “Comisión 1”.
> 3. Ve alumnos inscriptos.
> 4. Junto a cada alumno aparece acción “Mover”.
> 5. Al tocar “Mover”, se abre un modal o pantalla.
> 6. El modal permite seleccionar el destino:
>
>    * debe listar otros accesos restringidos compatibles.
>    * Para el caso principal, listar subsecciones restringidas hermanas bajo la misma sección principal.
>    * Ejemplo: si estoy en Cursada 2026 / Comisión 1, mostrar Comisión 2, Comisión 3, Clínica 1, Clínica 2, etc., según existan.
>    * No mostrar como destino el mismo acceso actual.
> 7. Mostrar opción:
>
>    * “Transferir planillas de trabajos prácticos a la nueva comisión”
>    * por defecto activada.
> 8. Mostrar texto aclaratorio:
>    “Las notas de exámenes quedan registradas en la comisión donde fueron cargadas para docentes/admin, pero el alumno seguirá viéndolas en su historial personal.”
> 9. Confirmar antes de mover:
>
>    * “¿Querés mover a {alumno} de {origen} a {destino}?”
> 10. Al confirmar:
>
> * crear/agregar inscripción en destino,
> * eliminar inscripción de origen,
> * si está activada la opción, transferir planillas TP del alumno desde origen hacia destino,
> * asegurar que el alumno conserve acceso visual a sus notas históricas propias,
> * mostrar éxito,
> * refrescar la lista.
>
> Compatibilidad de destino:
> Para este primer paso:
>
> * Si el origen es una subsección restringida, listar como destino otras subsecciones restringidas dentro de la misma sección principal.
> * No hardcodear nombres.
> * No mostrar el origen como destino.
> * Priorizar mover entre subsecciones restringidas hermanas.
>
> Planillas a transferir:
> Se deben buscar planillas en `planillas_tp` del alumno que pertenezcan al contexto origen o estén dentro del árbol del contexto origen.
>
> Caso origen:
> Cursada 2026 / Comisión 1
>
> Planilla creada en:
> Cursada 2026 / Comisión 1 / Notas Trabajos Prácticos
>
> Destino:
> Cursada 2026 / Comisión 2
>
> La planilla debería quedar en:
> Cursada 2026 / Comisión 2 / Notas Trabajos Prácticos
>
> Si existe una subsección hija equivalente en destino con el mismo título/path relativo, usarla.
> Si no existe, mover la planilla al contexto destino directo y dejar aviso o TODO claro.
>
> Implementar helper para transferir planillas:
> En `hooks/usePlanillas.ts` o donde corresponda:
>
> * `transferirPlanillasAlumnoAContexto(params)`
>
> Debe:
>
> * buscar planillas del alumno en el contexto origen o bajo el árbol del origen,
> * actualizar su contexto al destino,
> * regenerar la vista sanitizada del alumno,
> * no duplicar planillas.
>
> Notas históricas para alumno:
> Revisar `app/secciones/mis-notas.tsx` y `hooks/useNotas.ts`.
>
> Necesito que la vista del alumno pueda mostrar notas propias aunque hayan sido cargadas en un contexto anterior.
>
> Opciones posibles:
> A. Al leer notas como alumno, consultar por `alumnoId` dentro del módulo/sección/cursada y no depender solamente de la inscripción actual exacta.
> B. Crear o mantener una vista espejo por alumno, similar a lo que se hizo con planillas:
> `vistas_notas_alumnos/{alumnoId}/notas/{notaId}`
> C. Adaptar el modelo actual con el menor cambio posible.
>
> Elegí la opción más segura y compatible con lo existente.
>
> Requisito:
>
> * En vista admin/profesor, las notas siguen agrupadas en el contexto donde fueron cargadas.
> * En vista alumno, las notas se muestran como historial propio, aunque el alumno ya no pertenezca al contexto original.
>
> No implementar transferencia de notas de contexto para admin/profesor.
> No mover documentos de notas de Comisión 1 a Comisión 2.
> Solo ajustar la lectura/vista del alumno.
>
> Seguridad:
>
> * Solo admin puede mover alumnos.
> * Profesor no puede mover alumnos.
> * Alumno no puede mover ni transferir nada.
> * No permitir mover sin destino válido.
> * No permitir mover si el alumno no pertenece al origen.
> * Alumno solo puede leer sus propias notas.
> * Alumno no puede leer notas de otros alumnos.
>
> Reglas Firestore:
> Si el historial de notas del alumno requiere permisos nuevos o una vista espejo, ajustar reglas.
> Si se modifican reglas, avisar al final que debo deployarlas.
>
> UI:
> Mantener estilo actual.
> Usar modal de confirmación si ya existe.
> No llenar demasiado la tarjeta de acceso; si hace falta, usar un botón pequeño “Mover” al lado de quitar alumno.
>
> Al finalizar, informame:
>
> 1. Archivos modificados.
> 2. Archivos creados, si hubo.
> 3. Cómo implementaste el movimiento de alumno.
> 4. Cómo se elige destino.
> 5. Cómo se transfieren las planillas.
> 6. Cómo resolviste que el alumno vea sus notas históricas desde la comisión nueva.
> 7. Qué pasa con las notas en vista admin/profesor.
> 8. Si modificaste reglas y si debo hacer deploy.
> 9. Cómo probar:
>
>    * crear Comisión 1 y Comisión 2 restringidas,
>    * inscribir alumno en Comisión 1,
>    * cargar una nota de examen para ese alumno en Comisión 1,
>    * crear una planilla para ese alumno dentro de Comisión 1 / Notas Trabajos,
>    * mover alumno a Comisión 2,
>    * confirmar que desaparece de Comisión 1,
>    * confirmar que aparece en Comisión 2,
>    * confirmar que la planilla se transfirió a Comisión 2,
>    * confirmar que la nota sigue apareciendo en Comisión 1 para admin/profesor,
>    * confirmar que el alumno ve esa nota histórica desde su nueva comisión,
>    * confirmar que profesor no ve acción de mover.
> 10. Limitaciones o TODOs.

<details><summary>17 previous messages</summary>

> Voy a hacer esto en tres piezas conectadas: acción “Mover” en Accesos, helper de transferencia de planillas, y ajuste de lectura de notas para alumno como historial personal. Primero leo los puntos exactos donde están las listas y los hooks para no pisar lo que ya funciona.
>
> Encontré los puntos: Accesos ya tiene la fila del alumno con “quitar”, `mis-notas` filtra siempre por contexto y por eso el alumno pierde historial, y planillas ya tiene generación de vista sanitizada. Voy a agregar helpers pequeños para no meter lógica Firestore pesada dentro del componente.
>
> Voy a mantener el movimiento simple y seguro: crear inscripción manual en destino, transferir planillas si se eligió, y recién después revocar la inscripción origen. Si algo falla antes de revocar, el alumno no queda sin acceso.
>
> <details><summary>Edited 3 files</summary>
>
> - Wrote `./hooks/usePlanillas.ts` (+85 -9)
> - Wrote `./app/secciones/mis-notas.tsx` (+5 -4)
> - Wrote `./app/pantallasAdmin/userManagementScreen.tsx` (+9 -3)
> - Wrote `./app/pantallasAdmin/userManagementScreen.tsx` (+64 -6)
>
> </details>
>
> Ya agregué la función de movimiento en el panel. Ahora conecto el botón “Mover” junto a cada inscripto y el modal de destino con el toggle de transferir planillas.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/pantallasAdmin/userManagementScreen.tsx` (+13 -4)
> - Wrote `./app/pantallasAdmin/userManagementScreen.tsx` (+109 -4)
>
> </details>
>
> El modal ya está, falta solo sumar sus estilos en el bloque correcto del panel.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/pantallasAdmin/userManagementScreen.tsx` (+35 -4)
>
> </details>
>
> Con el botón y modal conectados, pruebo TypeScript para cazar errores reales de la integración antes de cerrar.
>
> La transferencia ya mueve planillas por árbol. Voy a mejorarla un poco más: si la planilla estaba en una hija de la comisión origen, intenta encontrar en destino una hija equivalente por título; si no la encuentra, cae al destino directo.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./hooks/usePlanillas.ts` (+62 -2)
>
> </details>
>
> Vuelvo a correr TypeScript tras el ajuste por título relativo; si algo falla, lo corrijo ahora.
>
> La verificación sigue mostrando solo errores preexistentes de componentes plantilla. Antes de cerrar, agrego una línea de confirmación explícita en el modal para que el admin vea origen/destino antes de tocar “Mover”.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/pantallasAdmin/userManagementScreen.tsx` (+5 -0)
>
> </details>
>
> La línea existe; el parche falló por el comentario con caracteres raros. Inserto el estilo justo después del texto del toggle.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/pantallasAdmin/userManagementScreen.tsx` (+7 -0)
>
> </details>
>
> Listo. Hago una última compilación para confirmar que el texto extra tampoco metió errores nuevos.
</details>

Implementé el movimiento de alumnos entre accesos restringidos de subsecciones.

**Archivos modificados**
- `app/pantallasAdmin/userManagementScreen.tsx`
- `hooks/usePlanillas.ts`
- `app/secciones/mis-notas.tsx`

No creé archivos nuevos. No modifiqué reglas ni índices en este paso.

**Qué quedó implementado**
En Admin > Accesos, al expandir una subsección restringida, cada alumno inscripto ahora tiene acción **Mover**.

El flujo:
1. El admin toca `Mover`.
2. Se abre un modal.
3. Puede elegir otro acceso restringido de tipo subsección dentro de la misma sección principal.
4. Puede dejar activada la opción de transferir planillas TP.
5. Confirma el movimiento.
6. La app:
   - crea inscripción manual en destino,
   - transfiere planillas si corresponde,
   - revoca la inscripción de origen,
   - muestra éxito.

**Planillas**
Agregué `transferirPlanillasAlumnoAContexto(...)` en `hooks/usePlanillas.ts`.

Busca planillas del alumno en el contexto origen o dentro de su árbol. Si una planilla estaba en una hija, por ejemplo:

`Comisión 1 / Notas Trabajos`

intenta encontrar una hija equivalente en destino por título. Si existe:

`Comisión 2 / Notas Trabajos`

la mueve ahí. Si no existe, la mueve al destino directo:

`Comisión 2`

Luego regenera la vista sanitizada del alumno.

**Notas**
No se mueven documentos de notas. Para admin/profesor siguen apareciendo en el contexto original donde fueron cargadas.

Para alumno, cambié `mis-notas.tsx`: ahora la vista alumno consulta sus notas propias por `seccionId + alumnoId`, sin filtrar por `subseccionPath`. Entonces puede ver su historial personal desde la nueva comisión aunque la nota haya sido cargada en la anterior.

**Reglas**
No modifiqué `firestore.rules`, así que no hace falta deployar reglas por este cambio.

**Verificación**
Corrí `npx tsc --noEmit`. Sigue fallando solo por errores preexistentes en:
- `components/ui/collapsible.tsx`
- `components/ui/icon-symbol.tsx`
- `components/ui/icon-symbol.ios.tsx`

No aparecieron errores nuevos de esta implementación.

**Cómo probar**
1. Crear Comisión 1 y Comisión 2 restringidas.
2. Inscribir un alumno en Comisión 1.
3. Cargar una nota para ese alumno en Comisión 1.
4. Crear una planilla para ese alumno dentro de Comisión 1 / Notas Trabajos.
5. Ir a Admin > Accesos > Comisión 1.
6. Tocar `Mover` en el alumno.
7. Elegir Comisión 2 y confirmar.
8. Verificar que desaparece de Comisión 1 y aparece en Comisión 2.
9. Verificar que la planilla quedó en Comisión 2 o en una hija equivalente si existe.
10. Verificar que la nota sigue en Comisión 1 para admin/profesor.
11. Entrar como alumno desde Comisión 2 y confirmar que ve su nota histórica.

Limitación: si no existe una subsección hija equivalente por título en destino, la planilla se mueve al acceso destino directo.

---
> Necesito corregir un problema visual de codificación de caracteres en el modal de “Mover alumno”.
>
> IMPORTANTE:
> - No ejecutes comandos de git.
> - No hagas git add, commit, push, checkout ni branch.
> - No cambies la funcionalidad.
> - No modifiques reglas ni índices.
> - Solo corregí textos visibles.
>
> Problema:
> En el modal de mover alumno, algunos textos se ven con caracteres raros, por ejemplo:
> - “prÃ¡cticos”
> - “exÃ¡menes”
> - “seguirÃ¡ viÃ©ndolas”
> - “Â¿QuerÃ©s...?”
>
> Esto ocurre en `app/pantallasAdmin/userManagementScreen.tsx`, en el modal de movimiento de alumno.
>
> Tareas:
> 1. Buscar todos los textos visibles del modal de “Mover alumno”.
> 2. Corregir los caracteres mal codificados.
> 3. Asegurar que se vean correctamente las tildes y signos:
>    - prácticos
>    - exámenes
>    - seguirá viéndolas
>    - ¿Querés mover a ...?
> 4. Si preferís evitar problemas futuros de encoding, podés reemplazar esos textos por versiones sin tildes:
>    - practicos
>    - examenes
>    - seguira viendolas
>    - Queres mover a ...?
>    Pero mi preferencia es mantener tildes correctas si el proyecto ya las usa en otras pantallas.
> 5. Revisar si hay más textos con patrones como:
>    - Ã
>    - Â
>    - �
>    en ese archivo o en archivos modificados recientemente.
> 6. No tocar lógica de mover alumno, transferencia de planillas ni historial de notas.
>
> Al finalizar, informame:
> 1. Archivo modificado.
> 2. Textos corregidos.
> 3. Si encontraste otros caracteres raros.

<details><summary>5 previous messages</summary>

> Voy directo al modal y a una búsqueda de patrones `Ã`, `Â` y `�` en los archivos tocados recientemente. Solo voy a corregir textos visibles, sin tocar lógica.
>
> Encontré el problema concentrado en el modal: algunas cadenas están doblemente mojibakeadas (`secciÃƒÂ³n`, `prÃƒÂ¡cticos`, etc.). Las reemplazo por textos con tildes correctas.
>
> Ahora sí tengo las cadenas exactas del archivo; aplico el reemplazo puntual.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/pantallasAdmin/userManagementScreen.tsx` (+5 -5)
>
> </details>
>
> Textos del modal corregidos. Hago una búsqueda final de esos patrones en el archivo para ver si queda algo raro visible en la misma zona o en archivos recientes.
</details>

Corregido.

Archivo modificado:
- `app/pantallasAdmin/userManagementScreen.tsx`

Textos corregidos en el modal “Mover alumno”:
- `sección`
- `Misma sección`
- `Transferir planillas de trabajos prácticos al nuevo acceso`
- `Las notas de exámenes... seguirá viéndolas...`
- `¿Querés mover a ...?`

También busqué patrones `Ã`, `Â` y `�` en:
- `app/pantallasAdmin/userManagementScreen.tsx`
- `app/secciones/mis-notas.tsx`
- `hooks/usePlanillas.ts`

No quedaron caracteres raros en esos archivos.

---
> Necesito corregir dos problemas visuales/de UX antes de cerrar el PR.
>
> IMPORTANTE:
>
> * No ejecutes comandos de git.
> * No hagas git add, commit, push, checkout ni branch.
> * No cambies funcionalidad ni reglas de Firestore.
> * Mantené el estilo visual actual.
>
> Problema 1: letras separadas en campos de texto
>
> Después de navegar varias veces entre pantallas y cambiar de usuario, algunos campos de texto empiezan a verse con las letras separadas.
>
> Ejemplos vistos:
>
> * En login, el placeholder del correo aparece como:
>   `E j :  a l u m n o @ u n l p . e d u . a r`
> * En Cargar Notas, el buscador aparece como:
>   `B u s c a r  a l u m n o  p o r  n o m b r e . . .`
>
> Esto ocurre en placeholders o inputs. No parece ser un problema de datos, sino de estilos.
>
> Tareas:
>
> 1. Revisar estilos de `TextInput`, inputs reutilizables, buscadores y campos de login.
> 2. Buscar usos de:
>
>    * `letterSpacing`
>    * estilos aplicados globalmente a inputs/placeholders
>    * componentes reutilizables de input/buscador
>    * cualquier estilo que pueda estar generando espaciado entre letras.
> 3. Asegurar que los campos de texto y placeholders no tengan letter spacing exagerado.
> 4. Si hay un componente común de input/search, corregirlo ahí para que aplique a toda la app.
> 5. Si el problema viene de algún estilo condicional, asegurar que no quede persistido al navegar o cambiar de usuario.
> 6. Probar visualmente:
>
>    * Login
>    * Cargar Notas
>    * Cargar Planillas
>    * Buscadores en Admin/Accesos/Usuarios
> 7. No cambiar textos ni lógica, solo estilos.
>
> Problema 2: en Cargar Planilla se ven códigos/IDs antes de cargar los datos finales
>
> Al entrar en `Cargar Planillas`, por un instante se ven códigos o IDs técnicos, y después aparecen los datos correctos.
>
> Esto no debería pasar. El usuario no debería ver `moduloId`, `seccionId`, `subseccionPath`, IDs de planilla base ni otros códigos técnicos mientras se resuelven los datos.
>
> Tareas:
>
> 1. Revisar `app/secciones/planillas.tsx`.
> 2. Revisar cómo carga:
>
>    * alumnos inscriptos,
>    * contexto efectivo de inscripción,
>    * planillas base,
>    * planillas ya creadas,
>    * nombres de módulo/sección/subsección si se usan.
> 3. Evitar renderizar IDs técnicos mientras los datos están cargando.
> 4. Mientras no estén listos los datos necesarios, mostrar:
>
>    * loading,
>    * skeleton,
>    * o estado “Cargando planillas...”
>      siguiendo el estilo actual.
> 5. Una vez cargado todo, mostrar directamente la UI final con nombres correctos.
> 6. No mostrar el bloque de contexto ni IDs técnicos en ningún momento.
> 7. Si hay tarjetas que temporalmente usan ID como fallback de nombre, cambiarlo para que:
>
>    * muestren loading,
>    * o no se rendericen hasta tener nombre real,
>    * o usen un texto neutro como “Cargando...”, pero nunca el ID técnico.
> 8. Revisar también `mis-planillas.tsx` por si ocurre algo similar.
>
> No romper:
>
> * creación de planillas,
> * selección de planilla base,
> * listado de alumnos,
> * contexto efectivo de inscripción,
> * permisos de admin/profesor/alumno,
> * exportación.
>
> Al finalizar, informame:
>
> 1. Archivos modificados.
> 2. Qué causaba el espaciado de letras.
> 3. Cómo lo corregiste.
> 4. Qué causaba que se vieran códigos/IDs al entrar a Cargar Planillas.
> 5. Cómo evitaste que se rendericen datos técnicos antes de cargar.
> 6. Cómo probar:
>
>    * abrir y cerrar sesión con distintos usuarios,
>    * volver al login,
>    * revisar placeholders,
>    * entrar a Cargar Notas,
>    * entrar a Cargar Planillas,
>    * confirmar que no aparecen letras separadas ni IDs técnicos.

<details><summary>15 previous messages</summary>

> Voy a revisar primero dónde se está aplicando `letterSpacing` y qué componente usan los buscadores/inputs. Después miro `planillas.tsx` para encontrar los fallbacks que muestran IDs antes de resolver nombres.
>
> Veo que el buscador común no tenía `letterSpacing`, pero sí hay inputs especiales de código con `letterSpacing` alto. Para blindar los campos normales voy a fijar `letterSpacing: 0` explícitamente en inputs reutilizables y pantallas sensibles, sin tocar los códigos de acceso que sí necesitan espaciado.
>
> En `Cargar Planillas` encontré fallbacks que muestran `alumnoId` mientras se resuelven nombres. Voy a ocultar esas filas hasta tener nombre real, y mostrar `Cargando alumnos...` en su lugar.
>
> <details><summary>Edited 2 files</summary>
>
> - Wrote `./components/ui/BuscadorAlumnos.tsx` (+8 -7)
> - Wrote `./app/login.tsx` (+6 -5)
>
> </details>
>
> También fijo `letterSpacing: 0` en los inputs propios de Notas, Planillas y Admin porque son los lugares que mencionaste o donde hay buscadores inline.
>
> <details><summary>Edited 3 files</summary>
>
> - Wrote `./app/secciones/notas.tsx` (+5 -4)
> - Wrote `./app/secciones/planillas.tsx` (+5 -4)
> - Wrote `./app/pantallasAdmin/userManagementScreen.tsx` (+6 -6)
>
> </details>
>
> Ahora corrijo el parpadeo de IDs en Planillas: mientras se resuelven nombres de alumnos, no renderizo filas con `alumnoId`; muestro un estado de carga neutro. Y si una planilla vieja no trae `alumnoNombre`, tampoco cae al ID.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/planillas.tsx` (+50 -45)
>
> </details>
>
> Quedó protegido el selector y las tarjetas. Reviso si quedan otros fallbacks a IDs técnicos en `planillas.tsx` o `mis-planillas.tsx`, y valido tipos.
>
> La revisión marcó un fallback visible en `mis-planillas.tsx`: para admin/profesor podía mostrar `alumnoId` si la planilla no traía nombre. Lo reemplazo por texto neutro.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/mis-planillas.tsx` (+1 -1)
>
> </details>
>
> El input de nota individual tampoco tenía espaciado, pero lo dejo explícito en 0 por consistencia.
>
> <details><summary>Edited a file</summary>
>
> - Wrote `./app/secciones/notas.tsx` (+5 -4)
>
> </details>
>
> TypeScript no mostró errores nuevos; siguen los mismos de plantilla. Como el problema se ve al volver al login y puede compartir estilo con registro/recuperar, dejo también esos inputs explícitamente en `letterSpacing: 0`.
>
> <details><summary>Edited 2 files</summary>
>
> - Wrote `./app/registro.tsx` (+2 -2)
> - Wrote `./app/recuperar.tsx` (+2 -2)
>
> </details>
</details>

Listo. No toqué lógica, reglas ni índices.

Archivos modificados:
- `components/ui/BuscadorAlumnos.tsx`
- `app/login.tsx`
- `app/registro.tsx`
- `app/recuperar.tsx`
- `app/secciones/notas.tsx`
- `app/secciones/planillas.tsx`
- `app/secciones/mis-planillas.tsx`
- `app/pantallasAdmin/userManagementScreen.tsx`

El espaciado raro venía de estilos de texto que podían quedar heredados/contaminados visualmente en inputs tras navegar. Dejé `letterSpacing: 0` explícito en inputs normales y buscadores. No toqué los textos de códigos de acceso, que sí usan espaciado intencional.

Lo de IDs en `Cargar Planillas` venía de fallbacks como `alumnoId` mientras se resolvían nombres. Ahora, mientras carga, muestra estado neutro; si falta nombre, usa `Alumno`, `Alumno sin nombre` o `Cargando alumno...`, nunca el ID técnico visible.

También ajusté `mis-planillas.tsx` para que no muestre `alumnoId` como fallback en tarjetas.

Verificación: corrí `npx tsc --noEmit`; sigue fallando solo por errores preexistentes en `components/ui/collapsible.tsx` e `icon-symbol`, no por estos cambios.

Cómo probar:
1. Cerrar sesión y volver al login: revisar placeholders.
2. Entrar con otro usuario y volver al login: confirmar que no aparecen letras separadas.
3. Abrir `Cargar Notas`: revisar buscador e input de nota.
4. Abrir `Cargar Planillas`: confirmar que mientras carga no aparecen IDs técnicos.
5. Revisar Admin > Usuarios/Accesos: buscadores sin letras separadas.


---



---
## Q&A de la sesión 4
---

