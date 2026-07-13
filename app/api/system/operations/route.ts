import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { getSupabaseAdmin } from "@/lib/supabase";
import { acknowledgeSystemAlert } from "@/lib/operations/systemAlerts";
import { runOperationalWatchdog } from "@/lib/operations/watchdog";
import { processFailedWrites } from "@/lib/operations/failedWriteWorker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIMIT = 100;

async function loadOperations(tenantId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required for operational status.");

  const [cron, alerts, failedWrites, deadLetters, attempts, capabilities, backups, evidence] = await Promise.all([
    supabase.from("cron_runs").select("*").eq("tenant_id", tenantId).order("started_at", { ascending: false }).limit(LIMIT),
    supabase.from("system_alerts").select("*").eq("tenant_id", tenantId).order("last_seen_at", { ascending: false }).limit(LIMIT),
    supabase.from("failed_writes").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(LIMIT),
    supabase.from("dead_letter_jobs").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(LIMIT),
    supabase.from("integration_attempts").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(LIMIT),
    supabase.from("capability_registry").select("*").order("domain").order("title"),
    supabase.from("backup_verification_runs").select("*").order("started_at", { ascending: false }).limit(20),
    supabase.from("readiness_evidence").select("*").order("performed_at", { ascending: false }).limit(LIMIT),
  ]);

  for (const result of [cron, alerts, failedWrites, deadLetters, attempts, capabilities, backups, evidence]) {
    if (result.error) throw result.error;
  }

  const cronRows = cron.data || [];
  const latestByJob = new Map<string, Record<string, unknown>>();
  for (const row of cronRows as Record<string, unknown>[]) {
    const jobName = String(row.job_name || "");
    if (jobName && !latestByJob.has(jobName)) latestByJob.set(jobName, row);
  }

  const latestEvidenceByKey = new Map<string, Record<string, unknown>>();
  for (const row of (evidence.data || []) as Record<string, unknown>[]) {
    const key = String(row.evidence_key || "");
    if (key && !latestEvidenceByKey.has(key)) latestEvidenceByKey.set(key, row);
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      openAlerts: (alerts.data || []).filter((row) => row.status !== "RESOLVED").length,
      criticalAlerts: (alerts.data || []).filter((row) => row.status !== "RESOLVED" && row.severity === "CRITICAL").length,
      failedWrites: (failedWrites.data || []).filter((row) => row.status !== "RESOLVED").length,
      deadLetters: (deadLetters.data || []).filter((row) => row.status === "OPEN").length,
      failedIntegrations: (attempts.data || []).filter((row) => ["FAILED", "RETRY", "DEAD_LETTER"].includes(row.status)).length,
      trackedJobs: latestByJob.size,
      liveCapabilities: (capabilities.data || []).filter((row) => row.status === "LIVE").length,
      totalCapabilities: (capabilities.data || []).length,
      readinessEvidencePassed: Array.from(latestEvidenceByKey.values()).filter((row) => row.status === "PASS").length,
      readinessEvidenceTotal: latestEvidenceByKey.size,
    },
    latestCronRuns: Array.from(latestByJob.values()),
    cronRuns: cronRows,
    alerts: alerts.data || [],
    failedWrites: failedWrites.data || [],
    deadLetters: deadLetters.data || [],
    integrationAttempts: attempts.data || [],
    capabilities: capabilities.data || [],
    backupVerificationRuns: backups.data || [],
    readinessEvidence: Array.from(latestEvidenceByKey.values()),
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req, "OWNER");
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ ok: true, operations: await loadOperations(auth.context.tenantId) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "تعذر تحميل الحالة التشغيلية." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireCompanyContext(req, "OWNER");
  if (!auth.ok) return auth.response;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase is unavailable." }, { status: 503 });

  try {
    const body = await req.json();
    const action = String(body.action || "");
    const id = String(body.id || "");

    if (action === "ACKNOWLEDGE_ALERT") {
      const alert = await acknowledgeSystemAlert(auth.context.tenantId, id, auth.context.actor.id);
      return NextResponse.json({ ok: true, alert });
    }

    if (action === "RESOLVE_ALERT") {
      const { data, error } = await supabase.from("system_alerts").update({
        status: "RESOLVED",
        resolved_at: new Date().toISOString(),
        resolution_note: String(body.note || "Resolved by owner"),
        updated_at: new Date().toISOString(),
      }).eq("tenant_id", auth.context.tenantId).eq("id", id).select("*").maybeSingle();
      if (error) throw error;
      return NextResponse.json({ ok: true, alert: data });
    }

    if (action === "RETRY_FAILED_WRITE") {
      const { data, error } = await supabase.from("failed_writes").update({
        status: "PENDING",
        next_retry_at: new Date().toISOString(),
        claimed_at: null,
        claimed_by: null,
        updated_at: new Date().toISOString(),
      }).eq("tenant_id", auth.context.tenantId).eq("id", id).select("*").maybeSingle();
      if (error) throw error;
      return NextResponse.json({ ok: true, failedWrite: data });
    }

    if (action === "RETRY_DEAD_LETTER") {
      const { data: deadLetter, error: readError } = await supabase
        .from("dead_letter_jobs")
        .select("*")
        .eq("tenant_id", auth.context.tenantId)
        .eq("id", id)
        .maybeSingle();
      if (readError) throw readError;
      if (!deadLetter) return NextResponse.json({ ok: false, error: "Dead Letter غير موجود." }, { status: 404 });

      if (deadLetter.source_type !== "failed_write") {
        return NextResponse.json(
          {
            ok: false,
            error: "هذه العملية تحتاج إعادة تشغيل من مسارها الأصلي بعد مراجعة الإيصال الخارجي؛ لن يعيد النظام تنفيذها عشوائيًا.",
          },
          { status: 409 }
        );
      }

      const { error: sourceError } = await supabase.from("failed_writes").update({
        status: "PENDING",
        next_retry_at: new Date().toISOString(),
        claimed_at: null,
        claimed_by: null,
        updated_at: new Date().toISOString(),
      }).eq("tenant_id", auth.context.tenantId).eq("id", deadLetter.source_id);
      if (sourceError) throw sourceError;

      const { data, error } = await supabase.from("dead_letter_jobs").update({
        status: "RETRYING",
        next_retry_at: new Date().toISOString(),
        last_attempt_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("tenant_id", auth.context.tenantId).eq("id", id).select("*").maybeSingle();
      if (error) throw error;
      return NextResponse.json({ ok: true, deadLetter: data });
    }

    if (action === "IGNORE_DEAD_LETTER") {
      const { data, error } = await supabase.from("dead_letter_jobs").update({
        status: "IGNORED",
        resolution_note: String(body.note || "Ignored by owner after review"),
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("tenant_id", auth.context.tenantId).eq("id", id).select("*").maybeSingle();
      if (error) throw error;
      return NextResponse.json({ ok: true, deadLetter: data });
    }

    if (action === "RUN_WATCHDOG") {
      return NextResponse.json({ ok: true, watchdog: await runOperationalWatchdog(auth.context.tenantId) });
    }

    if (action === "PROCESS_FAILED_WRITES") {
      return NextResponse.json({ ok: true, recovery: await processFailedWrites({ tenantId: auth.context.tenantId, limit: 50 }) });
    }

    return NextResponse.json({ ok: false, error: "إجراء غير مدعوم." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "تعذر تنفيذ الإجراء التشغيلي." },
      { status: 500 }
    );
  }
}
