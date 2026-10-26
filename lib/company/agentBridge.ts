import { z } from "zod";
import { COMPANY_AGENTS, getAgent } from "./agents";
import { hydrateApprovals, listApprovals, writeApprovalCritical, type ApprovalItem } from "../approvals";
import {
  advanceSpendChain,
  agentMayApproveSpend,
  isMonetarySpend,
  isOwnerReadySpend,
  readSpendChain,
  spendStageAgent,
  toDecisionMemo,
  type SpendAdvance,
} from "./spendChain";
import {
  commandsForAgent,
  publicCommandStatus,
  updateChairmanCommand,
  type CommandUpdate,
} from "./chairmanCommands";
import { getSupabaseAdmin } from "../supabase";
import { getTenantId } from "../tenant";

export type BridgeMessage = {
  id: string;
  agentId: string;
  direction: "inbound" | "outbound" | "note";
  body: string;
  author: string;
  createdAt: string;
};

const messages: BridgeMessage[] = [];

const messageSchema = z.object({
  direction: z.enum(["inbound", "outbound", "note"]).default("note"),
  body: z.string().trim().min(1).max(8_000),
  author: z.string().trim().min(1).max(120).optional(),
});

const actionSchema = z.object({
  kind: z.enum(["spend", "command"]),
  approvalId: z.string().trim().min(3).max(120).optional(),
  commandId: z.string().trim().min(3).max(120).optional(),
  action: z.string().trim().min(3).max(40),
  subject: z.string().trim().max(300).optional(),
  options: z.string().trim().max(2_000).optional(),
  expectedReturn: z.string().trim().max(2_000).optional(),
  risks: z.string().trim().max(2_000).optional(),
  amountSAR: z.number().finite().nonnegative().optional(),
  result: z.string().trim().max(40).optional(),
  note: z.string().trim().max(4_000).optional(),
  stepId: z.string().trim().max(160).optional(),
  evidence: z.string().trim().max(4_000).optional(),
  decision: z.enum(["APPROVED", "REJECTED"]).optional(),
});

export function isBridgeAgent(agentId: string) {
  return Boolean(getAgent(agentId)) && agentId !== "owner";
}

export function bridgeRoster(limitToAgent?: string) {
  return COMPANY_AGENTS.filter((agent) => agent.id !== "owner" && (!limitToAgent || agent.id === limitToAgent)).map((agent) => ({
    id: agent.id,
    name: agent.name,
    title: agent.title,
    department: agent.department,
    rank: agent.rank,
    reportsTo: agent.reportsTo,
    authorityLimitSAR: agent.authorityLimitSAR,
    spendApproval: "none",
  }));
}

