import { computeNextNotificationAt, scopeFromItemPath } from "./core.js";
import { FirestoreRest, fieldEquals, fieldGreaterOrEqual, fieldLessOrEqual } from "./firestore.js";
import { createScheduleReminderJob } from "./jobs.js";
import { resolveRecipientsForAcademicContext, resolveRecipientsForEventScope } from "./recipients.js";
import type { Env, Reminder } from "./types.js";

const SCHEDULE_TOLERANCE_MS = 8 * 60 * 1000;

export interface ScheduleProcessSummary {
  eventsFound: number;
  deliveriesFound: number;
  processedEvents: number;
  processedDeliveries: number;
  remindersProcessed: number;
  jobsEnqueued: number;
  notificationsCreated: number;
  noRecipients: number;
  invalidSchedules: number;
  skipped: number;
  errors: number;
}

interface ScheduleItemResult {
  processed: number;
  jobsEnqueued: number;
  notificationsCreated: number;
  skipped: number;
  noRecipients: number;
  invalidSchedules: number;
}

export async function processScheduleReminders(env: Env, db: FirestoreRest, now = new Date()): Promise<ScheduleProcessSummary> {
  const window = scheduleWindow(now);
  const orderByNext = [{ field: { fieldPath: "notificationSchedule.nextNotificationAt" }, direction: "ASCENDING" }];
  console.log("schedule cron start", { now: now.toISOString(), from: window.from.toISOString(), to: window.to.toISOString() });

  const events = await db.runQueryPages("eventos_cronograma", [
    fieldEquals("notificationSchedule.enabled", true),
    fieldGreaterOrEqual("notificationSchedule.nextNotificationAt", window.from),
    fieldLessOrEqual("notificationSchedule.nextNotificationAt", window.to),
  ], orderByNext, 100, false, 20);
  console.log("schedule events found", { count: events.length });

  const summary: ScheduleProcessSummary = {
    eventsFound: events.length,
    deliveriesFound: 0,
    processedEvents: 0,
    processedDeliveries: 0,
    remindersProcessed: 0,
    jobsEnqueued: 0,
    notificationsCreated: 0,
    noRecipients: 0,
    invalidSchedules: 0,
    skipped: 0,
    errors: 0,
  };

  for (const event of events) {
    try {
      const result = await processCronogramaEvent(env, db, event, now);
      summary.processedEvents += result.processed > 0 ? 1 : 0;
      summary.remindersProcessed += result.processed;
      summary.jobsEnqueued += result.jobsEnqueued;
      summary.notificationsCreated += result.notificationsCreated;
      summary.noRecipients += result.noRecipients ?? 0;
      summary.invalidSchedules += result.invalidSchedules ?? 0;
      summary.skipped += result.skipped;
    } catch (error: any) {
      summary.errors += 1;
      console.log("schedule event error", { id: event.id, error: String(error?.message ?? error).slice(0, 160) });
    }
  }

  const deliveries = await db.runQueryPages("items", [
    fieldEquals("tipo", "entrega"),
    fieldEquals("notificationSchedule.enabled", true),
    fieldGreaterOrEqual("notificationSchedule.nextNotificationAt", window.from),
    fieldLessOrEqual("notificationSchedule.nextNotificationAt", window.to),
  ], orderByNext, 100, true, 20);
  summary.deliveriesFound = deliveries.length;
  console.log("schedule deliveries found", { count: deliveries.length });

  for (const item of deliveries) {
    try {
      const result = await processDeliveryItem(env, db, item, now);
      summary.processedDeliveries += result.processed > 0 ? 1 : 0;
      summary.remindersProcessed += result.processed;
      summary.jobsEnqueued += result.jobsEnqueued;
      summary.notificationsCreated += result.notificationsCreated;
      summary.noRecipients += result.noRecipients ?? 0;
      summary.invalidSchedules += result.invalidSchedules ?? 0;
      summary.skipped += result.skipped;
    } catch (error: any) {
      summary.errors += 1;
      console.log("schedule delivery error", { id: item.id, error: String(error?.message ?? error).slice(0, 160) });
    }
  }

  console.log("schedule cron done", summary);
  return summary;
}

export async function diagnoseScheduleEvent(db: FirestoreRest, eventId: string, now = new Date()): Promise<Record<string, unknown> | null> {
  const event = await db.get(`eventos_cronograma/${eventId}`);
  if (!event) return null;
  const eventDate = toDate(event.fecha);
  const schedule = event.notificationSchedule ?? {};
  const recipients = await resolveRecipientsForEventScope(db, {
    moduloId: event.moduloId,
    seccionId: event.seccionId,
    comisionSubseccionId: event.comisionSubseccionId,
  });
  const due = eventDate ? dueReminders(eventDate, schedule.reminders ?? [], schedule.processed ?? {}, now) : [];
  return {
    eventId,
    scope: event.scope ?? null,
    moduloId: event.moduloId ?? null,
    comisionSubseccionId: event.comisionSubseccionId ?? null,
    nextNotificationAt: schedule.nextNotificationAt ?? null,
    processed: schedule.processed ?? {},
    recipientsResolved: recipients.length,
    dueReminders: due.map((reminder) => reminder.offsetMinutes),
    diagnosticCode: !eventDate
      ? "invalid_event_date"
      : recipients.length === 0
        ? "no_recipients_resolved"
        : due.length === 0
          ? "no_due_reminders"
          : "would_process",
  };
}

