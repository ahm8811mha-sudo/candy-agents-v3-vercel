"use client";

import { useEffect, useState } from "react";
import { TrendingUp, Loader2, Play, ShieldAlert, CircleDollarSign, Activity } from "lucide-react";

type Opportunity = {
  id: string;
  symbol: string;
  assetClass: string;
  title: string;
  expectedReturn: number;
  risk: string;
  confidence: number;
};

type Decision = {
  opportunity: Opportunity;
  action: "BUY" | "SKIP" | "NEEDS_APPROVAL";
  allocation: number;
  score: number;
  reason: string;
};

type CycleResult = {
  ok: boolean;
  mode: string;
  liveRequested: boolean;
  decisions: Decision[];
  portfolio: { totalBudget: number; cash: number; deployed: number };
  approvalsRequired: number;
  notes: string[];
};

const currency = new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 });

const actionPill: Record<string, string> = {
  BUY: "done",
  NEEDS_APPROVAL: "medium",
  SKIP: "pending",
};

const actionLabel: Record<string, string> = {
  BUY: "تنفيذ",
  NEEDS_APPROVAL: "بانتظار موافقة",
  SKIP: "تخطّي",
};

const classLabel: Record<string, string> = {
  BUSINESS: "فرصة تجارية",
  EQUITY: "أسهم",
  CRYPTO: "كريبتو",
  FOREX: "عملات",
  TADAWUL: "السوق السعودي",
};

export default function TradingDeskPanel() {
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [budget, setBudget] = useState(100000);
  const [result, setResult] = useState<CycleResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/trading");
        const json = await res.json();
        if (json.ok) {
          setLiveEnabled(json.liveEnabled);
          setBudget(json.budget);
        }
      } catch {
        // silent
      }
    })();
  }, []);

  async function runCycle(mode: "SIMULATION" | "LIVE") {
    setLoading(true);
    try {
      const res = await fetch("/api/trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budget, mode }),
      });
      const json = await res.json();
      if (json.ok) {
        setResult(json);
        // Notify the approval center so newly-gated trades appear immediately.
        if (json.approvalsRequired > 0) {
          window.dispatchEvent(new Event("approvals-updated"));
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="delivery-panel fade-in" style={{ display: "grid", gap: 16 }}>
      <div className="delivery-header">
        <div>
          <span className="eyebrow"><CircleDollarSign size={16} /> مكتب التداول — تحت إدارة CFO</span>
          <h2>التداول الآلي على الفرص</h2>
        </div>
        <span className={`status-pill ${liveEnabled ? "running" : "done"}`}>
          {liveEnabled ? <Activity size={14} /> : <ShieldAlert size={14} />}
          {liveEnabled ? "التنفيذ الحقيقي مُفعّل" : "وضع المحاكاة (آمن)"}
        </span>
      </div>

      {!liveEnabled && (
        <p className="notice" style={{ color: "var(--muted)" }}>
          التنفيذ الحقيقي معطّل افتراضياً. يتطلب تفعيله <code>TRADING_LIVE_ENABLED=true</code> ومفاتيح وسيط
          (<code>BROKER_API_KEY</code> و <code>BROKER_API_SECRET</code>) — ضابط أمان متعمّد.
        </p>
      )}

      <div className="request-form" style={{ background: "rgba(255,255,255,0.035)" }}>
        <label>
          الميزانية المخصصة للمدير المالي (ريال)
          <input
            className="input"
            type="number"
            min={1000}
            step={1000}
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value) || 0)}
          />
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="primary-btn" onClick={() => runCycle("SIMULATION")} disabled={loading}>
            {loading ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
            تشغيل دورة محاكاة
          </button>
          <button
            className="secondary-btn"
            onClick={() => runCycle("LIVE")}
            disabled={loading}
            title={liveEnabled ? "تنفيذ حقيقي" : "سيُحوَّل للمحاكاة لأن التنفيذ الحقيقي غير مُفعّل"}
          >
            <TrendingUp size={16} /> طلب تنفيذ حقيقي
          </button>
        </div>
      </div>

      {result && (
        <div className="fade-in" style={{ display: "grid", gap: 14 }}>
          <div className="finance-summary">
            <div className="metric-card">
              <small>الميزانية</small>
              <strong>{currency.format(result.portfolio.totalBudget)}</strong>
            </div>
            <div className="metric-card green">
              <small>السيولة المتبقية</small>
              <strong>{currency.format(result.portfolio.cash)}</strong>
            </div>
            <div className="metric-card amber">
              <small>المنشور في صفقات</small>
              <strong>{currency.format(result.portfolio.deployed)}</strong>
            </div>
          </div>

          {result.notes.map((note, i) => (
            <p key={i} className="notice" style={{ color: "var(--amber)" }}>{note}</p>
          ))}

          {result.approvalsRequired > 0 && (
            <p className="notice" style={{ color: "var(--amber)" }}>
              <ShieldAlert size={14} /> {result.approvalsRequired} صفقة تتجاوز حد الموافقة وتنتظر اعتماداً بشرياً.
            </p>
          )}

          <div className="report-section-box">
            <div className="report-section-header">
              <Activity size={18} style={{ color: "var(--primary)" }} />
              <strong>قرارات المدير المالي ({result.decisions.length})</strong>
            </div>
            <div className="memory-list">
              {result.decisions.map((d) => (
                <div key={d.opportunity.id} className="statement-row">
                  <span>
                    {d.opportunity.title}
                    <br />
                    <small style={{ color: "var(--muted)" }}>
                      {classLabel[d.opportunity.assetClass] || d.opportunity.assetClass} · {d.opportunity.symbol} ·
                      عائد متوقع {(d.opportunity.expectedReturn * 100).toFixed(0)}% · ثقة {(d.opportunity.confidence * 100).toFixed(0)}% · النتيجة {d.score}
                      <br />
                      {d.reason}
                    </small>
                  </span>
                  <span style={{ display: "grid", gap: 4, justifyItems: "end" }}>
                    <span className={`mini-pill ${actionPill[d.action]}`}>{actionLabel[d.action]}</span>
                    {d.allocation > 0 && <b style={{ color: "var(--green)" }}>{currency.format(d.allocation)}</b>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
