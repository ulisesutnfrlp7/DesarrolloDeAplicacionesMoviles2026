import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ModalAlerta from "../../components/ui/ModalAlerta";
import ModalConfirmacion from "../../components/ui/ModalConfirmacion";
import ModuloCard from "../../components/ui/ModuloCard";
import { auth, db } from "../../config/firebaseConfig";
import { useModulos } from "../../hooks/useModulos";
import { useUserRole } from "../../hooks/useUserRole";

export default function HomeScreen() {
  const [rolUsuario, setRolUsuario] = useState("");
  const [cargando, setCargando] = useState(true);

  const { rol, loading: loadingRol } = useUserRole();
  const { modulos, loading: loadingModulos, eliminarModulo } = useModulos();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const docRef = doc(db, "usuarios", user.uid);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            setRolUsuario(docSnap.data().rol); // Setear 'alumno' (o lo que diga la BD)
          } else {
            console.log("No se encontró el documento del usuario");
          }
        } catch (error) {
          console.error("Error al obtener rol:", error);
        } finally {
          setCargando(false);
        }
      } else {
        setCargando(false);
      }
    });

    return unsubscribe;
  }, []);

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
          </View>
          <Text style={styles.subHeaderText}>Facultad de Odontología UNLP</Text>
        </View>

        {/*Boton para ir a pantalla de administracion de usuarios, solo visible para admins*/}
        {rolUsuario === "admin" && (
          <TouchableOpacity
            style={styles.adminButton}
            onPress={() =>
              router.push("../pantallasAdmin/userManagementScreen")
            }
          >
            <Ionicons name="person" size={15} color="#FFFFFF" />
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
      {modulos.length === 0 ? (
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
          data={modulos}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
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
          )}
        />
      )}

      {/* FAB solo para admin */}
      {rol === "admin" && (
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
    fontSize: 11,
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
  subHeaderText: { fontSize: 13, color: "#6B7280", marginTop: 3 },
  logoutButton: {
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 10,
  },

  logoutButtonText: { color: "#4A5568", fontWeight: "bold", fontSize: 20 },
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
    backgroundColor: "#0F4A32",
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
  },

  adminButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  listContent: { padding: 16, paddingBottom: 90 },
  row: { gap: 12, marginBottom: 12 },
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
});
