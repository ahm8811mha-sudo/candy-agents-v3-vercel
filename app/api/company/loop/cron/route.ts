import { NextRequest, NextResponse } from "next/server";
import { ensureDailyIdea, enrichIdea } from "@/lib/company/ideas";
import { getLearningSnapshot } from "@/lib/company/learning";
import { hydrateCompany } from "@/lib/company/hydrate";
import { requireCompanyContext } from "@/lib/company-os/context";
import { runWorkflowTick } from "@/lib/company-os/workflowRuntime";
import { publishOutboxBatch } from "@/lib/company-os/outboxPublisher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Master autonomy loop. Governance remains mandatory: the loop may discover,
 * analyse, resume approved workflows, and publish durable events, but it cannot
 * bypass policy, approval, tenant, budget, or reconciliation gates.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req, "ADMIN");
  if (!auth.ok) return auth.response;
  try {
    await hydrateCompany();
    const idea = ensureDailyIdea();
    await enrichIdea(idea.id);
    const learning = getLearningSnapshot();

    const workflows = process.env.ORVANTA_WORKFLOW_RUNTIME_ENABLED === "true"
      ? await runWorkflowTick({ tenantId: auth.context.tenantId, limit: 20 })
      : { processed: 0, disabled: true };
    const outbox = process.env.ORVANTA_OUTBOX_ENABLED === "true"
      ? await publishOutboxBatch({ tenantId: auth.context.tenantId, limit: 50 })
      : { processed: 0, disabled: true };

    return NextResponse.json({
      ok: true,
      dailyIdea: { id: idea.id, title: idea.title, status: idea.status, studyMode: idea.studyMode },
      learning: {
        decisionsAnalyzed: learning.decisionsAnalyzed,
        confidenceThreshold: learning.confidenceThreshold,
        recommendation: learning.recommendation,
      },
      durableRuntime: { workflows, outbox },
      requestId: auth.context.requestId,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Company loop failed", requestId: auth.context.requestId },
      { status: 500 }
    );
  }
}
