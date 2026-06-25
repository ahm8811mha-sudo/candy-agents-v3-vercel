"use client";

import { FormEvent, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Plus,
  Radar,
  RefreshCw,
  ShieldAlert,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

type OfficeData = {
  operatingBrief?: {
    healthScore: number;
    riskLevel: string;
    actionToday: string;
    pendingItems: number;
    waitingApprovals: number;
    highRisks: number;
    activeProjects: number;
  };
  enterprise?: {
    ceoItems?: Array<{ id: string; title: string; status: string; priority: string; item_type: string; notes?: string }>;
    opportunityRuns?: Array<{ id: string; status: string; signal_summary: string; recommended_opportunity?: any }>;
    strategy?: { focus?: string; investment_thesis?: string };
  };
  dashboard?: {
    projects?: Array<{ id: string; name: string; status?: string; risk_level?: string; created_at?: string }>;
    tasks?: Array<{ id: string; title?: string; content?: string; status: string; owner_role?: string; priority?: string }>;
    approvals?: Array<{ id: string; entity_type: string; status: string; notes?: string }>;
    actions?: Array<{ id: string; title: string; status: string; approval_status?: string; provider?: string }>;
    alerts?: Array<{ id: string; severity: string; title: string; message: string }>;
    kpis?: Array<{ id: string; name: string; target: number; current?: number; unit: string; status: string }>;
  };
};

export default function ExecutiveOfficeConsole() {
  const [data, setData] = useState<OfficeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/executive-office", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تحميل مكتب المدير التنفيذي.");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل مكتب المدير التنفيذي.");
    } finally {
      setLoading(false);
    }
  }

  async function run(action: string, payload: Record<string, unknown> = {}) {
    setWorking(action);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/executive-office", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تنفيذ أمر مكتب CEO.");
      setMessage(successText(action));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تنفيذ أمر مكتب CEO.");
    } finally {
      setWorking("");
    }
  }

  function submitDirective(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run("create-item", {
      data: {
        title: String(form.get("title") || ""),
        notes: String(form.get("notes") || ""),
        priority: String(form.get("priority") || "HIGH"),
        itemType: "CEO_DIRECTIVE",
        ownerRole: "CEO Office",
        dueDays: Number(form.get("dueDays") || 1),
      },
    }).then(() => event.currentTarget.reset());
  }

  function submitExecution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run("execute", { request: String(form.get("request") || "") }).then(() => event.currentTarget.reset());
  }

  useEffect(() => {
    load();
  }, []);

  const brief = data?.operatingBrief;

  return (
    <main className="company-app ops-console">
      <section className="department-hero department-hero-live">
        <div>
          <Link className="back-link" href="/">
            <ArrowRight size={16} /> العودة للشركة
          </Link>
          <span className="eyebrow">
            <BriefcaseBusiness size={16} /> مكتب المدير التنفيذي
          </span>
          <h1>واجهة تنفيذية لإدارة الشركة</h1>
          <p>
            مكتب CEO يراقب المشاريع، الاعتمادات، المخاطر، الفرص، الأداء، ويوجه الإدارات التنفيذية من شاشة واحدة.
          </p>
          <div className="department-hero-actions">
            <span>
              <Target size={16} /> صحة الشركة {brief?.healthScore || 0}/100
            </span>
            <span>
              <ShieldAlert size={16} /> المخاطر {brief?.riskLevel || "LOW"}
            </span>
          </div>
        </div>
        <div className="department-badge">
          <strong>CEO Office</strong>
          <small>Command ready</small>
        </div>
      </section>

      <section className="enterprise-actions">
        <button className="secondary-btn" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
          تحديث المكتب
        </button>
        <button className="primary-btn" onClick={() => run("radar")} disabled={Boolean(working)}>
          {working === "radar" ? <Loader2 className="spin" size={18} /> : <Radar size={18} />}
          تشغيل رادار الفرص
        </button>
        {message && <p className="notice done">{message}</p>}
        {error && <p className="notice error">{error}</p>}
      </section>

      <section className="ops-metrics">
        <Metric icon={CalendarCheck} label="بنود متابعة CEO" value={brief?.pendingItems || 0} />
        <Metric icon={CheckCircle2} label="اعتمادات تنتظر قرار" value={brief?.waitingApprovals || 0} />
        <Metric icon={ShieldAlert} label="مخاطر مرتفعة" value={brief?.highRisks || 0} />
        <Metric icon={BriefcaseBusiness} label="مشاريع نشطة" value={brief?.activeProjects || 0} />
      </section>

      <section className="ops-card executive-brief">
        <span className="eyebrow">
          <ClipboardList size={16} /> توجيه اليوم
        </span>
        <h2>{brief?.actionToday || "لا يوجد توجيه تنفيذي بعد."}</h2>
        <p>{data?.enterprise?.strategy?.investment_thesis}</p>
      </section>

      <section className="ops-workbench">
        <form className="ops-card" onSubmit={submitExecution}>
          <h2>تشغيل طلب شركة كامل</h2>
          <label>
            أمر تنفيذي
            <textarea
              className="textarea"
              name="request"
              placeholder="مثال: أطلق تجربة بيع منتج هدايا بميزانية 10,000 ريال مع خطة تسويق وتشغيل"
              required
            />
          </label>
          <button className="primary-btn" disabled={Boolean(working)}>
            {working === "execute" ? <Loader2 className="spin" size={18} /> : <BriefcaseBusiness size={18} />}
            تحويل الأمر إلى مشروع ومهام واعتمادات
          </button>
        </form>

        <form className="ops-card" onSubmit={submitDirective}>
          <h2>إضافة متابعة أو توجيه CEO</h2>
          <div className="ops-form-grid">
            <label>
              العنوان
              <input className="input" name="title" placeholder="مراجعة حملة التسويق التجريبية" required />
            </label>
            <label>
              الأولوية
              <select className="input" name="priority" defaultValue="HIGH">
                <option value="URGENT">عاجل</option>
                <option value="HIGH">مرتفع</option>
                <option value="MEDIUM">متوسط</option>
              </select>
            </label>
            <label>
              الاستحقاق بعد
              <input className="input" name="dueDays" type="number" min="1" max="30" defaultValue="1" />
            </label>
          </div>
          <label>
            ملاحظات
            <input className="input" name="notes" placeholder="ما الذي يجب أن يتابعه مكتب CEO؟" />
          </label>
          <button className="secondary-btn" disabled={Boolean(working)}>
            {working === "create-item" ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}
            إضافة للمكتب
          </button>
        </form>
      </section>

      <section className="ops-board">
        <Panel title="متابعات مكتب CEO">
          {(data?.enterprise?.ceoItems || []).slice(0, 9).map((item) => (
            <ActionRow
              key={item.id}
              title={item.title}
              meta={`${item.item_type} - ${item.priority} - ${item.status}`}
              actionLabel="إغلاق"
              onAction={() => run("update-item", { id: item.id, status: "DONE" })}
              disabled={Boolean(working)}
            />
          ))}
        </Panel>
        <Panel title="المشاريع والمهام">
          {(data?.dashboard?.projects || []).slice(0, 4).map((project) => (
            <Statement key={project.id} label={project.name} value={project.status || "ACTIVE"} />
          ))}
          {(data?.dashboard?.tasks || []).slice(0, 6).map((task) => (
            <Statement key={task.id} label={task.title || task.content || "مهمة"} value={task.status} />
          ))}
        </Panel>
        <Panel title="الاعتمادات والمخاطر">
          {(data?.dashboard?.approvals || []).slice(0, 4).map((approval) => (
            <Statement key={approval.id} label={approval.entity_type} value={approval.status} />
          ))}
          {(data?.dashboard?.alerts || []).slice(0, 5).map((alert) => (
            <Statement key={alert.id} label={alert.title} value={alert.severity} />
          ))}
        </Panel>
      </section>

      <section className="ops-board two">
        <Panel title="رادار الفرص">
          {(data?.enterprise?.opportunityRuns || []).slice(0, 6).map((run) => (
            <Statement key={run.id} label={run.signal_summary} value={run.status} />
          ))}
        </Panel>
        <Panel title="مؤشرات الأداء">
          {(data?.dashboard?.kpis || []).slice(0, 8).map((kpi) => (
            <Statement key={kpi.id} label={kpi.name} value={`${kpi.current || 0}/${kpi.target} ${kpi.unit}`} />
          ))}
        </Panel>
      </section>
    </main>
  );
}

function successText(action: string) {
  if (action === "radar") return "تم تشغيل رادار الفرص وربطه بمكتب CEO.";
  if (action === "execute") return "تم تحويل الأمر التنفيذي إلى مشروع ومهام واعتمادات.";
  if (action === "create-item") return "تمت إضافة التوجيه لمكتب CEO.";
  if (action === "update-item") return "تم تحديث بند المتابعة.";
  return "تم تنفيذ العملية.";
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <article className="metric-card green">
      <span>
        <Icon size={20} />
      </span>
      <small>{label}</small>
      <strong>{value}</strong>
    </article>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="ops-card">
      <h2>{title}</h2>
      <div className="statement-list">{children}</div>
    </section>
  );
}

function Statement({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="statement-row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function ActionRow({
  title,
  meta,
  actionLabel,
  onAction,
  disabled,
}: {
  title: string;
  meta: string;
  actionLabel: string;
  onAction: () => void;
  disabled: boolean;
}) {
  return (
    <div className="statement-row action">
      <span>
        <b>{title}</b>
        <small>{meta}</small>
      </span>
      <button className="secondary-btn" onClick={onAction} disabled={disabled}>
        {actionLabel}
      </button>
    </div>
  );
}
