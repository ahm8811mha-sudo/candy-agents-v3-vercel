import { Readable } from "node:stream";
import { google } from "googleapis";

export type GoogleWorkspaceCapability = "gmail" | "sheets" | "drive";

export type GoogleWorkspaceStatus = {
  enabled: boolean;
  disabledByFlag: boolean;
  credentialsConfigured: boolean;
  capabilities: Record<GoogleWorkspaceCapability, boolean>;
  missingEnvironmentVariables: string[];
  defaults: {
    gmailSenderConfigured: boolean;
    reviewEmailConfigured: boolean;
    spreadsheetConfigured: boolean;
    driveFolderConfigured: boolean;
  };
};

export type GmailDeliveryInput = {
  actionId: string;
  to?: string;
  subject: string;
  html: string;
};

export type GmailDeliveryResult = {
  mode: "draft" | "sent";
  messageId: string;
  threadId?: string | null;
  alreadyExisted: boolean;
};

export type SheetAppendInput = {
  actionId: string;
  projectId?: string | null;
  actionType: string;
  title: string;
  description?: string | null;
  provider?: string | null;
  actor: string;
  status: string;
};

export type SheetAppendResult = {
  spreadsheetId: string;
  spreadsheetUrl: string;
  updatedRange?: string | null;
  alreadyExisted: boolean;
};

export type DriveUploadInput = {
  actionId: string;
  fileName: string;
  content: string;
  mimeType?: string;
};

export type DriveUploadResult = {
  fileId: string;
  fileName: string;
  webViewLink?: string | null;
  webContentLink?: string | null;
  alreadyExisted: boolean;
};

const REQUIRED_ENV = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"] as const;
const DEFAULT_SHEET_NAME = "Orvanta Action Queue";
const DEFAULT_SHEET_TAB = "Actions";

function enabledByEnvironment() {
  const featureFlag = process.env.GOOGLE_INTEGRATIONS_ENABLED?.trim().toLowerCase();
  if (featureFlag === "false") return false;
  if (featureFlag === "true") return true;

  // A complete OAuth connection is an unambiguous opt-in. This avoids leaving
  // a successfully linked account blocked only because the legacy flag was
  // omitted. Setting the flag explicitly to false remains a hard kill switch.
  return REQUIRED_ENV.every((name) => Boolean(process.env[name]?.trim()));
}

export function getGoogleWorkspaceStatus(): GoogleWorkspaceStatus {
  const missingEnvironmentVariables = REQUIRED_ENV.filter((name) => !process.env[name]);
  const disabledByFlag = process.env.GOOGLE_INTEGRATIONS_ENABLED?.trim().toLowerCase() === "false";
  const enabled = enabledByEnvironment();
  const credentialsConfigured = missingEnvironmentVariables.length === 0;
  const ready = enabled && credentialsConfigured;

  return {
    enabled,
    disabledByFlag,
    credentialsConfigured,
    capabilities: {
      gmail: ready,
      sheets: ready,
      drive: ready,
    },
    missingEnvironmentVariables: enabled
      ? missingEnvironmentVariables
      : disabledByFlag
        ? ["GOOGLE_INTEGRATIONS_ENABLED"]
        : missingEnvironmentVariables,
    defaults: {
      gmailSenderConfigured: Boolean(process.env.GOOGLE_GMAIL_SENDER),
      reviewEmailConfigured: Boolean(process.env.GOOGLE_DEFAULT_REVIEW_EMAIL),
      spreadsheetConfigured: Boolean(process.env.GOOGLE_SHEETS_SPREADSHEET_ID),
      driveFolderConfigured: Boolean(process.env.GOOGLE_DRIVE_FOLDER_ID),
    },
  };
}

export class GoogleWorkspaceConfigurationError extends Error {
  readonly missingEnvironmentVariables: string[];
  readonly capability: GoogleWorkspaceCapability;

  constructor(capability: GoogleWorkspaceCapability, missingEnvironmentVariables: string[]) {
    super(`Google Workspace ${capability} integration is not configured.`);
    this.name = "GoogleWorkspaceConfigurationError";
    this.capability = capability;
    this.missingEnvironmentVariables = missingEnvironmentVariables;
  }
}

