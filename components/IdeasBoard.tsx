"use client";

/**
 * The idea pipeline.
 *
 * Before, this page opened with an intake form and then printed every idea as a
 * tall card with all of its departmental reports expanded — a wall of text where
 * the reader could not tell how many ideas were waiting, which stage each sat
 * in, or how the departments actually voted.
 *
 * Now the stage is the structure: four stages, each a real filter carrying its
 * own count, and a compact row per idea that shows the vote tally and the money
 * at a glance. The full reports open on demand, and the intake form is a
 * disclosure so the board leads with the work rather than the form.
 */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Lightbulb,
  Loader2,
  Send,
  Inbox,
  Sparkles,
  UserRound,
  Users,
  ThumbsUp,
  ThumbsDown,
  MinusCircle,
  ArrowLeft,
  Plus,
  Search,
  ChevronDown,
  FolderKanban,
} from "lucide-react";

type Verdict = "APPROVE" | "CONDITIONAL" | "REJECT";

type Recommendation = {
  agentId: string;
  agentName: string;
  agentTitle: string;
  verdict: Verdict;
  confidence: number;
  report: string;
};

type Idea = {
  id: string;
  title: string;
  hypothesis: string;
  budgetSAR: number;
  horizonDays: number;
  source: "OWNER" | "TEAM";
  proposedByName: string;
  status: "UNDER_STUDY" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  tier: string;
  tierLabel: string;
  recommendations: Recommendation[];
  aggregate?: { verdict: Verdict; confidence: number; summary: string; narrative?: string };
  studyMode?: "LLM" | "HEURISTIC";
  belowThreshold?: boolean;
  dayKey?: string;
};

type ApprovedIdea = Idea & { executed: boolean; executedProjectId?: string };
type Stats = { total: number; pending: number; approved: number; rejected: number; fromTeam: number };

const sar = new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 });

const verdictMeta: Record<Verdict, { label: string; color: string; Icon: typeof ThumbsUp }> = {
  APPROVE: { label: "يُوصى", color: "var(--green)", Icon: ThumbsUp },
  CONDITIONAL: { label: "بتحفظ", color: "var(--amber)", Icon: MinusCircle },
  REJECT: { label: "لا يُوصى", color: "var(--red)", Icon: ThumbsDown },
};

type Stage = Idea["status"];

const STAGES: Array<{ key: Stage; label: string; hint: string }> = [
  { key: "UNDER_STUDY", label: "قيد الدراسة", hint: "الوكلاء يكتبون توصياتهم الآن" },
  { key: "PENDING_APPROVAL", label: "بانتظار الاعتماد", hint: "اكتملت الدراسة وتنتظر قرارك في مركز القرار" },
  { key: "APPROVED", label: "معتمدة", hint: "أصبحت قابلة للتحويل إلى مشروع تنفيذي" },
  { key: "REJECTED", label: "مرفوضة", hint: "محفوظة للسجل والتعلّم" },
];

const EXTRA_AGENTS = [
  { id: "sara", label: "سارة — المبيعات" },
  { id: "khalid", label: "خالد — المشتريات" },
  { id: "majed", label: "ماجد — الحكومية" },
];

/** How the departments actually voted, as a count per verdict. */
function tally(recommendations: Recommendation[]) {
  return {
    APPROVE: recommendations.filter((r) => r.verdict === "APPROVE").length,
    CONDITIONAL: recommendations.filter((r) => r.verdict === "CONDITIONAL").length,
    REJECT: recommendations.filter((r) => r.verdict === "REJECT").length,
  };
}

