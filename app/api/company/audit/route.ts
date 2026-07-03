import { NextRequest, NextResponse } from "next/server";
import { listAudit, auditStats, hydrateAudit } from "@/lib/company/audit";

export const dynamic = "force-dynamic";

/** GET: the append-only audit trail (optionally filtered). */
export async function GET(req: NextRequest) {
  await hydrateAudit();
  const entityType = req.nextUrl.searchParams.get("entityType") || undefined;
  const action = req.nextUrl.searchParams.get("action") || undefined;
  return NextResponse.json({ ok: true, entries: listAudit({ entityType, action }), stats: auditStats() });
}
