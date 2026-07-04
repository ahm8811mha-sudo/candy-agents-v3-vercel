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
    version: "2.4.0",
    productionReady: readiness.okForProduction,
    readiness,
    checks: {
      supabase: hasSupabaseEnv(),
      googleSheets: Boolean(process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY),
      ai: Boolean(process.env.OPENAI_API_KEY),
      auth: isAuthEnabled(),
      shopify: isShopifyConfigured(),
      vercelMonitoring: isVercelConfigured(),
      alpaca: isAlpacaConfigured(),
      alpacaMode: alpacaMode(),
      liveTradingEnabled: isLiveTradingEnabled(),
      integrations: integrations.length,
    },
    features: {
      authentication: isAuthEnabled(),
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
