import { z } from "zod";
import { runAgentStructured } from "../aiStructured";
import { invalidateCache } from "../cache";
import { getSupabaseAdmin } from "../supabase";
import { claimCompanyActionForExecution, updateCompanyActionStatus, type CompanyAction } from "./actionQueue";
import type { InitiativeOption, ProductCandidate, SpecialistPlan } from "./initiativePlanning";

const AGENT_EXECUTION_STALE_MS = 5 * 60_000;

const deliverableSchema = z.object({
  summary: z.string().min(20).max(1200),
  completedWork: z.array(z.string().min(3).max(350)).min(1).max(8),
  findings: z.array(z.string().min(3).max(350)).min(1).max(8),
  decisions: z.array(z.string().min(3).max(350)).min(1).max(6),
  nextActions: z.array(z.string().min(3).max(350)).max(6),
  table: z.object({ title: z.string().min(3).max(160), columns: z.array(z.string().min(1).max(80)).min(2).max(8), rows: z.array(z.array(z.string().max(300)).min(2).max(8)).max(24) }).nullable(),
  metrics: z.array(z.object({ name: z.string().min(2).max(120), value: z.string().min(1).max(120), status: z.enum(["READY", "VERIFY", "BLOCKED"]) })).max(8),
  verificationNeeded: z.array(z.string().min(3).max(300)).max(8),
});

