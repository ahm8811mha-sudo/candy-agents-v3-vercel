import { fetchRows, getSupabaseAdmin, hasSupabaseEnv, persist } from "@/lib/supabase";

export type CorrespondenceDirection = "INBOUND" | "OUTBOUND";
export type CorrespondenceMailbox = "INBOX" | "SENT" | "DRAFTS" | "ARCHIVED";
export type CorrespondenceStatus = "RECEIVED" | "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "SENT" | "FAILED" | "ARCHIVED";
export type CorrespondenceContactType = "GOVERNMENT" | "COMPANY" | "INDIVIDUAL";
export type CorrespondencePriority = "NORMAL" | "IMPORTANT" | "URGENT";

export type CorrespondenceMessage = {
  id: string;
  reference: string;
  direction: CorrespondenceDirection;
  mailbox: CorrespondenceMailbox;
  fromEmail: string;
  fromName?: string;
  toEmail: string;
  toName?: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  status: CorrespondenceStatus;
  priority: CorrespondencePriority;
  contactType: CorrespondenceContactType;
  provider?: "RESEND" | "GMAIL" | "SMTP" | "MANUAL";
  providerMessageId?: string;
  threadId?: string;
  needsApproval: boolean;
  approvedBy?: string;
  createdAt: string;
  sentAt?: string;
  receivedAt?: string;
  archivedAt?: string;
};

export type DraftInput = {
  toEmail?: string;
  toName?: string;
  subject?: string;
  bodyText?: string;
  contactType?: CorrespondenceContactType;
  priority?: CorrespondencePriority;
  needsApproval?: boolean;
};

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function reference() {
  const year = new Date().getFullYear();
  return `ORV-COR-${year}-${Date.now().toString().slice(-6)}`;
}

function fromDb(row: Record<string, unknown>): CorrespondenceMessage {
  return {
    id: String(row.id),
    reference: String(row.reference || ""),
    direction: String(row.direction || "INBOUND") as CorrespondenceDirection,
    mailbox: String(row.mailbox || "INBOX") as CorrespondenceMailbox,
    fromEmail: String(row.from_email || ""),
    fromName: row.from_name ? String(row.from_name) : undefined,
    toEmail: String(row.to_email || ""),
    toName: row.to_name ? String(row.to_name) : undefined,
    cc: row.cc ? String(row.cc) : undefined,
    bcc: row.bcc ? String(row.bcc) : undefined,
    subject: String(row.subject || ""),
    bodyText: String(row.body_text || ""),
    bodyHtml: row.body_html ? String(row.body_html) : undefined,
    status: String(row.status || "RECEIVED") as CorrespondenceStatus,
    priority: String(row.priority || "NORMAL") as CorrespondencePriority,
    contactType: String(row.contact_type || "COMPANY") as CorrespondenceContactType,
    provider: row.provider ? String(row.provider) as CorrespondenceMessage["provider"] : undefined,
    providerMessageId: row.provider_message_id ? String(row.provider_message_id) : undefined,
    threadId: row.thread_id ? String(row.thread_id) : undefined,
    needsApproval: Boolean(row.needs_approval),
    approvedBy: row.approved_by ? String(row.approved_by) : undefined,
    createdAt: String(row.created_at || nowIso()),
    sentAt: row.sent_at ? String(row.sent_at) : undefined,
    receivedAt: row.received_at ? String(row.received_at) : undefined,
    archivedAt: row.archived_at ? String(row.archived_at) : undefined,
  };
}

function toDb(message: CorrespondenceMessage): Record<string, unknown> {
  return {
    id: message.id,
    reference: message.reference,
    direction: message.direction,
    mailbox: message.mailbox,
    from_email: message.fromEmail,
    from_name: message.fromName || null,
    to_email: message.toEmail,
    to_name: message.toName || null,
    cc: message.cc || null,
    bcc: message.bcc || null,
    subject: message.subject,
    body_text: message.bodyText,
    body_html: message.bodyHtml || null,
    status: message.status,
    priority: message.priority,
    contact_type: message.contactType,
    provider: message.provider || "MANUAL",
    provider_message_id: message.providerMessageId || null,
    thread_id: message.threadId || null,
    needs_approval: message.needsApproval,
    approved_by: message.approvedBy || null,
    created_at: message.createdAt,
    sent_at: message.sentAt || null,
    received_at: message.receivedAt || null,
    archived_at: message.archivedAt || null,
  };
}

const memoryMessages: CorrespondenceMessage[] = [
  {
    id: "demo-in-001",
    reference: "ORV-COR-DEMO-001",
    direction: "INBOUND",
    mailbox: "INBOX",
    fromEmail: "official@example.gov.sa",
    fromName: "جهة رسمية",
    toEmail: "official@orvanta.local",
    subject: "إفادة بخصوص طلب سابق",
    bodyText: "وردت إفادة رسمية وتحتاج مراجعة قبل الرد.",
    status: "RECEIVED",
    priority: "IMPORTANT",
    contactType: "GOVERNMENT",
    provider: "MANUAL",
    needsApproval: true,
    createdAt: nowIso(),
    receivedAt: nowIso(),
  },
  {
    id: "demo-sent-001",
    reference: "ORV-COR-DEMO-002",
    direction: "OUTBOUND",
    mailbox: "SENT",
    fromEmail: "official@orvanta.local",
    toEmail: "supplier@example.com",
    toName: "شركة موردين",
    subject: "طلب إعادة جدولة دفعة",
    bodyText: "نأمل دراسة إعادة جدولة الدفعة وتزويدنا بالخيارات المتاحة.",
    status: "SENT",
    priority: "IMPORTANT",
    contactType: "COMPANY",
    provider: "MANUAL",
    needsApproval: false,
    createdAt: nowIso(),
    sentAt: nowIso(),
  },
];

