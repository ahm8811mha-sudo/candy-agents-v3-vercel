import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { getCompanyHealth } from "@/lib/company-os/companyHealth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req, "VIEWER");
  if (!auth.ok) return auth.response;
  try {
    const health = await getCompanyHealth(auth.context.tenantId);
    return NextResponse.json({ ok: true, health, requestId: auth.context.requestId });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Company health failed", requestId: auth.context.requestId },
      { status: 500 }
    );
  }
}
