import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, isAuthEnabled, requireAuth } from "@/lib/auth";
import { ORVANTA_WORLD_CLASS_BLUEPRINT } from "@/lib/company-os/blueprint";
import { validateLifecycle } from "@/lib/company-os/lifecycle";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req);
  if (isAuthEnabled()) {
    const authError = requireAuth(user, "VIEWER");
    if (authError) return authError;
  }

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    lifecycleValidation: validateLifecycle(),
    blueprint: ORVANTA_WORLD_CLASS_BLUEPRINT,
  });
}
