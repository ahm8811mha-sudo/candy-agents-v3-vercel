"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Loader2, Activity, RefreshCw, ArrowLeft, Brain, Target } from "lucide-react";

type Presence = "WORKING" | "TODAY" | "IDLE";

type AgentRoom = {
  id: string;
  name: string;
  title: string;
  rank: string;
  department: string;
  href?: string;
  presence: Presence;
  presenceLabel: string;
  lastAction?: string;
  lastActivityAt?: string;
};

type PulseEvent = {
  id: string;
  agentId: string;
  agentName: string;
  kind: string;
  kindLabel: string;
  title: string;
  createdAt: string;
};

type Learning = {
  decisionsAnalyzed: number;
  approvalRate: number;
  confidenceThreshold: number;
  agentAccuracy: Array<{ agentId: string; agentName: string; studied: number; aligned: number; accuracy: number }>;
  recommendation: string;
};

const kindPill: Record<string, string> = {
  IDEA: "medium",
  STUDY: "done",
  SUMMARY: "done",
  GATE: "medium",
  SIGNOFF: "done",
  REVIEW: "medium",
};

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "الآن";
  if (min < 60) return `قبل ${min} د`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `قبل ${hrs} س`;
  return `قبل ${Math.floor(hrs / 24)} يوم`;
}

function Room({ agent }: { agent: AgentRoom }) {
  const body = (
    <article className={`bento-card room-card room--${agent.presence.toLowerCase()}`} style={{ height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="room-avatar">{agent.name.slice(0, 2)}</span>
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: "block", color: "var(--text-strong)" }}>{agent.name}</strong>
          <small style={{ color: "var(--muted)", fontSize: "0.72rem" }}>{agent.title}</small>
        </div>
        <span className={`presence-dot presence-dot--${agent.presence.toLowerCase()}`} style={{ marginInlineStart: "auto" }} />
      </div>
      <span className={`mini-pill ${agent.presence === "WORKING" ? "done" : agent.presence === "TODAY" ? "medium" : ""}`} style={{ width: "fit-content" }}>
        {agent.presenceLabel}{agent.lastActivityAt ? ` · ${timeAgo(agent.lastActivityAt)}` : ""}
      </span>
      <span className="bento-foot" style={{ lineHeight: 1.7 }}>
        {agent.lastAction || "بانتظار أول مهمة في السجل"}
      </span>
    </article>
  );

  return agent.href ? (
    <Link href={agent.href} style={{ color: "inherit", textDecoration: "none", display: "block" }}>{body}</Link>
  ) : body;
}

