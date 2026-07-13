import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { OWNER_ACCESS_COOKIE } from "@/lib/security/personalAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req);
  if (!user) {
    return NextResponse.json(
      { ok: false, authenticated: false, ownerOnly: true, personalMode: true },
      { status: 401 }
    );
  }

  return NextResponse.json({
    ok: true,
    authenticated: true,
    ownerOnly: true,
    personalMode: true,
    registrationAvailable: false,
    setupState: "READY",
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      departmentId: user.departmentId,
    },
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true, personalMode: true });
  response.cookies.set(OWNER_ACCESS_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
