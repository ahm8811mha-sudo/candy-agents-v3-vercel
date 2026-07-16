"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpLeft,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  FolderKanban,
  ListChecks,
  Play,
  PlugZap,
  RefreshCcw,
} from "lucide-react";
import { buildActionProjectGroups, type ProjectExecutionGroup } from "@/lib/company/actionProjectView";

type ActionPayload = {
  confidence?: number;
  assumptions?: string[];
  evidence?: Array<{ summary?: string }>;
  blockedBy?: string[];
  priority?: string;
  agentName?: string;
  role?: string;
};

type IntegrationResult = {
  operation?: string;
  executedAt?: string;
  messageId?: string;
  spreadsheetUrl?: string;
  webViewLink?: string;
  alreadyExisted?: boolean;
};

type AgentDeliverable = {
  summary?: string;
  completedWork?: string[];
  findings?: string[];
  decisions?: string[];
  nextActions?: string[];
};

type CompanyAction = {
  id: string;
  project_id?: string | null;
  action_sequence?: number | null;
  action_number?: string | null;
  action_date?: string | null;
  title: string;
  action_type: string;
  description?: string;
  status: string;
  execution_mode?: string;
  provider?: string;
  requires_approval?: boolean;
  approval_status?: string;
  payload?: ActionPayload;
  result?: { integration?: IntegrationResult; deliverable?: AgentDeliverable };
  attempts?: number;
  error?: string;
  created_at?: string;
};

type CompanyProject = {
  id: string;
  project_number?: number | null;
  project_date?: string | null;
  name: string;
  request?: string;
  status?: string;
  budget?: number;
  approved_budget?: number;
  health_score?: number;
  risk_level?: string;
  approval_status?: string;
  strategic_direction?: string;
  financial_snapshot?: { initiativePlan?: unknown };
  created_at?: string;
};

type CompanyTask = {
  id: string;
  project_id: string;
  task_sequence?: number | null;
  task_number?: string | null;
  task_date?: string | null;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  progress_percent?: number;
  owner_role?: string;
  due_date?: string;
  created_at?: string;
};

type IntegrationPlan = { capability: "gmail" | "sheets" | "drive"; operation: string; label: string };
type IntegrationStatus = {
  googleWorkspace: {
    enabled: boolean;
    disabledByFlag: boolean;
    credentialsConfigured: boolean;
    capabilities: Record<"gmail" | "sheets" | "drive", boolean>;
    missingEnvironmentVariables: string[];
  };
  supportedActionTypes: string[];
  actionPlans: Record<string, IntegrationPlan | null>;
};

const statusLabels: Record<string, string> = {
  QUEUED: "في قائمة التنفيذ",
  WAITING_APPROVAL: "بانتظار اعتماد",
  WAITING_INTEGRATION: "بانتظار تكامل",
  RUNNING: "قيد التنفيذ",
  DONE: "مكتمل",
  FAILED: "فشل",
  CANCELLED: "ملغي",
  PENDING_APPROVAL: "بانتظار الاعتماد",
  RESULTS_READY: "النتائج جاهزة",
  EXECUTION_ATTENTION: "يحتاج متابعة",
  COMPLETED: "مكتمل",
  ACTIVE: "نشط",
};

function statusIcon(status: string) {
  if (status === "DONE" || status === "COMPLETED" || status === "RESULTS_READY") return <CheckCircle2 size={16} />;
  if (status === "FAILED" || status === "EXECUTION_ATTENTION") return <AlertTriangle size={16} />;
  if (status === "RUNNING" || status === "ACTIVE") return <Activity size={16} />;
  return <Clock3 size={16} />;
}

function integrationLink(result?: IntegrationResult) {
  return result?.spreadsheetUrl || result?.webViewLink || null;
}

