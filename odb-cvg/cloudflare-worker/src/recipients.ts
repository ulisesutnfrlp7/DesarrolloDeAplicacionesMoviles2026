import { FirestoreRest, fieldEquals } from "./firestore.js";
import { resolveAcademicContextFromPath } from "./metadata.js";

const MODULO_GLOBAL = "NINGUNO_EN_ESPECIAL";
const COMISION_GLOBAL = "NINGUNA_EN_ESPECIAL";

export interface NotificationAudience {
  audienceType: "all_students" | "restricted_scope";
  restrictedPath?: string;
  restrictedId?: string;
  restrictedTitle?: string;
  recipients: string[];
  diagnosticReason: "all_students" | "restricted_scope" | "no_active_students" | "no_students_in_restricted_scope" | "invalid_academic_path";
}

export async function resolveSingleStudent(db: FirestoreRest, userId?: string | null): Promise<string[]> {
  if (!userId) return [];
  const user = await db.get(`usuarios/${userId}`);
  return user?.rol === "alumno" && user?.activo !== false ? [userId] : [];
}

export async function resolveRecipientsForSingleStudent(db: FirestoreRest, userId?: string | null): Promise<string[]> {
  return resolveSingleStudent(db, userId);
}

export async function resolveRecipientsForAcademicContext(db: FirestoreRest, scope: {
  moduloId?: string;
  seccionId?: string;
  subseccionPath?: string | null;
  sourcePath?: string | null;
}): Promise<string[]> {
  if (scope.sourcePath) {
    return (await resolveNotificationAudienceFromPath(db, scope.sourcePath)).recipients;
  }
  return resolveStudentsForCourse(db, scope);
}

export async function resolveNotificationAudienceFromPath(db: FirestoreRest, sourcePath: string): Promise<NotificationAudience> {
  const parsed = parseAcademicPath(sourcePath);
  if (!parsed) {
    return { audienceType: "restricted_scope", recipients: [], diagnosticReason: "invalid_academic_path" };
  }

  const restriction = await nearestRestrictedAncestor(db, parsed);
  if (!restriction) {
    const recipients = await allActiveStudents(db);
    return {
      audienceType: "all_students",
      recipients,
      diagnosticReason: recipients.length > 0 ? "all_students" : "no_active_students",
    };
  }

  const recipients = await studentsForRestrictedScope(db, parsed, restriction);
  return {
    audienceType: "restricted_scope",
    restrictedPath: restriction.path,
    restrictedId: restriction.id,
    restrictedTitle: restriction.title,
    recipients,
    diagnosticReason: recipients.length > 0 ? "restricted_scope" : "no_students_in_restricted_scope",
  };
}

export async function resolveRecipientsForEventScope(db: FirestoreRest, scope: {
  moduloId?: string;
  seccionId?: string;
  comisionSubseccionId?: string | null;
}): Promise<string[]> {
  return resolveStudentsForCourse(db, scope);
}

export async function resolveStudentsForCourse(db: FirestoreRest, scope: {
  moduloId?: string;
  seccionId?: string;
  subseccionPath?: string | null;
  comisionSubseccionId?: string | null;
}): Promise<string[]> {
  if (!scope.moduloId || scope.moduloId === MODULO_GLOBAL) {
    const users = await db.runQueryPages("usuarios", [fieldEquals("rol", "alumno")], [], 200, false, 25);
    return users.filter((user) => user.activo !== false).map((user) => user.id);
  }
  const filters = [];
  if (scope.moduloId) filters.push(fieldEquals("moduloId", scope.moduloId));
  const rows = await db.runQueryPages("inscripciones", filters, [], 200, false, 25);
  const wantedPath = normalize(scope.subseccionPath ?? (scope.comisionSubseccionId === COMISION_GLOBAL ? "" : scope.comisionSubseccionId) ?? "");
  const ids = new Set<string>();
  rows.forEach((row) => {
    const currentPath = normalize(row.subseccionPath ?? "");
    if (wantedPath && currentPath && !(wantedPath === currentPath || wantedPath.startsWith(`${currentPath}/`) || currentPath.startsWith(`${wantedPath}/`))) return;
    if (typeof row.alumnoId === "string") ids.add(row.alumnoId);
  });
  const checked = await Promise.all([...ids].map(async (id) => ({ id, ok: (await resolveSingleStudent(db, id)).length === 1 })));
  return checked.filter((item) => item.ok).map((item) => item.id);
}

