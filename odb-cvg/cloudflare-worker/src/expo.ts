import type { Env, NotificationPayload, PushSendResult } from "./types.js";
import { FirestoreRest } from "./firestore.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export async function sendExpoPush(env: Env, db: FirestoreRest, payload: NotificationPayload): Promise<PushSendResult> {
  const pref = await db.get(`usuarios/${payload.userId}/notificationPreferences/push`);
  if (pref?.enabled === false) return { status: "disabled", tokensFound: 0, messagesAccepted: 0, messagesFailed: 0 };

  const tokens = await db.listCollectionPages(`usuarios/${payload.userId}/pushTokens`, 100);
  const ownTokens = tokens
    .filter((token) => token.enabled === true)
    .map((token) => token.token)
    .filter((token, index, arr) => typeof token === "string" && arr.indexOf(token) === index);

  if (ownTokens.length === 0) return { status: "no_tokens", tokensFound: 0, messagesAccepted: 0, messagesFailed: 0 };

  const messages = ownTokens.map((token) => ({
    to: token,
    title: payload.title,
    body: payload.body,
    sound: "default",
    channelId: "default",
    data: {
      target: JSON.stringify(payload.target),
      deduplicationKey: payload.deduplicationKey,
    },
  }));

  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: {
      "content-type": "application/json",
      ...(env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
    },
    body: JSON.stringify(messages),
  });
  if (!res.ok) throw new Error(`expo_${res.status}`);
  const body = await res.json() as { data?: Array<{ status: string; details?: { error?: string } }> };
  let messagesAccepted = 0;
  let messagesFailed = 0;
  await Promise.all((body.data ?? []).map(async (ticket, index) => {
    if (ticket.status === "ok") messagesAccepted += 1;
    if (ticket.status === "error") messagesFailed += 1;
    if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
      await disableToken(db, payload.userId, ownTokens[index]);
    }
  }));
  return {
    status: messagesFailed > 0 && messagesAccepted === 0 ? "failed" : "sent",
    tokensFound: ownTokens.length,
    messagesAccepted,
    messagesFailed,
  };
}

async function disableToken(db: FirestoreRest, userId: string, token: string) {
  const docs = await db.listCollectionPages(`usuarios/${userId}/pushTokens`, 100);
  await Promise.all(
    docs
      .filter((doc) => doc.token === token)
      .map((doc) => db.set(doc.path, { enabled: false, updatedAt: new Date() })),
  );
}
