"use client";

import { useEffect, useState } from "react";
import { Activity, Loader2, CheckCircle2, XCircle, Clock, GitCommit } from "lucide-react";

type Deployment = {
  id: string;
  url: string;
  state: string;
  createdAt: string;
  target: string;
  commitMessage?: string;
};

type Snapshot = {
  ok: boolean;
  configured: boolean;
  source: "live" | "mock";
  projectName: string;
  currentState: string;
  healthy: boolean;
  deployments: Deployment[];
  errorCount: number;
  lastDeployedAt: string | null;
};

const stateColors: Record<string, string> = {
  READY: "var(--green)",
  BUILDING: "var(--amber)",
  QUEUED: "var(--amber)",
  INITIALIZING: "var(--amber)",
  ERROR: "var(--red)",
  CANCELED: "var(--muted)",
};

const stateLabels: Record<string, string> = {
  READY: "جاهز",
  BUILDING: "قيد البناء",
  QUEUED: "في الانتظار",
  INITIALIZING: "تهيئة",
  ERROR: "خطأ",
  CANCELED: "ملغى",
};

export default function MonitoringPanel() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch("/api/monitoring");
      const json = await res.json();
      if (json.ok) setData(json);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="delivery-panel" style={{ padding: 24, textAlign: "center" }}>
        <Loader2 className="spin" size={24} style={{ color: "var(--muted)" }} />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="delivery-panel fade-in" style={{ display: "grid", gap: 16 }}>
      <div className="delivery-header">
        <div>
          <span className="eyebrow"><Activity size={16} /> مراقبة النشر</span>
          <h2>حالة النظام · {data.projectName}</h2>
        </div>
        <span className={`status-pill ${data.healthy ? "done" : "running"}`}>
          {data.healthy ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {stateLabels[data.currentState] || data.currentState}
        </span>
      </div>

      {data.source === "mock" && (
        <p className="notice" style={{ color: "var(--muted)" }}>
          أضف <code>VERCEL_API_TOKEN</code> و <code>VERCEL_PROJECT_ID</code> لعرض حالة النشر الحقيقية.
        </p>
      )}

      <div className="finance-summary">
        <div className={`metric-card ${data.healthy ? "green" : "red"}`}>
          <small>الحالة الحالية</small>
          <strong>{stateLabels[data.currentState] || data.currentState}</strong>
        </div>
        <div className={`metric-card ${data.errorCount > 0 ? "red" : "green"}`}>
          <small>عمليات نشر فاشلة</small>
          <strong>{data.errorCount}</strong>
        </div>
        <div className="metric-card">
          <small>إجمالي النشرات</small>
          <strong>{data.deployments.length}</strong>
        </div>
      </div>

      <div className="report-section-box">
        <div className="report-section-header">
          <Clock size={18} style={{ color: "var(--primary)" }} />
          <strong>سجل النشر</strong>
        </div>
        <div className="memory-list">
          {data.deployments.map((d) => (
            <div key={d.id} className="statement-row">
              <span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <GitCommit size={13} style={{ color: "var(--muted)" }} />
                  {d.commitMessage || d.url}
                </span>
                <br />
                <small style={{ color: "var(--muted)" }}>
                  {d.target} · {new Date(d.createdAt).toLocaleString("ar-SA")}
                </small>
              </span>
              <b style={{ color: stateColors[d.state] || "var(--muted)" }}>
                {stateLabels[d.state] || d.state}
              </b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