export default function ActionQueuePanel() {
  const [actions, setActions] = useState<CompanyAction[]>([]);
  const [projects, setProjects] = useState<CompanyProject[]>([]);
  const [tasks, setTasks] = useState<CompanyTask[]>([]);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [integrationUnavailable, setIntegrationUnavailable] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const initialProjectResolved = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [actionsResponse, integrationResponse] = await Promise.all([
        fetch("/api/company/actions?limit=100", { cache: "no-store" }),
        fetch("/api/integrations/status", { cache: "no-store" }),
      ]);
      const actionsData = await actionsResponse.json();
      if (!actionsResponse.ok || !actionsData.ok) throw new Error(actionsData.error || "تعذر تحميل قائمة التنفيذ.");
      setActions(actionsData.actions || []);
      setProjects(actionsData.projects || []);
      setTasks(actionsData.tasks || []);

      const integrationData = await integrationResponse.json().catch(() => null);
      if (integrationResponse.ok && integrationData?.ok) {
        setIntegrationStatus(integrationData as IntegrationStatus);
        setIntegrationUnavailable(false);
      } else {
        setIntegrationUnavailable(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل قائمة التنفيذ.");
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }

  async function execute(action: CompanyAction) {
    setExecutingId(action.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/company/actions/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: action.id }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        const missing = Array.isArray(data.missingEnvironmentVariables)
          ? ` المتغيرات الناقصة: ${data.missingEnvironmentVariables.join(", ")}`
          : "";
        throw new Error(`${data.error || "تعذر تنفيذ التكامل."}${missing}`);
      }
      setMessage(data.reused ? "الإجراء منفذ مسبقاً؛ لم يتم تكرار الأثر الخارجي." : "تم تنفيذ التكامل الخارجي وتسجيل النتيجة.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تنفيذ التكامل.");
    } finally {
      setExecutingId(null);
    }
  }

  useEffect(() => { load(); }, []);

  const groups = useMemo(() => buildActionProjectGroups(projects, actions, tasks), [projects, actions, tasks]);
  useEffect(() => {
    if (initialProjectResolved.current || groups.approved.length === 0) return;
    const selected = new URLSearchParams(window.location.search).get("project");
    setOpenProjectId(selected && groups.approved.some((group) => group.project.id === selected) ? selected : groups.approved[0].project.id);
    initialProjectResolved.current = true;
  }, [groups.approved]);

  const summary = useMemo(() => {
    const waiting = actions.filter((item) => item.status === "WAITING_APPROVAL" || item.status === "WAITING_INTEGRATION").length;
    const running = actions.filter((item) => item.status === "RUNNING" || item.status === "QUEUED").length;
    const done = actions.filter((item) => item.status === "DONE").length;
    const failed = actions.filter((item) => item.status === "FAILED").length;
    return { waiting, running, done, failed };
  }, [actions]);

  const googleReady = Boolean(integrationStatus?.googleWorkspace.enabled && integrationStatus.googleWorkspace.credentialsConfigured);

  function toggleProject(projectId: string) {
    const next = openProjectId === projectId ? null : projectId;
    setOpenProjectId(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("project", next);
    else url.searchParams.delete("project");
    window.history.replaceState({}, "", url);
  }

  return (
    <section className="delivery-panel fade-in action-queue-panel">
      <div className="delivery-header action-queue-header">
        <div>
          <span className="eyebrow"><Activity size={16} /> Action Queue</span>
          <h2>ماذا حدث بعد الاعتماد؟</h2>
          <p>لكل مشروع معتمد ملف مستقل يجمع الخطة والمهام والوكلاء والنتائج حتى لا يضيع أي قرار في قائمة عامة.</p>
        </div>
        <button className="secondary-btn" onClick={load} type="button" disabled={loading}>
          <RefreshCcw size={16} /> {loading ? "تحديث..." : "تحديث"}
        </button>
      </div>

      {integrationStatus && (
        <div className={`notice integration-notice ${googleReady ? "done" : "warning"}`}>
          <PlugZap size={17} />
          <div>
            <strong>{googleReady ? "Google Workspace جاهز للتنفيذ" : "Google Workspace يحتاج إعداد البيئة"}</strong>
            <p>{googleReady
              ? "يمكن للوكلاء إنشاء المخرجات الخارجية من نفس ملف المشروع."
              : integrationStatus.googleWorkspace.disabledByFlag
                ? "التكامل متوقف عبر GOOGLE_INTEGRATIONS_ENABLED=false."
                : `أكمل متغيرات OAuth التالية: ${integrationStatus.googleWorkspace.missingEnvironmentVariables.join(", ")}`}</p>
          </div>
        </div>
      )}
      {integrationUnavailable && <p className="notice integration-notice warning">تعذر قراءة حالة Google Workspace الآن. بقيت ملفات المشاريع متاحة.</p>}
      {error && <p className="notice error">{error}</p>}
      {message && <p className="notice done">{message}</p>}

      <div className="finance-summary action-queue-summary" aria-label="ملخص قائمة التنفيذ">
        <Metric title="بانتظار" value={summary.waiting} />
        <Metric title="قيد التنفيذ" value={summary.running} />
        <Metric title="مكتمل" value={summary.done} />
        <Metric title="فشل" value={summary.failed} />
      </div>

      {!loaded && loading ? (
        <div className="action-queue-loading" role="status"><RefreshCcw className="spin" size={20} /> جارٍ تحميل ملفات المشاريع…</div>
      ) : actions.length === 0 && projects.length === 0 ? (
        <div className="empty-state"><Clock3 size={34} /><strong>لا توجد مشاريع تنفيذية بعد</strong><span>أنشئ فكرة واعتمد خطتها حتى يظهر ملف المشروع هنا.</span></div>
      ) : (
        <>
          <section className="approved-projects" id="approved-projects">
            <div className="approved-projects__heading">
              <div><span className="eyebrow"><FolderKanban size={15} /> ملفات المشاريع</span><h3>المشاريع بعد الاعتماد ({groups.approved.length})</h3></div>
              <small>افتح أي مشروع لمتابعة ما أنجزه كل وكيل والنتائج التي أعادها.</small>
            </div>
            {groups.approved.length === 0 ? (
              <div className="empty-state project-list-empty"><Clock3 size={26} /><strong>لا يوجد مشروع معتمد بعد</strong><span>المشاريع التي تنتظر قرارك موجودة أسفل هذه القائمة.</span></div>
            ) : (
              <div className="project-execution-list">
                {groups.approved.map((group) => (
                  <ProjectExecutionCard
                    key={group.project.id}
                    group={group}
                    open={openProjectId === group.project.id}
                    onToggle={() => toggleProject(group.project.id)}
                    integrationStatus={integrationStatus}
                    executingId={executingId}
                    execute={execute}
                  />
                ))}
              </div>
            )}
          </section>

          {groups.pending.length > 0 && (
            <section className="pending-projects">
              <div className="approved-projects__heading"><div><span className="eyebrow"><Clock3 size={15} /> قبل التنفيذ</span><h3>مشاريع بانتظار الاعتماد ({groups.pending.length})</h3></div><Link href="/inbox" className="secondary-btn btn-sm">فتح الاعتمادات <ArrowUpLeft size={14} /></Link></div>
              <div className="pending-projects__list">{groups.pending.map(({ project }) => <article key={project.id}><div><strong>{project.project_number ? `مشروع #${project.project_number} — ` : ""}{project.name}</strong><small>{project.project_date ? `${new Date(project.project_date).toLocaleDateString("ar-SA")} · ` : ""}{project.request || project.strategic_direction}</small></div><span className="status-pill running">{statusLabels[project.status || ""] || "بانتظار اعتماد"}</span></article>)}</div>
            </section>
          )}

          {groups.unassigned.length > 0 && (
            <section className="unassigned-actions"><div className="approved-projects__heading"><div><span className="eyebrow"><ListChecks size={15} /> إجراءات عامة</span><h3>غير مرتبطة بمشروع ({groups.unassigned.length})</h3></div></div><div className="report-stack">{groups.unassigned.map((action) => <ActionCard key={action.id} action={action} integrationStatus={integrationStatus} executingId={executingId} execute={execute} />)}</div></section>
          )}
        </>
      )}
    </section>
  );
}

