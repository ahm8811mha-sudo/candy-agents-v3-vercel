"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Clock3,
  Inbox,
  Loader2,
  Send,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import OrvantaLogo from "@/components/OrvantaLogo";

type CrisisSeverity = "MEDIUM" | "HIGH" | "CRITICAL";
type CrisisStatus = "OPEN" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "CLOSED";
type CrisisLaneStatus = "READY" | "PENDING_APPROVAL" | "DONE";

type CrisisLane = {
  id: string;
  label: string;
  ownerName: string;
  targetSAR: number;
  status: CrisisLaneStatus;
  actions: string[];
};

type CrisisRecommendation = {
  agentId: string;
  agentName: string;
  agentTitle: string;
  role: string;
  confidence: number;
  impactSAR: number;
  report: string;
  actions: string[];
};

type CrisisCase = {
  id: string;
  title: string;
  description: string;
  amountSAR: number;
  days: number;
  severity: CrisisSeverity;
  status: CrisisStatus;
  executiveSummary: string;
  lanes: CrisisLane[];
  recommendations: CrisisRecommendation[];
  approvalId?: string;
};

type CrisisStats = { total: number; open: number; pending: number; approved: number; rejected: number; exposureSAR: number };

const sar = new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 });

const severityMeta: Record<CrisisSeverity, { label: string; pill: string }> = {
  MEDIUM: { label: "متوسطة", pill: "medium" },
  HIGH: { label: "عالية", pill: "high" },
  CRITICAL: { label: "حرجة", pill: "high" },
};

const statusMeta: Record<CrisisStatus, { label: string; pill: string }> = {
  OPEN: { label: "مفتوحة", pill: "medium" },
  PENDING_APPROVAL: { label: "بانتظار الاعتماد", pill: "medium" },
  APPROVED: { label: "معتمدة", pill: "done" },
  REJECTED: { label: "مرفوضة", pill: "high" },
  CLOSED: { label: "مغلقة", pill: "done" },
};

const laneStatus: Record<CrisisLaneStatus, { label: string; pill: string }> = {
  READY: { label: "جاهز للتنفيذ", pill: "done" },
  PENDING_APPROVAL: { label: "يحتاج اعتماد", pill: "medium" },
  DONE: { label: "منجز", pill: "done" },
};

function toNumber(value: string) {
  const normalized = value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٬,\s]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 40000;
}

