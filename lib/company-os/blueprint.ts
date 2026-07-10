import { AI_EXECUTIVE_BOARD, BUSINESS_ENGINES, DECISION_RIGHTS, EXECUTION_WORKERS, WORKFLOW_ENGINES } from "./organization";
import { COMPANY_LIFECYCLE } from "./lifecycle";
import { RISK_POLICIES } from "./governance";
import type { PerformanceTarget, TransformationPhase } from "./types";

export const MEMORY_SYSTEM = {
  knowledgeBase: {
    purpose: "إدارة السياسات والعقود والإجراءات واللوائح ووثائق المنتج والموردين والعملاء بإصدارات وصلاحية واضحة.",
    requiredMetadata: ["owner", "source", "version", "jurisdiction", "validFrom", "validTo", "confidentiality"],
  },
  knowledgeGraph: {
    entities: [
      "Company", "Objective", "Opportunity", "Decision", "Customer", "Supplier", "Product", "Project",
      "Workflow", "Risk", "Contract", "Transaction", "Agent", "Outcome",
    ],
    temporalRule: "يجب حفظ ما كان معروفاً ومعتقداً وقت القرار، لا الحالة الحالية فقط.",
  },
  decisionArchive: {
    captures: ["modelVersion", "promptVersion", "policyVersion", "evidence", "approvers", "execution", "actualOutcome"],
  },
  lessonsLearned: {
    loop: ["Expected outcome", "Actual outcome", "Forecast error", "Root cause", "Reusable lesson", "Policy/playbook update"],
  },
};

export const ENTERPRISE_ARCHITECTURE = {
  principle: "Next.js هو طبقة التجربة؛ نواة الشركة يجب أن تصبح خدمات تشغيلية مستقلة وقابلة للاستئناف.",
  layers: [
    "Web / iOS / Public API Clients",
    "Identity + API Gateway",
    "Command & Decision Layer",
    "Policy Engine",
    "Durable Workflow Engine",
    "Event Bus + Outbox",
    "Domain Services",
    "Execution Connectors",
  ],
  dataPlane: [
    "Operational Postgres",
    "Authoritative Financial Ledger",
    "Immutable Event Store",
    "Object Storage",
    "Analytics Warehouse",
    "Vector Index",
    "Temporal Knowledge Graph",
    "Observability Platform",
  ],
  canonicalEvents: [
    "opportunity.discovered",
    "validation.completed",
    "risk.assessed",
    "decision.requested",
    "decision.approved",
    "budget.reserved",
    "project.created",
    "workflow.started",
    "action.executed",
    "action.failed",
    "invoice.issued",
    "payment.received",
    "kpi.breached",
    "project.closed",
    "lesson.recorded",
  ],
  reliability: {
    availability: "99.95% initial; 99.99% for critical finance paths",
    rpo: "≤ 5 minutes",
    rto: "≤ 30 minutes",
    controls: ["multi-region backups", "tested restore", "connector circuit breakers", "provider fallback", "dead-letter queue"],
  },
  security: [
    "SSO/OIDC + MFA",
    "RBAC + ABAC",
    "strict tenant isolation",
    "secrets vault",
    "encryption in transit and at rest",
    "field-level masking",
    "retention policies",
    "immutable audit",
    "connector allowlists",
    "policy-as-code",
  ],
};

export const FINANCE_ENGINE = {
  reportingCurrency: "SAR",
  modules: [
    "General Ledger", "Chart of Accounts", "Accounts Payable", "Accounts Receivable", "Budgeting",
    "Commitments", "Cash Management", "Revenue Recognition", "Expense Allocation", "Profitability",
    "Tax and ZATCA", "Forecasting", "Reconciliation",
  ],
  controlSequence: [
    "Budget available",
    "Commitment reserved",
    "Approval completed",
    "Action executed",
    "Invoice/receipt received",
    "Ledger posted",
    "Reconciled",
  ],
  managementViews: [
    "Cash available", "Committed cash", "Forecast cash", "Burn", "Runway", "Gross margin",
    "Contribution margin", "Product profitability", "Customer profitability", "Project ROI", "Budget variance",
  ],
  forecastScenarios: ["BASE", "UPSIDE", "DOWNSIDE"],
  invariant: "لا يُعتمد أثر مالي من مصدر آخر إذا تعارض مع دفتر الأستاذ.",
};

