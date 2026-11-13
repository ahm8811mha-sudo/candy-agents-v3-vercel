"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Minutes = { id: string; title: string; attendees?: string[] | null; decisions?: string | null; created_at?: string };
type CalendarEvent = { id: string; title?: string; starts_at?: string; location?: string | null };
type Data = { available: boolean; daily: { at: string; agenda: Array<{ id: string; question: string; owner: string }>; waiting: number; overdue: number }; minutes: Minutes[]; events: CalendarEvent[] };

const when = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmt = (iso?: string) => { const d = iso ? new Date(iso) : null; return d && !Number.isNaN(d.getTime()) ? when.format(d) : ""; };
const num = new Intl.NumberFormat("ar-SA-u-nu-latn");

export default function MeetingsRoom() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [decisions, setDecisions] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/company/meetings", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر قراءة الاجتماعات.");
      setData(json); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر قراءة الاجتماعات."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function record(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setSaved("");
    try {
      const res = await fetch("/api/company/meetings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, decisions }) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر حفظ المحضر.");
      setTitle(""); setDecisions(""); setSaved("حُفظ المحضر في سجل الشركة."); void load();
    } catch (cause) { setSaved(cause instanceof Error ? cause.message : "تعذر حفظ المحضر."); }
    finally { setSaving(false); }
  }
  return <main className="ov-page" aria-labelledby="meetings-title">
    <header className="ov-head"><div><h1 id="meetings-title">الاجتماعات</h1><p>اجتماع القرار اليومي، والمحاضر المسجلة، والمواعيد القادمة.</p></div></header>
    {error ? <p className="ov-alert" role="alert">{error}</p> : null}
    <div className="ov-grid2">
      <div>
        <section className="ov-section"><h2>اجتماع القرار اليومي <small>{data ? fmt(data.daily.at) : ""}</small></h2>
          {data ? data.daily.agenda.length ? <ol className="ov-list">{data.daily.agenda.map((item) => <li key={item.id}><strong>{item.question}</strong><span className="ov-muted">المسؤول: {item.owner}</span></li>)}</ol> : <p className="ov-empty">لا بنود على جدول الليلة.</p> : <p className="ov-empty" role="status">جارٍ القراءة…</p>}
          {data ? <p className="ov-muted">{data.daily.waiting ? `${num.format(data.daily.waiting)} بند ينتظر الجلسة التالية. ` : ""}{num.format(data.daily.overdue)} أمر متأخر يُعرض دائماً. <Link href="/">افتح مكتب القرار</Link></p> : null}
        </section>
        <section className="ov-section"><h2>المحاضر <small>{data ? num.format(data.minutes.length) : ""}</small></h2>
          {data && !data.available ? <p className="ov-empty">سجل المحاضر غير متاح في هذه النسخة.</p> : null}
          {data?.minutes.length ? <ul className="ov-list">{data.minutes.map((m) => <li key={m.id}><strong>{m.title}</strong><span>{m.decisions}</span><span className="ov-muted">{fmt(m.created_at)}{m.attendees?.length ? ` · ${m.attendees.join("، ")}` : ""}</span></li>)}</ul> : data?.available ? <p className="ov-empty">لا محاضر مسجلة بعد.</p> : null}
        </section>
      </div>
      <div>
        <section className="ov-section"><h2>تسجيل محضر</h2>
          <form onSubmit={record} aria-label="تسجيل محضر اجتماع" style={{ display: "grid", gap: 8 }}>
            <label className="ov-muted" htmlFor="m-title">عنوان الاجتماع</label>
            <input id="m-title" className="ov-note" style={{ minHeight: 0 }} value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} />
            <label className="ov-muted" htmlFor="m-dec">القرارات والملاحظات</label>
            <textarea id="m-dec" className="ov-note" value={decisions} onChange={(e) => setDecisions(e.target.value)} />
            <button className="ov-btn is-primary" type="submit" disabled={saving || title.trim().length < 3}>{saving ? "جارٍ الحفظ" : "حفظ المحضر"}</button>
            {saved ? <p className="ov-muted" role="status">{saved}</p> : null}
          </form>
        </section>
        <section className="ov-section"><h2>مواعيد قادمة</h2>
          {data?.events.length ? <ul className="ov-list">{data.events.map((e) => <li key={e.id}><strong>{e.title || "موعد"}</strong><span className="ov-muted">{fmt(e.starts_at)}{e.location ? ` · ${e.location}` : ""}</span></li>)}</ul> : <p className="ov-empty">لا مواعيد مسجلة.</p>}
        </section>
      </div>
    </div>
  </main>;
}
