import { createClient } from "@supabase/supabase-js";

const required = [
  "RESTORE_SUPABASE_URL",
  "RESTORE_SUPABASE_SERVICE_ROLE_KEY",
  "PRODUCTION_SUPABASE_URL",
  "PRODUCTION_SUPABASE_SERVICE_ROLE_KEY",
  "BACKUP_REFERENCE",
  "RESTORE_TARGET",
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(2);
}

const restored = createClient(
  process.env.RESTORE_SUPABASE_URL,
  process.env.RESTORE_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
const production = createClient(
  process.env.PRODUCTION_SUPABASE_URL,
  process.env.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const coreTables = [
  "decisions",
  "approvals",
  "workflow_instances",
  "workflow_steps",
  "company_events",
  "event_outbox",
  "gov_documents",
  "gov_document_extractions",
  "accounting_journal_entries",
  "accounting_journal_lines",
  "integration_attempts",
  "external_receipts",
  "cron_runs",
  "system_alerts",
  "failed_writes",
  "dead_letter_jobs",
];

const startedAt = Date.now();
const verification = {};
let status = "SUCCEEDED";
let failure = null;

try {
  for (const table of coreTables) {
    const { count, error } = await restored
      .from(table)
      .select("*", { count: "exact", head: true });
    if (error) throw new Error(`${table}: ${error.message}`);
    verification[table] = { reachable: true, count: count ?? 0 };
  }

  const journalEntries = verification.accounting_journal_entries?.count ?? 0;
  const journalLines = verification.accounting_journal_lines?.count ?? 0;
  if (journalEntries > 0 && journalLines === 0) {
    throw new Error("Accounting entries exist but accounting lines are empty.");
  }

  const { error: rpcError } = await restored.rpc("orvanta_owner_setup_state");
  verification.owner_setup_rpc = {
    reachable: !rpcError,
    error: rpcError?.message || null,
  };
} catch (error) {
  status = "FAILED";
  failure = error instanceof Error ? error.message : String(error);
  console.error(failure);
}

const completedAt = Date.now();
const record = {
  status,
  backup_reference: process.env.BACKUP_REFERENCE,
  restore_target: process.env.RESTORE_TARGET,
  started_at: new Date(startedAt).toISOString(),
  completed_at: new Date(completedAt).toISOString(),
  duration_ms: completedAt - startedAt,
  verified_tables: verification,
  error_message: failure,
  performed_by: process.env.GITHUB_ACTOR || "restore-verification-workflow",
};

const { error: recordError } = await production.from("backup_verification_runs").insert(record);
if (recordError) {
  console.error(`Failed to store restore evidence: ${recordError.message}`);
  process.exit(3);
}

console.log(JSON.stringify(record, null, 2));
if (status !== "SUCCEEDED") process.exit(1);
