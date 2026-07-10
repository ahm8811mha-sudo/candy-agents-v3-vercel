import { hasSupabaseEnv } from "../supabase";
import { isAuthEnabled } from "../auth";
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

export function getProductionReadiness(): ProductionReadiness {
  const mode = process.env.NODE_ENV === "production" ? "production" : process.env.NODE_ENV === "test" ? "test" : "development";
  const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const hasPublicAnonServerWriteFallback = Boolean(process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const googleWorkspace = getGoogleWorkspaceStatus();
  const googleWorkspaceCheck = googleWorkspace.enabled
    ? check(
        "google-workspace",
        "Google Workspace execution",
        googleWorkspace.credentialsConfigured,
        googleWorkspace.credentialsConfigured
          ? "Google Workspace is enabled and OAuth credentials are configured for Gmail, Sheets, and Drive."
          : `Google Workspace is enabled but missing: ${googleWorkspace.missingEnvironmentVariables.join(", ")}`,
        true
      )
    : check(
        "google-workspace",
        "Google Workspace execution",
        false,
        "Google Workspace execution is disabled. External actions remain safely blocked until GOOGLE_INTEGRATIONS_ENABLED=true.",
        false
      );

  const checks: ReadinessCheck[] = [
    check(
      "auth-enabled",
      "Production authentication gate",
      isAuthEnabled(),
      isAuthEnabled()
        ? "AUTH_ENABLED=true. Sensitive routes require authenticated roles and tenant context."
        : "AUTH_ENABLED is not true. The development owner fallback is forbidden in production."
    ),
    check(
      "basic-auth-disabled",
      "No production Basic Auth",
      process.env.NODE_ENV === "production" || process.env.ALLOW_BASIC_AUTH !== "true",
      process.env.ALLOW_BASIC_AUTH === "true"
        ? "ALLOW_BASIC_AUTH=true is accepted only in local development and is ignored in production."
        : "Basic Auth is disabled. Supabase bearer sessions or trusted system credentials are required."
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
      process.env.ORVANTA_CORE_SCHEMA_READY === "true",
      process.env.ORVANTA_CORE_SCHEMA_READY === "true"
        ? "Core completion migration is confirmed as applied."
        : "Apply docs/supabase-core-completion.sql in staging and production, then set ORVANTA_CORE_SCHEMA_READY=true."
    ),
    check(
      "tenant-rls-ready",
      "Tenant claims and RLS",
      process.env.ORVANTA_MULTI_TENANT === "true" && process.env.ORVANTA_RLS_READY === "true",
      process.env.ORVANTA_RLS_READY === "true"
        ? "Tenant-scoped RLS is confirmed and cross-tenant tests can run."
        : "Set JWT app_metadata.tenant_id, enable ORVANTA_MULTI_TENANT, apply RLS policies, and set ORVANTA_RLS_READY=true."
    ),
    check(
      "workflow-runtime",
      "Durable workflow runtime",
      process.env.ORVANTA_WORKFLOW_RUNTIME_ENABLED === "true",
      process.env.ORVANTA_WORKFLOW_RUNTIME_ENABLED === "true"
        ? "Durable workflow instances, steps, retries, approvals, and restart recovery are enabled."
        : "ORVANTA_WORKFLOW_RUNTIME_ENABLED is not true. Long-running company workflows remain blocked."
    ),
    check(
      "outbox-publisher",
      "Transactional outbox publisher",
      process.env.ORVANTA_OUTBOX_ENABLED === "true" && Boolean(process.env.CRON_SECRET),
      process.env.ORVANTA_OUTBOX_ENABLED === "true" && process.env.CRON_SECRET
        ? "Outbox publishing and scheduler authentication are enabled."
        : "Enable ORVANTA_OUTBOX_ENABLED and configure CRON_SECRET before publishing external events."
    ),
    check(
      "reconciliation-required",
      "External receipt and reconciliation",
      process.env.ORVANTA_RECONCILIATION_REQUIRED === "true",
      process.env.ORVANTA_RECONCILIATION_REQUIRED === "true"
        ? "External actions cannot complete without evidence and reconciliation."
        : "Set ORVANTA_RECONCILIATION_REQUIRED=true after applying the reconciliation schema."
    ),
    check(
      "api-secret",
      "Internal API secret",
      Boolean(process.env.API_SECRET_KEY),
      process.env.API_SECRET_KEY
        ? "API_SECRET_KEY is configured for trusted system calls."
        : "API_SECRET_KEY is missing. Add it before exposing internal automation endpoints."
    ),
    check(
      "cron-secret",
      "Scheduler authentication",
      Boolean(process.env.CRON_SECRET),
      process.env.CRON_SECRET
        ? "CRON_SECRET is configured for workflow and outbox workers."
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
    checks,
  };
}
