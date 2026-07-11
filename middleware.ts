import { NextRequest, NextResponse } from "next/server";

const PERSONAL_OWNER_RUNTIME = process.env.ORVANTA_PERSONAL_MODE !== "false";
const PRIVATE_OWNER_ONLY = PERSONAL_OWNER_RUNTIME || process.env.ORVANTA_PRIVATE_OWNER_ONLY !== "false";
const PRIVATE_RUNTIME_BYPASS = PERSONAL_OWNER_RUNTIME;
const OWNER_TENANT_ID = (process.env.ORVANTA_TENANT_ID || "golden-star").trim();
const PUBLIC_PATHS = [
  "/api/health",
  "/api/auth",
  "/api/webhooks",
];
const PUBLIC_METHODS = ["OPTIONS"];
const ACCESS_COOKIE = "orvanta_access_token";

const memoryRateLimits = new Map<string, { count: number; resetAt: number }>();
const tokenValidationCache = new Map<string, number>();

function readBearer(req: NextRequest) {
  const raw = req.headers.get("authorization") || "";
  return raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : "";
}

function readAccessValue(req: NextRequest) {
  return readBearer(req) || req.headers.get("x-orvanta-access") || "";
}

function canRunCompanyCommand(req: NextRequest) {
  const value = readAccessValue(req).trim();
  const ownerValue = process.env.ORVANTA_OWNER_SECRET;
  const adminValue = process.env.ORVANTA_ADMIN_SECRET;
  return Boolean(value && ((ownerValue && value === ownerValue) || (adminValue && value === adminValue)));
}

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function clientIp(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function inMemoryRateLimit(key: string, limit: number, windowSeconds: number) {
  const now = Date.now();
  const existing = memoryRateLimits.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowSeconds * 1000;
    memoryRateLimits.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: Math.max(limit - 1, 0), resetAt };
  }

  existing.count += 1;
  return {
    allowed: existing.count <= limit,
    remaining: Math.max(limit - existing.count, 0),
    resetAt: existing.resetAt,
  };
}

function rateLimitPolicy(pathname: string) {
  if (pathname.startsWith("/api/auth")) return { limit: 10, windowSeconds: 60 };
  if (pathname.startsWith("/api/company-execution")) return { limit: 20, windowSeconds: 60 };
  if (pathname.startsWith("/api/public/v1")) return { limit: 20, windowSeconds: 60 };
  return { limit: 120, windowSeconds: 60 };
}

async function checkDistributedRateLimit(req: NextRequest) {
  const { limit, windowSeconds } = rateLimitPolicy(req.nextUrl.pathname);
  const identity = `${clientIp(req)}:${req.method}:${req.nextUrl.pathname}`;
  const key = await sha256(identity);
  const fallback = () => inMemoryRateLimit(key, limit, windowSeconds);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return fallback();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${url}/rest/v1/rpc/orvanta_check_rate_limit`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        p_key: key,
        p_window_seconds: windowSeconds,
        p_limit: limit,
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) return fallback();
    const payload = await response.json();
    const result = Array.isArray(payload) ? payload[0] : payload;
    if (!result || typeof result.allowed !== "boolean") return fallback();

    return {
      allowed: result.allowed,
      remaining: Number(result.remaining || 0),
      resetAt: new Date(result.reset_at).getTime(),
    };
  } catch {
    return fallback();
  } finally {
    clearTimeout(timeout);
  }
}

function secureStringEqual(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function isAllowedPrivateOwner(payload: unknown) {
  if (!PRIVATE_OWNER_ONLY) return true;
  if (!payload || typeof payload !== "object") return false;

  const user = payload as { app_metadata?: Record<string, unknown> };
  const metadata = user.app_metadata || {};
  const role = String(metadata.role || "").toUpperCase();
  const tenantId = String(metadata.tenant_id || "").trim();
  const platformOwner = metadata.platform_owner === true || String(metadata.platform_owner).toLowerCase() === "true";
  return role === "OWNER" && tenantId === OWNER_TENANT_ID && platformOwner;
}

async function validateSupabaseAccessToken(token: string) {
  if (!token) return false;

  const tokenKey = await sha256(token);
  const cachedUntil = tokenValidationCache.get(tokenKey) || 0;
  if (cachedUntil > Date.now()) return true;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const apiKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !apiKey) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: apiKey,
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return false;

    const payload = await response.json().catch(() => null);
    if (!isAllowedPrivateOwner(payload)) return false;

    tokenValidationCache.set(tokenKey, Date.now() + 15_000);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function hasValidAuthentication(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (secureStringEqual(apiKey, process.env.API_SECRET_KEY)) return true;

  const bearer = readBearer(req);
  if (bearer) {
    if (secureStringEqual(bearer, process.env.CRON_SECRET)) return true;
    if (await validateSupabaseAccessToken(bearer)) return true;
  }

  const cookieToken = req.cookies.get(ACCESS_COOKIE)?.value || "";
  if (cookieToken && (await validateSupabaseAccessToken(cookieToken))) return true;

  if (
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_BASIC_AUTH === "true" &&
    (req.headers.get("authorization") || "").startsWith("Basic ")
  ) {
    return true;
  }

  return false;
}

export async function middleware(req: NextRequest) {
  if (PUBLIC_METHODS.includes(req.method)) return NextResponse.next();

  if (!req.nextUrl.pathname.startsWith("/api/health")) {
    const rateLimit = await checkDistributedRateLimit(req);
    if (!rateLimit.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { ok: false, code: "RATE_LIMITED", error: "تم تجاوز الحد المسموح للطلبات. حاول لاحقًا." },
        {
          status: 429,
          headers: {
            "retry-after": String(retryAfter),
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": String(Math.ceil(rateLimit.resetAt / 1000)),
          },
        }
      );
    }
  }

  if (PRIVATE_OWNER_ONLY && req.nextUrl.pathname.startsWith("/api/public/v1")) {
    return NextResponse.json(
      { ok: false, code: "PRIVATE_OWNER_ONLY", error: "الواجهة العامة متوقفة في النسخة الخاصة." },
      { status: 403 }
    );
  }

  if (
    req.nextUrl.pathname === "/api/company-execution" &&
    !PRIVATE_RUNTIME_BYPASS &&
    !canRunCompanyCommand(req)
  ) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  if (isPublicPath(req.nextUrl.pathname)) return NextResponse.next();

  // Personal mode is the permanent behavior of the current installation:
  // one owner, one tenant, no login screen and no commercial onboarding.
  if (PRIVATE_RUNTIME_BYPASS) {
    const response = NextResponse.next();
    response.headers.set("x-orvanta-access-mode", "personal-single-owner");
    return response;
  }

  if (process.env.AUTH_ENABLED !== "true") {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        {
          ok: false,
          code: "AUTH_NOT_CONFIGURED",
          error: "تم إيقاف الوصول لأن المصادقة الإنتاجية غير مفعلة.",
        },
        { status: 503 }
      );
    }
    return NextResponse.next();
  }

  if (!(await hasValidAuthentication(req))) {
    return NextResponse.json(
      {
        ok: false,
        code: PRIVATE_OWNER_ONLY ? "OWNER_AUTH_REQUIRED" : "AUTH_INVALID",
        error: PRIVATE_OWNER_ONLY
          ? "هذه النسخة خاصة بالمالك. يرجى تسجيل الدخول بحساب المالك."
          : "جلسة المصادقة مفقودة أو غير صالحة. يرجى تسجيل الدخول مجددًا.",
      },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
