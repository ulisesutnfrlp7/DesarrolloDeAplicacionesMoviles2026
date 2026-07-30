import { FirestoreRest } from "./firestore.js";

type Feature = "content" | "grades" | "sheets" | "submissions";

export interface CourseScope {
  moduloId: string;
  seccionId: string;
  subseccionPath?: string | null;
  itemId?: string;
}

export async function assertCanNotifyCourse(
  db: FirestoreRest,
  uid: string,
  user: any,
  scope: CourseScope,
  feature: Feature,
): Promise<void> {
  if (user?.rol === "admin") return;
  const normalizedRole = normalizeRole(user?.rol);
  console.log("professor_authorization_started", {
    feature,
    uidSuffix: uid.slice(-6),
    moduloId: scope.moduloId,
    seccionId: scope.seccionId,
    subsecciones: normalize(scope.subseccionPath ?? "").split("/").filter(Boolean).length,
    itemId: scope.itemId ?? null,
    role: normalizedRole,
  });
  if (normalizedRole !== "profesor") {
    console.log("professor_authorization_denied", { feature, uidSuffix: uid.slice(-6), reason: "invalid_role", role: normalizedRole });
    throw new Error("invalid_role");
  }

  const permissionDocs = await permissionSources(db, scope);
  if (permissionDocs.length === 0) {
    console.log("professor_authorization_denied", { feature, uidSuffix: uid.slice(-6), reason: "section_not_found" });
    throw new Error("section_not_found");
  }

  console.log("professor_role_loaded", { uidSuffix: uid.slice(-6), role: normalizedRole });
  for (const permissionDoc of permissionDocs) {
    console.log("ancestor_permission_checked", {
      uidSuffix: uid.slice(-6),
      level: permissionDoc.level,
      permiteCargaProfesor: permissionDoc.permiteCargaProfesor === true,
      permiteNotas: permissionDoc.permiteNotas === true,
      permitePlanillas: permissionDoc.permitePlanillas === true,
      createdByProfessor: createdBy(permissionDoc, uid),
    });
    if (createdBy(permissionDoc, uid) || permissionDoc[permissionFlag(feature)] === true) {
      console.log("professor_authorized", { uidSuffix: uid.slice(-6), feature, level: permissionDoc.level });
      return;
    }
  }
  console.log("professor_authorization_denied", { feature, uidSuffix: uid.slice(-6), reason: "no_professor_permission_in_path" });
  throw new Error("no_professor_permission_in_path");
}

async function permissionSources(db: FirestoreRest, scope: CourseScope) {
  const basePath = `modulos/${scope.moduloId}/secciones/${scope.seccionId}`;
  const subseccionPath = normalize(scope.subseccionPath ?? "");
  const docs = [];
  const section = await db.get(basePath);
  if (section) docs.push({ ...section, level: "section" });

  const parts = subseccionPath ? subseccionPath.split("/") : [];
  for (let index = 0; index < parts.length; index += 1) {
    const path = `${basePath}/${parts.slice(0, index + 1).flatMap((id) => ["subsecciones", id]).join("/")}`;
    const doc = await db.get(path);
    if (doc) docs.push({ ...doc, level: `subsection:${index + 1}` });
  }
  if (scope.itemId) {
    const itemPath = `${basePath}${parts.length > 0 ? `/${parts.flatMap((id) => ["subsecciones", id]).join("/")}` : ""}/items/${scope.itemId}`;
    console.log("submission_item_loaded", {
      moduloId: scope.moduloId,
      seccionId: scope.seccionId,
      subsecciones: parts.filter(Boolean).length,
      itemId: scope.itemId,
    });
    const item = await db.get(itemPath);
    if (item) docs.push({ ...item, level: "item" });
  }
  return docs;
}

function normalize(path: string) {
  return path.split("/").map((segment) => segment.trim()).filter(Boolean).join("/");
}

function normalizeRole(role: unknown) {
  return String(role ?? "").trim().toLowerCase();
}

function createdBy(doc: any, uid: string) {
  return doc?.creadoPor === uid || doc?.creadoPorUid === uid || doc?.profesorId === uid;
}

function permissionFlag(feature: Feature): string {
  if (feature === "grades") return "permiteNotas";
  if (feature === "sheets") return "permitePlanillas";
  return "permiteCargaProfesor";
}
