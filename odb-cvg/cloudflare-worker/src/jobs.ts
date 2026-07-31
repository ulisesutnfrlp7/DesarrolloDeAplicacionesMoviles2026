import { assertCanNotifyCourse, type CourseScope } from "./authorization.js";
import {
  coalesceWindowKey,
  deduplicationKey,
  examBatchPathScope,
  itemIdFromPath,
  nextBackoff,
  planillaPathId,
  scopeFromDeliveryPath,
  scopeFromItemPath,
  stableDocumentId,
  subsectionPathArrayFromItemPath,
  validateSourcePath,
} from "./core.js";
import { FirestoreRest, fieldEquals, fieldLessOrEqual } from "./firestore.js";
import { compactMetadata, courseMetadata } from "./metadata.js";
import { emptyNotifyResult, mergeNotifyResult, notifyMany } from "./notifications.js";
import { sendExpoPush } from "./expo.js";
import { resolveNotificationAudienceFromPath, resolveRecipientsForAcademicContext, resolveRecipientsForSingleStudent } from "./recipients.js";
import type { Env, FirebaseToken, NotificationJob, NotificationPayload, NotificationQueueMessage, NotifyResult } from "./types.js";

type JobFeature = "content" | "grades" | "sheets" | "submissions";
const EXAM_PAGE_SIZE = 200;
const EXAM_MAX_PAGES_PER_RUN = 3;
const STAGE_TIMEOUT_MS = 45_000;
const FINALIZE_TIMEOUT_MS = 12_000;
const STALE_PROGRESS_MS = 3 * 60_000;
const RECOVERY_DEBOUNCE_MS = 60_000;
const PUSH_RECIPIENTS_PER_RUN = 1;
const SUBMISSION_JOB_TYPES = [
  "submission_grade",
  "submission_grade_updated",
  "submission_grade_with_resubmission",
  "submission_grade_updated_with_resubmission",
  "resubmission_requested",
  "resubmission_updated",
];
const RESUBMISSION_JOB_TYPES = [
  "resubmission_requested",
  "resubmission_updated",
  "submission_grade_with_resubmission",
  "submission_grade_updated_with_resubmission",
];

interface ProcessJobsSummary {
  found: number;
  enqueued: number;
  skipped: number;
  errors: number;
  recoveredLeases: number;
}

interface DispatchResult {
  recipientsResolved: number;
  notificationsCreated: number;
  notificationsAlreadyExisted: number;
  pushTokensFound: number;
  pushMessagesAccepted: number;
  pushMessagesFailed: number;
  skippedRecipients: number;
  diagnosticCode?: string;
  completed: boolean;
  nextPayload?: Record<string, unknown>;
  remainingWork?: number;
  continuationReason?: string;
  completionReason?: string;
  diagnosticContext?: Record<string, unknown>;
  pushStage?: "pending" | "completed";
  pushCursor?: number;
  pushRecipientsProcessed?: number;
  pushRecipientsRemaining?: number;
  pushContinuationQueued?: boolean;
  pushLastAttemptAt?: Date | null;
}

type PushTask = NotificationPayload;

export async function createJobFromRequest(env: Env, db: FirestoreRest, token: FirebaseToken, body: any): Promise<Response> {
  const type = String(body.type ?? "");
  const sourcePath = String(body.sourcePath ?? "");
  let stage = "reading_user";
  let sourceId = "";
  try {
    if (typeof token.uid !== "string" || !token.uid.trim()) {
      return Response.json({ error: "invalid_user", code: "invalid_user", stage }, { status: 401 });
    }
    const user = await db.get(`usuarios/${token.uid}`);
    if (user?.rol !== "admin" && user?.rol !== "profesor") {
      return Response.json({ error: "forbidden", code: "forbidden", stage }, { status: 403 });
    }

    stage = "validating_source_path";
    if (!validateSourcePath(type, sourcePath)) {
      return Response.json({ error: "invalid_source_path", code: "invalid_source_path", stage }, { status: 400 });
    }

    const payload = sanitizePayload(body.payload);
    stage = "validating_source";
    const scope = await validatedJobScope(db, type, sourcePath, payload);
    stage = "authorizing";
    await assertCanNotifyCourse(db, token.uid, user, scope, featureForJob(type));

    stage = "building_identity";
    sourceId = serverSourceId(type, sourcePath);
    const version = await jobVersion(db, type, sourcePath, payload);
    const key = deduplicationKey([type, sourcePath, sourceId, version]);
    const jobId = await stableDocumentId("job", key);
    stage = "checking_duplicate";
    const existingJob = await db.get(`notification_jobs/${jobId}`);
    if (existingJob) {
      if (existingJob.status === "pending" || existingJob.status === "failed") {
        const queued = await enqueueNotificationJob(env, db, { jobId, reason: "created" });
        return Response.json({ ok: true, jobId, duplicate: true, queued });
      }
      return Response.json({ ok: true, jobId, duplicate: true, queued: false });
    }

    stage = "writing_job";
    await db.set(`notification_jobs/${jobId}`, {
      type,
      sourceId,
      sourcePath,
      courseId: scope.moduloId,
      sectionId: scope.seccionId,
      targetUserId: null,
      payload,
      status: "pending",
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      nextAttemptAt: jobNextAttemptAt(type, new Date()),
      lockedAt: null,
      lockedBy: null,
      leaseId: null,
      leaseExpiresAt: null,
      internalCreatedAt: null,
      pushStage: null,
      pushCursor: null,
      pushRecipientsProcessed: 0,
      pushRecipientsRemaining: null,
      pushContinuationQueued: false,
      pushLastAttemptAt: null,
      deduplicationKey: key,
      eventType: type,
      changeVersion: version,
      createdBy: token.uid,
    }, false);

    stage = "queueing_job";
    const queued = await enqueueNotificationJob(env, db, { jobId, reason: "created" });
    return Response.json({ ok: true, jobId, queued });
  } catch (error: any) {
    const mapped = mapCreateJobError(error);
    console.log("notification_job_request_failed", {
      eventType: type || null,
      sourcePath: safePathForLog(sourcePath),
      sourceId: sourceId || serverSourceId(type, sourcePath) || null,
      status: mapped.status,
      stage,
      error: mapped.code,
      message: String(error?.message ?? error).slice(0, 180),
      stack: typeof error?.stack === "string" ? error.stack.slice(0, 1000) : undefined,
    });
    return Response.json({ error: mapped.code, code: mapped.code, stage }, { status: mapped.status });
  }
}

export async function processJobById(env: Env, db: FirestoreRest, jobId: string, now = new Date(), queueDeliveryAttempt = 0): Promise<"completed" | "pending" | "failed" | "not_found"> {
  const job = await db.get(`notification_jobs/${jobId}`);
  if (!job) return "not_found";
  if (job.status === "completed") return "completed";
  if (!hasVerifiableIdentity(job)) {
    await markLegacyIdentityUnverifiable(db, jobId);
    return "failed";
  }
  if (canCompleteFromExistingMetrics(job) && !hasActiveLease(job, now)) {
    return completeFromExistingMetrics(db, job as NotificationJob, now);
  }
  if (job.status === "failed" && (job.attempts ?? 0) >= Number(env.MAX_JOB_ATTEMPTS ?? 5)) return "failed";
  if ((job.status === "pending" || job.status === "failed") && job.nextAttemptAt && new Date(job.nextAttemptAt).getTime() > now.getTime()) return "pending";
  if (hasActiveLease(job, now)) return "pending";
  return processJob(env, db, job as NotificationJob, now, Number(env.MAX_JOB_ATTEMPTS ?? 5), queueDeliveryAttempt);
}

export async function processDueJobs(env: Env, db: FirestoreRest, now = new Date()): Promise<ProcessJobsSummary> {
  const maxAttempts = Number(env.MAX_JOB_ATTEMPTS ?? 5);
  const orderByNextAttempt = [{ field: { fieldPath: "nextAttemptAt" }, direction: "ASCENDING" }];
  const pending = await db.runQueryPages("notification_jobs", [
    fieldEquals("status", "pending"),
    fieldLessOrEqual("nextAttemptAt", now),
  ], orderByNextAttempt, 50, false, 20);
  const failed = await db.runQueryPages("notification_jobs", [
    fieldEquals("status", "failed"),
    fieldLessOrEqual("nextAttemptAt", now),
  ], orderByNextAttempt, 50, false, 20);
  const processing = await db.runQueryPages("notification_jobs", [
    fieldEquals("status", "processing"),
  ], [], 50, false, 20);
  const expiredProcessing = processing.filter((job) => shouldRecoverProcessingJob(job, now));

  const jobs = [...pending, ...failed, ...expiredProcessing]
    .filter((job, index, arr) => arr.findIndex((item) => item.path === job.path) === index)
    .filter((job) => (job.attempts ?? 0) < maxAttempts);

  const summary: ProcessJobsSummary = {
    found: jobs.length,
    enqueued: 0,
    skipped: 0,
    errors: 0,
    recoveredLeases: 0,
  };

  for (const job of jobs) {
    if (job.status === "processing") {
      const recovered = await recoverProcessingJob(db, job, now);
      if (!recovered) {
        summary.skipped += 1;
        continue;
      }
      summary.recoveredLeases += 1;
    }
    if (canCompleteFromExistingMetrics(job)) {
      const completed = await completeFromExistingMetrics(db, job as NotificationJob, now);
      if (completed === "completed") {
        summary.skipped += 1;
        continue;
      }
    }
    const queued = await enqueueNotificationJob(env, db, { jobId: job.id, reason: "recovery" });
    if (queued) summary.enqueued += 1;
    else summary.errors += 1;
  }
  return summary;
}

