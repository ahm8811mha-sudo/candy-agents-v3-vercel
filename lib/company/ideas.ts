/** Idea domain + durable repository. APIs commit through RPC before reporting success. */
import { randomUUID } from "node:crypto";
import { createApproval, listApprovals, rememberDurableApprovalRow } from "../approvals";
import { getAgent } from "./agents";
import { requiredTier } from "./governance";
import { getSupabaseAdmin } from "../supabase";
import { getTenantId } from "../tenant";
import { runAgentStructured } from "../aiStructured";
import { z } from "zod";
import { assessIdea, opportunitiesFromRecords, type IdeaAssessment, type IdeaStudyInput, type OperatingSignal } from "./ideaAssessment";

export type IdeaSource = "OWNER" | "TEAM";
export type IdeaStatus = "UNDER_STUDY" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
export type Verdict = "APPROVE" | "CONDITIONAL" | "REJECT";
export type IdeaRecommendation = {
  agentId: string; agentName: string; agentTitle: string; verdict: Verdict;
  /** Compatibility field: evidence coverage, never a probability of commercial success. */
  confidence: number; report: string; createdAt: string;
  origin?: "CALCULATION" | "MODEL" | "OWNER_NOTE";
};
export type Idea = {
  id: string; title: string; hypothesis: string; budgetSAR: number; horizonDays: number;
  source: IdeaSource; proposedBy: string; proposedByName: string; status: IdeaStatus;
  tier: string; tierLabel: string; recommendations: IdeaRecommendation[];
  aggregate?: { verdict: Verdict; confidence: number; summary: string; narrative?: string; assessment?: IdeaAssessment; generationKey?: string; analysisWarning?: string };
  studyMode?: "LLM" | "HEURISTIC";
  approvalId?: string; dayKey?: string; executedProjectId?: string; createdAt: string;
  revision?: number; decisionStatus?: string;
};
export type SubmitIdeaInput = {
  title: string; hypothesis: string; budgetSAR: number; horizonDays: number;
  source?: IdeaSource; proposedBy?: string; id?: string; dayKey?: string;
  study?: IdeaStudyInput; generationKey?: string;
};

