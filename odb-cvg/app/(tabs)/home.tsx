//app/(tabs)/home.tsx
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { signOut } from "firebase/auth";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ModalAlerta from "../../components/ui/ModalAlerta";
import ModalConfirmacion from "../../components/ui/ModalConfirmacion";
import ModuloCard from "../../components/ui/ModuloCard";
import { auth } from "../../config/firebaseConfig";
import type { Modulo } from "../../hooks/useModulos";
import { useModulos } from "../../hooks/useModulos";
import { useUserRole } from "../../hooks/useUserRole";

export default function HomeScreen() {
  const { rol, loading: loadingRol } = useUserRole();
  const {
    modulos,
    loading: loadingModulos,
    eliminarModulo,
    guardarOrdenModulos,
  } = useModulos();
  const [modoOrdenamiento, setModoOrdenamiento] = useState(false);
  const [modulosOrdenables, setModulosOrdenables] = useState<Modulo[]>([]);
  const [guardandoOrden, setGuardandoOrden] = useState(false);

  const [modalSalir, setModalSalir] = useState(false);
  const [moduloAEliminar, setModuloAEliminar] = useState<string | null>(null);
  const [alerta, setAlerta] = useState<{
    visible: boolean;
    titulo: string;
    mensaje: string;
    tipo: "error" | "exito";
  }>({ visible: false, titulo: "", mensaje: "", tipo: "exito" });

  const handleCerrarSesion = async () => {
    try {
      setModalSalir(false);
      await signOut(auth);
      router.replace("/login" as any);
    } catch (error: any) {
      Alert.alert(
        "Aviso",
        "Sesión cerrada localmente (Firebase arrojó error: " +
          error.message +
          ")",
      );
      router.replace("/login" as any);
    }
  };

  const handleEliminar = async () => {
    if (!moduloAEliminar) return;
    try {
      await eliminarModulo(moduloAEliminar);
      setModuloAEliminar(null);
      setAlerta({
        visible: true,
        titulo: "Eliminado",
        mensaje: "Módulo eliminado correctamente.",
        tipo: "exito",
      });
    } catch {
      setModuloAEliminar(null);
      setAlerta({
        visible: true,
        titulo: "Error",
        mensaje: "No se pudo eliminar el módulo.",
        tipo: "error",
      });
    }
  };

  const iniciarOrdenamiento = () => {
    setModulosOrdenables(modulos);
    setModoOrdenamiento(true);
  };

  const cancelarOrdenamiento = () => {
    setModulosOrdenables([]);
    setModoOrdenamiento(false);
  };

  const moverModulo = (index: number, direccion: -1 | 1) => {
    const nuevoIndex = index + direccion;
    if (nuevoIndex < 0 || nuevoIndex >= modulosOrdenables.length) return;

    setModulosOrdenables((prev) => {
      const copia = [...prev];
      const modulo = copia[index];
      copia[index] = copia[nuevoIndex];
      copia[nuevoIndex] = modulo;
      return copia;
    });
  };

  const guardarOrden = async () => {
    setGuardandoOrden(true);
    try {
      await guardarOrdenModulos(modulosOrdenables);
      setModoOrdenamiento(false);
      setModulosOrdenables([]);
      setAlerta({
        visible: true,
        titulo: "Orden guardado",
        mensaje: "El orden de los módulos fue actualizado correctamente.",
        tipo: "exito",
      });
    } catch {
      setAlerta({
        visible: true,
        titulo: "Error",
        mensaje: "No se pudo guardar el orden de los módulos.",
        tipo: "error",
      });
    } finally {
      setGuardandoOrden(false);
    }
  };

  const modulosVisibles = modoOrdenamiento ? modulosOrdenables : modulos;

  if (loadingRol || loadingModulos) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#25B471" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitles}>
          <View style={styles.titleWithBadge}>
            <Image
              source={require("../../assets/images/LogoRecortado.jpg")}
              style={styles.logo}
            />
            <Text style={styles.headerText}>CVG - Odonto B</Text>
            {rol === "admin" && (
              <View style={[styles.badge, styles.badgeAdmin]}>
                <Text style={styles.badgeTextAdmin}>Admin</Text>
              </View>
            )}
            {rol === "profesor" && (
              <View style={[styles.badge, styles.badgeProfe]}>
                <Text style={styles.badgeTextProfe}>Profesor</Text>
              </View>
            )}
            {rol === "alumno" && (
              <View style={[styles.badge, styles.badgeAlumno]}>
                <Text style={styles.badgeTextAlumno}>Alumno</Text>
              </View>
            )}
          </View>
          <Text style={styles.subHeaderText}>Facultad de Odontología UNLP</Text>
        </View>

        {/*Boton para ir a pantalla de administracion de usuarios, solo visible para admins*/}
        {rol === "admin" && (
          <TouchableOpacity
            style={styles.adminButton}
            onPress={() =>
              router.push("../pantallasAdmin/userManagementScreen")
            }
          >
            <Ionicons name="people-outline" size={18} color="#0F4A32" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => setModalSalir(true)}
        >
          <Text style={styles.logoutButtonText}>Salir</Text>
        </TouchableOpacity>
      </View>

      {/* Grid de módulos */}
      {rol === "admin" && modulos.length > 0 && !modoOrdenamiento && (
        <View style={styles.listActions}>
          <TouchableOpacity
            style={styles.orderButton}
            onPress={iniciarOrdenamiento}
          >
            <Ionicons name="swap-vertical-outline" size={18} color="#0F4A32" />
            <Text style={styles.orderButtonText}>Ordenar</Text>
          </TouchableOpacity>
        </View>
      )}

      {modoOrdenamiento && (
        <View style={styles.orderBar}>
          <TouchableOpacity
            style={styles.orderCancelBtn}
            onPress={cancelarOrdenamiento}
            disabled={guardandoOrden}
          >
            <Text style={styles.orderCancelBtnText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.orderSaveBtn,
              guardandoOrden && styles.orderSaveBtnDisabled,
            ]}
            onPress={guardarOrden}
            disabled={guardandoOrden}
          >
            {guardandoOrden ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Ionicons name="save-outline" size={16} color="#FFFFFF" />
            )}
            <Text style={styles.orderSaveBtnText}>
              {guardandoOrden ? "Guardando..." : "Guardar orden"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {modulosVisibles.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="folder-open-outline" size={52} color="#CBD5E0" />
          <Text style={styles.emptyText}>
            {rol === "admin"
              ? "No hay módulos. Presioná + para agregar el primero."
              : "No hay módulos disponibles aún."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={modulosVisibles}
          keyExtractor={(item) => item.id}
          numColumns={modoOrdenamiento ? 1 : 2}
          key={modoOrdenamiento ? "ordenamiento" : "grilla"}
          columnWrapperStyle={modoOrdenamiento ? undefined : styles.row}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) =>
            modoOrdenamiento ? (
              <View style={styles.orderItem}>
                <View style={styles.orderItemCard}>
                  <View style={styles.orderIconContainer}>
                    <Ionicons
                      name={(item.icono || "book-outline") as any}
                      size={28}
                      color="#0F4A32"
                    />
                  </View>
                  <View style={styles.orderItemText}>
                    <Text style={styles.orderItemTitle}>{item.titulo}</Text>
                    <Text style={styles.orderItemDescription} numberOfLines={2}>
                      {item.descripcionCorta}
                    </Text>
                  </View>
                </View>
                <View style={styles.orderControls}>
                  <TouchableOpacity
                    style={[
                      styles.orderArrowBtn,
                      index === 0 && styles.orderArrowBtnDisabled,
                    ]}
                    onPress={() => moverModulo(index, -1)}
                    disabled={index === 0 || guardandoOrden}
                  >
                    <Ionicons
                      name="arrow-up-outline"
                      size={22}
                      color={index === 0 ? "#CBD5E0" : "#0F4A32"}
                    />
                    <Text
                      style={[
                        styles.orderArrowText,
                        index === 0 && styles.orderArrowTextDisabled,
                      ]}
                    >
                      Subir
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.orderArrowBtn,
                      index === modulosOrdenables.length - 1 &&
                        styles.orderArrowBtnDisabled,
                    ]}
                    onPress={() => moverModulo(index, 1)}
                    disabled={
                      index === modulosOrdenables.length - 1 || guardandoOrden
                    }
                  >
                    <Ionicons
                      name="arrow-down-outline"
                      size={22}
                      color={
                        index === modulosOrdenables.length - 1
                          ? "#CBD5E0"
                          : "#0F4A32"
                      }
                    />
                    <Text
                      style={[
                        styles.orderArrowText,
                        index === modulosOrdenables.length - 1 &&
                          styles.orderArrowTextDisabled,
                      ]}
                    >
                      Bajar
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <ModuloCard
                titulo={item.titulo}
                descripcionCorta={item.descripcionCorta}
                icono={item.icono || "book-outline"}
                esAdmin={rol === "admin"}
                onPress={() => router.push(`/modulos/${item.id}` as any)}
                onEditar={() =>
                  router.push(`/modulos/form?moduloId=${item.id}` as any)
                }
                onEliminar={() => setModuloAEliminar(item.id)}
              />
            )
          }
        />
      )}

      {/* FAB solo para admin */}
      {rol === "admin" && !modoOrdenamiento && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push("/modulos/form" as any)}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* Modales */}
      <ModalConfirmacion
        visible={modalSalir}
        titulo="Cerrar Sesión"
        mensaje="¿Estás seguro de que deseas cerrar sesión? Tendrás que volver a ingresar tus credenciales la próxima vez."
        textoConfirmar="Sí, salir"
        textoCancelar="Cancelar"
        onConfirm={handleCerrarSesion}
        onCancel={() => setModalSalir(false)}
      />
      <ModalConfirmacion
        visible={moduloAEliminar !== null}
        titulo="Eliminar Módulo"
        mensaje="¿Estás seguro? Esta acción eliminará el módulo y todas sus secciones de forma permanente."
        textoConfirmar="Sí, eliminar"
        textoCancelar="Cancelar"
        onConfirm={handleEliminar}
        onCancel={() => setModuloAEliminar(null)}
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
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    marginTop: 14,
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 21,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  headerTitles: { flex: 1 },
  titleWithBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  headerText: { fontSize: 22, fontWeight: "bold", color: "#11181C" },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeAdmin: { backgroundColor: "#0F4A32" },
  badgeTextAdmin: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  badgeProfe: {
    backgroundColor: "#E8F5E9",
    borderWidth: 1,
    borderColor: "#25B471",
  },
  badgeTextProfe: {
    color: "#0F4A32",
    fontSize: 11,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  badgeAlumno: {
    backgroundColor: "#E8F5E9",
    borderWidth: 1,
    borderColor: "#25B471",
  },
  badgeTextAlumno: {
    color: "#0F4A32",
    fontSize: 11,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  subHeaderText: { fontSize: 13, color: "#6B7280", marginTop: 10 },
  logoutButton: {
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginLeft: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  logoutButtonText: { color: "#0F4A32", fontWeight: "700", fontSize: 14 },
  card: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 12,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 3,
  },
  cardTitle: { fontSize: 18, fontWeight: "700", color: "#2b6cb0" },
  cardStatus: { fontSize: 15, color: "#718096", marginTop: 8 },

  adminButton: {
    backgroundColor: "#E8F5E9",
    padding: 10,
    borderRadius: 10,
    marginLeft: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  orderButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
  },
  orderButtonText: {
    color: "#0F4A32",
    fontSize: 13,
    fontWeight: "700",
  },

  adminButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  listContent: { padding: 16, paddingBottom: 90 },
  row: { gap: 12, marginBottom: 12 },
  listActions: {
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 0,
  },
  orderBar: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  orderCancelBtn: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    paddingVertical: 12,
    alignItems: "center",
  },
  orderCancelBtnText: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "700",
  },
  orderSaveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "#25B471",
    borderRadius: 10,
    paddingVertical: 12,
  },
  orderSaveBtnDisabled: { opacity: 0.65 },
  orderSaveBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  orderItem: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  orderItemCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  orderIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
  },
  orderItemText: { flex: 1 },
  orderItemTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#11181C",
  },
  orderItemDescription: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 17,
    marginTop: 2,
  },
  orderControls: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  orderArrowBtn: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#E8F5E9",
    borderRadius: 10,
    paddingVertical: 11,
  },
  orderArrowBtnDisabled: { backgroundColor: "#F3F4F6" },
  orderArrowText: {
    color: "#0F4A32",
    fontSize: 14,
    fontWeight: "700",
  },
  orderArrowTextDisabled: { color: "#CBD5E0" },
  fab: {
    position: "absolute",
    bottom: 28,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#0F4A32",
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },

  logo: {
    width: 50,
    height: 50,
    borderRadius: 50,
    marginBottom: 16,
  },
});
