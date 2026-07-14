"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Play,
  PlugZap,
  RefreshCcw,
} from "lucide-react";

type ActionPayload = {
  confidence?: number;
  assumptions?: string[];
  evidence?: Array<{ summary?: string }>;
  blockedBy?: string[];
  priority?: string;
};

type IntegrationResult = {
  operation?: string;
  executedAt?: string;
  messageId?: string;
  spreadsheetUrl?: string;
  webViewLink?: string;
  alreadyExisted?: boolean;
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
  result?: { integration?: IntegrationResult };
  attempts?: number;
  error?: string;
  created_at?: string;
};

type IntegrationPlan = {
  capability: "gmail" | "sheets" | "drive";
  operation: string;
  label: string;
};

type IntegrationStatus = {
  googleWorkspace: {
    enabled: boolean;
    disabledByFlag: boolean;
    credentialsConfigured: boolean;
    capabilities: Record<"gmail" | "sheets" | "drive", boolean>;
    missingEnvironmentVariables: string[];
  };
  supportedActionTypes: string[];
  actionPlans: Record<string, IntegrationPlan | null>;
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

function integrationLink(result?: IntegrationResult) {
  return result?.spreadsheetUrl || result?.webViewLink || null;
}

export default function ActionQueuePanel() {
  const [actions, setActions] = useState<CompanyAction[]>([]);
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [integrationUnavailable, setIntegrationUnavailable] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [actionsResponse, integrationResponse] = await Promise.all([
        fetch("/api/company/actions?limit=50", { cache: "no-store" }),
        fetch("/api/integrations/status", { cache: "no-store" }),
      ]);
      const actionsData = await actionsResponse.json();
      if (!actionsResponse.ok || !actionsData.ok) {
        throw new Error(actionsData.error || "تعذر تحميل قائمة الأفعال.");
      }
      setActions(actionsData.actions || []);

      const integrationData = await integrationResponse.json().catch(() => null);
      if (integrationResponse.ok && integrationData?.ok) {
        setIntegrationStatus(integrationData as IntegrationStatus);
        setIntegrationUnavailable(false);
      } else {
        setIntegrationUnavailable(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل قائمة الأفعال.");
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }

  async function execute(action: CompanyAction) {
    setExecutingId(action.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/company/actions/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: action.id }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        const missing = Array.isArray(data.missingEnvironmentVariables)
          ? ` المتغيرات الناقصة: ${data.missingEnvironmentVariables.join(", ")}`
          : "";
        throw new Error(`${data.error || "تعذر تنفيذ التكامل."}${missing}`);
      }
      setMessage(data.reused ? "الإجراء منفذ مسبقاً؛ لم يتم تكرار الأثر الخارجي." : "تم تنفيذ التكامل الخارجي وتسجيل النتيجة.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تنفيذ التكامل.");
    } finally {
      setExecutingId(null);
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

  const googleReady = Boolean(
    integrationStatus?.googleWorkspace.enabled &&
      integrationStatus.googleWorkspace.credentialsConfigured
  );

  return (
    <section className="delivery-panel fade-in action-queue-panel">
      <div className="delivery-header action-queue-header">
        <div>
          <span className="eyebrow"><Activity size={16} /> Action Queue</span>
          <h2>ماذا حدث بعد الاعتماد؟</h2>
        </div>
        <button className="secondary-btn" onClick={load} type="button" disabled={loading}>
          <RefreshCcw size={16} />
          {loading ? "تحديث..." : "تحديث"}
        </button>
      </div>

      {integrationStatus && (
        <div className={`notice integration-notice ${googleReady ? "done" : "warning"}`}>
          <PlugZap size={17} />
          <div>
            <strong>{googleReady ? "Google Workspace جاهز للتنفيذ" : "Google Workspace يحتاج إعداد البيئة"}</strong>
            <p>
              {googleReady
                ? "يمكن الآن إنشاء مسودات Gmail، وتسجيل الأفعال في Sheets، وحفظ الملفات في Drive من نفس قائمة التنفيذ."
                : integrationStatus.googleWorkspace.disabledByFlag
                  ? "التكامل متوقف صراحةً عبر GOOGLE_INTEGRATIONS_ENABLED=false. غيّر القيمة إلى true بعد اعتماد التشغيل."
                  : `أكمل متغيرات OAuth التالية: ${integrationStatus.googleWorkspace.missingEnvironmentVariables.join(", ")}`}
            </p>
          </div>
        </div>
      )}

      {integrationUnavailable && (
        <p className="notice integration-notice warning">
          تعذر قراءة حالة Google Workspace الآن. بقيت قائمة التنفيذ متاحة ويمكن إعادة الفحص من زر التحديث.
        </p>
      )}

      {error && <p className="notice error">{error}</p>}
      {message && <p className="notice done">{message}</p>}

      <div className="finance-summary action-queue-summary" aria-label="ملخص قائمة التنفيذ">
        <Metric title="بانتظار" value={summary.waiting} />
        <Metric title="قيد التنفيذ" value={summary.running} />
        <Metric title="مكتمل" value={summary.done} />
        <Metric title="فشل" value={summary.failed} />
      </div>

      {!loaded && loading ? (
        <div className="action-queue-loading" role="status">
          <RefreshCcw className="spin" size={20} /> جارٍ تحميل قائمة التنفيذ…
        </div>
      ) : actions.length === 0 ? (
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
            const plan = integrationStatus?.actionPlans[action.action_type] || null;
            const executableStatus = ["WAITING_INTEGRATION", "QUEUED", "FAILED"].includes(action.status);
            const capabilityReady = plan ? integrationStatus?.googleWorkspace.capabilities[plan.capability] : false;
            const result = action.result?.integration;
            const resultUrl = integrationLink(result);

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
                  action.attempts ? `محاولات التنفيذ: ${action.attempts}` : null,
                  result?.operation ? `نتيجة التكامل: ${result.operation}${result.alreadyExisted ? " — لم يُكرر" : ""}` : null,
                  action.error ? `الخطأ: ${action.error}` : null,
                ].filter(Boolean).join("\n")}</pre>

                {(plan || resultUrl) && (
                  <div className="inbox-item__actions">
                    {plan && executableStatus && (
                      <button
                        className="primary-btn btn-sm"
                        type="button"
                        onClick={() => execute(action)}
                        disabled={!capabilityReady || executingId === action.id}
                        title={!capabilityReady ? "أكمل متغيرات Google Workspace في Vercel أولاً" : plan.label}
                      >
                        {executingId === action.id ? <RefreshCcw className="spin" size={15} /> : <Play size={15} />}
                        {executingId === action.id ? "جارٍ التنفيذ..." : plan.label}
                      </button>
                    )}
                    {resultUrl && (
                      <a className="secondary-btn btn-sm" href={resultUrl} target="_blank" rel="noreferrer">
                        <ExternalLink size={14} /> فتح الناتج
                      </a>
                    )}
                  </div>
                )}
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
    <article className="metric-card green action-queue-metric" aria-label={`${title}: ${value}`}>
      <small>{title}</small>
      <strong>{value.toLocaleString("ar-SA-u-nu-latn")}</strong>
    </article>
  );
}
