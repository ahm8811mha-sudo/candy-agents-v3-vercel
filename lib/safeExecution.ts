import { runCompanyExecution } from "./companyExecutionSystem";
import { requireSupabaseForWrite } from "./supabase";
import { logActivity } from "./logger";
import type { AccessActor } from "./accessControl";

export async function runSafeExecution(request: string, actor: AccessActor) {
  requireSupabaseForWrite();

  await logActivity({
    actorId: actor.id,
    action: "EXECUTION_STARTED",
    entityType: "company_execution",
    metadata: { role: actor.role, request: request.slice(0, 500) },
  });

  const result = await runCompanyExecution(request);

  if (!result.saved) {
    await logActivity({
      actorId: actor.id,
      action: "EXECUTION_BLOCKED_UNSAVED",
      entityType: "company_execution",
      metadata: { role: actor.role, request: request.slice(0, 500) },
    });
    throw new Error("النظام في وضع القراءة فقط: تم منع تنفيذ غير محفوظ في قاعدة البيانات.");
  }

  await logActivity({
    actorId: "businessBrain",
    action: "EXECUTION_RECORDED",
    entityType: "project",
    entityId: result.project?.id,
    metadata: {
      requestedBy: actor.id,
      requestedRole: actor.role,
      requestedBudget: result.intelligence.requestedBudget,
      approval: result.intelligence.approval,
      riskLevel: result.intelligence.riskLevel,
      confidence: result.intelligence.confidence,
    },
  });

  return result;
}
