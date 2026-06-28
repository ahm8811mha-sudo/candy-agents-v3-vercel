import { getSupabaseAdmin } from "./supabase";

export type IntegrationType = "WHATSAPP" | "STRIPE" | "SALLA" | "SHOPIFY" | "WEBHOOK" | "EMAIL";

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

const integrationRegistry: IntegrationConfig[] = [
  {
    type: "WHATSAPP",
    name: "WhatsApp Business",
    enabled: Boolean(process.env.WHATSAPP_API_TOKEN),
    metadata: { description: "إرسال إشعارات وتقارير عبر واتساب" },
  },
  {
    type: "STRIPE",
    name: "Stripe Payments",
    enabled: Boolean(process.env.STRIPE_SECRET_KEY),
    metadata: { description: "معالجة المدفوعات والفواتير" },
  },
  {
    type: "SALLA",
    name: "Salla E-commerce",
    enabled: Boolean(process.env.SALLA_API_KEY),
    metadata: { description: "ربط مع منصة سلة للتجارة الإلكترونية" },
  },
  {
    type: "SHOPIFY",
    name: "Shopify Store",
    enabled: Boolean(process.env.SHOPIFY_ACCESS_TOKEN),
    metadata: { description: "ربط مع متجر شوبيفاي" },
  },
  {
    type: "WEBHOOK",
    name: "Custom Webhook",
    enabled: Boolean(process.env.CUSTOM_WEBHOOK_URL),
    webhookUrl: process.env.CUSTOM_WEBHOOK_URL,
    metadata: { description: "إرسال أحداث لأي نظام خارجي" },
  },
  {
    type: "EMAIL",
    name: "Email Notifications",
    enabled: Boolean(process.env.SMTP_HOST),
    metadata: { description: "إرسال تقارير بالبريد الإلكتروني" },
  },
];

export function getAvailableIntegrations(): IntegrationConfig[] {
  return integrationRegistry.map(({ apiKey: _apiKey, ...rest }) => rest);
}

export function getEnabledIntegrations(): IntegrationConfig[] {
  return integrationRegistry.filter((i) => i.enabled);
}

export async function sendWebhook(payload: WebhookPayload): Promise<boolean> {
  const webhookIntegrations = integrationRegistry.filter(
    (i) => i.enabled && i.webhookUrl
  );

  const results = await Promise.allSettled(
    webhookIntegrations.map(async (integration) => {
      const res = await fetch(integration.webhookUrl!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.ok;
    })
  );

  return results.some((r) => r.status === "fulfilled" && r.value);
}

export async function logIntegrationEvent(
  type: IntegrationType,
  event: string,
  status: "SUCCESS" | "FAILED",
  metadata?: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  await supabase.from("external_sync_logs").insert({
    id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    provider: type,
    entity_type: event,
    status,
    error_message: status === "FAILED" ? JSON.stringify(metadata) : null,
  });
}

export async function triggerNotification(
  channel: IntegrationType,
  message: string,
  recipient?: string
): Promise<{ sent: boolean; channel: IntegrationType }> {
  const integration = integrationRegistry.find((i) => i.type === channel && i.enabled);

  if (!integration) {
    return { sent: false, channel };
  }

  switch (channel) {
    case "WEBHOOK":
      return {
        sent: await sendWebhook({
          event: "notification",
          data: { message, recipient },
          timestamp: new Date().toISOString(),
          source: "candy-agents",
        }),
        channel,
      };
    default:
      await logIntegrationEvent(channel, "notification_queued", "SUCCESS", {
        message: message.slice(0, 200),
        recipient,
      });
      return { sent: true, channel };
  }
}
