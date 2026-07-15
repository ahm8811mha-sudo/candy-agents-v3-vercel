import { NextResponse } from "next/server";
import { getSupabaseAdmin, hasSupabaseEnv } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const BUILD_MARKER = "production-readiness-v2";

function connectedHost(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  try {
    return url ? new URL(url).host : null;
  } catch {
    return url || null;
  }
}

/** Read-only reachability and row-count probe for authoritative core tables. */
const TABLES = [
  "company_decisions",
  "company_approvals",
  "company_events",
  "event_outbox",
  "workflow_instances",
  "workflow_steps",
  "accounting_accounts",
  "accounting_journal_entries",
  "accounting_journal_lines",
  "accounting_periods",
  "gov_documents",
  "gov_document_extractions",
  "cron_runs",
  "system_alerts",
  "failed_writes",
  "dead_letter_jobs",
  "integration_attempts",
  "external_receipts",
  "capability_registry",
  "readiness_evidence",
];

export async function GET() {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({
      ok: false,
      build: BUILD_MARKER,
      configured: false,
      message: "Supabase غير مهيأ. النسخة في وضع قراءة محدود ولا يجوز اعتبار الكتابات أو التنفيذ دائمًا.",
    }, { status: 503 });
  }

  const supabase = getSupabaseAdmin()!;
  const tables: Record<string, { ok: boolean; count?: number; error?: string; code?: string }> = {};
  for (const table of TABLES) {
    try {
      const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
      tables[table] = error
        ? { ok: false, error: error.message, code: error.code }
        : { ok: true, count: count ?? 0 };
    } catch (error) {
      tables[table] = { ok: false, error: error instanceof Error ? error.message : "unknown" };
    }
  }

  const allOk = Object.values(tables).every((result) => result.ok);
  return NextResponse.json({
    ok: allOk,
    build: BUILD_MARKER,
    configured: true,
    projectHost: connectedHost(),
    message: allOk
      ? "Supabase متصل وجداول النواة والاعتمادية والمحاسبة قابلة للوصول."
      : "Supabase متصل لكن جدولًا جوهريًا واحدًا أو أكثر غير جاهز. راجع سلسلة supabase/migrations.",
    tables,
  }, { status: allOk ? 200 : 503 });
}
