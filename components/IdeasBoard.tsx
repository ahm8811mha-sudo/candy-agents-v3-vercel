"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
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

type Stats = { total: number; pending: number; approved: number; rejected: number; fromTeam: number };

const sar = new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 });

const verdictMeta: Record<Verdict, { label: string; color: string; Icon: typeof ThumbsUp }> = {
  APPROVE: { label: "يُوصى", color: "var(--green)", Icon: ThumbsUp },
  CONDITIONAL: { label: "بتحفظ", color: "var(--amber)", Icon: MinusCircle },
  REJECT: { label: "لا يُوصى", color: "var(--red)", Icon: ThumbsDown },
};

const statusMeta: Record<Idea["status"], { label: string; pill: string }> = {
  UNDER_STUDY: { label: "قيد الدراسة", pill: "medium" },
  PENDING_APPROVAL: { label: "بانتظار الاعتماد", pill: "medium" },
  APPROVED: { label: "معتمدة", pill: "done" },
  REJECTED: { label: "مرفوضة", pill: "high" },
};

const EXTRA_AGENTS = [
  { id: "sara", label: "سارة — المبيعات" },
  { id: "khalid", label: "خالد — المشتريات" },
  { id: "majed", label: "ماجد — الحكومية" },
];

export default function IdeasBoard() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [approvedIdeas, setApprovedIdeas] = useState<Array<Idea & { executed: boolean; executedProjectId?: string }>>([]);
  const [convertMsg, setConvertMsg] = useState("");
  const [converting, setConverting] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
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
      (e.target as HTMLFormElement).reset();
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
    setConvertMsg("");
    try {
      const res = await fetch("/api/company/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "execute", ideaId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || json.execution?.reason || "تعذر تحويل الفكرة.");
      setConvertMsg(`✅ ${json.execution.reason || "تم تحويل الفكرة إلى مشروع."}`);
      await load();
    } catch (err) {
      setConvertMsg(`⚠️ ${err instanceof Error ? err.message : "تعذر تحويل الفكرة."}`);
    } finally {
      setConverting(null);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const todaysTeamIdea = ideas.find((i) => i.source === "TEAM" && i.dayKey === today);

  return (
    <main className="page-wrap">
      <header className="page-head">
        <div>
          <span className="eyebrow"><Lightbulb size={16} /> دورة الاستثمار — المراحل 1–4</span>
          <h1 className="glow-title">الأفكار — فكرة قابلة للتنفيذ كل يوم</h1>
          <p className="page-sub">
            قدّم فكرتك، أو استلم فكرة الفريق اليومية — تُدرس فوراً من عبدالرحمن ونورة وفهد، يلخّصها سلطان،
            ثم تصل مركز القرار للاعتماد حسب مصفوفة الصلاحيات.
          </p>
        </div>
        {stats && (
          <span className={`status-pill ${stats.pending > 0 ? "running" : "done"}`}>
            {stats.pending} بانتظار الاعتماد · {stats.fromTeam} من الفريق
          </span>
        )}
      </header>

      {/* Approved ideas — pick and convert (no manual id entry) */}
      {approvedIdeas.length > 0 && (
        <section className="bento-card bento-full" style={{ gap: 10 }}>
          <span className="bento-kicker">✅ الأفكار المعتمدة ({approvedIdeas.length}) — اختر منها للتحويل إلى مشروع</span>
          {convertMsg && <p style={{ color: convertMsg.startsWith("✅") ? "var(--green)" : "var(--amber)", margin: 0 }}>{convertMsg}</p>}
          <div style={{ display: "grid", gap: 8 }}>
            {approvedIdeas.map((idea) => (
              <div key={idea.id} className="statement-row" style={{ alignItems: "center", gap: 10 }}>
                <span>
                  <strong>{idea.title}</strong>
                  <small style={{ color: "var(--muted)", display: "block" }}>
                    الميزانية {idea.budgetSAR.toLocaleString("ar-SA")} ر.س · {idea.tierLabel || idea.tier}
                    {idea.executed && idea.executedProjectId ? ` · المشروع: ${idea.executedProjectId}` : ""}
                  </small>
                </span>
                {idea.executed ? (
                  <span className="mini-pill done">محوّلة إلى مشروع ✓</span>
                ) : (
                  <button
                    className="primary-btn btn-sm"
                    disabled={converting === idea.id}
                    onClick={() => convertIdea(idea.id)}
                  >
                    {converting === idea.id ? "جارٍ التحويل…" : "تحويل إلى مشروع"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Owner idea intake */}
      <section className="bento-card bento-full" style={{ gap: 12 }}>
        <span className="bento-kicker"><UserRound size={15} /> فكرة من المالك</span>
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

      {loading && (
        <div className="bento-card bento-full" style={{ placeItems: "center", padding: 30 }}>
          <Loader2 className="spin" size={24} style={{ color: "var(--muted)" }} />
        </div>
      )}

      {/* Ideas list — today's team idea first */}
      <div style={{ display: "grid", gap: 14 }}>
        {ideas.map((idea) => {
          const isToday = idea.id === todaysTeamIdea?.id;
          return (
            <article
              key={idea.id}
              className={`bento-card ${isToday ? "bento-card--glow" : ""} ${idea.status === "APPROVED" ? "bento-card--green" : idea.status === "REJECTED" ? "bento-card--red" : ""}`}
              style={{ gap: 12 }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <span className="bento-kicker">
                    {idea.source === "TEAM" ? <Users size={14} /> : <UserRound size={14} />}
                    {idea.source === "TEAM" ? (isToday ? "فكرة الفريق اليوم ✦" : "من الفريق") : "من المالك"} · {idea.proposedByName}
                  </span>
                  <strong style={{ display: "block", fontSize: "1.1rem", color: "var(--text-strong)", marginTop: 4 }}>{idea.title}</strong>
                  <small style={{ color: "var(--muted)", lineHeight: 1.7 }}>{idea.hypothesis}</small>
                </div>
                <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                  <span className={`mini-pill ${statusMeta[idea.status].pill}`}>{statusMeta[idea.status].label}</span>
                  {idea.belowThreshold && <span className="mini-pill medium">دون حد الثقة</span>}
                  <b style={{ fontVariantNumeric: "tabular-nums" }}>{sar.format(idea.budgetSAR)}</b>
                  <small style={{ color: "var(--muted)" }}>الفئة {idea.tier} · {idea.horizonDays} يوماً</small>
                </div>
              </div>

              {/* Department recommendations */}
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
                      <span style={{ color: meta.color, display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", fontWeight: 900, fontSize: "0.76rem" }}>
                        <Icon size={14} /> {meta.label} {(rec.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>

              {idea.aggregate && (
                <div className="statement-row" style={{ background: "var(--accent-sky-soft)", display: "grid", gap: 6 }}>
                  <span>
                    <Sparkles size={14} style={{ color: "var(--accent-sky)" }} /> {idea.aggregate.summary}
                    {idea.studyMode === "LLM" && <span className="mini-pill done" style={{ marginInlineStart: 8 }}>تحليل ذكاء AI</span>}
                  </span>
                  {idea.aggregate.narrative && (
                    <small style={{ color: "var(--muted)", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{idea.aggregate.narrative}</small>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {idea.status === "PENDING_APPROVAL" && (
                  <Link className="primary-btn btn-sm" href="/inbox">
                    <Inbox size={14} /> للاعتماد في مركز القرار <ArrowLeft size={13} />
                  </Link>
                )}
                <button className="secondary-btn btn-sm" onClick={() => setRecFor(recFor === idea.id ? null : idea.id)}>
                  <Users size={14} /> أضف توصية قسم آخر
                </button>
              </div>

              {recFor === idea.id && (
                <div style={{ display: "grid", gap: 8 }}>
                  <div className="memory-search-bar">
                    <select className="input" value={recAgent} onChange={(e) => setRecAgent(e.target.value)}>
                      <option value="" disabled>اختر الوكيل...</option>
                      {EXTRA_AGENTS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                    </select>
                    <input className="input" placeholder="نص التوصية..." value={recNote} onChange={(e) => setRecNote(e.target.value)} />
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="primary-btn btn-sm" disabled={!recAgent || !recNote.trim()} onClick={() => recommend(idea.id, "APPROVE")}>
                      <ThumbsUp size={14} /> يُوصى
                    </button>
                    <button className="secondary-btn btn-sm" disabled={!recAgent || !recNote.trim()} onClick={() => recommend(idea.id, "CONDITIONAL")}>
                      <MinusCircle size={14} /> بتحفظ
                    </button>
                    <button className="secondary-btn btn-sm danger-text" disabled={!recAgent || !recNote.trim()} onClick={() => recommend(idea.id, "REJECT")}>
                      <ThumbsDown size={14} /> لا يُوصى
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </main>
  );
}
