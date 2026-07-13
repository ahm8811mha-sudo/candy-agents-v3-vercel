import { NextResponse } from "next/server";
import { hasSupabaseEnv } from "@/lib/supabase";
import { getEnabledIntegrations } from "@/lib/integrations";
import { isShopifyConfigured } from "@/lib/shopify";
import { isVercelConfigured } from "@/lib/vercelMonitor";
import { isAlpacaConfigured, alpacaMode } from "@/lib/trading/brokers/alpaca";
import { isLiveTradingEnabled } from "@/lib/trading/executionEngine";
import { getProductionReadiness } from "@/lib/company/productionReadiness";

function passed(readiness: ReturnType<typeof getProductionReadiness>, id: string) {
  return readiness.checks.find((item) => item.id === id)?.severity === "PASS";
}

export async function GET() {
  const integrations = getEnabledIntegrations();
  const readiness = getProductionReadiness();

  return NextResponse.json({
    ok: true,
    service: "Orvanta",
    brand: {
      name: "Orvanta",
      arabicName: "أورفانتا",
      tagline: "AI Operating System for Business",
    },
    version: "3.1.0-hardening",
    accessMode: readiness.accessMode,
    productionReady: readiness.okForProduction,
    readiness,
    checks: {
      supabase: hasSupabaseEnv(),
      googleSheets: Boolean(process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY),
      ai: Boolean(process.env.OPENAI_API_KEY),
      accessGate: passed(readiness, "access-gate"),
      tenantIsolation: passed(readiness, "tenant-rls-ready"),
      coreSchema: passed(readiness, "core-schema-ready"),
      workflowRuntime: passed(readiness, "workflow-runtime"),
      outboxPublisher: passed(readiness, "outbox-publisher"),
      reconciliation: passed(readiness, "reconciliation-required"),
      shopify: isShopifyConfigured(),
      vercelMonitoring: isVercelConfigured(),
      alpaca: isAlpacaConfigured(),
      alpacaMode: alpacaMode(),
      liveTradingEnabled: isLiveTradingEnabled(),
      integrations: integrations.length,
    },
    features: {
      authentication: passed(readiness, "access-gate"),
      tenantContext: true,
      policyEngine: true,
      durableWorkflow: true,
      transactionalOutbox: true,
      organizationalMemory: true,
      externalReconciliation: true,
      operationalTelemetry: true,
      companyHealth: true,
      rateLimit: true,
      caching: true,
      reports: true,
      agentMemory: true,
      approvalToExecution: true,
      productionReadiness: true,
      evidenceContract: true,
      integrations: integrations.map((i) => i.type),
    },
    timestamp: new Date().toISOString(),
  });
}
