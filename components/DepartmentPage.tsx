"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Gauge,
  Loader2,
  Megaphone,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

type DepartmentId = "marketing" | "operations" | "supply" | "executive";

type Props = {
  title: string;
  subtitle: string;
  badge: string;
  icon: DepartmentId;
  capabilities: string[];
};

type DashboardTask = {
  id: string;
  project_id?: string;
  title?: string;
  content?: string;
  description?: string;
  status?: string;
  priority?: string;
  created_at?: string;
  due_date?: string;
  progress_percent?: number;
  owner_role?: string;
  kpi_name?: string;
  kpi_target?: number;
};

type DashboardKpi = {
  id: string;
  project_id?: string;
  name?: string;
  target?: number;
  current?: number;
  unit?: string;
  status?: string;
  due_date?: string;
};

type DashboardAction = {
  id: string;
  project_id?: string;
  action_type?: string;
  title?: string;
  description?: string;
  status?: string;
  provider?: string;
  execution_mode?: string;
  requires_approval?: boolean;
  approval_status?: string;
};

type DashboardAlert = {
  id: string;
  severity?: string;
  title?: string;
  message?: string;
  source?: string;
};

type DashboardApproval = {
  id: string;
  entity_type?: string;
  entity_id?: string;
  status?: string;
  notes?: string;
};

type DashboardProject = {
  id: string;
  name?: string;
  status?: string;
  risk_level?: string;
  approval_status?: string;
  health_score?: number;
  strategic_direction?: string;
  created_at?: string;
  next_review_at?: string;
};

type DashboardDecision = {
  id: string;
  request?: string;
  ceo_decision?: string;
  cfo_report?: string;
  created_at?: string;
};

type CommandCenter = {
  healthScore?: number;
  riskLevel?: string;
  actionToday?: string;
  runwayMonths?: number;
  expenseRatio?: number;
  profitMargin?: number;
  approval?: {
    gate?: string;
    requiredRole?: string;
    reason?: string;
  };
};

type DashboardData = {
  ok: boolean;
  projects: DashboardProject[];
  tasks: DashboardTask[];
  kpis: DashboardKpi[];
  actions: DashboardAction[];
  alerts: DashboardAlert[];
  approvals: DashboardApproval[];
  decisions: DashboardDecision[];
  commandCenter?: CommandCenter;
};

type DepartmentProfile = {
  heroAction: string;
  prompt: string;
  taskTokens: string[];
  actionTokens: string[];
  kpiTokens: string[];
  emptyTask: string;
  emptyAction: string;
};

type CapabilityInsight = {
  value: string;
  body: string;
  icon: LucideIcon;
  tone: "blue" | "green" | "amber" | "red";
};

const icons: Record<DepartmentId, LucideIcon> = {
  marketing: Megaphone,
  operations: ClipboardList,
  supply: Boxes,
  executive: ShieldCheck,
};

