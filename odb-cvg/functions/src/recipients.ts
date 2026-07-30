import * as admin from "firebase-admin";

export interface CourseScope {
  moduloId?: string;
  seccionId?: string;
  subseccionPath?: string | null;
  comisionSubseccionId?: string | null;
}

async function isActiveStudent(userId: string): Promise<boolean> {
  const snap = await admin.firestore().doc(`usuarios/${userId}`).get();
  const data = snap.data();
  return snap.exists && data?.rol === "alumno" && data?.activo !== false;
}

export async function resolveSingleStudent(userId?: string | null): Promise<string[]> {
  if (!userId) return [];
  return (await isActiveStudent(userId)) ? [userId] : [];
}

export async function resolveStudentsForCourse(scope: CourseScope): Promise<string[]> {
  if (!scope.seccionId && !scope.moduloId) return [];
  let query: FirebaseFirestore.Query = admin.firestore().collection("inscripciones");
  if (scope.moduloId) query = query.where("moduloId", "==", scope.moduloId);
  if (scope.seccionId) query = query.where("seccionId", "==", scope.seccionId);

  const snap = await query.get();
  const normalizedPath = normalizePath(scope.subseccionPath ?? scope.comisionSubseccionId ?? "");
  const ids = new Set<string>();
  snap.docs.forEach((doc) => {
    const data = doc.data();
    const inscPath = normalizePath(data.subseccionPath ?? "");
    if (normalizedPath && inscPath && !(normalizedPath === inscPath || normalizedPath.startsWith(`${inscPath}/`) || inscPath.startsWith(`${normalizedPath}/`))) {
      return;
    }
    if (typeof data.alumnoId === "string") ids.add(data.alumnoId);
  });

  const active = await Promise.all([...ids].map(async (id) => ({ id, active: await isActiveStudent(id) })));
  return active.filter((item) => item.active).map((item) => item.id);
}

function normalizePath(path: string) {
  return path.split("/").map((item) => item.trim()).filter(Boolean).join("/");
}
