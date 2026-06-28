"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  LayoutDashboard,
  Calculator,
  ShieldCheck,
  Megaphone,
  Users,
  PackageSearch,
  Landmark,
  BarChart3,
  Menu,
  X,
} from "lucide-react";
import NotificationCenter from "./NotificationCenter";

const links = [
  { href: "/", label: "الرئيسية", icon: Building2 },
  { href: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/departments/finance", label: "المالية", icon: Calculator },
  { href: "/departments/executive", label: "CEO", icon: ShieldCheck },
  { href: "/departments/marketing", label: "التسويق", icon: Megaphone },
  { href: "/departments/sales", label: "CRM", icon: Users },
] as const;

export default function AppNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="app-nav" role="navigation" aria-label="التنقل الرئيسي">
      <Link href="/" className="app-nav-brand">
        <span><Building2 size={18} /></span>
        Candy Agents
      </Link>

      <button
        className="nav-mobile-toggle"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? "إغلاق القائمة" : "فتح القائمة"}
        aria-expanded={mobileOpen}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <div className={`app-nav-links ${mobileOpen ? "open" : ""}`}>
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`app-nav-link ${isActive ? "active" : ""}`}
              onClick={() => setMobileOpen(false)}
            >
              <Icon size={16} />
              {link.label}
            </Link>
          );
        })}
      </div>

      <div className="app-nav-actions">
        <NotificationCenter />
      </div>
    </nav>
  );
}
