import { NextRequest } from "next/server";
import { generateExecutiveReport, formatReportAsText } from "@/lib/reportGenerator";
import { triggerNotification } from "@/lib/integrations";
import { getSupabaseAdmin } from "@/lib/supabase";
import { executeTrackedCron } from "@/lib/operations/trackedCron";
import { raiseSystemAlert, resolveSystemAlert } from "@/lib/operations/systemAlerts";

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

      const [emailDelivery, webhookDelivery] = await Promise.all([
        triggerNotification("EMAIL", text, process.env.ORVANTA_OWNER_EMAIL).catch(() => ({ sent: false, channel: "EMAIL" as const })),
        triggerNotification("WEBHOOK", text).catch(() => ({ sent: false, channel: "WEBHOOK" as const })),
      ]);
      const delivered = emailDelivery.sent || webhookDelivery.sent;
      await heartbeat({
        phase: "notification-attempted",
        delivered,
        emailSent: emailDelivery.sent,
        webhookSent: webhookDelivery.sent,
      });

      const alertKey = "executive-report:not-delivered";
      if (delivered) {
        await resolveSystemAlert(context.tenantId, alertKey, "Executive report delivery recovered.");
      } else {
        await raiseSystemAlert({
          tenantId: context.tenantId,
          dedupeKey: alertKey,
          severity: "WARNING",
          source: "EXECUTIVE_REPORT",
          title: "لم يُسلّم التقرير التنفيذي اليومي",
          message: "تم إنشاء التقرير وحفظ سجله، لكن لم تنجح أي قناة إرسال فعلية.",
          entityType: "report",
          entityId: new Date().toISOString().slice(0, 10),
          metadata: { emailDelivery, webhookDelivery },
        });
      }

      const supabase = getSupabaseAdmin();
      if (!supabase) throw new Error("Supabase is required to persist executive report evidence.");
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
          delivered,
          emailDelivery,
          webhookDelivery,
        },
      });
      if (error) throw error;

      return {
        processedCount: 1,
        failedCount: delivered ? 0 : 1,
        details: {
          healthScore: report.financialSummary.healthScore,
          totalTasks: report.operationalSummary.totalTasks,
          completionRate: report.operationalSummary.completionRate,
          delivered,
          emailSent: emailDelivery.sent,
          webhookSent: webhookDelivery.sent,
        },
        body: {
          message: delivered
            ? "تم إنشاء التقرير اليومي وتسليمه عبر قناة فعلية."
            : "تم إنشاء التقرير اليومي وتسجيل عدم التسليم.",
          delivery: { email: emailDelivery, webhook: webhookDelivery },
          report,
        },
      };
    },
  });
}
