//app/modulos/[id].tsx
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View,} from "react-native";
import MatriculacionModal from "../../components/ui/MatriculacionModal";
import ModalAlerta from "../../components/ui/ModalAlerta";
import ModalConfirmacion from "../../components/ui/ModalConfirmacion";
import { auth, db } from "../../config/firebaseConfig";
import { useMisInscripciones } from "../../hooks/useInscripciones";
import type { Modulo } from "../../hooks/useModulos";
import type { Seccion } from "../../hooks/useSecciones";
import { useSecciones } from "../../hooks/useSecciones";
import { useUserRole } from "../../hooks/useUserRole";
import ScreenHeader from "../../components/ui/ScreenHeader";

export default function ModuloDetalleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { rol, loading: loadingRol } = useUserRole();
  const {
    secciones,
    loading: loadingSecciones,
    eliminarSeccion,
  } = useSecciones(id);

  const [modulo, setModulo] = useState<Modulo | null>(null);
  const [loadingModulo, setLoadingModulo] = useState(true);
  const [seccionAEliminar, setSeccionAEliminar] = useState<string | null>(null);
  const [seccionMatricular, setSeccionMatricular] = useState<Seccion | null>(null);
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

  const uid = auth.currentUser?.uid ?? null;
  const { seccionesInscritas, loading: loadingInscripciones } = useMisInscripciones(
    !loadingRol && !puedeGestionarSecciones ? uid : null,
  );

  if (loadingModulo || loadingRol) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo="" mostrarHome />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#25B471" />
        </View>
      </View>
    );
  }

  if (!modulo) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo="" mostrarHome />
        <View style={styles.centered}>
          <Text style={styles.errorText}>Módulo no encontrado.</Text>
        </View>
      </View>
    );
  }

  return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader
          titulo={modulo.titulo}
          mostrarHome
          accionDerecha={
            rol === "admin" ? (
              <TouchableOpacity
                onPress={() => router.push(`/modulos/form?moduloId=${id}` as any)}
                style={styles.headerActionBtn}
              >
                <Ionicons name="pencil-outline" size={18} color="#0F4A32" />
              </TouchableOpacity>
            ) : undefined
          }
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

        {loadingSecciones || (!puedeGestionarSecciones && loadingInscripciones) ? (
          <ActivityIndicator color="#25B471" style={{ marginTop: 16 }} />
        ) : secciones.length === 0 ? (
          <Text style={styles.sinSecciones}>
            {puedeGestionarSecciones
              ? 'No hay secciones. Presioná "Añadir" para crear una.'
              : "No hay secciones disponibles."}
          </Text>
        ) : (
          secciones.map((seccion) => {
            const bloqueada =
              !!seccion.esRestringida &&
              !puedeGestionarSecciones &&
              !seccionesInscritas.has(seccion.id);
            return (
            <TouchableOpacity
              key={seccion.id}
              style={[styles.seccionCard, bloqueada && styles.seccionCardBloqueada]}
              onPress={() => {
                if (bloqueada) {
                  setSeccionMatricular(seccion);
                } else {
                  router.push(`/secciones/${seccion.id}?moduloId=${id}` as any);
                }
              }}
              activeOpacity={0.8}
            >
              <View style={styles.seccionRow}>
                <View style={styles.seccionLeft}>
                  <View style={[styles.seccionIconBg, bloqueada && styles.seccionIconBgBloqueada]}>
                    <Ionicons
                      name={bloqueada ? "lock-closed-outline" : "folder-outline"}
                      size={18}
                      color={bloqueada ? "#9CA3AF" : "#0F4A32"}
                    />
                  </View>
                  <Text style={[styles.seccionTitulo, bloqueada && styles.seccionTituloBloqueada]}>
                    {seccion.titulo}
                  </Text>
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
                  {!puedeGestionarSecciones && seccion.esRestringida && (
                    <View style={[styles.badgeAcceso, bloqueada ? styles.badgeBloqueado : styles.badgeAccedido]}>
                      <Ionicons
                        name={bloqueada ? "lock-closed-outline" : "checkmark-circle-outline"}
                        size={11}
                        color={bloqueada ? "#9CA3AF" : "#0F4A32"}
                      />
                      <Text style={[styles.badgeAccesoText, bloqueada ? styles.badgeBloqueadoText : styles.badgeAccedidoText]}>
                        {bloqueada ? "Bloqueado" : "Inscripto"}
                      </Text>
                    </View>
                  )}
                  <Ionicons
                    name="chevron-forward-outline"
                    size={16}
                    color="#CBD5E0"
                  />
                </View>
              </View>
            </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <MatriculacionModal
        visible={seccionMatricular !== null}
        onClose={() => setSeccionMatricular(null)}
        onSuccess={() => {
          const s = seccionMatricular;
          setSeccionMatricular(null);
          if (s) router.push(`/secciones/${s.id}?moduloId=${id}` as any);
        }}
        moduloId={id ?? ""}
        seccionId={seccionMatricular?.id ?? ""}
        seccionTitulo={seccionMatricular?.titulo ?? ""}
        codigoActual={seccionMatricular?.codigoAcceso ?? ""}
      />

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
    </View>
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
  seccionCardBloqueada: { borderLeftColor: "#E5E7EB" },
  seccionTitulo: { fontSize: 15, fontWeight: "600", color: "#11181C", flex: 1 },
  seccionTituloBloqueada: { color: "#9CA3AF" },
  seccionIconBgBloqueada: { backgroundColor: "#F3F4F6" },
  badgeAcceso: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8,
  },
  badgeBloqueado: { backgroundColor: "#F3F4F6" },
  badgeAccedido: { backgroundColor: "#E8F5E9" },
  badgeAccesoText: { fontSize: 10, fontWeight: "600" },
  badgeBloqueadoText: { color: "#9CA3AF" },
  badgeAccedidoText: { color: "#0F4A32" },
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
  headerActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
  },
});
