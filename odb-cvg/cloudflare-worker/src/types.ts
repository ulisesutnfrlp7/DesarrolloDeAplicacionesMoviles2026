export interface Env {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  EXPO_ACCESS_TOKEN?: string;
  MAX_JOB_ATTEMPTS?: string;
  NOTIFICATION_QUEUE: Queue<NotificationQueueMessage>;
}

export interface NotificationQueueMessage {
  jobId: string;
  reason: "created" | "retry" | "recovery";
}

export interface Queue<T> {
  send(message: T, options?: { delaySeconds?: number }): Promise<void>;
}

export interface QueueMessage<T> {
  body: T;
  attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

export interface MessageBatch<T> {
  messages: QueueMessage<T>[];
}

export interface FirebaseToken {
  uid: string;
  email?: string;
}

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface NotificationJob {
  id: string;
  type: string;
  sourceId: string;
  sourcePath: string;
  courseId?: string;
  sectionId?: string;
  targetUserId?: string;
  payload?: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  createdAt?: string;
  updatedAt?: string;
  nextAttemptAt?: string;
  processedAt?: string;
  lastError?: string;
  lockedAt?: string;
  lockedBy?: string;
  leaseId?: string;
  leaseExpiresAt?: string;
  internalCreatedAt?: string;
  pushLastAttemptAt?: string;
  deduplicationKey: string;
  createdBy: string;
}

export interface NotificationTarget {
  kind: string;
  [key: string]: unknown;
}

export interface NotificationPayload {
  userId: string;
  type: string;
  title: string;
  body: string;
  target: NotificationTarget;
  sourceId?: string | null;
  courseId?: string | null;
  deduplicationKey: string;
  metadata?: Record<string, unknown> | null;
}

export interface PushSendResult {
  status: "sent" | "no_tokens" | "disabled" | "failed" | "invalid_token";
  tokensFound: number;
  messagesAccepted: number;
  messagesFailed: number;
}

export interface NotifyResult {
  attempted: number;
  created: number;
  alreadyExisted: number;
  failed: number;
  pushTokensFound: number;
  pushMessagesAccepted: number;
  pushMessagesFailed: number;
}

export interface Reminder {
  id: string;
  amount: number;
  unit: "minutes" | "hours" | "days";
  offsetMinutes: number;
}
