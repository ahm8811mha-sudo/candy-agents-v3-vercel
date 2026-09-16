import { calculateFinancials } from "../accountingSystem";
import { buildExecutionBlueprint, evaluateBusiness, type BusinessIntelligence } from "../businessBrain";
import { invalidateCache } from "../cache";
import { getSupabaseAdmin } from "../supabase";
import { normalizeActionInitialStatus } from "./actionQueue";
import { createExecutionBundle } from "./executionRepository";
import { classifyExecutionKind } from "./executionHonesty";
import { getIdeaCritical, markIdeaExecuted } from "./ideas";
import { getTenantId } from "../tenant";
import { rememberDurableApprovalRow } from "../approvals";

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
  actor = "المالك",
  tenantId = getTenantId()
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

  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, ideaId, mode: "memory-only", saved: false, counts: { tasks: 0, kpis: 0, actions: 0 }, reason: "قاعدة البيانات غير مهيأة؛ لم يُنشأ مشروع." };
  const idea = await getIdeaCritical(ideaId, tenantId);
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

  if (idea.status !== "APPROVED") return { ok: false, ideaId, mode: "durable", saved: false, counts: { tasks: 0, kpis: 0, actions: 0 }, reason: "يلزم اعتماد الفكرة أولاً." };

  const request = `تنفيذ الفكرة المعتمدة: ${idea.title}. الفرضية: ${idea.hypothesis}. الميزانية المعتمدة: ${idea.budgetSAR} ريال. الأفق الزمني: ${idea.horizonDays} يوم.`;
  const financials = await calculateFinancials();
  const baseIntelligence = evaluateBusiness(request, financials);
  const intelligence = asApprovedIntelligence(baseIntelligence, idea.budgetSAR, idea.approvalId);
  const blueprint = buildExecutionBlueprint(request, intelligence);
  const execution = await createExecutionBundle({
    source: "approved-idea",
    tenantId,
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
  // Always finalize on retry, even when an earlier request created the project.
  // The RPC uses persisted task metadata, never blueprint array positions.
  const { data: funding, error: fundingError } = await supabase.rpc("orvanta_finalize_idea_funding", {
    p_tenant_id: tenantId, p_idea_id: idea.id, p_project_id: projectId, p_actor: actor,
  });
  if (fundingError || !funding?.projectId) throw new Error("المشروع محفوظ لكن استكمال التمويل لم يكتمل. أعد المحاولة بأمان. " + (fundingError?.message || ""));
  for (const row of funding.approvals || []) rememberDurableApprovalRow(row);
  markIdeaExecuted(idea.id, projectId);

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
