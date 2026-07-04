import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";

let adminClient: SupabaseClient | null = null;

function supabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
}

function supabaseServerKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function hasSupabaseEnv() {
  return Boolean(supabaseUrl() && supabaseServerKey());
}

export function getSupabaseAdmin() {
  const url = supabaseUrl();
  const key = supabaseServerKey();
  if (!url || !key) return null;
  if (!adminClient) {
    adminClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

/**
 * Durable persistence helpers for the in-memory company OS modules.
 *
 * Design: the in-memory store stays the fast working copy; every write also
 * fire-and-forgets an upsert to Supabase (`persist`), and each module hydrates
 * its store once per process from Supabase on the first read (`hydrateOnce`).
 * All helpers are no-ops when Supabase is not configured, so the modules keep
 * their synchronous signatures and every existing test still passes unchanged.
 *
 * Security rule: server persistence requires SUPABASE_SERVICE_ROLE_KEY. The
 * public anon key is intentionally not accepted here because this module writes
 * governance, approvals, ledger, and audit data from server routes.
 */

/**
 * Non-blocking upsert; never throws into the caller. Keeps the store's sync
 * signatures while persisting durably.
 *
 * On Vercel the request function is frozen the moment the response is sent, so a
 * plain fire-and-forget promise would be killed before it reaches Supabase. We
 * hand the write to `after()` so the serverless runtime keeps the invocation
 * alive until the insert completes. Outside a request scope (long-running
 * server, scripts) `after()` throws, so we fall back to letting it float.
 */
export function persist(table: string, row: Record<string, unknown>, onConflict = "id"): void {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const write: Promise<void> = Promise.resolve(
    supabase.from(table).upsert(row, { onConflict })
  ).then(() => undefined, () => undefined);
  try {
    after(write);
  } catch {
    void write;
  }
}

/** Load rows from a table (newest-first by default); [] on any failure. */
export async function fetchRows(
  table: string,
  opts: { orderBy?: string; ascending?: boolean; limit?: number } = {}
): Promise<Record<string, unknown>[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  try {
    let query = supabase.from(table).select("*");
    if (opts.orderBy) query = query.order(opts.orderBy, { ascending: opts.ascending ?? false });
    if (opts.limit) query = query.limit(opts.limit);
    const { data, error } = await query;
    if (error || !data) return [];
    return data as Record<string, unknown>[];
  } catch {
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
      () => {
        inflight = null;
      }
    );
    return inflight;
  };
}
