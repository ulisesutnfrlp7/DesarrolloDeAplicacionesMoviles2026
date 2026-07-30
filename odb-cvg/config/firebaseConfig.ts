import { getAnalytics, isSupported } from "firebase/analytics";
import { getApp, getApps, initializeApp } from "firebase/app";
import * as firebaseAuth from "firebase/auth";
import type { Auth, Persistence } from "firebase/auth";
import { getAuth, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_MEASUREMENT_ID,
};

// Initialize Firebase once. Fast Refresh can re-evaluate this module.
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const analytics = isSupported().then((yes) =>
  yes ? getAnalytics(app) : null,
);

type FirebaseAuthModule = typeof import("firebase/auth") & {
  getReactNativePersistence?: (storage: typeof AsyncStorage) => Persistence;
};

function initializeFirebaseAuth(): Auth {
  const authModule = firebaseAuth as FirebaseAuthModule;
  const getPersistence = authModule.getReactNativePersistence;

  if (Platform.OS === "web" || typeof getPersistence !== "function") {
    return getAuth(app);
  }

  try {
    return initializeAuth(app, {
      persistence: getPersistence(AsyncStorage),
    });
  } catch (error: any) {
    if (error?.code === "auth/already-initialized") return getAuth(app);
    throw error;
  }
}

export const auth = initializeFirebaseAuth();

export const db = getFirestore(app);
export const storage = getStorage(app);