export default function RecoveryCenterPage() {
  const [crises, setCrises] = useState<CrisisCase[]>([]);
  const [stats, setStats] = useState<CrisisStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("مشكلة مالية بقيمة 40,000 ريال");
  const [description, setDescription] = useState("لدينا فجوة مالية تحتاج خطة خروج واضحة، من المسؤولين، وما التوصيات التنفيذية؟");
  const [amountText, setAmountText] = useState("40000");
  const [daysText, setDaysText] = useState("30");
  const [severity, setSeverity] = useState<CrisisSeverity>("HIGH");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/company/crisis", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        setCrises(json.crises || []);
        setStats(json.stats || null);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const preview = useMemo(() => ({ amount: toNumber(amountText), days: toNumber(daysText) }), [amountText, daysText]);
  const active = crises[0] || null;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/company/crisis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          amountSAR: preview.amount,
          days: preview.days,
          severity,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "تعذر إنشاء الأزمة");
      setCrises(json.crises || []);
      setStats(json.stats || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إنشاء الأزمة");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page-wrap">
      <section className="hero-scenic" style={{ textAlign: "start", justifyItems: "stretch" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
          <OrvantaLogo size={54} subtitle="Crisis Room" />
          <span className="hero-pill"><AlertTriangle size={14} /> غرفة الأزمات · من المشكلة إلى خطة خروج قابلة للاعتماد</span>
        </div>
        <h1 className="hero-title" style={{ maxWidth: "none" }}>Crisis Room<br />غرفة مستقلة لمعالجة <em>المشاكل الحرجة</em></h1>
        <p className="hero-sub" style={{ maxWidth: 820 }}>
          ليست قسم أفكار. هنا تدخل المشكلة، فيحوّلها Orvanta إلى تشخيص، وكلاء مسؤولين، مسارات إغلاق، Action Queue، وبند اعتماد داخل مركز القرار.
        </p>
        <div className="hero-actions" style={{ justifyContent: "flex-start" }}>
          <Link className="primary-btn" href="/inbox"><Inbox size={17} /> مركز القرار</Link>
          <Link className="secondary-btn" href="/ideas"><ArrowLeft size={17} /> الأفكار منفصلة هنا</Link>
        </div>
      </section>

      <section className="bento-card bento-full" style={{ gap: 12 }}>
        <span className="bento-kicker"><AlertTriangle size={15} /> إنشاء أزمة جديدة</span>
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <div className="compact-grid" style={{ gridTemplateColumns: "1.2fr 0.55fr 0.55fr 0.6fr" }}>
            <label>عنوان المشكلة<input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
            <label>المبلغ<input className="input" inputMode="numeric" value={amountText} onChange={(e) => setAmountText(e.target.value)} required /></label>
            <label>المدة بالأيام<input className="input" inputMode="numeric" value={daysText} onChange={(e) => setDaysText(e.target.value)} required /></label>
            <label>الخطورة<select className="input" value={severity} onChange={(e) => setSeverity(e.target.value as CrisisSeverity)}><option value="MEDIUM">متوسطة</option><option value="HIGH">عالية</option><option value="CRITICAL">حرجة</option></select></label>
          </div>
          <label>وصف مختصر للمشكلة<textarea className="textarea compact" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <button className="primary-btn" disabled={submitting} style={{ width: "fit-content" }}>
            {submitting ? <Loader2 className="spin" size={17} /> : <Send size={17} />}
            شغّل غرفة الأزمة
          </button>
          {error && <p className="notice error">{error}</p>}
        </form>
      </section>

      {loading && (
        <div className="bento-card bento-full" style={{ placeItems: "center", padding: 30 }}>
          <Loader2 className="spin" size={24} style={{ color: "var(--muted)" }} />
        </div>
      )}

      <section className="bento-grid">
        <div className="bento-card bento-2x bento-card--red"><span className="bento-kicker"><AlertTriangle size={15} /> أزمات مفتوحة</span><span className="bento-value">{stats?.open ?? 0}</span><span className="bento-label">حالات تحتاج متابعة</span></div>
        <div className="bento-card bento-card--amber"><span className="bento-kicker"><Wallet size={15} /> إجمالي التعرض</span><span className="bento-value">{sar.format(stats?.exposureSAR ?? preview.amount)}</span><span className="bento-label">قيمة المشاكل المالية النشطة</span></div>
        <div className="bento-card"><span className="bento-kicker"><Clock3 size={15} /> بانتظار الاعتماد</span><span className="bento-value">{stats?.pending ?? 0}</span><span className="bento-label">تظهر في مركز القرار</span></div>
      </section>

      {active && (
        <>
          <section className="bento-card bento-full bento-card--glow" style={{ gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span className="bento-kicker"><ShieldCheck size={15} /> أحدث أزمة قيد المعالجة</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className={`mini-pill ${severityMeta[active.severity].pill}`}>{severityMeta[active.severity].label}</span>
                <span className={`mini-pill ${statusMeta[active.status].pill}`}>{statusMeta[active.status].label}</span>
              </div>
            </div>
            <strong style={{ color: "var(--text-strong)", fontSize: "1.22rem", lineHeight: 1.8 }}>{active.title}</strong>
            <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.9 }}>{active.executiveSummary}</p>
            {active.status === "PENDING_APPROVAL" && <Link className="primary-btn btn-sm" href="/inbox" style={{ width: "fit-content" }}><Inbox size={14} /> اعتماد الخطة في مركز القرار</Link>}
          </section>

          <section className="bento-card bento-full" style={{ gap: 14 }}>
            <span className="bento-kicker"><BarChart3 size={15} /> مسارات خطة الإغلاق</span>
            <div className="opportunity-grid">
              {active.lanes.map((lane) => (
                <article key={lane.id} className="opportunity-card">
                  <span>{lane.ownerName}</span>
                  <strong>{lane.label}</strong>
                  <em>{sar.format(lane.targetSAR)}</em>
                  <small>{lane.actions[0]}</small>
                  <span className={`mini-pill ${laneStatus[lane.status].pill}`}>{laneStatus[lane.status].label}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="bento-card bento-full" style={{ gap: 14 }}>
            <span className="bento-kicker"><Users size={15} /> الوكلاء المسؤولون وتوصياتهم</span>
            <div className="bento-list">
              {active.recommendations.map((rec) => (
                <div key={`${rec.agentId}-${rec.role}`} className="bento-list__row" style={{ alignItems: "flex-start" }}>
                  <span>
                    <b style={{ color: "var(--text-strong)" }}>{rec.agentName}</b> · <small>{rec.agentTitle}</small>
                    <br />
                    <small>{rec.report}</small>
                  </span>
                  <span className="mini-pill done">{Math.round(rec.confidence * 100)}% · {sar.format(rec.impactSAR)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="bento-card bento-full" style={{ gap: 14 }}>
            <span className="bento-kicker"><Activity size={15} /> Action Queue</span>
            <div className="bento-list">
              {active.lanes.flatMap((lane) => lane.actions.map((action) => ({ action, lane }))).map(({ action, lane }, index) => (
                <div key={`${lane.id}-${action}`} className="bento-list__row">
                  <span><b style={{ color: "var(--text-strong)" }}>{index + 1}. {action}</b><br /><small>{lane.label} · {lane.ownerName}</small></span>
                  <span className={`mini-pill ${laneStatus[lane.status].pill}`}>{laneStatus[lane.status].label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="bento-card bento-full bento-card--glow" style={{ gap: 10 }}>
            <span className="bento-kicker"><CheckCircle2 size={15} /> التوصية النهائية</span>
            <strong style={{ color: "var(--text-strong)", fontSize: "1.15rem", lineHeight: 1.8 }}>
              الحل الصحيح ليس قرضًا جديدًا كخيار أول. الحل هو إغلاق الفجوة على أربع جبهات: تحصيل، خفض مؤقت، تفاوض موردين، وإيراد سريع — ثم اعتماد أي مسار حساس من مركز القرار.
            </strong>
          </section>
        </>
      )}
    </main>
  );
}
