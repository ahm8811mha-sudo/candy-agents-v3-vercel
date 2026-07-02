import { NextResponse } from "next/server";
import { ensureDailyIdea } from "@/lib/company/ideas";

export const dynamic = "force-dynamic";

/** Daily cron: the team is obligated to produce one executable idea per day. */
export async function GET() {
  try {
    const idea = ensureDailyIdea();
    return NextResponse.json({ ok: true, idea: { id: idea.id, title: idea.title, status: idea.status, dayKey: idea.dayKey } });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Daily idea failed" },
      { status: 500 }
    );
  }
}
