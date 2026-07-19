import { z } from "zod";
import { runAgentStructured } from "../aiStructured";
import { classifyExecutionKind } from "./executionHonesty";

export type SpecialistRole = "MARKET" | "FINANCE" | "OPERATIONS" | "PROCUREMENT" | "RISK";
export type PlanSource = "AI" | "RULE_ENGINE";

export type InitiativeStep = {
  key: string;
  title: string;
  objective: string;
  deliverable: string;
  ownerRole: string;
  startDay: number;
  dueDay: number;
  durationDays: number;
  dependencies: string[];
  kpi: string;
  executionMode: "INTERNAL_AGENT";
};

export type SpecialistPlan = {
  role: SpecialistRole;
  roleLabel: string;
  agentName: string;
  source: PlanSource;
  provider: string;
  model: string;
  status: "READY" | "BASELINE";
  summary: string;
  recommendation: string;
  confidence: number;
  findings: string[];
  assumptions: string[];
  risks: Array<{ risk: string; mitigation: string }>;
  steps: InitiativeStep[];
};

export type InitiativeOption = {
  id: string;
  title: string;
  model: string;
  revenueModel: string;
  setupCost: string;
  timeToSignalDays: number;
  inventoryRisk: "LOW" | "MEDIUM" | "HIGH";
  score: number;
  verdict: "RECOMMENDED" | "SECONDARY" | "DEFER";
};

export type ProductCandidate = {
  category: string;
  customer: string;
  priceHypothesis: string;
  sourcingModel: string;
  reasonToTest: string;
  validationTest: string;
  rejectionRule: string;
};

export type InitiativeExperiment = {
  name: string;
  durationDays: number;
  budgetCap: number;
  hypothesis: string;
  stages: Array<{ dayRange: string; owner: string; work: string; deliverable: string }>;
  successCriteria: string[];
  stopConditions: string[];
};

export type InitiativePlan = {
  version: "initiative-plan-v1";
  title: string;
  request: string;
  kind: "AMAZON_COMMERCE" | "GENERAL_INITIATIVE";
  generatedAt: string;
  planningMode: "AI_ASSISTED" | "HYBRID" | "RULE_ENGINE";
  decision: "GO_CONDITIONAL" | "HOLD" | "STOP";
  finalRecommendation: string;
  rationale: string[];
  plannedBudget: number;
  durationDays: number;
  specialistPlans: SpecialistPlan[];
  options: InitiativeOption[];
  productCandidates: ProductCandidate[];
  experiment: InitiativeExperiment;
  limitations: string[];
};

export type InitiativeBlueprint = {
  tasks: Array<{
    title: string;
    description: string;
    content: string;
    status: string;
    priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    ownerRole: string;
    kpiName: string;
    kpiTarget: number;
    dueDate: string;
    metadata: Record<string, unknown>;
  }>;
  kpis: Array<{ name: string; target: number; current: number; unit: string; status: "WATCH"; dueDate: string }>;
  actions: Array<{
    actionType: "AGENT_DELIVERABLE";
    title: string;
    description: string;
    status: string;
    executionMode: "INTERNAL";
    provider: "orvanta_agents";
    requiresApproval: boolean;
    approvalStatus: string;
    payload: Record<string, unknown>;
  }>;
};

type PlanningContext = {
  requestedBudget?: number;
  riskLevel?: string;
  financials?: Record<string, unknown>;
  memoryContext?: string;
};

const specialistOutputSchema = z.object({
  summary: z.string().min(20).max(900),
  recommendation: z.string().min(10).max(600),
  confidence: z.number().min(0).max(100),
  findings: z.array(z.string().min(5).max(350)).min(2).max(5),
  assumptions: z.array(z.string().min(3).max(250)).min(1).max(4),
  risks: z.array(z.object({ risk: z.string().min(3).max(240), mitigation: z.string().min(3).max(300) })).min(1).max(4),
  steps: z.array(z.object({
    title: z.string().min(3).max(140),
    objective: z.string().min(8).max(500),
    deliverable: z.string().min(5).max(300),
    startDay: z.number().int().min(1).max(14),
    dueDay: z.number().int().min(1).max(21),
    dependencies: z.array(z.string().max(120)).max(4),
    kpi: z.string().min(3).max(160),
  })).min(2).max(4),
});

