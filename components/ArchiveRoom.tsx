"use client";

import { useEffect, useState } from "react";

type Data = {
  archived: Array<{ id: string; title: string; amountSAR: number | null; reason: string; mergedInto: string | null; at: string }>;
  decided: Array<{ id: string; title: string; amountSAR: number | null; status: string; at: string }>;
  closed: Array<{ id: string; subject: string; owner: string; closedAt: string; result: string | null }>;
};
const when = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", year: "numeric" });
const fmt = (iso?: string) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? when.format(d) : ""; };
const num = new Intl.NumberFormat("ar-SA-u-nu-latn");
const money = (v: number | null) => (v ? ` · ${num.format(v)} ر.س` : "");
const TABS = [["closed", "أوامر مغلقة"], ["decided", "قرارات صدرت"], ["archived", "مؤرشف"]] as const;

export default function ArchiveRoom() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("closed");
  const [query, setQuery] = useState("");
  useEffect(() => {
    fetch("/api/company/archive", { cache: "no-store" }).then(async (res) => {
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر قراءة الأرشيف.");
      setData(json);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "تعذر قراءة الأرشيف."));
  }, []);
  const q = query.trim();
  const match = (text: string) => !q || text.includes(q);
  return <main className="ov-page" aria-labelledby="archive-title">
    <header className="ov-head"><div><h1 id="archive-title">الأرشيف</h1><p>كل ما أُغلق أو صدر قراره أو أُرشف. لا يُحذف شيء؛ المكرر يُدمج في أصله ويبقى مقروءاً.</p></div>
      <input className="ov-note" style={{ minHeight: 0, maxWidth: 280 }} aria-label="بحث في الأرشيف" placeholder="بحث" value={query} onChange={(e) => setQuery(e.target.value)} /></header>
    {error ? <p className="ov-alert" role="alert">{error}</p> : null}
    <div className="ov-actions" role="tablist" aria-label="أقسام الأرشيف" style={{ marginBottom: 12 }}>
      {TABS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={"ov-btn" + (tab === key ? " is-primary" : "")} onClick={() => setTab(key)}>{label}{data ? ` (${num.format(data[key].length)})` : ""}</button>)}
    </div>
    <section className="ov-section" role="tabpanel">
      {!data && !error ? <p className="ov-empty" role="status">جارٍ القراءة…</p> : null}
      {data && tab === "closed" ? (data.closed.filter((c) => match(c.subject)).length ? <ul className="ov-list">{data.closed.filter((c) => match(c.subject)).map((c) => <li key={c.id}><strong>{c.subject}</strong><span className="ov-muted">{c.owner} · أُغلق {fmt(c.closedAt)}</span>{c.result ? <span>{c.result.slice(0, 280)}</span> : null}</li>)}</ul> : <p className="ov-empty">لا أوامر مغلقة.</p>) : null}
      {data && tab === "decided" ? (data.decided.filter((d) => match(d.title)).length ? <ul className="ov-list">{data.decided.filter((d) => match(d.title)).map((d) => <li key={d.id}><strong>{d.title}</strong><span className="ov-muted"><span className={"ov-tag " + (d.status === "APPROVED" ? "is-green" : "is-red")}>{d.status === "APPROVED" ? "معتمد" : "مرفوض"}</span>{money(d.amountSAR)} · {fmt(d.at)}</span></li>)}</ul> : <p className="ov-empty">لا قرارات صادرة.</p>) : null}
      {data && tab === "archived" ? (data.archived.filter((a) => match(a.title)).length ? <ul className="ov-list">{data.archived.filter((a) => match(a.title)).map((a) => <li key={a.id}><strong>{a.title}</strong><span className="ov-muted">{a.reason}{money(a.amountSAR)} · {fmt(a.at)}{a.mergedInto ? ` · الأصل: ${a.mergedInto}` : ""}</span></li>)}</ul> : <p className="ov-empty">لا عناصر مؤرشفة.</p>) : null}
    </section>
  </main>;
}
