// app/secciones/mis-notas.tsx
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import BuscadorAlumnos from "../../components/ui/BuscadorAlumnos";
import ExportarNotas from "../../components/ui/ExportarNotas";
import ModalAlerta from "../../components/ui/ModalAlerta";
import ModalConfirmacion from "../../components/ui/ModalConfirmacion";
import ScreenHeader from "../../components/ui/ScreenHeader";
import { auth, db } from "../../config/firebaseConfig";
import type { Nota } from "../../hooks/useNotas";
import {
  eliminarNotasPorExamen,
  esNotaAusente,
  formatearValorNota,
  obtenerNotaNumerica,
} from "../../hooks/useNotas";
import { useUserRole } from "../../hooks/useUserRole";

type NotaConNombre = Nota & { nombreAlumno?: string };

type GrupoExamen = {
  nombreExamen: string;
  notas: NotaConNombre[];
};

export default function MisNotasScreen() {
  const { moduloId, seccionId, subseccionPath } = useLocalSearchParams<{
    moduloId: string;
    seccionId: string;
    subseccionPath?: string;
  }>();
  const contextoSubseccion = subseccionPath ?? "";

  const { rol, loading: loadingRol } = useUserRole();
  const uid = auth.currentUser?.uid ?? null;

  const [grupos, setGrupos] = useState<GrupoExamen[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTexto, setFiltroTexto] = useState("");
  const [examenAEliminar, setExamenAEliminar] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [alerta, setAlerta] = useState<{
    visible: boolean;
    titulo: string;
    mensaje: string;
    tipo: "error" | "exito";
  }>({ visible: false, titulo: "", mensaje: "", tipo: "exito" });

  useEffect(() => {
    if (!seccionId || loadingRol || !uid) return;

    const esAlumno = rol !== "admin" && rol !== "profesor";

    const constraints = [where("seccionId", "==", seccionId)];
    if (esAlumno) {
      constraints.push(where("alumnoId", "==", uid));
    }
    constraints.push(where("subseccionPath", "==", contextoSubseccion));

    const q = query(collection(db, "notas"), ...constraints);
    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const notasRaw = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() } as Nota),
        );

        // Resolver nombres de alumnos para admin/profesor
        const notasConNombre: NotaConNombre[] = await Promise.all(
          notasRaw.map(async (nota) => {
            if (esAlumno) return nota;
            try {
              const snap = await getDoc(doc(db, "usuarios", nota.alumnoId));
              return {
                ...nota,
                nombreAlumno: snap.exists()
                  ? (snap.data().nombre as string)
                  : nota.alumnoId,
              };
            } catch {
              return { ...nota, nombreAlumno: nota.alumnoId };
            }
          }),
        );

        // Agrupar por nombreExamen
        const mapaGrupos = new Map<string, NotaConNombre[]>();
        notasConNombre.forEach((nota) => {
          const grupo = mapaGrupos.get(nota.nombreExamen) ?? [];
          grupo.push(nota);
          mapaGrupos.set(nota.nombreExamen, grupo);
        });

        const gruposOrdenados: GrupoExamen[] = Array.from(mapaGrupos.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([nombreExamen, notas]) => ({ nombreExamen, notas }));

        setGrupos(gruposOrdenados);
        setLoading(false);
      },
      () => setLoading(false),
    );

    return () => unsubscribe();
  }, [seccionId, uid, rol, loadingRol, contextoSubseccion]);

  const esAdmin = rol === "admin";
  const puedeEditar = rol === "admin";
  const esAlumno = rol !== "admin" && rol !== "profesor";

  const handleEliminarExamen = async () => {
    if (!examenAEliminar || !seccionId) return;
    setEliminando(true);
    try {
      await eliminarNotasPorExamen(seccionId, examenAEliminar, contextoSubseccion);
      setExamenAEliminar(null);
      setAlerta({
        visible: true,
        titulo: "Examen eliminado",
        mensaje: `Las notas de "${examenAEliminar}" fueron eliminadas.`,
        tipo: "exito",
      });
    } catch {
      setExamenAEliminar(null);
      setAlerta({
        visible: true,
        titulo: "Error",
        mensaje: "No se pudieron eliminar las notas. Intentá nuevamente.",
        tipo: "error",
      });
    } finally {
      setEliminando(false);
    }
  };

  if (loadingRol || loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo="Notas" mostrarHome />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#25B471" />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        titulo={esAlumno ? "Mis Notas" : "Notas de Alumnos"}
        onBack={() => router.back()}
        mostrarHome
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Buscador de alumnos (solo admin/profesor) */}
        {!esAlumno && (
          <BuscadorAlumnos
            valor={filtroTexto}
            onChangeText={setFiltroTexto}
            placeholder="Buscar alumno por nombre..."
          />
        )}

        {grupos.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="school-outline" size={52} color="#CBD5E0" />
            <Text style={styles.emptyTitulo}>Sin notas cargadas</Text>
            <Text style={styles.emptyTexto}>
              Todavía no hay notas cargadas para esta sección.
            </Text>
            <TouchableOpacity style={styles.volverBtn} onPress={() => router.back()}>
              <Text style={styles.volverBtnText}>Volver</Text>
            </TouchableOpacity>
          </View>
        ) : (
          grupos.map((grupo) => {
            const notasNumericas = grupo.notas
              .map((nota) => obtenerNotaNumerica(nota.nota))
              .filter((nota): nota is number => nota !== null);
            const promedio = notasNumericas.length > 0
              ? notasNumericas.reduce((acc, nota) => acc + nota, 0) / notasNumericas.length
              : null;

            return (
              <View key={grupo.nombreExamen} style={styles.grupoCard}>
                <View style={styles.grupoTituloRow}>
                  <Text style={styles.grupoTitulo}>{grupo.nombreExamen}</Text>
                  {puedeEditar && (
                    <View style={styles.headerActions}>
                      <TouchableOpacity
                        onPress={() =>
                          router.push({
                            pathname: "/secciones/notas",
                            params: {
                              moduloId,
                              seccionId,
                              subseccionPath,
                              modo: "editar",
                              nombreExamen: grupo.nombreExamen,
                            },
                          } as any)
                        }
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={styles.iconActionBtn}
                      >
                        <Ionicons name="pencil-outline" size={18} color="#0F4A32" />
                      </TouchableOpacity>
                      {esAdmin && (
                        <TouchableOpacity
                          onPress={() => setExamenAEliminar(grupo.nombreExamen)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          style={styles.iconActionBtn}
                        >
                          <Ionicons name="trash-outline" size={18} color="#DC2626" />
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>

                {esAlumno ? (
                  // Vista alumno: nota grande
                  <View style={styles.notaAlumnoContainer}>
                    <Text
                      style={[
                        styles.notaAlumnoValor,
                        esNotaAusente(grupo.notas[0]?.nota)
                          ? styles.notaAusente
                          : (obtenerNotaNumerica(grupo.notas[0]?.nota) ?? 0) >= 4
                            ? styles.notaAprobada
                            : styles.notaDesaprobada,
                      ]}
                    >
                      {grupo.notas[0] ? formatearValorNota(grupo.notas[0].nota) : "—"}
                    </Text>
                    <Text style={styles.notaAlumnoLabel}>
                      {grupo.notas[0]?.nota !== undefined
                        ? esNotaAusente(grupo.notas[0].nota)
                          ? "Ausente"
                          : (obtenerNotaNumerica(grupo.notas[0].nota) ?? 0) >= 4
                          ? "Aprobado"
                          : "Desaprobado"
                        : ""}
                    </Text>
                  </View>
                ) : (
                  // Vista admin/profesor: tabla con promedio
                  <>
                    <View style={styles.tablaHeader}>
                      <Text style={styles.tablaHeaderTexto}>Alumno</Text>
                      <Text style={styles.tablaHeaderTexto}>Nota</Text>
                    </View>
                    {grupo.notas
                      .sort((a, b) =>
                        (a.nombreAlumno ?? "").localeCompare(
                          b.nombreAlumno ?? "",
                        ),
                      )
                      .filter((nota) => {
                        if (!filtroTexto.trim()) return true;
                        const nombre = (nota.nombreAlumno ?? nota.alumnoId).toLowerCase();
                        return nombre.includes(filtroTexto.toLowerCase().trim());
                      })
                      .map((nota) => (
                        <View key={nota.id} style={styles.tablaFila}>
                          <Text style={styles.tablaAlumno} numberOfLines={1}>
                            {nota.nombreAlumno ?? nota.alumnoId}
                          </Text>
                          <Text
                            style={[
                              styles.tablaNota,
                              esNotaAusente(nota.nota)
                                ? styles.notaAusente
                                : (obtenerNotaNumerica(nota.nota) ?? 0) >= 4
                                  ? styles.notaAprobada
                                  : styles.notaDesaprobada,
                            ]}
                          >
                            {formatearValorNota(nota.nota)}
                          </Text>
                        </View>
                      ))}
                    <View style={styles.promedioRow}>
                      <Text style={styles.promedioLabel}>
                        PROMEDIO DE LA CLASE
                      </Text>
                      <Text style={styles.promedioValor}>
                        {promedio !== null ? promedio.toFixed(1) : "-"}
                      </Text>
                    </View>
                    <ExportarNotas
                      nombreExamen={grupo.nombreExamen}
                      notas={grupo.notas
                        .filter((nota) => {
                          if (!filtroTexto.trim()) return true;
                          const nombre = (nota.nombreAlumno ?? nota.alumnoId).toLowerCase();
                          return nombre.includes(filtroTexto.toLowerCase().trim());
                        })
                        .sort((a, b) =>
                          (a.nombreAlumno ?? "").localeCompare(
                            b.nombreAlumno ?? "",
                          ),
                        )
                        .map((nota) => ({
                          nombre: nota.nombreAlumno ?? nota.alumnoId,
                          nota: nota.nota,
                        }))
                      }
                    />
                  </>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <ModalConfirmacion
        visible={examenAEliminar !== null}
        titulo="Eliminar examen"
        mensaje={`¿Estás seguro de que querés eliminar todas las notas de "${examenAEliminar ?? ""}"? Esta acción es permanente.`}
        textoConfirmar={eliminando ? "Eliminando..." : "Sí, eliminar"}
        textoCancelar="Cancelar"
        onConfirm={handleEliminarExamen}
        onCancel={() => setExamenAEliminar(null)}
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
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 12,
  },
  emptyTitulo: { fontSize: 17, fontWeight: "700", color: "#374151" },
  emptyTexto: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 22,
  },
  volverBtn: {
    marginTop: 16,
    backgroundColor: "#0F4A32",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  volverBtnText: { color: "#FFFFFF", fontWeight: "700" },
  grupoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  grupoTituloRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconActionBtn: {
    padding: 4,
    borderRadius: 8,
  },
  grupoTitulo: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F4A32",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  // Vista alumno
  notaAlumnoContainer: {
    alignItems: "center",
    paddingVertical: 12,
  },
  notaAlumnoValor: {
    fontSize: 56,
    fontWeight: "800",
    lineHeight: 64,
  },
  notaAlumnoLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 4,
  },
  notaAprobada: { color: "#25B471" },
  notaDesaprobada: { color: "#DC2626" },
  notaAusente: { color: "#6B7280" },
  // Vista admin/profesor
  tablaHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
    marginBottom: 4,
  },
  tablaHeaderTexto: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  tablaFila: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F9FAFB",
  },
  tablaAlumno: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
  },
  tablaNota: {
    fontSize: 15,
    fontWeight: "700",
    minWidth: 30,
    textAlign: "right",
  },
  promedioRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  promedioLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
  },
  promedioValor: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F4A32",
  },
});
