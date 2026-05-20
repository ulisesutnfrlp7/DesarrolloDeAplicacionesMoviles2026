//app/modulos/form.tsx
import { Ionicons } from "@expo/vector-icons";
import {
  router,
  Stack,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import { doc, getDoc } from "firebase/firestore";
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
import { db } from "../../config/firebaseConfig";
import { useModulos } from "../../hooks/useModulos";
import { useUserRole } from "../../hooks/useUserRole";

const ICONOS_DISPONIBLES = [
  "book-outline",
  "school-outline",
  "document-text-outline",
  "medical-outline",
  "heart-outline",
  "flask-outline",
  "bulb-outline",
  "construct-outline",
  "people-outline",
  "clipboard-outline",
  "star-outline",
  "trophy-outline",
  "information-circle-outline",
  "list-outline",
  "layers-outline",
  "grid-outline",
  "cube-outline",
  "folder-outline",
  "analytics-outline",
  "calendar-outline",
  "chatbubble-outline",
  "newspaper-outline",
  "ribbon-outline",
  "megaphone-outline",
] as const;

export default function ModuloFormScreen() {
  const { moduloId } = useLocalSearchParams<{ moduloId?: string }>();
  const modoEdicion = !!moduloId;

  const { rol, loading: loadingRol } = useUserRole();
  const { crearModulo, actualizarModulo } = useModulos();

  const [titulo, setTitulo] = useState("");
  const [descripcionCorta, setDescripcionCorta] = useState("");
  const [icono, setIcono] = useState("book-outline");
  const [cargandoDatos, setCargandoDatos] = useState(modoEdicion);
  const [guardando, setGuardando] = useState(false);
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

  useEffect(() => {
    if (!modoEdicion || !moduloId) return;
    const cargar = async () => {
      try {
        const docSnap = await getDoc(doc(db, "modulos", moduloId));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setTitulo(data.titulo ?? "");
          setDescripcionCorta(data.descripcionCorta ?? "");
          setIcono(data.icono ?? "book-outline");
        }
      } catch (error) {
        console.error("Error al cargar módulo:", error);
      } finally {
        setCargandoDatos(false);
      }
    };
    cargar();
  }, [moduloId]);

  const handleGuardar = async () => {
    if (!titulo.trim()) {
      setAlerta({
        visible: true,
        titulo: "Campo requerido",
        mensaje: "El título no puede estar vacío.",
        tipo: "error",
        cerrarAlSalir: false,
      });
      return;
    }
    if (!descripcionCorta.trim()) {
      setAlerta({
        visible: true,
        titulo: "Campo requerido",
        mensaje: "La descripción corta no puede estar vacía.",
        tipo: "error",
        cerrarAlSalir: false,
      });
      return;
    }
    setGuardando(true);
    try {
      const data = {
        titulo: titulo.trim(),
        descripcionCorta: descripcionCorta.trim(),
        icono,
      };
      if (modoEdicion && moduloId) {
        await actualizarModulo(moduloId, data);
        setAlerta({
          visible: true,
          titulo: "Módulo actualizado",
          mensaje: "Los cambios se guardaron correctamente.",
          tipo: "exito",
          cerrarAlSalir: true,
        });
      } else {
        await crearModulo(data);
        setAlerta({
          visible: true,
          titulo: "Módulo creado",
          mensaje: "El módulo fue creado exitosamente.",
          tipo: "exito",
          cerrarAlSalir: true,
        });
      }
    } catch {
      setAlerta({
        visible: true,
        titulo: "Error",
        mensaje: "No se pudo guardar el módulo. Intentá nuevamente.",
        tipo: "error",
        cerrarAlSalir: false,
      });
    } finally {
      setGuardando(false);
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

  if (rol !== "admin") {
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
          title: modoEdicion ? "Editar Módulo" : "Nuevo Módulo",
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
        <Text style={styles.label}>
          Título <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: Operatoria Dental I y II"
          placeholderTextColor="#9CA3AF"
          value={titulo}
          onChangeText={(v) => {
            setTitulo(v);
            setHayCambios(true);
          }}
          maxLength={80}
        />

        <Text style={styles.label}>
          Descripción Corta <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Resumen breve visible en la tarjeta"
          placeholderTextColor="#9CA3AF"
          value={descripcionCorta}
          onChangeText={(v) => {
            setDescripcionCorta(v);
            setHayCambios(true);
          }}
          maxLength={150}
        />

        <Text style={styles.label}>Ícono</Text>
        <View style={styles.iconGrid}>
          {ICONOS_DISPONIBLES.map((nombre) => (
            <TouchableOpacity
              key={nombre}
              style={[
                styles.iconOption,
                icono === nombre && styles.iconOptionSelected,
              ]}
              onPress={() => {
                setIcono(nombre);
                setHayCambios(true);
              }}
            >
              <Ionicons
                name={nombre as any}
                size={24}
                color={icono === nombre ? "#FFFFFF" : "#0F4A32"}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* Botones de acción */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleAtras}
            disabled={guardando} // Usar 'guardando' en modulos/secciones y 'subiendo' en items
          >
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveBtn, (guardando) && styles.saveBtnDisabled]}
            onPress={handleGuardar}
            disabled={guardando}
          >
            {(guardando) ? (
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
  content: { padding: 20, paddingBottom: 40 },
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
  hint: { fontSize: 12, color: "#9CA3AF", marginBottom: 6, marginTop: -4 },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: "#11181C",
  },
  inputMultiline: {
    minHeight: 160,
    paddingTop: 12,
  },
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },
  iconOption: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  iconOptionSelected: {
    backgroundColor: "#0F4A32",
    borderColor: "#0F4A32",
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
    backgroundColor: "#25B471", // O "#0F4A32" dependiendo del archivo
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  sinPermisoText: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 12,
    marginBottom: 24,
  },
  volverBtn: {
    backgroundColor: "#0F4A32",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  volverBtnText: { color: "#FFFFFF", fontWeight: "700" },
});
