import { getSupabaseAdmin } from "../supabase";
import {
  getProductionReadiness,
  type ProductionReadiness,
  type ReadinessCheck,
} from "./productionReadiness";

const VALID_CAPABILITY_STATES = new Set([
  "LIVE",
  "SANDBOX",
  "HUMAN_CHECKPOINT",
  "NOT_INTEGRATED",
  "DISABLED",
]);

function replaceCheck(
  readiness: ProductionReadiness,
  id: string,
  passed: boolean,
  detail: string
) {
  readiness.checks = readiness.checks.map((item): ReadinessCheck =>
    item.id === id
      ? { ...item, severity: passed ? "PASS" : item.requiredForProduction ? "FAIL" : "WARN", detail }
      : item
  );
}

function recent(value: unknown, maximumHours: number) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) && timestamp >= Date.now() - maximumHours * 60 * 60_000;
}

export async function getEvidenceAwareProductionReadiness(): Promise<ProductionReadiness> {
  const readiness = getProductionReadiness();
  const supabase = getSupabaseAdmin();
  if (!supabase) return readiness;

  const [evidenceResult, cronResult, capabilityResult, backupResult] = await Promise.all([
    supabase.from("readiness_evidence").select("*").order("performed_at", { ascending: false }).limit(200),
    supabase.from("cron_runs").select("job_name,status,completed_at,started_at").in("job_name", ["system-watchdog", "failed-write-recovery"]).order("started_at", { ascending: false }).limit(20),
    supabase.from("capability_registry").select("capability_key,status,evidence_required"),
    supabase.from("backup_verification_runs").select("status,completed_at,started_at,backup_reference,restore_target").order("started_at", { ascending: false }).limit(10),
  ]);

  const evidence = new Map<string, Record<string, unknown>>();
  if (!evidenceResult.error) {
    for (const row of (evidenceResult.data || []) as Record<string, unknown>[]) {
      const key = String(row.evidence_key || "");
      if (key && !evidence.has(key)) evidence.set(key, row);
    }
  }

  const passingEvidence = (key: string) => {
    const row = evidence.get(key);
    if (!row || row.status !== "PASS") return false;
    const expiresAt = row.expires_at ? Date.parse(String(row.expires_at)) : Number.POSITIVE_INFINITY;
    return !Number.isFinite(expiresAt) || expiresAt > Date.now();
  };

  replaceCheck(
    readiness,
    "migration-baseline",
    passingEvidence("migration-chain-applied"),
    passingEvidence("migration-chain-applied")
      ? "The ordered migration chain is recorded as applied and verified."
      : "No current migration-chain evidence is stored."
  );
  replaceCheck(
    readiness,
    "rls-regression-tested",
    passingEvidence("rls-regression"),
    passingEvidence("rls-regression")
      ? "The recorded RLS regression checks passed and remain within their evidence window."
      : "No current passing RLS regression evidence is stored."
  );
  replaceCheck(
    readiness,
    "accounting-controls",
    passingEvidence("accounting-controls-smoke"),
    passingEvidence("accounting-controls-smoke")
      ? "Balanced posting, posted-entry immutability, and reversal were verified in a rollback-only smoke transaction."
      : "Accounting control smoke evidence is missing or expired."
  );
  replaceCheck(
    readiness,
    "browser-e2e",
    passingEvidence("browser-e2e"),
    passingEvidence("browser-e2e")
      ? "Desktop Chromium and iPhone WebKit journeys are recorded as passing."
      : "Browser E2E evidence has not yet been recorded from a passing main-branch workflow."
  );

  const cronRows = cronResult.error ? [] : cronResult.data || [];
  const latestJob = (jobName: string) => cronRows.find((row) => row.job_name === jobName);
  const watchdog = latestJob("system-watchdog");
  const recovery = latestJob("failed-write-recovery");
  const watchdogPassed = Boolean(watchdog && watchdog.status === "SUCCEEDED" && recent(watchdog.completed_at || watchdog.started_at, 36));
  const recoveryPassed = Boolean(recovery && recovery.status === "SUCCEEDED" && recent(recovery.completed_at || recovery.started_at, 36));

  replaceCheck(
    readiness,
    "watchdog",
    watchdogPassed,
    watchdogPassed
      ? "The production watchdog completed successfully within the last 36 hours."
      : "The watchdog has not completed successfully within the last 36 hours."
  );
  replaceCheck(
    readiness,
    "failed-write-recovery",
    recoveryPassed,
    recoveryPassed
      ? "The failed-write recovery worker completed successfully within the last 36 hours."
      : "The failed-write recovery worker has not completed successfully within the last 36 hours."
  );

  const capabilities = capabilityResult.error ? [] : capabilityResult.data || [];
  const capabilityPassed = capabilities.length > 0 && capabilities.every((row) => VALID_CAPABILITY_STATES.has(String(row.status)));
  replaceCheck(
    readiness,
    "capability-registry",
    capabilityPassed,
    capabilityPassed
      ? `${capabilities.length} capabilities are explicitly classified without ambiguous execution claims.`
      : "The capability registry is empty, unavailable, or contains an invalid status."
  );

  const backups = backupResult.error ? [] : backupResult.data || [];
  const verifiedBackup = backups.find((row) => row.status === "SUCCEEDED" && recent(row.completed_at || row.started_at, 90 * 24));
  replaceCheck(
    readiness,
    "backup-restore",
    Boolean(verifiedBackup),
    verifiedBackup
      ? `A successful restore drill is recorded for ${verifiedBackup.restore_target || "an isolated target"}.`
      : "No successful restore drill is recorded within the last 90 days."
  );

  readiness.okForProduction = readiness.checks.every((item) => item.severity !== "FAIL");
  return readiness;
}
