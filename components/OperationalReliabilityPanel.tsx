"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleSlash2,
  Clock3,
  Database,
  FileCheck2,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Workflow,
} from "lucide-react";

type Row = Record<string, unknown>;

type OperationsPayload = {
  generatedAt: string;
  summary: {
    openAlerts: number;
    criticalAlerts: number;
    failedWrites: number;
    deadLetters: number;
    failedIntegrations: number;
    trackedJobs: number;
    liveCapabilities: number;
    totalCapabilities: number;
    readinessEvidencePassed: number;
    readinessEvidenceTotal: number;
  };
  latestCronRuns: Row[];
  alerts: Row[];
  failedWrites: Row[];
  deadLetters: Row[];
  integrationAttempts: Row[];
  capabilities: Row[];
  backupVerificationRuns: Row[];
  readinessEvidence: Row[];
};

function dateTime(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toLocaleString("ar-SA") : String(value);
}

function badge(value: unknown) {
  const status = String(value || "UNKNOWN");
  const good = ["SUCCEEDED", "LIVE", "RESOLVED", "PUBLISHED", "PASS"].includes(status);
  const bad = ["FAILED", "CRITICAL", "DEAD_LETTER", "FAIL"].includes(status);
  return (
    <span className="mini-pill" style={{ color: bad ? "var(--red)" : good ? "var(--green)" : "var(--amber)" }}>
      {status}
    </span>
  );
}

