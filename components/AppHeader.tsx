"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };

// عدّل هذه المسارات لتطابق routes مشروعك:
const NAV: NavItem[] = [
  { href: "/dashboard", label: "المدير" },   // CEO Apple dashboard
  { href: "/", label: "التشغيل" },            // Enterprise OS / StrategyRunner
  { href: "/office", label: "المكتب" },       // Golden Star agents office
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

      <span className="app-header__status">
        <span className="app-header__dot" />
        {status}
      </span>
    </header>
  );
}
