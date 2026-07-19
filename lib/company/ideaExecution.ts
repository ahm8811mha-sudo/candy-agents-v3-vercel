import { calculateFinancials } from "../accountingSystem";
import { buildExecutionBlueprint, evaluateBusiness, type BusinessIntelligence } from "../businessBrain";
import { invalidateCache } from "../cache";
import { getSupabaseAdmin } from "../supabase";
import { normalizeActionInitialStatus } from "./actionQueue";
import { recordAudit } from "./audit";
import { createExecutionBundle } from "./executionRepository";
import { classifyExecutionKind } from "./executionHonesty";
import { listIdeas, markIdeaExecuted } from "./ideas";
import { createApprovalCritical } from "../approvals";

export type ApprovedIdeaExecutionResult = {
  ok: boolean;
  ideaId: string;
  mode: "durable" | "memory-only";
  saved: boolean;
  project?: {
    id: string;
    name: string;
    status?: string;
    created_at?: string;
  };
  counts: {
    tasks: number;
    kpis: number;
    actions: number;
  };
  reason?: string;
};

function metadataValue(metadata: Record<string, unknown> | undefined, key: string): string {
  const value = metadata?.[key];
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asApprovedIntelligence(base: BusinessIntelligence, budgetSAR: number, approvalId?: string): BusinessIntelligence {
  return {
    ...base,
    requestedBudget: budgetSAR,
    approval: {
      budget: budgetSAR,
      gate: "AUTO",
      requiredRole: "NONE",
      reason: approvalId
        ? `تم اعتماد الفكرة مسبقاً عبر مركز القرار (${approvalId})؛ يسمح الآن بتحويلها إلى مشروع تنفيذ.`
        : "تم اعتماد الفكرة مسبقاً؛ يسمح الآن بتحويلها إلى مشروع تنفيذ.",
    },
    evidence: [
      ...base.evidence,
      {
        source: "approval_matrix",
        type: "system",
        summary: approvalId
          ? `تم اعتماد الفكرة عبر مركز القرار بالمعرف ${approvalId}.`
          : "تم اعتماد الفكرة عبر مركز القرار.",
        metadata: { approvalId, budgetSAR },
      },
    ],
    assumptions: [
      ...base.assumptions,
      "تم إلغاء شرط الاعتماد الداخلي لهذه الفكرة لأن المالك أو صاحب الصلاحية اعتمدها مسبقاً.",
    ],
    recommendedActions: base.recommendedActions.map((action) => ({
      ...action,
      requiresApproval: false,
      assumptions: [
        ...action.assumptions,
        "الإجراء جزء من فكرة معتمدة مسبقاً، لكن التكاملات الخارجية تبقى في انتظار الربط عند الحاجة.",
      ],
      evidence: [
        ...action.evidence,
        {
          source: "approval_matrix",
          type: "system",
          summary: "تم تمرير الإجراء لأن الفكرة الأصلية معتمدة.",
          metadata: { approvalId, budgetSAR },
        },
      ],
      blockedBy: (action.blockedBy || []).filter((item) => !item.includes("يتطلب اعتماد")),
    })),
  };
}

export async function executeApprovedIdea(
  metadata: Record<string, unknown> | undefined,
  actor = "المالك"
): Promise<ApprovedIdeaExecutionResult> {
  const ideaId = metadataValue(metadata, "ideaId");
  if (!ideaId) {
    return {
      ok: false,
      ideaId: "",
      mode: "memory-only",
      saved: false,
      counts: { tasks: 0, kpis: 0, actions: 0 },
      reason: "لا يوجد ideaId داخل metadata، لذلك لا يمكن تحويل الاعتماد إلى مشروع.",
    };
  }

  const idea = listIdeas().find((item) => item.id === ideaId);
  if (!idea) {
    return {
      ok: false,
      ideaId,
      mode: "memory-only",
      saved: false,
      counts: { tasks: 0, kpis: 0, actions: 0 },
      reason: "الفكرة غير موجودة في سجل الأفكار بعد المزامنة.",
    };
  }

  // Fast-path idempotency for the UI: an idea converts into exactly ONE
  // project (the execution bundle's idempotencyKey guards the DB layer too).
  if (idea.executedProjectId) {
    return {
      ok: true,
      ideaId,
      mode: "durable",
      saved: true,
      counts: { tasks: 0, kpis: 0, actions: 0 },
      reason: `سبق تحويل هذه الفكرة إلى مشروع (${idea.executedProjectId}) — لا يُنشأ مشروع مكرر.`,
    };
  }

  const request = `تنفيذ الفكرة المعتمدة: ${idea.title}. الفرضية: ${idea.hypothesis}. الميزانية المعتمدة: ${idea.budgetSAR} ريال. الأفق الزمني: ${idea.horizonDays} يوم.`;
  const financials = await calculateFinancials();
  const baseIntelligence = evaluateBusiness(request, financials);
  const intelligence = asApprovedIntelligence(baseIntelligence, idea.budgetSAR, idea.approvalId);
  const blueprint = buildExecutionBlueprint(request, intelligence);
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    recordAudit({
      actor,
      action: "EXECUTE_APPROVED_IDEA_SKIPPED",
      entityType: "idea",
      entityId: idea.id,
      detail: `تم اعتماد الفكرة «${idea.title}» لكن Supabase غير مضبوط، لذلك لم تُحفظ كمشروع دائم.`,
      tier: idea.tier,
    });

    return {
      ok: true,
      ideaId,
      mode: "memory-only",
      saved: false,
      counts: { tasks: blueprint.tasks.length, kpis: blueprint.kpis.length, actions: blueprint.actions.length },
      reason: "تم تجهيز خطة التنفيذ داخلياً، لكن حفظ المشروع يتطلب ضبط Supabase.",
    };
  }

  const execution = await createExecutionBundle({
    source: "approved-idea",
    idempotencyKey: `idea:${idea.id}`,
    actorId: actor,
    actorRole: "OWNER",
    project: {
      name: idea.title.slice(0, 120),
      request,
      status: "ACTIVE",
      budget: idea.budgetSAR,
      approvedBudget: idea.budgetSAR,
      healthScore: intelligence.healthScore,
      riskLevel: intelligence.riskLevel,
      approvalStatus: "APPROVED",
      strategicDirection: intelligence.actionToday,
      financialSnapshot: {
        source: "approved_idea",
        ideaId: idea.id,
        approvalId: idea.approvalId,
        budgetSAR: idea.budgetSAR,
        horizonDays: idea.horizonDays,
        aggregate: idea.aggregate,
        healthScore: intelligence.healthScore,
        riskLevel: intelligence.riskLevel,
        confidence: intelligence.confidence,
        assumptions: intelligence.assumptions,
        evidence: intelligence.evidence,
      },
      nextReviewAt: new Date(Date.now() + Math.max(idea.horizonDays, 14) * 86_400_000).toISOString(),
    },
    // Money-bearing steps start WAITING_FUNDING: the CFO sees a BUDGET item
    // in the decision center stating the amount, and the step only becomes
    // executable after that sign-off (see the funding approvals below).
    tasks: blueprint.tasks.map((task) => ({
      title: task.title,
      description: task.content,
      content: task.content,
      status: task.requiresFunding ? "WAITING_FUNDING" : "TODO",
      priority: task.priority,
      ownerRole: task.ownerRole,
      kpiName: task.kpiName,
      kpiTarget: task.kpiTarget,
      dueDate: new Date(Date.now() + task.dueDays * 86_400_000).toISOString(),
      metadata: {
        executionKind: classifyExecutionKind({
          title: task.title,
          description: task.content,
          requiresFunding: task.requiresFunding,
          estimatedCostSAR: task.estimatedCostSAR,
        }),
        ...(task.requiresFunding ? { requiresFunding: true } : {}),
        ...(Number(task.estimatedCostSAR || 0) > 0 ? { estimatedCostSAR: task.estimatedCostSAR } : {}),
      },
    })),
    kpis: blueprint.kpis.map((kpi) => ({
      name: kpi.name,
      target: kpi.target,
      current: 0,
      unit: kpi.unit,
      status: kpi.status,
      dueDate: new Date(Date.now() + kpi.dueDays * 86_400_000).toISOString(),
    })),
    actions: blueprint.actions.map((action) => ({
      actionType: action.actionType,
      title: action.title,
      description: action.description,
      status: normalizeActionInitialStatus({
        requiresApproval: false,
        executionMode: action.executionMode,
        approvalStatus: "APPROVED",
      }),
      executionMode: action.executionMode,
      provider: action.provider || "internal",
      requiresApproval: false,
      approvalStatus: "APPROVED",
      payload: {
        source: "approved_idea",
        ideaId: idea.id,
        approvalId: idea.approvalId,
        priority: action.priority,
        originalRequiresApproval: action.requiresApproval,
        confidence: action.confidence,
        assumptions: action.assumptions,
        evidence: action.evidence,
        blockedBy: action.blockedBy || [],
      },
    })),
    alerts: intelligence.alerts.map((alert) => ({
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      source: alert.source,
      metadata: alert.metadata || {},
    })),
    memory: {
      eventType: "APPROVED_IDEA_EXECUTION",
      title: idea.title,
      summary: `تم تحويل الفكرة المعتمدة إلى مشروع تنفيذي. الميزانية: ${idea.budgetSAR.toLocaleString("ar-SA")} ريال. المهام: ${blueprint.tasks.length}. المؤشرات: ${blueprint.kpis.length}.`,
      decisionQuality: intelligence.riskLevel === "LOW" ? "PROMISING" : "WATCH",
      metadata: {
        ideaId: idea.id,
        approvalId: idea.approvalId,
        aggregate: idea.aggregate,
        confidence: intelligence.confidence,
        assumptions: intelligence.assumptions,
        evidence: intelligence.evidence,
      },
    },
    audit: {
      action: "EXECUTE_APPROVED_IDEA",
      detail: `تم تحويل الفكرة المعتمدة «${idea.title}» إلى مشروع ومهام وKPIs وأفعال تنفيذية في معاملة واحدة.`,
      tier: idea.tier,
      metadata: { ideaId: idea.id, approvalId: idea.approvalId },
    },
  });

  const projectId = String((execution.project as Record<string, unknown>).id);
  markIdeaExecuted(idea.id, projectId);

  // Funding gate: each WAITING_FUNDING step raises a BUDGET item to the CFO
  // in the unified decision center with the estimated amount.
  for (let index = 0; index < blueprint.tasks.length; index += 1) {
    const step = blueprint.tasks[index];
    if (!step.requiresFunding) continue;
    const bundleTask = execution.tasks[index] as Record<string, unknown> | undefined;
    if (!bundleTask?.id) continue;
    await createApprovalCritical({
      type: "BUDGET",
      title: `اعتماد مالي مطلوب: ${step.title}`,
      detail: `خطوة «${step.title}» في مشروع «${idea.title}» تتطلب مبلغاً تقديرياً ${(
        step.estimatedCostSAR ?? 0
      ).toLocaleString("ar-SA")} ر.س قبل التنفيذ — لا تُنفَّذ الخطوة قبل هذا الاعتماد.`,
      amount: step.estimatedCostSAR,
      requestedRole: "CFO",
      dedupeKey: `task-funding-${bundleTask.id}`,
      metadata: {
        kind: "TASK_FUNDING",
        taskId: String(bundleTask.id),
        projectId,
        ideaId: idea.id,
        estimatedCostSAR: step.estimatedCostSAR ?? null,
      },
    });
  }

  invalidateCache("dashboard-data");

  return {
    ok: true,
    ideaId,
    mode: "durable",
    saved: true,
    project: execution.project as ApprovedIdeaExecutionResult["project"],
    counts: { tasks: execution.tasks.length, kpis: execution.kpis.length, actions: blueprint.actions.length },
  };
}
