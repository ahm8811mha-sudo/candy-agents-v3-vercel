import { NextRequest } from "next/server";
import { ensureDailyIdea } from "@/lib/company/ideas";
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
    run: async (_context, heartbeat) => {
      await hydrateCompany();
      await heartbeat({ phase: "hydrated" });
      const idea = ensureDailyIdea();
      return {
        processedCount: 1,
        details: { ideaId: idea.id, dayKey: idea.dayKey, status: idea.status },
        body: { idea: { id: idea.id, title: idea.title, status: idea.status, dayKey: idea.dayKey } },
      };
    },
  });
}
