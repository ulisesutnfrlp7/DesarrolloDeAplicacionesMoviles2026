import type { Reminder } from "./types.js";

export function deduplicationKey(parts: Array<string | number | null | undefined>): string {
  return parts.filter((part) => part !== null && part !== undefined && String(part).length > 0).join(":");
}

export async function sha256Hex(input: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function stableDocumentId(prefix: "job" | "notif", input: string): Promise<string> {
  return `${prefix}_sha256_${await sha256Hex(input)}`;
}

export function coalesceWindowKey(date = new Date(), minutes = 10): string {
  return String(Math.floor(date.getTime() / (minutes * 60000)));
}

export function offsetMinutes(amount: number, unit: Reminder["unit"]): number {
  if (unit === "days") return amount * 24 * 60;
  if (unit === "hours") return amount * 60;
  return amount;
}

export function computeNextNotificationAt(
  eventDate: Date,
  reminders: Reminder[],
  processed: Record<string, boolean> = {},
  now = new Date(),
  toleranceMs = 0,
): Date | null {
  if (eventDate.getTime() <= now.getTime()) return null;
  const pending = [...reminders]
    .sort((a, b) => b.offsetMinutes - a.offsetMinutes)
    .map((reminder) => ({
      reminder,
      at: new Date(eventDate.getTime() - reminder.offsetMinutes * 60000),
    }))
    .filter(({ reminder, at }) => at.getTime() >= now.getTime() - toleranceMs && !processed[String(reminder.offsetMinutes)]);
  pending.sort((a, b) => a.at.getTime() - b.at.getTime());
  return pending[0]?.at ?? null;
}

export function shouldRetry(status: string, attempts: number, maxAttempts: number, nextAttemptAt: Date, now = new Date()) {
  return (status === "pending" || status === "failed") &&
    attempts < maxAttempts &&
    nextAttemptAt.getTime() <= now.getTime();
}

export function nextBackoff(attempts: number, now = new Date()): Date {
  const minutes = Math.min(60, Math.pow(2, attempts));
  return new Date(now.getTime() + minutes * 60000);
}

export function isRelevantPlanillaUpdate(before: any, after: any): boolean {
  if (!before) return true;
  return JSON.stringify(before.columnas ?? []) !== JSON.stringify(after.columnas ?? []) ||
    before.titulo !== after.titulo ||
    before.alumnoId !== after.alumnoId ||
    before.subseccionPath !== after.subseccionPath;
}

export function scopeFromItemPath(path: string): { moduloId: string; seccionId: string; subseccionPath?: string } | null {
  const parts = path.split("/");
  if (parts.length < 6 || parts[0] !== "modulos" || parts[2] !== "secciones" || parts.at(-2) !== "items") return null;
  const middle = parts.slice(4, -2);
  for (let i = 0; i < middle.length; i += 2) {
    if (middle[i] !== "subsecciones" || !middle[i + 1]) return null;
  }
  const moduloIndex = parts.indexOf("modulos");
  const seccionIndex = parts.indexOf("secciones");
  const itemIndex = parts.lastIndexOf("items");
  if (moduloIndex < 0 || seccionIndex < 0 || itemIndex < 0) return null;
  const subseccionPath = parts.slice(seccionIndex + 2, itemIndex).reduce<string[]>((acc, segment, index, arr) => {
    if (arr[index - 1] === "subsecciones") acc.push(segment);
    return acc;
  }, []).join("/");
  return { moduloId: parts[moduloIndex + 1], seccionId: parts[seccionIndex + 1], ...(subseccionPath ? { subseccionPath } : {}) };
}

export function itemIdFromPath(path: string): string | null {
  const scope = scopeFromItemPath(path);
  if (!scope) return null;
  const parts = path.split("/");
  return parts[parts.length - 1] || null;
}

export function subsectionPathArrayFromItemPath(path: string): string[] {
  return scopeFromItemPath(path)?.subseccionPath?.split("/").filter(Boolean) ?? [];
}

export function scopeFromDeliveryPath(path: string): { moduloId: string; seccionId: string; subseccionPath?: string; itemId: string; entregaId: string } | null {
  const parts = path.split("/");
  if (parts.at(-2) !== "entregas_alumnos" || !parts.at(-1)) return null;
  const itemPath = parts.slice(0, -2).join("/");
  const scope = scopeFromItemPath(itemPath);
  const itemId = itemIdFromPath(itemPath);
  if (!scope || !itemId) return null;
  return { ...scope, itemId, entregaId: parts[parts.length - 1] };
}

export function planillaPathId(path: string): string | null {
  const parts = path.split("/");
  return parts.length === 2 && parts[0] === "planillas_tp" && Boolean(parts[1]) ? parts[1] : null;
}

export function examBatchPathScope(path: string): { moduloId: string; seccionId: string; batchId: string } | null {
  const parts = path.split("/");
  if (parts.length !== 6) return null;
  if (parts[0] !== "modulos" || parts[2] !== "secciones" || parts[4] !== "notas_lotes") return null;
  if (!parts[1] || !parts[3] || !parts[5]) return null;
  return { moduloId: parts[1], seccionId: parts[3], batchId: parts[5] };
}

export function validateSourcePath(type: string, sourcePath: string): boolean {
  if (!sourcePath || sourcePath.includes("..") || sourcePath.includes("//")) return false;
  if (["new_content", "content_updated", "delivery_space_created", "delivery_space_updated"].includes(type)) return Boolean(scopeFromItemPath(sourcePath));
  if (["submission_grade", "submission_grade_updated", "submission_grade_with_resubmission", "submission_grade_updated_with_resubmission", "resubmission_requested", "resubmission_updated"].includes(type)) return Boolean(scopeFromDeliveryPath(sourcePath));
  if (type === "tp_sheet_created" || type === "tp_sheet_updated") return Boolean(planillaPathId(sourcePath));
  if (type === "exam_grade" || type === "exam_grade_updated") return Boolean(examBatchPathScope(sourcePath));
  if (type === "schedule_event_created" || type === "schedule_event_updated") {
    const parts = sourcePath.split("/");
    return parts.length === 2 && parts[0] === "eventos_cronograma" && Boolean(parts[1]);
  }
  return false;
}
