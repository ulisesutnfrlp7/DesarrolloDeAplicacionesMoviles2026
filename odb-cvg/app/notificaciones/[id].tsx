import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import NotificationInfoRow from "../../components/notifications/NotificationInfoRow";
import ModalAlerta from "../../components/ui/ModalAlerta";
import ScreenHeader from "../../components/ui/ScreenHeader";
import { auth, db } from "../../config/firebaseConfig";
import { useNotifications } from "../../hooks/useNotifications";
import { useUserRole } from "../../hooks/useUserRole";
import { actionLabelForTarget, navigateToNotificationTarget } from "../../services/notificationNavigation";
import { isSafeNotificationDocumentId, type AppNotification } from "../../types/notifications";

type InfoRow = {
  id: string;
  icon: React.ComponentProps<typeof NotificationInfoRow>["icon"];
  label: string;
  value: string;
};

export default function NotificationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const notificationId = Array.isArray(id) ? null : id;
  const validId = isSafeNotificationDocumentId(notificationId);
  const { rol, loading: loadingRol } = useUserRole();
  const esAlumno = !loadingRol && rol === "alumno";
  const { markAsRead } = useNotifications({ enabled: esAlumno });
  const [notification, setNotification] = useState<AppNotification | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [alerta, setAlerta] = useState<{ visible: boolean; titulo: string; mensaje: string; tipo: "error" | "exito" }>({
    visible: false,
    titulo: "",
    mensaje: "",
    tipo: "error",
  });

  const goBackToNotifications = () => {
    router.replace("/(tabs)/notificaciones" as any);
  };

  useEffect(() => {
    if (!loadingRol && rol !== "alumno") {
      router.replace("/(tabs)/home" as any);
    }
  }, [loadingRol, rol]);

  useEffect(() => {
    if (loadingRol) return;
    if (!esAlumno) {
      setNotification(null);
      setLoading(false);
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid || !validId || !notificationId) {
      setNotification(null);
      setErrorMessage("Esta notificacion ya no se encuentra disponible.");
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      doc(db, "usuarios", uid, "notifications", notificationId),
      (snap) => {
        setNotification(snap.exists() ? ({ id: snap.id, ...snap.data() } as AppNotification) : null);
        setErrorMessage(snap.exists() ? null : "Esta notificacion ya no se encuentra disponible.");
        setLoading(false);
      },
      () => {
        setErrorMessage("No se pudo cargar la notificacion.");
        setLoading(false);
      },
    );
    return () => unsub();
  }, [notificationId, validId, loadingRol, esAlumno]);

  useEffect(() => {
    if (esAlumno && validId && notificationId) markAsRead(notificationId);
  }, [notificationId, validId, markAsRead, esAlumno]);

  const actionLabel = useMemo(
    () => notification ? actionLabelForTarget(notification.target) : "Ver recurso",
    [notification],
  );
  const infoRows = useMemo(() => notification ? buildInfoRows(notification) : [], [notification]);

  const openTarget = async () => {
    if (!notification) return;
    const result = await navigateToNotificationTarget(notification.target);
    if (!result.ok) {
      setAlerta({ visible: true, titulo: "No disponible", mensaje: result.message, tipo: "error" });
    }
  };

  if (loadingRol || !esAlumno || loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader titulo="Notificacion" onBack={goBackToNotifications} mostrarHome />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#25B471" />
        </View>
      </SafeAreaView>
    );
  }

  if (!notification) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader titulo="Notificacion" onBack={goBackToNotifications} mostrarHome />
        <View style={styles.centered}>
          <Ionicons name="warning-outline" size={46} color="#CBD5E0" />
          <Text style={styles.emptyText}>{errorMessage ?? "Esta notificacion ya no se encuentra disponible."}</Text>
          <TouchableOpacity style={styles.secondaryButton} onPress={goBackToNotifications} activeOpacity={0.85}>
            <Ionicons name="arrow-back-outline" size={18} color="#0F4A32" />
            <Text style={styles.secondaryButtonText}>Volver</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader titulo="Notificacion" onBack={goBackToNotifications} mostrarHome />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.iconBox}>
            <Ionicons name="notifications-outline" size={24} color="#0F4A32" />
          </View>
          <Text style={styles.title}>{notification.title}</Text>
          <Text style={styles.body}>{notification.body}</Text>
        </View>
        {infoRows.length > 0 ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Informacion</Text>
            {infoRows.map((row) => (
              <NotificationInfoRow key={row.id} icon={row.icon} label={row.label} value={row.value} />
            ))}
          </View>
        ) : null}
        <TouchableOpacity style={styles.primaryButton} onPress={openTarget} activeOpacity={0.85}>
          <Text style={styles.primaryButtonText}>{actionLabel}</Text>
          <Ionicons name="arrow-forward-outline" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </ScrollView>
      <ModalAlerta
        visible={alerta.visible}
        titulo={alerta.titulo}
        mensaje={alerta.mensaje}
        tipo={alerta.tipo}
        onClose={() => setAlerta((prev) => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 120 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 18,
    alignItems: "flex-start",
    elevation: 2,
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: "#E8F5E9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: { fontSize: 19, fontWeight: "700", color: "#11181C", marginBottom: 8 },
  body: { fontSize: 15, color: "#4B5563", lineHeight: 22 },
  primaryButton: {
    marginTop: 14,
    backgroundColor: "#0F4A32",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
  },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  infoCard: {
    marginTop: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 5,
    elevation: 1,
  },
  infoTitle: { fontSize: 16, fontWeight: "700", color: "#0F4A32", marginBottom: 4 },
  emptyText: { color: "#6B7280", textAlign: "center", marginTop: 12 },
  secondaryButton: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: "#0F4A32",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  secondaryButtonText: { color: "#0F4A32", fontWeight: "700", fontSize: 14 },
});

