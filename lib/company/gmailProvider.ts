export type GmailSendInput = {
  toEmail: string;
  fromEmail: string;
  subject: string;
  bodyText: string;
};

export type GmailInboxMessage = {
  providerMessageId: string;
  fromEmail: string;
  fromName?: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  receivedAt?: string;
};

type TokenResponse = { access_token?: string; error?: string; error_description?: string };

type GmailHeader = { name?: string; value?: string };
type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[] };
type GmailFullMessage = { id?: string; payload?: { headers?: GmailHeader[]; body?: { data?: string }; parts?: GmailPart[] }; internalDate?: string; snippet?: string };

function gmailEnv() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
    sender: process.env.GMAIL_SENDER_EMAIL || process.env.CORRESPONDENCE_FROM_EMAIL,
  };
}

export function hasGmailEnv() {
  const env = gmailEnv();
  return Boolean(env.clientId && env.clientSecret && env.refreshToken && env.sender);
}

async function getAccessToken() {
  const env = gmailEnv();
  if (!env.clientId || !env.clientSecret || !env.refreshToken) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      refresh_token: env.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) return null;
  return json.access_token;
}

function base64Url(value: string) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value?: string) {
  if (!value) return "";
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function cleanAddress(value = "") {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim();
}

function displayName(value = "") {
  return value.includes("<") ? value.split("<")[0].replace(/\"/g, "").trim() : undefined;
}

function findText(parts?: GmailPart[]): string {
  if (!parts) return "";
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data);
    const nested = findText(part.parts);
    if (nested) return nested;
  }
  return "";
}

export async function sendGmailMessage(input: GmailSendInput): Promise<{ ok: boolean; messageId?: string; reason: string }> {
  const token = await getAccessToken();
  const env = gmailEnv();
  if (!token || !env.sender) return { ok: false, reason: "GMAIL_NOT_CONFIGURED" };

  const raw = [
    `From: ${input.fromEmail || env.sender}`,
    `To: ${input.toEmail}`,
    `Subject: ${input.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    "",
    input.bodyText,
  ].join("\r\n");

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64Url(raw) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, reason: String(json?.error?.message || res.statusText) };
  return { ok: true, messageId: String(json?.id || ""), reason: "SENT" };
}

export async function listGmailInbox(maxResults = 10): Promise<GmailInboxMessage[]> {
  const token = await getAccessToken();
  const env = gmailEnv();
  if (!token || !env.sender) return [];

  const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=${maxResults}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const listJson = await listRes.json().catch(() => ({}));
  const ids = Array.isArray(listJson?.messages) ? listJson.messages.map((m: { id: string }) => m.id).filter(Boolean) : [];

  const out: GmailInboxMessage[] = [];
  for (const id of ids) {
    const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const msg = (await msgRes.json().catch(() => ({}))) as GmailFullMessage;
    const headers = msg.payload?.headers || [];
    const get = (name: string) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
    const from = get("from");
    const to = get("to") || env.sender;
    out.push({
      providerMessageId: id,
      fromEmail: cleanAddress(from),
      fromName: displayName(from),
      toEmail: cleanAddress(to),
      subject: get("subject") || "بدون عنوان",
      bodyText: decodeBase64Url(msg.payload?.body?.data) || findText(msg.payload?.parts) || msg.snippet || "",
      receivedAt: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : undefined,
    });
  }
  return out;
}
