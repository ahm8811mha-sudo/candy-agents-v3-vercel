import { seedEnterpriseOperatingSystem } from "./enterpriseSystems";
import { seedGovernmentRelationsOS } from "./governmentRelations";
import { getSupabaseAdmin } from "./supabase";

type AlertRow = {
  alert_key: string;
  department: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  message: string;
  source_table?: string;
  source_id?: string;
  action_url?: string;
  due_date?: string | null;
  metadata?: Record<string, unknown>;
};

function requireSupabase() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function severityByDays(days: number | null): AlertRow["severity"] {
  if (days === null) return "MEDIUM";
  if (days < 0) return "CRITICAL";
  if (days <= 7) return "CRITICAL";
  if (days <= 30) return "HIGH";
  if (days <= 90) return "MEDIUM";
  return "LOW";
}

async function tableExists(table: string) {
  const supabase = requireSupabase();
  const result = await supabase.from(table).select("*").limit(1);
  return !result.error;
}

export async function generateOperationalAlerts() {
  await seedEnterpriseOperatingSystem();
  await seedGovernmentRelationsOS();
  const supabase = requireSupabase();
  const alerts: AlertRow[] = [];

  const [docs, invoices, campaigns, tasks, opportunities] = await Promise.all([
    supabase.from("gov_documents").select("*").limit(200),
    supabase.from("accounting_invoices").select("*").limit(200),
    supabase.from("marketing_campaigns").select("*").limit(200),
    supabase.from("tasks").select("*").limit(300),
    supabase.from("opportunity_radar_runs").select("*").limit(100),
  ]);

  for (const result of [docs, invoices, campaigns, tasks, opportunities]) {
    if (result.error) throw result.error;
  }

  for (const doc of docs.data || []) {
    const remaining = daysUntil(doc.expiry_date);
    if ((remaining !== null && remaining <= 90) || (doc.missing_fields || []).length > 0) {
      alerts.push({
        alert_key: `gov-doc-${doc.id}`,
        department: "government_relations",
        severity: severityByDays(remaining),
        title: `تجديد/مراجعة وثيقة: ${doc.title}`,
        message: `الحالة ${doc.status}. المتبقي ${remaining ?? "غير محدد"} يوم. الحقول الناقصة: ${(doc.missing_fields || []).join(", ") || "لا يوجد"}.`,
        source_table: "gov_documents",
        source_id: doc.id,
        action_url: "/departments/government-relations",
        due_date: doc.renewal_date || doc.expiry_date,
        metadata: { documentType: doc.document_type, issuer: doc.issuer },
      });
    }
  }

  for (const invoice of invoices.data || []) {
    const unpaid = number(invoice.total) - number(invoice.paid);
    const dueDays = daysUntil(invoice.due_date);
    if (unpaid > 0 && (dueDays === null || dueDays <= 14)) {
      alerts.push({
        alert_key: `invoice-${invoice.id}`,
        department: "finance",
        severity: invoice.invoice_type === "PURCHASE" ? "HIGH" : "MEDIUM",
        title: invoice.invoice_type === "PURCHASE" ? "فاتورة مورد مستحقة" : "ذمة مدينة تحتاج تحصيل",
        message: `المتبقي ${unpaid} ريال. موعد الاستحقاق ${invoice.due_date || "غير محدد"}.`,
        source_table: "accounting_invoices",
        source_id: invoice.id,
        action_url: "/departments/finance",
        due_date: invoice.due_date,
        metadata: { invoiceType: invoice.invoice_type, total: invoice.total, paid: invoice.paid },
      });
    }
  }

  for (const campaign of campaigns.data || []) {
    const spend = number(campaign.actual_spend);
    const revenue = number(campaign.actual_revenue);
    const roas = spend > 0 ? revenue / spend : 0;
    const target = number(campaign.kpis?.roas_target) || 1.3;
    if (spend > 0 && roas < target) {
      alerts.push({
        alert_key: `campaign-roas-${campaign.id}`,
        department: "marketing",
        severity: roas < 0.8 ? "HIGH" : "MEDIUM",
        title: `حملة تسويق دون الهدف: ${campaign.name}`,
        message: `ROAS الحالي ${roas.toFixed(2)}x مقابل هدف ${target}x. راجع الرسائل والميزانية أو أوقف الإنفاق.`,
        source_table: "marketing_campaigns",
        source_id: campaign.id,
        action_url: "/departments/marketing",
        metadata: { spend, revenue, roas, target },
      });
    }
  }

  for (const task of tasks.data || []) {
    const remaining = daysUntil(task.due_date);
    if (remaining !== null && remaining < 0 && !["DONE", "BLOCKED"].includes(task.status)) {
      alerts.push({
        alert_key: `late-task-${task.id}`,
        department: task.department_id || "executive",
        severity: task.priority === "URGENT" ? "CRITICAL" : "HIGH",
        title: `مهمة متأخرة: ${task.title || task.content}`,
        message: `المهمة متأخرة ${Math.abs(remaining)} يوم. المسؤول: ${task.owner_role || task.assigned_to || "غير محدد"}.`,
        source_table: "tasks",
        source_id: task.id,
        action_url: "/departments/executive",
        due_date: task.due_date,
        metadata: { status: task.status, priority: task.priority },
      });
    }
  }

  for (const run of opportunities.data || []) {
    if (run.status === "PROPOSED") {
      alerts.push({
        alert_key: `opportunity-${run.id}`,
        department: "executive",
        severity: run.ceo_required ? "HIGH" : "MEDIUM",
        title: "فرصة تحتاج قرار تنفيذي",
        message: run.signal_summary || "رادار الفرص أنشأ فرصة تحتاج مراجعة CEO/CFO.",
        source_table: "opportunity_radar_runs",
        source_id: run.id,
        action_url: "/enterprise-os",
        metadata: { recommendedOpportunity: run.recommended_opportunity },
      });
    }
  }

  if (await tableExists("inventory_items")) {
    const inventory = await supabase.from("inventory_items").select("*").limit(200);
    if (inventory.error) throw inventory.error;
    for (const item of inventory.data || []) {
      if (number(item.on_hand) <= number(item.reorder_point)) {
        alerts.push({
          alert_key: `inventory-low-${item.id}`,
          department: "procurement",
          severity: number(item.on_hand) <= 0 ? "CRITICAL" : "HIGH",
          title: `مخزون منخفض: ${item.name}`,
          message: `المتوفر ${item.on_hand}، حد إعادة الطلب ${item.reorder_point}.`,
          source_table: "inventory_items",
          source_id: item.id,
          action_url: "/departments/procurement",
          metadata: { sku: item.sku, onHand: item.on_hand, reorderPoint: item.reorder_point },
        });
      }
    }
  }

  if (await tableExists("crm_leads")) {
    const leads = await supabase.from("crm_leads").select("*").limit(200);
    if (leads.error) throw leads.error;
    for (const lead of leads.data || []) {
      const staleDays = daysUntil(lead.next_follow_up_at);
      if (!["WON", "LOST"].includes(lead.status) && (staleDays === null || staleDays < 0)) {
        alerts.push({
          alert_key: `crm-followup-${lead.id}`,
          department: "sales",
          severity: "MEDIUM",
          title: `متابعة عميل محتمل: ${lead.name}`,
          message: `المصدر ${lead.source || "غير محدد"} والمرحلة ${lead.status}. يحتاج متابعة مبيعات.`,
          source_table: "crm_leads",
          source_id: lead.id,
          action_url: "/departments/sales",
          due_date: lead.next_follow_up_at,
          metadata: { leadValue: lead.estimated_value, source: lead.source },
        });
      }
    }
  }

  if (!alerts.length) return { alerts: [], inserted: 0 };

  const { data, error } = await supabase
    .from("operational_alerts")
    .upsert(
      alerts.map((alert) => ({
        ...alert,
        status: "OPEN",
        last_seen_at: new Date().toISOString(),
      })),
      { onConflict: "alert_key" }
    )
    .select();
  if (error) throw error;

  await supabase.from("business_alerts").insert(
    alerts.slice(0, 25).map((alert) => ({
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      source: `alert_engine:${alert.department}`,
      status: "OPEN",
      metadata: alert.metadata || {},
    }))
  );

  return { alerts: data || [], inserted: data?.length || 0 };
}

export async function getOperationalAlerts() {
  const supabase = requireSupabase();
  const { data, error } = await supabase.from("operational_alerts").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  const alerts = data || [];
  return {
    alerts,
    metrics: {
      total: alerts.length,
      critical: alerts.filter((alert: any) => alert.severity === "CRITICAL").length,
      high: alerts.filter((alert: any) => alert.severity === "HIGH").length,
      open: alerts.filter((alert: any) => alert.status === "OPEN").length,
      departments: Array.from(new Set(alerts.map((alert: any) => alert.department))).length,
    },
  };
}

export async function updateOperationalAlert(id: string, status: string) {
  if (!id) throw new Error("Alert id is required.");
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("operational_alerts")
    .update({ status, resolved_at: status === "RESOLVED" ? new Date().toISOString() : null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
