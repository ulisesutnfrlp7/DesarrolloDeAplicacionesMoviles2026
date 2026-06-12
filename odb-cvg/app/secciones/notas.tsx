// app/secciones/notas.tsx
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import BuscadorAlumnos from "../../components/ui/BuscadorAlumnos";
import ModalAlerta from "../../components/ui/ModalAlerta";
import ScreenHeader from "../../components/ui/ScreenHeader";
import { db } from "../../config/firebaseConfig";
import { useInscripcionesPorSeccion } from "../../hooks/useInscripciones";
import { guardarNotas, useNotasPorSeccion } from "../../hooks/useNotas";
import { useUserRole } from "../../hooks/useUserRole";

export default function NotasScreen() {
  const { moduloId, seccionId, subseccionPath } = useLocalSearchParams<{
    moduloId: string;
    seccionId: string;
    subseccionPath?: string;
  }>();

  const { rol, loading: loadingRol } = useUserRole();
  const { inscripciones, loading: loadingInscripciones } =
    useInscripcionesPorSeccion(seccionId ?? null);

  const [nombreExamen, setNombreExamen] = useState("");
  const [notasInput, setNotasInput] = useState<Record<string, string>>({});
  const [nombresAlumnos, setNombresAlumnos] = useState<Record<string, string>>({});
  const [filtroTexto, setFiltroTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [alerta, setAlerta] = useState<{
    visible: boolean;
    titulo: string;
    mensaje: string;
    tipo: "error" | "exito";
  }>({ visible: false, titulo: "", mensaje: "", tipo: "exito" });

  const notasExistentes = useNotasPorSeccion(seccionId ?? null, nombreExamen, subseccionPath);

  // Resolver nombres de alumnos
  useEffect(() => {
    if (inscripciones.length === 0) return;
    const fetchNombres = async () => {
      const temp: Record<string, string> = {};
      await Promise.all(
        inscripciones.map(async (insc) => {
          try {
            const snap = await getDoc(doc(db, "usuarios", insc.alumnoId));
            temp[insc.alumnoId] = snap.exists()
              ? ((snap.data().nombre as string) ?? insc.alumnoId)
              : insc.alumnoId;
          } catch {
            temp[insc.alumnoId] = insc.alumnoId;
          }
        }),
      );
      setNombresAlumnos(temp);
    };
    fetchNombres();
  }, [inscripciones]);

  // Precargar notas existentes cuando cambia el nombre del examen
  useEffect(() => {
    const preloaded: Record<string, string> = {};
    notasExistentes.forEach((nota, alumnoId) => {
      preloaded[alumnoId] = String(nota);
    });
    setNotasInput(preloaded);
  }, [notasExistentes]);

  const handleGuardar = async () => {
    if (!nombreExamen.trim()) {
      setAlerta({
        visible: true,
        titulo: "Campo requerido",
        mensaje: "Ingresá el nombre del examen.",
        tipo: "error",
      });
      return;
    }

    const notasAGuardar: {
      alumnoId: string;
      moduloId: string;
      seccionId: string;
      nombreExamen: string;
      nota: number;
      subseccionPath?: string;
    }[] = [];

    for (const [alumnoId, valorStr] of Object.entries(notasInput)) {
      if (!valorStr.trim()) continue;
      const valor = parseFloat(valorStr.replace(",", "."));
      if (isNaN(valor) || valor < 0 || valor > 10) {
        const nombre = nombresAlumnos[alumnoId] ?? alumnoId;
        setAlerta({
          visible: true,
          titulo: "Nota inválida",
          mensaje: `La nota de ${nombre} debe ser un número entre 0 y 10.`,
          tipo: "error",
        });
        return;
      }
      notasAGuardar.push({
        alumnoId,
        moduloId,
        seccionId,
        subseccionPath,
        nombreExamen: nombreExamen.trim(),
        nota: valor,
      });
    }

    if (notasAGuardar.length === 0) {
      setAlerta({
        visible: true,
        titulo: "Sin notas",
        mensaje: "No ingresaste ninguna nota para guardar.",
        tipo: "error",
      });
      return;
    }

    setGuardando(true);
    try {
      await guardarNotas(notasAGuardar);
      setAlerta({
        visible: true,
        titulo: "Notas guardadas",
        mensaje: `Se guardaron ${notasAGuardar.length} nota(s) para "${nombreExamen.trim()}".`,
        tipo: "exito",
      });
    } catch {
      setAlerta({
        visible: true,
        titulo: "Error",
        mensaje: "No se pudieron guardar las notas. Intentá nuevamente.",
        tipo: "error",
      });
    } finally {
      setGuardando(false);
    }
  };

  if (loadingRol) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo="Cargar Notas" mostrarHome />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#25B471" />
        </View>
      </View>
    );
  }

  if (rol !== "admin" && rol !== "profesor") {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo="Cargar Notas" onBack={() => router.back()} mostrarHome />
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={48} color="#CBD5E0" />
          <Text style={styles.sinPermisoText}>
            No tenés permiso para acceder a esta pantalla.
          </Text>
          <TouchableOpacity style={styles.volverBtn} onPress={() => router.back()}>
            <Text style={styles.volverBtnText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Filtrar inscripciones por texto de búsqueda
  const inscripcionesFiltradas = filtroTexto.trim()
    ? inscripciones.filter((insc) => {
        const nombre = (nombresAlumnos[insc.alumnoId] ?? insc.alumnoId).toLowerCase();
        return nombre.includes(filtroTexto.toLowerCase().trim());
      })
    : inscripciones;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScreenHeader titulo="Cargar Notas" onBack={() => router.back()} mostrarHome />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Selector de examen */}
        <Text style={styles.sectionLabel}>Exámen</Text>
        <TextInput
          style={styles.input}
          placeholder="Escribí el nombre del exámen..."
          placeholderTextColor="#9CA3AF"
          value={nombreExamen}
          onChangeText={(text) => setNombreExamen(text.replace(/\//g, "-"))}
          autoCapitalize="sentences"
        />

        

        {/* Lista de alumnos */}
        <Text style={styles.sectionLabel}>
          Alumnos Inscriptos ({inscripcionesFiltradas.length})
        </Text>
        {/* Buscador de alumnos */}
        <BuscadorAlumnos
          valor={filtroTexto}
          onChangeText={setFiltroTexto}
          placeholder="Buscar alumno por nombre..."
        />
        {loadingInscripciones ? (
          <ActivityIndicator color="#25B471" style={{ marginTop: 24 }} />
        ) : inscripciones.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={40} color="#CBD5E0" />
            <Text style={styles.emptyText}>
              No hay alumnos inscriptos en esta sección.
            </Text>
          </View>
        ) : inscripcionesFiltradas.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={40} color="#CBD5E0" />
            <Text style={styles.emptyText}>
              No se encontraron alumnos con ese nombre.
            </Text>
          </View>
        ) : (
          inscripcionesFiltradas.map((insc) => (
            <View key={insc.alumnoId} style={styles.alumnoRow}>
              <View style={styles.alumnoIconBg}>
                <Ionicons name="person-outline" size={18} color="#0F4A32" />
              </View>
              <Text style={styles.alumnoNombre} numberOfLines={1}>
                {nombresAlumnos[insc.alumnoId] ?? "Cargando..."}
              </Text>
              <TextInput
                style={styles.notaInput}
                placeholder="—"
                placeholderTextColor="#9CA3AF"
                value={notasInput[insc.alumnoId] ?? ""}
                onChangeText={(v) =>
                  setNotasInput((prev) => ({ ...prev, [insc.alumnoId]: v }))
                }
                keyboardType="numeric"
                maxLength={5}
              />
            </View>
          ))
        )}

        <TouchableOpacity
          style={[styles.saveBtn, guardando && styles.saveBtnDisabled]}
          onPress={handleGuardar}
          disabled={guardando || loadingInscripciones}
        >
          {guardando ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.saveBtnText}>Guardando...</Text>
            </View>
          ) : (
            <Text style={styles.saveBtnText}>Guardar Notas</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <ModalAlerta
        visible={alerta.visible}
        titulo={alerta.titulo}
        mensaje={alerta.mensaje}
        tipo={alerta.tipo}
        onClose={() => setAlerta((prev) => ({ ...prev, visible: false }))}
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
  sectionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
    marginTop: 20,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
  },
  chipActivo: {
    backgroundColor: "#0F4A32",
    borderColor: "#0F4A32",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  chipTextoActivo: {
    color: "#FFFFFF",
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: "#11181C",
  },
  alumnoRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  alumnoIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
  },
  alumnoNombre: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  notaInput: {
    width: 60,
    textAlign: "center",
    backgroundColor: "#F9FAFB",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    padding: 8,
    fontSize: 16,
    fontWeight: "700",
    color: "#0F4A32",
  },
  saveBtn: {
    backgroundColor: "#25B471",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 28,
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
  emptyContainer: {
    alignItems: "center",
    paddingTop: 32,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    fontStyle: "italic",
  },
});