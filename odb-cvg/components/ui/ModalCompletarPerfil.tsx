//components/ui/ModalCompletarPerfil.tsx
import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,} from "react-native";
import { useUserProfile } from "../../hooks/useUserProfile";

interface Props {
  visible: boolean;
  onSuccess: () => void;
  onCancelar: () => void;
}

export default function ModalCompletarPerfil({ visible, onSuccess, onCancelar }: Props) {
  const { completarDatosFijos } = useUserProfile();
  const [legajo, setLegajo] = useState("");
  const [legajoConfirmacion, setLegajoConfirmacion] = useState("");
  const [dni, setDni] = useState("");
  const [dniConfirmacion, setDniConfirmacion] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const handleGuardar = async () => {
    setError("");
    setGuardando(true);
    try {
      await completarDatosFijos({ legajo, legajoConfirmacion, dni, dniConfirmacion });
      onSuccess();
    } catch (e: any) {
      setError(e.message ?? "No se pudo guardar tu perfil.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancelar}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
          <Text style={styles.titulo}>Completá tu perfil</Text>
          <Text style={styles.subtitulo}>
            Para ingresar a esta sección necesitamos al menos tu legajo.
          </Text>

          <View style={styles.avisoBox}>
            <Text style={styles.avisoTexto}>
              ⚠️ El legajo (y el DNI, si lo cargás) no se podrán modificar después. Revisá bien antes de guardar.
            </Text>
          </View>

          <Text style={styles.label}>Legajo *</Text>
          <TextInput
            style={styles.input}
            value={legajo}
            onChangeText={setLegajo}
            placeholder="Ej: 12345/6"
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.label}>Repetir legajo *</Text>
          <TextInput
            style={styles.input}
            value={legajoConfirmacion}
            onChangeText={setLegajoConfirmacion}
            placeholder="Volvé a escribirlo"
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.label}>DNI (opcional)</Text>
          <TextInput
            style={styles.input}
            value={dni}
            onChangeText={setDni}
            placeholder="Ej: 30123456"
            keyboardType="number-pad"
            placeholderTextColor="#9CA3AF"
          />

          {dni ? (
            <>
              <Text style={styles.label}>Repetir DNI</Text>
              <TextInput
                style={styles.input}
                value={dniConfirmacion}
                onChangeText={setDniConfirmacion}
                placeholder="Volvé a escribirlo"
                keyboardType="number-pad"
                placeholderTextColor="#9CA3AF"
              />
            </>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.boton, guardando && { opacity: 0.7 }]}
            onPress={handleGuardar}
            disabled={guardando}
          >
            {guardando ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.botonTexto}>Guardar y continuar</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelar} onPress={onCancelar} disabled={guardando}>
            <Text style={styles.cancelarTexto}>Volver</Text>
          </TouchableOpacity>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  scrollContent: { flexGrow: 1, justifyContent: "center", padding: 24 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 20 },
  titulo: { fontSize: 18, fontWeight: "700", color: "#11181C", marginBottom: 4 },
  subtitulo: { fontSize: 13, color: "#6B7280", marginBottom: 16 },
  avisoBox: { backgroundColor: "#FEF3C7", borderRadius: 8, padding: 10, marginBottom: 14 },
  avisoTexto: { fontSize: 12, color: "#92400E", lineHeight: 17 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 },
  input: {
    backgroundColor: "#F9F9F9",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 46,
    marginBottom: 14,
    fontSize: 15,
    color: "#000",
  },
  error: { color: "#DC2626", fontSize: 13, marginBottom: 10, textAlign: "center" },
  boton: { backgroundColor: "#25B471", borderRadius: 8, minHeight: 48, justifyContent: "center", alignItems: "center" },
  botonTexto: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  cancelar: { marginTop: 12, alignItems: "center" },
  cancelarTexto: { color: "#6B7280", fontWeight: "600", fontSize: 13 },
});