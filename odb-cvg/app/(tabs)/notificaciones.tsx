import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ModalAlerta from "../../components/ui/ModalAlerta";
import { useNotifications } from "../../hooks/useNotifications";
import { useUserRole } from "../../hooks/useUserRole";
import { isSafeNotificationDocumentId, type AppNotification, type NotificationType } from "../../types/notifications";

const ICON_BY_TYPE: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  new_content: "document-text-outline",
  content_updated: "create-outline",
  exam_grade: "school-outline",
  exam_grade_updated: "school-outline",
  submission_grade: "checkmark-done-outline",
  submission_grade_updated: "checkmark-done-outline",
  submission_grade_with_resubmission: "alert-circle-outline",
  submission_grade_updated_with_resubmission: "alert-circle-outline",
  tp_sheet_created: "clipboard-outline",
  tp_sheet_updated: "create-outline",
  delivery_space_created: "cloud-upload-outline",
  delivery_space_updated: "cloud-upload-outline",
  resubmission_requested: "alert-circle-outline",
  resubmission_updated: "alert-circle-outline",
  schedule_event_created: "calendar-outline",
  schedule_event_updated: "calendar-outline",
  schedule_reminder: "calendar-outline",
};

function relativeDate(value: AppNotification["createdAt"]) {
  const date = value && typeof (value as any).toDate === "function"
    ? (value as any).toDate()
    : value instanceof Date
      ? value
      : null;
  if (!date) return "";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} d`;
}

export default function NotificacionesScreen() {
  const { rol, loading: loadingRol } = useUserRole();
  const esAlumno = !loadingRol && rol === "alumno";
  const { notifications, loading, error, markAsRead, markAllAsRead } = useNotifications({ enabled: esAlumno });
  const [alerta, setAlerta] = useState<{ visible: boolean; titulo: string; mensaje: string; tipo: "error" | "exito" }>({
    visible: false,
    titulo: "",
    mensaje: "",
    tipo: "exito",
  });

  const unreadCount = notifications.filter((item) => !item.isRead).length;

  useEffect(() => {
    if (!loadingRol && rol !== "alumno") {
      router.replace("/(tabs)/home" as any);
    }
  }, [loadingRol, rol]);

  const openNotification = async (item: AppNotification) => {
    try {
      if (!isSafeNotificationDocumentId(item.id)) {
        setAlerta({ visible: true, titulo: "No disponible", mensaje: "Esta notificacion ya no se encuentra disponible.", tipo: "error" });
        return;
      }
      await markAsRead(item.id);
      router.push(`/notificaciones/${item.id}` as any);
    } catch {
      setAlerta({ visible: true, titulo: "Error", mensaje: "No se pudo abrir la notificacion.", tipo: "error" });
    }
  };

  if (loadingRol || !esAlumno || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#25B471" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Notificaciones</Text>
          <Text style={styles.headerSubtitle}>Ultimos 14 dias</Text>
        </View>
        {unreadCount > 0 ? (
          <TouchableOpacity style={styles.markAllButton} onPress={markAllAsRead}>
            <Ionicons name="checkmark-done-outline" size={16} color="#0F4A32" />
            <Text style={styles.markAllText}>Leer todas</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {error ? (
        <View style={styles.centered}>
          <Ionicons name="warning-outline" size={46} color="#DC2626" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="notifications-off-outline" size={52} color="#CBD5E0" />
          <Text style={styles.emptyTitle}>Sin notificaciones</Text>
          <Text style={styles.emptyText}>Cuando haya novedades academicas van a aparecer aca.</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.notificationCard, !item.isRead && styles.notificationUnread]}
              onPress={() => openNotification(item)}
              activeOpacity={0.82}
            >
              <View style={styles.iconBox}>
                <Ionicons name={ICON_BY_TYPE[item.type]} size={20} color="#0F4A32" />
              </View>
              <View style={styles.notificationContent}>
                <View style={styles.titleRow}>
                  <Text style={styles.notificationTitle} numberOfLines={1}>{item.title}</Text>
                  {!item.isRead ? <View style={styles.unreadDot} /> : null}
                </View>
                <Text style={styles.notificationBody} numberOfLines={2}>{item.body}</Text>
                <Text style={styles.notificationDate}>{relativeDate(item.createdAt)}</Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={18} color="#CBD5E0" />
            </TouchableOpacity>
          )}
        />
      )}

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
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 28 },
  header: {
    paddingTop: 52,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerTitle: { fontSize: 22, fontWeight: "700", color: "#0F4A32" },
  headerSubtitle: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  markAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
  },
  markAllText: { fontSize: 12, color: "#0F4A32", fontWeight: "700" },
  listContent: { padding: 16, paddingBottom: 92 },
  notificationCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#E5E7EB",
    elevation: 1,
  },
  notificationUnread: { borderLeftColor: "#25B471", backgroundColor: "#F9FFFC" },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F5E9",
  },
  notificationContent: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  notificationTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: "#11181C" },
  notificationBody: { fontSize: 13, color: "#6B7280", lineHeight: 18, marginTop: 2 },
  notificationDate: { fontSize: 12, color: "#9CA3AF", marginTop: 5 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#25B471" },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#6B7280", marginTop: 12 },
  emptyText: { fontSize: 14, color: "#9CA3AF", textAlign: "center", marginTop: 4, lineHeight: 20 },
  errorText: { color: "#6B7280", marginTop: 12, textAlign: "center" },
});
