import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "../config/firebaseConfig";

export function useUserRole() {
  const [rol, setRol] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const docRef = doc(db, "usuarios", user.uid);
          const docSnap = await getDoc(docRef);
          setRol(docSnap.exists() ? (docSnap.data().rol ?? null) : null);
        } catch (error) {
          console.error("useUserRole error:", error);
          setRol(null);
        } finally {
          setLoading(false);
        }
      } else {
        setRol(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return { rol, loading };
}
