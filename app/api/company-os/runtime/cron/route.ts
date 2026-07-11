import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { publishOutboxBatch } from "@/lib/company-os/outboxPublisher";
import { withTelemetrySpan } from "@/lib/company-os/telemetry";
import { runWorkflowTick } from "@/lib/company-os/workflowRuntime";

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
  const workflowLimit = boundedLimit(url.searchParams.get("workflowLimit"), 5, 25);
  const outboxLimit = boundedLimit(url.searchParams.get("outboxLimit"), 10, 50);
  const startedAt = Date.now();

  try {
    const workflow = await withTelemetrySpan(
      {
        tenantId: auth.context.tenantId,
        correlationId: auth.context.correlationId,
        operation: "runtime.cron.workflow",
        category: "WORKFLOW",
        actorId: auth.context.actor.id,
      },
      () => runWorkflowTick({ tenantId: auth.context.tenantId, limit: workflowLimit })
    );

    const outbox = await withTelemetrySpan(
      {
        tenantId: auth.context.tenantId,
        correlationId: auth.context.correlationId,
        operation: "runtime.cron.outbox",
        category: "WORKFLOW",
        actorId: auth.context.actor.id,
      },
      () => publishOutboxBatch({ tenantId: auth.context.tenantId, limit: outboxLimit })
    );

    return NextResponse.json({
      ok: true,
      tenantId: auth.context.tenantId,
      workflow,
      outbox,
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
