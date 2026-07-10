import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { runWorkflowTick } from "@/lib/company-os/workflowRuntime";
import { withTelemetrySpan } from "@/lib/company-os/telemetry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function run(req: NextRequest) {
  const auth = await requireCompanyContext(req, "ADMIN");
  if (!auth.ok) return auth.response;
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const limit = Number(body.limit || new URL(req.url).searchParams.get("limit") || 10);
    const result = await withTelemetrySpan(
      {
        tenantId: auth.context.tenantId,
        correlationId: auth.context.correlationId,
        operation: "workflow.tick",
        category: "WORKFLOW",
        actorId: auth.context.actor.id,
      },
      () => runWorkflowTick({ tenantId: auth.context.tenantId, limit })
    );
    return NextResponse.json({ ok: true, ...result, requestId: auth.context.requestId });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Workflow tick failed", requestId: auth.context.requestId },
      { status: 500 }
    );
  }
}

export const GET = run;
export const POST = run;