async function processCronogramaEvent(env: Env, db: FirestoreRest, event: any, now: Date): Promise<ScheduleItemResult> {
  const eventDate = toDate(event.fecha);
  if (!eventDate) return skip("invalid_event_date", event, { invalidSchedules: 1 });
  if (eventDate.getTime() <= now.getTime()) return skip("event_expired", event);

  const schedule = event.notificationSchedule ?? {};
  const processed = { ...(schedule.processed ?? {}) };
  const due = dueReminders(eventDate, schedule.reminders ?? [], processed, now);
  console.log("schedule event checked", {
    id: event.id,
    nextNotificationAt: String(schedule.nextNotificationAt ?? null),
    due: due.length,
  });
  if (due.length === 0) return skip("no_due_reminders", event);

  const recipients = await resolveRecipientsForEventScope(db, {
    moduloId: event.moduloId,
    seccionId: event.seccionId,
    comisionSubseccionId: event.comisionSubseccionId,
  });
  console.log("schedule event recipients", { id: event.id, count: recipients.length });
  if (recipients.length === 0) return skip("no_recipients_resolved", event, { noRecipients: 1 });

  let jobsEnqueued = 0;
  for (const reminder of due) {
    const queued = await createScheduleReminderJob(env, db, {
      sourcePath: event.path,
      sourceId: event.id,
      courseId: event.moduloId ?? null,
      sectionId: event.seccionId ?? null,
      offsetMinutes: reminder.offsetMinutes,
      scheduleVersion: schedule.version ?? 1,
    });
    if (!queued.queued) return skip("queue_publish_failed", event, { invalidSchedules: 1 });
    jobsEnqueued += 1;
    processed[String(reminder.offsetMinutes)] = true;
  }

  const next = computeNextNotificationAt(eventDate, schedule.reminders ?? [], processed, now, SCHEDULE_TOLERANCE_MS);
  await db.set(event.path, {
    notificationSchedule: { ...schedule, processed, nextNotificationAt: next },
  });
  console.log("schedule event processed", { id: event.id, jobsEnqueued, nextNotificationAt: next?.toISOString() ?? null });
  return { processed: due.length, jobsEnqueued, notificationsCreated: 0, skipped: 0, noRecipients: 0, invalidSchedules: 0 };
}

