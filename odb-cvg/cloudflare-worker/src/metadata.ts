import { FirestoreRest } from "./firestore.js";

const MODULO_GLOBAL = "NINGUNO_EN_ESPECIAL";
const COMISION_GLOBAL = "NINGUNA_EN_ESPECIAL";

export interface ScopeForMetadata {
  moduloId?: string | null;
  seccionId?: string | null;
  subseccionPath?: string | null;
  comisionSubseccionId?: string | null;
  sourcePath?: string | null;
}

export async function courseMetadata(db: FirestoreRest, scope: ScopeForMetadata) {
  return resolveAcademicContextFromPath(db, scope.sourcePath, scope);
}

export async function resolveAcademicContextFromPath(db: FirestoreRest, sourcePath?: string | null, fallback: ScopeForMetadata = {}) {
  const parsed = parsePathScope(sourcePath);
  const metadata: Record<string, unknown> = {};
  const moduloId = cleanId(parsed.moduloId ?? fallback.moduloId);
  const seccionId = cleanId(parsed.seccionId ?? fallback.seccionId);
  const subsectionPath = normalize(parsed.subseccionPath ?? fallback.subseccionPath ?? fallback.comisionSubseccionId ?? "");

  if (moduloId) {
    metadata.moduleId = moduloId;
    const modulo = await db.get(`modulos/${moduloId}`);
    if (human(modulo?.titulo)) metadata.moduleTitle = modulo.titulo;
  }

  if (moduloId && seccionId) {
    metadata.sectionId = seccionId;
    const seccion = await db.get(`modulos/${moduloId}/secciones/${seccionId}`);
    if (human(seccion?.titulo)) metadata.sectionTitle = seccion.titulo;
  }

  if (moduloId && seccionId && subsectionPath) {
    const parts = subsectionPath.split("/");
    const ancestors: Array<{ id: string; title?: string; data?: any }> = [];
    for (let i = 0; i < parts.length; i += 1) {
      const current = parts.slice(0, i + 1);
      const path = `modulos/${moduloId}/secciones/${seccionId}/${current.flatMap((id) => ["subsecciones", id]).join("/")}`;
      const doc = await db.get(path);
      ancestors.push({ id: current.at(-1) ?? "", title: doc?.titulo, data: doc });
    }

    const leaf = ancestors.at(-1);
    const commission = ancestors.find((item) => isCommissionNode(item));
    if (commission) {
      metadata.commissionId = commission.id;
      metadata.commissionTitle = commission.title;
      metadata.isInsideCommission = true;
      if (leaf && leaf.id !== commission.id && human(leaf.title)) {
        metadata.subsectionId = leaf.id;
        metadata.subsectionTitle = leaf.title;
        metadata.displayContextLabel = "Subseccion";
        metadata.displayContextTitle = leaf.title;
      }
    } else if (leaf && human(leaf.title)) {
      metadata.isInsideCommission = false;
      metadata.subsectionId = leaf.id;
      metadata.subsectionTitle = leaf.title;
      metadata.displayContextLabel = "Seccion";
      metadata.displayContextTitle = leaf.title;
    } else {
      metadata.isInsideCommission = false;
    }
  } else {
    metadata.isInsideCommission = false;
  }

  return metadata;
}

export function compactMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => {
      if (value === null || value === undefined) return false;
      if (typeof value === "string") return human(value);
      return true;
    }),
  );
}

export function human(value: unknown): value is string {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value !== MODULO_GLOBAL &&
    value !== COMISION_GLOBAL &&
    value !== "undefined" &&
    value !== "null";
}

function cleanId(value: unknown) {
  return human(value) ? value : null;
}

function normalize(path: string) {
  if (!human(path)) return "";
  return path.split("/").map((part) => part.trim()).filter(Boolean).join("/");
}

function isCommissionNode(item: { title?: string; data?: any }) {
  const title = item.title ?? "";
  return item.data?.esComision === true ||
    item.data?.tipo === "comision" ||
    /^comisi[oó]n\b/i.test(title.trim());
}

function parsePathScope(path?: string | null) {
  if (!path) return {};
  const parts = path.split("/");
  const moduloIndex = parts.indexOf("modulos");
  const seccionIndex = parts.indexOf("secciones");
  const itemIndex = parts.lastIndexOf("items");
  if (moduloIndex < 0 || seccionIndex < 0) return {};
  const end = itemIndex > seccionIndex ? itemIndex : parts.length;
  const subseccionPath = parts.slice(seccionIndex + 2, end).reduce<string[]>((acc, segment, index, arr) => {
    if (arr[index - 1] === "subsecciones") acc.push(segment);
    return acc;
  }, []).join("/");
  return {
    moduloId: parts[moduloIndex + 1],
    seccionId: parts[seccionIndex + 1],
    subseccionPath,
  };
}
