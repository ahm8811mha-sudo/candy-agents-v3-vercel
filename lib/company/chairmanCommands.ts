/**
 * Commands the Chairman issues in the site become tracked work.
 * The owning employee plans the work, runs non-financial steps, and pulls
 * finance, governance and Sultan through the spend chain when money is
 * involved. External messages stay blocked until the Chairman approves them.
 * Rayyan (diwan) keeps a commitment until the command closes with evidence.
 */

import { COMPANY_AGENTS, getAgent, sectorLeadOf } from "./agents";
import { createApproval } from "../approvals";
import { advanceCommitment, openDecisionCommitment } from "./executiveSecretariat";
import { EMPLOYEE_SOPS } from "../employee-runtime/sops";
import { getSupabaseAdmin } from "../supabase";
import { getTenantId } from "../tenant";
import { createTask } from "../repository";
import {
  blankSpendChain,
  isMonetarySpend,
  type SpendChainState,
} from "./spendChain";
import { appendWorkEvent } from "./workEvents";

export type CommandStepStatus = "PENDING" | "DONE" | "BLOCKED";
export type CommandStepKind = "INTERNAL" | "EXTERNAL" | "SPEND" | "DECISION";
export type CommandPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type ChairmanCommandStatus = "OPEN" | "IN_PROGRESS" | "BLOCKED" | "AWAITING_CHAIRMAN" | "IN_SPEND_CHAIN" | "CLOSED";

export type CommandStep = {
  id: string;
  title: string;
  ownerAgentId: string;
  kind: CommandStepKind;
  status: CommandStepStatus;
  evidence: string | null;
};

export type DiwanCommitment = {
  id: string | null;
  status: "OPEN" | "COMPLETED";
  assigneeId: string;
  evidence: string | null;
  openedAt: string;
  closedAt: string | null;
};

/** The Chairman's answer to a decision card on a command. Spend is decided on the approval, not here. */
export type ChairmanDecisionChoice = "approve" | "reject" | "return" | "defer" | "renew";

export type CommandDecision = {
  status: "PENDING" | "APPROVED" | "REJECTED" | "RETURNED" | "DEFERRED";
  stepId: string;
  kind: "decision" | "external";
  requestedAt: string;
  deferredUntil: string | null;
  decidedAt: string | null;
  note: string | null;
  returns: number;
};

export type CommandTriage = {
  status: "PENDING" | "DONE";
  confidence: number;
  suggestedOwnerId: string | null;
  by: string | null;
  at: string | null;
};

export type ChairmanCommand = {
  id: string;
  text: string;
  ownerAgentId: string;
  collaborators: string[];
  sopId: string | null;
  status: ChairmanCommandStatus;
  currentStep: string;
  blockers: string[];
  steps: CommandStep[];
  resultReport: string | null;
  spendApprovalId: string | null;
  taskId: string | null;
  diwan: DiwanCommitment;
  dueAt: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  history?: { at: string; by: string; action: string; note: string }[];
  priority?: CommandPriority;
  decision?: CommandDecision | null;
  triage?: CommandTriage | null;
};

const store: ChairmanCommand[] = [];
const EMPLOYEE_IDS = new Set(COMPANY_AGENTS.filter((agent) => agent.id !== "owner").map((agent) => agent.id));

function missingTable(error: { code?: string; message?: string } | null) {
  const text = `${error?.code || ""} ${error?.message || ""}`;
  return /42P01|PGRST205|does not exist|schema cache|Could not find the table/i.test(text);
}

async function persistCommand(command: ChairmanCommand) {
  const client = getSupabaseAdmin();
  if (!client) return;
  const { error } = await client.from("chairman_commands").upsert({
    id: command.id,
    tenant_id: getTenantId(),
    status: command.status,
    owner_agent_id: command.ownerAgentId,
    payload: command,
    updated_at: command.updatedAt,
  }, { onConflict: "id" });
  if (error && !missingTable(error)) {
    const failure = new Error("تعذر حفظ الأمر في قاعدة البيانات؛ لم يُعتمد التغيير.") as Error & { durable: boolean };
    failure.durable = true;
    throw failure;
  }
}

export async function hydrateChairmanCommands() {
  // Refresh on every request: the DB is the source of truth, not this instance's memory.
  const client = getSupabaseAdmin();
  if (!client) return;
  const { data, error } = await client.from("chairman_commands").select("payload").eq("tenant_id", getTenantId())
    .order("updated_at", { ascending: false }).limit(500);
  if (error) {
    if (missingTable(error)) return;
    throw new Error("تعذر قراءة الأوامر من قاعدة البيانات.");
  }
  const migrated: ChairmanCommand[] = [];
  for (const row of data || []) {
    const payload = (row as { payload?: ChairmanCommand }).payload;
    if (!payload?.id) continue;
    if (normalizeCommand(payload)) migrated.push(payload);
    const index = store.findIndex((item) => item.id === payload.id);
    if (index === -1) {
      store.push(payload);
      continue;
    }
    if (payload.updatedAt >= store[index].updatedAt) store[index] = payload;
  }
  // A command stored before the decision step existed is saved once in its new shape.
  for (const command of migrated) {
    try { await persistCommand(command); } catch { /* the next write retries */ }
  }
}

const DECISION_TITLE = /قرار\s*الرئيس|قرار\s*رئيس\s*مجلس/;

/**
 * Bring a stored command up to the current workflow:
 * the "قرار الرئيس" step becomes a real DECISION step for the Chairman (it was
 * an internal step in Sultan's name, so no decision card was ever raised), and
 * pending review steps move to the specialist who owns them.
 * Returns true when the command changed.
 */
