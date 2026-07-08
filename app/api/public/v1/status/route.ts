import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/publicApi";
import { hydrateCompany } from "@/lib/company/hydrate";
import { ideaStats } from "@/lib/company/ideas";
import { approvalStats } from "@/lib/approvals";
import { hasSupabaseEnv } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** GET /api/public/v1/status — platform summary for external clients. */
export async function GET(req: NextRequest) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  await hydrateCompany();
  return NextResponse.json({
    ok: true,
    platform: "Orvanta",
    durable: hasSupabaseEnv(),
    ideas: ideaStats(),
    approvals: approvalStats(),
    timestamp: new Date().toISOString(),
  });
}
