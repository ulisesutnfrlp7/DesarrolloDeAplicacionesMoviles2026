import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface ModuloCardProps {
  titulo: string;
  descripcionCorta: string;
  icono: string;
  esAdmin: boolean;
  onPress: () => void;
  onEditar: () => void;
  onEliminar: () => void;
}

export default function ModuloCard({
  titulo,
  descripcionCorta,
  icono,
  esAdmin,
  onPress,
  onEditar,
  onEliminar,
}: ModuloCardProps) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {esAdmin && (
        <View style={styles.adminActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={onEditar}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="pencil-outline" size={15} color="#0F4A32" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.deleteBtnColor]}
            onPress={onEliminar}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={15} color="#DC2626" />
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.iconContainer}>
        <Ionicons name={icono as any} size={36} color="#0F4A32" />
      </View>
      <Text style={styles.titulo} numberOfLines={2}>
        {titulo}
      </Text>
      <Text style={styles.descripcion} numberOfLines={3}>
        {descripcionCorta}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    minHeight: 155,
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  adminActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 6,
    marginBottom: 6,
  },
  actionBtn: {
    padding: 5,
    borderRadius: 6,
    backgroundColor: "#F0FAF4",
  },
  deleteBtnColor: {
    backgroundColor: "#FEF2F2",
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  titulo: {
    fontSize: 14,
    fontWeight: "700",
    color: "#11181C",
    marginBottom: 4,
  },
  descripcion: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 17,
  },
});
