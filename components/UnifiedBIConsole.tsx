"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Loader2,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Wallet,
  Boxes,
  Users,
  Inbox,
  FileWarning,
  Megaphone,
  ArrowLeft,
  Sparkles,
} from "lucide-react";

type BIData = {
  scorecard?: {
    revenue: number;
    expenses: number;
    netIncome: number;
    profitMargin: number;
    cash: number;
    pipeline: number;
    inventoryValue: number;
    alertCount: number;
    pendingDecisions: number;
    hasFinancialData: boolean;
  };
  answers?: {
    isProfitable: boolean;
    bestProductOrOpportunity: string;
    expiringDocuments: Array<{ id: string; title: string; issuer?: string; status: string }>;
    losingCampaigns: Array<{ id: string; name: string; status: string }>;
    decisionToday: string;
    decisionAction?: { label: string; href: string };
  };
  alerts?: Array<{ id: string; title: string; department: string; severity: string; message: string; action_url?: string }>;
};

const currency = new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 });

const severityPill: Record<string, string> = {
  CRITICAL: "high",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "done",
};

export default function UnifiedBIConsole() {
  const [data, setData] = useState<BIData>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function load(method: "GET" | "POST" = "GET") {
    setWorking(method === "POST");
    if (method === "GET") setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/bi-center", { method, cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تحميل بيانات الشركة.");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل بيانات الشركة.");
    } finally {
      setLoading(false);
      setWorking(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const score = data.scorecard;
  const answers = data.answers;
  const hasData = Boolean(score?.hasFinancialData);

  /** Honest money display: "—" until real books exist. */
  const money = (v: number | undefined) => (hasData ? currency.format(v || 0) : "—");

  return (
    <main className="page-wrap">
      <header className="page-head">
        <div>
          <span className="eyebrow"><BarChart3 size={16} /> ذكاء الأعمال الموحّد</span>
          <h1 className="glow-title">لوحة قرار الشركة</h1>
          <p className="page-sub">
            صفحة واحدة تقرأ المالية، التسويق، المبيعات، المخزون، الوثائق، والتنبيهات — وتحوّلها إلى قرارٍ قابل للتنفيذ.
          </p>
        </div>
        {score && (
          <span className={`status-pill ${!hasData ? "" : answers?.isProfitable ? "done" : "running"}`}>
            {!hasData ? "لا بيانات مالية بعد" : answers?.isProfitable ? "الشركة رابحة" : "بحاجة لتحسين الهامش"}
          </span>
        )}
      </header>

      {error && <p className="notice error">{error}</p>}

      {loading && (
        <div className="bento-card bento-full" style={{ placeItems: "center", padding: 30 }}>
          <Loader2 className="spin" size={24} style={{ color: "var(--muted)" }} />
        </div>
      )}

      {/* ── The decision of the day — the hero, with a real action ── */}
      {!loading && answers && (
        <section className="bento-card bento-full bento-card--glow" style={{ gap: 12 }}>
          <span className="bento-kicker"><Sparkles size={15} /> القرار المطلوب اليوم</span>
          <strong style={{ fontSize: "clamp(1.15rem, 2.6vw, 1.6rem)", lineHeight: 1.6, color: "var(--text-strong)" }}>
            {answers.decisionToday}
          </strong>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {answers.decisionAction && (
              <Link className="primary-btn" href={answers.decisionAction.href}>
                {answers.decisionAction.label} <ArrowLeft size={15} />
              </Link>
            )}
            <button className="secondary-btn" onClick={() => load("POST")} disabled={working}>
              {working ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
              تحديث وفحص التنبيهات
            </button>
          </div>
          <span className="bento-foot">أفضل فرصة الآن: {answers.bestProductOrOpportunity}</span>
        </section>
      )}

      {/* ── Scorecard — every number opens its department ── */}
      {!loading && score && (
        <section className="bento-grid">
          <Link href="/departments/finance" className={`bento-card ${hasData && score.revenue > 0 ? "bento-card--green" : ""}`}>
            <span className="bento-kicker"><Wallet size={14} /> الإيرادات</span>
            <span className="bento-value" style={{ color: hasData ? "var(--green)" : "var(--muted)" }}>{money(score.revenue)}</span>
            <span className="bento-label">{hasData ? "إجمالي الإيرادات المسجّلة" : "لا قيود مسجّلة بعد"}</span>
          </Link>

          <Link href="/departments/finance" className="bento-card">
            <span className="bento-kicker"><Wallet size={14} /> المصروفات</span>
            <span className="bento-value" style={{ color: hasData ? "var(--text-strong)" : "var(--muted)" }}>{money(score.expenses)}</span>
            <span className="bento-label">{hasData ? "إجمالي المصروفات" : "لا قيود مسجّلة بعد"}</span>
          </Link>

          <Link href="/departments/finance" className={`bento-card ${!hasData ? "" : score.netIncome >= 0 ? "bento-card--green" : "bento-card--red"}`}>
            <span className="bento-kicker"><TrendingUp size={14} /> صافي الربح</span>
            <span className="bento-value" style={{ color: !hasData ? "var(--muted)" : score.netIncome >= 0 ? "var(--green)" : "var(--red)" }}>
              {money(score.netIncome)}
            </span>
            <span className="bento-label">{hasData ? `الهامش ${Math.round((score.profitMargin || 0) * 100)}%` : "بانتظار أول قيد"}</span>
          </Link>

          <Link href="/inbox" className={`bento-card ${score.pendingDecisions > 0 ? "bento-card--amber" : ""}`}>
            <span className="bento-kicker"><Inbox size={14} /> قرارات معلّقة</span>
            <span className="bento-value">{score.pendingDecisions}</span>
            <span className="bento-label">{score.pendingDecisions > 0 ? "بانتظار اعتمادك في مركز القرار" : "لا قرارات معلّقة"}</span>
          </Link>

          <Link href="/departments/sales" className="bento-card">
            <span className="bento-kicker"><Users size={14} /> مبيعات محتملة</span>
            <span className="bento-value">{currency.format(score.pipeline || 0)}</span>
            <span className="bento-label">قيمة الفرص المفتوحة في CRM</span>
          </Link>

          <Link href="/departments/procurement" className="bento-card">
            <span className="bento-kicker"><Boxes size={14} /> قيمة المخزون</span>
            <span className="bento-value">{currency.format(score.inventoryValue || 0)}</span>
            <span className="bento-label">تكلفة المخزون الحالي</span>
          </Link>

          <a href="#bi-alerts" className={`bento-card ${score.alertCount > 0 ? "bento-card--amber" : ""}`}>
            <span className="bento-kicker"><ShieldAlert size={14} /> تنبيهات مفتوحة</span>
            <span className="bento-value">{score.alertCount}</span>
            <span className="bento-label">{score.alertCount > 0 ? "انزل للقائمة وعالجها" : "لا تنبيهات مفتوحة"}</span>
          </a>

          <Link href="/departments/finance" className="bento-card">
            <span className="bento-kicker"><Wallet size={14} /> النقد</span>
            <span className="bento-value" style={{ color: hasData ? "var(--text-strong)" : "var(--muted)" }}>{money(score.cash)}</span>
            <span className="bento-label">السيولة المتاحة</span>
          </Link>
        </section>
      )}

      {/* ── Watchlists ── */}
      {!loading && (
        <section className="report-two-col">
          <div className="bento-card" style={{ gap: 10 }}>
            <span className="bento-kicker"><FileWarning size={14} /> وثائق قريبة من الانتهاء</span>
            <div className="bento-list">
              {(answers?.expiringDocuments || []).length === 0 && (
                <div className="bento-list__row"><small>لا وثائق قريبة من الانتهاء ✓</small></div>
              )}
              {(answers?.expiringDocuments || []).map((doc) => (
                <Link key={doc.id} href="/departments/government-relations" className="bento-list__row" style={{ color: "inherit", textDecoration: "none" }}>
                  <span>
                    {doc.title}
                    <br />
                    <small>{doc.issuer || "جهة غير محددة"}</small>
                  </span>
                  <span className="mini-pill medium">{doc.status}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="bento-card" style={{ gap: 10 }}>
            <span className="bento-kicker"><Megaphone size={14} /> حملات خاسرة</span>
            <div className="bento-list">
              {(answers?.losingCampaigns || []).length === 0 && (
                <div className="bento-list__row"><small>لا حملات خاسرة حالياً ✓</small></div>
              )}
              {(answers?.losingCampaigns || []).map((c) => (
                <Link key={c.id} href="/departments/marketing" className="bento-list__row" style={{ color: "inherit", textDecoration: "none" }}>
                  <span>{c.name}</span>
                  <span className="mini-pill high">{c.status}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Alerts ── */}
      {!loading && (
        <section id="bi-alerts" className="bento-card bento-full" style={{ gap: 10 }}>
          <span className="bento-kicker"><ShieldAlert size={14} /> التنبيهات ({(data.alerts || []).length})</span>
          <div className="bento-list">
            {(data.alerts || []).length === 0 && (
              <div className="bento-list__row"><small>لا تنبيهات — الشركة هادئة ✓</small></div>
            )}
            {(data.alerts || []).slice(0, 12).map((alert) => (
              <div key={alert.id} className="bento-list__row" style={{ alignItems: "flex-start" }}>
                <span>
                  <b style={{ color: "var(--text-strong)" }}>{alert.department}: {alert.title}</b>
                  <br />
                  <small>{alert.message}</small>
                </span>
                <span style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                  <span className={`mini-pill ${severityPill[(alert.severity || "").toUpperCase()] || "medium"}`}>{alert.severity}</span>
                  {alert.action_url && (
                    <Link href={alert.action_url} className="secondary-btn btn-sm">معالجة <ArrowLeft size={12} /></Link>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
