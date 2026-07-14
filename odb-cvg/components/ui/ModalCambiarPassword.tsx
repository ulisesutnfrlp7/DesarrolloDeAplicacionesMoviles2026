import React, { useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View,} from "react-native";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword,} from "firebase/auth";
import { auth } from "../../config/firebaseConfig";
import { validarPassword } from "../../utils/validacionPassword";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ModalCambiarPassword({ visible, onClose, onSuccess }: Props) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [nuevaConfirmacion, setNuevaConfirmacion] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const limpiarYCerrar = () => {
    setActual("");
    setNueva("");
    setNuevaConfirmacion("");
    setError("");
    onClose();
  };

  const handleGuardar = async () => {
    setError("");
    const user = auth.currentUser;
    if (!user || !user.email) {
      setError("No se pudo identificar tu cuenta. Volvé a iniciar sesión.");
      return;
    }
    if (!actual) {
      setError("Ingresá tu contraseña actual.");
      return;
    }
    const errorFormato = validarPassword(nueva);
    if (errorFormato) {
      setError(errorFormato);
      return;
    }
    if (nueva !== nuevaConfirmacion) {
      setError("Las dos contraseñas nuevas no coinciden.");
      return;
    }
    if (nueva === actual) {
      setError("La nueva contraseña debe ser distinta de la actual.");
      return;
    }

    setGuardando(true);
    try {
      const credencial = EmailAuthProvider.credential(user.email, actual);
      await reauthenticateWithCredential(user, credencial);
      await updatePassword(user, nueva);
      limpiarYCerrar();
      onSuccess();
    } catch (e: any) {
      if (e.code === "auth/invalid-credential" || e.code === "auth/wrong-password") {
        setError("La contraseña actual es incorrecta.");
      } else if (e.code === "auth/too-many-requests") {
        setError("Demasiados intentos. Probá de nuevo en unos minutos.");
      } else {
        setError("No se pudo actualizar la contraseña. Intentá nuevamente.");
      }
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={limpiarYCerrar}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.titulo}>Actualizar contraseña</Text>

          <Text style={styles.label}>Contraseña actual</Text>
          <TextInput
            style={styles.input}
            value={actual}
            onChangeText={setActual}
            placeholder="Tu contraseña actual"
            placeholderTextColor="#9CA3AF"
            secureTextEntry
          />

          <Text style={styles.label}>Nueva contraseña</Text>
          <TextInput
            style={styles.input}
            value={nueva}
            onChangeText={setNueva}
            placeholder="Mínimo 8 caracteres"
            placeholderTextColor="#9CA3AF"
            secureTextEntry
          />
          <Text style={styles.hint}>Debe incluir al menos una mayúscula, una minúscula y un número.</Text>

          <Text style={styles.label}>Repetir nueva contraseña</Text>
          <TextInput
            style={styles.input}
            value={nuevaConfirmacion}
            onChangeText={setNuevaConfirmacion}
            placeholder="Volvé a escribirla"
            placeholderTextColor="#9CA3AF"
            secureTextEntry
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.boton, guardando && { opacity: 0.7 }]}
            onPress={handleGuardar}
            disabled={guardando}
          >
            {guardando ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.botonTexto}>Guardar nueva contraseña</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelar} onPress={limpiarYCerrar} disabled={guardando}>
            <Text style={styles.cancelarTexto}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 20 },
  titulo: { fontSize: 18, fontWeight: "700", color: "#11181C", marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 },
  input: {
    backgroundColor: "#F9F9F9",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 46,
    marginBottom: 6,
    fontSize: 15,
    color: "#000",
  },
  hint: { fontSize: 10, color: "#9CA3AF", marginBottom: 14 },
  error: { color: "#DC2626", fontSize: 13, marginBottom: 10, textAlign: "center" },
  boton: { backgroundColor: "#25B471", borderRadius: 8, minHeight: 48, justifyContent: "center", alignItems: "center" },
  botonTexto: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  cancelar: { marginTop: 12, alignItems: "center" },
  cancelarTexto: { color: "#6B7280", fontWeight: "600", fontSize: 13 },
});