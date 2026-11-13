"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";

type Status = "working" | "waiting" | "blocked" | "idle";
type Item = { id: string; kind: string; title: string; status: string; amountSAR?: number | null; at?: string | null };
type Employee = {
  id: string; name: string; title: string; department: string; sector?: string; status: Status; current: Item | null;
  queue: Item[]; completed: Item[]; timeline: Array<{ id: string; title: string; kind: string; at: string }>;
  chain: Array<{ id: string; title: string; amountSAR: number | null; stageLabel: string; holder: string; stopped: boolean }>;
  kpis?: { open: number; overdue: number; doneWeek: number; returned: number };
  lastActivityAt: string | null;
};
type Floor = {
  asOf: string; tasksAvailable: boolean;
  counters: { openCommands: number; inProgress: number; awaitingChairman: number; completedToday: number; alerts: number; returned: number };
  employees: Employee[];
  desk?: { cards: number; waiting: number; digestAt: string };
  flows: Array<{ id: string; title: string; amountSAR: number | null; holder: string; path: string[]; stageLabel: string; count: number }>;
};

const POLL_MS = 12_000;
/** Rooms of the office. Each sector has its own room; the board and Hares sit apart. */
export const OFFICE_ROOMS: Array<{ key: string; label: string; seats: string[]; wide?: boolean; tone?: "board" | "governance"; note?: string }> = [
  { key: "board", label: "مكتب رئيس مجلس الإدارة", seats: ["owner"], tone: "board", note: "القرار والصرف لرئيس المجلس وحده." },
  { key: "governance", label: "المخاطر والحوكمة (مستقل)", seats: ["hares"], tone: "governance", note: "يرفع لرئيس المجلس مباشرة." },
  { key: "meeting", label: "قاعة الاجتماعات", seats: [] },
  { key: "executive", label: "الإدارة التنفيذية", seats: ["sultan", "diwan", "rased"], wide: true },
  { key: "finance", label: "قطاع المالية", seats: ["abdulrahman", "ameen"], wide: true },
  { key: "operations", label: "قطاع العمليات والإمداد", seats: ["fahad", "khalid"] },
  { key: "revenue", label: "قطاع الإيرادات", seats: ["sara", "noura"] },
  { key: "compliance", label: "قطاع الامتثال والعلاقات الحكومية", seats: ["majed"] },
];
const STATUS_LABEL: Record<Status, string> = { working: "يعمل الآن", waiting: "بانتظار قرار", blocked: "متعطل أو معاد", idle: "لا عمل مفتوح" };
const num = new Intl.NumberFormat("ar-SA-u-nu-latn");
const clock = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" });
const money = (v?: number | null) => (v == null ? "" : `${num.format(v)} ر.س`);
const timeAgo = (iso?: string | null) => {
  if (!iso) return "لا نشاط مسجل";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "الآن"; if (m < 60) return `قبل ${m} د`;
  const h = Math.floor(m / 60); return h < 24 ? `قبل ${h} س` : `قبل ${Math.floor(h / 24)} يوم`;
};

function Desk({ person, selected, onSelect }: { person: Employee; selected: boolean; onSelect: () => void }) {
  return <button type="button" className="ov-deskbtn" aria-pressed={selected} onClick={onSelect} aria-label={`${person.name}، ${STATUS_LABEL[person.status]}`}>
    <span className="ov-person"><span className="ov-avatar" aria-hidden>{person.name.slice(0, 1)}</span><span><strong>{person.name}</strong><small>{person.title}</small></span></span>
    <span className="ov-doing">{person.current ? person.current.title : "لا عمل مفتوح الآن."}</span>
    <span className="ov-desk-meta"><span className={"ov-dot " + person.status} aria-hidden /> {STATUS_LABEL[person.status]} · {num.format(person.kpis?.open ?? person.queue.length)} مفتوح</span>
  </button>;
}

