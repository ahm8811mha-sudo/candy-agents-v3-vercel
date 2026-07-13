"use client";

/**
 * Orvanta system status — one page for infrastructure, readiness, scheduled
 * jobs, failed writes, alerts, integration evidence, and capability truth.
 */

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, Loader2, Database, ShieldCheck } from "lucide-react";
import OperationalReliabilityPanel from "@/components/OperationalReliabilityPanel";

type Health = {
  ok: boolean;
  version?: string;
  productionReady?: boolean;
  readiness?: { checks: Array<{ id: string; label: string; severity: "PASS" | "WARN" | "FAIL"; detail: string }> };
  checks?: Record<string, unknown>;
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
  { key: "vercelMonitoring", name: "مراقبة النشر (Vercel)", desc: "حالة النشر والبناء" },
];

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
  const configuredCount = SERVICES.filter((service) => Boolean(checks[service.key])).length;
  const dbOk = db?.configured && db?.ok;
  const allCore = Boolean(dbOk && checks.accessGate && checks.tenantIsolation && checks.workflowRuntime && checks.outboxPublisher);

  return (
    <main className="page-wrap">
      <header className="page-head">
        <div>
          <span className="eyebrow"><Activity size={16} /> Orvanta Status</span>
          <h1 className="glow-title">النظام</h1>
          <p className="page-sub">
            الحالة الحقيقية للبنية، الحماية، المهام المجدولة، التنبيهات، الكتابات والتكاملات{checkedAt ? ` · آخر فحص ${checkedAt}` : ""}.
          </p>
        </div>
        <button className="secondary-btn btn-sm" onClick={() => void load()} aria-label="تحديث">
          {loading ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
        </button>
      </header>

      <div className={`status-banner ${allCore ? "ok" : "warn"}`}>
        <span className={`status-dot ${allCore ? "ok" : "warn"}`} />
        {loading && !health
          ? "جاري الفحص…"
          : allCore
            ? "الأنظمة الجوهرية تعمل والحماية والديمومة ومحرك التنفيذ مفعلة."
            : `${configuredCount} من ${SERVICES.length} بوابات جوهرية ناجحة. لا تعتبر الحالة جاهزة قبل إغلاق جميع حالات FAIL.`}
      </div>

      <section className="bento-card bento-full" style={{ padding: 0 }}>
        {SERVICES.map((service) => {
          const enabled = Boolean(checks[service.key]);
          return (
            <div key={service.key} className="status-row">
              <span className={`status-dot ${enabled ? "ok" : "off"}`} />
              <span className="status-row__name">
                {service.name}
                <div className="status-row__desc">{service.desc}</div>
              </span>
              <span className="mini-pill" style={{ color: enabled ? "var(--green)" : "var(--muted)" }}>
                {enabled ? "مفعّل" : "غير جاهز"}
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
        <section className="bento-card bento-full" style={{ gap: 10 }}>
          <span className="bento-kicker">
            <ShieldCheck size={15} /> جاهزية الإنتاج {health.productionReady ? "· جاهز ✓" : "· ناقصة"}
          </span>
          <div className="bento-list">
            {health.readiness.checks.map((check) => (
              <div key={check.id} className="bento-list__row" style={{ alignItems: "flex-start" }}>
                <span style={{ display: "inline-flex", alignItems: "flex-start", gap: 8 }}>
                  <span className={`status-dot ${check.severity === "PASS" ? "ok" : check.severity === "WARN" ? "warn" : "fail"}`} style={{ marginTop: 5 }} />
                  <span>
                    <b style={{ color: "var(--text-strong)" }}>{check.label}</b>
                    <div className="status-row__desc" style={{ lineHeight: 1.7 }}>{check.detail}</div>
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <OperationalReliabilityPanel />
    </main>
  );
}
