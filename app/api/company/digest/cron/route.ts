import { NextRequest } from "next/server";
import { dispatchDigest } from "@/lib/company/digest";
import { hydrateCompany } from "@/lib/company/hydrate";
import { executeTrackedCron } from "@/lib/operations/trackedCron";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Daily cron: send the owner their morning brief. */
export async function GET(req: NextRequest) {
  return executeTrackedCron({
    req,
    jobName: "owner-daily-digest",
    schedule: "0 6 * * *",
    run: async (_context, heartbeat) => {
      await hydrateCompany();
      await heartbeat({ phase: "hydrated" });
      const { dispatch } = await dispatchDigest();
      return {
        processedCount: 1,
        details: { dispatchStatus: (dispatch as { status?: unknown } | null)?.status || "created" },
        body: { dispatch },
      };
    },
  });
}
