import { calculateFinancials, type Financials } from "./accountingSystem";
import {
  buildExecutionBlueprint,
  evaluateBusiness,
  type BusinessAlert,
  type BusinessIntelligence,
  type ExecutionBlueprint,
  type RecommendedAction,
} from "./businessBrain";
import { getSupabaseAdmin } from "./supabase";
import { getMemoryContext } from "./agentMemory";
import { invalidateCache } from "./cache";
import { normalizeActionInitialStatus } from "./company/actionQueue";
import { createApprovalCritical } from "./approvals";

type ExecutionProject = {
  id: string;
  name: string;
  status?: string;
  created_at?: string;
};

type ExecutionTask = {
  id: string;
  project_id: string;
  title: string;
  content: string;
  status: string;
  created_at?: string;
};

type ExecutionKpi = {
  id?: string;
  project_id?: string;
  name: string;
  target: number;
  current?: number;
  unit: string;
  status: string;
};

type ExecutionApproval = {
  id: string;
  entity_type: string;
  entity_id: string;
  status: string;
  notes?: string;
};

type CompanyExecutionResult = {
  financials: Financials;
  intelligence: BusinessIntelligence;
  cfo: string;
  ceo: string;
  tasks: string;
  project: ExecutionProject;
  task: ExecutionTask;
  tasksCreated: ExecutionTask[];
  kpis: ExecutionKpi[];
  actions: RecommendedAction[];
  alerts: BusinessAlert[];
  approval: ExecutionApproval | null;
  saved: boolean;
};

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function runAI(prompt: string, fallback: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.25,
      messages: [
        {
          role: "system",
          content:
            "You are a professional business AI operating as an enterprise company. Write in Arabic with structured, realistic execution outputs. Every recommendation must include evidence, assumptions, confidence, risk, approval gate, and next executable action.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) return fallback;
  const data = await res.json();
  return data.choices?.[0]?.message?.content || fallback;
}

function fallbackCfo(request: string, financials: Financials, intelligence: BusinessIntelligence) {
  const recommendation =
    financials.profit > 0
      ? "موافقة مشروطة بمرحلة تجريبية وربط الصرف بعائد قابل للقياس."
      : "رفض مؤقت أو تقليل النطاق حتى تتحسن السيولة.";

  return `
## تقرير CFO

### اعتماد الميزانية
${recommendation}

### الأثر المالي
- الإيرادات: ${financials.income.toLocaleString("ar-SA")} ريال
- المصروفات: ${financials.expenses.toLocaleString("ar-SA")} ريال
- صافي الربح: ${financials.profit.toLocaleString("ar-SA")} ريال
- الميزانية المطلوبة: ${intelligence.requestedBudget.toLocaleString("ar-SA")} ريال
- بوابة الاعتماد: ${intelligence.approval.gate}

### الثقة والأدلة
- درجة الثقة: ${intelligence.confidence}%
- الدليل المالي: ${intelligence.evidence.map((item) => item.summary).join(" | ")}

### الافتراضات
${intelligence.assumptions.map((item) => `- ${item}`).join("\n")}

### المخاطر
${intelligence.alerts.length ? intelligence.alerts.map((alert) => `- ${alert.title}: ${alert.message}`).join("\n") : "- لا توجد مخاطر حرجة مسجلة."}

### القرار المالي
الطلب: ${request}
ينفذ فقط عبر مراحل واضحة، مع سقف صرف أولي ومراجعة مالية قبل الانتقال للمرحلة التالية.
`.trim();
}

function fallbackCeo(cfo: string, intelligence: BusinessIntelligence) {
  return `
## قرار CEO

### القرار النهائي
اعتماد التنفيذ بشكل معدل ومشروط حسب بوابة الاعتماد: ${intelligence.approval.gate}.

### سبب القرار
تقرير المدير المالي يوضح أن التنفيذ ممكن إذا تم التحكم في الصرف وتقسيم المخاطر. درجة الثقة الحالية ${intelligence.confidence}%.

### خطة التنفيذ
- إنشاء مشروع تنفيذي رسمي.
- تحويل القرار إلى مهام قابلة للمتابعة.
- إدخال الأفعال في Action Queue بدل تنفيذها بشكل مخفي.
- مراجعة الأداء خلال 14 يوم عمل.
- إيقاف أو توسيع المشروع بناء على الربحية ومؤشرات التشغيل.

### مرجع CFO
${cfo}
`.trim();
}

function fallbackTasks(decision: string) {
  return `
## قائمة المهام التنفيذية

1. إعداد نطاق المشروع
- المسؤول: مدير العمليات
- المدة: يومان

2. اعتماد الميزانية المرحلية
- المسؤول: حسب بوابة الصلاحيات
- المدة: يوم عمل

3. تجهيز خطة التسويق الأولية
- المسؤول: مدير التسويق
- المدة: 3 أيام

4. تجهيز الموارد والموردين
- المسؤول: سلسلة الإمداد
- المدة: 5 أيام

5. مراجعة النتائج وإصدار قرار التوسع
- المسؤول: الرئيس التنفيذي
- المدة: بعد 14 يوم عمل

## القرار الذي تم تحويله
${decision}
`.trim();
}

async function CFO(request: string, financials: Financials, intelligence: BusinessIntelligence) {
  return runAI(
    `
You are a CFO.

Financials:
${JSON.stringify(financials, null, 2)}

Business intelligence:
${JSON.stringify(intelligence, null, 2)}

Request:
${request}

Give:
- Budget approval
- Financial impact
- Evidence used
- Assumptions
- Confidence score
- Risks
- Decision

Rules:
- Be realistic.
- Use corporate finance logic.
- Do not invent unsupported numbers.
- Write in Arabic.
`,
    fallbackCfo(request, financials, intelligence)
  );
}

async function CEO(cfo: string, intelligence: BusinessIntelligence) {
  return runAI(
    `
You are a CEO.

CFO Report:
${cfo}

Business intelligence:
${JSON.stringify(intelligence, null, 2)}

Give final decision and execution plan.

Rules:
- Make one clear executive decision.
- Convert the decision into a practical business direction.
- Include evidence, assumptions, confidence, approval gate, and next executable action.
- Write in Arabic.
`,
    fallbackCeo(cfo, intelligence)
  );
}

async function generateTasks(decision: string) {
  return runAI(
    `
Convert this decision into tasks:

${decision}

Return:
- Tasks list
- Required roles
- Timeline
- KPI for each task
- What must be approved before execution

Rules:
- Write practical execution tasks.
- Each task must include owner role and deadline.
- Write in Arabic.
`,
    fallbackTasks(decision)
  );
}

function buildActionPayload(action: RecommendedAction, request: string, intelligence: BusinessIntelligence) {
  return {
    request,
    priority: action.priority,
    approval: intelligence.approval,
    confidence: action.confidence,
    assumptions: action.assumptions,
    evidence: action.evidence,
    blockedBy: action.blockedBy || [],
    riskLevel: intelligence.riskLevel,
    generatedBy: "businessBrain",
  };
}

async function createProjectFlow(
  request: string,
  tasksReport: string,
  intelligence: BusinessIntelligence,
  blueprint: ExecutionBlueprint,
  ceo: string
) {
  const projectName = request.trim().slice(0, 120);
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    const project = {
      id: newId("project"),
      name: projectName,
      status: "ACTIVE",
      created_at: new Date().toISOString(),
    };
    const tasksCreated = blueprint.tasks.map((task) => ({
      id: newId("execution-task"),
      project_id: project.id,
      title: task.title,
      content: task.content,
      status: "TODO",
      created_at: new Date().toISOString(),
    }));
    return {
      project,
      task: tasksCreated[0],
      tasksCreated,
      kpis: blueprint.kpis,
      approval: null,
      saved: false,
    };
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      name: projectName,
      request: request.trim(),
      status: "ACTIVE",
      budget: intelligence.requestedBudget,
      approved_budget: intelligence.approval.gate === "AUTO" ? intelligence.requestedBudget : 0,
      health_score: intelligence.healthScore,
      risk_level: intelligence.riskLevel,
      approval_status: intelligence.approval.gate === "AUTO" ? "APPROVED" : "PENDING",
      strategic_direction: intelligence.actionToday,
      financial_snapshot: {
        requestedBudget: intelligence.requestedBudget,
        healthScore: intelligence.healthScore,
        riskLevel: intelligence.riskLevel,
        confidence: intelligence.confidence,
        assumptions: intelligence.assumptions,
        evidence: intelligence.evidence,
        approval: intelligence.approval,
      },
      next_review_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    })
    .select("id,name,status,created_at")
    .single();

  if (projectError) throw projectError;

  const taskRows = blueprint.tasks.map((task) => ({
    id: newId("execution-task"),
    project_id: project.id,
    title: task.title,
    description: task.content,
    content: task.content,
    status: "TODO",
    priority: task.priority,
    progress_percent: 0,
    owner_role: task.ownerRole,
    kpi_name: task.kpiName,
    kpi_target: task.kpiTarget,
    due_date: new Date(Date.now() + task.dueDays * 86400000).toISOString(),
  }));

  const { data: tasksCreated, error: taskError } = await supabase
    .from("tasks")
    .insert(taskRows)
    .select("id,project_id,title,content,status,created_at")
    .order("created_at", { ascending: true });

  if (taskError) throw taskError;

  const kpiRows = blueprint.kpis.map((kpi) => ({
    project_id: project.id,
    name: kpi.name,
    target: kpi.target,
    current: 0,
    unit: kpi.unit,
    status: kpi.status,
    due_date: new Date(Date.now() + kpi.dueDays * 86400000).toISOString(),
  }));
  const { data: kpis, error: kpiError } = await supabase
    .from("business_kpis")
    .insert(kpiRows)
    .select("id,project_id,name,target,current,unit,status");
  if (kpiError) throw kpiError;

  const actionRows = blueprint.actions.map((action) => ({
    project_id: project.id,
    action_type: action.actionType,
    title: action.title,
    description: action.description,
    status: normalizeActionInitialStatus({
      requiresApproval: action.requiresApproval,
      executionMode: action.executionMode,
      approvalStatus: action.requiresApproval ? "PENDING" : "NOT_REQUIRED",
    }),
    execution_mode: action.executionMode,
    provider: action.provider || "internal",
    requires_approval: action.requiresApproval,
    approval_status: action.requiresApproval ? "PENDING" : "NOT_REQUIRED",
    payload: buildActionPayload(action, request, intelligence),
    attempts: 0,
  }));
  const { error: actionsError } = await supabase.from("business_actions").insert(actionRows);
  if (actionsError) throw actionsError;

  if (intelligence.alerts.length) {
    const alertRows = intelligence.alerts.map((alert) => ({
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      source: alert.source,
      metadata: alert.metadata || {},
    }));
    const { error: alertError } = await supabase.from("business_alerts").insert(alertRows);
    if (alertError) throw alertError;
  }

  // Gated projects wait in the UNIFIED decision center (company_approvals),
  // not the legacy approvals table the owner inbox never reads. The decisions
  // route recognizes kind=PROJECT_APPROVAL and flips the project + unblocks
  // its queued actions on sign-off (applyProjectApprovalDecision below).
  let approval: ExecutionApproval | null = null;
  if (intelligence.approval.requiredRole !== "NONE") {
    const item = await createApprovalCritical({
      type: "GENERAL",
      title: `اعتماد مشروع: ${projectName}`,
      detail: `${intelligence.approval.reason} · الميزانية المطلوبة ${Math.round(intelligence.requestedBudget).toLocaleString("ar-SA")} ر.س`,
      amount: intelligence.requestedBudget > 0 ? intelligence.requestedBudget : undefined,
      requestedRole: intelligence.approval.requiredRole,
      dedupeKey: `project-${project.id}`,
      metadata: {
        kind: "PROJECT_APPROVAL",
        projectId: String(project.id),
        requiredRole: intelligence.approval.requiredRole,
        source: "companyExecutionSystem",
      },
    });
    approval = {
      id: item.id,
      entity_type: `${intelligence.approval.requiredRole}_PROJECT_APPROVAL`,
      entity_id: String(project.id),
      status: item.status,
      notes: intelligence.approval.reason,
    };
  }

  const { error: memoryError } = await supabase.from("business_memory").insert({
    event_type: "COMPANY_EXECUTION",
    title: projectName,
    summary: `قرار: ${intelligence.actionToday}\n\n${ceo.slice(0, 1200)}`,
    decision_quality: intelligence.riskLevel === "LOW" ? "PROMISING" : "WATCH",
    metadata: {
      request,
      tasksReport,
      healthScore: intelligence.healthScore,
      confidence: intelligence.confidence,
      assumptions: intelligence.assumptions,
      evidence: intelligence.evidence,
      approval: intelligence.approval,
      actions: blueprint.actions.map((action) => ({
        type: action.actionType,
        confidence: action.confidence,
        blockedBy: action.blockedBy || [],
      })),
    },
  });
  if (memoryError) throw memoryError;

  return {
    project: project as ExecutionProject,
    task: (tasksCreated?.[0] || taskRows[0]) as ExecutionTask,
    tasksCreated: (tasksCreated || []) as ExecutionTask[],
    kpis: (kpis || []) as ExecutionKpi[],
    approval,
    saved: true,
  };
}

