import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import BuscadorAlumnos from "../../components/ui/BuscadorAlumnos";
import ScreenHeader from "../../components/ui/ScreenHeader";
import { auth } from "../../config/firebaseConfig";
import {
  generarVistaAlumno,
  obtenerPlanillasPorContexto,
  obtenerVistasAlumnoPorContexto,
  type PlanillaTP,
  type TipoPlanilla,
  type VistaAlumnoPlanilla,
} from "../../hooks/usePlanillas";
import { useUserRole } from "../../hooks/useUserRole";

type CardData = {
  id: string;
  titulo: string;
  tipo: TipoPlanilla;
  alumno?: string;
  fechaActualizacion?: any;
  modoAlumno?: boolean;
};

export default function MisPlanillasScreen() {
  const { moduloId, seccionId, subseccionPath } = useLocalSearchParams<{
    moduloId?: string;
    seccionId?: string;
    subseccionPath?: string;
  }>();
  const { rol, loading: loadingRol } = useUserRole();
  const uid = auth.currentUser?.uid ?? null;
  const esDocente = rol === "admin" || rol === "profesor";
  const esAlumno = !esDocente;
  const contextoSubseccion = subseccionPath ?? null;

  const [planillasDocente, setPlanillasDocente] = useState<PlanillaTP[]>([]);
  const [vistasAlumno, setVistasAlumno] = useState<VistaAlumnoPlanilla[]>([]);
  const [filtro, setFiltro] = useState("");
  const [diariasAbiertas, setDiariasAbiertas] = useState(true);
  const [finalesAbiertas, setFinalesAbiertas] = useState(true);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    if (!seccionId || loadingRol || !uid) return;
    setLoading(true);
    try {
      if (esDocente) {
        const data = await obtenerPlanillasPorContexto({
          moduloId,
          seccionId,
          subseccionPath: contextoSubseccion,
        });
        await Promise.all(data.map((planilla) => generarVistaAlumno(planilla.id)));
        setPlanillasDocente(ordenarPorFecha(data));
        setVistasAlumno([]);
      } else {
        const data = await obtenerVistasAlumnoPorContexto({
          alumnoId: uid,
          moduloId,
          seccionId,
          subseccionPath: contextoSubseccion,
        });
        setVistasAlumno(ordenarPorFecha(data));
        setPlanillasDocente([]);
      }
    } finally {
      setLoading(false);
    }
  }, [contextoSubseccion, esDocente, loadingRol, moduloId, seccionId, uid]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cards = useMemo<CardData[]>(() => {
    const raw: CardData[] = esDocente
      ? planillasDocente.map((p) => ({
          id: p.id,
          titulo: p.titulo,
          tipo: p.tipo,
          alumno: p.alumnoNombre ?? p.alumnoId,
          fechaActualizacion: p.fechaActualizacion,
        }))
      : vistasAlumno.map((v) => ({
          id: v.planillaId,
          titulo: v.titulo,
          tipo: v.tipo,
          fechaActualizacion: v.fechaActualizacion,
          modoAlumno: true,
        }));

    const texto = filtro.toLowerCase().trim();
    if (!texto) return raw;
    return raw.filter((item) =>
      `${item.titulo} ${item.alumno ?? ""}`.toLowerCase().includes(texto),
    );
  }, [esDocente, filtro, planillasDocente, vistasAlumno]);

  const diarias = cards.filter((item) => item.tipo === "diaria");
  const finales = cards.filter((item) => item.tipo === "resumen");
  const empty = cards.length === 0;

  if (loadingRol || loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo={esAlumno ? "Mis planillas" : "Ver planillas"} mostrarHome />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#25B471" />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        titulo={esAlumno ? "Mis planillas" : "Ver planillas"}
        onBack={() => router.back()}
        mostrarHome
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>{esAlumno ? "Mis planillas" : "Planillas"}</Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={cargar}>
            <Ionicons name="refresh-outline" size={16} color="#0F4A32" />
            <Text style={styles.refreshText}>Actualizar</Text>
          </TouchableOpacity>
        </View>

        {esDocente && (
          <BuscadorAlumnos
            valor={filtro}
            onChangeText={setFiltro}
            placeholder="Buscar por alumno o planilla..."
          />
        )}

        {empty ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="clipboard-outline" size={52} color="#CBD5E0" />
            <Text style={styles.emptyTitle}>Sin planillas</Text>
            <Text style={styles.emptyText}>
              {esAlumno
                ? "Todavia no hay planillas disponibles para consultar."
                : "No hay planillas que coincidan con la busqueda."}
            </Text>
          </View>
        ) : (
          <>
            <PlanillasGrupo
              titulo={`Planillas diarias (${diarias.length})`}
              items={diarias}
              abierto={esAlumno ? true : diariasAbiertas}
              onToggle={() => setDiariasAbiertas((prev) => !prev)}
              mostrarToggle={esDocente}
            />
            <PlanillasGrupo
              titulo={`Planillas finales (${finales.length})`}
              items={finales}
              abierto={esAlumno ? true : finalesAbiertas}
              onToggle={() => setFinalesAbiertas((prev) => !prev)}
              mostrarToggle={esDocente}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function PlanillasGrupo({
  titulo,
  items,
  abierto,
  onToggle,
  mostrarToggle,
}: {
  titulo: string;
  items: CardData[];
  abierto: boolean;
  onToggle: () => void;
  mostrarToggle: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <View style={styles.group}>
      <TouchableOpacity style={styles.groupHeader} onPress={mostrarToggle ? onToggle : undefined} activeOpacity={0.8}>
        <Text style={styles.groupTitle}>{titulo}</Text>
        {mostrarToggle && (
          <Ionicons name={abierto ? "chevron-up-outline" : "chevron-down-outline"} size={18} color="#0F4A32" />
        )}
      </TouchableOpacity>
      {abierto &&
        items.map((item) => (
          <PlanillaCard
            key={item.id}
            item={item}
            onPress={() =>
              router.push({
                pathname: "/secciones/planilla-detalle",
                params: item.modoAlumno
                  ? { planillaId: item.id, modo: "alumno" }
                  : { planillaId: item.id },
              } as any)
            }
          />
        ))}
    </View>
  );
}

function PlanillaCard({ item, onPress }: { item: CardData; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardHeader}>
        <View style={styles.iconBg}>
          <Ionicons name="clipboard-outline" size={18} color="#0F4A32" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{item.titulo}</Text>
          {item.alumno ? <Text style={styles.cardMeta}>{item.alumno}</Text> : null}
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{item.tipo === "diaria" ? "Diaria" : "Final"}</Text>
        </View>
      </View>
      <Text style={styles.cardDate}>Actualizada: {formatFecha(item.fechaActualizacion)}</Text>
    </TouchableOpacity>
  );
}

function ordenarPorFecha<T extends { fechaActualizacion?: any }>(items: T[]) {
  return [...items].sort((a, b) => {
    const aTime = a.fechaActualizacion?.toMillis?.() ?? 0;
    const bTime = b.fechaActualizacion?.toMillis?.() ?? 0;
    return bTime - aTime;
  });
}

function formatFecha(fecha: any) {
  const date = fecha?.toDate?.();
  if (!date) return "-";
  return date.toLocaleDateString("es-AR");
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
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
  group: { marginTop: 8, marginBottom: 8 },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  groupTitle: { fontSize: 15, fontWeight: "700", color: "#11181C" },
  emptyContainer: { alignItems: "center", paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#374151" },
  emptyText: { fontSize: 14, color: "#9CA3AF", textAlign: "center", lineHeight: 22 },
  card: {
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
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBg: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#E8F5E9",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#11181C" },
  cardMeta: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  badge: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 11, color: "#0F4A32", fontWeight: "700" },
  cardDate: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
});
