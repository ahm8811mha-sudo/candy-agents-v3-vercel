"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  BarChart3,
  Building2,
  Calculator,
  CheckCircle2,
  ClipboardList,
  FolderKanban,
  Landmark,
  LayoutDashboard,
  Loader2,
  Megaphone,
  PackageSearch,
  Send,
  ShieldCheck,
  Users,
  Brain,
  FileText,
  Plug,
  Briefcase,
  ShoppingBag,
  Activity,
  CircleDollarSign,
} from "lucide-react";
import Link from "next/link";
import BIForm from "./BIForm";
import LoadingSteps from "./LoadingSteps";
import ExecutiveReport from "./ExecutiveReport";
import AgentMemoryPanel from "./AgentMemoryPanel";
import IntegrationsPanel from "./IntegrationsPanel";
import ShopifyPanel from "./ShopifyPanel";
import MonitoringPanel from "./MonitoringPanel";
import TradingDeskPanel from "./TradingDeskPanel";
import ScalpingSignalPanel from "./ScalpingSignalPanel";
import ApprovalCenter from "./ApprovalCenter";

type ExecutionResult = {
  ok: true;
  financials: {
    income: number;
    expenses: number;
    profit: number;
    transactionCount: number;
  };
  cfo: string;
  ceo: string;
  tasks: string;
  project: {
    id: string;
    name: string;
    status?: string;
    created_at?: string;
  };
  task: {
    id: string;
    project_id: string;
    title: string;
    content: string;
    status: string;
    created_at?: string;
  };
  saved: boolean;
};

type DashboardData = {
  projects: unknown[];
  tasks: unknown[];
  decisions: unknown[];
};

const currency = new Intl.NumberFormat("ar-SA", {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 0,
});

const stages = [
  { key: "financials", title: "البيانات المالية", role: "قراءة الإيرادات والمصروفات والربح", icon: Calculator, href: "/departments/finance" },
  { key: "cfo", title: "المدير المالي CFO", role: "اعتماد الميزانية وتحليل المخاطر", icon: Briefcase, href: "/departments/finance" },
  { key: "ceo", title: "الرئيس التنفيذي CEO", role: "إصدار القرار النهائي", icon: ShieldCheck, href: "/departments/executive" },
  { key: "tasks", title: "خطة التنفيذ", role: "تحويل القرار إلى مهام وأدوار وجدول", icon: ClipboardList, href: "/departments/operations" },
  { key: "project", title: "المشروع", role: "حفظ مشروع ومهمة تنفيذية للمتابعة", icon: FolderKanban, href: "/departments/executive" },
] as const;