function normalize(path: string) {
  return path.split("/").map((part) => part.trim()).filter(Boolean).join("/");
}

async function allActiveStudents(db: FirestoreRest): Promise<string[]> {
  const users = await db.runQueryPages("usuarios", [fieldEquals("rol", "alumno")], [], 200, false, 100);
  return [...new Set(users.filter((user) => user.rol === "alumno" && user.activo !== false).map((user) => user.id).filter((id) => typeof id === "string"))];
}

async function studentsForRestrictedScope(
  db: FirestoreRest,
  parsed: ParsedAcademicPath,
  restriction: RestrictedAncestor,
): Promise<string[]> {
  const rows = await db.runQueryPages("inscripciones", [fieldEquals("moduloId", parsed.moduloId)], [], 200, false, 100);
  const restrictedPath = normalize(restriction.subseccionPath ?? "");
  const ids = new Set<string>();
  rows.forEach((row) => {
    if (row.seccionId && row.seccionId !== parsed.seccionId) return;
    const currentPath = normalize(row.subseccionPath ?? "");
    const matchesSectionRestriction = restriction.kind === "section" && (!currentPath || currentPath === restrictedPath);
    const matchesSubsectionRestriction = restrictedPath &&
      (currentPath === restrictedPath || currentPath.startsWith(`${restrictedPath}/`));
    if (!matchesSectionRestriction && !matchesSubsectionRestriction) return;
    const id = typeof row.alumnoUid === "string" ? row.alumnoUid : row.alumnoId;
    if (typeof id === "string") ids.add(id);
  });
  const checked = await Promise.all([...ids].map(async (id) => ({ id, ok: (await resolveSingleStudent(db, id)).length === 1 })));
  return checked.filter((item) => item.ok).map((item) => item.id);
}

async function nearestRestrictedAncestor(db: FirestoreRest, parsed: ParsedAcademicPath): Promise<RestrictedAncestor | null> {
  const ancestors: RestrictedAncestor[] = [];
  const sectionPath = `modulos/${parsed.moduloId}/secciones/${parsed.seccionId}`;
  const section = await db.get(sectionPath);
  if (isRestrictedNode(section)) {
    ancestors.push({ kind: "section", id: parsed.seccionId, path: sectionPath, title: section?.titulo, subseccionPath: "" });
  }

  for (let i = 0; i < parsed.subsectionParts.length; i += 1) {
    const current = parsed.subsectionParts.slice(0, i + 1);
    const path = `modulos/${parsed.moduloId}/secciones/${parsed.seccionId}/${current.flatMap((id) => ["subsecciones", id]).join("/")}`;
    const doc = await db.get(path);
    if (isRestrictedNode(doc)) {
      ancestors.push({
        kind: "subsection",
        id: current.at(-1) ?? "",
        path,
        title: doc?.titulo,
        subseccionPath: current.join("/"),
      });
    }
  }

  return ancestors.at(-1) ?? null;
}

function isRestrictedNode(doc: any): boolean {
  return doc?.esRestringida === true ||
    doc?.restringida === true ||
    doc?.requiereInscripcion === true ||
    doc?.requiereCodigo === true ||
    typeof doc?.codigoAcceso === "string" ||
    typeof doc?.codigo === "string" ||
    doc?.tipo === "comision";
}

interface ParsedAcademicPath {
  moduloId: string;
  seccionId: string;
  subsectionParts: string[];
}

interface RestrictedAncestor {
  kind: "section" | "subsection";
  id: string;
  path: string;
  title?: string;
  subseccionPath: string;
}

function parseAcademicPath(path: string): ParsedAcademicPath | null {
  const parts = path.split("/");
  const moduloIndex = parts.indexOf("modulos");
  const seccionIndex = parts.indexOf("secciones");
  if (moduloIndex < 0 || seccionIndex < 0 || !parts[moduloIndex + 1] || !parts[seccionIndex + 1]) return null;
  const itemIndex = parts.lastIndexOf("items");
  const end = itemIndex > seccionIndex ? itemIndex : parts.length;
  const subsectionParts = parts.slice(seccionIndex + 2, end).reduce<string[]>((acc, segment, index, arr) => {
    if (arr[index - 1] === "subsecciones") acc.push(segment);
    return acc;
  }, []);
  return {
    moduloId: parts[moduloIndex + 1],
    seccionId: parts[seccionIndex + 1],
    subsectionParts,
  };
}
