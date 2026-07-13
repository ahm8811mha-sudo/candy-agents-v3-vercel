import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "../supabase";

export type CompanySnapshot = {
  tenantId: string;
  generatedAt: string;
  metrics: {
    openDecisions: number;
    activeWorkflows: number;
    failedIntegrations: number;
    openCriticalAlerts: number;
    governmentDocuments: number;
    postedJournalEntries: number;
  };
  risks: IntelligenceSignal[];
  opportunities: IntelligenceSignal[];
  freshness: Record<string, string>;
};

export type IntelligenceSignal = {
  code: string;
  title: string;
  detail: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence: number;
  evidence: Record<string, unknown>;
};

export type DecisionRecommendation = {
  type: string;
  title: string;
  rationale: string;
  confidence: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  expectedImpact: Record<string, unknown>;
  alternatives: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
};

export type SimulationInput = {
  name: string;
  scenarioType: string;
  baseline: {
    monthlyRevenue: number;
    monthlyPayroll: number;
    monthlyOperatingExpenses: number;
    cashBalance?: number;
  };
  assumptions: {
    revenueGrowthPct?: number;
    salaryChangePct?: number;
    operatingExpenseChangePct?: number;
    fxImpactPct?: number;
    fixedInvestment?: number;
    addedMonthlyRevenue?: number;
    horizonMonths?: number;
  };
};

export type SimulationResult = {
  name: string;
  scenarioType: string;
  baselineMonthlyProfit: number;
  projectedMonthlyRevenue: number;
  projectedMonthlyPayroll: number;
  projectedMonthlyOperatingExpenses: number;
  projectedMonthlyProfit: number;
  profitDelta: number;
  cashImpactAtHorizon: number;
  breakEvenMonths: number | null;
  horizonMonths: number;
  confidence: number;
  sensitivity: Record<string, number>;
  limitations: string[];
};

export type PlanInput = {
  goal: string;
  goalType?: string;
  horizonDays?: number;
  budgetLimit?: number;
  owner?: string;
  assumptions?: Record<string, unknown>;
};

export type AutonomousPlan = {
  goal: string;
  goalType: string;
  phases: Array<{
    name: string;
    objective: string;
    durationDays: number;
    deliverables: string[];
    tasks: Array<{ title: string; priority: "HIGH" | "MEDIUM" | "LOW"; owner: string; doneWhen: string }>;
  }>;
  timeline: { horizonDays: number; milestones: Array<{ day: number; title: string }> };
  budget: { limit: number | null; allocation: Record<string, number> };
  risks: Array<{ risk: string; likelihood: "LOW" | "MEDIUM" | "HIGH"; mitigation: string }>;
  kpis: Array<{ name: string; target: string; cadence: string }>;
  approvalRequired: true;
};

