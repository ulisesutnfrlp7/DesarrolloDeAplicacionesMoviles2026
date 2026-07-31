import Constants from "expo-constants";
import * as Device from "expo-device";
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { Platform } from "react-native";
import { auth, db } from "../config/firebaseConfig";

type ExpoNotificationsModule = typeof import("expo-notifications");
type AndroidChannelReader = {
  getNotificationChannelAsync?: (channelId: string) => Promise<{
    importance?: unknown;
    sound?: unknown;
    vibrationPattern?: unknown;
  } | null>;
};

type PushPreference = {
  enabled: boolean;
  loading: boolean;
  error: string | null;
};

export type PushDiagnostics = {
  permissionStatus: string;
  hasExpoPushToken: boolean;
  tokenSuffix: string | null;
  storedInFirestore: boolean;
  pushEnabled: boolean;
};

type PushErrorCode =
  | "physical_device_required"
  | "permission_denied"
  | "eas_project_id_missing"
  | "expo_token_generation_failed"
  | "firestore_token_save_failed"
  | "push_preference_read_failed";

export class PushRegistrationError extends Error {
  code: PushErrorCode;

  constructor(code: PushErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function tokenDocId(token: string) {
  return encodeURIComponent(token).replace(/\./g, "%2E");
}

function pushLog(event: string, payload: Record<string, unknown>) {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log(event, payload);
  }
}

function summarizeError(error: unknown) {
  const err = error as { code?: string; message?: string };
  return {
    code: err?.code ?? "unknown",
    message: String(err?.message ?? error ?? "unknown").slice(0, 160),
  };
}

function getEasProjectId(): string | null {
  return Constants.easConfig?.projectId
    ?? Constants.expoConfig?.extra?.eas?.projectId
    ?? null;
}

function isValidExpoPushToken(token: string) {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
}

async function loadNotificationsModule(): Promise<ExpoNotificationsModule | null> {
  try {
    return await import("expo-notifications");
  } catch {
    return null;
  }
}

export async function registerCurrentDeviceForPush(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;

  pushLog("push_registration_started", {
    platform: Platform.OS,
    uidSuffix: user.uid.slice(-6),
  });

  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    throw new PushRegistrationError("expo_token_generation_failed", "expo-notifications no esta instalado.");
  }

  if (Platform.OS === "android") {
    const channelReader = Notifications as ExpoNotificationsModule & AndroidChannelReader;
    const existingChannel = await channelReader.getNotificationChannelAsync?.("default");
    pushLog("android_channel_existing", {
      channel_exists: Boolean(existingChannel),
      channel_importance: existingChannel?.importance ?? null,
      channel_sound: existingChannel?.sound ?? null,
      channel_vibration: existingChannel?.vibrationPattern ?? null,
    });
    await Notifications.setNotificationChannelAsync("default", {
      name: "Notificaciones",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
      enableVibrate: true,
      showBadge: true,
      lightColor: "#25B471",
    });
    const channel = await channelReader.getNotificationChannelAsync?.("default");
    pushLog("android_channel_created", {
      platform: Platform.OS,
      channelId: "default",
      channel_exists: Boolean(channel),
      channel_importance: channel?.importance ?? null,
      channel_sound: channel?.sound ?? null,
      channel_vibration: channel?.vibrationPattern ?? null,
    });
  }

  if (!Device.isDevice) {
    pushLog("push_permission_status", {
      platform: Platform.OS,
      permission: "physical_device_required",
    });
    await setDoc(
      doc(db, "usuarios", user.uid, "notificationPreferences", "push"),
      { enabled: false, updatedAt: serverTimestamp() },
      { merge: true },
    );
    throw new PushRegistrationError("physical_device_required", "Las push remotas requieren un dispositivo fisico.");
  }

  const current = await Notifications.getPermissionsAsync();
  const finalStatus = current.status === "granted"
    ? current.status
    : (await Notifications.requestPermissionsAsync()).status;
  pushLog("push_permission_status", {
    platform: Platform.OS,
    permission: finalStatus,
  });

  if (finalStatus !== "granted") {
    await setDoc(
      doc(db, "usuarios", user.uid, "notificationPreferences", "push"),
      { enabled: false, updatedAt: serverTimestamp() },
      { merge: true },
    );
    throw new PushRegistrationError("permission_denied", "El permiso del sistema para notificaciones esta denegado.");
  }

  const projectId = getEasProjectId();
  pushLog("eas_project_id_loaded", {
    platform: Platform.OS,
    hasProjectId: Boolean(projectId),
  });
  if (!projectId) {
    throw new PushRegistrationError("eas_project_id_missing", "Falta configurar el EAS projectId para obtener ExpoPushToken.");
  }

