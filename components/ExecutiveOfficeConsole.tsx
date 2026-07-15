"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
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
import Link from "next/link";
import ActionableMetricGrid, { type ActionableMetric } from "./ActionableMetricGrid";

type OfficeData = {
  operatingBrief?: {
    healthScore: number;
    riskLevel: string;
    actionToday: string;
    pendingItems: number;
    waitingApprovals: number;
    highRisks: number;
    lateTasks: number;
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
  calendarEvents?: Array<{ id: string; title: string; event_type: string; starts_at: string; status: string; notes?: string }>;
  meetingMinutes?: Array<{ id: string; title: string; decisions?: string; meeting_date: string }>;
  dailyBriefs?: Array<{ id: string; brief_type: string; summary: string; brief_date: string }>;
  auditLog?: Array<{ id: string; decision_type: string; action: string; approval_status: string; created_at: string }>;
};

type DatabaseIssue = {
  isPreview: boolean;
  productionUrl: string | null;
  missingEnvironmentVariables: string[];
  message: string;
};

function databaseIssueFromResponse(json: Record<string, unknown>): DatabaseIssue | null {
  if (json.code !== "SUPABASE_NOT_CONFIGURED") return null;
  const deployment = (json.deployment || {}) as Record<string, unknown>;
  return {
    isPreview: deployment.isPreview === true,
    productionUrl: typeof deployment.productionUrl === "string" ? deployment.productionUrl : null,
    missingEnvironmentVariables: Array.isArray(json.missingEnvironmentVariables)
      ? json.missingEnvironmentVariables.filter((item): item is string => typeof item === "string")
      : [],
    message: typeof json.error === "string" ? json.error : "قاعدة البيانات غير مهيأة لهذا النشر.",
  };
}

function apiErrorMessage(json: Record<string, unknown>, fallback: string) {
  return typeof json.error === "string" ? json.error : fallback;
}

export default function ExecutiveOfficeConsole() {
  const [data, setData] = useState<OfficeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [databaseIssue, setDatabaseIssue] = useState<DatabaseIssue | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/executive-office", { cache: "no-store", signal });
      const json = (await res.json()) as Record<string, unknown>;
      const issue = databaseIssueFromResponse(json);
      if (issue) {
        setData(null);
        setDatabaseIssue(issue);
        return;
      }
      if (!res.ok || !json.ok) throw new Error(apiErrorMessage(json, "تعذر تحميل مكتب المدير التنفيذي."));
      setData(json as unknown as OfficeData);
      setDatabaseIssue(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "تعذر تحميل مكتب المدير التنفيذي.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  async function run(action: string, payload: Record<string, unknown> = {}) {
    if (databaseIssue) return false;
    setWorking(action);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/executive-office", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const json = (await res.json()) as Record<string, unknown>;
      const issue = databaseIssueFromResponse(json);
      if (issue) {
        setData(null);
        setDatabaseIssue(issue);
        return false;
      }
      if (!res.ok || !json.ok) throw new Error(apiErrorMessage(json, "تعذر تنفيذ أمر مكتب CEO."));
      setMessage(successText(action));
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تنفيذ أمر مكتب CEO.");
      return false;
    } finally {
      setWorking("");
    }
  }

  function submitDirective(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(event.currentTarget);
    void run("create-item", {
      data: {
        title: String(form.get("title") || ""),
        notes: String(form.get("notes") || ""),
        priority: String(form.get("priority") || "HIGH"),
        itemType: "CEO_DIRECTIVE",
        ownerRole: "CEO Office",
        dueDays: Number(form.get("dueDays") || 1),
      },
    }).then((succeeded) => {
      if (succeeded) formElement.reset();
    });
  }

  function submitExecution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(event.currentTarget);
    void run("execute", { request: String(form.get("request") || "") }).then((succeeded) => {
      if (succeeded) formElement.reset();
    });
  }

  function submitCalendar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(event.currentTarget);
    void run("calendar-event", {
      data: {
        title: String(form.get("title") || ""),
        eventType: String(form.get("eventType") || "FOLLOW_UP"),
        startsAt: String(form.get("startsAt") || ""),
        durationMinutes: Number(form.get("durationMinutes") || 30),
        notes: String(form.get("notes") || ""),
      },
    }).then((succeeded) => {
      if (succeeded) formElement.reset();
    });
  }

  function submitMinutes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(event.currentTarget);
    void run("meeting-minutes", {
      data: {
        title: String(form.get("title") || ""),
        attendees: String(form.get("attendees") || "CEO Office,CFO,Marketing Director")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        decisions: String(form.get("decisions") || ""),
        actionItems: [{ title: String(form.get("actionItem") || "Follow up decision"), owner: "Chief of Staff" }],
      },
    }).then((succeeded) => {
      if (succeeded) formElement.reset();
    });
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const brief = data?.operatingBrief;
  const databaseReady = Boolean(data && !databaseIssue);

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
              <Target size={16} /> صحة الشركة {brief ? `${brief.healthScore}/100` : "—"}
            </span>
            <span>
              <ShieldAlert size={16} /> المخاطر {brief?.riskLevel || "—"}
            </span>
          </div>
        </div>
        <div className="department-badge">
          <strong>CEO Office</strong>
          <small className={databaseReady ? "" : "is-warning"}>
            {databaseReady ? "Command ready" : loading ? "جارٍ التحقق" : databaseIssue?.isPreview ? "Preview isolated" : "Database required"}
          </small>
        </div>
      </section>

      <section className="enterprise-actions">
        <button className="secondary-btn" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
          تحديث المكتب
        </button>
        <button className="primary-btn" onClick={() => void run("radar")} disabled={Boolean(working) || !databaseReady}>
          {working === "radar" ? <Loader2 className="spin" size={18} /> : <Radar size={18} />}
          تشغيل رادار الفرص
        </button>
        <button className="secondary-btn" onClick={() => void run("daily-brief", { briefType: "MORNING" })} disabled={Boolean(working) || !databaseReady}>
          {working === "daily-brief" ? <Loader2 className="spin" size={18} /> : <ClipboardList size={18} />}
          ملخص صباحي
        </button>
        <button className="secondary-btn" onClick={() => void run("daily-brief", { briefType: "END_OF_DAY" })} disabled={Boolean(working) || !databaseReady}>
          {working === "daily-brief" ? <Loader2 className="spin" size={18} /> : <CalendarCheck size={18} />}
          ملخص نهاية اليوم
        </button>
        {databaseIssue && (
          <div className="status-banner warn executive-database-status" role="status">
            <span className="status-dot warn" />
            <div>
              <strong>{databaseIssue.isPreview ? "نسخة المعاينة معزولة عن بيانات الإنتاج" : "اتصال قاعدة البيانات مطلوب"}</strong>
              <p>{databaseIssue.message}</p>
              <div className="executive-database-status__actions">
                {databaseIssue.isPreview && databaseIssue.productionUrl ? (
                  <a className="secondary-btn btn-sm" href={databaseIssue.productionUrl}>فتح النسخة الإنتاجية</a>
                ) : (
                  <Link className="secondary-btn btn-sm" href="/status">فتح حالة النظام</Link>
                )}
              </div>
              {databaseIssue.missingEnvironmentVariables.length > 0 && (
                <small>المتغيرات المطلوبة في بيئة النشر: {databaseIssue.missingEnvironmentVariables.join("، ")}</small>
              )}
            </div>
          </div>
        )}
        {message && <p className="notice done">{message}</p>}
        {error && <p className="notice error">{error}</p>}
      </section>

      {data && (
        <>
          <ActionableMetricGrid metrics={buildOfficeMetrics(data, brief)} />

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

        <form className="ops-card" onSubmit={submitCalendar}>
          <h2>تقويم CEO</h2>
          <div className="ops-form-grid">
            <label>
              العنوان
              <input className="input" name="title" placeholder="مراجعة أسبوعية للأداء" required />
            </label>
            <label>
              النوع
              <select className="input" name="eventType" defaultValue="FOLLOW_UP">
                <option value="FOLLOW_UP">متابعة</option>
                <option value="APPROVAL_REVIEW">اعتماد</option>
                <option value="OPPORTUNITY_REVIEW">فرصة</option>
                <option value="BUSINESS_REVIEW">مراجعة أعمال</option>
              </select>
            </label>
            <label>
              الموعد
              <input className="input" name="startsAt" type="datetime-local" />
            </label>
            <label>
              المدة بالدقائق
              <input className="input" name="durationMinutes" type="number" min="15" max="180" defaultValue="30" />
            </label>
          </div>
          <label>
            ملاحظات
            <input className="input" name="notes" placeholder="ما المطلوب في الاجتماع؟" />
          </label>
          <button className="secondary-btn" disabled={Boolean(working)}>
            {working === "calendar-event" ? <Loader2 className="spin" size={18} /> : <CalendarCheck size={18} />}
            إضافة للتقويم
          </button>
        </form>

        <form className="ops-card" onSubmit={submitMinutes}>
          <h2>محضر اجتماع</h2>
          <label>
            عنوان الاجتماع
            <input className="input" name="title" placeholder="محضر مراجعة حملة التسويق" required />
          </label>
          <label>
            الحضور
            <input className="input" name="attendees" defaultValue="CEO Office,CFO,Marketing Director" />
          </label>
          <label>
            القرارات
            <textarea className="textarea compact" name="decisions" placeholder="اكتب القرارات التنفيذية..." />
          </label>
          <label>
            إجراء مطلوب
            <input className="input" name="actionItem" placeholder="إرسال تقرير KPI إلى CEO" />
          </label>
          <button className="secondary-btn" disabled={Boolean(working)}>
            {working === "meeting-minutes" ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}
            حفظ المحضر
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

      <section className="ops-board">
        <Panel title="تقويم CEO">
          {(data?.calendarEvents || []).slice(0, 8).map((event) => (
            <Statement key={event.id} label={`${event.title} - ${new Date(event.starts_at).toLocaleString("ar-SA")}`} value={event.status} />
          ))}
        </Panel>
        <Panel title="الملخصات والمحاضر">
          {(data?.dailyBriefs || []).slice(0, 4).map((brief) => (
            <Statement key={brief.id} label={`${brief.brief_type}: ${brief.summary}`} value={brief.brief_date} />
          ))}
          {(data?.meetingMinutes || []).slice(0, 4).map((minutes) => (
            <Statement key={minutes.id} label={minutes.title} value={minutes.meeting_date} />
          ))}
        </Panel>
        <Panel title="سجل قرارات الحوكمة">
          {(data?.auditLog || []).slice(0, 8).map((audit) => (
            <Statement key={audit.id} label={`${audit.decision_type}: ${audit.action}`} value={audit.approval_status} />
          ))}
        </Panel>
      </section>
        </>
      )}
    </main>
  );
}

