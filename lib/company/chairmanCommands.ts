/**
 * Commands the Chairman issues in the site become tracked work.
 * The owning employee plans the work, runs non-financial steps, and pulls
 * finance, governance and Sultan through the spend chain when money is
 * involved. External messages stay blocked until the Chairman approves them.
 * Rayyan (diwan) keeps a commitment until the command closes with evidence.
 */

import { COMPANY_AGENTS, getAgent } from "./agents";
import { createApproval } from "../approvals";
import { advanceCommitment, openDecisionCommitment } from "./executiveSecretariat";
import { EMPLOYEE_SOPS } from "../employee-runtime/sops";
import { getSupabaseAdmin } from "../supabase";
import { getTenantId } from "../tenant";
import { createTask } from "../repository";
import {
  advanceSpendChain,
  blankSpendChain,
  isMonetarySpend,
  type SpendChainState,
} from "./spendChain";

export type CommandStepStatus = "PENDING" | "DONE" | "BLOCKED";
export type CommandStepKind = "INTERNAL" | "EXTERNAL" | "SPEND";
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
  for (const row of data || []) {
    const payload = (row as { payload?: ChairmanCommand }).payload;
    if (!payload?.id) continue;
    const index = store.findIndex((item) => item.id === payload.id);
    if (index === -1) {
      store.push(payload);
      continue;
    }
    if (payload.updatedAt > store[index].updatedAt) store[index] = payload;
  }
}

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

type CommandRoute = { ownerAgentId: string; collaborators: string[]; sopId: string | null };

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
    ownerAgentId,
    collaborators: Array.from(new Set([...keyword.collaborators, keyword.ownerAgentId].filter((id) => id !== ownerAgentId))),
    sopId: keyword.ownerAgentId === ownerAgentId ? keyword.sopId : null,
  };
}

function keywordRoute(text: string): CommandRoute {
  const rules: Array<{ test: RegExp; ownerAgentId: string; collaborators: string[]; sopId: string | null }> = [
    { test: /ترخيص|حكوم|امتثال|نظام|سجل تجاري/, ownerAgentId: "majed", collaborators: ["hares"], sopId: null },
    { test: /خطر|حوكمة|صلاحية|تدقيق/, ownerAgentId: "hares", collaborators: ["majed"], sopId: "SOP-GOV-001" },
    { test: /فرصة|منافس|استخبارات/, ownerAgentId: "rased", collaborators: ["noura"], sopId: null },
    { test: /قيد|فاتورة|محاسبة|إقفال/, ownerAgentId: "ameen", collaborators: ["abdulrahman"], sopId: null },
    { test: /شراء|مورد|مخزون|توريد|مشتريات/, ownerAgentId: "khalid", collaborators: ["fahad", "abdulrahman"], sopId: "SOP-P2P-001" },
    { test: /مبيعات|عميل|تحصيل|صفقة|عرض سعر/, ownerAgentId: "sara", collaborators: ["noura"], sopId: "SOP-OTC-001" },
    { test: /تسويق|حملة|إعلان|محتوى/, ownerAgentId: "noura", collaborators: ["sara"], sopId: null },
    { test: /تشغيل|إنتاج|جودة|شحن|تسليم|مشروع|عمليات/, ownerAgentId: "fahad", collaborators: ["khalid"], sopId: "SOP-IDEA-001" },
    { test: /مالي|ميزانية|سيولة|جدوى|مصروف/, ownerAgentId: "abdulrahman", collaborators: ["ameen"], sopId: null },
  ];
  const hit = rules.find((rule) => rule.test.test(text));
  if (hit) return { ownerAgentId: hit.ownerAgentId, collaborators: hit.collaborators, sopId: hit.sopId };
  return { ownerAgentId: "sultan", collaborators: ["fahad"], sopId: null };
}

export function routeChairmanCommand(text: string, options: { assignee?: string | null } = {}): CommandRoute {
  const keyword = keywordRoute(text);
  const explicit = explicitEmployee(options.assignee);
  if (explicit) return assignOwner(explicit, keyword);
  const addressed = addressedEmployee(text);
  if (addressed) return assignOwner(addressed, keyword);
  return keyword;
}

