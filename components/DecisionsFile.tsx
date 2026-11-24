"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CounterItem } from "@/lib/company/counterItems";

type Row = CounterItem & {
  group: "awaiting" | "chain" | "returned" | "decided"; approvalStatus: string; decidedAt: string | null; decisionNote: string | null;
  bestOption: { key: string; label: string; score: number; amountSAR: number } | null; optionsCount: number;
  project: { id: string; href: string } | null; fileHref: string;
};
const GROUPS: Array<{ key: Row["group"]; label: string; empty: string }> = [
  { key: "awaiting", label: "بانتظار قرارك", empty: "لا قرار ينتظرك الآن." },
  { key: "chain", label: "في سلسلة المراجعة", empty: "لا طلبات في المراجعة." },
  { key: "returned", label: "معادة للأقسام", empty: "لا شيء معاد." },
  { key: "decided", label: "صدر فيها قرارك", empty: "لا قرارات خلال 90 يوماً." },
];
const num = new Intl.NumberFormat("ar-SA-u-nu-latn");
const when = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", year: "numeric" });
const fmt = (iso?: string | null) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? when.format(d) : ""; };
const STATUS: Record<string, string> = { APPROVED: "معتمد", REJECTED: "مرفوض" };

/** The Chairman's decisions file: every spend request with its best option, its project, and a link to decide it. */
export default function DecisionsFile() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Row["group"]>("awaiting");
  useEffect(() => {
    fetch("/api/company/decisions-file", { cache: "no-store" }).then(async (res) => {
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر قراءة ملف القرارات.");
      setRows(json.decisions || []);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "تعذر قراءة ملف القرارات."));
  }, []);
  const counts = useMemo(() => Object.fromEntries(GROUPS.map((g) => [g.key, (rows || []).filter((r) => r.group === g.key).length])), [rows]);
  const shown = (rows || []).filter((r) => r.group === tab);
  const group = GROUPS.find((g) => g.key === tab)!;
  return <main className="ov-page" aria-labelledby="decisions-title">
    <header className="ov-head"><div><h1 id="decisions-title">ملف القرارات</h1><p>كل طلب صرف بتوصيات الأقسام، وخياراته بنسبة الأفضلية، ومشروعه. القرار لك وحدك.</p></div></header>
    {error ? <p className="ov-alert" role="alert">{error}</p> : null}
    {!rows && !error ? <p className="ov-empty" role="status">جارٍ القراءة…</p> : null}
    {rows ? <>
      <div className="ov-actions" role="tablist" aria-label="أقسام ملف القرارات">{GROUPS.map((g) => <button key={g.key} type="button" role="tab" aria-selected={tab === g.key} className={"ov-btn" + (tab === g.key ? " is-primary" : " is-quiet")} onClick={() => setTab(g.key)}>{g.label} ({num.format(counts[g.key] || 0)})</button>)}</div>
      <section className="ov-section" aria-label={group.label}>
        {shown.length ? <ul className="ov-list ov-drill-list">{shown.map((r) => <li key={r.id} className="ov-drill-item">
          <div className="ov-drill-top"><strong>{r.title.slice(0, 180)}</strong>{r.amountSAR ? <span className="ov-drill-amount">{num.format(r.amountSAR)} ر.س</span> : null}</div>
          <div className="ov-drill-meta">
            <span className="ov-tag">{r.group === "decided" ? STATUS[r.approvalStatus] || r.approvalStatus : r.status}</span>
            <span><b>المرحلة:</b> {r.stage}</span>
            {r.holderName && r.group !== "decided" ? <span><b>عند:</b> {r.holderName}</span> : null}
            {r.bestOption ? <span><b>الخيار الأفضل:</b> {r.bestOption.label.slice(0, 80)} ({num.format(r.bestOption.score)}%)</span> : null}
          </div>
          {r.group === "decided" && r.decisionNote ? <p className="ov-drill-reason"><b>قرارك:</b> {r.decisionNote.slice(0, 300)}</p> : r.reason ? <p className="ov-drill-reason"><b>السبب:</b> {r.reason}</p> : null}
          <div className="ov-drill-meta is-dates">
            {r.createdAt ? <span>أُنشئ {fmt(r.createdAt)}</span> : null}
            {r.decidedAt ? <span>القرار {fmt(r.decidedAt)}</span> : null}
            {r.project ? <Link href={r.project.href} className="ov-drill-link">المشروع</Link> : <span className="ov-muted">غير مرتبط بمشروع</span>}
            <Link href={r.fileHref} className="ov-drill-link">{r.group === "awaiting" ? "افتح وقرّر" : "فتح الملف"}</Link>
          </div>
        </li>)}</ul> : <p className="ov-empty">{group.empty}</p>}
      </section>
    </> : null}
  </main>;
}
