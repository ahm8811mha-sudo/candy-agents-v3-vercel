import { fetchRows, hasSupabaseEnv, persist } from "@/lib/supabase";
import { runAgent } from "@/lib/ai";
import { getAgent } from "./agents";
import { listCorrespondence } from "./correspondence";

export type CorrespondenceTaskStatus = "ASSIGNED" | "EXECUTED" | "FAILED";

export type CorrespondenceTask = {
  id: string;
  messageId: string;
  messageSubject: string;
  messageReference: string;
  agentId: string;
  agentName: string;
  agentTitle: string;
  instruction: string;
  executionResult: string;
  status: CorrespondenceTaskStatus;
  createdAt: string;
};

const memoryTasks: CorrespondenceTask[] = [];

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `mail-task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function toDb(task: CorrespondenceTask): Record<string, unknown> {
  return {
    id: task.id,
    message_id: task.messageId,
    message_subject: task.messageSubject,
    message_reference: task.messageReference,
    agent_id: task.agentId,
    agent_name: task.agentName,
    agent_title: task.agentTitle,
    instruction: task.instruction,
    execution_result: task.executionResult,
    status: task.status,
    created_at: task.createdAt,
  };
}

function fromDb(row: Record<string, unknown>): CorrespondenceTask {
  return {
    id: String(row.id),
    messageId: String(row.message_id || ""),
    messageSubject: String(row.message_subject || ""),
    messageReference: String(row.message_reference || ""),
    agentId: String(row.agent_id || ""),
    agentName: String(row.agent_name || ""),
    agentTitle: String(row.agent_title || ""),
    instruction: String(row.instruction || ""),
    executionResult: String(row.execution_result || ""),
    status: String(row.status || "ASSIGNED") as CorrespondenceTaskStatus,
    createdAt: String(row.created_at || nowIso()),
  };
}

function saveTask(task: CorrespondenceTask) {
  const existing = memoryTasks.findIndex((item) => item.id === task.id);
  if (existing >= 0) memoryTasks[existing] = task;
  else memoryTasks.unshift(task);
  if (hasSupabaseEnv()) persist("correspondence_tasks", toDb(task));
  return task;
}

export async function listCorrespondenceTasks(messageId?: string): Promise<CorrespondenceTask[]> {
  const rows = hasSupabaseEnv() ? await fetchRows("correspondence_tasks", { orderBy: "created_at", limit: 200 }) : [];
  const merged = new Map<string, CorrespondenceTask>();
  for (const task of [...memoryTasks, ...rows.map(fromDb)]) merged.set(task.id, task);
  const tasks = Array.from(merged.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return messageId ? tasks.filter((task) => task.messageId === messageId) : tasks;
}

export async function assignCorrespondenceTask(input: { messageId: string; agentId: string; instruction: string }) {
  const all = await listCorrespondence();
  const message = all.find((item) => item.id === input.messageId);
  if (!message) throw new Error("MESSAGE_NOT_FOUND");

  const agent = getAgent(input.agentId);
  if (!agent) throw new Error("AGENT_NOT_FOUND");

  const instruction = input.instruction.trim();
  if (!instruction) throw new Error("INSTRUCTION_REQUIRED");

  const prompt = `لديك رسالة واردة في مركز المخاطبات.

الموضوع: ${message.subject}
المرجع: ${message.reference}
من: ${message.fromEmail}
إلى: ${message.toEmail}
نص الرسالة:
${message.bodyText}

المطلوب منك كموظف مسؤول:
${instruction}

نفّذ المطلوب عملياً. اكتب النتيجة على شكل: فهم الطلب، الإجراءات المطلوبة، مسودة الرد إن وجدت، المخاطر، والخطوة التالية.`;

  const executionResult = await runAgent(prompt, {
    agentName: `correspondence_${agent.id}_agent`,
    system: `أنت ${agent.name}، ${agent.title}. تعامل مع المخاطبة كموظف داخل الشركة. لا تكتب كلاماً عاماً. أعط مخرجاً تنفيذياً واضحاً بالعربية.`,
  });

  return saveTask({
    id: newId(),
    messageId: message.id,
    messageSubject: message.subject,
    messageReference: message.reference,
    agentId: agent.id,
    agentName: agent.name,
    agentTitle: agent.title,
    instruction,
    executionResult,
    status: executionResult ? "EXECUTED" : "ASSIGNED",
    createdAt: nowIso(),
  });
}
