// components/ui/BuscadorAlumnos.tsx
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
    StyleSheet,
    TextInput,
    View,
} from "react-native";

interface BuscadorAlumnosProps {
  valor: string;
  onChangeText: (texto: string) => void;
  placeholder?: string;
}

export default function BuscadorAlumnos({
  valor,
  onChangeText,
  placeholder = "Buscar alumno por nombre...",
}: BuscadorAlumnosProps) {
  return (
    <View style={styles.container}>
      <Ionicons
        name="search-outline"
        size={18}
        color="#9CA3AF"
        style={styles.icono}
      />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        value={valor}
        onChangeText={onChangeText}
        autoCapitalize="words"
        autoCorrect={false}
      />
      {valor.length > 0 && (
        <Ionicons
          name="close-circle"
          size={18}
          color="#9CA3AF"
          onPress={() => onChangeText("")}
          style={styles.botonLimpiar}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 44,
    marginBottom: 12,
    marginTop: 4,
  },
  icono: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: "#11181C",
    paddingVertical: 8,
  },
  botonLimpiar: {
    marginLeft: 8,
    padding: 2,
  },
});