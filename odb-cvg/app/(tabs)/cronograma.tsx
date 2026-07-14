// app/(tabs)/cronograma.tsx
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ModalAlerta from "../../components/ui/ModalAlerta";
import ModalConfirmacion from "../../components/ui/ModalConfirmacion";
import ModalEventoCronograma from "../../components/ui/ModalEventoCronograma";
import { auth } from "../../config/firebaseConfig";
import type { EventoCronograma, EventoCronogramaInput } from "../../hooks/useCronograma";
import { useCronograma } from "../../hooks/useCronograma";
import { useUserRole } from "../../hooks/useUserRole";

const BADGE_COLORS: Record<string, string> = {
  entrega: "#E8871E",
  ateneo: "#25B471",
  parcial: "#C0392B",
};

const BADGE_LABELS: Record<string, string> = {
  entrega: "Entrega",
  ateneo: "Ateneo",
  parcial: "Parcial",
};

const FILTROS = [
  { key: "todos",   label: "Todos" },
  { key: "entrega", label: "Entregas" },
  { key: "ateneo",  label: "Ateneos" },
  { key: "parcial", label: "Parciales" },
] as const;

type FiltroTipo = (typeof FILTROS)[number]["key"];

const NOMBRES_MESES: Record<number, string> = {
  0: "Enero",  1: "Febrero",  2: "Marzo",    3: "Abril",
  4: "Mayo",   5: "Junio",    6: "Julio",    7: "Agosto",
  8: "Septiembre", 9: "Octubre", 10: "Noviembre", 11: "Diciembre",
};

function toYYYYMM(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}

