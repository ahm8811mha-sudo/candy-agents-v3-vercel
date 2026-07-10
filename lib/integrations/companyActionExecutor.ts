import {
  claimCompanyActionForExecution,
  getCompanyAction,
  updateCompanyActionStatus,
  type CompanyAction,
} from "../company/actionQueue";
import {
  appendActionToSheet,
  createGmailDraft,
  getGoogleWorkspaceStatus,
  GoogleWorkspaceConfigurationError,
  sendGmailMessage,
  uploadActionArtifact,
  withGoogleRetry,
  type GoogleWorkspaceCapability,
} from "./googleWorkspace";

export type CompanyIntegrationOperation =
  | "GMAIL_DRAFT"
  | "GMAIL_SEND"
  | "SHEETS_APPEND"
  | "DRIVE_UPLOAD";

export type CompanyActionIntegrationPlan = {
  provider: "google_workspace";
  capability: GoogleWorkspaceCapability;
  operation: CompanyIntegrationOperation;
  label: string;
};

export const SUPPORTED_INTEGRATION_ACTION_TYPES = [
  "SALES_OUTREACH",
  "EMAIL_DRAFT",
  "EMAIL_SEND",
  "SUPPLIER_SHORTLIST",
  "SHEETS_APPEND",
  "MARKETING_CAMPAIGN_DRAFT",
  "DRIVE_UPLOAD",
] as const;

export class UnsupportedActionIntegrationError extends Error {
  readonly actionType: string;

  constructor(actionType: string) {
    super(`No external integration is registered for action type ${actionType}.`);
    this.name = "UnsupportedActionIntegrationError";
    this.actionType = actionType;
  }
}