export default function OperationalReliabilityPanel() {
  const [data, setData] = useState<OperationsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/system/operations", { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || "تعذر تحميل الحالة التشغيلية.");
      setData(json.operations);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل الحالة التشغيلية.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function action(actionName: string, id?: string) {
    setRunning(`${actionName}:${id || "global"}`);
    setError("");
    try {
      const response = await fetch("/api/system/operations", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: actionName, id }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || "تعذر تنفيذ الإجراء.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تنفيذ الإجراء.");
    } finally {
      setRunning("");
    }
  }

  const unhealthyJobs = useMemo(
    () => (data?.latestCronRuns || []).filter((row) => String(row.status) !== "SUCCEEDED"),
    [data]
  );

  if (loading && !data) {
    return <section className="bento-card" style={{ minHeight: 220, display: "grid", placeItems: "center" }}><Loader2 className="spin" /></section>;
  }

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <div className="section-head">
        <div>
          <span className="eyebrow">Operational Reliability</span>
          <h2 style={{ margin: "6px 0" }}>مركز الاعتمادية والتشغيل</h2>
          <p className="page-sub" style={{ margin: 0 }}>حالة المهام المجدولة، التنبيهات، الكتابات الفاشلة، التكاملات وأدلة الجاهزية.</p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button className="ghost-btn" onClick={() => action("RUN_WATCHDOG")} disabled={Boolean(running)}>
            {running.startsWith("RUN_WATCHDOG") ? <Loader2 className="spin" size={16} /> : <ShieldAlert size={16} />}
            تشغيل المراقب
          </button>
          <button className="ghost-btn" onClick={() => action("PROCESS_FAILED_WRITES")} disabled={Boolean(running)}>
            {running.startsWith("PROCESS_FAILED_WRITES") ? <Loader2 className="spin" size={16} /> : <RotateCcw size={16} />}
            معالجة الكتابات
          </button>
          <button className="ghost-btn" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "spin" : ""} size={16} /> تحديث
          </button>
        </div>
      </div>

      {error && <div className="notice" style={{ color: "var(--red)" }}>{error}</div>}

      {data && (
        <>
          <div className="stats-grid">
            {[
              ["التنبيهات المفتوحة", data.summary.openAlerts, AlertTriangle],
              ["الحرجة", data.summary.criticalAlerts, ShieldAlert],
              ["كتابات تحتاج معالجة", data.summary.failedWrites, Database],
              ["Dead Letters", data.summary.deadLetters, Workflow],
              ["تكاملات فاشلة", data.summary.failedIntegrations, Activity],
              ["أدلة جاهزية ناجحة", `${data.summary.readinessEvidencePassed}/${data.summary.readinessEvidenceTotal}`, FileCheck2],
            ].map(([label, value, Icon]) => {
              const IconComponent = Icon as typeof Activity;
              return (
                <div className="stat-card" key={String(label)}>
                  <IconComponent size={18} />
                  <strong>{String(value)}</strong>
                  <span>{String(label)}</span>
                </div>
              );
            })}
          </div>

          <div className="bento-card" style={{ gap: 14 }}>
            <div className="section-head">
              <div>
                <h3 style={{ margin: 0 }}>آخر تشغيل للمهام المجدولة</h3>
                <small style={{ color: "var(--muted)" }}>مراقبة {data.summary.trackedJobs} مهمة · غير السليم حاليًا: {unhealthyJobs.length}</small>
              </div>
              <span className="mini-pill"><Clock3 size={13} /> {dateTime(data.generatedAt)}</span>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>المهمة</th><th>الحالة</th><th>البداية</th><th>المدة</th><th>المعالج</th><th>الفاشل</th></tr></thead>
                <tbody>
                  {data.latestCronRuns.map((row) => (
                    <tr key={String(row.id)}>
                      <td><strong>{String(row.job_name || "—")}</strong></td>
                      <td>{badge(row.status)}</td>
                      <td>{dateTime(row.started_at)}</td>
                      <td>{row.duration_ms == null ? "—" : `${row.duration_ms} ms`}</td>
                      <td>{String(row.processed_count ?? 0)}</td>
                      <td>{String(row.failed_count ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bento-grid two">
            <div className="bento-card" style={{ gap: 12 }}>
              <h3 style={{ margin: 0 }}>التنبيهات التشغيلية</h3>
              {(data.alerts || []).filter((row) => row.status !== "RESOLVED").slice(0, 20).map((row) => (
                <div className="notice" key={String(row.id)} style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <strong>{String(row.title)}</strong>{badge(row.severity)}
                  </div>
                  <span style={{ color: "var(--muted)" }}>{String(row.message)}</span>
                  <small>{dateTime(row.last_seen_at)} · تكررت {String(row.occurrence_count || 1)} مرة</small>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {row.status === "OPEN" && <button className="ghost-btn" onClick={() => action("ACKNOWLEDGE_ALERT", String(row.id))}>إقرار</button>}
                    <button className="ghost-btn" onClick={() => action("RESOLVE_ALERT", String(row.id))}>حل</button>
                  </div>
                </div>
              ))}
              {!data.alerts.some((row) => row.status !== "RESOLVED") && <div className="notice done"><CheckCircle2 size={17} /> لا توجد تنبيهات مفتوحة.</div>}
            </div>

            <div className="bento-card" style={{ gap: 12 }}>
              <h3 style={{ margin: 0 }}>الكتابات وDead Letter</h3>
              {data.failedWrites.filter((row) => row.status !== "RESOLVED").slice(0, 10).map((row) => (
                <div className="notice" key={String(row.id)}>
                  <strong>{String(row.table_name)} · {String(row.operation)}</strong>
                  <div style={{ color: "var(--muted)", marginTop: 5 }}>{String(row.error_message || "فشل غير موضح")}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
                    {badge(row.status)}
                    <button className="ghost-btn" onClick={() => action("RETRY_FAILED_WRITE", String(row.id))}>إعادة الكتابة</button>
                  </div>
                </div>
              ))}
              {data.deadLetters.filter((row) => row.status === "OPEN").slice(0, 10).map((row) => {
                const isFailedWrite = String(row.source_type) === "failed_write";
                return (
                  <div className="notice" key={String(row.id)} style={{ borderColor: "rgba(239,68,68,.35)" }}>
                    <strong>Dead Letter: {String(row.operation)}</strong>
                    <div style={{ color: "var(--muted)", marginTop: 5 }}>{String(row.error_message)}</div>
                    <small style={{ display: "block", marginTop: 5 }}>المصدر: {String(row.source_type)}</small>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                      {isFailedWrite ? (
                        <button className="ghost-btn" onClick={() => action("RETRY_DEAD_LETTER", String(row.id))}>إعادة آمنة</button>
                      ) : (
                        <span className="mini-pill">يُعاد من مساره الأصلي بعد مراجعة الإيصال</span>
                      )}
                      <button className="ghost-btn" onClick={() => action("IGNORE_DEAD_LETTER", String(row.id))}>
                        <CircleSlash2 size={14} /> تجاهل بعد المراجعة
                      </button>
                    </div>
                  </div>
                );
              })}
              {!data.failedWrites.some((row) => row.status !== "RESOLVED") && !data.deadLetters.some((row) => row.status === "OPEN") && (
                <div className="notice done"><CheckCircle2 size={17} /> لا توجد كتابات فاشلة أو Dead Letters.</div>
              )}
            </div>
          </div>

          <div className="bento-card" style={{ gap: 14 }}>
            <div className="section-head">
              <div><h3 style={{ margin: 0 }}>سجل قدرات النظام</h3><small style={{ color: "var(--muted)" }}>LIVE: {data.summary.liveCapabilities} من {data.summary.totalCapabilities}</small></div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>المجال</th><th>القدرة</th><th>الحالة</th><th>الإثبات</th><th>ملاحظات</th></tr></thead>
                <tbody>
                  {data.capabilities.map((row) => (
                    <tr key={String(row.capability_key)}>
                      <td>{String(row.domain)}</td>
                      <td><strong>{String(row.title)}</strong></td>
                      <td>{badge(row.status)}</td>
                      <td>{row.evidence_required ? "مطلوب" : "غير مطلوب"}</td>
                      <td>{String(row.notes || "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bento-card" style={{ gap: 14 }}>
            <div className="section-head">
              <div>
                <h3 style={{ margin: 0 }}>أدلة الجاهزية</h3>
                <small style={{ color: "var(--muted)" }}>الأدلة المنفذة فعليًا فقط؛ غياب الدليل لا يتحول إلى نجاح شكلي.</small>
              </div>
              <FileCheck2 size={18} />
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>البوابة</th><th>الحالة</th><th>البيئة</th><th>التنفيذ</th><th>الانتهاء</th></tr></thead>
                <tbody>
                  {data.readinessEvidence.map((row) => (
                    <tr key={String(row.id)}>
                      <td><strong>{String(row.evidence_key)}</strong></td>
                      <td>{badge(row.status)}</td>
                      <td>{String(row.environment)}</td>
                      <td>{dateTime(row.performed_at)}</td>
                      <td>{dateTime(row.expires_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.readinessEvidence.length && <div className="notice"><AlertTriangle size={16} /> لم تُسجل أدلة جاهزية بعد.</div>}
          </div>
        </>
      )}
    </section>
  );
}
