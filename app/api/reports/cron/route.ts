import { NextResponse } from "next/server";
import { generateExecutiveReport, formatReportAsText } from "@/lib/reportGenerator";
import { triggerNotification } from "@/lib/integrations";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    const report = await generateExecutiveReport("DAILY");
    const text = formatReportAsText(report);

    await triggerNotification("WEBHOOK", text);

    const supabase = getSupabaseAdmin();
    if (supabase) {
      await supabase.from("activity_logs").insert({
        id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        actor_id: "system",
        action: "DAILY_REPORT_GENERATED",
        entity_type: "report",
        metadata: {
          type: "DAILY",
          healthScore: report.financialSummary.healthScore,
          profit: report.financialSummary.profit,
          totalTasks: report.operationalSummary.totalTasks,
          completionRate: report.operationalSummary.completionRate,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      message: "تم إنشاء وإرسال التقرير اليومي",
      report,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "تعذر إنشاء التقرير" },
      { status: 500 }
    );
  }
}
