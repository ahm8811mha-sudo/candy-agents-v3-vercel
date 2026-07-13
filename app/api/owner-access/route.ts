import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  OWNER_ACCESS_COOKIE,
  OWNER_ACCESS_MAX_AGE_SECONDS,
  issueOwnerAccessToken,
  sha256Hex,
} from "@/lib/security/personalAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ATTEMPT_LIMIT = 8;
const WINDOW_SECONDS = 30 * 60;
const localAttempts = new Map<string, { count: number; resetAt: number }>();

function secureCookie() {
  return process.env.NODE_ENV === "production";
}

function configuredOwnerCode() {
  return process.env.ORVANTA_OWNER_ACCESS_KEY || process.env.API_SECRET_KEY || "";
}

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

async function checkRateLimit(req: NextRequest) {
  const identity = await sha256Hex(`owner-access:${clientIp(req)}`);
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data, error } = await supabase.rpc("orvanta_check_rate_limit", {
      p_key: identity,
      p_window_seconds: WINDOW_SECONDS,
      p_limit: ATTEMPT_LIMIT,
    });
    if (!error && data && typeof data === "object") {
      const payload = data as { allowed?: unknown; reset_at?: unknown };
      if (typeof payload.allowed === "boolean") {
        return {
          allowed: payload.allowed,
          resetAt: new Date(String(payload.reset_at || Date.now() + WINDOW_SECONDS * 1000)).getTime(),
        };
      }
    }
  }

  const now = Date.now();
  const existing = localAttempts.get(identity);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + WINDOW_SECONDS * 1000;
    localAttempts.set(identity, { count: 1, resetAt });
    return { allowed: true, resetAt };
  }
  existing.count += 1;
  return { allowed: existing.count <= ATTEMPT_LIMIT, resetAt: existing.resetAt };
}

function clearAccess(response: NextResponse) {
  response.cookies.set(OWNER_ACCESS_COOKIE, "", {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function POST(req: NextRequest) {
  const expectedCode = configuredOwnerCode();
  if (!expectedCode) {
    return NextResponse.json(
      { ok: false, error: "حماية النسخة الخاصة غير مهيأة. أضف ORVANTA_OWNER_ACCESS_KEY في Vercel." },
      { status: 503 }
    );
  }

  const rateLimit = await checkRateLimit(req);
  if (!rateLimit.allowed) {
    const retryAfter = Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { ok: false, error: "تم إيقاف المحاولات مؤقتًا. حاول لاحقًا." },
      { status: 429, headers: { "retry-after": String(retryAfter) } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const code = String(body.code || "").trim();
  if (code.length < 12 || code.length > 128) {
    return NextResponse.json({ ok: false, error: "رمز الوصول غير صحيح." }, { status: 401 });
  }

  const [suppliedHash, expectedHash] = await Promise.all([
    sha256Hex(code),
    sha256Hex(expectedCode),
  ]);
  if (suppliedHash !== expectedHash) {
    return NextResponse.json({ ok: false, error: "رمز الوصول غير صحيح." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, authenticated: true, personalMode: true });
  response.cookies.set(OWNER_ACCESS_COOKIE, await issueOwnerAccessToken(), {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: OWNER_ACCESS_MAX_AGE_SECONDS,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearAccess(response);
  return response;
}