function assertCapability(capability: GoogleWorkspaceCapability) {
  const status = getGoogleWorkspaceStatus();
  if (!status.capabilities[capability]) {
    throw new GoogleWorkspaceConfigurationError(capability, status.missingEnvironmentVariables);
  }
}

function getOAuthClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return client;
}

function encodeMimeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function safeMessageId(actionId: string) {
  return `orvanta-${actionId.replace(/[^a-zA-Z0-9._-]/g, "-")}@actions.orvanta.local`;
}

function buildMimeMessage(input: {
  actionId: string;
  from: string;
  to?: string;
  subject: string;
  html: string;
}) {
  const messageId = safeMessageId(input.actionId);
  const headers = [
    `From: ${input.from}`,
    input.to ? `To: ${input.to}` : null,
    `Subject: ${encodeMimeHeader(input.subject)}`,
    `Message-ID: <${messageId}>`,
    `X-Orvanta-Action-ID: ${input.actionId}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(input.html, "utf8").toString("base64"),
  ].filter((line): line is string => line !== null);

  return {
    raw: Buffer.from(headers.join("\r\n"), "utf8").toString("base64url"),
    messageId,
  };
}

async function resolveSenderEmail() {
  const configured = process.env.GOOGLE_GMAIL_SENDER?.trim();
  if (configured) return configured;

  const gmail = google.gmail({ version: "v1", auth: getOAuthClient() });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const email = profile.data.emailAddress?.trim();
  if (!email) throw new Error("Gmail profile did not return an email address.");
  return email;
}

async function findExistingGmailMessage(actionId: string) {
  const gmail = google.gmail({ version: "v1", auth: getOAuthClient() });
  const messageId = safeMessageId(actionId);
  const existing = await gmail.users.messages.list({
    userId: "me",
    q: `rfc822msgid:${messageId}`,
    maxResults: 1,
    includeSpamTrash: true,
  });
  return existing.data.messages?.[0] || null;
}

export async function createGmailDraft(input: GmailDeliveryInput): Promise<GmailDeliveryResult> {
  assertCapability("gmail");
  const existing = await findExistingGmailMessage(input.actionId);
  if (existing?.id) {
    return {
      mode: "draft",
      messageId: existing.id,
      threadId: existing.threadId,
      alreadyExisted: true,
    };
  }

  const gmail = google.gmail({ version: "v1", auth: getOAuthClient() });
  const from = await resolveSenderEmail();
  const { raw } = buildMimeMessage({ ...input, from });
  const response = await gmail.users.drafts.create({
    userId: "me",
    requestBody: { message: { raw } },
  });
  const message = response.data.message;
  if (!message?.id) throw new Error("Gmail created a draft without returning a message id.");

  return {
    mode: "draft",
    messageId: message.id,
    threadId: message.threadId,
    alreadyExisted: false,
  };
}

export async function sendGmailMessage(input: GmailDeliveryInput): Promise<GmailDeliveryResult> {
  assertCapability("gmail");
  if (!input.to?.trim()) throw new Error("A recipient is required before Gmail can send the message.");

  const existing = await findExistingGmailMessage(input.actionId);
  if (existing?.id) {
    return {
      mode: "sent",
      messageId: existing.id,
      threadId: existing.threadId,
      alreadyExisted: true,
    };
  }

  const gmail = google.gmail({ version: "v1", auth: getOAuthClient() });
  const from = await resolveSenderEmail();
  const { raw } = buildMimeMessage({ ...input, from });
  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
  if (!response.data.id) throw new Error("Gmail sent the message without returning a message id.");

  return {
    mode: "sent",
    messageId: response.data.id,
    threadId: response.data.threadId,
    alreadyExisted: false,
  };
}

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function quoteSheetName(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

async function ensureActionSpreadsheet() {
  const auth = getOAuthClient();
  const configuredId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  if (configuredId) return configuredId;

  const drive = google.drive({ version: "v3", auth });
  const title = process.env.GOOGLE_SHEETS_NAME?.trim() || DEFAULT_SHEET_NAME;
  const existing = await drive.files.list({
    q: `name = '${escapeDriveQueryValue(title)}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
    pageSize: 1,
    spaces: "drive",
    fields: "files(id,name)",
  });
  const existingId = existing.data.files?.[0]?.id;
  if (existingId) return existingId;

  const sheets = google.sheets({ version: "v4", auth });
  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title },
      sheets: [{ properties: { title: DEFAULT_SHEET_TAB } }],
    },
  });
  const spreadsheetId = created.data.spreadsheetId;
  if (!spreadsheetId) throw new Error("Google Sheets did not return a spreadsheet id.");

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quoteSheetName(DEFAULT_SHEET_TAB)}!A1:J1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        "Timestamp",
        "Action ID",
        "Project ID",
        "Action Type",
        "Title",
        "Description",
        "Status",
        "Provider",
        "Actor",
        "Source",
      ]],
    },
  });

  return spreadsheetId;
}

