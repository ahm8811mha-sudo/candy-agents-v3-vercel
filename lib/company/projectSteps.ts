/**
 * Project steps: who owns each one, what may run without a decision, and what
 * has gone quiet.
 *
 * Project #5 (Amazon factories) sat for three months with every one of its 13
 * steps BLOCKED. The plan was created with all steps BLOCKED behind a single
 * 5,000 SAR project approval; when that approval was rejected the decision RPC
 * left every step BLOCKED, including the analysis steps that cost nothing. No
 * agent ever saw the steps (the bridge only looked at tasks.assigned_to, and
 * project steps carry owner_role), the overdue rules skipped BLOCKED tasks, and
 * the Chairman digest counted commands only. This module closes each of those:
 *
 * - a step that spends nothing never waits for a decision: it is released to
 *   TODO and routed to the employee who owns its role;
 * - a step that spends money waits in WAITING_FUNDING for the spend chain
 *   (department, then Abdulrahman and Hares, then Sultan, then the Chairman);
 * - duplicate steps (two specialists planning the same work) are merged;
 * - an overdue step is escalated to Sultan once a day until it moves;
 * - the digest counts stuck and overdue steps.
 */

import { getSupabaseAdmin } from "../supabase";
import { getTenantId } from "../tenant";
import { isOwnerConfirmed, isRealWorldTask, REAL_WORLD_AGENT_PROGRESS_CAP } from "./executionHonesty";

export type StepRow = {
  id: string;
  project_id: string | null;
  title: string;
  description?: string | null;
  content?: string | null;
  status: string;
  priority?: string | null;
  owner_role?: string | null;
  due_date?: string | null;
  progress_percent?: number | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** The planning roles and the employee who answers for each. */
const ROLE_AGENT: Array<[RegExp, string]> = [
  [/cfo|financ|مالي|المالية/i, "abdulrahman"],
  [/risk|governance|مخاطر|حوكمة/i, "hares"],
  [/legal|compliance|امتثال|قانون/i, "majed"],
  [/supply|procure|purchas|مشتريات|موردين|إمداد/i, "khalid"],
  [/operation|تشغيل|عمليات/i, "fahad"],
  [/market|growth|تسويق|نمو/i, "noura"],
  [/sales|revenue|مبيعات|إيراد/i, "sara"],
  [/strategy|استراتيج|فرص/i, "rased"],
  [/account|محاسب/i, "ameen"],
  [/ceo|executive|تنفيذي/i, "sultan"],
];

const EXECUTION_AGENT: Record<string, string> = {
  MARKET: "noura",
  FINANCE: "abdulrahman",
  OPERATIONS: "fahad",
  PROCUREMENT: "khalid",
  RISK: "hares",
};

const OPEN = new Set(["TODO", "OPEN", "IN_PROGRESS", "REVIEW", "BLOCKED", "WAITING_FUNDING", "ON_HOLD"]);
const STUCK = new Set(["BLOCKED", "WAITING_FUNDING", "ON_HOLD"]);

function meta(task: Pick<StepRow, "metadata">): Record<string, unknown> {
  return task.metadata && typeof task.metadata === "object" ? task.metadata : {};
}

export function isDuplicateStep(task: Pick<StepRow, "metadata">): boolean {
  return typeof meta(task).duplicateOf === "string";
}

/** The employee who owns a step: explicit assignment, then the owning role. */
export function stepAgent(task: Pick<StepRow, "owner_role" | "metadata">): string {
  const metadata = meta(task);
  if (typeof metadata.assignedAgent === "string" && metadata.assignedAgent) return metadata.assignedAgent;
  const role = String(task.owner_role || "");
  for (const [pattern, agent] of ROLE_AGENT) if (pattern.test(role)) return agent;
  const execution = EXECUTION_AGENT[String(metadata.executionAgent || "")];
  return execution || "sultan";
}

/** Only a step that spends money needs the spend chain. */
export function isSpendStep(task: Pick<StepRow, "status" | "metadata">): boolean {
  const metadata = meta(task);
  return metadata.requiresFunding === true || String(metadata.requiresFunding) === "true"
    || Number(metadata.estimatedCostSAR || 0) > 0
    || String(task.status).toUpperCase() === "WAITING_FUNDING";
}

export function isOpenStep(task: Pick<StepRow, "status" | "metadata">): boolean {
  return OPEN.has(String(task.status).toUpperCase()) && !isDuplicateStep(task);
}

export function isOverdueStep(task: Pick<StepRow, "status" | "due_date" | "metadata">, today = new Date().toISOString().slice(0, 10)): boolean {
  if (!task.due_date || !isOpenStep(task)) return false;
  // A real-world step whose paperwork is ready waits on the owner, not the employee.
  if (String(task.status).toUpperCase() === "REVIEW" && meta(task).readyForOwner) return false;
  return String(task.due_date).slice(0, 10) < today;
}

const STOP = new Set(["و", "في", "من", "على", "مع", "the", "and", "of", "for"]);

function tokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[()\[\]،,.:؛\-–—/]/g, " ")
    .replace(/[إأآ]/g, "ا")
    .replace(/ة/g, "ه")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 1 && !STOP.has(word));
}

