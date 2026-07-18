import { NextRequest, NextResponse } from "next/server";
import {
  listApprovals,
  getApprovalCritical,
  decideApprovalCritical,
  deferApprovalCritical,
  reviveDueDeferrals,
  reopenApprovalCritical,
  approvalStats,
  type ApprovalStatus,
  type ApprovalItem,
} from "@/lib/approvals";
import { applyTaskFundingDecision } from "@/lib/companyExecutionSystem";
import { executeApprovedTrade } from "@/lib/trading/executeApproval";
import { recognizeIncome, applySalesChange } from "@/lib/company/sales";
import { executeApprovedIdea } from "@/lib/company/ideaExecution";
import {
  decideCompanyExecutionApprovalCritical,
  executeGovernedApprovalDecision,
  isCompanyExecutionApproval,
} from "@/lib/company/governedApprovalExecution";
import { authenticateRequest, isAuthEnabled } from "@/lib/auth";
import { canSignOff } from "@/lib/company/access";
import { approvalTierForDecision } from "@/lib/company/governance";
import { recordAuditCritical } from "@/lib/company/audit";
import { hydrateCompany } from "@/lib/company/hydrate";
import { executeProjectInternalActions } from "@/lib/company/internalAgentExecutor";
import { assertApprovalDecisionAllowedDuringOwnerAbsence } from "@/lib/company/ownerAbsence";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
      const deferringUser = await authenticateRequest(req);
      const deferredBy = deferringUser?.name || String(body.decidedBy || "المالك");
      const item = await deferApprovalCritical(id, {
        reason: String(body.note || ""),
        remindAt: String(body.remindAt || ""),
        assignedTo: body.assignedTo ? String(body.assignedTo) : undefined,
        deferredBy,
      });
      if (!item) {
        return NextResponse.json({ ok: false, error: "العنصر غير موجود" }, { status: 404 });
      }
      await recordAuditCritical({
        id: `aud-approval-${item.id}-deferred-${Date.now()}`,
        actor: deferredBy,
        role: deferringUser?.role,
        action: "DEFER",
        entityType: (item.type || "APPROVAL").toLowerCase(),
        entityId: item.id,
        detail: `تأجيل: ${item.title} · حتى ${String(body.remindAt).slice(0, 10)}${body.assignedTo ? ` · المسؤول: ${body.assignedTo}` : ""}`,
        metadata: { approvalId: item.id, approvalType: item.type, decision: "DEFERRED" },
      });
      return NextResponse.json({ ok: true, item, execution: null, stats: approvalStats() });
    }

    // F2 — enforce the authority matrix in the API, not just the UI.
    // Read-through lookup: the item may live on another serverless instance.
    const target = (await getApprovalCritical(id)) ?? listApprovals().find((a) => a.id === id);
    const tier = approvalTierForDecision(target?.amount, target?.metadata);
    const user = await authenticateRequest(req);
    const access = canSignOff(user?.role ?? null, tier);
    if (!access.allowed) {
      return NextResponse.json({ ok: false, error: access.reason }, { status: 403 });
    }

    const decidedBy = user?.name || String(body.decidedBy || "المالك");
    const note = body.note ? String(body.note) : undefined;
    let result: ApprovalItem | null = null;
    let execution: unknown = null;

    if (target) {
      await assertApprovalDecisionAllowedDuringOwnerAbsence({
        tenantId: user?.tenantId,
        approval: target,
        actorRole: user?.role || (!isAuthEnabled() ? "OWNER" : null),
        decision,
      });
    }

    if (target && isCompanyExecutionApproval(target)) {
      // The canonical execution path commits the approval and every dependent
      // state change in one transaction; there is nothing to reopen on error.
      const atomic = await decideCompanyExecutionApprovalCritical({
        approval: target,
        decision,
        decidedBy,
        note,
        actorRole: user?.role,
        tier,
      });
      result = atomic.approval;
      execution = atomic.execution;
      if (decision === "APPROVED") {
        const projectId = String(target.metadata?.entityId || atomic.execution.entityId || "");
        try {
          const delivery = await executeProjectInternalActions(projectId, decidedBy, user?.tenantId);
          execution = { ...atomic.execution, delivery };
        } catch (executionError) {
          execution = {
            ...atomic.execution,
            delivery: {
              status: "EXECUTION_ATTENTION",
              error: executionError instanceof Error ? executionError.message : "تعذر تشغيل الوكلاء بعد الاعتماد.",
            },
          };
        }
      }
    } else {
      result = await decideApprovalCritical(id, decision, decidedBy, note);
      if (!result) {
        return NextResponse.json({ ok: false, error: "العنصر غير موجود" }, { status: 404 });
      }

      try {
        // F1 — append-only, retry-safe audit trail for every sign-off.
        await recordAuditCritical({
          id: `aud-approval-${result.id}-${decision.toLowerCase()}`,
          actor: decidedBy,
          role: user?.role,
          action: decision === "APPROVED" ? "APPROVE" : "REJECT",
          entityType: (result.type || "APPROVAL").toLowerCase(),
          entityId: result.id,
          detail: `${decision === "APPROVED" ? "اعتماد" : "رفض"}: ${result.title}`,
          tier,
          metadata: {
            approvalId: result.id,
            approvalType: result.type,
            decision,
            governanceTier: tier,
          },
        });

        // Run the allow-listed business transition. IDEA is also converted to
        // an execution project instead of only changing color in the inbox.
        if (result.type === "GENERAL" && result.metadata?.source === "governanceOS") {
          execution = await executeGovernedApprovalDecision(result.metadata || {}, decision, decidedBy);
        } else if (decision === "APPROVED") {
          if (result.type === "TRADE") execution = await executeApprovedTrade({ ...(result.metadata || {}), approvalId: result.id });
          else if (result.type === "INCOME") execution = await recognizeIncome(result.metadata || {});
          else if (result.type === "SALES_CHANGE") execution = await applySalesChange(result.metadata || {});
          else if (result.type === "IDEA") execution = await executeApprovedIdea(result.metadata || {}, decidedBy);
        }
        // Funding sign-offs on money-bearing plan steps react to BOTH
        // outcomes: WAITING_FUNDING → TODO on approval, ON_HOLD on rejection.
        if (result.type === "BUDGET" && execution === null) {
          execution = await applyTaskFundingDecision(result.metadata || {}, decision);
        }
      } catch (transitionError) {
        // Do not hide an approved-but-unexecuted item. Restore it to the queue;
        // every compatibility transition above is idempotent and safe to retry.
        await reopenApprovalCritical(result.id);
        throw transitionError;
      }
    }

    return NextResponse.json({ ok: true, item: result, execution, stats: approvalStats() });
  } catch (error) {
    const typed = error as Error & { code?: string; decision?: unknown };
    return NextResponse.json(
      { ok: false, code: typed.code, policy: typed.decision, error: typed.message || "Approval action failed" },
      { status: typed.code === "OWNER_ABSENCE_ESCALATION" ? 409 : 500 }
    );
  }
}