export const PRODUCT_EXPERIENCE = {
  ownerQuestions: [
    "ما الذي يحتاج قراري؟",
    "هل الشركة بصحة جيدة؟",
    "أين يذهب النقد؟",
    "ما الذي خرج عن المسار؟",
    "ما الإجراء الأهم اليوم؟",
  ],
  surfaces: [
    { name: "CEO Dashboard", purpose: "القرارات والمخاطر ورأس المال وصحة الشركة فقط." },
    { name: "Executive Cockpit", purpose: "السيناريوهات والأهداف والتوقعات وتخصيص الموارد." },
    { name: "Enterprise Control Room", purpose: "Workflows الجارية والفشل والاستثناءات وSLA والأدلة." },
    { name: "Investment Center", purpose: "Discover → Validate → Model → Risk → Approve → Fund → Execute → Scale/Kill." },
    { name: "Operations Center", purpose: "المشاريع والقدرة والمراحل والاعتماديات والتوريد والتسليم." },
    { name: "Governance Center", purpose: "المصفوفة والسياسات والمخاطر والتدقيق والامتثال وحوكمة النماذج." },
    { name: "Company Health Center", purpose: "الصحة المالية والنمو والتشغيل والعملاء والمخاطر والنظام." },
  ],
  navigation: ["الرئيسية", "القرارات", "التنفيذ", "الذكاء", "الحوكمة"],
};

export const DESIGN_SYSTEM = {
  direction: "Apple simplicity + enterprise clarity + transparent AI + Arabic-first UX",
  principles: ["Minimalism", "Visual hierarchy", "Focus", "Transparency", "Decision-centric design", "Progressive disclosure"],
  coreComponents: [
    "Decision Card", "Evidence Drawer", "Risk Badge", "Financial Impact Block", "Approval Sheet",
    "Execution Timeline", "Outcome Card", "Exception Alert", "AI Explanation", "Audit Viewer", "Company Health Gauge",
  ],
  motion: {
    processing: "نبض هادئ",
    handoff: "حركة اتجاهية",
    workflow: "مسار تقدم",
    completed: "تأكيد محدود",
    critical: "مقاطعة حادة وواضحة",
  },
  transparencyStandard: ["why", "sources", "assumptions", "confidence", "policy", "expected impact", "alternative"],
};

export const PERFORMANCE_TARGETS: PerformanceTarget[] = [
  { id: "ui-response", label: "UI interaction", target: "< 100 ms" },
  { id: "client-navigation", label: "Client navigation", target: "< 300 ms" },
  { id: "usable-screen", label: "Initial usable screen", target: "< 1.5 s", percentile: "p75" },
  { id: "api-read", label: "Standard API reads", target: "< 200 ms", percentile: "p95" },
  { id: "workflow-ack", label: "Workflow acknowledgment", target: "< 500 ms" },
  { id: "stream-update", label: "First streamed workflow update", target: "< 2 s" },
  { id: "ai-plan", label: "Initial AI plan", target: "< 5 s", percentile: "p50" },
  { id: "ai-analysis", label: "Complex AI analysis", target: "< 15 s", percentile: "p95" },
  { id: "data-freshness", label: "Executive data freshness", target: "< 5 s" },
  { id: "action-dispatch", label: "Background action dispatch", target: "< 3 s" },
];

