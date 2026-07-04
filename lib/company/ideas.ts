/**
 * Ideas & feasibility pipeline (OPERATING_MODEL.md — lifecycle stages 1–4).
 *
 * Ideas come from two sources: the OWNER, and the TEAM — which is obligated to
 * produce one executable idea every day (راصد proposes it). Every idea is
 * automatically studied by the three department heads (عبدالرحمن مالياً،
 * نورة سوقياً، فهد تشغيلياً), سلطان aggregates a recommendation, other agents
 * may add their own recommendations, and the final sign-off happens ONLY in
 * the decision center (/inbox) under the authority matrix.
 *
 * Analyses here are transparent first-pass heuristics (labelled as such) —
 * deterministic from the idea's numbers so they are testable and honest.
 */

import { createApproval, listApprovals } from "../approvals";
import { getAgent } from "./agents";
import { requiredTier, requiresFeasibility } from "./governance";
import { runAgent } from "../ai";
import { persist, fetchRows, hydrateOnce } from "../supabase";

export type IdeaSource = "OWNER" | "TEAM";
export type IdeaStatus = "UNDER_STUDY" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
export type Verdict = "APPROVE" | "CONDITIONAL" | "REJECT";

export type IdeaRecommendation = {
  agentId: string;
  agentName: string;
  agentTitle: string;
  verdict: Verdict;
  confidence: number; // 0..1
  report: string;
  createdAt: string;
};

export type Idea = {
  id: string;
  title: string;
  hypothesis: string;
  budgetSAR: number;
  horizonDays: number;
  source: IdeaSource;
  proposedBy: string;
  proposedByName: string;
  status: IdeaStatus;
  tier: string;
  tierLabel: string;
  recommendations: IdeaRecommendation[];
  aggregate?: { verdict: Verdict; confidence: number; summary: string; narrative?: string };
  studyMode?: "LLM" | "HEURISTIC";
  approvalId?: string;
  dayKey?: string;
  createdAt: string;
};

const store: Idea[] = [];

const sar = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 0 });

const verdictAr: Record<Verdict, string> = {
  APPROVE: "يُوصى بالتنفيذ",
  CONDITIONAL: "يُوصى بتحفظ",
  REJECT: "لا يُوصى",
};

