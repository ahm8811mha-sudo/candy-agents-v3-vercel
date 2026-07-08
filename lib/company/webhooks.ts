/**
 * Roadmap #3 — Outbound webhooks (Stripe developer standard).
 *
 * When ORVANTA_WEBHOOK_URL is set, governed events are POSTed to it as JSON
 * signed with HMAC-SHA256 (header `X-Orvanta-Signature`, secret =
 * ORVANTA_WEBHOOK_SECRET or API_SECRET_KEY). Delivery is best-effort and
 * non-blocking — exactly like `persist` — and a silent no-op when unset.
 */

import { createHmac } from "crypto";
import { after } from "next/server";

export type WebhookEvent =
  | "idea.submitted"
  | "approval.created"
  | "approval.decided"
  | "income.recognized";

function webhookUrl(): string | undefined {
  return process.env.ORVANTA_WEBHOOK_URL;
}

function webhookSecret(): string | undefined {
  return process.env.ORVANTA_WEBHOOK_SECRET || process.env.API_SECRET_KEY;
}

/** Pure signer so the signature contract is unit-testable. */
export function signWebhookBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

export function emitWebhook(event: WebhookEvent, payload: Record<string, unknown>): void {
  const url = webhookUrl();
  if (!url) return;

  const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
  const secret = webhookSecret();
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Orvanta-Event": event };
  if (secret) headers["X-Orvanta-Signature"] = signWebhookBody(body, secret);

  const delivery = fetch(url, { method: "POST", headers, body }).then(
    () => undefined,
    () => undefined
  );
  try {
    after(delivery);
  } catch {
    void delivery;
  }
}