export function normalizeCommand(command: ChairmanCommand, now = nowIso()): boolean {
  let changed = false;
  command.priority = command.priority || "HIGH";
  for (const step of command.steps) {
    if (step.kind === "INTERNAL" && DECISION_TITLE.test(step.title) && step.status !== "DONE") {
      step.kind = "DECISION";
      step.ownerAgentId = "owner";
      changed = true;
    }
    if (step.kind === "INTERNAL" && step.status !== "DONE") {
      const specialist = specialistFor(step.title);
      if (specialist && specialist !== step.ownerAgentId) {
        step.ownerAgentId = specialist;
        changed = true;
      }
    }
  }
  if (changed) {
    const before = command.status;
    command.collaborators = withStepOwners(command);
    refreshStatus(command, now);
    command.history = [...(command.history || []), { at: now, by: "system", action: "workflow-upgrade", note: "حُوّلت خطوة «قرار الرئيس» إلى بطاقة قرار لرئيس مجلس الإدارة، وأُسندت خطوات المراجعة لأصحاب الاختصاص." }];
    command.updatedAt = now;
    command.resultReport = reportFor(command);
    void appendWorkEvent({ entityType: "command", entityId: command.id, actor: "system", action: "workflow-upgrade", fromState: before, toState: command.status, note: "ترقية سير العمل", evidence: null });
  }
  return changed;
}

const PRIORITY_DAYS: Record<CommandPriority, number> = { URGENT: 1, HIGH: 3, MEDIUM: 7, LOW: 7 };

const MONEY = /ريال|ر\.س|\bSAR\b|صرف|ميزانية|شراء|فاتورة|مبلغ|التزام مالي/i;
const EXTERNAL = /بريد|إيميل|email|واتس|واتساب|راسل|أرسل|ارسلي|رسالة\s+(إلى|الى|ل)|للعملاء|للمورد|جهة حكومية/i;

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function mentionedAmountSAR(text: string): number | null {
  const match = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:ريال|ر\.س|sar)/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ""));
  return isMonetarySpend(amount) ? amount : null;
}

type CommandRoute = { ownerAgentId: string; collaborators: string[]; sopId: string | null; confidence?: number };

const ADDRESS_NAMES: Array<{ id: string; pattern: string }> = [
  { id: "abdulrahman", pattern: "عبد\\s*الرحمن" },
  { id: "sultan", pattern: "سلطان" },
  { id: "noura", pattern: "نوره" },
  { id: "fahad", pattern: "فهد" },
  { id: "sara", pattern: "ساره" },
  { id: "khalid", pattern: "خالد" },
  { id: "majed", pattern: "ماجد" },
  { id: "rased", pattern: "راصد" },
  { id: "ameen", pattern: "امين" },
  { id: "hares", pattern: "حارس" },
  { id: "diwan", pattern: "ريان" },
];

function normalizeAddress(text: string) {
  return text
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim();
}

function explicitEmployee(assignee?: string | null) {
  if (assignee == null) return null;
  const id = assignee.trim().toLowerCase();
  if (!id || id === "automatic" || id === "auto") return null;
  if (!EMPLOYEE_IDS.has(id)) throw new Error("الموظف غير معروف.");
  return id;
}

function addressedEmployee(text: string) {
  const normalized = normalizeAddress(text);
  for (const name of ADDRESS_NAMES) {
    const vocative = new RegExp(`^يا\\s+${name.pattern}(?![\\u0600-\\u06FF])`);
    if (vocative.test(normalized)) return name.id;
  }
  for (const name of ADDRESS_NAMES) {
    const directed = new RegExp(`^${name.pattern}\\s*[:،,]`);
    if (directed.test(normalized)) return name.id;
  }
  const mentions = normalized.matchAll(/(?:^|[^a-z0-9])@([a-z][a-z0-9-]*)\b/gi);
  for (const mention of mentions) {
    const id = mention[1].toLowerCase();
    if (EMPLOYEE_IDS.has(id)) return id;
  }
  return null;
}

function assignOwner(ownerAgentId: string, keyword: CommandRoute): CommandRoute {
  return {
    confidence: 1,
    ownerAgentId,
    collaborators: Array.from(new Set([...keyword.collaborators, keyword.ownerAgentId].filter((id) => id !== ownerAgentId && id !== "diwan"))),
    sopId: keyword.ownerAgentId === ownerAgentId ? keyword.sopId : null,
  };
}

const RESEARCH_SOP_ID = "SOP-RESEARCH-001";
const RESEARCH_COLLABORATORS = ["fahad", "rased", "abdulrahman", "majed"];

