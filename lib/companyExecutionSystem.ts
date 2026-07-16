import { randomUUID } from "node:crypto";
import { calculateFinancials, type Financials } from "./accountingSystem";
import { evaluateBusiness, type BusinessAlert, type BusinessIntelligence } from "./businessBrain";
import { getSupabaseAdmin } from "./supabase";
import { getMemoryContext } from "./agentMemory";
import { invalidateCache } from "./cache";
import { effectiveTier } from "./company/governance";
import { createExecutionBundle } from "./company/executionRepository";
import { buildInitiativeBlueprint, buildInitiativePlan, initiativePlanAsText, type InitiativeBlueprint, type InitiativePlan } from "./company/initiativePlanning";

type ExecutionProject = { id: string; project_number?: number | null; project_date?: string | null; name: string; status?: string; created_at?: string };
type ExecutionTask = { id: string; project_id: string; task_sequence?: number | null; task_number?: string | null; task_date?: string | null; title: string; content: string; status: string; created_at?: string };
type ExecutionKpi = { id?: string; project_id?: string; name: string; target: number; current?: number; unit: string; status: string };
type ExecutionApproval = { id: string; entity_type: string; entity_id: string; status: string; notes?: string };

export type CompanyExecutionResult = {
  financials: Financials;
  intelligence: BusinessIntelligence;
  cfo: string;
  ceo: string;
  tasks: string;
  project: ExecutionProject;
  task: ExecutionTask;
  tasksCreated: ExecutionTask[];
  kpis: ExecutionKpi[];
  actions: InitiativeBlueprint["actions"];
  alerts: BusinessAlert[];
  approval: ExecutionApproval | null;
  initiativePlan: InitiativePlan;
  saved: boolean;
  workflowInstanceId?: string;
  correlationId?: string;
  idempotent?: boolean;
};

export type CompanyExecutionOptions = { idempotencyKey?: string; actorId?: string; actorRole?: string };
const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function createProjectFlow(
  request: string,
  tasksReport: string,
  intelligence: BusinessIntelligence,
  blueprint: InitiativeBlueprint,
  initiativePlan: InitiativePlan,
  ceo: string,
  financials: Financials,
  cfo: string,
  options: CompanyExecutionOptions
) {
  const projectName = request.trim().slice(0, 120);
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    const project = { id: newId("project"), name: projectName, status: "PENDING_APPROVAL", created_at: new Date().toISOString() };
    const tasksCreated = blueprint.tasks.map((task) => ({ id: newId("execution-task"), project_id: project.id, title: task.title, content: task.content, status: "BLOCKED", created_at: new Date().toISOString() }));
    return { project, task: tasksCreated[0], tasksCreated, kpis: blueprint.kpis, approval: null, saved: false };
  }

  const tier = effectiveTier(initiativePlan.plannedBudget, intelligence.riskLevel);
  const execution = await createExecutionBundle({
    source: "company-execution",
    idempotencyKey: options.idempotencyKey || randomUUID(),
    actorId: options.actorId || "businessBrain",
    actorRole: options.actorRole,
    project: {
      name: projectName,
      request: request.trim(),
      status: "PENDING_APPROVAL",
      budget: initiativePlan.plannedBudget,
      approvedBudget: 0,
      healthScore: intelligence.healthScore,
      riskLevel: intelligence.riskLevel,
      approvalStatus: "PENDING",
      strategicDirection: initiativePlan.finalRecommendation,
      financialSnapshot: { requestedBudget: initiativePlan.plannedBudget, healthScore: intelligence.healthScore, riskLevel: intelligence.riskLevel, confidence: intelligence.confidence, assumptions: intelligence.assumptions, evidence: intelligence.evidence, approval: intelligence.approval, initiativePlan },
      nextReviewAt: new Date(Date.now() + initiativePlan.durationDays * 86_400_000).toISOString(),
    },
    tasks: blueprint.tasks,
    kpis: blueprint.kpis,
    actions: blueprint.actions,
    alerts: intelligence.alerts.map((alert) => ({ severity: alert.severity, title: alert.title, message: alert.message, source: alert.source, metadata: alert.metadata || {} })),
    memory: {
      eventType: "COMPANY_EXECUTION",
      title: projectName,
      summary: `قرار: ${intelligence.actionToday}\n\n${ceo.slice(0, 1200)}`,
      decisionQuality: intelligence.riskLevel === "LOW" ? "PROMISING" : "WATCH",
      metadata: { request, tasksReport, healthScore: intelligence.healthScore, confidence: intelligence.confidence, assumptions: intelligence.assumptions, evidence: intelligence.evidence, approval: intelligence.approval, initiativePlan, actions: blueprint.actions.map((action) => ({ type: action.actionType, agent: action.payload.agentName, role: action.payload.role })) },
    },
    financialDecision: { request: request.trim(), financials: financials as unknown as Record<string, unknown>, cfoReport: cfo, ceoDecision: ceo },
    approval: {
      title: `اعتماد خطة التنفيذ: ${projectName}`,
      detail: `${initiativePlan.finalRecommendation} بعد الاعتماد ينفذ ${initiativePlan.specialistPlans.length} وكلاء مهامهم تلقائيًا ويعيدون النتائج للمكتب التنفيذي.`,
      amount: initiativePlan.plannedBudget,
      requestedRole: tier.approver,
      tier: tier.tier,
      riskLevel: intelligence.riskLevel,
      metadata: { planVersion: initiativePlan.version, planningMode: initiativePlan.planningMode, durationDays: initiativePlan.durationDays, specialistCount: initiativePlan.specialistPlans.length },
    },
    audit: { action: "EXECUTION_BUNDLE_CREATED", detail: `تم إنشاء مشروع التنفيذ «${projectName}» مع المهام والمؤشرات والإجراءات في معاملة واحدة.`, tier: tier.tier, metadata: { requestedBudget: initiativePlan.plannedBudget, riskLevel: intelligence.riskLevel, approvalRequired: true } },
  });

  const project = execution.project as ExecutionProject;
  const tasksCreated = execution.tasks as ExecutionTask[];
  const kpis = execution.kpis as ExecutionKpi[];
  const approval: ExecutionApproval | null = execution.approval ? { id: execution.approval.id, entity_type: `${tier.tier}_PROJECT_APPROVAL`, entity_id: String(project.id), status: execution.approval.status, notes: execution.approval.detail } : null;
  return { project, task: tasksCreated[0], tasksCreated, kpis, approval, saved: true, workflowInstanceId: execution.workflowInstanceId, correlationId: execution.correlationId, idempotent: execution.idempotent };
}

