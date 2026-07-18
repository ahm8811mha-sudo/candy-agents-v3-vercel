import { NextRequest, NextResponse } from "next/server";
import {
  listApprovals,
  getApprovalCritical,
  decideApprovalCritical,
  deferApprovalCritical,
  reviveDueDeferrals,
  approvalStats,
  type ApprovalStatus,
} from "@/lib/approvals";
import { executeApprovedTrade } from "@/lib/trading/executeApproval";
import { recognizeIncome, applySalesChange } from "@/lib/company/sales";
import { executeApprovedIdea } from "@/lib/company/ideaExecution";
import { applyProjectApprovalDecision, applyTaskFundingDecision } from "@/lib/companyExecutionSystem";
import { authenticateRequest } from "@/lib/auth";
import { canSignOff } from "@/lib/company/access";
import { requiredTier } from "@/lib/company/governance";
import { recordAudit } from "@/lib/company/audit";
import { hydrateCompany } from "@/lib/company/hydrate";

export const dynamic = "force-dynamic";

/** GET: the actionable decision queue (trades / budget / CEO items). */
export async function GET(req: NextRequest) {
  await hydrateCompany();
  // Deferred items whose reminder date passed come back on every queue read.
  await reviveDueDeferrals();
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
    await hydrateCompany();
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "");
    const decision =
      body.decision === "REJECTED"
        ? "REJECTED"
        : body.decision === "APPROVED"
          ? "APPROVED"
          : body.decision === "DEFERRED"
            ? "DEFERRED"
            : null;

    if (!id || !decision) {
      return NextResponse.json({ ok: false, error: "يلزم معرّف العنصر والقرار (APPROVED/REJECTED/DEFERRED)" }, { status: 400 });
    }

    // Deferral: leaves the queue with a reason + reminder date + an assignee
    // who prepares the item, then returns automatically when the date passes.
    if (decision === "DEFERRED") {
      const user = await authenticateRequest(req);
      const deferredBy = user?.name || String(body.decidedBy || "المالك");
      const item = await deferApprovalCritical(id, {
        reason: String(body.note || ""),
        remindAt: String(body.remindAt || ""),
        assignedTo: body.assignedTo ? String(body.assignedTo) : undefined,
        deferredBy,
      });
      if (!item) {
        return NextResponse.json({ ok: false, error: "العنصر غير موجود" }, { status: 404 });
      }
      recordAudit({
        actor: deferredBy,
        role: user?.role,
        action: "DEFER",
        entityType: (item.type || "APPROVAL").toLowerCase(),
        entityId: item.id,
        detail: `تأجيل: ${item.title} · حتى ${String(body.remindAt).slice(0, 10)}${body.assignedTo ? ` · المسؤول: ${body.assignedTo}` : ""}`,
      });
      return NextResponse.json({ ok: true, item, execution: null, stats: approvalStats() });
    }

    // F2 — enforce the authority matrix in the API, not just the UI.
    // Read-through lookup: the item may live on another serverless instance.
    const target = await getApprovalCritical(id);
    const tier = target?.amount ? requiredTier(target.amount).tier : "T1";
    const user = await authenticateRequest(req);
    const access = canSignOff(user?.role ?? null, tier);
    if (!access.allowed) {
      return NextResponse.json({ ok: false, error: access.reason }, { status: 403 });
    }

    const decidedBy = user?.name || String(body.decidedBy || "المالك");
    const result = await decideApprovalCritical(id, decision, decidedBy, body.note ? String(body.note) : undefined);
    if (!result) {
      return NextResponse.json({ ok: false, error: "العنصر غير موجود" }, { status: 404 });
    }

    // F1 — append-only audit trail for every sign-off.
    recordAudit({
      actor: decidedBy,
      role: user?.role,
      action: decision === "APPROVED" ? "APPROVE" : "REJECT",
      entityType: (result.type || "APPROVAL").toLowerCase(),
      entityId: result.id,
      detail: `${decision === "APPROVED" ? "اعتماد" : "رفض"}: ${result.title}`,
      tier,
    });

    // On approval, run the item's governed side-effect. The important business
    // fix is IDEA: an approved idea must become an execution project, not only
    // a green status in the inbox.
    let execution = null;
    if (decision === "APPROVED") {
      if (result.type === "TRADE") execution = await executeApprovedTrade(result.metadata || {});
      else if (result.type === "INCOME") execution = await recognizeIncome(result.metadata || {});
      else if (result.type === "SALES_CHANGE") execution = await applySalesChange(result.metadata || {});
      else if (result.type === "IDEA") execution = await executeApprovedIdea(result.metadata || {}, decidedBy);
    }
    // Gated projects react to BOTH outcomes: approval activates the project
    // and unblocks its queued actions; rejection puts it on hold. Returns
    // null for GENERAL items that are not project approvals.
    if (result.type === "GENERAL" && execution === null) {
      execution = await applyProjectApprovalDecision(result.metadata || {}, decision);
    }
    // Funding sign-offs on money-bearing plan steps (WAITING_FUNDING → TODO).
    if (result.type === "BUDGET" && execution === null) {
      execution = await applyTaskFundingDecision(result.metadata || {}, decision);
    }

    return NextResponse.json({ ok: true, item: result, execution, stats: approvalStats() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Approval action failed" },
      { status: 500 }
    );
  }
}