type SpecialistOutput = z.infer<typeof specialistOutputSchema>;

const ROLE_CONFIG: Record<SpecialistRole, { label: string; agentName: string; ownerRole: string; brief: string }> = {
  MARKET: { label: "التسويق والنمو", agentName: "market_strategy_agent", ownerRole: "Marketing Director", brief: "اختبر الشرائح وقنوات الوصول وعرض القيمة وفروض الطلب، وقدّم اختبارًا قابلًا للقياس." },
  FINANCE: { label: "المالية والجدوى", agentName: "finance_feasibility_agent", ownerRole: "CFO", brief: "قارن الإيراد والتكلفة والسيولة واقتصاديات الوحدة دون اختلاق أرقام." },
  OPERATIONS: { label: "التشغيل", agentName: "operations_execution_agent", ownerRole: "Operations Manager", brief: "حوّل الفكرة إلى مسار تشغيل ومسؤوليات وتسليمات ومواعيد وضبط جودة." },
  PROCUREMENT: { label: "الموردون والمشتريات", agentName: "procurement_agent", ownerRole: "Supply Chain Manager", brief: "حدّد تأهيل الموردين والعينات ومقارنة العروض وشروط الاستبعاد والتعاقد." },
  RISK: { label: "المخاطر والامتثال", agentName: "risk_agent", ownerRole: "Risk Manager", brief: "حدّد المخاطر وبوابات المنع ومتطلبات التحقق قبل أي صرف أو التزام خارجي." },
};

function isAmazonRequest(request: string) {
  return /amazon|أمازون|امازون|عمولة|مصانع|affiliate/i.test(request);
}