// Compatibility snapshots for pulse/digest/learning. Refreshed on each request;
// they are never the source of truth for production writes or individual lookups.
const store: Idea[] = [];
const sar = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 });
function db() {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("اتصال قاعدة البيانات غير مهيأ. لم تُحفظ أي تغييرات.");
  return client;
}
function remember(idea: Idea) {
  const index = store.findIndex((item) => item.id === idea.id);
  if (index < 0) store.unshift(idea); else store[index] = idea;
  return idea;
}
export function ideaFromRow(r: Record<string, unknown>): Idea {
  return {
    id: String(r.id), title: String(r.title), hypothesis: String(r.hypothesis || ""),
    budgetSAR: Number(r.budget_sar || 0), horizonDays: Number(r.horizon_days || 1),
    source: r.source as IdeaSource, proposedBy: String(r.proposed_by || "owner"),
    proposedByName: String(r.proposed_by_name || "المالك"), status: r.status as IdeaStatus,
    tier: String(r.tier || ""), tierLabel: String(r.tier_label || ""),
    recommendations: (r.recommendations as IdeaRecommendation[]) || [],
    aggregate: (r.aggregate as Idea["aggregate"]) || undefined,
    studyMode: r.study_mode as Idea["studyMode"], approvalId: r.approval_id ? String(r.approval_id) : undefined,
    executedProjectId: r.executed_project_id ? String(r.executed_project_id) : undefined,
    dayKey: r.day_key ? String(r.day_key) : undefined, createdAt: String(r.created_at), revision: Number(r.revision || 0),
  };
}
function toRow(i: Idea) {
  return {
    id: i.id, title: i.title, hypothesis: i.hypothesis, budget_sar: i.budgetSAR, horizon_days: i.horizonDays,
    source: i.source, proposed_by: i.proposedBy, proposed_by_name: i.proposedByName,
    status: i.status, tier: i.tier, tier_label: i.tierLabel, recommendations: i.recommendations,
    aggregate: i.aggregate || null, study_mode: i.studyMode || "HEURISTIC", approval_id: i.approvalId || null,
    day_key: i.dayKey || null, created_at: i.createdAt,
  };
}
export async function readIdeasCritical(tenantId = getTenantId()): Promise<Idea[]> {
  const rows: Idea[] = [];
  const client = db();
  for (let offset = 0; ; offset += 250) {
    const { data, error } = await client.from("company_ideas").select("*").eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }).order("id").range(offset, offset + 249);
    if (error) throw new Error("تعذر قراءة سجل الأفكار: " + error.message);
    rows.push(...(data || []).map(ideaFromRow));
    if (!data || data.length < 250) break;
  }
  // Resolve current sign-offs independently of warm-instance memory.
  if (rows.some((item) => item.approvalId)) {
    const ids = rows.flatMap((item) => item.approvalId ? [item.approvalId] : []);
    const statuses = new Map<string, string>();
    for (let offset = 0; offset < ids.length; offset += 200) {
      const { data, error } = await client.from("company_approvals").select("id,status").eq("tenant_id", tenantId).in("id", ids.slice(offset, offset + 200));
      if (error) throw new Error("تعذر مزامنة قرارات الأفكار: " + error.message);
      for (const row of data || []) statuses.set(String(row.id), String(row.status));
    }
    for (const idea of rows) applyDecision(idea, idea.approvalId ? statuses.get(idea.approvalId) : undefined);
  }
  return rows;
}
export async function hydrateIdeas() {
  if (!getSupabaseAdmin()) return;
  const rows = await readIdeasCritical();
  store.splice(0, store.length, ...rows);
}
function applyDecision(idea: Idea, status?: string) {
  if (!status) return;
  idea.decisionStatus = status;
  if (status === "APPROVED" || status === "REJECTED") idea.status = status;
  else if (idea.approvalId && idea.aggregate?.assessment?.readyForDecision) idea.status = "PENDING_APPROVAL";
}
export async function getIdeaCritical(id: string, tenantId = getTenantId()): Promise<Idea | null> {
  const { data, error } = await db().from("company_ideas").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const idea = ideaFromRow(data);
  if (idea.approvalId) {
    const { data: approval, error: approvalError } = await db().from("company_approvals").select("status").eq("tenant_id", tenantId).eq("id", idea.approvalId).maybeSingle();
    if (approvalError) throw approvalError;
    applyDecision(idea, approval?.status);
  }
  return idea;
}

