import * as admin from "firebase-admin";
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { computeNextNotificationAt, deduplicationKey, isNewSubmissionGrade, isRelevantPlanillaUpdate, isResubmissionRequested } from "./notificationCore";
import { notifyStudent, timestampFromDate, type NotificationPayload } from "./notifications";
import { resolveSingleStudent, resolveStudentsForCourse } from "./recipients";

admin.initializeApp();

const region = "southamerica-east1";

function pathSubseccion(params: Record<string, string | undefined>) {
  return (params.subPath ?? "")
    .split("/")
    .filter(Boolean)
    .reduce<string[]>((acc, segment, index, arr) => {
      if (arr[index - 1] === "subsecciones") acc.push(segment);
      return acc;
    }, [])
    .join("/");
}

async function notifyMany(userIds: string[], base: Omit<NotificationPayload, "userId">) {
  await Promise.all([...new Set(userIds)].map((userId) => notifyStudent({ ...base, userId })));
}

export const onPublishedItemCreated = onDocumentCreated(
  { region, document: "modulos/{moduloId}/secciones/{seccionId}/{subPath=**}/items/{itemId}" },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;
    const { moduloId, seccionId, itemId } = event.params;
    const subseccionPath = pathSubseccion(event.params);
    const recipients = await resolveStudentsForCourse({ moduloId, seccionId, subseccionPath });
    const isDelivery = data.tipo === "entrega";
    await notifyMany(recipients, {
      type: isDelivery ? "delivery_space_created" : "new_content",
      title: isDelivery ? "Nuevo espacio de entrega" : "Nuevo contenido",
      body: isDelivery ? `Se habilito una entrega: ${data.titulo ?? "Entrega"}.` : `Hay nuevo contenido disponible: ${data.titulo ?? "Contenido"}.`,
      target: isDelivery
        ? { kind: "delivery", moduloId, seccionId, itemId, ...(subseccionPath ? { subseccionPath } : {}) }
        : { kind: "content", moduloId, seccionId, itemId, ...(subseccionPath ? { subseccionPath } : {}) },
      sourceId: itemId,
      courseId: moduloId,
      deduplicationKey: deduplicationKey([isDelivery ? "delivery_space_created" : "new_content", moduloId, seccionId, subseccionPath, itemId]),
    });
  },
);

export const onExamGradeWritten = onDocumentWritten(
  { region, document: "notas/{notaId}" },
  async (event) => {
    const after = event.data?.after.data();
    const before = event.data?.before.data();
    if (!after || before?.nota === after.nota) return;
    const recipients = await resolveSingleStudent(after.alumnoId);
    await notifyMany(recipients, {
      type: "exam_grade",
      title: "Nueva calificacion",
      body: `Tenes una nueva calificacion de ${after.nombreExamen ?? "un examen"}.`,
      target: {
        kind: "grade",
        moduloId: after.moduloId,
        seccionId: after.seccionId,
        subseccionPath: after.subseccionPath || undefined,
        nombreExamen: after.nombreExamen,
      },
      sourceId: event.params.notaId,
      courseId: after.moduloId ?? after.seccionId,
      deduplicationKey: deduplicationKey(["exam_grade", event.params.notaId, after.fechaCarga?.toMillis?.() ?? Date.now()]),
    });
  },
);

