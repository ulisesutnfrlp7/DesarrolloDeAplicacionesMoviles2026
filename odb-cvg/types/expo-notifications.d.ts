declare module "expo-notifications" {
  export enum AndroidImportance {
    DEFAULT = 3,
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
      notification: { request: { content: { data?: Record<string, unknown> } } };
    }) => void,
  ): { remove: () => void };
  export function getLastNotificationResponseAsync(): Promise<{
    notification: { request: { content: { data?: Record<string, unknown> } } };
  } | null>;
}
