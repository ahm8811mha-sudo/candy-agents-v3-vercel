"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  Send,
  Building2,
  Menu,
  X,
  Activity,
  Brain,
  Bot,
} from "lucide-react";
import NotificationCenter from "./NotificationCenter";
import OrvantaLogo from "./OrvantaLogo";
import CommandPalette from "./CommandPalette";
import SessionControl from "./SessionControl";

type NavLink = {
  href: string;
  label: string;
  icon: typeof Inbox;
  badge?: number;
};

const PAGE_TITLES: Array<[string, string]> = [
  ["/employee-runtime", "الموظفون الذاتيون"],
  ["/company-brain", "العقل المؤسسي"],
  ["/control-room", "مركز قيادة الشركة"],
  ["/inbox", "القرارات"],
  ["/ideas", "الأفكار"],
  ["/correspondence-center", "مركز المخاطبات"],
  ["/recovery-center", "Crisis Room"],
  ["/operations", "التنفيذ"],
  ["/office", "مكتب Orvanta"],
  ["/company", "الهيكل الإداري"],
  ["/sales", "نظام المبيعات"],
  ["/dashboard", "لوحة CEO"],
  ["/enterprise-os", "Enterprise OS"],
  ["/bi-center", "مركز الذكاء BI"],
  ["/status", "النظام"],
  ["/departments/finance", "المالية"],
  ["/departments/marketing", "التسويق"],
  ["/departments/sales", "المبيعات CRM"],
  ["/departments/operations", "العمليات"],
  ["/departments/procurement", "المشتريات والمخزون"],
  ["/departments/government-relations", "العلاقات الحكومية"],
  ["/departments/supply-chain", "سلاسل الإمداد"],
  ["/departments/executive", "المكتب التنفيذي"],
  ["/departments", "الأقسام"],
  ["/", "نظرة عامة"],
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const authPage = pathname.startsWith("/login") || pathname === "/";
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
        const response = await fetch("/api/company/feed", {
          cache: "no-store",
        });
        if (response.status === 401) return;
        const json = await response.json();
        if (alive && json.ok) setPending(json.pending || 0);
      } catch {
        // Keep navigation usable if telemetry is temporarily unavailable.
      }
    }
    void load();
    const timer = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [pathname, authPage]);

  const links: NavLink[] = [
    { href: "/", label: "نظرة عامة", icon: LayoutDashboard },
    { href: "/inbox", label: "القرارات", icon: Inbox, badge: pending },
    { href: "/employee-runtime", label: "الموظفون الذاتيون", icon: Bot },
    { href: "/operations", label: "التنفيذ", icon: Send },
    { href: "/departments", label: "الأقسام", icon: Building2 },
    { href: "/status", label: "النظام", icon: Activity },
  ];

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/" || pathname.startsWith("/company-brain");
    }
    if (href === "/departments") {
      return (
        pathname.startsWith("/departments") ||
        ["/sales", "/company", "/office"].some((route) =>
          pathname.startsWith(route)
        )
      );
    }
    if (href === "/operations") {
      return [
        "/operations",
        "/control-room",
        "/ideas",
        "/correspondence-center",
        "/recovery-center",
      ].some((route) => pathname.startsWith(route));
    }
    return pathname.startsWith(href);
  };

  const pageTitle =
    PAGE_TITLES.find(([path]) =>
      path === "/" ? pathname === "/" : pathname.startsWith(path)
    )?.[1] || "Orvanta";

  if (authPage) return <>{children}</>;

  return (
    <div className="shell-root">
      <a className="skip-link" href="#main-content">
        تجاوز إلى المحتوى
      </a>
      <div
        className={`shell-backdrop ${open ? "open" : ""}`}
        onClick={() => setOpen(false)}
      />

      <aside
        className={`shell-sidebar ${open ? "open" : ""}`}
        aria-label="التنقل الرئيسي"
      >
        <Link
          className="shell-sidebar__brand"
          href="/"
          onClick={() => setOpen(false)}
          aria-label="Orvanta — الصفحة الرئيسية"
        >
          <OrvantaLogo size={44} showWordmark={false} priority />
          <span className="shell-sidebar__brand-text">
            <b>أورفانتا</b>
            <small>AI Business OS</small>
          </span>
        </Link>

        <div className="shell-group">التنقل الرئيسي</div>
        {links.map((link) => {
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
              {link.badge ? (
                <span
                  className="shell-link__badge"
                  aria-label={`${link.badge} عناصر بانتظار القرار`}
                >
                  {link.badge}
                </span>
              ) : null}
            </Link>
          );
        })}

        <Link
          href="/company-brain"
          className="notice"
          onClick={() => setOpen(false)}
          style={{
            margin: "22px 12px 0",
            fontSize: ".78rem",
            lineHeight: 1.7,
            display: "grid",
            gap: 6,
            textDecoration: "none",
          }}
        >
          <strong
            style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
          >
            <Brain size={14} /> العقل المؤسسي
          </strong>
          <span style={{ color: "var(--muted)" }}>
            التوأم الرقمي، التوقعات، المحاكاة، التخطيط والسرد التنفيذي في
            مساحة واحدة.
          </span>
        </Link>
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
            <Link
              href="/"
              className="shell-topbar__brand"
              aria-label="Orvanta — الصفحة الرئيسية"
            >
              <OrvantaLogo size={30} showWordmark={false} />
              <span className="shell-topbar__brand-name">Orvanta</span>
            </Link>
            <span className="shell-topbar__title" title={pageTitle}>
              {pageTitle}
            </span>
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

        <div id="main-content" className="shell-content" tabIndex={-1}>
          {children}
        </div>
      </div>
    </div>
  );
}
