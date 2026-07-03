"use client";

import { useEffect, useState, useCallback } from "react";
import { ShieldCheck, Loader2, Check, X, Inbox } from "lucide-react";

type ApprovalItem = {
  id: string;
  type: string;
  title: string;
  detail: string;
  amount?: number;
  requestedRole: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  note?: string;
};

type Stats = { pending: number; approved: number; rejected: number; total: number };

const currency = new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 });

const statusMeta: Record<string, { label: string; pill: string }> = {
  PENDING: { label: "بانتظار القرار", pill: "medium" },
  APPROVED: { label: "تم الاعتماد", pill: "done" },
  REJECTED: { label: "مرفوض", pill: "high" },
};

export default function ApprovalCenter() {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [execMsg, setExecMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/approvals/decisions", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        setItems(json.approvals);
        setStats(json.stats);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Refresh when a trading cycle creates new approvals.
    const handler = () => load();
    window.addEventListener("approvals-updated", handler);
    return () => window.removeEventListener("approvals-updated", handler);
  }, [load]);

  async function decide(id: string, decision: "APPROVED" | "REJECTED") {
    setDeciding(id);
    try {
      const res = await fetch("/api/approvals/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      const json = await res.json();
      if (json.ok) {
        setItems((prev) => prev.map((it) => (it.id === id ? json.item : it)));
        setStats(json.stats);
        if (json.execution) {
          setExecMsg({ text: json.execution.reason, ok: json.execution.executed });
        }
      }
    } catch {
      // silent
    } finally {
      setDeciding(null);
    }
  }

  const pending = items.filter((i) => i.status === "PENDING");
  const decided = items.filter((i) => i.status !== "PENDING");

  return (
    <div className="delivery-panel fade-in" id="approval-center" style={{ display: "grid", gap: 16 }}>
      <div className="delivery-header">
        <div>
          <span className="eyebrow"><ShieldCheck size={16} /> مركز الاعتماد</span>
          <h2>القرارات التي تنتظر موافقتك</h2>
        </div>
        {stats && (
          <span className={`status-pill ${stats.pending > 0 ? "running" : "done"}`}>
            {stats.pending} بانتظار القرار
          </span>
        )}
      </div>

      {execMsg && (
        <p className={`notice ${execMsg.ok ? "done" : ""}`} style={{ color: execMsg.ok ? "var(--green)" : "var(--amber)" }}>
          {execMsg.ok ? "✅ " : "ℹ️ "}{execMsg.text}
        </p>
      )}

      {loading && (
        <div style={{ padding: 24, textAlign: "center" }}>
          <Loader2 className="spin" size={24} style={{ color: "var(--muted)" }} />
        </div>
      )}

      {!loading && pending.length === 0 && (
        <div className="empty-state" style={{ minHeight: 140 }}>
          <Inbox size={28} />
          <strong>لا توجد قرارات معلّقة</strong>
          <span>عند تشغيل دورة تداول تتجاوز فيها صفقة حد الموافقة، ستظهر هنا لاعتمادها أو رفضها.</span>
        </div>
      )}

      {pending.length > 0 && (
        <div className="memory-list">
          {pending.map((item) => (
            <div key={item.id} className="report-card" style={{ padding: 16, display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <strong>{item.title}</strong>
                {item.amount !== undefined && <b style={{ color: "var(--green)" }}>{currency.format(item.amount)}</b>}
              </div>
              <small style={{ color: "var(--muted)", lineHeight: 1.7 }}>{item.detail}</small>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="mini-pill">{item.type}</span>
                <span className="mini-pill">يتطلب: {item.requestedRole}</span>
                <div style={{ display: "flex", gap: 8, marginInlineStart: "auto" }}>
                  <button className="primary-btn" style={{ minHeight: 38, padding: "8px 14px" }} disabled={deciding === item.id} onClick={() => decide(item.id, "APPROVED")}>
                    {deciding === item.id ? <Loader2 className="spin" size={15} /> : <Check size={15} />} اعتماد
                  </button>
                  <button className="secondary-btn" style={{ minHeight: 38, padding: "8px 14px", color: "var(--red)" }} disabled={deciding === item.id} onClick={() => decide(item.id, "REJECTED")}>
                    <X size={15} /> رفض
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          <strong style={{ fontSize: "0.95rem", color: "var(--muted)" }}>القرارات السابقة</strong>
          {decided.slice(0, 8).map((item) => (
            <div key={item.id} className="statement-row">
              <span>
                {item.title}
                {item.amount !== undefined && <> · {currency.format(item.amount)}</>}
              </span>
              <span className={`mini-pill ${statusMeta[item.status]?.pill || ""}`}>
                {statusMeta[item.status]?.label || item.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
