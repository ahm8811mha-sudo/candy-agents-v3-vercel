import { NextResponse } from "next/server";
import { getSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase";

export const dynamic = "force-dynamic";

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

export async function GET() {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({
      ok: true,
      configured: false,
      message: "Supabase غير مُهيّأ — النظام يعمل بالذاكرة (تدهور آمن). أضف NEXT_PUBLIC_SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY لتفعيل الديمومة.",
    });
  }

  const supabase = getSupabaseAdmin()!;
  const tables: Record<string, { ok: boolean; count?: number; error?: string }> = {};
  for (const t of TABLES) {
    try {
      const { count, error } = await supabase.from(t).select("*", { head: true, count: "exact" });
      tables[t] = error ? { ok: false, error: error.message } : { ok: true, count: count ?? 0 };
    } catch (e) {
      tables[t] = { ok: false, error: e instanceof Error ? e.message : "unknown" };
    }
  }

  const allOk = Object.values(tables).every((r) => r.ok);
  return NextResponse.json({
    ok: allOk,
    configured: true,
    message: allOk
      ? "Supabase متصل وكل الجداول جاهزة — الديمومة مفعّلة ✓"
      : "Supabase متصل لكن بعض الجداول غير جاهزة — شغّل docs/supabase-schema.sql.",
    tables,
  });
}
