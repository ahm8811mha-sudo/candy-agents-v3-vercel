import { NextRequest, NextResponse } from "next/server";
import { listApprovals, decideApproval, approvalStats, type ApprovalStatus } from "@/lib/approvals";
import { executeApprovedTrade } from "@/lib/trading/executeApproval";
import { recognizeIncome, applySalesChange } from "@/lib/company/sales";

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

    // On approval, run the item's governed side-effect: place the trade, book
    // the sales income, or apply the store change.
    let execution = null;
    if (decision === "APPROVED") {
      if (result.type === "TRADE") execution = await executeApprovedTrade(result.metadata || {});
      else if (result.type === "INCOME") execution = recognizeIncome(result.metadata || {});
      else if (result.type === "SALES_CHANGE") execution = await applySalesChange(result.metadata || {});
    }

    return NextResponse.json({ ok: true, item: result, execution, stats: approvalStats() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Approval action failed" },
      { status: 500 }
    );
  }
}