export type LearningInput = {
  subjectType: string;
  subjectId: string;
  eventType: string;
  expected?: Record<string, unknown>;
  actual?: Record<string, unknown>;
  outcomeScore?: number;
  lessons?: string[];
  featureUpdates?: Record<string, unknown>;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function asCount(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function countRows(
  table: string,
  tenantId: string,
  configure?: (query: any) => any
): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  let query = supabase.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  if (configure) query = configure(query);
  const { count, error } = await query;
  if (error) {
    console.error("[orvanta:company-brain] count failed", { table, error: error.message });
    return 0;
  }
  return count || 0;
}

export async function buildCompanySnapshot(tenantId: string): Promise<CompanySnapshot> {
  const [openDecisions, activeWorkflows, failedIntegrations, openCriticalAlerts, governmentDocuments, postedJournalEntries] = await Promise.all([
    countRows("company_decisions", tenantId, (query) => query.in("status", ["DRAFT", "PENDING", "AWAITING_APPROVAL"])),
    countRows("workflow_instances", tenantId, (query) => query.in("status", ["READY", "RUNNING", "WAITING", "RETRYING"])),
    countRows("integration_attempts", tenantId, (query) => query.in("status", ["FAILED", "DEAD_LETTER", "RETRYING"])),
    countRows("system_alerts", tenantId, (query) => query.eq("status", "OPEN").in("severity", ["HIGH", "CRITICAL"])),
    countRows("gov_documents", tenantId),
    countRows("accounting_journal_entries", tenantId, (query) => query.eq("status", "POSTED")),
  ]);

  const metrics = {
    openDecisions,
    activeWorkflows,
    failedIntegrations,
    openCriticalAlerts,
    governmentDocuments,
    postedJournalEntries,
  };

  const risks: IntelligenceSignal[] = [];
  const opportunities: IntelligenceSignal[] = [];

  if (openCriticalAlerts > 0) {
    risks.push({
      code: "CRITICAL_ALERTS_OPEN",
      title: "توجد تنبيهات تشغيلية عالية الخطورة",
      detail: `يوجد ${openCriticalAlerts} تنبيهًا عاليًا أو حرجًا لم يُحل بعد.`,
      severity: openCriticalAlerts >= 3 ? "CRITICAL" : "HIGH",
      confidence: 0.98,
      evidence: { openCriticalAlerts },
    });
  }
  if (failedIntegrations > 0) {
    risks.push({
      code: "INTEGRATION_FAILURES",
      title: "عمليات تكامل تحتاج تدخلًا",
      detail: `يوجد ${failedIntegrations} محاولة تكامل فاشلة أو قيد الإعادة.`,
      severity: failedIntegrations >= 5 ? "CRITICAL" : "HIGH",
      confidence: 0.97,
      evidence: { failedIntegrations },
    });
  }
  if (activeWorkflows > 0 && openDecisions === 0) {
    opportunities.push({
      code: "EXECUTION_MOMENTUM",
      title: "التركيز على إغلاق التنفيذ الحالي",
      detail: `لا توجد قرارات معلقة بينما يوجد ${activeWorkflows} مسارًا نشطًا؛ يمكن رفع معدل الإنجاز بإغلاقها قبل فتح مبادرات جديدة.`,
      severity: "LOW",
      confidence: 0.78,
      evidence: { activeWorkflows, openDecisions },
    });
  }
  if (governmentDocuments > 0) {
    opportunities.push({
      code: "GOVERNMENT_AUTOMATION_READY",
      title: "توفر بيانات لبناء متابعة حكومية استباقية",
      detail: `يوجد ${governmentDocuments} مستندًا حكوميًا يمكن ربطه بالتجديدات والمواعيد والتنبيهات.`,
      severity: "LOW",
      confidence: 0.72,
      evidence: { governmentDocuments },
    });
  }
  if (postedJournalEntries === 0) {
    risks.push({
      code: "FINANCIAL_DATA_GAP",
      title: "لا توجد قيود مالية مرحلة كافية",
      detail: "لا يمكن لمحرك القرار المالي تقديم توصيات موثوقة قبل وجود بيانات فعلية في دفتر القيود.",
      severity: "MEDIUM",
      confidence: 0.99,
      evidence: { postedJournalEntries },
    });
  }

  const generatedAt = new Date().toISOString();
  return {
    tenantId,
    generatedAt,
    metrics,
    risks,
    opportunities,
    freshness: {
      decisions: generatedAt,
      workflows: generatedAt,
      integrations: generatedAt,
      alerts: generatedAt,
      government: generatedAt,
      accounting: generatedAt,
    },
  };
}

export function generateRecommendations(snapshot: CompanySnapshot): DecisionRecommendation[] {
  const recommendations: DecisionRecommendation[] = [];

  for (const risk of snapshot.risks) {
    if (risk.code === "CRITICAL_ALERTS_OPEN") {
      recommendations.push({
        type: "OPERATIONAL_STABILIZATION",
        title: "جمّد المبادرات الجديدة حتى إغلاق التنبيهات الحرجة",
        rationale: "فتح أعمال جديدة أثناء وجود أعطال حرجة يزيد تراكم المخاطر ويخفض موثوقية التنفيذ.",
        confidence: 0.94,
        riskLevel: "CRITICAL",
        expectedImpact: { operationalRiskReduction: "HIGH", timeToValue: "IMMEDIATE" },
        alternatives: [{ action: "تعيين مالك لكل تنبيه مع مهلة أربع ساعات" }],
        evidence: [risk.evidence],
      });
    }
    if (risk.code === "INTEGRATION_FAILURES") {
      recommendations.push({
        type: "INTEGRATION_RECOVERY",
        title: "أوقف إعادة التنفيذ غير المؤكدة وراجع Dead Letter أولًا",
        rationale: "إعادة العمليات الخارجية دون تحقق من الإيصالات قد تنشئ رسائل أو ملفات أو معاملات مكررة.",
        confidence: 0.96,
        riskLevel: risk.severity === "CRITICAL" ? "CRITICAL" : "HIGH",
        expectedImpact: { duplicatePrevention: true, reliability: "HIGH" },
        alternatives: [{ action: "تحويل العمليات المشكوك في نجاحها إلى HUMAN_CHECKPOINT" }],
        evidence: [risk.evidence],
      });
    }
    if (risk.code === "FINANCIAL_DATA_GAP") {
      recommendations.push({
        type: "DATA_QUALITY",
        title: "أدخل بيانات مالية فعلية قبل اتخاذ قرارات مالية تنبؤية",
        rationale: "غياب القيود المرحلة يجعل المحاكاة المالية مبنية على افتراضات فقط.",
        confidence: 0.99,
        riskLevel: "MEDIUM",
        expectedImpact: { decisionQuality: "HIGH" },
        alternatives: [{ action: "استيراد ميزان افتتاحي وحركات آخر ثلاثة أشهر" }],
        evidence: [risk.evidence],
      });
    }
  }

  if (snapshot.metrics.openDecisions >= 5) {
    recommendations.push({
      type: "DECISION_BACKLOG",
      title: "عالج تراكم القرارات حسب الأثر والمخاطر",
      rationale: `يوجد ${snapshot.metrics.openDecisions} قرارات مفتوحة؛ التأخير قد يعطل التنفيذ ويرفع تكلفة الفرصة البديلة.`,
      confidence: 0.82,
      riskLevel: "HIGH",
      expectedImpact: { cycleTimeReduction: "MEDIUM" },
      alternatives: [{ action: "جلسة قرار يومية لمدة 20 دقيقة" }],
      evidence: [{ openDecisions: snapshot.metrics.openDecisions }],
    });
  }

  return recommendations;
}

export function runSimulation(input: SimulationInput): SimulationResult {
  const horizonMonths = clamp(Math.trunc(input.assumptions.horizonMonths || 12), 1, 60);
  const revenueGrowth = (input.assumptions.revenueGrowthPct || 0) / 100;
  const salaryChange = (input.assumptions.salaryChangePct || 0) / 100;
  const opexChange = (input.assumptions.operatingExpenseChangePct || 0) / 100;
  const fxImpact = (input.assumptions.fxImpactPct || 0) / 100;
  const fixedInvestment = Math.max(0, input.assumptions.fixedInvestment || 0);
  const addedMonthlyRevenue = input.assumptions.addedMonthlyRevenue || 0;

  const baselineMonthlyProfit =
    input.baseline.monthlyRevenue - input.baseline.monthlyPayroll - input.baseline.monthlyOperatingExpenses;
  const projectedMonthlyRevenue =
    input.baseline.monthlyRevenue * (1 + revenueGrowth) * (1 + fxImpact) + addedMonthlyRevenue;
  const projectedMonthlyPayroll = input.baseline.monthlyPayroll * (1 + salaryChange);
  const projectedMonthlyOperatingExpenses = input.baseline.monthlyOperatingExpenses * (1 + opexChange);
  const projectedMonthlyProfit = projectedMonthlyRevenue - projectedMonthlyPayroll - projectedMonthlyOperatingExpenses;
  const profitDelta = projectedMonthlyProfit - baselineMonthlyProfit;
  const cashImpactAtHorizon = profitDelta * horizonMonths - fixedInvestment;
  const breakEvenMonths = profitDelta > 0 && fixedInvestment > 0 ? Math.ceil(fixedInvestment / profitDelta) : fixedInvestment === 0 ? 0 : null;

  const assumptionCount = Object.values(input.assumptions).filter((value) => value !== undefined).length;
  const confidence = clamp(0.45 + assumptionCount * 0.05, 0.45, 0.82);

  return {
    name: input.name,
    scenarioType: input.scenarioType,
    baselineMonthlyProfit,
    projectedMonthlyRevenue,
    projectedMonthlyPayroll,
    projectedMonthlyOperatingExpenses,
    projectedMonthlyProfit,
    profitDelta,
    cashImpactAtHorizon,
    breakEvenMonths,
    horizonMonths,
    confidence,
    sensitivity: {
      revenueGrowthPct: projectedMonthlyRevenue * 0.01,
      salaryChangePct: projectedMonthlyPayroll * -0.01,
      operatingExpenseChangePct: projectedMonthlyOperatingExpenses * -0.01,
    },
    limitations: [
      "المحاكاة خطية ولا تفترض تغير سلوك العملاء أو المنافسين.",
      "النتيجة تعتمد على صحة خط الأساس والافتراضات المدخلة.",
      "يجب اعتماد القرار بشريًا قبل التنفيذ المالي أو التعاقدي.",
    ],
  };
}

export function createAutonomousPlan(input: PlanInput): AutonomousPlan {
  const horizonDays = clamp(Math.trunc(input.horizonDays || 90), 14, 365);
  const owner = input.owner || "المالك";
  const phaseDurations = [0.2, 0.25, 0.35, 0.2].map((ratio) => Math.max(3, Math.round(horizonDays * ratio)));
  const phaseNames = ["التحليل والتصميم", "التجهيز والاعتماد", "التنفيذ والقياس", "التثبيت والتعلم"];
  const objectives = [
    "تحويل الهدف إلى نطاق واضح وخط أساس ومخاطر قابلة للقياس.",
    "تجهيز الموارد والميزانية والموافقات والتكاملات اللازمة.",
    "تنفيذ الخطة على دفعات قصيرة مع قياس الأثر أسبوعيًا.",
    "تثبيت النتائج وتوثيق الدروس وتحويلها إلى معرفة مؤسسية.",
  ];

  let elapsed = 0;
  const phases = phaseNames.map((name, index) => {
    const durationDays = phaseDurations[index];
    elapsed += durationDays;
    return {
      name,
      objective: objectives[index],
      durationDays,
      deliverables: [
        index === 0 ? "وثيقة نطاق وخط أساس" : index === 1 ? "خطة معتمدة وموارد جاهزة" : index === 2 ? "نتائج تنفيذ قابلة للقياس" : "تقرير ختامي ودروس مستفادة",
      ],
      tasks: [
        {
          title: index === 0 ? "جمع البيانات وتحديد خط الأساس" : index === 1 ? "اعتماد الميزانية والمسؤوليات" : index === 2 ? "تنفيذ دفعة العمل وقياس KPI" : "تسجيل النتائج في Company Brain",
          priority: "HIGH" as const,
          owner,
          doneWhen: index === 0 ? "توثيق المقاييس الحالية والمصادر" : index === 1 ? "اكتمال الاعتمادات والموارد" : index === 2 ? "تحقق مخرجات قابلة للإثبات" : "تسجيل outcome وال lessons",
        },
        {
          title: index === 0 ? "تحليل المخاطر والافتراضات" : index === 1 ? "إنشاء الجدول التنفيذي" : index === 2 ? "مراجعة الانحرافات أسبوعيًا" : "تحديث السياسات والقوالب",
          priority: "MEDIUM" as const,
          owner,
          doneWhen: "وجود سجل تدقيق ومخرج محفوظ",
        },
      ],
    };
  });

  const budgetLimit = input.budgetLimit && input.budgetLimit > 0 ? input.budgetLimit : null;
  return {
    goal: input.goal.trim(),
    goalType: input.goalType || "BUSINESS",
    phases,
    timeline: {
      horizonDays,
      milestones: phases.map((phase, index) => ({
        day: phaseDurations.slice(0, index + 1).reduce((sum, value) => sum + value, 0),
        title: `اكتمال: ${phase.name}`,
      })),
    },
    budget: {
      limit: budgetLimit,
      allocation: budgetLimit
        ? { analysis: budgetLimit * 0.1, setup: budgetLimit * 0.2, execution: budgetLimit * 0.6, contingency: budgetLimit * 0.1 }
        : {},
    },
    risks: [
      { risk: "نقص البيانات أو ضعف جودتها", likelihood: "MEDIUM", mitigation: "إيقاف أي توصية منخفضة الثقة وطلب استكمال البيانات" },
      { risk: "اتساع النطاق أثناء التنفيذ", likelihood: "HIGH", mitigation: "اعتماد أي تغيير نطاق قبل إضافته" },
      { risk: "فشل تكامل خارجي", likelihood: "MEDIUM", mitigation: "Idempotency وReceipt وDead Letter وHuman Checkpoint" },
    ],
    kpis: [
      { name: "نسبة إنجاز الخطة", target: "≥ 90% ضمن الأفق", cadence: "أسبوعي" },
      { name: "الانحراف عن الميزانية", target: "≤ 10%", cadence: "أسبوعي" },
      { name: "الإجراءات ذات إثبات تنفيذ", target: "100%", cadence: "يومي" },
      { name: "الدروس المسجلة", target: "درس واحد على الأقل لكل مرحلة", cadence: "نهاية المرحلة" },
    ],
    approvalRequired: true,
  };
}

export function createExecutiveNarrative(snapshot: CompanySnapshot, recommendations: DecisionRecommendation[]) {
  const riskSummary = snapshot.risks.length
    ? `توجد ${snapshot.risks.length} إشارة مخاطر، أهمها: ${snapshot.risks.slice(0, 2).map((risk) => risk.title).join("، ")}.`
    : "لا توجد إشارات مخاطر عالية في البيانات الحالية.";
  const executionSummary = `يوجد ${snapshot.metrics.activeWorkflows} مسار تنفيذ نشط و${snapshot.metrics.openDecisions} قرار مفتوح.`;
  const recommendationSummary = recommendations.length
    ? `الأولوية المقترحة: ${recommendations[0].title}.`
    : "لا توجد توصية حرجة جديدة؛ حافظ على الإيقاع الحالي وراقب جودة البيانات.";

  return {
    headline: snapshot.metrics.openCriticalAlerts > 0 ? "الأولوية للاستقرار التشغيلي قبل التوسع" : "الشركة مستقرة نسبيًا مع فرص لتحسين سرعة التنفيذ",
    narrative: `${executionSummary} ${riskSummary} ${recommendationSummary}`,
    drivers: [
      { metric: "activeWorkflows", value: snapshot.metrics.activeWorkflows },
      { metric: "openDecisions", value: snapshot.metrics.openDecisions },
      { metric: "failedIntegrations", value: snapshot.metrics.failedIntegrations },
    ],
    risks: snapshot.risks,
    recommendedActions: recommendations.slice(0, 5),
    confidence: clamp(0.55 + Object.values(snapshot.metrics).filter((value) => asCount(value) > 0).length * 0.04, 0.55, 0.83),
  };
}

export async function persistSnapshot(snapshot: CompanySnapshot) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("company_intelligence_snapshots")
    .insert({
      tenant_id: snapshot.tenantId,
      snapshot_type: "COMPANY",
      period_end: snapshot.generatedAt,
      metrics: snapshot.metrics,
      risks: snapshot.risks,
      opportunities: snapshot.opportunities,
      freshness: snapshot.freshness,
    })
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}

