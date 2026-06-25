"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Banknote,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Gauge,
  Landmark,
  Loader2,
  Megaphone,
  Radar,
  RefreshCw,
  ShieldCheck,
  LockKeyhole,
  PackageSearch,
  Users,
  BellRing,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

type EnterpriseStatus = {
  ok: boolean;
  financials?: { income: number; expenses: number; profit: number };
  intelligence?: { healthScore: number; riskLevel: string; actionToday: string };
  accounts?: Array<{ id?: string; code: string; name: string; type: string }>;
  journalEntries?: Array<{ id: string; entry_number?: string; memo?: string; status?: string }>;
  ceoItems?: Array<{ id: string; title: string; item_type: string; status: string; priority: string; notes?: string }>;
  marketingChannels?: Array<{ id: string; name: string; funnel_stage: string; status: string }>;
  marketingCampaigns?: Array<{ id: string; name: string; status: string; budget?: number }>;
  opportunityRuns?: Array<{ id: string; status: string; signal_summary: string; recommended_opportunity?: Record<string, unknown> }>;
  strategy?: { focus?: string; investment_thesis?: string; target_markets?: string[] };
  audits?: Array<{ id: string; decision_type: string; action: string; approval_status: string }>;
  governance?: {
    roles?: Array<{ id: string; name: string; approval_limit: number }>;
    policies?: Array<{ id: string; rule_name: string; required_role: string }>;
    integrations?: Array<{ id: string; provider: string; status: string }>;
    controlSummary?: {
      pendingApprovals: number;
      blockedActions: number;
      auditEventsToday: number;
      connectedIntegrations: number;
      readyIntegrations: number;
    };
  };
  government?: {
    documents?: Array<{ id: string; title: string; status: string; expiry_date?: string | null }>;
    fees?: Array<{ id: string; service_name: string; fee_text: string; last_checked_status?: string | null }>;
    tasks?: Array<{ id: string; title: string; status: string }>;
    metrics?: {
      totalDocuments: number;
      expiringSoon: number;
      expired: number;
      missingData: number;
      readyPortals: number;
      lastCheckedSources: number;
    };
  };
  crm?: { metrics?: { leads: number; openPipeline: number; staleLeads: number } };
  procurement?: { metrics?: { suppliers: number; items: number; lowStock: number; inventoryValue: number } };
  alerts?: { metrics?: { open: number; critical: number; high: number } };
};

const currency = new Intl.NumberFormat("ar-SA", {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 0,
});

