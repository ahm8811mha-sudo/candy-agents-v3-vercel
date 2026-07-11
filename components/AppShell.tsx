"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  Lightbulb,
  Send,
  Building2,
  Calculator,
  Megaphone,
  Users,
  Settings2,
  PackageSearch,
  Landmark,
  Boxes,
  ShieldCheck,
  BarChart3,
  ShoppingBag,
  AlertTriangle,
  Mail,
  Menu,
  X,
  Activity,
  Radar,
} from "lucide-react";
import NotificationCenter from "./NotificationCenter";
import OrvantaLogo from "./OrvantaLogo";
import CommandPalette from "./CommandPalette";
import SessionControl from "./SessionControl";

type NavLink = { href: string; label: string; icon: typeof Inbox; badge?: number };
type NavGroup = { title: string; links: NavLink[] };

const PAGE_TITLES: Array<[string, string]> = [
  ["/control-room", "مركز قيادة الشركة"],
  ["/inbox", "مركز القرار"],
  ["/ideas", "الأفكار"],
  ["/correspondence-center", "مركز المخاطبات"],
  ["/recovery-center", "Crisis Room"],
  ["/operations", "التشغيل"],
  ["/office", "مكتب Orvanta"],
  ["/company", "الهيكل الإداري"],
  ["/sales", "نظام المبيعات"],
  ["/dashboard", "لوحة CEO"],
  ["/enterprise-os", "Enterprise OS"],
  ["/bi-center", "مركز الذكاء BI"],
  ["/status", "حالة النظام"],
  ["/departments/finance", "المالية"],
  ["/departments/marketing", "التسويق"],
  ["/departments/sales", "المبيعات CRM"],
  ["/departments/operations", "العمليات"],
  ["/departments/procurement", "المشتريات والمخزون"],
  ["/departments/government-relations", "العلاقات الحكومية"],
  ["/departments/supply-chain", "سلاسل الإمداد"],
  ["/departments/executive", "المكتب التنفيذي"],
  ["/", "نظرة عامة"],
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const authPage = pathname.startsWith("/login");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (authPage) return;
    document.body.style.overflow = open ? "hidden" : "";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, authPage]);

  useEffect(() => {
    if (authPage) return;
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/company/feed", { cache: "no-store" });
        if (res.status === 401) return;
        const json = await res.json();
        if (alive && json.ok) setPending(json.pending || 0);
      } catch {
        // Keep navigation usable if telemetry is temporarily unavailable.
      }
    }
    load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pathname, authPage]);

  const groups: NavGroup[] = [
    {
      title: "القيادة",
      links: [
        { href: "/", label: "نظرة عامة", icon: LayoutDashboard },
        { href: "/control-room", label: "مركز قيادة الشركة", icon: Radar },
        { href: "/inbox", label: "مركز القرار", icon: Inbox, badge: pending },
        { href: "/ideas", label: "الأفكار", icon: Lightbulb },
        { href: "/operations", label: "التنفيذ", icon: Send },
      ],
    },
    {
      title: "المراكز",
      links: [
        { href: "/correspondence-center", label: "مركز المخاطبات", icon: Mail },
        { href: "/recovery-center", label: "Crisis Room", icon: AlertTriangle },
        { href: "/office", label: "المكتب", icon: Building2 },
        { href: "/company", label: "الهيكل الإداري", icon: Users },
        { href: "/dashboard", label: "لوحة CEO", icon: ShieldCheck },
        { href: "/enterprise-os", label: "Enterprise OS", icon: Building2 },
        { href: "/bi-center", label: "مركز الذكاء BI", icon: BarChart3 },
        { href: "/status", label: "حالة النظام", icon: Activity },
      ],
    },
    {
      title: "محركات الأعمال",
      links: [
        { href: "/departments/executive", label: "المكتب التنفيذي", icon: ShieldCheck },
        { href: "/sales", label: "نظام المبيعات (المتجر)", icon: ShoppingBag },
        { href: "/departments/finance", label: "المالية", icon: Calculator },
        { href: "/departments/marketing", label: "النمو والتسويق", icon: Megaphone },
        { href: "/departments/sales", label: "العميل والمبيعات CRM", icon: Users },
        { href: "/departments/operations", label: "العمليات", icon: Settings2 },
        { href: "/departments/procurement", label: "المشتريات", icon: PackageSearch },
        { href: "/departments/government-relations", label: "العلاقات الحكومية", icon: Landmark },
        { href: "/departments/supply-chain", label: "سلاسل الإمداد", icon: Boxes },
      ],
    },
  ];

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const pageTitle = PAGE_TITLES.find(([p]) => (p === "/" ? pathname === "/" : pathname.startsWith(p)))?.[1] || "Orvanta";

  if (authPage) return <>{children}</>;

  return (
    <div className="shell-root">
      <a className="skip-link" href="#main-content">تجاوز إلى المحتوى</a>
      <div className={`shell-backdrop ${open ? "open" : ""}`} onClick={() => setOpen(false)} />

      <aside className={`shell-sidebar ${open ? "open" : ""}`} aria-label="التنقل الرئيسي">
        <Link className="shell-sidebar__brand" href="/" onClick={() => setOpen(false)} aria-label="Orvanta — الصفحة الرئيسية">
          <OrvantaLogo size={154} subtitle="AI Company Operating System" priority />
        </Link>

        {groups.map((group) => (
          <div key={group.title}>
            <div className="shell-group">{group.title}</div>
            {group.links.map((link) => {
              const Icon = link.icon;
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`shell-link ${active ? "is-active" : ""}`}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={16} aria-hidden="true" />
                  {link.label}
                  {link.badge ? <span className="shell-link__badge" aria-label={`${link.badge} عناصر بانتظار القرار`}>{link.badge}</span> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </aside>

      <div className="shell-main">
        <div className="shell-topbar">
          <div className="shell-topbar__identity">
            <button
              className="shell-menu-btn"
              onClick={() => setOpen(!open)}
              aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
              aria-expanded={open}
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
            <Link href="/" className="shell-topbar__brand" aria-label="Orvanta — الصفحة الرئيسية">
              <OrvantaLogo size={30} showWordmark={false} />
              <span className="shell-topbar__brand-name">Orvanta</span>
            </Link>
            <span className="shell-topbar__title" title={pageTitle}>{pageTitle}</span>
          </div>
          <div className="shell-topbar__actions">
            <CommandPalette />
            <NotificationCenter />
            <SessionControl />
            <span className="app-header__status hide-mobile">
              <span className="app-header__dot" />
              Orvanta جاهز
            </span>
          </div>
        </div>

        <div id="main-content" className="shell-content" tabIndex={-1}>{children}</div>
      </div>
    </div>
  );
}
