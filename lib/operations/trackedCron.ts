import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext, type CompanyRequestContext } from "../company-os/context";
import { failCronRun, heartbeatCronRun, startCronRun, succeedCronRun } from "./cronRun";

export type TrackedCronResult = {
  body?: Record<string, unknown>;
  processedCount?: number;
  failedCount?: number;
  details?: Record<string, unknown>;
};

type TrackedCronInput = {
  req: NextRequest;
  jobName: string;
  schedule?: string;
  timeoutMs?: number;
  run: (context: CompanyRequestContext, heartbeat: (details?: Record<string, unknown>) => Promise<void>) => Promise<TrackedCronResult>;
};

function timeoutPromise(timeoutMs: number) {
  return new Promise<never>((_, reject) => {
    const timer = setTimeout(() => reject(new Error(`Cron exceeded ${timeoutMs}ms`)), timeoutMs);
    timer.unref?.();
  });
}

export async function executeTrackedCron(input: TrackedCronInput) {
  const auth = await requireCompanyContext(input.req, "ADMIN");
  if (!auth.ok) return auth.response;

  const run = await startCronRun({
    tenantId: auth.context.tenantId,
    jobName: input.jobName,
    requestId: auth.context.requestId,
    correlationId: auth.context.correlationId,
    schedule: input.schedule || input.req.headers.get("x-vercel-cron-schedule"),
  });

  const heartbeat = (details?: Record<string, unknown>) => heartbeatCronRun(run, details);
  const timeoutMs = Math.max(5_000, input.timeoutMs || 55_000);

  try {
    const result = await Promise.race([
      input.run(auth.context, heartbeat),
      timeoutPromise(timeoutMs),
    ]);

    await succeedCronRun(run, {
      processedCount: result.processedCount,
      failedCount: result.failedCount,
      details: result.details,
    });

    return NextResponse.json({
      ok: true,
      cronRunId: run.id,
      requestId: auth.context.requestId,
      correlationId: auth.context.correlationId,
      ...(result.body || {}),
    });
  } catch (error) {
    await failCronRun(run, error);
    return NextResponse.json(
      {
        ok: false,
        cronRunId: run.id,
        requestId: auth.context.requestId,
        correlationId: auth.context.correlationId,
        error: error instanceof Error ? error.message : `${input.jobName} failed`,
      },
      { status: 500 }
    );
  }
}
