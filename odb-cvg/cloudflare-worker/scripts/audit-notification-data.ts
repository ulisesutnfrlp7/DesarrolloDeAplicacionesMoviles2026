import { FirestoreRest } from "../src/firestore.js";
import type { Env } from "../src/types.js";

type Counter = Record<string, number>;

function envFromProcess(): Env {
  const required = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"] as const;
  required.forEach((key) => {
    if (!process.env[key]) throw new Error(`Missing ${key}`);
  });
  return {
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID!,
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL!,
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY!,
    NOTIFICATION_QUEUE: {
      async send() {
        throw new Error("audit_script_is_read_only");
      },
    },
  };
}

async function main() {
  const db = new FirestoreRest(envFromProcess());
  const modules = await db.runQueryPages("modulos", [], [], 100, false, 50);
  const inscriptions = await db.runQueryPages("inscripciones", [], [], 200, false, 100);
  const events = await db.runQueryPages("eventos_cronograma", [], [], 100, false, 50);
  const jobs = await db.runQueryPages("notification_jobs", [], [], 100, false, 50);

  const inscriptionFields: Counter = {};
  inscriptions.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (["alumnoId", "alumnoUid", "moduloId", "seccionId", "subseccionPath"].includes(key)) {
        inscriptionFields[key] = (inscriptionFields[key] ?? 0) + 1;
      }
    });
  });

  const eventScopes: Counter = {};
  let invalidSchedules = 0;
  events.forEach((event) => {
    const scope = String(event.scope ?? "legacy");
    eventScopes[scope] = (eventScopes[scope] ?? 0) + 1;
    const schedule = event.notificationSchedule;
    if (schedule?.enabled && !schedule.nextNotificationAt && Array.isArray(schedule.reminders) && schedule.reminders.length > 0) {
      invalidSchedules += 1;
    }
  });

  const completedWithoutNotifications = jobs.filter((job) =>
    job.status === "completed" &&
    (job.notificationsCreated ?? 0) === 0 &&
    (job.notificationsAlreadyExisted ?? 0) === 0,
  ).length;
  const now = Date.now();
  const expiredLeases = jobs.filter((job) =>
    job.status === "processing" &&
    job.leaseExpiresAt &&
    new Date(job.leaseExpiresAt).getTime() <= now,
  ).length;

  const summary = {
    modulesFound: modules.length,
    inscriptionFields,
    eventScopes,
    invalidSchedules,
    jobsCompletedWithoutNotifications: completedWithoutNotifications,
    jobsProcessingWithExpiredLease: expiredLeases,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(String(error?.message ?? error));
  process.exit(1);
});
