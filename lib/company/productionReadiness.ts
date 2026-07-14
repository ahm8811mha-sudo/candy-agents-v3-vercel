import { hasSupabaseEnv } from "../supabase";
import { isAuthEnabled, isPersonalOwnerMode } from "../auth";
import { isOwnerAccessConfigured } from "../security/personalAccess";
import { getGoogleWorkspaceStatus } from "../integrations/googleWorkspace";

export type ReadinessSeverity = "PASS" | "WARN" | "FAIL";

export type ReadinessCheck = {
  id: string;
  label: string;
  severity: ReadinessSeverity;
  detail: string;
  requiredForProduction: boolean;
};

export type ProductionReadiness = {
  okForProduction: boolean;
  mode: "production" | "development" | "test";
  accessMode: "personal" | "commercial";
  checks: ReadinessCheck[];
};

function check(
  id: string,
  label: string,
  passed: boolean,
  detail: string,
  requiredForProduction = true
): ReadinessCheck {
  return {
    id,
    label,
    severity: passed ? "PASS" : requiredForProduction ? "FAIL" : "WARN",
    detail,
    requiredForProduction,
  };
}

function enabled(name: string) {
  return process.env[name] === "true";
}

export function getProductionReadiness(): ProductionReadiness {
  const mode = process.env.NODE_ENV === "production" ? "production" : process.env.NODE_ENV === "test" ? "test" : "development";
  const personalMode = isPersonalOwnerMode();
  const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const hasPublicAnonServerWriteFallback = Boolean(process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const personalAccessCodeConfigured = Boolean(process.env.ORVANTA_OWNER_ACCESS_KEY || process.env.API_SECRET_KEY);
  const googleWorkspace = getGoogleWorkspaceStatus();
  const workflowRuntimeEnabled = personalMode
    ? process.env.ORVANTA_WORKFLOW_RUNTIME_ENABLED !== "false"
    : enabled("ORVANTA_WORKFLOW_RUNTIME_ENABLED");
  const reconciliationRequired = process.env.ORVANTA_RECONCILIATION_REQUIRED !== "false";
  const googleWorkspaceCheck = googleWorkspace.enabled
    ? check(
        "google-workspace",
        "Google Workspace execution",
        googleWorkspace.credentialsConfigured,
        googleWorkspace.credentialsConfigured
          ? "Google Workspace is enabled and OAuth credentials are configured. External operations must still create integration attempts and receipts."
          : `Google Workspace is enabled but missing: ${googleWorkspace.missingEnvironmentVariables.join(", ")}`,
        true
      )
    : check(
        "google-workspace",
        "Google Workspace execution",
        false,
        "Google Workspace execution is disabled. It remains a non-blocking warning for the personal core, but commercial claims must not label it LIVE.",
        false
      );

  const tenantIsolationPassed = personalMode
    ? Boolean(process.env.ORVANTA_TENANT_ID) && enabled("ORVANTA_RLS_READY")
    : enabled("ORVANTA_MULTI_TENANT") && enabled("ORVANTA_RLS_READY");

  const checks: ReadinessCheck[] = [
    check(
      "access-gate",
      personalMode ? "Personal owner access gate" : "Production authentication gate",
      isAuthEnabled() && (!personalMode || personalAccessCodeConfigured),
      personalMode
        ? isOwnerAccessConfigured() && personalAccessCodeConfigured
          ? "Personal mode requires a server-side owner code and a signed HttpOnly trusted-device cookie. Anonymous OWNER fallback is disabled."
          : "Configure ORVANTA_OWNER_ACCESS_KEY and a server-side signing secret before exposing the personal workspace."
        : isAuthEnabled()
          ? "Commercial authentication is enabled. Sensitive routes require authenticated roles and tenant context."
          : "AUTH_ENABLED is not true. Commercial routes must fail closed."
    ),
    check(
      "basic-auth-disabled",
      "No production Basic Auth",
      process.env.NODE_ENV === "production" || process.env.ALLOW_BASIC_AUTH !== "true",
      process.env.ALLOW_BASIC_AUTH === "true"
        ? "ALLOW_BASIC_AUTH=true is accepted only in local development and is ignored in production."
        : "Basic Auth is disabled. Signed owner access, Supabase sessions, or trusted system credentials are required."
    ),
    check(
      "supabase-service-role",
      "Durable server persistence",
      hasSupabaseEnv() && hasServiceRole,
      hasServiceRole
        ? "SUPABASE_SERVICE_ROLE_KEY is configured for server-only writes."
        : "SUPABASE_SERVICE_ROLE_KEY is missing. Projects, approvals, audit, actions, workflow state, and ledger cannot be durable."
    ),
    check(
      "core-schema-ready",
      "Company OS core schema",
      enabled("ORVANTA_CORE_SCHEMA_READY"),
      enabled("ORVANTA_CORE_SCHEMA_READY")
        ? "Core completion migration is confirmed as applied."
        : "Apply the ordered Supabase migrations in staging and production, then set ORVANTA_CORE_SCHEMA_READY=true."
    ),
    check(
      "migration-baseline",
      "Ordered migration baseline",
      enabled("ORVANTA_MIGRATIONS_BASELINED"),
      enabled("ORVANTA_MIGRATIONS_BASELINED")
        ? "The production schema has an ordered baseline and staging migration verification."
        : "Create and verify the production baseline from supabase/migrations before declaring release readiness."
    ),
    check(
      "tenant-rls-ready",
      personalMode ? "Single-tenant RLS boundary" : "Tenant claims and RLS",
      tenantIsolationPassed,
      tenantIsolationPassed
        ? personalMode
          ? "The personal workspace uses one explicit tenant and RLS remains enabled."
          : "Tenant-scoped RLS is confirmed and cross-tenant tests can run."
        : personalMode
          ? "Set ORVANTA_TENANT_ID and confirm ORVANTA_RLS_READY=true; personal mode does not justify disabling RLS."
          : "Set JWT app_metadata.tenant_id, enable ORVANTA_MULTI_TENANT, apply RLS policies, and set ORVANTA_RLS_READY=true."
    ),
    check(
      "rls-regression-tested",
      "RLS regression suite",
      enabled("ORVANTA_RLS_TESTED"),
      enabled("ORVANTA_RLS_TESTED")
        ? "Anonymous, owner, service, and cross-tenant access tests are recorded as passing."
        : "Run supabase/tests/rls_regression.sql against staging and set ORVANTA_RLS_TESTED=true only after evidence is stored."
    ),
    check(
      "workflow-runtime",
      "Durable workflow runtime",
      workflowRuntimeEnabled,
      workflowRuntimeEnabled
        ? "Durable workflow instances, steps, retries, approvals, and restart recovery are enabled."
        : "ORVANTA_WORKFLOW_RUNTIME_ENABLED is not true. Long-running company workflows remain blocked."
    ),
    check(
      "outbox-publisher",
      "Transactional outbox publisher",
      enabled("ORVANTA_OUTBOX_ENABLED") && Boolean(process.env.CRON_SECRET),
      enabled("ORVANTA_OUTBOX_ENABLED") && process.env.CRON_SECRET
        ? "Outbox publishing and scheduler authentication are enabled."
        : "Enable ORVANTA_OUTBOX_ENABLED and configure CRON_SECRET before publishing external events."
    ),
    check(
      "watchdog",
      "Operational watchdog and cron tracking",
      enabled("ORVANTA_WATCHDOG_ENABLED"),
      enabled("ORVANTA_WATCHDOG_ENABLED")
        ? "All scheduled jobs emit durable run records and the watchdog is scheduled."
        : "Deploy the tracked cron routes and set ORVANTA_WATCHDOG_ENABLED=true after the watchdog completes a successful cycle."
    ),
    check(
      "failed-write-recovery",
      "Failed-write retry and dead letter worker",
      enabled("ORVANTA_FAILED_WRITE_WORKER_ENABLED"),
      enabled("ORVANTA_FAILED_WRITE_WORKER_ENABLED")
        ? "Failed writes are claimed, retried with backoff, and moved to dead letter when terminal."
        : "Enable the failed-write recovery worker only after its first successful production run."
    ),
    check(
      "reconciliation-required",
      "External receipt and reconciliation",
      reconciliationRequired,
      reconciliationRequired
        ? "External actions cannot complete without evidence and reconciliation."
        : "Set ORVANTA_RECONCILIATION_REQUIRED=true after applying the reconciliation and receipt schema."
    ),
    check(
      "capability-registry",
      "Capability truth registry",
      enabled("ORVANTA_CAPABILITY_REGISTRY_READY"),
      enabled("ORVANTA_CAPABILITY_REGISTRY_READY")
        ? "Every exposed capability is labelled LIVE, SANDBOX, HUMAN_CHECKPOINT, NOT_INTEGRATED, or DISABLED."
        : "Verify the capability registry and hide unsupported modules before setting ORVANTA_CAPABILITY_REGISTRY_READY=true."
    ),
    check(
      "company-brain-cycle",
      "Company Brain production cycle",
      false,
      "No recent tenant-scoped Company Brain cycle has been verified yet."
    ),
    check(
      "accounting-controls",
      "Immutable accounting and period close",
      enabled("ORVANTA_ACCOUNTING_CONTROLS_READY"),
      enabled("ORVANTA_ACCOUNTING_CONTROLS_READY")
        ? "Posted entries are immutable, reversals are required, and period close/reporting views are active."
        : "Apply accounting controls, test reversal and close, then set ORVANTA_ACCOUNTING_CONTROLS_READY=true."
    ),
    check(
      "browser-e2e",
      "Desktop and iPhone E2E gate",
      enabled("ORVANTA_E2E_VERIFIED"),
      enabled("ORVANTA_E2E_VERIFIED")
        ? "Owner access, lock, navigation, and system status journeys pass in Chromium and iPhone emulation."
        : "The Browser E2E workflow must pass on main before ORVANTA_E2E_VERIFIED=true."
    ),
    check(
      "backup-restore",
      "Backup restore drill",
      enabled("ORVANTA_BACKUP_RESTORE_VERIFIED"),
      enabled("ORVANTA_BACKUP_RESTORE_VERIFIED")
        ? "A recent restore drill is recorded and core table verification passed."
        : "A backup existing is not enough. Complete a restore drill and record it before setting ORVANTA_BACKUP_RESTORE_VERIFIED=true."
    ),
    check(
      "api-secret",
      "Internal API secret",
      Boolean(process.env.API_SECRET_KEY),
      process.env.API_SECRET_KEY
        ? "API_SECRET_KEY is configured for trusted system calls."
        : personalMode
          ? "API_SECRET_KEY is optional in personal mode; owner cookies and CRON_SECRET protect the active surfaces."
          : "API_SECRET_KEY is missing. Add it before exposing internal automation endpoints.",
      !personalMode
    ),
    check(
      "cron-secret",
      "Scheduler authentication",
      Boolean(process.env.CRON_SECRET),
      process.env.CRON_SECRET
        ? "CRON_SECRET is configured for workflow, watchdog, recovery, and outbox workers."
        : "CRON_SECRET is missing. Background workers cannot be securely invoked."
    ),
    check(
      "openai-key",
      "LLM execution",
      Boolean(process.env.OPENAI_API_KEY),
      process.env.OPENAI_API_KEY
        ? "OPENAI_API_KEY is configured. Agents can use LLM reports."
        : "OPENAI_API_KEY is missing. The system will fall back to deterministic reports.",
      false
    ),
    check(
      "public-anon-write-fallback-disabled",
      "No public anon server write fallback",
      !hasPublicAnonServerWriteFallback,
      hasPublicAnonServerWriteFallback
        ? "Anon keys are present in env. They are ignored by server persistence and must never write governance or finance tables."
        : "No anon write fallback is configured for server persistence.",
      false
    ),
    googleWorkspaceCheck,
  ];

  return {
    okForProduction: checks.every((item) => item.severity !== "FAIL"),
    mode,
    accessMode: personalMode ? "personal" : "commercial",
    checks,
  };
}
