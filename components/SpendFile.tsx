"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CounterItemRow } from "./CounterDrilldown";
import type { CounterItem } from "@/lib/company/counterItems";

type File = {
  item: CounterItem; detail: string; approvalStatus: string; preparedBy: string;
  memo: { options: string; expectedReturn: string; risks: string } | null;
  reviews: Array<{ stage: string; stageName: string; result: string; note: string; by: string; byName: string; at: string }>;
  archived: { reason: string; at: string } | null;
};
const when = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmt = (iso?: string) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? when.format(d) : ""; };

/** Read-only file of one spend request. Decisions stay in the decision desk. */
export default function SpendFile({ id }: { id: string }) {
  const [data, setData] = useState<File | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/company/spend/${encodeURIComponent(id)}`, { cache: "no-store" }).then(async (res) => {
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر قراءة الطلب.");
      setData(json);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "تعذر قراءة الطلب."));
  }, [id]);
  return <main className="ov-page" aria-labelledby="spend-title">
    <header className="ov-head"><div><h1 id="spend-title">ملف طلب صرف</h1><p>للاطلاع فقط. أي قرار يتم من مكتبك، ولا صرف بدون اعتمادك.</p></div>
      <div className="ov-actions"><Link className="ov-btn is-quiet" href="/">مكتبي</Link><Link className="ov-btn is-quiet" href="/office">المكتب الحي</Link></div></header>
    {error ? <p className="ov-alert" role="alert">{error}</p> : null}
    {!data && !error ? <p className="ov-empty" role="status">جارٍ القراءة…</p> : null}
    {data ? <>
      <section className="ov-section"><ul className="ov-list"><CounterItemRow item={{ ...data.item, href: `/spend/${encodeURIComponent(data.item.id)}` }} /></ul>
        <p className="ov-muted" style={{ marginTop: 8 }}>رقم الطلب: <bdi>{data.item.id}</bdi>{data.preparedBy ? ` · أعدّه: ${data.preparedBy}` : ""}{data.archived ? ` · مؤرشف ${fmt(data.archived.at)}: ${data.archived.reason}` : ""}</p>
        {data.detail ? <p style={{ fontSize: 13, lineHeight: 1.9, whiteSpace: "pre-wrap" }}>{data.detail.slice(0, 2000)}</p> : null}
      </section>
      {data.memo && (data.memo.options || data.memo.expectedReturn || data.memo.risks) ? <section className="ov-section"><h2>مذكرة القسم</h2><dl className="command-facts">
        {data.memo.options ? <div><dt>الخيارات</dt><dd>{data.memo.options}</dd></div> : null}
        {data.memo.expectedReturn ? <div><dt>العائد المتوقع</dt><dd>{data.memo.expectedReturn}</dd></div> : null}
        {data.memo.risks ? <div><dt>المخاطر</dt><dd>{data.memo.risks}</dd></div> : null}
      </dl></section> : null}
      <section className="ov-section"><h2>المراجعات</h2>
        {data.reviews.length ? <ul className="ov-list">{data.reviews.map((r) => <li key={r.stage + r.at}><strong>{r.stageName}: {r.result}</strong><span>{r.note}</span><small className="ov-muted">{r.byName} · {fmt(r.at)}</small></li>)}</ul> : <p className="ov-empty">لم تُسجّل مراجعة بعد. الطلب ما زال عند القسم.</p>}
      </section>
    </> : null}
  </main>;
}