function ProjectExecutionCard({ group, open, onToggle, integrationStatus, executingId, execute }: {
  group: ProjectExecutionGroup<CompanyProject, CompanyAction, CompanyTask>;
  open: boolean;
  onToggle: () => void;
  integrationStatus: IntegrationStatus | null;
  executingId: string | null;
  execute: (action: CompanyAction) => Promise<void>;
}) {
  const project = group.project;
  const hasPlan = Boolean(project.financial_snapshot?.initiativePlan);
  return (
    <article className={`project-execution-card ${open ? "is-open" : ""}`}>
      <button type="button" className="project-execution-card__header" onClick={onToggle} aria-expanded={open}>
        <div className="project-execution-card__identity"><span className="project-execution-card__icon"><FolderKanban size={21} /></span><div><strong>{project.project_number ? `مشروع #${project.project_number} — ` : ""}{project.name}</strong><small>{project.project_date ? `${new Date(project.project_date).toLocaleDateString("ar-SA")} · ` : ""}{project.strategic_direction || project.request || "مشروع تنفيذي معتمد"}</small></div></div>
        <div className="project-execution-card__state"><span className={`status-pill ${project.status === "EXECUTION_ATTENTION" ? "high" : project.status === "RESULTS_READY" || project.status === "COMPLETED" ? "done" : "running"}`}>{statusIcon(project.status || "ACTIVE")}{statusLabels[project.status || ""] || project.status || "نشط"}</span><ChevronDown size={19} className={open ? "is-open" : ""} /></div>
      </button>
      <div className="project-execution-card__progress"><span style={{ width: `${group.progress}%` }} /></div>
      <div className="project-execution-card__facts">
        <span><small>إنجاز الوكلاء</small><strong>{group.doneActions}/{group.actions.length}</strong></span>
        <span><small>المهام المكتملة</small><strong>{group.doneTasks}/{group.tasks.length}</strong></span>
        <span><small>التقدم</small><strong>{group.progress}%</strong></span>
        <span><small>التعثرات</small><strong className={group.failedActions ? "danger-text" : ""}>{group.failedActions}</strong></span>
      </div>
      {open && (
        <div className="project-execution-card__body">
          <div className="project-execution-card__toolbar"><div><strong>خطة العمل والتنفيذ</strong><small>كل مهمة مرتبطة بمسؤول وحالة تقدم؛ وتحتها نتيجة الوكيل عند اكتمالها.</small></div>{hasPlan && <Link className="secondary-btn btn-sm" href={`/departments/executive?project=${project.id}#initiative-delivery`}>فتح الدراسة الكاملة <ArrowUpLeft size={14} /></Link>}</div>
          <div className="project-task-list">
            {group.tasks.map((task) => <article key={task.id}><span className={`task-state ${task.status === "DONE" ? "done" : task.status === "BLOCKED" ? "blocked" : ""}`}>{task.status === "DONE" ? <CheckCircle2 size={15} /> : <Clock3 size={15} />}</span><div><strong>{task.task_number ? `#${task.task_number} — ` : ""}{task.title}</strong><small>{task.task_date ? `${new Date(task.task_date).toLocaleDateString("ar-SA")} · ` : ""}{task.owner_role || "المكتب التنفيذي"}{task.due_date ? ` · الاستحقاق ${new Date(task.due_date).toLocaleDateString("ar-SA")}` : ""}</small></div><b>{Number(task.progress_percent || 0)}%</b></article>)}
          </div>
          <div className="project-agent-results">{group.actions.map((action) => <ActionCard key={action.id} action={action} integrationStatus={integrationStatus} executingId={executingId} execute={execute} />)}</div>
        </div>
      )}
    </article>
  );
}

