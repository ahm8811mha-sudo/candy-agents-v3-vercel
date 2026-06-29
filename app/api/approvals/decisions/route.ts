import { NextRequest, NextResponse } from "next/server";
import { listApprovals, decideApproval, approvalStats, type ApprovalStatus } from "@/lib/approvals";

export const dynamic = "force-dynamic";

/** GET: the actionable decision queue (trades / budget / CEO items). */
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") as ApprovalStatus | null;
  return NextResponse.json({
    ok: true,
    approvals: listApprovals(status || undefined),
    stats: approvalStats(),
  });
}

/** POST: approve or reject an item. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "");
    const decision = body.decision === "REJECTED" ? "REJECTED" : body.decision === "APPROVED" ? "APPROVED" : null;

    if (!id || !decision) {
      return NextResponse.json({ ok: false, error: "يلزم معرّف العنصر والقرار (APPROVED/REJECTED)" }, { status: 400 });
    }

    const result = decideApproval(id, decision, String(body.decidedBy || "CEO"), body.note ? String(body.note) : undefined);
    if (!result) {
      return NextResponse.json({ ok: false, error: "العنصر غير موجود" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, item: result, stats: approvalStats() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Approval action failed" },
      { status: 500 }
    );
  }
}
