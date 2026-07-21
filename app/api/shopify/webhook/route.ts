import { NextRequest, NextResponse } from "next/server";
import { isShopifyWebhookConfigured, verifyShopifyWebhook } from "@/lib/shopify";
import { applyShopifyProductWebhook } from "@/lib/company/productSync";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Shopify → site. Verified by Shopify's HMAC signature (not the owner cookie —
 * this path is public in the proxy for exactly that reason). Product create /
 * update / delete events land in the warehouse. origin="shopify-webhook" so we
 * never write the change back to Shopify (no echo loop).
 */
export async function POST(req: NextRequest) {
  if (!isShopifyWebhookConfigured()) {
    return NextResponse.json({ ok: false, error: "Webhook secret not configured" }, { status: 503 });
  }

  const raw = await req.text();
  const hmac = req.headers.get("x-shopify-hmac-sha256");
  if (!verifyShopifyWebhook(raw, hmac)) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  const topic = req.headers.get("x-shopify-topic") || "";
  if (!topic.startsWith("products/")) {
    // Acknowledge unrelated topics so Shopify does not retry them.
    return NextResponse.json({ ok: true, ignored: topic });
  }

  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const tenantId = process.env.ORVANTA_TENANT_ID?.trim() || "golden-star";
    const result = await applyShopifyProductWebhook(topic, payload, { tenantId });
    return NextResponse.json({ ok: result.ok, inventory: result.inventory, reason: result.reason });
  } catch (error) {
    await logError("SHOPIFY_WEBHOOK_FAILED", error);
    // 200 so Shopify does not hammer retries on a poison payload; we logged it.
    return NextResponse.json({ ok: false, error: "processing failed" });
  }
}
