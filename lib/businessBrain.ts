import type { Financials } from "./accountingSystem";

export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type BusinessAlert = {
  severity: Severity;
  title: string;
  message: string;
  source: string;
  metadata?: Record<string, unknown>;
};

export type DecisionEvidence = {
  source: "financials" | "request" | "rules_engine" | "approval_matrix" | "memory" | "integration";
  type: "metric" | "text" | "rule" | "system";
  summary: string;
  metadata?: Record<string, unknown>;
};

export type RecommendedAction = {
  actionType: string;
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  provider?: string;
  executionMode: "INTERNAL" | "READY_FOR_INTEGRATION";
  requiresApproval: boolean;
  confidence: number;
  assumptions: string[];
  evidence: DecisionEvidence[];
  blockedBy?: string[];
};

export type ApprovalPolicy = {
  budget: number;
  gate: "AUTO" | "CEO" | "OWNER" | "RISK";
  requiredRole: "NONE" | "CEO" | "OWNER" | "RISK_AGENT";
  reason: string;
};

export type BusinessIntelligence = {
  requestedBudget: number;
  healthScore: number;
  profitMargin: number;
  expenseRatio: number;
  burnRate: number;
  runwayMonths: number;
  riskLevel: RiskLevel;
  actionToday: string;
  approval: ApprovalPolicy;
  alerts: BusinessAlert[];
  recommendedActions: RecommendedAction[];
  confidence: number;
  assumptions: string[];
  evidence: DecisionEvidence[];
};

export type ExecutionStep = {
  title: string;
  content: string;
  ownerRole: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dueDays: number;
  kpiName: string;
  kpiTarget: number;
  kpiUnit: string;
};

