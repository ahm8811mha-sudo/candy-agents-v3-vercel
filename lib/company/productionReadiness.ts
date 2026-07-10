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
        ? "AUTH_ENABLED=true. Sensitive approval routes enforce role checks."
        : "AUTH_ENABLED is not true. Single-owner fallback is acceptable only for local/demo use."
    ),
    check(
      "supabase-service-role",
      "Durable server persistence",
      hasSupabaseEnv() && hasServiceRole,
      hasServiceRole
        ? "SUPABASE_SERVICE_ROLE_KEY is configured for server-only writes."
        : "SUPABASE_SERVICE_ROLE_KEY is missing. Projects, approvals, audit, actions, and ledger cannot be durable."
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
        ? "Anon keys are present in env. They are ignored by server persistence, but should not be used for sensitive tables."
        : "No anon write fallback is configured for server persistence.",
      false
    ),
    check(
      "api-secret",
      "Internal API secret",
      Boolean(process.env.API_SECRET_KEY),
      process.env.API_SECRET_KEY
        ? "API_SECRET_KEY is configured for trusted system calls."
        : "API_SECRET_KEY is missing. Add it before exposing internal automation endpoints.",
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
