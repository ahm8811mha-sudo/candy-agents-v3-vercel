"use client";

/**
 * Orvanta command palette (⌘K / Ctrl+K) — the Apple/Notion/Stripe navigation
 * standard: one keystroke reaches any page, any pending decision, any idea.
 * Static destinations render instantly; live items (pending decisions, ideas)
 * stream in from the existing APIs the first time the palette opens.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Inbox,
  Lightbulb,
  LayoutDashboard,
  Building2,
  Users,
  BarChart3,
  ShoppingBag,
  Send,
  Activity,
  ShieldCheck,
  Calculator,
  Megaphone,
  Landmark,
  CornerDownRight,
  Radar,
} from "lucide-react";

type Entry = {
  id: string;
  title: string;
  hint: string;
  href: string;
  group: "الوجهات" | "قرارات معلّقة" | "الأفكار";
  icon: typeof Search;
  stale?: boolean;
};

const DESTINATIONS: Entry[] = [
  { id: "nav-home", title: "نظرة عامة", hint: "الصفحة الرئيسية", href: "/", group: "الوجهات", icon: LayoutDashboard },
  { id: "nav-control-room", title: "مركز قيادة الشركة", hint: "الدورة والحوكمة والمجلس والهندسة", href: "/control-room", group: "الوجهات", icon: Radar },
  { id: "nav-inbox", title: "مركز القرار", hint: "اعتماد ورفض القرارات", href: "/inbox", group: "الوجهات", icon: Inbox },
  { id: "nav-ideas", title: "الأفكار", hint: "تقديم فكرة · دراسات الجدوى", href: "/ideas", group: "الوجهات", icon: Lightbulb },
  { id: "nav-office", title: "المكتب الحيّ", hint: "نبض الوكلاء الآن", href: "/office", group: "الوجهات", icon: Building2 },
  { id: "nav-operations", title: "التشغيل", hint: "تشغيل طلب شركة كامل", href: "/operations", group: "الوجهات", icon: Send },
  { id: "nav-status", title: "حالة النظام", hint: "التكاملات والجاهزية", href: "/status", group: "الوجهات", icon: Activity },
  { id: "nav-company", title: "الهيكل الإداري", hint: "الوكلاء والصلاحيات", href: "/company", group: "الوجهات", icon: Users },
  { id: "nav-dashboard", title: "لوحة CEO", hint: "المشاريع والمهام", href: "/dashboard", group: "الوجهات", icon: ShieldCheck },
  { id: "nav-bi", title: "مركز الذكاء BI", hint: "قرار اليوم والتحليلات", href: "/bi-center", group: "الوجهات", icon: BarChart3 },
  { id: "nav-sales", title: "نظام المبيعات", hint: "المتجر والمداخيل", href: "/sales", group: "الوجهات", icon: ShoppingBag },
  { id: "nav-finance", title: "المالية", hint: "القيود والفواتير", href: "/departments/finance", group: "الوجهات", icon: Calculator },
  { id: "nav-marketing", title: "التسويق", hint: "الحملات والقنوات", href: "/departments/marketing", group: "الوجهات", icon: Megaphone },
  { id: "nav-gov", title: "العلاقات الحكومية", hint: "التراخيص والمعاملات", href: "/departments/government-relations", group: "الوجهات", icon: Landmark },
];

/** Arabic-friendly match: strips diacritics/kashida and normalizes alef forms. */
export function normalizeArabic(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

function matches(entry: Entry, q: string): boolean {
  if (!q) return true;
  const needle = normalizeArabic(q);
  return normalizeArabic(`${entry.title} ${entry.hint}`).includes(needle);
}

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [live, setLive] = useState<Entry[]>([]);
  const loadedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(0);
    setTimeout(() => inputRef.current?.focus(), 30);
    if (loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      try {
        const [inbox, ideas] = await Promise.all([
          fetch("/api/inbox", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
          fetch("/api/company/ideas", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        ]);
        const entries: Entry[] = [];
        if (inbox?.ok) {
          for (const item of (inbox.items || []).filter((i: { status: string }) => i.status === "PENDING").slice(0, 8)) {
            entries.push({
              id: `inb-${item.id}`,
              title: item.title,
              hint: `${item.ageLabel || "معلّق"} · ${item.requestedBy || ""}`,
              href: "/inbox",
              group: "قرارات معلّقة",
              icon: Inbox,
              stale: Boolean(item.stale),
            });
          }
        }
        if (ideas?.ok) {
          for (const idea of (ideas.ideas || []).slice(0, 6)) {
            entries.push({
              id: `idea-${idea.id}`,
              title: idea.title,
              hint: idea.status === "PENDING_APPROVAL" ? "بانتظار الاعتماد" : idea.status === "APPROVED" ? "معتمدة" : "فكرة",
              href: "/ideas",
              group: "الأفكار",
              icon: Lightbulb,
            });
          }
        }
        setLive(entries);
      } catch {
        // Static destinations remain available if live data is temporarily unavailable.
      }
    })();
  }, [open]);

  const results = useMemo(() => {
    const all = [...DESTINATIONS, ...live].filter((e) => matches(e, query));
    return all.slice(0, 14);
  }, [query, live]);

  const go = useCallback(
    (entry: Entry) => {
      setOpen(false);
      router.push(entry.href);
    },
    [router]
  );

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && results[cursor]) {
      e.preventDefault();
      go(results[cursor]);
    }
  }

  let lastGroup = "";

  return (
    <>
      <button className="cmdk-trigger" onClick={() => setOpen(true)} aria-label="بحث سريع (Ctrl+K)">
        <Search size={15} />
        <span className="hide-mobile">بحث سريع</span>
        <kbd className="hide-mobile">⌘K</kbd>
      </button>

      {open && (
        <div className="cmdk-overlay" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label="لوحة الأوامر">
          <div className="cmdk-panel" onClick={(e) => e.stopPropagation()}>
            <div className="cmdk-input-row">
              <Search size={17} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor(0);
                }}
                onKeyDown={onInputKey}
                placeholder="ابحث عن صفحة أو قرار أو فكرة…"
                aria-label="بحث"
              />
              <kbd>Esc</kbd>
            </div>
            <div className="cmdk-list" role="listbox">
              {results.length === 0 && <div className="cmdk-empty">لا نتائج — جرّب كلمة أخرى.</div>}
              {results.map((entry, i) => {
                const Icon = entry.icon;
                const showGroup = entry.group !== lastGroup;
                lastGroup = entry.group;
                return (
                  <div key={entry.id}>
                    {showGroup && <div className="cmdk-group">{entry.group}</div>}
                    <button
                      className={`cmdk-item ${i === cursor ? "is-active" : ""} ${entry.stale ? "is-stale" : ""}`}
                      onClick={() => go(entry)}
                      onMouseEnter={() => setCursor(i)}
                      role="option"
                      aria-selected={i === cursor}
                    >
                      <Icon size={16} />
                      <span className="cmdk-item__title">{entry.title}</span>
                      <span className="cmdk-item__hint">
                        {entry.stale ? "متأخر ⏰ · " : ""}
                        {entry.hint}
                      </span>
                      {i === cursor && <CornerDownRight size={13} className="cmdk-enter" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
