//app/secciones/[id].tsx
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { doc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, } from "react-native";
import Markdown from "react-native-markdown-display";
import ModalAlerta from "../../components/ui/ModalAlerta";
import ModalConfirmacion from "../../components/ui/ModalConfirmacion";
import ScreenHeader from "../../components/ui/ScreenHeader";
import { auth, db } from "../../config/firebaseConfig";
import { useMisInscripciones } from "../../hooks/useInscripciones";
import type { Item } from "../../hooks/useItems";
import { useItems } from "../../hooks/useItems";
import type { Seccion } from "../../hooks/useSecciones";
import type { Subseccion } from "../../hooks/useSubsecciones";
import { useSubsecciones } from "../../hooks/useSubsecciones";
import { useUserRole } from "../../hooks/useUserRole";

export default function SeccionDetalleScreen() {
  const { id, moduloId } = useLocalSearchParams<{
    id: string;
    moduloId: string;
  }>();
  const { rol, loading: loadingRol } = useUserRole();
  const { items, loading: loadingItems, eliminarItem } = useItems(moduloId, id);
  const {
    subsecciones,
    loading: loadingSubsecciones,
    eliminarSubseccion,
  } = useSubsecciones(moduloId, id);

  const [seccion, setSeccion] = useState<Seccion | null>(null);
  const [loadingSeccion, setLoadingSeccion] = useState(true);
  const [itemAEliminar, setItemAEliminar] = useState<Item | null>(null);
  const [subseccionAEliminar, setSubseccionAEliminar] = useState<string | null>(null);
  const [alerta, setAlerta] = useState<{
    visible: boolean;
    titulo: string;
    mensaje: string;
    tipo: "error" | "exito";
  }>({ visible: false, titulo: "", mensaje: "", tipo: "exito" });

  useEffect(() => {
    if (!id || !moduloId) return;
    const unsubscribe = onSnapshot(
      doc(db, "modulos", moduloId, "secciones", id),
      (snap) => {
        setSeccion(
          snap.exists() ? ({ id: snap.id, ...snap.data() } as Seccion) : null,
        );
        setLoadingSeccion(false);
      },
    );
    return () => unsubscribe();
  }, [id, moduloId]);

  const handleEliminarItem = async () => {
    if (!itemAEliminar) return;
    try {
      await eliminarItem(itemAEliminar);
      
      setItemAEliminar(null);
      setAlerta({
        visible: true,
        titulo: "Eliminado",
        mensaje: "El elemento fue eliminado correctamente.",
        tipo: "exito",
      });
    } catch {
      setItemAEliminar(null);
      setAlerta({
        visible: true,
        titulo: "Error",
        mensaje: "No se pudo eliminar el elemento.",
        tipo: "error",
      });
    }
  };

  const handleEliminarSubseccion = async () => {
    if (!subseccionAEliminar) return;
    try {
      await eliminarSubseccion(subseccionAEliminar);
      setSubseccionAEliminar(null);
      setAlerta({
        visible: true,
        titulo: "Eliminada",
        mensaje: "Subsección eliminada correctamente.",
        tipo: "exito",
      });
    } catch {
      setSubseccionAEliminar(null);
      setAlerta({
        visible: true,
        titulo: "Error",
        mensaje: "No se pudo eliminar la subsección.",
        tipo: "error",
      });
    }
  };

  const handleAbrirArchivo = async (url: string) => {
    await WebBrowser.openBrowserAsync(url);
  };

  const esAdmin = rol === "admin";
  const esProfesor = rol === "profesor";
  const puedeAccederComoDocente = esAdmin || esProfesor;
  const puedeGestionarEstructura = esAdmin;
  const puedeEditarEliminarItems = esAdmin;
  const puedeCrearItems =
    esAdmin || (esProfesor && seccion?.permiteCargaProfesor === true);

  const uid = auth.currentUser?.uid ?? null;
  const { seccionesInscritas, loading: loadingInscripciones } = useMisInscripciones(
    !loadingRol && !puedeAccederComoDocente ? uid : null,
  );

  const noInscripto =
    !!seccion?.esRestringida &&
    !puedeAccederComoDocente &&
    !seccionesInscritas.has(id ?? "");

  if (loadingSeccion || loadingRol) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo="" mostrarHome />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#25B471" />
        </View>
      </View>
    );
  }

  if (!seccion) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo="" mostrarHome />
        <View style={styles.centered}>
          <Text style={styles.errorText}>Sección no encontrada.</Text>
        </View>
      </View>
    );
  }

  if (seccion.esRestringida && !puedeAccederComoDocente && loadingInscripciones) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo={seccion.titulo} mostrarHome />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#25B471" />
        </View>
      </View>
    );
  }

  if (noInscripto) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo={seccion.titulo} mostrarHome />
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={52} color="#CBD5E0" />
          <Text style={styles.accesoDenegadoTitulo}>Acceso restringido</Text>
          <Text style={styles.accesoDenegadoTexto}>
            No estás inscripto en esta cursada.{"\n"}Ingresá el código desde la
            pantalla anterior.
          </Text>
          <TouchableOpacity
            style={styles.volverBtn}
            onPress={() => router.back()}
          >
            <Text style={styles.volverBtnText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
      <View style={{ flex: 1 }}>
        <ScreenHeader titulo={seccion.titulo} mostrarHome />
        <View style={styles.wrapper}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
        >
          {seccion.permiteNotas && (
            <View style={styles.notasBanner}>
              {puedeAccederComoDocente && (
                <TouchableOpacity
                  style={styles.notasBtnPrimario}
                  onPress={() =>
                    router.push({
                      pathname: "/secciones/notas",
                      params: { moduloId, seccionId: id },
                    } as any)
                  }
                  activeOpacity={0.85}
                >
                  <Ionicons name="create-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.notasBtnPrimarioText}>Cargar Notas</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.notasBtnSecundario,
                  !puedeAccederComoDocente && { flex: 1 },
                ]}
                onPress={() =>
                  router.push({
                    pathname: "/secciones/mis-notas",
                    params: { moduloId, seccionId: id },
                  } as any)
                }
                activeOpacity={0.85}
              >
                <Ionicons name="school-outline" size={18} color="#0F4A32" />
                <Text style={styles.notasBtnSecundarioText}>Ver Notas</Text>
              </TouchableOpacity>
            </View>
          )}
          {seccion.permitePlanillas && (
            <View style={styles.notasBanner}>
              {puedeAccederComoDocente && (
                <TouchableOpacity
                  style={styles.notasBtnPrimario}
                  onPress={() =>
                    router.push({
                      pathname: "/secciones/planillas",
                      params: { moduloId, seccionId: id },
                    } as any)
                  }
                  activeOpacity={0.85}
                >
                  <Ionicons name="clipboard-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.notasBtnPrimarioText}>Cargar Planillas</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.notasBtnSecundario,
                  !puedeAccederComoDocente && { flex: 1 },
                ]}
                onPress={() =>
                  router.push({
                    pathname: "/secciones/mis-planillas",
                    params: { moduloId, seccionId: id },
                  } as any)
                }
                activeOpacity={0.85}
              >
                <Ionicons name="list-outline" size={18} color="#0F4A32" />
                <Text style={styles.notasBtnSecundarioText}>Ver Planillas</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Contenido</Text>
          </View>
          {loadingItems ? (
            <ActivityIndicator color="#25B471" style={{ marginTop: 32 }} />
          ) : items.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-outline" size={48} color="#CBD5E0" />
              <Text style={styles.emptyText}>
                {puedeCrearItems
                  ? 'No hay contenido. Presioná "+" para agregar.'
                  : "No hay contenido disponible aún."}
              </Text>
            </View>
          ) : (
            items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                puedeGestionar={puedeEditarEliminarItems}
                onEditar={() =>
                  router.push(
                    `/items/form?moduloId=${moduloId}&seccionId=${id}&itemId=${item.id}` as any,
                  )
                }
                onEliminar={() => setItemAEliminar(item)}
                onAbrirArchivo={handleAbrirArchivo}
                onVerEntrega={() =>
                  router.push(
                    `/entregas/${item.id}?moduloId=${moduloId}&seccionId=${id}` as any
                  )
                }
              />
            ))
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Subsecciones</Text>
            {puedeGestionarEstructura && (
              <TouchableOpacity
                style={styles.addSubseccionBtn}
                onPress={() =>
                  router.push(`/subsecciones/form?moduloId=${moduloId}&seccionId=${id}` as any)
                }
              >
                <Ionicons name="add-circle-outline" size={17} color="#0F4A32" />
                <Text style={styles.addSubseccionBtnText}>Añadir</Text>
              </TouchableOpacity>
            )}
          </View>

          {loadingSubsecciones ? (
            <ActivityIndicator color="#25B471" style={{ marginTop: 16 }} />
          ) : subsecciones.length === 0 ? (
            <Text style={styles.sinSubsecciones}>
              {puedeGestionarEstructura
                ? 'No hay subsecciones. Presioná "Añadir" para crear una.'
                : "No hay subsecciones disponibles."}
            </Text>
          ) : (
            subsecciones.map((subseccion) => (
              <SubseccionCard
                key={subseccion.id}
                subseccion={subseccion}
                puedeGestionar={puedeGestionarEstructura}
                onPress={() =>
                  router.push(`/subsecciones/${subseccion.id}?moduloId=${moduloId}&seccionId=${id}&subseccionPath=${encodeURIComponent(subseccion.id)}` as any)
                }
                onEditar={() =>
                  router.push(
                    `/subsecciones/form?moduloId=${moduloId}&seccionId=${id}&subseccionPath=${encodeURIComponent(subseccion.id)}` as any,
                  )
                }
                onEliminar={() => setSubseccionAEliminar(subseccion.id)}
              />
            ))
          )}
        </ScrollView>

        {puedeCrearItems && (
          <TouchableOpacity
            style={styles.fab}
            onPress={() =>
              router.push(
                `/items/form?moduloId=${moduloId}&seccionId=${id}` as any,
              )
            }
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={28} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>

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
      <ModalConfirmacion
        visible={subseccionAEliminar !== null}
        titulo="Eliminar Subsección"
        mensaje="¿Estás seguro de que deseas eliminar esta subsección? Esta acción es permanente."
        textoConfirmar="Sí, eliminar"
        textoCancelar="Cancelar"
        onConfirm={handleEliminarSubseccion}
        onCancel={() => setSubseccionAEliminar(null)}
      />
      <ModalAlerta
        visible={alerta.visible}
        titulo={alerta.titulo}
        mensaje={alerta.mensaje}
        tipo={alerta.tipo}
        onClose={() => setAlerta((prev) => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

// ─── Componente de tarjeta por tipo ───────────────────────────────────────────

interface ItemCardProps {
  item: Item;
  puedeGestionar: boolean;
  onEditar: () => void;
  onEliminar: () => void;
  onAbrirArchivo: (url: string) => void;
  onVerEntrega?: () => void;
}

interface SubseccionCardProps {
  subseccion: Subseccion;
  puedeGestionar: boolean;
  onPress: () => void;
  onEditar: () => void;
  onEliminar: () => void;
}

function SubseccionCard({
  subseccion,
  puedeGestionar,
  onPress,
  onEditar,
  onEliminar,
}: SubseccionCardProps) {
  return (
    <TouchableOpacity
      style={styles.subseccionCard}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.subseccionRow}>
        <View style={styles.subseccionLeft}>
          <View style={styles.subseccionIconBg}>
            <Ionicons name="folder-outline" size={18} color="#0F4A32" />
          </View>
          <Text style={styles.subseccionTitulo}>{subseccion.titulo}</Text>
        </View>
        <View style={styles.subseccionRight}>
          {puedeGestionar && (
            <>
              <TouchableOpacity
                onPress={onEditar}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="pencil-outline" size={16} color="#0F4A32" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onEliminar}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={16} color="#DC2626" />
              </TouchableOpacity>
            </>
          )}
          <Ionicons name="chevron-forward-outline" size={16} color="#CBD5E0" />
        </View>
      </View>
    </TouchableOpacity>
  );
}

function ItemCard({
  item,
  puedeGestionar,
  onEditar,
  onEliminar,
  onAbrirArchivo,
  onVerEntrega,
}: ItemCardProps) {
  const iconoPorTipo: Record<string, string> = {
    pdf: "document-outline",
    imagen: "image-outline",
    documento: "attach-outline",
    texto: "document-text-outline",
    video: "videocam-outline",
    enlace: "link-outline",
  };

  const acciones = puedeGestionar ? (
    <View style={styles.itemActions}>
      <TouchableOpacity
        onPress={onEditar}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="pencil-outline" size={16} color="#0F4A32" />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onEliminar}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="trash-outline" size={16} color="#DC2626" />
      </TouchableOpacity>
    </View>
  ) : null;

  // ── Texto ──────────────────────────────────────────────────────────────────
  if (item.tipo === "texto") {
    return (
      <View style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <View style={styles.itemIconBg}>
            <Ionicons name="document-text-outline" size={18} color="#0F4A32" />
          </View>
          <Text style={styles.itemTitulo}>{item.titulo}</Text>
          {acciones}
        </View>
        {item.contenido ? (
          <View style={styles.markdownWrapper}>
            <Markdown style={markdownStyles as any}>{item.contenido}</Markdown>
          </View>
        ) : null}
      </View>
    );
  }

  // ── Imagen ─────────────────────────────────────────────────────────────────
  if (item.tipo === "imagen") {
    return (
      <View style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <View style={styles.itemIconBg}>
            <Ionicons name="image-outline" size={18} color="#0F4A32" />
          </View>
          <Text style={styles.itemTitulo}>{item.titulo}</Text>
          {acciones}
        </View>
        {item.url ? (
          <TouchableOpacity
            onPress={() => onAbrirArchivo(item.url)}
            activeOpacity={0.85}
          >
            <Image
              source={{ uri: item.url }}
              style={styles.imagenPreview}
              resizeMode="cover"
            />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  if (item.tipo === "entrega") {
  return (
    <TouchableOpacity
      style={[styles.itemCard, { borderLeftWidth: 3, borderLeftColor: "#F59E0B" }]}
      onPress={onVerEntrega}  // o una prop onVerEntrega que reciba el id
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

  // ── PDF / Documento ────────────────────────────────────────────────────────
  return (
    <TouchableOpacity
      style={styles.itemCard}
      onPress={() => item.url && onAbrirArchivo(item.url)}
      activeOpacity={0.8}
    >
      <View style={styles.itemHeader}>
        <View style={styles.itemIconBg}>
          <Ionicons
            name={(iconoPorTipo[item.tipo] ?? "attach-outline") as any}
            size={18}
            color="#0F4A32"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemTitulo}>{item.titulo}</Text>
          {item.nombreArchivo ? (
            <Text style={styles.itemNombreArchivo} numberOfLines={1}>
              {item.nombreArchivo}
            </Text>
          ) : null}
        </View>
        {acciones}
        <Ionicons name="open-outline" size={18} color="#9CA3AF" />
      </View>
    </TouchableOpacity>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  content: { padding: 16, paddingBottom: 100 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  errorText: { fontSize: 15, color: "#6B7280" },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    marginTop: 8,
  },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#11181C" },
  addSubseccionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addSubseccionBtnText: { fontSize: 13, fontWeight: "600", color: "#0F4A32" },
  sinSubsecciones: { fontSize: 14, color: "#9CA3AF", fontStyle: "italic" },
  subseccionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    borderLeftWidth: 3,
    borderLeftColor: "#25B471",
  },
  subseccionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  subseccionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  subseccionIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
  },
  subseccionTitulo: { fontSize: 15, fontWeight: "600", color: "#11181C", flex: 1 },
  subseccionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginLeft: 8,
  },
  accesoDenegadoTitulo: {
    fontSize: 18, fontWeight: "700", color: "#374151", marginTop: 14, marginBottom: 8,
  },
  accesoDenegadoTexto: {
    fontSize: 14, color: "#9CA3AF", textAlign: "center", lineHeight: 22,
  },
  volverBtn: {
    marginTop: 24, backgroundColor: "#0F4A32",
    paddingHorizontal: 28, paddingVertical: 12, borderRadius: 10,
  },
  volverBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    fontStyle: "italic",
  },
  fab: {
    position: "absolute",
    bottom: 28,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#25B471",
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  itemCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  itemIconBg: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
  },
  itemTitulo: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#11181C",
  },
  itemNombreArchivo: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 2,
  },
  itemActions: {
    flexDirection: "row",
    gap: 14,
  },
  markdownWrapper: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  imagenPreview: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    marginTop: 10,
    backgroundColor: "#F3F4F6",
  },
  notasBanner: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  notasBtnPrimario: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#25B471",
    borderRadius: 12,
    paddingVertical: 12,
  },
  notasBtnPrimarioText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  notasBtnSecundario: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: "#0F4A32",
  },
  notasBtnSecundarioText: {
    color: "#0F4A32",
    fontWeight: "700",
    fontSize: 14,
  },
});

const markdownStyles = {
  body: { fontSize: 14, color: "#374151", lineHeight: 22 },
  heading1: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#0F4A32",
    marginBottom: 8,
  },
  heading2: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F4A32",
    marginBottom: 6,
  },
  heading3: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
  },
  bullet_list: { marginLeft: 8 },
  list_item: { marginBottom: 4 },
  code_inline: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 13,
  },

};