export default function EnterpriseOperatingSystem() {
  const [data, setData] = useState<EnterpriseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/enterprise-os", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تحميل Enterprise OS.");
      const governanceRes = await fetch("/api/governance", { cache: "no-store" });
      const governanceJson = await governanceRes.json();
      const governmentRes = await fetch("/api/government-relations", { cache: "no-store" });
      const governmentJson = await governmentRes.json();
      const [crmRes, procurementRes, alertsRes] = await Promise.all([
        fetch("/api/crm-sales", { cache: "no-store" }),
        fetch("/api/procurement-inventory", { cache: "no-store" }),
        fetch("/api/alerts", { cache: "no-store" }),
      ]);
      const [crmJson, procurementJson, alertsJson] = await Promise.all([crmRes.json(), procurementRes.json(), alertsRes.json()]);
      setData({
        ...json,
        governance: governanceJson.ok ? governanceJson : undefined,
        government: governmentJson.ok ? governmentJson : undefined,
        crm: crmJson.ok ? crmJson : undefined,
        procurement: procurementJson.ok ? procurementJson : undefined,
        alerts: alertsJson.ok ? alertsJson : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل Enterprise OS.");
    } finally {
      setLoading(false);
    }
  }

  async function run(action: "seed" | "radar") {
    setWorking(action);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/enterprise-os", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تشغيل العملية.");
      setMessage(action === "seed" ? "تم تجهيز أساس النظام المؤسسي." : "تم تشغيل رادار الفرص.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تشغيل العملية.");
    } finally {
      setWorking("");
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="company-app enterprise-os">
      <section className="department-hero department-hero-live">
        <div>
          <Link className="back-link" href="/">
            <ArrowRight size={16} /> العودة للشركة
          </Link>
          <span className="eyebrow">
            <Building2 size={16} /> Enterprise OS
          </span>
          <h1>نظام تشغيل الشركة القادم</h1>
          <p>
            هذه الصفحة تجمع الترقية المطلوبة: نظام محاسبي احترافي، مكتب مدير تنفيذي، إدارة تسويق عالمية، رادار فرص مبادر، وتوجه تجاري واضح.
          </p>
          <div className="department-hero-actions">
            <span>
              <Gauge size={16} /> صحة الشركة {data?.intelligence?.healthScore ?? 0}/100
            </span>
            <span>
              <ShieldCheck size={16} /> المخاطر {data?.intelligence?.riskLevel || "LOW"}
            </span>
          </div>
        </div>
        <div className="department-badge">
          <strong>Operating Model</strong>
          <small>Next phase</small>
        </div>
      </section>

      <section className="enterprise-actions">
        <button className="primary-btn" onClick={() => run("seed")} disabled={Boolean(working)}>
          {working === "seed" ? <Loader2 className="spin" size={18} /> : <CheckCircle2 size={18} />}
          تهيئة النظام المؤسسي
        </button>
        <button className="secondary-btn" onClick={() => run("radar")} disabled={Boolean(working)}>
          {working === "radar" ? <Loader2 className="spin" size={18} /> : <Radar size={18} />}
          تشغيل رادار الفرص الآن
        </button>
        <button className="secondary-btn" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
          تحديث
        </button>
        {message && <p className="notice done">{message}</p>}
        {error && <p className="notice error">{error}</p>}
      </section>

      <section className="enterprise-grid">
        <SystemCard
          icon={Banknote}
          title="النظام المحاسبي"
          status={accountingMaturity(data)}
          body="الهدف ليس دخل/مصروف فقط، بل دفتر أستاذ، شجرة حسابات، قيود مزدوجة، ذمم، فواتير، بنك، مطابقة، ضريبة وتقارير."
          metrics={[
            ["الحسابات", data?.accounts?.length || 0],
            ["القيود", data?.journalEntries?.length || 0],
            ["صافي الربح", currency.format(data?.financials?.profit || 0)],
          ]}
        />
        <SystemCard
          icon={CalendarCheck}
          title="مكتب المدير التنفيذي"
          status="Executive office ready"
          body="مكتب CEO يتابع الإيقاع التشغيلي، الاجتماعات، الموافقات، المتابعات، المخاطر، وحزم التقارير الأسبوعية والشهرية."
          metrics={[
            ["بنود المكتب", data?.ceoItems?.length || 0],
            ["قرار اليوم", data?.intelligence?.actionToday ? 1 : 0],
            ["مخاطر", data?.intelligence?.riskLevel || "LOW"],
          ]}
        />
        <SystemCard
          icon={Megaphone}
          title="إدارة التسويق"
          status="Growth operating model"
          body="التسويق يجب أن يعمل كمسؤول نمو وابتكار: عرض، جمهور، قنوات، CAC، Funnel، محتوى، حملات، اختبارات ورسائل."
          metrics={[
            ["القنوات", data?.marketingChannels?.length || 0],
            ["الحملات", data?.marketingCampaigns?.length || 0],
            ["الجاهزية", marketingReadiness(data)],
          ]}
        />
        <SystemCard
          icon={Radar}
          title="رادار السوق والفرص"
          status="Proactive daily scan"
          body="المركز لم يعد ينتظر طلبًا فقط. تم تجهيز مسار يومي يقترح فرصًا ويرفعها إلى CFO وCEO وMarketing للمراجعة."
          metrics={[
            ["عمليات الرادار", data?.opportunityRuns?.length || 0],
            ["آخر حالة", data?.opportunityRuns?.[0]?.status || "لم يعمل"],
            ["المبادرة", "يومية"],
          ]}
        />
        <SystemCard
          icon={LockKeyhole}
          title="الحوكمة والصلاحيات"
          status="Approval gates active"
          body="النظام يفرق بين الاقتراح والتنفيذ، ويمنع الإنفاق أو التوسع عالي المخاطر بدون اعتماد CFO أو CEO، مع سجل قرارات محفوظ."
          metrics={[
            ["الأدوار", data?.governance?.roles?.length || 0],
            ["سياسات الاعتماد", data?.governance?.policies?.length || 0],
            ["سجل اليوم", data?.governance?.controlSummary?.auditEventsToday || 0],
          ]}
        />
        <SystemCard
          icon={Landmark}
          title="العلاقات الحكومية"
          status="Government documents control"
          body="أرشيف وثائق حكومي يقرأ السجلات والشهادات والرخص، يراقب الانتهاء، يتحقق من الرسوم من المصادر الرسمية، ويجهز مسار التجديد."
          metrics={[
            ["الوثائق", data?.government?.metrics?.totalDocuments || 0],
            ["قريب الانتهاء", data?.government?.metrics?.expiringSoon || 0],
            ["مصادر متحققة", data?.government?.metrics?.lastCheckedSources || 0],
          ]}
        />
        <SystemCard
          icon={Users}
          title="CRM والمبيعات"
          status="Pipeline operating model"
          body="تحويل التسويق إلى Leads وصفقات وعروض أسعار ومتابعات، حتى يعرف CEO أين تتحول الفرص إلى إيراد."
          metrics={[
            ["Leads", data?.crm?.metrics?.leads || 0],
            ["Pipeline", currency.format(data?.crm?.metrics?.openPipeline || 0)],
            ["متابعات متأخرة", data?.crm?.metrics?.staleLeads || 0],
          ]}
        />
        <SystemCard
          icon={PackageSearch}
          title="المشتريات والمخزون"
          status="Procurement and inventory"
          body="إدارة الموردين وأوامر الشراء والأصناف والهامش وحدود إعادة الطلب، مرتبطة بالتنبيهات التشغيلية."
          metrics={[
            ["الموردون", data?.procurement?.metrics?.suppliers || 0],
            ["الأصناف", data?.procurement?.metrics?.items || 0],
            ["مخزون منخفض", data?.procurement?.metrics?.lowStock || 0],
          ]}
        />
        <SystemCard
          icon={BellRing}
          title="محرك التنبيهات"
          status="Company follow-up engine"
          body="يراقب الوثائق والفواتير والحملات والمهام والفرص والمخزون والعملاء، ثم يرفع التنبيه للإدارة المعنية."
          metrics={[
            ["مفتوحة", data?.alerts?.metrics?.open || 0],
            ["حرجة", data?.alerts?.metrics?.critical || 0],
            ["مرتفعة", data?.alerts?.metrics?.high || 0],
          ]}
        />
      </section>

      <section className="delivery-panel">
        <div className="delivery-header">
          <div>
            <span className="eyebrow">
              <BriefcaseBusiness size={16} /> التوجه التجاري والاستثماري
            </span>
            <h2>صيغة الشركة المقترحة</h2>
          </div>
        </div>
        <div className="enterprise-thesis">
          <article>
            <strong>التركيز</strong>
            <p>{data?.strategy?.focus || "AI-assisted commerce and lean opportunity validation."}</p>
          </article>
          <article>
            <strong>أطروحة الاستثمار</strong>
            <p>{data?.strategy?.investment_thesis || "ابدأ بتجارب صغيرة، ثم وسع بعد إثبات الهامش والطلب."}</p>
          </article>
          <article>
            <strong>الأسواق المستهدفة</strong>
            <p>{(data?.strategy?.target_markets || []).join("، ") || "التجارة الإلكترونية، الهدايا، العناية، خدمات AI."}</p>
          </article>
        </div>
      </section>

      <section className="enterprise-lists">
        <ListPanel title="مكتب CEO" items={(data?.ceoItems || []).map((item) => `${item.title} - ${item.status}`)} />
        <ListPanel title="قنوات التسويق" items={(data?.marketingChannels || []).map((item) => `${item.name} - ${item.funnel_stage}`)} />
        <ListPanel
          title="آخر رادار فرص"
          items={(data?.opportunityRuns || []).map((item) => `${item.status}: ${item.signal_summary}`)}
        />
        <ListPanel
          title="التكاملات والحوكمة"
          items={(data?.governance?.integrations || []).map((item) => `${item.provider} - ${item.status}`)}
        />
        <ListPanel
          title="العلاقات الحكومية"
          items={[
            ...(data?.government?.documents || []).map((item) => `${item.title} - ${item.status}`),
            ...(data?.government?.tasks || []).map((item) => `${item.title} - ${item.status}`),
          ]}
        />
      </section>
    </main>
  );
}

