import type { Env, FirebaseToken } from "./types.js";

const JWK_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let jwkCache: { keys: Record<string, JsonWebKey>; exp: number } | null = null;

function b64urlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function getJwks(): Promise<Record<string, JsonWebKey>> {
  const now = Date.now();
  if (jwkCache && jwkCache.exp > now) return jwkCache.keys;
  const res = await fetch(JWK_URL);
  if (!res.ok) throw new Error("firebase_certs_unavailable");
  const maxAge = /max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1];
  const data = await res.json() as { keys: Array<JsonWebKey & { kid?: string }> };
  jwkCache = {
    keys: Object.fromEntries(data.keys.filter((key) => key.kid).map((key) => [key.kid, key])),
    exp: now + Number(maxAge ?? 3600) * 1000,
  };
  return jwkCache.keys;
}

export async function verifyFirebaseIdToken(token: string, env: Env): Promise<FirebaseToken> {
  const [headerRaw, payloadRaw, signatureRaw] = token.split(".");
  if (!headerRaw || !payloadRaw || !signatureRaw) throw new Error("invalid_token_format");
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(headerRaw)));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadRaw)));
  if (header.alg !== "RS256" || !header.kid) throw new Error("invalid_token_header");

  const jwk = (await getJwks())[header.kid];
  if (!jwk) throw new Error("unknown_firebase_cert");
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    bytesToArrayBuffer(b64urlToBytes(signatureRaw)),
    new TextEncoder().encode(`${headerRaw}.${payloadRaw}`),
  );
  if (!ok) throw new Error("invalid_token_signature");

  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== env.FIREBASE_PROJECT_ID) throw new Error("invalid_token_audience");
  if (payload.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`) throw new Error("invalid_token_issuer");
  if (!payload.sub || payload.user_id !== payload.sub) throw new Error("invalid_token_subject");
  if (payload.exp <= now) throw new Error("token_expired");
  return { uid: payload.sub, email: payload.email };
}