export async function persistRecommendations(tenantId: string, recommendations: DecisionRecommendation[]) {
  if (!recommendations.length) return [];
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("decision_recommendations")
    .insert(
      recommendations.map((item) => ({
        id: randomUUID(),
        tenant_id: tenantId,
        recommendation_type: item.type,
        title: item.title,
        rationale: item.rationale,
        confidence: item.confidence,
        risk_level: item.riskLevel,
        expected_impact: item.expectedImpact,
        alternatives: item.alternatives,
        evidence: item.evidence,
      }))
    )
    .select("id");
  if (error) throw error;
  return (data || []).map((row) => String(row.id));
}

export async function persistSimulation(tenantId: string, actorId: string, input: SimulationInput, result: SimulationResult) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("simulation_runs")
    .insert({
      tenant_id: tenantId,
      name: input.name,
      scenario_type: input.scenarioType,
      baseline: input.baseline,
      assumptions: input.assumptions,
      results: result,
      confidence: result.confidence,
      sensitivity: result.sensitivity,
      limitations: result.limitations,
      created_by: actorId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}

export async function persistPlan(tenantId: string, actorId: string, input: PlanInput, plan: AutonomousPlan) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("autonomous_plans")
    .insert({
      tenant_id: tenantId,
      goal: input.goal,
      goal_type: plan.goalType,
      assumptions: input.assumptions || {},
      plan,
      budget: plan.budget,
      timeline: plan.timeline,
      risks: plan.risks,
      kpis: plan.kpis,
      status: "AWAITING_APPROVAL",
      created_by: actorId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}

export async function recordLearningEvent(tenantId: string, input: LearningInput) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("company_learning_events")
    .insert({
      tenant_id: tenantId,
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      event_type: input.eventType,
      expected: input.expected || {},
      actual: input.actual || {},
      outcome_score: input.outcomeScore ?? null,
      lessons: input.lessons || [],
      feature_updates: input.featureUpdates || {},
      source: "company-brain",
    })
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}

export async function upsertKnowledgeNode(input: {
  tenantId: string;
  entityType: string;
  entityId: string;
  title: string;
  summary?: string;
  attributes?: Record<string, unknown>;
  source?: string;
  confidence?: number;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("company_knowledge_nodes")
    .upsert(
      {
        tenant_id: input.tenantId,
        entity_type: input.entityType,
        entity_id: input.entityId,
        title: input.title,
        summary: input.summary || null,
        attributes: input.attributes || {},
        source: input.source || "system",
        confidence: clamp(input.confidence ?? 1, 0, 1),
        observed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,entity_type,entity_id" }
    )
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}

export async function linkKnowledgeNodes(input: {
  tenantId: string;
  fromNodeId: string;
  toNodeId: string;
  relationType: string;
  strength?: number;
  evidence?: unknown[];
  source?: string;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("company_knowledge_edges")
    .upsert(
      {
        tenant_id: input.tenantId,
        from_node_id: input.fromNodeId,
        to_node_id: input.toNodeId,
        relation_type: input.relationType,
        strength: clamp(input.strength ?? 1, 0, 1),
        evidence: input.evidence || [],
        source: input.source || "system",
        observed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,from_node_id,to_node_id,relation_type" }
    )
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}
