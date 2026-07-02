import { NextResponse } from "next/server";
import { getCompanyPulse } from "@/lib/company/pulse";
import { ensureDailyIdea } from "@/lib/company/ideas";

export const dynamic = "force-dynamic";

/** GET: live company pulse — real events + derived agent presence. */
export async function GET() {
  try {
    // Guarantee today's team idea exists so the office is never artificially idle.
    ensureDailyIdea();
    return NextResponse.json({ ok: true, ...getCompanyPulse() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Pulse failed" },
      { status: 500 }
    );
  }
}