async function saveFinancialDecision(request: string, financials: Financials, cfo: string, ceo: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const { error } = await supabase.from("financial_decisions").insert({
    request,
    financials,
    cfo_report: cfo,
    ceo_decision: ceo,
  });

  if (error) throw error;
  return true;
}

export async function runCompanyExecution(request: string): Promise<CompanyExecutionResult> {
  if (!request?.trim()) {
    throw new Error("نص الطلب مطلوب.");
  }

  const financials = await calculateFinancials();
  const intelligence = evaluateBusiness(request.trim(), financials);
  const memoryContext = await getMemoryContext(request.trim());
  const cfo = await CFO(request.trim() + memoryContext, financials, intelligence);
  const ceo = await CEO(cfo, intelligence);
  await saveFinancialDecision(request.trim(), financials, cfo, ceo);
  const tasks = await generateTasks(ceo);
  const blueprint = buildExecutionBlueprint(request.trim(), intelligence);
  const { project, task, tasksCreated, kpis, approval, saved } = await createProjectFlow(
    request.trim(),
    tasks,
    intelligence,
    blueprint,
    ceo
  );

  invalidateCache("dashboard-data");

  return {
    financials,
    intelligence,
    cfo,
    ceo,
    tasks,
    project,
    task,
    tasksCreated,
    kpis,
    actions: blueprint.actions,
    alerts: intelligence.alerts,
    approval,
    saved,
  };
}

