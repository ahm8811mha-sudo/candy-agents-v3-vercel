"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Inbox, ClipboardCheck, FolderKanban, FileText, Menu, X, ArrowUpLeft } from "lucide-react";
import OrvantaLogo from "./OrvantaLogo";
import CommandPalette from "./CommandPalette";
import SessionControl from "./SessionControl";

const primary = [
  { href: "/", label: "مساحة العمل", icon: LayoutDashboard },
  { href: "/ideas", label: "الأفكار والدراسات", icon: FileText },
  { href: "/inbox", label: "مكتب القرار", icon: Inbox },
  { href: "/projects", label: "المشاريع والتنفيذ", icon: FolderKanban },
  { href: "/decisions-followup", label: "المتابعة", icon: ClipboardCheck },
];
const secondary = [
  ["/departments", "الأقسام والموارد"], ["/company", "هيكل الشركة"], ["/sales", "المبيعات"],
  ["/employee-runtime", "تشغيل الموظفين"], ["/operations", "سجل العمليات"], ["/company-brain", "المعرفة المؤسسية"],
  ["/correspondence-center", "المخاطبات"], ["/status", "حالة النظام"],
];
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const authPage = pathname.startsWith("/login");
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); menu.current?.focus(); }
      if (event.key === "Tab" && panel.current) {
        const nodes = Array.from(panel.current.querySelectorAll<HTMLElement>("a,button")).filter((node) => node.offsetParent !== null);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); if (previous?.isConnected) previous.focus(); };
  }, [open]);
  if (authPage) return <>{children}</>;
  const current = primary.find((item) => item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));
  return <div className="shell-root executive-shell">
    <a className="skip-link" href="#main-content">تجاوز إلى المحتوى</a>
    {open ? <button className="executive-backdrop" aria-label="إغلاق قائمة التنقل" onClick={() => setOpen(false)} /> : null}
    <aside ref={panel} className={"shell-sidebar executive-sidebar " + (open ? "open" : "")} aria-label="التنقل الرئيسي">
      <Link className="executive-brand" href="/" onClick={() => setOpen(false)} aria-label="أورفانتا — مساحة العمل"><OrvantaLogo size={42} showWordmark={false} priority /><span><strong>أورفانتا</strong><small>مكتب إدارة الأعمال</small></span></Link>
      <div className="sidebar-company"><span>الشركة</span><strong>النجمة الذهبية</strong><small>من الفكرة إلى الأثر</small></div>
      <nav aria-label="سير العمل">{primary.map(({ href, label, icon: Icon }, index) => <Link key={href} href={href} className={"shell-link " + (current?.href === href ? "is-active" : "")} aria-current={current?.href === href ? "page" : undefined} onClick={() => setOpen(false)}><Icon size={18} /><span>{label}</span><small>{String(index + 1).padStart(2, "0")}</small></Link>)}</nav>
      <div className="sidebar-tools"><button onClick={() => setMore(!more)} aria-expanded={more}>الأقسام وأدوات الشركة <span aria-hidden>{more ? "−" : "+"}</span></button>{more ? <nav aria-label="أدوات الشركة">{secondary.map(([href, label]) => <Link href={href} key={href} onClick={() => setOpen(false)}>{label}<ArrowUpLeft size={13} /></Link>)}</nav> : null}</div>
      <div className="sidebar-note"><span>القرار موثّق.</span><span>والتنفيذ قابل للتحقق.</span><Link href="/status">جاهزية النظام <ArrowUpLeft size={14} /></Link></div>
      <button className="sidebar-close" onClick={() => setOpen(false)}><X size={17} /> إغلاق القائمة</button>
    </aside>
    <div className="shell-main"><header className="shell-topbar"><div className="shell-topbar__identity"><button ref={menu} className="shell-menu-btn" aria-label="فتح القائمة" aria-expanded={open} onClick={() => setOpen(!open)}><Menu size={20} /></button><Link href="/" className="topbar-company">Orvanta <span>/</span></Link><span className="shell-topbar__title">{current?.label || "أدوات الشركة"}</span></div><div className="shell-topbar__actions"><CommandPalette /><SessionControl /></div></header><div id="main-content" className="shell-content" tabIndex={-1}>{children}</div></div>
    <nav className="mobile-work-nav" aria-label="تنقل سريع">{primary.slice(0, 4).map(({ href, label, icon: Icon }) => <Link href={href} key={href} aria-current={current?.href === href ? "page" : undefined}><Icon size={18} /><span>{label.split(" وال")[0]}</span></Link>)}</nav>
  </div>;
}
