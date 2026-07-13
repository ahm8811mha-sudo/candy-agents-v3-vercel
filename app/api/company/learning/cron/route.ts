import { NextRequest } from "next/server";
import { getLearningSnapshot } from "@/lib/company/learning";
import { hydrateCompany } from "@/lib/company/hydrate";
import { executeTrackedCron } from "@/lib/operations/trackedCron";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Weekly review: recompute the learning snapshot. */
export async function GET(req: NextRequest) {
  return executeTrackedCron({
    req,
    jobName: "weekly-learning-review",
    schedule: "0 7 * * 0",
    run: async (_context, heartbeat) => {
      await hydrateCompany();
      await heartbeat({ phase: "hydrated" });
      const snap = getLearningSnapshot();
      return {
        processedCount: Math.max(1, snap.decisionsAnalyzed),
        details: {
          decisionsAnalyzed: snap.decisionsAnalyzed,
          approvalRate: snap.approvalRate,
          confidenceThreshold: snap.confidenceThreshold,
        },
        body: {
          review: {
            decisionsAnalyzed: snap.decisionsAnalyzed,
            approvalRate: snap.approvalRate,
            confidenceThreshold: snap.confidenceThreshold,
            recommendation: snap.recommendation,
          },
        },
      };
    },
  });
}
