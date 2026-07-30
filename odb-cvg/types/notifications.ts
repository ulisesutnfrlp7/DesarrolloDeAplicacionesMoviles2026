import type { Timestamp } from "firebase/firestore";

export const NOTIFICATION_TYPES = [
  "new_content",
  "content_updated",
  "exam_grade",
  "exam_grade_updated",
  "submission_grade",
  "submission_grade_updated",
  "submission_grade_with_resubmission",
  "submission_grade_updated_with_resubmission",
  "tp_sheet_created",
  "tp_sheet_updated",
  "delivery_space_created",
  "delivery_space_updated",
  "resubmission_requested",
  "resubmission_updated",
  "schedule_event_created",
  "schedule_event_updated",
  "schedule_reminder",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationTarget =
  | {
      kind: "content";
      moduloId: string;
      seccionId: string;
      itemId?: string;
      subsectionPath?: string[];
      subseccionPath?: string;
    }
  | {
      kind: "grade";
      moduloId?: string;
      seccionId: string;
      subseccionPath?: string;
      nombreExamen?: string;
      entregaItemId?: string;
      entregaId?: string;
    }
  | {
      kind: "tp_sheet";
      planillaId: string;
      moduloId?: string;
      seccionId: string;
      subseccionPath?: string | null;
    }
  | {
      kind: "delivery";
      moduloId: string;
      seccionId: string;
      itemId: string;
      entregaId?: string;
      subseccionPath?: string;
    }
  | {
      kind: "schedule_event";
      eventId: string;
      eventType: "entrega" | "ateneo" | "parcial";
      moduloId?: string;
      seccionId?: string;
      subseccionPath?: string;
    };

export interface NotificationMetadata {
  moduleId?: string;
  moduleTitle?: string;
  sectionId?: string;
  sectionTitle?: string;
  commissionId?: string;
  subsectionId?: string;
  subsectionTitle?: string;
  commissionTitle?: string;
  displayContextLabel?: string;
  displayContextTitle?: string;
  isInsideCommission?: boolean;
  itemTitle?: string;
  contentType?: string;
  examTitle?: string;
  assignmentTitle?: string;
  sheetTitle?: string;
  eventTitle?: string;
  eventType?: string;
  eventDate?: Timestamp | Date | string | null;
  deadline?: Timestamp | Date | string | null;
  location?: string;
  description?: string;
  authorName?: string;
  publishedAt?: Timestamp | Date | string | null;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: Timestamp | Date | null;
  readAt: Timestamp | Date | null;
  isRead: boolean;
  target: NotificationTarget;
  sourceId?: string | null;
  courseId?: string | null;
  deduplicationKey: string;
  metadata?: NotificationMetadata | null;
  pushStatus?: "pending" | "sent" | "no_tokens" | "failed" | "disabled" | "invalid_token";
}

export type ReminderUnit = "minutes" | "hours" | "days";

export interface NotificationReminder {
  id: string;
  amount: number;
  unit: ReminderUnit;
  offsetMinutes: number;
  label?: string;
}

export interface NotificationSchedule {
  enabled: boolean;
  version: number;
  reminders: NotificationReminder[];
  nextNotificationAt: Timestamp | Date | null;
  processed?: Record<string, boolean>;
}

export const DEFAULT_NOTIFICATION_SCHEDULE: NotificationSchedule = {
  enabled: false,
  version: 1,
  reminders: [],
  nextNotificationAt: null,
};

export function offsetMinutesFromReminder(amount: number, unit: ReminderUnit): number {
  if (unit === "days") return amount * 24 * 60;
  if (unit === "hours") return amount * 60;
  return amount;
}

export function normalizeReminder(reminder: Omit<NotificationReminder, "offsetMinutes">): NotificationReminder {
  return {
    ...reminder,
    offsetMinutes: offsetMinutesFromReminder(reminder.amount, reminder.unit),
  };
}

export function sortReminders(reminders: NotificationReminder[]): NotificationReminder[] {
  return [...reminders].sort((a, b) => b.offsetMinutes - a.offsetMinutes);
}

export function reminderLabel(reminder: NotificationReminder): string {
  if (reminder.offsetMinutes === 0) return "El mismo momento";
  const unidad =
    reminder.unit === "days"
      ? reminder.amount === 1 ? "dia" : "dias"
      : reminder.unit === "hours"
        ? reminder.amount === 1 ? "hora" : "horas"
        : reminder.amount === 1 ? "minuto" : "minutos";
  return `${reminder.amount} ${unidad} antes`;
}

export function validateReminders(reminders: NotificationReminder[], eventDate: Date): string | null {
  const seen = new Set<number>();
  for (const reminder of reminders) {
    if (!Number.isFinite(reminder.amount) || reminder.amount < 0) {
      return "Los recordatorios no pueden tener valores negativos o vacios.";
    }
    if (reminder.amount === 0 && reminder.offsetMinutes !== 0) {
      return "El valor cero solo se admite para el mismo momento.";
    }
    if (reminder.amount === 0 && reminder.unit !== "minutes") {
      return "El mismo momento se guarda como 0 minutos.";
    }
    if (reminder.amount > 0 && reminder.offsetMinutes <= 0) {
      return "El recordatorio debe ser mayor a cero.";
    }
    if (seen.has(reminder.offsetMinutes)) {
      return "Hay recordatorios duplicados.";
    }
    seen.add(reminder.offsetMinutes);

    const fireAt = eventDate.getTime() - reminder.offsetMinutes * 60000;
    if (fireAt > eventDate.getTime()) {
      return "No se permiten recordatorios posteriores al evento.";
    }
  }
  return null;
}

export function computeNextNotificationAt(
  eventDate: Date,
  reminders: NotificationReminder[],
  processed: Record<string, boolean> = {},
  now = new Date(),
  toleranceMs = 0,
): Date | null {
  if (eventDate.getTime() <= now.getTime()) return null;
  const pending = sortReminders(reminders)
    .map((reminder) => ({
      reminder,
      at: new Date(eventDate.getTime() - reminder.offsetMinutes * 60000),
    }))
    .filter(({ reminder, at }) => at.getTime() >= now.getTime() - toleranceMs && !processed[String(reminder.offsetMinutes)]);

  pending.sort((a, b) => a.at.getTime() - b.at.getTime());
  return pending[0]?.at ?? null;
}

export function badgeLabel(count: number): string | null {
  if (count <= 0) return null;
  if (count > 99) return "99+";
  return String(count);
}

export function isSafeNotificationDocumentId(value: unknown): value is string {
  return typeof value === "string" &&
    /^notif_sha256_[a-f0-9]{64}$/.test(value);
}
