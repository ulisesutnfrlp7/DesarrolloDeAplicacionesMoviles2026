import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  useContextoInscripcionEfectivo,
  useInscripcionesPorSeccion,
} from "../../hooks/useInscripciones";
import {
  crearPlanillaDesdeBase,
  generarVistaAlumno,
  obtenerPlanillasBase,
  obtenerPlanillasPorContexto,
  type PlanillaBaseTP,
  type PlanillaTP,
  type TipoPlanilla,
} from "../../hooks/usePlanillas";
import { useUserRole } from "../../hooks/useUserRole";

export default function PlanillasScreen() {
  const { moduloId, seccionId, subseccionPath } = useLocalSearchParams<{
    moduloId?: string;
    seccionId?: string;
    subseccionPath?: string;
  }>();
  const { rol, loading: loadingRol } = useUserRole();
  const contextoSubseccion = subseccionPath ?? null;
  const {
    contexto: contextoInscripcion,
    loading: loadingContextoInscripcion,
  } = useContextoInscripcionEfectivo(moduloId, seccionId, contextoSubseccion);
  const { inscripciones, loading: loadingInscripciones } =
    useInscripcionesPorSeccion(
      seccionId ?? null,
      contextoInscripcion?.subseccionPath ?? contextoSubseccion ?? "",
    );

  const [planillas, setPlanillas] = useState<PlanillaTP[]>([]);
  const [planillasBase, setPlanillasBase] = useState<PlanillaBaseTP[]>([]);
  const [loadingBases, setLoadingBases] = useState(true);
  const [loadingPlanillas, setLoadingPlanillas] = useState(true);
  const [nombresAlumnos, setNombresAlumnos] = useState<Record<string, string>>({});
  const [filtroAlumno, setFiltroAlumno] = useState("");
  const [alumnoSeleccionado, setAlumnoSeleccionado] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoPlanilla>("diaria");
  const [planillaBaseId, setPlanillaBaseId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("Planilla");
  const [creando, setCreando] = useState(false);
  const [alerta, setAlerta] = useState<{
    visible: boolean;
    titulo: string;
    mensaje: string;
    tipo: "error" | "exito";
  }>({ visible: false, titulo: "", mensaje: "", tipo: "exito" });

  const puedeGestionar = rol === "admin" || rol === "profesor";
  const cargarPlanillas = useCallback(async () => {
    if (!seccionId || !puedeGestionar) {
      setPlanillas([]);
      setLoadingPlanillas(false);
      return;
    }

    setLoadingPlanillas(true);
    try {
      const data = await obtenerPlanillasPorContexto({
        moduloId,
        seccionId,
        subseccionPath: contextoSubseccion,
      });
      await Promise.all(data.map((planilla) => generarVistaAlumno(planilla.id)));
      setPlanillas(ordenarPorFecha(data));
    } catch {
      setAlerta({
        visible: true,
        titulo: "Error",
        mensaje: "No se pudieron cargar las planillas.",
        tipo: "error",
      });
    } finally {
      setLoadingPlanillas(false);
    }
  }, [contextoSubseccion, moduloId, puedeGestionar, seccionId]);

  const cargarBases = useCallback(async () => {
    if (!puedeGestionar) {
      setPlanillasBase([]);
      setLoadingBases(false);
      return;
    }

    setLoadingBases(true);
    try {
      const bases = await obtenerPlanillasBase();
      setPlanillasBase(bases);
      setPlanillaBaseId((actual) => actual ?? bases[0]?.id ?? null);
      if (bases[0]) setTipo((actual) => actual ?? bases[0].tipo);
    } catch {
      setAlerta({
        visible: true,
        titulo: "Error",
        mensaje: "No se pudieron cargar las planillas base.",
        tipo: "error",
      });
    } finally {
      setLoadingBases(false);
    }
  }, [puedeGestionar]);

  useEffect(() => {
    cargarPlanillas();
  }, [cargarPlanillas]);

  useFocusEffect(
    useCallback(() => {
      cargarBases();
    }, [cargarBases]),
  );

  useEffect(() => {
    if (inscripciones.length === 0) {
      setNombresAlumnos({});
      setAlumnoSeleccionado(null);
      return;
    }

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
      setAlumnoSeleccionado((actual) => actual ?? inscripciones[0]?.alumnoId ?? null);
    };

    fetchNombres();
  }, [inscripciones]);

  useEffect(() => {
    if (!alumnoSeleccionado) {
      setTitulo("Planilla");
      return;
    }
    const nombre = nombresAlumnos[alumnoSeleccionado] ?? alumnoSeleccionado;
    setTitulo(`Planilla ${nombre}`);
  }, [alumnoSeleccionado, nombresAlumnos]);

  const alumnosFiltrados = useMemo(() => {
    const texto = filtroAlumno.toLowerCase().trim();
    if (!texto) return inscripciones;
    return inscripciones.filter((insc) =>
      (nombresAlumnos[insc.alumnoId] ?? insc.alumnoId).toLowerCase().includes(texto),
    );
  }, [filtroAlumno, inscripciones, nombresAlumnos]);

  const seleccionarPlantilla = (option: PlanillaBaseTP) => {
    setPlanillaBaseId(option.id);
    setTipo(option.tipo);
  };

  const seleccionarTipo = (nuevoTipo: TipoPlanilla) => {
    const plantillaCompatible = planillasBase.find((option) => option.tipo === nuevoTipo);
    setTipo(nuevoTipo);
    if (plantillaCompatible) {
      setPlanillaBaseId(plantillaCompatible.id);
    }
  };

  const crearPlanilla = async () => {
    if (!seccionId || !alumnoSeleccionado || !titulo.trim()) {
      setAlerta({
        visible: true,
        titulo: "Datos incompletos",
        mensaje: "Seleccioná un alumno e ingresá un título.",
        tipo: "error",
      });
      return;
    }

    setCreando(true);
    try {
      const baseSeleccionada = planillasBase.find((base) => base.id === planillaBaseId);
      if (!baseSeleccionada) throw new Error("Planilla base no encontrada");

      await crearPlanillaDesdeBase({
        alumnoId: alumnoSeleccionado,
        alumnoNombre: nombresAlumnos[alumnoSeleccionado] ?? alumnoSeleccionado,
        moduloId,
        seccionId,
        subseccionPath: contextoSubseccion,
        tipo: baseSeleccionada.tipo,
        titulo: titulo.trim(),
        base: baseSeleccionada,
      });
      setAlerta({
        visible: true,
        titulo: "Planilla creada",
        mensaje: "La planilla se guardó correctamente.",
        tipo: "exito",
      });
      await cargarPlanillas();
    } catch {
      setAlerta({
        visible: true,
        titulo: "Error",
        mensaje: "No se pudo crear la planilla. Intentá nuevamente.",
        tipo: "error",
      });
    } finally {
      setCreando(false);
    }
  };

  if (loadingRol || loadingContextoInscripcion) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo="Planillas" mostrarHome />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#25B471" />
        </View>
      </View>
    );
  }

  if (!puedeGestionar) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo="Planillas" onBack={() => router.back()} mostrarHome />
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={48} color="#CBD5E0" />
          <Text style={styles.sinPermisoText}>No tenés permiso para acceder a esta pantalla.</Text>
          <TouchableOpacity style={styles.volverBtn} onPress={() => router.back()}>
            <Text style={styles.volverBtnText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScreenHeader titulo="Planillas de trabajos prácticos" onBack={() => router.back()} mostrarHome />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.formCard}>
          <View style={styles.cardHeader}>
            <Ionicons name="add-circle-outline" size={20} color="#0F4A32" />
            <Text style={styles.cardTitle}>Nueva planilla</Text>
          </View>

          {rol === "admin" && (
            <TouchableOpacity
              style={styles.manageBasesBtn}
              onPress={() => router.push("/secciones/planillas-base" as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="settings-outline" size={18} color="#0F4A32" />
              <Text style={styles.manageBasesText}>Gestionar planillas base</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.sectionLabel}>Alumno</Text>
          <BuscadorAlumnos valor={filtroAlumno} onChangeText={setFiltroAlumno} placeholder="Buscar alumno por nombre..." />
          {loadingInscripciones ? (
            <ActivityIndicator color="#25B471" style={{ marginTop: 10 }} />
          ) : inscripciones.length === 0 ? (
            <Text style={styles.emptyText}>No hay alumnos inscriptos en esta sección.</Text>
          ) : alumnosFiltrados.length === 0 ? (
            <Text style={styles.emptyText}>No se encontraron alumnos con ese criterio.</Text>
          ) : (
            <View style={styles.selectorList}>
              {alumnosFiltrados.map((insc) => {
                const activo = alumnoSeleccionado === insc.alumnoId;
                return (
                  <TouchableOpacity
                    key={insc.alumnoId}
                    style={[styles.optionRow, activo && styles.optionRowActive]}
                    onPress={() => setAlumnoSeleccionado(insc.alumnoId)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={activo ? "radio-button-on" : "radio-button-off"}
                      size={18}
                      color={activo ? "#0F4A32" : "#9CA3AF"}
                    />
                    <Text style={[styles.optionText, activo && styles.optionTextActive]} numberOfLines={1}>
                      {nombresAlumnos[insc.alumnoId] ?? insc.alumnoId}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <Text style={styles.sectionLabel}>Tipo de planilla</Text>
          <View style={styles.chipsRow}>
            {(["diaria", "resumen"] as TipoPlanilla[]).map((tipoOption) => {
              const activo = tipo === tipoOption;
              return (
                <TouchableOpacity
                  key={tipoOption}
                  style={[styles.chip, activo && styles.chipActivo]}
                  onPress={() => seleccionarTipo(tipoOption)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, activo && styles.chipTextActivo]}>
                    {tipoOption === "diaria" ? "Diaria" : "Final"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>Plantilla base</Text>
          {loadingBases ? (
            <ActivityIndicator color="#25B471" style={{ marginTop: 10 }} />
          ) : planillasBase.length === 0 ? (
            <Text style={styles.emptyText}>No hay planillas base disponibles.</Text>
          ) : (
            <View style={styles.templateGrid}>
            {planillasBase
              .filter((option) => option.tipo === tipo)
              .map((option) => {
              const activo = planillaBaseId === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.templateBtn, activo && styles.templateBtnActive]}
                  onPress={() => seleccionarPlantilla(option)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.templateText, activo && styles.templateTextActive]}>{option.nombre}</Text>
                  <Text style={[styles.templateMeta, activo && styles.templateTextActive]}>
                    {option.tipo === "diaria" ? "Diaria" : "Final"}
                  </Text>
                </TouchableOpacity>
              );
            })}
            </View>
          )}

          <Text style={styles.sectionLabel}>Título</Text>
          <TextInput
            style={styles.input}
            placeholder="Título de la planilla"
            placeholderTextColor="#9CA3AF"
            value={titulo}
            onChangeText={setTitulo}
            autoCapitalize="sentences"
          />

          <TouchableOpacity
            style={[
              styles.saveBtn,
              (creando || loadingInscripciones || loadingBases || !alumnoSeleccionado || !planillaBaseId) &&
                styles.saveBtnDisabled,
            ]}
            onPress={crearPlanilla}
            disabled={creando || loadingInscripciones || loadingBases || !alumnoSeleccionado || !planillaBaseId}
            activeOpacity={0.85}
          >
            {creando ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#FFFFFF" />
                <Text style={styles.saveBtnText}>Creando...</Text>
              </View>
            ) : (
              <Text style={styles.saveBtnText}>Crear planilla</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Planillas creadas</Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={cargarPlanillas}>
            <Ionicons name="refresh-outline" size={16} color="#0F4A32" />
            <Text style={styles.refreshText}>Actualizar</Text>
          </TouchableOpacity>
        </View>

        {loadingPlanillas ? (
          <ActivityIndicator color="#25B471" style={{ marginTop: 20 }} />
        ) : planillas.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="clipboard-outline" size={44} color="#CBD5E0" />
            <Text style={styles.emptyText}>Todavía no hay planillas en esta sección.</Text>
          </View>
        ) : (
          planillas.map((planilla) => (
            <TouchableOpacity
              key={planilla.id}
              style={styles.planillaCard}
              onPress={() =>
                router.push({
                  pathname: "/secciones/planilla-detalle",
                  params: { planillaId: planilla.id, moduloId, seccionId, subseccionPath },
                } as any)
              }
              activeOpacity={0.85}
            >
              <View style={styles.planillaHeader}>
                <View style={styles.planillaIconBg}>
                  <Ionicons name="clipboard-outline" size={18} color="#0F4A32" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.planillaTitulo}>{planilla.titulo}</Text>
                  <Text style={styles.planillaMeta}>
                    {planilla.alumnoNombre || nombresAlumnos[planilla.alumnoId] || planilla.alumnoId}
                  </Text>
                </View>
                <View style={styles.tipoBadge}>
                  <Text style={styles.tipoBadgeText}>{planilla.tipo === "diaria" ? "Diaria" : "Final"}</Text>
                </View>
              </View>
              <View style={styles.planillaFooter}>
                <Text style={styles.planillaInfo}>Columnas: {planilla.columnas?.length ?? 0}</Text>
                <Text style={styles.planillaInfo}>Actualizada: {formatFecha(planilla.fechaActualizacion)}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
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

function ordenarPorFecha(items: PlanillaTP[]) {
  return [...items].sort((a, b) => {
    const aTime = a.fechaActualizacion?.toMillis?.() ?? 0;
    const bTime = b.fechaActualizacion?.toMillis?.() ?? 0;
    return bTime - aTime;
  });
}

function formatFecha(fecha: PlanillaTP["fechaActualizacion"]) {
  const date = fecha?.toDate?.();
  if (!date) return "-";
  return date.toLocaleDateString("es-AR");
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    marginBottom: 18,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#11181C" },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: "#374151", marginTop: 16, marginBottom: 8 },
  selectorList: { gap: 8 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#F9FAFB",
  },
  optionRowActive: { borderColor: "#25B471", backgroundColor: "#E8F5E9" },
  optionText: { flex: 1, fontSize: 14, color: "#374151", fontWeight: "600" },
  optionTextActive: { color: "#0F4A32" },
  chipsRow: { flexDirection: "row", gap: 8 },
  chip: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
  chipActivo: { backgroundColor: "#0F4A32", borderColor: "#0F4A32" },
  chipText: { fontSize: 13, color: "#374151", fontWeight: "700" },
  chipTextActivo: { color: "#FFFFFF" },
  templateGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  templateBtn: {
    width: "48%",
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
  templateBtnActive: { backgroundColor: "#E8F5E9", borderColor: "#25B471" },
  templateText: { fontSize: 12, fontWeight: "700", color: "#374151", textAlign: "center" },
  templateTextActive: { color: "#0F4A32" },
  templateMeta: { fontSize: 10, fontWeight: "600", color: "#6B7280", textAlign: "center", marginTop: 3 },
  manageBasesBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#E8F5E9",
    borderRadius: 10,
    paddingVertical: 10,
  },
  manageBasesText: { color: "#0F4A32", fontWeight: "700", fontSize: 13 },
  input: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: "#11181C",
  },
  saveBtn: {
    backgroundColor: "#25B471",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  listTitle: { fontSize: 17, fontWeight: "700", color: "#11181C" },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  refreshText: { fontSize: 12, color: "#0F4A32", fontWeight: "700" },
  planillaCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#25B471",
    padding: 14,
    marginBottom: 12,
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  planillaHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  planillaIconBg: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#E8F5E9",
    alignItems: "center",
    justifyContent: "center",
  },
  planillaTitulo: { fontSize: 15, fontWeight: "700", color: "#11181C" },
  planillaMeta: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  tipoBadge: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tipoBadgeText: { fontSize: 11, color: "#0F4A32", fontWeight: "700" },
  planillaFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  planillaInfo: { fontSize: 12, color: "#6B7280", fontWeight: "600" },
  emptyContainer: { alignItems: "center", paddingTop: 28, gap: 10 },
  emptyText: { fontSize: 14, color: "#9CA3AF", textAlign: "center", fontStyle: "italic" },
  sinPermisoText: { fontSize: 16, color: "#6B7280", textAlign: "center", marginTop: 12, marginBottom: 24 },
  volverBtn: { backgroundColor: "#0F4A32", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  volverBtnText: { color: "#FFFFFF", fontWeight: "700" },
});