function fallbackOutput(role: SpecialistRole, amazon: boolean): SpecialistOutput {
  const assumption = amazon
    ? "السوق المستهدف المبدئي هو السعودية، ويجب تثبيته قبل أي التزام خارجي."
    : "أي بيانات سوقية أو تكاليف غير مرفقة تعامل كفرضيات حتى يتم التحقق منها.";
  const common = {
    assumptions: [assumption],
    risks: [{ risk: "بيانات خارجية غير مؤكدة", mitigation: "التحقق من مصدر رسمي قبل الصرف أو النشر" }],
  };
  const outputs: Record<SpecialistRole, SpecialistOutput> = {
    MARKET: {
      ...common,
      summary: amazon ? "المسار الأقل مخاطرة هو اختبار خدمة إدارة عرض منتجات المصانع أو الإحالة قبل شراء أي مخزون." : "يبدأ التحقق من المشكلة والعميل والعرض قبل بناء تشغيل كامل.",
      recommendation: "اختبر ثلاث فئات ورسائل مختلفة واعتمد الاهتمام المؤهل لا عدد الزيارات وحده.",
      confidence: 68,
      findings: ["يجب صياغة قيمة منفصلة للمصنع وللمشتري.", "طلب شراء أو تواصل مؤهل أهم من النقرات."],
      steps: [
        { title: "تعريف العميل وعرض القيمة", objective: "تحديد المصنع والعميل والمشكلة التي يحلها العرض.", deliverable: "مصفوفة شرائح ورسائل", startDay: 1, dueDay: 1, dependencies: [], kpi: "3 شرائح موثقة" },
        { title: "إعداد قائمة المنتجات التجريبية", objective: "ترشيح فئات وفق الطلب والهامش وسهولة التشغيل.", deliverable: "جدول منتجات ودرجات ترشيح", startDay: 1, dueDay: 2, dependencies: ["تعريف العميل وعرض القيمة"], kpi: "15 منتجًا أوليًا" },
        { title: "تشغيل اختبار الطلب", objective: "اختبار الرسائل والعروض وقياس الاهتمام المؤهل.", deliverable: "تقرير اختبار الطلب", startDay: 3, dueDay: 7, dependencies: ["إعداد قائمة المنتجات التجريبية"], kpi: "10 إشارات مؤهلة" },
      ],
    },
    FINANCE: {
      ...common,
      summary: "يجب فصل نموذج العمولة والخدمة المُدارة عن شراء المخزون؛ الأول أقل تعرضًا للسيولة وأسرع للتحقق.",
      recommendation: "اعتماد سقف تجربة على دفعتين ومنع شراء المخزون حتى تثبت اقتصاديات الوحدة.",
      confidence: 72,
      findings: ["صافي المساهمة أهم من الإيراد الإجمالي.", "رسوم المنصة والإرجاع والشحن تحتاج تحققًا فعليًا."],
      steps: [
        { title: "مقارنة النماذج المالية", objective: "مقارنة العمولة والخدمة والمخزون عبر التكلفة والسيولة.", deliverable: "جدول جدوى لثلاثة خيارات", startDay: 1, dueDay: 1, dependencies: [], kpi: "3 نماذج مكتملة" },
        { title: "بناء اقتصاديات الوحدة", objective: "حساب نقطة التعادل وهامش المساهمة بنطاقات متحفظة.", deliverable: "نموذج اقتصاديات وحدة", startDay: 2, dueDay: 2, dependencies: ["مقارنة النماذج المالية"], kpi: "سيناريو أساسي ومتحفظ" },
        { title: "تثبيت بوابة الصرف", objective: "تحديد سقف التجربة وشروط تحرير الدفعة التالية.", deliverable: "مذكرة ضبط الميزانية", startDay: 3, dueDay: 3, dependencies: ["بناء اقتصاديات الوحدة"], kpi: "سقف صرف وقاعدة إيقاف" },
      ],
    },
    OPERATIONS: {
      ...common,
      summary: "التشغيل يحتاج مسارًا واحدًا من اختيار المنتج إلى التقرير التنفيذي، مع مالك ومخرج وموعد لكل خطوة.",
      recommendation: "تشغيل تجربة 14 يومًا بلوحة يومية وتسليم تقرير موحد للمكتب التنفيذي.",
      confidence: 82,
      findings: ["كل مهمة يجب أن تنتهي بأثر محفوظ.", "العمل المتوازي يقلل المدة عند تثبيت التبعيات."],
      steps: [
        { title: "إعداد مسار العمل والمسؤوليات", objective: "تحديد التتابع ومن يسلم ماذا للمكتب.", deliverable: "خريطة عمل وRACI", startDay: 1, dueDay: 2, dependencies: [], kpi: "مالك ومخرج لكل مهمة" },
        { title: "إعداد إجراء التشغيل القياسي", objective: "توثيق العرض والطلب والإرجاع والتقرير.", deliverable: "SOP للتجربة", startDay: 2, dueDay: 4, dependencies: ["إعداد مسار العمل والمسؤوليات"], kpi: "مسار كامل" },
        { title: "إعداد لوحة المراجعة", objective: "تجميع التقدم والتعثر والنتائج.", deliverable: "قالب تقرير تنفيذي", startDay: 4, dueDay: 7, dependencies: ["إعداد إجراء التشغيل القياسي"], kpi: "تحديث قابل للتدقيق" },
      ],
    },
    PROCUREMENT: {
      ...common,
      summary: "قبل التعاقد يجب تحويل عروض المصانع إلى بيانات مقارنة: السعر والحد الأدنى والجودة والتوريد والإرجاع.",
      recommendation: "طلب بيانات موحدة من خمسة مصانع ثم تضييقها إلى ثلاثة دون شراء مخزون أولي.",
      confidence: 74,
      findings: ["الأرخص ليس الأفضل إذا رفع الإرجاع.", "لا اعتماد لمورد بلا عينة أو دليل جودة."],
      steps: [
        { title: "بناء بطاقة تأهيل المصنع", objective: "توحيد البيانات ومعايير الاستبعاد.", deliverable: "نموذج تأهيل مورد", startDay: 1, dueDay: 2, dependencies: [], kpi: "10 حقول تحقق" },
        { title: "إعداد مصفوفة مقارنة العروض", objective: "مقارنة السعر والجودة والتسليم والإرجاع.", deliverable: "مصفوفة عروض مرجحة", startDay: 2, dueDay: 5, dependencies: ["بناء بطاقة تأهيل المصنع"], kpi: "5 مصانع مقيمة" },
        { title: "توصية قائمة الموردين", objective: "ترشيح الموردين وشروط التجربة.", deliverable: "قائمة قصيرة وشروط تفاوض", startDay: 5, dueDay: 7, dependencies: ["إعداد مصفوفة مقارنة العروض"], kpi: "3 بدائل صالحة" },
      ],
    },
    RISK: {
      ...common,
      summary: "المخاطر الأساسية هي شروط المنصة ومسؤولية المنتج وتتبع العمولة والسيولة والبيانات.",
      recommendation: "السماح بالدراسة ومنع الإعلان المدفوع أو شراء المخزون حتى إغلاق قائمة التحقق.",
      confidence: 76,
      findings: ["شروط البرامج والرسوم تحتاج تحققًا حديثًا.", "العقد يجب أن يحدد المسؤولية والمرتجعات وحقوق المحتوى."],
      steps: [
        { title: "تدقيق نموذج العمل وشروط القناة", objective: "تحديد ما يسمح به الحساب والسوق المستهدف.", deliverable: "قائمة امتثال للقناة", startDay: 1, dueDay: 2, dependencies: [], kpi: "صفر بند حرج مجهول" },
        { title: "تدقيق مخاطر المنتج والعقد", objective: "تصنيف الفئات والعقود والبيانات.", deliverable: "سجل مخاطر ومعالجات", startDay: 2, dueDay: 3, dependencies: ["تدقيق نموذج العمل وشروط القناة"], kpi: "معالجة لكل خطر مرتفع" },
        { title: "تثبيت بوابات الإطلاق", objective: "تحديد GO/HOLD/STOP قبل أي التزام.", deliverable: "مذكرة بوابات قرار", startDay: 3, dueDay: 4, dependencies: ["تدقيق مخاطر المنتج والعقد"], kpi: "بوابات قرار موثقة" },
      ],
    },
  };
  return outputs[role];
}