export type AgentDeliverable = z.infer<typeof deliverableSchema> & { source: "AI" | "RULE_ENGINE"; provider: string; model: string; completedAt: string };
export type ProjectExecutionSummary = { projectId: string; status: "RESULTS_READY" | "EXECUTION_ATTENTION" | "RUNNING"; total: number; completed: number; failed: number; results: Array<{ actionId: string; role: string; title: string; status: string; deliverable: AgentDeliverable | null; error?: string }>; completedAt: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function shouldRecoverAgentAction(action: Pick<CompanyAction, "status" | "attempts" | "last_attempt_at">, now = Date.now()) {
  if (Number(action.attempts || 0) >= 3) return false;
  if (["QUEUED", "FAILED"].includes(action.status)) return true;
  if (action.status !== "RUNNING") return false;
  const lastAttemptAt = Date.parse(String(action.last_attempt_at || ""));
  return !Number.isFinite(lastAttemptAt) || lastAttemptAt <= now - AGENT_EXECUTION_STALE_MS;
}

function productTable(products: ProductCandidate[]) {
  return products.length ? { title: "جدول المنتجات المرشحة للتجربة", columns: ["الفئة", "العميل", "التوريد", "الاختبار", "قاعدة الاستبعاد"], rows: products.map((p) => [p.category, p.customer, p.sourcingModel, p.validationTest, p.rejectionRule]) } : null;
}

function optionsTable(options: InitiativeOption[]) {
  return options.length ? { title: "المقارنة المالية والتشغيلية", columns: ["الخيار", "الإيراد", "تكلفة البدء", "إشارة أولى", "المخزون", "القرار"], rows: options.map((o) => [o.title, o.revenueModel, o.setupCost, `${o.timeToSignalDays} يومًا`, o.inventoryRisk, o.verdict]) } : null;
}

function fallbackDeliverable(payload: Record<string, unknown>): AgentDeliverable {
  const plan = asRecord(payload.specialistPlan) as SpecialistPlan | null;
  const role = text(payload.role) || "SPECIALIST";
  const products = Array.isArray(payload.productCandidates) ? payload.productCandidates as ProductCandidate[] : [];
  const options = Array.isArray(payload.options) ? payload.options as InitiativeOption[] : [];
  const steps = plan?.steps || [];
  return {
    source: "RULE_ENGINE",
    provider: "orvanta-rules",
    model: "approved-plan-executor-v1",
    completedAt: new Date().toISOString(),
    summary: plan?.summary || "تم تحويل الخطة المعتمدة إلى حزمة تسليم قابلة للمراجعة.",
    completedWork: steps.map((step) => `${step.title}: ${step.deliverable}`),
    findings: plan?.findings || ["لا توجد نتيجة تخصصية محفوظة."],
    decisions: [plan?.recommendation || text(payload.finalRecommendation) || "الاستمرار وفق الخطة المعتمدة."],
    nextActions: steps.map((step) => `تحقق المكتب من «${step.deliverable}» في اليوم ${step.dueDay}.`).slice(0, 6),
    table: role === "MARKET" ? productTable(products) : role === "FINANCE" ? optionsTable(options) : null,
    metrics: steps.map((step) => ({ name: step.kpi, value: "مخرج جاهز للمراجعة", status: "READY" as const })).slice(0, 8),
    verificationNeeded: ["التحقق من الرسوم والأسعار وشروط المنصة عبر مصدر رسمي قبل الصرف الخارجي.", ...((plan?.assumptions || []).slice(0, 3))],
  };
}

async function generateDeliverable(action: CompanyAction): Promise<AgentDeliverable> {
  const payload = asRecord(action.payload) || {};
  const roleLabel = text(payload.roleLabel) || text(payload.role) || "الوكيل المختص";
  const response = await runAgentStructured(
    [`تم اعتماد المبادرة: ${text(payload.request)}`, `نفّذ حزمة ${roleLabel} ولا تعِد التخطيط.`, `الخطة: ${JSON.stringify(payload.specialistPlan || null).slice(0, 6500)}`, `التجربة: ${JSON.stringify(payload.experiment || null).slice(0, 2600)}`, "أعد العمل المنجز والنتائج والقرارات والمؤشرات وما يحتاج تحققًا. لا تدّع اتصالًا أو إعلانًا لم يوجد دليله."].join("\n"),
    { agentName: text(payload.agentName) || "initiative_execution_agent", system: `أنت وكيل ${roleLabel} في Orvanta وتنتج تسليمًا مهنيًا للمكتب التنفيذي.`, schema: deliverableSchema, schemaDescription: '{"summary":"...","completedWork":["..."],"findings":["..."],"decisions":["..."],"nextActions":["..."],"table":null,"metrics":[{"name":"...","value":"...","status":"READY"}],"verificationNeeded":["..."]}', retryOnParseError: false }
  );
  if (!response.data) return fallbackDeliverable(payload);
  return { ...response.data, source: "AI", provider: response.provider, model: response.model, completedAt: new Date().toISOString() };
}

async function updateAgentTasks(action: CompanyAction, status: "DONE" | "BLOCKED", tenantId?: string) {
  const supabase = getSupabaseAdmin();
  const payload = asRecord(action.payload) || {};
  const role = text(payload.role);
  if (!supabase || !action.project_id || !role) return;
  let update = supabase.from("tasks").update({ status, progress_percent: status === "DONE" ? 100 : 0, updated_at: new Date().toISOString() }).eq("project_id", action.project_id).contains("metadata", { executionAgent: role });
  if (tenantId) update = update.eq("tenant_id", tenantId);
  const { error } = await update;
  if (error) throw new Error(`Agent task update failed: ${error.message}`);
}

export async function executeInternalAgentAction(id: string, actor = "executive-office", tenantId?: string) {
  const claimed = await claimCompanyActionForExecution(id, actor, tenantId);
  if (claimed.status === "DONE" && asRecord(asRecord(claimed.result)?.deliverable)) return claimed;
  try {
    const deliverable = await generateDeliverable(claimed);
    const completed = await updateCompanyActionStatus({ id: claimed.id, tenantId, status: "DONE", actor, result: { deliverable, execution: { kind: "INTERNAL_AGENT", source: deliverable.source, provider: deliverable.provider, model: deliverable.model, completedAt: deliverable.completedAt } }, note: "Agent deliverable returned to the executive office" });
    await updateAgentTasks(completed, "DONE", tenantId);
    return completed;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1500) : String(error).slice(0, 1500);
    await updateCompanyActionStatus({ id: claimed.id, tenantId, status: "FAILED", actor, error: message, note: "Agent deliverable failed" }).catch(() => undefined);
    await updateAgentTasks(claimed, "BLOCKED", tenantId).catch(() => undefined);
    throw error;
  }
}

function resultDeliverable(action: CompanyAction) {
  const value = asRecord(asRecord(action.result)?.deliverable);
  return value ? value as AgentDeliverable : null;
}

