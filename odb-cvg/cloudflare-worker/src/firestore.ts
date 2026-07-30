import type { Env } from "./types.js";

type FsValue = Record<string, any>;

function b64url(input: string | ArrayBuffer): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const normalized = pem.replace(/\\n/g, "\n").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

let cachedToken: { token: string; exp: number } | null = null;

export async function getAccessToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(env.FIREBASE_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claim}`));
  const assertion = `${header}.${claim}.${b64url(signature)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`oauth_failed_${res.status}`);
  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, exp: now + data.expires_in };
  return cachedToken.token;
}

export class FirestoreRest {
  constructor(private env: Env) {}

  private base() {
    return `https://firestore.googleapis.com/v1/projects/${this.env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  }

  private async request(path: string, init: RequestInit = {}) {
    const token = await getAccessToken(this.env);
    const res = await fetch(`${this.base()}${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(15000),
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`firestore_${res.status}_${await res.text()}`);
    return res.json();
  }

  async get(path: string): Promise<any | null> {
    const doc = await this.request(`/${path}`);
    return doc ? decodeDocument(doc) : null;
  }

  async set(path: string, data: Record<string, unknown>, merge = true): Promise<void> {
    const mask = merge ? Object.keys(data).map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join("&") : "";
    await this.request(`/${path}${mask ? `?${mask}` : ""}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: encodeFields(data) }),
    });
  }

  async setWithUpdateTime(path: string, data: Record<string, unknown>, updateTime: string, merge = true): Promise<void> {
    const params = [];
    if (merge) params.push(...Object.keys(data).map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`));
    params.push(`currentDocument.updateTime=${encodeURIComponent(updateTime)}`);
    await this.request(`/${path}?${params.join("&")}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: encodeFields(data) }),
    });
  }

  async create(path: string, data: Record<string, unknown>): Promise<void> {
    await this.set(path, data, false);
  }

  async runQuery(collectionId: string, whereClauses: any[] = [], orderBy: any[] = [], limit = 100, allDescendants = false, offset = 0): Promise<any[]> {
    const structuredQuery: any = {
      from: [{ collectionId, ...(allDescendants ? { allDescendants: true } : {}) }],
      limit,
    };
    if (offset > 0) structuredQuery.offset = offset;
    if (whereClauses.length === 1) structuredQuery.where = whereClauses[0];
    if (whereClauses.length > 1) structuredQuery.where = { compositeFilter: { op: "AND", filters: whereClauses } };
    if (orderBy.length > 0) structuredQuery.orderBy = orderBy;
    const result = await this.request(":runQuery", {
      method: "POST",
      body: JSON.stringify({ structuredQuery }),
    }) as any[];
    return (result ?? []).filter((row) => row.document).map((row) => decodeDocument(row.document));
  }

  async runQueryPages(
    collectionId: string,
    whereClauses: any[] = [],
    orderBy: any[] = [],
    pageSize = 100,
    allDescendants = false,
    maxPages = 20,
  ): Promise<any[]> {
    const rows: any[] = [];
    for (let page = 0; page < maxPages; page += 1) {
      const current = await this.runQuery(collectionId, whereClauses, orderBy, pageSize, allDescendants, page * pageSize);
      rows.push(...current);
      if (current.length < pageSize) break;
    }
    return rows;
  }

  async listCollection(path: string, pageSize = 100, pageToken?: string): Promise<{ documents: any[]; nextPageToken?: string }> {
    const params = new URLSearchParams({ pageSize: String(pageSize) });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await this.request(`/${path}?${params.toString()}`) as any;
    return {
      documents: (res?.documents ?? []).map((doc: any) => decodeDocument(doc)),
      nextPageToken: res?.nextPageToken,
    };
  }

  async listCollectionPages(path: string, pageSize = 100, maxPages = 20): Promise<any[]> {
    const documents: any[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < maxPages; page += 1) {
      const res = await this.listCollection(path, pageSize, pageToken);
      documents.push(...res.documents);
      pageToken = res.nextPageToken;
      if (!pageToken) break;
    }
    return documents;
  }
}

export function fieldEquals(fieldPath: string, value: unknown) {
  return {
    fieldFilter: {
      field: { fieldPath },
      op: "EQUAL",
      value: encodeValue(value),
    },
  };
}

export function fieldLessOrEqual(fieldPath: string, value: unknown) {
  return {
    fieldFilter: {
      field: { fieldPath },
      op: "LESS_THAN_OR_EQUAL",
      value: encodeValue(value),
    },
  };
}

export function fieldGreaterOrEqual(fieldPath: string, value: unknown) {
  return {
    fieldFilter: {
      field: { fieldPath },
      op: "GREATER_THAN_OR_EQUAL",
      value: encodeValue(value),
    },
  };
}

function encodeFields(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeValue(value)]));
}

function encodeValue(value: any): FsValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === "number") return { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "object") return { mapValue: { fields: encodeFields(value) } };
  return { stringValue: String(value) };
}

function decodeDocument(doc: any) {
  const name = doc.name as string;
  const path = name.split("/documents/")[1];
  const id = path.split("/").pop();
  return { id, path, updateTime: doc.updateTime, createTime: doc.createTime, ...decodeFields(doc.fields ?? {}) };
}

function decodeFields(fields: Record<string, FsValue>) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

function decodeValue(value: FsValue): any {
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields ?? {});
  return undefined;
}
