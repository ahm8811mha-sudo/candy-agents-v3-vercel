import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "./supabase";
import { getGoogleWorkspaceStatus } from "./integrations/googleWorkspace";
import { sendReliableGmailMessage } from "./integrations/googleWorkspaceReliable";

export type IntegrationType = "WHATSAPP" | "STRIPE" | "SALLA" | "SHOPIFY" | "WEBHOOK" | "EMAIL" | "VERCEL" | "ALPACA" | "FINNHUB" | "SAUDI_BROKER";

export type IntegrationConfig = {
  type: IntegrationType;
  name: string;
  enabled: boolean;
  webhookUrl?: string;
  apiKey?: string;
  metadata?: Record<string, unknown>;
};

export type WebhookPayload = {
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
  source: string;
};

const googleStatus = getGoogleWorkspaceStatus();
const integrationRegistry: IntegrationConfig[] = [
  {
    type: "WHATSAPP",
    name: "WhatsApp Business",
    enabled: false,
    metadata: { description: "غير منفذ في النسخة الحالية" },
  },
  {
    type: "STRIPE",
    name: "Stripe Payments",
    enabled: false,
    metadata: { description: "غير منفذ في النسخة الحالية" },
  },
  {
    type: "SALLA",
    name: "Salla E-commerce",
    enabled: false,
    metadata: { description: "غير منفذ في النسخة الحالية" },
  },
  {
    type: "SHOPIFY",
    name: "Shopify Store",
    enabled: Boolean(process.env.SHOPIFY_ACCESS_TOKEN && process.env.SHOPIFY_STORE_DOMAIN && process.env.SHOPIFY_LIVE_WRITES_ENABLED === "true"),
    metadata: { description: "يظهر مفعلاً فقط عند اكتمال المفاتيح وتفعيل الكتابات صراحة" },
  },
  {
    type: "WEBHOOK",
    name: "Custom Webhook",
    enabled: Boolean(process.env.CUSTOM_WEBHOOK_URL),
    webhookUrl: process.env.CUSTOM_WEBHOOK_URL,
    metadata: { description: "إرسال أحداث إلى Webhook مهيأ" },
  },
  {
    type: "EMAIL",
    name: "Google Gmail Notifications",
    enabled: googleStatus.capabilities.gmail,
    metadata: { description: "إرسال فعلي عبر Gmail مع سجل محاولة وإيصال" },
  },
  {
    type: "VERCEL",
    name: "Vercel Monitoring",
    enabled: Boolean(process.env.VERCEL_API_TOKEN && process.env.VERCEL_PROJECT_ID),
    metadata: { description: "مراقبة حالة النشر والأخطاء والإصدارات" },
  },
  {
    type: "ALPACA",
    name: "Alpaca Trading",
    enabled: Boolean(process.env.ALPACA_API_KEY && process.env.ALPACA_API_SECRET && process.env.TRADING_LIVE_ENABLED === "true"),
    metadata: { description: "التداول الحقيقي معطل افتراضياً" },
  },
  {
    type: "FINNHUB",
    name: "Finnhub Market Data",
    enabled: Boolean(process.env.FINNHUB_API_KEY),
    metadata: { description: "بيانات السوق فقط" },
  },
  {
    type: "SAUDI_BROKER",
    name: "وسيط سعودي",
    enabled: Boolean(process.env.SAUDI_BROKER_API_URL && process.env.SAUDI_BROKER_API_KEY && process.env.TRADING_LIVE_ENABLED === "true"),
    metadata: { description: "التنفيذ الحقيقي معطل افتراضياً" },
  },
];

export function getAvailableIntegrations(): IntegrationConfig[] {
  return integrationRegistry.map(({ apiKey: _apiKey, ...rest }) => rest);
}

export function getEnabledIntegrations(): IntegrationConfig[] {
  return integrationRegistry.filter((integration) => integration.enabled);
}

export async function sendWebhook(payload: WebhookPayload): Promise<boolean> {
  const webhookIntegrations = integrationRegistry.filter(
    (integration) => integration.enabled && integration.type === "WEBHOOK" && integration.webhookUrl
  );

  const results = await Promise.allSettled(
    webhookIntegrations.map(async (integration) => {
      const response = await fetch(integration.webhookUrl!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`);
      return true;
    })
  );

  return results.some((result) => result.status === "fulfilled" && result.value);
}

export async function logIntegrationEvent(
  type: IntegrationType,
  event: string,
  status: "SUCCESS" | "FAILED",
  metadata?: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.warn("[orvanta:integration] event was not persisted", { type, event, status });
    return;
  }

  const { error } = await supabase.from("external_sync_logs").insert({
    id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    provider: type,
    entity_type: event,
    status,
    error_message: status === "FAILED" ? JSON.stringify(metadata || {}) : null,
  });
  if (error) throw error;
}

function notificationId(channel: IntegrationType, recipient: string | undefined, message: string) {
  return createHash("sha256")
    .update(`${channel}:${recipient || "none"}:${message}`)
    .digest("hex")
    .slice(0, 40);
}

export async function triggerNotification(
  channel: IntegrationType,
  message: string,
  recipient?: string
): Promise<{ sent: boolean; channel: IntegrationType; externalId?: string }> {
  const integration = integrationRegistry.find((item) => item.type === channel && item.enabled);
  if (!integration) {
    await logIntegrationEvent(channel, "notification_not_delivered", "FAILED", {
      reason: "integration_disabled_or_not_implemented",
      recipient,
      message: message.slice(0, 200),
    }).catch(() => undefined);
    return { sent: false, channel };
  }

  if (channel === "WEBHOOK") {
    const sent = await sendWebhook({
      event: "notification",
      data: { message, recipient },
      timestamp: new Date().toISOString(),
      source: "orvanta",
    });
    await logIntegrationEvent(channel, "notification_delivery", sent ? "SUCCESS" : "FAILED", { recipient }).catch(() => undefined);
    return { sent, channel };
  }

  if (channel === "EMAIL") {
    if (!recipient?.trim()) return { sent: false, channel };
    const execution = await sendReliableGmailMessage(
      process.env.ORVANTA_TENANT_ID || "golden-star",
      {
        actionId: `system-notification-${notificationId(channel, recipient, message)}`,
        to: recipient,
        subject: "تنبيه Orvanta التشغيلي",
        html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8"><p>${message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>")}</p></div>`,
      }
    );
    return {
      sent: true,
      channel,
      externalId: String((execution.value as { messageId?: unknown }).messageId || execution.attemptId),
    };
  }

  await logIntegrationEvent(channel, "notification_not_implemented", "FAILED", {
    recipient,
    message: message.slice(0, 200),
  }).catch(() => undefined);
  return { sent: false, channel };
}
