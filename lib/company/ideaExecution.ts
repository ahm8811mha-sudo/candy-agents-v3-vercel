import { calculateFinancials } from "../accountingSystem";
import { buildExecutionBlueprint, evaluateBusiness, type BusinessIntelligence } from "../businessBrain";
import { invalidateCache } from "../cache";
import { getSupabaseAdmin } from "../supabase";
import { normalizeActionInitialStatus } from "./actionQueue";
import { recordAudit } from "./audit";
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

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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

  // Idempotency: an idea converts into exactly ONE project. Re-running the
  // conversion (manual button, repeated approval) returns the existing link.
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

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      name: idea.title.slice(0, 120),
      request,
      status: "ACTIVE",
      budget: idea.budgetSAR,
      approved_budget: idea.budgetSAR,
      health_score: intelligence.healthScore,
      risk_level: intelligence.riskLevel,
      approval_status: "APPROVED",
      strategic_direction: intelligence.actionToday,
      financial_snapshot: {
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
      next_review_at: new Date(Date.now() + Math.max(idea.horizonDays, 14) * 86_400_000).toISOString(),
    })
    .select("id,name,status,created_at")
    .single();

  if (projectError) throw projectError;
  const projectId = String(project.id);

  // Money-bearing steps start WAITING_FUNDING: the CFO/owner sees a BUDGET
  // item in the decision center stating the required amount, and the step
  // only becomes executable after that sign-off.
  const taskRows = blueprint.tasks.map((task) => ({
    id: newId("idea-task"),
    project_id: projectId,
    title: task.title,
    description: task.content,
    content: task.content,
    status: task.requiresFunding ? "WAITING_FUNDING" : "TODO",
    priority: task.priority,
    progress_percent: 0,
    owner_role: task.ownerRole,
    kpi_name: task.kpiName,
    kpi_target: task.kpiTarget,
    due_date: new Date(Date.now() + task.dueDays * 86_400_000).toISOString(),
  }));
  const { error: taskError } = await supabase.from("tasks").insert(taskRows);
  if (taskError) throw taskError;

  for (let index = 0; index < blueprint.tasks.length; index += 1) {
    const step = blueprint.tasks[index];
    if (!step.requiresFunding) continue;
    await createApprovalCritical({
      type: "BUDGET",
      title: `اعتماد مالي مطلوب: ${step.title}`,
      detail: `خطوة «${step.title}» في مشروع «${idea.title}» تتطلب مبلغاً تقديرياً ${(
        step.estimatedCostSAR ?? 0
      ).toLocaleString("ar-SA")} ر.س قبل التنفيذ — لا تُنفَّذ الخطوة قبل هذا الاعتماد.`,
      amount: step.estimatedCostSAR,
      requestedRole: "CFO",
      dedupeKey: `task-funding-${taskRows[index].id}`,
      metadata: {
        kind: "TASK_FUNDING",
        taskId: taskRows[index].id,
        projectId,
        ideaId: idea.id,
        estimatedCostSAR: step.estimatedCostSAR ?? null,
      },
    });
  }

  const kpiRows = blueprint.kpis.map((kpi) => ({
    project_id: projectId,
    name: kpi.name,
    target: kpi.target,
    current: 0,
    unit: kpi.unit,
    status: kpi.status,
    due_date: new Date(Date.now() + kpi.dueDays * 86_400_000).toISOString(),
  }));
  const { error: kpiError } = await supabase.from("business_kpis").insert(kpiRows);
  if (kpiError) throw kpiError;

  const actionRows = blueprint.actions.map((action) => ({
    project_id: projectId,
    action_type: action.actionType,
    title: action.title,
    description: action.description,
    status: normalizeActionInitialStatus({
      requiresApproval: false,
      executionMode: action.executionMode,
      approvalStatus: "APPROVED",
    }),
    execution_mode: action.executionMode,
    provider: action.provider || "internal",
    requires_approval: false,
    approval_status: "APPROVED",
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
    attempts: 0,
  }));
  const { error: actionError } = await supabase.from("business_actions").insert(actionRows);
  if (actionError) throw actionError;

  const { error: memoryError } = await supabase.from("business_memory").insert({
    event_type: "APPROVED_IDEA_EXECUTION",
    title: idea.title,
    summary: `تم تحويل الفكرة المعتمدة إلى مشروع تنفيذي. الميزانية: ${idea.budgetSAR.toLocaleString("ar-SA")} ريال. المهام: ${taskRows.length}. المؤشرات: ${kpiRows.length}.`,
    decision_quality: intelligence.riskLevel === "LOW" ? "PROMISING" : "WATCH",
    metadata: {
      ideaId: idea.id,
      approvalId: idea.approvalId,
      projectId,
      aggregate: idea.aggregate,
      confidence: intelligence.confidence,
      assumptions: intelligence.assumptions,
      evidence: intelligence.evidence,
    },
  });
  if (memoryError) throw memoryError;

  markIdeaExecuted(idea.id, projectId);

  recordAudit({
    actor,
    action: "EXECUTE_APPROVED_IDEA",
    entityType: "project",
    entityId: projectId,
    detail: `تم تحويل الفكرة المعتمدة «${idea.title}» إلى مشروع ومهام وKPIs وأفعال تنفيذية.`,
    tier: idea.tier,
  });

  invalidateCache("dashboard-data");

  return {
    ok: true,
    ideaId,
    mode: "durable",
    saved: true,
    project: project as ApprovedIdeaExecutionResult["project"],
    counts: { tasks: taskRows.length, kpis: kpiRows.length, actions: actionRows.length },
  };
}
