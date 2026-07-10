import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { enforceCompanyPolicy } from "@/lib/company-os/policy";
import {
  listWorkflowInstances,
  startIdeaToInvestmentWorkflow,
  type IdeaToInvestmentInput,
} from "@/lib/company-os/workflowRuntime";
import { withTelemetrySpan } from "@/lib/company-os/telemetry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req, "VIEWER");
  if (!auth.ok) return auth.response;
  const limit = Number(new URL(req.url).searchParams.get("limit") || 50);
  try {
    const workflows = await listWorkflowInstances(auth.context.tenantId, limit);
    return NextResponse.json({ ok: true, workflows, requestId: auth.context.requestId });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load workflows", requestId: auth.context.requestId },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireCompanyContext(req, "MANAGER");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json();
    const input = body.input as IdeaToInvestmentInput;
    const policy = await enforceCompanyPolicy({
      tenantId: auth.context.tenantId,
      actor: auth.context.actor,
      operation: "CREATE_DECISION",
      proposerId: auth.context.actor.id,
      evidenceCount: Array.isArray(input?.facts) ? input.facts.length : 0,
      commitmentSAR: input?.commitmentSAR ?? input?.financialImpactSAR,
      customerFacing: input?.customerFacing,
      legalCommitment: input?.legalCommitment,
      regulatoryAction: input?.regulatoryAction,
      sensitiveData: input?.sensitiveData,
      securityImpact: input?.securityImpact,
      irreversible: input?.irreversible,
      affectsManyCustomers: input?.affectsManyCustomers,
      threatensContinuity: input?.threatensContinuity,
    });

    const result = await withTelemetrySpan(
      {
        tenantId: auth.context.tenantId,
        correlationId: auth.context.correlationId,
        operation: "workflow.idea-to-investment.start",
        category: "WORKFLOW",
        actorId: auth.context.actor.id,
        attributes: { policyRisk: policy.riskLevel },
      },
      () => startIdeaToInvestmentWorkflow({
        tenantId: auth.context.tenantId,
        actorId: auth.context.actor.id,
        correlationId: String(body.correlationId || auth.context.correlationId),
        input,
      })
    );

    return NextResponse.json(
      { ok: true, ...result, policy, requestId: auth.context.requestId },
      { status: result.reused ? 200 : 202 }
    );
  } catch (error) {
    const typed = error as Error & { code?: string; decision?: unknown };
    return NextResponse.json(
      {
        ok: false,
        code: typed.code || "WORKFLOW_START_FAILED",
        error: typed.message || "Workflow start failed",
        policy: typed.decision,
        requestId: auth.context.requestId,
      },
      { status: typed.code === "POLICY_DENIED" ? 403 : 400 }
    );
  }
}
