"use client";

import { FormEvent, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, BriefcaseBusiness, CheckCircle2, LayoutDashboard, Loader2, RefreshCw, Send, Sparkles } from "lucide-react";
import Link from "next/link";

type Project = {
  id: string;
  project_number?: number | null;
  project_date?: string | null;
  name: string;
  status?: string;
  created_at?: string;
};

type Task = {
  id: string;
  task_number?: string | null;
  task_date?: string | null;
  title?: string;
  content?: string;
  description?: string;
  status?: string;
  priority?: string;
  owner_role?: string;
  kpi_name?: string;
  kpi_target?: number;
  progress_percent?: number;
};

type Decision = {
  id: string;
  request?: string;
  cfo_report?: string;
  ceo_decision?: string;
  created_at?: string;
};

type DashboardData = {
  financials: {
    income: number;
    expenses: number;
    profit: number;
    transactionCount?: number;
  };
  commandCenter: {
    healthScore: number;
    actionToday: string;
    riskLevel: string;
    expenseRatio: number;
    profitMargin: number;
    runwayMonths: number;
    burnRate: number;
    approval: {
      gate: string;
      requiredRole: string;
      reason: string;
      budget: number;
    };
  };
  projects: Project[];
  tasks: Task[];
  decisions: Decision[];
  alerts: Array<{
    id: string;
    severity: string;
    title: string;
    message: string;
    status?: string;
  }>;
  kpis: Array<{
    id: string;
    name: string;
    target: number;
    current: number;
    unit: string;
    status: string;
  }>;
  actions: Array<{
    id: string;
    action_number?: string | null;
    action_date?: string | null;
    title: string;
    description?: string;
    status: string;
    execution_mode: string;
    provider?: string;
    approval_status?: string;
  }>;
  approvals: Array<{
    id: string;
    entity_type: string;
    status: string;
    notes?: string;
  }>;
  memory: Array<{
    id: string;
    title: string;
    summary?: string;
    decision_quality?: string;
  }>;
};

type ExecutionResult = {
  project?: Project;
  task?: Task;
};

const emptyData: DashboardData = {
  financials: { income: 0, expenses: 0, profit: 0, transactionCount: 0 },
  commandCenter: {
    healthScore: 0,
    actionToday: "بانتظار تحميل بيانات الشركة.",
    riskLevel: "LOW",
    expenseRatio: 0,
    profitMargin: 0,
    runwayMonths: 0,
    burnRate: 0,
    approval: { gate: "AUTO", requiredRole: "NONE", reason: "لا توجد موافقة مطلوبة.", budget: 0 },
  },
  projects: [],
  tasks: [],
  decisions: [],
  alerts: [],
  kpis: [],
  actions: [],
  approvals: [],
  memory: [],
};

const currency = new Intl.NumberFormat("ar-SA", {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 0,
});

