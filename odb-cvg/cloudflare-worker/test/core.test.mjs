import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  coalesceWindowKey,
  computeNextNotificationAt,
  deduplicationKey,
  examBatchPathScope,
  nextBackoff,
  offsetMinutes,
  stableDocumentId,
  scopeFromDeliveryPath,
  scopeFromItemPath,
  sha256Hex,
  shouldRetry,
  subsectionPathArrayFromItemPath,
  validateSourcePath,
} from "../lib/core.js";
import { createJobFromRequest, createScheduleReminderJob, processDueJobs, processJob, processJobById } from "../lib/jobs.js";
import { notifyStudent } from "../lib/notifications.js";
import { resolveNotificationAudienceFromPath, resolveStudentsForCourse } from "../lib/recipients.js";
import { dueReminders, processScheduleReminders, scheduleWindow } from "../lib/schedules.js";
import { compactMetadata, courseMetadata } from "../lib/metadata.js";

test("deduplicationKey is stable", () => {
  assert.equal(deduplicationKey(["exam_grade", "notas/x"]), deduplicationKey(["exam_grade", "notas/x"]));
});

test("stable document ids hash deduplication keys with slashes safely", async () => {
  const key = deduplicationKey(["new_content", "modulos/m1/secciones/s1/items/i1"]);
  const id = await stableDocumentId("notif", key);
  assert.match(id, /^notif_sha256_[a-f0-9]{64}$/);
  assert.equal(id.includes("/"), false);
});

test("same input hashes equal and different inputs differ", async () => {
  const a1 = await sha256Hex("new_content:modulos/m1/secciones/s1/items/i1");
  const a2 = await sha256Hex("new_content:modulos/m1/secciones/s1/items/i1");
  const b = await sha256Hex("new_content:modulos/m1/secciones/s1/items/i2");
  assert.equal(a1, a2);
  assert.notEqual(a1, b);
});

test("job and notification ids use different deterministic prefixes", async () => {
  const key = "new_content:modulos/m1/secciones/s1/items/i1";
  assert.match(await stableDocumentId("job", key), /^job_sha256_[a-f0-9]{64}$/);
  assert.match(await stableDocumentId("notif", key), /^notif_sha256_[a-f0-9]{64}$/);
  assert.notEqual(await stableDocumentId("job", key), await stableDocumentId("notif", key));
});

test("free reminders support minutes hours and days", () => {
  assert.equal(offsetMinutes(90, "minutes"), 90);
  assert.equal(offsetMinutes(36, "hours"), 2160);
  assert.equal(offsetMinutes(12, "days"), 17280);
});

test("same moment reminder is valid while event is future", () => {
  const eventDate = new Date("2026-08-01T12:00:00-03:00");
  const next = computeNextNotificationAt(eventDate, [{ id: "0", amount: 0, unit: "minutes", offsetMinutes: 0 }], {}, new Date("2026-08-01T11:45:00-03:00"));
  assert.equal(next?.toISOString(), eventDate.toISOString());
});

test("expired event has no next reminder", () => {
  const next = computeNextNotificationAt(new Date("2026-08-01T12:00:00-03:00"), [], {}, new Date("2026-08-01T12:01:00-03:00"));
  assert.equal(next, null);
});

test("date change recalculates next reminder", () => {
  const reminders = [{ id: "1", amount: 1, unit: "days", offsetMinutes: 1440 }];
  const a = computeNextNotificationAt(new Date("2026-08-10T12:00:00-03:00"), reminders, {}, new Date("2026-08-01T00:00:00-03:00"));
  const b = computeNextNotificationAt(new Date("2026-08-11T12:00:00-03:00"), reminders, {}, new Date("2026-08-01T00:00:00-03:00"));
  assert.notEqual(a?.toISOString(), b?.toISOString());
});

test("event at 18:40 with 15 minute reminder is due at cron 18:30", () => {
  const eventDate = new Date("2026-07-28T18:40:00-03:00");
  const now = new Date("2026-07-28T18:30:00-03:00");
  const due = dueReminders(eventDate, [{ id: "15", amount: 15, unit: "minutes", offsetMinutes: 15 }], {}, now);
  assert.equal(due.length, 1);
});

test("event at 18:40 with 5 minute reminder is due at cron 18:35", () => {
  const eventDate = new Date("2026-07-28T18:40:00-03:00");
  const now = new Date("2026-07-28T18:35:00-03:00");
  const due = dueReminders(eventDate, [{ id: "5", amount: 5, unit: "minutes", offsetMinutes: 5 }], {}, now);
  assert.equal(due.length, 1);
});

test("reminder scheduled four minutes ago is processed by five minute cron tolerance", () => {
  const eventDate = new Date("2026-07-28T18:40:00-03:00");
  const now = new Date("2026-07-28T18:29:00-03:00");
  const due = dueReminders(eventDate, [{ id: "15", amount: 15, unit: "minutes", offsetMinutes: 15 }], {}, now);
  assert.equal(due.length, 1);
});

test("schedule window is tolerant but does not include future reminders", () => {
  const now = new Date("2026-07-28T18:30:00-03:00");
  const window = scheduleWindow(now);
  assert.equal(window.from.toISOString(), new Date("2026-07-28T18:22:00-03:00").toISOString());
  assert.equal(window.to.toISOString(), now.toISOString());
  const future = dueReminders(new Date("2026-07-28T18:40:00-03:00"), [{ id: "5", amount: 5, unit: "minutes", offsetMinutes: 5 }], {}, now);
  assert.equal(future.length, 0);
});

test("modified reminders and modified date recalculate nextNotificationAt", () => {
  const now = new Date("2026-07-28T18:20:00-03:00");
  const eventDate = new Date("2026-07-28T18:40:00-03:00");
  const movedDate = new Date("2026-07-28T19:00:00-03:00");
  const fifteen = [{ id: "15", amount: 15, unit: "minutes", offsetMinutes: 15 }];
  const five = [{ id: "5", amount: 5, unit: "minutes", offsetMinutes: 5 }];
  const a = computeNextNotificationAt(eventDate, fifteen, {}, now, 8 * 60000);
  const b = computeNextNotificationAt(eventDate, five, {}, now, 8 * 60000);
  const c = computeNextNotificationAt(movedDate, fifteen, {}, now, 8 * 60000);
  assert.notEqual(a?.toISOString(), b?.toISOString());
  assert.notEqual(a?.toISOString(), c?.toISOString());
});

test("past reminder outside tolerance is not scheduled retroactively", () => {
  const now = new Date("2026-07-28T18:45:00-03:00");
  const eventDate = new Date("2026-07-28T18:40:00-03:00");
  const due = dueReminders(eventDate, [{ id: "15", amount: 15, unit: "minutes", offsetMinutes: 15 }], {}, now);
  assert.equal(due.length, 0);
});

test("invalid or missing nextNotificationAt does not crash pure window checks", () => {
  assert.equal(Number.isFinite(scheduleWindow(new Date()).from.getTime()), true);
  assert.equal(dueReminders(new Date("invalid"), [], {}, new Date()).length, 0);
});

test("duplicate cron skips already processed offset", () => {
  const eventDate = new Date("2026-07-28T18:40:00-03:00");
  const now = new Date("2026-07-28T18:30:00-03:00");
  const due = dueReminders(eventDate, [{ id: "15", amount: 15, unit: "minutes", offsetMinutes: 15 }], { "15": true }, now);
  assert.equal(due.length, 0);
});

test("delivery deadline reminder detects Firestore Timestamp and does not duplicate successive cron runs", async () => {
  const deadline = new Date("2026-08-01T23:59:00-03:00");
  const now = new Date("2026-08-01T23:45:00-03:00");
  const itemPath = "modulos/m1/secciones/s1/items/i1";
  const docs = {
    "modulos/m1": { titulo: "Modulo" },
    "modulos/m1/secciones/s1": { titulo: "Cursada" },
    [itemPath]: {
      id: "i1",
      path: itemPath,
      tipo: "entrega",
      titulo: "TP 1",
      fechaLimite: { seconds: Math.floor(deadline.getTime() / 1000), nanoseconds: 0 },
      notificationSchedule: {
        enabled: true,
        version: 1,
        reminders: [{ id: "15", amount: 15, unit: "minutes", offsetMinutes: 15 }],
        processed: {},
        nextNotificationAt: new Date("2026-08-01T23:44:00-03:00"),
      },
    },
    "usuarios/a1": { rol: "alumno", activo: true },
  };
  const db = fakeDb(docs, {
    usuarios: [{ id: "a1", rol: "alumno", activo: true }],
    eventos_cronograma: [],
  });
  db.runQueryPages = async (collectionId) => {
    if (collectionId === "items") return [docs[itemPath]];
    if (collectionId === "usuarios") return [{ id: "a1", rol: "alumno", activo: true }];
    return [];
  };
  const env = fakeEnv();
  const first = await processScheduleReminders(env, db, now);
  assert.equal(first.deliveriesFound, 1);
  assert.equal(first.jobsEnqueued, 1);
  assert.equal(env.queueMessages.length, 1);
  assert.equal(docs[itemPath].notificationSchedule.processed["15"], true);

  const second = await processScheduleReminders(env, db, now);
  assert.equal(second.jobsEnqueued, 0);
  assert.equal(env.queueMessages.length, 1);
});

test("delivery deadline reminder respects restricted academic spaces", async () => {
  const deadline = new Date("2026-08-01T23:59:00-03:00");
  const now = new Date("2026-08-01T23:45:00-03:00");
  const itemPath = "modulos/m1/secciones/s1/subsecciones/c1/items/i1";
  const docs = {
    "modulos/m1/secciones/s1": { titulo: "Cursada" },
    "modulos/m1/secciones/s1/subsecciones/c1": { titulo: "Comision 1", esRestringida: true },
    [itemPath]: {
      id: "i1",
      path: itemPath,
      tipo: "entrega",
      titulo: "TP restringido",
      fechaLimite: deadline.toISOString(),
      notificationSchedule: {
        enabled: true,
        version: 1,
        reminders: [{ id: "15", amount: 15, unit: "minutes", offsetMinutes: 15 }],
        processed: {},
        nextNotificationAt: new Date("2026-08-01T23:44:00-03:00"),
      },
    },
    "usuarios/a1": { rol: "alumno", activo: true },
    "usuarios/a2": { rol: "alumno", activo: true },
  };
  const db = fakeDb(docs, {
    inscripciones: [
      { alumnoId: "a1", moduloId: "m1", seccionId: "s1", subseccionPath: "c1" },
      { alumnoId: "a2", moduloId: "m1", seccionId: "s1", subseccionPath: "c2" },
    ],
    eventos_cronograma: [],
  });
  db.runQueryPages = async (collectionId) => {
    if (collectionId === "items") return [docs[itemPath]];
    if (collectionId === "inscripciones") return [
      { alumnoId: "a1", moduloId: "m1", seccionId: "s1", subseccionPath: "c1" },
      { alumnoId: "a2", moduloId: "m1", seccionId: "s1", subseccionPath: "c2" },
    ];
    return [];
  };
  const env = fakeEnv();
  const summary = await processScheduleReminders(env, db, now);
  assert.equal(summary.jobsEnqueued, 1);
  assert.equal(summary.noRecipients, 0);
  assert.equal(env.queueMessages.length, 1);
});