function ActionCard({ action, integrationStatus, executingId, execute }: { action: CompanyAction; integrationStatus: IntegrationStatus | null; executingId: string | null; execute: (action: CompanyAction) => Promise<void> }) {
  const confidence = action.payload?.confidence;
  const blockedBy = action.payload?.blockedBy || [];
  const evidence = action.payload?.evidence || [];
  const plan = integrationStatus?.actionPlans[action.action_type] || null;
  const executableStatus = ["WAITING_INTEGRATION", "QUEUED", "FAILED"].includes(action.status);
  const capabilityReady = plan ? integrationStatus?.googleWorkspace.capabilities[plan.capability] : false;
  const result = action.result?.integration;
  const deliverable = action.result?.deliverable;
  const resultUrl = integrationLink(result);
  return (
    <article className="report-card project-action-card">
      <h3><span>{action.action_number ? `#${action.action_number} — ` : ""}{action.payload?.agentName || action.title}</span><small>{statusIcon(action.status)} {statusLabels[action.status] || action.status}</small></h3>
      {action.action_date && <small className="project-action-card__date">تاريخ المهمة التنفيذية: {new Date(action.action_date).toLocaleDateString("ar-SA")}</small>}
      {deliverable ? (
        <div className="project-action-card__deliverable"><p>{deliverable.summary}</p>{deliverable.completedWork?.length ? <div><strong>ما تم إنجازه</strong><ul>{deliverable.completedWork.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}{deliverable.nextActions?.length ? <div><strong>الخطوة التالية</strong><ul>{deliverable.nextActions.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}</div>
      ) : (
        <pre>{[
          action.payload?.role ? `التخصص: ${action.payload.role}` : `النوع: ${action.action_type}`,
          `الوضع: ${action.execution_mode || "INTERNAL"}`,
          `الاعتماد: ${action.approval_status || "NOT_REQUIRED"}`,
          typeof confidence === "number" ? `الثقة: ${confidence}%` : null,
          blockedBy.length ? `المعوقات: ${blockedBy.join(" | ")}` : "المعوقات: لا توجد",
          evidence.length ? `الدليل: ${evidence.map((item) => item.summary).filter(Boolean).join(" | ").slice(0, 500)}` : null,
          action.error ? `الخطأ: ${action.error}` : null,
        ].filter(Boolean).join("\n")}</pre>
      )}
      {(plan || resultUrl) && <div className="inbox-item__actions">{plan && executableStatus && <button className="primary-btn btn-sm" type="button" onClick={() => execute(action)} disabled={!capabilityReady || executingId === action.id} title={!capabilityReady ? "أكمل متغيرات Google Workspace أولاً" : plan.label}>{executingId === action.id ? <RefreshCcw className="spin" size={15} /> : <Play size={15} />}{executingId === action.id ? "جارٍ التنفيذ..." : plan.label}</button>}{resultUrl && <a className="secondary-btn btn-sm" href={resultUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> فتح الناتج</a>}</div>}
    </article>
  );
}

function Metric({ title, value }: { title: string; value: number }) {
  return <article className="metric-card green action-queue-metric" aria-label={`${title}: ${value}`}><small>{title}</small><strong>{value.toLocaleString("ar-SA-u-nu-latn")}</strong></article>;
}
