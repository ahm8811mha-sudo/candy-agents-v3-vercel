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
import { effectiveTier } from "./company/governance";
import { createExecutionBundle } from "./company/executionRepository";
import { randomUUID } from "node:crypto";

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
  workflowInstanceId?: string;
  correlationId?: string;
  idempotent?: boolean;
};

export type CompanyExecutionOptions = {
  idempotencyKey?: string;
  actorId?: string;
  actorRole?: string;
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
  ceo: string,
  financials: Financials,
  cfo: string,
  options: CompanyExecutionOptions
) {
  const projectName = request.trim().slice(0, 120);
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    const project = {
      id: newId("project"),
      name: projectName,
      status: intelligence.approval.gate === "AUTO" ? "ACTIVE" : "PENDING_APPROVAL",
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

  const projectRequiresApproval = intelligence.approval.gate !== "AUTO";
  const tier = projectRequiresApproval
    ? effectiveTier(intelligence.requestedBudget, intelligence.riskLevel)
    : null;
  const execution = await createExecutionBundle({
    source: "company-execution",
    idempotencyKey: options.idempotencyKey || randomUUID(),
    actorId: options.actorId || "businessBrain",
    actorRole: options.actorRole,
    project: {
      name: projectName,
      request: request.trim(),
      status: projectRequiresApproval ? "PENDING_APPROVAL" : "ACTIVE",
      budget: intelligence.requestedBudget,
      approvedBudget: projectRequiresApproval ? 0 : intelligence.requestedBudget,
      healthScore: intelligence.healthScore,
      riskLevel: intelligence.riskLevel,
      approvalStatus: projectRequiresApproval ? "PENDING" : "APPROVED",
      strategicDirection: intelligence.actionToday,
      financialSnapshot: {
        requestedBudget: intelligence.requestedBudget,
        healthScore: intelligence.healthScore,
        riskLevel: intelligence.riskLevel,
        confidence: intelligence.confidence,
        assumptions: intelligence.assumptions,
        evidence: intelligence.evidence,
        approval: intelligence.approval,
      },
      nextReviewAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    },
    tasks: blueprint.tasks.map((task) => ({
      title: task.title,
      description: task.content,
      content: task.content,
      status: projectRequiresApproval ? "BLOCKED" : "TODO",
      priority: task.priority,
      ownerRole: task.ownerRole,
      kpiName: task.kpiName,
      kpiTarget: task.kpiTarget,
      dueDate: new Date(Date.now() + task.dueDays * 86_400_000).toISOString(),
    })),
    kpis: blueprint.kpis.map((kpi) => ({
      name: kpi.name,
      target: kpi.target,
      current: 0,
      unit: kpi.unit,
      status: kpi.status,
      dueDate: new Date(Date.now() + kpi.dueDays * 86_400_000).toISOString(),
    })),
    actions: blueprint.actions.map((action) => {
      const requiresApproval = projectRequiresApproval || action.requiresApproval;
      return {
        actionType: action.actionType,
        title: action.title,
        description: action.description,
        status: normalizeActionInitialStatus({
          requiresApproval,
          executionMode: action.executionMode,
          approvalStatus: requiresApproval ? "PENDING" : "NOT_REQUIRED",
        }),
        executionMode: action.executionMode,
        provider: action.provider || "internal",
        requiresApproval,
        approvalStatus: requiresApproval ? "PENDING" : "NOT_REQUIRED",
        payload: buildActionPayload(action, request, intelligence),
      };
    }),
    alerts: intelligence.alerts.map((alert) => ({
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      source: alert.source,
      metadata: alert.metadata || {},
    })),
    memory: {
      eventType: "COMPANY_EXECUTION",
      title: projectName,
      summary: `قرار: ${intelligence.actionToday}\n\n${ceo.slice(0, 1200)}`,
      decisionQuality: intelligence.riskLevel === "LOW" ? "PROMISING" : "WATCH",
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
    },
    financialDecision: {
      request: request.trim(),
      financials: financials as unknown as Record<string, unknown>,
      cfoReport: cfo,
      ceoDecision: ceo,
    },
    approval: tier
      ? {
          title: `اعتماد مشروع التنفيذ: ${projectName}`,
          detail: intelligence.approval.reason,
          amount: intelligence.requestedBudget || undefined,
          requestedRole: tier.approver,
          tier: tier.tier,
          riskLevel: intelligence.riskLevel,
        }
      : undefined,
    audit: {
      action: "EXECUTION_BUNDLE_CREATED",
      detail: `تم إنشاء مشروع التنفيذ «${projectName}» مع المهام والمؤشرات والإجراءات في معاملة واحدة.`,
      tier: tier?.tier,
      metadata: {
        requestedBudget: intelligence.requestedBudget,
        riskLevel: intelligence.riskLevel,
        approvalRequired: projectRequiresApproval,
      },
    },
  });

  const project = execution.project as ExecutionProject;
  const tasksCreated = execution.tasks as ExecutionTask[];
  const kpis = execution.kpis as ExecutionKpi[];
  const approval: ExecutionApproval | null = execution.approval && tier
    ? {
        id: execution.approval.id,
        entity_type: `${tier.tier}_PROJECT_APPROVAL`,
        entity_id: String(project.id),
        status: execution.approval.status,
        notes: execution.approval.detail,
      }
    : null;

  return {
    project,
    task: tasksCreated[0],
    tasksCreated,
    kpis,
    approval,
    saved: true,
    workflowInstanceId: execution.workflowInstanceId,
    correlationId: execution.correlationId,
    idempotent: execution.idempotent,
  };
}

export async function runCompanyExecution(
  request: string,
  options: CompanyExecutionOptions = {}
): Promise<CompanyExecutionResult> {
  if (!request?.trim()) {
    throw new Error("نص الطلب مطلوب.");
  }

  const financials = await calculateFinancials();
  const intelligence = evaluateBusiness(request.trim(), financials);
  const memoryContext = await getMemoryContext(request.trim());
  const cfo = await CFO(request.trim() + memoryContext, financials, intelligence);
  const ceo = await CEO(cfo, intelligence);
  const tasks = await generateTasks(ceo);
  const blueprint = buildExecutionBlueprint(request.trim(), intelligence);
  const {
    project,
    task,
    tasksCreated,
    kpis,
    approval,
    saved,
    workflowInstanceId,
    correlationId,
    idempotent,
  } = await createProjectFlow(
    request.trim(),
    tasks,
    intelligence,
    blueprint,
    ceo,
    financials,
    cfo,
    options
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
    workflowInstanceId,
    correlationId,
    idempotent,
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
    approvals: approvals.data || [],
    memory: memory.data || [],
  };
}