test("delivery deadline reminder uses canonical fechaLimiteAt timestamp", async () => {
  const deadline = new Date("2026-07-30T23:59:00-03:00");
  const now = new Date("2026-07-30T23:45:00-03:00");
  const itemPath = "modulos/m1/secciones/s1/items/i1";
  const docs = {
    "modulos/m1/secciones/s1": { titulo: "Cursada" },
    [itemPath]: {
      id: "i1",
      path: itemPath,
      tipo: "entrega",
      titulo: "TP canonico",
      fechaLimiteAt: { seconds: Math.floor(deadline.getTime() / 1000), nanoseconds: 0 },
      notificationSchedule: {
        enabled: true,
        version: 2,
        reminders: [{ id: "15", amount: 15, unit: "minutes", offsetMinutes: 15 }],
        processed: {},
        nextNotificationAt: new Date("2026-07-30T23:44:00-03:00"),
      },
    },
    "usuarios/a1": { rol: "alumno", activo: true },
  };
  const db = fakeDb(docs, { usuarios: [{ id: "a1", rol: "alumno", activo: true }], eventos_cronograma: [] });
  db.runQueryPages = async (collectionId) => collectionId === "items" ? [docs[itemPath]] : (collectionId === "usuarios" ? [{ id: "a1", rol: "alumno", activo: true }] : []);
  const env = fakeEnv();
  const summary = await processScheduleReminders(env, db, now);
  assert.equal(summary.jobsEnqueued, 1);
  assert.equal(env.queueMessages.length, 1);
});

test("legacy delivery date without time is interpreted as 23:59 Argentina", async () => {
  const now = new Date("2026-07-30T23:55:00-03:00");
  const itemPath = "modulos/m1/secciones/s1/items/i1";
  const docs = {
    "modulos/m1/secciones/s1": { titulo: "Cursada" },
    [itemPath]: {
      id: "i1",
      path: itemPath,
      tipo: "entrega",
      titulo: "TP legacy",
      fechaLimite: "2026-07-30",
      notificationSchedule: {
        enabled: true,
        version: 1,
        reminders: [{ id: "4", amount: 4, unit: "minutes", offsetMinutes: 4 }],
        processed: {},
        nextNotificationAt: new Date("2026-07-30T23:54:00-03:00"),
      },
    },
    "usuarios/a1": { rol: "alumno", activo: true },
  };
  const db = fakeDb(docs, { usuarios: [{ id: "a1", rol: "alumno", activo: true }], eventos_cronograma: [] });
  db.runQueryPages = async (collectionId) => collectionId === "items" ? [docs[itemPath]] : (collectionId === "usuarios" ? [{ id: "a1", rol: "alumno", activo: true }] : []);
  const env = fakeEnv();
  const summary = await processScheduleReminders(env, db, now);
  assert.equal(summary.jobsEnqueued, 1);
  const write = db.writes.find((entry) => entry.path === itemPath);
  assert.equal(write.data.notificationSchedule.processed["4"], true);
});

test("delivery schedule reminder notification metadata includes deadline and delivery target", async () => {
  const deadline = new Date("2026-07-30T23:59:00-03:00");
  const itemPath = "modulos/m1/secciones/s1/items/i1";
  const db = fakeDb({
    "modulos/m1": { titulo: "Modulo" },
    "modulos/m1/secciones/s1": { titulo: "Cursada" },
    [itemPath]: {
      id: "i1",
      tipo: "entrega",
      titulo: "TP recordatorio",
      fechaLimiteAt: { seconds: Math.floor(deadline.getTime() / 1000), nanoseconds: 0 },
      creadoPor: "p1",
    },
    "usuarios/p1": { rol: "profesor" },
    "usuarios/a1": { rol: "alumno", activo: true },
  }, {
    usuarios: [{ id: "a1", rol: "alumno", activo: true }],
  });
  const result = await processJob(fakeEnv(), db, {
    id: "job-delivery-reminder",
    type: "schedule_reminder",
    sourcePath: itemPath,
    sourceId: "i1",
    status: "pending",
    attempts: 0,
    payload: { scheduleVersion: 1, offsetMinutes: 15, dueAt: deadline.toISOString() },
    deduplicationKey: "schedule_reminder_job:m1:s1:i1:deadline",
    eventType: "schedule_reminder",
    changeVersion: `${deadline.toISOString()}:1:15`,
    createdBy: "schedule",
  });
  const notification = db.writes.find((write) => write.path.startsWith("usuarios/a1/notifications/") && write.merge === false);
  assert.equal(result, "completed");
  assert.equal(notification.data.metadata.eventType, "entrega");
  assert.equal(new Date(notification.data.metadata.deadline).toISOString(), deadline.toISOString());
  assert.equal(notification.data.target.kind, "delivery");
  assert.equal(notification.data.target.itemId, "i1");
});

test("retry policy stops after max attempts", () => {
  const now = new Date("2026-08-01T12:00:00Z");
  assert.equal(shouldRetry("failed", 2, 5, now, now), true);
  assert.equal(shouldRetry("failed", 5, 5, now, now), false);
  assert.ok(nextBackoff(2, now).getTime() > now.getTime());
});

test("scopeFromItemPath rejects manipulated paths", () => {
  assert.equal(scopeFromItemPath("../items/x"), null);
  assert.deepEqual(scopeFromItemPath("modulos/m1/secciones/s1/subsecciones/c1/items/i1"), {
    moduloId: "m1",
    seccionId: "s1",
    subseccionPath: "c1",
  });
});

test("clients cannot write notification_jobs directly by Firestore rules", () => {
  const rules = readFileSync("../firestore.rules", "utf8");
  assert.match(rules, /match \/notification_jobs\/\{jobId\}/);
  assert.match(rules, /allow create, update, delete: if false;/);
});

