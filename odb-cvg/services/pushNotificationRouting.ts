let configured = false;

function pushConfigLog(event: string, payload: Record<string, unknown>) {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log(event, payload);
  }
}

export async function configurePushNotificationRouting() {
  if (configured) return;
  configured = true;
  pushConfigLog("push_routing_initialized", { configured: true, responseNavigation: false });
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
  } catch (error) {
    configured = false;
    pushConfigLog("push_routing_configuration_failed", {
      error: String((error as { message?: string })?.message ?? error).slice(0, 160),
    });
  }
}