function normalizeSteps(role: SpecialistRole, output: SpecialistOutput): InitiativeStep[] {
  const config = ROLE_CONFIG[role];
  return output.steps.map((step, index) => {
    const startDay = Math.max(1, Math.min(step.startDay, step.dueDay));
    const dueDay = Math.max(startDay, Math.min(step.dueDay, 21));
    return { ...step, key: `${role.toLowerCase()}-${index + 1}`, ownerRole: config.ownerRole, startDay, dueDay, durationDays: dueDay - startDay + 1, executionMode: "INTERNAL_AGENT" };
  });
}

async function planSpecialty(role: SpecialistRole, request: string, context: PlanningContext, amazon: boolean): Promise<SpecialistPlan> {
  const config = ROLE_CONFIG[role];
  const response = await runAgentStructured(
    [`طلب المكتب التنفيذي: ${request}`, `تخصصك: ${config.label}.`, config.brief, `السياق: ${JSON.stringify(context).slice(0, 2200)}`, "قدّم دراسة عملية، ولا تخترع بحثًا أو أسعارًا أو شروط منصة."].join("\n"),
    { agentName: config.agentName, system: `أنت وكيل ${config.label} داخل Orvanta وتعيد تسليمات قابلة للتدقيق بالعربية.`, schema: specialistOutputSchema, schemaDescription: '{"summary":"...","recommendation":"...","confidence":0,"findings":["..."],"assumptions":["..."],"risks":[{"risk":"...","mitigation":"..."}],"steps":[{"title":"...","objective":"...","deliverable":"...","startDay":1,"dueDay":2,"dependencies":[],"kpi":"..."}]}' }
  );
  const output = response.data || fallbackOutput(role, amazon);
  return { role, roleLabel: config.label, agentName: config.agentName, source: response.data ? "AI" : "RULE_ENGINE", provider: response.data ? response.provider : "orvanta-rules", model: response.data ? response.model : "initiative-baseline-v1", status: response.data ? "READY" : "BASELINE", ...output, confidence: Math.round(output.confidence), steps: normalizeSteps(role, output) };
}