/** Two steps plan the same work: one title contains the other, or they share most words. */
export function sameWork(left: string, right: string): boolean {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.length || !b.length) return false;
  const setA = new Set(a);
  const setB = new Set(b);
  const shared = a.filter((word) => setB.has(word)).length;
  const smaller = Math.min(setA.size, setB.size);
  if (smaller >= 2 && shared >= smaller) return true;
  const union = new Set([...a, ...b]).size;
  return shared >= 3 && shared / union >= 0.55;
}

/** Duplicates within one project: the more specific (longer) title is kept. */
export function findDuplicateSteps(tasks: StepRow[]): Array<{ keep: StepRow; drop: StepRow }> {
  const live = tasks.filter((task) => !isDuplicateStep(task));
  const dropped = new Set<string>();
  const pairs: Array<{ keep: StepRow; drop: StepRow }> = [];
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const a = live[i];
      const b = live[j];
      if (dropped.has(a.id) || dropped.has(b.id)) continue;
      if (a.project_id !== b.project_id || !sameWork(a.title, b.title)) continue;
      const aDone = ["DONE", "ARCHIVED"].includes(String(a.status).toUpperCase());
      const bDone = ["DONE", "ARCHIVED"].includes(String(b.status).toUpperCase());
      const keepA = aDone !== bDone ? aDone : a.title.length >= b.title.length;
      const keep = keepA ? a : b;
      const drop = keepA ? b : a;
      dropped.add(drop.id);
      pairs.push({ keep, drop });
    }
  }
  return pairs;
}

export type StepPlan = {
  release: Array<{ id: string; agent: string; title: string }>;
  toFunding: Array<{ id: string; title: string }>;
  duplicates: Array<{ keepId: string; dropId: string; title: string }>;
  overdue: Array<{ id: string; agent: string; title: string; dueDate: string }>;
};

/** What the sweep would do to a project's steps; pure, so it is testable. */
export function planStepSweep(tasks: StepRow[], today = new Date().toISOString().slice(0, 10)): StepPlan {
  const duplicates = findDuplicateSteps(tasks);
  const dropIds = new Set(duplicates.map((pair) => pair.drop.id));
  const live = tasks.filter((task) => !isDuplicateStep(task) && !dropIds.has(task.id));
  const release: StepPlan["release"] = [];
  const toFunding: StepPlan["toFunding"] = [];
  for (const task of live) {
    if (String(task.status).toUpperCase() !== "BLOCKED") continue;
    if (meta(task).manualHold === true) continue;
    if (isSpendStep(task)) toFunding.push({ id: task.id, title: task.title });
    else release.push({ id: task.id, agent: stepAgent(task), title: task.title });
  }
  const released = new Set(release.map((item) => item.id));
  const overdue = live
    .filter((task) => isOverdueStep(released.has(task.id) ? { ...task, status: "TODO" } : task, today))
    .map((task) => ({ id: task.id, agent: stepAgent(task), title: task.title, dueDate: String(task.due_date).slice(0, 10) }));
  return {
    release,
    toFunding,
    duplicates: duplicates.map((pair) => ({ keepId: pair.keep.id, dropId: pair.drop.id, title: pair.drop.title })),
    overdue,
  };
}