function recommendationsFor(idea: Idea, assessment: IdeaAssessment): IdeaRecommendation[] {
  const p = assessment.projections;
  const input = assessment.input;
  const reports: Array<[string, Verdict, string]> = [
    ["abdulrahman", p && (p.profitSAR < 0 || p.contributionSAR <= 0) ? "REJECT" : p && p.totalCostSAR <= idea.budgetSAR ? "APPROVE" : "CONDITIONAL",
      p ? "حسابات مبنية على الافتراضات المدخلة: إيراد " + sar.format(p.revenueSAR) + " ر.س، تكلفة " + sar.format(p.totalCostSAR) + " ر.س، نتيجة " + sar.format(p.profitSAR) + " ر.س. عند انخفاض الكمية 30% تصبح النتيجة " + sar.format(p.downsideProfitSAR) + " ر.س. هذه توقعات وليست إيراداً محققاً."
        : "لا يمكن احتساب الجدوى المالية قبل إدخال الكمية والسعر وتكلفة الوحدة والتكلفة الثابتة. لم يُفترض عائد أو ربح."],
    ["noura", input.demandEvidence && input.evidenceSource ? "APPROVE" : "CONDITIONAL",
      input.demandEvidence ? "دليل الطلب المقدم: " + input.demandEvidence + ". المصدر: " + (input.evidenceSource || "غير محدد") + ". لم يتحقق النظام مستقلاً من هذا المصدر."
        : "دليل الطلب غير متوفر. يلزم اختبار طلب موثق أو بيانات مبيعات قبل اعتبار الفرضية مثبتة."],
    ["fahad", input.executionOwner && input.successMetric && input.risks ? "APPROVE" : "CONDITIONAL",
      "المسؤول: " + (input.executionOwner || "لم يحدد") + ". مؤشر النجاح: " + (input.successMetric || "لم يحدد") + ". المخاطر: " + (input.risks || "لم تسجل") + "."],
  ];
  return reports.map(([agentId, verdict, report]) => {
    const agent = getAgent(agentId)!;
    return { agentId, agentName: agent.name, agentTitle: agent.title, verdict, confidence: assessment.coverage / 100, report, createdAt: assessment.assessedAt, origin: "CALCULATION" };
  });
}
function summarize(idea: Idea, assessment: IdeaAssessment) {
  const votes = idea.recommendations;
  const rejecting = votes.filter((r) => r.verdict === "REJECT").length;
  const approving = votes.filter((r) => r.verdict === "APPROVE").length;
  const verdict: Verdict = assessment.verdict === "REJECT" || rejecting >= 2 ? "REJECT"
    : assessment.readyForDecision && approving > votes.length / 2 && assessment.verdict === "APPROVE" ? "APPROVE" : "CONDITIONAL";
  const old = idea.aggregate;
  idea.aggregate = {
    ...old, verdict, confidence: assessment.coverage / 100, assessment,
    summary: assessment.missing.length
      ? "الدراسة غير مكتملة: " + assessment.missing.join("، ") + "."
      : verdict === "REJECT" ? "المعطيات الحالية لا تسند التنفيذ؛ يلزم تعديل الفرضيات أو رفض الفكرة."
        : verdict === "APPROVE" ? "المدخلات مكتملة والحسابات تسند تجربة ضمن الميزانية؛ يبقى الاعتماد لصاحب الصلاحية."
          : "المدخلات مكتملة مع تحفظات تتطلب قراراً صريحاً وحدوداً للتجربة.",
  };
}
function buildIdea(input: SubmitIdeaInput): Idea {
  const proposer = input.proposedBy ? getAgent(input.proposedBy) : undefined;
  const tier = requiredTier(input.budgetSAR);
  const idea: Idea = {
    id: input.id || "idea-" + randomUUID(), title: input.title.trim(), hypothesis: input.hypothesis.trim(),
    budgetSAR: Math.max(0, Math.round(input.budgetSAR)), horizonDays: Math.max(1, Math.round(input.horizonDays)),
    source: input.source || "OWNER", proposedBy: input.proposedBy || "owner", proposedByName: proposer?.name || "المالك",
    status: "UNDER_STUDY", tier: tier.tier, tierLabel: tier.label, recommendations: [],
    dayKey: input.dayKey, createdAt: new Date().toISOString(), revision: 0, studyMode: "HEURISTIC",
  };
  const assessment = assessIdea(idea.budgetSAR, input.study, input.source === "TEAM" ? "OPERATING_RECORDS" : "OWNER_ASSUMPTIONS");
  idea.recommendations = recommendationsFor(idea, assessment);
  summarize(idea, assessment);
  idea.aggregate!.generationKey = input.generationKey;
  if (assessment.readyForDecision) { idea.status = "PENDING_APPROVAL"; idea.approvalId = "apr-" + idea.id; }
  return idea;
}
async function saveAtomic(idea: Idea, tenantId: string, actor: string, expectedRevision: number | null): Promise<Idea> {
  const { data, error } = await db().rpc("orvanta_save_idea", { p_tenant_id: tenantId, p_idea: toRow(idea), p_actor: actor, p_expected_revision: expectedRevision });
  if (error) throw new Error(error.message.includes("IDEA_CONFLICT") ? "تغيرت هذه الفكرة في جلسة أخرى. حدّث الصفحة قبل إعادة الحفظ." : "تعذر حفظ الفكرة وقرارها: " + error.message);
  if (!data?.idea) throw new Error("لم تؤكد قاعدة البيانات حفظ الفكرة.");
  if (data.approval) rememberDurableApprovalRow(data.approval);
  return remember(ideaFromRow(data.idea));
}
export async function submitIdeaCritical(input: SubmitIdeaInput, tenantId = getTenantId(), actor = "المالك") {
  return saveAtomic(buildIdea(input), tenantId, actor, null);
}
export async function updateIdeaStudyCritical(id: string, study: IdeaStudyInput, tenantId = getTenantId(), actor = "المالك", budgetSAR?: number, expectedRevision?: number) {
  const idea = await getIdeaCritical(id, tenantId);
  if (!idea) throw new Error("الفكرة غير موجودة.");
  if (expectedRevision !== undefined && expectedRevision !== idea.revision) throw new Error("تغيرت الدراسة منذ فتحها. حدّث الصفحة ثم راجع التغييرات قبل الحفظ.");
  if (["APPROVED", "REJECTED"].includes(idea.status)) throw new Error("لا تُعدل دراسة فكرة صدر قرارها. أنشئ فكرة جديدة للمراجعة.");
  if (budgetSAR !== undefined) { idea.budgetSAR = budgetSAR; const tier = requiredTier(budgetSAR); idea.tier = tier.tier; idea.tierLabel = tier.label; }
  const assessment = assessIdea(idea.budgetSAR, study, idea.aggregate?.assessment?.basis);
  idea.recommendations = recommendationsFor(idea, assessment);
  // A changed study invalidates the previous model commentary and recommendation notes.
  idea.aggregate = { generationKey: idea.aggregate?.generationKey, verdict: "CONDITIONAL", confidence: 0, summary: "" };
  summarize(idea, assessment);
  idea.status = assessment.readyForDecision ? "PENDING_APPROVAL" : "UNDER_STUDY";
  if (idea.status === "PENDING_APPROVAL") idea.approvalId ||= "apr-" + idea.id;
  return saveAtomic(idea, tenantId, actor, idea.revision || 0);
}