export const onSubmissionUpdated = onDocumentUpdated(
  { region, document: "modulos/{moduloId}/secciones/{seccionId}/{subPath=**}/items/{itemId}/entregas_alumnos/{entregaId}" },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    const { moduloId, seccionId, itemId, entregaId } = event.params;
    const subseccionPath = pathSubseccion(event.params);
    const recipients = await resolveSingleStudent(after.alumnoId);

    if (isNewSubmissionGrade(before, after)) {
      await notifyMany(recipients, {
        type: "submission_grade",
        title: "Entrega calificada",
        body: "Una entrega fue revisada. Ingresa para ver el detalle.",
        target: { kind: "grade", moduloId, seccionId, subseccionPath, entregaItemId: itemId, entregaId },
        sourceId: entregaId,
        courseId: moduloId,
        deduplicationKey: deduplicationKey(["submission_grade", moduloId, seccionId, itemId, entregaId, after.fechaActualizacion?.toMillis?.() ?? Date.now()]),
      });
    }

    if (isResubmissionRequested(before, after)) {
      await notifyMany(recipients, {
        type: "resubmission_requested",
        title: "Reentrega solicitada",
        body: "Se solicito una reentrega. Revisa la devolucion en la app.",
        target: { kind: "delivery", moduloId, seccionId, itemId, entregaId, ...(subseccionPath ? { subseccionPath } : {}) },
        sourceId: entregaId,
        courseId: moduloId,
        deduplicationKey: deduplicationKey(["resubmission_requested", moduloId, seccionId, itemId, entregaId, after.fechaActualizacion?.toMillis?.() ?? Date.now()]),
      });
    }
  },
);

export const onPlanillaWritten = onDocumentWritten(
  { region, document: "planillas_tp/{planillaId}" },
  async (event) => {
    const after = event.data?.after.data();
    const before = event.data?.before.data();
    if (!after || !isRelevantPlanillaUpdate(before, after)) return;
    const recipients = await resolveSingleStudent(after.alumnoId);
    await notifyMany(recipients, {
      type: before ? "tp_sheet_updated" : "tp_sheet_created",
      title: before ? "Planilla actualizada" : "Nueva planilla de TP",
      body: before ? "Tu planilla de trabajos practicos fue actualizada." : "Tenes una nueva planilla de trabajos practicos.",
      target: {
        kind: "tp_sheet",
        planillaId: event.params.planillaId,
        moduloId: after.moduloId ?? undefined,
        seccionId: after.seccionId,
        subseccionPath: after.subseccionPath ?? null,
      },
      sourceId: event.params.planillaId,
      courseId: after.moduloId ?? after.seccionId,
      deduplicationKey: deduplicationKey([before ? "tp_sheet_updated" : "tp_sheet_created", event.params.planillaId, after.fechaActualizacion?.toMillis?.() ?? Date.now()]),
    });
  },
);