function capitalizarPrimera(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatearFechaHeader(fecha: Date): string {
  return capitalizarPrimera(
    fecha.toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  );
}

function formatearHora(fecha: Date): string {
  return fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

type Seccion = { key: string; fecha: Date; data: EventoCronograma[] };

function agruparPorFecha(eventos: EventoCronograma[]): Seccion[] {
  const mapa = new Map<string, Seccion>();
  for (const e of eventos) {
    const clave = e.fecha.toDateString();
    if (!mapa.has(clave)) {
      mapa.set(clave, { key: clave, fecha: e.fecha, data: [] });
    }
    mapa.get(clave)!.data.push(e);
  }
  return Array.from(mapa.values());
}

export default function CronogramaScreen() {
  const { rol } = useUserRole();
  const uid = auth.currentUser?.uid ?? null;

  const { eventos, loading, crearEvento, editarEvento, eliminarEvento } = useCronograma({
    rol,
    uid,
  });

  // Filtros
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("todos");
  const [mesActivo, setMesActivo] = useState<string>("");

  // Modales
  const [modalFormVisible, setModalFormVisible] = useState(false);
  const [eventoSeleccionado, setEventoSeleccionado] = useState<EventoCronograma | null>(null);
  const [eventoAEliminar, setEventoAEliminar] = useState<EventoCronograma | null>(null);
  const [alerta, setAlerta] = useState<{
    visible: boolean;
    titulo: string;
    mensaje: string;
    tipo: "error" | "exito";
  }>({ visible: false, titulo: "", mensaje: "", tipo: "exito" });

  // Refs para la barra de meses
  const monthScrollRef = useRef<ScrollView>(null);
  const pillOffsets = useRef<Map<string, number>>(new Map());

  // Meses disponibles derivados del total de eventos (sin filtro de tipo)
  const mesesDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const e of eventos) set.add(toYYYYMM(e.fecha));
    return Array.from(set)
      .sort()
      .map((clave) => {
        const month = Number(clave.split("-")[1]);
        return { clave, label: NOMBRES_MESES[month - 1] ?? clave };
      });
  }, [eventos]);

  // Inicializar mesActivo: mes actual si tiene eventos, si no el primero disponible
  useEffect(() => {
    if (mesesDisponibles.length === 0) return;
    if (mesActivo && mesesDisponibles.some((m) => m.clave === mesActivo)) return;
    const ahora = toYYYYMM(new Date());
    const hayActual = mesesDisponibles.some((m) => m.clave === ahora);
    setMesActivo(hayActual ? ahora : mesesDisponibles[0].clave);
  }, [mesesDisponibles, mesActivo]);

  // Auto-scroll de la barra de meses al mes activo
  useEffect(() => {
    if (!mesActivo) return;
    const offset = pillOffsets.current.get(mesActivo);
    if (offset !== undefined) {
      monthScrollRef.current?.scrollTo({ x: Math.max(0, offset - 24), animated: true });
    }
  }, [mesActivo]);

  // Eventos filtrados por tipo y mes
  const eventosFiltrados = useMemo(
    () =>
      eventos
        .filter((e) => filtroTipo === "todos" || e.tipo === filtroTipo)
        .filter((e) => !mesActivo || toYYYYMM(e.fecha) === mesActivo),
    [eventos, filtroTipo, mesActivo],
  );

  const secciones = useMemo(() => agruparPorFecha(eventosFiltrados), [eventosFiltrados]);

  // Mensaje del empty state contextual
  const emptyLabel = useMemo(() => {
    const mesLabel = mesesDisponibles.find((m) => m.clave === mesActivo)?.label ?? "";
    const tipoLabel = FILTROS.find((f) => f.key === filtroTipo)?.label?.toLowerCase() ?? "eventos";
    return filtroTipo === "todos"
      ? `Sin eventos en ${mesLabel}.`
      : `Sin ${tipoLabel} en ${mesLabel}.`;
  }, [filtroTipo, mesActivo, mesesDisponibles]);

  const handleAbrirCrear = () => {
    setEventoSeleccionado(null);
    setModalFormVisible(true);
  };

  const handleAbrirEditar = (evento: EventoCronograma) => {
    setEventoSeleccionado(evento);
    setModalFormVisible(true);
  };

  const handleGuardar = async (data: EventoCronogramaInput) => {
    if (eventoSeleccionado) {
      await editarEvento(eventoSeleccionado.id, data);
      setAlerta({ visible: true, titulo: "Listo", mensaje: "Evento actualizado.", tipo: "exito" });
    } else {
      await crearEvento(data);
      setAlerta({ visible: true, titulo: "Listo", mensaje: "Evento creado.", tipo: "exito" });
    }
  };

  const handleEliminarConfirm = async () => {
    if (!eventoAEliminar) return;
    try {
      await eliminarEvento(eventoAEliminar.id);
      setEventoAEliminar(null);
      setAlerta({
        visible: true,
        titulo: "Eliminado",
        mensaje: "El evento fue eliminado.",
        tipo: "exito",
      });
    } catch {
      setEventoAEliminar(null);
      setAlerta({
        visible: true,
        titulo: "Error",
        mensaje: "No se pudo eliminar el evento.",
        tipo: "error",
      });
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#25B471" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
          <Text style={styles.headerTitle}>Cronograma {new Date().getFullYear()}</Text>
      </View>

      {/* ── Barra de filtro de tipo ── */}
      <View style={styles.filterBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterBarContent}
        >
          {FILTROS.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterPill, filtroTipo === f.key && styles.filterPillActive]}
              onPress={() => setFiltroTipo(f.key)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterPillText,
                  filtroTipo === f.key && styles.filterPillTextActive,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Lista de eventos ── */}
      {secciones.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={52} color="#CBD5E0" />
          <Text style={styles.emptyText}>
            {eventos.length === 0 ? "Sin eventos programados." : emptyLabel}
          </Text>
          {eventos.length === 0 && rol === "admin" && (
            <Text style={styles.emptySubText}>Presioná + para agregar el primero.</Text>
          )}
        </View>
      ) : (
        <SectionList<EventoCronograma, Seccion>
          sections={secciones}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{formatearFechaHeader(section.fecha)}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <View style={styles.eventoItem}>
              <View style={[styles.tipoBadge, { backgroundColor: BADGE_COLORS[item.tipo] }]}>
                <Text style={styles.tipoBadgeText}>{BADGE_LABELS[item.tipo]}</Text>
              </View>

              <View style={styles.eventoContent}>
                <Text style={styles.eventoTitulo}>{item.titulo}</Text>
                <Text style={styles.eventoHora}>{formatearHora(item.fecha)}</Text>
                {(item.moduloTitulo || item.comisionTitulo || item.seccionTitulo) ? (
                  <Text style={styles.eventoContexto} numberOfLines={1}>
                    {[item.moduloTitulo, item.comisionTitulo ?? item.seccionTitulo].filter(Boolean).join(" · ")}
                  </Text>
                ) : null}
                {item.descripcion ? (
                  <Text style={styles.eventoDescripcion} numberOfLines={2}>
                    {item.descripcion}
                  </Text>
                ) : null}
              </View>

              {rol === "admin" && item.tipo !== "entrega" && (
                <View style={styles.adminActions}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleAbrirEditar(item)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons name="pencil-outline" size={16} color="#0F4A32" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnDelete]}
                    onPress={() => setEventoAEliminar(item)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#C0392B" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        />
      )}

      {/* ── FAB: solo admin ── */}
      {rol === "admin" && (
        <TouchableOpacity style={styles.fab} onPress={handleAbrirCrear} activeOpacity={0.85}>
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* ── Barra deslizable de meses ── */}
      {mesesDisponibles.length > 0 && (
        <View style={styles.monthBarWrapper}>
          <ScrollView
            ref={monthScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.monthBarContent}
          >
            {mesesDisponibles.map((mes) => {
              const activo = mesActivo === mes.clave;
              return (
                <TouchableOpacity
                  key={mes.clave}
                  style={[styles.monthPill, activo && styles.monthPillActive]}
                  onPress={() => setMesActivo(mes.clave)}
                  activeOpacity={0.7}
                  onLayout={(e) => {
                    pillOffsets.current.set(mes.clave, e.nativeEvent.layout.x);
                  }}
                >
                  <Text style={[styles.monthPillText, activo && styles.monthPillTextActive]}>
                    {mes.label}
                  </Text>
                  {activo && <View style={styles.monthActiveDot} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <ModalEventoCronograma
        visible={modalFormVisible}
        eventoExistente={eventoSeleccionado}
        onGuardar={handleGuardar}
        onCancelar={() => setModalFormVisible(false)}
      />

      <ModalConfirmacion
        visible={!!eventoAEliminar}
        titulo="Eliminar Evento"
        mensaje={`¿Eliminás "${eventoAEliminar?.titulo ?? ""}"? Esta acción no se puede deshacer.`}
        textoConfirmar="Eliminar"
        textoCancelar="Cancelar"
        onConfirm={handleEliminarConfirm}
        onCancel={() => setEventoAEliminar(null)}
      />

      <ModalAlerta
        visible={alerta.visible}
        titulo={alerta.titulo}
        mensaje={alerta.mensaje}
        tipo={alerta.tipo}
        onClose={() => setAlerta((prev) => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
  },
  header: {
    backgroundColor: "#FFFFFF",
    paddingTop: 52,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F4A32",
  },
  // ── Filter bar de tipo ──
  filterBarWrapper: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  filterBarContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#0F4A32",
    backgroundColor: "#FFFFFF",
  },
  filterPillActive: {
    backgroundColor: "#0F4A32",
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F4A32",
  },
  filterPillTextActive: {
    color: "#FFFFFF",
  },
  // ── Lista ──
  listContent: {
    paddingBottom: 90,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    marginTop: 22,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F4A32",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  eventoItem: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "flex-start",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  tipoBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 12,
    alignSelf: "flex-start",
    marginTop: 2,
  },
  tipoBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  eventoContent: {
    flex: 1,
  },
  eventoTitulo: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  eventoHora: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 2,
  },
  eventoContexto: {
    fontSize: 12,
    color: "#9CA3AF",
    fontStyle: "italic",
    marginTop: 1,
  },
  eventoDescripcion: {
    fontSize: 13,
    color: "#4B5563",
    marginTop: 4,
  },
  adminActions: {
    flexDirection: "column",
    gap: 6,
    marginLeft: 8,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#F0FDF4",
    justifyContent: "center",
    alignItems: "center",
  },
  actionBtnDelete: {
    backgroundColor: "#FEF2F2",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 17,
    color: "#9CA3AF",
    fontWeight: "600",
    marginTop: 12,
    textAlign: "center",
  },
  emptySubText: {
    fontSize: 14,
    color: "#C4C9D0",
    marginTop: 4,
    textAlign: "center",
  },
  fab: {
    position: "absolute",
    bottom: 72,
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#0F4A32",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  // ── Month bar ──
  monthBarWrapper: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  monthBarContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  monthPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
  },
  monthPillActive: {
    backgroundColor: "#0F4A32",
  },
  monthPillText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  monthPillTextActive: {
    color: "#FFFFFF",
  },
  monthActiveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#25B471",
    marginTop: 3,
  },
});