export async function enqueueNotificationJob(env: Env, db: FirestoreRest, message: NotificationQueueMessage, delaySeconds?: number): Promise<boolean> {
  try {
    await env.NOTIFICATION_QUEUE.send(message, delaySeconds ? { delaySeconds } : undefined);
    const update: Record<string, unknown> = {
      queuedAt: new Date(),
      lastQueueReason: message.reason,
      queuePublishAttempts: 0,
    };
    if (message.reason !== "retry") {
      update.diagnosticCode = message.reason === "recovery" ? "recovery_enqueued" : "queued";
    }
    await db.set(`notification_jobs/${message.jobId}`, update);
    console.log("job_enqueued", { jobId: message.jobId, reason: message.reason, delaySeconds: delaySeconds ?? 0 });
    return true;
  } catch (error: any) {
    await db.set(`notification_jobs/${message.jobId}`, {
      diagnosticCode: "queue_publish_failed",
      queuePublishAttempts: 1,
      queueLastError: String(error?.message ?? error).slice(0, 200),
      updatedAt: new Date(),
    });
    console.log("job_enqueue_failed", { jobId: message.jobId, reason: message.reason, error: String(error?.message ?? error).slice(0, 160) });
    return false;
  }
}

export async function getJobDiagnostic(db: FirestoreRest, jobId: string): Promise<Record<string, unknown> | null> {
  const job = await db.get(`notification_jobs/${jobId}`);
  if (!job) return null;
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    attempts: job.attempts ?? 0,
    createdAt: job.createdAt ?? null,
    updatedAt: job.updatedAt ?? null,
    nextAttemptAt: job.nextAttemptAt ?? null,
    leaseExpiresAt: job.leaseExpiresAt ?? null,
    recipientsResolved: job.recipientsResolved ?? 0,
    notificationsCreated: job.notificationsCreated ?? 0,
    notificationsAlreadyExisted: job.notificationsAlreadyExisted ?? 0,
    pushTokensFound: job.pushTokensFound ?? 0,
    pushMessagesAccepted: job.pushMessagesAccepted ?? 0,
    pushMessagesFailed: job.pushMessagesFailed ?? 0,
    pushStage: job.pushStage ?? null,
    pushCursor: job.pushCursor ?? job.payload?.pushCursor ?? null,
    pushRecipientsProcessed: job.pushRecipientsProcessed ?? null,
    pushRecipientsRemaining: job.pushRecipientsRemaining ?? null,
    pushContinuationQueued: job.pushContinuationQueued ?? null,
    pushLastAttemptAt: job.pushLastAttemptAt ?? null,
    diagnosticCode: job.diagnosticCode ?? null,
    completionReason: job.completionReason ?? null,
    continuationReason: job.continuationReason ?? null,
    remainingWork: job.remainingWork ?? null,
    queueDeliveryAttempt: job.queueDeliveryAttempt ?? null,
    eventType: job.eventType ?? job.type,
    changeVersion: job.changeVersion ?? null,
    queuedAt: job.queuedAt ?? null,
    lastQueueReason: job.lastQueueReason ?? null,
    queuePublishAttempts: job.queuePublishAttempts ?? 0,
    consumerStartedAt: job.consumerStartedAt ?? null,
    consumerFinishedAt: job.consumerFinishedAt ?? null,
    cursor: job.payload?.cursor ?? null,
    lease: {
      lockedAt: job.lockedAt ?? null,
      lockedBy: job.lockedBy ?? null,
      leaseId: job.leaseId ?? null,
      leaseExpiresAt: job.leaseExpiresAt ?? null,
    },
    lastError: typeof job.lastError === "string" ? job.lastError.slice(0, 240) : null,
  };
}

export async function retryJob(env: Env, db: FirestoreRest, jobId: string): Promise<{ ok: boolean; queued: boolean }> {
  const job = await db.get(`notification_jobs/${jobId}`);
  if (!job) return { ok: false, queued: false };
  await db.set(`notification_jobs/${jobId}`, {
    status: "pending",
    updatedAt: new Date(),
    nextAttemptAt: new Date(),
    lockedAt: null,
    lockedBy: null,
    leaseId: null,
    leaseExpiresAt: null,
    lastError: null,
    diagnosticCode: "manual_retry",
    manualRetryAt: new Date(),
    pushContinuationQueued: false,
  });
  return { ok: true, queued: await enqueueNotificationJob(env, db, { jobId, reason: "retry" }) };
}

export async function processJob(env: Env, db: FirestoreRest, job: NotificationJob, now = new Date(), maxAttempts = 5, queueDeliveryAttempt = 0): Promise<"completed" | "pending" | "failed"> {
  const jobPath = `notification_jobs/${job.id}`;
  const attempts = (job.attempts ?? 0) + 1;
  const leaseId = crypto.randomUUID();
  const startedAt = Date.now();
  const previousStatus = job.status;
  const leaseAcquired = await acquireLease(db, jobPath, job, leaseId, attempts, now, queueDeliveryAttempt);
  if (!leaseAcquired) {
    console.log("lease_not_acquired", { jobId: job.id, type: job.type, previousStatus });
    return "pending";
  }
  console.log("notification job start", { jobId: job.id, type: job.type, previousStatus, newStatus: "processing", attempts });

  try {
    await updateProcessingStage(db, jobPath, leaseId, "loading_source");
    const result = await withTimeout(
      () => dispatchJob(env, db, job, jobPath, leaseId),
      STAGE_TIMEOUT_MS,
      "job_processing_timeout",
    );
    await updateProcessingStage(db, jobPath, leaseId, "finalizing");
    if (!(await ownsLease(db, jobPath, leaseId))) {
      console.log("lease_mismatch", { jobId: job.id, type: job.type, processingStage: "finalizing", leaseId, durationMs: Date.now() - startedAt });
      return "pending";
    }
    const internalCount = result.notificationsCreated + result.notificationsAlreadyExisted;
    if (result.recipientsResolved === 0 || internalCount === 0) {
      const diagnosticCode = result.recipientsResolved === 0 ? (result.diagnosticCode ?? "no_recipients_resolved") : "no_internal_notifications_created";
      const newStatus = attempts >= maxAttempts ? "failed" : "pending";
      await writeFinalStateWithLease(db, jobPath, leaseId, {
        status: newStatus,
        attempts,
        updatedAt: new Date(),
        nextAttemptAt: nextBackoff(attempts),
        lockedAt: null,
        lockedBy: null,
        leaseId: null,
        leaseExpiresAt: null,
        lastError: diagnosticCode,
        diagnosticCode,
        diagnosticContext: result.diagnosticContext ?? null,
        completionReason: null,
        continuationReason: diagnosticCode,
        remainingWork: result.remainingWork ?? null,
        recipientsResolved: result.recipientsResolved,
        notificationsCreated: result.notificationsCreated,
        notificationsAlreadyExisted: result.notificationsAlreadyExisted,
        pushTokensFound: result.pushTokensFound,
        pushMessagesAccepted: result.pushMessagesAccepted,
        pushMessagesFailed: result.pushMessagesFailed,
        pushStage: result.pushStage ?? null,
        pushCursor: result.pushCursor ?? null,
        pushRecipientsProcessed: result.pushRecipientsProcessed ?? null,
        pushRecipientsRemaining: result.pushRecipientsRemaining ?? null,
        pushContinuationQueued: result.pushContinuationQueued ?? false,
        pushLastAttemptAt: result.pushLastAttemptAt ?? null,
        skippedRecipients: result.skippedRecipients,
        processingDurationMs: Date.now() - startedAt,
        consumerFinishedAt: new Date(),
        processingStage: "finalizing",
        lastProgressAt: new Date(),
      }, "diagnostic_stop");
      console.log("notification job diagnostic stop", {
        jobId: job.id,
        type: job.type,
        previousStatus: "processing",
        newStatus,
        durationMs: Date.now() - startedAt,
        recipientsResolved: result.recipientsResolved,
        notificationsCreated: result.notificationsCreated,
        diagnosticCode,
      });
      return newStatus;
    }
    if (!result.completed) {
      const nextCursor = result.nextPayload?.cursor;
      const nextPushCursor = result.nextPayload?.pushCursor;
      const hasValidContinuation =
        (Number.isFinite(Number(nextCursor)) && Number(nextCursor) > Number(job.payload?.cursor ?? 0)) ||
        (Number.isFinite(Number(nextPushCursor)) && Number(nextPushCursor) >= Number(job.payload?.pushCursor ?? 0)) ||
        (Boolean(result.continuationReason) && Number(result.remainingWork ?? 0) > 0);
      if (!hasValidContinuation && !result.remainingWork) {
        console.log("notification job continuation suppressed", {
          jobId: job.id,
          type: job.type,
          reason: "missing_valid_cursor",
        });
      } else {
      await writeFinalStateWithLease(db, jobPath, leaseId, {
        status: "pending",
        payload: result.nextPayload ?? job.payload ?? {},
        updatedAt: new Date(),
        nextAttemptAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        leaseId: null,
        leaseExpiresAt: null,
        recipientsResolved: result.recipientsResolved,
        notificationsCreated: result.notificationsCreated,
        notificationsAlreadyExisted: result.notificationsAlreadyExisted,
        pushTokensFound: result.pushTokensFound,
        pushMessagesAccepted: result.pushMessagesAccepted,
        pushMessagesFailed: result.pushMessagesFailed,
        pushStage: result.pushStage ?? null,
        pushCursor: result.pushCursor ?? null,
        pushRecipientsProcessed: result.pushRecipientsProcessed ?? null,
        pushRecipientsRemaining: result.pushRecipientsRemaining ?? null,
        pushContinuationQueued: result.pushContinuationQueued ?? true,
        pushLastAttemptAt: result.pushLastAttemptAt ?? null,
        skippedRecipients: result.skippedRecipients,
        diagnosticCode: result.diagnosticCode ?? "page_incomplete",
        completionReason: null,
        continuationReason: result.continuationReason ?? "page_incomplete",
        remainingWork: result.remainingWork ?? null,
        processingDurationMs: Date.now() - startedAt,
        consumerFinishedAt: new Date(),
        processingStage: "finalizing",
        lastProgressAt: new Date(),
      }, "continuation");
      console.log("notification job paused", {
        jobId: job.id,
        type: job.type,
        previousStatus: "processing",
        newStatus: "pending",
        durationMs: Date.now() - startedAt,
        recipientCount: result.recipientsResolved,
        notificationsCreated: result.notificationsCreated,
      });
      await enqueueNotificationJob(
        env,
        db,
        { jobId: job.id, reason: "retry" },
        result.continuationReason?.startsWith("push_") ? undefined : 5,
      );
      return "pending";
      }
    }
    console.log("job_finalize_started", {
      jobId: job.id,
      type: job.type,
      processingStage: "finalizing",
      leaseId,
      attempt: attempts,
      recipientsResolved: result.recipientsResolved,
      notificationsCreated: result.notificationsCreated,
      notificationsAlreadyExisted: result.notificationsAlreadyExisted,
    });
    await writeFinalStateWithLease(db, jobPath, leaseId, {
      status: "completed",
      processedAt: new Date(),
      completedAt: new Date(),
      updatedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      leaseId: null,
      leaseExpiresAt: null,
      lastError: null,
      diagnosticCode: result.diagnosticCode ?? "ok",
      completionReason: result.completionReason ?? "all_internal_notifications_created_or_existing",
      continuationReason: null,
      remainingWork: 0,
      recipientsResolved: result.recipientsResolved,
      notificationsCreated: result.notificationsCreated,
      notificationsAlreadyExisted: result.notificationsAlreadyExisted,
      pushTokensFound: result.pushTokensFound,
      pushMessagesAccepted: result.pushMessagesAccepted,
      pushMessagesFailed: result.pushMessagesFailed,
      pushStage: result.pushStage ?? "completed",
      pushCursor: result.pushCursor ?? null,
      pushRecipientsProcessed: result.pushRecipientsProcessed ?? null,
      pushRecipientsRemaining: result.pushRecipientsRemaining ?? 0,
      pushContinuationQueued: false,
      pushLastAttemptAt: result.pushLastAttemptAt ?? null,
      skippedRecipients: result.skippedRecipients,
      processingDurationMs: Date.now() - startedAt,
      consumerFinishedAt: new Date(),
      processingStage: "finalizing",
      lastProgressAt: new Date(),
    }, "completed");
    console.log("job_finalize_success", {
      jobId: job.id,
      type: job.type,
      processingStage: "finalizing",
      leaseId,
      durationMs: Date.now() - startedAt,
      recipientsResolved: result.recipientsResolved,
      notificationsCreated: result.notificationsCreated,
      notificationsAlreadyExisted: result.notificationsAlreadyExisted,
      diagnosticCode: result.diagnosticCode ?? "ok",
    });
    console.log("notification job completed", {
      jobId: job.id,
      type: job.type,
      previousStatus: "processing",
      newStatus: "completed",
      durationMs: Date.now() - startedAt,
      recipientCount: result.recipientsResolved,
      notificationsCreated: result.notificationsCreated,
    });
    return "completed";
  } catch (error: any) {
    const currentOnError = await safeGet(db, jobPath);
    const currentStage = currentOnError?.processingStage ?? "unknown";
    if (String(error?.message ?? error).includes("timeout")) {
      const event = currentStage === "resolving_recipients"
        ? "recipients_resolution_timeout"
        : currentStage === "creating_notifications"
          ? "notifications_creation_timeout"
          : currentStage === "finalizing"
            ? "job_finalize_failed"
            : "job_stage_timeout";
      console.log(event, {
        jobId: job.id,
        type: job.type,
        processingStage: currentStage,
        leaseId,
        attempt: attempts,
        durationMs: Date.now() - startedAt,
        recipientsResolved: currentOnError?.recipientsResolved ?? 0,
        notificationsCreated: currentOnError?.notificationsCreated ?? 0,
        notificationsAlreadyExisted: currentOnError?.notificationsAlreadyExisted ?? 0,
        diagnosticCode: "stage_timeout",
        error: String(error?.message ?? error).slice(0, 160),
      });
    }
    const stillOwnsLease = await ownsLease(db, jobPath, leaseId);
    if (!stillOwnsLease) {
      console.log("lease_mismatch", { jobId: job.id, type: job.type, processingStage: "finalizing", leaseId, durationMs: Date.now() - startedAt });
      return "pending";
    }
    const newStatus = attempts >= maxAttempts ? "failed" : "pending";
    const diagnosticCode = String(error?.message ?? error).includes("timeout")
      ? "stage_timeout"
      : "exception";
    try {
      await writeFinalStateWithLease(db, jobPath, leaseId, {
        status: newStatus,
        attempts,
        updatedAt: new Date(),
        nextAttemptAt: nextBackoff(attempts),
        lockedAt: null,
        lockedBy: null,
        leaseId: null,
        leaseExpiresAt: null,
        lastError: String(error?.message ?? error).slice(0, 500),
        diagnosticCode,
        completionReason: null,
        continuationReason: "exception_retry",
        remainingWork: null,
        processingDurationMs: Date.now() - startedAt,
        consumerFinishedAt: new Date(),
        processingStage: "finalizing",
        lastProgressAt: new Date(),
      }, "exception");
    } catch (finalizeError: any) {
      const current = await db.get(jobPath);
      if (current?.status === "completed") return "completed";
      console.log("job_finalize_failed", {
        jobId: job.id,
        type: job.type,
        processingStage: "finalizing",
        leaseId,
        diagnosticCode,
        error: String(finalizeError?.message ?? finalizeError).slice(0, 160),
      });
      throw finalizeError;
    }
    console.log("notification job failed", {
      jobId: job.id,
      type: job.type,
      previousStatus: "processing",
      newStatus,
      durationMs: Date.now() - startedAt,
      recipientCount: 0,
      notificationsCreated: 0,
      error: String(error?.message ?? error).slice(0, 160),
    });
    return newStatus;
  }
}

