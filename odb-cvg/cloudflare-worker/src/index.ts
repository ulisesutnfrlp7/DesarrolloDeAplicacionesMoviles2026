import { verifyFirebaseIdToken } from "./auth.js";
import { FirestoreRest } from "./firestore.js";
import { createJobFromRequest, getJobDiagnostic, processDueJobs, processJobById, retryJob } from "./jobs.js";
import { diagnoseScheduleEvent, processScheduleReminders } from "./schedules.js";
import type { Env, MessageBatch, NotificationQueueMessage } from "./types.js";

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface ScheduledController {
  scheduledTime: number;
  cron: string;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const db = new FirestoreRest(env);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/jobs") {
      const token = await authenticate(request, env);
      if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
      return createJobFromRequest(env, db, token, await request.json());
    }

    if (request.method === "POST" && url.pathname === "/jobs/process") {
      const token = await authenticate(request, env);
      if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
      const user = await db.get(`usuarios/${token.uid}`);
      if (user?.rol !== "admin") return Response.json({ error: "forbidden" }, { status: 403 });
      const summary = await processDueJobs(env, db);
      return Response.json({ ok: true, ...summary });
    }

    const jobDiagnosticMatch = /^\/diagnostics\/jobs\/([^/]+)$/.exec(url.pathname);
    if (request.method === "GET" && jobDiagnosticMatch) {
      const token = await authenticate(request, env);
      if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
      const user = await db.get(`usuarios/${token.uid}`);
      if (user?.rol !== "admin") return Response.json({ error: "forbidden" }, { status: 403 });
      const diagnostic = await getJobDiagnostic(db, jobDiagnosticMatch[1]);
      return diagnostic ? Response.json({ ok: true, job: diagnostic }) : Response.json({ error: "not_found" }, { status: 404 });
    }

    const jobRetryMatch = /^\/jobs\/([^/]+)\/retry$/.exec(url.pathname);
    if (request.method === "POST" && jobRetryMatch) {
      const token = await authenticate(request, env);
      if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
      const user = await db.get(`usuarios/${token.uid}`);
      if (user?.rol !== "admin") return Response.json({ error: "forbidden" }, { status: 403 });
      const result = await retryJob(env, db, jobRetryMatch[1]);
      return result.ok ? Response.json({ ok: true, queued: result.queued }) : Response.json({ error: "not_found" }, { status: 404 });
    }

    if (request.method === "POST" && url.pathname === "/schedules/process") {
      const token = await authenticate(request, env);
      if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
      const user = await db.get(`usuarios/${token.uid}`);
      if (user?.rol !== "admin") return Response.json({ error: "forbidden" }, { status: 403 });
      const summary = await processScheduleReminders(env, db);
      return Response.json({ ok: true, ...summary });
    }

    if (request.method === "POST" && url.pathname === "/schedules/diagnose") {
      const token = await authenticate(request, env);
      if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });
      const user = await db.get(`usuarios/${token.uid}`);
      if (user?.rol !== "admin") return Response.json({ error: "forbidden" }, { status: 403 });
      const body = await request.json() as { eventId?: string };
      if (!body.eventId) return Response.json({ error: "missing_eventId" }, { status: 400 });
      const diagnostic = await diagnoseScheduleEvent(db, body.eventId);
      return diagnostic ? Response.json({ ok: true, diagnostic }) : Response.json({ error: "not_found" }, { status: 404 });
    }

    return Response.json({ error: "not_found" }, { status: 404 });
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const db = new FirestoreRest(env);
    ctx.waitUntil((async () => {
      await processDueJobs(env, db);
      await processScheduleReminders(env, db);
    })());
  },

  async queue(batch: MessageBatch<NotificationQueueMessage>, env: Env): Promise<void> {
    const db = new FirestoreRest(env);
    await Promise.allSettled(batch.messages.map(async (message) => {
      const startedAt = Date.now();
      const jobId = message.body?.jobId;
      console.log("queue_message_received", { jobId, reason: message.body?.reason, attempt: message.attempts });
      if (!jobId || typeof jobId !== "string") {
        message.ack();
        console.log("queue_message_ack", { jobId: null, diagnosticCode: "invalid_message" });
        return;
      }
      try {
        const status = await processJobById(env, db, jobId, new Date(), message.attempts);
        if (status === "completed" || status === "failed" || status === "not_found") {
          console.log("queue_ack", { jobId, status, attempt: message.attempts, durationMs: Date.now() - startedAt });
          message.ack();
          console.log("queue_message_ack", { jobId, status, durationMs: Date.now() - startedAt });
          return;
        }
        console.log("queue_retry", { jobId, status, attempt: message.attempts, delaySeconds: 30, durationMs: Date.now() - startedAt });
        message.retry({ delaySeconds: 30 });
        console.log("queue_message_retry", { jobId, status, delaySeconds: 30, durationMs: Date.now() - startedAt });
      } catch (error: any) {
        console.log("queue_retry", { jobId, diagnosticCode: "exception", attempt: message.attempts, delaySeconds: 60, error: String(error?.message ?? error).slice(0, 160) });
        message.retry({ delaySeconds: 60 });
        console.log("queue_message_retry", { jobId, diagnosticCode: "exception", error: String(error?.message ?? error).slice(0, 160) });
      }
    }));
  },
};

async function authenticate(request: Request, env: Env) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) return null;
  try {
    return await verifyFirebaseIdToken(match[1], env);
  } catch {
    return null;
  }
}
