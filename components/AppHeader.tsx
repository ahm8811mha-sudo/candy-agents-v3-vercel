"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import NotificationCenter from "./NotificationCenter";

type NavItem = { href: string; label: string };

// مسارات المشروع الفعلية:
const NAV: NavItem[] = [
  { href: "/dashboard", label: "المدير" },     // CEO Apple dashboard
  { href: "/", label: "التشغيل" },              // Enterprise OS / StrategyRunner
  { href: "/enterprise-os", label: "المكتب" },  // Golden Star agents office (warm theme)
];

export default function AppHeader({ status = "جاهز" }: { status?: string }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="app-header">
      <Link className="app-header__brand" href="/">
        <span className="app-header__logo">AI</span>
        <span>
          <b>Candy Agents</b>
          <small>النجمة الذهبية · AI Operating System</small>
        </span>
      </Link>

      <nav className="app-nav">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={isActive(item.href) ? "is-active" : ""}
          >
            <span className="app-nav__label">{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="app-header__actions">
        <NotificationCenter />
        <span className="app-header__status">
          <span className="app-header__dot" />
          {status}
        </span>
      </div>
    </header>
  );
}