const amazonOptions: InitiativeOption[] = [
  { id: "managed-marketplace", title: "خدمة إدارة متجر للمصانع", model: "إدارة القوائم والاختبار والتحسين", revenueModel: "رسم إعداد + اشتراك أو حصة مبيعات", setupCost: "منخفض إلى متوسط", timeToSignalDays: 14, inventoryRisk: "LOW", score: 86, verdict: "RECOMMENDED" },
  { id: "affiliate-validation", title: "إحالة ومحتوى بالعمولة", model: "محتوى يقود إلى شراء قابل للتتبع", revenueModel: "عمولة حسب البرنامج", setupCost: "منخفض", timeToSignalDays: 21, inventoryRisk: "LOW", score: 72, verdict: "SECONDARY" },
  { id: "inventory-fba", title: "شراء وإعادة بيع بمخزون", model: "شراء وتشغيل متجر ومخزون", revenueModel: "هامش بيع بعد الرسوم", setupCost: "مرتفع", timeToSignalDays: 45, inventoryRisk: "HIGH", score: 45, verdict: "DEFER" },
];

const genericOptions: InitiativeOption[] = [
  { id: "lean-pilot", title: "تجربة محدودة", model: "اختبار أصغر فرضية قابلة للقياس", revenueModel: "يثبت خلال التجربة", setupCost: "منخفض", timeToSignalDays: 14, inventoryRisk: "LOW", score: 84, verdict: "RECOMMENDED" },
  { id: "partner-led", title: "تنفيذ بالشراكة", model: "توزيع القدرة والمخاطر", revenueModel: "تقاسم إيراد أو رسم", setupCost: "متوسط", timeToSignalDays: 21, inventoryRisk: "MEDIUM", score: 68, verdict: "SECONDARY" },
  { id: "full-launch", title: "إطلاق كامل", model: "تشغيل النطاق الكامل مباشرة", revenueModel: "حسب نموذج الفكرة", setupCost: "مرتفع", timeToSignalDays: 45, inventoryRisk: "HIGH", score: 42, verdict: "DEFER" },
];

