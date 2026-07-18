"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import OrvantaLogo from "./OrvantaLogo";
import SessionControl from "./SessionControl";

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
  { href: "/departments/finance", name: "المالية", desc: "الفواتير، الميزانيات، والتدفق النقدي" },
  { href: "/departments/marketing", name: "التسويق", desc: "الحملات، المحتوى، وقياس الأثر" },
  { href: "/departments/sales", name: "المبيعات", desc: "خط الأنابيب، العملاء، والإيراد" },
  { href: "/departments/procurement", name: "المشتريات والمخزون", desc: "الموردون، الطلبات، ومستويات المخزون" },
  { href: "/departments/government-relations", name: "العلاقات الحكومية", desc: "التراخيص، الامتثال، والمنصات الرسمية" },
  { href: "/departments/executive", name: "المكتب التنفيذي", desc: "التنبيهات، الحوكمة، وقرارات الإدارة" },
  { href: "/bi-center", name: "مركز الذكاء BI", desc: "المؤشرات، التقارير، وقراءة الأعمال" },
  { href: "/operations", name: "العمليات والتنفيذ", desc: "تشغيل الطلبات كاملة عبر وكلاء أورفانتا" },
];

const anchors = [
  { href: "#decisions", label: "القرارات" },
  { href: "#operations", label: "التشغيل" },
  { href: "#departments", label: "الأقسام" },
  { href: "#office", label: "المكتب" },
  { href: "#intelligence", label: "الذكاء" },
];

/** Diagonal outward arrow (up-left in RTL) — drawn for this system, round caps. */
function Arrow({ size = 18 }: { size?: number }) {
  return (
    <svg
      className="fx-arrow"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 17 L7.5 7.5" />
      <path d="M7 13.5 V7 h6.5" />
    </svg>
  );
}

/** Signature field: current-lines echoing the Orvanta mark's curves. */
function FlowField() {
  return (
    <svg className="fx-hero__field" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <path
        className="fx-flow"
        d="M -80 610 C 280 545, 520 700, 830 620 C 1080 555, 1280 505, 1540 565"
        stroke="rgba(7,151,183,0.30)"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        className="fx-flow fx-flow--slow"
        d="M -80 705 C 340 655, 620 790, 950 705 C 1180 645, 1360 605, 1540 650"
        stroke="rgba(99,200,221,0.14)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 880 742 C 985 808, 1120 806, 1205 732"
        stroke="rgba(7,151,183,0.55)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="500" cy="652" r="6" fill="rgba(232,241,241,0.65)" />
      <circle cx="1205" cy="732" r="6" fill="#0797b7" />
    </svg>
  );
}

