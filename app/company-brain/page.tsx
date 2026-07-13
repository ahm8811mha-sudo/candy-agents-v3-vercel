"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Brain,
  CheckCircle2,
  Clock3,
  Database,
  Gauge,
  Lightbulb,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Target,
  WandSparkles,
} from "lucide-react";

type Twin = {
  health_score?: number;
  maturity_score?: number;
  observed_at?: string;
  state?: {
    domains?: Record<string, { score?: number; status?: string; drivers?: string[] }>;
    metrics?: Record<string, number>;
  };
  constraints?: Array<{ code?: string; severity?: string; detail?: string }>;
};

type Recommendation = {
  id: string;
  title: string;
  rationale: string;
  confidence: number;
  risk_level: string;
  expected_impact?: Record<string, unknown>;
  alternatives?: Array<Record<string, unknown>>;
};

type Prediction = {
  id: string;
  prediction_type: string;
  horizon_days: number;
  probability: number;
  confidence: number;
  data_quality: number;
  prediction?: Record<string, unknown>;
  limitations?: string[];
};

type Skill = {
  id: string;
  definition?: {
    slug?: string;
    name?: string;
    description?: string;
    category?: string;
    risk_level?: string;
    approval_required?: boolean;
  };
};

type PlatformState = {
  twin?: Twin | null;
  recommendations?: Recommendation[];
  predictions?: Prediction[];
  narrative?: {
    headline?: string;
    narrative?: string;
    drivers?: Array<Record<string, unknown>>;
    recommended_actions?: Array<Record<string, unknown>>;
    confidence?: number;
    period_end?: string;
  } | null;
  ingestion?: {
    status?: string;
    rows_read?: number;
    nodes_upserted?: number;
    features_written?: number;
    facts_written?: number;
    failures?: number;
    completed_at?: string;
  } | null;
  skills?: Skill[];
  freshness?: Record<string, string | null>;
};

function percentage(value: unknown) {
  const number = Number(value || 0);
  return `${Math.round(number * 100)}%`;
}

