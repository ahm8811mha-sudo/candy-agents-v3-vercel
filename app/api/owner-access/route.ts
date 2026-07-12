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

const MAX_FAILED_ATTEMPTS = 8;
const LOCK_MINUTES = 30;

function secureCookie() {
  return process.env.NODE_ENV === "production";
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
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "حماية النسخة الخاصة غير مهيأة." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const code = String(body.code || "").trim().toUpperCase();
  if (code.length < 12 || code.length > 80) {
    return NextResponse.json({ ok: false, error: "رمز الوصول غير صحيح." }, { status: 401 });
  }

  const { data: credential, error } = await supabase
    .from("owner_access_credentials")
    .select("id, access_code_hash, enabled, failed_attempts, locked_until")
    .eq("id", "primary-owner")
    .maybeSingle();

  if (error || !credential || credential.enabled !== true) {
    return NextResponse.json(
      { ok: false, error: "حماية النسخة الخاصة غير مهيأة." },
      { status: 503 }
    );
  }

  const lockedUntil = credential.locked_until ? new Date(credential.locked_until) : null;
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    return NextResponse.json(
      { ok: false, error: "تم إيقاف المحاولات مؤقتًا. حاول لاحقًا." },
      { status: 429 }
    );
  }

  const suppliedHash = await sha256Hex(code);
  const matches = suppliedHash === String(credential.access_code_hash || "");

  if (!matches) {
    const failedAttempts = Number(credential.failed_attempts || 0) + 1;
    const locked = failedAttempts >= MAX_FAILED_ATTEMPTS;
    await supabase
      .from("owner_access_credentials")
      .update({
        failed_attempts: locked ? 0 : failedAttempts,
        last_failed_at: new Date().toISOString(),
        locked_until: locked
          ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
          : null,
      })
      .eq("id", "primary-owner");

    return NextResponse.json({ ok: false, error: "رمز الوصول غير صحيح." }, { status: 401 });
  }

  await supabase
    .from("owner_access_credentials")
    .update({
      failed_attempts: 0,
      last_failed_at: null,
      locked_until: null,
      last_success_at: new Date().toISOString(),
    })
    .eq("id", "primary-owner");

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
