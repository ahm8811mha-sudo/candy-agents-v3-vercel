import { NextResponse } from "next/server";
import { hasSupabaseEnv } from "@/lib/supabase";
import { getEnabledIntegrations } from "@/lib/integrations";
import { isAuthEnabled } from "@/lib/auth";
import { isShopifyConfigured } from "@/lib/shopify";
import { isVercelConfigured } from "@/lib/vercelMonitor";
import { isAlpacaConfigured, alpacaMode } from "@/lib/trading/brokers/alpaca";
import { isLiveTradingEnabled } from "@/lib/trading/executionEngine";
import { getProductionReadiness } from "@/lib/company/productionReadiness";

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
    version: "3.0.0-core",
    productionReady: readiness.okForProduction,
    readiness,
    checks: {
      supabase: hasSupabaseEnv(),
      googleSheets: Boolean(process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY),
      ai: Boolean(process.env.OPENAI_API_KEY),
      auth: isAuthEnabled(),
      tenantIsolation: process.env.ORVANTA_MULTI_TENANT === "true" && process.env.ORVANTA_RLS_READY === "true",
      coreSchema: process.env.ORVANTA_CORE_SCHEMA_READY === "true",
      workflowRuntime: process.env.ORVANTA_WORKFLOW_RUNTIME_ENABLED === "true",
      outboxPublisher: process.env.ORVANTA_OUTBOX_ENABLED === "true" && Boolean(process.env.CRON_SECRET),
      reconciliation: process.env.ORVANTA_RECONCILIATION_REQUIRED === "true",
      shopify: isShopifyConfigured(),
      vercelMonitoring: isVercelConfigured(),
      alpaca: isAlpacaConfigured(),
      alpacaMode: alpacaMode(),
      liveTradingEnabled: isLiveTradingEnabled(),
      integrations: integrations.length,
    },
    features: {
      authentication: isAuthEnabled(),
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