export const PERFORMANCE_STRATEGY = {
  techniques: [
    "CDN and immutable assets",
    "tenant-aware Redis cache",
    "precomputed executive read models",
    "materialized financial views",
    "SSE/WebSockets for progress",
    "asynchronous AI jobs",
    "model routing by task complexity",
    "prompt caching",
    "batch embeddings",
    "connection pooling",
    "pagination and virtualized lists",
    "circuit breakers",
  ],
  neverCacheWithoutVersionCheck: ["approval authority", "permissions", "financial balances", "critical risk states", "secrets"],
};

export const COMPETITIVE_MOAT = {
  notAMoat: ["many agents", "attractive dashboard", "LLM integration", "executive role names", "generated reports"],
  moats: {
    technical: "Policy + durable workflows + financial controls + AI orchestration + auditability + connectors.",
    data: "Decisions, assumptions, executions, outcomes, forecast errors and owner preferences.",
    workflow: "Industry-tested operating playbooks with measured outcomes.",
    governance: "A policy engine that learns authority, risk appetite, controls and approval behavior.",
    knowledge: "A temporal graph connecting customers, suppliers, decisions, projects, money and risks.",
    regional: "Arabic-first UX, Saudi context, SAR governance and ZATCA-ready operating packs.",
  },
};

export const BUSINESS_MODEL = {
  targetWedge: "Saudi owner-led companies with 20–500 employees and fragmented approvals, weak cash visibility and management dependency.",
  plans: [
    { name: "Core", monthlySAR: "1,500–3,000", scope: "Decision center, objectives, projects, basic finance, limited connectors and AI usage." },
    { name: "Growth", monthlySAR: "8,000–15,000", scope: "Executive engines, advanced workflows, governance, analytics, users and departments." },
    { name: "Enterprise", annualSAR: "250,000–1,000,000+", scope: "Isolation, compliance, integrations, implementation and enterprise support." },
  ],
  revenueStreams: ["Subscription", "Enterprise implementation", "AI usage", "Connector/workflow marketplace", "Professional services"],
  marketplaceTakeRate: "15–25%",
  verticals: ["Retail", "Logistics", "Manufacturing", "Services", "Healthcare administration"],
};

export const TRANSFORMATION_ROADMAP: TransformationPhase[] = [
  {
    id: 1,
    name: "Foundation",
    horizon: "0–3 months",
    objectives: ["Secure", "Durable", "Measurable", "Governed"],
    features: ["Authentication", "Tenant isolation", "Canonical entities", "Policy engine v1", "Ledger authority", "Workflow runtime", "Audit", "Google Workspace"],
    infrastructure: ["Durable workflows", "Event schema", "Outbox", "Secrets management", "Production monitoring"],
    successMetrics: ["100% sensitive actions authenticated", "100% material decisions audited", "0 cross-tenant access", ">98% execution success"],
  },
  {
    id: 2,
    name: "Operational Intelligence",
    horizon: "3–6 months",
    objectives: ["Understand the company", "Improve decision quality", "Connect outcomes to evidence"],
    features: ["Objective graph", "Opportunity scoring", "Knowledge graph v1", "AI board", "Forecasting", "Company health", "Decision packets"],
    infrastructure: ["Semantic retrieval", "Temporal graph", "Executive read models", "Evaluation datasets"],
    successMetrics: ["90% decisions linked to evidence", "50% faster approvals", "80% projects linked to outcomes", "forecast variance tracked"],
  },
  {
    id: 3,
    name: "Autonomous Execution",
    horizon: "6–12 months",
    objectives: ["Controlled end-to-end execution", "Low manual intervention", "Automatic reconciliation"],
    features: ["Lead-to-cash", "Procure-to-pay", "Campaign-to-revenue", "Project-to-outcome", "Compensation", "Browser/API workers"],
    infrastructure: ["Connector SDK", "Dead-letter queues", "Workflow versioning", "Reconciliation service"],
    successMetrics: ["40–60% routine workflows autonomous", ">99% idempotency", "<15% manual intervention", "0 unapproved material transactions"],
  },
  {
    id: 4,
    name: "Enterprise Scale",
    horizon: "12–18 months",
    objectives: ["Regulated enterprise readiness", "Multi-entity scale", "Resilience"],
    features: ["SSO", "RBAC/ABAC", "Policy packs", "Multi-entity finance", "Data residency", "Advanced audit", "Model governance", "Marketplace"],
    infrastructure: ["Multi-region", "DR automation", "Warehouse", "Enterprise observability", "Security certifications"],
    successMetrics: ["99.95% availability", "1M operations/day", "tested RPO/RTO", "measured deployment ROI"],
  },
  {
    id: 5,
    name: "Global Category Leadership",
    horizon: "18–36 months",
    objectives: ["Establish AI Company OS category", "Global ecosystem", "Industry benchmarks"],
    features: ["Global connectors", "Industry operating packs", "Benchmarking", "Partner marketplace", "Multilingual intelligence", "Governed capital allocation"],
    infrastructure: ["Global partner platform", "Federated models", "Regional compliance packs", "Benchmark network"],
    successMetrics: ["Repeatable enterprise deployments", "Strong NRR", "High workflow reuse", "Marketplace growth", "Customer margin improvement"],
  },
];