function score(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function timestamp(value?: string | null) {
  if (!value) return "لم يُنشأ بعد";
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function MetricCard({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string | number; note: string }) {
  return (
    <article className="bento-card" style={{ minHeight: 148, justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ color: "var(--muted)", fontWeight: 800 }}>{label}</span>
        {icon}
      </div>
      <strong style={{ fontSize: "clamp(1.75rem, 5vw, 2.7rem)", lineHeight: 1 }}>{value}</strong>
      <small style={{ color: "var(--muted)", lineHeight: 1.65 }}>{note}</small>
    </article>
  );
}

export default function CompanyBrainPage() {
  const [state, setState] = useState<PlatformState>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState<"simulation" | "plan" | null>(null);
  const [error, setError] = useState("");
  const [simulation, setSimulation] = useState<Record<string, unknown> | null>(null);
  const [plan, setPlan] = useState<Record<string, unknown> | null>(null);
  const [goal, setGoal] = useState("رفع كفاءة التشغيل وتقليل الأعمال المتأخرة");
  const [revenue, setRevenue] = useState("100000");
  const [payroll, setPayroll] = useState("35000");
  const [opex, setOpex] = useState("30000");

  async function load(refresh = false) {
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/company-brain/platform", {
        method: refresh ? "POST" : "GET",
        headers: refresh ? { "content-type": "application/json" } : undefined,
        body: refresh ? JSON.stringify({ action: "refresh" }) : undefined,
        cache: "no-store",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || "تعذر تحميل العقل المؤسسي.");
      setState(json);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل العقل المؤسسي.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load(false);
  }, []);

  const domains = useMemo(() => Object.entries(state.twin?.state?.domains || {}), [state.twin]);
  const health = score(state.twin?.health_score);
  const maturity = score(state.twin?.maturity_score);

  async function runSimulation(event: FormEvent) {
    event.preventDefault();
    setRunning("simulation");
    setError("");
    try {
      const response = await fetch("/api/company-brain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "simulate",
          data: {
            name: "محاكاة تنفيذية سريعة",
            scenarioType: "EXECUTIVE_WHAT_IF",
            baseline: {
              monthlyRevenue: Number(revenue),
              monthlyPayroll: Number(payroll),
              monthlyOperatingExpenses: Number(opex),
            },
            assumptions: {
              revenueGrowthPct: 15,
              salaryChangePct: 5,
              operatingExpenseChangePct: 3,
              horizonMonths: 12,
            },
          },
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || "فشلت المحاكاة.");
      setSimulation(json.result || json.simulation || json);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "فشلت المحاكاة.");
    } finally {
      setRunning(null);
    }
  }

  async function buildPlan(event: FormEvent) {
    event.preventDefault();
    setRunning("plan");
    setError("");
    try {
      const response = await fetch("/api/company-brain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "plan",
          data: {
            goal,
            goalType: "OPERATIONS",
            horizonDays: 90,
            budgetLimit: 100000,
            owner: "المالك",
          },
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || "تعذر بناء الخطة.");
      setPlan(json.result || json.plan || json);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر بناء الخطة.");
    } finally {
      setRunning(null);
    }
  }

  if (loading) {
    return <main className="page-wrap" style={{ minHeight: "70vh", display: "grid", placeItems: "center" }}><Loader2 className="spin" size={32} /></main>;
  }

  return (
    <main className="page-wrap" style={{ display: "grid", gap: 18 }}>
      <header className="bento-card" style={{ padding: "clamp(22px, 4vw, 36px)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 760 }}>
            <span className="mini-pill"><Brain size={14} /> Company Brain</span>
            <h1 style={{ margin: "14px 0 8px", fontSize: "clamp(2rem, 6vw, 4rem)", letterSpacing: "-.045em" }}>العقل المؤسسي</h1>
            <p className="page-sub" style={{ margin: 0, maxWidth: 680 }}>
              صورة موحدة للشركة تربط التنفيذ والقرارات والمالية والامتثال، ثم تحولها إلى توقعات وتوصيات ومحاكاة وخطط قابلة للاعتماد.
            </p>
          </div>
          <button className="primary-btn" type="button" onClick={() => void load(true)} disabled={refreshing}>
            {refreshing ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
            تحديث العقل المؤسسي
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18, color: "var(--muted)", fontSize: ".82rem" }}>
          <span className="mini-pill"><Clock3 size={12} /> آخر توأم رقمي: {timestamp(state.freshness?.twin)}</span>
          <span className="mini-pill"><Database size={12} /> آخر تحميل: {timestamp(state.freshness?.ingestion)}</span>
        </div>
      </header>

      {error && <div className="notice" style={{ color: "var(--red)" }}><ShieldAlert size={17} /> {error}</div>}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
        <MetricCard icon={<Gauge size={22} />} label="صحة الشركة" value={`${health}/100`} note="درجة مركبة من التنفيذ والمالية والقرارات والامتثال والاعتمادية." />
        <MetricCard icon={<Sparkles size={22} />} label="النضج المؤسسي" value={`${maturity}/100`} note="يرتفع مع البيانات الفعلية والقيود والتعلم والإغلاق المنضبط." />
        <MetricCard icon={<Lightbulb size={22} />} label="التوصيات المفتوحة" value={state.recommendations?.length || 0} note="توصيات مدعومة بأدلة وليست رسائل عامة." />
        <MetricCard icon={<Activity size={22} />} label="التوقعات النشطة" value={state.predictions?.length || 0} note="كل توقع يعرض الاحتمال والثقة وجودة البيانات والقيود." />
      </section>

      <section className="bento-card" style={{ padding: "clamp(22px, 4vw, 34px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><WandSparkles size={21} /><strong>الملخص التنفيذي</strong></div>
        <h2 style={{ margin: "16px 0 8px", fontSize: "clamp(1.35rem, 3vw, 2rem)" }}>{state.narrative?.headline || "لم يُنشأ الملخص بعد"}</h2>
        <p style={{ margin: 0, lineHeight: 2, color: "var(--muted)", whiteSpace: "pre-wrap" }}>
          {state.narrative?.narrative || "اضغط تحديث العقل المؤسسي لإنشاء أول سرد تنفيذي من البيانات الفعلية."}
        </p>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 14 }}>
        <article className="bento-card">
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}><Target size={20} /><strong>توصيات القرار</strong></div>
          <div style={{ display: "grid", gap: 10 }}>
            {(state.recommendations || []).slice(0, 5).map((item) => (
              <div key={item.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <strong>{item.title}</strong>
                  <span className="mini-pill">{percentage(item.confidence)}</span>
                </div>
                <p style={{ color: "var(--muted)", lineHeight: 1.75, marginBottom: 0 }}>{item.rationale}</p>
              </div>
            ))}
            {!state.recommendations?.length && <p className="page-sub">لا توجد توصيات مفتوحة حاليًا.</p>}
          </div>
        </article>

        <article className="bento-card">
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}><Activity size={20} /><strong>التوقعات</strong></div>
          <div style={{ display: "grid", gap: 10 }}>
            {(state.predictions || []).slice(0, 5).map((item) => (
              <div key={item.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <strong>{item.prediction_type.replaceAll("_", " ")}</strong>
                  <span className="mini-pill">احتمال {percentage(item.probability)}</span>
                </div>
                <small style={{ color: "var(--muted)" }}>الأفق {item.horizon_days} يومًا · الثقة {percentage(item.confidence)} · جودة البيانات {percentage(item.data_quality)}</small>
              </div>
            ))}
            {!state.predictions?.length && <p className="page-sub">لا توجد توقعات بعد.</p>}
          </div>
        </article>
      </section>

      <section className="bento-card">
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}><Gauge size={20} /><strong>التوأم الرقمي حسب المجال</strong></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {domains.map(([name, domain]) => (
            <div key={name} style={{ border: "1px solid var(--line)", borderRadius: 16, padding: 14 }}>
              <small style={{ color: "var(--muted)" }}>{name}</small>
              <div style={{ fontSize: "1.65rem", fontWeight: 900, marginBlock: 6 }}>{score(domain.score)}/100</div>
              <span className="mini-pill">{domain.status || "UNKNOWN"}</span>
            </div>
          ))}
          {!domains.length && <p className="page-sub">حدّث العقل المؤسسي لإنشاء التوأم الرقمي.</p>}
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        <form className="bento-card" onSubmit={runSimulation}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}><Activity size={20} /><strong>محاكاة ماذا لو؟</strong></div>
          <p className="page-sub">تجربة أثر نمو الإيراد 15% مع زيادة الرواتب 5% والمصروفات 3% لمدة سنة.</p>
          <input className="input" value={revenue} onChange={(event) => setRevenue(event.target.value)} inputMode="decimal" placeholder="الإيراد الشهري" />
          <input className="input" value={payroll} onChange={(event) => setPayroll(event.target.value)} inputMode="decimal" placeholder="الرواتب الشهرية" />
          <input className="input" value={opex} onChange={(event) => setOpex(event.target.value)} inputMode="decimal" placeholder="المصروفات التشغيلية" />
          <button className="primary-btn" type="submit" disabled={running !== null}>{running === "simulation" ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />} تشغيل المحاكاة</button>
          {simulation && <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: ".78rem", lineHeight: 1.65, maxHeight: 300, overflow: "auto" }}>{JSON.stringify(simulation, null, 2)}</pre>}
        </form>

        <form className="bento-card" onSubmit={buildPlan}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}><Target size={20} /><strong>المخطط الذاتي</strong></div>
          <p className="page-sub">يحوّل الهدف إلى مراحل ومهام وميزانية ومخاطر ومؤشرات، ويبقى التنفيذ الحساس خلف اعتماد المالك.</p>
          <textarea className="input" value={goal} onChange={(event) => setGoal(event.target.value)} rows={4} style={{ resize: "vertical" }} />
          <button className="primary-btn" type="submit" disabled={running !== null}>{running === "plan" ? <Loader2 className="spin" size={17} /> : <WandSparkles size={17} />} بناء الخطة</button>
          {plan && <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: ".78rem", lineHeight: 1.65, maxHeight: 300, overflow: "auto" }}>{JSON.stringify(plan, null, 2)}</pre>}
        </form>
      </section>

      <section className="bento-card">
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}><CheckCircle2 size={20} /><strong>القدرات المثبتة</strong></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
          {(state.skills || []).map((skill) => (
            <article key={skill.id} style={{ border: "1px solid var(--line)", borderRadius: 16, padding: 14 }}>
              <strong>{skill.definition?.name || skill.definition?.slug || "Skill"}</strong>
              <p style={{ color: "var(--muted)", lineHeight: 1.65 }}>{skill.definition?.description}</p>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                <span className="mini-pill">{skill.definition?.category}</span>
                <span className="mini-pill">{skill.definition?.risk_level}</span>
                {skill.definition?.approval_required && <span className="mini-pill">يتطلب اعتمادًا</span>}
              </div>
            </article>
          ))}
          {!state.skills?.length && <p className="page-sub">ستثبت القدرات الموثوقة تلقائيًا عند أول تحديث.</p>}
        </div>
      </section>
    </main>
  );
}
