import { NextResponse } from "next/server";
import { hasSupabaseEnv } from "@/lib/supabase";
import { getEnabledIntegrations } from "@/lib/integrations";
import { isAuthEnabled } from "@/lib/auth";

export async function GET() {
  const integrations = getEnabledIntegrations();

  return NextResponse.json({
    ok: true,
    service: "Candy Agents",
    version: "2.0.0",
    checks: {
      supabase: hasSupabaseEnv(),
      googleSheets: Boolean(process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY),
      ai: Boolean(process.env.OPENAI_API_KEY),
      auth: isAuthEnabled(),
      integrations: integrations.length,
    },
    features: {
      authentication: isAuthEnabled(),
      rateLimit: true,
      caching: true,
      reports: true,
      agentMemory: true,
      integrations: integrations.map((i) => i.type),
    },
    timestamp: new Date().toISOString(),
  });
}
