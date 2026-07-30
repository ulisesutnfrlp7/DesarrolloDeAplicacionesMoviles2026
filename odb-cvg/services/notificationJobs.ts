import { auth } from "../config/firebaseConfig";

export type NotificationJobType =
  | "new_content"
  | "content_updated"
  | "exam_grade"
  | "exam_grade_updated"
  | "submission_grade"
  | "submission_grade_updated"
  | "submission_grade_with_resubmission"
  | "submission_grade_updated_with_resubmission"
  | "tp_sheet_created"
  | "tp_sheet_updated"
  | "delivery_space_created"
  | "delivery_space_updated"
  | "resubmission_requested"
  | "resubmission_updated"
  | "schedule_event_created"
  | "schedule_event_updated";

interface CreateNotificationJobInput {
  type: NotificationJobType;
  sourcePath: string;
  sourceId: string;
  courseId?: string | null;
  sectionId?: string | null;
  targetUserId?: string | null;
  payload?: Record<string, unknown>;
}

export async function enqueueNotificationJob(input: CreateNotificationJobInput): Promise<boolean> {
  const endpoint = process.env.EXPO_PUBLIC_NOTIFICATION_WORKER_URL;
  const user = auth.currentUser;
  if (!endpoint || !user) return false;

  try {
    const token = await user.getIdToken();
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/jobs`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      let responseSummary: Record<string, unknown> | string | null = null;
      try {
        const data = await res.json();
        responseSummary = {
          error: typeof data?.error === "string" ? data.error : undefined,
          code: typeof data?.code === "string" ? data.code : undefined,
          stage: typeof data?.stage === "string" ? data.stage : undefined,
        };
      } catch {
        responseSummary = null;
      }
      console.warn("notification job rejected:", {
        eventType: input.type,
        status: res.status,
        response: responseSummary,
      });
      return false;
    }
    return true;
  } catch (error) {
    console.warn("notification job enqueue failed:", error instanceof Error ? error.message : "unknown");
    return false;
  }
}

export function itemSourcePath(params: {
  moduloId: string;
  seccionId: string;
  itemId: string;
  subseccionPath?: string | string[];
}) {
  const rawPath = Array.isArray(params.subseccionPath)
    ? params.subseccionPath.join("/")
    : (params.subseccionPath ?? "");
  const segments = rawPath
    .split(/[\/,]/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .flatMap((id) => ["subsecciones", id]);
  return ["modulos", params.moduloId, "secciones", params.seccionId, ...segments, "items", params.itemId].join("/");
}

export function entregaSourcePath(params: {
  moduloId: string;
  seccionId: string;
  itemId: string;
  entregaId: string;
  subseccionPath?: string | string[];
}) {
  return `${itemSourcePath(params)}/entregas_alumnos/${params.entregaId}`;
}

export function scheduleEventSourcePath(eventId: string) {
  return `eventos_cronograma/${eventId}`;
}
