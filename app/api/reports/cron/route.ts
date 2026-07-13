import { NextRequest } from "next/server";
import { generateExecutiveReport, formatReportAsText } from "@/lib/reportGenerator";
import { triggerNotification } from "@/lib/integrations";
import { getSupabaseAdmin } from "@/lib/supabase";
import { executeTrackedCron } from "@/lib/operations/trackedCron";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return executeTrackedCron({
    req,
    jobName: "daily-executive-report",
    schedule: "20 6 * * *",
    timeoutMs: 55_000,
    run: async (context, heartbeat) => {
      const report = await generateExecutiveReport("DAILY");
      await heartbeat({ phase: "report-generated" });
      const text = formatReportAsText(report);
      await triggerNotification("WEBHOOK", text);
      await heartbeat({ phase: "notification-dispatched" });

      const supabase = getSupabaseAdmin();
      if (supabase) {
        const { error } = await supabase.from("activity_logs").insert({
          id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          tenant_id: context.tenantId,
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
        if (error) throw error;
      }

      return {
        processedCount: 1,
        details: {
          healthScore: report.financialSummary.healthScore,
          totalTasks: report.operationalSummary.totalTasks,
          completionRate: report.operationalSummary.completionRate,
        },
        body: { message: "تم إنشاء وإرسال التقرير اليومي", report },
      };
    },
  });
}