export default function IdeasBoard() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [approvedIdeas, setApprovedIdeas] = useState<ApprovedIdea[]>([]);
  const [convertMsg, setConvertMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [converting, setConverting] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState<Stage | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [openIdea, setOpenIdea] = useState<string | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [recFor, setRecFor] = useState<string | null>(null);
  const [recAgent, setRecAgent] = useState("");
  const [recNote, setRecNote] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/company/ideas", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        setIdeas(json.ideas || []);
        setApprovedIdeas(json.approvedIdeas || []);
        setStats(json.stats || null);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const element = e.currentTarget;
    try {
      const res = await fetch("/api/company/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          hypothesis: form.get("hypothesis"),
          budgetSAR: Number(form.get("budget")),
          horizonDays: Number(form.get("horizon")),
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "تعذر تقديم الفكرة");
      element.reset();
      setIntakeOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تقديم الفكرة");
    } finally {
      setSubmitting(false);
    }
  }

  async function recommend(ideaId: string, verdict: Verdict) {
    if (!recAgent || !recNote.trim()) return;
    try {
      const res = await fetch("/api/company/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recommend", ideaId, agentId: recAgent, verdict, note: recNote.trim() }),
      });
      const json = await res.json();
      if (json.ok) {
        setRecFor(null);
        setRecAgent("");
        setRecNote("");
        await load();
      }
    } catch {
      // silent
    }
  }

  async function convertIdea(ideaId: string) {
    setConverting(ideaId);
    setConvertMsg(null);
    try {
      const res = await fetch("/api/company/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "execute", ideaId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || json.execution?.reason || "تعذر تحويل الفكرة.");
      setConvertMsg({ text: json.execution.reason || "تم تحويل الفكرة إلى مشروع.", ok: true });
      await load();
    } catch (err) {
      setConvertMsg({ text: err instanceof Error ? err.message : "تعذر تحويل الفكرة.", ok: false });
    } finally {
      setConverting(null);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const todaysTeamIdea = ideas.find((i) => i.source === "TEAM" && i.dayKey === today);
  const counts = useMemo(() => {
    const map = {} as Record<Stage, number>;
    for (const item of STAGES) map[item.key] = ideas.filter((i) => i.status === item.key).length;
    return map;
  }, [ideas]);

  const shown = useMemo(() => {
    const needle = query.trim();
    return ideas.filter((idea) => {
      if (stage !== "ALL" && idea.status !== stage) return false;
      if (!needle) return true;
      return `${idea.title} ${idea.hypothesis} ${idea.proposedByName}`.includes(needle);
    });
  }, [ideas, stage, query]);

  const convertible = approvedIdeas.filter((idea) => !idea.executed);

  return (
    <main className="page-wrap">
      <header className="page-head">
        <div>
          <span className="eyebrow"><Lightbulb size={16} /> دورة الاستثمار: المراحل 1 إلى 4</span>
          <h1>الأفكار</h1>
          <p className="page-sub">
            كل فكرة تمر بأربع مراحل: يدرسها الوكلاء، يلخّصها سلطان، تصل مركز القرار للاعتماد، ثم تتحول إلى مشروع تنفيذي.
          </p>
        </div>
        <button className="primary-btn" onClick={() => setIntakeOpen((open) => !open)} aria-expanded={intakeOpen}>
          <Plus size={16} /> فكرة جديدة
        </button>
      </header>

      {intakeOpen && (
        <section className="bento-card bento-full" style={{ gap: 12 }}>
          <span className="bento-kicker"><UserRound size={15} /> فكرة من المالك، تُدرس فور الإرسال</span>
          <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
            <div className="report-two-col">
              <label>
                عنوان الفكرة
                <input className="input" name="title" required placeholder="مثال: إطلاق منتج اشتراك شهري" />
              </label>
              <div className="report-two-col" style={{ gap: 10 }}>
                <label>
                  الميزانية (ر.س)
                  <input className="input" name="budget" type="number" min={100} step={100} required defaultValue={10000} />
                </label>
                <label>
                  الأفق (أيام)
                  <input className="input" name="horizon" type="number" min={7} step={1} required defaultValue={30} />
                </label>
              </div>
            </div>
            <label>
              الفرضية — لماذا ستنجح؟
              <textarea className="textarea compact" name="hypothesis" required placeholder="اشرح المنطق التجاري للفكرة في سطرين..." />
            </label>
            <button className="primary-btn" disabled={submitting} style={{ width: "fit-content" }}>
              {submitting ? <Loader2 className="spin" size={17} /> : <Send size={17} />}
              قدّم للدراسة الفورية
            </button>
            {error && <p className="notice error">{error}</p>}
          </form>
        </section>
      )}

      {/* Approved ideas that have not become projects yet: the one thing on this
          page that is actionable right now, so it leads. */}
      {convertible.length > 0 && (
        <section className="bento-card bento-full" style={{ gap: 10 }}>
          <span className="bento-kicker"><FolderKanban size={15} /> جاهزة للتحويل إلى مشروع ({convertible.length})</span>
          {convertMsg && <p className={`notice ${convertMsg.ok ? "done" : "error"}`}>{convertMsg.text}</p>}
          {convertible.map((idea) => (
            <div key={idea.id} className="statement-row" style={{ alignItems: "center", gap: 10 }}>
              <span>
                <strong>{idea.title}</strong>
                <small style={{ color: "var(--muted)", display: "block" }}>
                  الميزانية {sar.format(idea.budgetSAR)} · {idea.tierLabel || idea.tier}
                </small>
              </span>
              <button className="primary-btn btn-sm" disabled={converting === idea.id} onClick={() => convertIdea(idea.id)}>
                {converting === idea.id ? <Loader2 className="spin" size={14} /> : <FolderKanban size={14} />}
                {converting === idea.id ? "جارٍ التحويل…" : "تحويل إلى مشروع"}
              </button>
            </div>
          ))}
        </section>
      )}

      <div className="stage-strip" role="tablist" aria-label="مراحل الأفكار">
        <button
          role="tab"
          aria-selected={stage === "ALL"}
          className={`stage-chip ${stage === "ALL" ? "active" : ""}`}
          onClick={() => setStage("ALL")}
        >
          <b>{ideas.length}</b>
          <span>الكل</span>
        </button>
        {STAGES.map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={stage === item.key}
            className={`stage-chip ${stage === item.key ? "active" : ""}`}
            onClick={() => setStage(item.key)}
            title={item.hint}
          >
            <b>{counts[item.key] || 0}</b>
            <span>{item.label}</span>
          </button>
        ))}
        <label className="decide-search">
          <Search size={15} aria-hidden />
          <input
            className="input"
            type="search"
            value={query}
            placeholder="ابحث في الأفكار…"
            aria-label="ابحث في الأفكار"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      {stats && (
        <p className="stage-note">
          {stats.total} فكرة إجمالاً · {stats.fromTeam} من الفريق · {stats.approved} معتمدة · {stats.rejected} مرفوضة
        </p>
      )}

      {loading && (
        <div className="bento-card bento-full" style={{ placeItems: "center", padding: 30 }}>
          <Loader2 className="spin" size={24} style={{ color: "var(--muted)" }} />
        </div>
      )}

      {!loading && shown.length === 0 && (
        <div className="empty-state" style={{ minHeight: 150 }}>
          <Lightbulb size={30} />
          <strong>لا توجد أفكار في هذه المرحلة</strong>
          <span>قدّم فكرة جديدة، أو انتظر فكرة الفريق اليومية.</span>
        </div>
      )}

      <div className="idea-list">
        {shown.map((idea) => {
          const isToday = idea.id === todaysTeamIdea?.id;
          const isOpen = openIdea === idea.id;
          const votes = tally(idea.recommendations);
          const linked = approvedIdeas.find((a) => a.id === idea.id);
          return (
            <article key={idea.id} className={`idea-card ${isOpen ? "is-open" : ""}`}>
              <button
                className="idea-card__head"
                aria-expanded={isOpen}
                onClick={() => setOpenIdea(isOpen ? null : idea.id)}
              >
                <span className="idea-card__title">
                  <b>{idea.title}</b>
                  <small>
                    {idea.source === "TEAM" ? (isToday ? "فكرة الفريق اليوم" : "من الفريق") : "من المالك"} · {idea.proposedByName}
                    {" · "}الفئة {idea.tier} · {idea.horizonDays} يوماً
                  </small>
                </span>
                <span className="idea-card__votes" aria-label="توصيات الأقسام">
                  {(Object.keys(votes) as Verdict[]).map((verdict) =>
                    votes[verdict] ? (
                      <em key={verdict} style={{ color: verdictMeta[verdict].color }}>
                        {votes[verdict]} {verdictMeta[verdict].label}
                      </em>
                    ) : null
                  )}
                </span>
                <span className="idea-card__budget">{sar.format(idea.budgetSAR)}</span>
                <ChevronDown className="idea-card__chevron" size={17} aria-hidden />
              </button>

              {idea.aggregate && (
                <p className="idea-card__summary">
                  <Sparkles size={14} aria-hidden /> {idea.aggregate.summary}
                  {idea.belowThreshold && <span className="idea-flag">دون حد الثقة</span>}
                  {idea.studyMode === "LLM" && <span className="idea-flag">تحليل AI</span>}
                </p>
              )}

              {isOpen && (
                <div className="idea-card__body">
                  <p className="idea-card__hypothesis">{idea.hypothesis}</p>

                  <div className="bento-list">
                    {idea.recommendations.map((rec, i) => {
                      const meta = verdictMeta[rec.verdict];
                      const Icon = meta.Icon;
                      return (
                        <div key={`${rec.agentId}-${i}`} className="bento-list__row" style={{ alignItems: "flex-start" }}>
                          <span>
                            <b style={{ color: "var(--text-strong)" }}>{rec.agentName}</b> · <small>{rec.agentTitle}</small>
                            <br />
                            <small>{rec.report}</small>
                          </span>
                          <span style={{ color: meta.color, display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", fontWeight: 700, fontSize: "0.76rem" }}>
                            <Icon size={14} /> {meta.label} {(rec.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {idea.aggregate?.narrative && (
                    <p className="idea-card__narrative">{idea.aggregate.narrative}</p>
                  )}

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {idea.status === "PENDING_APPROVAL" && (
                      <Link className="primary-btn btn-sm" href="/inbox">
                        <Inbox size={14} /> للاعتماد في مركز القرار <ArrowLeft size={13} />
                      </Link>
                    )}
                    {linked?.executed && linked.executedProjectId && (
                      <Link className="secondary-btn btn-sm" href={`/projects?project=${encodeURIComponent(linked.executedProjectId)}`}>
                        <FolderKanban size={14} /> افتح المشروع
                      </Link>
                    )}
                    <button className="ghost-btn btn-sm" onClick={() => setRecFor(recFor === idea.id ? null : idea.id)}>
                      <Users size={14} /> أضف توصية قسم آخر
                    </button>
                  </div>

                  {recFor === idea.id && (
                    <div className="decide-panel">
                      <div className="report-two-col">
                        <label>
                          الوكيل
                          <select className="input" value={recAgent} onChange={(e) => setRecAgent(e.target.value)}>
                            <option value="" disabled>اختر الوكيل…</option>
                            {EXTRA_AGENTS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                          </select>
                        </label>
                        <label>
                          نص التوصية
                          <input className="input" value={recNote} onChange={(e) => setRecNote(e.target.value)} />
                        </label>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="primary-btn btn-sm" disabled={!recAgent || !recNote.trim()} onClick={() => recommend(idea.id, "APPROVE")}>
                          <ThumbsUp size={14} /> يُوصى
                        </button>
                        <button className="secondary-btn btn-sm" disabled={!recAgent || !recNote.trim()} onClick={() => recommend(idea.id, "CONDITIONAL")}>
                          <MinusCircle size={14} /> بتحفظ
                        </button>
                        <button className="ghost-btn btn-sm danger-text" disabled={!recAgent || !recNote.trim()} onClick={() => recommend(idea.id, "REJECT")}>
                          <ThumbsDown size={14} /> لا يُوصى
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </main>
  );
}