async function loadSteps(tenantId: string, projectIds?: string[]) {
  const client = getSupabaseAdmin();
  if (!client) return { client: null, projects: [] as Record<string, unknown>[], tasks: [] as StepRow[] };
  const projects: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 250) {
    let query = client.from("projects").select("id,name,status,project_number,budget,approval_status,approved_budget,created_at").eq("tenant_id", tenantId);
    if (projectIds?.length) query = query.in("id", projectIds);
    const { data, error } = await query.order("created_at", { ascending: false }).order("id").range(offset, offset + 249);
    if (error) throw error;
    projects.push(...(data || []));
    if (!data || data.length < 250) break;
  }
  const tasks: StepRow[] = [];
  for (let batch = 0; batch < projects.length; batch += 100) {
    const ids = projects.slice(batch, batch + 100).map((project) => String(project.id));
    for (let offset = 0; ; offset += 250) {
      const { data, error } = await client.from("tasks")
        .select("id,project_id,title,description,content,status,priority,owner_role,due_date,progress_percent,created_at,metadata")
        .eq("tenant_id", tenantId).in("project_id", ids).order("created_at").order("id").range(offset, offset + 249);
      if (error) throw error;
      tasks.push(...((data || []) as StepRow[]));
      if (!data || data.length < 250) break;
    }
  }
  return { client, projects, tasks };
}

export type ProjectStepView = {
  id: string;
  title: string;
  status: string;
  ownerRole: string | null;
  agent: string;
  dueDate: string | null;
  overdue: boolean;
  spend: boolean;
  realWorld: boolean;
  progress: number;
  duplicateOf: string | null;
  output: string | null;
  outputBy: string | null;
  outputAt: string | null;
};

function stepView(task: StepRow, today: string): ProjectStepView {
  const metadata = meta(task);
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    ownerRole: task.owner_role || null,
    agent: stepAgent(task),
    dueDate: task.due_date ? String(task.due_date).slice(0, 10) : null,
    overdue: isOverdueStep(task, today),
    spend: isSpendStep(task),
    realWorld: isRealWorldTask(task),
    progress: Number(task.progress_percent || 0),
    duplicateOf: typeof metadata.duplicateOf === "string" ? metadata.duplicateOf : null,
    output: typeof metadata.output === "string" ? metadata.output : null,
    outputBy: typeof metadata.outputBy === "string" ? metadata.outputBy : null,
    outputAt: typeof metadata.outputAt === "string" ? metadata.outputAt : null,
  };
}