export const STRATEGIC_AUDIT = {
  strengths: [
    "قوة الرؤية وتماسك دورة Idea → Approval → Execution",
    "وجود الحوكمة وقائمة الإجراءات مبكراً",
    "بداية طبقة بيانات دائمة ودفتر مالي",
    "انتقال فعلي إلى Gmail/Sheets/Drive execution",
    "موقع عربي/سعودي قابل للدفاع",
  ],
  weaknesses: [
    "البنية ما تزال application-centric",
    "لا يوجد durable workflow runtime مستقل",
    "الأدوار الحالية أقرب إلى prompts من executives محكومين",
    "الذاكرة أرشيف أكثر من كونها intelligence graph",
    "الواجهة أوسع من عمق التنفيذ",
    "الـ multi-tenancy لم يصل بعد إلى عزل مؤسسي كامل",
  ],
  criticalRisks: [
    "تمييز غير كاف بين نجاح API ونجاح النتيجة التجارية",
    "خطر وجود مصادر مالية متعددة",
    "اعتماد مفرط على LLM في قرارات حساسة",
    "مخاطر الهوية والعزل والصلاحيات",
    "عدم ملاءمة serverless-only للعمليات الطويلة",
    "منافسة Microsoft/Salesforce/ServiceNow في الطبقات العامة",
  ],
};

export const ORVANTA_WORLD_CLASS_BLUEPRINT = {
  definition: "نظام تشغيل شركات محكوم يحول النية الاستراتيجية إلى تخصيص رأس مال معتمد، Workflows دائمة، تنفيذ حقيقي، مساءلة مالية وذكاء تنظيمي متحسن باستمرار.",
  strategicAudit: STRATEGIC_AUDIT,
  lifecycle: COMPANY_LIFECYCLE,
  organization: {
    executiveBoard: AI_EXECUTIVE_BOARD,
    businessEngines: BUSINESS_ENGINES,
    workflowEngines: WORKFLOW_ENGINES,
    executionWorkers: EXECUTION_WORKERS,
    decisionRights: DECISION_RIGHTS,
  },
  governance: RISK_POLICIES,
  memory: MEMORY_SYSTEM,
  architecture: ENTERPRISE_ARCHITECTURE,
  finance: FINANCE_ENGINE,
  productExperience: PRODUCT_EXPERIENCE,
  designSystem: DESIGN_SYSTEM,
  performance: { targets: PERFORMANCE_TARGETS, strategy: PERFORMANCE_STRATEGY },
  moat: COMPETITIVE_MOAT,
  businessModel: BUSINESS_MODEL,
  roadmap: TRANSFORMATION_ROADMAP,
};
