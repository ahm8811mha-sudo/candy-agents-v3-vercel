import { createApproval, listApprovals } from "../approvals";
import { persist, fetchRows, hydrateOnce } from "../supabase";
import { getAgent } from "./agents";

export type CrisisSeverity = "MEDIUM" | "HIGH" | "CRITICAL";
export type CrisisStatus = "OPEN" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "CLOSED";
export type CrisisLaneStatus = "READY" | "PENDING_APPROVAL" | "DONE";

export type CrisisLane = {
  id: string;
  label: string;
  ownerAgentId: string;
  ownerName: string;
  targetSAR: number;
  status: CrisisLaneStatus;
  actions: string[];
};

export type CrisisRecommendation = {
  agentId: string;
  agentName: string;
  agentTitle: string;
  role: string;
  confidence: number;
  impactSAR: number;
  report: string;
  actions: string[];
  createdAt: string;
};

export type CrisisCase = {
  id: string;
  title: string;
  description: string;
  amountSAR: number;
  days: number;
  severity: CrisisSeverity;
  status: CrisisStatus;
  owner: string;
  executiveSummary: string;
  lanes: CrisisLane[];
  recommendations: CrisisRecommendation[];
  approvalId?: string;
  createdAt: string;
  updatedAt: string;
};

const store: CrisisCase[] = [];
const sar = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 0 });

const severityAr: Record<CrisisSeverity, string> = {
  MEDIUM: "متوسطة",
  HIGH: "عالية",
  CRITICAL: "حرجة",
};

