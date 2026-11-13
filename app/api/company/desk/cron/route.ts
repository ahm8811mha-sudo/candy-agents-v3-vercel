import { NextRequest } from "next/server";
import { hydrateCompany } from "@/lib/company/hydrate";
import { hydrateChairmanCommands } from "@/lib/company/chairmanCommands";
import { archiveApprovalCritical } from "@/lib/approvals";
import { buildDecisionDesk, expiredReturns } from "@/lib/company/decisionDesk";
import { appendWorkEvent } from "@/lib/company/workEvents";
import { executeTrackedCron } from "@/lib/operations/trackedCron";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Daily at 20:00 Riyadh: the decision desk digest is composed (at most seven
 * cards), and items returned to a department more than seven days ago without
 * a fix are archived (kept, never deleted). Escalation is computed on every
 * read, so no hourly cron is needed on the free plan.
 */
export async function GET(req: NextRequest) {
  return executeTrackedCron({
    req,
    jobName: "decision-desk-digest",
    schedule: "0 17 * * *",
    run: async () => {
      await Promise.all([hydrateCompany(), hydrateChairmanCommands()]);
      const stale = expiredReturns();
      let archived = 0;
      for (const item of stale) {
        const saved = await archiveApprovalCritical(item.id, { reason: "returned_expired", by: "system", note: "مضت سبعة أيام على الإعادة للقسم دون تصحيح." });
        if (saved) {
          archived += 1;
          await appendWorkEvent({ entityType: "spend", entityId: item.id, actor: "system", action: "archive", fromState: "returned", toState: "archived", note: "returned_expired", evidence: null });
        }
      }
      const desk = buildDecisionDesk();
      return {
        processedCount: desk.cards.length + archived,
        details: { cards: desk.cards.length, waiting: desk.waiting, overdue: desk.overdue.length, archived },
        body: { desk: { digestAt: desk.digestAt, counts: desk.counts }, archived },
      };
    },
  });
}
