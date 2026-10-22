"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCcw, AlertTriangle, UserPlus, CheckCircle2, Clock3, ArrowUpRight } from "lucide-react";
import { COMPANY_AGENTS } from "@/lib/company/agents";
import { fluidColumns } from "@/lib/ui/fluidColumns";

type Commitment = {
  id: string;
  title: string;
  detail: string | null;
  status: string;
  priority: string;
  assigneeId: string | null;
  assigneeName: string | null;
  decidedBy: string | null;
  dueAt: string | null;
  reminderCount: number;
  escalated: boolean;
  requiresProof: boolean;
  overdue: boolean;
  needsOwner: boolean;
};

type Brief = {
  open: number;
  assigned: number;
  inProgress: number;
  overdue: number;
  needsOwner: number;
  escalated: number;
  completedThisPeriod: number;
  byAssignee: Array<{ assignee: string; open: number; overdue: number }>;
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "بانتظار تعيين مسؤول",
  ASSIGNED: "مُسنَد",
  IN_PROGRESS: "قيد التنفيذ",
  COMPLETED: "مكتمل",
  BLOCKED: "متعثّر",
  CANCELLED: "ملغى",
};

const STATUS_CLASS: Record<string, string> = {
  OPEN: "high",
  ASSIGNED: "running",
  IN_PROGRESS: "running",
  COMPLETED: "done",
  BLOCKED: "high",
  CANCELLED: "",
};

// Everyone but the owner can be handed a decision to carry out.
const ASSIGNABLE = COMPANY_AGENTS.filter((a) => a.id !== "owner");

