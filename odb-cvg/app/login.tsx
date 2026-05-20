//app/login.tsx
import { router } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "../config/firebaseConfig";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMensaje, setErrorMensaje] = useState("");

  const handleLogin = async () => {
    setErrorMensaje("");

    if (!email || !password) {
      setErrorMensaje("Por favor, completá todos los campos.");
      return;
    }

    const mailFormateado = email.toLowerCase().trim();

    try {
      await signInWithEmailAndPassword(auth, mailFormateado, password);
      router.replace("/(tabs)/home" as any);
    } catch (error: any) {
      if (error.code === 'auth/invalid-credential') {
        setErrorMensaje("El correo o la contraseña son incorrectos.");
      } else if (error.code === 'auth/invalid-email') {
        setErrorMensaje("El formato del correo electrónico no es válido.");
      } else {
        setErrorMensaje("Ocurrió un error al intentar iniciar sesión.");
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Operatoria Dental B</Text>
        <Text style={styles.subtitle}>Facultad de Odontología - UNLP</Text>
      </View>

      <View style={styles.formContainer}>
        <Text style={styles.label}>Correo Electrónico</Text>
        <TextInput
          style={[styles.input, errorMensaje ? styles.inputError : null]} // Borde rojo si hay error
          placeholder="Ej: alumno@unlp.edu.ar"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setErrorMensaje("");
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholderTextColor="#666"
        />

        <Text style={styles.label}>Contraseña</Text>
        <TextInput
          style={[styles.input, errorMensaje ? styles.inputError : null]}
          placeholder="********"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            setErrorMensaje("");
          }}
          secureTextEntry
          placeholderTextColor="#666"
        />

        {errorMensaje ? (
          <Text style={styles.errorText}>{errorMensaje}</Text>
        ) : null}

        <TouchableOpacity style={styles.primaryButton} onPress={handleLogin}>
          <Text style={styles.primaryButtonText}>Iniciar Sesión</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => router.push("/recuperar")}
        >
          <Text style={styles.linkText}>¿Olvidaste tu contraseña?</Text>
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push("/registro")}
        >
          <Text style={styles.secondaryButtonText}>Crear cuenta nueva</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    justifyContent: "center",
    padding: 20,
  },
  header: { marginBottom: 40, alignItems: "center" },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#0F4A32",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#000000",
    textAlign: "center",
    fontWeight: "500",
  },
  formContainer: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  label: { fontSize: 14, fontWeight: "700", color: "#000000", marginBottom: 8 },
  input: {
    backgroundColor: "#F9F9F9",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 48,
    marginBottom: 20,
    fontSize: 16,
    color: "#000",
  },
  inputError: {
    borderColor: "#DC2626",
    backgroundColor: "#FEF2F2",
  },
  errorText: {
    color: "#DC2626",
    fontSize: 13,
    marginBottom: 12,
    marginTop: -8,
    textAlign: "center",
  },
  primaryButton: {
    backgroundColor: "#25B471",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    marginTop: 4,
  },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "bold", fontSize: 16 },
  linkButton: {
    alignItems: "center",
    marginTop: 15,
    minHeight: 48,
    justifyContent: "center",
  },
  linkText: { color: "#0F4A32", fontSize: 14, fontWeight: "600" },
  divider: { height: 1, backgroundColor: "#E0E0E0", marginVertical: 20 },
  secondaryButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#25B471",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  secondaryButtonText: { color: "#25B471", fontWeight: "bold", fontSize: 16 },
});