export default function GoldenStarOffice() {
  const [agents, setAgents] = useState<AgentRoom[]>([]);
  const [events, setEvents] = useState<PulseEvent[]>([]);
  const [working, setWorking] = useState(0);
  const [learning, setLearning] = useState<Learning | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [pulseRes, learnRes] = await Promise.all([
        fetch("/api/company/pulse", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/company/learning", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ]);
      if (pulseRes?.ok) {
        setAgents(pulseRes.agents || []);
        setEvents(pulseRes.events || []);
        setWorking(pulseRes.workingCount || 0);
      }
      if (learnRes?.ok) setLearning(learnRes);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const leadership = agents.filter((a) => a.rank === "OWNER" || a.rank === "CEO");
  const staff = agents.filter((a) => a.rank !== "OWNER" && a.rank !== "CEO");

  return (
    <main className="page-wrap">
      <header className="page-head">
        <div>
          <span className="eyebrow"><Building2 size={16} /> غرفة التحكم</span>
          <h1 className="glow-title">مكتب النجمة الذهبية</h1>
          <p className="page-sub">
            كل وكيل في غرفته — ومؤشر نشاطه مُشتق من سجلات النظام الفعلية (أفكار، دراسات، اعتمادات)، لا رسوم ديكورية.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className={`status-pill ${working > 0 ? "done" : ""}`}>
            <Activity size={14} /> {working > 0 ? `${working} يعمل الآن` : "المكتب هادئ"}
          </span>
          <button className="secondary-btn btn-sm" onClick={load} aria-label="تحديث">
            <RefreshCw size={14} />
          </button>
        </div>
      </header>

      {loading && (
        <div className="bento-card bento-full" style={{ placeItems: "center", padding: 30 }}>
          <Loader2 className="spin" size={24} style={{ color: "var(--muted)" }} />
        </div>
      )}

      {!loading && (
        <>
          <section style={{ display: "grid", gap: 10 }}>
            <strong className="shell-group" style={{ padding: 0 }}>جناح القيادة</strong>
            <div className="bento-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
              {leadership.map((a) => <Room key={a.id} agent={a} />)}
            </div>
          </section>

          <section style={{ display: "grid", gap: 10 }}>
            <strong className="shell-group" style={{ padding: 0 }}>غرف الأقسام</strong>
            <div className="bento-grid">
              {staff.map((a) => <Room key={a.id} agent={a} />)}
            </div>
          </section>

          {/* Self-improvement — the company learning from its own record */}
          {learning && (
            <section className="bento-card bento-full bento-card--glow" style={{ gap: 12 }}>
              <span className="bento-kicker"><Brain size={15} /> التعلّم الذاتي — الشركة تتعلّم من قراراتها</span>
              <div className="report-kpi-grid">
                <div className="kpi-card-inner">
                  <small>قرارات مكتملة حُلّلت</small>
                  <strong>{learning.decisionsAnalyzed}</strong>
                </div>
                <div className="kpi-card-inner">
                  <small>نسبة الاعتماد</small>
                  <strong>{Math.round(learning.approvalRate * 100)}%</strong>
                </div>
                <div className="kpi-card-inner">
                  <small><Target size={12} style={{ verticalAlign: "middle" }} /> حد الثقة المتكيّف</small>
                  <strong>{Math.round(learning.confidenceThreshold * 100)}%</strong>
                </div>
              </div>
              <div className="statement-row" style={{ background: "var(--accent-sky-soft)" }}>
                <span>{learning.recommendation}</span>
              </div>
              {learning.agentAccuracy.length > 0 && (
                <div className="bento-list">
                  {learning.agentAccuracy.map((a) => (
                    <div key={a.agentId} className="bento-list__row">
                      <span><b style={{ color: "var(--text-strong)" }}>{a.agentName}</b> · توافق مع قرارك</span>
                      <b style={{ color: a.accuracy >= 0.6 ? "var(--green)" : a.accuracy >= 0.4 ? "var(--amber)" : "var(--red)", fontVariantNumeric: "tabular-nums" }}>
                        {Math.round(a.accuracy * 100)}% ({a.aligned}/{a.studied})
                      </b>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="bento-card bento-full" style={{ gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span className="bento-kicker"><Activity size={15} /> نبض الشركة — آخر {events.length} حدثاً</span>
              <Link href="/inbox" className="secondary-btn btn-sm">مركز القرار <ArrowLeft size={12} /></Link>
            </div>
            <div className="bento-list">
              {events.length === 0 && (
                <div className="bento-list__row"><small>لا أحداث بعد — قدّم فكرة أو شغّل دورة لتبدأ الحركة.</small></div>
              )}
              {events.map((e) => (
                <div key={e.id} className="bento-list__row" style={{ alignItems: "flex-start" }}>
                  <span>
                    <b style={{ color: "var(--text-strong)" }}>{e.agentName}</b> — {e.title}
                  </span>
                  <span style={{ display: "grid", gap: 4, justifyItems: "end", whiteSpace: "nowrap" }}>
                    <span className={`mini-pill ${kindPill[e.kind] || ""}`}>{e.kindLabel}</span>
                    <small style={{ color: "var(--muted)" }}>{timeAgo(e.createdAt)}</small>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