export async function listCorrespondence(): Promise<CorrespondenceMessage[]> {
  if (!hasSupabaseEnv()) return [...memoryMessages].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const rows = await fetchRows("correspondence_messages", { orderBy: "created_at", limit: 200 });
  return rows.map(fromDb);
}

export async function saveCorrespondence(message: CorrespondenceMessage) {
  if (!hasSupabaseEnv()) {
    const existing = memoryMessages.findIndex((item) => item.id === message.id);
    if (existing >= 0) memoryMessages[existing] = message;
    else memoryMessages.unshift(message);
    return message;
  }
  persist("correspondence_messages", toDb(message));
  return message;
}

export async function createDraft(input: DraftInput) {
  const contactType = input.contactType || "COMPANY";
  const needsApproval = input.needsApproval ?? contactType === "GOVERNMENT";
  return saveCorrespondence({
    id: newId("cor-draft"),
    reference: reference(),
    direction: "OUTBOUND",
    mailbox: "DRAFTS",
    fromEmail: process.env.CORRESPONDENCE_FROM_EMAIL || "official@orvanta.local",
    toEmail: input.toEmail || "recipient@example.com",
    toName: input.toName,
    subject: input.subject || "مسودة مخاطبة",
    bodyText: input.bodyText || "",
    status: "DRAFT",
    priority: input.priority || "NORMAL",
    contactType,
    provider: "MANUAL",
    needsApproval,
    createdAt: nowIso(),
  });
}

export async function createInbound(input: DraftInput & { fromEmail?: string; fromName?: string }) {
  return saveCorrespondence({
    id: newId("cor-in"),
    reference: reference(),
    direction: "INBOUND",
    mailbox: "INBOX",
    fromEmail: input.fromEmail || "unknown@example.com",
    fromName: input.fromName,
    toEmail: process.env.CORRESPONDENCE_FROM_EMAIL || "official@orvanta.local",
    subject: input.subject || "مخاطبة واردة",
    bodyText: input.bodyText || "",
    status: "RECEIVED",
    priority: input.priority || "NORMAL",
    contactType: input.contactType || "COMPANY",
    provider: "RESEND",
    needsApproval: false,
    createdAt: nowIso(),
    receivedAt: nowIso(),
  });
}

export async function approveCorrespondence(id: string, approvedBy = "Owner") {
  const all = await listCorrespondence();
  const message = all.find((item) => item.id === id);
  if (!message) return null;
  message.status = "APPROVED";
  message.approvedBy = approvedBy;
  await saveCorrespondence(message);
  return message;
}

export async function archiveCorrespondence(id: string) {
  const all = await listCorrespondence();
  const message = all.find((item) => item.id === id);
  if (!message) return null;
  message.mailbox = "ARCHIVED";
  message.status = "ARCHIVED";
  message.archivedAt = nowIso();
  await saveCorrespondence(message);
  return message;
}

export async function sendCorrespondence(input: DraftInput & { id?: string; approvedBy?: string }) {
  const all = await listCorrespondence();
  const existing = input.id ? all.find((item) => item.id === input.id) : null;
  const base = existing || await createDraft(input);
  const needsApproval = base.needsApproval || base.contactType === "GOVERNMENT";
  if (needsApproval && base.status !== "APPROVED" && !input.approvedBy) {
    base.status = "PENDING_APPROVAL";
    base.mailbox = "DRAFTS";
    await saveCorrespondence(base);
    return { message: base, sent: false, reason: "PENDING_APPROVAL" };
  }

  const providerResult = await sendViaResend(base);
  base.mailbox = "SENT";
  base.direction = "OUTBOUND";
  base.status = providerResult.ok ? "SENT" : "FAILED";
  base.provider = providerResult.provider;
  base.providerMessageId = providerResult.messageId;
  base.sentAt = nowIso();
  if (input.approvedBy) base.approvedBy = input.approvedBy;
  await saveCorrespondence(base);
  return { message: base, sent: providerResult.ok, reason: providerResult.reason };
}

async function sendViaResend(message: CorrespondenceMessage): Promise<{ ok: boolean; provider: "RESEND" | "MANUAL"; messageId?: string; reason: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CORRESPONDENCE_FROM_EMAIL || message.fromEmail;
  if (!apiKey || !from || from.endsWith(".local")) {
    return { ok: false, provider: "MANUAL", reason: "EMAIL_PROVIDER_NOT_CONFIGURED" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.toEmail],
        subject: message.subject,
        text: message.bodyText,
      }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, provider: "RESEND", reason: String(json?.message || response.statusText) };
    return { ok: true, provider: "RESEND", messageId: String(json?.id || ""), reason: "SENT" };
  } catch (error) {
    return { ok: false, provider: "RESEND", reason: error instanceof Error ? error.message : "SEND_FAILED" };
  }
}

export function canUseRealEmail() {
  return Boolean(process.env.RESEND_API_KEY && process.env.CORRESPONDENCE_FROM_EMAIL);
}

export function hasCorrespondenceDb() {
  return Boolean(getSupabaseAdmin());
}
