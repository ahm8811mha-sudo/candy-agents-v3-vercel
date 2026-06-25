import { runOpportunityRadar } from "@/lib/enterpriseSystems";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await runOpportunityRadar("DAILY_CRON");
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Opportunity radar failed" },
      { status: 500 }
    );
  }
}
