import { NextResponse } from "next/server";
import { personalOwnerUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function ownerResponse() {
  const user = personalOwnerUser();
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

export async function GET() {
  return ownerResponse();
}

export async function POST() {
  return ownerResponse();
}

export async function DELETE() {
  return NextResponse.json({ ok: true, personalMode: true });
}