export async function appendActionToSheet(input: SheetAppendInput): Promise<SheetAppendResult> {
  assertCapability("sheets");
  const auth = getOAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const spreadsheetId = await ensureActionSpreadsheet();
  const tab = process.env.GOOGLE_SHEETS_TAB?.trim() || DEFAULT_SHEET_TAB;
  const actionIdRange = `${quoteSheetName(tab)}!B2:B`;
  const ids = await sheets.spreadsheets.values.get({ spreadsheetId, range: actionIdRange });
  const alreadyExisted = (ids.data.values || []).some((row) => String(row[0] || "") === input.actionId);

  if (alreadyExisted) {
    return {
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      alreadyExisted: true,
    };
  }

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${quoteSheetName(tab)}!A:J`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [[
        new Date().toISOString(),
        input.actionId,
        input.projectId || "",
        input.actionType,
        input.title,
        input.description || "",
        input.status,
        input.provider || "Google Sheets",
        input.actor,
        "Orvanta Action Queue",
      ]],
    },
  });

  return {
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    updatedRange: response.data.updates?.updatedRange,
    alreadyExisted: false,
  };
}

async function findExistingDriveArtifact(actionId: string) {
  const drive = google.drive({ version: "v3", auth: getOAuthClient() });
  const existing = await drive.files.list({
    q: `appProperties has { key='orvantaActionId' and value='${escapeDriveQueryValue(actionId)}' } and trashed = false`,
    pageSize: 1,
    spaces: "drive",
    fields: "files(id,name,webViewLink,webContentLink)",
  });
  return existing.data.files?.[0] || null;
}

export async function uploadActionArtifact(input: DriveUploadInput): Promise<DriveUploadResult> {
  assertCapability("drive");
  const existing = await findExistingDriveArtifact(input.actionId);
  if (existing?.id) {
    return {
      fileId: existing.id,
      fileName: existing.name || input.fileName,
      webViewLink: existing.webViewLink,
      webContentLink: existing.webContentLink,
      alreadyExisted: true,
    };
  }

  const drive = google.drive({ version: "v3", auth: getOAuthClient() });
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  const mimeType = input.mimeType || "text/markdown";
  const response = await drive.files.create({
    requestBody: {
      name: input.fileName,
      mimeType,
      parents: folderId ? [folderId] : undefined,
      appProperties: {
        orvantaActionId: input.actionId,
        orvantaSource: "action-queue",
      },
    },
    media: {
      mimeType,
      body: Readable.from([input.content]),
    },
    fields: "id,name,webViewLink,webContentLink",
  });

  if (!response.data.id) throw new Error("Google Drive did not return a file id.");
  return {
    fileId: response.data.id,
    fileName: response.data.name || input.fileName,
    webViewLink: response.data.webViewLink,
    webContentLink: response.data.webContentLink,
    alreadyExisted: false,
  };
}

function googleErrorStatus(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as {
    code?: number | string;
    response?: { status?: number };
    status?: number;
  };
  const value = candidate.response?.status ?? candidate.status ?? candidate.code;
  const parsed = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(parsed) ? Number(parsed) : undefined;
}

export function isTransientGoogleError(error: unknown) {
  const status = googleErrorStatus(error);
  if (status === 408 || status === 429 || (status != null && status >= 500)) return true;
  if (error instanceof Error) {
    return /ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket hang up/i.test(error.message);
  }
  return false;
}

export async function withGoogleRetry<T>(operation: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isTransientGoogleError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** (attempt - 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Google Workspace operation failed.");
}
