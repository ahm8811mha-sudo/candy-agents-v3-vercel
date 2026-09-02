"use client";

/**
 * Project management.
 *
 * Until now an approved decision produced a project row that nobody could open:
 * the dashboard counted projects and tasks as two numbers and that was the whole
 * of it. This is the missing surface — every project, its steps, who owns each
 * one, what is late, and one honest progress number.
 *
 * Honest is the operative word. A step that has to happen in the real world (a
 * registration, a payment, a signed contract) is never counted as done because
 * an agent wrote the paperwork; it counts only once the owner confirms it, with
 * the proof recorded. So the bar reads lower than a naive one would, and that is
 * the point.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FolderKanban,
  Loader2,
  RefreshCw,
  Check,
  Play,
  ShieldCheck,
  AlertTriangle,
  CalendarClock,
  Search,
} from "lucide-react";
import type { HonestySummary, TaskExecutionState } from "@/lib/company/executionHonesty";
import { executionStateLabels } from "@/lib/company/executionHonesty";

type ProjectTask = {
  id: string;
  title: string;
  detail: string;
  status: string;
  priority: string | null;
  ownerRole: string | null;
  dueDate: string | null;
  overdue: boolean;
  progress: number;
  executionKind: "INTERNAL" | "REAL_WORLD";
  state: TaskExecutionState;
};

type Project = {
  id: string;
  name: string;
  status: string;
  projectNumber: number | null;
  createdAt: string | null;
  budgetSAR: number | null;
  summary: HonestySummary;
  overdueCount: number;
  tasks: ProjectTask[];
};

const sar = new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 });

/** Steps are grouped by what the owner has to do about them, not by raw status. */
const GROUPS: Array<{ key: string; label: string; states: TaskExecutionState[] }> = [
  { key: "owner", label: "تنتظر تأكيدك الفعلي", states: ["PLAN_READY"] },
  { key: "blocked", label: "متوقفة على اعتماد أو تمويل", states: ["WAITING_FUNDING", "BLOCKED", "ON_HOLD"] },
  { key: "active", label: "قيد العمل", states: ["IN_PROGRESS"] },
  { key: "done", label: "منتهية", states: ["REAL_DONE", "INTERNAL_DONE"] },
];