async function writeFinalStateWithLease(
  db: FirestoreRest,
  jobPath: string,
  leaseId: string,
  data: Record<string, unknown>,
  reason: string,
): Promise<"written" | "already_completed"> {
  console.log("job_finalize_started", {
    jobId: jobPath.split("/").pop(),
    processingStage: data.processingStage ?? "finalizing",
    leaseId,
    diagnosticCode: data.diagnosticCode ?? reason,
  });
  return withTimeout(async () => {
    const current = await db.get(jobPath);
    if (current?.status === "completed") return "already_completed";
    if (current && (current.leaseId !== undefined || current.status !== undefined) && current.leaseId !== leaseId) {
      console.log("lease_mismatch", {
        jobId: jobPath.split("/").pop(),
        type: current.type,
        processingStage: data.processingStage ?? "finalizing",
        leaseId,
      });
      throw new Error("lease_mismatch");
    }
    try {
      if (current?.updateTime) {
        await db.setWithUpdateTime(jobPath, data, current.updateTime);
      } else {
        await db.set(jobPath, data);
      }
      return "written";
    } catch (error: any) {
      const latest = await db.get(jobPath);
      if (latest?.status === "completed") return "already_completed";
      if (latest && (latest.leaseId !== undefined || latest.status !== undefined) && latest.leaseId !== leaseId) {
        console.log("lease_mismatch", {
          jobId: jobPath.split("/").pop(),
          type: latest?.type,
          processingStage: data.processingStage ?? "finalizing",
          leaseId,
        });
        throw new Error("lease_mismatch");
      }
      console.log("job_finalize_failed", {
        jobId: jobPath.split("/").pop(),
        type: latest?.type,
        processingStage: data.processingStage ?? "finalizing",
        leaseId,
        diagnosticCode: data.diagnosticCode ?? reason,
        error: String(error?.message ?? error).slice(0, 160),
      });
      if (latest?.updateTime) {
        await db.setWithUpdateTime(jobPath, data, latest.updateTime);
      } else {
        await db.set(jobPath, data);
      }
      return "written";
    }
  }, FINALIZE_TIMEOUT_MS, `finalize_timeout_${reason}`);
}

async function updateProcessingStage(db: FirestoreRest, jobPath: string, leaseId: string, stage: string): Promise<void> {
  const current = await db.get(jobPath);
  if (current && current.leaseId !== undefined && current.leaseId !== leaseId) return;
  const stageChanged = current?.processingStage !== stage;
  if (stageChanged && stage === "resolving_recipients") {
    console.log("recipients_resolution_started", {
      jobId: jobPath.split("/").pop(),
      type: current?.type,
      processingStage: stage,
      leaseId,
      attempt: current?.attempts ?? null,
      cursorPresent: current?.payload?.cursor !== undefined,
      recipientsResolved: current?.recipientsResolved ?? 0,
      notificationsCreated: current?.notificationsCreated ?? 0,
      notificationsAlreadyExisted: current?.notificationsAlreadyExisted ?? 0,
      diagnosticCode: current?.diagnosticCode ?? null,
    });
  }
  if (stageChanged && stage === "creating_notifications") {
    console.log("notifications_creation_started", {
      jobId: jobPath.split("/").pop(),
      type: current?.type,
      processingStage: stage,
      leaseId,
      attempt: current?.attempts ?? null,
      recipientsResolved: current?.recipientsResolved ?? 0,
    });
  }
  if (stageChanged && stage === "processing_push") {
    console.log("push_phase_started", {
      jobId: jobPath.split("/").pop(),
      type: current?.type,
      processingStage: stage,
      leaseId,
      attempt: current?.attempts ?? null,
      cursor: current?.payload?.pushCursor ?? current?.pushCursor ?? 0,
      recipientsResolved: current?.recipientsResolved ?? 0,
      pushTokensFound: current?.pushTokensFound ?? 0,
    });
  }
  await db.set(jobPath, {
    processingStage: stage,
    lastProgressAt: new Date(),
    updatedAt: new Date(),
  });
}

async function ownsLease(db: FirestoreRest, jobPath: string, leaseId: string): Promise<boolean> {
  const current = await safeGet(db, jobPath);
  if (!current) return true;
  if (current.leaseId === undefined && current.status === undefined) return true;
  return current?.leaseId === leaseId && current?.status === "processing";
}

