import { NextResponse } from "next/server";
import { hasSupabaseEnv } from "@/lib/supabase";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "Golden Star Enterprise OS",
    checks: {
      supabase: hasSupabaseEnv(),
      googleSheets: Boolean(process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY),
      ai: Boolean(process.env.ANTHROPIC_API_KEY),
    },
    timestamp: new Date().toISOString(),
  });
}