function Panel({ person }: { person: Employee | undefined }) {
  if (!person) return <section className="ov-section ov-panel"><h2>اختر مكتباً</h2><p className="ov-empty">اضغط على أي موظف لترى ما يعمل عليه الآن، وطابوره، وما أنجزه.</p></section>;
  return <section className="ov-section ov-panel" aria-live="polite">
    <h2><span className="ov-avatar" aria-hidden>{person.name.slice(0, 1)}</span><span>{person.name}<small style={{ display: "block" }}>{person.title} · {person.department}</small></span></h2>
    <div className="ov-counters">
      <div><strong>{num.format(person.kpis?.open ?? person.queue.length)}</strong><span>مفتوح</span></div>
      <div><strong>{num.format(person.kpis?.overdue ?? 0)}</strong><span>متأخر</span></div>
      <div><strong>{num.format(person.kpis?.doneWeek ?? 0)}</strong><span>أُنجز هذا الأسبوع</span></div>
      <div><strong>{num.format(person.kpis?.returned ?? 0)}</strong><span>معاد للتصحيح</span></div>
    </div>
    <h3 style={{ fontSize: 13.5, margin: "0 0 8px" }}>يعمل عليه الآن</h3>
    {person.queue.length ? <ul className="ov-list">{person.queue.slice(0, 10).map((item) => <li key={item.kind + item.id}><strong>{item.title.slice(0, 140)}</strong><span className="ov-muted">{item.status}{item.amountSAR ? ` · ${money(item.amountSAR)}` : ""}{item.at ? ` · ${timeAgo(item.at)}` : ""}</span>{item.kind === "command" ? <Link className="ov-muted" href={`/commands#${item.id}`}>بطاقة المتابعة</Link> : null}</li>)}</ul> : <p className="ov-empty">لا عمل مفتوح.</p>}
    <h3 style={{ fontSize: 13.5, margin: "14px 0 8px" }}>أُنجز مؤخراً</h3>
    {person.completed.length ? <ul className="ov-list">{person.completed.slice(0, 5).map((item) => <li key={item.kind + item.id}><strong>{item.title.slice(0, 120)}</strong><span className="ov-muted">{item.status}{item.at ? ` · ${timeAgo(item.at)}` : ""}</span></li>)}</ul> : <p className="ov-empty">لا إنجاز مسجل بعد.</p>}
    <p className="ov-muted" style={{ marginTop: 10 }}>آخر نشاط: {timeAgo(person.lastActivityAt)}</p>
  </section>;
}

