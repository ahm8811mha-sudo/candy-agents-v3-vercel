import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { enforceCompanyPolicy } from "@/lib/company-os/policy";
import { getReconciliationForAction } from "@/lib/company-os/reconciliation";
import { listCompanyActions, updateCompanyActionStatus, type CompanyActionStatus } from "@/lib/company/actionQueue";
import { hydrateCompany } from "@/lib/company/hydrate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req, "VIEWER");
  if (!auth.ok) return auth.response;
  try {
    await hydrateCompany();
    const limit = Number(req.nextUrl.searchParams.get("limit") || 50);
    const actions = await listCompanyActions(
      Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 50,
      auth.context.tenantId
    );
    return NextResponse.json({ ok: true, actions, requestId: auth.context.requestId });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to list company actions", requestId: auth.context.requestId },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireCompanyContext(req, "MANAGER");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "");
    const status = String(body.status || "") as CompanyActionStatus;
    const allowed: CompanyActionStatus[] = [
      "QUEUED",
      "WAITING_APPROVAL",
      "WAITING_INTEGRATION",
      "RUNNING",
      "WAITING_RECONCILIATION",
      "DONE",
      "FAILED",
      "CANCELLED",
    ];

    if (!id || !allowed.includes(status)) {
      return NextResponse.json({ ok: false, error: "يلزم id وحالة صحيحة للإجراء.", requestId: auth.context.requestId }, { status: 400 });
    }

    if (status === "DONE" && process.env.ORVANTA_RECONCILIATION_REQUIRED === "true") {
      const reconciliation = await getReconciliationForAction(auth.context.tenantId, id);
      if (!reconciliation || reconciliation.status !== "RECONCILED") {
        return NextResponse.json(
          {
            ok: false,
            code: "RECONCILIATION_REQUIRED",
            error: "لا يمكن اعتبار الإجراء مكتملاً قبل وجود إيصال خارجي وتسوية ناجحة.",
            requestId: auth.context.requestId,
          },
          { status: 409 }
        );
      }
    }

    const policy = await enforceCompanyPolicy(
      {
        tenantId: auth.context.tenantId,
        actor: auth.context.actor,
        operation: status === "DONE" ? "RECONCILE_ACTION" : "ADMINISTER_POLICY",
        evidenceCount: body.result ? 1 : 0,
        commitmentSAR: Number(body.amountSAR || 0),
        approvedRoles: auth.context.actor.role === "CFO" ? ["CFO"] : auth.context.actor.role === "CEO" ? ["CEO"] : [],
      },
      { type: "business_action", id }
    );

    const action = await updateCompanyActionStatus({
      id,
      tenantId: auth.context.tenantId,
      status,
      actor: auth.context.actor.name,
      result: body.result && typeof body.result === "object" ? body.result : undefined,
      error: body.error ? String(body.error) : undefined,
      note: body.note ? String(body.note) : undefined,
    });

    return NextResponse.json({ ok: true, action, policy, requestId: auth.context.requestId });
  } catch (error) {
    const typed = error as Error & { code?: string; decision?: unknown };
    return NextResponse.json(
      { ok: false, code: typed.code, policy: typed.decision, error: typed.message || "Failed to update company action", requestId: auth.context.requestId },
      { status: typed.code === "POLICY_DENIED" ? 403 : 500 }
    );
  }
}