async function safeGet(db: FirestoreRest, path: string): Promise<any | null> {
  try {
    return await db.get(path);
  } catch {
    return null;
  }
}

async function acquireLease(db: FirestoreRest, jobPath: string, job: NotificationJob, leaseId: string, attempts: number, now: Date, queueDeliveryAttempt: number): Promise<boolean> {
  const data = {
    status: "processing",
    attempts,
    updatedAt: now,
    consumerStartedAt: now,
    lockedAt: now,
    lockedBy: "cloudflare-queue",
    leaseId,
    leaseExpiresAt: new Date(now.getTime() + 10 * 60000),
    queueDeliveryAttempt,
  };
  try {
    if ((job as any).updateTime) {
      await db.setWithUpdateTime(jobPath, data, (job as any).updateTime);
    } else {
      await db.set(jobPath, data);
    }
    console.log("lease_acquired", { jobId: job.id, type: job.type, leaseId });
    return true;
  } catch (error: any) {
    console.log("lease_acquire_failed", { jobId: job.id, type: job.type, error: String(error?.message ?? error).slice(0, 120) });
    return false;
  }
}

function hasActiveLease(job: any, now: Date): boolean {
  if (job.status !== "processing") return false;
  if (!job.leaseExpiresAt) return false;
  const expiresAt = new Date(job.leaseExpiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return false;
  const progressAt = job.lastProgressAt ? new Date(job.lastProgressAt).getTime() : NaN;
  if (Number.isFinite(progressAt) && now.getTime() - progressAt > STALE_PROGRESS_MS) return false;
  return true;
}

function shouldRecoverProcessingJob(job: any, now: Date): boolean {
  if (job.status !== "processing") return false;
  if (job.recoveryEnqueuedAt) {
    const lastRecovery = new Date(job.recoveryEnqueuedAt).getTime();
    if (Number.isFinite(lastRecovery) && now.getTime() - lastRecovery < RECOVERY_DEBOUNCE_MS) return false;
  }
  if (!job.leaseExpiresAt) return true;
  const leaseExpiresAt = new Date(job.leaseExpiresAt).getTime();
  if (!Number.isFinite(leaseExpiresAt) || leaseExpiresAt <= now.getTime()) return true;
  if (!job.lastProgressAt) return false;
  const lastProgressAt = new Date(job.lastProgressAt).getTime();
  return Number.isFinite(lastProgressAt) && now.getTime() - lastProgressAt > STALE_PROGRESS_MS;
}

async function recoverProcessingJob(db: FirestoreRest, job: any, now: Date): Promise<boolean> {
  const recoveryReason = !job.leaseExpiresAt
    ? "missing_lease_expires_at"
    : new Date(job.leaseExpiresAt).getTime() <= now.getTime()
      ? "lease_expired"
      : "last_progress_stale";
  const data = {
    status: "pending",
    updatedAt: now,
    nextAttemptAt: now,
    lockedAt: null,
    lockedBy: null,
    leaseId: null,
    leaseExpiresAt: null,
    recoveryReason,
    recoveryEnqueuedAt: now,
    diagnosticCode: "recovered_for_queue",
    continuationReason: recoveryReason,
  };
  try {
    if (job.updateTime) {
      await db.setWithUpdateTime(job.path, data, job.updateTime);
    } else {
      await db.set(job.path, data);
    }
    console.log("job_recovered", {
      jobId: job.id,
      type: job.type,
      processingStage: job.processingStage ?? null,
      leaseId: job.leaseId ?? null,
      diagnosticCode: recoveryReason,
    });
    return true;
  } catch (error: any) {
    console.log("job_recovery_skipped", {
      jobId: job.id,
      type: job.type,
      processingStage: job.processingStage ?? null,
      leaseId: job.leaseId ?? null,
      error: String(error?.message ?? error).slice(0, 160),
    });
    return false;
  }
}

function hasVerifiableIdentity(job: any): boolean {
  return typeof job.deduplicationKey === "string" && job.deduplicationKey.length > 0;
}

function canCompleteFromExistingMetrics(job: any): boolean {
  return job.remainingWork === 0 &&
    Number(job.recipientsResolved ?? 0) > 0 &&
    Number(job.notificationsCreated ?? 0) + Number(job.notificationsAlreadyExisted ?? 0) > 0 &&
    job.pushStage === "completed" &&
    hasVerifiableIdentity(job);
}

async function completeFromExistingMetrics(db: FirestoreRest, job: NotificationJob, now: Date): Promise<"completed" | "pending" | "failed"> {
  const jobPath = `notification_jobs/${job.id}`;
  try {
    await db.set(jobPath, {
      status: "completed",
      processedAt: now,
      completedAt: now,
      updatedAt: now,
      lockedAt: null,
      lockedBy: null,
      leaseId: null,
      leaseExpiresAt: null,
      lastError: null,
      diagnosticCode: "completed_from_existing_internal_notifications",
      completionReason: Number(job.pushTokensFound ?? 0) > 0
        ? "all_internal_notifications_created_or_existing_push_processed"
        : "all_internal_notifications_created_or_existing_no_push_tokens",
      continuationReason: null,
      remainingWork: 0,
      pushStage: "completed",
      pushRecipientsRemaining: 0,
      pushContinuationQueued: false,
      consumerFinishedAt: now,
      processingStage: "finalizing",
      lastProgressAt: now,
    });
    console.log("job_completed_from_existing", {
      jobId: job.id,
      type: job.type,
      recipientsResolved: (job as any).recipientsResolved ?? 0,
      notificationsCreated: (job as any).notificationsCreated ?? 0,
      notificationsAlreadyExisted: (job as any).notificationsAlreadyExisted ?? 0,
    });
    return "completed";
  } catch (error: any) {
    console.log("job_finalize_failed", {
      jobId: job.id,
      type: job.type,
      processingStage: "finalizing",
      diagnosticCode: "complete_from_existing_failed",
      error: String(error?.message ?? error).slice(0, 160),
    });
    return "pending";
  }
}

async function markLegacyIdentityUnverifiable(db: FirestoreRest, jobId: string): Promise<void> {
  await db.set(`notification_jobs/${jobId}`, {
    status: "failed",
    updatedAt: new Date(),
    lockedAt: null,
    lockedBy: null,
    leaseId: null,
    leaseExpiresAt: null,
    lastError: "legacy_identity_unverifiable",
    diagnosticCode: "legacy_identity_unverifiable",
    completionReason: null,
    continuationReason: null,
    remainingWork: null,
    consumerFinishedAt: new Date(),
  });
}

async function withTimeout<T>(factory: () => Promise<T>, ms: number, code: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(code)), ms);
  });
  try {
    return await Promise.race([factory(), timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function isPushTask(value: unknown): value is PushTask {
  return Boolean(value) &&
    typeof value === "object" &&
    typeof (value as PushTask).userId === "string" &&
    typeof (value as PushTask).type === "string" &&
    typeof (value as PushTask).title === "string" &&
    typeof (value as PushTask).body === "string" &&
    typeof (value as PushTask).deduplicationKey === "string" &&
    Boolean((value as PushTask).target);
}

function pushTasksFromPayload(payload: Record<string, unknown> | undefined): PushTask[] {
  const raw = payload?.pushTasks;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isPushTask);
}

function buildPushTasks(userIds: string[], base: Omit<NotificationPayload, "userId">): PushTask[] {
  return [...new Set(userIds)]
    .filter((userId) => typeof userId === "string" && userId.length > 0)
    .map((userId) => ({ ...base, userId }));
}

function addPushContinuation(
  job: NotificationJob,
  notify: NotifyResult,
  tasks: PushTask[],
  extras: Pick<DispatchResult, "diagnosticCode" | "diagnosticContext" | "completionReason"> = {},
): DispatchResult {
  const base = dispatchFromNotify(notify);
  const uniqueTasks = tasks.filter((task, index, arr) => arr.findIndex((item) => item.userId === task.userId && item.deduplicationKey === task.deduplicationKey) === index);
  return {
    ...base,
    completed: false,
    nextPayload: {
      ...(job.payload ?? {}),
      pushTasks: uniqueTasks,
      pushCursor: 0,
    },
    remainingWork: uniqueTasks.length,
    continuationReason: "push_phase_pending",
    diagnosticCode: extras.diagnosticCode ?? "push_phase_pending",
    diagnosticContext: extras.diagnosticContext,
    completionReason: extras.completionReason,
    pushStage: "pending",
    pushCursor: 0,
    pushRecipientsProcessed: 0,
    pushRecipientsRemaining: uniqueTasks.length,
    pushContinuationQueued: true,
    pushLastAttemptAt: null,
  };
}

async function processPushPhase(env: Env, db: FirestoreRest, job: NotificationJob, jobPath: string, leaseId: string, tasks: PushTask[]): Promise<DispatchResult> {
  await updateProcessingStage(db, jobPath, leaseId, "processing_push");
  const startedAt = Date.now();
  const cursor = Math.max(0, Number(job.payload?.pushCursor ?? (job as any).pushCursor ?? 0));
  const total = tasks.length;
  let nextCursor = Math.min(cursor, total);
  let tokensFound = Number((job as any).pushTokensFound ?? 0);
  let accepted = Number((job as any).pushMessagesAccepted ?? 0);
  let failed = Number((job as any).pushMessagesFailed ?? 0);
  const internalCount = Number((job as any).notificationsCreated ?? 0) + Number((job as any).notificationsAlreadyExisted ?? 0);

  console.log("push_phase_started", {
    jobId: job.id,
    type: job.type,
    cursor,
    remaining: Math.max(0, total - cursor),
    processingStage: "processing_push",
  });

  if (total === 0) {
    return {
      recipientsResolved: Number((job as any).recipientsResolved ?? 0),
      notificationsCreated: Number((job as any).notificationsCreated ?? 0),
      notificationsAlreadyExisted: Number((job as any).notificationsAlreadyExisted ?? 0),
      pushTokensFound: tokensFound,
      pushMessagesAccepted: accepted,
      pushMessagesFailed: failed,
      skippedRecipients: Number((job as any).skippedRecipients ?? 0),
      completed: true,
      remainingWork: 0,
      diagnosticCode: "push_no_tasks",
      completionReason: "all_internal_notifications_created_or_existing_no_push_tasks",
      pushStage: "completed",
      pushCursor: 0,
      pushRecipientsProcessed: 0,
      pushRecipientsRemaining: 0,
      pushContinuationQueued: false,
      pushLastAttemptAt: (job as any).pushLastAttemptAt ? new Date((job as any).pushLastAttemptAt) : null,
    };
  }

  const end = Math.min(total, cursor + PUSH_RECIPIENTS_PER_RUN);
  console.log("push_batch_started", {
    jobId: job.id,
    type: job.type,
    cursor,
    batchSize: end - cursor,
    remaining: total - cursor,
  });

  for (let index = cursor; index < end; index += 1) {
    const task = tasks[index];
    const notificationId = await stableDocumentId("notif", task.deduplicationKey);
    const notificationPath = `usuarios/${task.userId}/notifications/${notificationId}`;
    const notification = await db.get(notificationPath);
    if (!notification) {
      failed += 1;
      nextCursor = index + 1;
      console.log("push_recipient_processed", {
        jobId: job.id,
        type: job.type,
        cursor: nextCursor,
        tokensFound,
        accepted,
        failed,
        diagnosticCode: "internal_notification_missing",
      });
      continue;
    }
    if (["sent", "no_tokens", "disabled", "invalid_token"].includes(String(notification.pushStatus ?? ""))) {
      nextCursor = index + 1;
      console.log("push_recipient_processed", {
        jobId: job.id,
        type: job.type,
        cursor: nextCursor,
        tokensFound,
        accepted,
        failed,
        diagnosticCode: "push_already_processed",
      });
      continue;
    }
    try {
      const push = await sendExpoPush(env, db, task);
      tokensFound += push.tokensFound;
      accepted += push.messagesAccepted;
      failed += push.messagesFailed;
      const attemptedAt = new Date();
      await db.set(notificationPath, {
        pushStatus: push.status,
        pushUpdatedAt: attemptedAt,
        pushLastAttemptAt: attemptedAt,
      });
      nextCursor = index + 1;
      await db.set(jobPath, {
        payload: { ...(job.payload ?? {}), pushTasks: tasks, pushCursor: nextCursor },
        pushStage: "pending",
        pushCursor: nextCursor,
        pushRecipientsProcessed: nextCursor,
        pushRecipientsRemaining: Math.max(0, total - nextCursor),
        pushTokensFound: tokensFound,
        pushMessagesAccepted: accepted,
        pushMessagesFailed: failed,
        pushLastAttemptAt: attemptedAt,
        lastProgressAt: attemptedAt,
        updatedAt: attemptedAt,
      });
      console.log("push_recipient_processed", {
        jobId: job.id,
        type: job.type,
        cursor: nextCursor,
        tokensFound: push.tokensFound,
        accepted: push.messagesAccepted,
        failed: push.messagesFailed,
        diagnosticCode: push.status,
      });
    } catch (error: any) {
      const message = String(error?.message ?? error);
      const diagnosticCode = message.includes("subrequests") ? "push_subrequest_budget" : "push_temporary_error";
      console.log(message.includes("subrequests") ? "push_subrequest_budget_guard" : "push_batch_completed", {
        jobId: job.id,
        type: job.type,
        cursor: nextCursor,
        processed: Math.max(0, nextCursor - cursor),
        remaining: Math.max(0, total - nextCursor),
        tokensFound,
        accepted,
        failed,
        durationMs: Date.now() - startedAt,
        diagnosticCode,
        error: message.slice(0, 160),
      });
      return {
        recipientsResolved: Number((job as any).recipientsResolved ?? total),
        notificationsCreated: Number((job as any).notificationsCreated ?? 0),
        notificationsAlreadyExisted: Number((job as any).notificationsAlreadyExisted ?? internalCount),
        pushTokensFound: tokensFound,
        pushMessagesAccepted: accepted,
        pushMessagesFailed: failed,
        skippedRecipients: Number((job as any).skippedRecipients ?? 0),
        completed: false,
        nextPayload: { ...(job.payload ?? {}), pushTasks: tasks, pushCursor: nextCursor },
        remainingWork: Math.max(1, total - nextCursor),
        continuationReason: diagnosticCode,
        diagnosticCode,
        pushStage: "pending",
        pushCursor: nextCursor,
        pushRecipientsProcessed: nextCursor,
        pushRecipientsRemaining: Math.max(1, total - nextCursor),
        pushContinuationQueued: true,
        pushLastAttemptAt: (job as any).pushLastAttemptAt ? new Date((job as any).pushLastAttemptAt) : null,
      };
    }
  }

  const remaining = Math.max(0, total - nextCursor);
  console.log("push_batch_completed", {
    jobId: job.id,
    type: job.type,
    cursor: nextCursor,
    processed: nextCursor - cursor,
    remaining,
    tokensFound,
    accepted,
    failed,
    durationMs: Date.now() - startedAt,
    diagnosticCode: remaining > 0 ? "push_batch_limit" : "push_phase_completed",
  });

  if (remaining > 0) {
    console.log("push_continuation_enqueued", {
      jobId: job.id,
      type: job.type,
      cursor: nextCursor,
      remaining,
      reason: "push_batch_limit",
    });
    return {
      recipientsResolved: Number((job as any).recipientsResolved ?? total),
      notificationsCreated: Number((job as any).notificationsCreated ?? 0),
      notificationsAlreadyExisted: Number((job as any).notificationsAlreadyExisted ?? internalCount),
      pushTokensFound: tokensFound,
      pushMessagesAccepted: accepted,
      pushMessagesFailed: failed,
      skippedRecipients: Number((job as any).skippedRecipients ?? 0),
      completed: false,
      nextPayload: { ...(job.payload ?? {}), pushTasks: tasks, pushCursor: nextCursor },
      remainingWork: remaining,
      continuationReason: "push_batch_limit",
      diagnosticCode: "push_phase_pending",
      pushStage: "pending",
      pushCursor: nextCursor,
      pushRecipientsProcessed: nextCursor,
      pushRecipientsRemaining: remaining,
      pushContinuationQueued: true,
      pushLastAttemptAt: new Date(),
    };
  }

  console.log("push_phase_completed", {
    jobId: job.id,
    type: job.type,
    cursor: nextCursor,
    processed: nextCursor,
    tokensFound,
    accepted,
    failed,
    durationMs: Date.now() - startedAt,
    completionReason: tokensFound > 0
      ? "all_internal_notifications_created_or_existing_push_processed"
      : "all_internal_notifications_created_or_existing_no_push_tokens",
  });
  return {
    recipientsResolved: Number((job as any).recipientsResolved ?? total),
    notificationsCreated: Number((job as any).notificationsCreated ?? 0),
    notificationsAlreadyExisted: Number((job as any).notificationsAlreadyExisted ?? internalCount),
    pushTokensFound: tokensFound,
    pushMessagesAccepted: accepted,
    pushMessagesFailed: failed,
    skippedRecipients: Number((job as any).skippedRecipients ?? 0),
    completed: true,
    remainingWork: 0,
    diagnosticCode: "ok",
    completionReason: tokensFound > 0
      ? "all_internal_notifications_created_or_existing_push_processed"
      : "all_internal_notifications_created_or_existing_no_push_tokens",
    pushStage: "completed",
    pushCursor: nextCursor,
    pushRecipientsProcessed: nextCursor,
    pushRecipientsRemaining: 0,
    pushContinuationQueued: false,
    pushLastAttemptAt: new Date(),
  };
}

async function dispatchJob(env: Env, db: FirestoreRest, job: NotificationJob, jobPath: string, leaseId: string): Promise<DispatchResult> {
  const existingPushTasks = pushTasksFromPayload(job.payload);
  if ((job as any).pushStage === "pending" || existingPushTasks.length > 0) {
    return processPushPhase(env, db, job, jobPath, leaseId, existingPushTasks);
  }

  if (job.type === "exam_grade" || job.type === "exam_grade_updated") {
    await updateProcessingStage(db, jobPath, leaseId, "resolving_recipients");
    const payload = job.payload ?? {};
    const batch = examBatchPathScope(job.sourcePath);
    if (!batch || typeof payload.nombreExamen !== "string") throw new Error("invalid_exam_batch");
    const filters = [
      fieldEquals("moduloId", batch.moduloId),
      fieldEquals("seccionId", batch.seccionId),
      fieldEquals("nombreExamen", payload.nombreExamen),
      fieldEquals("notificationBatchId", batch.batchId),
    ];
    if (typeof payload.subseccionPath === "string") filters.push(fieldEquals("subseccionPath", payload.subseccionPath));
    const startOffset = Number(job.payload?.cursor ?? 0);
    let offset = startOffset;
    let pages = 0;
    let lastPageCount = 0;
    const total = emptyNotifyResult();
    const pushTasks: PushTask[] = [];
    for (; pages < EXAM_MAX_PAGES_PER_RUN; pages += 1) {
      const notes = await db.runQuery("notas", filters, [], EXAM_PAGE_SIZE, false, offset);
      lastPageCount = notes.length;
      console.log("recipients_page_loaded", {
        jobId: job.id,
        type: job.type,
        processingStage: "resolving_recipients",
        leaseId,
        attempt: job.attempts ?? 0,
        cursorPresent: offset > 0,
        pageSize: notes.length,
      });
      for (const note of notes) {
        const users = await resolveRecipientsForSingleStudent(db, note.alumnoUid ?? note.alumnoId);
        const metadata = compactMetadata({
          ...(await courseMetadata(db, { moduloId: note.moduloId, seccionId: note.seccionId, subseccionPath: note.subseccionPath })),
          examTitle: note.nombreExamen,
          publishedAt: note.fechaCarga,
        });
        await updateProcessingStage(db, jobPath, leaseId, "creating_notifications");
        const base = {
          type: job.type,
          title: job.type === "exam_grade_updated" ? "Calificacion actualizada" : "Nueva calificacion",
          body: job.type === "exam_grade_updated" ? `Se actualizo una calificacion de ${note.nombreExamen ?? "un examen"}.` : `Tenes una nueva calificacion de ${note.nombreExamen ?? "un examen"}.`,
          target: { kind: "grade", moduloId: note.moduloId, seccionId: note.seccionId, subseccionPath: note.subseccionPath || undefined, nombreExamen: note.nombreExamen },
          sourceId: note.id,
          courseId: note.moduloId ?? note.seccionId,
          deduplicationKey: notificationDeduplicationKey(job),
          metadata,
        };
        mergeNotifyResult(total, await notifyMany(env, db, users, base));
        pushTasks.push(...buildPushTasks(users, base));
      }
      offset += notes.length;
      if (notes.length < EXAM_PAGE_SIZE) break;
    }
    console.log("recipients_resolution_completed", {
      jobId: job.id,
      type: job.type,
      processingStage: "resolving_recipients",
      leaseId,
      durationMs: 0,
      cursorPresent: offset > startOffset,
      recipientsResolved: total.attempted,
      notificationsCreated: total.created,
      notificationsAlreadyExisted: total.alreadyExisted,
      remainingWork: lastPageCount < EXAM_PAGE_SIZE ? 0 : 1,
    });
    if (lastPageCount < EXAM_PAGE_SIZE) {
      return addPushContinuation(job, total, pushTasks, { completionReason: "exam_batch_finished" });
    }
    return {
      ...dispatchFromNotify(total),
      completed: false,
      nextPayload: { ...(job.payload ?? {}), cursor: offset },
      remainingWork: 1,
      continuationReason: "exam_batch_page_limit",
    };
  }

  const source = await db.get(job.sourcePath);
  if (!source) throw new Error("source_not_found");
  await updateProcessingStage(db, jobPath, leaseId, "resolving_context");

  if (job.type === "schedule_event_created" || job.type === "schedule_event_updated") {
    const eventDate = toDate(source.fecha);
    if (!eventDate) throw new Error("invalid_event_date");
    await updateProcessingStage(db, jobPath, leaseId, "resolving_recipients");
    const users = await resolveRecipientsForAcademicContext(db, {
      moduloId: source.moduloId,
      seccionId: source.seccionId,
      subseccionPath: source.comisionSubseccionId,
    });
    logRecipientsCompleted(job, leaseId, users.length, 0);
    const metadata = compactMetadata({
      ...(await courseMetadata(db, {
        moduloId: source.moduloId,
        seccionId: source.seccionId,
        comisionSubseccionId: source.comisionSubseccionId,
      })),
      moduleTitle: source.moduloTitulo,
      commissionTitle: source.comisionTitulo,
      eventTitle: source.titulo,
      eventType: source.tipo,
      eventDate,
      location: source.ubicacion ?? source.lugar,
      description: source.descripcion,
    });
    await updateProcessingStage(db, jobPath, leaseId, "creating_notifications");
    const base = {
      type: job.type,
      title: job.type === "schedule_event_updated" ? "Evento actualizado" : "Nuevo evento del cronograma",
      body: job.type === "schedule_event_updated" ? `${source.titulo ?? "Un evento"} fue actualizado en el cronograma.` : `${source.titulo ?? "Un evento"} fue agregado al cronograma.`,
      target: { kind: "schedule_event", eventId: source.id, eventType: source.tipo, moduloId: source.moduloId, seccionId: source.seccionId },
      sourceId: source.id,
      courseId: source.moduloId ?? null,
      deduplicationKey: notificationDeduplicationKey(job),
      metadata,
    };
    const notify = await notifyMany(env, db, users, base);
    await updateProcessingStage(db, jobPath, leaseId, "sending_push");
    return addPushContinuation(job, notify, buildPushTasks(users, base), {
      diagnosticContext: safeDiagnosticContext({ moduloId: source.moduloId, seccionId: source.seccionId }, metadata),
    });
  }

  if (job.type === "schedule_reminder") {
    if (job.sourcePath.startsWith("eventos_cronograma/")) {
      const eventDate = toDate(source.fecha);
      if (!eventDate) throw new Error("invalid_event_date");
      const users = await resolveRecipientsForAcademicContext(db, {
        moduloId: source.moduloId,
        seccionId: source.seccionId,
        subseccionPath: source.comisionSubseccionId,
      });
      logRecipientsCompleted(job, leaseId, users.length, 0);
      const metadata = compactMetadata({
        ...(await courseMetadata(db, {
          moduloId: source.moduloId,
          seccionId: source.seccionId,
          comisionSubseccionId: source.comisionSubseccionId,
        })),
        moduleTitle: source.moduloTitulo,
        commissionTitle: source.comisionTitulo,
        eventTitle: source.titulo,
        eventType: source.tipo,
        eventDate,
        location: source.ubicacion ?? source.lugar,
        description: source.descripcion,
      });
      const scheduleVersion = primitiveJobPart(job.payload?.scheduleVersion, 1);
      const offsetMinutes = primitiveJobPart(job.payload?.offsetMinutes, 0);
      const base = {
        type: "schedule_reminder",
        title: reminderTitle(source.titulo ?? "Evento", source.tipo, eventDate),
        body: `${source.titulo ?? "Evento"} esta programado en el cronograma.`,
        target: { kind: "schedule_event", eventId: source.id, eventType: source.tipo, moduloId: source.moduloId, seccionId: source.seccionId },
        sourceId: source.id,
        courseId: source.moduloId ?? null,
        deduplicationKey: notificationDeduplicationKey(job),
        metadata,
      };
      const notify = await notifyMany(env, db, users, base);
      return addPushContinuation(job, notify, buildPushTasks(users, base), {
        diagnosticContext: safeDiagnosticContext({ moduloId: source.moduloId, seccionId: source.seccionId }, metadata),
      });
    }

    const scope = scopeFromItemPath(job.sourcePath);
    if (!scope) throw new Error("invalid_delivery_path");
    const deliveryReminderStartedAt = Date.now();
    const jobDiagnosticCode = (job as any).diagnosticCode ?? null;
    console.log("delivery_reminder_processing_started", {
      jobId: job.id,
      createdByRole: await roleForCreator(db, source),
      sourcePathValid: true,
      ancestorLevels: scope.subseccionPath?.split("/").filter(Boolean).length ?? 0,
      processingStage: "loading_source",
      diagnosticCode: jobDiagnosticCode,
    });
    const deadline = toDate(source.fechaLimiteAt) ?? parseDeliveryDeadline(source.fechaLimite, source.fechaLimiteHora);
    if (!deadline) throw new Error("invalid_delivery_deadline");
    console.log("delivery_reminder_context_resolved", {
      jobId: job.id,
      createdByRole: await roleForCreator(db, source),
      sourcePathValid: true,
      ancestorLevels: scope.subseccionPath?.split("/").filter(Boolean).length ?? 0,
      audienceType: scope.subseccionPath ? "academic_path_with_subsections" : "academic_path_direct",
      processingStage: "resolving_context",
      diagnosticCode: jobDiagnosticCode,
    });
    const users = await resolveRecipientsForAcademicContext(db, { ...scope, sourcePath: job.sourcePath });
    console.log("delivery_reminder_audience_resolved", {
      jobId: job.id,
      createdByRole: await roleForCreator(db, source),
      sourcePathValid: true,
      ancestorLevels: scope.subseccionPath?.split("/").filter(Boolean).length ?? 0,
      audienceType: scope.subseccionPath ? "academic_path_with_subsections" : "academic_path_direct",
      recipientsResolved: users.length,
      processingStage: "resolving_recipients",
      diagnosticCode: jobDiagnosticCode,
    });
    logRecipientsCompleted(job, leaseId, users.length, 0);
    const metadata = compactMetadata({
      ...(await courseMetadata(db, { ...scope, sourcePath: job.sourcePath })),
      assignmentTitle: source.titulo,
      itemTitle: source.titulo,
      eventType: "entrega",
      deadline,
      description: source.descripcionEntrega,
    });
    const scheduleVersion = primitiveJobPart(job.payload?.scheduleVersion, 1);
    const offsetMinutes = primitiveJobPart(job.payload?.offsetMinutes, 0);
    const base = {
      type: "schedule_reminder",
      title: reminderTitle(source.titulo ?? "Entrega", "entrega", deadline),
      body: `${source.titulo ?? "Entrega"} tiene una fecha limite en el cronograma.`,
      target: { kind: "delivery", moduloId: scope.moduloId, seccionId: scope.seccionId, itemId: source.id, ...(scope.subseccionPath ? { subseccionPath: scope.subseccionPath } : {}) },
      sourceId: source.id,
      courseId: scope.moduloId,
      deduplicationKey: notificationDeduplicationKey(job),
      metadata,
    };
    const notify = await notifyMany(env, db, users, base);
    console.log("delivery_reminder_internal_created", {
      jobId: job.id,
      createdByRole: await roleForCreator(db, source),
      recipientsResolved: users.length,
      notificationsCreated: notify.created,
      notificationsAlreadyExisted: notify.alreadyExisted,
      processingStage: "creating_notifications",
      diagnosticCode: jobDiagnosticCode,
    });
    console.log("delivery_reminder_processing_finished", {
      jobId: job.id,
      createdByRole: await roleForCreator(db, source),
      recipientsResolved: users.length,
      processingStage: "sending_push",
      duration: Date.now() - deliveryReminderStartedAt,
      diagnosticCode: jobDiagnosticCode,
    });
    return addPushContinuation(job, notify, buildPushTasks(users, base), {
      diagnosticContext: safeDiagnosticContext(scope, metadata),
    });
  }

  if (["new_content", "content_updated", "delivery_space_created", "delivery_space_updated"].includes(job.type)) {
    const scope = scopeFromItemPath(job.sourcePath);
    if (!scope) throw new Error("invalid_item_path");
    if ((job.type === "delivery_space_created" || job.type === "delivery_space_updated") && source.tipo !== "entrega") throw new Error("source_not_delivery");
    await updateProcessingStage(db, jobPath, leaseId, "resolving_recipients");
    const audience = await resolveNotificationAudienceFromPath(db, job.sourcePath);
    const users = audience.recipients;
    logRecipientsCompleted(job, leaseId, users.length, 0, audience.diagnosticReason);
    const isDelivery = source.tipo === "entrega";
    const metadata = compactMetadata({
      ...(await courseMetadata(db, { ...scope, sourcePath: job.sourcePath })),
      itemTitle: source.titulo,
      assignmentTitle: isDelivery ? source.titulo : undefined,
      contentType: source.tipo,
      deadline: source.fechaLimiteAt ?? source.fechaLimite ?? null,
      description: source.descripcionEntrega ?? source.contenido,
      publishedAt: source.fechaCreacion ?? source.fechaActualizacion,
      authorName: source.autorNombre,
    });
    const notificationType = isDelivery
      ? (job.type === "delivery_space_updated" || job.type === "content_updated" ? "delivery_space_updated" : "delivery_space_created")
      : (job.type === "content_updated" ? "content_updated" : "new_content");
    await updateProcessingStage(db, jobPath, leaseId, "creating_notifications");
    const base = {
      type: notificationType,
      title: isDelivery
        ? notificationType === "delivery_space_updated" ? "Entrega actualizada" : "Nuevo espacio de entrega"
        : notificationType === "content_updated" ? "Contenido actualizado" : "Nuevo contenido",
      body: isDelivery
        ? notificationType === "delivery_space_updated" ? `Se actualizo una entrega: ${source.titulo ?? "Entrega"}.` : `Se habilito una entrega: ${source.titulo ?? "Entrega"}.`
        : notificationType === "content_updated" ? `Se actualizo contenido: ${source.titulo ?? "Contenido"}.` : `Hay nuevo contenido disponible: ${source.titulo ?? "Contenido"}.`,
      target: isDelivery
        ? { kind: "delivery", moduloId: scope.moduloId, seccionId: scope.seccionId, itemId: source.id, ...(scope.subseccionPath ? { subseccionPath: scope.subseccionPath, subsectionPath: subsectionPathArrayFromItemPath(job.sourcePath) } : {}) }
        : { kind: "content", moduloId: scope.moduloId, seccionId: scope.seccionId, itemId: source.id, subsectionPath: subsectionPathArrayFromItemPath(job.sourcePath), ...(scope.subseccionPath ? { subseccionPath: scope.subseccionPath } : {}) },
      sourceId: source.id,
      courseId: scope.moduloId,
      deduplicationKey: notificationDeduplicationKey(job),
      metadata,
    };
    const notify = await notifyMany(env, db, users, base);
    await updateProcessingStage(db, jobPath, leaseId, "sending_push");
    return addPushContinuation(job, notify, buildPushTasks(users, base), {
      diagnosticCode: audience.diagnosticReason,
      diagnosticContext: safeDiagnosticContext({ ...scope, audienceType: audience.audienceType, restrictedPath: audience.restrictedPath }, metadata),
    });
  }

  if (SUBMISSION_JOB_TYPES.includes(job.type)) {
    const scope = scopeFromDeliveryPath(job.sourcePath);
    if (!scope) throw new Error("invalid_delivery_path");
    const item = await db.get(job.sourcePath.split("/entregas_alumnos/")[0]);
    const users = await resolveRecipientsForSingleStudent(db, source.alumnoUid ?? source.alumnoId);
    const isRe = RESUBMISSION_JOB_TYPES.includes(job.type);
    const title = submissionNotificationTitle(job.type);
    const body = submissionNotificationBody(job.type);
    const metadata = compactMetadata({
      ...(await courseMetadata(db, { ...scope, sourcePath: job.sourcePath })),
      assignmentTitle: item?.titulo ?? source.titulo,
      itemTitle: item?.titulo ?? source.titulo,
      publishedAt: source.fechaActualizacion ?? source.fechaEntrega,
      description: isRe ? "Revisa las observaciones de la entrega en la app." : undefined,
      deadline: item?.fechaLimiteAt ?? item?.fechaLimite ?? null,
    });
    await updateProcessingStage(db, jobPath, leaseId, "creating_notifications");
    const base = {
      type: job.type,
      title,
      body,
      target: isRe
        ? { kind: "delivery", moduloId: scope.moduloId, seccionId: scope.seccionId, itemId: scope.itemId, entregaId: source.id, ...(scope.subseccionPath ? { subseccionPath: scope.subseccionPath } : {}) }
        : { kind: "grade", moduloId: scope.moduloId, seccionId: scope.seccionId, subseccionPath: scope.subseccionPath, entregaItemId: scope.itemId, entregaId: source.id },
      sourceId: source.id,
      courseId: scope.moduloId,
      deduplicationKey: notificationDeduplicationKey(job),
      metadata,
    };
    const notify = await notifyMany(env, db, users, base);
    await updateProcessingStage(db, jobPath, leaseId, "sending_push");
    return addPushContinuation(job, notify, buildPushTasks(users, base), {
      diagnosticContext: safeDiagnosticContext(scope, metadata),
    });
  }

  if (job.type === "tp_sheet_created" || job.type === "tp_sheet_updated") {
    const version = job.type === "tp_sheet_updated" ? job.deduplicationKey : (source.fechaCreacion ?? source.fechaActualizacion);
    const users = await resolveRecipientsForSingleStudent(db, source.alumnoUid ?? source.alumnoId);
    const metadata = compactMetadata({
      ...(await courseMetadata(db, { moduloId: source.moduloId, seccionId: source.seccionId, subseccionPath: source.subseccionPath })),
      sheetTitle: source.titulo,
      publishedAt: source.fechaActualizacion ?? source.fechaCreacion,
    });
    const base = {
      type: job.type,
      title: job.type === "tp_sheet_created" ? "Nueva planilla de TP" : "Planilla actualizada",
      body: job.type === "tp_sheet_created" ? "Tenes una nueva planilla de trabajos practicos." : "Tu planilla de trabajos practicos fue actualizada.",
      target: { kind: "tp_sheet", planillaId: source.id, moduloId: source.moduloId ?? undefined, seccionId: source.seccionId, subseccionPath: source.subseccionPath ?? null },
      sourceId: source.id,
      courseId: source.moduloId ?? source.seccionId,
      deduplicationKey: notificationDeduplicationKey(job),
      metadata,
    };
    const notify = await notifyMany(env, db, users, base);
    return addPushContinuation(job, notify, buildPushTasks(users, base), {
      diagnosticContext: safeDiagnosticContext({ moduloId: source.moduloId, seccionId: source.seccionId, subseccionPath: source.subseccionPath }, metadata),
    });
  }

  throw new Error(`unsupported_job_${job.type}`);
}

function dispatchFromNotify(result: NotifyResult): Omit<DispatchResult, "completed" | "nextPayload" | "diagnosticContext"> {
  return {
    recipientsResolved: result.attempted,
    notificationsCreated: result.created,
    notificationsAlreadyExisted: result.alreadyExisted,
    pushTokensFound: result.pushTokensFound,
    pushMessagesAccepted: result.pushMessagesAccepted,
    pushMessagesFailed: result.pushMessagesFailed,
    skippedRecipients: result.failed,
  };
}

function notificationDeduplicationKey(job: NotificationJob): string {
  return job.deduplicationKey || deduplicationKey([
    (job as any).eventType ?? job.type,
    job.sourcePath,
    job.sourceId,
    (job as any).changeVersion ?? "",
  ]);
}

function safeDiagnosticContext(scope: Record<string, unknown>, metadata: Record<string, unknown>) {
  return compactMetadata({
    moduloId: scope.moduloId,
    seccionId: scope.seccionId,
    subseccionPath: scope.subseccionPath,
    commissionId: metadata.commissionId,
    isInsideCommission: metadata.isInsideCommission,
    displayContextLabel: metadata.displayContextLabel,
  });
}

function logRecipientsCompleted(job: NotificationJob, leaseId: string, recipientsResolved: number, remainingWork = 0, diagnosticCode?: string): void {
  console.log("recipients_resolution_completed", {
    jobId: job.id,
    type: job.type,
    processingStage: "resolving_recipients",
    leaseId,
    attempt: job.attempts ?? 0,
    cursorPresent: job.payload?.cursor !== undefined,
    recipientsResolved,
    remainingWork,
    diagnosticCode: diagnosticCode ?? null,
  });
}

function sanitizePayload(payload: any) {
  if (!payload || typeof payload !== "object") return {};
  return Object.fromEntries(
    Object.entries(payload)
      .filter(([key]) => ["subseccionPath", "nombreExamen", "batchId"].includes(key))
      .slice(0, 8),
  );
}

async function validatedJobScope(db: FirestoreRest, type: string, sourcePath: string, payload: Record<string, unknown>): Promise<CourseScope> {
  if (["new_content", "content_updated", "delivery_space_created", "delivery_space_updated"].includes(type)) {
    const scope = scopeFromItemPath(sourcePath);
    const source = scope ? await db.get(sourcePath) : null;
    if (!scope || !source) throw new Error("source_not_found");
    if ((type === "delivery_space_created" || type === "delivery_space_updated") && source.tipo !== "entrega") throw new Error("source_not_delivery");
    return scope;
  }
  if (SUBMISSION_JOB_TYPES.includes(type)) {
    const scope = scopeFromDeliveryPath(sourcePath);
    if (!scope || !(await db.get(sourcePath))) throw new Error("source_not_found");
    console.log("submission_path_parsed", {
      eventType: type,
      moduloId: scope.moduloId,
      seccionId: scope.seccionId,
      subsecciones: scope.subseccionPath?.split("/").filter(Boolean).length ?? 0,
      itemId: scope.itemId,
      entregaId: scope.entregaId,
    });
    return scope;
  }
  if (type === "tp_sheet_created" || type === "tp_sheet_updated") {
    const planillaId = planillaPathId(sourcePath);
    const source = planillaId ? await db.get(sourcePath) : null;
    if (!source?.moduloId || !source?.seccionId) throw new Error("invalid_sheet_source");
    return { moduloId: source.moduloId, seccionId: source.seccionId, subseccionPath: source.subseccionPath ?? null };
  }
  if (type === "exam_grade" || type === "exam_grade_updated") {
    const batch = examBatchPathScope(sourcePath);
    if (!batch || typeof payload.nombreExamen !== "string") throw new Error("invalid_exam_batch");
    const filters = [
      fieldEquals("moduloId", batch.moduloId),
      fieldEquals("seccionId", batch.seccionId),
      fieldEquals("nombreExamen", payload.nombreExamen),
      fieldEquals("notificationBatchId", batch.batchId),
    ];
    if (typeof payload.subseccionPath === "string") filters.push(fieldEquals("subseccionPath", payload.subseccionPath));
    const notes = await db.runQuery("notas", filters, [], 1);
    if (notes.length === 0) throw new Error("exam_batch_empty");
    return { moduloId: batch.moduloId, seccionId: batch.seccionId, subseccionPath: typeof payload.subseccionPath === "string" ? payload.subseccionPath : null };
  }
  if (type === "schedule_event_created" || type === "schedule_event_updated") {
    const source = await db.get(sourcePath);
    if (!source) throw new Error("source_not_found");
    return {
      moduloId: source.moduloId,
      seccionId: source.seccionId,
      subseccionPath: source.comisionSubseccionId ?? null,
    };
  }
  throw new Error("unsupported_job_type");
}

function featureForJob(type: string): JobFeature {
  if (["new_content", "content_updated", "delivery_space_created", "delivery_space_updated", "schedule_event_created", "schedule_event_updated"].includes(type)) return "content";
  if (["exam_grade", "exam_grade_updated"].includes(type)) return "grades";
  if (SUBMISSION_JOB_TYPES.includes(type)) return "submissions";
  if (type === "tp_sheet_created" || type === "tp_sheet_updated") return "sheets";
  return "content";
}

function serverSourceId(type: string, sourcePath: string) {
  if (type === "exam_grade" || type === "exam_grade_updated") return examBatchPathScope(sourcePath)?.batchId ?? "";
  if (type === "tp_sheet_created" || type === "tp_sheet_updated") return planillaPathId(sourcePath) ?? "";
  if (SUBMISSION_JOB_TYPES.includes(type)) return scopeFromDeliveryPath(sourcePath)?.entregaId ?? "";
  if (type === "schedule_event_created" || type === "schedule_event_updated") return sourcePath.split("/").at(-1) ?? "";
  return itemIdFromPath(sourcePath) ?? "";
}

async function jobVersion(db: FirestoreRest, type: string, sourcePath: string, payload: Record<string, unknown>) {
  if (type === "exam_grade" || type === "exam_grade_updated") return examBatchPathScope(sourcePath)?.batchId ?? "";
  const source = await db.get(sourcePath);
  if (isUpdatedJobType(type)) {
    return source?.fechaActualizacion ?? source?.updatedAt ?? source?.version ?? source?.changeId ?? coalesceWindowKey(new Date(), 0.5);
  }
  return source?.fechaActualizacion ?? source?.fechaCreacion ?? source?.fechaCarga ?? source?.fechaEntrega ?? coalesceWindowKey(new Date(), 10);
}

function isUpdatedJobType(type: string) {
  return type.endsWith("_updated") || type.includes("_updated_with_");
}

function jobNextAttemptAt(type: string, now: Date) {
  if (type !== "tp_sheet_updated") return now;
  const windowMs = 30 * 1000;
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs + windowMs);
}

export async function createScheduleReminderJob(env: Env, db: FirestoreRest, params: {
  sourcePath: string;
  sourceId: string;
  courseId?: string | null;
  sectionId?: string | null;
  offsetMinutes: number;
  scheduleVersion: number;
  dueAt?: string;
  reason?: "created" | "retry" | "recovery";
}): Promise<{ jobId: string; queued: boolean; duplicate: boolean }> {
  const key = deduplicationKey(["schedule_reminder_job", params.sourcePath, params.dueAt ?? "", params.scheduleVersion, params.offsetMinutes]);
  const jobId = await stableDocumentId("job", key);
  const existing = await db.get(`notification_jobs/${jobId}`);
  if (!existing) {
    await db.set(`notification_jobs/${jobId}`, {
      type: "schedule_reminder",
      sourceId: params.sourceId,
      sourcePath: params.sourcePath,
      courseId: params.courseId ?? null,
      sectionId: params.sectionId ?? null,
      targetUserId: null,
      payload: {
        offsetMinutes: params.offsetMinutes,
        scheduleVersion: params.scheduleVersion,
        dueAt: params.dueAt ?? null,
      },
      status: "pending",
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      nextAttemptAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      leaseId: null,
      leaseExpiresAt: null,
      pushStage: null,
      pushCursor: null,
      pushRecipientsProcessed: 0,
      pushRecipientsRemaining: null,
      pushContinuationQueued: false,
      deduplicationKey: key,
      eventType: "schedule_reminder",
      changeVersion: `${params.dueAt ?? "schedule"}:${params.scheduleVersion}:${params.offsetMinutes}`,
      createdBy: "schedule",
    }, false);
  }
  return { jobId, duplicate: !!existing, queued: await enqueueNotificationJob(env, db, { jobId, reason: params.reason ?? "created" }) };
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  if (value && typeof value === "object" && typeof (value as any).toDate === "function") {
    const parsed = (value as any).toDate();
    return parsed instanceof Date && Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  if (value && typeof value === "object") {
    const seconds = typeof (value as any).seconds === "number"
      ? (value as any).seconds
      : typeof (value as any)._seconds === "number"
        ? (value as any)._seconds
        : null;
    if (seconds !== null) {
      const nanoseconds = typeof (value as any).nanoseconds === "number"
        ? (value as any).nanoseconds
        : typeof (value as any)._nanoseconds === "number"
          ? (value as any)._nanoseconds
          : 0;
      const parsed = new Date(seconds * 1000 + Math.floor(nanoseconds / 1_000_000));
      return Number.isFinite(parsed.getTime()) ? parsed : null;
    }
  }
  return null;
}

function parseDeliveryDeadline(value: unknown, legacyTime?: unknown): Date | null {
  if (typeof value !== "string") return toDate(value);
  if (!value.trim()) return null;
  const raw = value.trim();
  const time = typeof legacyTime === "string" && /^\d{2}:\d{2}$/.test(legacyTime)
    ? legacyTime
    : "23:59";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T${time}:00-03:00`);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  const timestamp = toDate(value);
  if (timestamp) return timestamp;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function reminderTitle(title: string, type: string, eventDate: Date, now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  const today = formatter.format(now);
  const eventDay = formatter.format(eventDate);
  const when = eventDay === today
    ? "hoy"
    : eventDay === formatter.format(new Date(now.getTime() + 86400000))
      ? "mañana"
      : `dentro de ${Math.max(1, Math.round((new Date(`${eventDay}T00:00:00-03:00`).getTime() - new Date(`${today}T00:00:00-03:00`).getTime()) / 86400000))} dias`;
  return `${title} ${type === "entrega" ? "vence" : "es"} ${when}`;
}

function primitiveJobPart(value: unknown, fallback: string | number): string | number {
  return typeof value === "string" || typeof value === "number" ? value : fallback;
}

async function roleForCreator(db: FirestoreRest, source: any): Promise<string | null> {
  const uid = source?.creadoPor ?? source?.creadoPorUid ?? source?.profesorId ?? null;
  if (typeof uid !== "string" || !uid) return null;
  try {
    const user = await db.get(`usuarios/${uid}`);
    const role = String(user?.rol ?? "").trim().toLowerCase();
    return role || "unknown";
  } catch {
    return "unknown";
  }
}

function submissionNotificationTitle(type: string): string {
  if (type === "submission_grade_with_resubmission") return "Entrega calificada con reentrega";
  if (type === "submission_grade_updated_with_resubmission") return "Calificacion actualizada con reentrega";
  if (type === "submission_grade_updated") return "Calificacion de entrega actualizada";
  if (type === "resubmission_updated") return "Reentrega actualizada";
  if (type === "resubmission_requested") return "Reentrega solicitada";
  return "Entrega calificada";
}

function submissionNotificationBody(type: string): string {
  if (type === "submission_grade_with_resubmission") {
    return "Tu entrega fue calificada y se solicito una reentrega. Revisa las observaciones.";
  }
  if (type === "submission_grade_updated_with_resubmission") {
    return "Se actualizo la calificacion y se solicito una reentrega. Revisa las observaciones.";
  }
  if (type === "submission_grade_updated") return "Se actualizo la revision de una entrega. Ingresa para ver el detalle.";
  if (type === "resubmission_requested" || type === "resubmission_updated") return "Revisa las observaciones de la entrega en la app.";
  return "Tu entrega fue revisada. Ingresa para ver la calificacion.";
}

function mapCreateJobError(error: unknown): { status: number; code: string } {
  const message = String((error as any)?.message ?? error);
  if (message === "source_not_found" || message === "course_not_found" || message === "section_not_found" || message === "subsection_not_found" || message === "item_not_found" || message === "exam_batch_empty") {
    return { status: 404, code: message };
  }
  if (message === "forbidden_role" ||
    message === "professor_not_authorized_for_course" ||
    message === "invalid_role" ||
    message === "no_professor_permission_in_path" ||
    message === "forbidden") {
    return { status: 403, code: message };
  }
  if (message.startsWith("invalid_") ||
    message === "unsupported_job_type" ||
    message === "source_not_delivery") {
    return { status: 400, code: message };
  }
  return { status: 500, code: "internal_error" };
}

function safePathForLog(path: string): string | null {
  if (!path) return null;
  const parts = path.split("/");
  if (parts.length <= 8) return path;
  return `${parts.slice(0, 6).join("/")}/.../${parts.slice(-2).join("/")}`;
}
