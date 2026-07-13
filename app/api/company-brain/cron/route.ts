import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { runCompanyBrainCycle } from "@/lib/company-intelligence/platform";
import { failCronRun, startCronRun, succeedCronRun } from "@/lib/operations/cronRun";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req, "ADMIN");
  if (!auth.ok) return auth.response;

  const run = await startCronRun({
    tenantId: auth.context.tenantId,
    jobName: "company-brain-cycle",
    requestId: auth.context.requestId,
    correlationId: auth.context.correlationId,
    schedule: req.headers.get("x-vercel-cron-schedule"),
    details: { engine: "company-brain-v1" },
  });

  try {
    const result = await runCompanyBrainCycle(auth.context.tenantId, auth.context.actor.id);
    await succeedCronRun(run, {
      processedCount: result.warehouse.rowsRead,
      failedCount: result.warehouse.failures,
      details: {
        snapshotId: result.snapshotId,
        twinId: result.twinId,
        predictions: result.predictionIds.length,
        recommendations: result.recommendationIds.length,
        skillsInstalled: result.skillInstallationIds.length,
        warehouse: result.warehouse,
      },
    });

    return NextResponse.json({
      ok: true,
      cronRunId: run.id,
      requestId: auth.context.requestId,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    await failCronRun(run, error);
    return NextResponse.json(
      {
        ok: false,
        cronRunId: run.id,
        requestId: auth.context.requestId,
        error: error instanceof Error ? error.message : "Company brain cycle failed.",
      },
      { status: 500 }
    );
  }
}
