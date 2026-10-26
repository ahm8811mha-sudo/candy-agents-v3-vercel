import { NextRequest, NextResponse } from "next/server";
import { safeInternalDestination } from "@/lib/security/navigation";
import {
  OWNER_ACCESS_COOKIE,
  isOwnerAccessConfigured,
  verifyOwnerAccessToken,
} from "@/lib/security/personalAccess";
import { AGENT_BRIDGE_HEADER, CHAIRMAN_DIGEST_HEADER, authorizeBridgeHeaders } from "@/lib/security/agentBridgeAuth";
import { PUBLIC_PAGE_HEADER, shouldServePublicDocument } from "@/lib/security/publicPages";

const PUBLIC_EXACT_PATHS = new Set([
  "/login",
  "/privacy",
  "/terms",
  "/api/owner-access",
  "/api/health",
  // Shopify calls this without the owner cookie; the route verifies Shopify's
  // HMAC signature itself, which is the correct authentication for a webhook.
  "/api/shopify/webhook",
]);

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

function publicDocument(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set(PUBLIC_PAGE_HEADER, "1");
  return NextResponse.next({ request: { headers } });
}

function ownerNext(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.delete(PUBLIC_PAGE_HEADER);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-orvanta-access-mode", "personal-owner-device");
  return response;
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

  if (req.nextUrl.pathname.startsWith("/api/bridge")) {
    const bridge = authorizeBridgeHeaders({
      pathname: req.nextUrl.pathname,
      agentBridgeKey: req.headers.get(AGENT_BRIDGE_HEADER),
      chairmanDigestKey: req.headers.get(CHAIRMAN_DIGEST_HEADER),
    });
    const presented = Boolean(req.headers.get(AGENT_BRIDGE_HEADER) || req.headers.get(CHAIRMAN_DIGEST_HEADER));
    if (presented && !bridge.ok) {
      return NextResponse.json({ ok: false, error: bridge.error }, { status: bridge.status });
    }
    if (bridge.ok) return NextResponse.next();
  }

  const configured = isOwnerAccessConfigured();
  const token = req.cookies.get(OWNER_ACCESS_COOKIE)?.value;
  const unlocked = configured && (await verifyOwnerAccessToken(token));

  if (req.nextUrl.pathname === "/login" && unlocked) {
    const destination = req.nextUrl.searchParams.get("next");
    const safeDestination = safeInternalDestination(destination);
    return NextResponse.redirect(new URL(safeDestination, req.url));
  }

  // Privacy, terms, and the anonymous home page answer 200. The owner
  // device still receives the private office at /. Nothing else is opened.
  if (shouldServePublicDocument(req.nextUrl.pathname, Boolean(unlocked))) {
    return publicDocument(req);
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

  return ownerNext(req);
}

export const config = {
  // Self-hosted font files are static assets; they must load on the login
  // page too, so they bypass the owner gate like images do.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2)$).*)"],
};
