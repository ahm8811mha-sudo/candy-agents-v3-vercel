"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Inbox,
  Send,
  Wallet,
  FolderKanban,
  ClipboardList,
  Landmark,
  AlertTriangle,
  ArrowLeft,
  Calculator,
  Megaphone,
  Users,
  PackageSearch,
  BarChart3,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

type Dashboard = {
  projects: Array<{ id: string; name?: string; status?: string }>;
  tasks: Array<{ id: string; title?: string; status?: string }>;
  decisions: Array<{ id: string }>;
  alerts?: Array<{ id: string; severity?: string; title?: string }>;
};

type Account = { equity: number; cash: number; mode: "paper" | "live" };

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const quickDepartments = [
  { href: "/departments/finance", label: "المالية", icon: Calculator },
  { href: "/departments/marketing", label: "التسويق", icon: Megaphone },
  { href: "/departments/sales", label: "المبيعات", icon: Users },
  { href: "/departments/procurement", label: "المشتريات", icon: PackageSearch },
  { href: "/departments/government-relations", label: "العلاقات الحكومية", icon: Landmark },
  { href: "/bi-center", label: "مركز BI", icon: BarChart3 },
];

export default function CompanyOverview() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [pending, setPending] = useState(0);
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [d, i, a] = await Promise.all([
          fetch("/api/company-dashboard", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
          fetch("/api/inbox", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
          fetch("/api/trading/account", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        ]);
        if (d?.ok) setDash(d);
        if (i?.ok) setPending(i.pending || 0);
        if (a?.ok && a.account) setAccount(a.account);
      } catch {
        // silent
      }
    })();
  }, []);

  const criticalAlerts = (dash?.alerts || []).filter((a) =>
    ["HIGH", "CRITICAL"].includes(String(a.severity || "").toUpperCase())
  );

  return (
    <main className="page-wrap">
      {/* Scenic hero — atmospheric horizon */}
      <header className="hero-scenic">
        <span className="hero-pill">
          <Sparkles size={14} /> النجمة الذهبية · نظام تشغيل الأعمال بالذكاء الاصطناعي
        </span>
        <h1 className="hero-title">
          شركة كاملة تعمل بالذكاء،
          <br />
          والقرار الأخير <em>بيدك</em>
        </h1>
        <p className="hero-sub">
          الوكلاء يحلّلون السوق، يديرون الأقسام، ويجهّزون الصفقات — وكل ما يتجاوز الصلاحيات
          يصلك في مركز القرار لتعتمده أو ترفضه أو تحيله.
        </p>
        <div className="hero-actions">
          <Link className="primary-btn" href="/operations"><Send size={17} /> تشغيل الشركة</Link>
          <Link className="secondary-btn" href="/inbox">
            <Inbox size={17} /> مركز القرار{pending > 0 ? ` (${pending})` : ""}
          </Link>
        </div>
        <div className="hero-logos">
          <span>8 أقسام تشغيلية</span>
          <i />
          <span>تداول بإشراف المدير المالي</span>
          <i />
          <span>{dash?.projects.length ?? 0} مشروع نشط</span>
          <i />
          <span>{pending} قرار بانتظارك</span>
        </div>
      </header>

      {/* Bento */}
      <section className="bento-grid">
        <Link href="/inbox" className={`bento-card bento-2x bento-card--glow ${pending > 0 ? "bento-card--amber" : ""}`}>
          <span className="bento-kicker"><Inbox size={15} /> مركز القرار الموحّد</span>
          <span className="bento-value">{pending}</span>
          <span className="bento-label">قرار بانتظار اعتمادك من كل الأقسام والأنظمة</span>
          <span className="bento-foot" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            افتح الصندوق واعتمد أو ارفض أو أحِل <ArrowLeft size={13} />
          </span>
        </Link>

        <Link href="/operations?tab=trading" className={`bento-card ${account ? "bento-card--green" : ""}`}>
          <span className="bento-kicker"><Wallet size={15} /> حساب التداول</span>
          <span className="bento-value">{account ? usd.format(account.equity) : "—"}</span>
          <span className="bento-label">
            {account ? (account.mode === "live" ? "حساب حقيقي" : "حساب ورقي (Paper)") : "غير مُهيّأ بعد"}
          </span>
        </Link>

        <Link href="/operations?tab=dashboard" className="bento-card">
          <span className="bento-kicker"><FolderKanban size={15} /> المشاريع</span>
          <span className="bento-value">{dash?.projects.length ?? 0}</span>
          <span className="bento-label">مشروع نشط قيد المتابعة</span>
        </Link>

        <Link href="/departments/executive" className="bento-card">
          <span className="bento-kicker"><ClipboardList size={15} /> المهام</span>
          <span className="bento-value">{dash?.tasks.length ?? 0}</span>
          <span className="bento-label">مهمة تنفيذية عبر الأقسام</span>
        </Link>

        <Link href="/departments/finance" className="bento-card">
          <span className="bento-kicker"><Landmark size={15} /> القرارات المالية</span>
          <span className="bento-value">{dash?.decisions.length ?? 0}</span>
          <span className="bento-label">قرار مالي موثّق في السجل</span>
        </Link>

        <Link href="/departments/executive" className={`bento-card ${criticalAlerts.length > 0 ? "bento-card--red" : ""}`}>
          <span className="bento-kicker"><AlertTriangle size={15} /> تنبيهات حرجة</span>
          <span className="bento-value">{criticalAlerts.length}</span>
          <span className="bento-label">{criticalAlerts.length > 0 ? "تحتاج مراجعة عاجلة" : "لا مخاطر عالية حالياً"}</span>
        </Link>

        <Link href="/dashboard" className="bento-card">
          <span className="bento-kicker"><ShieldCheck size={15} /> لوحة CEO</span>
          <span className="bento-label" style={{ marginTop: 4 }}>
            المؤشرات الكاملة: الصحة المالية، KPIs، الموافقات، والأوامر التنفيذية
          </span>
          <span className="bento-foot" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            فتح اللوحة <ArrowLeft size={13} />
          </span>
        </Link>

        {/* Departments quick access */}
        <div className="bento-card bento-full">
          <span className="bento-kicker"><Building2 size={15} /> الأقسام</span>
          <div className="quick-nav" style={{ marginTop: 4 }}>
            {quickDepartments.map((d) => {
              const Icon = d.icon;
              return (
                <Link key={d.href} href={d.href} className="quick-nav-card">
                  <span><Icon size={18} /></span>
                  {d.label}
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
