//app/subsecciones/form.tsx
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import ModalAlerta from "../../components/ui/ModalAlerta";
import ModalConfirmacion from "../../components/ui/ModalConfirmacion";
import ScreenHeader from "../../components/ui/ScreenHeader";
import { db } from "../../config/firebaseConfig";
import { useSubsecciones } from "../../hooks/useSubsecciones";
import { useUserRole } from "../../hooks/useUserRole";

export default function SubseccionFormScreen() {
  const { moduloId, seccionId, parentPath, subseccionId, subseccionPath } = useLocalSearchParams<{
    moduloId: string;
    seccionId: string;
    parentPath?: string;
    subseccionId?: string;
    subseccionPath?: string;
  }>();
  const currentSubseccionPath = subseccionPath ?? subseccionId;
  const currentPathSegments = (currentSubseccionPath ?? "")
    .split("/")
    .filter(Boolean);
  const resolvedParentPath =
    parentPath ?? (currentPathSegments.length > 1 ? currentPathSegments.slice(0, -1).join("/") : undefined);
  const modoEdicion = !!currentSubseccionPath;

  const { rol, loading: loadingRol } = useUserRole();
  const { crearSubseccion, actualizarSubseccion } = useSubsecciones(moduloId, seccionId, resolvedParentPath);

  const [titulo, setTitulo] = useState("");
  const [permiteCargaProfesor, setPermiteCargaProfesor] = useState(false);
  const [permiteNotas, setPermiteNotas] = useState(false);
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
    if (!modoEdicion || !currentSubseccionPath || !moduloId || !seccionId) return;
    const cargar = async () => {
      try {
        const subseccionSegments = currentSubseccionPath
          .split("/")
          .map((segment) => segment.trim())
          .filter(Boolean)
          .flatMap((id) => ["subsecciones", id]);
        const docSnap = await getDoc(
          doc(db, "modulos", moduloId, "secciones", seccionId, ...subseccionSegments),
        );
        if (docSnap.exists()) {
          const data = docSnap.data();
          setTitulo(data.titulo ?? "");
          setPermiteCargaProfesor(data.permiteCargaProfesor ?? false);
          setPermiteNotas(data.permiteNotas ?? false);
        }
      } catch (error) {
        console.error("Error al cargar subsección:", error);
      } finally {
        setCargandoDatos(false);
      }
    };
    cargar();
  }, [modoEdicion, moduloId, seccionId, currentSubseccionPath]);

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
    setGuardando(true);
    try {
      const data = { titulo: titulo.trim(), permiteCargaProfesor, permiteNotas };
      if (modoEdicion && currentSubseccionPath) {
        await actualizarSubseccion(currentSubseccionPath, data);
        setAlerta({
          visible: true,
          titulo: "Subsección actualizada",
          mensaje: "Los cambios se guardaron correctamente.",
          tipo: "exito",
          cerrarAlSalir: true,
        });
      } else {
        await crearSubseccion(data);
        setAlerta({
          visible: true,
          titulo: "Subsección creada",
          mensaje: "La subsección fue creada exitosamente.",
          tipo: "exito",
          cerrarAlSalir: true,
        });
      }
    } catch {
      setAlerta({
        visible: true,
        titulo: "Error",
        mensaje: "No se pudo guardar la subsección. Intentá nuevamente.",
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
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo="" mostrarHome />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#25B471" />
        </View>
      </View>
    );
  }

  if (rol !== "admin") {
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
        titulo={modoEdicion ? "Editar Subsección" : "Nueva Subsección"}
        onBack={handleAtras}
        mostrarHome
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>
          Título <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Ej: Unidad 1"
          placeholderTextColor="#9CA3AF"
          value={titulo}
          onChangeText={(v) => {
            setTitulo(v);
            setHayCambios(true);
          }}
          maxLength={100}
          autoCorrect={true}
          autoCapitalize="sentences"
        />

        <View style={styles.profesorSection}>
          <Text style={styles.profesorSectionTitulo}>Permitir carga de profesores</Text>
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

        <View style={styles.profesorSection}>
          <Text style={styles.profesorSectionTitulo}>Notas de exámenes</Text>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Habilitar carga de notas</Text>
              <Text style={styles.switchHint}>
                Permite que admins y profesores carguen notas de exámenes para los alumnos inscriptos en esta sección.
              </Text>
            </View>
            <Switch
              value={permiteNotas}
              onValueChange={(v) => {
                setPermiteNotas(v);
                setHayCambios(true);
              }}
              trackColor={{ false: "#E5E7EB", true: "#25B471" }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleAtras}
            disabled={guardando}
          >
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveBtn, guardando && styles.saveBtnDisabled]}
            onPress={handleGuardar}
            disabled={guardando}
          >
            {guardando ? (
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
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: "#11181C",
  },
  profesorSection: {
    marginTop: 24,
    backgroundColor: "#F0FDF4",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  profesorSectionTitulo: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F4A32",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  switchHint: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
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
