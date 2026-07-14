import { NextRequest } from "next/server";
import { runOpportunityRadar } from "@/lib/enterpriseSystems";
import { executeTrackedCron } from "@/lib/operations/trackedCron";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return executeTrackedCron({
    req,
    jobName: "opportunity-radar",
    schedule: "0 5 * * *",
    timeoutMs: 55_000,
    run: async (_context, heartbeat) => {
      await heartbeat({ phase: "scanning" });
      const result = await runOpportunityRadar("DAILY_CRON");
      const processed = Array.isArray(result) ? result.length : 1;
      return {
        processedCount: processed,
        details: { processed },
        body: { result },
      };
    },
  });
}