export type ProjectApprovalDecisionResult = {
  ok: boolean;
  projectId: string;
  unblockedActions: number;
  reason: string;
};

/**
 * Execution side-effect for unified decision-center sign-offs on gated
 * projects (metadata.kind === "PROJECT_APPROVAL"). Returns null when the
 * item is not a project approval so other GENERAL items pass through.
 */
export async function applyProjectApprovalDecision(
  metadata: Record<string, unknown> | undefined,
  decision: "APPROVED" | "REJECTED"
): Promise<ProjectApprovalDecisionResult | null> {
  if (!metadata || metadata.kind !== "PROJECT_APPROVAL") return null;
  const projectId = String(metadata.projectId || "");
  if (!projectId) {
    return { ok: false, projectId: "", unblockedActions: 0, reason: "لا يوجد projectId في بيانات الاعتماد." };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, projectId, unblockedActions: 0, reason: "يتطلب تفعيل المشروع اتصال Supabase." };
  }

  if (decision === "APPROVED") {
    const { data: projectRow, error: readError } = await supabase
      .from("projects")
      .select("id,budget")
      .eq("id", projectId)
      .single();
    if (readError) throw readError;

    const { error: projectError } = await supabase
      .from("projects")
      .update({ approval_status: "APPROVED", approved_budget: projectRow?.budget ?? 0 })
      .eq("id", projectId);
    if (projectError) throw projectError;

    const { data: unblocked, error: actionsError } = await supabase
      .from("business_actions")
      .update({ status: "QUEUED", approval_status: "APPROVED" })
      .eq("project_id", projectId)
      .eq("status", "WAITING_APPROVAL")
      .select("id");
    if (actionsError) throw actionsError;

    invalidateCache("dashboard-data");
    return {
      ok: true,
      projectId,
      unblockedActions: unblocked?.length ?? 0,
      reason: `تم تفعيل المشروع وفك حجز ${unblocked?.length ?? 0} إجراء من قائمة التنفيذ.`,
    };
  }

  const { error: projectError } = await supabase
    .from("projects")
    .update({ approval_status: "REJECTED", status: "ON_HOLD" })
    .eq("id", projectId);
  if (projectError) throw projectError;

  const { data: cancelled, error: actionsError } = await supabase
    .from("business_actions")
    .update({ status: "CANCELLED", approval_status: "REJECTED" })
    .eq("project_id", projectId)
    .eq("status", "WAITING_APPROVAL")
    .select("id");
  if (actionsError) throw actionsError;

  invalidateCache("dashboard-data");
  return {
    ok: true,
    projectId,
    unblockedActions: 0,
    reason: `تم رفض المشروع وإيقافه، وأُلغي ${cancelled?.length ?? 0} إجراء كان بانتظار الاعتماد.`,
  };
}

