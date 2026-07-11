import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { runCoreRuntimeSweep } from "@/lib/company-os/runtimeRunner";
import { withTelemetrySpan } from "@/lib/company-os/telemetry";

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

  try {
    const sweep = await withTelemetrySpan(
      {
        tenantId: auth.context.tenantId,
        correlationId: auth.context.correlationId,
        operation: "runtime.cron.sweep",
        category: "WORKFLOW",
        actorId: auth.context.actor.id,
        attributes: { maxWorkflowCycles, workflowBatchLimit, outboxLimit },
      },
      () =>
        runCoreRuntimeSweep({
          tenantId: auth.context.tenantId,
          maxWorkflowCycles,
          workflowBatchLimit,
          outboxLimit,
        })
    );

    return NextResponse.json({
      ok: true,
      tenantId: auth.context.tenantId,
      ...sweep,
      durationMs: Date.now() - startedAt,
      schedule: req.headers.get("x-vercel-cron-schedule"),
      requestId: auth.context.requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Core runtime cron failed",
        durationMs: Date.now() - startedAt,
        requestId: auth.context.requestId,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
