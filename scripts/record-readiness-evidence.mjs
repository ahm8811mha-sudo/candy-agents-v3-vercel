import { createClient } from "@supabase/supabase-js";

function parseArgs(argv) {
  const result = { optional: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--optional") {
      result.optional = true;
      continue;
    }
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
    result[name] = value;
    index += 1;
  }
  return result;
}

function databaseConfiguration() {
  return {
    url:
      process.env.PRODUCTION_SUPABASE_URL?.trim()
      || process.env.SUPABASE_URL?.trim()
      || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    key:
      process.env.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY?.trim()
      || process.env.SUPABASE_SECRET_KEY?.trim()
      || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  };
}

const args = parseArgs(process.argv.slice(2));
const evidenceKey = String(args.key || "").trim();
const environment = String(args.environment || "production").trim();
const status = String(args.status || "PASS").trim().toUpperCase();
const expiresHours = Number(args["expires-hours"] || 0);

if (!evidenceKey) throw new Error("--key is required");
if (!new Set(["development", "staging", "production", "restore-drill"]).has(environment)) {
  throw new Error(`Unsupported evidence environment: ${environment}`);
}
if (!new Set(["PASS", "FAIL", "WARN"]).has(status)) {
  throw new Error(`Unsupported evidence status: ${status}`);
}
if (!Number.isFinite(expiresHours) || expiresHours < 0 || expiresHours > 24 * 365) {
  throw new Error("--expires-hours must be between 0 and 8760");
}

let details = {};
if (args.details) {
  details = JSON.parse(args.details);
  if (!details || Array.isArray(details) || typeof details !== "object") {
    throw new Error("--details must be a JSON object");
  }
}

const configuration = databaseConfiguration();
if (!configuration.url || !configuration.key) {
  const message = "Production Supabase evidence credentials are not configured.";
  if (args.optional) {
    console.log(JSON.stringify({ stored: false, optional: true, evidenceKey, reason: message }));
    process.exit(0);
  }
  throw new Error(message);
}

const supabase = createClient(configuration.url, configuration.key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const performedAt = new Date();
const row = {
  evidence_key: evidenceKey,
  environment,
  status,
  commit_sha: args.commit || process.env.GITHUB_SHA || null,
  details: {
    ...details,
    workflow: process.env.GITHUB_WORKFLOW || null,
    runId: process.env.GITHUB_RUN_ID || null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
  },
  performed_by: args.actor || process.env.GITHUB_ACTOR || "orvanta-release-verifier",
  performed_at: performedAt.toISOString(),
  expires_at: expiresHours > 0
    ? new Date(performedAt.getTime() + expiresHours * 60 * 60_000).toISOString()
    : null,
};

const { data, error } = await supabase
  .from("readiness_evidence")
  .insert(row)
  .select("id,evidence_key,environment,status,commit_sha,performed_at,expires_at")
  .single();
if (error) throw new Error(`Failed to store readiness evidence: ${error.message}`);

console.log(JSON.stringify({ stored: true, evidence: data }));
