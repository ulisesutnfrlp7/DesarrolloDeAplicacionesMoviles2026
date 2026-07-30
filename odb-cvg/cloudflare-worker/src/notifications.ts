import { FirestoreRest } from "./firestore.js";
import { sendExpoPush } from "./expo.js";
import { stableDocumentId } from "./core.js";
import type { Env, NotificationPayload, NotifyResult, PushSendResult } from "./types.js";

export async function notifyStudent(env: Env, db: FirestoreRest, payload: NotificationPayload): Promise<NotifyResult> {
  const notificationId = await stableDocumentId("notif", payload.deduplicationKey);
  const path = `usuarios/${payload.userId}/notifications/${notificationId}`;
  const existing = await db.get(path);
  const result: NotifyResult = emptyNotifyResult(1);

  if (!existing) {
    await db.set(path, {
      type: payload.type,
      title: payload.title,
      body: payload.body,
      createdAt: new Date(),
      readAt: null,
      isRead: false,
      target: payload.target,
      sourceId: payload.sourceId ?? null,
      courseId: payload.courseId ?? null,
      deduplicationKey: payload.deduplicationKey,
      metadata: payload.metadata ?? null,
      pushStatus: "pending",
    }, false);
    result.created = 1;
  } else {
    result.alreadyExisted = 1;
    return result;
  }

  try {
    const push = await sendExpoPush(env, db, payload);
    result.pushTokensFound += push.tokensFound;
    result.pushMessagesAccepted += push.messagesAccepted;
    result.pushMessagesFailed += push.messagesFailed;
    await db.set(path, { pushStatus: push.status, pushUpdatedAt: new Date() });
  } catch (error: any) {
    await db.set(path, {
      pushStatus: "failed",
      pushLastError: String(error?.message ?? error).slice(0, 300),
      pushUpdatedAt: new Date(),
    });
    result.pushMessagesFailed += 1;
  }
  return result;
}

export async function notifyMany(env: Env, db: FirestoreRest, userIds: string[], base: Omit<NotificationPayload, "userId">): Promise<NotifyResult> {
  const unique = [...new Set(userIds)];
  const total = emptyNotifyResult();
  for (let i = 0; i < unique.length; i += 20) {
    const batch = unique.slice(i, i + 20);
    const results = await Promise.allSettled(batch.map((userId) => notifyStudent(env, db, { ...base, userId })));
    results
      .filter((result): result is PromiseFulfilledResult<NotifyResult> => result.status === "fulfilled")
      .forEach((result) => mergeNotifyResult(total, result.value));
    results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .forEach((result) => {
        total.failed += 1;
        console.log("notification recipient failed", { error: String(result.reason?.message ?? result.reason).slice(0, 160) });
      });
  }
  return total;
}

export function emptyNotifyResult(attempted = 0): NotifyResult {
  return {
    attempted,
    created: 0,
    alreadyExisted: 0,
    failed: 0,
    pushTokensFound: 0,
    pushMessagesAccepted: 0,
    pushMessagesFailed: 0,
  };
}

export function mergeNotifyResult(target: NotifyResult, source: NotifyResult): NotifyResult {
  target.attempted += source.attempted;
  target.created += source.created;
  target.alreadyExisted += source.alreadyExisted;
  target.failed += source.failed;
  target.pushTokensFound += source.pushTokensFound;
  target.pushMessagesAccepted += source.pushMessagesAccepted;
  target.pushMessagesFailed += source.pushMessagesFailed;
  return target;
}