function successText(action: string) {
  if (action === "radar") return "تم تشغيل رادار الفرص وربطه بمكتب CEO.";
  if (action === "execute") return "تم تحويل الأمر التنفيذي إلى مشروع ومهام واعتمادات.";
  if (action === "create-item") return "تمت إضافة التوجيه لمكتب CEO.";
  if (action === "update-item") return "تم تحديث بند المتابعة.";
  if (action === "calendar-event") return "تمت إضافة الموعد إلى تقويم CEO.";
  if (action === "meeting-minutes") return "تم حفظ محضر الاجتماع.";
  if (action === "daily-brief") return "تم توليد الملخص التنفيذي.";
  return "تم تنفيذ العملية.";
}

function buildOfficeMetrics(data: OfficeData | null, brief: OfficeData["operatingBrief"]): ActionableMetric[] {
  const dashboard = data?.dashboard;
  const ceoItems = data?.enterprise?.ceoItems || [];
  const tasks = dashboard?.tasks || [];
  const projects = dashboard?.projects || [];
  const approvals = dashboard?.approvals || [];
  const alerts = dashboard?.alerts || [];

  const lateTasks = tasks.filter((t) => t.status !== "DONE" && t.status !== "COMPLETED");
  const highRisks = alerts.filter((a) => ["HIGH", "CRITICAL"].includes((a.severity || "").toUpperCase()));

  return [
    {
      key: "ceo-items",
      icon: CalendarCheck,
      label: "بنود متابعة CEO",
      value: brief?.pendingItems ?? ceoItems.length,
      sourceType: "ceo-item",
      items: ceoItems.map((c) => ({
        id: c.id,
        title: c.title,
        subtitle: `${c.item_type || "بند"} · ${c.status}`,
        context: { requestedBy: "مكتب الرئيس التنفيذي", relatedTo: c.item_type || "بند متابعة", origin: c.notes },
      })),
    },
    {
      key: "approvals",
      icon: CheckCircle2,
      label: "اعتمادات تنتظر قرار",
      value: brief?.waitingApprovals ?? approvals.length,
      sourceType: "approval",
      items: approvals.map((a) => ({
        id: a.id,
        title: a.entity_type,
        subtitle: a.status,
        context: { requestedBy: "النظام / القسم المعني", relatedTo: a.entity_type, origin: a.notes || "طلب اعتماد بانتظار قرار الرئيس التنفيذي" },
      })),
    },
    {
      key: "risks",
      icon: ShieldAlert,
      label: "مخاطر مرتفعة",
      value: brief?.highRisks ?? highRisks.length,
      sourceType: "alert",
      items: highRisks.map((a) => ({
        id: a.id,
        title: a.title,
        subtitle: a.severity,
        context: { requestedBy: "محرّك التنبيهات", relatedTo: "إدارة المخاطر", origin: a.message },
      })),
    },
    {
      key: "projects",
      icon: BriefcaseBusiness,
      label: "مشاريع نشطة",
      value: brief?.activeProjects ?? projects.length,
      sourceType: "project",
      items: projects.map((p) => ({
        id: p.id,
        title: p.name,
        subtitle: p.status || "ACTIVE",
        context: { requestedBy: "إدارة المشاريع", relatedTo: p.name, origin: `مشروع نشط${p.risk_level ? ` · مستوى المخاطر ${p.risk_level}` : ""}` },
      })),
    },
    {
      key: "late-tasks",
      icon: ClipboardList,
      label: "مهام متأخرة",
      value: brief?.lateTasks ?? lateTasks.length,
      sourceType: "task",
      items: lateTasks.map((t) => ({
        id: t.id,
        title: t.title || t.content || "مهمة",
        subtitle: t.status,
        context: { requestedBy: t.owner_role || "فريق التنفيذ", relatedTo: "خطة التنفيذ", origin: t.content || "مهمة تنفيذية متأخرة" },
      })),
    },
  ];
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