function genId() {
  return `idea-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Upsert the full idea row — called after every mutation (best-effort). */
function persistIdea(idea: Idea): void {
  persist("company_ideas", {
    id: idea.id,
    title: idea.title,
    hypothesis: idea.hypothesis,
    budget_sar: idea.budgetSAR,
    horizon_days: idea.horizonDays,
    source: idea.source,
    proposed_by: idea.proposedBy,
    proposed_by_name: idea.proposedByName,
    status: idea.status,
    tier: idea.tier,
    tier_label: idea.tierLabel,
    recommendations: idea.recommendations,
    aggregate: idea.aggregate ?? null,
    study_mode: idea.studyMode ?? null,
    approval_id: idea.approvalId ?? null,
    day_key: idea.dayKey ?? null,
    created_at: idea.createdAt,
  });
}

/** Hydrate the store from Supabase once per process (before reads). */
export const hydrateIdeas = hydrateOnce(async () => {
  const rows = await fetchRows("company_ideas", { orderBy: "created_at", limit: 100 });
  const seen = new Set(store.map((i) => i.id));
  for (const r of rows) {
    if (seen.has(String(r.id))) continue;
    store.push({
      id: String(r.id),
      title: String(r.title),
      hypothesis: String(r.hypothesis ?? ""),
      budgetSAR: Number(r.budget_sar ?? 0),
      horizonDays: Number(r.horizon_days ?? 1),
      source: (r.source as IdeaSource) ?? "OWNER",
      proposedBy: String(r.proposed_by ?? "owner"),
      proposedByName: String(r.proposed_by_name ?? "المالك"),
      status: (r.status as IdeaStatus) ?? "UNDER_STUDY",
      tier: String(r.tier ?? ""),
      tierLabel: String(r.tier_label ?? ""),
      recommendations: (r.recommendations as IdeaRecommendation[]) ?? [],
      aggregate: (r.aggregate as Idea["aggregate"]) ?? undefined,
      studyMode: (r.study_mode as Idea["studyMode"]) ?? undefined,
      approvalId: r.approval_id ? String(r.approval_id) : undefined,
      dayKey: r.day_key ? String(r.day_key) : undefined,
      createdAt: String(r.created_at),
    });
  }
  store.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
});

/** Small deterministic jitter from the idea text so twins don't look identical. */
function seedJitter(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 997;
  return (h % 100) / 1000; // 0 .. 0.099
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

/* ── the three core department studies (first-pass heuristics) ── */

function financeStudy(idea: Idea): IdeaRecommendation {
  const a = getAgent("abdulrahman")!;
  const j = seedJitter(idea.title);
  const roi = clamp(0.07 + (30 / Math.max(idea.horizonDays, 7)) * 0.04 + (idea.budgetSAR <= 25_000 ? 0.05 : 0.01) + j, 0.04, 0.35);
  const payback = Math.max(1, Math.round(idea.horizonDays / 30));
  const tier = requiredTier(idea.budgetSAR);
  const verdict: Verdict = roi >= 0.12 && tier.tier !== "T3" ? "APPROVE" : roi >= 0.07 ? "CONDITIONAL" : "REJECT";
  return {
    agentId: a.id,
    agentName: a.name,
    agentTitle: a.title,
    verdict,
    confidence: clamp(0.55 + roi + j, 0.5, 0.9),
    report: `تحليل أولي آلي: عائد متوقع ${(roi * 100).toFixed(0)}% تقريباً، استرداد خلال ~${payback} شهر. الميزانية ${sar.format(idea.budgetSAR)} ر.س ضمن الفئة ${tier.tier} (${tier.label}).${tier.tier === "T3" ? " المبلغ مرتفع — يشترط اكتمال الجدوى الثلاثية." : ""}`,
    createdAt: new Date().toISOString(),
  };
}

function marketStudy(idea: Idea): IdeaRecommendation {
  const a = getAgent("noura")!;
  const j = seedJitter(idea.hypothesis || idea.title);
  const speed = clamp(1 - idea.horizonDays / 120, 0.1, 0.9); // shorter horizon = faster validation
  const verdict: Verdict = speed >= 0.5 ? "APPROVE" : speed >= 0.25 ? "CONDITIONAL" : "REJECT";
  return {
    agentId: a.id,
    agentName: a.name,
    agentTitle: a.title,
    verdict,
    confidence: clamp(0.5 + speed * 0.35 + j, 0.5, 0.88),
    report: `تحليل أولي آلي: أفق ${idea.horizonDays} يوماً يسمح باختبار الطلب ${speed >= 0.5 ? "بسرعة مقبولة" : "ببطء نسبي"}. يُنصح ببدء اختبار مصغّر وقياس تكلفة الاستحواذ قبل التوسع.`,
    createdAt: new Date().toISOString(),
  };
}

function opsStudy(idea: Idea): IdeaRecommendation {
  const a = getAgent("fahad")!;
  const j = seedJitter(idea.title + idea.hypothesis);
  const executable = idea.budgetSAR > 0 && idea.horizonDays >= 7;
  const load = clamp(idea.budgetSAR / 100_000, 0.05, 1);
  const verdict: Verdict = executable && load <= 0.5 ? "APPROVE" : executable ? "CONDITIONAL" : "REJECT";
  return {
    agentId: a.id,
    agentName: a.name,
    agentTitle: a.title,
    verdict,
    confidence: clamp(0.6 + (executable ? 0.15 : -0.2) + j, 0.4, 0.9),
    report: `تحليل أولي آلي: ${executable ? `قابلة للتحويل إلى مشروع بمهام خلال ${Math.max(3, Math.round(idea.horizonDays / 10))} مراحل` : "الأفق الزمني/الميزانية غير كافيين للتنفيذ"}. الحمل التشغيلي ${load <= 0.5 ? "منخفض" : "مرتفع"} نسبةً لطاقة الفريق.`,
    createdAt: new Date().toISOString(),
  };
}

function aggregate(recs: IdeaRecommendation[]): { verdict: Verdict; confidence: number; summary: string } {
  const core = recs.slice(0, 3);
  const votes = { APPROVE: 0, CONDITIONAL: 0, REJECT: 0 } as Record<Verdict, number>;
  for (const r of core) votes[r.verdict]++;
  const verdict: Verdict = votes.REJECT >= 2 ? "REJECT" : votes.APPROVE >= 2 ? "APPROVE" : "CONDITIONAL";
  const confidence = core.reduce((s, r) => s + r.confidence, 0) / core.length;
  return {
    verdict,
    confidence,
    summary: `خلاصة سلطان: ${verdictAr[verdict]} بثقة ${(confidence * 100).toFixed(0)}% — بناءً على تقارير المالية والتسويق والعمليات.`,
  };
}

/** Run the tri-department study, sultan's aggregate, then gate to /inbox. */
function studyAndGate(idea: Idea): Idea {
  idea.recommendations = [financeStudy(idea), marketStudy(idea), opsStudy(idea)];
  idea.aggregate = aggregate(idea.recommendations);

  const tier = requiredTier(idea.budgetSAR);
  const approval = createApproval({
    id: `apr-${idea.id}`,
    type: "IDEA",
    title: `فكرة: ${idea.title}`,
    detail: `${idea.aggregate.summary} · الميزانية ${sar.format(idea.budgetSAR)} ر.س · الفئة ${tier.tier} — يعتمدها ${tier.approver}${requiresFeasibility(idea.budgetSAR) ? " · الجدوى الثلاثية مرفقة ✓" : ""} · مقدَّمة من ${idea.proposedByName}`,
    amount: idea.budgetSAR,
    requestedRole: tier.approver,
    dedupeKey: `idea-${idea.id}`,
    metadata: { ideaId: idea.id, tier: tier.tier, source: idea.source },
  });

  idea.approvalId = approval.id;
  idea.status = "PENDING_APPROVAL";
  persistIdea(idea);
  return idea;
}

export type SubmitIdeaInput = {
  title: string;
  hypothesis: string;
  budgetSAR: number;
  horizonDays: number;
  source?: IdeaSource;
  proposedBy?: string;
  /** Optional deterministic id (e.g. the daily team idea) so concurrent cold
   *  starts upsert one row instead of duplicating. */
  id?: string;
  dayKey?: string;
};

export function submitIdea(input: SubmitIdeaInput): Idea {
  // A deterministic id that already exists (hydrated or same process) is reused.
  if (input.id) {
    const existing = store.find((i) => i.id === input.id);
    if (existing) return existing;
  }
  const proposer = input.proposedBy ? getAgent(input.proposedBy) : undefined;
  const idea: Idea = {
    id: input.id || genId(),
    title: input.title.trim(),
    hypothesis: input.hypothesis.trim(),
    budgetSAR: Math.max(0, Math.round(input.budgetSAR)),
    horizonDays: Math.max(1, Math.round(input.horizonDays)),
    source: input.source || "OWNER",
    proposedBy: input.proposedBy || "owner",
    proposedByName: proposer ? `${proposer.name} — ${proposer.title}` : "المالك",
    status: "UNDER_STUDY",
    tier: requiredTier(input.budgetSAR).tier,
    tierLabel: requiredTier(input.budgetSAR).label,
    recommendations: [],
    dayKey: input.dayKey,
    createdAt: new Date().toISOString(),
  };
  store.unshift(idea);
  return studyAndGate(idea);
}

/**
 * F3 — Enrich an idea's study with real LLM reasoning when OPENAI_API_KEY is
 * set. The heuristic verdicts/confidence remain the deterministic base (so
 * governance stays stable and testable); the LLM adds a reasoned narrative that
 * cites the idea's numbers. Without a key it degrades to heuristic-only.
 */
export async function enrichIdea(ideaId: string): Promise<Idea | null> {
  const idea = store.find((i) => i.id === ideaId);
  if (!idea) return null;
  if (!process.env.OPENAI_API_KEY) {
    idea.studyMode = "HEURISTIC";
    persistIdea(idea);
    return idea;
  }
  try {
    const prompt = `فكرة استثمارية داخل الشركة: «${idea.title}».
الفرضية: ${idea.hypothesis}
الميزانية: ${idea.budgetSAR.toLocaleString("ar-SA")} ر.س · الأفق الزمني: ${idea.horizonDays} يوماً.
تقارير الأقسام: ${idea.recommendations.map((r) => `${r.agentName}: ${r.report}`).join(" | ")}
اكتب تحليل جدوى تنفيذياً موجزاً (4–6 أسطر) يستشهد بالأرقام، يحدّد أهم مخاطرة وأهم شرط للنجاح، وينتهي بتوصية واضحة.`;
    const narrative = await runAgent(prompt, {
      agentName: "feasibility_agent",
      system: "أنت لجنة دراسة جدوى في شركة سعودية. حلّل بأرقام الفكرة بصدق ودون مجاملة، بالعربية، ولا تذكر أنك نموذج.",
    });
    idea.aggregate = { ...(idea.aggregate as NonNullable<Idea["aggregate"]>), narrative };
    idea.studyMode = "LLM";
  } catch {
    idea.studyMode = "HEURISTIC";
  }
  persistIdea(idea);
  return idea;
}

/** Extra team participation beyond the three core studies. */
export function addRecommendation(
  ideaId: string,
  agentId: string,
  verdict: Verdict,
  note: string
): Idea | null {
  const idea = store.find((i) => i.id === ideaId);
  const agent = getAgent(agentId);
  if (!idea || !agent) return null;
  idea.recommendations.push({
    agentId: agent.id,
    agentName: agent.name,
    agentTitle: agent.title,
    verdict,
    confidence: 0.7,
    report: note,
    createdAt: new Date().toISOString(),
  });
  persistIdea(idea);
  return idea;
}

/* ── daily team idea (one executable idea per day — راصد) ── */

const DAILY_POOL: Array<Omit<SubmitIdeaInput, "source" | "proposedBy">> = [
  { title: "إطلاق متجر إلكتروني متخصص في منتج واحد رائج", hypothesis: "التركيز على منتج واحد يخفض تكلفة التسويق ويرفع التحويل.", budgetSAR: 18_000, horizonDays: 30 },
  { title: "إعادة تخزين المنتج الأعلى مبيعاً قبل الموسم", hypothesis: "الطلب الموسمي المتوقع يفوق المخزون الحالي بنسبة كبيرة.", budgetSAR: 42_000, horizonDays: 21 },
  { title: "حملة إعلانية مستهدفة على شريحة عملاء مهملة", hypothesis: "شريحة قائمة لم تُستهدف — تكلفة استحواذ متوقعة أقل من المتوسط.", budgetSAR: 9_000, horizonDays: 14 },
  { title: "برنامج ولاء بنقاط قابلة للاستبدال", hypothesis: "رفع تكرار الشراء 15% لدى العملاء الحاليين أرخص من عميل جديد.", budgetSAR: 12_000, horizonDays: 45 },
  { title: "أتمتة الرد على استفسارات العملاء المتكررة", hypothesis: "70% من التذاكر متكررة — الأتمتة تحرر طاقة فريق المبيعات.", budgetSAR: 6_500, horizonDays: 21 },
  { title: "فتح قناة بيع إضافية عبر منصة سلة", hypothesis: "قناة ثانية تضيف مبيعات دون تكلفة تشغيلية كبيرة.", budgetSAR: 15_000, horizonDays: 30 },
  { title: "اختبار تسعير ديناميكي على 3 منتجات", hypothesis: "مرونة السعر تسمح برفع الهامش دون خسارة الطلب.", budgetSAR: 4_000, horizonDays: 14 },
  { title: "باقة اشتراك شهري للمنتجات الاستهلاكية", hypothesis: "الإيراد المتكرر يرفع القيمة العمرية للعميل ويثبّت التدفق النقدي.", budgetSAR: 22_000, horizonDays: 60 },
  { title: "شراكة توزيع مع متجر مكمّل غير منافس", hypothesis: "تبادل قواعد العملاء يوسّع الوصول بتكلفة شبه صفرية.", budgetSAR: 8_000, horizonDays: 30 },
  { title: "تحسين صفحات المنتجات الأعلى زيارة وخفض الارتداد", hypothesis: "رفع التحويل 1% على الصفحات الأعلى زيارة يعادل حملة كاملة.", budgetSAR: 7_500, horizonDays: 21 },
];

function dayOfYear(d: Date): number {
  return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000);
}

/** Guarantee today's TEAM idea exists (idempotent per calendar day). */
export function ensureDailyIdea(now: Date = new Date()): Idea {
  const dayKey = now.toISOString().slice(0, 10);
  const existing = store.find((i) => i.source === "TEAM" && i.dayKey === dayKey);
  if (existing) return existing;

  const pick = DAILY_POOL[dayOfYear(now) % DAILY_POOL.length];
  // Deterministic id keyed by the day so concurrent serverless cold starts all
  // upsert the SAME row instead of creating duplicate daily ideas.
  return submitIdea({ ...pick, source: "TEAM", proposedBy: "rased", id: `idea-daily-${dayKey}`, dayKey });
}

/** Reflect inbox decisions back onto ideas (approval is the source of truth). */
export function syncIdeasWithApprovals(): void {
  const approvals = listApprovals();
  for (const idea of store) {
    if (idea.status !== "PENDING_APPROVAL" || !idea.approvalId) continue;
    const approval = approvals.find((a) => a.id === idea.approvalId);
    if (!approval) continue;
    if (approval.status === "APPROVED") {
      idea.status = "APPROVED";
      persistIdea(idea);
    } else if (approval.status === "REJECTED") {
      idea.status = "REJECTED";
      persistIdea(idea);
    }
  }
}

export function listIdeas(): Idea[] {
  syncIdeasWithApprovals();
  return store.slice(0, 100);
}

export function ideaStats() {
  return {
    total: store.length,
    pending: store.filter((i) => i.status === "PENDING_APPROVAL").length,
    approved: store.filter((i) => i.status === "APPROVED").length,
    rejected: store.filter((i) => i.status === "REJECTED").length,
    fromTeam: store.filter((i) => i.source === "TEAM").length,
  };
}

/** Test helper. */
export function _clearIdeas(): void {
  store.length = 0;
}