const quickNavItems = [
  { href: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/enterprise-os", label: "Enterprise OS", icon: Building2 },
  { href: "/departments/finance", label: "المالية", icon: Calculator },
  { href: "/departments/executive", label: "CEO Office", icon: ShieldCheck },
  { href: "/departments/marketing", label: "التسويق", icon: Megaphone },
  { href: "/departments/sales", label: "CRM", icon: Users },
  { href: "/departments/procurement", label: "المشتريات", icon: PackageSearch },
  { href: "/departments/government-relations", label: "العلاقات الحكومية", icon: Landmark },
  { href: "/bi-center", label: "BI موحد", icon: BarChart3 },
];

type TabKey = "execution" | "dashboard" | "trading" | "store" | "monitoring" | "reports" | "memory" | "integrations";

const tabs: { key: TabKey; label: string; icon: typeof Building2 }[] = [
  { key: "execution", label: "التنفيذ", icon: Send },
  { key: "dashboard", label: "لوحة المتابعة", icon: LayoutDashboard },
  { key: "trading", label: "التداول", icon: CircleDollarSign },
  { key: "store", label: "المتجر", icon: ShoppingBag },
  { key: "monitoring", label: "المراقبة", icon: Activity },
  { key: "reports", label: "التقارير", icon: FileText },
  { key: "memory", label: "الذاكرة", icon: Brain },
  { key: "integrations", label: "التكاملات", icon: Plug },
];

export default function StrategyRunner() {
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("execution");

  async function loadDashboard() {
    try {
      const res = await fetch("/api/company-dashboard", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.ok) {
        setDashboard({
          projects: data.projects || [],
          tasks: data.tasks || [],
          decisions: data.decisions || [],
        });
      }
    } catch {
      setDashboard(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    const form = new FormData(event.currentTarget);
    const request = String(form.get("request") || "").trim();

    try {
      const res = await fetch("/api/company-execution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "تعذر تشغيل الشركة التنفيذية.");
      setResult(data);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تشغيل الشركة التنفيذية.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  // Allow deep-linking to a specific tab, e.g. /?tab=trading from the CEO office.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("tab") as TabKey | null;
    if (requested && tabs.some((t) => t.key === requested)) {
      setActiveTab(requested);
    }
  }, []);

  return (
    <main className="company-app">
      {/* Hero Section */}
      <section className="request-panel">
        <div className="request-copy">
          <span className="eyebrow"><Building2 size={16} /> شركة ذكاء اصطناعي تنفيذية</span>
          <h1>اكتب الطلب، والشركة تقرر ثم تنشئ مشروع التنفيذ</h1>
          <p>
            يقرأ البيانات المالية، يراجعها المدير المالي، يعتمد الرئيس التنفيذي القرار، ثم تتحول النتيجة إلى مهام ومشروع محفوظين.
          </p>
        </div>

        <form className="request-form" onSubmit={submit}>
          <label>
            الطلب المطلوب تنفيذه
            <textarea
              name="request"
              className="textarea command-box"
              required
              defaultValue="هل يمكن اعتماد ميزانية لإطلاق متجر إلكتروني جديد بميزانية 50,000 ريال مع تحويل القرار إلى مشروع ومهام تنفيذية؟"
            />
          </label>

          <button className="primary-btn big-action" disabled={loading}>
            {loading ? <Loader2 className="spin" size={20} /> : <Send size={20} />}
            {loading ? "الشركة تصدر القرار وتنشئ المشروع" : "تشغيل الشركة التنفيذية"}
          </button>

          {error && <p className="notice error">{error}</p>}
        </form>
      </section>

      {/* Stages Strip */}
      <section className="employee-strip" aria-label="مراحل تنفيذ الشركة">
        {stages.map((stage, index) => {
          const Icon = stage.icon;
          const complete = Boolean(result?.[stage.key]);

          return (
            <Link className={`employee-card department-link ${loading ? "active" : complete ? "done" : ""}`} href={stage.href} key={stage.key}>
              <span>{complete ? <CheckCircle2 size={18} /> : <Icon size={18} />}</span>
              <strong>{stage.title}</strong>
              <small>{stage.role}</small>
              <em>{loading ? "قيد العمل" : complete ? "اكتمل" : `مرحلة ${index + 1}`}</em>
            </Link>
          );
        })}
      </section>

      {/* Section Tabs */}
      <div className="section-tabs" role="tablist" aria-label="أقسام التطبيق">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              className={`section-tab ${activeTab === tab.key ? "active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
              role="tab"
              aria-selected={activeTab === tab.key}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab: Execution Results */}
      {activeTab === "execution" && (
        <>
          <section className="delivery-panel fade-in">
            <div className="delivery-header">
              <div>
                <span className="eyebrow"><BarChart3 size={16} /> التسليم النهائي</span>
                <h2>نتيجة الشركة</h2>
              </div>
              <span className={`status-pill ${loading ? "running" : result ? "done" : ""}`}>
                {loading ? "قيد التنفيذ" : result ? "تم إنشاء المشروع" : "بانتظار الطلب"}
              </span>
            </div>

            {!result && !loading && (
              <div className="empty-state">
                <Building2 size={34} />
                <strong>لا توجد نتيجة بعد</strong>
                <span>اكتب الطلب واضغط تشغيل الشركة. ستظهر نتيجة CFO وCEO والمهام والمشروع هنا.</span>
              </div>
            )}

            {loading && <LoadingSteps active={loading} />}

            {result && (
              <div className="report-stack fade-in">
                <div className="finance-summary">
                  <Metric title="الإيرادات" value={result.financials.income} />
                  <Metric title="المصروفات" value={result.financials.expenses} />
                  <Metric title="صافي الربح" value={result.financials.profit} />
                </div>

                <article className="report-card featured">
                  <h3>المشروع الذي تم إنشاؤه</h3>
                  <pre>{`اسم المشروع: ${result.project.name}
الحالة: ${result.project.status || "ACTIVE"}
المهمة: ${result.task.title}
حالة المهمة: ${result.task.status}
الحفظ في قاعدة البيانات: ${result.saved ? "تم" : "غير متصل بقاعدة البيانات"}`}</pre>
                </article>

                <Report title="قرار الرئيس التنفيذي CEO" content={result.ceo} featured />
                <Report title="تقرير المدير المالي CFO" content={result.cfo} />
                <Report title="المهام التنفيذية" content={result.tasks} />
              </div>
            )}
          </section>

          <BIForm />
        </>
      )}

      {/* Tab: Dashboard */}
      {activeTab === "dashboard" && (
        <section className="delivery-panel fade-in">
          <div className="delivery-header">
            <div>
              <span className="eyebrow"><FolderKanban size={16} /> CEO Dashboard</span>
              <h2>لوحة متابعة الشركة</h2>
            </div>
            <button className="secondary-btn" onClick={loadDashboard} type="button">تحديث اللوحة</button>
          </div>

          <div className="finance-summary" style={{ marginBottom: 16 }}>
            <DashboardMetric title="المشاريع" value={dashboard?.projects.length ?? 0} />
            <DashboardMetric title="المهام" value={dashboard?.tasks.length ?? 0} />
            <DashboardMetric title="القرارات المالية" value={dashboard?.decisions.length ?? 0} />
          </div>

          <h3 style={{ margin: "0 0 12px", fontSize: "1.1rem" }}>الانتقال السريع</h3>
          <div className="quick-nav">
            {quickNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className="quick-nav-card">
                  <span><Icon size={18} /></span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Tab: Trading Desk */}
      {activeTab === "trading" && (
        <>
          <ScalpingSignalPanel />
          <TradingDeskPanel />
          <ApprovalCenter />
        </>
      )}

      {/* Tab: Store */}
      {activeTab === "store" && <ShopifyPanel />}

      {/* Tab: Monitoring */}
      {activeTab === "monitoring" && <MonitoringPanel />}

      {/* Tab: Reports */}
      {activeTab === "reports" && <ExecutiveReport />}

      {/* Tab: Memory */}
      {activeTab === "memory" && <AgentMemoryPanel />}

      {/* Tab: Integrations */}
      {activeTab === "integrations" && <IntegrationsPanel />}
    </main>
  );
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <article className={`metric-card ${value >= 0 ? "green" : "red"}`}>
      <small>{title}</small>
      <strong>{currency.format(value)}</strong>
    </article>
  );
}

function DashboardMetric({ title, value }: { title: string; value: number }) {
  return (
    <article className="metric-card green">
      <small>{title}</small>
      <strong>{value.toLocaleString("ar-SA")}</strong>
    </article>
  );
}

function Report({ title, content, featured = false }: { title: string; content: string; featured?: boolean }) {
  return (
    <article className={`report-card ${featured ? "featured" : ""}`}>
      <h3>{title}</h3>
      <pre>{content}</pre>
    </article>
  );
}
