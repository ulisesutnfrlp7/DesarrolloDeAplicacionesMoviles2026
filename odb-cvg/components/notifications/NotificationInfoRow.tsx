import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}

export default function NotificationInfoRow({ icon, label, value }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={17} color="#0F4A32" />
      </View>
      <View style={styles.textBox}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F4",
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F5E9",
    marginTop: 1,
  },
  textBox: { flex: 1 },
  label: { fontSize: 12, color: "#6B7280", fontWeight: "700", marginBottom: 2 },
  value: { fontSize: 14, color: "#111827", lineHeight: 20, fontWeight: "500" },
});