export async function executeProjectInternalActions(projectId: string, actor = "executive-office", tenantId?: string): Promise<ProjectExecutionSummary> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required for autonomous project execution.");
  let initialQuery = supabase.from("business_actions").select("*").eq("project_id", projectId).eq("action_type", "AGENT_DELIVERABLE").eq("execution_mode", "INTERNAL").eq("provider", "orvanta_agents").order("created_at", { ascending: true });
  if (tenantId) initialQuery = initialQuery.eq("tenant_id", tenantId);
  const { data: initial, error } = await initialQuery;
  if (error) throw new Error(`Unable to load agent work: ${error.message}`);
  const actions = (initial || []) as CompanyAction[];
  await Promise.allSettled(actions.map((action) => ["QUEUED", "FAILED", "WAITING_INTEGRATION"].includes(action.status) ? executeInternalAgentAction(action.id, actor, tenantId) : Promise.resolve(action)));
  let refreshedQuery = supabase.from("business_actions").select("*").eq("project_id", projectId).eq("action_type", "AGENT_DELIVERABLE").eq("execution_mode", "INTERNAL").eq("provider", "orvanta_agents").order("created_at", { ascending: true });
  if (tenantId) refreshedQuery = refreshedQuery.eq("tenant_id", tenantId);
  const { data: refreshed, error: refreshError } = await refreshedQuery;
  if (refreshError) throw new Error(`Unable to refresh agent work: ${refreshError.message}`);
  const finalActions = (refreshed || []) as CompanyAction[];
  const completed = finalActions.filter((a) => a.status === "DONE").length;
  const failed = finalActions.filter((a) => a.status === "FAILED").length;
  const status = finalActions.length === 0 ? "EXECUTION_ATTENTION" : completed === finalActions.length ? "RESULTS_READY" : failed > 0 ? "EXECUTION_ATTENTION" : "RUNNING";
  const summary: ProjectExecutionSummary = { projectId, status, total: finalActions.length, completed, failed, results: finalActions.map((action) => ({ actionId: action.id, role: text(asRecord(action.payload)?.role), title: action.title, status: action.status, deliverable: resultDeliverable(action), ...(action.error ? { error: action.error } : {}) })), completedAt: new Date().toISOString() };
  let projectQuery = supabase.from("projects").select("financial_snapshot").eq("id", projectId);
  if (tenantId) projectQuery = projectQuery.eq("tenant_id", tenantId);
  const { data: project } = await projectQuery.maybeSingle();
  const snapshot = asRecord(project?.financial_snapshot) || {};
  let projectUpdate = supabase.from("projects").update({ status, financial_snapshot: { ...snapshot, delivery: summary }, updated_at: new Date().toISOString() }).eq("id", projectId);
  if (tenantId) projectUpdate = projectUpdate.eq("tenant_id", tenantId);
  const { error: projectError } = await projectUpdate;
  if (projectError) throw new Error(`Unable to publish executive results: ${projectError.message}`);
  invalidateCache("dashboard-data");
  return summary;
}

export async function recoverPendingAgentProjects(tenantId: string, projectLimit = 1) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required for agent execution recovery.");
  const { data, error } = await supabase.from("business_actions").select("id,project_id,status,attempts,last_attempt_at").eq("tenant_id", tenantId).eq("action_type", "AGENT_DELIVERABLE").eq("execution_mode", "INTERNAL").eq("provider", "orvanta_agents").in("status", ["QUEUED", "FAILED", "RUNNING"]).lt("attempts", 3).order("created_at", { ascending: true }).limit(25);
  if (error) throw new Error(`Unable to load pending agent projects: ${error.message}`);
  const eligible = ((data || []) as Array<Pick<CompanyAction, "id" | "project_id" | "status" | "attempts" | "last_attempt_at">>).filter((action) => shouldRecoverAgentAction(action));
  const projectIds: string[] = [];
  for (const action of eligible) {
    const projectId = text(action.project_id);
    if (!projectId) continue;
    if (action.status !== "RUNNING") { projectIds.push(projectId); continue; }
    let reset = supabase.from("business_actions").update({ status: "FAILED", error: "Recovered after an internal agent execution timeout.", updated_at: new Date().toISOString() }).eq("id", action.id).eq("tenant_id", tenantId).eq("status", "RUNNING");
    reset = action.last_attempt_at ? reset.eq("last_attempt_at", action.last_attempt_at) : reset.is("last_attempt_at", null);
    const { data: recovered, error: recoveryError } = await reset.select("project_id").maybeSingle();
    if (recoveryError) throw new Error(`Unable to recover timed-out agent work: ${recoveryError.message}`);
    if (recovered?.project_id) projectIds.push(String(recovered.project_id));
  }
  const selected = Array.from(new Set(projectIds)).slice(0, Math.max(1, Math.min(projectLimit, 3)));
  const results = [];
  for (const projectId of selected) results.push(await executeProjectInternalActions(projectId, "company-os-recovery", tenantId));
  return { selected: selected.length, results };
}