const amazonProducts: ProductCandidate[] = [
  { category: "منظمات المكتب والأدراج", customer: "موظفون وأسر", priceHypothesis: "متوسط؛ يثبت بعروض فعلية", sourcingModel: "مصنع محلي أو مورد بعينة", reasonToTest: "خفيفة وسهلة الشرح", validationTest: "ثلاثة عروض وقياس طلب مؤهل", rejectionRule: "رفض عند غياب الطلب أو تآكل الهامش" },
  { category: "حزم هدايا وقرطاسية عربية", customer: "أفراد وشركات صغيرة", priceHypothesis: "حزمة أعلى من القطعة", sourcingModel: "تجميع محلي", reasonToTest: "مساحة للتميّز", validationTest: "طلبات مسبقة بلا مخزون", rejectionRule: "رفض عند حد أدنى كبير" },
  { category: "منظمات السيارة غير الكهربائية", customer: "مستخدمو السيارات", priceHypothesis: "متوسط", sourcingModel: "مصنع بعينة جودة", reasonToTest: "فائدة واضحة", validationTest: "مقارنة خمسة منتجات", rejectionRule: "رفض عند جودة غير مستقرة" },
  { category: "منظمات السفر", customer: "المسافرون والعائلات", priceHypothesis: "حزمة متعددة", sourcingModel: "مورد مرن", reasonToTest: "قابلة للعرض البصري", validationTest: "صفحة اختبار سبعة أيام", rejectionRule: "رفض عند منافسة سعرية بلا تميّز" },
  { category: "ملحقات تخزين منزلية", customer: "الأسر والمستأجرون", priceHypothesis: "متوسط حسب الحجم", sourcingModel: "مصنع محلي", reasonToTest: "ميزة في التوريد والمقاس", validationTest: "مقارنة التوصيل وثلاثة مقاسات", rejectionRule: "رفض إذا أكل التوصيل المساهمة" },
];

function buildExperiment(amazon: boolean, budgetCap: number): InitiativeExperiment {
  return {
    name: amazon ? "تجربة Amazon للمصانع دون مخزون" : "تجربة تحقق تنفيذية محدودة",
    durationDays: 14,
    budgetCap,
    hypothesis: amazon ? "يمكن إثبات اهتمام مصانع وعملاء قبل شراء المخزون." : "يمكن إثبات الطلب والقدرة التشغيلية قبل الإطلاق الكامل.",
    stages: [
      { dayRange: "1-2", owner: "المخاطر + المالية", work: "تثبيت السوق والقناة وسقف الصرف وبوابات المنع.", deliverable: "مذكرة GO/HOLD/STOP" },
      { dayRange: "1-4", owner: "التسويق + المشتريات", work: amazon ? "ترشيح 3 فئات وتأهيل 5 مصانع." : "ترشيح العرض والشرائح والبدائل.", deliverable: "جداول الخيارات" },
      { dayRange: "5-10", owner: "التسويق + التشغيل", work: "تشغيل القياس اليومي دون التزام واسع.", deliverable: "سجل الطلب والتكلفة" },
      { dayRange: "11-14", owner: "المكتب التنفيذي", work: "جمع نتائج الوكلاء ومقارنتها بالبوابات.", deliverable: "توصية نهائية" },
    ],
    successCriteria: ["اكتمال مخرجات الوكلاء الخمسة.", "وجود اهتمام مؤهل قابل للتتبع.", "اقتصاديات وحدة متحفظة وسقف خسارة واضح."],
    stopConditions: ["بقاء خطر امتثال حرج.", "غياب الطلب المؤهل.", "فشل اقتصاديات الوحدة أو تجاوز السقف."],
  };
}

export async function buildInitiativePlan(request: string, context: PlanningContext = {}): Promise<InitiativePlan> {
  const cleanRequest = request.trim();
  const amazon = isAmazonRequest(cleanRequest);
  const roles = Object.keys(ROLE_CONFIG) as SpecialistRole[];
  const specialistPlans = await Promise.all(roles.map((role) => planSpecialty(role, cleanRequest, context, amazon)));
  const aiCount = specialistPlans.filter((plan) => plan.source === "AI").length;
  const planningMode = aiCount === roles.length ? "AI_ASSISTED" : aiCount > 0 ? "HYBRID" : "RULE_ENGINE";
  const requested = Number(context.requestedBudget || 0);
  const plannedBudget = Number.isFinite(requested) && requested >= 100 ? Math.round(requested) : amazon ? 5_000 : 3_000;
  return {
    version: "initiative-plan-v1",
    title: cleanRequest.slice(0, 120),
    request: cleanRequest,
    kind: amazon ? "AMAZON_COMMERCE" : "GENERAL_INITIATIVE",
    generatedAt: new Date().toISOString(),
    planningMode,
    decision: "GO_CONDITIONAL",
    finalRecommendation: amazon ? "ابدأ بخدمة مُدارة للمصانع مع اختبار إحالة بلا مخزون لمدة 14 يومًا، وأجّل شراء المخزون حتى تثبت فئة واحدة طلبًا واقتصاديات وحدة مقبولة." : "اعتمد تجربة محدودة لمدة 14 يومًا، ثم وسّع فقط إذا عادت الأدلة فوق شروط النجاح.",
    rationale: ["اختبار الطلب قبل تعريض الشركة لالتزام طويل.", "كل وكيل له مخرج وموعد قابل للتدقيق.", "التوسع مرتبط بأدلة وشروط إيقاف."],
    plannedBudget,
    durationDays: 14,
    specialistPlans,
    options: amazon ? amazonOptions : genericOptions,
    productCandidates: amazon ? amazonProducts : [],
    experiment: buildExperiment(amazon, plannedBudget),
    limitations: ["الأسعار والرسوم وشروط البرامج تحتاج مصادر رسمية حديثة قبل الصرف.", ...(planningMode === "AI_ASSISTED" ? [] : ["استُخدمت خطة معيارية معلّمة بوضوح عند تعذر مزود AI."])],
  };
}

