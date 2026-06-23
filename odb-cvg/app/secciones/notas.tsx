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
import ModalConfirmacion from "../../components/ui/ModalConfirmacion";
import ScreenHeader from "../../components/ui/ScreenHeader";
import { db } from "../../config/firebaseConfig";
import {
  useContextoInscripcionEfectivo,
  useInscripcionesPorSeccion,
} from "../../hooks/useInscripciones";
import {
  esNotaAusente,
  formatearValorNota,
  guardarNotas,
  reemplazarNotasPorExamen,
  useNotasPorSeccion,
  type ValorNota,
} from "../../hooks/useNotas";
import { useUserRole } from "../../hooks/useUserRole";

export default function NotasScreen() {
  const { moduloId, seccionId, subseccionPath, modo, nombreExamen: nombreExamenParam } = useLocalSearchParams<{
    moduloId: string;
    seccionId: string;
    subseccionPath?: string;
    modo?: string;
    nombreExamen?: string;
  }>();

  const { rol, loading: loadingRol } = useUserRole();
  const contextoSubseccion = subseccionPath ?? "";
  const {
    contexto: contextoInscripcion,
    loading: loadingContextoInscripcion,
  } = useContextoInscripcionEfectivo(moduloId, seccionId, contextoSubseccion);
  const { inscripciones, loading: loadingInscripciones } =
    useInscripcionesPorSeccion(
      seccionId ?? null,
      contextoInscripcion?.subseccionPath ?? contextoSubseccion,
    );

  const [nombreExamen, setNombreExamen] = useState("");
  const [notasInput, setNotasInput] = useState<Record<string, string>>({});
  const [ausentes, setAusentes] = useState<Record<string, boolean>>({});
  const [nombresAlumnos, setNombresAlumnos] = useState<Record<string, string>>({});
  const [filtroTexto, setFiltroTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [volverAlCerrarAlerta, setVolverAlCerrarAlerta] = useState(false);
  const [guardadoExitoso, setGuardadoExitoso] = useState(false);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [alerta, setAlerta] = useState<{
    visible: boolean;
    titulo: string;
    mensaje: string;
    tipo: "error" | "exito";
  }>({ visible: false, titulo: "", mensaje: "", tipo: "exito" });

  const esEdicion = modo === "editar";
  const notasExistentes = useNotasPorSeccion(seccionId ?? null, nombreExamen, contextoSubseccion);

  useEffect(() => {
    if (esEdicion && nombreExamenParam) {
      setNombreExamen(String(nombreExamenParam).replace(/\//g, "-"));
    }
  }, [esEdicion, nombreExamenParam]);

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
    const preloadedAusentes: Record<string, boolean> = {};
    notasExistentes.forEach((nota, alumnoId) => {
      if (esNotaAusente(nota)) {
        preloaded[alumnoId] = "";
        preloadedAusentes[alumnoId] = true;
      } else {
        preloaded[alumnoId] = formatearValorNota(nota);
        preloadedAusentes[alumnoId] = false;
      }
    });
    setNotasInput(preloaded);
    setAusentes(preloadedAusentes);
  }, [notasExistentes]);

  const setNotaAlumno = (alumnoId: string, valor: string) => {
    setNotasInput((prev) => ({ ...prev, [alumnoId]: valor }));
    if (valor.trim()) {
      setAusentes((prev) => ({ ...prev, [alumnoId]: false }));
    }
  };

  const toggleAusente = (alumnoId: string) => {
    setAusentes((prev) => {
      const nextValue = !prev[alumnoId];
      if (nextValue) {
        setNotasInput((notasPrev) => ({ ...notasPrev, [alumnoId]: "" }));
      }
      return { ...prev, [alumnoId]: nextValue };
    });
  };

  const desmarcarAusente = (alumnoId: string) => {
    if (ausentes[alumnoId]) {
      setAusentes((prev) => ({ ...prev, [alumnoId]: false }));
    }
  };

  const cerrarAlerta = () => {
    setAlerta((prev) => ({ ...prev, visible: false }));
    if (volverAlCerrarAlerta) {
      setVolverAlCerrarAlerta(false);
      router.back();
    }
  };

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
      nota: ValorNota;
      subseccionPath?: string;
    }[] = [];

    for (const [alumnoId, valorStr] of Object.entries(notasInput)) {
      const estaAusente = ausentes[alumnoId] === true;
      if (!valorStr.trim() && !estaAusente) continue;
      if (estaAusente) {
        notasAGuardar.push({
          alumnoId,
          moduloId,
          seccionId,
          subseccionPath: contextoSubseccion,
          nombreExamen: nombreExamen.trim(),
          nota: "Ausente",
        });
        continue;
      }
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
        subseccionPath: contextoSubseccion,
        nombreExamen: nombreExamen.trim(),
        nota: valor,
      });
    }

    if (notasAGuardar.length === 0 && !esEdicion) {
      setAlerta({
        visible: true,
        titulo: "Sin notas",
        mensaje: "No ingresaste ninguna nota para guardar.",
        tipo: "error",
      });
      return;
    }

    setGuardando(true);
    setGuardadoExitoso(true);
    try {
      if (esEdicion) {
        await reemplazarNotasPorExamen(seccionId, nombreExamen.trim(), notasAGuardar, contextoSubseccion);
      } else {
        await guardarNotas(notasAGuardar);
      }
      setVolverAlCerrarAlerta(true);
      setAlerta({
        visible: true,
        titulo: esEdicion ? "Cambios guardados" : "Notas guardadas",
        mensaje: esEdicion
          ? `Se actualizaron ${notasAGuardar.length} nota(s) de "${nombreExamen.trim()}".`
          : `Se guardaron ${notasAGuardar.length} nota(s) para "${nombreExamen.trim()}".`,
        tipo: "exito",
      });
    } catch {
      setGuardadoExitoso(false);
      setVolverAlCerrarAlerta(false);
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

  if (loadingRol || loadingContextoInscripcion) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo={esEdicion ? "Editar Notas" : "Cargar Notas"} mostrarHome />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#25B471" />
        </View>
      </View>
    );
  }

  if (rol !== "admin" && rol !== "profesor") {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo={esEdicion ? "Editar Notas" : "Cargar Notas"} onBack={() => router.back()} mostrarHome />
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

  if (esEdicion && rol !== "admin") {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo="Editar Notas" onBack={() => router.back()} mostrarHome />
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={48} color="#CBD5E0" />
          <Text style={styles.sinPermisoText}>
            No tenés permiso para editar notas existentes.
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
      <ScreenHeader titulo={esEdicion ? "Editar Notas" : "Cargar Notas"} onBack={() => router.back()} mostrarHome />
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
          onChangeText={(text) => {
            setGuardadoExitoso(false);
            setNombreExamen(text.replace(/\//g, "-"));
          }}
          editable={!esEdicion}
          autoCapitalize="sentences"
        />

        {!esEdicion &&
          nombreExamen.trim() &&
          notasExistentes.size > 0 &&
          !guardadoExitoso &&
          !guardando &&
          !volverAlCerrarAlerta &&
          !(alerta.visible && alerta.tipo === "exito") && (
          <View style={styles.warningBox}>
            <Ionicons name="alert-circle-outline" size={18} color="#B45309" />
            <Text style={styles.warningText}>
              Ya existen notas con ese nombre. Para modificar una tanda existente, usá el lápiz desde Ver Notas.
            </Text>
          </View>
        )}

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
                style={[styles.notaInput, ausentes[insc.alumnoId] && styles.notaInputDisabled]}
                placeholder="—"
                placeholderTextColor="#9CA3AF"
                value={notasInput[insc.alumnoId] ?? ""}
                onChangeText={(v) => setNotaAlumno(insc.alumnoId, v)}
                onFocus={() => desmarcarAusente(insc.alumnoId)}
                keyboardType="numeric"
                maxLength={5}
              />
              <TouchableOpacity
                style={[styles.ausenteBtn, ausentes[insc.alumnoId] && styles.ausenteBtnActive]}
                onPress={() => toggleAusente(insc.alumnoId)}
                activeOpacity={0.85}
              >
                <Text style={[styles.ausenteBtnText, ausentes[insc.alumnoId] && styles.ausenteBtnTextActive]}>
                  Ausente
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.cancelBtn, guardando && styles.saveBtnDisabled]}
            onPress={() => setConfirmarCancelar(true)}
            disabled={guardando}
          >
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </TouchableOpacity>
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
              <Text style={styles.saveBtnText}>{esEdicion ? "Guardar Cambios" : "Guardar Notas"}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ModalAlerta
        visible={alerta.visible}
        titulo={alerta.titulo}
        mensaje={alerta.mensaje}
        tipo={alerta.tipo}
        onClose={cerrarAlerta}
      />
      <ModalConfirmacion
        visible={confirmarCancelar}
        titulo="Salir sin guardar"
        mensaje="¿Querés salir sin guardar los cambios?"
        textoConfirmar="Salir"
        textoCancelar="Seguir editando"
        onConfirm={() => {
          setConfirmarCancelar(false);
          router.back();
        }}
        onCancel={() => setConfirmarCancelar(false)}
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
    letterSpacing: 0,
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
    letterSpacing: 0,
  },
  notaInputDisabled: {
    color: "#9CA3AF",
    backgroundColor: "#F3F4F6",
  },
  ausenteBtn: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  ausenteBtnActive: {
    borderColor: "#25B471",
    backgroundColor: "#E8F5E9",
  },
  ausenteBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
  },
  ausenteBtnTextActive: {
    color: "#0F4A32",
  },
  warningBox: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  warningText: {
    flex: 1,
    color: "#92400E",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  saveBtn: {
    flex: 1,
    backgroundColor: "#25B471",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 28,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    color: "#374151",
    fontSize: 16,
    fontWeight: "700",
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
