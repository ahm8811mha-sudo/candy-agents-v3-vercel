"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, RefreshCcw } from "lucide-react";

type ActionPayload = {
  confidence?: number;
  assumptions?: string[];
  evidence?: Array<{ summary?: string }>;
  blockedBy?: string[];
  priority?: string;
};

type CompanyAction = {
  id: string;
  title: string;
  action_type: string;
  description?: string;
  status: string;
  execution_mode?: string;
  provider?: string;
  requires_approval?: boolean;
  approval_status?: string;
  payload?: ActionPayload;
  attempts?: number;
  error?: string;
  created_at?: string;
};

const statusLabels: Record<string, string> = {
  QUEUED: "في قائمة التنفيذ",
  WAITING_APPROVAL: "بانتظار اعتماد",
  WAITING_INTEGRATION: "بانتظار تكامل",
  RUNNING: "قيد التنفيذ",
  DONE: "مكتمل",
  FAILED: "فشل",
  CANCELLED: "ملغي",
};

function statusIcon(status: string) {
  if (status === "DONE") return <CheckCircle2 size={16} />;
  if (status === "FAILED") return <AlertTriangle size={16} />;
  if (status === "RUNNING") return <Activity size={16} />;
  return <Clock3 size={16} />;
}

export default function ActionQueuePanel() {
  const [actions, setActions] = useState<CompanyAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/company/actions?limit=50", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "تعذر تحميل قائمة الأفعال.");
      setActions(data.actions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل قائمة الأفعال.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const summary = useMemo(() => {
    const waiting = actions.filter((item) => item.status === "WAITING_APPROVAL" || item.status === "WAITING_INTEGRATION").length;
    const running = actions.filter((item) => item.status === "RUNNING" || item.status === "QUEUED").length;
    const done = actions.filter((item) => item.status === "DONE").length;
    const failed = actions.filter((item) => item.status === "FAILED").length;
    return { waiting, running, done, failed };
  }, [actions]);

  return (
    <section className="delivery-panel fade-in">
      <div className="delivery-header">
        <div>
          <span className="eyebrow"><Activity size={16} /> Action Queue</span>
          <h2>ماذا حدث بعد الاعتماد؟</h2>
        </div>
        <button className="secondary-btn" onClick={load} type="button" disabled={loading}>
          <RefreshCcw size={16} />
          {loading ? "تحديث..." : "تحديث"}
        </button>
      </div>

      {error && <p className="notice error">{error}</p>}

      <div className="finance-summary" style={{ marginBottom: 16 }}>
        <Metric title="بانتظار" value={summary.waiting} />
        <Metric title="قيد التنفيذ" value={summary.running} />
        <Metric title="مكتمل" value={summary.done} />
        <Metric title="فشل" value={summary.failed} />
      </div>

      {actions.length === 0 ? (
        <div className="empty-state">
          <Clock3 size={34} />
          <strong>لا توجد أفعال تنفيذية بعد</strong>
          <span>اعتمد فكرة أو شغّل مشروعًا حتى تظهر الأفعال هنا.</span>
        </div>
      ) : (
        <div className="report-stack">
          {actions.map((action) => {
            const confidence = action.payload?.confidence;
            const blockedBy = action.payload?.blockedBy || [];
            const evidence = action.payload?.evidence || [];
            return (
              <article className="report-card" key={action.id}>
                <h3 style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                  <span>{action.title}</span>
                  <small>{statusIcon(action.status)} {statusLabels[action.status] || action.status}</small>
                </h3>
                <pre>{[
                  `النوع: ${action.action_type}`,
                  `الوضع: ${action.execution_mode || "INTERNAL"}`,
                  `المزود: ${action.provider || "internal"}`,
                  `الاعتماد: ${action.approval_status || "NOT_REQUIRED"}`,
                  typeof confidence === "number" ? `الثقة: ${confidence}%` : null,
                  blockedBy.length ? `المعوقات: ${blockedBy.join(" | ")}` : "المعوقات: لا توجد معوقات مسجلة",
                  evidence.length ? `الدليل: ${evidence.map((item) => item.summary).filter(Boolean).join(" | ").slice(0, 500)}` : "الدليل: غير مسجل",
                  action.error ? `الخطأ: ${action.error}` : null,
                ].filter(Boolean).join("\n")}</pre>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <article className="metric-card green">
      <small>{title}</small>
      <strong>{value.toLocaleString("ar-SA")}</strong>
    </article>
  );
}
