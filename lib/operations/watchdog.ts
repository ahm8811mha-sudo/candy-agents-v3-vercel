import { getSupabaseAdmin } from "../supabase";
import { raiseSystemAlert, resolveSystemAlert, type AlertSeverity } from "./systemAlerts";

const EXPECTED_JOBS: Array<{ jobName: string; maximumAgeHours: number }> = [
  { jobName: "company-os-runtime", maximumAgeHours: 26 },
  { jobName: "company-autonomy-loop", maximumAgeHours: 26 },
  { jobName: "daily-company-idea", maximumAgeHours: 26 },
  { jobName: "opportunity-radar", maximumAgeHours: 26 },
  { jobName: "operational-alerts", maximumAgeHours: 26 },
  { jobName: "owner-daily-digest", maximumAgeHours: 26 },
  { jobName: "daily-executive-report", maximumAgeHours: 26 },
  { jobName: "failed-write-recovery", maximumAgeHours: 26 },
  { jobName: "weekly-learning-review", maximumAgeHours: 8 * 24 },
];

type WatchdogFinding = {
  key: string;
  severity: AlertSeverity;
  source: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60_000).toISOString();
}

async function syncFinding(tenantId: string, finding: WatchdogFinding | null, key: string) {
  if (!finding) {
    await resolveSystemAlert(tenantId, key);
    return false;
  }
  await raiseSystemAlert({ tenantId, dedupeKey: key, ...finding });
  return true;
}

