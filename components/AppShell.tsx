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
  Menu,
  X,
} from "lucide-react";
import NotificationCenter from "./NotificationCenter";

type NavLink = { href: string; label: string; icon: typeof Inbox; badge?: number };
type NavGroup = { title: string; links: NavLink[] };

const PAGE_TITLES: Array<[string, string]> = [
  ["/inbox", "مركز القرار"],
  ["/ideas", "الأفكار"],
  ["/operations", "التشغيل"],
  ["/office", "مكتب النجمة الذهبية"],
  ["/company", "الهيكل الإداري"],
  ["/dashboard", "لوحة CEO"],
  ["/enterprise-os", "Enterprise OS"],
  ["/bi-center", "مركز الذكاء BI"],
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
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(0);

  // Close the drawer on navigation and lock body scroll while it is open.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Pending-decision badge for the sidebar.
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/inbox", { cache: "no-store" });
        const json = await res.json();
        if (alive && json.ok) setPending(json.pending || 0);
      } catch {
        // silent
      }
    }
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pathname]);

  const groups: NavGroup[] = [
    {
      title: "الرئيسية",
      links: [
        { href: "/", label: "نظرة عامة", icon: LayoutDashboard },
        { href: "/inbox", label: "مركز القرار", icon: Inbox, badge: pending },
        { href: "/ideas", label: "الأفكار", icon: Lightbulb },
        { href: "/operations", label: "التشغيل", icon: Send },
      ],
    },
    {
      title: "اللوحات",
      links: [
        { href: "/office", label: "المكتب", icon: Building2 },
        { href: "/company", label: "الهيكل الإداري", icon: Users },
        { href: "/dashboard", label: "لوحة CEO", icon: ShieldCheck },
        { href: "/enterprise-os", label: "Enterprise OS", icon: Building2 },
        { href: "/bi-center", label: "مركز الذكاء BI", icon: BarChart3 },
      ],
    },
    {
      title: "الأقسام",
      links: [
        { href: "/departments/executive", label: "المكتب التنفيذي", icon: ShieldCheck },
        { href: "/departments/finance", label: "المالية", icon: Calculator },
        { href: "/departments/marketing", label: "التسويق", icon: Megaphone },
        { href: "/departments/sales", label: "المبيعات CRM", icon: Users },
        { href: "/departments/operations", label: "العمليات", icon: Settings2 },
        { href: "/departments/procurement", label: "المشتريات", icon: PackageSearch },
        { href: "/departments/government-relations", label: "العلاقات الحكومية", icon: Landmark },
        { href: "/departments/supply-chain", label: "سلاسل الإمداد", icon: Boxes },
      ],
    },
  ];

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const pageTitle = PAGE_TITLES.find(([p]) => (p === "/" ? pathname === "/" : pathname.startsWith(p)))?.[1] || "Candy Agents";

  return (
    <div className="shell-root">
      <div className={`shell-backdrop ${open ? "open" : ""}`} onClick={() => setOpen(false)} />

      <aside className={`shell-sidebar ${open ? "open" : ""}`} aria-label="التنقل الرئيسي">
        <Link className="shell-sidebar__brand" href="/" onClick={() => setOpen(false)}>
          <span className="app-header__logo">AI</span>
          <span>
            <b>Candy Agents</b>
            <small>النجمة الذهبية · AI Operating System</small>
          </span>
        </Link>

        {groups.map((group) => (
          <div key={group.title}>
            <div className="shell-group">{group.title}</div>
            {group.links.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`shell-link ${isActive(link.href) ? "is-active" : ""}`}
                  onClick={() => setOpen(false)}
                >
                  <Icon size={16} />
                  {link.label}
                  {link.badge ? <span className="shell-link__badge">{link.badge}</span> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </aside>

      <div className="shell-main">
        <div className="shell-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              className="shell-menu-btn"
              onClick={() => setOpen(!open)}
              aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
              aria-expanded={open}
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
            <span className="shell-topbar__title">{pageTitle}</span>
          </div>
          <div className="shell-topbar__actions">
            <NotificationCenter />
            <span className="app-header__status hide-mobile">
              <span className="app-header__dot" />
              جاهز
            </span>
          </div>
        </div>

        <div className="shell-content">{children}</div>
      </div>
    </div>
  );
}
