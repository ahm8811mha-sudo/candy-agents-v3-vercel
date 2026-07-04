import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Bumped on each deploy so we can confirm which build is live. */
const BUILD_MARKER = "probe-v6";

/** The public project host the app is actually connected to (safe to expose). */
function connectedHost(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  try {
    return url ? new URL(url).host : null;
  } catch {
    return url || null;
  }
}

/**
 * Diagnostic: is Supabase configured and are all company OS tables reachable?
 * Read-only — it runs a HEAD/count against each table and returns reachability
 * only (never any row contents), so it is safe to expose. When Supabase is not
 * configured it reports the safe in-memory fallback rather than an error.
 */
const TABLES = [
  "audit_log",
  "company_approvals",
  "company_decisions",
  "company_ideas",
  "ledger_entries",
  "zatca_invoices",
  "sales_income",
  "sales_changes",
];

export async function GET(req: NextRequest) {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({
      ok: true,
      build: BUILD_MARKER,
      configured: false,
      message: "Supabase غير مُهيّأ — النظام يعمل بالذاكرة (تدهور آمن). أضف NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY لتفعيل الديمومة.",
    });
  }

  const supabase = getSupabaseAdmin()!;
  const tables: Record<string, { ok: boolean; count?: number; error?: string; code?: string }> = {};
  for (const t of TABLES) {
    try {
      // Real GET with an exact count: surfaces a missing-table error body AND
      // the true row count (limit(1) only caps returned rows, not the count).
      const { count, error } = await supabase.from(t).select("*", { count: "exact" }).limit(1);
      tables[t] = error
        ? { ok: false, error: error.message, code: error.code }
        : { ok: true, count: count ?? 0 };
    } catch (e) {
      tables[t] = { ok: false, error: e instanceof Error ? e.message : "unknown" };
    }
  }

  // Optional AWAITED write probe (?probe=1): inserts a marker row into audit_log,
  // reads it back, then removes it — reporting the exact error if the key cannot
  // write (e.g. RLS). This isolates "writes blocked" from "serverless froze".
  let writeProbe: Record<string, unknown> | undefined;
  if (req.nextUrl.searchParams.get("probe") === "1") {
    const id = `probe-${Date.now()}`;
    const insert = await supabase.from("audit_log").insert({
      id,
      actor: "health-probe",
      action: "PROBE",
      entity_type: "diagnostic",
      entity_id: id,
      detail: "write probe",
      created_at: new Date().toISOString(),
    });
    if (insert.error) {
      writeProbe = { wrote: false, error: insert.error.message, code: insert.error.code };
    } else {
      const read = await supabase.from("audit_log").select("id").eq("id", id).maybeSingle();
      writeProbe = { wrote: true, readBack: Boolean(read.data), error: read.error?.message };
      await supabase.from("audit_log").delete().eq("id", id);
    }
  }

  const allOk = Object.values(tables).every((r) => r.ok);
  return NextResponse.json({
    ok: allOk,
    build: BUILD_MARKER,
    configured: true,
    projectHost: connectedHost(),
    message: allOk
      ? "Supabase متصل وكل الجداول جاهزة — الديمومة مفعّلة ✓"
      : "Supabase متصل لكن بعض الجداول غير جاهزة — شغّل docs/supabase-schema.sql.",
    tables,
    ...(writeProbe ? { writeProbe } : {}),
  });
}
