import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import ModalAlerta from "../../components/ui/ModalAlerta";
import ModalConfirmacion from "../../components/ui/ModalConfirmacion";
import ScreenHeader from "../../components/ui/ScreenHeader";
import {
  crearPlanillaBase,
  eliminarPlanillaBase,
  obtenerPlanillasBase,
  type PlanillaBaseTP,
  type TipoPlanilla,
} from "../../hooks/usePlanillas";
import { useUserRole } from "../../hooks/useUserRole";

export default function PlanillasBaseScreen() {
  const { rol, loading: loadingRol } = useUserRole();
  const [bases, setBases] = useState<PlanillaBaseTP[]>([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoPlanilla>("diaria");
  const [baseAEliminar, setBaseAEliminar] = useState<PlanillaBaseTP | null>(null);
  const [alerta, setAlerta] = useState<{
    visible: boolean;
    titulo: string;
    mensaje: string;
    tipo: "error" | "exito";
  }>({ visible: false, titulo: "", mensaje: "", tipo: "exito" });

  const esAdmin = rol === "admin";

  const cargar = useCallback(async () => {
    if (!esAdmin) {
      setBases([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      setBases(await obtenerPlanillasBase());
    } catch {
      setAlerta({ visible: true, titulo: "Error", mensaje: "No se pudieron cargar las planillas base.", tipo: "error" });
    } finally {
      setLoading(false);
    }
  }, [esAdmin]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  const crear = async () => {
    if (!nombre.trim()) {
      setAlerta({ visible: true, titulo: "Nombre requerido", mensaje: "Ingresá un nombre para la planilla base.", tipo: "error" });
      return;
    }
    setCreando(true);
    try {
      const id = await crearPlanillaBase({ nombre: nombre.trim(), tipo });
      setNombre("");
      setTipo("diaria");
      await cargar();
      router.push({ pathname: "/secciones/planilla-base-detalle", params: { planillaBaseId: id } } as any);
    } catch {
      setAlerta({ visible: true, titulo: "Error", mensaje: "No se pudo crear la planilla base.", tipo: "error" });
    } finally {
      setCreando(false);
    }
  };

  const confirmarEliminar = async () => {
    if (!baseAEliminar) return;
    setCreando(true);
    try {
      await eliminarPlanillaBase(baseAEliminar.id);
      setBaseAEliminar(null);
      await cargar();
      setAlerta({ visible: true, titulo: "Planilla base eliminada", mensaje: "La planilla base se eliminó correctamente.", tipo: "exito" });
    } catch {
      setAlerta({ visible: true, titulo: "Error", mensaje: "No se pudo eliminar la planilla base.", tipo: "error" });
    } finally {
      setCreando(false);
    }
  };

  if (loadingRol || loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo="Planillas base" mostrarHome />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#25B471" />
        </View>
      </View>
    );
  }

  if (!esAdmin) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo="Planillas base" onBack={() => router.back()} mostrarHome />
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={48} color="#CBD5E0" />
          <Text style={styles.emptyText}>No tenés permiso para gestionar planillas base.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader titulo="Planillas base" onBack={() => router.back()} mostrarHome />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.formCard}>
          <View style={styles.cardHeader}>
            <Ionicons name="add-circle-outline" size={20} color="#0F4A32" />
            <Text style={styles.cardTitle}>Nueva planilla base</Text>
          </View>
          <Text style={styles.sectionLabel}>Nombre</Text>
          <TextInput
            style={styles.input}
            value={nombre}
            onChangeText={setNombre}
            placeholder="Nombre de la planilla base"
            placeholderTextColor="#9CA3AF"
          />
          <Text style={styles.sectionLabel}>Tipo</Text>
          <View style={styles.chipsRow}>
            {(["diaria", "resumen"] as TipoPlanilla[]).map((tipoOption) => {
              const activo = tipo === tipoOption;
              return (
                <TouchableOpacity
                  key={tipoOption}
                  style={[styles.chip, activo && styles.chipActivo]}
                  onPress={() => setTipo(tipoOption)}
                >
                  <Text style={[styles.chipText, activo && styles.chipTextActivo]}>
                    {tipoOption === "diaria" ? "Diaria" : "Final"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity style={[styles.saveBtn, creando && styles.disabled]} onPress={crear} disabled={creando}>
            <Text style={styles.saveBtnText}>{creando ? "Creando..." : "Crear planilla base"}</Text>
          </TouchableOpacity>
        </View>

        <BaseSection
          titulo={`Planillas base (${bases.length})`}
          bases={bases}
          onEliminar={setBaseAEliminar}
        />
      </ScrollView>

      <ModalAlerta
        visible={alerta.visible}
        titulo={alerta.titulo}
        mensaje={alerta.mensaje}
        tipo={alerta.tipo}
        onClose={() => setAlerta((prev) => ({ ...prev, visible: false }))}
      />
      <ModalConfirmacion
        visible={!!baseAEliminar}
        titulo="Eliminar planilla base"
        mensaje="¿Seguro que querés eliminar esta planilla base? No afecta planillas de alumnos ya creadas."
        textoConfirmar={creando ? "Eliminando..." : "Sí, eliminar"}
        textoCancelar="Cancelar"
        onConfirm={confirmarEliminar}
        onCancel={() => setBaseAEliminar(null)}
      />
    </View>
  );
}

function BaseSection({
  titulo,
  bases,
  onEliminar,
}: {
  titulo: string;
  bases: PlanillaBaseTP[];
  onEliminar?: (base: PlanillaBaseTP) => void;
}) {
  return (
    <View style={styles.sectionBox}>
      <Text style={styles.listTitle}>{titulo}</Text>
      {bases.length === 0 ? (
        <Text style={styles.emptyText}>No hay planillas base en este grupo.</Text>
      ) : (
        bases.map((base) => (
          <TouchableOpacity
            key={base.id}
            style={styles.baseCard}
            onPress={() =>
              router.push({ pathname: "/secciones/planilla-base-detalle", params: { planillaBaseId: base.id } } as any)
            }
            activeOpacity={0.85}
          >
            <View style={styles.baseHeader}>
              <View style={styles.iconBg}>
                <Ionicons name="clipboard-outline" size={18} color="#0F4A32" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.baseTitle}>{base.nombre}</Text>
              </View>
              <View style={styles.tipoBadge}>
                <Text style={styles.tipoBadgeText}>{base.tipo === "diaria" ? "Diaria" : "Final"}</Text>
              </View>
            </View>
            <View style={styles.baseFooter}>
              <Text style={styles.baseInfo}>Columnas: {base.columnas?.length ?? 0}</Text>
              <Text style={styles.baseInfo}>Filas: {base.filasBase?.length ?? 0}</Text>
              {!!onEliminar && (
                <TouchableOpacity style={styles.deleteBtn} onPress={() => onEliminar(base)}>
                  <Ionicons name="trash-outline" size={16} color="#DC2626" />
                  <Text style={styles.deleteText}>Eliminar</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    marginBottom: 18,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#11181C" },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: "#374151", marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: "#11181C",
  },
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
  saveBtn: {
    backgroundColor: "#25B471",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 18,
  },
  saveBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.6 },
  sectionBox: { marginBottom: 18 },
  listTitle: { fontSize: 17, fontWeight: "700", color: "#11181C", marginBottom: 10 },
  baseCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#25B471",
    padding: 14,
    marginBottom: 12,
  },
  baseHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBg: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#E8F5E9",
    alignItems: "center",
    justifyContent: "center",
  },
  baseTitle: { fontSize: 15, fontWeight: "700", color: "#11181C" },
  tipoBadge: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tipoBadgeText: { fontSize: 11, color: "#0F4A32", fontWeight: "700" },
  baseFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  baseInfo: { fontSize: 12, color: "#6B7280", fontWeight: "600" },
  deleteBtn: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4 },
  deleteText: { color: "#DC2626", fontSize: 12, fontWeight: "700" },
  emptyText: { fontSize: 14, color: "#9CA3AF", textAlign: "center", marginTop: 8 },
});