function genId() {
  return `crisis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeSeverity(value: unknown): CrisisSeverity {
  const raw = String(value || "HIGH").toUpperCase();
  if (raw === "CRITICAL" || raw === "حرجة") return "CRITICAL";
  if (raw === "MEDIUM" || raw === "متوسطة") return "MEDIUM";
  return "HIGH";
}

function toRow(c: CrisisCase): Record<string, unknown> {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    amount_sar: c.amountSAR,
    days: c.days,
    severity: c.severity,
    status: c.status,
    owner: c.owner,
    executive_summary: c.executiveSummary,
    lanes: c.lanes,
    recommendations: c.recommendations,
    approval_id: c.approvalId ?? null,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

function fromRow(r: Record<string, unknown>): CrisisCase {
  return {
    id: String(r.id),
    title: String(r.title ?? "أزمة"),
    description: String(r.description ?? ""),
    amountSAR: Number(r.amount_sar ?? 0),
    days: Math.max(1, Number(r.days ?? 30)),
    severity: normalizeSeverity(r.severity),
    status: (r.status as CrisisStatus) ?? "OPEN",
    owner: String(r.owner ?? "owner"),
    executiveSummary: String(r.executive_summary ?? ""),
    lanes: (r.lanes as CrisisLane[]) ?? [],
    recommendations: (r.recommendations as CrisisRecommendation[]) ?? [],
    approvalId: r.approval_id ? String(r.approval_id) : undefined,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at ?? r.created_at),
  };
}

function persistCrisis(c: CrisisCase): void {
  persist("company_crises", toRow(c));
}

export const hydrateCrises = hydrateOnce(async () => {
  const rows = await fetchRows("company_crises", { orderBy: "created_at", limit: 100 });
  const seen = new Set(store.map((c) => c.id));
  for (const r of rows) {
    if (!seen.has(String(r.id))) store.push(fromRow(r));
  }
  store.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
});

function agentName(id: string) {
  const agent = getAgent(id);
  return agent ? `${agent.name} — ${agent.title}` : id;
}

function buildLanes(amountSAR: number): CrisisLane[] {
  const collections = Math.round(amountSAR * 0.375);
  const costCut = Math.round(amountSAR * 0.2);
  const supplier = Math.round(amountSAR * 0.175);
  const sales = amountSAR - collections - costCut - supplier;
  return [
    { id: "collections", label: "تحصيل مستحقات قريبة", ownerAgentId: "ameen", ownerName: agentName("ameen"), targetSAR: collections, status: "READY", actions: ["استخراج قائمة المستحقات", "التواصل مع العملاء", "تحديث التحصيل اليومي"] },
    { id: "cost", label: "خفض مصروفات مؤقت", ownerAgentId: "abdulrahman", ownerName: agentName("abdulrahman"), targetSAR: costCut, status: "READY", actions: ["مراجعة المصروفات", "تأجيل غير الضروري", "تثبيت سقف صرف مؤقت"] },
    { id: "suppliers", label: "إعادة جدولة موردين", ownerAgentId: "khalid", ownerName: agentName("khalid"), targetSAR: supplier, status: "PENDING_APPROVAL", actions: ["تحديد الموردين الأقل حساسية", "اقتراح جدول دفع", "رفع الاتفاق للاعتماد"] },
    { id: "sales", label: "إيراد سريع", ownerAgentId: "sara", ownerName: agentName("sara"), targetSAR: sales, status: "READY", actions: ["عرض 72 ساعة", "تفعيل العملاء السابقين", "قياس التحصيل الفعلي"] },
  ];
}

function rec(agentId: string, role: string, impactSAR: number, confidence: number, report: string, actions: string[]): CrisisRecommendation {
  const agent = getAgent(agentId);
  return {
    agentId,
    agentName: agent?.name ?? agentId,
    agentTitle: agent?.title ?? role,
    role,
    impactSAR,
    confidence,
    report,
    actions,
    createdAt: new Date().toISOString(),
  };
}

function buildRecommendations(amountSAR: number, days: number, severity: CrisisSeverity, lanes: CrisisLane[]) {
  const find = (id: string) => lanes.find((l) => l.id === id)?.targetSAR ?? 0;
  const daily = Math.ceil(amountSAR / Math.max(days, 1));
  return [
    rec("abdulrahman", "تحليل السيولة", find("cost"), 0.82, `الفجوة ${sar.format(amountSAR)} ر.س خلال ${days} يوم. الضغط اليومي التقريبي ${sar.format(daily)} ر.س.`, ["تقرير سيولة", "سقف صرف مؤقت", "متابعة يومية"]),
    rec("ameen", "التحصيل", find("collections"), 0.78, `هدف التحصيل السريع ${sar.format(find("collections"))} ر.س من المستحقات القريبة.`, ["فرز المستحقات", "رسائل تحصيل", "اتصالات متابعة"]),
    rec("sara", "المبيعات", find("sales"), 0.74, `هدف الإيراد السريع ${sar.format(find("sales"))} ر.س من حملة قصيرة مرتبطة بتحصيل فعلي.`, ["حملة قصيرة", "عرض عالي الهامش", "تقرير مبيعات يومي"]),
    rec("khalid", "الموردون", find("suppliers"), 0.69, `تخفيف ضغط ${sar.format(find("suppliers"))} ر.س عبر تفاوض منظم لا يوقف التوريد.`, ["فرز الموردين", "جدول دفع", "اعتماد الاتفاق"]),
    rec("fahad", "التنفيذ", Math.round(amountSAR * 0.1), 0.76, `مستوى الخطورة ${severityAr[severity]}. يلزم Action Queue واضح ومراجعة يومية حتى الإغلاق.`, ["متابعة يومية", "تحديث الحالة", "تصعيد العوائق"]),
    rec("hares", "الحوكمة", 0, 0.72, "أي إجراء يمس موردًا أو صرفًا مؤثرًا يمر عبر مركز القرار قبل التنفيذ.", ["توثيق القرارات", "منع التجاوزات", "رفع المخاطر"]),
  ];
}

function summary(title: string, amountSAR: number, days: number, severity: CrisisSeverity, lanes: CrisisLane[]) {
  const ready = lanes.filter((l) => l.status === "READY").reduce((sum, l) => sum + l.targetSAR, 0);
  const pending = lanes.filter((l) => l.status === "PENDING_APPROVAL").reduce((sum, l) => sum + l.targetSAR, 0);
  return `خطة إغلاق «${title}»: تغطية ${sar.format(amountSAR)} ر.س خلال ${days} يوم. المسارات الجاهزة ${sar.format(ready)} ر.س، والمسارات التي تحتاج اعتماد ${sar.format(pending)} ر.س. الخطورة: ${severityAr[severity]}.`;
}

export type CreateCrisisInput = {
  title: string;
  description?: string;
  amountSAR: number;
  days: number;
  severity?: CrisisSeverity | string;
  owner?: string;
};

export function createCrisis(input: CreateCrisisInput): CrisisCase {
  const now = new Date().toISOString();
  const title = input.title.trim();
  const amountSAR = Math.max(1, Math.round(input.amountSAR));
  const days = Math.max(1, Math.round(input.days || 30));
  const severity = normalizeSeverity(input.severity);
  const lanes = buildLanes(amountSAR);
  const crisis: CrisisCase = {
    id: genId(),
    title,
    description: String(input.description || "").trim(),
    amountSAR,
    days,
    severity,
    status: "OPEN",
    owner: input.owner || "owner",
    executiveSummary: summary(title, amountSAR, days, severity, lanes),
    lanes,
    recommendations: buildRecommendations(amountSAR, days, severity, lanes),
    createdAt: now,
    updatedAt: now,
  };
  const approval = createApproval({
    id: `apr-${crisis.id}`,
    type: "DECISION",
    title: `Crisis Room: ${crisis.title}`,
    detail: `${crisis.executiveSummary} · المبلغ ${sar.format(crisis.amountSAR)} ر.س`,
    amount: crisis.amountSAR,
    requestedRole: "مالك الشركة",
    dedupeKey: `crisis-${crisis.id}`,
    metadata: { crisisId: crisis.id, severity: crisis.severity },
  });
  crisis.approvalId = approval.id;
  crisis.status = "PENDING_APPROVAL";
  store.unshift(crisis);
  persistCrisis(crisis);
  return crisis;
}

export function syncCrisesWithApprovals(): void {
  const approvals = listApprovals();
  for (const crisis of store) {
    if (crisis.status !== "PENDING_APPROVAL" || !crisis.approvalId) continue;
    const approval = approvals.find((a) => a.id === crisis.approvalId);
    if (!approval) continue;
    if (approval.status === "APPROVED") crisis.status = "APPROVED";
    if (approval.status === "REJECTED") crisis.status = "REJECTED";
    if (approval.status !== "PENDING") {
      crisis.updatedAt = new Date().toISOString();
      persistCrisis(crisis);
    }
  }
}

export function listCrises(): CrisisCase[] {
  syncCrisesWithApprovals();
  return store.slice(0, 100);
}

export function crisisStats() {
  syncCrisesWithApprovals();
  return {
    total: store.length,
    open: store.filter((c) => ["OPEN", "PENDING_APPROVAL", "APPROVED"].includes(c.status)).length,
    pending: store.filter((c) => c.status === "PENDING_APPROVAL").length,
    approved: store.filter((c) => c.status === "APPROVED").length,
    rejected: store.filter((c) => c.status === "REJECTED").length,
    exposureSAR: store.filter((c) => c.status !== "REJECTED" && c.status !== "CLOSED").reduce((sum, c) => sum + c.amountSAR, 0),
  };
}

export function ensureDefaultCrisis(): CrisisCase {
  const existing = store.find((c) => c.title.includes("40,000") || c.title.includes("٤٠"));
  if (existing) return existing;
  return createCrisis({ title: "مشكلة مالية بقيمة 40,000 ريال", description: "نموذج أزمة افتراضي لاختبار غرفة الأزمات.", amountSAR: 40000, days: 30, severity: "HIGH" });
}
