import { NextRequest } from "next/server";
import { ensureDailyIdea, enrichIdea } from "@/lib/company/ideas";
import { getLearningSnapshot } from "@/lib/company/learning";
import { hydrateCompany } from "@/lib/company/hydrate";
import { runWorkflowTick } from "@/lib/company-os/workflowRuntime";
import { publishOutboxBatch } from "@/lib/company-os/outboxPublisher";
import { executeTrackedCron } from "@/lib/operations/trackedCron";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Master autonomy loop. Governance remains mandatory: the loop may discover,
 * analyse, resume approved workflows, and publish durable events, but it cannot
 * bypass policy, approval, tenant, budget, or reconciliation gates.
 */
export async function GET(req: NextRequest) {
  return executeTrackedCron({
    req,
    jobName: "company-autonomy-loop",
    schedule: "0 4 * * *",
    timeoutMs: 55_000,
    run: async (context, heartbeat) => {
      await hydrateCompany();
      await heartbeat({ phase: "hydrated" });

      const idea = ensureDailyIdea();
      await enrichIdea(idea.id);
      await heartbeat({ phase: "idea-enriched", ideaId: idea.id });

      const learning = getLearningSnapshot();
      const workflows = process.env.ORVANTA_WORKFLOW_RUNTIME_ENABLED === "true"
        ? await runWorkflowTick({ tenantId: context.tenantId, limit: 20 })
        : { processed: 0, disabled: true };
      await heartbeat({ phase: "workflow-tick", processed: Number((workflows as { processed?: number }).processed || 0) });

      const outbox = process.env.ORVANTA_OUTBOX_ENABLED === "true"
        ? await publishOutboxBatch({ tenantId: context.tenantId, limit: 50 })
        : { processed: 0, disabled: true };

      const workflowProcessed = Number((workflows as { processed?: number }).processed || 0);
      const outboxProcessed = Number((outbox as { processed?: number }).processed || 0);
      const outboxFailed = Number((outbox as { retried?: number }).retried || 0) + Number((outbox as { deadLettered?: number }).deadLettered || 0);

      return {
        processedCount: 1 + workflowProcessed + outboxProcessed,
        failedCount: outboxFailed,
        details: { workflowProcessed, outboxProcessed, outboxFailed, ideaId: idea.id },
        body: {
          dailyIdea: { id: idea.id, title: idea.title, status: idea.status, studyMode: idea.studyMode },
          learning: {
            decisionsAnalyzed: learning.decisionsAnalyzed,
            confidenceThreshold: learning.confidenceThreshold,
            recommendation: learning.recommendation,
          },
          durableRuntime: { workflows, outbox },
        },
      };
    },
  });
}
