"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Inbox,
  Send,
  Wallet,
  FolderKanban,
  Landmark,
  AlertTriangle,
  ArrowLeft,
  Calculator,
  Megaphone,
  Users,
  PackageSearch,
  BarChart3,
  Lightbulb,
  Activity,
  Brain,
  Sparkles,
  Loader2,
} from "lucide-react";

type Dashboard = {
  projects: Array<{ id: string }>;
  tasks: Array<{ id: string }>;
  alerts?: Array<{ id: string; severity?: string }>;
};

type Account = { equity: number; mode: "paper" | "live" };
type Bi = { answers?: { decisionToday: string; decisionAction?: { label: string; href: string } } };
type Pulse = { workingCount: number; events: Array<{ id: string; agentName: string; title: string; kindLabel: string }> };
type Learning = { decisionsAnalyzed: number; approvalRate: number; confidenceThreshold: number };

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const departments = [
  { href: "/departments/finance", label: "المالية", icon: Calculator },
  { href: "/departments/marketing", label: "التسويق", icon: Megaphone },
  { href: "/departments/sales", label: "المبيعات", icon: Users },
  { href: "/departments/procurement", label: "المشتريات", icon: PackageSearch },
  { href: "/departments/government-relations", label: "الحكومية", icon: Landmark },
  { href: "/bi-center", label: "مركز BI", icon: BarChart3 },
];

function ExactOrvantaLogo({
  size = "min(340px, 78vw)",
  minHeight = 128,
}: {
  size?: string;
  minHeight?: number;
}) {
  return (
    <span
      aria-label="Orvanta logo"
      role="img"
      style={{
        width: size,
        aspectRatio: "370 / 226",
        minHeight,
        display: "block",
        background: "var(--orvanta-exact-logo) center / contain no-repeat",
      }}
    />
  );
}

