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
import ExportarPlanilla from "../../components/ui/ExportarPlanilla";
import ModalAlerta from "../../components/ui/ModalAlerta";
import ModalConfirmacion from "../../components/ui/ModalConfirmacion";
import ScreenHeader from "../../components/ui/ScreenHeader";
import {
  actualizarPlanillaBase,
  eliminarPlanillaBase,
  obtenerPlanillaBasePorId,
  type ColumnaPlanilla,
  type FilaBasePlanilla,
  type PlanillaBaseTP,
  type TipoColumnaPlanilla,
  type TipoPlanilla,
} from "../../hooks/usePlanillas";
import { useUserRole } from "../../hooks/useUserRole";

const TIPOS_COLUMNA: TipoColumnaPlanilla[] = ["texto", "numero", "fecha", "nota", "textarea", "boolean"];

export default function PlanillaBaseDetalleScreen() {
  const { planillaBaseId } = useLocalSearchParams<{ planillaBaseId?: string }>();
  const { rol, loading: loadingRol } = useUserRole();
  const esAdmin = rol === "admin";

  const [base, setBase] = useState<PlanillaBaseTP | null>(null);
  const [nombreDraft, setNombreDraft] = useState("");
  const [tipoDraft, setTipoDraft] = useState<TipoPlanilla>("diaria");
  const [columnDrafts, setColumnDrafts] = useState<ColumnaPlanilla[]>([]);
  const [filas, setFilas] = useState<FilaBasePlanilla[]>([]);
  const [rowDrafts, setRowDrafts] = useState<Record<string, Record<string, any>>>({});
  const [nuevaColumnaTitulo, setNuevaColumnaTitulo] = useState("");
  const [nuevaColumnaTipo, setNuevaColumnaTipo] = useState<TipoColumnaPlanilla>("texto");
  const [nuevaColumnaVisible, setNuevaColumnaVisible] = useState(true);
  const [modalEliminar, setModalEliminar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [alerta, setAlerta] = useState<{
    visible: boolean;
    titulo: string;
    mensaje: string;
    tipo: "error" | "exito";
  }>({ visible: false, titulo: "", mensaje: "", tipo: "exito" });

  const soloLectura = !esAdmin;
  const columnas = useMemo(() => [...columnDrafts].sort((a, b) => a.orden - b.orden), [columnDrafts]);

  const cargar = useCallback(async () => {
    if (!planillaBaseId || loadingRol || !esAdmin) return;
    setLoading(true);
    try {
      const data = await obtenerPlanillaBasePorId(planillaBaseId);
      setBase(data);
      setNombreDraft(data?.nombre ?? "");
      setTipoDraft(data?.tipo ?? "diaria");
      setColumnDrafts(data?.columnas ?? []);
      setFilas(data?.filasBase ?? []);
      const drafts: Record<string, Record<string, any>> = {};
      (data?.filasBase ?? []).forEach((fila) => {
        drafts[fila.id] = { ...(fila.celdas ?? {}) };
      });
      setRowDrafts(drafts);
    } catch {
      setAlerta({ visible: true, titulo: "Error", mensaje: "No se pudo cargar la planilla base.", tipo: "error" });
    } finally {
      setLoading(false);
    }
  }, [esAdmin, loadingRol, planillaBaseId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardarDatos = async () => {
    if (!planillaBaseId || !nombreDraft.trim() || soloLectura) {
      setAlerta({ visible: true, titulo: "Nombre requerido", mensaje: "Ingresá un nombre para la planilla base.", tipo: "error" });
      return;
    }
    setGuardando(true);
    try {
      await actualizarPlanillaBase(planillaBaseId, { nombre: nombreDraft.trim(), tipo: tipoDraft });
      await cargar();
      setAlerta({ visible: true, titulo: "Datos actualizados", mensaje: "La planilla base se guardó correctamente.", tipo: "exito" });
    } catch {
      setAlerta({ visible: true, titulo: "Error", mensaje: "No se pudieron guardar los datos.", tipo: "error" });
    } finally {
      setGuardando(false);
    }
  };

  const actualizarCelda = (filaId: string, columnaId: string, valor: string) => {
    setRowDrafts((prev) => ({
      ...prev,
      [filaId]: { ...(prev[filaId] ?? {}), [columnaId]: valor },
    }));
  };

  const agregarFila = () => {
    const orden = filas.length === 0 ? 0 : Math.max(...filas.map((fila) => fila.orden)) + 1;
    const id = `base_${Date.now()}`;
    const celdas = Object.fromEntries(columnas.map((columna) => [columna.id, ""]));
    setFilas((prev) => [...prev, { id, orden, celdas }]);
    setRowDrafts((prev) => ({ ...prev, [id]: celdas }));
  };

  const guardarFilas = async () => {
    if (!planillaBaseId || soloLectura) return;
    setGuardando(true);
    try {
      const filasBase = filas.map((fila) => ({
        id: fila.id,
        orden: fila.orden,
        celdas: rowDrafts[fila.id] ?? fila.celdas ?? {},
      }));
      await actualizarPlanillaBase(planillaBaseId, { filasBase });
      await cargar();
      setAlerta({ visible: true, titulo: "Filas guardadas", mensaje: "Los cambios se guardaron correctamente.", tipo: "exito" });
    } catch {
      setAlerta({ visible: true, titulo: "Error", mensaje: "No se pudieron guardar las filas.", tipo: "error" });
    } finally {
      setGuardando(false);
    }
  };

  const eliminarFila = (filaId: string) => {
    setFilas((prev) => prev.filter((fila) => fila.id !== filaId).map((fila, index) => ({ ...fila, orden: index })));
    setRowDrafts((prev) => {
      const next = { ...prev };
      delete next[filaId];
      return next;
    });
  };

  const guardarColumnas = async (columnasActualizadas = columnDrafts) => {
    if (!planillaBaseId || soloLectura) return;
    setGuardando(true);
    try {
      await actualizarPlanillaBase(planillaBaseId, { columnas: normalizarColumnas(columnasActualizadas) });
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
      setAlerta({ visible: true, titulo: "Título requerido", mensaje: "Ingresá un título para la columna.", tipo: "error" });
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
    setColumnDrafts((prev) => normalizarColumnas(prev.map((col, i) => (i === index ? { ...col, ...data } : col))));
  };

  const eliminarColumna = async (id: string) => {
    await guardarColumnas(columnDrafts.filter((col) => col.id !== id));
  };

  const confirmarEliminar = async () => {
    if (!planillaBaseId) return;
    setGuardando(true);
    try {
      await eliminarPlanillaBase(planillaBaseId);
      setModalEliminar(false);
      router.back();
    } catch {
      setAlerta({ visible: true, titulo: "Error", mensaje: "No se pudo eliminar la planilla base.", tipo: "error" });
    } finally {
      setGuardando(false);
    }
  };

  if (loadingRol || loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo="Planilla base" mostrarHome />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#25B471" />
        </View>
      </View>
    );
  }

  if (!esAdmin) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo="Planilla base" onBack={() => router.back()} mostrarHome />
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={48} color="#CBD5E0" />
          <Text style={styles.emptyText}>No tenés permiso para gestionar planillas base.</Text>
        </View>
      </View>
    );
  }

  if (!base) {
    return (
      <View style={{ flex: 1, backgroundColor: "#F5F5F5" }}>
        <ScreenHeader titulo="Planilla base" onBack={() => router.back()} mostrarHome />
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Planilla base no encontrada.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader titulo="Editar planilla base" onBack={() => router.back()} mostrarHome />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <View style={styles.headerIcon}>
            <Ionicons name="clipboard-outline" size={22} color="#0F4A32" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{base.nombre}</Text>
            <Text style={styles.meta}>
              Planilla base · {base.tipo === "diaria" ? "Diaria" : "Final"}
            </Text>
          </View>
        </View>

        <View style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>Datos de la planilla base</Text>
          <TextInput
            style={styles.columnInput}
            value={nombreDraft}
            onChangeText={setNombreDraft}
            editable={!soloLectura}
            placeholder="Nombre de la planilla base"
            placeholderTextColor="#9CA3AF"
          />
          <View style={styles.typeRow}>
            {(["diaria", "resumen"] as TipoPlanilla[]).map((tipoOption) => {
              const activo = tipoDraft === tipoOption;
              return (
                <TouchableOpacity
                  key={tipoOption}
                  style={[styles.typeChip, activo && styles.typeChipActive]}
                  onPress={() => !soloLectura && setTipoDraft(tipoOption)}
                  disabled={soloLectura}
                >
                  <Text style={[styles.typeChipText, activo && styles.typeChipTextActive]}>
                    {tipoOption === "diaria" ? "Diaria" : "Final"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {!soloLectura && (
            <View style={styles.titleActions}>
              <TouchableOpacity style={styles.secondaryBtnInline} onPress={guardarDatos} disabled={guardando}>
                <Ionicons name="save-outline" size={18} color="#0F4A32" />
                <Text style={styles.secondaryBtnInlineText}>Guardar datos</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dangerBtnInline} onPress={() => setModalEliminar(true)} disabled={guardando}>
                <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                <Text style={styles.dangerBtnText}>Eliminar base</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <ExportarPlanilla
          titulo={base.nombre}
          tipo={base.tipo}
          columnas={columnas}
          filas={filas.map((fila) => ({
            id: fila.id,
            orden: fila.orden,
            celdas: rowDrafts[fila.id] ?? fila.celdas ?? {},
          }))}
        />

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
                  {!soloLectura && <Text style={styles.actionCell}>Eliminar</Text>}
                </View>
                {filas.length === 0 ? (
                  <Text style={styles.tableEmpty}>Todavía no hay filas.</Text>
                ) : (
                  filas.map((fila) => (
                    <View key={fila.id} style={styles.tableRow}>
                      {columnas.map((columna) => (
                        <TextInput
                          key={columna.id}
                          style={[styles.tableInput, cellStyleFor(columna)]}
                          value={String(rowDrafts[fila.id]?.[columna.id] ?? "")}
                          onChangeText={(value) => actualizarCelda(fila.id, columna.id, value)}
                          editable={!soloLectura}
                          keyboardType={columna.tipo === "numero" || columna.tipo === "nota" ? "numeric" : "default"}
                          multiline={columna.tipo === "textarea"}
                        />
                      ))}
                      {!soloLectura && (
                        <View style={styles.rowActions}>
                          <TouchableOpacity style={styles.iconBtnDanger} onPress={() => eliminarFila(fila.id)} disabled={guardando}>
                            <Ionicons name="trash-outline" size={18} color="#DC2626" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          )}
        </View>

        {!soloLectura && (
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

        {!soloLectura && (
          <View style={styles.columnsCard}>
            <Text style={styles.sectionTitle}>Editar columnas</Text>
            {columnDrafts.map((columna, index) => (
              <View key={columna.id} style={styles.columnEditor}>
                <TextInput
                  style={styles.columnInput}
                  value={columna.titulo}
                  onChangeText={(value) => editarColumna(index, { titulo: value })}
                  placeholder="Título"
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
                placeholder="Título de columna"
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
        visible={modalEliminar}
        titulo="Eliminar planilla base"
        mensaje="¿Seguro que querés eliminar esta planilla base? No afecta planillas de alumnos ya creadas."
        textoConfirmar={guardando ? "Eliminando..." : "Sí, eliminar"}
        textoCancelar="Cancelar"
        onConfirm={confirmarEliminar}
        onCancel={() => setModalEliminar(false)}
      />
    </View>
  );
}

function normalizarColumnas(columnas: ColumnaPlanilla[]) {
  return columnas.map((columna, index) => ({
    ...columna,
    orden: index,
    visibleAlumno: columna.titulo.trim().toLowerCase() === "observaciones" ? false : columna.visibleAlumno,
  }));
}

function crearIdColumna(titulo: string, columnas: ColumnaPlanilla[]) {
  const base =
    titulo
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
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  iconBtnDanger: { padding: 7, borderRadius: 8, backgroundColor: "#FEF2F2" },
  tableEmpty: { padding: 16, color: "#9CA3AF", fontStyle: "italic" },
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
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  switchLabel: { color: "#374151", fontWeight: "600", fontSize: 13 },
  deleteColumnBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, alignSelf: "flex-start" },
  deleteColumnText: { color: "#DC2626", fontWeight: "700", fontSize: 13 },
  secondaryBtn: { backgroundColor: "#E8F5E9", borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 10 },
  secondaryBtnText: { color: "#0F4A32", fontWeight: "700" },
  newColumnBox: { marginTop: 18, borderTopWidth: 1, borderTopColor: "#F3F4F6", paddingTop: 14 },
  emptyText: { fontSize: 14, color: "#9CA3AF", textAlign: "center", marginTop: 8 },
});
