"use client";

import { FormEvent, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, BarChart3, BrainCircuit, CircleDollarSign, Loader2, Plus, ReceiptText, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";

type Transaction = {
  id: string;
  type: "income" | "expense";
  amount: number;
  description: string;
  created_at: string;
};

type FinanceReport = {
  income: number;
  expenses: number;
  profit: number;
  transactionCount: number;
  transactions: Transaction[];
  report: string;
};

type FinanceDecision = {
  financials: {
    income: number;
    expenses: number;
    profit: number;
    transactionCount: number;
  };
  cfo: string;
  ceo: string;
  saved: boolean;
};

const currency = new Intl.NumberFormat("ar-SA", {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 0,
});

export default function FinanceDashboard() {
  const [report, setReport] = useState<FinanceReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [decisionRequest, setDecisionRequest] = useState("هل يمكنني استثمار 50,000 ريال في متجر إلكتروني جديد؟");
  const [decisionError, setDecisionError] = useState("");
  const [decision, setDecision] = useState<FinanceDecision | null>(null);

  async function loadReport() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/accounting", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "تعذر تحميل التقرير المالي.");
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل التقرير المالي.");
    } finally {
      setLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const res = await fetch("/api/accounting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          data: {
            type: form.get("type"),
            amount: Number(form.get("amount")),
            description: form.get("description"),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "تعذر حفظ العملية.");
      event.currentTarget.reset();
      await loadReport();
      setDecision(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حفظ العملية.");
    } finally {
      setSaving(false);
    }
  }

  async function runDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDecisionLoading(true);
    setDecisionError("");

    try {
      const res = await fetch("/api/finance-decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: decisionRequest }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "تعذر إصدار القرار المالي.");
      setDecision(data);
    } catch (err) {
      setDecisionError(err instanceof Error ? err.message : "تعذر إصدار القرار المالي.");
    } finally {
      setDecisionLoading(false);
    }
  }

  useEffect(() => {
    loadReport();
  }, []);

  return (
    <main className="company-app">
      <section className="department-hero">
        <div>
          <Link className="back-link" href="/"><ArrowRight size={16} /> العودة للشركة</Link>
          <span className="eyebrow"><CircleDollarSign size={16} /> الإدارة المالية</span>
          <h1>نظام محاسبي ذكي للشركة</h1>
          <p>سجل الإيرادات والمصروفات، احسب الأرباح، واستخرج تقريرًا ماليًا احترافيًا مع تحليل AI وقرار تنفيذي.</p>
        </div>
        <div className="department-badge">CFO System</div>
      </section>

      <section className="finance-grid">
        <form className="finance-form" onSubmit={submit}>
          <h2><Plus size={20} /> إضافة عملية مالية</h2>
          <label>
            نوع العملية
            <select className="input" name="type" defaultValue="expense">
              <option value="expense">مصروف</option>
              <option value="income">دخل</option>
            </select>
          </label>
          <label>
            المبلغ
            <input className="input" name="amount" type="number" min="1" step="1" placeholder="5000" required />
          </label>
          <label>
            الوصف
            <input className="input" name="description" placeholder="إعلانات تسويق" required />
          </label>
          <button className="primary-btn" disabled={saving}>
            {saving ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}
            حفظ العملية
          </button>
          {error && <p className="notice error">{error}</p>}
        </form>

        <div className="finance-summary">
          <Metric title="الإيرادات" value={report?.income ?? 0} icon={<TrendingUp size={20} />} tone="green" />
          <Metric title="المصروفات" value={report?.expenses ?? 0} icon={<TrendingDown size={20} />} tone="red" />
          <Metric title="صافي الربح" value={report?.profit ?? 0} icon={<BarChart3 size={20} />} tone={(report?.profit ?? 0) >= 0 ? "green" : "red"} />
        </div>
      </section>

      <section className="delivery-panel">
        <div className="delivery-header">
          <div>
            <span className="eyebrow"><ShieldCheck size={16} /> قرار CFO + CEO</span>
            <h2>موافقة مالية تنفيذية</h2>
          </div>
          <span className={`status-pill ${decision ? "done" : ""}`}>{decision ? "تم إصدار القرار" : "بانتظار الطلب"}</span>
        </div>

        <form className="decision-form" onSubmit={runDecision}>
          <label>
            الطلب المالي
            <textarea
              className="textarea"
              value={decisionRequest}
              onChange={(event) => setDecisionRequest(event.target.value)}
              placeholder="اكتب طلب ميزانية أو استثمار ليحلله CFO ثم يعتمد CEO القرار"
              required
            />
          </label>
          <button className="primary-btn" disabled={decisionLoading}>
            {decisionLoading ? <Loader2 className="spin" size={18} /> : <ShieldCheck size={18} />}
            إصدار القرار التنفيذي
          </button>
          {decisionError && <p className="notice error">{decisionError}</p>}
        </form>

        {decision && (
          <div className="report-stack">
            <article className="report-card">
              <h3>تقرير المدير المالي CFO</h3>
              <pre>{decision.cfo}</pre>
            </article>
            <article className="report-card featured">
              <h3>قرار الرئيس التنفيذي CEO</h3>
              <pre>{decision.ceo}</pre>
            </article>
          </div>
        )}
      </section>

      <section className="delivery-panel">
        <div className="delivery-header">
          <div>
            <span className="eyebrow"><BrainCircuit size={16} /> تقرير CFO</span>
            <h2>التحليل المالي</h2>
          </div>
          <button className="secondary-btn" onClick={loadReport} disabled={loading}>
            {loading ? <Loader2 className="spin" size={16} /> : <ReceiptText size={16} />}
            تحديث التقرير
          </button>
        </div>

        {loading && <div className="empty-state"><Loader2 className="spin" size={34} /><strong>جاري تحميل المالية</strong></div>}

        {!loading && report && (
          <div className="report-stack">
            <article className="report-card featured">
              <h3>تقرير مالي احترافي</h3>
              <pre>{report.report}</pre>
            </article>

            <article className="report-card">
              <h3>آخر العمليات</h3>
              <div className="transaction-list">
                {report.transactions.length === 0 && <p className="muted">لا توجد عمليات محفوظة بعد.</p>}
                {report.transactions.map((transaction) => (
                  <div className="transaction-row" key={transaction.id}>
                    <span className={`transaction-type ${transaction.type}`}>{transaction.type === "income" ? "دخل" : "مصروف"}</span>
                    <strong>{transaction.description}</strong>
                    <b>{currency.format(Number(transaction.amount))}</b>
                    <small>{new Date(transaction.created_at).toLocaleDateString("ar-SA")}</small>
                  </div>
                ))}
              </div>
            </article>
          </div>
        )}
      </section>
    </main>
  );
}

function Metric({ title, value, icon, tone }: { title: string; value: number; icon: ReactNode; tone: "green" | "red" }) {
  return (
    <article className={`metric-card ${tone}`}>
      <span>{icon}</span>
      <small>{title}</small>
      <strong>{currency.format(value)}</strong>
    </article>
  );
}
