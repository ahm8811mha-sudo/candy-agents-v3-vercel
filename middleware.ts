import { NextRequest, NextResponse } from "next/server";

/**
 * This installation is a private, single-user Orvanta workspace.
 * Commercial authentication, company registration, employee accounts and
 * public APIs are intentionally disabled. Internal application APIs remain
 * available without a login session.
 */
export function middleware(req: NextRequest) {
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

  const response = NextResponse.next();
  response.headers.set("x-orvanta-access-mode", "personal-single-owner");
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