export default function DecisionFollowupCenter() {
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [closing, setClosing] = useState<string | null>(null);
  const [closeNote, setCloseNote] = useState("");
  const [closeError, setCloseError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/company/secretariat", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "تعذّر تحميل متابعة القرارات.");
      setCommitments(json.commitments || []);
      setBrief(json.brief || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر التحميل.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function act(id: string, payload: Record<string, unknown>, okMessage: string): Promise<boolean> {
    setBusyId(id);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/company/secretariat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...payload }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.reason || json.error || "تعذّر تنفيذ العملية.");
      setMessage(okMessage);
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تنفيذ العملية.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  function toggleClosing(c: Commitment) {
    setClosing(closing === c.id ? null : c.id);
    setCloseNote("");
    setCloseError("");
  }

  async function complete(c: Commitment) {
    const note = closeNote.trim();
    if (c.requiresProof && !note) {
      setCloseError("الإغلاق يتطلب دليلاً لهذا القرار.");
      return;
    }
    setCloseError("");
    if (await act(c.id, { status: "COMPLETED", completionNote: note }, "أُغلق القرار وسُجّل في سجل التدقيق.")) {
      setClosing(null);
      setCloseNote("");
    }
  }

  const openCommitments = useMemo(() => commitments.filter((c) => c.status !== "COMPLETED" && c.status !== "CANCELLED"), [commitments]);

  if (loading) {
    return <div className="delivery-panel" style={{ padding: 24, textAlign: "center" }}><Loader2 className="spin" size={24} style={{ color: "var(--muted)" }} /></div>;
  }

  return (
    <main className="page-wrap">
      <header className="page-head">
        <div>
          <h1 className="glow-title">متابعة القرارات</h1>
          <p className="page-sub">كل قرار معتمد أو محال يلتقطه رئيس الديوان التنفيذي بمسؤول وموعد، ويطارده حتى الإغلاق الحقيقي، فلا يضيع قرار بعد صدوره.</p>
        </div>
        <button className="secondary-btn btn-sm" onClick={() => void load()}><RefreshCcw size={14} /> تحديث</button>
      </header>

      {error && <p className="notice error">{error}</p>}
      {message && <p className="notice done">{message}</p>}

      {brief && (
        <section className="bento-grid" style={{ gridTemplateColumns: fluidColumns(5, 130, 14) }}>
          {[
            ["قيد المتابعة", brief.open + brief.assigned + brief.inProgress, ""],
            ["متأخرة", brief.overdue, brief.overdue ? "high" : ""],
            ["بلا مسؤول", brief.needsOwner, brief.needsOwner ? "high" : ""],
            ["مُصعّدة إليك", brief.escalated, brief.escalated ? "high" : ""],
            ["أُنجزت (٧ أيام)", brief.completedThisPeriod, "done"],
          ].map(([label, value, cls]) => (
            <article className="bento-card" key={String(label)}>
              <span className="bento-kicker">{label}</span>
              <strong style={{ fontSize: "2rem", color: cls === "high" ? "var(--red)" : cls === "done" ? "var(--green)" : "inherit" }}>{Number(value).toLocaleString("ar-SA-u-nu-latn")}</strong>
            </article>
          ))}
        </section>
      )}

      <section style={{ display: "grid", gap: 10 }}>
        {openCommitments.length === 0 ? (
          <div className="empty-state"><CheckCircle2 size={30} /><strong>لا قرارات مفتوحة</strong><span>كل القرارات الصادرة مُغلقة.</span></div>
        ) : openCommitments.map((c) => (
          <article className="bento-card bento-full" key={c.id} style={{ gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: "block" }}>{c.title}</strong>
                <small style={{ color: "var(--muted)" }}>
                  {c.decidedBy ? `قرار من: ${c.decidedBy} · ` : ""}
                  {c.assigneeName ? `المسؤول: ${c.assigneeName}` : "بانتظار تعيين مسؤول"}
                  {c.dueAt ? ` · الاستحقاق ${new Date(c.dueAt).toLocaleDateString("ar-SA-u-nu-latn")}` : ""}
                  {c.requiresProof ? " · يتطلب دليل إغلاق" : ""}
                </small>
              </div>
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                {c.overdue && <span className="mini-pill high"><AlertTriangle size={12} /> متأخر</span>}
                {c.escalated && <span className="mini-pill high"><ArrowUpRight size={12} /> مُصعّد</span>}
                <span className={`status-pill ${STATUS_CLASS[c.status] || ""}`}>{STATUS_LABELS[c.status] || c.status}</span>
              </span>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <UserPlus size={14} style={{ color: "var(--muted)" }} />
                <select
                  className="field"
                  style={{ minWidth: 180 }}
                  value={c.assigneeId || ""}
                  disabled={busyId === c.id}
                  onChange={(e) => { if (e.target.value) void act(c.id, { assigneeId: e.target.value }, "أُسنِد القرار للمسؤول."); }}
                >
                  <option value="" disabled>تعيين مسؤول…</option>
                  {ASSIGNABLE.map((a) => <option key={a.id} value={a.id}>{a.name}، {a.title}</option>)}
                </select>
              </span>

              {c.status !== "IN_PROGRESS" && c.status === "ASSIGNED" && (
                <button className="secondary-btn btn-sm" disabled={busyId === c.id} onClick={() => void act(c.id, { status: "IN_PROGRESS" }, "بدأ التنفيذ.")}>
                  <Clock3 size={14} /> بدء التنفيذ
                </button>
              )}
              <button className="primary-btn btn-sm" disabled={busyId === c.id || c.needsOwner} title={c.needsOwner ? "عيّن مسؤولاً أولاً" : undefined} aria-expanded={closing === c.id} onClick={() => toggleClosing(c)}>
                <CheckCircle2 size={14} /> تم الإنجاز
              </button>
            </div>

            {closing === c.id && (
              <form className="decide-panel followup-close" onSubmit={(event) => { event.preventDefault(); void complete(c); }}>
                <label htmlFor={`close-${c.id}`}>{c.requiresProof ? "دليل الإتمام" : "ملاحظة الإتمام (اختيارية)"}</label>
                <textarea
                  id={`close-${c.id}`}
                  className="textarea compact"
                  value={closeNote}
                  onChange={(event) => setCloseNote(event.target.value)}
                  placeholder={c.requiresProof ? "رقم مرجعي أو رابط أو وصف لما تم فعلاً" : "ما الذي أُنجز؟"}
                  aria-invalid={closeError ? true : undefined}
                  aria-describedby={`close-${c.id}-hint`}
                  autoFocus
                />
                <small id={`close-${c.id}-hint`} className={closeError ? "followup-close__error" : undefined} role={closeError ? "alert" : undefined}>
                  {closeError || (c.requiresProof ? "هذا القرار ذو أثر حقيقي، فلا يُغلق دون دليل." : "تُحفظ الملاحظة في سجل التدقيق مع الإغلاق.")}
                </small>
                <div className="decide-actions">
                  <button type="submit" className="primary-btn btn-sm" disabled={busyId === c.id}>
                    {busyId === c.id ? <Loader2 className="spin" size={14} /> : <CheckCircle2 size={14} />} تأكيد الإغلاق
                  </button>
                  <button type="button" className="text-action" onClick={() => toggleClosing(c)}>إلغاء</button>
                </div>
              </form>
            )}
          </article>
        ))}
      </section>

      {brief && brief.byAssignee.length > 0 && (
        <section className="bento-card bento-full" style={{ gap: 8 }}>
          <strong>التوزيع على المسؤولين</strong>
          <div className="bento-list">
            {brief.byAssignee.map((row) => (
              <div className="bento-list__row" key={row.assignee}>
                <span>{row.assignee}</span>
                <span style={{ display: "inline-flex", gap: 10 }}>
                  <small>{row.open} مفتوح</small>
                  {row.overdue > 0 && <small style={{ color: "var(--red)" }}>{row.overdue} متأخر</small>}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