export type ExecutionBlueprint = {
  tasks: ExecutionStep[];
  kpis: Array<{
    name: string;
    target: number;
    unit: string;
    status: "ON_TRACK" | "WATCH" | "AT_RISK";
    dueDays: number;
  }>;
  actions: RecommendedAction[];
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function normalizeDigits(value: string) {
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  return value
    .split("")
    .map((char) => {
      const arabicIndex = arabic.indexOf(char);
      if (arabicIndex >= 0) return String(arabicIndex);
      const persianIndex = persian.indexOf(char);
      if (persianIndex >= 0) return String(persianIndex);
      return char;
    })
    .join("");
}

export function extractRequestedBudget(request: string) {
  const normalized = normalizeDigits(request).replace(/٬/g, ",");
  const matches = normalized.match(/\d[\d,.]*/g) || [];
  const numbers = matches
    .map((item) => Number(item.replace(/,/g, "")))
    .filter((number) => Number.isFinite(number));

  if (numbers.length === 0) return 0;
  return Math.max(...numbers);
}

function buildBaseEvidence(request: string, financials: Financials, requestedBudget: number): DecisionEvidence[] {
  return [
    {
      source: "request",
      type: "text",
      summary: `نص الطلب الذي بُني عليه القرار: ${request.slice(0, 240)}`,
      metadata: { requestedBudget },
    },
    {
      source: "financials",
      type: "metric",
      summary: `الإيرادات ${financials.income.toLocaleString("ar-SA")} ريال، المصروفات ${financials.expenses.toLocaleString("ar-SA")} ريال، صافي الربح ${financials.profit.toLocaleString("ar-SA")} ريال.`,
      metadata: financials as unknown as Record<string, unknown>,
    },
  ];
}

function buildAssumptions(requestedBudget: number, financials: Financials): string[] {
  const assumptions = [
    "الأرقام المتاحة في النظام هي مصدر القرار الحالي، وقد تتغير بعد ربط بيانات فعلية من المتجر أو المحاسبة.",
    "أي تنفيذ خارجي مثل إعلانات أو واتساب أو متجر يجب أن يمر عبر Action Queue قبل التنفيذ الفعلي.",
  ];
  if (requestedBudget <= 0) assumptions.push("لم يتم رصد ميزانية صريحة في الطلب، لذلك تُعامل الخطة كتجربة محدودة منخفضة التكلفة.");
  if (financials.income <= 0) assumptions.push("لا توجد إيرادات كافية في السجل الحالي، لذلك يجب اعتبار أي توسع تجربة لا مشروع توسع كامل.");
  return assumptions;
}

function scoreConfidence(financials: Financials, requestedBudget: number, alerts: BusinessAlert[]) {
  let score = 74;
  if (financials.transactionCount <= 0) score -= 18;
  if (financials.income <= 0) score -= 14;
  if (requestedBudget <= 0) score -= 8;
  if (alerts.some((alert) => alert.severity === "CRITICAL")) score -= 15;
  if (alerts.some((alert) => alert.severity === "HIGH")) score -= 8;
  return Math.round(clamp(score, 20, 92));
}

function withActionControls(
  action: Omit<RecommendedAction, "confidence" | "assumptions" | "evidence" | "blockedBy">,
  context: {
    confidence: number;
    assumptions: string[];
    evidence: DecisionEvidence[];
    approval: ApprovalPolicy;
  }
): RecommendedAction {
  const blockedBy: string[] = [];
  if (action.executionMode === "READY_FOR_INTEGRATION") blockedBy.push("يتطلب ربط التكامل الخارجي قبل التنفيذ الآلي.");
  if (action.requiresApproval) blockedBy.push(`يتطلب اعتماد ${context.approval.requiredRole} قبل التنفيذ.`);

  return {
    ...action,
    confidence: context.confidence,
    assumptions: context.assumptions,
    evidence: [
      ...context.evidence,
      {
        source: "rules_engine",
        type: "rule",
        summary: `تم توليد الإجراء ${action.actionType} بناءً على قواعد المخاطر والميزانية.` ,
        metadata: { priority: action.priority, executionMode: action.executionMode },
      },
    ],
    blockedBy,
  };
}

export function evaluateBusiness(request: string, financials: Financials): BusinessIntelligence {
  const requestedBudget = extractRequestedBudget(request);
  const income = Number(financials.income) || 0;
  const expenses = Number(financials.expenses) || 0;
  const profit = Number(financials.profit) || 0;
  const expenseRatio = income > 0 ? expenses / income : expenses > 0 ? 1 : 0;
  const profitMargin = income > 0 ? profit / income : 0;
  const burnRate = profit < 0 ? Math.abs(profit) : expenses;
  const runwayMonths = profit < 0 ? clamp(income / Math.max(Math.abs(profit), 1), 0, 24) : 12;

  const healthScore = Math.round(
    clamp(
      55 +
        (income > 0 ? 10 : -15) +
        (profit > 0 ? 20 : -25) +
        profitMargin * 35 -
        (expenseRatio > 0.7 ? 18 : 0) -
        (requestedBudget > 0 && profit > 0 && requestedBudget > profit ? 12 : 0),
      0,
      100
    )
  );

  const alerts: BusinessAlert[] = [];
  if (income <= 0) {
    alerts.push({
      severity: "HIGH",
      title: "لا توجد إيرادات كافية",
      message: "أي توسع تجاري يجب أن يبدأ كتجربة صغيرة إلى أن تظهر مبيعات فعلية.",
      source: "rules_engine",
    });
  }
  if (profit < 0) {
    alerts.push({
      severity: "CRITICAL",
      title: "الشركة تخسر حاليا",
      message: "يجب إيقاف أي مصروف غير مرتبط بإيراد مباشر قبل اعتماد توسع جديد.",
      source: "rules_engine",
      metadata: { profit },
    });
  }
  if (expenseRatio > 0.7) {
    alerts.push({
      severity: "HIGH",
      title: "المصاريف مرتفعة مقارنة بالإيرادات",
      message: "نسبة المصاريف تجاوزت 70% من الإيرادات، ويجب مراجعة بنود الصرف.",
      source: "rules_engine",
      metadata: { expenseRatio },
    });
  }
  if (requestedBudget > 0 && profit > 0 && requestedBudget > profit) {
    alerts.push({
      severity: "MEDIUM",
      title: "الميزانية المطلوبة أعلى من الربح الحالي",
      message: "ينصح بتقسيم الميزانية إلى مراحل وربط كل مرحلة بمؤشر أداء.",
      source: "rules_engine",
      metadata: { requestedBudget, profit },
    });
  }

  const riskLevel: RiskLevel =
    alerts.some((alert) => alert.severity === "CRITICAL") || expenseRatio > 0.85
      ? "HIGH"
      : alerts.some((alert) => alert.severity === "HIGH" || alert.severity === "MEDIUM")
        ? "MEDIUM"
        : "LOW";

  const approval = getApprovalPolicy(requestedBudget, riskLevel, profit);
  const evidence = [
    ...buildBaseEvidence(request, financials, requestedBudget),
    {
      source: "approval_matrix" as const,
      type: "rule" as const,
      summary: `بوابة الاعتماد: ${approval.gate}. السبب: ${approval.reason}`,
      metadata: approval,
    },
  ];
  const assumptions = buildAssumptions(requestedBudget, financials);
  const confidence = scoreConfidence(financials, requestedBudget, alerts);
  const actionToday = chooseActionToday(profit, expenseRatio, requestedBudget, approval.gate);
  const recommendedActions = buildRecommendedActions(request, requestedBudget, approval, riskLevel, {
    confidence,
    assumptions,
    evidence,
  });

  return {
    requestedBudget,
    healthScore,
    profitMargin,
    expenseRatio,
    burnRate,
    runwayMonths,
    riskLevel,
    actionToday,
    approval,
    alerts,
    recommendedActions,
    confidence,
    assumptions,
    evidence,
  };
}

function getApprovalPolicy(budget: number, riskLevel: RiskLevel, profit: number): ApprovalPolicy {
  if (riskLevel === "HIGH" || profit < 0) {
    return {
      budget,
      gate: "RISK",
      requiredRole: "RISK_AGENT",
      reason: "المخاطر المالية مرتفعة، ويجب مراجعة القرار قبل التنفيذ.",
    };
  }

  if (budget <= 0 || budget <= 5000) {
    return {
      budget,
      gate: "AUTO",
      requiredRole: "NONE",
      reason: "الطلب ضمن حد التشغيل التجريبي ويمكن تحويله إلى مهام مباشرة.",
    };
  }

  if (budget <= 25000) {
    return {
      budget,
      gate: "CEO",
      requiredRole: "CEO",
      reason: "الميزانية ضمن شريحة T1 وتحتاج اعتماد CEO Agent قبل الصرف.",
    };
  }

  return {
    budget,
    gate: "OWNER",
    requiredRole: "OWNER",
    reason: "الميزانية تتجاوز صلاحية التشغيل الذاتي وتحتاج اعتماد المالك وربط التنفيذ بمراجعة جدوى.",
  };
}

function chooseActionToday(profit: number, expenseRatio: number, budget: number, gate: ApprovalPolicy["gate"]) {
  if (profit < 0) return "إيقاف المصاريف غير الضرورية وطلب مراجعة مالية قبل أي توسع.";
  if (expenseRatio > 0.7) return "خفض المصاريف التشغيلية أو التسويقية غير المثبتة بعائد.";
  if (gate === "AUTO") return "تشغيل تجربة صغيرة اليوم مع قياس الإيراد والتكلفة خلال أسبوعين.";
  if (gate === "CEO") return "إرسال الطلب لاعتماد CEO ثم تشغيل مرحلة أولى محدودة.";
  if (gate === "OWNER") return "رفع القرار للمالك مع خطة مراحل ومخاطر واضحة قبل الصرف.";
  if (budget > 0) return "تقسيم الميزانية إلى دفعات ومراجعة المخاطر قبل التنفيذ.";
  return "إنشاء مشروع تجريبي وربطه بمؤشرات أداء قابلة للقياس.";
}

function buildRecommendedActions(
  request: string,
  budget: number,
  approval: ApprovalPolicy,
  riskLevel: RiskLevel,
  controls: { confidence: number; assumptions: string[]; evidence: DecisionEvidence[] }
): RecommendedAction[] {
  const requiresApproval = approval.requiredRole !== "NONE";
  const context = { ...controls, approval };
  return [
    withActionControls(
      {
        actionType: "BUDGET_GATE",
        title: "اعتماد الميزانية المرحلية",
        description: approval.reason,
        priority: requiresApproval ? "URGENT" : "HIGH",
        executionMode: "INTERNAL",
        requiresApproval,
      },
      context
    ),
    withActionControls(
      {
        actionType: "PRICING_EXPERIMENT",
        title: "اختبار عرض وسعر أولي",
        description: `تحويل الطلب إلى عرض تجاري قابل للبيع: ${request.slice(0, 120)}`,
        priority: "HIGH",
        executionMode: "INTERNAL",
        requiresApproval: false,
      },
      context
    ),
    withActionControls(
      {
        actionType: "MARKETING_CAMPAIGN_DRAFT",
        title: "تجهيز حملة تسويق تجريبية",
        description: `إعداد حملة محدودة بميزانية لا تتجاوز ${Math.max(1000, Math.round((budget || 5000) * 0.15)).toLocaleString("ar-SA")} ريال.`,
        priority: riskLevel === "HIGH" ? "MEDIUM" : "HIGH",
        provider: "Google Ads / Meta Ads",
        executionMode: "READY_FOR_INTEGRATION",
        requiresApproval,
      },
      context
    ),
    withActionControls(
      {
        actionType: "SUPPLIER_SHORTLIST",
        title: "قائمة موردين ومخزون",
        description: "تجهيز قائمة موردين أو أدوات تشغيل وتقدير تكلفة الوحدة والهامش.",
        priority: "MEDIUM",
        provider: "Supplier sheet",
        executionMode: "READY_FOR_INTEGRATION",
        requiresApproval: false,
      },
      context
    ),
    withActionControls(
      {
        actionType: "SALES_OUTREACH",
        title: "تجهيز رسالة مبيعات",
        description: "إعداد رسالة بريد أو واتساب لاختبار الطلب مع أول شريحة عملاء.",
        priority: "MEDIUM",
        provider: "Email / WhatsApp",
        executionMode: "READY_FOR_INTEGRATION",
        requiresApproval: false,
      },
      context
    ),
  ];
}

export function buildExecutionBlueprint(request: string, intelligence: BusinessIntelligence): ExecutionBlueprint {
  const firstBudget = intelligence.requestedBudget > 0
    ? Math.max(1000, Math.round(intelligence.requestedBudget * 0.25))
    : 5000;

  const tasks: ExecutionStep[] = [
    {
      title: "تحديد نطاق المشروع ومؤشرات النجاح",
      content: `تحويل الطلب إلى نطاق مشروع واضح، وتحديد ما سيتم إطلاقه في المرحلة الأولى: ${request}`,
      ownerRole: "Operations Manager",
      priority: "HIGH",
      dueDays: 2,
      kpiName: "Scope readiness",
      kpiTarget: 100,
      kpiUnit: "%",
    },
    {
      title: "اعتماد الميزانية المرحلية",
      content: `اعتماد ميزانية مرحلة أولى بقيمة تقريبية ${firstBudget.toLocaleString("ar-SA")} ريال حسب بوابة الموافقة: ${intelligence.approval.gate}.`,
      ownerRole: intelligence.approval.requiredRole === "NONE" ? "CFO" : intelligence.approval.requiredRole,
      priority: intelligence.approval.requiredRole === "NONE" ? "HIGH" : "URGENT",
      dueDays: 1,
      kpiName: "Budget approval",
      kpiTarget: 1,
      kpiUnit: "approval",
    },
    {
      title: "اختبار عرض وسعر",
      content: "إعداد عرض تجاري أولي وسعر بيع، ثم قياس اهتمام العملاء قبل التوسع.",
      ownerRole: "Growth Manager",
      priority: "HIGH",
      dueDays: 4,
      kpiName: "Qualified leads",
      kpiTarget: 20,
      kpiUnit: "lead",
    },
    {
      title: "تجهيز حملة تسويق محدودة",
      content: "إعداد حملة صغيرة مع تتبع تكلفة العميل المحتمل ومعدل التحويل قبل زيادة الميزانية.",
      ownerRole: "Marketing Director",
      priority: "HIGH",
      dueDays: 5,
      kpiName: "CAC ceiling",
      kpiTarget: Math.max(50, Math.round(firstBudget / 40)),
      kpiUnit: "SAR",
    },
    {
      title: "تجهيز الموردين والتشغيل",
      content: "تحديد الموردين أو الأدوات المطلوبة، تكلفة الوحدة، الوقت اللازم للتسليم، وخطة التشغيل.",
      ownerRole: "Supply Chain Manager",
      priority: "MEDIUM",
      dueDays: 7,
      kpiName: "Supplier options",
      kpiTarget: 3,
      kpiUnit: "supplier",
    },
    {
      title: "مراجعة CEO بعد التجربة",
      content: "مراجعة النتائج المالية والتشغيلية واتخاذ قرار: توسيع، تعديل، أو إيقاف.",
      ownerRole: "CEO",
      priority: "HIGH",
      dueDays: 14,
      kpiName: "Review completed",
      kpiTarget: 1,
      kpiUnit: "review",
    },
  ];

  return {
    tasks,
    kpis: tasks.map((task) => ({
      name: task.kpiName,
      target: task.kpiTarget,
      unit: task.kpiUnit,
      status: "WATCH",
      dueDays: task.dueDays,
    })),
    actions: intelligence.recommendedActions,
  };
}
