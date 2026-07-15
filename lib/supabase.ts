import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { withTenant, isMultiTenantEnabled, getTenantId } from "./tenant";

let adminClient: SupabaseClient | null = null;

function supabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
}

function supabaseServerKey() {
  // Supabase's current server-key name is SUPABASE_SECRET_KEY. Keep the
  // legacy service-role alias so existing deployments continue to work.
  return process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
}

export type SupabaseEnvironmentReadiness = {
  configured: boolean;
  hasUrl: boolean;
  hasServerKey: boolean;
  keySource: "SUPABASE_SECRET_KEY" | "SUPABASE_SERVICE_ROLE_KEY" | null;
  missingEnvironmentVariables: string[];
};

/** Safe configuration diagnostics. Never returns a URL or secret value. */
export function getSupabaseEnvironmentReadiness(): SupabaseEnvironmentReadiness {
  const hasUrl = Boolean(supabaseUrl());
  const keySource = process.env.SUPABASE_SECRET_KEY?.trim()
    ? "SUPABASE_SECRET_KEY"
    : process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
      ? "SUPABASE_SERVICE_ROLE_KEY"
      : null;
  const hasServerKey = Boolean(keySource);
  const missingEnvironmentVariables: string[] = [];

  if (!hasUrl) missingEnvironmentVariables.push("NEXT_PUBLIC_SUPABASE_URL (أو SUPABASE_URL)");
  if (!hasServerKey) missingEnvironmentVariables.push("SUPABASE_SECRET_KEY (أو SUPABASE_SERVICE_ROLE_KEY)");

  return {
    configured: hasUrl && hasServerKey,
    hasUrl,
    hasServerKey,
    keySource,
    missingEnvironmentVariables,
  };
}

export function hasSupabaseEnv() {
  return getSupabaseEnvironmentReadiness().configured;
}

export function requireSupabaseForWrite() {
  if (!hasSupabaseEnv()) {
    throw new Error("النظام في وضع القراءة فقط: لا يمكن تنفيذ قرارات أو إنشاء مشاريع بدون اتصال Supabase ومفتاح الخدمة الخلفي.");
  }
}

export function getSupabaseAdmin() {
  const url = supabaseUrl();
  const key = supabaseServerKey();
  if (!url || !key) return null;
  if (!adminClient) {
    adminClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return adminClient;
}

const SENSITIVE_FIELD = /(password|secret|token|authorization|cookie|otp|code_verifier|session)/i;

function sanitizeForFailureLog(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeForFailureLog(item, depth + 1));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE_FIELD.test(key) ? "[REDACTED]" : sanitizeForFailureLog(item, depth + 1);
    }
    return output;
  }
  if (typeof value === "string" && value.length > 4000) return `${value.slice(0, 4000)}…`;
  return value;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message || error);
  return String(error);
}

async function recordFailedWrite(input: {
  table: string;
  operation: string;
  row: Record<string, unknown>;
  error: unknown;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase || input.table === "failed_writes") return;

  const message = errorMessage(input.error).slice(0, 2000);
  try {
    const { error } = await supabase.from("failed_writes").insert({
      tenant_id: getTenantId(),
      table_name: input.table,
      operation: input.operation,
      payload: sanitizeForFailureLog(input.row),
      error_message: message,
      status: "PENDING",
      attempts: 1,
    });
    if (error) {
      console.error("[orvanta:persistence] failed to record failed write", {
        table: input.table,
        originalError: message,
        recorderError: error.message,
      });
    }
  } catch (recorderError) {
    console.error("[orvanta:persistence] failed write recorder unavailable", {
      table: input.table,
      originalError: message,
      recorderError: errorMessage(recorderError),
    });
  }
}

async function executePersist(table: string, row: Record<string, unknown>, onConflict = "id") {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured for durable writes.");

  const durableRow = withTenant(row);
  try {
    const { error } = await supabase.from(table).upsert(durableRow, { onConflict });
    if (error) throw error;
  } catch (error) {
    await recordFailedWrite({ table, operation: "UPSERT", row: durableRow, error });
    throw error;
  }
}

/**
 * Compatibility helper for synchronous in-memory modules.
 *
 * The write is retained by Next.js `after()` on Vercel, but failures are no
 * longer swallowed: they are logged and copied to `failed_writes` for replay.
 * New financial, approval, identity and contract code should use
 * `persistCritical()` or a transactional repository/RPC instead.
 */
export function persist(table: string, row: Record<string, unknown>, onConflict = "id"): void {
  if (!hasSupabaseEnv()) return;

  const write = executePersist(table, row, onConflict).catch((error) => {
    console.error("[orvanta:persistence] asynchronous write failed", {
      table,
      error: errorMessage(error),
    });
  });

  try {
    after(write);
  } catch {
    void write;
  }
}

/** Awaited durable write for state that must not report success before commit. */
export async function persistCritical(
  table: string,
  row: Record<string, unknown>,
  onConflict = "id"
): Promise<void> {
  requireSupabaseForWrite();
  await executePersist(table, row, onConflict);
}

/** Load rows from a table (newest-first by default); [] on failure.
 * With multi-tenancy enabled, only this tenant's rows are read. */
export async function fetchRows(
  table: string,
  opts: { orderBy?: string; ascending?: boolean; limit?: number } = {}
): Promise<Record<string, unknown>[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  try {
    let query = supabase.from(table).select("*");
    if (isMultiTenantEnabled()) query = query.eq("tenant_id", getTenantId());
    if (opts.orderBy) query = query.order(opts.orderBy, { ascending: opts.ascending ?? false });
    if (opts.limit) query = query.limit(opts.limit);
    const { data, error } = await query;
    if (error) {
      console.error("[orvanta:persistence] read failed", { table, error: error.message });
      return [];
    }
    return (data || []) as Record<string, unknown>[];
  } catch (error) {
    console.error("[orvanta:persistence] read threw", { table, error: errorMessage(error) });
    return [];
  }
}

/**
 * Wrap an async hydration routine so it runs at most once per process and
 * concurrent callers share the same in-flight promise. On failure it stays
 * un-hydrated so a later read can retry.
 */
export function hydrateOnce(fn: () => Promise<void>): () => Promise<void> {
  let done = false;
  let inflight: Promise<void> | null = null;
  return () => {
    if (done || !hasSupabaseEnv()) return Promise.resolve();
    if (inflight) return inflight;
    inflight = fn().then(
      () => {
        done = true;
        inflight = null;
      },
      (error) => {
        console.error("[orvanta:persistence] hydration failed", { error: errorMessage(error) });
        inflight = null;
      }
    );
    return inflight;
  };
}
