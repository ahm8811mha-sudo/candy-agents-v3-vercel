import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";

const results = [];
const cleanup = [];

function record(name, status, detail = {}) {
  results.push({ name, status, detail, at: new Date().toISOString() });
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

async function jsonFetch(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text.slice(0, 500) };
  }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return { response, payload };
}

async function googleAccessToken() {
  const params = new URLSearchParams({
    client_id: required("GOOGLE_CLIENT_ID"),
    client_secret: required("GOOGLE_CLIENT_SECRET"),
    refresh_token: required("GOOGLE_REFRESH_TOKEN"),
    grant_type: "refresh_token",
  });
  const { payload } = await jsonFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!payload.access_token) throw new Error("Google token response did not include access_token");
  return payload.access_token;
}

function authHeaders(token, extra = {}) {
  return { authorization: `Bearer ${token}`, ...extra };
}

function base64Url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

async function testGoogle() {
  const token = await googleAccessToken();
  record("google.oauth.refresh", "PASS", { tokenType: "Bearer" });

  const marker = `ORVANTA-QA-${Date.now()}-${randomUUID().slice(0, 8)}`;

  // Drive create + delete.
  const driveMetadata = {
    name: `${marker}.txt`,
    mimeType: "text/plain",
    ...(process.env.GOOGLE_DRIVE_FOLDER_ID?.trim()
      ? { parents: [process.env.GOOGLE_DRIVE_FOLDER_ID.trim()] }
      : {}),
  };
  const boundary = `orvanta_${randomUUID()}`;
  const multipart = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(driveMetadata)}\r\n`,
    `--${boundary}\r\nContent-Type: text/plain\r\n\r\n${marker}\r\n`,
    `--${boundary}--`,
  ].join("");
  const { payload: driveFile } = await jsonFetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: authHeaders(token, { "content-type": `multipart/related; boundary=${boundary}` }),
      body: multipart,
    }
  );
  cleanup.push(async () => {
    await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFile.id)}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
  });
  record("google.drive.create", "PASS", { fileId: driveFile.id, name: driveFile.name });

  // Gmail draft create + delete. No email is sent.
  const sender = process.env.GOOGLE_GMAIL_SENDER?.trim() || "me";
  const recipient = process.env.GOOGLE_CANARY_EMAIL?.trim() || process.env.GOOGLE_GMAIL_SENDER?.trim();
  if (!recipient) throw new Error("Missing GOOGLE_CANARY_EMAIL or GOOGLE_GMAIL_SENDER for Gmail draft test");
  const rawMessage = [
    `To: ${recipient}`,
    `Subject: ${marker} - draft only`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    `Orvanta external integration canary. This message remains a draft and will be deleted. Marker: ${marker}`,
  ].join("\r\n");
  const { payload: draft } = await jsonFetch(
    `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(sender)}/drafts`,
    {
      method: "POST",
      headers: authHeaders(token, { "content-type": "application/json" }),
      body: JSON.stringify({ message: { raw: base64Url(rawMessage) } }),
    }
  );
  cleanup.push(async () => {
    await fetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(sender)}/drafts/${encodeURIComponent(draft.id)}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
  });
  record("google.gmail.draft", "PASS", { draftId: draft.id, sent: false });

  // Sheets create, write, and remove through Drive.
  const { payload: spreadsheet } = await jsonFetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: authHeaders(token, { "content-type": "application/json" }),
    body: JSON.stringify({ properties: { title: marker } }),
  });
  cleanup.push(async () => {
    await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheet.spreadsheetId)}`, {
      method: "DELETE",
      headers: authHeaders(token),
    });
  });
  await jsonFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheet.spreadsheetId)}/values/Sheet1!A1:B2?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: authHeaders(token, { "content-type": "application/json" }),
      body: JSON.stringify({ values: [["marker", marker], ["status", "PASS"]] }),
    }
  );
  record("google.sheets.write", "PASS", { spreadsheetId: spreadsheet.spreadsheetId, valueInputOption: "RAW" });

  // Calendar create + delete.
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 15 * 60 * 1000);
  const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || "primary";
  const { payload: event } = await jsonFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: authHeaders(token, { "content-type": "application/json" }),
      body: JSON.stringify({
        summary: `${marker} canary`,
        description: "Temporary Orvanta integration canary; deleted automatically.",
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      }),
    }
  );
  cleanup.push(async () => {
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.id)}`,
      { method: "DELETE", headers: authHeaders(token) }
    );
  });
  record("google.calendar.event", "PASS", { eventId: event.id, calendarId });
}

async function testZatcaSandbox() {
  if (process.env.ZATCA_SANDBOX_ENABLED !== "true") {
    record("zatca.sandbox", "SKIPPED", { reason: "ZATCA_SANDBOX_ENABLED is not true" });
    return;
  }
  const url = required("ZATCA_SANDBOX_URL");
  const token = required("ZATCA_SANDBOX_TOKEN");
  const marker = `ORVANTA-QA-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const totalAmount = 115;
  const netAmount = 100;
  const vatAmount = 15;
  const invoice = {
    invoiceNumber: marker,
    issuedAt: new Date().toISOString(),
    sellerName: process.env.COMPANY_LEGAL_NAME?.trim() || "Orvanta QA Sandbox",
    vatNumber: process.env.COMPANY_VAT_NUMBER?.trim() || "300000000000003",
    currency: "SAR",
    netAmount,
    vatAmount,
    vatRate: 0.15,
    totalAmount,
    reference: marker,
  };
  const { response, payload } = await jsonFetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-idempotency-key": marker,
    },
    body: JSON.stringify({ invoice, mode: "SANDBOX", canary: true }),
  });
  record("zatca.sandbox", "PASS", {
    status: response.status,
    externalId: payload?.uuid || payload?.invoiceId || payload?.id || null,
  });
}

let exitCode = 0;
try {
  await testGoogle();
} catch (error) {
  exitCode = 1;
  record("google.workspace", "FAIL", { error: error instanceof Error ? error.message : String(error) });
}

try {
  await testZatcaSandbox();
} catch (error) {
  exitCode = 1;
  record("zatca.sandbox", "FAIL", { error: error instanceof Error ? error.message : String(error) });
}

for (const task of cleanup.reverse()) {
  try {
    await task();
  } catch (error) {
    exitCode = 1;
    record("cleanup", "FAIL", { error: error instanceof Error ? error.message : String(error) });
  }
}

const report = {
  status: exitCode === 0 ? "PASS" : "FAIL",
  executedAt: new Date().toISOString(),
  results,
};
await fs.writeFile("external-canary-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(exitCode);
