import { Expo, ExpoPushMessage } from "expo-server-sdk";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export type NotificationTarget =
  | { kind: "content"; moduloId: string; seccionId: string; itemId?: string; subseccionPath?: string }
  | { kind: "grade"; moduloId?: string; seccionId: string; subseccionPath?: string; nombreExamen?: string; entregaItemId?: string; entregaId?: string }
  | { kind: "tp_sheet"; planillaId: string; moduloId?: string; seccionId: string; subseccionPath?: string | null }
  | { kind: "delivery"; moduloId: string; seccionId: string; itemId: string; entregaId?: string; subseccionPath?: string }
  | { kind: "schedule_event"; eventId: string; eventType: "entrega" | "ateneo" | "parcial"; moduloId?: string; seccionId?: string; subseccionPath?: string };

export interface NotificationPayload {
  userId: string;
  type: string;
  title: string;
  body: string;
  target: NotificationTarget;
  sourceId?: string | null;
  courseId?: string | null;
  deduplicationKey: string;
}

const expo = new Expo();

export async function createInternalNotification(payload: NotificationPayload) {
  const ref = admin.firestore()
    .collection("usuarios")
    .doc(payload.userId)
    .collection("notifications")
    .doc(encodeURIComponent(payload.deduplicationKey));

  await admin.firestore().runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return;
    tx.set(ref, {
      type: payload.type,
      title: payload.title,
      body: payload.body,
      createdAt: FieldValue.serverTimestamp(),
      readAt: null,
      isRead: false,
      target: payload.target,
      sourceId: payload.sourceId ?? null,
      courseId: payload.courseId ?? null,
      deduplicationKey: payload.deduplicationKey,
      pushStatus: "pending",
    });
  });

  return ref;
}

export async function sendPushForNotification(payload: NotificationPayload) {
  const prefSnap = await admin.firestore()
    .doc(`usuarios/${payload.userId}/notificationPreferences/push`)
    .get();
  if (prefSnap.exists && prefSnap.data()?.enabled === false) {
    await markPushStatus(payload, "disabled");
    return;
  }

  const tokensSnap = await admin.firestore()
    .collection(`usuarios/${payload.userId}/pushTokens`)
    .where("enabled", "==", true)
    .get();

  const messages: ExpoPushMessage[] = [];
  tokensSnap.docs.forEach((tokenDoc) => {
    const token = tokenDoc.data().token;
    if (typeof token !== "string" || !Expo.isExpoPushToken(token)) {
      tokenDoc.ref.update({ enabled: false, updatedAt: FieldValue.serverTimestamp() });
      return;
    }
    messages.push({
      to: token,
      title: payload.title,
      body: payload.body,
      sound: "default",
      channelId: "default",
      data: {
        notificationId: encodeURIComponent(payload.deduplicationKey),
        target: JSON.stringify(payload.target),
      },
    });
  });

  if (messages.length === 0) {
    await markPushStatus(payload, "no_tokens");
    return;
  }

  try {
    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      await Promise.all(tickets.map(async (ticket, index) => {
        if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
          const token = chunk[index].to;
          await disableToken(payload.userId, Array.isArray(token) ? token[0] : token);
        }
      }));
    }
    await markPushStatus(payload, "sent");
  } catch (error) {
    console.error("sendPushForNotification error", error);
    await markPushStatus(payload, "failed");
  }
}

export async function notifyStudent(payload: NotificationPayload) {
  await createInternalNotification(payload);
  await sendPushForNotification(payload);
}

export async function markPushStatus(payload: NotificationPayload, status: string) {
  await admin.firestore()
    .collection("usuarios")
    .doc(payload.userId)
    .collection("notifications")
    .doc(encodeURIComponent(payload.deduplicationKey))
    .set({ pushStatus: status, pushUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

async function disableToken(userId: string, token: string) {
  const snap = await admin.firestore()
    .collection(`usuarios/${userId}/pushTokens`)
    .where("token", "==", token)
    .get();
  await Promise.all(snap.docs.map((doc) => doc.ref.update({
    enabled: false,
    updatedAt: FieldValue.serverTimestamp(),
  })));
}

export function timestampFromDate(date: Date): Timestamp {
  return Timestamp.fromDate(date);
}
