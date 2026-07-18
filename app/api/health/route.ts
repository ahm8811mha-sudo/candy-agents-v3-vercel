import { NextResponse } from "next/server";
import { hasSupabaseEnv } from "@/lib/supabase";
import { getEnabledIntegrations } from "@/lib/integrations";
import { isShopifyConfigured } from "@/lib/shopify";
import { isVercelConfigured, isVercelRuntime } from "@/lib/vercelMonitor";
import { isAlpacaConfigured, alpacaMode } from "@/lib/trading/brokers/alpaca";
import { isLiveTradingEnabled } from "@/lib/trading/executionEngine";
import type { ProductionReadiness } from "@/lib/company/productionReadiness";
import { getEvidenceAwareProductionReadiness } from "@/lib/company/productionReadinessEvidence";

function passed(readiness: ProductionReadiness, id: string) {
  return readiness.checks.find((item) => item.id === id)?.severity === "PASS";
}

export async function GET() {
  const integrations = getEnabledIntegrations();
  const readiness = await getEvidenceAwareProductionReadiness();
  const vercelEnvironment = process.env.VERCEL_ENV || null;
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || null;
  const durableDatabase = passed(readiness, "supabase-service-role") && passed(readiness, "core-schema-ready");

  return NextResponse.json({
    ok: true,
    service: "Orvanta",
    brand: {
      name: "Orvanta",
      arabicName: "أورفانتا",
      tagline: "AI Operating System for Business",
    },
    version: "3.3.1-production-readiness-truth",
    accessMode: readiness.accessMode,
    productionReady: readiness.okForProduction,
    readiness,
    deployment: {
      platform: isVercelRuntime() ? "vercel" : "local",
      environment: vercelEnvironment || readiness.mode,
      isPreview: vercelEnvironment === "preview",
      productionUrl: productionHost ? `https://${productionHost}` : null,
      detailedMonitoring: isVercelConfigured(),
    },
    checks: {
      supabase: hasSupabaseEnv() && durableDatabase,
      googleSheets: Boolean(process.env.GOOGLE_SHEETS_SPREADSHEET_ID),
      ai: Boolean(process.env.OPENAI_API_KEY),
      accessGate: passed(readiness, "access-gate"),
      tenantIsolation: passed(readiness, "tenant-rls-ready") && passed(readiness, "rls-regression-tested"),
      coreSchema: passed(readiness, "core-schema-ready") && passed(readiness, "migration-baseline"),
      workflowRuntime: passed(readiness, "workflow-runtime"),
      outboxPublisher: passed(readiness, "outbox-publisher"),
      reconciliation: passed(readiness, "reconciliation-required"),
      watchdog: passed(readiness, "watchdog"),
      failedWriteRecovery: passed(readiness, "failed-write-recovery"),
      accountingControls: passed(readiness, "accounting-controls"),
      companyBrain: passed(readiness, "company-brain-cycle"),
      browserE2E: passed(readiness, "browser-e2e"),
      backupRestore: passed(readiness, "backup-restore"),
      shopify: isShopifyConfigured(),
      vercelMonitoring: isVercelRuntime() || isVercelConfigured(),
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
      integrations: integrations.map((integration) => integration.type),
    },
    timestamp: new Date().toISOString(),
  });
}
