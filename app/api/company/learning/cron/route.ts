import { NextResponse } from "next/server";
import { getLearningSnapshot } from "@/lib/company/learning";

export const dynamic = "force-dynamic";

/** Weekly review: recompute the learning snapshot (§9). */
export async function GET() {
  try {
    const snap = getLearningSnapshot();
    return NextResponse.json({
      ok: true,
      review: {
        decisionsAnalyzed: snap.decisionsAnalyzed,
        approvalRate: snap.approvalRate,
        confidenceThreshold: snap.confidenceThreshold,
        recommendation: snap.recommendation,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Weekly review failed" },
      { status: 500 }
    );
  }
}
