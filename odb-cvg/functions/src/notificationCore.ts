export type NotificationType =
  | "new_content"
  | "exam_grade"
  | "submission_grade"
  | "tp_sheet_created"
  | "tp_sheet_updated"
  | "delivery_space_created"
  | "resubmission_requested"
  | "schedule_reminder";

export type ReminderUnit = "minutes" | "hours" | "days";

export interface NotificationReminder {
  id: string;
  amount: number;
  unit: ReminderUnit;
  offsetMinutes: number;
}

export function offsetMinutesFromReminder(amount: number, unit: ReminderUnit): number {
  if (unit === "days") return amount * 24 * 60;
  if (unit === "hours") return amount * 60;
  return amount;
}

export function sortReminders<T extends { offsetMinutes: number }>(reminders: T[]): T[] {
  return [...reminders].sort((a, b) => b.offsetMinutes - a.offsetMinutes);
}

export function computeNextNotificationAt(
  eventDate: Date,
  reminders: NotificationReminder[],
  processed: Record<string, boolean> = {},
  now = new Date(),
): Date | null {
  if (eventDate.getTime() <= now.getTime()) return null;
  const pending = sortReminders(reminders)
    .map((reminder) => ({
      reminder,
      at: new Date(eventDate.getTime() - reminder.offsetMinutes * 60000),
    }))
    .filter(({ reminder, at }) => at.getTime() >= now.getTime() && !processed[String(reminder.offsetMinutes)]);
  pending.sort((a, b) => a.at.getTime() - b.at.getTime());
  return pending[0]?.at ?? null;
}

export function deduplicationKey(parts: Array<string | number | null | undefined>): string {
  return parts.filter((part) => part !== null && part !== undefined && String(part).length > 0).join(":");
}

export function isRelevantPlanillaUpdate(before: any, after: any): boolean {
  if (!before) return true;
  return JSON.stringify(before.columnas ?? []) !== JSON.stringify(after.columnas ?? []) ||
    before.titulo !== after.titulo ||
    before.alumnoId !== after.alumnoId ||
    before.subseccionPath !== after.subseccionPath;
}

export function isNewSubmissionGrade(before: any, after: any): boolean {
  return before?.nota !== after?.nota && typeof after?.nota === "number";
}

export function isResubmissionRequested(before: any, after: any): boolean {
  return before?.requiereReentrega !== true && after?.requiereReentrega === true;
}