type IntegrationPayload = {
  operation?: CompanyIntegrationOperation;
  to?: string;
  subject?: string;
  html?: string;
  body?: string;
  fileName?: string;
  content?: string;
  mimeType?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function integrationPayload(action: CompanyAction): IntegrationPayload {
  const payload = asRecord(action.payload);
  const integration = asRecord(payload?.integration);
  if (!integration) return {};
  return {
    operation: stringValue(integration.operation) as CompanyIntegrationOperation || undefined,
    to: stringValue(integration.to) || undefined,
    subject: stringValue(integration.subject) || undefined,
    html: stringValue(integration.html) || undefined,
    body: stringValue(integration.body) || undefined,
    fileName: stringValue(integration.fileName) || undefined,
    content: stringValue(integration.content) || undefined,
    mimeType: stringValue(integration.mimeType) || undefined,
  };
}

export function getCompanyActionIntegrationPlan(action: Pick<CompanyAction, "action_type" | "payload">): CompanyActionIntegrationPlan | null {
  const explicit = integrationPayload(action as CompanyAction).operation;
  const operation = explicit || (() => {
    switch (action.action_type) {
      case "SALES_OUTREACH":
      case "EMAIL_DRAFT":
        return "GMAIL_DRAFT" as const;
      case "EMAIL_SEND":
        return "GMAIL_SEND" as const;
      case "SUPPLIER_SHORTLIST":
      case "SHEETS_APPEND":
        return "SHEETS_APPEND" as const;
      case "MARKETING_CAMPAIGN_DRAFT":
      case "DRIVE_UPLOAD":
        return "DRIVE_UPLOAD" as const;
      default:
        return null;
    }
  })();

  if (!operation) return null;
  switch (operation) {
    case "GMAIL_DRAFT":
      return { provider: "google_workspace", capability: "gmail", operation, label: "إنشاء مسودة Gmail" };
    case "GMAIL_SEND":
      return { provider: "google_workspace", capability: "gmail", operation, label: "إرسال عبر Gmail" };
    case "SHEETS_APPEND":
      return { provider: "google_workspace", capability: "sheets", operation, label: "إضافة إلى Google Sheets" };
    case "DRIVE_UPLOAD":
      return { provider: "google_workspace", capability: "drive", operation, label: "حفظ في Google Drive" };
    default:
      return null;
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function defaultEmailHtml(action: CompanyAction) {
  const description = action.description || "تم إنشاء هذه المسودة من قائمة تنفيذ Orvanta.";
  return [
    '<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#111827">',
    `<h2>${escapeHtml(action.title)}</h2>`,
    `<p>${escapeHtml(description)}</p>`,
    '<hr style="border:0;border-top:1px solid #e5e7eb" />',
    `<p style="color:#64748b;font-size:13px">نوع الإجراء: ${escapeHtml(action.action_type)}<br/>معرّف الإجراء: ${escapeHtml(action.id)}</p>`,
    "</div>",
  ].join("");
}

function defaultDriveContent(action: CompanyAction, actor: string) {
  return [
    `# ${action.title}`,
    "",
    action.description || "تم إنشاء هذا المستند من Orvanta Action Queue.",
    "",
    "## بيانات التنفيذ",
    "",
    `- Action ID: ${action.id}`,
    `- Project ID: ${action.project_id || "—"}`,
    `- Action Type: ${action.action_type}`,
    `- Provider: ${action.provider || "Google Drive"}`,
    `- Executed by: ${actor}`,
    `- Generated at: ${new Date().toISOString()}`,
    "",
    "## الحوكمة",
    "",
    "هذا المستند ناتج عن إجراء مسجل في Orvanta، ولا يعني إطلاق حملة مدفوعة أو صرف ميزانية خارج بوابة الاعتماد.",
  ].join("\n");
}

function safeFileName(value: string) {
  const compact = value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
  return `${compact.slice(0, 90) || "Orvanta Action"}.md`;
}

function externalResult(action: CompanyAction, plan: CompanyActionIntegrationPlan, output: Record<string, unknown>) {
  return {
    integration: {
      provider: plan.provider,
      operation: plan.operation,
      idempotencyKey: `company-action:${action.id}:${plan.operation}`,
      executedAt: new Date().toISOString(),
      ...output,
    },
  };
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 1500);
  return String(error).slice(0, 1500);
}

export type CompanyActionExecutionResult = {
  action: CompanyAction;
  reused: boolean;
  plan: CompanyActionIntegrationPlan;
};

export async function executeCompanyActionIntegration(
  id: string,
  actor = "system"
): Promise<CompanyActionExecutionResult> {
  const current = await getCompanyAction(id);
  if (!current) throw new Error("Action not found.");

  const plan = getCompanyActionIntegrationPlan(current);
  if (!plan) throw new UnsupportedActionIntegrationError(current.action_type);

  const priorIntegration = asRecord(asRecord(current.result)?.integration);
  if (current.status === "DONE" && priorIntegration) {
    return { action: current, reused: true, plan };
  }

  const status = getGoogleWorkspaceStatus();
  if (!status.capabilities[plan.capability]) {
    throw new GoogleWorkspaceConfigurationError(plan.capability, status.missingEnvironmentVariables);
  }

  const claimed = await claimCompanyActionForExecution(id, actor);
  const claimedPriorIntegration = asRecord(asRecord(claimed.result)?.integration);
  if (claimed.status === "DONE" && claimedPriorIntegration) {
    return { action: claimed, reused: true, plan };
  }

  const payload = integrationPayload(claimed);

  try {
    const output = await withGoogleRetry(async (): Promise<Record<string, unknown>> => {
      switch (plan.operation) {
        case "GMAIL_DRAFT": {
          const delivery = await createGmailDraft({
            actionId: claimed.id,
            to: payload.to || process.env.GOOGLE_DEFAULT_REVIEW_EMAIL,
            subject: payload.subject || `Orvanta — ${claimed.title}`,
            html: payload.html || (payload.body ? `<div dir="rtl"><p>${escapeHtml(payload.body)}</p></div>` : defaultEmailHtml(claimed)),
          });
          return { ...delivery };
        }
        case "GMAIL_SEND": {
          const delivery = await sendGmailMessage({
            actionId: claimed.id,
            to: payload.to || process.env.GOOGLE_DEFAULT_REVIEW_EMAIL,
            subject: payload.subject || `Orvanta — ${claimed.title}`,
            html: payload.html || (payload.body ? `<div dir="rtl"><p>${escapeHtml(payload.body)}</p></div>` : defaultEmailHtml(claimed)),
          });
          return { ...delivery };
        }
        case "SHEETS_APPEND": {
          const sheet = await appendActionToSheet({
            actionId: claimed.id,
            projectId: claimed.project_id,
            actionType: claimed.action_type,
            title: claimed.title,
            description: claimed.description,
            provider: claimed.provider,
            actor,
            status: "EXECUTED",
          });
          return { ...sheet };
        }
        case "DRIVE_UPLOAD": {
          const file = await uploadActionArtifact({
            actionId: claimed.id,
            fileName: payload.fileName || safeFileName(claimed.title),
            content: payload.content || payload.body || defaultDriveContent(claimed, actor),
            mimeType: payload.mimeType || "text/markdown",
          });
          return { ...file };
        }
        default:
          throw new UnsupportedActionIntegrationError(claimed.action_type);
      }
    });

    const action = await updateCompanyActionStatus({
      id: claimed.id,
      status: "DONE",
      actor,
      result: externalResult(claimed, plan, output),
      note: `${plan.label} completed`,
    });
    return { action, reused: false, plan };
  } catch (error) {
    await updateCompanyActionStatus({
      id: claimed.id,
      status: "FAILED",
      actor,
      error: errorMessage(error),
      note: `${plan.label} failed`,
    }).catch(() => undefined);
    throw error;
  }
}
