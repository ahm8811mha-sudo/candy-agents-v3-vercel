export const OWNER_ACCESS_COOKIE = "orvanta_owner_access";
export const OWNER_ACCESS_SUBJECT = "private-owner";
export const OWNER_ACCESS_VERSION = 1;
export const OWNER_ACCESS_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

type OwnerAccessPayload = {
  sub: typeof OWNER_ACCESS_SUBJECT;
  exp: number;
  ver: typeof OWNER_ACCESS_VERSION;
};

function signingSecret() {
  return process.env.ORVANTA_OWNER_COOKIE_SECRET
    || process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || "";
}

export function isOwnerAccessConfigured() {
  return Boolean(signingSecret());
}

/**
 * True only when the cookie is signed with its own dedicated secret. Falling
 * back to the Supabase server secret works but couples session security to the
 * database key — production readiness reports it as a failure.
 */
export function hasDedicatedCookieSecret() {
  return Boolean(process.env.ORVANTA_OWNER_COOKIE_SECRET);
}

function encodeBase64Url(input: string) {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmac(value: string) {
  const secret = signingSecret();
  if (!secret) throw new Error("ORVANTA owner cookie signing secret is not configured.");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return toHex(new Uint8Array(signature));
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export async function issueOwnerAccessToken(now = Date.now()) {
  const payload: OwnerAccessPayload = {
    sub: OWNER_ACCESS_SUBJECT,
    exp: Math.floor(now / 1000) + OWNER_ACCESS_MAX_AGE_SECONDS,
    ver: OWNER_ACCESS_VERSION,
  };
  const encoded = encodeBase64Url(JSON.stringify(payload));
  return `${encoded}.${await hmac(encoded)}`;
}

export async function verifyOwnerAccessToken(token: string | null | undefined, now = Date.now()) {
  if (!token || !isOwnerAccessConfigured()) return false;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return false;

  const expected = await hmac(encoded);
  if (!constantTimeEqual(signature, expected)) return false;

  try {
    const payload = JSON.parse(decodeBase64Url(encoded)) as Partial<OwnerAccessPayload>;
    return (
      payload.sub === OWNER_ACCESS_SUBJECT &&
      payload.ver === OWNER_ACCESS_VERSION &&
      typeof payload.exp === "number" &&
      payload.exp > Math.floor(now / 1000)
    );
  } catch {
    return false;
  }
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(digest));
}
