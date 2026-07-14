import { NextRequest, NextResponse } from "next/server";
import {
  OWNER_ACCESS_COOKIE,
  isOwnerAccessConfigured,
  verifyOwnerAccessToken,
} from "@/lib/security/personalAccess";

const PUBLIC_EXACT_PATHS = new Set(["/login", "/api/owner-access", "/api/health"]);

function secureEqual(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function bearer(req: NextRequest) {
  const value = req.headers.get("authorization") || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

function isTrustedSystemRequest(req: NextRequest) {
  return (
    secureEqual(req.headers.get("x-api-key"), process.env.API_SECRET_KEY) ||
    secureEqual(bearer(req), process.env.CRON_SECRET)
  );
}

function isPublicPath(pathname: string) {
  return PUBLIC_EXACT_PATHS.has(pathname);
}

function unauthorized(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        ok: false,
        code: "OWNER_ACCESS_REQUIRED",
        error: "يلزم فتح النسخة الخاصة على هذا الجهاز.",
      },
      { status: 401 }
    );
  }

  const loginUrl = new URL("/login", req.url);
  const next = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (next !== "/login") loginUrl.searchParams.set("next", next);
  return NextResponse.redirect(loginUrl);
}

export async function proxy(req: NextRequest) {
  if (req.method === "OPTIONS") return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/public/v1")) {
    return NextResponse.json(
      {
        ok: false,
        code: "PERSONAL_MODE",
        error: "الواجهة التجارية العامة غير متاحة في النسخة الشخصية.",
      },
      { status: 403 }
    );
  }

  if (isTrustedSystemRequest(req)) return NextResponse.next();

  const configured = isOwnerAccessConfigured();
  const token = req.cookies.get(OWNER_ACCESS_COOKIE)?.value;
  const unlocked = configured && (await verifyOwnerAccessToken(token));

  if (req.nextUrl.pathname === "/login" && unlocked) {
    const destination = req.nextUrl.searchParams.get("next");
    const safeDestination = destination?.startsWith("/") && destination !== "/login" ? destination : "/";
    return NextResponse.redirect(new URL(safeDestination, req.url));
  }

  if (isPublicPath(req.nextUrl.pathname)) return NextResponse.next();

  if (!configured) {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          ok: false,
          code: "OWNER_ACCESS_NOT_CONFIGURED",
          error: "حماية النسخة الخاصة غير مهيأة.",
        },
        { status: 503 }
      );
    }
    return NextResponse.redirect(new URL("/login?setup=missing", req.url));
  }

  if (!unlocked) return unauthorized(req);

  const response = NextResponse.next();
  response.headers.set("x-orvanta-access-mode", "personal-owner-device");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
