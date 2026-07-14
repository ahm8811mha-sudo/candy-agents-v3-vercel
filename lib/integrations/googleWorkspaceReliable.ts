import {
  appendActionToSheet,
  createGmailDraft,
  sendGmailMessage,
  uploadActionArtifact,
  withGoogleRetry,
  type DriveUploadInput,
  type GmailDeliveryInput,
  type SheetAppendInput,
} from "./googleWorkspace";
import { executeIntegrationOnce } from "../operations/integrationExecution";

export async function createReliableGmailDraft(tenantId: string, input: GmailDeliveryInput) {
  return executeIntegrationOnce({
    tenantId,
    integration: "GOOGLE_WORKSPACE",
    operation: "gmail.draft",
    idempotencyKey: input.actionId,
    request: { actionId: input.actionId, to: input.to || null, subject: input.subject },
    execute: async () => {
      const result = await withGoogleRetry(() => createGmailDraft(input));
      return {
        value: result,
        externalId: result.messageId,
        receiptType: "GMAIL_DRAFT",
        receipt: { messageId: result.messageId, threadId: result.threadId || null, alreadyExisted: result.alreadyExisted },
      };
    },
  });
}

export async function sendReliableGmailMessage(tenantId: string, input: GmailDeliveryInput) {
  return executeIntegrationOnce({
    tenantId,
    integration: "GOOGLE_WORKSPACE",
    operation: "gmail.send",
    idempotencyKey: input.actionId,
    request: { actionId: input.actionId, to: input.to || null, subject: input.subject },
    execute: async () => {
      const result = await withGoogleRetry(() => sendGmailMessage(input));
      return {
        value: result,
        externalId: result.messageId,
        receiptType: "GMAIL_SENT",
        receipt: { messageId: result.messageId, threadId: result.threadId || null, alreadyExisted: result.alreadyExisted },
      };
    },
  });
}

export async function appendReliableActionToSheet(tenantId: string, input: SheetAppendInput) {
  return executeIntegrationOnce({
    tenantId,
    integration: "GOOGLE_WORKSPACE",
    operation: "sheets.append-action",
    idempotencyKey: input.actionId,
    request: input,
    execute: async () => {
      const result = await withGoogleRetry(() => appendActionToSheet(input));
      return {
        value: result,
        externalId: result.spreadsheetId,
        externalUrl: result.spreadsheetUrl,
        receiptType: "GOOGLE_SHEET_ROW",
        receipt: {
          spreadsheetId: result.spreadsheetId,
          updatedRange: result.updatedRange || null,
          alreadyExisted: result.alreadyExisted,
        },
      };
    },
  });
}

export async function uploadReliableActionArtifact(tenantId: string, input: DriveUploadInput) {
  return executeIntegrationOnce({
    tenantId,
    integration: "GOOGLE_WORKSPACE",
    operation: "drive.upload-action-artifact",
    idempotencyKey: input.actionId,
    request: { actionId: input.actionId, fileName: input.fileName, mimeType: input.mimeType || "text/markdown" },
    execute: async () => {
      const result = await withGoogleRetry(() => uploadActionArtifact(input));
      return {
        value: result,
        externalId: result.fileId,
        externalUrl: result.webViewLink || result.webContentLink || undefined,
        receiptType: "GOOGLE_DRIVE_FILE",
        receipt: {
          fileId: result.fileId,
          fileName: result.fileName,
          webViewLink: result.webViewLink || null,
          webContentLink: result.webContentLink || null,
          alreadyExisted: result.alreadyExisted,
        },
      };
    },
  });
}