export default function OrvantaFacade() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [bi, setBi] = useState<Bi | null>(null);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [learning, setLearning] = useState<Learning | null>(null);
  const [loadError, setLoadError] = useState(false);

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
        if (![d, i, a, b, p, l].some(Boolean)) setLoadError(true);
        if (d?.ok) setDash(d);
        if (i?.ok) setPending(i.pending || 0);
        if (a?.ok && a.account) setAccount(a.account);
        if (b?.ok) setBi(b);
        if (p?.ok) setPulse(p);
        if (l?.ok) setLearning(l);
      } catch {
        setLoadError(true);
      }
    })();
  }, []);

  const decision = bi?.answers;
  const events = pulse?.events?.slice(0, 6) ?? [];

  const tickerItems: string[] = [
    pulse ? `${pulse.workingCount} وكيلاً يعمل الآن` : "وكلاء يعملون على مدار الساعة",
    dash ? `${dash.projects.length} مشروع نشط` : "8 أقسام تشغيلية",
    pending !== null ? `${pending} قرار بانتظار الاعتماد` : "القرار الأخير يبقى لك",
    ...(account ? [`حساب التداول ${usd.format(account.equity)}`] : []),
    ...(learning ? [`نسبة اعتماد القرارات ${Math.round(learning.approvalRate * 100)}%`] : []),
    ...events.slice(0, 3).map((e) => `${e.agentName}: ${e.title}`),
  ];

  return (
    <main className="fx-root" dir="rtl">
      <nav className="fx-nav" aria-label="أقسام الواجهة">
        <div className="fx-nav__bar">
          <Link href="/" className="fx-nav__brand" aria-label="أورفانتا — أعلى الصفحة">
            <OrvantaLogo size={30} showWordmark={false} />
            أورفانتا
          </Link>
          <div className="fx-nav__links">
            {anchors.map((a) => (
              <a key={a.href} href={a.href}>{a.label}</a>
            ))}
          </div>
          <div className="fx-nav__actions">
            <SessionControl />
            <Link href="/inbox" className="fx-enter">
              دخول النظام <Arrow size={15} />
            </Link>
          </div>
        </div>
      </nav>

      <header className="fx-hero">
        <FlowField />
        <div className="fx-wrap">
          <div className="fx-hero__inner">
            <span className="fx-hero__mark">
              <OrvantaLogo size={92} showWordmark={false} priority />
            </span>
            <h1>
              شركة كاملة يديرها الذكاء الاصطناعي،
              <br />
              والقرار الأخير <em>لك</em>.
            </h1>
            <p className="fx-hero__sub">
              أورفانتا تحوّل الأفكار إلى مشاريع ومهام وقرارات معتمدة، عبر وكلاء يعملون على مدار
              الساعة تحت إشرافك المباشر.
            </p>
            <Link href="/inbox" className="fx-enter">
              ادخل مركز القرار{pending ? ` (${pending})` : ""} <Arrow size={16} />
            </Link>
          </div>
        </div>
        <div className="fx-ticker" aria-hidden="true">
          <div className="fx-ticker__track">
            {[0, 1].map((copy) => (
              <span key={copy} style={{ display: "inline-flex", gap: 48 }}>
                {tickerItems.map((item, i) => (
                  <span key={i}>
                    <i className="fx-dot" />
                    {item}
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </header>

      <section id="decisions" className="fx-section">
        <div className="fx-wrap">
          <div className="fx-lede">
            <span className="fx-lede__num">{pending ?? "—"}</span>
            <span className="fx-lede__label">قرارًا بانتظار اعتمادك من كل الأقسام والأنظمة</span>
          </div>
          {decision && (
            <div className="fx-decision">
              <small>قراءة أورفانتا لهذا اليوم</small>
              <p>{decision.decisionToday}</p>
            </div>
          )}
          {loadError && (
            <p className="fx-pulse__empty" role="status" style={{ marginTop: 24 }}>
              تعذّر تحميل المؤشرات الحية الآن — الأقسام تعمل ويمكنك المتابعة والمحاولة لاحقًا.
            </p>
          )}
          <Link href="/inbox" className="fx-more">
            افتح مركز القرار: اعتمد أو ارفض أو أحِل <Arrow />
          </Link>
        </div>
      </section>

      <section id="operations" className="fx-section fx-section--lift">
        <div className="fx-wrap">
          <h2 className="fx-sentence">
            التنفيذ لا ينتظر: وكلاء أورفانتا يعملون الآن على مشاريعك <em>وتداولك</em>.
          </h2>
          <div className="fx-figures">
            <div className="fx-figure">
              <b>{dash ? dash.projects.length : "—"}</b>
              <span>مشروع نشط قيد التنفيذ عبر فرق الوكلاء</span>
            </div>
            <div className="fx-figure">
              <b>{account ? usd.format(account.equity) : "—"}</b>
              <span>
                قيمة حساب التداول
                {account ? (account.mode === "live" ? " — حساب حقيقي" : " — حساب ورقي") : ""}
              </span>
            </div>
            <div className="fx-figure">
              <b>{dash ? dash.tasks.length : "—"}</b>
              <span>مهمة موزّعة على الأقسام والأنظمة</span>
            </div>
          </div>
          <Link href="/operations" className="fx-more">
            انتقل إلى التنفيذ وشغّل طلب شركة كاملًا <Arrow />
          </Link>
        </div>
      </section>

      <section id="departments" className="fx-section">
        <div className="fx-wrap">
          <h2 className="fx-sentence" style={{ marginBottom: "clamp(20px, 4vh, 40px)" }}>
            أقسام الشركة، كلّها هنا.
          </h2>
          <div className="fx-depts">
            {departments.map((d) => (
              <Link key={d.href} href={d.href} className="fx-dept">
                <span className="fx-dept__name">{d.name}</span>
                <span className="fx-dept__desc">{d.desc}</span>
                <Arrow size={20} />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="office" className="fx-section fx-section--lift">
        <div className="fx-wrap">
          <div className="fx-lede">
            <span className="fx-lede__num">{pulse ? pulse.workingCount : "—"}</span>
            <span className="fx-lede__label">وكيلاً يعمل في هذه اللحظة داخل المكتب الحيّ</span>
          </div>
          <div className="fx-pulse">
            {events.length > 0 ? (
              events.map((e) => (
                <div key={e.id} className="fx-pulse__row">
                  <span>
                    <b>{e.agentName}</b> · {e.title}
                  </span>
                  <span className="fx-pulse__kind">{e.kindLabel}</span>
                </div>
              ))
            ) : (
              <p className="fx-pulse__empty">
                لا نشاط جارٍ في هذه اللحظة — الوكلاء بانتظار طلبك التالي.
              </p>
            )}
          </div>
          <Link href="/office" className="fx-more">
            ادخل المكتب الحيّ وتابع الوكلاء لحظة بلحظة <Arrow />
          </Link>
        </div>
      </section>

      <section id="intelligence" className="fx-section">
        <div className="fx-wrap">
          <h2 className="fx-sentence">
            أورفانتا تتعلّم من كل قرار تعتمده أو ترفضه.
          </h2>
          <div className="fx-figures">
            <div className="fx-figure">
              <b>{learning ? `${Math.round(learning.approvalRate * 100)}%` : "—"}</b>
              <span>نسبة اعتماد قراراتها المقترحة حتى الآن</span>
            </div>
            <div className="fx-figure">
              <b>{learning ? learning.decisionsAnalyzed : "—"}</b>
              <span>قرارًا جرى تحليله لضبط سلوك الوكلاء</span>
            </div>
            <div className="fx-figure">
              <b>{learning ? `${Math.round(learning.confidenceThreshold * 100)}%` : "—"}</b>
              <span>حد الثقة المتكيّف قبل رفع أي قرار إليك</span>
            </div>
          </div>
          <Link href="/company-brain" className="fx-more">
            افتح العقل المؤسسي: التوقعات والمحاكاة والتخطيط <Arrow />
          </Link>
        </div>
      </section>

      <footer className="fx-footer">
        <div className="fx-wrap">
          <div className="fx-footer__grid">
            <div className="fx-footer__col">
              <h3>أورفانتا</h3>
              <p>
                نظام تشغيل ذكي للأعمال والتجارة والاستثمار: من الفكرة إلى التنفيذ، مع بقاء
                القرار النهائي بيدك.
              </p>
            </div>
            <div className="fx-footer__col">
              <h3>الأقسام</h3>
              {departments.slice(0, 6).map((d) => (
                <Link key={d.href} href={d.href}>{d.name}</Link>
              ))}
            </div>
            <div className="fx-footer__col">
              <h3>النظام</h3>
              <Link href="/inbox">مركز القرار</Link>
              <Link href="/operations">التنفيذ</Link>
              <Link href="/office">المكتب الحيّ</Link>
              <Link href="/company-brain">العقل المؤسسي</Link>
              <Link href="/status">حالة النظام</Link>
              <Link href="/login">تسجيل الدخول</Link>
            </div>
          </div>
        </div>
        <span className="fx-footer__mark" aria-hidden="true">ORVANTA</span>
      </footer>
    </main>
  );
}