const modelStudySchema = z.object({
  reports: z.array(z.object({ agentId: z.enum(["abdulrahman", "noura", "fahad"]), verdict: z.enum(["APPROVE", "CONDITIONAL", "REJECT"]), reasoning: z.string().min(20).max(2000) })).length(3),
  summary: z.string().min(20).max(2000),
});
export async function enrichIdea(id: string, tenantId = getTenantId(), actor = "system"): Promise<Idea | null> {
  const idea = getSupabaseAdmin() ? await getIdeaCritical(id, tenantId) : store.find((i) => i.id === id);
  if (!idea || ["APPROVED", "REJECTED"].includes(idea.status)) return idea || null;
  if (!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_API_KEY) {
    idea.aggregate ||= { verdict: "CONDITIONAL", confidence: 0, summary: "الدراسة تحتاج استكمال البيانات." };
    idea.aggregate.analysisWarning = "لم يُضبط مزود للتحليل. المعروض قراءة للمدخلات وليس تحليلاً من نموذج.";
    return getSupabaseAdmin() ? saveAtomic(idea, tenantId, actor, idea.revision || 0) : remember(idea);
  }
  if (idea.studyMode === "LLM" && idea.aggregate?.assessment?.version === 2) return idea;
  const assessment = idea.aggregate?.assessment || assessIdea(idea.budgetSAR);
  const result = await runAgentStructured(JSON.stringify({ title: idea.title, hypothesis: idea.hypothesis, budgetSAR: idea.budgetSAR, assessment }), {
    agentName: "feasibility_agent", schema: modelStudySchema,
    system: "أنت لجنة جدوى. قيّم المدخلات فقط؛ لا تخترع مصادر أو أرقاماً أو ربحاً. الافتراضات ليست حقائق. لكل قسم رأي مستقل وتحفظات محددة. نقص البيانات يستلزم CONDITIONAL أو REJECT. لا تعدّل الحسابات المرفقة.",
    schemaDescription: '{"reports":[{"agentId":"abdulrahman|noura|fahad","verdict":"APPROVE|CONDITIONAL|REJECT","reasoning":"..."}],"summary":"..."}',
    retryOnParseError: false,
  });
  if (result.ok && result.data && new Set(result.data.reports.map((r) => r.agentId)).size === 3) {
    idea.recommendations = result.data.reports.map((report) => {
      const agent = getAgent(report.agentId)!;
      return { agentId: agent.id, agentName: agent.name, agentTitle: agent.title, verdict: !assessment.readyForDecision && report.verdict === "APPROVE" ? "CONDITIONAL" : report.verdict, confidence: assessment.coverage / 100, report: report.reasoning, createdAt: new Date().toISOString(), origin: "MODEL" };
    });
    summarize(idea, assessment);
    idea.aggregate!.narrative = result.data.summary;
    idea.aggregate!.analysisWarning = undefined;
    idea.studyMode = "LLM";
  } else {
    idea.aggregate ||= { verdict: "CONDITIONAL", confidence: 0, summary: "الدراسة تحتاج استكمال البيانات." };
    idea.aggregate.analysisWarning = "تعذر الحصول على دراسة النموذج. الحسابات والبيانات المدخلة محفوظة؛ يمكن إعادة التحليل.";
  }
  return getSupabaseAdmin() ? saveAtomic(idea, tenantId, actor, idea.revision || 0) : remember(idea);
}
export async function addRecommendationCritical(id: string, agentId: string, verdict: Verdict, note: string, tenantId = getTenantId(), actor = "المالك") {
  const idea = await getIdeaCritical(id, tenantId);
  if (!idea) return null;
  if (["APPROVED", "REJECTED"].includes(idea.status)) throw new Error("صدر القرار بالفعل؛ لا يمكن تغيير توصياته.");
  addNote(idea, agentId, verdict, note);
  return saveAtomic(idea, tenantId, actor, idea.revision || 0);
}
function addNote(idea: Idea, agentId: string, verdict: Verdict, note: string) {
  const agent = getAgent(agentId);
  if (!agent) throw new Error("القسم غير موجود.");
  idea.recommendations = idea.recommendations.filter((r) => r.agentId !== agentId);
  idea.recommendations.push({ agentId, agentName: agent.name, agentTitle: agent.title, verdict, confidence: (idea.aggregate?.assessment?.coverage || 0) / 100, report: note, createdAt: new Date().toISOString(), origin: "OWNER_NOTE" });
  summarize(idea, idea.aggregate?.assessment || assessIdea(idea.budgetSAR));
}
export async function generateDailyIdeaCritical(tenantId = getTenantId(), actor = "system", now = new Date()) {
  const existing = await readIdeasCritical(tenantId);
  const dayKey = now.toISOString().slice(0, 10);
  const today = existing.find((i) => i.source === "TEAM" && i.dayKey === dayKey);
  if (today) return { idea: today, created: false, reason: "اقتراح اليوم موجود بالفعل." };
  const client = db();
  const [inventory, blocked] = await Promise.all([
    client.from("inventory_items").select("id,name,on_hand,reorder_point,unit_cost").eq("tenant_id", tenantId).limit(500),
    client.from("tasks").select("id,title").eq("tenant_id", tenantId).eq("status", "BLOCKED").order("created_at").limit(100),
  ]);
  if (inventory.error || blocked.error) throw new Error("تعذر قراءة البيانات اللازمة لرصد الفرص. لم يُنشأ اقتراح بديل غير مسند.");
  const recentKeys = new Set(existing.filter((i) => Date.parse(i.createdAt) >= now.getTime() - 30 * 86_400_000).map((i) => i.aggregate?.generationKey));
  const signals = opportunitiesFromRecords({ inventory: (inventory.data || []).map((r) => ({ ...r, on_hand: Number(r.on_hand), reorder_point: Number(r.reorder_point), unit_cost: Number(r.unit_cost) })), blockedTasks: blocked.data || [] });
  const signal = signals.find((s) => !recentKeys.has(s.key));
  if (!signal) return { idea: null, created: false, reason: "لا توجد إشارة تشغيلية جديدة كافية في بيانات المخزون والمهام. أضف بيانات أو قدّم فكرة لدراستها." };
  const idea = await submitIdeaCritical(signalInput(signal, dayKey, tenantId), tenantId, actor);
  return { idea, created: true, reason: "رُصد اقتراح من بيانات الشركة، ويحتاج استكمال الدراسة قبل الاعتماد." };
}
function signalInput(signal: OperatingSignal, dayKey: string, tenantId = getTenantId()): SubmitIdeaInput {
  return { title: signal.title, hypothesis: signal.hypothesis, budgetSAR: signal.budgetSAR, horizonDays: signal.horizonDays, source: "TEAM", proposedBy: "rased", id: "idea-daily-" + tenantId + "-" + dayKey, dayKey, generationKey: signal.key, study: { demandEvidence: signal.evidence, evidenceSource: signal.source } };
}
export async function assertIdeaDecisionReady(id: string, tenantId = getTenantId()) {
  const idea = await getIdeaCritical(id, tenantId);
  if (!idea?.aggregate?.assessment?.readyForDecision || idea.aggregate.assessment.version !== 2) {
    throw Object.assign(new Error("الدراسة غير مكتملة. استكمل بيانات الفكرة ومصادرها قبل الاعتماد."), { code: "STUDY_REQUIRED", ideaId: id });
  }
  return idea;
}

