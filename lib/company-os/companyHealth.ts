import { getSupabaseAdmin } from "../supabase";
import { getTelemetrySummary } from "./telemetry";

export type HealthDimension = {
  id: string;
  label: string;
  score: number;
  status: "HEALTHY" | "WATCH" | "AT_RISK" | "CRITICAL";
  signals: string[];
};

function statusForScore(score: number): HealthDimension["status"] {
  if (score >= 85) return "HEALTHY";
  if (score >= 70) return "WATCH";
  if (score >= 45) return "AT_RISK";
  return "CRITICAL";
}

function dimension(id: string, label: string, score: number, signals: string[]): HealthDimension {
  const normalized = Math.max(0, Math.min(100, Math.round(score)));
  return { id, label, score: normalized, status: statusForScore(normalized), signals };
}

export async function getCompanyHealth(tenantId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { configured: false, score: 0, status: "CRITICAL" as const, dimensions: [], generatedAt: new Date().toISOString() };
  }

  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const [
    workflows,
    outbox,
    reconciliations,
    risks,
    commitments,
    projects,
    telemetry,
  ] = await Promise.all([
    supabase.from("workflow_instances").select("status").eq("tenant_id", tenantId).gte("created_at", since).limit(5000),
    supabase.from("event_outbox").select("status").eq("tenant_id", tenantId).gte("created_at", since).limit(5000),
    supabase.from("execution_reconciliations").select("status").eq("tenant_id", tenantId).gte("created_at", since).limit(5000),
    supabase.from("risk_register").select("level,status").eq("tenant_id", tenantId).eq("status", "OPEN").limit(5000),
    supabase.from("budget_commitments").select("amount_sar,status").eq("tenant_id", tenantId).limit(5000),
    supabase.from("projects").select("status,health_score,risk_level").eq("tenant_id", tenantId).limit(5000),
    getTelemetrySummary(tenantId, 24),
  ]);

  const workflowRows = workflows.data || [];
  const workflowFailures = workflowRows.filter((item) => item.status === "FAILED").length;
  const workflowCompleted = workflowRows.filter((item) => item.status === "COMPLETED").length;
  const workflowTotal = workflowRows.length;
  const workflowScore = workflowTotal === 0 ? 80 : 100 - (workflowFailures / workflowTotal) * 100;

  const outboxRows = outbox.data || [];
  const deadLetters = outboxRows.filter((item) => item.status === "DEAD_LETTER").length;
  const retries = outboxRows.filter((item) => item.status === "RETRY").length;
  const integrationScore = Math.max(0, 100 - deadLetters * 25 - retries * 5);

  const reconciliationRows = reconciliations.data || [];
  const exceptions = reconciliationRows.filter((item) => item.status === "EXCEPTION").length;
  const reconciliationScore = reconciliationRows.length === 0 ? 80 : 100 - (exceptions / reconciliationRows.length) * 100;

  const riskRows = risks.data || [];
  const criticalRisks = riskRows.filter((item) => item.level === "CRITICAL").length;
  const highRisks = riskRows.filter((item) => item.level === "HIGH").length;
  const riskScore = Math.max(0, 100 - criticalRisks * 30 - highRisks * 12 - Math.max(0, riskRows.length - criticalRisks - highRisks) * 2);

  const commitmentRows = commitments.data || [];
  const reserved = commitmentRows.filter((item) => item.status === "RESERVED").reduce((sum, item) => sum + Number(item.amount_sar || 0), 0);
  const financialScore = Math.max(30, Math.min(100, reconciliationScore));

  const projectRows = projects.data || [];
  const projectScores = projectRows.map((item) => Number(item.health_score || 0)).filter((value) => value > 0);
  const projectScore = projectScores.length ? projectScores.reduce((sum, value) => sum + value, 0) / projectScores.length : 80;

  const reliabilityScore = Math.max(0, 100 - telemetry.errors * 5 - Math.max(0, telemetry.avgDurationMs - 1000) / 100);

  const dimensions = [
    dimension("workflows", "صحة التنفيذ", workflowScore, [
      `${workflowCompleted} workflow مكتمل خلال 24 ساعة`,
      `${workflowFailures} workflow فاشل`,
    ]),
    dimension("integrations", "صحة التكاملات", integrationScore, [
      `${deadLetters} رسالة في Dead Letter`,
      `${retries} عملية إعادة محاولة`,
    ]),
    dimension("finance", "الصحة المالية والرقابية", financialScore, [
      `${reserved.toLocaleString("en-US")} SAR التزامات محجوزة`,
      `${exceptions} استثناء تسوية`,
    ]),
    dimension("risk", "صحة المخاطر", riskScore, [
      `${criticalRisks} مخاطر حرجة مفتوحة`,
      `${highRisks} مخاطر مرتفعة مفتوحة`,
    ]),
    dimension("projects", "صحة المحفظة", projectScore, [`${projectRows.length} مشروع مسجل`]),
    dimension("platform", "صحة المنصة", reliabilityScore, [
      `${telemetry.operations} عملية مرصودة`,
      `${telemetry.errors} خطأ`,
      `${telemetry.avgDurationMs}ms متوسط زمن`,
      `$${telemetry.aiCostUSD} تكلفة AI خلال 24 ساعة`,
    ]),
  ];

  const score = Math.round(dimensions.reduce((sum, item) => sum + item.score, 0) / dimensions.length);
  return {
    configured: true,
    tenantId,
    score,
    status: statusForScore(score),
    dimensions,
    generatedAt: new Date().toISOString(),
  };
}
