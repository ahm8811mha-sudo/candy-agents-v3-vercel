import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

async function jsonFetch(url: string, init: RequestInit = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let payload: any = {};
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

function authHeaders(token: string, extra: Record<string, string> = {}) {
  return { authorization: `Bearer ${token}`, ...extra };
}

function base64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

async function googleToken() {
  const body = new URLSearchParams({
    client_id: required("GOOGLE_CLIENT_ID"),
    client_secret: required("GOOGLE_CLIENT_SECRET"),
    refresh_token: required("GOOGLE_REFRESH_TOKEN"),
    grant_type: "refresh_token",
  });
  const { payload } = await jsonFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!payload.access_token) throw new Error("Google did not return an access token.");
  return String(payload.access_token);
}

async function runGoogleCanary() {
  const token = await googleToken();
  const marker = `ORVANTA-QA-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const cleanup: Array<() => Promise<void>> = [];
  const evidence: Record<string, unknown> = { marker, checks: [] as unknown[] };
  const checks = evidence.checks as Array<Record<string, unknown>>;

  try {
    const { payload: profile } = await jsonFetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: authHeaders(token),
    });
    checks.push({ name: "gmail.profile", status: "PASS", email: profile.emailAddress || null });

    const recipient = process.env.GOOGLE_CANARY_EMAIL?.trim() || process.env.GOOGLE_GMAIL_SENDER?.trim() || profile.emailAddress;
    if (!recipient) throw new Error("No Gmail canary recipient is configured.");
    const raw = [
      `To: ${recipient}`,
      `Subject: ${marker} draft only`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      `Temporary Orvanta canary draft. Marker: ${marker}`,
    ].join("\r\n");
    const { payload: draft } = await jsonFetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
      method: "POST",
      headers: authHeaders(token, { "content-type": "application/json" }),
      body: JSON.stringify({ message: { raw: base64Url(raw) } }),
    });
    cleanup.push(async () => {
      await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(draft.id)}`, {
        method: "DELETE",
        headers: authHeaders(token),
      });
    });
    checks.push({ name: "gmail.draft.create", status: "PASS", draftId: draft.id, sent: false });

    const { payload: file } = await jsonFetch("https://www.googleapis.com/drive/v3/files?fields=id,name", {
      method: "POST",
      headers: authHeaders(token, { "content-type": "application/json" }),
      body: JSON.stringify({
        name: `${marker}.txt`,
        mimeType: "text/plain",
        ...(process.env.GOOGLE_DRIVE_FOLDER_ID?.trim()
          ? { parents: [process.env.GOOGLE_DRIVE_FOLDER_ID.trim()] }
          : {}),
      }),
    });
    cleanup.push(async () => {
      await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`, {
        method: "DELETE",
        headers: authHeaders(token),
      });
    });
    checks.push({ name: "drive.file.create", status: "PASS", fileId: file.id });

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
    checks.push({ name: "sheets.create.write", status: "PASS", spreadsheetId: spreadsheet.spreadsheetId });

    const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim() || "primary";
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 15 * 60 * 1000);
    const { payload: event } = await jsonFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        headers: authHeaders(token, { "content-type": "application/json" }),
        body: JSON.stringify({
          summary: `${marker} canary`,
          description: "Temporary Orvanta canary event; deleted automatically.",
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
    checks.push({ name: "calendar.event.create", status: "PASS", eventId: event.id });

    return evidence;
  } finally {
    const cleanupResults = [];
    for (const task of cleanup.reverse()) {
      try {
        await task();
        cleanupResults.push("PASS");
      } catch (error) {
        cleanupResults.push(error instanceof Error ? error.message : String(error));
      }
    }
    evidence.cleanup = cleanupResults;
  }
}

async function runZatcaCanary() {
  if (process.env.ZATCA_SANDBOX_ENABLED !== "true") {
    return { status: "SKIPPED", reason: "ZATCA_SANDBOX_ENABLED is not true" };
  }
  const url = required("ZATCA_SANDBOX_URL");
  const token = required("ZATCA_SANDBOX_TOKEN");
  const marker = `ORVANTA-QA-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const { response, payload } = await jsonFetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-idempotency-key": marker,
    },
    body: JSON.stringify({
      mode: "SANDBOX",
      canary: true,
      invoice: {
        invoiceNumber: marker,
        issuedAt: new Date().toISOString(),
        sellerName: process.env.COMPANY_LEGAL_NAME?.trim() || "Orvanta QA Sandbox",
        vatNumber: process.env.COMPANY_VAT_NUMBER?.trim() || "300000000000003",
        currency: "SAR",
        netAmount: 100,
        vatAmount: 15,
        vatRate: 0.15,
        totalAmount: 115,
        reference: marker,
      },
    }),
  });
  return {
    status: "PASS",
    responseCode: response.status,
    externalId: payload?.uuid || payload?.invoiceId || payload?.id || null,
  };
}

export async function GET(req: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview") {
    return NextResponse.json({ ok: false, error: "External canary is preview-only." }, { status: 404 });
  }
  if (req.nextUrl.searchParams.get("confirm") !== "run") {
    return NextResponse.json({ ok: false, error: "Add ?confirm=run to execute the preview canary." }, { status: 400 });
  }

  const startedAt = Date.now();
  const result: Record<string, unknown> = { ok: true, environment: "preview", startedAt: new Date().toISOString() };
  try {
    result.google = await runGoogleCanary();
  } catch (error) {
    result.ok = false;
    result.google = { status: "FAIL", error: error instanceof Error ? error.message : String(error) };
  }
  try {
    result.zatca = await runZatcaCanary();
  } catch (error) {
    result.ok = false;
    result.zatca = { status: "FAIL", error: error instanceof Error ? error.message : String(error) };
  }
  result.durationMs = Date.now() - startedAt;
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