export async function runOperationalWatchdog(tenantId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required for the operational watchdog.");

  const findings: WatchdogFinding[] = [];
  const sinceTenDays = hoursAgo(10 * 24);
  const { data: cronRows, error: cronError } = await supabase
    .from("cron_runs")
    .select("id,job_name,status,started_at,heartbeat_at,completed_at,processed_count,failed_count,error_message,details")
    .eq("tenant_id", tenantId)
    .gte("started_at", sinceTenDays)
    .order("started_at", { ascending: false })
    .limit(2000);
  if (cronError) throw cronError;

  for (const expected of EXPECTED_JOBS) {
    const latest = (cronRows || []).find((row) => row.job_name === expected.jobName && row.status !== "STARTED");
    const missing = !latest || Date.parse(String(latest.completed_at || latest.started_at)) < Date.now() - expected.maximumAgeHours * 60 * 60_000;
    const key = `cron-missed:${expected.jobName}`;
    const finding: WatchdogFinding | null = missing
      ? {
          key,
          severity: "CRITICAL",
          source: "WATCHDOG",
          title: `مهمة مجدولة لم تعمل: ${expected.jobName}`,
          message: `لم يسجل ${expected.jobName} تشغيلًا مكتملًا ضمن آخر ${expected.maximumAgeHours} ساعة.`,
          entityType: "cron_job",
          entityId: expected.jobName,
          metadata: { latest: latest || null, maximumAgeHours: expected.maximumAgeHours },
        }
      : latest.status === "FAILED"
        ? {
            key,
            severity: "CRITICAL",
            source: "WATCHDOG",
            title: `فشل آخر تشغيل: ${expected.jobName}`,
            message: String(latest.error_message || "فشلت المهمة دون رسالة خطأ واضحة."),
            entityType: "cron_run",
            entityId: String(latest.id),
            metadata: { latest },
          }
        : Number(latest.failed_count || 0) > 0
          ? {
              key,
              severity: "WARNING",
              source: "WATCHDOG",
              title: `اكتملت المهمة مع نتائج فاشلة: ${expected.jobName}`,
              message: `اكتملت المهمة، لكن عدد العناصر غير الناجحة هو ${Number(latest.failed_count || 0)}.`,
              entityType: "cron_run",
              entityId: String(latest.id),
              metadata: { latest },
            }
          : null;
    if (finding) findings.push(finding);
    await syncFinding(tenantId, finding, key);
  }

  const stuckThreshold = hoursAgo(0.5);
  const stuckRuns = (cronRows || []).filter(
    (row) => row.status === "STARTED" && Date.parse(String(row.heartbeat_at || row.started_at)) < Date.parse(stuckThreshold)
  );
  const stuckKey = "cron-stuck:any";
  const stuckFinding: WatchdogFinding | null = stuckRuns.length
    ? {
        key: stuckKey,
        severity: "CRITICAL",
        source: "WATCHDOG",
        title: "مهام مجدولة عالقة",
        message: `هناك ${stuckRuns.length} مهمة بدأت ولم ترسل Heartbeat خلال 30 دقيقة.`,
        entityType: "cron_run",
        metadata: { runIds: stuckRuns.map((row) => row.id), jobs: stuckRuns.map((row) => row.job_name) },
      }
    : null;
  if (stuckFinding) findings.push(stuckFinding);
  await syncFinding(tenantId, stuckFinding, stuckKey);

  const [failedWrites, outbox, workflows, integrations] = await Promise.all([
    supabase.from("failed_writes").select("id,status,attempts,error_message", { count: "exact" }).eq("tenant_id", tenantId).in("status", ["PENDING", "RETRYING", "DEAD_LETTER"]).limit(100),
    supabase.from("event_outbox").select("id,status,attempts,last_error", { count: "exact" }).eq("tenant_id", tenantId).in("status", ["RETRY", "DEAD_LETTER"]).limit(100),
    supabase.from("workflow_instances").select("id,status,created_at,current_step", { count: "exact" }).eq("tenant_id", tenantId).in("status", ["RUNNING", "RETRY"]).lt("created_at", hoursAgo(4)).limit(100),
    supabase.from("integration_attempts").select("id,status,integration,operation,error_message", { count: "exact" }).eq("tenant_id", tenantId).in("status", ["FAILED", "RETRY", "DEAD_LETTER"]).limit(100),
  ]);

  for (const response of [failedWrites, outbox, workflows, integrations]) {
    if (response.error) throw response.error;
  }

  const aggregateChecks: Array<{ key: string; count: number; severity: AlertSeverity; title: string; source: string; rows: unknown[] }> = [
    { key: "failed-writes:pending", count: failedWrites.count || 0, severity: (failedWrites.data || []).some((row) => row.status === "DEAD_LETTER") ? "CRITICAL" : "WARNING", title: "كتابات دائمة تحتاج معالجة", source: "PERSISTENCE", rows: failedWrites.data || [] },
    { key: "outbox:unhealthy", count: outbox.count || 0, severity: (outbox.data || []).some((row) => row.status === "DEAD_LETTER") ? "CRITICAL" : "WARNING", title: "أحداث Outbox لم تُنشر", source: "OUTBOX", rows: outbox.data || [] },
    { key: "workflow:stalled", count: workflows.count || 0, severity: "CRITICAL", title: "مسارات تنفيذ عالقة", source: "WORKFLOW", rows: workflows.data || [] },
    { key: "integration:failed", count: integrations.count || 0, severity: (integrations.data || []).some((row) => row.status === "DEAD_LETTER") ? "CRITICAL" : "WARNING", title: "محاولات تكامل فاشلة", source: "INTEGRATION", rows: integrations.data || [] },
  ];

  for (const check of aggregateChecks) {
    const finding: WatchdogFinding | null = check.count > 0
      ? {
          key: check.key,
          severity: check.severity,
          source: check.source,
          title: check.title,
          message: `عدد العناصر التي تحتاج تدخلًا: ${check.count}.`,
          metadata: { count: check.count, sample: check.rows.slice(0, 20) },
        }
      : null;
    if (finding) findings.push(finding);
    await syncFinding(tenantId, finding, check.key);
  }

  return {
    checkedAt: new Date().toISOString(),
    expectedJobs: EXPECTED_JOBS.length,
    findings: findings.length,
    critical: findings.filter((item) => item.severity === "CRITICAL").length,
    warning: findings.filter((item) => item.severity === "WARNING").length,
    details: findings,
  };
}