export const processScheduleReminders = onSchedule(
  { region, schedule: "every 15 minutes", timeZone: "America/Argentina/Buenos_Aires" },
  async () => {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 15 * 60000);
    const snap = await admin.firestore()
      .collection("eventos_cronograma")
      .where("notificationSchedule.enabled", "==", true)
      .where("notificationSchedule.nextNotificationAt", "<=", timestampFromDate(windowEnd))
      .get();

    await Promise.all(snap.docs.map(async (docSnap) => {
      const event = docSnap.data();
      const fecha = event.fecha?.toDate?.();
      if (!fecha || fecha.getTime() <= now.getTime()) return;

      const schedule = event.notificationSchedule ?? {};
      const processed = schedule.processed ?? {};
      const due = (schedule.reminders ?? []).filter((reminder: any) => {
        const at = new Date(fecha.getTime() - reminder.offsetMinutes * 60000);
        return at.getTime() <= windowEnd.getTime() && at.getTime() >= now.getTime() - 15 * 60000 && !processed[String(reminder.offsetMinutes)];
      });
      if (due.length === 0) return;

      const recipients = await resolveStudentsForCourse({
        moduloId: event.moduloId,
        seccionId: event.seccionId,
        comisionSubseccionId: event.comisionSubseccionId,
      });

      for (const reminder of due) {
        await notifyMany(recipients, {
          type: "schedule_reminder",
          title: "Recordatorio del cronograma",
          body: `${event.titulo ?? "Evento"} esta programado en el cronograma.`,
          target: { kind: "schedule_event", eventId: docSnap.id, eventType: event.tipo, moduloId: event.moduloId, seccionId: event.seccionId },
          sourceId: docSnap.id,
          courseId: event.moduloId ?? null,
          deduplicationKey: deduplicationKey(["schedule_reminder", docSnap.id, schedule.version ?? 1, reminder.offsetMinutes]),
        });
        processed[String(reminder.offsetMinutes)] = true;
      }

      const next = computeNextNotificationAt(fecha, schedule.reminders ?? [], processed, now);
      await docSnap.ref.update({
        "notificationSchedule.processed": processed,
        "notificationSchedule.nextNotificationAt": next ? timestampFromDate(next) : null,
      });
    }));

    const deliverySnap = await admin.firestore()
      .collectionGroup("items")
      .where("tipo", "==", "entrega")
      .where("notificationSchedule.enabled", "==", true)
      .where("notificationSchedule.nextNotificationAt", "<=", timestampFromDate(windowEnd))
      .get();

    await Promise.all(deliverySnap.docs.map(async (docSnap) => {
      const item = docSnap.data();
      const deadline = parseDeliveryDeadline(item.fechaLimite);
      if (!deadline || deadline.getTime() <= now.getTime()) return;
      const scope = scopeFromItemPath(docSnap.ref.path);
      if (!scope) return;

      const schedule = item.notificationSchedule ?? {};
      const processed = schedule.processed ?? {};
      const due = (schedule.reminders ?? []).filter((reminder: any) => {
        const at = new Date(deadline.getTime() - reminder.offsetMinutes * 60000);
        return at.getTime() <= windowEnd.getTime() && at.getTime() >= now.getTime() - 15 * 60000 && !processed[String(reminder.offsetMinutes)];
      });
      if (due.length === 0) return;

      const recipients = await resolveStudentsForCourse({
        moduloId: scope.moduloId,
        seccionId: scope.seccionId,
        subseccionPath: scope.subseccionPath,
      });

      for (const reminder of due) {
        await notifyMany(recipients, {
          type: "schedule_reminder",
          title: "Recordatorio de entrega",
          body: `${item.titulo ?? "Entrega"} tiene una fecha limite en el cronograma.`,
          target: {
            kind: "delivery",
            moduloId: scope.moduloId,
            seccionId: scope.seccionId,
            itemId: docSnap.id,
            ...(scope.subseccionPath ? { subseccionPath: scope.subseccionPath } : {}),
          },
          sourceId: docSnap.id,
          courseId: scope.moduloId,
          deduplicationKey: deduplicationKey(["delivery_schedule_reminder", docSnap.ref.path, schedule.version ?? 1, reminder.offsetMinutes]),
        });
        processed[String(reminder.offsetMinutes)] = true;
      }

      const next = computeNextNotificationAt(deadline, schedule.reminders ?? [], processed, now);
      await docSnap.ref.update({
        "notificationSchedule.processed": processed,
        "notificationSchedule.nextNotificationAt": next ? timestampFromDate(next) : null,
      });
    }));
  },
);

function parseDeliveryDeadline(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(`${value}T23:59:00-03:00`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function scopeFromItemPath(path: string): { moduloId: string; seccionId: string; subseccionPath?: string } | null {
  const parts = path.split("/");
  const moduloIndex = parts.indexOf("modulos");
  const seccionIndex = parts.indexOf("secciones");
  const itemIndex = parts.lastIndexOf("items");
  if (moduloIndex < 0 || seccionIndex < 0 || itemIndex < 0) return null;
  const subseccionPath = parts
    .slice(seccionIndex + 2, itemIndex)
    .reduce<string[]>((acc, segment, index, arr) => {
      if (arr[index - 1] === "subsecciones") acc.push(segment);
      return acc;
    }, [])
    .join("/");
  return {
    moduloId: parts[moduloIndex + 1],
    seccionId: parts[seccionIndex + 1],
    ...(subseccionPath ? { subseccionPath } : {}),
  };
}