/** Pure compatibility helpers for domain tests. Production writes use the awaited functions above. */
export function submitIdea(input: SubmitIdeaInput): Idea {
  if (getSupabaseAdmin() || process.env.NODE_ENV === "production") throw new Error("Use submitIdeaCritical for durable writes.");
  const existing = input.id ? store.find((i) => i.id === input.id) : undefined;
  if (existing) return existing;
  const idea = buildIdea(input);
  if (idea.approvalId) createApproval({ id: idea.approvalId, type: "IDEA", title: "فكرة: " + idea.title, detail: idea.aggregate!.summary, amount: idea.budgetSAR, requestedRole: idea.tierLabel, metadata: { ideaId: idea.id, tier: idea.tier }, dedupeKey: "idea-" + idea.id });
  return remember(idea);
}
export function ensureDailyIdea(now = new Date(), signals: OperatingSignal[] = []): Idea | null {
  const dayKey = now.toISOString().slice(0, 10);
  const existing = store.find((i) => i.source === "TEAM" && i.dayKey === dayKey);
  if (existing) return existing;
  const signal = signals.find((s) => !store.some((i) => i.aggregate?.generationKey === s.key));
  return signal ? submitIdea(signalInput(signal, dayKey)) : null;
}
export function addRecommendation(id: string, agentId: string, verdict: Verdict, note: string): Idea | null {
  const idea = store.find((i) => i.id === id); if (!idea) return null; addNote(idea, agentId, verdict, note); return idea;
}
export function syncIdeasWithApprovals() {
  const approvals = new Map(listApprovals().map((a) => [a.id, a.status]));
  for (const idea of store) applyDecision(idea, idea.approvalId ? approvals.get(idea.approvalId) : undefined);
}
export function listIdeas(): Idea[] { syncIdeasWithApprovals(); return [...store]; }
export function listApprovedIdeas() { return listIdeas().filter((i) => i.status === "APPROVED").map((i) => ({ ...i, executed: Boolean(i.executedProjectId) })); }
export function markIdeaExecuted(id: string, projectId: string) { const idea = store.find((i) => i.id === id); if (idea) idea.executedProjectId = projectId; }
export function ideaStats(ideas: Idea[] = listIdeas()) {
  return { total: ideas.length, pending: ideas.filter((i) => i.status === "PENDING_APPROVAL").length, studying: ideas.filter((i) => i.status === "UNDER_STUDY").length, approved: ideas.filter((i) => i.status === "APPROVED").length, rejected: ideas.filter((i) => i.status === "REJECTED").length, fromTeam: ideas.filter((i) => i.source === "TEAM").length };
}
export function _clearIdeas() { store.length = 0; }
