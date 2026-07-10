import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, isAuthEnabled, requireAuth } from "@/lib/auth";
import {
  executeCompanyActionIntegration,
  UnsupportedActionIntegrationError,
} from "@/lib/integrations/companyActionExecutor";
import { GoogleWorkspaceConfigurationError } from "@/lib/integrations/googleWorkspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  try {
    const user = await authenticateRequest(req);
    if (isAuthEnabled()) {
      const authError = requireAuth(user, "MANAGER");
      if (authError) return authError;
    }

    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "يلزم معرّف الإجراء.", requestId },
        { status: 400 }
      );
    }

    const result = await executeCompanyActionIntegration(
      id,
      user?.name || String(body.actor || "system")
    );

    return NextResponse.json({
      ok: true,
      action: result.action,
      reused: result.reused,
      plan: result.plan,
      requestId,
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
          requestId,
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
          requestId,
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "External action execution failed";
    const conflict = /already being executed|cannot be executed|approval is required/i.test(message);
    return NextResponse.json(
      { ok: false, error: message, requestId },
      { status: conflict ? 409 : 500 }
    );
  }
}
