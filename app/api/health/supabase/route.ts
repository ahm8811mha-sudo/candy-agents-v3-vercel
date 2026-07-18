import { NextResponse } from "next/server";
import { getSupabaseAdmin, getSupabaseEnvironmentReadiness, probeSupabaseConnection } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const BUILD_MARKER = "production-readiness-v4-auth-probe";

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
  const environment = getSupabaseEnvironmentReadiness();
  const connection = await probeSupabaseConnection();
  if (!connection.ready) {
    const message = connection.status === "AUTH_REJECTED"
      ? "Supabase رفض مفتاح الخادم. استبدل SUPABASE_SECRET_KEY بمفتاح Secret صالح للمشروع المرتبط في Vercel ثم أعد النشر."
      : connection.status === "PROJECT_MISMATCH"
        ? "عنوان مشروع Supabase ومفتاح الخادم لا يتبعان المشروع نفسه. تم إيقاف الكتابات حتى استبدال المفتاح في Vercel."
        : connection.status === "SCHEMA_UNAVAILABLE"
          ? "اتصال Supabase صالح لكن جدول الفحص الأساسي غير متاح. راجع سلسلة migrations."
          : connection.status === "UNAVAILABLE"
            ? "تعذر الوصول إلى Supabase مؤقتاً. لم تُنفذ فحوص الجداول لتجنب سيل طلبات فاشلة."
            : "Supabase غير مهيأ. النسخة في وضع قراءة محدود ولا يجوز اعتبار الكتابات أو التنفيذ دائمًا.";
    return NextResponse.json({
      ok: false,
      build: BUILD_MARKER,
      configured: environment.configured,
      connected: false,
      connectionStatus: connection.status,
      configurationIssue: environment.configurationIssue,
      message,
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
    connected: true,
    connectionStatus: "READY",
    projectHost: connectedHost(),
    message: allOk
      ? "Supabase متصل وجداول النواة والاعتمادية والمحاسبة قابلة للوصول."
      : "Supabase متصل لكن جدولًا جوهريًا واحدًا أو أكثر غير جاهز. راجع سلسلة supabase/migrations.",
    tables,
  }, { status: allOk ? 200 : 503 });
}
