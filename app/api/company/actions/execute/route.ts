import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { enforceCompanyPolicy } from "@/lib/company-os/policy";
import { withTelemetrySpan } from "@/lib/company-os/telemetry";
import { getCompanyAction } from "@/lib/company/actionQueue";
import {
  executeCompanyActionIntegration,
  UnsupportedActionIntegrationError,
} from "@/lib/integrations/companyActionExecutor";
import { GoogleWorkspaceConfigurationError } from "@/lib/integrations/googleWorkspace";
import type { ExecutiveRole } from "@/lib/company-os/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function POST(req: NextRequest) {
  const auth = await requireCompanyContext(req, "MANAGER");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "يلزم معرّف الإجراء.", requestId: auth.context.requestId },
        { status: 400 }
      );
    }

    const action = await getCompanyAction(id, auth.context.tenantId);
    if (!action) {
      return NextResponse.json(
        { ok: false, error: "الإجراء غير موجود داخل هذه الشركة.", requestId: auth.context.requestId },
        { status: 404 }
      );
    }
    const payload = asRecord(action.payload);
    const integration = asRecord(payload.integration);
    const approvedRoles: ExecutiveRole[] = action.approval_status === "APPROVED" ? ["CEO"] : [];
    const policy = await enforceCompanyPolicy(
      {
        tenantId: auth.context.tenantId,
        actor: auth.context.actor,
        operation: "EXECUTE_EXTERNAL_ACTION",
        proposerId: typeof payload.proposerId === "string" ? payload.proposerId : undefined,
        approvedRoles,
        evidenceCount: action.description || action.title ? 1 : 0,
        commitmentSAR: Number(integration.expectedAmountSAR || payload.expectedAmountSAR || 0),
        customerFacing: ["EMAIL_SEND", "SALES_OUTREACH"].includes(action.action_type),
        legalCommitment: Boolean(payload.legalCommitment),
        regulatoryAction: Boolean(payload.regulatoryAction),
        sensitiveData: Boolean(payload.sensitiveData),
        securityImpact: Boolean(payload.securityImpact),
        irreversible: Boolean(payload.irreversible),
        affectsManyCustomers: Boolean(payload.affectsManyCustomers),
        threatensContinuity: Boolean(payload.threatensContinuity),
      },
      { type: "business_action", id }
    );

    const result = await withTelemetrySpan(
      {
        tenantId: auth.context.tenantId,
        correlationId: auth.context.correlationId,
        operation: "integration.company-action.execute",
        category: "CONNECTOR",
        actorId: auth.context.actor.id,
        entityType: "business_action",
        entityId: id,
        attributes: { actionType: action.action_type, riskLevel: policy.riskLevel },
      },
      () => executeCompanyActionIntegration(id, auth.context.actor.name, auth.context.tenantId)
    );

    return NextResponse.json({
      ok: true,
      action: result.action,
      reused: result.reused,
      plan: result.plan,
      policy,
      requestId: auth.context.requestId,
    });
  } catch (error) {
    if (error instanceof GoogleWorkspaceConfigurationError) {
      return NextResponse.json(
        {
          ok: false,
          code: "INTEGRATION_NOT_CONFIGURED",
          capability: error.capability,
          missingEnvironmentVariables: error.missingEnvironmentVariables,
          error: "التكامل البرمجي جاهز، لكن بيانات Google Workspace غير مكتملة في بيئة التشغيل.",
          requestId: auth.context.requestId,
        },
        { status: 409 }
      );
    }

    if (error instanceof UnsupportedActionIntegrationError) {
      return NextResponse.json(
        {
          ok: false,
          code: "UNSUPPORTED_ACTION_TYPE",
          actionType: error.actionType,
          error: "لا يوجد منفذ تكامل مسجل لهذا النوع من الإجراءات.",
          requestId: auth.context.requestId,
        },
        { status: 400 }
      );
    }

    const typed = error as Error & { code?: string; decision?: unknown };
    const conflict = /already being executed|cannot be executed|approval is required/i.test(typed.message);
    return NextResponse.json(
      { ok: false, code: typed.code, policy: typed.decision, error: typed.message || "External action execution failed", requestId: auth.context.requestId },
      { status: typed.code === "POLICY_DENIED" ? 403 : conflict ? 409 : 500 }
    );
  }
}