/** Every project with its steps, plus what is stuck; read-only. */
export async function projectStepsReport(tenantId = getTenantId(), options: { includeOutputs?: boolean; projectId?: string } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const { projects, tasks } = await loadSteps(tenantId, options.projectId ? [options.projectId] : undefined);
  const byProject = new Map<string, StepRow[]>();
  for (const task of tasks) {
    const key = String(task.project_id || "");
    byProject.set(key, [...(byProject.get(key) || []), task]);
  }
  const rows = projects.map((project) => {
    const steps = (byProject.get(String(project.id)) || []).map((task) => stepView(task, today));
    const live = steps.filter((step) => !step.duplicateOf);
    const open = live.filter((step) => OPEN.has(step.status.toUpperCase()));
    return {
      id: String(project.id),
      number: (project.project_number as number | null) ?? null,
      name: String(project.name || ""),
      status: String(project.status || ""),
      approvalStatus: (project.approval_status as string | null) ?? null,
      budgetSAR: Number(project.budget || 0) || null,
      approvedBudgetSAR: Number(project.approved_budget || 0) || 0,
      counts: {
        total: live.length,
        open: open.length,
        stuck: live.filter((step) => STUCK.has(step.status.toUpperCase())).length,
        overdue: live.filter((step) => step.overdue).length,
        done: live.filter((step) => ["DONE", "ARCHIVED"].includes(step.status.toUpperCase())).length,
        review: live.filter((step) => step.status.toUpperCase() === "REVIEW").length,
        duplicates: steps.length - live.length,
      },
      steps: options.includeOutputs ? steps : steps.map((step) => ({ ...step, output: step.output ? `${step.output.slice(0, 280)}${step.output.length > 280 ? "…" : ""}` : null })),
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      projects: rows.length,
      openSteps: rows.reduce((sum, row) => sum + row.counts.open, 0),
      stuckSteps: rows.reduce((sum, row) => sum + row.counts.stuck, 0),
      overdueSteps: rows.reduce((sum, row) => sum + row.counts.overdue, 0),
      stuckProjects: rows.filter((row) => row.counts.stuck > 0 || row.counts.overdue > 0).map((row) => ({ id: row.id, number: row.number, name: row.name.slice(0, 120), stuck: row.counts.stuck, overdue: row.counts.overdue })),
    },
    projects: rows,
  };
}

/** Steps an employee owns and can work on now. */
export async function stepsForAgent(agentId: string, tenantId = getTenantId()) {
  const report = await projectStepsReport(tenantId);
  return report.projects.flatMap((project) => project.steps
    .filter((step) => !step.duplicateOf && step.agent === agentId && OPEN.has(step.status.toUpperCase()))
    .map((step) => ({ ...step, projectId: project.id, projectNumber: project.number, projectName: project.name.slice(0, 140) })));
}

type Notify = (agentId: string, body: string) => Promise<void>;

/**
 * Applies the sweep: releases no-spend steps to their owners, moves spend steps
 * to WAITING_FUNDING, merges duplicates, reactivates a project whose only
 * obstacle was a blanket rejection, and escalates overdue steps to Sultan once
 * per day per step.
 */
export async function sweepProjectSteps(options: { tenantId?: string; projectId?: string; notify?: Notify; actor?: string; reactivate?: boolean } = {}) {
  const tenantId = options.tenantId || getTenantId();
  const { client, projects, tasks } = await loadSteps(tenantId, options.projectId ? [options.projectId] : undefined);
  const summary = { released: 0, toFunding: 0, duplicates: 0, escalated: 0, reactivated: [] as string[], projects: projects.length };
  if (!client) return summary;
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const actor = options.actor || "project-sweep";
  const byId = new Map(tasks.map((task) => [task.id, task]));

  for (const project of projects) {
    const projectTasks = tasks.filter((task) => task.project_id === project.id);
    if (!projectTasks.length) continue;
    const status = String(project.status || "").toUpperCase();
    // Closed projects are left alone unless explicitly reactivated.
    if (["CANCELLED", "ARCHIVED", "CLOSED", "COMPLETED"].includes(status) && !options.reactivate) continue;
    // The scheduled sweep (no projectId) leaves projects rejected before this
    // rule alone; they are reactivated one by one (bridge "reactivate"). A
    // decision taken from now on runs the sweep for its own project.
    if (status === "REJECTED" && !options.projectId && !options.reactivate) continue;
    const plan = planStepSweep(projectTasks, today);

    for (const pair of plan.duplicates) {
      const drop = byId.get(pair.dropId)!;
      const keep = byId.get(pair.keepId)!;
      const keepMeta = meta(keep);
      const merged = Array.isArray(keepMeta.mergedFrom) ? keepMeta.mergedFrom : [];
      await client.from("tasks").update({
        status: "ARCHIVED",
        metadata: { ...meta(drop), duplicateOf: keep.id, duplicateMergedAt: now, duplicateMergedBy: actor, statusBeforeMerge: drop.status },
        updated_at: now,
      }).eq("id", drop.id).eq("tenant_id", tenantId);
      await client.from("tasks").update({
        metadata: { ...keepMeta, mergedFrom: [...merged, { id: drop.id, title: drop.title, ownerRole: drop.owner_role || null, detail: String(drop.description || drop.content || "").slice(0, 600) }] },
        updated_at: now,
      }).eq("id", keep.id).eq("tenant_id", tenantId);
      keep.metadata = { ...keepMeta, mergedFrom: [...merged, { id: drop.id }] };
      summary.duplicates += 1;
    }

    for (const item of plan.release) {
      const task = byId.get(item.id)!;
      await client.from("tasks").update({
        status: "TODO",
        metadata: { ...meta(task), assignedAgent: item.agent, releasedAt: now, releasedBy: actor, releaseReason: "خطوة بلا صرف: لا تحتاج اعتماداً وتُسند لمالكها مباشرة." },
        updated_at: now,
      }).eq("id", item.id).eq("tenant_id", tenantId).eq("status", "BLOCKED");
      summary.released += 1;
      if (options.notify) await options.notify(item.agent, `خطوة مسندة إليك في مشروع #${project.project_number ?? "؟"}: «${item.title}». نفّذها وسلّم المخرج عبر الجسر (kind: step, action: deliver).`).catch(() => undefined);
    }

    for (const item of plan.toFunding) {
      const task = byId.get(item.id)!;
      await client.from("tasks").update({ status: "WAITING_FUNDING", metadata: { ...meta(task), requiresFunding: true }, updated_at: now })
        .eq("id", item.id).eq("tenant_id", tenantId).eq("status", "BLOCKED");
      summary.toFunding += 1;
    }

    // A project rejected as a whole, or left pending, while it still has work
    // that needs no money is active: the rejection stops the spend, not the study.
    if ((plan.release.length || options.reactivate) && ["REJECTED", "PENDING_APPROVAL", "EXECUTION_ATTENTION", ""].includes(status)) {
      await client.from("projects").update({ status: "ACTIVE", updated_at: now }).eq("id", project.id).eq("tenant_id", tenantId);
      summary.reactivated.push(String(project.id));
    }

    for (const item of plan.overdue) {
      const task = byId.get(item.id)!;
      const metadata = meta(task);
      if (String(metadata.escalatedOn || "") === today) continue;
      await client.from("tasks").update({ metadata: { ...metadata, escalatedOn: today, escalatedTo: "sultan", escalations: Number(metadata.escalations || 0) + 1 }, updated_at: now })
        .eq("id", item.id).eq("tenant_id", tenantId);
      summary.escalated += 1;
      if (options.notify) await options.notify("sultan", `تصعيد تأخر: خطوة «${item.title}» في مشروع #${project.project_number ?? "؟"} لدى ${item.agent} تجاوزت موعدها (${item.dueDate}). تابعها معه حتى تُسلَّم.`).catch(() => undefined);
    }
  }
  return summary;
}

const deliverSchemaLimits = { output: 60_000 };

/**
 * An employee hands in a step's deliverable. Internal work closes at 100%;
 * real-world work stops at REVIEW with capped progress until the owner confirms.
 */
export async function deliverStep(agentId: string, input: { taskId: string; output: string; sources?: string[]; master?: boolean; progressOnly?: boolean }, tenantId = getTenantId()) {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("تسليم الخطوات يتطلب قاعدة البيانات.");
  const output = String(input.output || "").trim();
  if (output.length < 40) throw new Error("المخرج قصير جداً؛ سلّم العمل نفسه لا وصفه.");
  if (output.length > deliverSchemaLimits.output) throw new Error("المخرج أطول من الحد المسموح.");
  const { data, error } = await client.from("tasks").select("id,project_id,title,status,owner_role,progress_percent,metadata").eq("id", input.taskId).eq("tenant_id", tenantId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("الخطوة غير موجودة.");
  const task = data as StepRow;
  const owner = stepAgent(task);
  if (owner !== agentId && !input.master) throw new Error("هذه الخطوة ليست مسندة إليك.");
  if (isDuplicateStep(task)) throw new Error("هذه الخطوة مدموجة في خطوة أخرى.");
  const status = String(task.status).toUpperCase();
  if (status === "WAITING_FUNDING" || status === "ON_HOLD") throw new Error("خطوة صرف: لا تُنفَّذ قبل قرار رئيس مجلس الإدارة.");
  const metadata = meta(task);
  const now = new Date().toISOString();
  const realWorld = isRealWorldTask(task);
  const history = Array.isArray(metadata.outputHistory) ? metadata.outputHistory.slice(-4) : [];
  const nextMeta: Record<string, unknown> = {
    ...metadata,
    assignedAgent: owner,
    output,
    outputBy: agentId,
    outputAt: now,
    outputSources: (input.sources || []).slice(0, 40),
    outputHistory: typeof metadata.output === "string" ? [...history, { at: metadata.outputAt, by: metadata.outputBy, length: String(metadata.output).length }] : history,
  };
  let nextStatus: string;
  let progress: number;
  if (input.progressOnly) {
    nextStatus = "IN_PROGRESS";
    progress = Math.max(Number(task.progress_percent || 0), 30);
  } else if (realWorld && !isOwnerConfirmed(task)) {
    nextStatus = "REVIEW";
    progress = REAL_WORLD_AGENT_PROGRESS_CAP;
    nextMeta.readyForOwner = true;
    nextMeta.agentCompletedAt = now;
  } else {
    nextStatus = "DONE";
    progress = 100;
  }
  const { error: updateError } = await client.from("tasks").update({
    status: nextStatus,
    progress_percent: progress,
    metadata: nextMeta,
    updated_at: now,
    ...(nextStatus === "DONE" ? { completed_at: now } : {}),
  }).eq("id", task.id).eq("tenant_id", tenantId);
  if (updateError) throw updateError;
  return { taskId: task.id, projectId: task.project_id, title: task.title, status: nextStatus, progress, realWorld };
}

const KEEP_ON_DECISION = new Set(["IN_PROGRESS", "REVIEW", "DONE", "ARCHIVED", "WAITING_FUNDING", "ON_HOLD"]);

/** Step states before a project decision, so the decision cannot erase work. */
export async function snapshotProjectSteps(projectId: string, tenantId = getTenantId()) {
  const client = getSupabaseAdmin();
  if (!client) return [];
  const { data, error } = await client.from("tasks").select("id,status,progress_percent").eq("project_id", projectId).eq("tenant_id", tenantId);
  if (error) throw error;
  return ((data || []) as Array<{ id: string; status: string; progress_percent: number | null }>)
    .filter((row) => KEEP_ON_DECISION.has(String(row.status).toUpperCase()));
}

export async function restoreProgressedSteps(snapshot: Array<{ id: string; status: string; progress_percent: number | null }>, tenantId = getTenantId()) {
  const client = getSupabaseAdmin();
  if (!client) return 0;
  for (const row of snapshot) {
    await client.from("tasks").update({ status: row.status, progress_percent: row.progress_percent ?? 0 }).eq("id", row.id).eq("tenant_id", tenantId);
  }
  return snapshot.length;
}

/** Master-only correction of a step: reassign its owner or fix its execution kind. */
export async function updateStepRouting(input: { taskId: string; agentId?: string; executionKind?: "INTERNAL" | "REAL_WORLD"; actor: string }, tenantId = getTenantId()) {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("يتطلب قاعدة البيانات.");
  const { data, error } = await client.from("tasks").select("id,status,metadata").eq("id", input.taskId).eq("tenant_id", tenantId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("الخطوة غير موجودة.");
  const metadata = meta(data as StepRow);
  const status = String((data as StepRow).status).toUpperCase();
  if (input.executionKind === "INTERNAL" && metadata.executionKind === "REAL_WORLD" && ["DONE", "REVIEW"].includes(status)) {
    throw new Error("لا تُحوَّل خطوة فعلية إلى داخلية بعد تسليمها.");
  }
  const next = {
    ...metadata,
    ...(input.agentId ? { assignedAgent: input.agentId, reassignedBy: input.actor, reassignedAt: new Date().toISOString() } : {}),
    ...(input.executionKind ? { executionKind: input.executionKind } : {}),
  };
  const { error: updateError } = await client.from("tasks").update({ metadata: next, updated_at: new Date().toISOString() }).eq("id", input.taskId).eq("tenant_id", tenantId);
  if (updateError) throw updateError;
  return { taskId: input.taskId, agent: stepAgent({ owner_role: null, metadata: next }), executionKind: next.executionKind || "INTERNAL" };
}