function newId() {
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function listBridgeMessages(agentId?: string): BridgeMessage[] {
  return messages.filter((message) => !agentId || message.agentId === agentId).slice(0, 50);
}

/** Raised when a durable write fails; routes map it to HTTP 500 so callers never see a false 200. */
export class DurableWriteError extends Error {
  readonly durable = true;
  constructor(message: string, readonly causeError?: unknown) { super(message); this.name = "DurableWriteError"; }
}
export function isDurableWriteError(error: unknown): boolean {
  return error instanceof Error && (error as { durable?: boolean }).durable === true;
}

export async function postBridgeMessage(agentId: string, input: unknown): Promise<BridgeMessage> {
  if (!isBridgeAgent(agentId)) throw new Error("موظف غير معروف.");
  const body = messageSchema.parse(input);
  const message: BridgeMessage = {
    id: newId(),
    agentId,
    direction: body.direction,
    body: body.body,
    author: body.author || agentId,
    createdAt: new Date().toISOString(),
  };
  messages.unshift(message);
  const client = getSupabaseAdmin();
  if (client) {
    const { error } = await client.from("agent_bridge_messages").insert({
      id: message.id,
      tenant_id: getTenantId(),
      agent_id: message.agentId,
      direction: message.direction,
      body: message.body,
      author: message.author,
      created_at: message.createdAt,
      metadata: {},
    });
    if (error) {
      const text = `${error.code || ""} ${error.message || ""}`;
      if (!/42P01|PGRST205|does not exist|schema cache|Could not find the table/i.test(text)) {
        throw new DurableWriteError("تعذر حفظ الرسالة.", error);
      }
    }
  }
  return message;
}

export function spendQueueForAgent(agentId: string): ApprovalItem[] {
  return listApprovals().filter((item) => {
    if (!isMonetarySpend(item.amount)) return false;
    if (item.status !== "PENDING" && item.status !== "DEFERRED") return false;
    const chain = readSpendChain(item);
    if (!chain) return false;
    const holder = spendStageAgent(chain);
    if (holder === agentId) return true;
    return chain.stage === "department" && chain.preparingAgentId === "department" && agentId === "sultan";
  });
}

async function summarizedRows(table: string, column: string, agentId: string) {
  const client = getSupabaseAdmin();
  if (!client) return [];
  const { data, error } = await client.from(table).select("id,title,status").eq(column, agentId).limit(8);
  if (error || !data) return [];
  return data.map((row) => ({
    id: String((row as { id?: string }).id || ""),
    title: String((row as { title?: string }).title || ""),
    status: String((row as { status?: string }).status || ""),
  }));
}

export async function agentWorkspace(agentId: string) {
  if (!isBridgeAgent(agentId)) throw new Error("موظف غير معروف.");
  const agent = getAgent(agentId)!;
  const [tasks, commitments] = await Promise.all([
    summarizedRows("tasks", "assigned_to", agentId),
    summarizedRows("decision_commitments", "assignee_id", agentId),
  ]);
  return {
    agent: {
      id: agent.id,
      name: agent.name,
      title: agent.title,
      department: agent.department,
      authorityLimitSAR: agent.authorityLimitSAR,
      spendApproval: agent.id === "owner" ? "chairman" : "none",
    },
    commands: commandsForAgent(agentId).map(publicCommandStatus),
    spendQueue: spendQueueForAgent(agentId).map((item) => ({
      id: item.id,
      title: item.title,
      amountSAR: item.amount,
      stage: readSpendChain(item)?.stage,
      needsChainReview: readSpendChain(item)?.needsChainReview === true,
    })),
    messages: listBridgeMessages(agentId),
    tables: { tasks, commitments },
  };
}

export function agentInbox(agentId: string) {
  if (!isBridgeAgent(agentId)) throw new Error("موظف غير معروف.");
  return {
    agentId,
    commands: commandsForAgent(agentId).map(publicCommandStatus),
    spendQueue: spendQueueForAgent(agentId).map((item) => {
      const chain = readSpendChain(item);
      return {
        id: item.id,
        title: item.title,
        amountSAR: item.amount ?? null,
        stage: chain?.stage || null,
        needsChainReview: chain?.needsChainReview === true,
        legacy: chain?.legacy === true,
        ownerReady: isOwnerReadySpend(chain),
      };
    }),
    messages: listBridgeMessages(agentId),
  };
}

function asAdvance(agentId: string, body: z.infer<typeof actionSchema>): SpendAdvance {
  if (body.action === "owner_decision" || body.decision) {
    if (agentMayApproveSpend(agentId, body.amountSAR || 1)) {
      return { action: "owner_decision", decision: body.decision || "APPROVED", note: body.note };
    }
    throw new Error("لا يملك أي موظف صلاحية اعتماد الصرف.");
  }
  if (body.action === "submit_department") {
    return {
      action: "submit_department",
      subject: body.subject || "",
      options: body.options || "",
      expectedReturn: body.expectedReturn || "",
      risks: body.risks || "",
      amountSAR: body.amountSAR,
    };
  }
  if (body.action === "finance_review") {
    if (body.result !== "موافق" && body.result !== "مشروط" && body.result !== "غير موافق") {
      throw new Error("نتيجة المراجعة المالية: موافق أو مشروط أو غير موافق.");
    }
    return { action: "finance_review", result: body.result, note: body.note || "" };
  }
  if (body.action === "governance_review") {
    if (body.result !== "سليم" && body.result !== "مشروط" && body.result !== "موقوف") {
      throw new Error("نتيجة الحوكمة: سليم أو مشروط أو موقوف.");
    }
    return { action: "governance_review", result: body.result, note: body.note || "" };
  }
  if (body.action === "sultan_recommendation") {
    if (body.result !== "موافقة" && body.result !== "رفض" && body.result !== "تعديل") {
      throw new Error("توصية سلطان: موافقة أو رفض أو تعديل.");
    }
    return { action: "sultan_recommendation", result: body.result, note: body.note || "" };
  }
  throw new Error("إجراء صرف غير معروف.");
}

export async function postBridgeAction(agentId: string, input: unknown) {
  if (!isBridgeAgent(agentId)) throw new Error("موظف غير معروف.");
  const body = actionSchema.parse(input);
  if (body.kind === "command") {
    if (!body.commandId) throw new Error("يلزم معرّف الأمر.");
    const update: CommandUpdate = {
      action: body.action === "block" ? "block" : body.action === "close" ? "close" : body.action === "evidence" ? "evidence" : "progress",
      stepId: body.stepId,
      note: body.note || body.evidence || "",
      evidence: body.evidence,
    };
    const command = await updateChairmanCommand(agentId, body.commandId, update);
    return { kind: "command" as const, command: publicCommandStatus(command) };
  }
  if (!body.approvalId) throw new Error("يلزم معرّف طلب الصرف.");
  // Always read the current state from the DB; never trust this instance's memory.
  await hydrateApprovals();
  const item = listApprovals().find((approval) => approval.id === body.approvalId);
  if (!item) throw new Error("طلب الصرف غير موجود.");
  const state = readSpendChain(item);
  if (!state) throw new Error("هذا العنصر ليس طلباً مالياً.");
  const next = advanceSpendChain(state, agentId, asAdvance(agentId, body));
  if (next.decision) throw new Error("لا يملك أي موظف صلاحية اعتماد الصرف.");
  let saved: ApprovalItem;
  try {
    saved = await writeApprovalCritical({ ...item, metadata: { ...item.metadata, spendChain: next } });
  } catch (error) {
    throw new DurableWriteError("تعذر حفظ إجراء الصرف في قاعدة البيانات؛ لم يُعتمد التغيير. أعد المحاولة.", error);
  }
  return {
    kind: "spend" as const,
    approvalId: saved.id,
    stage: next.stage,
    needsChainReview: next.needsChainReview,
    ownerReady: isOwnerReadySpend(next),
    memo: isOwnerReadySpend(next) ? toDecisionMemo(saved.id, next) : null,
  };
}

export function _clearBridgeMessages() {
  messages.length = 0;
}
