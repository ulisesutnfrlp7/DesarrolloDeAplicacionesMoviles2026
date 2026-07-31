declare module "expo-notifications" {
  export enum AndroidImportance {
    DEFAULT = 3,
    MAX = 5,
  }

  export function setNotificationChannelAsync(
    channelId: string,
    channel: Record<string, unknown>,
  ): Promise<void>;

  export function getPermissionsAsync(): Promise<{ status: string }>;
  export function requestPermissionsAsync(): Promise<{ status: string }>;
  export function getExpoPushTokenAsync(options: { projectId: string }): Promise<{ data: string }>;
  export function setNotificationHandler(handler: {
    handleNotification: () => Promise<Record<string, boolean>>;
  }): void;
  export function addNotificationResponseReceivedListener(
    listener: (response: {
      notification: { request: { identifier?: string; content: { data?: Record<string, unknown> } } };
    }) => void,
  ): { remove: () => void };
  export function getLastNotificationResponseAsync(): Promise<{
    notification: { request: { identifier?: string; content: { data?: Record<string, unknown> } } };
  } | null>;
}