function buildInfoRows(notification: AppNotification): InfoRow[] {
  const metadata = notification.metadata ?? {};
  const rows: InfoRow[] = [];

  const title = resourceTitle(notification);
  if (title) addRow(rows, "resource-title", resourceIcon(notification), resourceLabel(notification), title);

  addCourseRows(rows, notification);

  switch (notification.type) {
    case "new_content":
    case "content_updated":
      addRow(rows, "content-type", "document-text-outline", "Tipo", contentTypeLabel(metadata.contentType));
      break;
    case "delivery_space_created":
    case "delivery_space_updated":
      addRow(rows, "deadline-date", "calendar-outline", "Fecha limite", formatDate(metadata.deadline));
      addRow(rows, "deadline-time", "time-outline", "Hora limite", formatTime(metadata.deadline));
      break;
    case "resubmission_requested":
    case "resubmission_updated":
    case "submission_grade_with_resubmission":
    case "submission_grade_updated_with_resubmission":
      addRow(rows, "review-message", "alert-circle-outline", "Aviso", "Revisa las observaciones de la entrega.");
      break;
    case "schedule_reminder":
      if (metadata.eventType === "entrega") {
        addRow(rows, "deadline-date", "calendar-outline", "Fecha limite", formatDate(metadata.deadline));
        addRow(rows, "deadline-time", "time-outline", "Hora limite", formatTime(metadata.deadline));
        break;
      }
      addRow(rows, "event-date", "calendar-number-outline", "Fecha", formatDate(metadata.eventDate));
      addRow(rows, "event-time", "time-outline", "Horario", formatTime(metadata.eventDate));
      addRow(rows, "event-when", "hourglass-outline", "Cuando", relativeEventLabel(metadata.eventDate));
      addRow(rows, "location", "location-outline", "Lugar", cleanBriefValue(metadata.location));
      break;
    case "schedule_event_created":
    case "schedule_event_updated":
      addRow(rows, "event-date", "calendar-number-outline", "Fecha", formatDate(metadata.eventDate));
      addRow(rows, "event-time", "time-outline", "Horario", formatTime(metadata.eventDate));
      addRow(rows, "location", "location-outline", "Lugar", cleanBriefValue(metadata.location));
      break;
  }

  return uniqueRows(rows);
}

