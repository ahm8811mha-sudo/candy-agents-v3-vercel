import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const rid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const n = (v: unknown, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

function riskSettings(risk: string) {
  if (risk === "LOW") return { score: 3, factor: 1.35, text: "اختبار محدود ومخزون منخفض" };
  if (risk === "HIGH") return { score: 8, factor: 2.1, text: "توسع مشروط على مراحل" };
  return { score: 5, factor: 1.6, text: "تجربة متوسطة لمدة 14 إلى 30 يومًا" };
}

function calcRoi(cost: number, revenue: number) {
  if (!cost) return 0;
  return Math.round(((revenue - cost) / cost) * 100);
}

export async function POST(req: Request) {
  const body = await req.json();
  const budget = Math.max(n(body.budget, 10000), 1000);
  const riskProfile = String(body.riskProfile || "MEDIUM").toUpperCase();
  const goals = String(body.goals || "اختبار فرصة تجارية");
  const market = String(body.market || "التجزئة والتجارة الإلكترونية");
  const risk = riskSettings(riskProfile);
  const strategyId = rid("strategy");
  const reportId = rid("market");

  const opportunities = [
    { title: `اختبار منتج في سوق ${market}`, category: "ECOMMERCE_TEST", cost: Math.round(budget * 0.3), revenue: Math.round(budget * 0.3 * risk.factor), risk: riskProfile },
    { title: `تجربة توريد محدود لسوق ${market}`, category: "RETAIL_SUPPLY", cost: Math.round(budget * 0.2), revenue: Math.round(budget * 0.2 * 1.45), risk: riskProfile === "HIGH" ? "MEDIUM" : "LOW" },
    { title: "تشغيل حملة بفريلانسرز بدون توظيف دائم", category: "FREELANCER_OPERATION", cost: Math.round(budget * 0.1), revenue: Math.round(budget * 0.1 * 1.3), risk: "LOW" },
  ].map((o) => ({ ...o, roi: calcRoi(o.cost, o.revenue) })).sort((a, b) => b.roi - a.roi);

  const top = opportunities[0];
  const marketSummary = `تحليل ${market}: أفضل أسلوب هو ${risk.text}. الهدف: ${goals}.`;
  const decision = `ابدأ بـ ${top.title} بتكلفة ${top.cost} وعائد متوقع ${top.revenue} و ROI ${top.roi}%.`;
  const plan = `1. اختبار عرض أولي.\n2. تخصيص ميزانية ${top.cost}.\n3. تكليف فريلانسر للتصميم والتسويق.\n4. قياس النتائج خلال 14 يومًا.\n5. التوسع فقط عند تحقق مؤشرات الطلب.`;

  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase.from("strategies").insert({ id: strategyId, name: `استراتيجية ${market}`, budget, risk_profile: riskProfile, goals, market, status: "ACTIVE" });
    await supabase.from("market_reports").insert({ id: reportId, strategy_id: strategyId, agent_id: "market-analyst-agent", market_name: market, summary: marketSummary, trend_score: 7, demand_score: 7, competition_score: 6, risk_score: risk.score });
    let topId = "";
    for (const item of opportunities) {
      const oid = rid("opp");
      if (!topId) topId = oid;
      await supabase.from("opportunities").insert({ id: oid, strategy_id: strategyId, market_report_id: reportId, title: item.title, description: item.category, category: item.category, estimated_cost: item.cost, expected_revenue: item.revenue, expected_roi: item.roi, risk_level: item.risk, status: item.title === top.title ? "RECOMMENDED" : "NEW" });
    }
    await supabase.from("decisions").insert({ id: rid("decision"), opportunity_id: topId, recommendation: decision, rationale: plan, decision_status: "PENDING" });
    await supabase.from("financial_transactions").insert({ id: rid("fin"), opportunity_id: topId, type: "BUDGET", amount: budget, description: "ميزانية التحليل والاختبار", status: "APPROVED" });
    await supabase.from("freelancer_assignments").insert({ id: rid("free"), opportunity_id: topId, role_needed: "مصمم ومسوق أداء", brief: `تنفيذ اختبار للسوق: ${top.title}`, budget: Math.round(top.cost * 0.25), status: "DRAFT" });
    await supabase.from("agent_runs").insert({ id: rid("run"), agent_name: "business-orchestrator", input: JSON.stringify({ budget, riskProfile, goals, market }), output: JSON.stringify({ marketSummary, decision, plan }), status: "COMPLETED" });
    await supabase.from("inbox_items").insert({ id: rid("inbox"), request_text: goals, result_title: "تقرير ذكاء تجاري جاهز", result_content: `# تقرير ذكاء تجاري\n\n${marketSummary}\n\n## الفرصة الأفضل\n${top.title}\n\n## القرار\n${decision}\n\n## خطة التنفيذ\n${plan}`, assigned_agent: "business-orchestrator", department_id: "exec", status: "DELIVERED" });
  }

  return NextResponse.json({ ok: true, strategy: { strategyId, budget, riskProfile, goals, market }, marketSummary, opportunities, decision, plan });
}