test("notification detail validates invalid ids and missing documents", () => {
  const detail = readFileSync("../app/notificaciones/[id].tsx", "utf8");
  assert.match(detail, /isSafeNotificationDocumentId/);
  assert.match(detail, /Esta notificacion ya no se encuentra disponible/);
  assert.match(detail, /snap\.exists\(\)/);
  assert.match(detail, /router\.replace\("\/\(tabs\)\/notificaciones"/);
});

test("notification detail back goes to notifications and home button remains available", () => {
  const detail = readFileSync("../app/notificaciones/[id].tsx", "utf8");
  const header = readFileSync("../components/ui/ScreenHeader.tsx", "utf8");
  assert.doesNotMatch(detail, /router\.back\(\)/);
  assert.match(detail, /router\.replace\("\/\(tabs\)\/notificaciones"/);
  assert.match(header, /router\.replace\("\/\(tabs\)\/home"/);
});

test("detail supports metadata and fallback without metadata", () => {
  const detail = readFileSync("../app/notificaciones/[id].tsx", "utf8");
  assert.match(detail, /notification\.metadata \?\? \{\}/);
  assert.match(detail, /Informacion/);
  assert.match(detail, /resourceTitle/);
});

test("detail uses ScrollView and accessible bottom padding", () => {
  const detail = readFileSync("../app/notificaciones/[id].tsx", "utf8");
  assert.match(detail, /ScrollView/);
  assert.match(detail, /SafeAreaView/);
  assert.match(detail, /paddingBottom: 120/);
  assert.match(detail, /primaryButton/);
});

test("detail rows are built by notification type with stable ids", () => {
  const detail = readFileSync("../app/notificaciones/[id].tsx", "utf8");
  assert.match(detail, /id: string/);
  assert.match(detail, /key=\{row\.id\}/);
  assert.match(detail, /case "new_content"/);
  assert.match(detail, /case "delivery_space_created"/);
  assert.match(detail, /case "resubmission_requested"/);
  assert.match(detail, /case "schedule_reminder"/);
  assert.doesNotMatch(detail, /key=\{`\$\{row\.label\}-\$\{row\.value\}`\}/);
  assert.doesNotMatch(detail, /metadata\.commissionTitle \?\? metadata\.subsectionTitle/);
});

test("schedule delivery reminders render deadline date and time without changing delivery navigation", () => {
  const detail = readFileSync("../app/notificaciones/[id].tsx", "utf8");
  assert.match(detail, /metadata\.eventType === "entrega"/);
  assert.match(detail, /"deadline-date"/);
  assert.match(detail, /"deadline-time"/);
  assert.match(detail, /formatDate\(metadata\.deadline\)/);
  assert.match(detail, /formatTime\(metadata\.deadline\)/);
  assert.match(detail, /return "Trabajo"/);
  assert.match(detail, /cloud-upload-outline/);
});

test("detail omits generic type and notification creation date rows", () => {
  const detail = readFileSync("../app/notificaciones/[id].tsx", "utf8");
  assert.doesNotMatch(detail, /TYPE_LABELS/);
  assert.doesNotMatch(detail, /notification\.createdAt/);
});

test("metadata hides global technical module sentinel", () => {
  const metadata = compactMetadata({ moduleTitle: "NINGUNO_EN_ESPECIAL", eventTitle: "Parcial" });
  assert.equal("moduleTitle" in metadata, false);
  assert.equal(metadata.eventTitle, "Parcial");
});

test("event scopes resolve global course and commission recipients", async () => {
  const rows = [
    { alumnoId: "a1", moduloId: "m1", seccionId: "s1", subseccionPath: "c1" },
    { alumnoId: "a2", moduloId: "m1", seccionId: "s1", subseccionPath: "c2" },
    { alumnoId: "a3", moduloId: "m2", seccionId: "s1", subseccionPath: "c1" },
  ];
  const db = {
    async runQueryPages(collectionId, filters = []) {
      if (collectionId === "usuarios") return [{ id: "a1", rol: "alumno" }, { id: "a2", rol: "alumno" }, { id: "a3", rol: "alumno" }];
      return rows.filter((row) => filters.every((filter) => {
        const field = filter.fieldFilter?.field?.fieldPath;
        const value = filter.fieldFilter?.value?.stringValue;
        return !field || row[field] === value;
      }));
    },
    async get(path) {
      const id = path.split("/").pop();
      return { id, rol: "alumno", activo: true };
    },
  };
  assert.deepEqual(await resolveStudentsForCourse(db, { moduloId: "NINGUNO_EN_ESPECIAL" }), ["a1", "a2", "a3"]);
  assert.deepEqual(await resolveStudentsForCourse(db, { moduloId: "m1" }), ["a1", "a2"]);
  assert.deepEqual(await resolveStudentsForCourse(db, { moduloId: "m1", comisionSubseccionId: "c1" }), ["a1"]);
});

test("metadata resolves course and subsection titles", async () => {
  const db = fakeDb({
    "modulos/m1": { titulo: "Operatoria Dental II" },
    "modulos/m1/secciones/s1": { titulo: "Cursada" },
    "modulos/m1/secciones/s1/subsecciones/c1": { titulo: "Comision A" },
  });
  const metadata = await courseMetadata(db, { moduloId: "m1", seccionId: "s1", subseccionPath: "c1" });
  assert.equal(metadata.moduleTitle, "Operatoria Dental II");
  assert.equal(metadata.sectionTitle, "Cursada");
  assert.equal(metadata.commissionTitle, "Comision A");
});

test("metadata resolves ancestral commission instead of internal subsection", async () => {
  const db = fakeDb({
    "modulos/m1": { titulo: "Operatoria Dental II" },
    "modulos/m1/secciones/s1": { titulo: "Cursada 2026" },
    "modulos/m1/secciones/s1/subsecciones/c1": { titulo: "Comision 1", esRestringida: true },
    "modulos/m1/secciones/s1/subsecciones/c1/subsecciones/notas": { titulo: "Notas Parciales" },
  });
  const metadata = await courseMetadata(db, {
    sourcePath: "modulos/m1/secciones/s1/subsecciones/c1/subsecciones/notas/items/i1",
  });
  assert.equal(metadata.commissionTitle, "Comision 1");
  assert.equal(metadata.subsectionTitle, "Notas Parciales");
});

test("metadata does not invent commission for academic subsection", async () => {
  const db = fakeDb({
    "modulos/at": { titulo: "Ateneos" },
    "modulos/at/secciones/s1": { titulo: "General" },
    "modulos/at/secciones/s1/subsecciones/a2026": { titulo: "Ateneos 2026" },
  });
  const metadata = await courseMetadata(db, {
    sourcePath: "modulos/at/secciones/s1/subsecciones/a2026/items/i1",
  });
  assert.equal(metadata.commissionTitle, undefined);
  assert.equal(metadata.displayContextLabel, "Seccion");
  assert.equal(metadata.displayContextTitle, "Ateneos 2026");
});

test("public path in module without commissions resolves all active students", async () => {
  const db = fakeDb({
    "modulos/at": { titulo: "Ateneos" },
    "modulos/at/secciones/s1": { titulo: "Ateneos 2026", esRestringida: false },
    "usuarios/a1": { rol: "alumno", activo: true },
    "usuarios/a2": { rol: "alumno", activo: true },
  }, {
    usuarios: [
      { id: "a1", rol: "alumno", activo: true },
      { id: "a2", rol: "alumno", activo: true },
      { id: "p1", rol: "profesor", activo: true },
    ],
  });
  const audience = await resolveNotificationAudienceFromPath(db, "modulos/at/secciones/s1/items/i1");
  assert.equal(audience.audienceType, "all_students");
  assert.deepEqual(audience.recipients, ["a1", "a2"]);
});

test("public section in module with restricted commissions still resolves all active students", async () => {
  const db = fakeDb({
    "modulos/m1/secciones/info": { titulo: "Informacion general" },
  }, {
    usuarios: [{ id: "a1", rol: "alumno" }, { id: "a2", rol: "alumno" }],
  });
  const audience = await resolveNotificationAudienceFromPath(db, "modulos/m1/secciones/info/items/i1");
  assert.equal(audience.audienceType, "all_students");
  assert.deepEqual(audience.recipients, ["a1", "a2"]);
});

test("restricted commission path resolves only enrolled students", async () => {
  const db = fakeDb({
    "modulos/m1/secciones/s1": { titulo: "Cursada" },
    "modulos/m1/secciones/s1/subsecciones/c1": { titulo: "Comision 1", esRestringida: true },
    "usuarios/a1": { rol: "alumno", activo: true },
    "usuarios/a2": { rol: "alumno", activo: true },
  }, {
    inscripciones: [
      { alumnoId: "a1", moduloId: "m1", seccionId: "s1", subseccionPath: "c1" },
      { alumnoId: "a2", moduloId: "m1", seccionId: "s1", subseccionPath: "c2" },
    ],
  });
  const audience = await resolveNotificationAudienceFromPath(db, "modulos/m1/secciones/s1/subsecciones/c1/items/i1");
  assert.equal(audience.audienceType, "restricted_scope");
  assert.deepEqual(audience.recipients, ["a1"]);
});

test("child of restricted commission keeps ancestral restricted scope", async () => {
  const db = fakeDb({
    "modulos/m1/secciones/s1": { titulo: "Cursada" },
    "modulos/m1/secciones/s1/subsecciones/c1": { titulo: "Comision 1", esRestringida: true },
    "modulos/m1/secciones/s1/subsecciones/c1/subsecciones/notas": { titulo: "Notas Parciales" },
    "usuarios/a1": { rol: "alumno", activo: true },
    "usuarios/a2": { rol: "alumno", activo: true },
  }, {
    inscripciones: [
      { alumnoId: "a1", moduloId: "m1", seccionId: "s1", subseccionPath: "c1" },
      { alumnoId: "a2", moduloId: "m1", seccionId: "s1", subseccionPath: "c2" },
    ],
  });
  const audience = await resolveNotificationAudienceFromPath(db, "modulos/m1/secciones/s1/subsecciones/c1/subsecciones/notas/items/i1");
  assert.equal(audience.restrictedId, "c1");
  assert.deepEqual(audience.recipients, ["a1"]);
});

test("restricted non-commission subsection resolves its own enrolled students", async () => {
  const db = fakeDb({
    "modulos/m1/secciones/s1": { titulo: "Publica" },
    "modulos/m1/secciones/s1/subsecciones/g1": { titulo: "Grupo especial", esRestringida: true },
    "usuarios/a1": { rol: "alumno", activo: true },
  }, {
    inscripciones: [{ alumnoUid: "a1", moduloId: "m1", subseccionPath: "g1" }],
  });
  const audience = await resolveNotificationAudienceFromPath(db, "modulos/m1/secciones/s1/subsecciones/g1/items/i1");
  assert.equal(audience.restrictedTitle, "Grupo especial");
  assert.deepEqual(audience.recipients, ["a1"]);
});

test("nested restrictions use the closest restriction to the resource", async () => {
  const db = fakeDb({
    "modulos/m1/secciones/s1": { titulo: "Cursada" },
    "modulos/m1/secciones/s1/subsecciones/c1": { titulo: "Comision 1", esRestringida: true },
    "modulos/m1/secciones/s1/subsecciones/c1/subsecciones/g1": { titulo: "Grupo interno", esRestringida: true },
    "usuarios/a1": { rol: "alumno", activo: true },
    "usuarios/a2": { rol: "alumno", activo: true },
  }, {
    inscripciones: [
      { alumnoId: "a1", moduloId: "m1", subseccionPath: "c1/g1" },
      { alumnoId: "a2", moduloId: "m1", subseccionPath: "c1" },
    ],
  });
  const audience = await resolveNotificationAudienceFromPath(db, "modulos/m1/secciones/s1/subsecciones/c1/subsecciones/g1/items/i1");
  assert.equal(audience.restrictedId, "g1");
  assert.deepEqual(audience.recipients, ["a1"]);
});

test("public section with public subsection resolves all active students", async () => {
  const db = fakeDb({
    "modulos/r1/secciones/s1": { titulo: "Revistas" },
    "modulos/r1/secciones/s1/subsecciones/ed": { titulo: "Edicion 2026" },
  }, {
    usuarios: [{ id: "a1", rol: "alumno" }],
  });
  const audience = await resolveNotificationAudienceFromPath(db, "modulos/r1/secciones/s1/subsecciones/ed/items/i1");
  assert.equal(audience.audienceType, "all_students");
  assert.deepEqual(audience.recipients, ["a1"]);
});

test("item source paths support direct, level one and recursive subsections", () => {
  assert.equal(validateSourcePath("new_content", "modulos/m1/secciones/s1/items/i1"), true);
  assert.equal(validateSourcePath("content_updated", "modulos/m1/secciones/s1/subsecciones/a/items/i1"), true);
  assert.equal(validateSourcePath("delivery_space_updated", "modulos/m1/secciones/s1/subsecciones/a/subsecciones/b/items/i1"), true);
  assert.deepEqual(subsectionPathArrayFromItemPath("modulos/m1/secciones/s1/subsecciones/a/subsecciones/b/items/i1"), ["a", "b"]);
});

test("all students audience paginates deduplicates and excludes non-students", async () => {
  const rows = [
    { id: "a1", rol: "alumno", activo: true },
    { id: "a1", rol: "alumno", activo: true },
    { id: "a2", rol: "alumno", activo: false },
    { id: "p1", rol: "profesor", activo: true },
    { id: "admin1", rol: "admin", activo: true },
  ];
  const db = fakeDb({ "modulos/m1/secciones/s1": { titulo: "Publica" } }, { usuarios: rows });
  const audience = await resolveNotificationAudienceFromPath(db, "modulos/m1/secciones/s1/items/i1");
  assert.deepEqual(audience.recipients, ["a1"]);
});

test("public audience without active students returns specific diagnostic", async () => {
  const db = fakeDb({ "modulos/m1/secciones/s1": { titulo: "Publica" } }, {
    usuarios: [{ id: "p1", rol: "profesor" }, { id: "a1", rol: "alumno", activo: false }],
  });
  const audience = await resolveNotificationAudienceFromPath(db, "modulos/m1/secciones/s1/items/i1");
  assert.equal(audience.diagnosticReason, "no_active_students");
});

test("restricted audience without enrolled students returns specific diagnostic", async () => {
  const db = fakeDb({
    "modulos/m1/secciones/s1": { titulo: "Cursada" },
    "modulos/m1/secciones/s1/subsecciones/c1": { titulo: "Comision 1", esRestringida: true },
  }, {
    inscripciones: [],
  });
  const audience = await resolveNotificationAudienceFromPath(db, "modulos/m1/secciones/s1/subsecciones/c1/items/i1");
  assert.equal(audience.diagnosticReason, "no_students_in_restricted_scope");
});

test("detail formats Argentine date and time", () => {
  const detail = readFileSync("../app/notificaciones/[id].tsx", "utf8");
  assert.match(detail, /America\/Argentina\/Buenos_Aires/);
  assert.match(detail, /es-AR/);
});

test("grade notification detail does not expose numeric grade values", () => {
  const jobs = readFileSync("src/jobs.ts", "utf8");
  const detail = readFileSync("../app/notificaciones/[id].tsx", "utf8");
  assert.doesNotMatch(jobs, /nota[:}]/i);
  assert.doesNotMatch(detail, /notaNumerica|valorNota|calificacionNumerica/);
});

test("schedule reminder metadata includes event date course and location fields", () => {
  const jobs = readFileSync("src/jobs.ts", "utf8");
  assert.match(jobs, /eventTitle/);
  assert.match(jobs, /eventDate/);
  assert.match(jobs, /location/);
  assert.match(jobs, /courseMetadata/);
});

test("schedule reminder title supports today tomorrow and days", async () => {
  const schedules = await import("../lib/schedules.js");
  const now = new Date("2026-07-28T10:00:00-03:00");
  assert.equal(schedules.scheduleReminderTitle("Entrega final", "entrega", new Date("2026-07-28T20:00:00-03:00"), now), "Entrega final vence hoy");
  assert.equal(schedules.scheduleReminderTitle("Ateneo de Biomimetica", "ateneo", new Date("2026-07-29T20:00:00-03:00"), now), "Ateneo de Biomimetica es mañana");
  assert.equal(schedules.scheduleReminderTitle("Parcial Practico", "parcial", new Date("2026-07-30T20:00:00-03:00"), now), "Parcial Practico es dentro de 2 dias");
});

test("strict sourcePath validation rejects manipulated paths", () => {
  assert.equal(validateSourcePath("new_content", "modulos/m1/secciones/s1/items/i1"), true);
  assert.equal(validateSourcePath("new_content", "modulos/m1/secciones/s1/items/i1/extra"), false);
  assert.equal(validateSourcePath("submission_grade", "modulos/m1/secciones/s1/items/i1/entregas_alumnos/e1"), true);
  assert.equal(validateSourcePath("tp_sheet_created", "usuarios/u1/planillas_tp/p1"), false);
  assert.equal(validateSourcePath("exam_grade", "notas"), false);
  assert.deepEqual(examBatchPathScope("modulos/m1/secciones/s1/notas_lotes/b1"), { moduloId: "m1", seccionId: "s1", batchId: "b1" });
  assert.deepEqual(scopeFromDeliveryPath("modulos/m1/secciones/s1/items/i1/entregas_alumnos/e1")?.entregaId, "e1");
});

test("professor without course permission cannot create job", async () => {
  const db = fakeDb({
    "usuarios/p1": { rol: "profesor" },
    "modulos/m1/secciones/s1/items/i1": { id: "i1", tipo: "texto", titulo: "T", fechaCreacion: "2026-08-01T00:00:00Z" },
    "modulos/m1/secciones/s1": { permiteCargaProfesor: false, creadoPor: "admin" },
  });
  const response = await createJobFromRequest({}, db, { uid: "p1" }, {
    type: "new_content",
    sourcePath: "modulos/m1/secciones/s1/items/i1",
  });
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.code, "no_professor_permission_in_path");
});

test("invalid job payload returns 400 instead of 500", async () => {
  const response = await createJobFromRequest(fakeEnv(), fakeDb({
    "usuarios/p1": { rol: "profesor" },
  }), { uid: "p1" }, {
    type: "submission_grade",
    sourcePath: "not-a-valid-path",
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.code, "invalid_source_path");
});

test("missing user id is rejected before reading usuarios path", async () => {
  let readPath = null;
  const db = fakeDb();
  db.get = async (path) => {
    readPath = path;
    throw new Error("should_not_read_user");
  };
  const response = await createJobFromRequest(fakeEnv(), db, { uid: "" }, {
    type: "delivery_space_created",
    sourcePath: "modulos/m1/secciones/s1/items/i1",
  });
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.code, "invalid_user");
  assert.equal(readPath, null);
});

test("internal job creation errors return safe 500 diagnostics", async () => {
  const db = fakeDb();
  db.get = async () => {
    throw new Error("firestore_unavailable_sensitive_detail");
  };
  const response = await createJobFromRequest(fakeEnv(), db, { uid: "p1" }, {
    type: "submission_grade",
    sourcePath: "modulos/m1/secciones/s1/items/i1/entregas_alumnos/e1",
  });
  const body = await response.json();
  assert.equal(response.status, 500);
  assert.equal(body.code, "internal_error");
  assert.equal("stack" in body, false);
});

test("different planilla update windows produce different dedupe versions", () => {
  const a = coalesceWindowKey(new Date("2026-08-01T10:01:00Z"), 0.5);
  const b = coalesceWindowKey(new Date("2026-08-01T10:01:31Z"), 0.5);
  assert.notEqual(deduplicationKey(["tp_sheet_updated", "planillas_tp/p1", a]), deduplicationKey(["tp_sheet_updated", "planillas_tp/p1", b]));
});

test("cron trigger runs every five minutes", () => {
  const wrangler = readFileSync("wrangler.toml", "utf8");
  assert.match(wrangler, /crons = \["\*\/5 \* \* \* \*"\]/);
});

test("POST jobs publishes exactly the created job to Queue and does not use waitUntil", async () => {
  const db = fakeDb({
    "usuarios/p1": { rol: "profesor" },
    "modulos/m1/secciones/s1/items/i1": { id: "i1", tipo: "texto", titulo: "Contenido", fechaCreacion: "2026-08-01T00:00:00Z" },
    "modulos/m1/secciones/s1": { permiteCargaProfesor: true },
  });
  const env = fakeEnv();
  const response = await createJobFromRequest(env, db, { uid: "p1" }, {
    type: "new_content",
    sourcePath: "modulos/m1/secciones/s1/items/i1",
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.queued, true);
  assert.equal(env.queueMessages.length, 1);
  assert.equal(env.queueMessages[0].jobId, body.jobId);
});

test("stable job endpoint flows do not fail while reading valid users", async () => {
  const sourcePath = "modulos/m1/secciones/s1/items/i1";
  const deliveryPath = `${sourcePath}/entregas_alumnos/e1`;
  const docs = {
    "usuarios/admin1": { rol: "admin" },
    "usuarios/p1": { rol: "profesor" },
    "modulos/m1/secciones/s1": { permiteCargaProfesor: true },
    [sourcePath]: { id: "i1", tipo: "entrega", titulo: "TP", fechaCreacion: "2026-08-01T00:00:00Z", fechaActualizacion: "2026-08-01T01:00:00Z" },
    [deliveryPath]: { id: "e1", alumnoId: "a1", nota: 8, requiereReentrega: true, fechaActualizacion: "2026-08-01T02:00:00Z" },
  };
  const cases = [
    { uid: "p1", type: "delivery_space_created", sourcePath },
    { uid: "p1", type: "delivery_space_updated", sourcePath },
    { uid: "admin1", type: "submission_grade", sourcePath: deliveryPath },
    { uid: "p1", type: "submission_grade", sourcePath: deliveryPath },
    { uid: "p1", type: "submission_grade_with_resubmission", sourcePath: deliveryPath },
    { uid: "p1", type: "submission_grade_updated_with_resubmission", sourcePath: deliveryPath },
  ];

  for (const item of cases) {
    const env = fakeEnv();
    const response = await createJobFromRequest(env, fakeDb({ ...docs }), { uid: item.uid }, {
      type: item.type,
      sourcePath: item.sourcePath,
    });
    const body = await response.json();
    assert.equal(response.status, 200, `${item.type}:${body.stage ?? body.code ?? ""}`);
    assert.equal(body.queued, true, item.type);
    assert.equal(env.queueMessages.length, 1, item.type);
  }
});

test("schedule reminder job creation queues without reading request users", async () => {
  const env = fakeEnv();
  const db = fakeDb();
  const result = await createScheduleReminderJob(env, db, {
    sourcePath: "modulos/m1/secciones/s1/items/i1",
    sourceId: "i1",
    courseId: "m1",
    sectionId: "s1",
    offsetMinutes: 15,
    scheduleVersion: 1,
    dueAt: "2026-08-01T23:59:00.000Z",
  });
  assert.equal(result.queued, true);
  assert.equal(env.queueMessages.length, 1);
  assert.equal(db.writes.some((write) => write.path.startsWith("notification_jobs/") && write.data.type === "schedule_reminder"), true);
});

test("processDueJobs queries pending failed and expired processing separately", async () => {
  const seen = [];
  const db = {
    async runQueryPages(_collection, filters) {
      const status = filters.find((filter) => filter.fieldFilter?.field?.fieldPath === "status")?.fieldFilter?.value?.stringValue;
      seen.push(status);
      return [];
    },
  };
  const processed = await processDueJobs(fakeEnv(), db, new Date("2026-08-01T10:00:00Z"));
  assert.deepEqual(processed, { found: 0, enqueued: 0, skipped: 0, errors: 0, recoveredLeases: 0 });
  assert.deepEqual(seen, ["pending", "failed", "processing"]);
});

test("grade job moves from pending to processing and completed", async () => {
  const db = fakeDb({
    "usuarios/a1": { rol: "alumno", activo: true },
    "usuarios/a1/notificationPreferences/push": { enabled: false },
    "modulos/m1": { titulo: "Operatoria Dental II" },
    "modulos/m1/secciones/s1": { titulo: "Cursada" },
  }, {
    notas: [{
      id: "n1",
      path: "notas/n1",
      alumnoId: "a1",
      alumnoUid: "a1",
      moduloId: "m1",
      seccionId: "s1",
      nombreExamen: "Parcial",
      notificationBatchId: "b1",
      fechaCarga: "2026-07-28T10:00:00Z",
    }],
  });
  await processJob({}, db, {
    id: "job1",
    type: "exam_grade",
    sourcePath: "modulos/m1/secciones/s1/notas_lotes/b1",
    sourceId: "b1",
    status: "pending",
    attempts: 0,
    payload: { nombreExamen: "Parcial" },
    deduplicationKey: "k",
    createdBy: "p1",
  });
  assert.equal(db.writes.some((write) => write.data.status === "processing"), true);
  assert.equal(db.writes.at(-1).data.status, "completed");
  assert.equal(db.writes.at(-1).data.recipientsResolved, 1);
  assert.equal(db.writes.at(-1).data.notificationsCreated, 1);
});

test("delivery grade job is authorized by delivery permissions and queued", async () => {
  const db = fakeDb({
    "usuarios/p1": { rol: "profesor" },
    "modulos/m1/secciones/s1": { permiteCargaProfesor: true, permiteNotas: false },
    "modulos/m1/secciones/s1/items/i1": { id: "i1", tipo: "entrega", titulo: "TP" },
    "modulos/m1/secciones/s1/items/i1/entregas_alumnos/e1": {
      id: "e1",
      alumnoId: "a1",
      fechaActualizacion: "2026-07-29T10:00:00Z",
    },
  });
  const env = fakeEnv();
  const response = await createJobFromRequest(env, db, { uid: "p1" }, {
    type: "submission_grade",
    sourcePath: "modulos/m1/secciones/s1/items/i1/entregas_alumnos/e1",
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.queued, true);
  assert.equal(env.queueMessages.length, 1);
});

test("delivery grade creates one internal notification for the submission owner", async () => {
  const db = fakeDb({
    "modulos/m1": { titulo: "Modulo" },
    "modulos/m1/secciones/s1": { titulo: "Cursada" },
    "modulos/m1/secciones/s1/items/i1": { id: "i1", tipo: "entrega", titulo: "TP 1", fechaLimite: "2026-08-01" },
    "modulos/m1/secciones/s1/items/i1/entregas_alumnos/e1": {
      id: "e1",
      alumnoId: "a1",
      nota: 8,
      revisada: true,
      fechaActualizacion: "2026-07-29T10:00:00Z",
    },
    "usuarios/a1": { rol: "alumno", activo: true },
    "usuarios/a2": { rol: "alumno", activo: true },
  });
  const result = await processJob(fakeEnv(), db, {
    id: "job-submission-grade",
    type: "submission_grade",
    sourcePath: "modulos/m1/secciones/s1/items/i1/entregas_alumnos/e1",
    sourceId: "e1",
    status: "pending",
    attempts: 0,
    payload: {},
    deduplicationKey: "submission_grade:m1:s1:i1:e1:v1",
    eventType: "submission_grade",
    changeVersion: "v1",
    createdBy: "p1",
  });
  assert.equal(result, "completed");
  assert.equal(db.writes.at(-1).data.status, "completed");
  assert.equal(db.writes.at(-1).data.recipientsResolved, 1);
  assert.equal(db.writes.at(-1).data.notificationsCreated, 1);
  assert.equal(db.writes.some((write) => write.path.startsWith("usuarios/a1/notifications/")), true);
  assert.equal(db.writes.some((write) => write.path.startsWith("usuarios/a2/notifications/")), false);
});

test("delivery grade with numeric zero still creates a notification", async () => {
  const db = fakeDb({
    "modulos/m1/secciones/s1/items/i1": { id: "i1", tipo: "entrega", titulo: "TP 1" },
    "modulos/m1/secciones/s1/items/i1/entregas_alumnos/e1": {
      id: "e1",
      alumnoId: "a1",
      nota: 0,
      revisada: true,
      fechaActualizacion: "2026-07-29T10:00:00Z",
    },
    "usuarios/a1": { rol: "alumno", activo: true },
  });
  const result = await processJob(fakeEnv(), db, {
    id: "job-submission-zero",
    type: "submission_grade",
    sourcePath: "modulos/m1/secciones/s1/items/i1/entregas_alumnos/e1",
    sourceId: "e1",
    status: "pending",
    attempts: 0,
    payload: {},
    deduplicationKey: "submission_grade:m1:s1:i1:e1:zero",
    eventType: "submission_grade",
    changeVersion: "zero",
    createdBy: "p1",
  });
  assert.equal(result, "completed");
  assert.equal(db.writes.at(-1).data.notificationsCreated, 1);
});

test("resubmission request creates one internal notification for the submission owner", async () => {
  const db = fakeDb({
    "modulos/m1": { titulo: "Modulo" },
    "modulos/m1/secciones/s1": { titulo: "Cursada" },
    "modulos/m1/secciones/s1/items/i1": { id: "i1", tipo: "entrega", titulo: "TP 1" },
    "modulos/m1/secciones/s1/items/i1/entregas_alumnos/e1": {
      id: "e1",
      alumnoId: "a1",
      requiereReentrega: true,
      retroalimentacion: "Revisar observaciones",
      fechaActualizacion: "2026-07-29T10:00:00Z",
    },
    "usuarios/a1": { rol: "alumno", activo: true },
    "usuarios/a2": { rol: "alumno", activo: true },
  });
  const result = await processJob(fakeEnv(), db, {
    id: "job-resubmission",
    type: "resubmission_requested",
    sourcePath: "modulos/m1/secciones/s1/items/i1/entregas_alumnos/e1",
    sourceId: "e1",
    status: "pending",
    attempts: 0,
    payload: {},
    deduplicationKey: "resubmission_requested:m1:s1:i1:e1:v1",
    eventType: "resubmission_requested",
    changeVersion: "v1",
    createdBy: "p1",
  });
  assert.equal(result, "completed");
  assert.equal(db.writes.at(-1).data.status, "completed");
  assert.equal(db.writes.at(-1).data.recipientsResolved, 1);
  assert.equal(db.writes.some((write) => write.path.startsWith("usuarios/a1/notifications/")), true);
  assert.equal(db.writes.some((write) => write.path.startsWith("usuarios/a2/notifications/")), false);
});

test("resubmission job creation uses delivery permissions and preserves updated event type", async () => {
  const db = fakeDb({
    "usuarios/p1": { rol: "profesor" },
    "modulos/m1/secciones/s1": { permiteCargaProfesor: true, permiteNotas: false },
    "modulos/m1/secciones/s1/items/i1": { id: "i1", tipo: "entrega", titulo: "TP" },
    "modulos/m1/secciones/s1/items/i1/entregas_alumnos/e1": {
      id: "e1",
      alumnoId: "a1",
      requiereReentrega: true,
      fechaActualizacion: "2026-07-29T10:00:00Z",
    },
  });
  const response = await createJobFromRequest(fakeEnv(), db, { uid: "p1" }, {
    type: "resubmission_updated",
    sourcePath: "modulos/m1/secciones/s1/items/i1/entregas_alumnos/e1",
  });
  assert.equal(response.status, 200);
  const write = db.writes.find((item) => item.path.startsWith("notification_jobs/"));
  assert.equal(write.data.type, "resubmission_updated");
  assert.equal(write.data.eventType, "resubmission_updated");
});

test("professor authorized on ancestor can create initial submission grade and resubmission jobs", async () => {
  const sourcePath = "modulos/m1/secciones/s1/subsecciones/c1/items/i1/entregas_alumnos/e1";
  const db = fakeDb({
    "usuarios/p1": { rol: "profesor" },
    "modulos/m1/secciones/s1": { permiteCargaProfesor: true },
    "modulos/m1/secciones/s1/subsecciones/c1": { titulo: "Comision 1" },
    "modulos/m1/secciones/s1/subsecciones/c1/items/i1": { id: "i1", tipo: "entrega", titulo: "TP" },
    [sourcePath]: {
      id: "e1",
      alumnoId: "a1",
      nota: 0,
      requiereReentrega: true,
      fechaActualizacion: "2026-07-29T10:00:00Z",
    },
  });
  const env = fakeEnv();
  const grade = await createJobFromRequest(env, db, { uid: "p1" }, {
    type: "submission_grade",
    sourcePath,
  });
  const combined = await createJobFromRequest(env, db, { uid: "p1" }, {
    type: "submission_grade_with_resubmission",
    sourcePath,
  });
  assert.equal(grade.status, 200);
  assert.equal(combined.status, 200);
  assert.equal(env.queueMessages.length, 2);
});

test("submission grading authorization supports section subsection nested ancestor and item permissions", async () => {
  const cases = [
    {
      name: "section",
      sourcePath: "modulos/m1/secciones/s1/items/i1/entregas_alumnos/e1",
      docs: { "modulos/m1/secciones/s1": { permiteCargaProfesor: true } },
    },
    {
      name: "subsection",
      sourcePath: "modulos/m1/secciones/s1/subsecciones/c1/items/i1/entregas_alumnos/e1",
      docs: {
        "modulos/m1/secciones/s1": {},
        "modulos/m1/secciones/s1/subsecciones/c1": { permiteCargaProfesor: true },
      },
    },
    {
      name: "nested_ancestor",
      sourcePath: "modulos/m1/secciones/s1/subsecciones/c1/subsecciones/notas/items/i1/entregas_alumnos/e1",
      docs: {
        "modulos/m1/secciones/s1": {},
        "modulos/m1/secciones/s1/subsecciones/c1": { permiteCargaProfesor: true },
        "modulos/m1/secciones/s1/subsecciones/c1/subsecciones/notas": {},
      },
    },
    {
      name: "item",
      sourcePath: "modulos/m1/secciones/s1/items/i1/entregas_alumnos/e1",
      docs: { "modulos/m1/secciones/s1": {}, "modulos/m1/secciones/s1/items/i1": { creadoPor: "p1" } },
    },
  ];
  const types = [
    "submission_grade",
    "submission_grade_updated",
    "submission_grade_with_resubmission",
    "submission_grade_updated_with_resubmission",
  ];

  for (const item of cases) {
    for (const type of types) {
      const parentPath = item.sourcePath.split("/entregas_alumnos/")[0];
      const docs = {
        "usuarios/p1": { rol: "profesor" },
        [parentPath]: { id: "i1", tipo: "entrega", titulo: `TP ${item.name}` },
        [item.sourcePath]: { id: "e1", alumnoId: "a1", nota: 8, fechaActualizacion: "2026-07-29T10:00:00Z" },
        ...item.docs,
      };
      const response = await createJobFromRequest(fakeEnv(), fakeDb(docs), { uid: "p1" }, { type, sourcePath: item.sourcePath });
      assert.equal(response.status, 200, `${item.name}:${type}`);
    }
  }
});

test("professor without delivery permission is rejected and student cannot create submission jobs", async () => {
  const sourcePath = "modulos/m1/secciones/s1/items/i1/entregas_alumnos/e1";
  const docs = {
    "modulos/m1/secciones/s1": { permiteCargaProfesor: false },
    "modulos/m1/secciones/s1/items/i1": { id: "i1", tipo: "entrega", titulo: "TP" },
    [sourcePath]: { id: "e1", alumnoId: "a1", nota: 8 },
  };
  const professorDb = fakeDb({ ...docs, "usuarios/p1": { rol: "profesor" } });
  const professorResponse = await createJobFromRequest(fakeEnv(), professorDb, { uid: "p1" }, {
    type: "submission_grade",
    sourcePath,
  });
  assert.equal(professorResponse.status, 403);
  assert.equal((await professorResponse.json()).code, "no_professor_permission_in_path");

  const studentDb = fakeDb({ ...docs, "usuarios/a1": { rol: "alumno" } });
  const studentResponse = await createJobFromRequest(fakeEnv(), studentDb, { uid: "a1" }, {
    type: "submission_grade",
    sourcePath,
  });
  assert.equal(studentResponse.status, 403);
});

test("combined submission grade with resubmission creates one notification for the owner", async () => {
  const db = fakeDb({
    "modulos/m1": { titulo: "Modulo" },
    "modulos/m1/secciones/s1": { titulo: "Cursada" },
    "modulos/m1/secciones/s1/items/i1": { id: "i1", tipo: "entrega", titulo: "TP 1" },
    "modulos/m1/secciones/s1/items/i1/entregas_alumnos/e1": {
      id: "e1",
      alumnoId: "a1",
      nota: 0,
      requiereReentrega: true,
      fechaActualizacion: "2026-07-29T10:00:00Z",
    },
    "usuarios/a1": { rol: "alumno", activo: true },
    "usuarios/a2": { rol: "alumno", activo: true },
  });
  const result = await processJob(fakeEnv(), db, {
    id: "job-combined-submission",
    type: "submission_grade_with_resubmission",
    sourcePath: "modulos/m1/secciones/s1/items/i1/entregas_alumnos/e1",
    sourceId: "e1",
    status: "pending",
    attempts: 0,
    payload: {},
    deduplicationKey: "submission_grade_with_resubmission:m1:s1:i1:e1:v1",
    eventType: "submission_grade_with_resubmission",
    changeVersion: "v1",
    createdBy: "p1",
  });
  const notifications = db.writes.filter((write) => write.path.includes("/notifications/") && write.merge === false);
  assert.equal(result, "completed");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].path.startsWith("usuarios/a1/notifications/"), true);
  assert.equal(notifications[0].data.type, "submission_grade_with_resubmission");
});

test("content job with no recipients does not complete silently", async () => {
  const db = fakeDb({
    "modulos/m1/secciones/s1/items/i1": { id: "i1", tipo: "texto", titulo: "Contenido", fechaCreacion: "2026-07-28T10:00:00Z" },
    "modulos/m1": { titulo: "Modulo sin comisiones" },
    "modulos/m1/secciones/s1": { titulo: "Material" },
  }, {
    inscripciones: [],
  });
  const env = fakeEnv();
  const result = await processJob(env, db, {
    id: "job-no-recipients",
    type: "new_content",
    sourcePath: "modulos/m1/secciones/s1/items/i1",
    sourceId: "i1",
    status: "pending",
    attempts: 0,
    payload: {},
    deduplicationKey: "k",
    createdBy: "p1",
  });
  assert.equal(result, "pending");
  assert.equal(db.writes.at(-1).data.status, "pending");
  assert.equal(db.writes.at(-1).data.diagnosticCode, "no_active_students");
});

test("new_content creates internal notifications in module without commissions", async () => {
  const db = fakeDb({
    "modulos/at/secciones/s1/items/i1": { id: "i1", tipo: "texto", titulo: "Ateneo", fechaCreacion: "2026-07-28T10:00:00Z" },
    "modulos/at": { titulo: "Ateneos" },
    "modulos/at/secciones/s1": { titulo: "Ateneos 2026" },
    "usuarios/a1": { rol: "alumno", activo: true },
  }, {
    usuarios: [{ id: "a1", rol: "alumno", activo: true }],
  });
  const env = fakeEnv();
  const result = await processJob(env, db, {
    id: "job-public-content",
    type: "new_content",
    sourcePath: "modulos/at/secciones/s1/items/i1",
    sourceId: "i1",
    status: "pending",
    attempts: 0,
    payload: {},
    deduplicationKey: "k",
    createdBy: "p1",
  });
  assert.equal(result, "completed");
  assert.equal(db.writes.at(-1).data.notificationsCreated, 1);
});

test("content_updated in public recursive subsection completes with navigable target array", async () => {
  const db = fakeDb({
    "modulos/m1/secciones/s1/subsecciones/a/subsecciones/b/items/i1": { id: "i1", tipo: "texto", titulo: "Contenido", fechaActualizacion: "2026-07-28T10:00:00Z" },
    "modulos/m1": { titulo: "Modulo" },
    "modulos/m1/secciones/s1": { titulo: "General" },
    "modulos/m1/secciones/s1/subsecciones/a": { titulo: "Ateneos" },
    "modulos/m1/secciones/s1/subsecciones/a/subsecciones/b": { titulo: "Material" },
    "usuarios/a1": { rol: "alumno", activo: true },
  }, {
    usuarios: [{ id: "a1", rol: "alumno", activo: true }],
  });
  const result = await processJob(fakeEnv(), db, {
    id: "job-public-recursive-content",
    type: "content_updated",
    sourcePath: "modulos/m1/secciones/s1/subsecciones/a/subsecciones/b/items/i1",
    sourceId: "i1",
    status: "pending",
    attempts: 0,
    payload: {},
    deduplicationKey: "k",
    createdBy: "p1",
  });
  const notificationWrite = db.writes.find((write) => write.path.includes("/notifications/") && write.merge === false);
  assert.equal(result, "completed");
  assert.equal(db.writes.at(-1).data.status, "completed");
  assert.equal(db.writes.at(-1).data.leaseId, null);
  assert.deepEqual(notificationWrite.data.target.subsectionPath, ["a", "b"]);
  assert.equal(notificationWrite.data.target.itemId, "i1");
});

test("notification created but completed write fails then retry completes without duplicate", async () => {
  const db = fakeDb({
    "modulos/m1/secciones/s1/items/i1": { id: "i1", tipo: "texto", titulo: "Contenido", fechaCreacion: "2026-07-28T10:00:00Z" },
    "modulos/m1": { titulo: "Modulo" },
    "modulos/m1/secciones/s1": { titulo: "General" },
    "usuarios/a1": { rol: "alumno", activo: true },
  }, {
    usuarios: [{ id: "a1", rol: "alumno", activo: true }],
  });
  const originalSet = db.set.bind(db);
  let failedCompletedWrites = 0;
  db.set = async (path, data, merge = true) => {
    if (failedCompletedWrites < 2 && path === "notification_jobs/job-stable" && data.status === "completed") {
      failedCompletedWrites += 1;
      throw new Error("final_write_failed");
    }
    return originalSet(path, data, merge);
  };
  const job = {
    id: "job-stable",
    type: "new_content",
    sourcePath: "modulos/m1/secciones/s1/items/i1",
    sourceId: "i1",
    status: "pending",
    attempts: 0,
    payload: {},
    deduplicationKey: "new_content:stable_creation",
    eventType: "new_content",
    changeVersion: "created-v1",
    createdBy: "p1",
  };
  const first = await processJob(fakeEnv(), db, job);
  assert.equal(first, "pending");
  assert.equal(db.writes.filter((write) => write.path.includes("/notifications/") && write.merge === false).length, 1);

  db.docs["modulos/m1/secciones/s1/items/i1"].fechaActualizacion = "2026-07-29T10:00:00Z";
  const retry = await processJob(fakeEnv(), db, { ...job, status: "pending", attempts: 1 });
  assert.equal(retry, "completed");
  assert.equal(db.writes.filter((write) => write.path.includes("/notifications/") && write.merge === false).length, 1);
  assert.equal(db.writes.at(-1).data.status, "completed");
  assert.equal(db.writes.at(-1).data.notificationsAlreadyExisted, 1);
});

test("single final completed write failure is retried before queue retry", async () => {
  const db = fakeDb({
    "modulos/m1/secciones/s1/items/i1": { id: "i1", tipo: "texto", titulo: "Contenido", fechaCreacion: "2026-07-28T10:00:00Z" },
    "modulos/m1": { titulo: "Modulo" },
    "modulos/m1/secciones/s1": { titulo: "General" },
    "usuarios/a1": { rol: "alumno", activo: true },
  }, {
    usuarios: [{ id: "a1", rol: "alumno", activo: true }],
  });
  const originalSet = db.set.bind(db);
  let failedCompletedWrite = false;
  db.set = async (path, data, merge = true) => {
    if (!failedCompletedWrite && path === "notification_jobs/job-final-retry" && data.status === "completed") {
      failedCompletedWrite = true;
      throw new Error("precondition_failed");
    }
    return originalSet(path, data, merge);
  };
  const result = await processJob(fakeEnv(), db, {
    id: "job-final-retry",
    type: "new_content",
    sourcePath: "modulos/m1/secciones/s1/items/i1",
    sourceId: "i1",
    status: "pending",
    attempts: 0,
    payload: {},
    deduplicationKey: "new_content:stable_creation",
    eventType: "new_content",
    changeVersion: "created-v1",
    createdBy: "p1",
  });
  assert.equal(result, "completed");
  assert.equal(db.writes.at(-1).data.status, "completed");
  assert.equal(db.writes.at(-1).data.leaseId, null);
});

test("delayed new_content retry keeps original dedupe and does not create fifth notification", async () => {
  const db = fakeDb({
    "modulos/m1/secciones/s1/items/i1": { id: "i1", tipo: "texto", titulo: "Editado", fechaCreacion: "2026-07-28T10:00:00Z", fechaActualizacion: "2026-07-29T10:00:00Z" },
    "modulos/m1": { titulo: "Modulo" },
    "modulos/m1/secciones/s1": { titulo: "General" },
    "usuarios/a1": { rol: "alumno", activo: true },
  }, {
    usuarios: [{ id: "a1", rol: "alumno", activo: true }],
  });
  const job = {
    id: "job-late-created",
    type: "new_content",
    sourcePath: "modulos/m1/secciones/s1/items/i1",
    sourceId: "i1",
    status: "pending",
    attempts: 0,
    payload: {},
    deduplicationKey: "new_content:modulos/m1/secciones/s1/items/i1:i1:created-v1",
    eventType: "new_content",
    changeVersion: "created-v1",
    createdBy: "p1",
  };
  await processJob(fakeEnv(), db, job);
  await processJob(fakeEnv(), db, { ...job, status: "pending", attempts: 1 });
  const notificationCreates = db.writes.filter((write) => write.path.includes("/notifications/") && write.merge === false);
  assert.equal(notificationCreates.length, 1);
  assert.equal(db.writes.at(-1).data.status, "completed");
  assert.equal(db.writes.at(-1).data.notificationsAlreadyExisted, 1);
});

test("content_updated never becomes new_content during processing", async () => {
  const db = fakeDb({
    "modulos/m1/secciones/s1/items/i1": { id: "i1", tipo: "texto", titulo: "Contenido", fechaActualizacion: "2026-07-29T10:00:00Z" },
    "modulos/m1": { titulo: "Modulo" },
    "modulos/m1/secciones/s1": { titulo: "General" },
    "usuarios/a1": { rol: "alumno", activo: true },
  }, {
    usuarios: [{ id: "a1", rol: "alumno", activo: true }],
  });
  await processJob(fakeEnv(), db, {
    id: "job-updated",
    type: "content_updated",
    sourcePath: "modulos/m1/secciones/s1/items/i1",
    sourceId: "i1",
    status: "pending",
    attempts: 0,
    payload: {},
    deduplicationKey: "content_updated:stable",
    eventType: "content_updated",
    changeVersion: "update-v1",
    createdBy: "p1",
  });
  const notification = db.writes.find((write) => write.path.includes("/notifications/") && write.merge === false);
  assert.equal(notification.data.type, "content_updated");
});

test("delivery_space_created uses the same public audience resolver", async () => {
  const db = fakeDb({
    "modulos/at/secciones/s1/items/e1": { id: "e1", tipo: "entrega", titulo: "Entrega", fechaCreacion: "2026-07-28T10:00:00Z" },
    "modulos/at": { titulo: "Ateneos" },
    "modulos/at/secciones/s1": { titulo: "Ateneos 2026" },
    "usuarios/a1": { rol: "alumno", activo: true },
  }, {
    usuarios: [{ id: "a1", rol: "alumno", activo: true }],
  });
  const env = fakeEnv();
  const result = await processJob(env, db, {
    id: "job-public-delivery",
    type: "delivery_space_created",
    sourcePath: "modulos/at/secciones/s1/items/e1",
    sourceId: "e1",
    status: "pending",
    attempts: 0,
    payload: {},
    deduplicationKey: "k",
    createdBy: "p1",
  });
  assert.equal(result, "completed");
  assert.equal(db.writes.at(-1).data.notificationsCreated, 1);
});

test("sheet coalescing creates pending job with future nextAttemptAt", async () => {
  const db = fakeDb({
    "usuarios/p1": { rol: "profesor" },
    "modulos/m1/secciones/s1": { permitePlanillas: true },
    "planillas_tp/p1": { id: "p1", moduloId: "m1", seccionId: "s1", alumnoId: "a1", titulo: "Planilla" },
  });
  const nowBefore = Date.now();
  const response = await createJobFromRequest(fakeEnv(), db, { uid: "p1" }, {
    type: "tp_sheet_updated",
    sourcePath: "planillas_tp/p1",
  });
  assert.equal(response.status, 200);
  const write = db.writes.find((item) => item.path.startsWith("notification_jobs/"));
  assert.equal(write.data.status, "pending");
  assert.ok(write.data.nextAttemptAt.getTime() > nowBefore);
  assert.ok(write.data.nextAttemptAt.getTime() - nowBefore <= 31 * 1000);
});

test("firestore error releases lease and returns job to retryable state", async () => {
  const db = fakeDb();
  db.get = async (path) => {
    if (path === "modulos/m1/secciones/s1/items/i1") throw new Error("firestore_unavailable");
    return null;
  };
  const result = await processJob(fakeEnv(), db, {
    id: "job-error",
    type: "new_content",
    sourcePath: "modulos/m1/secciones/s1/items/i1",
    sourceId: "i1",
    status: "pending",
    attempts: 0,
    payload: {},
    deduplicationKey: "k",
    createdBy: "p1",
  });
  assert.equal(result, "pending");
  assert.equal(db.writes.at(-1).data.status, "pending");
  assert.equal(db.writes.at(-1).data.leaseId, null);
});

test("exam batch processing pauses with cursor instead of staying processing", async () => {
  const rows = Array.from({ length: 650 }, (_, index) => ({
    id: `n${index}`,
    path: `notas/n${index}`,
    alumnoId: `a${index}`,
    alumnoUid: `a${index}`,
    moduloId: "m1",
    seccionId: "s1",
    nombreExamen: "Parcial",
    notificationBatchId: "b1",
    fechaCarga: "2026-07-28T10:00:00Z",
  }));
  const db = fakeDb({
    "modulos/m1": { titulo: "Modulo" },
    "modulos/m1/secciones/s1": { titulo: "Cursada" },
  });
  db.get = async (path) => {
    if (path.startsWith("usuarios/")) return { rol: "alumno", activo: true };
    return { titulo: "Doc" };
  };
  db.runQuery = async (_collectionId, _filters, _orderBy, limit, _allDescendants, offset = 0) => rows.slice(offset, offset + limit);
  db.listCollectionPages = async () => [];

  const env = fakeEnv();
  const result = await processJob(env, db, {
    id: "job-batch",
    type: "exam_grade",
    sourcePath: "modulos/m1/secciones/s1/notas_lotes/b1",
    sourceId: "b1",
    status: "pending",
    attempts: 0,
    payload: { nombreExamen: "Parcial" },
    deduplicationKey: "k",
    createdBy: "p1",
  });
  assert.equal(result, "pending");
  const pendingWrite = db.writes.find((write) => write.data.status === "pending" && write.data.payload?.cursor === 600);
  assert.equal(pendingWrite.data.status, "pending");
  assert.equal(env.queueMessages.at(-1).jobId, "job-batch");
});

test("expo error does not leave job in processing", async () => {
  const db = fakeDb({
    "modulos/m1/secciones/s1/items/i1": { id: "i1", tipo: "texto", titulo: "Contenido", fechaCreacion: "2026-07-28T10:00:00Z" },
    "modulos/m1": { titulo: "Modulo" },
    "modulos/m1/secciones/s1": { titulo: "Cursada" },
    "usuarios/a1": { rol: "alumno", activo: true },
    "usuarios/a1/notificationPreferences/push": { enabled: true },
  }, {
    usuarios: [{ id: "a1", rol: "alumno", activo: true }],
    inscripciones: [{ alumnoId: "a1", moduloId: "m1", seccionId: "s1", subseccionPath: "" }],
  });
  db.listCollectionPages = async () => [{ id: "t1", path: "usuarios/a1/pushTokens/t1", enabled: true, token: "ExponentPushToken[x]" }];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => "expo failed" });
  try {
    await processJob({}, db, {
      id: "job2",
      type: "new_content",
      sourcePath: "modulos/m1/secciones/s1/items/i1",
      sourceId: "i1",
      status: "pending",
      attempts: 0,
      payload: {},
      deduplicationKey: "k",
      createdBy: "p1",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(db.writes.some((write) => write.data.status === "processing"), true);
  assert.notEqual(db.writes.at(-1).data.status, "processing");
});

test("duplicate queue message for completed job is a no-op", async () => {
  const db = fakeDb({
    "notification_jobs/job-done": {
      id: "job-done",
      status: "completed",
      type: "new_content",
      attempts: 1,
    },
  });
  const result = await processJobById(fakeEnv(), db, "job-done");
  assert.equal(result, "completed");
  assert.equal(db.writes.length, 0);
});

test("job without valid cursor does not return to pending after notifications exist", async () => {
  const jobs = readFileSync("src/jobs.ts", "utf8");
  assert.match(jobs, /missing_valid_cursor/);
  assert.match(jobs, /remainingWork/);
  assert.match(jobs, /continuationReason/);
});

test("job stages have timeout and finalization diagnostics", () => {
  const jobs = readFileSync("src/jobs.ts", "utf8");
  assert.match(jobs, /STAGE_TIMEOUT_MS/);
  assert.match(jobs, /FINALIZE_TIMEOUT_MS/);
  assert.match(jobs, /recipients_resolution_timeout/);
  assert.match(jobs, /recipients_cursor_unchanged|missing_valid_cursor/);
  assert.match(jobs, /job_finalize_started/);
  assert.match(jobs, /job_finalize_success/);
  assert.match(jobs, /job_finalize_failed/);
  assert.match(jobs, /lease_mismatch/);
});

test("processing job with active lease is not processed by duplicate queue or cron recovery", async () => {
  const future = new Date(Date.now() + 60000).toISOString();
  const db = fakeDb({
    "notification_jobs/job-active": {
      id: "job-active",
      status: "processing",
      type: "new_content",
      attempts: 1,
      leaseExpiresAt: future,
      deduplicationKey: "new_content:stable",
    },
  });
  const result = await processJobById(fakeEnv(), db, "job-active");
  assert.equal(result, "pending");
  assert.equal(db.writes.length, 0);
});

test("recovery completes job from existing internal metrics without rerunning recipients", async () => {
  const now = new Date("2026-08-01T10:00:00Z");
  const db = fakeDb({
    "notification_jobs/job-existing": {
      id: "job-existing",
      path: "notification_jobs/job-existing",
      status: "pending",
      type: "new_content",
      sourcePath: "modulos/m1/secciones/s1/items/i1",
      sourceId: "i1",
      attempts: 2,
      remainingWork: 0,
      recipientsResolved: 8,
      notificationsCreated: 0,
      notificationsAlreadyExisted: 8,
      deduplicationKey: "new_content:stable",
      createdBy: "p1",
    },
  });
  db.get = async (path) => {
    if (path === "notification_jobs/job-existing") return db.docs[path];
    throw new Error("recipients_should_not_be_resolved");
  };
  const result = await processJobById(fakeEnv(), db, "job-existing", now);
  assert.equal(result, "completed");
  assert.equal(db.writes.at(-1).data.status, "completed");
  assert.equal(db.writes.at(-1).data.leaseId, null);
  assert.equal(db.writes.at(-1).data.diagnosticCode, "completed_from_existing_internal_notifications");
});

test("stale processing job is recovered atomically and enqueued once", async () => {
  const now = new Date("2026-08-01T10:00:00Z");
  const db = fakeDb({
    "notification_jobs/job-stale": {
      id: "job-stale",
      path: "notification_jobs/job-stale",
      updateTime: "ut1",
      status: "processing",
      type: "new_content",
      attempts: 1,
      leaseId: "old",
      leaseExpiresAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
      lastProgressAt: new Date(now.getTime() - 4 * 60_000).toISOString(),
      deduplicationKey: "new_content:stable",
    },
  }, {
    notification_jobs: [{
      id: "job-stale",
      path: "notification_jobs/job-stale",
      updateTime: "ut1",
      status: "processing",
      type: "new_content",
      attempts: 1,
      leaseId: "old",
      leaseExpiresAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
      lastProgressAt: new Date(now.getTime() - 4 * 60_000).toISOString(),
      deduplicationKey: "new_content:stable",
    }],
  });
  const env = fakeEnv();
  db.runQueryPages = async (_collection, filters) => {
    const status = filters.find((filter) => filter.fieldFilter?.field?.fieldPath === "status")?.fieldFilter?.value?.stringValue;
    return status === "processing" ? [{
      id: "job-stale",
      path: "notification_jobs/job-stale",
      updateTime: "ut1",
      status: "processing",
      type: "new_content",
      attempts: 1,
      leaseId: "old",
      leaseExpiresAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
      lastProgressAt: new Date(now.getTime() - 4 * 60_000).toISOString(),
      deduplicationKey: "new_content:stable",
    }] : [];
  };
  const summary = await processDueJobs(env, db, now);
  assert.equal(summary.recoveredLeases, 1);
  assert.equal(summary.enqueued, 1);
  assert.equal(db.docs["notification_jobs/job-stale"].status, "pending");
  assert.equal(db.docs["notification_jobs/job-stale"].leaseId, null);
  assert.equal(env.queueMessages.at(-1).jobId, "job-stale");
});

test("legacy job without verifiable identity fails without creating late notifications", async () => {
  const db = fakeDb({
    "notification_jobs/job-legacy": {
      id: "job-legacy",
      path: "notification_jobs/job-legacy",
      status: "pending",
      type: "new_content",
      attempts: 1,
      sourcePath: "modulos/m1/secciones/s1/items/i1",
      sourceId: "i1",
    },
  });
  const result = await processJobById(fakeEnv(), db, "job-legacy");
  assert.equal(result, "failed");
  assert.equal(db.writes.at(-1).data.status, "failed");
  assert.equal(db.writes.at(-1).data.diagnosticCode, "legacy_identity_unverifiable");
  assert.equal(db.writes.some((write) => write.path.includes("/notifications/")), false);
});

test("queue ack happens only after completed failed or not_found status", () => {
  const index = readFileSync("src/index.ts", "utf8");
  assert.match(index, /if \(status === "completed" \|\| status === "failed" \|\| status === "not_found"\)/);
  assert.match(index, /queue_ack/);
  assert.match(index, /message\.ack\(\)/);
});

test("two real content edits generate distinct jobs while retrying one edit is stable", async () => {
  const db = fakeDb({
    "usuarios/p1": { rol: "profesor" },
    "modulos/m1/secciones/s1/items/i1": { id: "i1", tipo: "texto", titulo: "V1", fechaActualizacion: "2026-07-29T10:00:00Z" },
    "modulos/m1/secciones/s1": { permiteCargaProfesor: true },
  });
  const env = fakeEnv();
  const first = await (await createJobFromRequest(env, db, { uid: "p1" }, {
    type: "content_updated",
    sourcePath: "modulos/m1/secciones/s1/items/i1",
  })).json();
  db.docs["modulos/m1/secciones/s1/items/i1"].fechaActualizacion = "2026-07-29T10:05:00Z";
  const second = await (await createJobFromRequest(env, db, { uid: "p1" }, {
    type: "content_updated",
    sourcePath: "modulos/m1/secciones/s1/items/i1",
  })).json();
  const retry = await (await createJobFromRequest(env, db, { uid: "p1" }, {
    type: "content_updated",
    sourcePath: "modulos/m1/secciones/s1/items/i1",
  })).json();
  assert.notEqual(first.jobId, second.jobId);
  assert.equal(second.jobId, retry.jobId);
});

test("processing stages are persisted and final states clear leases", async () => {
  const jobs = readFileSync("src/jobs.ts", "utf8");
  assert.match(jobs, /loading_source/);
  assert.match(jobs, /resolving_context/);
  assert.match(jobs, /resolving_recipients/);
  assert.match(jobs, /creating_notifications/);
  assert.match(jobs, /sending_push/);
  assert.match(jobs, /finalizing/);
  assert.match(jobs, /lastProgressAt/);
});

test("frontend content navigation validates public routes and item existence", () => {
  const navigation = readFileSync("../services/notificationNavigation.ts", "utf8");
  assert.match(navigation, /itemDocPath/);
  assert.match(navigation, /nearestRestrictedPath/);
  assert.match(navigation, /content_not_found/);
  assert.match(navigation, /restricted_scope_not_enrolled/);
  assert.match(navigation, /subsectionPath/);
});

test("frontend validates every notification target before navigating", () => {
  const navigation = readFileSync("../services/notificationNavigation.ts", "utf8");
  const detail = readFileSync("../app/notificaciones/[id].tsx", "utf8");
  assert.match(navigation, /resolveNotificationTargetAvailability/);
  assert.match(navigation, /sectionHierarchyAvailable/);
  assert.match(navigation, /isAvailableData/);
  assert.match(navigation, /target\.kind === "delivery"/);
  assert.match(navigation, /La entrega ya no esta disponible/);
  assert.match(navigation, /target\.kind === "tp_sheet"/);
  assert.match(navigation, /La planilla ya no esta disponible/);
  assert.match(navigation, /target\.kind === "schedule_event"/);
  assert.match(navigation, /El evento ya no esta disponible/);
  assert.match(navigation, /No se pudo verificar el recurso/);
  assert.match(detail, /navigateToNotificationTarget\(notification\.target\)/);
});

test("delivery detail blocks direct access when parent item is unavailable", () => {
  const delivery = readFileSync("../app/entregas/[id].tsx", "utf8");
  assert.match(delivery, /isAvailableItem/);
  assert.match(delivery, /snap\.exists\(\) && isAvailableItem\(snap\.data\(\)\)/);
  assert.match(delivery, /if \(!item\)/);
  assert.match(delivery, /La entrega ya no está disponible/);
  assert.match(delivery, /No disponible/);
  assert.match(delivery, /Entendido/);
});

test("notifications tab and listeners are only enabled for students", () => {
  const tabLayout = readFileSync("../app/(tabs)/_layout.tsx", "utf8");
  const list = readFileSync("../app/(tabs)/notificaciones.tsx", "utf8");
  const detail = readFileSync("../app/notificaciones/[id].tsx", "utf8");
  const hook = readFileSync("../hooks/useNotifications.ts", "utf8");
  assert.match(tabLayout, /notificationsEnabled = !loadingRol && rol === "alumno"/);
  assert.match(tabLayout, /useNotifications\(\{ enabled: notificationsEnabled \}\)/);
  assert.match(tabLayout, /href: notificationsEnabled \? undefined : null/);
  assert.doesNotMatch(tabLayout, /tabBarButton: notificationsEnabled \? undefined : \(\) => null/);
  assert.match(list, /useNotifications\(\{ enabled: esAlumno \}\)/);
  assert.ok(list.includes('router.replace("/(tabs)/home" as any)'));
  assert.match(detail, /useNotifications\(\{ enabled: esAlumno \}\)/);
  assert.ok(detail.includes('router.replace("/(tabs)/home" as any)'));
  assert.match(hook, /options: \{ enabled\?: boolean \} = \{\}/);
  assert.match(hook, /if \(!uid \|\| !enabled\)/);
  assert.match(hook, /if \(!uid \|\| !enabled \|\| !isSafeNotificationDocumentId/);
});

test("frontend creates updated jobs for relevant edits", () => {
  const itemForm = readFileSync("../app/items/form.tsx", "utf8");
  const notas = readFileSync("../app/secciones/notas.tsx", "utf8");
  const entregas = readFileSync("../hooks/useEntregasAlumnos.ts", "utf8");
  const cronograma = readFileSync("../hooks/useCronograma.ts", "utf8");
  assert.match(itemForm, /content_updated/);
  assert.match(itemForm, /delivery_space_updated/);
  assert.match(itemForm, /itemRelevantHash/);
  assert.match(notas, /exam_grade_updated/);
  assert.match(notas, /notasMapHash/);
  assert.match(entregas, /submission_grade_updated/);
  assert.match(entregas, /resubmission_updated/);
  assert.match(cronograma, /schedule_event_created/);
  assert.match(cronograma, /schedule_event_updated/);
  assert.match(cronograma, /eventRelevantHash/);
});

test("frontend submission grading detects grade changes and selects exactly one event", () => {
  const entregas = readFileSync("../hooks/useEntregasAlumnos.ts", "utf8");
  assert.match(entregas, /normalizeSubmissionGrade/);
  assert.match(entregas, /previousGrade !== nextGrade/);
  assert.match(entregas, /hadPreviousGrade/);
  assert.match(entregas, /resubmissionRequestedNow/);
  assert.match(entregas, /resubmissionRemovedNow/);
  assert.match(entregas, /submission_change_detected/);
  assert.match(entregas, /submission_notification_event_selected/);
  assert.match(entregas, /submission_notification_skipped/);
  assert.match(entregas, /if \(!hadPreviousGrade && hasNextGrade && gradeChanged\)/);
  assert.match(entregas, /else if \(hadPreviousGrade && gradeChanged\)/);
  assert.match(entregas, /submission_grade_with_resubmission/);
  assert.match(entregas, /submission_grade_updated_with_resubmission/);
  assert.match(entregas, /selectedEventType = nextResubmission \? "submission_grade_updated_with_resubmission" : "submission_grade_updated"/);
  assert.match(entregas, /raw\.toLowerCase\(\) === "ausente"/);
  assert.match(entregas, /Number\(raw\.replace\(",", "\."\)\)/);
  assert.doesNotMatch(entregas, /await enqueueNotificationJob[\s\S]*await enqueueNotificationJob[\s\S]*resubmission_requested/);
});

test("frontend delivery schedule uses cron tolerance when saving delivery reminders", () => {
  const itemForm = readFileSync("../app/items/form.tsx", "utf8");
  assert.match(itemForm, /SCHEDULE_TOLERANCE_MS/);
  assert.match(itemForm, /computeNextNotificationAt\(deadline, reminders, \{\}, new Date\(\), SCHEDULE_TOLERANCE_MS\)/);
  assert.match(itemForm, /fechaLimiteAt/);
  assert.match(itemForm, /fechaLimiteHora/);
  assert.match(itemForm, /getDeadlineDate\(urlEnlace, fechaLimiteHora\)/);
});

test("student schedule loads delivery items by access instead of only exact enrollment paths", () => {
  const cronograma = readFileSync("../hooks/useCronograma.ts", "utf8");
  assert.match(cronograma, /collectionGroup\(db, "items"\), where\("tipo", "==", "entrega"\)/);
  assert.match(cronograma, /pathInfoFromItemPath/);
  assert.match(cronograma, /nearestRestrictedScope/);
  assert.match(cronograma, /studentCanSeeDelivery/);
  assert.match(cronograma, /restrictedScope === null \? "public" : "restricted"/);
  assert.match(cronograma, /restricted_not_enrolled/);
  assert.match(cronograma, /student_schedule_delivery_loaded/);
  assert.match(cronograma, /student_schedule_delivery_skipped/);
  assert.match(cronograma, /student_schedule_delivery_added/);
  assert.match(cronograma, /parseFechaLimiteEntrega\(data\.fechaLimiteAt, data\.fechaLimite, data\.fechaLimiteHora\)/);
  assert.match(cronograma, /fechaLimite\.trim\(\)\}T\$\{hora\}:00-03:00/);
});

test("time pickers keep temporary value until cancel or done in deliveries and schedule modal", () => {
  const itemForm = readFileSync("../app/items/form.tsx", "utf8");
  const eventModal = readFileSync("../components/ui/ModalEventoCronograma.tsx", "utf8");
  assert.match(itemForm, /pendingTime/);
  assert.match(itemForm, /confirmarTimePicker/);
  assert.match(itemForm, /cancelarTimePicker/);
  assert.match(itemForm, /setPendingTime\(selectedDate\)/);
  assert.match(itemForm, /<Text style=\{styles\.timePickerDoneText\}>Listo<\/Text>/);
  assert.match(eventModal, /pendingHora/);
  assert.match(eventModal, /confirmarPickerHora/);
  assert.match(eventModal, /cancelarPickerHora/);
  assert.match(eventModal, /setPendingHora\(selected\)/);
  assert.match(eventModal, /<Text style=\{styles\.timePickerDoneText\}>Listo<\/Text>/);
});

test("schedule date picker uses calendar confirmation without spinner closing on iOS", () => {
  const eventModal = readFileSync("../components/ui/ModalEventoCronograma.tsx", "utf8");
  assert.match(eventModal, /pendingFecha/);
  assert.match(eventModal, /abrirPickerFecha/);
  assert.match(eventModal, /cancelarPickerFecha/);
  assert.match(eventModal, /confirmarPickerFecha/);
  assert.match(eventModal, /display="inline"/);
  assert.match(eventModal, /setPendingFecha\(selected\)/);
  assert.match(eventModal, /setFullYear\(pendingFecha\.getFullYear\(\), pendingFecha\.getMonth\(\), pendingFecha\.getDate\(\)\)/);
});

test("delivery reminder jobs include safe diagnostic logs and canonical deadline metadata", () => {
  const jobs = readFileSync("../cloudflare-worker/src/jobs.ts", "utf8");
  assert.match(jobs, /delivery_reminder_processing_started/);
  assert.match(jobs, /delivery_reminder_context_resolved/);
  assert.match(jobs, /delivery_reminder_audience_resolved/);
  assert.match(jobs, /delivery_reminder_internal_created/);
  assert.match(jobs, /delivery_reminder_processing_finished/);
  assert.match(jobs, /createdByRole/);
  assert.match(jobs, /deadline,/);
  assert.match(jobs, /target: \{ kind: "delivery"/);
});

test("queue publish failure leaves recoverable diagnostic", async () => {
  const db = fakeDb({
    "usuarios/p1": { rol: "profesor" },
    "modulos/m1/secciones/s1/items/i1": { id: "i1", tipo: "texto", titulo: "Contenido", fechaCreacion: "2026-08-01T00:00:00Z" },
    "modulos/m1/secciones/s1": { permiteCargaProfesor: true },
  });
  const env = fakeEnv({
    NOTIFICATION_QUEUE: {
      async send() {
        throw new Error("queue unavailable");
      },
    },
  });
  const response = await createJobFromRequest(env, db, { uid: "p1" }, {
    type: "new_content",
    sourcePath: "modulos/m1/secciones/s1/items/i1",
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.queued, false);
  assert.equal(db.writes.at(-1).data.diagnosticCode, "queue_publish_failed");
});

test("completed jobs do not occupy due job query results", async () => {
  const db = {
    async runQueryPages(_collection, filters) {
      const status = filters.find((filter) => filter.fieldFilter?.field?.fieldPath === "status")?.fieldFilter?.value?.stringValue;
      assert.notEqual(status, "completed");
      return [];
    },
  };
  await processDueJobs({ MAX_JOB_ATTEMPTS: "5" }, db, new Date("2026-08-01T10:00:00Z"));
});

test("recipient resolution paginates past 100 students", async () => {
  const rows = Array.from({ length: 125 }, (_, index) => ({ alumnoId: `a${index}`, moduloId: "m1", seccionId: "s1" }));
  const db = {
    async runQueryPages() {
      return rows;
    },
    async get(path) {
      const id = path.split("/").pop();
      return { id, rol: "alumno", activo: true };
    },
  };
  const users = await resolveStudentsForCourse(db, { moduloId: "m1", seccionId: "s1" });
  assert.equal(users.length, 125);
});

test("module without commissions resolves module inscriptions without section match", async () => {
  const rows = [{ alumnoId: "a1", moduloId: "m1", subseccionPath: "" }];
  const db = {
    async runQueryPages() {
      return rows;
    },
    async get(path) {
      if (path === "usuarios/a1") return { id: "a1", rol: "alumno", activo: true };
      return { titulo: "Doc" };
    },
  };
  const users = await resolveStudentsForCourse(db, { moduloId: "m1", seccionId: "s1" });
  assert.deepEqual(users, ["a1"]);
});

test("admin diagnostics and retry endpoints are present", () => {
  const index = readFileSync("src/index.ts", "utf8");
  assert.match(index, /diagnostics\\\/jobs/);
  assert.match(index, /retryJob/);
  assert.match(index, /\/schedules\/diagnose/);
});

test("worker exposes a Queue consumer and no POST job processing waitUntil path", () => {
  const index = readFileSync("src/index.ts", "utf8");
  const jobs = readFileSync("src/jobs.ts", "utf8");
  assert.match(index, /async queue\(batch: MessageBatch<NotificationQueueMessage>/);
  assert.match(index, /message\.ack\(\)/);
  assert.match(index, /message\.retry/);
  assert.doesNotMatch(jobs, /ctx\.waitUntil/);
  assert.doesNotMatch(jobs, /processJobById\(env, db, jobId\)/);
});

test("lease acquisition uses Firestore updateTime precondition", () => {
  const firestore = readFileSync("src/firestore.ts", "utf8");
  const jobs = readFileSync("src/jobs.ts", "utf8");
  assert.match(firestore, /currentDocument\.updateTime/);
  assert.match(jobs, /setWithUpdateTime\(jobPath, data/);
});

test("exam batch job is confirmed with real notes", async () => {
  const db = fakeDb({
    "usuarios/p1": { rol: "profesor" },
    "modulos/m1/secciones/s1": { permiteNotas: true },
  }, {
    notas: [{ id: "n1", moduloId: "m1", seccionId: "s1", nombreExamen: "Parcial", notificationBatchId: "b1" }],
  });
  const env = fakeEnv();
  const response = await createJobFromRequest(env, db, { uid: "p1" }, {
    type: "exam_grade",
    sourcePath: "modulos/m1/secciones/s1/notas_lotes/b1",
    payload: { nombreExamen: "Parcial", batchId: "b1" },
  });
  assert.equal(response.status, 200);
  assert.equal(env.queueMessages.length, 1);
});

test("old reminders outside the bounded window do not match current due window", () => {
  const eventDate = new Date("2026-08-01T12:00:00-03:00");
  const now = new Date("2026-08-01T11:30:00-03:00");
  const next = computeNextNotificationAt(eventDate, [{ id: "r", amount: 3, unit: "hours", offsetMinutes: 180 }], {}, now);
  assert.equal(next, null);
});

test("push retry keeps existing internal notification document", async () => {
  const writes = [];
  const db = {
    async get(path) {
      if (path.includes("/notifications/")) return { id: "existing", pushStatus: "failed" };
      return null;
    },
    async set(path, data, merge = true) {
      writes.push({ path, data, merge });
    },
    async listCollectionPages() {
      return [];
    },
  };
  const result = await notifyStudent({}, db, {
    userId: "u1",
    type: "exam_grade",
    title: "Nueva calificacion",
    body: "Tenes una nueva calificacion.",
    target: { kind: "grade" },
    deduplicationKey: "new_content:modulos/m1/secciones/s1/items/i1",
  });
  assert.equal(result.alreadyExisted, 1);
  assert.equal(result.created, 0);
  assert.equal(writes.length, 0);
});

function fakeDb(docs = {}, queryRows = {}) {
  return {
    docs,
    writes: [],
    async get(path) {
      return docs[path] ?? null;
    },
    async set(path, data, merge = true) {
      this.writes.push({ path, data, merge });
      docs[path] = { ...(merge ? docs[path] ?? {} : {}), ...data, id: path.split("/").pop(), path };
    },
    async setWithUpdateTime(path, data, updateTime, merge = true) {
      if (docs[path]?.updateTime && docs[path].updateTime !== updateTime) {
        throw new Error("precondition_failed");
      }
      this.writes.push({ path, data, merge, updateTime });
      docs[path] = { ...(merge ? docs[path] ?? {} : {}), ...data, id: path.split("/").pop(), path, updateTime: `ut-${this.writes.length}` };
    },
    async runQuery(collectionId) {
      return queryRows[collectionId] ?? [];
    },
    async runQueryPages(collectionId) {
      return queryRows[collectionId] ?? [];
    },
  };
}

function fakeEnv(extra = {}) {
  const queueMessages = [];
  return {
    MAX_JOB_ATTEMPTS: "5",
    queueMessages,
    NOTIFICATION_QUEUE: {
      async send(message) {
        queueMessages.push(message);
      },
    },
    ...extra,
  };
}
