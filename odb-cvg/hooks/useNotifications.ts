import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "../config/firebaseConfig";
import { isSafeNotificationDocumentId, type AppNotification } from "../types/notifications";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

function notificationsCollection(uid: string) {
  return collection(db, "usuarios", uid, "notifications");
}

export function useNotifications(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const uid = auth.currentUser?.uid ?? null;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid || !enabled) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const since = Timestamp.fromDate(new Date(Date.now() - FOURTEEN_DAYS_MS));
    const q = query(
      notificationsCollection(uid),
      where("createdAt", ">=", since),
      orderBy("createdAt", "desc"),
      limit(100),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setNotifications(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as AppNotification[],
        );
        setLoading(false);
      },
      (err) => {
        console.error("useNotifications error:", err);
        setError("No se pudieron cargar las notificaciones.");
        setLoading(false);
      },
    );
    return () => unsub();
  }, [uid, enabled]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.isRead).length,
    [notifications],
  );

  const markAsRead = async (notificationId: string) => {
    if (!uid || !enabled || !isSafeNotificationDocumentId(notificationId)) return;
    const ref = doc(db, "usuarios", uid, "notifications", notificationId);
    const snap = await getDoc(ref);
    if (!snap.exists() || snap.data().isRead === true) return;
    await updateDoc(ref, {
      isRead: true,
      readAt: Timestamp.now(),
    });
  };

  const markAllAsRead = async () => {
    if (!uid || !enabled) return;
    const batch = writeBatch(db);
    notifications
      .filter((item) => !item.isRead)
      .filter((item) => isSafeNotificationDocumentId(item.id))
      .forEach((item) => {
        batch.update(doc(db, "usuarios", uid, "notifications", item.id), {
          isRead: true,
          readAt: Timestamp.now(),
        });
      });
    await batch.commit();
  };

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
  };
}
