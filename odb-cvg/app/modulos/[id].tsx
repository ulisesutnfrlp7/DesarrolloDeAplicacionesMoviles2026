import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import ModalAlerta from "../../components/ui/ModalAlerta";
import ModalConfirmacion from "../../components/ui/ModalConfirmacion";
import { db } from "../../config/firebaseConfig";
import type { Modulo } from "../../hooks/useModulos";
import { useSecciones } from "../../hooks/useSecciones";
import { useUserRole } from "../../hooks/useUserRole";

export default function ModuloDetalleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { rol } = useUserRole();
  const {
    secciones,
    loading: loadingSecciones,
    eliminarSeccion,
  } = useSecciones(id);

  const [modulo, setModulo] = useState<Modulo | null>(null);
  const [loadingModulo, setLoadingModulo] = useState(true);
  const [seccionAEliminar, setSeccionAEliminar] = useState<string | null>(null);
  const [alerta, setAlerta] = useState<{
    visible: boolean;
    titulo: string;
    mensaje: string;
    tipo: "error" | "exito";
  }>({ visible: false, titulo: "", mensaje: "", tipo: "exito" });

  useEffect(() => {
    if (!id) return;
    const unsubscribe = onSnapshot(doc(db, "modulos", id), (snap) => {
      setModulo(
        snap.exists() ? ({ id: snap.id, ...snap.data() } as Modulo) : null,
      );
      setLoadingModulo(false);
    });
    return () => unsubscribe();
  }, [id]);

  const handleEliminarSeccion = async () => {
    if (!seccionAEliminar) return;
    try {
      await eliminarSeccion(seccionAEliminar);
      setSeccionAEliminar(null);
      setAlerta({
        visible: true,
        titulo: "Eliminada",
        mensaje: "Sección eliminada correctamente.",
        tipo: "exito",
      });
    } catch {
      setSeccionAEliminar(null);
      setAlerta({
        visible: true,
        titulo: "Error",
        mensaje: "No se pudo eliminar la sección.",
        tipo: "error",
      });
    }
  };

  const puedeGestionarSecciones = rol === "admin" || rol === "profesor";

  const backButton = () => (
    <TouchableOpacity onPress={() => router.back()} style={{ marginLeft: 4 }}>
      <Ionicons name="arrow-back" size={24} color="#0F4A32" />
    </TouchableOpacity>
  );

  if (loadingModulo) {
    return (
      <>
        <Stack.Screen options={{ title: "", headerLeft: backButton }} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#25B471" />
        </View>
      </>
    );
  }

  if (!modulo) {
    return (
      <>
        <Stack.Screen options={{ title: "", headerLeft: backButton }} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>Módulo no encontrado.</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: modulo.titulo,
          headerLeft: backButton,
          headerRight:
            rol === "admin"
              ? () => (
                  <TouchableOpacity
                    onPress={() =>
                      router.push(`/modulos/form?moduloId=${id}` as any)
                    }
                    style={{ marginRight: 4 }}
                  >
                    <Ionicons name="pencil-outline" size={22} color="#0F4A32" />
                  </TouchableOpacity>
                )
              : undefined,
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        {/* Cabecera del módulo */}
        <View style={styles.moduloHeader}>
          <View style={styles.iconContainer}>
            <Ionicons
              name={(modulo.icono || "book-outline") as any}
              size={30}
              color="#0F4A32"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.moduloTitulo}>{modulo.titulo}</Text>
            <Text style={styles.moduloDesc}>{modulo.descripcionCorta}</Text>
          </View>
        </View>

        {/* Secciones */}
        <View style={styles.seccionesHeader}>
          <Text style={styles.seccionesTitulo}>Secciones</Text>
          {puedeGestionarSecciones && (
            <TouchableOpacity
              style={styles.addSeccionBtn}
              onPress={() =>
                router.push(`/secciones/form?moduloId=${id}` as any)
              }
            >
              <Ionicons name="add-circle-outline" size={17} color="#0F4A32" />
              <Text style={styles.addSeccionBtnText}>Añadir</Text>
            </TouchableOpacity>
          )}
        </View>

        {loadingSecciones ? (
          <ActivityIndicator color="#25B471" style={{ marginTop: 16 }} />
        ) : secciones.length === 0 ? (
          <Text style={styles.sinSecciones}>
            {puedeGestionarSecciones
              ? 'No hay secciones. Presioná "Añadir" para crear una.'
              : "No hay secciones disponibles."}
          </Text>
        ) : (
          secciones.map((seccion) => (
            <TouchableOpacity
              key={seccion.id}
              style={styles.seccionCard}
              onPress={() =>
                router.push(`/secciones/${seccion.id}?moduloId=${id}` as any)
              }
              activeOpacity={0.8}
            >
              <View style={styles.seccionRow}>
                <View style={styles.seccionLeft}>
                  <View style={styles.seccionIconBg}>
                    <Ionicons name="folder-outline" size={18} color="#0F4A32" />
                  </View>
                  <Text style={styles.seccionTitulo}>{seccion.titulo}</Text>
                </View>
                <View style={styles.seccionRight}>
                  {puedeGestionarSecciones && (
                    <>
                      <TouchableOpacity
                        onPress={() =>
                          router.push(
                            `/secciones/form?moduloId=${id}&seccionId=${seccion.id}` as any,
                          )
                        }
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name="pencil-outline"
                          size={16}
                          color="#0F4A32"
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setSeccionAEliminar(seccion.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={16}
                          color="#DC2626"
                        />
                      </TouchableOpacity>
                    </>
                  )}
                  <Ionicons
                    name="chevron-forward-outline"
                    size={16}
                    color="#CBD5E0"
                  />
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <ModalConfirmacion
        visible={seccionAEliminar !== null}
        titulo="Eliminar Sección"
        mensaje="¿Estás seguro de que deseas eliminar esta sección? Esta acción es permanente."
        textoConfirmar="Sí, eliminar"
        textoCancelar="Cancelar"
        onConfirm={handleEliminarSeccion}
        onCancel={() => setSeccionAEliminar(null)}
      />
      <ModalAlerta
        visible={alerta.visible}
        titulo={alerta.titulo}
        mensaje={alerta.mensaje}
        tipo={alerta.tipo}
        onClose={() => setAlerta((prev) => ({ ...prev, visible: false }))}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { fontSize: 15, color: "#6B7280" },
  moduloHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 13,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
  },
  moduloTitulo: { fontSize: 17, fontWeight: "700", color: "#11181C" },
  moduloDesc: { fontSize: 13, color: "#6B7280", marginTop: 3 },
  seccionesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  seccionesTitulo: { fontSize: 17, fontWeight: "700", color: "#11181C" },
  addSeccionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addSeccionBtnText: { fontSize: 13, fontWeight: "600", color: "#0F4A32" },
  sinSecciones: { fontSize: 14, color: "#9CA3AF", fontStyle: "italic" },
  seccionCard: {
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
  seccionTitulo: { fontSize: 15, fontWeight: "600", color: "#11181C", flex: 1 },
  seccionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  seccionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  seccionIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
  },
  seccionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginLeft: 8,
  },
});
