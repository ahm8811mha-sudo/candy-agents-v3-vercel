"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, BarChart3, CheckCircle2, Clock3, Send, ShieldCheck, Users, Wallet } from "lucide-react";
import OrvantaLogo from "@/components/OrvantaLogo";

function toNumber(value: string) {
  const normalized = value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٬,\s]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 40000;
}

function sar(value: number) {
  return `${value.toLocaleString("en-US")} ريال`;
}

export default function RecoveryCenterPage() {
  const [title, setTitle] = useState("مشكلة مالية بقيمة 40,000 ريال");
  const [amountText, setAmountText] = useState("40000");
  const [daysText, setDaysText] = useState("30");
  const [severity, setSeverity] = useState("عالية");

  const plan = useMemo(() => {
    const amount = toNumber(amountText);
    const days = toNumber(daysText);
    const a = Math.round(amount * 0.375);
    const b = Math.round(amount * 0.2);
    const c = Math.round(amount * 0.175);
    const d = amount - a - b - c;
    return { amount, days, a, b, c, d };
  }, [amountText, daysText]);

  const lanes = [
    ["مستحقات قريبة", plan.a, "Collections Agent"],
    ["خفض تكلفة مؤقت", plan.b, "CFO + Operations"],
    ["إعادة ترتيب التزامات", plan.c, "Procurement Agent"],
    ["إيراد سريع", plan.d, "Sales + Marketing"],
  ] as const;

  const agents = ["CFO Agent", "Collections Agent", "Sales Agent", "Marketing Agent", "Procurement Agent", "Operations Agent", "CEO Agent", "Risk & Governance Agent"];
  const actions = ["تقرير فجوة السيولة", "قائمة المستحقات القريبة", "قائمة تخفيض التكلفة", "خطة ترتيب الالتزامات", "حملة إيراد سريع", "اعتماد خطة الإغلاق"];

  return (
    <main className="page-wrap">
      <section className="hero-scenic" style={{ textAlign: "start", justifyItems: "stretch" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
          <OrvantaLogo size={54} subtitle="Crisis Room" />
          <span className="hero-pill"><AlertTriangle size={14} /> غرفة الأزمات · معالجة المشاكل الحرجة</span>
        </div>
        <h1 className="hero-title" style={{ maxWidth: "none" }}>Crisis Room<br />غرفة تنفيذ لإنهاء <em>المشاكل الحرجة</em></h1>
        <p className="hero-sub" style={{ maxWidth: 760 }}>قسم مستقل عن الأفكار. هنا يتم إدخال المشكلة، ثم يحولها Orvanta إلى خطة، وكلاء مسؤولين، مهام، ومؤشرات متابعة.</p>
        <div className="hero-actions" style={{ justifyContent: "flex-start" }}>
          <Link className="primary-btn" href="/inbox"><ShieldCheck size={17} /> قرارات تحتاج اعتماد</Link>
          <Link className="secondary-btn" href="/operations"><Send size={17} /> تشغيل توصية</Link>
        </div>
      </section>

      <section className="bento-card bento-full" style={{ gap: 12 }}>
        <span className="bento-kicker"><AlertTriangle size={15} /> إنشاء مشكلة جديدة</span>
        <div className="compact-grid" style={{ gridTemplateColumns: "1.2fr 0.6fr 0.6fr 0.6fr" }}>
          <label>عنوان المشكلة<input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label>المبلغ<input className="input" inputMode="numeric" value={amountText} onChange={(e) => setAmountText(e.target.value)} /></label>
          <label>المدة<input className="input" inputMode="numeric" value={daysText} onChange={(e) => setDaysText(e.target.value)} /></label>
          <label>الخطورة<select className="input" value={severity} onChange={(e) => setSeverity(e.target.value)}><option>متوسطة</option><option>عالية</option><option>حرجة</option></select></label>
        </div>
      </section>

      <section className="bento-grid">
        <div className="bento-card bento-2x bento-card--red"><span className="bento-kicker"><AlertTriangle size={15} /> الحالة</span><span className="bento-value">{severity}</span><span className="bento-label">{title}</span></div>
        <div className="bento-card bento-card--amber"><span className="bento-kicker"><Wallet size={15} /> الفجوة</span><span className="bento-value">{sar(plan.amount)}</span><span className="bento-label">المبلغ المطلوب إغلاقه</span></div>
        <div className="bento-card"><span className="bento-kicker"><Clock3 size={15} /> المدة</span><span className="bento-value">{plan.days}</span><span className="bento-label">يوم للمتابعة</span></div>
      </section>

      <section className="bento-card bento-full" style={{ gap: 14 }}>
        <span className="bento-kicker"><BarChart3 size={15} /> توزيع خطة الإغلاق</span>
        <div className="opportunity-grid">{lanes.map(([label, value, owner]) => <article key={label} className="opportunity-card"><span>{owner}</span><strong>{label}</strong><em>{sar(value)}</em><small>مسار تنفيذي ضمن خطة الإغلاق.</small></article>)}</div>
      </section>

      <section className="bento-card bento-full" style={{ gap: 14 }}>
        <span className="bento-kicker"><Users size={15} /> الوكلاء المسؤولون</span>
        <div className="quick-nav">{agents.map((agent) => <div key={agent} className="quick-nav-card"><strong>{agent}</strong><small>مسؤول عن جزء من التشخيص أو التنفيذ أو الاعتماد.</small></div>)}</div>
      </section>

      <section className="bento-card bento-full" style={{ gap: 14 }}>
        <span className="bento-kicker"><Activity size={15} /> Action Queue</span>
        <div className="bento-list">{actions.map((action, index) => <div key={action} className="bento-list__row"><span><b style={{ color: "var(--text-strong)" }}>{action}</b></span><span className={`mini-pill ${index > 3 ? "pending" : "done"}`}>{index > 3 ? "تحتاج اعتماد" : "جاهزة"}</span></div>)}</div>
      </section>

      <section className="bento-card bento-full bento-card--glow" style={{ gap: 10 }}>
        <span className="bento-kicker"><CheckCircle2 size={15} /> التوصية النهائية</span>
        <strong style={{ color: "var(--text-strong)", fontSize: "1.15rem", lineHeight: 1.8 }}>الخطة الأفضل هي توزيع المشكلة على أكثر من مسار بدل الاعتماد على حل واحد، مع مراجعة يومية حتى إغلاق الفجوة بالكامل.</strong>
      </section>
    </main>
  );
}
