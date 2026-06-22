import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import ScreenHeader from "../../components/ui/ScreenHeader";
import { useUserRole } from "../../hooks/useUserRole";

export default function MisPlanillasScreen() {
  const { moduloId, seccionId, subseccionPath } = useLocalSearchParams<{
    moduloId?: string;
    seccionId?: string;
    subseccionPath?: string;
  }>();
  const { rol } = useUserRole();
  const esAlumno = rol !== "admin" && rol !== "profesor";

  return (
    <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
      <ScreenHeader
        titulo={esAlumno ? "Mis planillas" : "Ver planillas"}
        onBack={() => router.back()}
        mostrarHome
      />
      <View style={styles.container}>
        <View style={styles.iconBg}>
          <Ionicons name="list-outline" size={34} color="#0F4A32" />
        </View>
        <Text style={styles.title}>{esAlumno ? "Mis planillas" : "Ver planillas"}</Text>
        <Text style={styles.text}>
          Proximamente se podran consultar las planillas de trabajos practicos.
        </Text>
        <View style={styles.contextCard}>
          <Text style={styles.contextLabel}>Contexto</Text>
          <Text style={styles.contextText}>Modulo: {moduloId ?? "-"}</Text>
          <Text style={styles.contextText}>Seccion: {seccionId ?? "-"}</Text>
          <Text style={styles.contextText}>Subseccion: {subseccionPath ?? "-"}</Text>
          <Text style={styles.contextText}>Rol: {rol ?? "-"}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  iconBg: {
    width: 74,
    height: 74,
    borderRadius: 18,
    backgroundColor: "#E8F5E9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#11181C",
    textAlign: "center",
    marginBottom: 8,
  },
  text: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
  },
  contextCard: {
    alignSelf: "stretch",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    marginTop: 24,
  },
  contextLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F4A32",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  contextText: {
    fontSize: 13,
    color: "#374151",
    marginTop: 3,
  },
});
