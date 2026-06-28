"use client";

import { FormEvent, useEffect, useState } from "react";
import { BarChart3, Building2, Calculator, CheckCircle2, ClipboardList, FolderKanban, Landmark, Loader2, PackageSearch, Send, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import BIForm from "./BIForm";
import NotificationCenter from "./NotificationCenter";
import LoadingSteps from "./LoadingSteps";
import ExecutiveReport from "./ExecutiveReport";
import AgentMemoryPanel from "./AgentMemoryPanel";
import IntegrationsPanel from "./IntegrationsPanel";

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
  { key: "cfo", title: "المدير المالي CFO", role: "اعتماد الميزانية وتحليل المخاطر", icon: Calculator, href: "/departments/finance" },
  { key: "ceo", title: "الرئيس التنفيذي CEO", role: "إصدار القرار النهائي", icon: ShieldCheck, href: "/departments/executive" },
  { key: "tasks", title: "خطة التنفيذ", role: "تحويل القرار إلى مهام وأدوار وجدول", icon: ClipboardList, href: "/departments/operations" },
  { key: "project", title: "المشروع", role: "حفظ مشروع ومهمة تنفيذية للمتابعة", icon: FolderKanban, href: "/departments/executive" },
] as const;

export default function StrategyRunner() {
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <main className="company-app">
      <section className="request-panel">
        <div className="request-copy">
          <span className="eyebrow"><Building2 size={16} /> شركة ذكاء اصطناعي تنفيذية</span>
          <h1>اكتب الطلب، والشركة تقرر ثم تنشئ مشروع التنفيذ</h1>
          <p>
            هذا المسار يوحد الشركة: يقرأ البيانات المالية، يراجعها المدير المالي، يعتمد الرئيس التنفيذي القرار، ثم تتحول النتيجة إلى مهام ومشروع محفوظين للمتابعة.
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

      <section className="delivery-panel">
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
          <div className="report-stack">
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

      <section className="delivery-panel">
        <div className="delivery-header">
          <div>
            <span className="eyebrow"><FolderKanban size={16} /> CEO Dashboard</span>
            <h2>لوحة متابعة الشركة</h2>
          </div>
          <div className="dashboard-actions">
            <NotificationCenter />
            <Link className="secondary-btn" href="/dashboard">فتح Dashboard</Link>
            <Link className="secondary-btn" href="/enterprise-os">Enterprise OS</Link>
            <Link className="secondary-btn" href="/departments/finance">Accounting OS</Link>
            <Link className="secondary-btn" href="/departments/executive">CEO Office</Link>
            <Link className="secondary-btn" href="/departments/marketing">Marketing OS</Link>
            <Link className="secondary-btn" href="/departments/sales">
              <Users size={16} /> CRM
            </Link>
            <Link className="secondary-btn" href="/departments/procurement">
              <PackageSearch size={16} /> المشتريات والمخزون
            </Link>
            <Link className="secondary-btn" href="/departments/government-relations">
              <Landmark size={16} /> العلاقات الحكومية
            </Link>
            <Link className="secondary-btn" href="/bi-center">
              <BarChart3 size={16} /> BI موحد
            </Link>
            <button className="secondary-btn" onClick={loadDashboard} type="button">تحديث اللوحة</button>
          </div>
        </div>

        <div className="finance-summary">
          <DashboardMetric title="المشاريع" value={dashboard?.projects.length ?? 0} />
          <DashboardMetric title="المهام" value={dashboard?.tasks.length ?? 0} />
          <DashboardMetric title="القرارات المالية" value={dashboard?.decisions.length ?? 0} />
        </div>
      </section>

      <BIForm />

      <ExecutiveReport />

      <AgentMemoryPanel />

      <IntegrationsPanel />
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