  let expoToken: string;
  try {
    expoToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (error) {
    pushLog("expo_push_token_created", {
      platform: Platform.OS,
      ok: false,
      error: summarizeError(error),
    });
    throw new PushRegistrationError("expo_token_generation_failed", "No se pudo obtener el ExpoPushToken.");
  }

  if (!isValidExpoPushToken(expoToken)) {
    pushLog("expo_push_token_created", {
      platform: Platform.OS,
      ok: false,
      tokenSuffix: expoToken?.slice(-6) ?? null,
    });
    throw new PushRegistrationError("expo_token_generation_failed", "Expo devolvio un token con formato invalido.");
  }

  const ref = doc(db, "usuarios", user.uid, "pushTokens", tokenDocId(expoToken));
  pushLog("expo_push_token_created", {
    platform: Platform.OS,
    ok: true,
    tokenSuffix: expoToken.slice(-6),
  });
  pushLog("expo_push_token_save_started", {
    platform: Platform.OS,
    tokenSuffix: expoToken.slice(-6),
    path: `usuarios/${user.uid}/pushTokens/${tokenDocId(expoToken)}`,
  });

  try {
    await setDoc(
      ref,
      {
        token: expoToken,
        platform: Platform.OS,
        enabled: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        appVersion: Constants.expoConfig?.version ?? null,
      },
      { merge: true },
    );
  } catch (error) {
    pushLog("expo_push_token_save_failed", {
      platform: Platform.OS,
      tokenSuffix: expoToken.slice(-6),
      path: `usuarios/${user.uid}/pushTokens/${tokenDocId(expoToken)}`,
      error: summarizeError(error),
    });
    throw new PushRegistrationError("firestore_token_save_failed", "No se pudo guardar el ExpoPushToken.");
  }

  pushLog("expo_push_token_saved", {
    platform: Platform.OS,
    tokenSuffix: expoToken.slice(-6),
    path: `usuarios/${user.uid}/pushTokens/${tokenDocId(expoToken)}`,
  });

  await setDoc(
    doc(db, "usuarios", user.uid, "notificationPreferences", "push"),
    { enabled: true, updatedAt: serverTimestamp() },
    { merge: true },
  );

  return expoToken;
}

export async function setPushEnabled(enabled: boolean): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("No autenticado");
  await setDoc(
    doc(db, "usuarios", user.uid, "notificationPreferences", "push"),
    { enabled, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function disablePushToken(token: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("No autenticado");
  await updateDoc(doc(db, "usuarios", user.uid, "pushTokens", tokenDocId(token)), {
    enabled: false,
    updatedAt: serverTimestamp(),
  });
}

export async function getPushPreference(): Promise<PushPreference> {
  const user = auth.currentUser;
  if (!user) return { enabled: false, loading: false, error: null };
  try {
    pushLog("push_preference_read_started", {
      path: `usuarios/${user.uid}/notificationPreferences/push`,
    });
    const snap = await getDoc(doc(db, "usuarios", user.uid, "notificationPreferences", "push"));
    const enabled = snap.exists() ? snap.data()?.enabled !== false : true;
    pushLog("push_preference_read_success", {
      path: `usuarios/${user.uid}/notificationPreferences/push`,
      exists: snap.exists(),
      enabled,
    });
    return { enabled, loading: false, error: null };
  } catch (error) {
    pushLog("push_preference_read_failed", {
      path: `usuarios/${user.uid}/notificationPreferences/push`,
      error: summarizeError(error),
    });
    return { enabled: true, loading: false, error: "No se pudo leer la preferencia de push." };
  }
}

export async function getPushDiagnostics(): Promise<PushDiagnostics> {
  const user = auth.currentUser;
  if (!user) {
    return { permissionStatus: "unauthenticated", hasExpoPushToken: false, tokenSuffix: null, storedInFirestore: false, pushEnabled: false };
  }

  const pref = await getPushPreference();
  const Notifications = await loadNotificationsModule();
  const permissionStatus = Notifications ? (await Notifications.getPermissionsAsync()).status : "module_unavailable";
  let token: string | null = null;
  try {
    const projectId =
      getEasProjectId();
    if (Notifications && projectId && permissionStatus === "granted") {
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    }
  } catch {
    token = null;
  }

  const tokenDocs = await getDocs(collection(db, "usuarios", user.uid, "pushTokens"));
  const storedInFirestore = token
    ? tokenDocs.docs.some((snap) => snap.data().token === token && snap.data().enabled !== false)
    : tokenDocs.docs.some((snap) => snap.data().enabled !== false);

  return {
    permissionStatus,
    hasExpoPushToken: !!token,
    tokenSuffix: token ? token.slice(-6) : null,
    storedInFirestore,
    pushEnabled: pref.enabled,
  };
}
