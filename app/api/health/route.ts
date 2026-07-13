import { NextResponse } from "next/server";
import { hasSupabaseEnv } from "@/lib/supabase";
import { getEnabledIntegrations } from "@/lib/integrations";
import { isShopifyConfigured } from "@/lib/shopify";
import { isVercelConfigured } from "@/lib/vercelMonitor";
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

  return NextResponse.json({
    ok: true,
    service: "Orvanta",
    brand: {
      name: "Orvanta",
      arabicName: "أورفانتا",
      tagline: "AI Operating System for Business",
    },
    version: "3.2.0-road-to-8",
    accessMode: readiness.accessMode,
    productionReady: readiness.okForProduction,
    readiness,
    checks: {
      supabase: hasSupabaseEnv(),
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
      browserE2E: passed(readiness, "browser-e2e"),
      backupRestore: passed(readiness, "backup-restore"),
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
      integrations: integrations.map((integration) => integration.type),
    },
    timestamp: new Date().toISOString(),
  });
}
