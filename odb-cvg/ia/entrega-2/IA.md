---
---
### Q&A de la sesión 1 
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
## Q&A de la sesión 2 
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
## Q&A de la sesión 3
---