export default function Dashboard() {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [input, setInput] = useState("اطلق مشروع متجر إلكتروني تجريبي بميزانية 50,000 ريال وحوله إلى مهام تنفيذية.");
  const [loadingData, setLoadingData] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState<ExecutionResult | null>(null);

  const status = running ? "الشركة تعمل الآن" : lastResult?.project ? "تم إنشاء مشروع" : "جاهز للتشغيل";

  async function fetchData() {
    setLoadingData(true);
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تحميل لوحة CEO.");
      setData({
        financials: json.financials || emptyData.financials,
        commandCenter: json.commandCenter || emptyData.commandCenter,
        projects: json.projects || [],
        tasks: json.tasks || [],
        decisions: json.decisions || [],
        alerts: json.alerts || [],
        kpis: json.kpis || [],
        actions: json.actions || [],
        approvals: json.approvals || [],
        memory: json.memory || [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل لوحة CEO.");
    } finally {
      setLoadingData(false);
    }
  }

  async function runAI(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.trim()) return;

    setRunning(true);
    setError("");
    setLastResult(null);

    try {
      const res = await fetch("/api/owner-execution", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ request: input.trim() }),
      });

      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.error || "تعذر تشغيل الشركة.");
      setLastResult({ project: result.project, task: result.task });
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تشغيل الشركة.");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <main className="apple-dashboard">
      <div className="apple-shell">
        <header className="apple-header">
          <div>
            <Link className="apple-back" href="/"><ArrowRight size={16} /> العودة للشركة</Link>
            <span className="apple-eyebrow"><LayoutDashboard size={16} /> CEO Dashboard</span>
            <h1>لوحة الرئيس التنفيذي</h1>
            <p>متابعة مالية وتشغيلية للشركة، وتشغيل وكلاء الذكاء الاصطناعي لإنشاء مشاريع ومهام تنفيذية.</p>
          </div>
          <div className="apple-status">
            <CheckCircle2 size={18} />
            <span>{status}</span>
          </div>
        </header>

        <section className="apple-metrics extended" aria-label="Financial cards">
          <Card title="Health Score" value={`${data.commandCenter.healthScore}/100`} tone={data.commandCenter.healthScore >= 70 ? "green" : data.commandCenter.healthScore >= 45 ? "blue" : "red"} />
          <Card title="Revenue" value={currency.format(Number(data.financials.income) || 0)} tone="blue" />
          <Card title="Expenses" value={currency.format(Number(data.financials.expenses) || 0)} tone="red" />
          <Card title="Profit" value={currency.format(Number(data.financials.profit) || 0)} tone={data.financials.profit >= 0 ? "green" : "red"} />
        </section>

        <section className="apple-command-center">
          <div className="apple-command-main">
            <span className="apple-eyebrow"><Sparkles size={16} /> Recommended Action Today</span>
            <h2>{data.commandCenter.actionToday}</h2>
            <p>{data.commandCenter.approval.reason}</p>
          </div>
          <div className="apple-signal-grid">
            <Signal title="Risk" value={data.commandCenter.riskLevel} />
            <Signal title="Approval" value={data.commandCenter.approval.gate} />
            <Signal title="Expense Ratio" value={`${Math.round(data.commandCenter.expenseRatio * 100)}%`} />
            <Signal title="Runway" value={`${Number(data.commandCenter.runwayMonths || 0).toFixed(1)} شهر`} />
          </div>
        </section>

        <section className="apple-control">
          <div className="apple-section-heading">
            <div>
              <span className="apple-eyebrow"><Sparkles size={16} /> Run AI Company</span>
              <h2>تشغيل الشركة</h2>
            </div>
            <button className="apple-icon-button" onClick={fetchData} type="button" disabled={loadingData} aria-label="تحديث البيانات">
              {loadingData ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
            </button>
          </div>

          <form className="apple-command" onSubmit={runAI}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="مثلاً: اطلق مشروع متجر إلكتروني..."
              required
            />
            <button disabled={running || !input.trim()}>
              {running ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
              {running ? "جاري التشغيل" : "تشغيل الشركة"}
            </button>
          </form>

          {lastResult?.project && (
            <div className="apple-result">
              <BriefcaseBusiness size={18} />
              <span>
                تم إنشاء {lastResult.project.project_number ? `المشروع #${lastResult.project.project_number}: ` : "مشروع: "}
                {lastResult.project.name}
                {lastResult.project.project_date ? ` · ${formatDate(lastResult.project.project_date)}` : ""}
              </span>
            </div>
          )}

          {error && <p className="apple-error">{error}</p>}
        </section>

        <div className="apple-sections">
          <Section title="Alerts" count={data.alerts.length}>
            {data.alerts.length === 0 && <EmptyRow text="لا توجد تنبيهات مفتوحة." />}
            {data.alerts.map((alert) => (
              <AlertItem key={alert.id} severity={alert.severity} title={alert.title} text={alert.message} />
            ))}
          </Section>

          <Section title="Approvals" count={data.approvals.length}>
            {data.approvals.length === 0 && <EmptyRow text="لا توجد موافقات معلقة." />}
            {data.approvals.map((approval) => (
              <Item key={approval.id} title={approval.entity_type} text={approval.notes || ""} meta={approval.status} />
            ))}
          </Section>

          <Section title="KPIs" count={data.kpis.length}>
            {data.kpis.length === 0 && <EmptyRow text="لا توجد مؤشرات أداء بعد." />}
            {data.kpis.map((kpi) => (
              <KpiItem key={kpi.id} name={kpi.name} current={Number(kpi.current) || 0} target={Number(kpi.target) || 0} unit={kpi.unit} status={kpi.status} />
            ))}
          </Section>

          <Section title="Business Actions" count={data.actions.length}>
            {data.actions.length === 0 && <EmptyRow text="لا توجد إجراءات تجارية جاهزة." />}
            {data.actions.map((action) => (
              <Item
                key={action.id}
                title={`${action.action_number ? `#${action.action_number} · ` : ""}${action.title}`}
                text={`${action.action_date ? `${formatDate(action.action_date)} · ` : ""}${action.description || ""}`}
                meta={`${action.status} · ${action.provider || action.execution_mode}`}
              />
            ))}
          </Section>

          <Section title="Projects" count={data.projects.length}>
            {data.projects.length === 0 && <EmptyRow text="لا توجد مشاريع محفوظة بعد." />}
            {data.projects.map((project) => (
              <Item
                key={project.id}
                title={`${project.project_number ? `#${project.project_number} · ` : ""}${project.name}`}
                text={formatDate(project.project_date || project.created_at)}
                meta={project.status || "ACTIVE"}
              />
            ))}
          </Section>

          <Section title="Tasks" count={data.tasks.length}>
            {data.tasks.length === 0 && <EmptyRow text="لا توجد مهام محفوظة بعد." />}
            {data.tasks.map((task) => (
              <Item
                key={task.id}
                title={`${task.task_number ? `#${task.task_number} · ` : ""}${task.title || "مهمة تنفيذية"}`}
                text={`${task.task_date ? `${formatDate(task.task_date)} · ` : ""}${shortText(task.content || task.description || "")}`}
                meta={task.status || "TODO"}
              />
            ))}
          </Section>

          <Section title="Decisions" count={data.decisions.length}>
            {data.decisions.length === 0 && <EmptyRow text="لا توجد قرارات محفوظة بعد." />}
            {data.decisions.map((decision) => (
              <Item
                key={decision.id}
                title={decision.request || "قرار تنفيذي"}
                text={shortText(decision.ceo_decision || decision.cfo_report || "")}
                meta={formatDate(decision.created_at)}
              />
            ))}
          </Section>

          <Section title="Business Memory" count={data.memory.length}>
            {data.memory.length === 0 && <EmptyRow text="لا توجد ذاكرة تجارية بعد." />}
            {data.memory.map((memory) => (
              <Item key={memory.id} title={memory.title} text={shortText(memory.summary || "")} meta={memory.decision_quality || "WATCH"} />
            ))}
          </Section>
        </div>
      </div>
    </main>
  );
}

function Card({ title, value, tone }: { title: string; value: string; tone: "blue" | "green" | "red" }) {
  return (
    <article className={`apple-card ${tone}`}>
      <p>{title}</p>
      <strong>{value}</strong>
    </article>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="apple-section">
      <div className="apple-section-heading">
        <h2>{title}</h2>
        <span>{count.toLocaleString("ar-SA")}</span>
      </div>
      <div className="apple-list">{children}</div>
    </section>
  );
}

function Item({ title, text, meta }: { title: string; text?: string; meta?: string }) {
  return (
    <article className="apple-item">
      <div>
        <strong>{title}</strong>
        {text && <p>{text}</p>}
      </div>
      {meta && <small>{meta}</small>}
    </article>
  );
}

function Signal({ title, value }: { title: string; value: string }) {
  return (
    <article className="apple-signal">
      <small>{title}</small>
      <strong>{value}</strong>
    </article>
  );
}

function AlertItem({ severity, title, text }: { severity: string; title: string; text: string }) {
  return (
    <article className={`apple-alert ${severity.toLowerCase()}`}>
      <small>{severity}</small>
      <strong>{title}</strong>
      <p>{text}</p>
    </article>
  );
}

function KpiItem({ name, current, target, unit, status }: { name: string; current: number; target: number; unit: string; status: string }) {
  const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  return (
    <article className="apple-kpi">
      <div>
        <strong>{name}</strong>
        <small>{status} · {current.toLocaleString("ar-SA")} / {target.toLocaleString("ar-SA")} {unit}</small>
      </div>
      <span><i style={{ width: `${percent}%` }} /></span>
    </article>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div className="apple-empty-row">{text}</div>;
}

function shortText(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > 150 ? `${text.slice(0, 150)}...` : text;
}

function formatDate(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("ar-SA");
}
