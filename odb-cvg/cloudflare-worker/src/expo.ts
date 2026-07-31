import type { Env, NotificationPayload, PushSendResult } from "./types.js";
import { FirestoreRest } from "./firestore.js";
import { stableDocumentId } from "./core.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const ANDROID_CHANNEL_ID = "default";
const ANDROID_PUSH_TTL_SECONDS = 60 * 60 * 24;

type ExpoPushTokenRecord = {
  token: string;
  platform: string | null;
};

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  ttl: number;
  priority?: "high";
  channelId?: string;
  data: {
    notificationId: string;
    target: string;
    deduplicationKey: string;
  };
};

export async function sendExpoPush(env: Env, db: FirestoreRest, payload: NotificationPayload): Promise<PushSendResult> {
  const pref = await db.get(`usuarios/${payload.userId}/notificationPreferences/push`);
  if (pref?.enabled === false) return { status: "disabled", tokensFound: 0, messagesAccepted: 0, messagesFailed: 0 };

  const ownTokens = await readValidExpoPushTokenRecords(db, payload.userId);

  if (ownTokens.length === 0) return { status: "no_tokens", tokensFound: 0, messagesAccepted: 0, messagesFailed: 0 };

  const notificationId = await stableDocumentId("notif", payload.deduplicationKey);
  const messages = ownTokens.map((record) => buildExpoPushMessage(record, payload, notificationId));
  console.log("push_payload_prepared", {
    uidSuffix: payload.userId.slice(-6),
    count: messages.length,
    push_payload_priority: messages.some((message) => message.priority === "high") ? "high" : null,
    push_payload_channel_id: messages.find((message) => message.channelId)?.channelId ?? null,
    ttlZero: messages.some((message) => message.ttl === 0),
  });

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
      await disableToken(db, payload.userId, ownTokens[index].token);
    }
  }));
  return {
    status: messagesFailed > 0 && messagesAccepted === 0 ? "failed" : "sent",
    tokensFound: ownTokens.length,
    messagesAccepted,
    messagesFailed,
  };
}

export async function readValidExpoPushTokens(db: FirestoreRest, userId: string): Promise<string[]> {
  return (await readValidExpoPushTokenRecords(db, userId)).map((record) => record.token);
}

async function readValidExpoPushTokenRecords(db: FirestoreRest, userId: string): Promise<ExpoPushTokenRecord[]> {
  const startedAt = Date.now();
  const path = `usuarios/${userId}/pushTokens`;
  console.log("push_token_collection_read_started", {
    uidSuffix: userId.slice(-6),
    path,
  });

  let docs: any[];
  try {
    docs = await db.listCollectionPages(path, 100);
  } catch (error: any) {
    console.log("push_token_collection_read_failed", {
      uidSuffix: userId.slice(-6),
      path,
      durationMs: Date.now() - startedAt,
      error: String(error?.message ?? error).slice(0, 160),
    });
    throw error;
  }

  console.log("push_token_documents_loaded", {
    uidSuffix: userId.slice(-6),
    path,
    count: docs.length,
    durationMs: Date.now() - startedAt,
  });

  const accepted: ExpoPushTokenRecord[] = [];
  for (const doc of docs) {
    const token = typeof doc?.token === "string" ? doc.token : null;
    const format = tokenFormat(token);
    const enabled = doc?.enabled === true;
    const platform = typeof doc?.platform === "string" ? doc.platform.toLowerCase() : null;
    if (!token || !enabled || format === "invalid") {
      console.log("push_token_document_skipped", {
        uidSuffix: userId.slice(-6),
        hasToken: Boolean(token),
        format,
        enabled: doc?.enabled,
        platform,
        reason: !token ? "missing_token" : (!enabled ? "disabled" : "invalid_format"),
      });
      continue;
    }
    if (!accepted.some((record) => record.token === token)) {
      accepted.push({ token, platform });
      console.log("push_token_accepted", {
        uidSuffix: userId.slice(-6),
        format,
        enabled,
        platform,
      });
    }
  }
  return accepted;
}

function buildExpoPushMessage(record: ExpoPushTokenRecord, payload: NotificationPayload, notificationId: string): ExpoPushMessage {
  const base: ExpoPushMessage = {
    to: record.token,
    title: payload.title,
    body: payload.body,
    sound: "default",
    ttl: ANDROID_PUSH_TTL_SECONDS,
    data: {
      notificationId,
      target: JSON.stringify(payload.target),
      deduplicationKey: payload.deduplicationKey,
    },
  };
  if (record.platform === "ios") return base;
  return {
    ...base,
    priority: "high" as const,
    channelId: ANDROID_CHANNEL_ID,
  };
}

function tokenFormat(token: string | null): "expo" | "exponent" | "invalid" {
  if (!token) return "invalid";
  if (/^ExpoPushToken\[.+\]$/.test(token)) return "expo";
  if (/^ExponentPushToken\[.+\]$/.test(token)) return "exponent";
  return "invalid";
}

async function disableToken(db: FirestoreRest, userId: string, token: string) {
  const docs = await db.listCollectionPages(`usuarios/${userId}/pushTokens`, 100);
  await Promise.all(
    docs
      .filter((doc) => doc.token === token)
      .map((doc) => db.set(doc.path, { enabled: false, updatedAt: new Date() })),
  );
}
