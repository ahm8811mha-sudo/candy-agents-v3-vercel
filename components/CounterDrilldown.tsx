"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { CounterItem } from "@/lib/company/counterItems";

export type DrillCounter = { key: string; label: string; items: CounterItem[]; hint?: string; empty?: string; total?: number };

const num = new Intl.NumberFormat("ar-SA-u-nu-latn");
const when = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmt = (iso?: string | null) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? when.format(d) : ""; };
const KIND: Record<CounterItem["kind"], string> = { command: "أمر", spend: "طلب صرف", returned: "طلب صرف معاد", decision: "قرار", task: "مهمة", project: "مشروع", idea: "فكرة" };

/** One record behind a counter: what it is, where it sits, who holds it, why, and when. */
export function CounterItemRow({ item, hideLink }: { item: CounterItem; hideLink?: boolean }) {
  return <li className="ov-drill-item">
    <div className="ov-drill-top">
      <strong>{item.title.slice(0, 180)}{item.duplicateCount > 1 ? ` (مكرر ×${num.format(item.duplicateCount)})` : ""}</strong>
      {item.amountSAR ? <span className="ov-drill-amount">{num.format(item.amountSAR)} ر.س</span> : null}
    </div>
    <div className="ov-drill-meta">
      <span className="ov-tag">{KIND[item.kind]}</span>
      <span><b>المرحلة:</b> {item.stage}</span>
      {item.holderName ? <span><b>عند:</b> {item.holderName}</span> : null}
      {item.status && item.status !== item.stage ? <span><b>الحالة:</b> {item.status}</span> : null}
    </div>
    {item.reason ? <p className="ov-drill-reason"><b>السبب:</b> {item.reason}</p> : null}
    <div className="ov-drill-meta is-dates">
      {item.createdAt ? <span>أُنشئ {fmt(item.createdAt)}</span> : null}
      {item.updatedAt && item.updatedAt !== item.createdAt ? <span>آخر تحديث {fmt(item.updatedAt)}</span> : null}
      {item.dueAt ? <span>{item.kind === "returned" ? "يُؤرشف" : "الموعد"} {fmt(item.dueAt)}</span> : null}
      {hideLink ? null : <Link href={item.href} className="ov-drill-link">فتح الملف</Link>}
    </div>
  </li>;
}

export function CounterItemList({ items, empty, total }: { items: CounterItem[]; empty?: string; total?: number }) {
  if (!items.length) return <p className="ov-empty">{empty || "لا عناصر في هذا العدّاد الآن."}</p>;
  return <>
    <ul className="ov-list ov-drill-list">{items.map((item) => <CounterItemRow key={item.kind + item.id} item={item} />)}</ul>
    {total && total > items.length ? <p className="ov-muted" style={{ marginTop: 8 }}>تُعرض {num.format(items.length)} من {num.format(total)}.</p> : null}
  </>;
}

/**
 * A row of counters. Each one is a button: pressing it opens the list of the
 * exact records it counts underneath the row (full width, works on a phone).
 */
export default function CounterDrilldown({ counters, label, extra, compact }: { counters: DrillCounter[]; label: string; extra?: ReactNode; compact?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const base = useId();
  const active = counters.find((c) => c.key === open) || null;
  return <div className={"ov-drill" + (compact ? " is-compact" : "")}>
    <div className="ov-counters" role="group" aria-label={label}>
      {extra}
      {counters.map((c) => {
        const value = c.total ?? c.items.length;
        return <button key={c.key} type="button" className="ov-counter-btn" aria-expanded={open === c.key} aria-controls={`${base}-${c.key}`} onClick={() => setOpen(open === c.key ? null : c.key)}>
          <strong>{num.format(value)}</strong><span>{c.label}</span>
          <ChevronDown size={14} aria-hidden className="ov-counter-chevron" />
        </button>;
      })}
    </div>
    {active ? <section id={`${base}-${active.key}`} className="ov-drill-panel" aria-label={`${active.label}: القائمة`}>
      <header><h3>{active.label} <small>({num.format(active.total ?? active.items.length)})</small></h3><button type="button" className="ov-btn is-quiet" onClick={() => setOpen(null)}>إغلاق</button></header>
      {active.hint ? <p className="ov-muted" style={{ margin: "0 0 8px" }}>{active.hint}</p> : null}
      <CounterItemList items={active.items} empty={active.empty} total={active.total} />
    </section> : null}
  </div>;
}