export default function CompanyOverview() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [pending, setPending] = useState(0);
  const [account, setAccount] = useState<Account | null>(null);
  const [bi, setBi] = useState<Bi | null>(null);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [learning, setLearning] = useState<Learning | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [d, i, a, b, p, l] = await Promise.all([
          fetch("/api/company-dashboard", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
          fetch("/api/inbox", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
          fetch("/api/trading/account", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
          fetch("/api/bi-center", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
          fetch("/api/company/pulse", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
          fetch("/api/company/learning", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        ]);
        if (d?.ok) setDash(d);
        if (i?.ok) setPending(i.pending || 0);
        if (a?.ok && a.account) setAccount(a.account);
        if (b?.ok) setBi(b);
        if (p?.ok) setPulse(p);
        if (l?.ok) setLearning(l);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const criticalAlerts = (dash?.alerts || []).filter((a) =>
    ["HIGH", "CRITICAL"].includes(String(a.severity || "").toUpperCase())
  );
  const decision = bi?.answers;

  return (
    <main className="page-wrap">
      <header className="hero-scenic">
        <div
          style={{
            width: "100%",
            display: "grid",
            placeItems: "center",
            marginBottom: 10,
          }}
        >
          <ExactOrvantaLogo />
        </div>

        <span className="hero-pill">
          <Sparkles size={14} /> Orvanta · نظام التشغيل الذكي للأعمال والتجارة والاستثمار
        </span>

        <h1 className="hero-title">
          شركة كاملة تعمل بالذكاء الاصطناعي،
          <br />
          من القرار إلى <em>التنفيذ</em>
        </h1>

        <p className="hero-sub">
          أورفانتا تدير الأفكار، الاعتمادات، المشاريع، المؤشرات، وAction Queue عبر وكلاء ذكاء اصطناعي —
          مع بقاء القرار النهائي بيدك.
        </p>

        <div className="hero-actions">
          <Link className="primary-btn" href="/inbox"><Inbox size={17} /> مركز القرار{pending > 0 ? ` (${pending})` : ""}</Link>
          <Link className="secondary-btn" href="/ideas"><Lightbulb size={17} /> الأفكار</Link>
          <Link className="secondary-btn" href="/operations"><Send size={17} /> تشغيل Orvanta</Link>
          <Link className="secondary-btn" href="/office"><Activity size={17} /> المكتب الحيّ</Link>
        </div>

        <div className="orvanta-system-card" aria-label="Orvanta AI operating system logo concept">
          <div
            style={{
              minHeight: 210,
              display: "grid",
              placeItems: "center",
              padding: "18px 12px",
            }}
          >
            <ExactOrvantaLogo size="min(330px, 76vw)" minHeight={150} />
          </div>
        </div>

        <div className="hero-logos">
          <span>{pulse ? `${pulse.workingCount} وكيلاً يعمل الآن` : "8 أقسام تشغيلية"}</span>
          <i />
          <span>{dash?.projects.length ?? 0} مشروع نشط</span>
          <i />
          <span>{pending} قرار بانتظارك</span>
        </div>

        <div className="orvanta-brand-strip">
          <span>AI Agents</span>
          <span>Business OS</span>
          <span>Trade & Investment</span>
          <span>Enterprise Governance</span>
        </div>
      </header>

      {loading && (
        <div className="bento-card bento-full" style={{ placeItems: "center", padding: 24 }}>
          <Loader2 className="spin" size={22} style={{ color: "var(--muted)" }} />
        </div>
      )}

      {decision && (
        <section className="bento-card bento-full bento-card--glow" style={{ gap: 12 }}>
          <span className="bento-kicker"><Sparkles size={15} /> قرار اليوم — خلاصة قراءة Orvanta للأعمال</span>
          <strong style={{ fontSize: "clamp(1.15rem, 2.6vw, 1.55rem)", lineHeight: 1.6, color: "var(--text-strong)" }}>
            {decision.decisionToday}
          </strong>
          {decision.decisionAction && (
            <Link className="primary-btn" href={decision.decisionAction.href} style={{ width: "fit-content" }}>
              {decision.decisionAction.label} <ArrowLeft size={15} />
            </Link>
          )}
        </section>
      )}

      <section className="bento-grid">
        <Link href="/inbox" className={`bento-card bento-2x ${pending > 0 ? "bento-card--amber" : ""}`}>
          <span className="bento-kicker"><Inbox size={15} /> مركز القرار الموحّد</span>
          <span className="bento-value">{pending}</span>
          <span className="bento-label">قرار بانتظار اعتمادك من كل الأقسام والأنظمة</span>
          <span className="bento-foot" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            اعتمد أو ارفض أو أحِل <ArrowLeft size={13} />
          </span>
        </Link>

        <Link href="/operations?tab=trading" className={`bento-card ${account ? "bento-card--green" : ""}`}>
          <span className="bento-kicker"><Wallet size={15} /> حساب التداول</span>
          <span className="bento-value">{account ? usd.format(account.equity) : "—"}</span>
          <span className="bento-label">{account ? (account.mode === "live" ? "حساب حقيقي" : "ورقي/Paper") : "غير مُهيّأ"}</span>
        </Link>

        <Link href="/ideas" className="bento-card">
          <span className="bento-kicker"><Lightbulb size={15} /> الأفكار</span>
          <span className="bento-value">{learning ? `${Math.round(learning.confidenceThreshold * 100)}%` : "—"}</span>
          <span className="bento-label">حد الثقة المتكيّف · فكرة الفريق تنتظرك</span>
        </Link>

        <Link href="/office" className={`bento-card ${pulse && pulse.workingCount > 0 ? "bento-card--green" : ""}`}>
          <span className="bento-kicker"><Activity size={15} /> المكتب الحيّ</span>
          <span className="bento-value">{pulse?.workingCount ?? 0}</span>
          <span className="bento-label">وكيل يعمل الآن</span>
        </Link>

        <Link href="/company" className="bento-card">
          <span className="bento-kicker"><Brain size={15} /> التعلّم الذاتي</span>
          <span className="bento-value">{learning ? `${Math.round(learning.approvalRate * 100)}%` : "—"}</span>
          <span className="bento-label">نسبة اعتماد · {learning?.decisionsAnalyzed ?? 0} قرار حُلّل</span>
        </Link>

        <Link href="/operations?tab=dashboard" className="bento-card">
          <span className="bento-kicker"><FolderKanban size={15} /> المشاريع</span>
          <span className="bento-value">{dash?.projects.length ?? 0}</span>
          <span className="bento-label">مشروع نشط</span>
        </Link>

        <Link href="/departments/executive" className={`bento-card ${criticalAlerts.length > 0 ? "bento-card--red" : ""}`}>
          <span className="bento-kicker"><AlertTriangle size={15} /> تنبيهات حرجة</span>
          <span className="bento-value">{criticalAlerts.length}</span>
          <span className="bento-label">{criticalAlerts.length > 0 ? "تحتاج مراجعة عاجلة" : "لا مخاطر عالية"}</span>
        </Link>
      </section>

      <DigestCard />

      {pulse && pulse.events.length > 0 && (
        <section className="bento-card bento-full" style={{ gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="bento-kicker"><Activity size={15} /> نبض Orvanta الآن</span>
            <Link href="/office" className="secondary-btn btn-sm">المكتب <ArrowLeft size={12} /></Link>
          </div>
          <div className="bento-list">
            {pulse.events.slice(0, 5).map((e) => (
              <div key={e.id} className="bento-list__row">
                <span><b style={{ color: "var(--text-strong)" }}>{e.agentName}</b> — {e.title}</span>
                <span className="mini-pill">{e.kindLabel}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bento-card bento-full">
        <span className="bento-kicker"><Building2 size={15} /> أقسام Orvanta</span>
        <div className="quick-nav" style={{ marginTop: 4 }}>
          {departments.map((d) => {
            const Icon = d.icon;
            return (
              <Link key={d.href} href={d.href} className="quick-nav-card">
                <span><Icon size={18} /></span>
                {d.label}
              </Link>
            );
          })}
        </div>
      </section>

      <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
        <Link className="secondary-btn" href="/operations"><Send size={16} /> تشغيل طلب شركة كامل عبر Orvanta</Link>
      </div>
    </main>
  );
}

function DigestCard() {
  const [digest, setDigest] = useState<{ headline: string; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/company/digest", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => j.ok && setDigest(j.digest))
      .catch(() => {});
  }, []);

  async function send() {
    setSending(true);
    setSent(null);
    try {
      const res = await fetch("/api/company/digest", { method: "POST" });
      const json = await res.json();
      if (json.ok) setSent(json.dispatch.reason);
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  }

  if (!digest) return null;
  return (
    <section className="bento-card bento-full" style={{ gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span className="bento-kicker"><Sparkles size={15} /> ملخص Orvanta اليومي · {digest.headline}</span>
        <button className="secondary-btn btn-sm" onClick={send} disabled={sending}>
          {sending ? <Loader2 className="spin" size={14} /> : <Send size={14} />} إرسال الملخص للمالك
        </button>
      </div>
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--muted)", fontSize: "0.82rem", lineHeight: 1.9, fontFamily: "inherit" }}>{digest.text}</pre>
      {sent && <p className="notice done" style={{ color: "var(--green)" }}>{sent}</p>}
    </section>
  );
}
