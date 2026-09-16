import { NextRequest } from "next/server";
import { generateDailyIdeaCritical } from "@/lib/company/ideas";
import { hydrateCompany } from "@/lib/company/hydrate";
import { executeTrackedCron } from "@/lib/operations/trackedCron";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Daily cron: the team is obligated to produce one executable idea per day. */
export async function GET(req: NextRequest) {
  return executeTrackedCron({
    req,
    jobName: "daily-company-idea",
    schedule: "30 4 * * *",
    run: async (context, heartbeat) => {
      await hydrateCompany();
      await heartbeat({ phase: "hydrated" });
      const result = await generateDailyIdeaCritical(context.tenantId);
      const idea = result.idea;
      return {
        processedCount: result.created ? 1 : 0,
        details: { ideaId: idea?.id, reason: result.reason },
        body: result,
      };
    },
  });
}
