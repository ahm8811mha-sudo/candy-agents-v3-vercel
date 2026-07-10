import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { enforceCompanyPolicy } from "@/lib/company-os/policy";
import { getCompanyAction, updateCompanyActionStatus } from "@/lib/company/actionQueue";
import { reconcileCompanyAction } from "@/lib/company-os/reconciliation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireCompanyContext(req, "CFO");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const actionId = String(body.actionId || "").trim();
    if (!actionId) {
      return NextResponse.json({ ok: false, error: "actionId is required", requestId: auth.context.requestId }, { status: 400 });
    }
    const action = await getCompanyAction(actionId, auth.context.tenantId);
    if (!action) {
      return NextResponse.json({ ok: false, error: "Action not found in this tenant", requestId: auth.context.requestId }, { status: 404 });
    }

    const policy = await enforceCompanyPolicy(
      {
        tenantId: auth.context.tenantId,
        actor: auth.context.actor,
        operation: "RECONCILE_ACTION",
        evidenceCount: body.actualResult ? 1 : 0,
        commitmentSAR: Number(body.actualResult?.amountSAR || 0),
        approvedRoles: ["CFO"],
      },
      { type: "business_action", id: actionId }
    );

    const reconciliation = await reconcileCompanyAction({
      tenantId: auth.context.tenantId,
      action,
      output: body.actualResult || {},
      actor: auth.context.actor.name,
    });

    const updated = await updateCompanyActionStatus({
      id: actionId,
      tenantId: auth.context.tenantId,
      status: reconciliation.reconciled ? "DONE" : "WAITING_RECONCILIATION",
      actor: auth.context.actor.name,
      result: {
        ...(action.result || {}),
        reconciliation,
      },
      error: reconciliation.reconciled ? undefined : `Reconciliation exception: ${reconciliation.exceptions.join(", ")}`,
      note: reconciliation.reconciled ? "Manual reconciliation completed" : "Manual reconciliation still has exceptions",
    });

    return NextResponse.json({ ok: true, action: updated, reconciliation, policy, requestId: auth.context.requestId });
  } catch (error) {
    const typed = error as Error & { code?: string; decision?: unknown };
    return NextResponse.json(
      { ok: false, code: typed.code, policy: typed.decision, error: typed.message || "Reconciliation failed", requestId: auth.context.requestId },
      { status: typed.code === "POLICY_DENIED" ? 403 : 400 }
    );
  }
}
