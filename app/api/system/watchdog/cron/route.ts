import { NextRequest } from "next/server";
import { executeTrackedCron } from "@/lib/operations/trackedCron";
import { runOperationalWatchdog } from "@/lib/operations/watchdog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return executeTrackedCron({
    req,
    jobName: "system-watchdog",
    schedule: "45 * * * *",
    timeoutMs: 55_000,
    run: async (context, heartbeat) => {
      await heartbeat({ phase: "checking" });
      const result = await runOperationalWatchdog(context.tenantId);
      return {
        processedCount: result.expectedJobs,
        failedCount: result.findings,
        details: { critical: result.critical, warning: result.warning },
        body: { watchdog: result },
      };
    },
  });
}