const profiles: Record<DepartmentId, DepartmentProfile> = {
  marketing: {
    heroAction: "تحويل الحملات إلى إجراءات مبيعات قابلة للقياس",
    prompt: "مثال: جهز حملة تسويق تجريبية لمنتج جديد بميزانية 5000 ريال مع KPI واضح",
    taskTokens: ["Marketing", "Growth", "leads", "CAC", "حملة", "تسويق", "عملاء"],
    actionTokens: ["MARKETING", "SALES", "PRICING", "Google", "Meta", "WhatsApp", "Email"],
    kpiTokens: ["lead", "CAC", "عميل", "تحويل", "مبيعات"],
    emptyTask: "لا توجد مهام تسويقية بعد. شغل طلبًا تسويقيًا لإنشاء حملة ومؤشرات.",
    emptyAction: "لا توجد إجراءات حملات جاهزة. سيولد النظام مسودات Google/Meta/WhatsApp عند التشغيل.",
  },
  operations: {
    heroAction: "تحويل القرارات إلى مهام وموارد وجدول زمني",
    prompt: "مثال: نفذ خطة إطلاق متجر إلكتروني خلال 14 يوم مع توزيع الموارد ونقاط مراجعة",
    taskTokens: ["Operations", "Scope", "تشغيل", "نطاق", "تنفيذ", "موارد", "جدول"],
    actionTokens: ["BUDGET_GATE", "PRICING", "INTERNAL"],
    kpiTokens: ["Scope", "Budget", "review", "readiness"],
    emptyTask: "لا توجد مهام تشغيلية بعد. اكتب طلبًا وسيتم تحويله إلى خطة تنفيذ.",
    emptyAction: "لا توجد إجراءات تشغيلية معلقة. سيجهز النظام بوابة الميزانية والخطوات الداخلية.",
  },
  supply: {
    heroAction: "ربط الطلبات بالموردين والمخزون والتكلفة",
    prompt: "مثال: جهز خطة موردين ومخزون لأول 100 طلب مع تكلفة الوحدة ومخاطر التوريد",
    taskTokens: ["Supply", "Supplier", "Inventory", "مورد", "مخزون", "توريد", "لوجست"],
    actionTokens: ["SUPPLIER", "Supplier", "inventory", "مورد"],
    kpiTokens: ["Supplier", "supplier", "inventory", "مورد"],
    emptyTask: "لا توجد مهام إمداد بعد. شغل طلبًا يتضمن مخزونًا أو موردين لإنشاء الخطة.",
    emptyAction: "لا توجد قائمة موردين جاهزة. سيجهز النظام shortlist وربط تكلفة الوحدة عند التشغيل.",
  },
  executive: {
    heroAction: "اعتماد القرار النهائي ومراقبة المخاطر والأداء",
    prompt: "مثال: قيم هل نعتمد مشروع جديد بميزانية 50000 ريال وحدد قرار CEO وخطة التنفيذ",
    taskTokens: ["CEO", "review", "قرار", "مراجعة", "اعتماد"],
    actionTokens: ["BUDGET_GATE", "APPROVAL", "INTERNAL"],
    kpiTokens: ["review", "approval", "Budget", "Scope"],
    emptyTask: "لا توجد مهام تنفيذية بعد. القرارات النهائية تظهر هنا بعد تشغيل الشركة.",
    emptyAction: "لا توجد قرارات بانتظار الاعتماد. عند وجود ميزانية أو خطر سيظهر مسار الموافقة.",
  },
};

const emptyData: DashboardData = {
  ok: true,
  projects: [],
  tasks: [],
  kpis: [],
  actions: [],
  alerts: [],
  approvals: [],
  decisions: [],
};

const statusLabel: Record<string, string> = {
  TODO: "لم تبدأ",
  PENDING: "معلق",
  IN_PROGRESS: "قيد التنفيذ",
  DONE: "مكتملة",
  ACTIVE: "نشط",
  QUEUED: "جاهز",
  WAITING_APPROVAL: "ينتظر اعتماد",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
  NOT_REQUIRED: "لا يحتاج اعتماد",
};

