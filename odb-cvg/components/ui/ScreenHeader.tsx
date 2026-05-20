// components/ui/ScreenHeader.tsx
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface Props {
  titulo: string;
  onBack?: () => void;       // si no se pasa, usa router.back()
  mostrarHome?: boolean;     // muestra ícono home además del back
  accionDerecha?: React.ReactNode; // botón extra opcional (ej: lápiz editar)
}

export default function ScreenHeader({
  titulo,
  onBack,
  mostrarHome = false,
  accionDerecha,
}: Props) {
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={handleBack}
        style={styles.backBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="arrow-back" size={22} color="#0F4A32" />
      </TouchableOpacity>

      <Text style={styles.titulo} numberOfLines={1}>
        {titulo}
      </Text>

      <View style={styles.right}>
        {accionDerecha ?? null}
        {mostrarHome && (
          <TouchableOpacity
            onPress={() => router.replace("/(tabs)/home" as any)}
            style={styles.homeBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="home-outline" size={20} color="#0F4A32" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
  },
  titulo: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: "#11181C",
    marginHorizontal: 12,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 36,
    justifyContent: "flex-end",
  },
  homeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
  },
});