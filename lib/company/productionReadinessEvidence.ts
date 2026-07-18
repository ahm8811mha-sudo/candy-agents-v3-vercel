import { getSupabaseAdmin, probeSupabaseConnection, type SupabaseConnectionStatus } from "../supabase";
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
  const connection = await probeSupabaseConnection();
  if (!connection.ready) {
    const details: Record<Exclude<SupabaseConnectionStatus, "READY">, string> = {
      NOT_CONFIGURED: "Supabase server persistence is not configured for this deployment.",
      PROJECT_MISMATCH: "The Supabase URL and server key belong to different projects. Server writes remain blocked.",
      AUTH_REJECTED: "Supabase rejected the configured server key. Replace SUPABASE_SECRET_KEY with a valid Secret key for the linked project.",
      SCHEMA_UNAVAILABLE: "The Supabase server key is accepted, but the authoritative schema probe is unavailable.",
      UNAVAILABLE: "Supabase could not be reached. Evidence queries were skipped to avoid repeated failed requests.",
    };
    replaceCheck(readiness, "supabase-service-role", false, details[connection.status]);
    readiness.okForProduction = readiness.checks.every((item) => item.severity !== "FAIL");
    return readiness;
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return readiness;
  const tenantId = process.env.ORVANTA_TENANT_ID?.trim() || "golden-star";
  const evidenceEnvironment = readiness.mode === "production" ? "production" : "development";

  const [evidenceResult, cronResult, capabilityResult, receiptResult, backupResult, companyBrainResult, coreProbes] = await Promise.all([
    supabase.from("readiness_evidence").select("*").eq("environment", evidenceEnvironment).order("performed_at", { ascending: false }).limit(200),
    supabase.from("cron_runs").select("job_name,status,completed_at,started_at").eq("tenant_id", tenantId).in("job_name", ["system-watchdog", "failed-write-recovery"]).order("started_at", { ascending: false }).limit(20),
    supabase.from("capability_registry").select("capability_key,status,evidence_required,integration"),
    supabase.from("external_receipts").select("integration,operation,verified,verified_at,created_at").eq("verified", true).order("created_at", { ascending: false }).limit(500),
    supabase.from("backup_verification_runs").select("status,completed_at,started_at,backup_reference,restore_target").order("started_at", { ascending: false }).limit(10),
    supabase.from("company_ingestion_runs").select("id,status,completed_at,started_at,failures").eq("tenant_id", tenantId).eq("pipeline", "operational-to-company-brain-v1").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    Promise.all([
      supabase.from("workflow_instances").select("id").eq("tenant_id", tenantId).limit(1),
      supabase.from("workflow_steps").select("id").eq("tenant_id", tenantId).limit(1),
      supabase.from("event_outbox").select("id").eq("tenant_id", tenantId).limit(1),
      supabase.from("execution_reconciliations").select("id").eq("tenant_id", tenantId).limit(1),
      supabase.from("accounting_periods").select("id").eq("tenant_id", tenantId).limit(1),
    ]),
  ]);

  const evidence = new Map<string, Record<string, unknown>>();
  if (!evidenceResult.error) {
    for (const row of (evidenceResult.data || []) as Record<string, unknown>[]) {
      const key = String(row.evidence_key || "");
      const details = row.details && typeof row.details === "object" ? row.details as Record<string, unknown> : {};
      if (key === "company-brain-cycle" && details.tenantId !== tenantId) continue;
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
    "core-schema-ready",
    coreProbes.every((probe) => !probe.error),
    coreProbes.every((probe) => !probe.error)
      ? "The tenant-scoped workflow, outbox, reconciliation, and accounting tables are reachable through the service role."
      : "One or more required Company OS tables are unavailable; apply the ordered migration chain."
  );
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
    "execution-transaction",
    passingEvidence("execution-transaction-smoke"),
    passingEvidence("execution-transaction-smoke")
      ? "The canonical execution RPC passed rollback-safe atomicity, idempotency, workflow, audit, and outbox checks."
      : "No current execution transaction smoke evidence is stored."
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
    "tenant-rls-ready",
    Boolean(tenantId) && passingEvidence("rls-regression"),
    Boolean(tenantId) && passingEvidence("rls-regression")
      ? `Tenant ${tenantId} is explicit and the current RLS regression evidence is passing.`
      : "An explicit tenant and current RLS regression evidence are required."
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

  const companyBrain = companyBrainResult.error ? null : companyBrainResult.data;
  const companyBrainPassed = Boolean(
    companyBrain &&
    companyBrain.status === "SUCCEEDED" &&
    Number(companyBrain.failures || 0) === 0 &&
    recent(companyBrain.completed_at || companyBrain.started_at, 36) &&
    passingEvidence("company-brain-cycle")
  );
  replaceCheck(
    readiness,
    "company-brain-cycle",
    companyBrainPassed,
    companyBrainPassed
      ? `Tenant ${tenantId} completed a fully successful Company Brain cycle within the last 36 hours.`
      : `Tenant ${tenantId} has no recent fully successful Company Brain cycle with matching PASS evidence.`
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
  const receipts = receiptResult.error ? [] : receiptResult.data || [];
  const hasRecentReceipt = (integration: unknown) => receipts.some(
    (row) =>
      String(row.integration || "").toUpperCase() === String(integration || "").toUpperCase() &&
      row.verified === true &&
      recent(row.verified_at || row.created_at, 90 * 24)
  );
  const capabilityHasEvidence = (row: Record<string, unknown>) => {
    if (String(row.status) !== "LIVE" || row.evidence_required !== true) return true;
    const capabilityKey = String(row.capability_key || "");
    if (capabilityKey === "finance.journal.post") return passingEvidence("accounting-controls-smoke");
    return hasRecentReceipt(row.integration) || passingEvidence(`capability:${capabilityKey}`);
  };
  const invalidCapabilities = (capabilities as Record<string, unknown>[]).filter(
    (row) => !VALID_CAPABILITY_STATES.has(String(row.status)) || !capabilityHasEvidence(row)
  );
  const capabilityPassed = capabilities.length > 0 && invalidCapabilities.length === 0;
  replaceCheck(
    readiness,
    "capability-registry",
    capabilityPassed,
    capabilityPassed
      ? `${capabilities.length} capabilities are explicitly classified and every LIVE evidence-required claim has a current verified receipt or canary record.`
      : invalidCapabilities.length
        ? `Capability evidence is missing or invalid for: ${invalidCapabilities.map((row) => String(row.capability_key)).join(", ")}.`
        : "The capability registry is empty or unavailable."
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
