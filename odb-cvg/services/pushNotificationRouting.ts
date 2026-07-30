import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../config/firebaseConfig";
import type { NotificationTarget } from "../types/notifications";
import { navigateToNotificationTarget } from "./notificationNavigation";

let configured = false;

async function waitForAuthReady(): Promise<void> {
  if (auth.currentUser) return;
  await new Promise<void>((resolve) => {
    const unsub = onAuthStateChanged(auth, () => {
      unsub();
      resolve();
    });
  });
}

async function handleNotificationData(data: Record<string, unknown> | undefined) {
  const rawTarget = data?.target;
  if (!rawTarget || typeof rawTarget !== "string") return;
  try {
    const target = JSON.parse(rawTarget) as NotificationTarget;
    await waitForAuthReady();
    await navigateToNotificationTarget(target);
  } catch (error) {
    console.error("handleNotificationData error:", error);
  }
}

export async function configurePushNotificationRouting() {
  if (configured) return;
  configured = true;
  try {
    const Notifications = await import("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationData(response.notification.request.content.data as Record<string, unknown>);
    });

    const initial = await Notifications.getLastNotificationResponseAsync();
    if (initial) {
      handleNotificationData(initial.notification.request.content.data as Record<string, unknown>);
    }
  } catch {
    configured = false;
  }
}