function planSteps(command: Pick<ChairmanCommand, "id" | "text" | "ownerAgentId" | "sopId">, amount: number | null, external: boolean): CommandStep[] {
  const sop = EMPLOYEE_SOPS.find((item) => item.id === command.sopId) || EMPLOYEE_SOPS.find((item) => item.ownerEmployeeId === command.ownerAgentId);
  const titles = (sop?.steps || ["فهم الطلب وتحديد المخرج", "جمع بيانات القسم", "تنفيذ العمل غير المالي", "كتابة تقرير النتيجة"]).slice(0, 4);
  const steps: CommandStep[] = titles.map((title, index) => ({
    id: `${command.id}-step-${index + 1}`,
    title,
    ownerAgentId: command.ownerAgentId,
    kind: "INTERNAL",
    status: "PENDING",
    evidence: null,
  }));
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

function walkSpendChain(ownerAgentId: string, text: string, amount: number): SpendChainState {
  const subject = text.slice(0, 180);
  let state = blankSpendChain({ preparingAgentId: ownerAgentId, subject, amountSAR: amount, stage: "department" });
  state = advanceSpendChain(state, ownerAgentId, {
    action: "submit_department",
    subject,
    options: "تنفيذ داخلي بلا التزام خارجي، أو تأجيل الصرف، أو البديل الأقل تكلفة الذي يذكره الطلب.",
    expectedReturn: "أثر تشغيلي داخل الشركة دون صرف قبل اعتماد رئيس مجلس الإدارة.",
    risks: "أي التزام مالي قبل الاعتماد يخالف صلاحية الموظفين.",
    amountSAR: amount,
  });
  state = advanceSpendChain(state, "abdulrahman", {
    action: "finance_review",
    result: "مشروط",
    note: "راجعت الميزانية والسيولة والبدائل. لا يُصرف المبلغ قبل اعتماد رئيس مجلس الإدارة، والبديل هو تأجيل الالتزام.",
  });
  state = advanceSpendChain(state, "hares", {
    action: "governance_review",
    result: "سليم",
    note: "السلسلة مكتملة الترتيب، ولا صلاحية صرف لأي موظف بما فيهم سلطان. يُرفع لسلطان ثم لرئيس مجلس الإدارة.",
  });
  state = advanceSpendChain(state, "sultan", {
    action: "sultan_recommendation",
    result: "موافقة",
    note: "أوصي بعرض المذكرة على رئيس مجلس الإدارة. لا أعتمد الصرف. التوصية مشروطة بمراجعة عبدالرحمن وفحص حارس.",
  });
  return state;
}

function refreshStatus(command: ChairmanCommand) {
  const openInternal = command.steps.some((step) => step.kind === "INTERNAL" && step.status !== "DONE");
  const externalBlocked = command.steps.some((step) => step.kind === "EXTERNAL" && step.status !== "DONE");
  const spendOpen = command.steps.some((step) => step.kind === "SPEND" && step.status !== "DONE");
  const current = command.steps.find((step) => step.status !== "DONE");
  command.currentStep = current?.title || "مغلق";
  command.blockers = command.steps.filter((step) => step.status === "BLOCKED").map((step) => step.title);
  if (spendOpen && !command.blockers.some((item) => item.includes("صرف") || item.includes("سلسلة"))) {
    command.blockers.push("بانتظار اعتماد رئيس مجلس الإدارة على الصرف");
  }
  if (!openInternal && !externalBlocked && !spendOpen) {
    command.status = "CLOSED";
    command.closedAt = command.closedAt || nowIso();
    return;
  }
  if (externalBlocked) command.status = "AWAITING_CHAIRMAN";
  else if (spendOpen) command.status = "IN_SPEND_CHAIN";
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
    collaborators: money ? Array.from(new Set([...route.collaborators, "abdulrahman", "hares", "sultan"])) : route.collaborators,
    sopId: route.sopId,
    status: "IN_PROGRESS",
    currentStep: "",
    blockers: [],
    steps: [],
    resultReport: null,
    spendApprovalId: null,
    taskId: null,
    diwan: { id: null, status: "OPEN", assigneeId: route.ownerAgentId, evidence: null, openedAt: createdAt, closedAt: null },
    dueAt: new Date(Date.parse(createdAt) + 3 * 86_400_000).toISOString(),
    createdAt,
    updatedAt: createdAt,
    closedAt: null,
  };
  command.steps = planSteps(command, amount, external);
  const owner = getAgent(route.ownerAgentId);
  for (const step of command.steps) {
    if (step.kind !== "INTERNAL") continue;
    step.status = "DONE";
    step.evidence = `أنجز ${owner?.name || route.ownerAgentId} داخل دوره: ${step.title}. لا رسالة خارجية ولا صرف.`;
  }
  if (money && !amount) {
    const spend = command.steps.find((step) => step.kind === "SPEND");
    if (spend) {
      spend.status = "BLOCKED";
      spend.evidence = "المبلغ غير محدد. لن تبدأ سلسلة الصرف قبل رقم صريح.";
    }
    command.blockers.push("طلب مالي بلا مبلغ محدد");
  }
  if (money && amount) {
    const chain = walkSpendChain(route.ownerAgentId, commandText, amount);
    const approval = createApproval({
      type: "BUDGET",
      title: commandText.slice(0, 140),
      detail: "طلب صرف نشأ من أمر رئيس مجلس الإدارة ومرّ بالسلسلة.",
      amount,
      requestedRole: "رئيس مجلس الإدارة",
      metadata: { spendChain: chain, commandId: command.id, source: "chairman-command" },
    });
    command.spendApprovalId = approval.id;
    const spend = command.steps.find((step) => step.kind === "SPEND");
    if (spend) {
      spend.status = "BLOCKED";
      spend.evidence = `المذكرة ${approval.id} عند رئيس مجلس الإدارة. لم يعتمدها موظف.`;
    }
  }
  refreshStatus(command);
  if (command.status === "CLOSED") {
    command.resultReport = reportFor(command);
    await closeDiwan(command, command.resultReport);
  } else {
    command.resultReport = reportFor(command);
    await trackWithDiwan(command);
  }
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

export function getChairmanCommand(id: string): ChairmanCommand | undefined {
  return store.find((command) => command.id === id);
}

export function commandsForAgent(agentId: string): ChairmanCommand[] {
  return listChairmanCommands().filter((command) => command.status !== "CLOSED" && (command.ownerAgentId === agentId || command.collaborators.includes(agentId) || command.steps.some((step) => step.ownerAgentId === agentId && step.status !== "DONE")));
}

export type CommandUpdate = {
  action: "progress" | "block" | "close" | "evidence";
  stepId?: string;
  note: string;
  evidence?: string;
};

export async function updateChairmanCommand(agentId: string, commandId: string, update: CommandUpdate): Promise<ChairmanCommand> {
  const command = getChairmanCommand(commandId);
  if (!command) throw new Error("الأمر غير موجود.");
  const involved = command.ownerAgentId === agentId || command.collaborators.includes(agentId) || agentId === "diwan";
  if (!involved) throw new Error("هذا الأمر ليس في نطاق هذا الموظف.");
  const note = update.note.trim();
  if (note.length < 3) throw new Error("أضف ملاحظة.");
  if (update.action === "close") {
    const evidence = (update.evidence || note).trim();
    if (evidence.length < 10) throw new Error("الإغلاق يحتاج دليلاً من عشر أحرف على الأقل.");
    if (command.steps.some((step) => step.kind === "EXTERNAL" && step.status !== "DONE")) {
      throw new Error("الإرسال الخارجي ينتظر اعتماد رئيس مجلس الإدارة.");
    }
    if (command.steps.some((step) => step.kind === "SPEND" && step.status !== "DONE")) {
      throw new Error("لا يُغلق أمر فيه صرف قبل اعتماد رئيس مجلس الإدارة.");
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
    const step = command.steps.find((item) => item.id === update.stepId) || command.steps.find((item) => item.status !== "DONE" && item.kind === "INTERNAL");
    if (!step) throw new Error("لا خطوة داخلية مفتوحة.");
    if (step.kind === "EXTERNAL") throw new Error("لا يُرسل شيء للخارج قبل اعتماد رئيس مجلس الإدارة.");
    if (step.kind === "SPEND") throw new Error("الصرف يتحرك في سلسلة الاعتماد، لا يُغلق من هنا.");
    step.status = "DONE";
    step.evidence = update.evidence?.trim() || note;
    refreshStatus(command);
  }
  command.updatedAt = nowIso();
  command.resultReport = command.resultReport || reportFor(command);
  await persistCommand(command);
  return command;
}

export async function settleChairmanCommandForSpend(approvalId: string, decision: "APPROVED" | "REJECTED") {
  const command = store.find((item) => item.spendApprovalId === approvalId);
  if (!command) return null;
  const spend = command.steps.find((step) => step.kind === "SPEND");
  if (spend) {
    spend.status = "DONE";
    spend.evidence = decision === "APPROVED"
      ? "اعتمده رئيس مجلس الإدارة."
      : "رفضه رئيس مجلس الإدارة. لا صرف.";
  }
  refreshStatus(command);
  command.resultReport = reportFor(command);
  command.updatedAt = nowIso();
  if (command.status === "CLOSED") await closeDiwan(command, command.resultReport);
  await persistCommand(command);
  return command;
}

export function publicCommandStatus(command: ChairmanCommand) {
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
  };
}

export function _clearChairmanCommands() {
  store.length = 0;
}

export function _setCommandDue(id: string, dueAt: string) {
  const command = getChairmanCommand(id);
  if (command) command.dueAt = dueAt;
}
