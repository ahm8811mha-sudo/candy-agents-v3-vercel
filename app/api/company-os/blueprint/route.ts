import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { ORVANTA_WORLD_CLASS_BLUEPRINT } from "@/lib/company-os/blueprint";
import { validateLifecycle } from "@/lib/company-os/lifecycle";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req, "VIEWER");
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    ok: true,
    tenantId: auth.context.tenantId,
    generatedAt: new Date().toISOString(),
    lifecycleValidation: validateLifecycle(),
    blueprint: ORVANTA_WORLD_CLASS_BLUEPRINT,
    requestId: auth.context.requestId,
  });
}
