import Constants from "expo-constants";
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { Platform } from "react-native";
import { auth, db } from "../config/firebaseConfig";

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

function tokenDocId(token: string) {
  return encodeURIComponent(token).replace(/\./g, "%2E");
}

async function loadNotificationsModule() {
  try {
    return await import("expo-notifications");
  } catch {
    return null;
  }
}

export async function registerCurrentDeviceForPush(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;

  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    throw new Error("expo-notifications no esta instalado.");
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Notificaciones",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#25B471",
    });
  }

  const current = await Notifications.getPermissionsAsync();
  const finalStatus = current.status === "granted"
    ? current.status
    : (await Notifications.requestPermissionsAsync()).status;

  if (finalStatus !== "granted") {
    await setDoc(
      doc(db, "usuarios", user.uid, "notificationPreferences", "push"),
      { enabled: false, updatedAt: serverTimestamp() },
      { merge: true },
    );
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) {
    throw new Error("Falta configurar extra.eas.projectId para obtener ExpoPushToken.");
  }

  const expoToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const ref = doc(db, "usuarios", user.uid, "pushTokens", tokenDocId(expoToken));
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
    const snap = await getDoc(doc(db, "usuarios", user.uid, "notificationPreferences", "push"));
    return { enabled: snap.data()?.enabled !== false, loading: false, error: null };
  } catch {
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
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
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