export async function runCompanyExecution(request: string, options: CompanyExecutionOptions = {}): Promise<CompanyExecutionResult> {
  if (!request?.trim()) throw new Error("نص الطلب مطلوب.");
  const financials = await calculateFinancials();
  const intelligence = evaluateBusiness(request.trim(), financials);
  const memoryContext = await getMemoryContext(request.trim());
  const initiativePlan = await buildInitiativePlan(request.trim(), { requestedBudget: intelligence.requestedBudget, riskLevel: intelligence.riskLevel, financials: financials as unknown as Record<string, unknown>, memoryContext: memoryContext.slice(0, 1800) });
  const financePlan = initiativePlan.specialistPlans.find((plan) => plan.role === "FINANCE");
  const cfo = [financePlan?.summary, financePlan?.recommendation].filter(Boolean).join("\n\n");
  const ceo = `${initiativePlan.finalRecommendation}\n\n${initiativePlan.rationale.map((item) => `- ${item}`).join("\n")}`;
  const tasks = initiativePlanAsText(initiativePlan);
  const blueprint = buildInitiativeBlueprint(initiativePlan, true);
  const flow = await createProjectFlow(request.trim(), tasks, intelligence, blueprint, initiativePlan, ceo, financials, cfo, options);
  invalidateCache("dashboard-data");
  return { financials, intelligence, cfo, ceo, tasks, project: flow.project, task: flow.task, tasksCreated: flow.tasksCreated, kpis: flow.kpis, actions: blueprint.actions, alerts: intelligence.alerts, approval: flow.approval, initiativePlan, saved: flow.saved, workflowInstanceId: flow.workflowInstanceId, correlationId: flow.correlationId, idempotent: flow.idempotent };
}

export async function getDashboardData() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { projects: [], tasks: [], decisions: [], alerts: [], kpis: [], actions: [], approvals: [], memory: [] };
  const tasksPromise = (async () => {
    const numbered = await supabase.from("tasks").select("id,project_id,task_sequence,task_number,task_date,title,content,description,status,priority,created_at,due_date,progress_percent,owner_role,kpi_name,kpi_target").order("created_at", { ascending: false }).limit(100);
    const missingIdentityColumns = numbered.error?.code === "42703"
      || numbered.error?.code === "PGRST204"
      || /task_sequence|task_number|task_date/i.test(String(numbered.error?.message || ""));
    return missingIdentityColumns
      ? supabase.from("tasks").select("id,project_id,title,content,description,status,priority,created_at,due_date,progress_percent,owner_role,kpi_name,kpi_target").order("created_at", { ascending: false }).limit(100)
      : numbered;
  })();
  const [projects, tasks, decisions, alerts, kpis, actions, approvals, memory] = await Promise.all([
    supabase.from("projects").select("*").order("created_at", { ascending: false }).limit(20),
    tasksPromise,
    supabase.from("financial_decisions").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.from("business_alerts").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.from("business_kpis").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.from("business_actions").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("company_approvals").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.from("business_memory").select("*").order("created_at", { ascending: false }).limit(20),
  ]);
  for (const result of [projects, tasks, decisions, alerts, kpis, actions, approvals, memory]) if (result.error) throw result.error;
  return { projects: projects.data || [], tasks: tasks.data || [], decisions: decisions.data || [], alerts: alerts.data || [], kpis: kpis.data || [], actions: actions.data || [], approvals: approvals.data || [], memory: memory.data || [] };
}
