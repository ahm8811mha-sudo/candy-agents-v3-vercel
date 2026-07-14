import { NextRequest } from "next/server";
import { executeTrackedCron } from "@/lib/operations/trackedCron";
import { processFailedWrites } from "@/lib/operations/failedWriteWorker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  return executeTrackedCron({
    req,
    jobName: "failed-write-recovery",
    schedule: "10 * * * *",
    timeoutMs: 55_000,
    run: async (context, heartbeat) => {
      await heartbeat({ phase: "claiming" });
      const result = await processFailedWrites({ tenantId: context.tenantId, limit: 50 });
      return {
        processedCount: result.selected,
        failedCount: result.retried + result.deadLettered,
        details: {
          resolved: result.resolved,
          retried: result.retried,
          deadLettered: result.deadLettered,
        },
        body: { recovery: result },
      };
    },
  });
}
