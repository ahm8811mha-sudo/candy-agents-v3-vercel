"use client";

/**
 * Orvanta system status — one page for infrastructure, readiness, scheduled
 * jobs, failed writes, alerts, integration evidence, and capability truth.
 *
 * Information design: the summary comes before the detail. Readiness gates
 * are grouped by severity — what blocks release first, then warnings, then
 * what already passes — and every gate is named in the owner's language.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw, Loader2, Database, ShieldCheck } from "lucide-react";
import OperationalReliabilityPanel from "@/components/OperationalReliabilityPanel";

type Severity = "PASS" | "WARN" | "FAIL";
type ReadinessCheck = { id: string; label: string; severity: Severity; detail: string };

type Health = {
  ok: boolean;
  version?: string;
  productionReady?: boolean;
  readiness?: { checks: ReadinessCheck[] };
  checks?: Record<string, unknown>;
  deployment?: {
    platform: "vercel" | "local";
    environment: string;
    isPreview: boolean;
    productionUrl?: string | null;
    detailedMonitoring: boolean;
  };
};

type SupabaseHealth = {
  ok: boolean;
  configured: boolean;
  projectHost?: string;
  tables?: Record<string, { ok: boolean; count?: number; error?: string }>;
};

const SERVICES: Array<{ key: string; name: string; desc: string }> = [
  { key: "supabase", name: "قاعدة البيانات (Supabase)", desc: "المصدر الدائم للقرارات والأفكار والقيود" },
  { key: "ai", name: "الذكاء الاصطناعي (LLM)", desc: "دراسات الجدوى والتحليلات المعمّقة" },
  { key: "accessGate", name: "بوابة النسخة الخاصة", desc: "جهاز موثوق وملف ارتباط موقّع" },
  { key: "tenantIsolation", name: "عزل البيانات وRLS", desc: "حدود مساحة المالك وسياسات قاعدة البيانات" },
  { key: "workflowRuntime", name: "محرك التنفيذ الدائم", desc: "المسارات والخطوات والمحاولات وإعادة التشغيل" },
  { key: "outboxPublisher", name: "Outbox والتسليم الخارجي", desc: "نشر الأحداث دون فقدان أو تكرار" },
  { key: "reconciliation", name: "الإثبات والتسوية", desc: "لا يكتمل التنفيذ الخارجي دون Receipt" },
  { key: "vercelMonitoring", name: "النشر على Vercel", desc: "تشغيل النسخة الحالية وحالة الربط التفصيلي لسجل النشر" },
];

/** Readiness gates in the owner's language. Unknown ids fall back to the server label. */
const GATE_LABELS: Record<string, string> = {
  "google-workspace": "تنفيذ Google Workspace",
  "access-gate": "بوابة وصول المالك",
  "owner-code-strength": "قوة رمز المالك",
  "owner-cookie-secret": "سر توقيع جلسة المالك",
  "basic-auth-disabled": "لا Basic Auth في الإنتاج",
  "supabase-service-role": "الديمومة على الخادم",
  "core-schema-ready": "مخطط نظام الشركة الأساسي",
  "execution-transaction": "حزمة التنفيذ الذرّية",
  "migration-baseline": "خط أساس الهجرات المرتّب",
  "tenant-rls-ready": "حدود المستأجر وRLS",
  "rls-regression-tested": "اختبار انحدار RLS",
  "workflow-runtime": "محرك سير العمل الدائم",
  "outbox-publisher": "ناشر الصندوق الصادر",
  "watchdog": "المراقب وتتبّع المهام المجدولة",
  "failed-write-worker": "إعادة محاولة الكتابات الفاشلة",
  "external-reconciliation": "الإيصال الخارجي والتسوية",
  "capability-registry": "سجل القدرات الصادق",
  "company-brain-cycle": "دورة إنتاج العقل المؤسسي",
  "accounting-controls": "ضوابط المحاسبة وإغلاق الفترات",
  "e2e-verified": "بوابة اختبار التصفح (سطح المكتب والجوال)",
  "backup-restore": "تمرين استعادة النسخ الاحتياطية",
  "api-secret": "سر واجهة API الداخلية",
  "cron-secret": "مصادقة المُجدوِل",
  "openai-key": "تشغيل الذكاء الاصطناعي",
  "public-anon-write-fallback-disabled": "لا كتابة عامة بمفتاح anon",
  "browser-e2e": "بوابة اختبار التصفح (سطح المكتب والجوال)",
  "failed-write-recovery": "إعادة محاولة الكتابات الفاشلة",
  "reconciliation-required": "الإيصال الخارجي والتسوية",
};

function gateLabel(check: ReadinessCheck) {
  return GATE_LABELS[check.id] || check.label;
}

const SEVERITY_ORDER: Severity[] = ["FAIL", "WARN", "PASS"];
const SEVERITY_META: Record<Severity, { title: string; dot: string }> = {
  FAIL: { title: "يوقف الجاهزية", dot: "fail" },
  WARN: { title: "تحذيرات لا توقف الإطلاق", dot: "warn" },
  PASS: { title: "ناجح", dot: "ok" },
};

