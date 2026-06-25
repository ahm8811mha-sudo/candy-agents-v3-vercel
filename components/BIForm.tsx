"use client";

import { FormEvent, useState } from "react";
import { BarChart3, BrainCircuit, Loader2, Search, Target, TrendingUp } from "lucide-react";

type IntelligenceResult = {
  ok: boolean;
  marketSummary: string;
  opportunities: Array<{
    title: string;
    category: string;
    cost: number;
    revenue: number;
    roi: number;
    risk: string;
  }>;
  decision: string;
  plan: string;
};

const currency = new Intl.NumberFormat("ar-SA", {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 0,
});

export default function BIForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<IntelligenceResult | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    const form = new FormData(event.currentTarget);
    try {
      const res = await fetch("/api/intelligence/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market: form.get("market"),
          budget: Number(form.get("budget")),
          riskProfile: form.get("riskProfile"),
          goals: form.get("goals"),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تشغيل تحليل السوق.");
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تشغيل تحليل السوق.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="intelligence" className="delivery-panel intelligence-panel">
      <div className="delivery-header">
        <div>
          <span className="eyebrow">
            <BrainCircuit size={16} /> مركز تحليل السوق والفرص
          </span>
          <h2>اختبر الفكرة قبل الصرف</h2>
        </div>
        <span className={`status-pill ${result ? "done" : loading ? "running" : ""}`}>
          {loading ? "قيد التحليل" : result ? "تم تسليم التقرير" : "جاهز للتشغيل"}
        </span>
      </div>

      <div className="intelligence-grid">
        <form className="intelligence-form" onSubmit={submit}>
          <label>
            السوق
            <input className="input" name="market" defaultValue="منتجات العناية والهدايا في السعودية" required />
          </label>
          <div className="compact-grid">
            <label>
              الميزانية
              <input className="input" name="budget" type="number" min="1000" defaultValue="50000" required />
            </label>
            <label>
              المخاطر
              <select className="input" name="riskProfile" defaultValue="MEDIUM">
                <option value="LOW">منخفضة</option>
                <option value="MEDIUM">متوسطة</option>
                <option value="HIGH">مرتفعة</option>
              </select>
            </label>
            <label>
              المدة
              <input className="input" value="14 يوم" readOnly />
            </label>
          </div>
          <label>
            الهدف التجاري
            <textarea
              className="textarea"
              name="goals"
              defaultValue="العثور على فرصة مربحة قابلة للتنفيذ بميزانية محدودة وخطة تشغيل واضحة."
              required
            />
          </label>
          <button className="primary-btn" disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <Search size={18} />}
            تشغيل تحليل السوق
          </button>
          {error && <p className="notice error">{error}</p>}
        </form>

        <div className="intelligence-result">
          {!result && !loading && (
            <div className="empty-state">
              <BarChart3 size={34} />
              <strong>لا يوجد تحليل بعد</strong>
              <span>أدخل السوق والميزانية وسيتم إنشاء فرص، ROI، قرار، وخطة تنفيذ تحفظ في الوارد.</span>
            </div>
          )}

          {loading && (
            <div className="empty-state">
              <Loader2 className="spin" size={34} />
              <strong>AI يحلل السوق</strong>
              <span>يتم حساب الفرص والعائد والمخاطر وخطة التنفيذ.</span>
            </div>
          )}

          {result && (
            <div className="report-stack">
              <article className="report-card featured">
                <h3>ملخص السوق</h3>
                <pre>{result.marketSummary}</pre>
              </article>
              <div className="opportunity-grid">
                {result.opportunities.slice(0, 3).map((opportunity) => (
                  <article className="opportunity-card" key={opportunity.title}>
                    <span>
                      <Target size={17} /> {opportunity.category}
                    </span>
                    <strong>{opportunity.title}</strong>
                    <small>التكلفة: {currency.format(opportunity.cost)}</small>
                    <small>العائد المتوقع: {currency.format(opportunity.revenue)}</small>
                    <em>
                      <TrendingUp size={15} /> ROI {opportunity.roi}%
                    </em>
                  </article>
                ))}
              </div>
              <article className="report-card">
                <h3>القرار وخطة التنفيذ</h3>
                <pre>{`${result.decision}\n\n${result.plan}`}</pre>
              </article>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
