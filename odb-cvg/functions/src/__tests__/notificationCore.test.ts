import assert from "node:assert/strict";
import test from "node:test";
import {
  computeNextNotificationAt,
  deduplicationKey,
  isNewSubmissionGrade,
  isRelevantPlanillaUpdate,
  isResubmissionRequested,
  offsetMinutesFromReminder,
} from "../notificationCore";

test("calcula offsets libres en dias, horas y minutos", () => {
  assert.equal(offsetMinutesFromReminder(3, "days"), 4320);
  assert.equal(offsetMinutesFromReminder(36, "hours"), 2160);
  assert.equal(offsetMinutesFromReminder(90, "minutes"), 90);
});

test("permite recordatorio del mismo momento", () => {
  const eventDate = new Date("2026-08-10T12:00:00-03:00");
  const next = computeNextNotificationAt(eventDate, [{ id: "same", amount: 0, unit: "minutes", offsetMinutes: 0 }], {}, new Date("2026-08-10T11:50:00-03:00"));
  assert.equal(next?.toISOString(), eventDate.toISOString());
});

test("ignora eventos vencidos", () => {
  const next = computeNextNotificationAt(new Date("2026-08-10T12:00:00-03:00"), [], {}, new Date("2026-08-10T12:01:00-03:00"));
  assert.equal(next, null);
});

test("recalcula ante cambio de fecha del evento", () => {
  const reminders = [{ id: "one", amount: 1, unit: "days" as const, offsetMinutes: 1440 }];
  const oldNext = computeNextNotificationAt(new Date("2026-08-10T12:00:00-03:00"), reminders, {}, new Date("2026-08-01T12:00:00-03:00"));
  const newNext = computeNextNotificationAt(new Date("2026-08-12T12:00:00-03:00"), reminders, {}, new Date("2026-08-01T12:00:00-03:00"));
  assert.notEqual(oldNext?.toISOString(), newNext?.toISOString());
});

test("detecta cambios relevantes e irrelevantes de planillas", () => {
  const before = { titulo: "A", columnas: [{ id: "nota" }], alumnoId: "u1" };
  assert.equal(isRelevantPlanillaUpdate(before, { ...before, fechaActualizacion: 1 }), false);
  assert.equal(isRelevantPlanillaUpdate(before, { ...before, titulo: "B" }), true);
});

test("notificacion de nota de entrega solo cuando aparece nota numerica", () => {
  assert.equal(isNewSubmissionGrade({ nota: null }, { nota: 8 }), true);
  assert.equal(isNewSubmissionGrade({ nota: 8 }, { nota: 8 }), false);
});

test("reentrega solo cuando pasa a requerida", () => {
  assert.equal(isResubmissionRequested({ requiereReentrega: false }, { requiereReentrega: true }), true);
  assert.equal(isResubmissionRequested({ requiereReentrega: true }, { requiereReentrega: true }), false);
});

test("previene duplicados con clave estable", () => {
  const a = deduplicationKey(["exam_grade", "nota1", 123]);
  const b = deduplicationKey(["exam_grade", "nota1", 123]);
  assert.equal(a, b);
});
