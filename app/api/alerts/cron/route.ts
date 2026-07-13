import { NextRequest } from "next/server";
import { generateOperationalAlerts } from "@/lib/alertEngine";
import { refreshGovernmentRegulations } from "@/lib/governmentRelations";
import { executeTrackedCron } from "@/lib/operations/trackedCron";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function countResult(value: unknown) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["processed", "created", "updated", "count", "alerts"]) {
      const candidate = record[key];
      if (typeof candidate === "number") return candidate;
      if (Array.isArray(candidate)) return candidate.length;
    }
  }
  return value == null ? 0 : 1;
}

export async function GET(req: NextRequest) {
  return executeTrackedCron({
    req,
    jobName: "operational-alerts",
    schedule: "30 5 * * *",
    timeoutMs: 285_000,
    run: async (_context, heartbeat) => {
      const government = await refreshGovernmentRegulations();
      await heartbeat({ phase: "government-regulations-refreshed", count: countResult(government) });
      const alerts = await generateOperationalAlerts();
      const processedCount = countResult(government) + countResult(alerts);
      return {
        processedCount,
        details: {
          governmentCount: countResult(government),
          alertCount: countResult(alerts),
        },
        body: { government, alerts },
      };
    },
  });
}
