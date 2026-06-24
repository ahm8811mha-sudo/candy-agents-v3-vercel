"use client";

import { FormEvent, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, BriefcaseBusiness, CheckCircle2, LayoutDashboard, Loader2, RefreshCw, Send, Sparkles } from "lucide-react";
import Link from "next/link";

type Project = {
  id: string;
  name: string;
  status?: string;
  created_at?: string;
};

type Task = {
  id: string;
  title?: string;
  content?: string;
  description?: string;
  status?: string;
  priority?: string;
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
  projects: Project[];
  tasks: Task[];
  decisions: Decision[];
};

type ExecutionResult = {
  project?: Project;
  task?: Task;
};

const emptyData: DashboardData = {
  financials: { income: 0, expenses: 0, profit: 0, transactionCount: 0 },
  projects: [],
  tasks: [],
  decisions: [],
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
        projects: json.projects || [],
        tasks: json.tasks || [],
        decisions: json.decisions || [],
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
      const res = await fetch("/api/company-execution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

        <section className="apple-metrics" aria-label="Financial cards">
          <Card title="Revenue" value={currency.format(Number(data.financials.income) || 0)} tone="blue" />
          <Card title="Expenses" value={currency.format(Number(data.financials.expenses) || 0)} tone="red" />
          <Card title="Profit" value={currency.format(Number(data.financials.profit) || 0)} tone={data.financials.profit >= 0 ? "green" : "red"} />
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
              <span>تم إنشاء مشروع: {lastResult.project.name}</span>
            </div>
          )}

          {error && <p className="apple-error">{error}</p>}
        </section>

        <div className="apple-sections">
          <Section title="Projects" count={data.projects.length}>
            {data.projects.length === 0 && <EmptyRow text="لا توجد مشاريع محفوظة بعد." />}
            {data.projects.map((project) => (
              <Item key={project.id} title={project.name} meta={project.status || "ACTIVE"} />
            ))}
          </Section>

          <Section title="Tasks" count={data.tasks.length}>
            {data.tasks.length === 0 && <EmptyRow text="لا توجد مهام محفوظة بعد." />}
            {data.tasks.map((task) => (
              <Item
                key={task.id}
                title={task.title || "مهمة تنفيذية"}
                text={shortText(task.content || task.description || "")}
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