function accountingMaturity(data: EnterpriseStatus | null) {
  const accountCount = data?.accounts?.length || 0;
  if (accountCount >= 10) return "Accounting foundation ready";
  return "Needs professional ledger setup";
}

function marketingReadiness(data: EnterpriseStatus | null) {
  const ready = (data?.marketingChannels || []).filter((item) => item.status === "ACTIVE" || item.status === "READY_FOR_CONNECTION").length;
  return `${ready}/${data?.marketingChannels?.length || 0}`;
}

function SystemCard({
  icon: Icon,
  title,
  status,
  body,
  metrics,
}: {
  icon: LucideIcon;
  title: string;
  status: string;
  body: string;
  metrics: Array<[string, string | number]>;
}) {
  return (
    <article className="enterprise-card">
      <span>
        <Icon size={20} />
      </span>
      <strong>{title}</strong>
      <em>{status}</em>
      <p>{body}</p>
      <div>
        {metrics.map(([label, value]) => (
          <small key={label}>
            {label}: <b>{value}</b>
          </small>
        ))}
      </div>
    </article>
  );
}

function ListPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="department-board-column">
      <header>
        <h2>{title}</h2>
        <span>{items.length}</span>
      </header>
      <div>
        {items.length === 0 && <p className="department-empty">لا توجد بيانات بعد. اضغط تهيئة النظام المؤسسي.</p>}
        {items.slice(0, 6).map((item) => (
          <article className="department-row" key={item}>
            <div>
              <span className="mini-pill">ACTIVE</span>
              <strong>{item}</strong>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
