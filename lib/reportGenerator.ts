import { calculateFinancials } from "./accountingSystem";
import { evaluateBusiness } from "./businessBrain";
import { getSupabaseAdmin } from "./supabase";
import { analyzeDecisionPatterns } from "./agentMemory";

export type ReportType = "DAILY" | "WEEKLY" | "MONTHLY";

export type ExecutiveReport = {
  type: ReportType;
  generatedAt: string;
  financialSummary: {
    income: number;
    expenses: number;
    profit: number;
    profitMargin: number;
    healthScore: number;
  };
  operationalSummary: {
    totalTasks: number;
    completedTasks: number;
    blockedTasks: number;
    completionRate: number;
  };
  alertsSummary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  decisionPatterns: Array<{
    pattern: string;
    successRate: number;
    totalDecisions: number;
  }>;
  recommendations: string[];
  kpiHighlights: Array<{
    name: string;
    target: number;
    current: number;
    unit: string;
    status: string;
  }>;
};

export async function generateExecutiveReport(type: ReportType = "DAILY"): Promise<ExecutiveReport> {
  const financials = await calculateFinancials();
  const intelligence = evaluateBusiness("تقرير تنفيذي", financials);
  const patterns = await analyzeDecisionPatterns();

  const operationalSummary = await getOperationalSummary(type);
  const alertsSummary = await getAlertsSummary(type);
  const kpiHighlights = await getKpiHighlights();

  const recommendations: string[] = [];
  if (intelligence.profitMargin < 0.1) {
    recommendations.push("هامش الربح منخفض - يجب مراجعة التسعير أو خفض التكاليف");
  }
  if (intelligence.expenseRatio > 0.7) {
    recommendations.push("نسبة المصاريف مرتفعة - يُنصح بمراجعة بنود الصرف غير الضرورية");
  }
  if (operationalSummary.blockedTasks > 0) {
    recommendations.push(`يوجد ${operationalSummary.blockedTasks} مهام معطلة تحتاج تدخل فوري`);
  }
  if (operationalSummary.completionRate < 50) {
    recommendations.push("معدل إنجاز المهام منخفض - يجب مراجعة توزيع الأعباء والأولويات");
  }
  if (alertsSummary.critical > 0) {
    recommendations.push(`يوجد ${alertsSummary.critical} تنبيهات حرجة تحتاج اهتمام فوري`);
  }
  if (recommendations.length === 0) {
    recommendations.push("الأداء العام جيد - استمر في المراقبة الدورية");
  }

  return {
    type,
    generatedAt: new Date().toISOString(),
    financialSummary: {
      income: financials.income,
      expenses: financials.expenses,
      profit: financials.profit,
      profitMargin: intelligence.profitMargin,
      healthScore: intelligence.healthScore,
    },
    operationalSummary,
    alertsSummary,
    decisionPatterns: patterns.map((p) => ({
      pattern: p.pattern,
      successRate: p.successRate,
      totalDecisions: p.totalDecisions,
    })),
    recommendations,
    kpiHighlights,
  };
}

async function getOperationalSummary(type: ReportType) {
  const supabase = getSupabaseAdmin();
  const defaults = { totalTasks: 0, completedTasks: 0, blockedTasks: 0, completionRate: 0 };
  if (!supabase) return defaults;

  const daysBack = type === "DAILY" ? 1 : type === "WEEKLY" ? 7 : 30;
  const since = new Date(Date.now() - daysBack * 86400000).toISOString();

  const { data, error } = await supabase
    .from("tasks")
    .select("status")
    .gte("created_at", since);

  if (error || !data) return defaults;

  const total = data.length;
  const completed = data.filter((t) => t.status === "DONE").length;
  const blocked = data.filter((t) => t.status === "BLOCKED").length;

  return {
    totalTasks: total,
    completedTasks: completed,
    blockedTasks: blocked,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

async function getAlertsSummary(type: ReportType) {
  const supabase = getSupabaseAdmin();
  const defaults = { critical: 0, high: 0, medium: 0, low: 0 };
  if (!supabase) return defaults;

  const daysBack = type === "DAILY" ? 1 : type === "WEEKLY" ? 7 : 30;
  const since = new Date(Date.now() - daysBack * 86400000).toISOString();

  const { data, error } = await supabase
    .from("business_alerts")
    .select("severity")
    .gte("created_at", since);

  if (error || !data) return defaults;

  return {
    critical: data.filter((a) => a.severity === "CRITICAL").length,
    high: data.filter((a) => a.severity === "HIGH").length,
    medium: data.filter((a) => a.severity === "MEDIUM").length,
    low: data.filter((a) => a.severity === "LOW").length,
  };
}

async function getKpiHighlights() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("business_kpis")
    .select("name, target, current, unit, status")
    .order("created_at", { ascending: false })
    .limit(6);

  if (error || !data) return [];
  return data.map((k) => ({
    name: k.name,
    target: k.target,
    current: k.current || 0,
    unit: k.unit,
    status: k.status,
  }));
}

export function formatReportAsText(report: ExecutiveReport): string {
  const typeLabel = report.type === "DAILY" ? "يومي" : report.type === "WEEKLY" ? "أسبوعي" : "شهري";
  const lines: string[] = [
    `📊 التقرير التنفيذي ${typeLabel}`,
    `التاريخ: ${new Date(report.generatedAt).toLocaleDateString("ar-SA")}`,
    "",
    "━━ الملخص المالي ━━",
    `الإيرادات: ${report.financialSummary.income.toLocaleString("ar-SA")} ريال`,
    `المصروفات: ${report.financialSummary.expenses.toLocaleString("ar-SA")} ريال`,
    `صافي الربح: ${report.financialSummary.profit.toLocaleString("ar-SA")} ريال`,
    `مؤشر الصحة: ${report.financialSummary.healthScore}%`,
    "",
    "━━ الملخص التشغيلي ━━",
    `إجمالي المهام: ${report.operationalSummary.totalTasks}`,
    `المنجزة: ${report.operationalSummary.completedTasks}`,
    `المعطلة: ${report.operationalSummary.blockedTasks}`,
    `نسبة الإنجاز: ${report.operationalSummary.completionRate}%`,
    "",
    "━━ التنبيهات ━━",
    `حرجة: ${report.alertsSummary.critical} | عالية: ${report.alertsSummary.high} | متوسطة: ${report.alertsSummary.medium} | منخفضة: ${report.alertsSummary.low}`,
    "",
    "━━ التوصيات ━━",
    ...report.recommendations.map((r, i) => `${i + 1}. ${r}`),
  ];

  return lines.join("\n");
}