export default function ProjectsBoard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [configured, setConfigured] = useState(true);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [proofNote, setProofNote] = useState("");
  const [taskError, setTaskError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تحميل المشاريع.");
      setProjects(json.projects || []);
      setConfigured(json.configured !== false);
      setMessage(json.message || "");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل المشاريع.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Deep links from the decision desk and the idea board open a project directly.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("project");
    if (requested) setSelectedId(requested);
  }, []);

  const shown = useMemo(() => {
    const needle = query.trim();
    if (!needle) return projects;
    return projects.filter((project) => project.name.includes(needle) || project.tasks.some((task) => task.title.includes(needle)));
  }, [projects, query]);

  const selected = useMemo(
    () => shown.find((project) => project.id === selectedId) || shown[0] || null,
    [shown, selectedId]
  );

  const portfolio = useMemo(() => {
    const waitingOwner = projects.reduce((sum, p) => sum + p.summary.planReady, 0);
    const overdue = projects.reduce((sum, p) => sum + p.overdueCount, 0);
    const waitingFunding = projects.reduce((sum, p) => sum + p.summary.waitingFunding, 0);
    return { count: projects.length, waitingOwner, overdue, waitingFunding };
  }, [projects]);

  async function updateTask(task: ProjectTask, status: string, progressPercent: number) {
    setBusyTask(task.id);
    setTaskError("");
    try {
      const res = await fetch("/api/tasks/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, status, progressPercent }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        // The database proof gate refuses to close an unconfirmed real-world
        // step; surface it as the instruction it is, not as a failure.
        setTaskError(json.message || "تعذر تحديث الخطوة.");
        if (json.code === "OWNER_CONFIRMATION_REQUIRED") setConfirmFor(task.id);
        return;
      }
      await load();
    } catch {
      setTaskError("تعذر تحديث الخطوة.");
    } finally {
      setBusyTask(null);
    }
  }

  async function confirmReal(task: ProjectTask) {
    if (!proofNote.trim()) {
      setTaskError("اكتب الإثبات: ماذا تم فعلياً، ومتى، وأين يمكن التحقق منه.");
      return;
    }
    setBusyTask(task.id);
    setTaskError("");
    try {
      const res = await fetch("/api/tasks/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, confirmReal: true, proofNote: proofNote.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setTaskError(json.message || "تعذر تسجيل التأكيد.");
        return;
      }
      setConfirmFor(null);
      setProofNote("");
      await load();
    } catch {
      setTaskError("تعذر تسجيل التأكيد.");
    } finally {
      setBusyTask(null);
    }
  }

  return (
    <main className="page-wrap">
      <header className="page-head">
        <div>
          <h1>المشاريع التنفيذية</h1>
          <p className="page-sub">
            كل مشروع نشأ عن قرار معتمد، بخطواته ومسؤوليها ومواعيدها. النسبة تحسب الخطوات ذات الأثر الفعلي فقط بعد تأكيدك، لا بمجرد جاهزية الأوراق.
          </p>
        </div>
        <button className="secondary-btn btn-sm" onClick={() => void load()} aria-label="تحديث">
          {loading ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />} تحديث
        </button>
      </header>

      <div className="decide-summary">
        <div><b>{portfolio.count}</b><small>مشروع قائم</small></div>
        <div className={portfolio.waitingOwner ? "is-warn" : ""}><b>{portfolio.waitingOwner}</b><small>خطوة تنتظر تأكيدك</small></div>
        <div className={portfolio.overdue ? "is-late" : ""}><b>{portfolio.overdue}</b><small>خطوة متأخرة</small></div>
        <div><b>{portfolio.waitingFunding}</b><small>بانتظار التمويل</small></div>
      </div>

      {!configured && message && <p className="notice">{message}</p>}
      {error && <p className="notice error">{error}</p>}

      {loading && (
        <div className="delivery-panel" style={{ padding: 24, textAlign: "center" }}>
          <Loader2 className="spin" size={24} style={{ color: "var(--muted)" }} />
        </div>
      )}

      {!loading && projects.length === 0 && configured && (
        <div className="empty-state" style={{ minHeight: 160 }}>
          <FolderKanban size={30} />
          <strong>لا توجد مشاريع بعد</strong>
          <span>يظهر المشروع هنا فور اعتماد قرار في مركز القرار أو تحويل فكرة معتمدة إلى مشروع.</span>
        </div>
      )}

      {projects.length > 0 && (
        <>
          <label className="decide-search decide-search--wide">
            <Search size={15} aria-hidden />
            <input
              className="input"
              type="search"
              value={query}
              placeholder="ابحث في المشاريع والخطوات…"
              aria-label="ابحث في المشاريع والخطوات"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>

          <div className="decide-desk">
            <div className="decide-queue" role="listbox" aria-label="قائمة المشاريع">
              {shown.map((project) => (
                <button
                  key={project.id}
                  role="option"
                  aria-selected={selected?.id === project.id}
                  className={`decide-row ${selected?.id === project.id ? "is-open" : ""}`}
                  onClick={() => setSelectedId(project.id)}
                >
                  <span className="decide-row__top">
                    <b>{project.name}</b>
                    <em>{project.summary.honestProgress}%</em>
                  </span>
                  <span className="project-bar" aria-hidden>
                    <span style={{ width: `${project.summary.honestProgress}%` }} />
                  </span>
                  <span className="decide-row__meta">
                    {project.summary.totalTasks} خطوة · {project.summary.planReady} تنتظر تأكيدك
                  </span>
                  {project.overdueCount > 0 && (
                    <span className="decide-row__late"><AlertTriangle size={13} /> {project.overdueCount} متأخرة</span>
                  )}
                </button>
              ))}
            </div>

            <div className="decide-detail">
              {selected && (
                <article className="bento-card" style={{ gap: 16 }}>
                  <div>
                    <span className="bento-kicker">
                      {selected.projectNumber ? `مشروع #${selected.projectNumber}` : "مشروع"} · {selected.status}
                      {selected.createdAt ? ` · أُنشئ ${new Date(selected.createdAt).toLocaleDateString("ar-SA")}` : ""}
                    </span>
                    <h2 className="decide-detail__title">{selected.name}</h2>
                  </div>

                  <div className="project-progress">
                    <div className="project-progress__head">
                      <b>{selected.summary.honestProgress}%</b>
                      <small>
                        اكتمال فعلي: {selected.summary.internalDone} عمل داخلي منجز و{selected.summary.realWorldConfirmed} خطوة مؤكدة فعلياً
                        من {selected.summary.totalTasks} خطوة
                      </small>
                    </div>
                    <span className="project-bar project-bar--lg" aria-hidden>
                      <span style={{ width: `${selected.summary.honestProgress}%` }} />
                    </span>
                    {selected.summary.planReady > 0 && (
                      <p className="project-progress__note">
                        {selected.summary.planReady} خطوة أنهى الوكلاء أوراقها ولم تُنفَّذ فعلياً بعد، فلا تُحتسب ضمن النسبة حتى تؤكدها.
                      </p>
                    )}
                  </div>

                  {selected.budgetSAR ? (
                    <div className="decide-detail__facts">
                      <span><small>الميزانية</small><b>{sar.format(selected.budgetSAR)}</b></span>
                      <span><small>الخطوات المتأخرة</small><b>{selected.overdueCount}</b></span>
                      <span><small>بانتظار التمويل</small><b>{selected.summary.waitingFunding}</b></span>
                    </div>
                  ) : null}

                  {taskError && <p className="notice error">{taskError}</p>}

                  {selected.tasks.length === 0 && (
                    <p className="notice">لا توجد خطوات مسجّلة لهذا المشروع بعد.</p>
                  )}

                  {GROUPS.map((group) => {
                    const groupTasks = selected.tasks.filter((task) => group.states.includes(task.state));
                    if (groupTasks.length === 0) return null;
                    return (
                      <section key={group.key} className="task-group">
                        <h3 className="task-group__title">{group.label} ({groupTasks.length})</h3>
                        {groupTasks.map((task) => (
                          <div key={task.id} className={`task-row ${task.overdue ? "is-overdue" : ""}`}>
                            <div className="task-row__main">
                              <b>{task.title}</b>
                              {task.detail && <small className="task-row__detail">{task.detail}</small>}
                              <small className="task-row__meta">
                                {executionStateLabels[task.state]}
                                {task.ownerRole ? ` · ${task.ownerRole}` : ""}
                                {task.dueDate ? ` · الاستحقاق ${String(task.dueDate).slice(0, 10)}` : ""}
                                {task.executionKind === "REAL_WORLD" ? " · أثر فعلي" : ""}
                              </small>
                              {task.overdue && (
                                <small className="task-row__late"><CalendarClock size={13} /> تجاوزت موعد الاستحقاق</small>
                              )}
                            </div>

                            <div className="task-row__actions">
                              {task.state === "IN_PROGRESS" && task.executionKind === "INTERNAL" && (
                                <>
                                  {task.progress < 50 && (
                                    <button className="ghost-btn btn-sm" disabled={busyTask === task.id} onClick={() => updateTask(task, "IN_PROGRESS", 50)}>
                                      <Play size={14} /> بدء
                                    </button>
                                  )}
                                  <button className="secondary-btn btn-sm" disabled={busyTask === task.id} onClick={() => updateTask(task, "DONE", 100)}>
                                    {busyTask === task.id ? <Loader2 className="spin" size={14} /> : <Check size={14} />} إنهاء
                                  </button>
                                </>
                              )}
                              {(task.state === "PLAN_READY" || (task.executionKind === "REAL_WORLD" && task.state === "IN_PROGRESS")) && (
                                <button
                                  className="primary-btn btn-sm"
                                  disabled={busyTask === task.id}
                                  onClick={() => {
                                    setConfirmFor(confirmFor === task.id ? null : task.id);
                                    setProofNote("");
                                    setTaskError("");
                                  }}
                                >
                                  <ShieldCheck size={14} /> تأكيد التنفيذ الفعلي
                                </button>
                              )}
                            </div>

                            {confirmFor === task.id && (
                              <div className="decide-panel task-row__confirm">
                                <label>
                                  الإثبات: ماذا تم فعلياً، ومتى، وأين يمكن التحقق منه؟
                                  <input
                                    className="input"
                                    value={proofNote}
                                    onChange={(e) => setProofNote(e.target.value)}
                                    placeholder="مثال: صدر السجل التجاري رقم 1010… بتاريخ 12/03 عبر منصة الأعمال."
                                  />
                                </label>
                                <button className="primary-btn btn-sm" disabled={busyTask === task.id} onClick={() => confirmReal(task)}>
                                  {busyTask === task.id ? <Loader2 className="spin" size={14} /> : <ShieldCheck size={14} />} تسجيل التأكيد
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </section>
                    );
                  })}
                </article>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
