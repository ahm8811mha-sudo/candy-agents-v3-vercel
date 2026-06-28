import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/api/health", "/api/auth"];
const PUBLIC_METHODS = ["OPTIONS"];

export function middleware(req: NextRequest) {
  if (PUBLIC_METHODS.includes(req.method)) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.some((p) => req.nextUrl.pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (process.env.AUTH_ENABLED !== "true") {
    return NextResponse.next();
  }

  const hasAuth =
    req.headers.has("authorization") ||
    req.headers.has("x-api-key");

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
