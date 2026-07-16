import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { runCoreRuntimeSweep } from "@/lib/company-os/runtimeRunner";
import { withTelemetrySpan } from "@/lib/company-os/telemetry";
import { failCronRun, startCronRun, succeedCronRun } from "@/lib/operations/cronRun";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function boundedLimit(value: string | null, fallback: number, maximum: number) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), maximum);
}

export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req, "ADMIN");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const maxWorkflowCycles = boundedLimit(url.searchParams.get("workflowCycles"), 8, 16);
  const workflowBatchLimit = boundedLimit(url.searchParams.get("workflowLimit"), 25, 50);
  const outboxLimit = boundedLimit(url.searchParams.get("outboxLimit"), 25, 100);
  const startedAt = Date.now();
  const run = await startCronRun({
    tenantId: auth.context.tenantId,
    jobName: "company-os-runtime",
    requestId: auth.context.requestId,
    correlationId: auth.context.correlationId,
    schedule: req.headers.get("x-vercel-cron-schedule"),
    details: { maxWorkflowCycles, workflowBatchLimit, outboxLimit },
  });

  try {
    const sweep = await withTelemetrySpan(
      {
        tenantId: auth.context.tenantId,
        correlationId: auth.context.correlationId,
        operation: "runtime.cron.sweep",
        category: "WORKFLOW",
        actorId: auth.context.actor.id,
        attributes: { maxWorkflowCycles, workflowBatchLimit, outboxLimit, cronRunId: run.id },
      },
      () =>
        runCoreRuntimeSweep({
          tenantId: auth.context.tenantId,
          maxWorkflowCycles,
          workflowBatchLimit,
          outboxLimit,
        })
    );

    const processedCount = sweep.workflow.totalProcessed + sweep.outbox.processed + sweep.agentExecution.results.length;
    const failedCount = sweep.outbox.retried + sweep.outbox.deadLettered
      + sweep.agentExecution.results.reduce((sum, result) => sum + result.failed, 0);
    await succeedCronRun(run, {
      processedCount,
      failedCount,
      details: {
        workflowCycles: sweep.workflow.cycles,
        workflowProcessed: sweep.workflow.totalProcessed,
        outboxSelected: sweep.outbox.selected,
        outboxPublished: sweep.outbox.published,
        outboxRetried: sweep.outbox.retried,
        outboxDeadLettered: sweep.outbox.deadLettered,
        agentProjectsSelected: sweep.agentExecution.selected,
        agentProjectsCompleted: sweep.agentExecution.results.length,
      },
    });

    return NextResponse.json({
      ok: true,
      tenantId: auth.context.tenantId,
      cronRunId: run.id,
      ...sweep,
      durationMs: Date.now() - startedAt,
      schedule: req.headers.get("x-vercel-cron-schedule"),
      requestId: auth.context.requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    await failCronRun(run, error);
    return NextResponse.json(
      {
        ok: false,
        cronRunId: run.id,
        error: error instanceof Error ? error.message : "Core runtime cron failed",
        durationMs: Date.now() - startedAt,
        requestId: auth.context.requestId,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
