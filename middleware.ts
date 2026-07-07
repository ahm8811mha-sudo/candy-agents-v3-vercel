import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/api/health", "/api/auth"];
const PUBLIC_METHODS = ["OPTIONS"];

function readAccessValue(req: NextRequest) {
  const raw = req.headers.get("authorization") || "";
  const bearer = raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : "";
  return bearer || req.headers.get("x-orvanta-access") || "";
}

function canRunCompanyCommand(req: NextRequest) {
  const value = readAccessValue(req).trim();
  const ownerValue = process.env.ORVANTA_OWNER_SECRET;
  const adminValue = process.env.ORVANTA_ADMIN_SECRET;
  return Boolean(value && ((ownerValue && value === ownerValue) || (adminValue && value === adminValue)));
}

export function middleware(req: NextRequest) {
  if (PUBLIC_METHODS.includes(req.method)) {
    return NextResponse.next();
  }

  if (req.nextUrl.pathname === "/api/company-execution" && !canRunCompanyCommand(req)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  if (PUBLIC_PATHS.some((p) => req.nextUrl.pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (process.env.AUTH_ENABLED !== "true") {
    return NextResponse.next();
  }

  const hasAuth = req.headers.has("authorization") || req.headers.has("x-api-key");

  if (!hasAuth && req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: "مطلوب مصادقة للوصول إلى API." },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
