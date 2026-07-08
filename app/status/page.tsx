"use client";

/**
 * Orvanta system status — Stripe-style operational transparency.
 * One page that answers: is every integration alive, is the data durable,
 * and is the platform production-ready? All states are read live.
 */

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, Loader2, Database, ShieldCheck } from "lucide-react";

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
  { key: "supabase", name: "قاعدة البيانات (Supabase)", desc: "الديمومة — القرارات والأفكار والقيود" },
  { key: "ai", name: "الذكاء الاصطناعي (LLM)", desc: "دراسات الجدوى والتحليلات المعمّقة" },
  { key: "shopify", name: "المبيعات (Shopify)", desc: "المتجر والمداخيل المحوكمة" },
  { key: "alpaca", name: "التداول (Alpaca)", desc: "مكتب التداول — ورقي أولاً" },
  { key: "auth", name: "المصادقة والأدوار", desc: "بوابة الإنتاج متعددة المستخدمين" },
  { key: "vercelMonitoring", name: "مراقبة النشر (Vercel)", desc: "حالة النشر والأخطاء" },
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
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const checks = (health?.checks || {}) as Record<string, unknown>;
  const configuredCount = SERVICES.filter((s) => Boolean(checks[s.key])).length;
  const dbOk = db?.configured && db?.ok;
  const allCore = dbOk && Boolean(checks.ai);

  return (
    <main className="page-wrap">
      <header className="page-head">
        <div>
          <span className="eyebrow"><Activity size={16} /> Orvanta Status</span>
          <h1 className="glow-title">حالة النظام</h1>
          <p className="page-sub">
            شفافية تشغيلية كاملة — كل تكامل وحالته الحقيقية الآن{checkedAt ? ` · آخر فحص ${checkedAt}` : ""}.
          </p>
        </div>
        <button className="secondary-btn btn-sm" onClick={load} aria-label="تحديث">
          {loading ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}
        </button>
      </header>

      <div className={`status-banner ${allCore ? "ok" : "warn"}`}>
        <span className={`status-dot ${allCore ? "ok" : "warn"}`} />
        {loading && !health
          ? "جاري الفحص…"
          : allCore
            ? "كل الأنظمة الجوهرية تعمل — البيانات دائمة والذكاء مفعّل."
            : `${configuredCount} من ${SERVICES.length} تكاملات مفعّلة — الباقي يعمل بوضع آمن (محاكاة/ذاكرة).`}
      </div>

      <section className="bento-card bento-full" style={{ padding: 0 }}>
        {SERVICES.map((s) => {
          const on = Boolean(checks[s.key]);
          return (
            <div key={s.key} className="status-row">
              <span className={`status-dot ${on ? "ok" : "off"}`} />
              <span className="status-row__name">
                {s.name}
                <div className="status-row__desc">{s.desc}</div>
              </span>
              <span className="mini-pill" style={{ color: on ? "var(--green)" : "var(--muted)" }}>
                {on ? "مفعّل" : "غير مُهيّأ"}
              </span>
            </div>
          );
        })}
      </section>

      {db?.configured && (
        <section className="bento-card bento-full" style={{ gap: 10 }}>
          <span className="bento-kicker"><Database size={15} /> الديمومة — {db.projectHost}</span>
          <div className="bento-list">
            {Object.entries(db.tables || {}).map(([table, t]) => (
              <div key={table} className="bento-list__row">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span className={`status-dot ${t.ok ? "ok" : "fail"}`} />
                  <code style={{ fontSize: "0.78rem" }}>{table}</code>
                </span>
                <b style={{ fontVariantNumeric: "tabular-nums", color: t.ok ? "var(--text-strong)" : "var(--red)" }}>
                  {t.ok ? `${t.count ?? 0} سجل` : t.error || "خطأ"}
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
            {health.readiness.checks.map((c) => (
              <div key={c.id} className="bento-list__row" style={{ alignItems: "flex-start" }}>
                <span style={{ display: "inline-flex", alignItems: "flex-start", gap: 8 }}>
                  <span className={`status-dot ${c.severity === "PASS" ? "ok" : c.severity === "WARN" ? "warn" : "fail"}`} style={{ marginTop: 5 }} />
                  <span>
                    <b style={{ color: "var(--text-strong)" }}>{c.label}</b>
                    <div className="status-row__desc" style={{ lineHeight: 1.7 }}>{c.detail}</div>
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