export default function StatusPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [db, setDb] = useState<SupabaseHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [h, s] = await Promise.all([
        fetch("/api/health", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/health/supabase", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ]);
      if (h) setHealth(h);
      if (s) setDb(s);
      setCheckedAt(new Date().toLocaleTimeString("ar-SA"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const checks = (health?.checks || {}) as Record<string, unknown>;
  const dbOk = db?.configured && db?.ok;
  const serviceReady = (key: string) => key === "supabase"
    ? Boolean(checks.supabase && (db === null || dbOk))
    : Boolean(checks[key]);
  const configuredCount = SERVICES.filter((service) => serviceReady(service.key)).length;
  const allCore = Boolean(serviceReady("supabase") && checks.accessGate && checks.tenantIsolation && checks.workflowRuntime && checks.outboxPublisher);
  const checking = loading && !health;

  const readiness = useMemo(() => {
    const list = health?.readiness?.checks || [];
    const groups = SEVERITY_ORDER.map((severity) => ({
      severity,
      items: list.filter((c) => c.severity === severity),
    })).filter((g) => g.items.length > 0);
    return {
      total: list.length,
      fail: list.filter((c) => c.severity === "FAIL").length,
      warn: list.filter((c) => c.severity === "WARN").length,
      pass: list.filter((c) => c.severity === "PASS").length,
      groups,
    };
  }, [health]);

  return (
    <main className="page-wrap">
      <header className="page-head">
        <div>
          <span className="eyebrow"><Activity size={16} /> حالة النظام</span>
          <h1 className="glow-title">النظام</h1>
          <p className="page-sub">
            الحالة الحقيقية للبنية، الحماية، المهام المجدولة، التنبيهات، الكتابات والتكاملات{checkedAt ? ` · آخر فحص ${checkedAt}` : ""}.
          </p>
        </div>
        <button className="secondary-btn btn-sm" onClick={() => void load()} aria-label="تحديث">
          {loading ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
          تحديث
        </button>
      </header>

      {health?.deployment?.isPreview && (
        <div className="status-banner warn" role="status">
          <span className="status-dot warn" />
          <span>
            هذه نسخة معاينة معزولة؛ قد لا ترث أسرار Supabase من بيئة الإنتاج.
            {health.deployment.productionUrl && (
              <> <a href={health.deployment.productionUrl}>افتح النسخة الإنتاجية</a> لقراءة الحالة التشغيلية الفعلية.</>
            )}
          </span>
        </div>
      )}

      <div className={`status-banner ${allCore ? "ok" : "warn"}`}>
        <span className={`status-dot ${allCore ? "ok" : "warn"}`} />
        {checking
          ? "جاري الفحص…"
          : allCore
            ? "الأنظمة الجوهرية تعمل: الحماية والديمومة ومحرك التنفيذ مفعّلة."
            : `${configuredCount} من ${SERVICES.length} خدمات جوهرية تعمل. الجاهزية الكاملة تحتاج إغلاق كل بند «يوقف الجاهزية» أدناه.`}
      </div>

      <section className="bento-card bento-full" style={{ padding: 0 }}>
        {SERVICES.map((service) => {
          const enabled = serviceReady(service.key);
          return (
            <div key={service.key} className="status-row">
              <span className={`status-dot ${enabled ? "ok" : "off"}`} />
              <span className="status-row__name">
                {service.name}
                <div className="status-row__desc">{service.desc}</div>
              </span>
              <span className={`status-pill ${enabled ? "done" : ""}`}>
                {checking
                  ? "جارٍ الفحص"
                  : enabled && service.key === "vercelMonitoring" && !health?.deployment?.detailedMonitoring
                    ? "النشر يعمل"
                    : enabled
                      ? "يعمل"
                      : health?.deployment?.isPreview
                        ? "غير مهيأ للمعاينة"
                        : "غير جاهز"}
              </span>
            </div>
          );
        })}
      </section>

      {db?.configured && (
        <section className="bento-card bento-full" style={{ gap: 10 }}>
          <span className="bento-kicker"><Database size={15} /> الديمومة — {db.projectHost}</span>
          <div className="bento-list">
            {Object.entries(db.tables || {}).map(([table, state]) => (
              <div key={table} className="bento-list__row">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span className={`status-dot ${state.ok ? "ok" : "fail"}`} />
                  <code style={{ fontSize: "0.78rem" }}>{table}</code>
                </span>
                <b style={{ fontVariantNumeric: "tabular-nums", color: state.ok ? "var(--text-strong)" : "var(--red)" }}>
                  {state.ok ? `${state.count ?? 0} سجل` : state.error || "خطأ"}
                </b>
              </div>
            ))}
          </div>
        </section>
      )}

      {health?.readiness && (
        <section className="bento-card bento-full" style={{ gap: 14 }}>
          <span className="bento-kicker">
            <ShieldCheck size={15} /> جاهزية الإنتاج {health.productionReady ? "· جاهز" : `· ${readiness.fail} بنداً يوقف الإطلاق`}
          </span>

          <div className="readiness-summary" aria-label="ملخص بوابات الجاهزية">
            <div className={readiness.fail ? "is-fail" : ""}><b>{readiness.fail}</b><small>يوقف الجاهزية</small></div>
            <div className={readiness.warn ? "is-warn" : ""}><b>{readiness.warn}</b><small>تحذير</small></div>
            <div className="is-pass"><b>{readiness.pass}</b><small>ناجح من {readiness.total}</small></div>
          </div>

          {readiness.groups.map((group) => (
            <div key={group.severity} className="readiness-group">
              <div className="readiness-group__title">
                <span className={`status-dot ${SEVERITY_META[group.severity].dot}`} />
                {SEVERITY_META[group.severity].title} ({group.items.length})
              </div>
              {group.items.map((check) => (
                <div key={check.id} className="readiness-item">
                  <span className={`status-dot ${SEVERITY_META[check.severity].dot}`} />
                  <span>
                    <b>{gateLabel(check)}</b>
                    <small>{check.detail}</small>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      <OperationalReliabilityPanel />
    </main>
  );
}
