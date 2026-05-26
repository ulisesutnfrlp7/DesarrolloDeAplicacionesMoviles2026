import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "../../config/firebaseConfig";
import { inscribirConCodigo } from "../../hooks/useInscripciones";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  moduloId: string;
  seccionId: string;
  seccionTitulo: string;
  codigoActual: string;
}

export default function MatriculacionModal({
  visible,
  onClose,
  onSuccess,
  moduloId,
  seccionId,
  seccionTitulo,
  codigoActual,
}: Props) {
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAcceder = async () => {
    if (!codigo.trim()) {
      setError("Ingresá el código de acceso.");
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setError("No estás autenticado.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await inscribirConCodigo(moduloId, seccionId, codigo, codigoActual, uid);
      setCodigo("");
      onSuccess();
    } catch (e: any) {
      setError(e.message || "Código incorrecto.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setCodigo("");
    setError("");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrapper}>
            <Ionicons name="lock-closed" size={28} color="#0F4A32" />
          </View>
          <Text style={styles.titulo}>Acceso Restringido</Text>
          <Text style={styles.seccionNombre} numberOfLines={2}>
            {seccionTitulo}
          </Text>
          <Text style={styles.descripcion}>
            Esta cursada requiere un código de acceso proporcionado por la
            cátedra.
          </Text>
          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            placeholder="Código de acceso"
            placeholderTextColor="#9CA3AF"
            value={codigo}
            onChangeText={(v) => {
              setCodigo(v.toUpperCase());
              setError("");
            }}
            autoCapitalize="characters"
            maxLength={12}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleAcceder}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.btnText}>Acceder</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelLink} onPress={handleClose}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 28,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  iconWrapper: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  titulo: {
    fontSize: 18,
    fontWeight: "700",
    color: "#11181C",
    marginBottom: 4,
  },
  seccionNombre: {
    fontSize: 14,
    color: "#0F4A32",
    fontWeight: "600",
    marginBottom: 10,
    textAlign: "center",
  },
  descripcion: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  input: {
    width: "100%",
    backgroundColor: "#F9F9F9",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 18,
    color: "#11181C",
    letterSpacing: 4,
    textAlign: "center",
    marginBottom: 6,
    fontWeight: "700",
  },
  inputError: { borderColor: "#DC2626" },
  errorText: {
    fontSize: 13,
    color: "#DC2626",
    marginBottom: 10,
    textAlign: "center",
  },
  btn: {
    width: "100%",
    backgroundColor: "#25B471",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    minHeight: 50,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  cancelLink: { marginTop: 14 },
  cancelText: { fontSize: 14, color: "#9CA3AF" },
});