export async function getDashboardData() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      projects: [],
      tasks: [],
      decisions: [],
      alerts: [],
      kpis: [],
      actions: [],
      approvals: [],
      memory: [],
    };
  }

  const [projects, tasks, decisions, alerts, kpis, actions, approvals, memory] = await Promise.all([
    supabase.from("projects").select("*").order("created_at", { ascending: false }).limit(20),
    supabase
      .from("tasks")
      .select("id,project_id,title,content,description,status,priority,created_at,due_date,progress_percent,owner_role,kpi_name,kpi_target")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("financial_decisions").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.from("business_alerts").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.from("business_kpis").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.from("business_actions").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("company_approvals").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.from("business_memory").select("*").order("created_at", { ascending: false }).limit(20),
  ]);

  if (projects.error) throw projects.error;
  if (tasks.error) throw tasks.error;
  if (decisions.error) throw decisions.error;
  if (alerts.error) throw alerts.error;
  if (kpis.error) throw kpis.error;
  if (actions.error) throw actions.error;
  if (approvals.error) throw approvals.error;
  if (memory.error) throw memory.error;

  return {
    projects: projects.data || [],
    tasks: tasks.data || [],
    decisions: decisions.data || [],
    alerts: alerts.data || [],
    kpis: kpis.data || [],
    actions: actions.data || [],
    // Unified decision-center rows, with legacy-shape aliases so existing
    // dashboard consumers (entity_type/entity_id/notes) keep rendering.
    approvals: (approvals.data || []).map((row: Record<string, unknown>) => ({
      ...row,
      entity_type: row.type ?? "GENERAL",
      entity_id: String((row.metadata as Record<string, unknown> | null)?.projectId ?? row.id),
      notes: row.detail ?? null,
    })),
    memory: memory.data || [],
  };
}