export default function LiveOfficeFloor({ room }: { room?: string }) {
  const [data, setData] = useState<Floor | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/company/office", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر قراءة المكتب");
      setData(json); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر قراءة المكتب"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);
  const byId = useMemo(() => new Map((data?.employees || []).map((e) => [e.id, e])), [data]);
  const rooms = room ? OFFICE_ROOMS.filter((r) => r.key === room) : OFFICE_ROOMS;
  const roomInfo = room ? OFFICE_ROOMS.find((r) => r.key === room) : null;
  const staff = (data?.employees || []).filter((e) => e.id !== "owner");
  const selectedPerson = selected ? byId.get(selected) : roomInfo ? byId.get(roomInfo.seats[0]) : undefined;

  return <main className="ov-page" aria-labelledby="office-title">
    <header className="ov-head">
      <div><h1 id="office-title">{roomInfo ? roomInfo.label : "المكتب الحي"}</h1><p>{roomInfo ? "غرفة القطاع: من يعمل، وعلى ماذا، وما الذي أُعيد للتصحيح." : `كل موظف على مكتبه، وما يعمل عليه الآن من سجلات الشركة الفعلية. ${num.format(staff.length)} موظفاً.`}</p></div>
      <div className="ov-actions"><span className="ov-live"><i aria-hidden /> مباشر{data ? ` · ${clock.format(new Date(data.asOf))}` : ""}</span><button type="button" className="ov-btn" onClick={() => void load()} disabled={loading}><RefreshCw size={14} /> تحديث</button>{roomInfo ? <Link className="ov-btn is-quiet" href="/office">كل المكتب</Link> : null}</div>
    </header>
    {error ? <p className="ov-alert" role="alert">{error}</p> : null}
    {data ? <div className="ov-counters" aria-label="حالة الشركة">
      <Link href="/"><strong>{num.format(data.desk?.cards ?? data.counters.awaitingChairman)}</strong><span>بطاقة قرار لك</span></Link>
      <div><strong>{num.format(data.counters.openCommands)}</strong><span>أمر مفتوح</span></div>
      <div><strong>{num.format(data.counters.inProgress)}</strong><span>قيد التنفيذ</span></div>
      <div><strong>{num.format(data.counters.returned)}</strong><span>معاد للأقسام</span></div>
      <div><strong>{num.format(data.counters.alerts)}</strong><span>متعطل أو متأخر</span></div>
      <div><strong>{num.format(data.counters.completedToday)}</strong><span>أُنجز اليوم</span></div>
    </div> : !error ? <p className="ov-empty" role="status">جارٍ فتح المكتب…</p> : null}
    <ul className="ov-legend" aria-label="دليل الحالات">{(Object.keys(STATUS_LABEL) as Status[]).map((k) => <li key={k}><span className={"ov-dot " + k} aria-hidden />{STATUS_LABEL[k]}</li>)}</ul>
    <div className="ov-grid2">
      <div className="ov-floor">
        {rooms.map((r) => <section key={r.key} className={"ov-room" + (r.wide || room ? " is-wide" : "") + (r.tone ? ` is-${r.tone}` : "")} style={room ? { gridColumn: "span 12" } : undefined} aria-label={r.label}>
          <header><h3>{r.label}</h3>{r.key !== "board" && r.key !== "meeting" && !room ? <Link href={`/office/${r.key}`}>الغرفة</Link> : r.key === "meeting" ? <Link href="/meetings">الاجتماعات</Link> : null}</header>
          {r.note ? <p className="ov-muted" style={{ margin: 0 }}>{r.note}</p> : null}
          {r.key === "meeting" ? <p className="ov-muted" style={{ margin: 0 }}>اجتماع القرار اليومي الساعة 20:00 بتوقيت الرياض{data?.desk ? `: ${num.format(data.desk.cards)} بطاقة على الجدول` : ""}.</p> : null}
          {r.key === "board" && byId.get("owner") ? <p style={{ margin: 0, fontSize: 13 }}><span className={"ov-dot " + byId.get("owner")!.status} aria-hidden /> {byId.get("owner")!.queue.length ? `${num.format(byId.get("owner")!.queue.length)} عنصر بانتظارك` : "لا شيء ينتظرك"} · <Link href="/">مكتبي</Link></p> : null}
          {r.key !== "board" && r.seats.length ? <div className="ov-desks">{r.seats.map((id) => byId.get(id)).filter((p): p is Employee => Boolean(p)).map((p) => <Desk key={p.id} person={p} selected={selectedPerson?.id === p.id} onSelect={() => setSelected(p.id)} />)}</div> : null}
        </section>)}
        {data && data.flows.length ? <section className="ov-room is-wide" style={{ gridColumn: "span 12" }} aria-label="طلبات الصرف في السلسلة">
          <header><h3>طلبات الصرف في السلسلة</h3><span className="ov-muted">القسم، عبدالرحمن وحارس، سلطان، ثم رئيس المجلس</span></header>
          <ul className="ov-list">{data.flows.slice(0, 8).map((f) => <li key={f.id}><strong>{f.title}{f.count > 1 ? ` (×${f.count})` : ""}</strong><span className="ov-muted">{money(f.amountSAR)} · {f.stageLabel} · عند {byId.get(f.holder)?.name || f.holder}</span></li>)}</ul>
        </section> : null}
      </div>
      <Panel person={selectedPerson} />
    </div>
  </main>;
}
