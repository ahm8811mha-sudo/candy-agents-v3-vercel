import { NextRequest } from "next/server";
import { dispatchDigest } from "@/lib/company/digest";
import { hydrateCompany } from "@/lib/company/hydrate";
import { executeTrackedCron } from "@/lib/operations/trackedCron";
import { raiseSystemAlert, resolveSystemAlert } from "@/lib/operations/systemAlerts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Daily cron: compose, record, and deliver the owner's morning brief. */
export async function GET(req: NextRequest) {
  return executeTrackedCron({
    req,
    jobName: "owner-daily-digest",
    schedule: "0 6 * * *",
    run: async (context, heartbeat) => {
      await hydrateCompany();
      await heartbeat({ phase: "hydrated" });
      const { digest, dispatch } = await dispatchDigest();

      const alertKey = "digest:not-delivered";
      if (dispatch.sent) {
        await resolveSystemAlert(context.tenantId, alertKey, "Daily digest delivery recovered.");
      } else {
        await raiseSystemAlert({
          tenantId: context.tenantId,
          dedupeKey: alertKey,
          severity: "WARNING",
          source: "DAILY_DIGEST",
          title: "لم يُسلّم الملخص اليومي",
          message: dispatch.reason,
          entityType: "daily_digest",
          entityId: digest.date,
          metadata: { channel: dispatch.channel, recorded: dispatch.recorded },
        });
      }

      return {
        processedCount: 1,
        failedCount: dispatch.sent ? 0 : 1,
        details: {
          sent: dispatch.sent,
          channel: dispatch.channel,
          reason: dispatch.reason,
          recorded: dispatch.recorded,
          externalId: dispatch.externalId || null,
        },
        body: { digest, dispatch },
      };
    },
  });
}