function addCourseRows(rows: InfoRow[], notification: AppNotification) {
  const metadata = notification.metadata ?? {};
  addRow(rows, "module", "book-outline", "Curso", cleanValue(metadata.moduleTitle));
  const commission = cleanValue(metadata.commissionTitle);
  if ((notification.type === "schedule_reminder" || notification.type.startsWith("schedule_event")) && !commission && metadata.moduleTitle) {
    addRow(rows, "commission", "people-outline", "Comision", "Todas las comisiones");
    return;
  }
  if (commission) {
    addRow(rows, "commission", "people-outline", "Comision", commission);
    return;
  }
  addRow(rows, "display-context", "layers-outline", cleanValue(metadata.displayContextLabel) ?? "Seccion", cleanValue(metadata.displayContextTitle ?? metadata.sectionTitle));
}

function addRow(rows: InfoRow[], id: string, icon: InfoRow["icon"], label: string, value?: string | null) {
  const clean = cleanValue(value);
  if (clean) rows.push({ id, icon, label, value: clean });
}

function uniqueRows(rows: InfoRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.id}:${row.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resourceTitle(notification: AppNotification) {
  const metadata = notification.metadata ?? {};
  return cleanValue(
    metadata.eventTitle ??
    metadata.itemTitle ??
    metadata.examTitle ??
    metadata.assignmentTitle ??
    metadata.sheetTitle,
  );
}

function resourceLabel(notification: AppNotification) {
  if (notification.type === "exam_grade" || notification.type === "exam_grade_updated") return "Examen";
  if (notification.type === "submission_grade" || notification.type === "submission_grade_updated" || notification.type === "submission_grade_with_resubmission" || notification.type === "submission_grade_updated_with_resubmission" || notification.type === "delivery_space_created" || notification.type === "delivery_space_updated" || notification.type === "resubmission_requested" || notification.type === "resubmission_updated") return "Trabajo";
  if (notification.type.startsWith("tp_sheet")) return "Planilla";
  if (notification.type === "schedule_reminder" && notification.metadata?.eventType === "entrega") return "Trabajo";
  if (notification.type === "schedule_reminder" || notification.type.startsWith("schedule_event")) return "Evento";
  return "Contenido";
}

function resourceIcon(notification: AppNotification): InfoRow["icon"] {
  if (notification.type === "exam_grade" || notification.type === "exam_grade_updated") return "school-outline";
  if (notification.type === "submission_grade" || notification.type === "submission_grade_updated" || notification.type === "submission_grade_with_resubmission" || notification.type === "submission_grade_updated_with_resubmission" || notification.type === "delivery_space_created" || notification.type === "delivery_space_updated" || notification.type === "resubmission_requested" || notification.type === "resubmission_updated") return "cloud-upload-outline";
  if (notification.type.startsWith("tp_sheet")) return "clipboard-outline";
  if (notification.type === "schedule_reminder" && notification.metadata?.eventType === "entrega") return "cloud-upload-outline";
  if (notification.type === "schedule_reminder" || notification.type.startsWith("schedule_event")) return "calendar-outline";
  return "document-text-outline";
}

function cleanValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null" || trimmed === "NINGUNO_EN_ESPECIAL" || trimmed === "NINGUNA_EN_ESPECIAL") return null;
  return trimmed;
}

function cleanBriefValue(value: unknown): string | null {
  const clean = cleanValue(value);
  if (!clean || clean.length > 80) return null;
  return clean;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as any)?.toDate === "function") return (value as any).toDate();
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
}

function formatDate(value: unknown) {
  const date = toDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date);
}

function formatTime(value: unknown) {
  const date = toDate(value);
  if (!date) return null;
  return `${new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(date)} h`;
}

function relativeEventLabel(value: unknown) {
  const date = toDate(value);
  if (!date) return null;
  const now = new Date();
  const eventStart = new Date(date);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(now);
  const eventDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(eventStart);
  if (eventDay === today) return "Hoy";
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(tomorrow);
  if (eventDay === tomorrowDay) return "Mañana";
  return null;
}

function contentTypeLabel(value: unknown) {
  const type = cleanValue(value);
  if (!type) return null;
  const labels: Record<string, string> = {
    texto: "Texto",
    enlace: "Enlace",
    pdf: "Archivo",
    imagen: "Archivo",
    documento: "Archivo",
    video: "Archivo",
    entrega: "Entrega",
  };
  return labels[type] ?? type;
}
