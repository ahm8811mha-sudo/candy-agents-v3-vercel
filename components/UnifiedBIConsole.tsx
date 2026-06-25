"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, BarChart3, Building2, Loader2, RefreshCw, ShieldAlert, TrendingUp } from "lucide-react";
import Link from "next/link";

type BIData = {
  scorecard?: { revenue: number; expenses: number; netIncome: number; profitMargin: number; cash: number; pipeline: number; inventoryValue: number; alertCount: number };
  answers?: { isProfitable: boolean; bestProductOrOpportunity: string; expiringDocuments: any[]; losingCampaigns: any[]; decisionToday: string };
  departments?: Record<string, any>;
  alerts?: Array<{ id: string; title: string; department: string; severity: string; message: string; action_url?: string }>;
};

const currency = new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 });

export default function UnifiedBIConsole() {
  const [data, setData] = useState<BIData>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function load(method: "GET" | "POST" = "GET") {
    setWorking(method === "POST");
    setLoading(method === "GET");
    setError("");
    try {
      const res = await fetch("/api/bi-center", { method, cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تحميل BI.");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل BI.");
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

  return (
    <main className="company-app ops-console">
      <section className="department-hero department-hero-live">
        <div>
          <Link className="back-link" href="/"><ArrowRight size={16} /> العودة للشركة</Link>
          <span className="eyebrow"><BarChart3 size={16} /> ذكاء الأعمال الموحد</span>
          <h1>لوحة قرار الشركة</h1>
          <p>صفحة واحدة تقرأ المالية، التسويق، CRM، المخزون، الوثائق، والتنبيهات لتقول لك ما القرار المطلوب اليوم.</p>
          <div className="department-hero-actions">
            <span>القرار: {answers?.decisionToday || "جار التحميل"}</span>
          </div>
        </div>
        <div className="department-badge"><strong>BI Center</strong><small>{answers?.isProfitable ? "ربحية" : "تحتاج تحسين"}</small></div>
      </section>

      <section className="enterprise-actions">
        <button className="primary-btn" onClick={() => load("POST")} disabled={working}>
          {working ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />} تحديث BI وتشغيل التنبيهات
        </button>
        {error && <p className="notice error">{error}</p>}
      </section>

      <section className="ops-metrics">
        <Metric label="الإيرادات" value={currency.format(score?.revenue || 0)} icon="money" />
        <Metric label="المصروفات" value={currency.format(score?.expenses || 0)} icon="money" />
        <Metric label="صافي الربح" value={currency.format(score?.netIncome || 0)} icon="money" />
        <Metric label="الهامش" value={`${Math.round((score?.profitMargin || 0) * 100)}%`} icon="trend" />
        <Metric label="Pipeline" value={currency.format(score?.pipeline || 0)} icon="trend" />
        <Metric label="المخزون" value={currency.format(score?.inventoryValue || 0)} icon="stock" />
        <Metric label="تنبيهات مفتوحة" value={score?.alertCount || 0} icon="alert" />
      </section>

      <section className="ops-card executive-brief">
        <span className="eyebrow"><TrendingUp size={16} /> القرار المطلوب اليوم</span>
        <h2>{answers?.decisionToday}</h2>
        <p>أفضل منتج أو فرصة الآن: {answers?.bestProductOrOpportunity}</p>
      </section>

      <section className="ops-board">
        <Panel title="وثائق قريبة من الانتهاء">
          {(answers?.expiringDocuments || []).slice(0, 8).map((doc: any) => (
            <Statement key={doc.id} label={`${doc.title} - ${doc.issuer || "جهة غير محددة"}`} value={doc.status} />
          ))}
        </Panel>
        <Panel title="حملات خاسرة">
          {(answers?.losingCampaigns || []).slice(0, 8).map((campaign: any) => (
            <Statement key={campaign.id} label={campaign.name} value={campaign.status} />
          ))}
        </Panel>
        <Panel title="التنبيهات">
          {(data.alerts || []).slice(0, 10).map((alert) => (
            <Statement key={alert.id} label={`${alert.department}: ${alert.title}`} value={alert.severity} />
          ))}
        </Panel>
      </section>

      <section className="ops-board two">
        {Object.entries(data.departments || {}).map(([name, value]) => (
          <Panel title={sectionTitle(name)} key={name}>
            {Object.entries(value || {}).slice(0, 8).map(([key, val]) => (
              <Statement key={key} label={key} value={formatValue(val)} />
            ))}
          </Panel>
        ))}
      </section>

      {loading && <p className="notice">جار تحميل بيانات الشركة...</p>}
    </main>
  );
}

function Metric({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  const Icon = icon === "alert" ? ShieldAlert : icon === "stock" ? Building2 : icon === "trend" ? TrendingUp : BarChart3;
  return <article className="metric-card green"><span><Icon size={20} /></span><small>{label}</small><strong>{value}</strong></article>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="ops-card"><h2>{title}</h2><div className="statement-list">{children}</div></section>;
}

function Statement({ label, value }: { label: string; value: string | number }) {
  return <div className="statement-row"><span>{label}</span><b>{value}</b></div>;
}

function sectionTitle(key: string) {
  const names: Record<string, string> = {
    finance: "المالية",
    marketing: "التسويق",
    government: "العلاقات الحكومية",
    executive: "مكتب CEO",
    crm: "CRM والمبيعات",
    procurement: "المشتريات والمخزون",
    alerts: "التنبيهات",
  };
  return names[key] || key;
}

function formatValue(value: unknown) {
  if (typeof value === "number") return Math.abs(value) > 100 ? currency.format(value) : String(Math.round(value * 100) / 100);
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (Array.isArray(value)) return `${value.length}`;
  if (typeof value === "object" && value) return "بيانات";
  return String(value ?? "-");
}
