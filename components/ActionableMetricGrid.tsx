"use client";

import { useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, X, MessageSquarePlus, Share2, Loader2, ChevronDown, Inbox } from "lucide-react";

export type ItemContext = {
  requestedBy?: string; // who raised it, e.g. "المدير المالي (CFO)"
  relatedTo?: string; // the project/initiative it belongs to
  origin?: string; // background / prior direction that produced it
};

export type DrillItem = {
  id: string;
  title: string;
  subtitle?: string;
  context?: ItemContext;
};

export type ActionableMetric = {
  key: string;
  icon: LucideIcon;
  label: string;
  value: number;
  sourceType: string;
  items: DrillItem[];
};

type DecisionRecord = {
  action: "APPROVED" | "REJECTED" | "NOTED" | "FORWARDED";
  note?: string;
  forwardedTo?: string;
};

const DEFAULT_DEPARTMENTS = ["دراسة الجدوى", "المالية", "التسويق", "المبيعات", "العمليات", "المشتريات", "المدير المالي", "التنفيذي"];

const actionMeta: Record<string, { label: string; pill: string }> = {
  APPROVED: { label: "تم الاعتماد", pill: "done" },
  REJECTED: { label: "مرفوض", pill: "high" },
  NOTED: { label: "بها ملاحظة", pill: "medium" },
  FORWARDED: { label: "مُحالة", pill: "medium" },
};

export default function ActionableMetricGrid({
  metrics,
  departments = DEFAULT_DEPARTMENTS,
}: {
  metrics: ActionableMetric[];
  departments?: string[];
}) {
  const [map, setMap] = useState<Record<string, DecisionRecord>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [forwardFor, setForwardFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const loadDecisions = useCallback(async () => {
    try {
      const res = await fetch("/api/decisions", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setMap(json.map || {});
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    loadDecisions();
  }, [loadDecisions]);

  async function act(
    sourceType: string,
    item: DrillItem,
    action: DecisionRecord["action"],
    extra: { note?: string; forwardedTo?: string } = {}
  ) {
    setBusy(item.id);
    try {
      const res = await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType, sourceId: item.id, title: item.title, action, ...extra }),
      });
      const json = await res.json();
      if (json.ok) {
        setMap(json.map || {});
        setNoteFor(null);
        setForwardFor(null);
        setNoteText("");
      }
    } catch {
      // silent
    } finally {
      setBusy(null);
    }
  }

  const activeMetric = metrics.find((m) => m.key === selected) || null;

  return (
    <>
      <section className="ops-metrics">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const isActive = selected === metric.key;
          return (
            <button
              key={metric.key}
              type="button"
              className="metric-card green department-link"
              style={{ cursor: "pointer", textAlign: "inherit", borderColor: isActive ? "rgba(124,199,255,0.45)" : undefined }}
              onClick={() => setSelected(isActive ? null : metric.key)}
              aria-expanded={isActive}
            >
              <span><Icon size={20} /></span>
              <small>{metric.label}</small>
              <strong>{metric.value}</strong>
              <em style={{ color: "#7cc7ff", fontSize: "0.74rem", fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 4 }}>
                {isActive ? "إخفاء" : "عرض ومعالجة"} <ChevronDown size={13} style={{ transform: isActive ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
              </em>
            </button>
          );
        })}
      </section>

      {activeMetric && (
        <section className="ops-card fade-in" style={{ display: "grid", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{activeMetric.label} — العناصر ({activeMetric.items.length})</h2>

          {activeMetric.items.length === 0 && (
            <div className="empty-state" style={{ minHeight: 120 }}>
              <Inbox size={26} />
              <span>لا توجد عناصر متاحة للمعالجة في هذا المؤشر حالياً.</span>
            </div>
          )}

          <div style={{ display: "grid", gap: 10 }}>
            {activeMetric.items.map((item) => {
              const decision = map[`${activeMetric.sourceType}:${item.id}`];
              return (
                <div key={item.id} className="report-card" style={{ padding: 14, display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div>
                      <strong style={{ display: "block", lineHeight: 1.5 }}>{item.title}</strong>
                      {item.subtitle && <small style={{ color: "var(--muted)" }}>{item.subtitle}</small>}
                    </div>
                    {decision && (
                      <span className={`mini-pill ${actionMeta[decision.action]?.pill || ""}`}>
                        {actionMeta[decision.action]?.label || decision.action}
                        {decision.forwardedTo ? ` ← ${decision.forwardedTo}` : ""}
                      </span>
                    )}
                  </div>

                  {item.context && (item.context.requestedBy || item.context.relatedTo || item.context.origin) && (
                    <div className="statement-row" style={{ background: "rgba(56,211,159,0.05)", display: "grid", gap: 3 }}>
                      {item.context.requestedBy && <small style={{ color: "var(--muted)" }}>📌 مصدر الطلب: <b style={{ color: "var(--text)" }}>{item.context.requestedBy}</b></small>}
                      {item.context.relatedTo && <small style={{ color: "var(--muted)" }}>🔗 متعلّق بـ: <b style={{ color: "var(--text)" }}>{item.context.relatedTo}</b></small>}
                      {item.context.origin && <small style={{ color: "var(--muted)" }}>🧭 الخلفية: {item.context.origin}</small>}
                    </div>
                  )}

                  {decision?.note && (
                    <div className="statement-row" style={{ background: "rgba(124,199,255,0.06)" }}>
                      <span>📝 {decision.note}</span>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="primary-btn" style={{ minHeight: 34, padding: "6px 12px" }} disabled={busy === item.id} onClick={() => act(activeMetric.sourceType, item, "APPROVED")}>
                      {busy === item.id ? <Loader2 className="spin" size={14} /> : <Check size={14} />} اعتماد
                    </button>
                    <button className="secondary-btn" style={{ minHeight: 34, padding: "6px 12px", color: "var(--red)" }} disabled={busy === item.id} onClick={() => act(activeMetric.sourceType, item, "REJECTED")}>
                      <X size={14} /> رفض
                    </button>
                    <button className="secondary-btn" style={{ minHeight: 34, padding: "6px 12px" }} onClick={() => { setNoteFor(noteFor === item.id ? null : item.id); setForwardFor(null); }}>
                      <MessageSquarePlus size={14} /> ملاحظة
                    </button>
                    <button className="secondary-btn" style={{ minHeight: 34, padding: "6px 12px" }} onClick={() => { setForwardFor(forwardFor === item.id ? null : item.id); setNoteFor(null); }}>
                      <Share2 size={14} /> إحالة لقسم
                    </button>
                  </div>

                  {noteFor === item.id && (
                    <div className="memory-search-bar">
                      <input
                        className="input"
                        placeholder="اكتب ملاحظتك..."
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && noteText.trim() && act(activeMetric.sourceType, item, "NOTED", { note: noteText.trim() })}
                      />
                      <button className="primary-btn" style={{ minHeight: 42 }} disabled={!noteText.trim() || busy === item.id} onClick={() => act(activeMetric.sourceType, item, "NOTED", { note: noteText.trim() })}>
                        حفظ
                      </button>
                    </div>
                  )}

                  {forwardFor === item.id && (
                    <div className="memory-search-bar">
                      <select className="input" defaultValue="" onChange={(e) => e.target.value && act(activeMetric.sourceType, item, "FORWARDED", { forwardedTo: e.target.value })}>
                        <option value="" disabled>اختر القسم المختص...</option>
                        {departments.map((dept) => (
                          <option key={dept} value={dept}>{dept}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