function keywordRoute(text: string): CommandRoute {
  const rules: Array<{ test: RegExp; ownerAgentId: string; collaborators: string[]; sopId: string | null }> = [
    { test: /استثمار|استثمر|فرص|عائد/, ownerAgentId: "sultan", collaborators: RESEARCH_COLLABORATORS, sopId: RESEARCH_SOP_ID },
    { test: /ترخيص|حكوم|امتثال|نظام|سجل تجاري/, ownerAgentId: "majed", collaborators: ["hares"], sopId: null },
    { test: /خطر|حوكمة|صلاحية|تدقيق/, ownerAgentId: "hares", collaborators: ["majed"], sopId: "SOP-GOV-001" },
    { test: /منافس|استخبارات/, ownerAgentId: "rased", collaborators: ["noura"], sopId: null },
    { test: /قيد|فاتورة|محاسبة|إقفال/, ownerAgentId: "ameen", collaborators: ["abdulrahman"], sopId: null },
    { test: /شراء|مورد|مخزون|توريد|مشتريات/, ownerAgentId: "khalid", collaborators: ["fahad", "abdulrahman"], sopId: "SOP-P2P-001" },
    { test: /مبيعات|عميل|تحصيل|صفقة|عرض سعر/, ownerAgentId: "sara", collaborators: ["noura"], sopId: "SOP-OTC-001" },
    { test: /تسويق|حملة|إعلان|محتوى/, ownerAgentId: "noura", collaborators: ["sara"], sopId: null },
    { test: /تشغيل|إنتاج|جودة|شحن|تسليم|مشروع|عمليات/, ownerAgentId: "fahad", collaborators: ["khalid"], sopId: "SOP-IDEA-001" },
    { test: /مالي|ميزانية|سيولة|جدوى|مصروف/, ownerAgentId: "abdulrahman", collaborators: ["ameen"], sopId: null },
  ];
  // Score every rule by how many of its words appear; the clearest owner wins.
  // A tie between different owners, or no match, goes to Rayyan for triage.
  const scored = rules.map((rule, index) => {
    const words = rule.test.source.split("|");
    const score = words.filter((word) => new RegExp(word).test(text)).length;
    return { rule, index, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
  const best = scored[0];
  if (!best) return { ownerAgentId: "diwan", collaborators: ["sultan"], sopId: null, confidence: 0 };
  const rival = scored.find((item) => item.rule.ownerAgentId !== best.rule.ownerAgentId && item.score === best.score);
  // The first-listed rule keeps priority on a tie (investment before compliance), but the
  // command is flagged low-confidence so Rayyan confirms the owner within the hour.
  const confidence = rival ? 0.5 : Math.min(1, 0.6 + 0.2 * best.score);
  return { ownerAgentId: best.rule.ownerAgentId, collaborators: best.rule.collaborators, sopId: best.rule.sopId, confidence };
}

export function routeChairmanCommand(text: string, options: { assignee?: string | null } = {}): CommandRoute {
  const keyword = keywordRoute(text);
  const explicit = explicitEmployee(options.assignee);
  if (explicit) return assignOwner(explicit, keyword);
  const addressed = addressedEmployee(text);
  if (addressed) return assignOwner(addressed, keyword);
  return keyword;
}

/** Review steps belong to the specialist, not to the command owner (finance to Abdulrahman, legal to Majed). */
export function specialistFor(title: string): string | null {
  if (/المراجعة\s*المالية|مراجعة\s*مالية|الجدوى\s*المالية/.test(title)) return "abdulrahman";
  if (/المراجعة\s*النظامية|مراجعة\s*نظامية|الامتثال/.test(title)) return "majed";
  if (/فحص\s*الحوكمة|مراجعة\s*الحوكمة/.test(title)) return "hares";
  if (/توصية\s*الرئيس\s*التنفيذي/.test(title)) return "sultan";
  return null;
}

function withStepOwners(command: Pick<ChairmanCommand, "ownerAgentId" | "collaborators" | "steps">) {
  const ids = [...command.collaborators, ...command.steps.map((step) => step.ownerAgentId)];
  return Array.from(new Set(ids.filter((id) => id !== command.ownerAgentId && id !== "owner" && EMPLOYEE_IDS.has(id))));
}

const TRIAGE_STEP = "فرز الأمر وإسناده لصاحب الاختصاص (ريّان خلال ساعة)";

function planSteps(command: Pick<ChairmanCommand, "id" | "text" | "ownerAgentId" | "sopId">, amount: number | null, external: boolean): CommandStep[] {
  // Sultan's own SOPs (continuity, exception) are internal controls, not a plan
  // for a chairman command, so they are never used as a fallback.
  const sop = EMPLOYEE_SOPS.find((item) => item.id === command.sopId)
    || (command.ownerAgentId === "sultan" ? undefined : EMPLOYEE_SOPS.find((item) => item.ownerEmployeeId === command.ownerAgentId));
  const generic = ["فهم الطلب وتحديد المخرج", "جمع بيانات القسم", "تنفيذ العمل غير المالي", "كتابة تقرير النتيجة"];
  const titles = command.ownerAgentId === "diwan" && !sop
    ? [TRIAGE_STEP]
    : sop?.id === RESEARCH_SOP_ID ? sop.steps : (sop?.steps || generic).slice(0, 4);
  const steps: CommandStep[] = titles.map((title, index) => {
    const decision = DECISION_TITLE.test(title);
    return {
      id: `${command.id}-step-${index + 1}`,
      title,
      ownerAgentId: decision ? "owner" : specialistFor(title) || command.ownerAgentId,
      kind: decision ? "DECISION" as const : "INTERNAL" as const,
      status: "PENDING" as const,
      evidence: null,
    };
  });
  if (MONEY.test(command.text) || amount) {
    steps.push({
      id: `${command.id}-spend`,
      title: "طلب الصرف عبر السلسلة حتى رئيس مجلس الإدارة",
      ownerAgentId: "abdulrahman",
      kind: "SPEND",
      status: "PENDING",
      evidence: null,
    });
  }
  if (external) {
    steps.push({
      id: `${command.id}-external`,
      title: "إرسال خارجي بانتظار اعتماد رئيس مجلس الإدارة",
      ownerAgentId: command.ownerAgentId,
      kind: "EXTERNAL",
      status: "BLOCKED",
      evidence: null,
    });
  }
  return steps;
}

function agentName(agentId: string) {
  return getAgent(agentId)?.name || agentId;
}

/**
 * A money command opens a real spend request in the preparing department's
 * queue. No review is written for anyone: Abdulrahman and Hares review it in
 * parallel from their own queues, then Sultan recommends, then the Chairman.
 */
function openSpendChain(ownerAgentId: string, text: string, amount: number): SpendChainState {
  return blankSpendChain({
    preparingAgentId: ownerAgentId,
    subject: text.slice(0, 180),
    amountSAR: amount,
    stage: "department",
    note: "بانتظار مذكرة القسم (الموضوع، البدائل، العائد، المخاطر). لم يراجعها أحد بعد.",
  });
}

function refreshStatus(command: ChairmanCommand, now = nowIso()) {
  const openInternal = command.steps.some((step) => step.kind === "INTERNAL" && step.status !== "DONE");
  const externalOpen = command.steps.some((step) => step.kind === "EXTERNAL" && step.status !== "DONE");
  const spendOpen = command.steps.some((step) => step.kind === "SPEND" && step.status !== "DONE");
  const decisionStep = command.steps.find((step) => step.kind === "DECISION" && step.status !== "DONE");
  const current = command.steps.find((step) => step.status !== "DONE" && step.kind !== "EXTERNAL" && step.kind !== "DECISION")
    || command.steps.find((step) => step.status !== "DONE");
  command.blockers = command.steps.filter((step) => step.status === "BLOCKED" && step.kind !== "EXTERNAL").map((step) => step.title);
  if (spendOpen && !command.blockers.some((item) => item.includes("صرف") || item.includes("سلسلة"))) {
    command.blockers.push("بانتظار اعتماد رئيس مجلس الإدارة على الصرف");
  }
  if (!openInternal && !externalOpen && !spendOpen && !decisionStep) {
    command.currentStep = "مغلق";
    command.status = "CLOSED";
    command.closedAt = command.closedAt || now;
    return;
  }
  // The Chairman's card is raised only when the team finished everything before it.
  const awaitingChairman = !openInternal && !spendOpen && (Boolean(decisionStep) || externalOpen);
  if (awaitingChairman) {
    const step = decisionStep || command.steps.find((item) => item.kind === "EXTERNAL" && item.status !== "DONE")!;
    if (!command.decision || command.decision.stepId !== step.id || command.decision.status === "APPROVED" || command.decision.status === "REJECTED") {
      command.decision = { status: "PENDING", stepId: step.id, kind: step.kind === "EXTERNAL" ? "external" : "decision", requestedAt: now, deferredUntil: null, decidedAt: null, note: null, returns: command.decision?.returns || 0 };
    } else if (command.decision.status === "RETURNED") {
      command.decision = { ...command.decision, status: "PENDING", requestedAt: now };
    }
    command.currentStep = step.kind === "EXTERNAL" ? "بانتظار اعتماد رئيس مجلس الإدارة على الإرسال الخارجي" : "بانتظار قرار رئيس مجلس الإدارة";
    command.status = "AWAITING_CHAIRMAN";
    return;
  }
  command.currentStep = current?.title || "مغلق";
  if (spendOpen) command.status = "IN_SPEND_CHAIN";
  else if (command.blockers.length) command.status = "BLOCKED";
  else command.status = "IN_PROGRESS";
}

function reportFor(command: ChairmanCommand) {
  const done = command.steps.filter((step) => step.status === "DONE").map((step) => `- ${step.title}: ${step.evidence || "تم"}`);
  const waiting = command.steps.filter((step) => step.status !== "DONE").map((step) => `- ${step.title} (${step.status})`);
  return [
    `إلى رئيس مجلس الإدارة،`,
    `الأمر: ${command.text}`,
    `المالك: ${agentName(command.ownerAgentId)}`,
    `الخطوة الحالية: ${command.currentStep}`,
    done.length ? `ما أُنجز:\n${done.join("\n")}` : "ما أُنجز: لا شيء بعد.",
    waiting.length ? `ما ينتظر:\n${waiting.join("\n")}` : "ما ينتظر: لا شيء.",
    command.blockers.length ? `العوائق: ${command.blockers.join("؛ ")}` : "العوائق: لا عوائق.",
    ...(command.history?.length ? [`آخر التحديثات:\n${command.history.slice(-5).map((item) => `- ${item.at.slice(0, 16).replace("T", " ")} ${agentName(item.by)}: ${item.note}`).join("\n")}`] : []),
  ].join("\n");
}

async function trackWithDiwan(command: ChairmanCommand) {
  const opened = await openDecisionCommitment({
    sourceType: "chairman-command",
    sourceId: command.id,
    title: command.text.slice(0, 180),
    detail: `أمر من رئيس مجلس الإدارة. المالك ${agentName(command.ownerAgentId)}.`,
    assigneeId: command.ownerAgentId,
    decidedBy: "owner",
    priority: "HIGH",
    requiresProof: true,
    dueAt: command.dueAt,
  }, { actor: "diwan" });
  if (opened.ok && opened.commitment) command.diwan.id = opened.commitment.id;
}

async function reopenDiwan(command: ChairmanCommand, note: string) {
  if (command.diwan.status !== "COMPLETED") return;
  command.diwan.status = "OPEN";
  command.diwan.closedAt = null;
  command.diwan.evidence = null;
  if (!command.diwan.id) {
    // Commands closed at birth never got a follow-up record; open one now.
    await trackWithDiwan(command);
    return;
  }
  await advanceCommitment({ id: command.diwan.id, status: "IN_PROGRESS" }, { actor: "diwan" });
  void note;
}

async function closeDiwan(command: ChairmanCommand, evidence: string) {
  command.diwan.status = "COMPLETED";
  command.diwan.evidence = evidence;
  command.diwan.closedAt = nowIso();
  if (!command.diwan.id) return;
  await advanceCommitment({
    id: command.diwan.id,
    status: "COMPLETED",
    completionNote: evidence,
    proof: evidence,
  }, { actor: "diwan" });
}

export async function issueChairmanCommand(text: string, options: { now?: string; priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; assignee?: string | null } = {}): Promise<ChairmanCommand> {
  const commandText = text.trim();
  if (commandText.length < 3) throw new Error("الأمر قصير.");
  const route = routeChairmanCommand(commandText, { assignee: options.assignee });
  const createdAt = options.now || nowIso();
  const amount = mentionedAmountSAR(commandText);
  const money = MONEY.test(commandText);
  const external = EXTERNAL.test(commandText);
  const command: ChairmanCommand = {
    id: newId("cmd"),
    text: commandText,
    ownerAgentId: route.ownerAgentId,
    collaborators: money ? Array.from(new Set([...route.collaborators, "abdulrahman", "hares", "sultan"].filter((id) => id !== route.ownerAgentId))) : route.collaborators,
    sopId: route.sopId,
    status: "IN_PROGRESS",
    currentStep: "",
    blockers: [],
    steps: [],
    resultReport: null,
    spendApprovalId: null,
    taskId: null,
    diwan: { id: null, status: "OPEN", assigneeId: route.ownerAgentId, evidence: null, openedAt: createdAt, closedAt: null },
    dueAt: new Date(Date.parse(createdAt) + PRIORITY_DAYS[options.priority || "HIGH"] * 86_400_000).toISOString(),
    createdAt,
    updatedAt: createdAt,
    closedAt: null,
    priority: options.priority || "HIGH",
    decision: null,
    triage: {
      status: route.ownerAgentId === "diwan" || (route.confidence ?? 1) < 0.6 ? "PENDING" : "DONE",
      confidence: route.confidence ?? 1,
      suggestedOwnerId: route.ownerAgentId === "diwan" ? null : route.ownerAgentId,
      by: route.ownerAgentId === "diwan" || (route.confidence ?? 1) < 0.6 ? null : "system",
      at: route.ownerAgentId === "diwan" || (route.confidence ?? 1) < 0.6 ? null : createdAt,
    },
  };
  command.steps = planSteps(command, amount, external);
  command.collaborators = withStepOwners(command);
  const owner = getAgent(route.ownerAgentId);
  // Internal steps stay PENDING until the owner reports real progress through
  // the bridge. Marking them DONE here closed every plain command at birth,
  // so it never reached the employee's inbox or the bridge feed.
  void owner;
  if (money && !amount) {
    const spend = command.steps.find((step) => step.kind === "SPEND");
    if (spend) {
      spend.status = "BLOCKED";
      spend.evidence = "المبلغ غير محدد. لن تبدأ سلسلة الصرف قبل رقم صريح.";
    }
    command.blockers.push("طلب مالي بلا مبلغ محدد");
  }
  if (money && amount) {
    const chain = openSpendChain(route.ownerAgentId, commandText, amount);
    const approval = createApproval({
      type: "BUDGET",
      title: commandText.slice(0, 140),
      detail: "طلب صرف نشأ من أمر رئيس مجلس الإدارة. يجهّز القسم مذكرته، ثم المالية والحوكمة بالتوازي، ثم توصية سلطان، ثم قرار رئيس مجلس الإدارة.",
      amount,
      requestedRole: "رئيس مجلس الإدارة",
      metadata: { spendChain: chain, commandId: command.id, source: "chairman-command" },
    });
    command.spendApprovalId = approval.id;
    const spend = command.steps.find((step) => step.kind === "SPEND");
    if (spend) {
      spend.status = "BLOCKED";
      spend.evidence = `طلب الصرف ${approval.id} عند ${agentName(route.ownerAgentId)} لتجهيز المذكرة، ثم عبدالرحمن وحارس. لا يعتمده أي موظف.`;
    }
  }
  refreshStatus(command);
  // A brand-new command is never complete: Rayyan's follow-up always opens.
  command.resultReport = reportFor(command);
  await trackWithDiwan(command);
  command.updatedAt = nowIso();
  store.unshift(command);
  try {
    const task = await createTask({
      title: `أمر: ${command.text.slice(0, 70)}`,
      description: command.text,
      assignedTo: command.ownerAgentId,
      createdBy: "owner",
      departmentId: command.ownerAgentId,
      priority: options.priority || "HIGH",
    });
    command.taskId = task.id;
  } catch {
    command.taskId = null;
  }
  await persistCommand(command);
  await appendWorkEvent({ entityType: "command", entityId: command.id, actor: "owner", action: "issued", fromState: null, toState: command.status, note: `أُسند إلى ${agentName(command.ownerAgentId)}`, evidence: null });
  return command;
}

export function listChairmanCommands(): ChairmanCommand[] {
  return [...store].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function listOpenCommandsSince(since: string) {
  const sinceMs = Date.parse(since);
  if (!Number.isFinite(sinceMs)) throw new Error("since يجب أن يكون تاريخاً بصيغة ISO.");
  return listChairmanCommands()
    .filter((command) => command.status !== "CLOSED")
    .filter((command) => Date.parse(command.updatedAt) >= sinceMs || Date.parse(command.createdAt) >= sinceMs)
    .map((command) => ({
      id: command.id,
      subject: command.text,
      status: command.status,
      ownerAgentId: command.ownerAgentId,
      updatedAt: command.updatedAt,
    }));
}

/** Read-only audit: commands closed within a minute of creation with no recorded owner activity. */
export function listAutoClosedCommands() {
  return listChairmanCommands()
    .filter((command) => command.status === "CLOSED" && command.closedAt)
    .filter((command) => Math.abs(Date.parse(command.closedAt as string) - Date.parse(command.createdAt)) < 60_000)
    .filter((command) => !(command.history || []).length)
    .map((command) => ({ id: command.id, subject: command.text, ownerAgentId: command.ownerAgentId, createdAt: command.createdAt, closedAt: command.closedAt }));
}

export function getChairmanCommand(id: string): ChairmanCommand | undefined {
  return store.find((command) => command.id === id);
}

export function commandsForAgent(agentId: string): ChairmanCommand[] {
  return listChairmanCommands().filter((command) => command.status !== "CLOSED" && (command.ownerAgentId === agentId || command.collaborators.includes(agentId) || command.steps.some((step) => step.ownerAgentId === agentId && step.status !== "DONE")));
}

export type CommandUpdate = {
  action: "progress" | "block" | "close" | "evidence" | "reopen" | "replan" | "note" | "assign";
  stepId?: string;
  note: string;
  evidence?: string;
  /** For "assign" (Rayyan's triage): the employee who owns the command from now on. */
  assignee?: string;
};

function record(command: ChairmanCommand, by: string, action: string, note: string, fromState: string, evidence?: string | null) {
  const at = nowIso();
  command.history = [...(command.history || []), { at, by, action, note }];
  command.updatedAt = at;
  void appendWorkEvent({ entityType: "command", entityId: command.id, actor: by, action, fromState, toState: command.status, note, evidence: evidence || null, at });
}

function assignCommand(command: ChairmanCommand, agentId: string, assignee: string | undefined, note: string) {
  if (agentId !== "diwan" && agentId !== "sultan") throw new Error("الفرز والإسناد لريّان (أو سلطان) فقط.");
  const ownerId = explicitEmployee(assignee || "");
  if (!ownerId) throw new Error("حدّد الموظف المسؤول (assignee).");
  if (command.status === "CLOSED") throw new Error("أعد فتح الأمر أولاً.");
  const keyword = keywordRoute(command.text);
  const route = assignOwner(ownerId, keyword);
  const kept = command.steps.filter((step) => step.kind !== "INTERNAL" && step.kind !== "DECISION");
  const preserved = command.steps.filter((step) => step.evidence && step.kind === "INTERNAL").map((step) => ({ at: command.updatedAt, by: step.ownerAgentId, action: "archived-step", note: `${step.title}: ${step.evidence}` }));
  command.ownerAgentId = ownerId;
  command.sopId = route.sopId;
  command.collaborators = route.collaborators;
  const planned = planSteps({ id: command.id, text: command.text, ownerAgentId: ownerId, sopId: route.sopId }, null, false);
  for (const step of kept) if (step.kind === "SPEND" && command.spendApprovalId) step.ownerAgentId = "abdulrahman";
  command.steps = [...planned.filter((step) => step.kind !== "SPEND" && step.kind !== "EXTERNAL"), ...kept];
  command.collaborators = withStepOwners(command);
  command.diwan.assigneeId = ownerId;
  command.triage = { status: "DONE", confidence: 1, suggestedOwnerId: ownerId, by: agentId, at: nowIso() };
  command.history = [...(command.history || []), ...preserved];
  refreshStatus(command);
  void note;
}

export async function updateChairmanCommand(agentId: string, commandId: string, update: CommandUpdate): Promise<ChairmanCommand> {
  const command = getChairmanCommand(commandId);
  if (!command) throw new Error("الأمر غير موجود.");
  const involved = command.ownerAgentId === agentId || command.collaborators.includes(agentId) || agentId === "diwan"
    || command.steps.some((step) => step.ownerAgentId === agentId);
  if (!involved) throw new Error("هذا الأمر ليس في نطاق هذا الموظف.");
  const note = update.note.trim();
  if (note.length < 3) throw new Error("أضف ملاحظة.");
  const before = command.status;
  if (update.action === "note") {
    record(command, agentId, "note", note, before, update.evidence);
    command.resultReport = reportFor(command);
    await persistCommand(command);
    return command;
  }
  if (update.action === "assign") {
    assignCommand(command, agentId, update.assignee, note);
    record(command, agentId, "assign", `${note} (المالك الجديد: ${agentName(command.ownerAgentId)})`, before);
    command.resultReport = reportFor(command);
    await persistCommand(command);
    return command;
  }
  if (update.action === "reopen") {
    if (command.status !== "CLOSED") throw new Error("الأمر ليس مغلقاً.");
    for (const step of command.steps) {
      if (step.kind === "INTERNAL") {
        step.status = "PENDING";
        step.evidence = null;
      }
    }
    command.closedAt = null;
    refreshStatus(command);
    record(command, agentId, "reopen", note, before);
    await reopenDiwan(command, note);
    command.resultReport = reportFor(command);
    await persistCommand(command);
    return command;
  }
  if (update.action === "replan") {
    if (command.status === "CLOSED") throw new Error("أعد فتح الأمر أولاً.");
    const route = routeChairmanCommand(command.text);
    const preserved = command.steps.filter((step) => step.evidence).map((step) => ({ at: command.updatedAt, by: step.ownerAgentId, action: "archived-step", note: `${step.title}: ${step.evidence}` }));
    const others = command.steps.filter((step) => step.kind !== "INTERNAL" && step.kind !== "DECISION");
    command.sopId = route.ownerAgentId === command.ownerAgentId ? route.sopId : command.sopId;
    if (route.ownerAgentId === command.ownerAgentId) command.collaborators = route.collaborators;
    command.steps = [...planSteps(command, null, false).filter((step) => step.kind !== "SPEND" && step.kind !== "EXTERNAL"), ...others];
    command.collaborators = withStepOwners(command);
    refreshStatus(command);
    command.history = [...(command.history || []), ...preserved];
    record(command, agentId, "replan", note, before);
    await reopenDiwan(command, note);
    command.resultReport = reportFor(command);
    await persistCommand(command);
    return command;
  }
  if (update.action === "close") {
    const evidence = (update.evidence || note).trim();
    if (evidence.length < 10) throw new Error("الإغلاق يحتاج دليلاً من عشر أحرف على الأقل.");
    if (command.steps.some((step) => step.kind === "EXTERNAL" && step.status !== "DONE")) {
      throw new Error("الإرسال الخارجي ينتظر اعتماد رئيس مجلس الإدارة.");
    }
    if (command.steps.some((step) => step.kind === "SPEND" && step.status !== "DONE")) {
      throw new Error("لا يُغلق أمر فيه صرف قبل اعتماد رئيس مجلس الإدارة.");
    }
    if (command.steps.some((step) => step.kind === "DECISION" && step.status !== "DONE")) {
      throw new Error("لا يُغلق الأمر قبل قرار رئيس مجلس الإدارة على بطاقته.");
    }
    for (const step of command.steps) {
      if (step.kind === "INTERNAL" && step.status !== "DONE") {
        step.status = "DONE";
        step.evidence = evidence;
      }
    }
    command.resultReport = `${reportFor(command)}\nدليل الإغلاق: ${evidence}`;
    refreshStatus(command);
    command.status = "CLOSED";
    command.closedAt = nowIso();
    await closeDiwan(command, command.resultReport);
  } else if (update.action === "block") {
    command.status = "BLOCKED";
    command.blockers = Array.from(new Set([...command.blockers, note]));
    command.currentStep = note;
  } else {
    const explicit = update.stepId ? command.steps.find((item) => item.id === update.stepId) : undefined;
    if (update.stepId && !explicit) throw new Error("الخطوة غير موجودة في هذا الأمر.");
    const open = command.steps.filter((item) => item.status !== "DONE" && item.kind === "INTERNAL");
    const step = explicit
      || open.find((item) => item.ownerAgentId === agentId)
      || (agentId === command.ownerAgentId ? open.find((item) => item.ownerAgentId === command.ownerAgentId) : undefined);
    if (!step) {
      const next = open[0];
      if (!next) throw new Error("لا خطوة داخلية مفتوحة.");
      throw new Error(`الخطوة المفتوحة «${next.title}» عند ${agentName(next.ownerAgentId)}، وليست لهذا الموظف.`);
    }
    if (step.kind === "EXTERNAL") throw new Error("لا يُرسل شيء للخارج قبل اعتماد رئيس مجلس الإدارة.");
    if (step.kind === "SPEND") throw new Error("الصرف يتحرك في سلسلة الاعتماد، لا يُغلق من هنا.");
    if (step.kind === "DECISION") throw new Error("هذه الخطوة قرار لرئيس مجلس الإدارة فقط، تُتخذ من مكتبه.");
    if (step.status === "DONE") throw new Error("هذه الخطوة أُنجزت.");
    // A specialist step (finance, legal, governance, Sultan's recommendation) is done by its owner only.
    if (step.ownerAgentId !== agentId && step.ownerAgentId !== command.ownerAgentId) {
      throw new Error(`هذه الخطوة لـ${agentName(step.ownerAgentId)}.`);
    }
    if (step.ownerAgentId !== agentId && specialistFor(step.title)) {
      throw new Error(`هذه الخطوة لـ${agentName(step.ownerAgentId)}.`);
    }
    step.status = "DONE";
    step.evidence = update.evidence?.trim() || note;
    refreshStatus(command);
  }
  record(command, agentId, update.action, note, before, update.evidence);
  // Refresh the report so progress notes reach the chairman and the digest.
  if (update.action !== "close") command.resultReport = reportFor(command);
  await persistCommand(command);
  return command;
}

/** The step whose evidence is Sultan's recommendation, if the command has one. */
export function recommendationFor(command: ChairmanCommand): string | null {
  const step = [...command.steps].reverse().find((item) => item.status === "DONE" && /توصية/.test(item.title) && item.evidence);
  return step?.evidence || null;
}

function stepEvidence(command: ChairmanCommand, pattern: RegExp) {
  return command.steps.find((item) => pattern.test(item.title) && item.status === "DONE")?.evidence || null;
}

export function commandReviewLines(command: ChairmanCommand) {
  return {
    finance: stepEvidence(command, /المالية/),
    legal: stepEvidence(command, /النظامية|الامتثال/),
    governance: stepEvidence(command, /الحوكمة/),
  };
}

/** A decision card is open when the team finished its work and the Chairman's step is next. */
export function isAwaitingChairmanDecision(command: ChairmanCommand, now = new Date()) {
  if (command.status !== "AWAITING_CHAIRMAN" || !command.decision) return false;
  if (command.decision.status === "DEFERRED" && command.decision.deferredUntil && Date.parse(command.decision.deferredUntil) > now.getTime()) return false;
  return command.decision.status === "PENDING" || command.decision.status === "DEFERRED";
}

/**
 * The Chairman decides a command's card. Only the owner calls this (from his desk);
 * no employee path reaches it. Spend is never decided here: it stays on its approval.
 */
export async function decideChairmanCommand(commandId: string, input: { decision: ChairmanDecisionChoice; note?: string }, actor = "owner"): Promise<ChairmanCommand> {
  if (actor !== "owner") throw new Error("القرار لرئيس مجلس الإدارة فقط.");
  const command = getChairmanCommand(commandId);
  if (!command) throw new Error("الأمر غير موجود.");
  const decision = command.decision;
  if (command.status !== "AWAITING_CHAIRMAN" || !decision) throw new Error("لا توجد بطاقة قرار مفتوحة على هذا الأمر.");
  const step = command.steps.find((item) => item.id === decision.stepId);
  if (!step || step.status === "DONE") throw new Error("لا توجد بطاقة قرار مفتوحة على هذا الأمر.");
  const note = (input.note || "").trim();
  const before = command.status;
  const at = nowIso();
  const external = step.kind === "EXTERNAL";
  if (input.decision === "approve") {
    step.status = "DONE";
    step.evidence = external
      ? `اعتمد رئيس مجلس الإدارة الإرسال الخارجي${note ? `: ${note}` : "."}`
      : `اعتمد رئيس مجلس الإدارة التوصية${note ? `: ${note}` : "."}`;
    command.decision = { ...decision, status: "APPROVED", decidedAt: at, note: note || null, deferredUntil: null };
    // Approved work is executed and closed with evidence; Rayyan follows it up.
    command.steps.push({
      id: `${command.id}-post-${command.steps.length + 1}`,
      title: external ? "تنفيذ الإرسال المعتمد وتسجيل الدليل" : "تنفيذ ما بعد القرار وإغلاقه بدليل",
      ownerAgentId: command.ownerAgentId,
      kind: "INTERNAL",
      status: "PENDING",
      evidence: null,
    });
    refreshStatus(command, at);
    record(command, "owner", "decide-approve", step.evidence, before);
  } else if (input.decision === "reject") {
    step.status = "DONE";
    step.evidence = external ? `رفض رئيس مجلس الإدارة الإرسال. لا إرسال${note ? `: ${note}` : "."}` : `رفض رئيس مجلس الإدارة التوصية${note ? `: ${note}` : "."}`;
    command.decision = { ...decision, status: "REJECTED", decidedAt: at, note: note || null, deferredUntil: null };
    for (const item of command.steps) {
      if (item.status !== "DONE" && item.kind !== "SPEND") { item.status = "DONE"; item.evidence = item.evidence || "أُغلق برفض رئيس مجلس الإدارة."; }
    }
    refreshStatus(command, at);
    record(command, "owner", "decide-reject", step.evidence, before);
    if ((command.status as ChairmanCommandStatus) === "CLOSED") {
      command.resultReport = reportFor(command);
      await closeDiwan(command, command.resultReport);
    }
  } else if (input.decision === "return") {
    if (note.length < 3) throw new Error("الإعادة تحتاج ملاحظة توضح المطلوب.");
    // Back to the step before the card (Sultan's recommendation), with the note.
    const index = command.steps.indexOf(step);
    const previous = [...command.steps.slice(0, index)].reverse().find((item) => item.kind === "INTERNAL");
    if (previous) {
      previous.status = "PENDING";
      previous.evidence = null;
    }
    command.decision = { ...decision, status: "RETURNED", decidedAt: at, note, returns: decision.returns + 1, deferredUntil: null };
    refreshStatus(command, at);
    record(command, "owner", "decide-return", `أعاده رئيس مجلس الإدارة بملاحظة: ${note}`, before);
  } else if (input.decision === "defer") {
    const until = new Date(Date.parse(at) + 7 * 86_400_000).toISOString();
    command.decision = { ...decision, status: "DEFERRED", deferredUntil: until, note: note || null };
    record(command, "owner", "decide-defer", `أجّله رئيس مجلس الإدارة أسبوعاً حتى ${until.slice(0, 10)}${note ? `: ${note}` : ""}`, before);
  } else if (input.decision === "renew") {
    command.decision = { ...decision, status: "PENDING", requestedAt: at, deferredUntil: null };
    record(command, "owner", "decide-renew", "أعاد رئيس مجلس الإدارة فتح البطاقة.", before);
  } else {
    throw new Error("القرار: approve أو reject أو return أو defer.");
  }
  command.resultReport = reportFor(command);
  await persistCommand(command);
  return command;
}

export type CommandSla = {
  state: "triage" | "in_progress" | "no_update" | "awaiting_chairman" | "spend_chain" | "blocked" | "closed";
  responsible: string;
  dueAt: string | null;
  overdue: boolean;
  /** Escalation ladder: owner, then sector lead at 150%, then Sultan at 200%. */
  escalateTo: string | null;
  level: 0 | 1 | 2 | 3;
  label: string;
};

const HOUR = 3_600_000;

/** Per-state deadlines and the escalation ladder, computed on every read (no hourly cron needed). */
export function commandSla(command: ChairmanCommand, now = new Date()): CommandSla {
  const t = now.getTime();
  if (command.status === "CLOSED") return { state: "closed", responsible: command.ownerAgentId, dueAt: null, overdue: false, escalateTo: null, level: 0, label: "مغلق" };
  if (command.status === "AWAITING_CHAIRMAN" && command.decision) {
    const requested = Date.parse(command.decision.requestedAt);
    const remind = new Date(requested + 48 * HOUR).toISOString();
    const late = t > requested + 48 * HOUR;
    return { state: "awaiting_chairman", responsible: "owner", dueAt: remind, overdue: late, escalateTo: null, level: late ? 1 : 0, label: late ? "تذكير: بطاقة قرار منذ أكثر من 48 ساعة" : "بطاقة قرار في مكتبك" };
  }
  if (command.triage?.status === "PENDING") {
    const due = Date.parse(command.createdAt) + HOUR;
    const late = t > due;
    return { state: "triage", responsible: "diwan", dueAt: new Date(due).toISOString(), overdue: late, escalateTo: late ? "sultan" : null, level: late ? 3 : 0, label: late ? "تأخر الفرز أكثر من ساعة: تصعيد لسلطان" : "بانتظار فرز ريّان خلال ساعة" };
  }
  const start = Date.parse(command.createdAt);
  const due = Date.parse(command.dueAt);
  const span = Math.max(HOUR, due - start);
  const owner = command.steps.find((step) => step.status !== "DONE" && step.kind === "INTERNAL")?.ownerAgentId || command.ownerAgentId;
  const lead = sectorLeadOf(owner) || "sultan";
  let level: CommandSla["level"] = 0;
  let escalateTo: string | null = null;
  if (t > start + span * 2) { level = 3; escalateTo = "sultan"; }
  else if (t > start + span * 1.5) { level = 2; escalateTo = lead === owner ? "sultan" : lead; }
  else if (t > due) { level = 1; escalateTo = owner; }
  const lastUpdate = Date.parse(command.updatedAt);
  const stale = t - lastUpdate > 24 * HOUR;
  const state: CommandSla["state"] = command.status === "BLOCKED" ? "blocked" : command.status === "IN_SPEND_CHAIN" ? "spend_chain" : stale ? "no_update" : "in_progress";
  const labels = ["في الموعد", "تجاوز الموعد: تذكير للمالك", `تجاوز 150%: تصعيد إلى ${agentName(escalateTo || lead)}`, "تجاوز 200%: تصعيد إلى سلطان"];
  return { state, responsible: owner, dueAt: command.dueAt, overdue: t > due, escalateTo, level, label: stale && level === 0 ? "بلا تحديث منذ 24 ساعة: تنبيه لريّان" : labels[level] };
}

export async function settleChairmanCommandForSpend(approvalId: string, decision: "APPROVED" | "REJECTED") {
  const command = store.find((item) => item.spendApprovalId === approvalId);
  if (!command) return null;
  const before = command.status;
  const spend = command.steps.find((step) => step.kind === "SPEND");
  if (spend) {
    spend.status = "DONE";
    spend.evidence = decision === "APPROVED"
      ? "اعتمده رئيس مجلس الإدارة."
      : "رفضه رئيس مجلس الإدارة. لا صرف.";
  }
  refreshStatus(command);
  command.resultReport = reportFor(command);
  record(command, "owner", decision === "APPROVED" ? "spend-approved" : "spend-rejected", spend?.evidence || decision, before);
  if (command.status === "CLOSED") await closeDiwan(command, command.resultReport);
  await persistCommand(command);
  return command;
}

export function publicCommandStatus(command: ChairmanCommand, nowInput?: unknown) {
  // Also used as an Array.map callback, so the second argument can be an index.
  const now = nowInput instanceof Date ? nowInput : new Date();
  return {
    id: command.id,
    subject: command.text,
    status: command.status,
    ownerAgentId: command.ownerAgentId,
    ownerName: agentName(command.ownerAgentId),
    currentStep: command.currentStep,
    blockers: command.blockers,
    collaborators: command.collaborators,
    resultReport: command.resultReport,
    spendApprovalId: command.spendApprovalId,
    diwanStatus: command.diwan.status,
    dueAt: command.dueAt,
    updatedAt: command.updatedAt,
    closedAt: command.closedAt,
    createdAt: command.createdAt,
    priority: command.priority || "HIGH",
    steps: command.steps.map((step) => ({ id: step.id, title: step.title, ownerAgentId: step.ownerAgentId, ownerName: step.ownerAgentId === "owner" ? "رئيس مجلس الإدارة" : agentName(step.ownerAgentId), kind: step.kind, status: step.status, evidence: step.evidence })),
    decision: command.decision || null,
    awaitingDecision: isAwaitingChairmanDecision(command, now),
    triage: command.triage || null,
    sla: commandSla(command, now),
    history: (command.history || []).slice(-20),
  };
}

export function _clearChairmanCommands() {
  store.length = 0;
}

export function _setCommandDue(id: string, dueAt: string) {
  const command = getChairmanCommand(id);
  if (command) command.dueAt = dueAt;
}
