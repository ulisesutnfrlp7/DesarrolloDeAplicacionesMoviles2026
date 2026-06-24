import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import ModalAlerta from "../../components/ui/ModalAlerta";
import ModalConfirmacion from "../../components/ui/ModalConfirmacion";
import ExportarPlanilla from "../../components/ui/ExportarPlanilla";
import ScreenHeader from "../../components/ui/ScreenHeader";
import { auth } from "../../config/firebaseConfig";
import {
  actualizarColumnasPlanilla,
  actualizarDatosPlanilla,
  actualizarFilaPlanilla,
  crearFilaPlanilla,
  eliminarPlanilla,
  eliminarFilaPlanilla,
  obtenerFilasPlanilla,
  obtenerPlanillaPorId,
  obtenerVistaAlumnoPlanilla,
  type ColumnaPlanilla,
  type FilaPlanilla,
  type PlanillaTP,
  type TipoColumnaPlanilla,
  type VistaAlumnoPlanilla,
} from "../../hooks/usePlanillas";
import { useUserRole } from "../../hooks/useUserRole";

const TIPOS_COLUMNA: TipoColumnaPlanilla[] = ["texto", "numero", "fecha", "nota", "textarea", "boolean"];

export default function PlanillaDetalleScreen() {
  const { planillaId, modo } = useLocalSearchParams<{
    planillaId?: string;
    modo?: string;
  }>();
  const { rol, loading: loadingRol } = useUserRole();
  const uid = auth.currentUser?.uid ?? null;
  const esDocente = rol === "admin" || rol === "profesor";
  const esAdmin = rol === "admin";
  const modoAlumno = modo === "alumno" || !esDocente;

  const [planilla, setPlanilla] = useState<PlanillaTP | null>(null);
  const [vistaAlumno, setVistaAlumno] = useState<VistaAlumnoPlanilla | null>(null);
  const [filas, setFilas] = useState<FilaPlanilla[]>([]);
  const [rowDrafts, setRowDrafts] = useState<Record<string, Record<string, any>>>({});
  const [columnDrafts, setColumnDrafts] = useState<ColumnaPlanilla[]>([]);
  const [nuevaColumnaTitulo, setNuevaColumnaTitulo] = useState("");
  const [nuevaColumnaTipo, setNuevaColumnaTipo] = useState<TipoColumnaPlanilla>("texto");
  const [nuevaColumnaVisible, setNuevaColumnaVisible] = useState(true);
  const [tituloDraft, setTituloDraft] = useState("");
  const [modalEliminarPlanilla, setModalEliminarPlanilla] = useState(false);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [alerta, setAlerta] = useState<{
    visible: boolean;
    titulo: string;
    mensaje: string;
    tipo: "error" | "exito";
  }>({ visible: false, titulo: "", mensaje: "", tipo: "exito" });

  const columnas = useMemo(() => {
    const cols = modoAlumno
      ? (vistaAlumno?.columnasVisibles ?? [])
      : (planilla?.columnas ?? []);
    return [...cols].sort((a, b) => a.orden - b.orden);
  }, [modoAlumno, planilla?.columnas, vistaAlumno?.columnasVisibles]);

  const filasAlumno = useMemo(
    () => [...(vistaAlumno?.filasVisibles ?? [])].sort((a, b) => a.orden - b.orden),
    [vistaAlumno?.filasVisibles],
  );

  const cargar = useCallback(async () => {
    if (!planillaId || loadingRol || !uid) return;
    setLoading(true);
    try {
      if (modoAlumno) {
        const vista = await obtenerVistaAlumnoPlanilla(planillaId, uid);
        setVistaAlumno(vista);
        setPlanilla(null);
        setFilas([]);
        setRowDrafts({});
        setColumnDrafts([]);
      } else {
        const [planillaData, filasData] = await Promise.all([
          obtenerPlanillaPorId(planillaId),
          obtenerFilasPlanilla(planillaId),
        ]);
        setPlanilla(planillaData);
        setTituloDraft(planillaData?.titulo ?? "");
        setVistaAlumno(null);
        setFilas(filasData);
        setColumnDrafts(planillaData?.columnas ?? []);
        const drafts: Record<string, Record<string, any>> = {};
        filasData.forEach((fila) => {
          drafts[fila.id] = { ...(fila.celdas ?? {}) };
        });
        setRowDrafts(drafts);
      }
    } catch (error) {
      console.error("planilla detalle error:", error);
      setAlerta({
        visible: true,
        titulo: "Error",
        mensaje: "No se pudo cargar la planilla.",
        tipo: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [loadingRol, modoAlumno, planillaId, uid]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const titulo = modoAlumno ? vistaAlumno?.titulo : planilla?.titulo;
  const tipo = modoAlumno ? vistaAlumno?.tipo : planilla?.tipo;
  const alumnoNombre = planilla?.alumnoNombre ?? "";

  useEffect(() => {
    if (planilla?.titulo) setTituloDraft(planilla.titulo);
  }, [planilla?.titulo]);

  const actualizarCelda = (filaId: string, columnaId: string, valor: string) => {
    setRowDrafts((prev) => ({
      ...prev,
      [filaId]: {
        ...(prev[filaId] ?? {}),
        [columnaId]: valor,
      },
    }));
  };

  const agregarFila = async () => {
    const orden = filas.length === 0 ? 0 : Math.max(...filas.map((fila) => fila.orden)) + 1;
    const id = `local_${Date.now()}`;
    const celdas = Object.fromEntries(columnas.map((columna) => [columna.id, ""]));
    const nuevaFila = { id, orden, celdas } as FilaPlanilla;
    setFilas((prev) => [...prev, nuevaFila]);
    setRowDrafts((prev) => ({ ...prev, [id]: celdas }));
  };

  const guardarFilas = async () => {
    if (!planillaId) return;
    setGuardando(true);
    try {
      for (const fila of filas) {
        const data = {
          orden: fila.orden,
          celdas: rowDrafts[fila.id] ?? {},
        };
        if (fila.id.startsWith("local_")) {
          await crearFilaPlanilla(planillaId, data);
        } else {
          await actualizarFilaPlanilla(planillaId, fila.id, data);
        }
      }
      await cargar();
      setAlerta({ visible: true, titulo: "Filas guardadas", mensaje: "Los cambios se guardaron correctamente.", tipo: "exito" });
    } catch {
      setAlerta({ visible: true, titulo: "Error", mensaje: "No se pudieron guardar las filas.", tipo: "error" });
    } finally {
      setGuardando(false);
    }
  };

  const eliminarFila = async (filaId: string) => {
    if (!planillaId) return;
    if (filaId.startsWith("local_")) {
      setFilas((prev) => prev.filter((fila) => fila.id !== filaId));
      setRowDrafts((prev) => {
        const next = { ...prev };
        delete next[filaId];
        return next;
      });
      return;
    }
    setGuardando(true);
    try {
      await eliminarFilaPlanilla(planillaId, filaId);
      await cargar();
    } catch {
      setAlerta({ visible: true, titulo: "Error", mensaje: "No se pudo eliminar la fila.", tipo: "error" });
    } finally {
      setGuardando(false);
    }
  };

  const guardarColumnas = async (columnasActualizadas = columnDrafts) => {
    if (!planillaId) return;
    setGuardando(true);
    try {
      await actualizarColumnasPlanilla(planillaId, normalizarColumnas(columnasActualizadas));
      await cargar();
      setAlerta({ visible: true, titulo: "Columnas actualizadas", mensaje: "Los cambios se guardaron.", tipo: "exito" });
    } catch {
      setAlerta({ visible: true, titulo: "Error", mensaje: "No se pudieron guardar las columnas.", tipo: "error" });
    } finally {
      setGuardando(false);
    }
  };

  const agregarColumna = async () => {
    if (!nuevaColumnaTitulo.trim()) {
      setAlerta({ visible: true, titulo: "Titulo requerido", mensaje: "Ingresá un titulo para la columna.", tipo: "error" });
      return;
    }
    const nueva: ColumnaPlanilla = {
      id: crearIdColumna(nuevaColumnaTitulo, columnDrafts),
      titulo: nuevaColumnaTitulo.trim(),
      tipo: nuevaColumnaTipo,
      orden: columnDrafts.length,
      visibleAlumno: nuevaColumnaTitulo.trim().toLowerCase() === "observaciones" ? false : nuevaColumnaVisible,
    };
    setNuevaColumnaTitulo("");
    setNuevaColumnaTipo("texto");
    setNuevaColumnaVisible(true);
    await guardarColumnas([...columnDrafts, nueva]);
  };

  const editarColumna = (index: number, data: Partial<ColumnaPlanilla>) => {
    setColumnDrafts((prev) =>
      normalizarColumnas(
        prev.map((col, i) => (i === index ? { ...col, ...data } : col)),
      ),
    );
  };

  const eliminarColumna = async (id: string) => {
    await guardarColumnas(columnDrafts.filter((col) => col.id !== id));
  };

  const guardarTitulo = async () => {
    if (!planillaId || !tituloDraft.trim()) {
      setAlerta({ visible: true, titulo: "Titulo requerido", mensaje: "Ingresá un titulo para la planilla.", tipo: "error" });
      return;
    }
    setGuardando(true);
    try {
      await actualizarDatosPlanilla(planillaId, { titulo: tituloDraft.trim() });
      await cargar();
      setAlerta({ visible: true, titulo: "Titulo actualizado", mensaje: "El nombre de la planilla se guardó correctamente.", tipo: "exito" });
    } catch {
      setAlerta({ visible: true, titulo: "Error", mensaje: "No se pudo guardar el titulo.", tipo: "error" });
    } finally {
      setGuardando(false);
    }
  };

  const confirmarEliminarPlanilla = async () => {
    if (!planillaId) return;
    setGuardando(true);
    try {
      await eliminarPlanilla(planillaId);
      setModalEliminarPlanilla(false);
      router.back();
    } catch {
      setAlerta({ visible: true, titulo: "Error", mensaje: "No se pudo eliminar la planilla.", tipo: "error" });
    } finally {
      setGuardando(false);
    }
  };

  if (loadingRol || loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo="Planilla" mostrarHome />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#25B471" />
        </View>
      </View>
    );
  }

  if (modoAlumno && !vistaAlumno) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo="Mi planilla" onBack={() => router.back()} mostrarHome />
        <View style={styles.centered}>
          <Ionicons name="clipboard-outline" size={48} color="#CBD5E0" />
          <Text style={styles.emptyTitle}>Sin informacion</Text>
          <Text style={styles.emptyText}>Esta planilla todavia no tiene informacion cargada.</Text>
        </View>
      </View>
    );
  }

  if (!modoAlumno && !planilla) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo="Planilla" onBack={() => router.back()} mostrarHome />
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Planilla no encontrada.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader titulo={modoAlumno ? "Mi planilla" : "Editar planilla"} onBack={() => router.back()} mostrarHome />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <View style={styles.headerIcon}>
            <Ionicons name="clipboard-outline" size={22} color="#0F4A32" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{titulo}</Text>
            <Text style={styles.meta}>
              {tipo === "diaria" ? "Planilla diaria" : "Planilla final"}
              {alumnoNombre ? ` · ${alumnoNombre}` : ""}
            </Text>
          </View>
        </View>

        {!modoAlumno && (
          <View style={styles.detailsCard}>
            <Text style={styles.sectionTitle}>Datos de la planilla</Text>
            <TextInput
              style={styles.columnInput}
              value={tituloDraft}
              onChangeText={setTituloDraft}
              placeholder="Titulo de la planilla"
              placeholderTextColor="#9CA3AF"
            />
            <View style={styles.titleActions}>
              <TouchableOpacity style={styles.secondaryBtnInline} onPress={guardarTitulo} disabled={guardando}>
                <Ionicons name="save-outline" size={18} color="#0F4A32" />
                <Text style={styles.secondaryBtnInlineText}>Guardar título</Text>
              </TouchableOpacity>
              {esAdmin && (
                <TouchableOpacity style={styles.dangerBtnInline} onPress={() => setModalEliminarPlanilla(true)} disabled={guardando}>
                  <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.dangerBtnText}>Eliminar planilla</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {!modoAlumno && planilla && (
          <ExportarPlanilla
            titulo={planilla.titulo}
            alumno={planilla.alumnoNombre ?? planilla.alumnoId}
            tipo={planilla.tipo}
            columnas={columnas}
            filas={filas.map((fila) => ({
              id: fila.id,
              orden: fila.orden,
              celdas: rowDrafts[fila.id] ?? fila.celdas ?? {},
            }))}
          />
        )}

        <View style={styles.tableCard}>
          <Text style={styles.sectionTitle}>Datos</Text>
          {columnas.length === 0 ? (
            <Text style={styles.emptyText}>No hay columnas configuradas.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                <View style={styles.tableRow}>
                  {columnas.map((columna) => (
                    <Text key={columna.id} style={[styles.tableHeaderCell, cellStyleFor(columna)]}>
                      {columna.titulo}
                    </Text>
                  ))}
                  {!modoAlumno && <Text style={styles.actionCell}>Eliminar</Text>}
                </View>

                {modoAlumno ? (
                  filasAlumno.length === 0 ? (
                    <Text style={styles.tableEmpty}>Esta planilla todavia no tiene informacion cargada.</Text>
                  ) : (
                    filasAlumno.map((fila) => (
                      <View key={fila.id} style={styles.tableRow}>
                        {columnas.map((columna) => (
                          <Text key={columna.id} style={[styles.tableCell, cellStyleFor(columna)]}>
                            {formatCelda(fila.celdas?.[columna.id])}
                          </Text>
                        ))}
                      </View>
                    ))
                  )
                ) : filas.length === 0 ? (
                  <Text style={styles.tableEmpty}>Todavia no hay filas. Agregá la primera fila.</Text>
                ) : (
                  filas.map((fila) => (
                    <View key={fila.id} style={styles.tableRow}>
                      {columnas.map((columna) => (
                        <TextInput
                          key={columna.id}
                          style={[styles.tableInput, cellStyleFor(columna)]}
                          value={String(rowDrafts[fila.id]?.[columna.id] ?? "")}
                          onChangeText={(value) => actualizarCelda(fila.id, columna.id, value)}
                          keyboardType={columna.tipo === "numero" || columna.tipo === "nota" ? "numeric" : "default"}
                          multiline={columna.tipo === "textarea"}
                        />
                      ))}
                      <View style={styles.rowActions}>
                        <TouchableOpacity style={styles.iconBtnDanger} onPress={() => eliminarFila(fila.id)} disabled={guardando}>
                          <Ionicons name="trash-outline" size={18} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          )}
        </View>

        {!modoAlumno && (
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.primaryBtn} onPress={agregarFila} disabled={guardando}>
              <Ionicons name="add-outline" size={18} color="#FFFFFF" />
              <Text style={styles.primaryBtnText}>Agregar fila</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtnInline} onPress={guardarFilas} disabled={guardando}>
              <Ionicons name="save-outline" size={18} color="#0F4A32" />
              <Text style={styles.secondaryBtnInlineText}>Guardar filas</Text>
            </TouchableOpacity>
          </View>
        )}

        {!modoAlumno && (
          <View style={styles.columnsCard}>
            <Text style={styles.sectionTitle}>Editar columnas</Text>
            {columnDrafts.map((columna, index) => (
              <View key={columna.id} style={styles.columnEditor}>
                <TextInput
                  style={styles.columnInput}
                  value={columna.titulo}
                  onChangeText={(value) => editarColumna(index, { titulo: value })}
                  placeholder="Titulo"
                  placeholderTextColor="#9CA3AF"
                />
                <View style={styles.typeRow}>
                  {TIPOS_COLUMNA.map((tipoColumna) => {
                    const activo = columna.tipo === tipoColumna;
                    return (
                      <TouchableOpacity
                        key={tipoColumna}
                        style={[styles.typeChip, activo && styles.typeChipActive]}
                        onPress={() => editarColumna(index, { tipo: tipoColumna })}
                      >
                        <Text style={[styles.typeChipText, activo && styles.typeChipTextActive]}>{labelTipoColumna(tipoColumna)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Visible para alumno</Text>
                  <Switch
                    value={columna.visibleAlumno}
                    onValueChange={(value) => editarColumna(index, { visibleAlumno: value })}
                    disabled={columna.titulo.trim().toLowerCase() === "observaciones"}
                    trackColor={{ false: "#E5E7EB", true: "#25B471" }}
                    thumbColor="#FFFFFF"
                  />
                </View>
                <TouchableOpacity style={styles.deleteColumnBtn} onPress={() => eliminarColumna(columna.id)}>
                  <Ionicons name="trash-outline" size={16} color="#DC2626" />
                  <Text style={styles.deleteColumnText}>Eliminar columna</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => guardarColumnas()} disabled={guardando}>
              <Text style={styles.secondaryBtnText}>Guardar columnas</Text>
            </TouchableOpacity>

            <View style={styles.newColumnBox}>
              <Text style={styles.sectionTitle}>Agregar columna</Text>
              <TextInput
                style={styles.columnInput}
                value={nuevaColumnaTitulo}
                onChangeText={setNuevaColumnaTitulo}
                placeholder="Titulo de columna"
                placeholderTextColor="#9CA3AF"
              />
              <View style={styles.typeRow}>
                {TIPOS_COLUMNA.map((tipoColumna) => {
                  const activo = nuevaColumnaTipo === tipoColumna;
                  return (
                    <TouchableOpacity
                      key={tipoColumna}
                      style={[styles.typeChip, activo && styles.typeChipActive]}
                      onPress={() => setNuevaColumnaTipo(tipoColumna)}
                    >
                      <Text style={[styles.typeChipText, activo && styles.typeChipTextActive]}>{labelTipoColumna(tipoColumna)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Visible para alumno</Text>
                <Switch
                  value={nuevaColumnaVisible}
                  onValueChange={setNuevaColumnaVisible}
                  trackColor={{ false: "#E5E7EB", true: "#25B471" }}
                  thumbColor="#FFFFFF"
                />
              </View>
              <TouchableOpacity style={styles.primaryBtnFull} onPress={agregarColumna} disabled={guardando}>
                <Ionicons name="add-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Agregar columna</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      <ModalAlerta
        visible={alerta.visible}
        titulo={alerta.titulo}
        mensaje={alerta.mensaje}
        tipo={alerta.tipo}
        onClose={() => setAlerta((prev) => ({ ...prev, visible: false }))}
      />
      <ModalConfirmacion
        visible={modalEliminarPlanilla}
        titulo="Eliminar planilla"
        mensaje="¿Estás seguro de eliminar esta planilla? Se borrarán sus filas y la vista del alumno. Esta acción es permanente."
        textoConfirmar={guardando ? "Eliminando..." : "Sí, eliminar"}
        textoCancelar="Cancelar"
        onConfirm={confirmarEliminarPlanilla}
        onCancel={() => setModalEliminarPlanilla(false)}
      />
    </View>
  );
}

function normalizarColumnas(columnas: ColumnaPlanilla[]) {
  return columnas.map((columna, index) => ({
    ...columna,
    orden: index,
    visibleAlumno:
      columna.titulo.trim().toLowerCase() === "observaciones" ? false : columna.visibleAlumno,
  }));
}

function crearIdColumna(titulo: string, columnas: ColumnaPlanilla[]) {
  const base = titulo
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "columna";
  const ids = new Set(columnas.map((col) => col.id));
  let id = base;
  let counter = 2;
  while (ids.has(id)) {
    id = `${base}_${counter}`;
    counter += 1;
  }
  return id;
}

function cellStyleFor(columna: ColumnaPlanilla) {
  if (columna.tipo === "textarea") return { width: 190 };
  if (columna.tipo === "nota" || columna.tipo === "numero") return { width: 90 };
  return { width: 140 };
}

function formatCelda(value: any) {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "boolean") return value ? "Si" : "No";
  return String(value);
}

function labelTipoColumna(tipo: TipoColumnaPlanilla) {
  if (tipo === "textarea") return "área de texto";
  return tipo;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  headerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderLeftWidth: 3,
    borderLeftColor: "#25B471",
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: "#E8F5E9",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 17, fontWeight: "700", color: "#11181C" },
  meta: { fontSize: 12, color: "#6B7280", marginTop: 3 },
  actionsRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#25B471",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryBtnFull: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#25B471",
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 12,
  },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  secondaryBtn: {
    backgroundColor: "#E8F5E9",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 10,
  },
  secondaryBtnText: { color: "#0F4A32", fontWeight: "700" },
  secondaryBtnInline: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#E8F5E9",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryBtnInlineText: { color: "#0F4A32", fontWeight: "700", fontSize: 14 },
  dangerBtnInline: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#DC2626",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dangerBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  tableCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  detailsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  titleActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#11181C", marginBottom: 10 },
  tableRow: { flexDirection: "row", alignItems: "stretch" },
  tableHeaderCell: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    color: "#0F4A32",
    fontSize: 12,
    fontWeight: "700",
    padding: 8,
    minHeight: 38,
  },
  tableCell: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    color: "#374151",
    fontSize: 13,
    padding: 8,
    minHeight: 40,
  },
  tableInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    color: "#11181C",
    fontSize: 13,
    padding: 8,
    minHeight: 40,
    backgroundColor: "#FFFFFF",
  },
  actionCell: {
    width: 92,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    color: "#0F4A32",
    fontSize: 12,
    fontWeight: "700",
    padding: 8,
  },
  rowActions: {
    width: 92,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  iconBtn: { padding: 7, borderRadius: 8, backgroundColor: "#E8F5E9" },
  iconBtnDanger: { padding: 7, borderRadius: 8, backgroundColor: "#FEF2F2" },
  tableEmpty: { padding: 16, color: "#9CA3AF", fontStyle: "italic" },
  columnsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  columnEditor: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    backgroundColor: "#F9FAFB",
  },
  columnInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    color: "#11181C",
  },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 9 },
  typeChip: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  typeChipActive: { backgroundColor: "#0F4A32", borderColor: "#0F4A32" },
  typeChipText: { fontSize: 11, color: "#374151", fontWeight: "700" },
  typeChipTextActive: { color: "#FFFFFF" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  switchLabel: { color: "#374151", fontWeight: "600", fontSize: 13 },
  deleteColumnBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    alignSelf: "flex-start",
  },
  deleteColumnText: { color: "#DC2626", fontWeight: "700", fontSize: 13 },
  newColumnBox: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 14,
  },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#374151", marginTop: 12 },
  emptyText: { fontSize: 14, color: "#9CA3AF", textAlign: "center", marginTop: 8 },
});
