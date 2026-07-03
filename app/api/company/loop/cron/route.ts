import { NextResponse } from "next/server";
import { ensureDailyIdea, enrichIdea } from "@/lib/company/ideas";
import { getLearningSnapshot } from "@/lib/company/learning";

export const dynamic = "force-dynamic";

/**
 * F6 — Master autonomy loop. One daily cron that runs the company cycle
 * end-to-end without intervention: produce the team's daily idea, study +
 * enrich it, and recompute the self-learning snapshot. Governance still gates
 * the outcome in /inbox.
 */
export async function GET() {
  try {
    const idea = ensureDailyIdea();
    await enrichIdea(idea.id);
    const learning = getLearningSnapshot();
    return NextResponse.json({
      ok: true,
      dailyIdea: { id: idea.id, title: idea.title, status: idea.status, studyMode: idea.studyMode },
      learning: {
        decisionsAnalyzed: learning.decisionsAnalyzed,
        confidenceThreshold: learning.confidenceThreshold,
        recommendation: learning.recommendation,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Company loop failed" },
      { status: 500 }
    );
  }
}