export default function DepartmentPage({ title, subtitle, badge, icon, capabilities }: Props) {
  const Icon = icons[icon];
  const profile = profiles[icon];
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [taskSaving, setTaskSaving] = useState("");
  const [approvalSaving, setApprovalSaving] = useState("");
  const [request, setRequest] = useState("");
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState("");

  const filtered = useMemo(() => filterDepartmentData(data, profile, icon), [data, profile, icon]);
  const insights = useMemo(
    () => buildCapabilityInsights(icon, data, filtered),
    [icon, data, filtered]
  );

  async function loadDashboard() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تحميل بيانات الإدارة.");
      setData({
        ok: true,
        projects: json.projects || [],
        tasks: json.tasks || [],
        kpis: json.kpis || [],
        actions: json.actions || [],
        alerts: json.alerts || [],
        approvals: json.approvals || [],
        decisions: json.decisions || [],
        commandCenter: json.commandCenter,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل بيانات الإدارة.");
    } finally {
      setLoading(false);
    }
  }

  async function runDepartmentRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = request.trim();
    if (!trimmed) return;

    setRunning(true);
    setError("");
    setLastResult("");
    try {
      const res = await fetch("/api/company-execution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: `[${title}] ${trimmed}`,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تشغيل الإدارة.");
      setLastResult(`تم إنشاء مشروع و${json.tasksCreated?.length || 0} مهام و${json.kpis?.length || 0} مؤشرات.`);
      setRequest("");
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تشغيل الإدارة.");
    } finally {
      setRunning(false);
    }
  }

  async function updateTask(id: string, status: "IN_PROGRESS" | "DONE") {
    setTaskSaving(id);
    setError("");
    try {
      const res = await fetch("/api/tasks/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.message || "تعذر تحديث المهمة.");
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحديث المهمة.");
    } finally {
      setTaskSaving("");
    }
  }

  async function decideApproval(id: string, status: "APPROVED" | "REJECTED") {
    setApprovalSaving(id);
    setError("");
    try {
      const res = await fetch("/api/approvals/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, approverId: `${icon}-manager` }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.message || "تعذر تحديث الموافقة.");
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحديث الموافقة.");
    } finally {
      setApprovalSaving("");
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  return (
    <main className="company-app">
      <section className="department-hero department-hero-live">
        <div>
          <Link className="back-link" href="/">
            <ArrowRight size={16} /> العودة للشركة
          </Link>
          <span className="eyebrow">
            <Icon size={16} /> {title}
          </span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
          <div className="department-hero-actions">
            <span>
              <Zap size={16} /> {profile.heroAction}
            </span>
            <span>
              <Gauge size={16} /> صحة الشركة {data.commandCenter?.healthScore ?? 0}/100
            </span>
          </div>
        </div>
        <div className="department-badge">
          <strong>{badge}</strong>
          <small>{data.commandCenter?.riskLevel || "LOW"} Risk</small>
        </div>
      </section>

      <section className="delivery-panel department-live-panel">
        <div className="delivery-header">
          <div>
            <span className="eyebrow">
              <Building2 size={16} /> نظام الإدارة
            </span>
            <h2>مركز تشغيل هذه الصفحة</h2>
          </div>
          <button className="secondary-btn" type="button" onClick={loadDashboard} disabled={loading}>
            {loading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
            تحديث
          </button>
        </div>

        <div className="department-capabilities live">
          {capabilities.map((item, index) => {
            const insight = insights[index] || insights[0];
            const CapabilityIcon = insight.icon;
            return (
              <article className={`employee-card capability-card ${insight.tone}`} key={item}>
                <span>
                  <CapabilityIcon size={18} />
                </span>
                <strong>{item}</strong>
                <small>{insight.body}</small>
                <em>{insight.value}</em>
              </article>
            );
          })}
        </div>
      </section>

      <section className="department-workbench">
        <form className="department-command-card" onSubmit={runDepartmentRequest}>
          <div>
            <span className="eyebrow">
              <Sparkles size={16} /> تشغيل الإدارة الآن
            </span>
            <h2>اطلب نتيجة تنفيذية وليس تعليقًا</h2>
            <p>سيتم إرسال الطلب إلى نظام الشركة، ثم إنشاء مشروع ومهام ومؤشرات وإجراءات تجارية قابلة للمتابعة.</p>
          </div>
          <textarea
            className="textarea"
            value={request}
            onChange={(event) => setRequest(event.target.value)}
            placeholder={profile.prompt}
            required
          />
          <button className="primary-btn" disabled={running}>
            {running ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
            تشغيل الإدارة
          </button>
          {lastResult && <p className="notice done"><CheckCircle2 size={16} /> {lastResult}</p>}
          {error && <p className="notice error">{error}</p>}
        </form>

        <aside className="department-decision-card">
          <span className="eyebrow">
            <ShieldCheck size={16} /> قرار اليوم
          </span>
          <h3>{data.commandCenter?.actionToday || "شغل طلبًا ليظهر القرار التنفيذي التالي."}</h3>
          <div className="department-signal-grid">
            <Signal label="المخاطر" value={data.commandCenter?.riskLevel || "LOW"} />
            <Signal label="بوابة الاعتماد" value={data.commandCenter?.approval?.gate || "AUTO"} />
            <Signal label="المهام النشطة" value={String(filtered.tasks.length)} />
            <Signal label="إجراءات جاهزة" value={String(filtered.actions.length)} />
          </div>
        </aside>
      </section>

      <section className="department-board">
        <BoardColumn title="خطة التنفيذ" count={filtered.tasks.length}>
          {filtered.tasks.length === 0 && <EmptyRow text={profile.emptyTask} />}
          {filtered.tasks.slice(0, 6).map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              saving={taskSaving === task.id}
              onStart={() => updateTask(task.id, "IN_PROGRESS")}
              onDone={() => updateTask(task.id, "DONE")}
            />
          ))}
        </BoardColumn>

        <BoardColumn title="مؤشرات الأداء" count={filtered.kpis.length}>
          {filtered.kpis.length === 0 && <EmptyRow text="لا توجد مؤشرات لهذه الإدارة بعد. ستظهر تلقائيًا مع أول مشروع." />}
          {filtered.kpis.slice(0, 6).map((kpi) => (
            <KpiRow key={kpi.id} kpi={kpi} />
          ))}
        </BoardColumn>

        <BoardColumn title="الإجراءات والاعتماد" count={filtered.actions.length + filtered.approvals.length}>
          {filtered.actions.length === 0 && filtered.approvals.length === 0 && <EmptyRow text={profile.emptyAction} />}
          {filtered.approvals.slice(0, 4).map((approval) => (
            <ApprovalRow
              key={approval.id}
              approval={approval}
              saving={approvalSaving === approval.id}
              onApprove={() => decideApproval(approval.id, "APPROVED")}
              onReject={() => decideApproval(approval.id, "REJECTED")}
            />
          ))}
          {filtered.actions.slice(0, 5).map((action) => (
            <ActionRow key={action.id} action={action} />
          ))}
        </BoardColumn>

        <BoardColumn title="المخاطر والقرارات" count={filtered.alerts.length + filtered.decisions.length}>
          {filtered.alerts.length === 0 && filtered.decisions.length === 0 && (
            <EmptyRow text="لا توجد مخاطر أو قرارات جديدة. سيظهر هنا ملخص الإدارة بعد التشغيل." />
          )}
          {filtered.alerts.slice(0, 4).map((alert) => (
            <AlertRow key={alert.id} alert={alert} />
          ))}
          {filtered.decisions.slice(0, 3).map((decision) => (
            <DecisionRow key={decision.id} decision={decision} />
          ))}
        </BoardColumn>
      </section>
    </main>
  );
}

function filterDepartmentData(data: DashboardData, profile: DepartmentProfile, icon: DepartmentId) {
  const taskTokens = profile.taskTokens.map((token) => token.toLowerCase());
  const actionTokens = profile.actionTokens.map((token) => token.toLowerCase());
  const kpiTokens = profile.kpiTokens.map((token) => token.toLowerCase());

  const matches = (text: string, tokens: string[]) => {
    const normalized = text.toLowerCase();
    return tokens.some((token) => normalized.includes(token));
  };

  const tasks = data.tasks.filter((task) =>
    matches(`${task.owner_role || ""} ${task.title || ""} ${task.content || ""} ${task.kpi_name || ""}`, taskTokens)
  );
  const actions = data.actions.filter((action) =>
    matches(`${action.action_type || ""} ${action.title || ""} ${action.description || ""} ${action.provider || ""}`, actionTokens)
  );
  const kpis = data.kpis.filter((kpi) => matches(`${kpi.name || ""} ${kpi.unit || ""}`, kpiTokens));
  const pendingApprovals = data.approvals.filter((approval) => (approval.status || "").toUpperCase() === "PENDING");

  return {
    tasks: icon === "executive" ? data.tasks.filter((task) => (task.status || "").toUpperCase() !== "DONE") : tasks,
    actions: icon === "executive" ? data.actions : actions,
    kpis: icon === "executive" ? data.kpis : kpis,
    alerts: icon === "executive" ? data.alerts : data.alerts.filter((alert) => matches(`${alert.title || ""} ${alert.message || ""}`, taskTokens)),
    approvals: icon === "executive" ? pendingApprovals : pendingApprovals.filter((approval) => matches(`${approval.entity_type || ""} ${approval.notes || ""}`, taskTokens)),
    decisions: icon === "executive" ? data.decisions : data.decisions.filter((decision) => matches(`${decision.request || ""} ${decision.ceo_decision || ""}`, taskTokens)),
  };
}

function buildCapabilityInsights(
  icon: DepartmentId,
  data: DashboardData,
  filtered: ReturnType<typeof filterDepartmentData>
): CapabilityInsight[] {
  const openTasks = filtered.tasks.filter((task) => (task.status || "").toUpperCase() !== "DONE").length;
  const pendingActions = filtered.actions.filter((action) => !["DONE", "APPROVED"].includes((action.status || "").toUpperCase())).length;
  const pendingApprovals = filtered.approvals.length;
  const alerts = filtered.alerts.length;
  const kpis = filtered.kpis.length;
  const projects = data.projects.length;
  const nextDue = nextDueDate(filtered.tasks);
  const health = data.commandCenter?.healthScore ?? 0;

  if (icon === "operations") {
    return [
      { icon: ClipboardList, value: `${openTasks} مهام`, body: "خطة التنفيذ تُقرأ من المهام الفعلية، ويمكن بدءها أو إغلاقها مباشرة.", tone: "blue" },
      { icon: Users, value: `${uniqueOwners(filtered.tasks)} أدوار`, body: "توزيع الموارد مبني على ملاك المهام وليس وصفًا ثابتًا.", tone: "green" },
      { icon: CalendarClock, value: nextDue, body: "أقرب موعد تسليم يتم حسابه من الجدول الزمني للمشروع.", tone: "amber" },
      { icon: AlertTriangle, value: `${alerts} مخاطر`, body: "أي خطر مالي أو تشغيلي يظهر هنا فورًا مع مصدره.", tone: alerts ? "red" : "green" },
    ];
  }

  if (icon === "executive") {
    return [
      { icon: Sparkles, value: `${projects} مشاريع`, body: "الملخص التنفيذي يجمع المشاريع والقرارات الصادرة من الشركة.", tone: "blue" },
      { icon: ShieldCheck, value: `${pendingApprovals} موافقات`, body: "اعتماد أو رفض القرارات المالية والتنفيذية من نفس الصفحة.", tone: pendingApprovals ? "amber" : "green" },
      { icon: AlertTriangle, value: `${alerts} مخاطر`, body: "مراقبة فورية للمخاطر الحرجة قبل توسعة الصرف أو التشغيل.", tone: alerts ? "red" : "green" },
      { icon: Gauge, value: `${health}/100`, body: "متابعة الأداء العام مبنية على الربحية والمصاريف والسيولة.", tone: health >= 70 ? "green" : "amber" },
    ];
  }

  if (icon === "marketing") {
    return [
      { icon: Megaphone, value: `${pendingActions} إجراءات`, body: "الحملات ومسودات الرسائل تتحول إلى إجراءات جاهزة للربط.", tone: "blue" },
      { icon: Users, value: `${openTasks} مهام`, body: "تحليل الجمهور والاختبارات التسويقية تظهر كمهام متابعة.", tone: "green" },
      { icon: BriefcaseBusiness, value: `${data.commandCenter?.approval?.gate || "AUTO"}`, body: "ميزانية التسويق تمر عبر بوابة اعتماد حسب حجم الصرف والمخاطر.", tone: "amber" },
      { icon: Target, value: `${kpis} KPIs`, body: "مؤشرات مثل العملاء المحتملين وCAC تُتابع من نفس الصفحة.", tone: "green" },
    ];
  }

  return [
    { icon: Boxes, value: `${openTasks} مهام`, body: "المخزون والتوريد يتحولان إلى مهام محددة بمالك وموعد.", tone: "blue" },
    { icon: ClipboardCheck, value: `${pendingActions} إجراءات`, body: "قائمة الموردين وتكلفة الوحدة تحفظ كإجراءات جاهزة للربط.", tone: "green" },
    { icon: BriefcaseBusiness, value: `${uniqueOwners(filtered.tasks)} أدوار`, body: "توزيع المسؤوليات بين الإمداد والمالية والعمليات واضح.", tone: "amber" },
    { icon: Gauge, value: `${kpis} KPIs`, body: "مؤشرات الموردين والتكلفة والجاهزية تظهر هنا.", tone: "green" },
  ];
}

function uniqueOwners(tasks: DashboardTask[]) {
  return new Set(tasks.map((task) => task.owner_role).filter(Boolean)).size;
}

function nextDueDate(tasks: DashboardTask[]) {
  const dueDates = tasks
    .map((task) => task.due_date)
    .filter(Boolean)
    .map((date) => new Date(String(date)))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (!dueDates.length) return "لا يوجد";
  return dueDates[0].toLocaleDateString("ar-SA", { month: "short", day: "numeric" });
}

function statusText(status?: string) {
  const key = (status || "").toUpperCase();
  return statusLabel[key] || status || "غير محدد";
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function BoardColumn({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="department-board-column">
      <header>
        <h2>{title}</h2>
        <span>{count}</span>
      </header>
      <div>{children}</div>
    </section>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="department-empty">{text}</p>;
}

function TaskRow({
  task,
  saving,
  onStart,
  onDone,
}: {
  task: DashboardTask;
  saving: boolean;
  onStart: () => void;
  onDone: () => void;
}) {
  const status = (task.status || "").toUpperCase();
  return (
    <article className="department-row">
      <div>
        <span className={`mini-pill ${status.toLowerCase()}`}>{statusText(status)}</span>
        <strong>{task.title || task.content || "مهمة تنفيذية"}</strong>
        <p>{task.description || task.content || task.owner_role || "مهمة مرتبطة بخطة الشركة."}</p>
        <small>{task.owner_role || "AI Employee"} {task.due_date ? `• ${new Date(task.due_date).toLocaleDateString("ar-SA")}` : ""}</small>
      </div>
      <div className="row-actions">
        {status !== "IN_PROGRESS" && status !== "DONE" && (
          <button type="button" onClick={onStart} disabled={saving} title="بدء المهمة">
            {saving ? <Loader2 className="spin" size={15} /> : <Play size={15} />}
          </button>
        )}
        {status !== "DONE" && (
          <button type="button" onClick={onDone} disabled={saving} title="إنجاز المهمة">
            {saving ? <Loader2 className="spin" size={15} /> : <CheckCircle2 size={15} />}
          </button>
        )}
      </div>
    </article>
  );
}

function KpiRow({ kpi }: { kpi: DashboardKpi }) {
  const target = Number(kpi.target || 0);
  const current = Number(kpi.current || 0);
  const progress = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

  return (
    <article className="department-row kpi-row">
      <div>
        <span className="mini-pill">{statusText(kpi.status)}</span>
        <strong>{kpi.name || "مؤشر أداء"}</strong>
        <p>{current.toLocaleString("ar-SA")} من {target.toLocaleString("ar-SA")} {kpi.unit || ""}</p>
      </div>
      <span className="kpi-progress">
        <i style={{ width: `${progress}%` }} />
      </span>
    </article>
  );
}

function ActionRow({ action }: { action: DashboardAction }) {
  return (
    <article className="department-row">
      <div>
        <span className={`mini-pill ${action.requires_approval ? "pending" : ""}`}>{statusText(action.status)}</span>
        <strong>{action.title || action.action_type || "إجراء تجاري"}</strong>
        <p>{action.description || "إجراء جاهز للتحويل إلى تكامل خارجي."}</p>
        <small>{action.provider || "internal"} • {action.execution_mode || "INTERNAL"}</small>
      </div>
    </article>
  );
}

function ApprovalRow({
  approval,
  saving,
  onApprove,
  onReject,
}: {
  approval: DashboardApproval;
  saving: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <article className="department-row approval-row">
      <div>
        <span className="mini-pill pending">{statusText(approval.status)}</span>
        <strong>{approval.entity_type || "موافقة تنفيذية"}</strong>
        <p>{approval.notes || "طلب يحتاج مراجعة قبل التنفيذ."}</p>
      </div>
      <div className="row-actions">
        <button type="button" onClick={onApprove} disabled={saving} title="اعتماد">
          {saving ? <Loader2 className="spin" size={15} /> : <CheckCircle2 size={15} />}
        </button>
        <button type="button" onClick={onReject} disabled={saving} title="رفض">
          {saving ? <Loader2 className="spin" size={15} /> : <AlertTriangle size={15} />}
        </button>
      </div>
    </article>
  );
}

function AlertRow({ alert }: { alert: DashboardAlert }) {
  return (
    <article className="department-row alert-row">
      <div>
        <span className={`mini-pill ${(alert.severity || "").toLowerCase()}`}>{alert.severity || "Risk"}</span>
        <strong>{alert.title || "تنبيه"}</strong>
        <p>{alert.message || "يوجد تنبيه يحتاج مراجعة."}</p>
        <small>{alert.source || "AI Risk Engine"}</small>
      </div>
    </article>
  );
}

function DecisionRow({ decision }: { decision: DashboardDecision }) {
  return (
    <article className="department-row">
      <div>
        <span className="mini-pill done">قرار</span>
        <strong>{decision.request || "قرار تنفيذي"}</strong>
        <p>{decision.ceo_decision?.slice(0, 220) || decision.cfo_report?.slice(0, 220) || "تم حفظ قرار الشركة."}</p>
      </div>
    </article>
  );
}