export function buildInitiativeBlueprint(plan: InitiativePlan, requiresApproval = true): InitiativeBlueprint {
  const now = Date.now();
  const tasks = plan.specialistPlans.flatMap((specialist) => specialist.steps.map((step) => ({
    title: step.title,
    description: step.objective,
    content: `${step.objective}\nالمخرج المطلوب: ${step.deliverable}`,
    status: requiresApproval ? "BLOCKED" : "TODO",
    priority: step.dueDay <= 2 ? "HIGH" as const : "MEDIUM" as const,
    ownerRole: step.ownerRole,
    kpiName: step.kpi,
    kpiTarget: 1,
    dueDate: new Date(now + step.dueDay * 86_400_000).toISOString(),
    metadata: { executionKey: step.key, executionAgent: specialist.role, agentName: specialist.agentName, deliverable: step.deliverable, startDay: step.startDay, dueDay: step.dueDay, dependencies: step.dependencies, executionMode: step.executionMode, executionKind: classifyExecutionKind({ title: step.title, description: `${step.objective} ${step.deliverable}` }) },
  })));
  return {
    tasks,
    kpis: tasks.map((task) => ({ name: task.kpiName, target: 1, current: 0, unit: "deliverable", status: "WATCH", dueDate: task.dueDate })),
    actions: plan.specialistPlans.map((specialist) => ({
      actionType: "AGENT_DELIVERABLE",
      title: `تنفيذ حزمة ${specialist.roleLabel}`,
      description: `ينفذ ${specialist.agentName} المهام المعتمدة ويعيد المخرجات للمكتب التنفيذي.`,
      status: requiresApproval ? "WAITING_APPROVAL" : "QUEUED",
      executionMode: "INTERNAL",
      provider: "orvanta_agents",
      requiresApproval,
      approvalStatus: requiresApproval ? "PENDING" : "NOT_REQUIRED",
      payload: { initiativeVersion: plan.version, initiativeKind: plan.kind, request: plan.request, role: specialist.role, roleLabel: specialist.roleLabel, agentName: specialist.agentName, specialistPlan: specialist, experiment: plan.experiment, productCandidates: specialist.role === "MARKET" ? plan.productCandidates : [], options: specialist.role === "FINANCE" ? plan.options : [], finalRecommendation: plan.finalRecommendation, taskKeys: specialist.steps.map((step) => step.key) },
    })),
  };
}

export function initiativePlanAsText(plan: InitiativePlan) {
  return plan.specialistPlans.flatMap((specialist) => specialist.steps.map((step) => `- [${specialist.roleLabel}] ${step.title} - ${step.ownerRole} - اليوم ${step.dueDay} - المخرج: ${step.deliverable}`)).join("\n");
}