async function processDeliveryItem(env: Env, db: FirestoreRest, item: any, now: Date): Promise<ScheduleItemResult> {
  console.log("delivery_reminder_candidate_found", {
    id: item?.id ?? null,
    nextNotificationAt: String(item?.notificationSchedule?.nextNotificationAt ?? null),
  });
  if (item?.tipo !== "entrega") {
    console.log("delivery_reminder_skipped", { id: item?.id ?? null, reason: "not_delivery_item" });
    return skip("not_delivery_item", item, { invalidSchedules: 1 });
  }
  if (item?.activo === false || item?.publicado === false || item?.visible === false) {
    console.log("delivery_reminder_skipped", { id: item?.id ?? null, reason: "inactive_item" });
    return skip("inactive_item", item);
  }
  const deadlineSource = item.fechaLimiteAt ?? item.fechaLimite;
  if (!deadlineSource) {
    console.log("delivery_reminder_skipped", { id: item?.id ?? null, reason: "missing_due_at" });
    return skip("missing_due_at", item, { invalidSchedules: 1 });
  }
  const deadline = parseDeliveryDeadline(deadlineSource, item.fechaLimiteHora);
  if (!deadline) {
    console.log("delivery_reminder_skipped", { id: item?.id ?? null, reason: "invalid_due_at" });
    return skip("invalid_due_at", item, { invalidSchedules: 1 });
  }
  console.log("delivery_reminder_due_at_loaded", { id: item.id, dueAt: deadline.toISOString() });
  if (deadline.getTime() <= now.getTime()) {
    console.log("delivery_reminder_skipped", { id: item.id, reason: "outside_window", detail: "delivery_expired" });
    return skip("delivery_expired", item);
  }

  const scope = scopeFromItemPath(item.path);
  if (!scope) {
    console.log("delivery_reminder_skipped", { id: item.id, reason: "invalid_source_path" });
    return skip("invalid_delivery_path", item, { invalidSchedules: 1 });
  }
  const schedule = item.notificationSchedule ?? {};
  if (!schedule.nextNotificationAt) {
    console.log("delivery_reminder_skipped", { id: item.id, reason: "missing_next_notification" });
    return skip("missing_next_notification", item, { invalidSchedules: 1 });
  }
  console.log("delivery_reminder_next_notification_loaded", { id: item.id, nextNotificationAt: String(schedule.nextNotificationAt) });
  const processed = { ...(schedule.processed ?? {}) };
  const due = dueReminders(deadline, schedule.reminders ?? [], processed, now);
  if (due.length === 0) {
    const reason = hasProcessedReminder(deadline, schedule.reminders ?? [], processed, now)
      ? "already_notified"
      : "outside_window";
    console.log(reason === "already_notified" ? "delivery_reminder_skipped" : "delivery_reminder_outside_window", {
      id: item.id,
      reason,
      nextNotificationAt: String(schedule.nextNotificationAt ?? null),
    });
    return skip("no_due_delivery_reminders", item);
  }
  console.log("delivery_reminder_inside_window", { id: item.id, due: due.length });

  const recipients = await resolveRecipientsForAcademicContext(db, { ...scope, sourcePath: item.path });
  if (recipients.length === 0) {
    console.log("delivery_reminder_skipped", { id: item.id, reason: "no_recipients_resolved" });
    return skip("no_recipients_resolved", item, { noRecipients: 1 });
  }
  let jobsEnqueued = 0;
  for (const reminder of due) {
    const queued = await createScheduleReminderJob(env, db, {
      sourcePath: item.path,
      sourceId: item.id,
      courseId: scope.moduloId,
      sectionId: scope.seccionId,
      offsetMinutes: reminder.offsetMinutes,
      scheduleVersion: schedule.version ?? 1,
      dueAt: deadline.toISOString(),
    });
    if (!queued.queued) {
      console.log("delivery_reminder_job_failed", { id: item.id, offsetMinutes: reminder.offsetMinutes, reason: "job_creation_failed" });
      return skip("queue_publish_failed", item, { invalidSchedules: 1 });
    }
    console.log("delivery_reminder_job_created", { id: item.id, offsetMinutes: reminder.offsetMinutes, duplicate: queued.duplicate });
    jobsEnqueued += 1;
    processed[String(reminder.offsetMinutes)] = true;
  }
  const next = computeNextNotificationAt(deadline, schedule.reminders ?? [], processed, now, SCHEDULE_TOLERANCE_MS);
  await db.set(item.path, {
    notificationSchedule: { ...schedule, processed, nextNotificationAt: next },
  });
  console.log("schedule delivery processed", { id: item.id, jobsEnqueued, nextNotificationAt: next?.toISOString() ?? null });
  return { processed: due.length, jobsEnqueued, notificationsCreated: 0, skipped: 0, noRecipients: 0, invalidSchedules: 0 };
}

export function scheduleWindow(now: Date) {
  return {
    from: new Date(now.getTime() - SCHEDULE_TOLERANCE_MS),
    to: now,
  };
}

export function dueReminders(eventDate: Date, reminders: Reminder[], processed: Record<string, boolean>, now: Date) {
  const window = scheduleWindow(now);
  return reminders.filter((reminder) => {
    const at = new Date(eventDate.getTime() - reminder.offsetMinutes * 60000);
    return at.getTime() <= window.to.getTime() &&
      at.getTime() >= window.from.getTime() &&
      !processed[String(reminder.offsetMinutes)];
  });
}

function skip(reason: string, source: any, extra: Partial<{ noRecipients: number; invalidSchedules: number }> = {}): ScheduleItemResult {
  console.log("schedule skipped", { id: source?.id ?? null, reason });
  return { processed: 0, jobsEnqueued: 0, notificationsCreated: 0, skipped: 1, noRecipients: extra.noRecipients ?? 0, invalidSchedules: extra.invalidSchedules ?? 0 };
}

function hasProcessedReminder(eventDate: Date, reminders: Reminder[], processed: Record<string, boolean>, now: Date): boolean {
  const window = scheduleWindow(now);
  return reminders.some((reminder) => {
    const at = new Date(eventDate.getTime() - reminder.offsetMinutes * 60000);
    return at.getTime() <= window.to.getTime() &&
      at.getTime() >= window.from.getTime() &&
      processed[String(reminder.offsetMinutes)] === true;
  });
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  if (typeof value === "object" && typeof (value as any).toDate === "function") {
    const parsed = (value as any).toDate();
    return parsed instanceof Date && Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  if (typeof value === "object") {
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

export function scheduleReminderTitle(title: string, type: string, eventDate: Date, now = new Date()) {
  const when = relativeScheduleLabel(eventDate, now);
  const verb = type === "entrega" ? "vence" : "es";
  return `${title} ${verb} ${when}`;
}

export function relativeScheduleLabel(eventDate: Date, now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  const today = formatter.format(now);
  const eventDay = formatter.format(eventDate);
  if (eventDay === today) return "hoy";
  const tomorrow = formatter.format(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  if (eventDay === tomorrow) return "mañana";
  const startToday = new Date(`${today}T00:00:00-03:00`);
  const startEvent = new Date(`${eventDay}T00:00:00-03:00`);
  const days = Math.max(1, Math.round((startEvent.getTime() - startToday.getTime()) / 86400000));
  return `dentro de ${days} dias`;
}
