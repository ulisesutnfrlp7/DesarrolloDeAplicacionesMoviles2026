// components/ui/ModalEventoCronograma.tsx
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,} from "react-native";
import { db } from "../../config/firebaseConfig";
import { COMISION_GLOBAL, MODULO_GLOBAL, type EventoCronograma, type EventoCronogramaInput,} from "../../hooks/useCronograma";
import { useModulos } from "../../hooks/useModulos";
import {
  DEFAULT_NOTIFICATION_SCHEDULE,
  normalizeReminder,
  reminderLabel,
  sortReminders,
  validateReminders,
  type NotificationReminder,
  type ReminderUnit,
} from "../../types/notifications";

interface Props {
  visible: boolean;
  eventoExistente?: EventoCronograma | null;
  onGuardar: (data: EventoCronogramaInput) => Promise<void>;
  onCancelar: () => void;
}

interface OpcionComision {
  id: string;
  titulo: string;
}

export default function ModalEventoCronograma({
  visible,
  eventoExistente,
  onGuardar,
  onCancelar,
}: Props) {
  const esEdicion = !!eventoExistente;

  const { modulos } = useModulos();

  const [tipo, setTipo] = useState<"ateneo" | "parcial">("ateneo");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [fecha, setFecha] = useState(new Date());
  const [mostrarPickerFecha, setMostrarPickerFecha] = useState(false);
  const [mostrarPickerHora, setMostrarPickerHora] = useState(false);
  const [pendingFecha, setPendingFecha] = useState<Date | null>(null);
  const [pendingHora, setPendingHora] = useState<Date | null>(null);

  // Módulo seleccionado
  const [moduloId, setModuloId] = useState<string>(MODULO_GLOBAL);
  const [moduloTitulo, setModuloTitulo] = useState<string>("NINGUNO EN ESPECIAL");
  const [moduloOpen, setModuloOpen] = useState(false);

  // Comisión seleccionada
  const [comisionSubseccionId, setComisionSubseccionId] = useState<string>(COMISION_GLOBAL);
  const [comisionTitulo, setComisionTitulo] = useState<string>("NINGUNA EN ESPECIAL");
  const [comisionOpen, setComisionOpen] = useState(false);
  const [comisiones, setComisiones] = useState<OpcionComision[]>([]);
  const [loadingComisiones, setLoadingComisiones] = useState(false);

  // Guarda el id a pre-seleccionar luego de que la carga asíncrona de comisiones termine (modo edición)
  const pendingComisionIdRef = useRef<string | null>(null);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [avisosEnabled, setAvisosEnabled] = useState(false);
  const [reminders, setReminders] = useState<NotificationReminder[]>([]);
  const [reminderAmount, setReminderAmount] = useState("");
  const [reminderUnit, setReminderUnit] = useState<ReminderUnit>("days");
  const [sameMoment, setSameMoment] = useState(false);

  // ── Inicializar formulario al abrir ──────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    if (eventoExistente) {
      setTipo(eventoExistente.tipo as "ateneo" | "parcial");
      setTitulo(eventoExistente.titulo);
      setDescripcion(eventoExistente.descripcion ?? "");
      setFecha(new Date(eventoExistente.fecha));
      const mId = eventoExistente.moduloId ?? MODULO_GLOBAL;
      const cId = eventoExistente.comisionSubseccionId ?? COMISION_GLOBAL;
      // Guardar la comisión pendiente ANTES de setear el módulo
      // (el useEffect de cascada se disparará y la restaurará)
      pendingComisionIdRef.current = cId !== COMISION_GLOBAL ? cId : null;
      setModuloId(mId);
      setModuloTitulo(
        mId === MODULO_GLOBAL
          ? "NINGUNO EN ESPECIAL"
          : (modulos.find((m) => m.id === mId)?.titulo ?? mId),
      );
      const schedule = eventoExistente.notificationSchedule ?? DEFAULT_NOTIFICATION_SCHEDULE;
      setAvisosEnabled(schedule.enabled);
      setReminders(sortReminders(schedule.reminders ?? []));
    } else {
      setTipo("ateneo");
      setTitulo("");
      setDescripcion("");
      setFecha(new Date());
      pendingComisionIdRef.current = null;
      setModuloId(MODULO_GLOBAL);
      setModuloTitulo("NINGUNO EN ESPECIAL");
      setComisionSubseccionId(COMISION_GLOBAL);
      setComisionTitulo("NINGUNA EN ESPECIAL");
      setComisiones([]);
      setAvisosEnabled(false);
      setReminders([]);
    }
    setReminderAmount("");
    setReminderUnit("days");
    setSameMoment(false);
    setError("");
    setModuloOpen(false);
    setComisionOpen(false);
  }, [visible, eventoExistente]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Carga dinámica de comisiones cuando cambia el módulo ─────────────────
  useEffect(() => {
    if (moduloId === MODULO_GLOBAL) {
      setComisiones([]);
      setComisionSubseccionId(COMISION_GLOBAL);
      setComisionTitulo("NINGUNA EN ESPECIAL");
      return;
    }

    let activo = true;
    setLoadingComisiones(true);
    setComisiones([]);
    setComisionSubseccionId(COMISION_GLOBAL);
    setComisionTitulo("NINGUNA EN ESPECIAL");

    const cargar = async () => {
      try {
        // Buscar la sección "Cursada" del módulo seleccionado
        const seccionesSnap = await getDocs(
          query(collection(db, "modulos", moduloId, "secciones"), orderBy("fechaCreacion", "asc")),
        );
        const seccionCursada = seccionesSnap.docs.find((d) =>
          (d.data().titulo as string ?? "").toLowerCase().includes("cursada"),
        );
        if (!seccionCursada || !activo) {
          if (activo) setLoadingComisiones(false);
          return;
        }

        // Cargar subsecciones directas de "Cursada"
        const subseccionesSnap = await getDocs(
          query(
            collection(db, "modulos", moduloId, "secciones", seccionCursada.id, "subsecciones"),
            orderBy("fechaCreacion", "asc"),
          ),
        );
        if (!activo) return;

        const lista: OpcionComision[] = subseccionesSnap.docs.map((d) => ({
          id: d.id,
          titulo: (d.data().titulo as string) ?? d.id,
        }));
        setComisiones(lista);

        // Restaurar selección previa en modo edición
        const pending = pendingComisionIdRef.current;
        if (pending) {
          const encontrada = lista.find((c) => c.id === pending);
          if (encontrada) {
            setComisionSubseccionId(encontrada.id);
            setComisionTitulo(encontrada.titulo);
          }
          pendingComisionIdRef.current = null;
        }
      } catch (err) {
        console.error("ModalEventoCronograma cargar comisiones error:", err);
      } finally {
        if (activo) setLoadingComisiones(false);
      }
    };

    cargar();
    return () => {
      activo = false;
    };
  }, [moduloId]);

  // ── Selección de módulo ───────────────────────────────────────────────────
  const handleSeleccionarModulo = (id: string, tit: string) => {
    setModuloId(id);
    setModuloTitulo(tit);
    setModuloOpen(false);
    setComisionOpen(false);
  };

  // ── Selección de comisión ─────────────────────────────────────────────────
  const handleSeleccionarComision = (id: string, tit: string) => {
    setComisionSubseccionId(id);
    setComisionTitulo(tit);
    setComisionOpen(false);
  };

  // ── Date pickers ──────────────────────────────────────────────────────────
  const formatFecha = (d: Date) =>
    d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const formatHora = (d: Date) =>
    d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

  const onChangeFecha = (_event: DateTimePickerEvent, selected?: Date) => {
    setMostrarPickerFecha(false);
    if (selected) {
      const nueva = new Date(fecha);
      nueva.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      setFecha(nueva);
    }
  };

  const abrirPickerFecha = () => {
    setPendingFecha(new Date(fecha));
    setMostrarPickerFecha(true);
  };

  const cancelarPickerFecha = () => {
    setMostrarPickerFecha(false);
    setPendingFecha(null);
  };

  const confirmarPickerFecha = () => {
    if (pendingFecha) {
      const nueva = new Date(fecha);
      nueva.setFullYear(pendingFecha.getFullYear(), pendingFecha.getMonth(), pendingFecha.getDate());
      setFecha(nueva);
    }
    setMostrarPickerFecha(false);
    setPendingFecha(null);
  };

  const abrirPickerHora = () => {
    setPendingHora(new Date(fecha));
    setMostrarPickerHora(true);
  };

  const cancelarPickerHora = () => {
    setMostrarPickerHora(false);
    setPendingHora(null);
  };

  const confirmarPickerHora = () => {
    if (pendingHora) {
      const nueva = new Date(fecha);
      nueva.setHours(pendingHora.getHours(), pendingHora.getMinutes());
      setFecha(nueva);
    }
    setMostrarPickerHora(false);
    setPendingHora(null);
  };

  // ── Guardar ───────────────────────────────────────────────────────────────
  const handleGuardar = async () => {
    if (!titulo.trim()) {
      setError("El título es obligatorio.");
      return;
    }
    const validation = validateReminders(reminders, fecha);
    if (validation) {
      setError(validation);
      return;
    }
    setError("");
    setGuardando(true);
    try {
      await onGuardar({
        tipo,
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || undefined,
        fecha,
        moduloId,
        moduloTitulo,
        comisionSubseccionId,
        comisionTitulo,
        notificationSchedule: {
          enabled: avisosEnabled,
          version: (eventoExistente?.notificationSchedule?.version ?? 0) + 1,
          reminders: sortReminders(reminders),
          nextNotificationAt: null,
          processed: {},
        },
      });
      onCancelar();
    } catch {
      setError("Ocurrió un error al guardar. Intentá de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  const agregarRecordatorio = () => {
    const parsedAmount = sameMoment ? 0 : Number(reminderAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0 || (!sameMoment && parsedAmount <= 0)) {
      setError("Ingresá una cantidad válida mayor a cero, o elegí el mismo momento.");
      return;
    }
    const reminder = normalizeReminder({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      amount: parsedAmount,
      unit: sameMoment ? "minutes" : reminderUnit,
    });
    const validation = validateReminders([...reminders, reminder], fecha);
    if (validation) {
      setError(validation);
      return;
    }
    setReminders((prev) => sortReminders([...prev, reminder]));
    setReminderAmount("");
    setSameMoment(false);
    setError("");
  };

  const eliminarRecordatorio = (id: string) => {
    setReminders((prev) => prev.filter((item) => item.id !== id));
  };

  const comisionDeshabilitada = moduloId === MODULO_GLOBAL;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancelar}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.titulo}>{esEdicion ? "Editar Evento" : "Nuevo Evento"}</Text>

          {/* Selector de tipo */}
          <View style={styles.tipoRow}>
            <TouchableOpacity
              style={[styles.tipoBtn, tipo === "ateneo" && styles.tipoBtnActive]}
              onPress={() => setTipo("ateneo")}
            >
              <Text style={[styles.tipoBtnText, tipo === "ateneo" && styles.tipoBtnTextActive]}>
                Ateneo
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tipoBtn, tipo === "parcial" && styles.tipoBtnActive]}
              onPress={() => setTipo("parcial")}
            >
              <Text style={[styles.tipoBtnText, tipo === "parcial" && styles.tipoBtnTextActive]}>
                Parcial
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Título *</Text>
            <TextInput
              style={styles.input}
              value={titulo}
              onChangeText={setTitulo}
              placeholder="EJ. Ateneo Clínico N°1 o Parcial de Mecánica Dental"
              placeholderTextColor="#9CA3AF"
              maxLength={120}
              autoCorrect={true}
              autoCapitalize="sentences"
              spellCheck={true}
            />

            <Text style={styles.label}>Descripción (opcional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={descripcion}
              onChangeText={setDescripcion}
              placeholder="Detalle del evento..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              maxLength={500}
              autoCorrect={true}
              autoCapitalize="sentences"
              spellCheck={true}
            />

            <Text style={styles.label}>Fecha</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={abrirPickerFecha}>
              <Text style={styles.dateBtnText}>{formatFecha(fecha)}</Text>
            </TouchableOpacity>

            <Text style={styles.label}>Hora</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={abrirPickerHora}>
              <Text style={styles.dateBtnText}>{formatHora(fecha)}</Text>
            </TouchableOpacity>

            {mostrarPickerFecha && Platform.OS !== "ios" && (
              <DateTimePicker
                value={fecha}
                mode="date"
                display="default"
                onChange={onChangeFecha}
              />
            )}
            {Platform.OS === "ios" && (
              <Modal visible={mostrarPickerFecha} transparent animationType="fade" onRequestClose={cancelarPickerFecha}>
                <View style={styles.timePickerOverlay}>
                  <View style={styles.datePickerCard}>
                    <View style={styles.timePickerActions}>
                      <TouchableOpacity onPress={cancelarPickerFecha} style={styles.timePickerActionBtn}>
                        <Text style={styles.timePickerCancelText}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={confirmarPickerFecha} style={styles.timePickerActionBtn}>
                        <Text style={styles.timePickerDoneText}>Listo</Text>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={pendingFecha ?? fecha}
                      mode="date"
                      display="inline"
                      onChange={(_event, selected) => {
                        if (selected) setPendingFecha(selected);
                      }}
                    />
                  </View>
                </View>
              </Modal>
            )}

            {mostrarPickerHora && Platform.OS !== "ios" && (
              <DateTimePicker
                value={fecha}
                mode="time"
                display="default"
                onChange={(event, selected) => {
                  setMostrarPickerHora(false);
                  setPendingHora(null);
                  if (event.type !== "dismissed" && selected) {
                    const nueva = new Date(fecha);
                    nueva.setHours(selected.getHours(), selected.getMinutes());
                    setFecha(nueva);
                  }
                }}
              />
            )}
            {Platform.OS === "ios" && (
              <Modal visible={mostrarPickerHora} transparent animationType="fade" onRequestClose={cancelarPickerHora}>
                <View style={styles.timePickerOverlay}>
                  <View style={styles.timePickerCard}>
                    <View style={styles.timePickerActions}>
                      <TouchableOpacity onPress={cancelarPickerHora} style={styles.timePickerActionBtn}>
                        <Text style={styles.timePickerCancelText}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={confirmarPickerHora} style={styles.timePickerActionBtn}>
                        <Text style={styles.timePickerDoneText}>Listo</Text>
                      </TouchableOpacity>
                    </View>
                    <DateTimePicker
                      value={pendingHora ?? fecha}
                      mode="time"
                      display="spinner"
                      is24Hour
                      onChange={(_event, selected) => {
                        if (selected) setPendingHora(selected);
                      }}
                    />
                  </View>
                </View>
              </Modal>
            )}

            {/* ── Desplegable Módulo ── */}
            <Text style={styles.label}>Módulo</Text>
            <TouchableOpacity
              style={styles.selectBtn}
              onPress={() => {
                setModuloOpen((v) => !v);
                setComisionOpen(false);
              }}
            >
              <Text style={styles.selectBtnText}>{moduloTitulo}</Text>
              <Text style={styles.chevron}>{moduloOpen ? "▲" : "▼"}</Text>
            </TouchableOpacity>
            {moduloOpen && (
              <View style={styles.opciones}>
                <TouchableOpacity
                  style={[
                    styles.opcion,
                    moduloId === MODULO_GLOBAL && styles.opcionActiva,
                  ]}
                  onPress={() => handleSeleccionarModulo(MODULO_GLOBAL, "NINGUNO EN ESPECIAL")}
                >
                  <Text
                    style={[
                      styles.opcionTexto,
                      moduloId === MODULO_GLOBAL && styles.opcionTextoActivo,
                    ]}
                  >
                    NINGUNO EN ESPECIAL
                  </Text>
                </TouchableOpacity>
                {modulos
                  .filter((m) => /^Operatoria Dental (I|II|III|IV|V|VI)$/.test(m.titulo))
                  .map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.opcion, moduloId === m.id && styles.opcionActiva]}
                      onPress={() => handleSeleccionarModulo(m.id, m.titulo)}
                    >
                      <Text
                        style={[
                          styles.opcionTexto,
                          moduloId === m.id && styles.opcionTextoActivo,
                        ]}
                      >
                        {m.titulo}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </View>
            )}

            {/* ── Desplegable Comisión ── */}
            <Text style={[styles.label, comisionDeshabilitada && styles.labelDeshabilitado]}>
              Comisión
            </Text>
            <TouchableOpacity
              style={[styles.selectBtn, comisionDeshabilitada && styles.selectBtnDeshabilitado]}
              disabled={comisionDeshabilitada || loadingComisiones}
              onPress={() => setComisionOpen((v) => !v)}
            >
              {loadingComisiones ? (
                <ActivityIndicator size="small" color="#0F4A32" />
              ) : (
                <>
                  <Text
                    style={[
                      styles.selectBtnText,
                      comisionDeshabilitada && styles.selectBtnTextDeshabilitado,
                    ]}
                  >
                    {comisionTitulo}
                  </Text>
                  {!comisionDeshabilitada && (
                    <Text style={styles.chevron}>{comisionOpen ? "▲" : "▼"}</Text>
                  )}
                </>
              )}
            </TouchableOpacity>
            {comisionOpen && !comisionDeshabilitada && (
              <View style={styles.opciones}>
                {comisiones.length === 0 ? (
                  <Text style={styles.sinComisiones}>
                    No se encontraron comisiones para este módulo.
                  </Text>
                ) : (
                  <View>
                    <TouchableOpacity
                      style={[
                        styles.opcion,
                        comisionSubseccionId === COMISION_GLOBAL && styles.opcionActiva,
                      ]}
                      onPress={() => handleSeleccionarComision(COMISION_GLOBAL, "NINGUNA EN ESPECIAL")}
                    >
                      <Text
                        style={[
                          styles.opcionTexto,
                          comisionSubseccionId === COMISION_GLOBAL && styles.opcionTextoActivo,
                        ]}
                      >
                        NINGUNA EN ESPECIAL
                      </Text>
                    </TouchableOpacity>
                    {comisiones
                      .filter((c) => /^Comisión/.test(c.titulo))
                      .map((c) => (
                        <TouchableOpacity
                          key={c.id}
                          style={[
                            styles.opcion,
                            comisionSubseccionId === c.id && styles.opcionActiva,
                          ]}
                          onPress={() => handleSeleccionarComision(c.id, c.titulo)}
                        >
                          <Text
                            style={[
                              styles.opcionTexto,
                              comisionSubseccionId === c.id && styles.opcionTextoActivo,
                            ]}
                          >
                            {c.titulo}
                          </Text>
                        </TouchableOpacity>
                      ))}
                  </View>
                )}
              </View>
            )}

            <View style={styles.recordatoriosBox}>
              <View style={styles.recordatoriosHeader}>
                <View>
                  <Text style={styles.recordatoriosTitle}>Recordatorios</Text>
                  <Text style={styles.recordatoriosSubtitle}>Avisos para alumnos del evento</Text>
                </View>
                <TouchableOpacity
                  style={[styles.switch, avisosEnabled && styles.switchOn]}
                  onPress={() => setAvisosEnabled((v) => !v)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.switchKnob, avisosEnabled && styles.switchKnobOn]} />
                </TouchableOpacity>
              </View>

              {avisosEnabled && (
                <>
                  <TouchableOpacity
                    style={styles.sameMomentRow}
                    onPress={() => setSameMoment((v) => !v)}
                  >
                    <Text style={styles.sameMomentIcon}>{sameMoment ? "[x]" : "[ ]"}</Text>
                    <Text style={styles.sameMomentText}>El mismo momento</Text>
                  </TouchableOpacity>

                  {!sameMoment && (
                    <View style={styles.reminderInputRow}>
                      <TextInput
                        style={[styles.input, styles.reminderAmountInput]}
                        value={reminderAmount}
                        onChangeText={(value) => setReminderAmount(value.replace(/[^0-9]/g, ""))}
                        placeholder="Cantidad"
                        keyboardType="number-pad"
                        placeholderTextColor="#9CA3AF"
                      />
                      {(["minutes", "hours", "days"] as ReminderUnit[]).map((unit) => (
                        <TouchableOpacity
                          key={unit}
                          style={[styles.unitBtn, reminderUnit === unit && styles.unitBtnActive]}
                          onPress={() => setReminderUnit(unit)}
                        >
                          <Text style={[styles.unitBtnText, reminderUnit === unit && styles.unitBtnTextActive]}>
                            {unit === "minutes" ? "min" : unit === "hours" ? "hs" : "dias"}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <TouchableOpacity style={styles.addReminderBtn} onPress={agregarRecordatorio}>
                    <Text style={styles.addReminderText}>Agregar recordatorio</Text>
                  </TouchableOpacity>

                  {reminders.length > 0 ? (
                    <View style={styles.remindersList}>
                      {sortReminders(reminders).map((reminder) => (
                        <View key={reminder.id} style={styles.reminderChip}>
                          <Text style={styles.reminderChipText}>{reminderLabel(reminder)}</Text>
                          <TouchableOpacity onPress={() => eliminarRecordatorio(reminder.id)}>
                            <Text style={styles.reminderDelete}>Eliminar</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.noReminders}>Todavia no agregaste recordatorios.</Text>
                  )}
                </>
              )}
            </View>

            {!!error && <Text style={styles.errorText}>{error}</Text>}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.btnCancelar} onPress={onCancelar} disabled={guardando}>
              <Text style={styles.btnCancelarText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnGuardar}
              onPress={handleGuardar}
              disabled={guardando}
            >
              {guardando ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.btnGuardarText}>{esEdicion ? "Guardar" : "Crear"}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: "92%",
  },
  titulo: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F4A32",
    marginBottom: 16,
    textAlign: "center",
  },
  tipoRow: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
  },
  tipoBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  tipoBtnActive: {
    backgroundColor: "#0F4A32",
  },
  tipoBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  tipoBtnTextActive: {
    color: "#FFFFFF",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
    marginTop: 14,
  },
  labelDeshabilitado: {
    color: "#9CA3AF",
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#F9FAFB",
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  dateBtn: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#F9FAFB",
  },
  dateBtnText: {
    fontSize: 14,
    color: "#111827",
  },
  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#F9FAFB",
  },
  selectBtnDeshabilitado: {
    backgroundColor: "#F3F4F6",
    borderColor: "#E5E7EB",
  },
  selectBtnText: {
    fontSize: 14,
    color: "#111827",
    flex: 1,
  },
  selectBtnTextDeshabilitado: {
    color: "#9CA3AF",
  },
  chevron: {
    fontSize: 11,
    color: "#6B7280",
    marginLeft: 8,
  },
  opciones: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    marginTop: 4,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  opcion: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  opcionActiva: {
    backgroundColor: "#ECFDF5",
  },
  opcionTexto: {
    fontSize: 14,
    color: "#374151",
  },
  opcionTextoActivo: {
    color: "#0F4A32",
    fontWeight: "600",
  },
  sinComisiones: {
    fontSize: 13,
    color: "#9CA3AF",
    padding: 14,
    textAlign: "center",
  },
  errorText: {
    color: "#EF4444",
    fontSize: 13,
    marginTop: 10,
  },
  recordatoriosBox: {
    marginTop: 18,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
  },
  recordatoriosHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  recordatoriosTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  recordatoriosSubtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  switch: {
    width: 46,
    height: 28,
    borderRadius: 14,
    padding: 3,
    justifyContent: "center",
    backgroundColor: "#CBD5E0",
  },
  switchOn: {
    backgroundColor: "#25B471",
  },
  switchKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
  },
  switchKnobOn: {
    alignSelf: "flex-end",
  },
  sameMomentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
  },
  sameMomentIcon: {
    color: "#0F4A32",
    fontWeight: "700",
  },
  sameMomentText: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "600",
  },
  reminderInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  reminderAmountInput: {
    flex: 1,
    marginTop: 0,
  },
  unitBtn: {
    minWidth: 48,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  unitBtnActive: {
    backgroundColor: "#0F4A32",
    borderColor: "#0F4A32",
  },
  unitBtnText: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "700",
  },
  unitBtnTextActive: {
    color: "#FFFFFF",
  },
  addReminderBtn: {
    marginTop: 12,
    borderRadius: 8,
    backgroundColor: "#E8F5E9",
    alignItems: "center",
    paddingVertical: 11,
  },
  addReminderText: {
    color: "#0F4A32",
    fontSize: 13,
    fontWeight: "700",
  },
  remindersList: {
    marginTop: 12,
    gap: 8,
  },
  reminderChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  reminderChipText: {
    flex: 1,
    fontSize: 13,
    color: "#374151",
    fontWeight: "600",
  },
  reminderDelete: {
    fontSize: 12,
    color: "#DC2626",
    fontWeight: "700",
  },
  noReminders: {
    marginTop: 10,
    fontSize: 12,
    color: "#9CA3AF",
  },
  timePickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  timePickerCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  datePickerCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 16,
  },
  timePickerActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  timePickerActionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  timePickerCancelText: {
    color: "#6B7280",
    fontSize: 15,
    fontWeight: "700",
  },
  timePickerDoneText: {
    color: "#0F4A32",
    fontSize: 15,
    fontWeight: "800",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
    paddingBottom: 8,
  },
  btnCancelar: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnCancelarText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#4B5563",
  },
  btnGuardar: {
    flex: 1,
    backgroundColor: "#0F4A32",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnGuardarText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});

