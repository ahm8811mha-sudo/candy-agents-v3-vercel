"use client";

import { useCallback, useEffect, useState } from "react";
import { X, ZoomIn, ZoomOut, RefreshCw } from "lucide-react";
import s from "./LiveOfficeFloor.module.css";

type Status = "working" | "waiting" | "blocked" | "idle";
type Item = { id: string; kind: string; title: string; status: string; amountSAR?: number | null; at?: string | null };
type Employee = {
  id: string; name: string; title: string; department: string; status: Status; current: Item | null;
  queue: Item[]; completed: Item[]; timeline: Array<{ id: string; title: string; kind: string; at: string }>;
  chain: Array<{ id: string; title: string; amountSAR: number | null; stageLabel: string; holder: string; stopped: boolean }>;
  lastActivityAt: string | null;
};
type Floor = {
  asOf: string; tasksAvailable: boolean;
  counters: { openCommands: number; inProgress: number; awaitingChairman: number; completedToday: number; alerts: number; returned: number };
  employees: Employee[];
  flows: Array<{ id: string; title: string; amountSAR: number | null; holder: string; path: string[]; stageLabel: string; count: number }>;
};

const POLL_MS = 12_000;
const W = 1200, H = 860;
// Floor plan: rooms (x, y, w, h) and which employees sit inside. Departments come from lib/company/agents.ts.
const ROOMS: Array<{ key: string; label: string; x: number; y: number; w: number; h: number; seats: string[]; meeting?: boolean }> = [
  { key: "board", label: "مكتب رئيس مجلس الإدارة", x: 40, y: 60, w: 260, h: 220, seats: ["owner"] },
  { key: "exec", label: "الإدارة التنفيذية", x: 330, y: 60, w: 260, h: 220, seats: ["sultan"] },
  { key: "diwan", label: "الديوان التنفيذي", x: 620, y: 60, w: 250, h: 220, seats: ["diwan"] },
  { key: "meeting", label: "قاعة الاجتماعات", x: 900, y: 60, w: 260, h: 220, seats: [], meeting: true },
  { key: "finance", label: "المالية والمحاسبة", x: 40, y: 340, w: 400, h: 220, seats: ["abdulrahman", "ameen"] },
  { key: "gov", label: "الحوكمة والمخاطر", x: 470, y: 340, w: 220, h: 220, seats: ["hares"] },
  { key: "ops", label: "العمليات", x: 720, y: 340, w: 210, h: 220, seats: ["fahad"] },
  { key: "proc", label: "المشتريات", x: 960, y: 340, w: 200, h: 220, seats: ["khalid"] },
  { key: "sales", label: "المبيعات", x: 40, y: 600, w: 260, h: 220, seats: ["sara"] },
  { key: "mkt", label: "التسويق", x: 330, y: 600, w: 260, h: 220, seats: ["noura"] },
  { key: "govrel", label: "العلاقات الحكومية", x: 620, y: 600, w: 250, h: 220, seats: ["majed"] },
  { key: "intel", label: "الاستخبارات والفرص", x: 900, y: 600, w: 260, h: 220, seats: ["rased"] },
];
const CORRIDORS = [{ y: 310, label: "القيادة ← التشغيل" }, { y: 580, label: "الإيرادات والنمو" }];
const STATUS_LABEL: Record<Status, string> = { working: "يعمل الآن", waiting: "بانتظار قرار", blocked: "متعطل", idle: "خامل" };
const num = new Intl.NumberFormat("ar-SA-u-nu-latn");
const money = (v?: number | null) => (v == null ? "" : `${num.format(v)} ر.س`);
const timeAgo = (iso?: string | null) => {
  if (!iso) return "لا نشاط مسجل";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "الآن"; if (m < 60) return `قبل ${m} د`;
  const h = Math.floor(m / 60); return h < 24 ? `قبل ${h} س` : `قبل ${Math.floor(h / 24)} يوم`;
};

function seatPositions() {
  const pos: Record<string, { x: number; y: number }> = {};
  for (const r of ROOMS) r.seats.forEach((id, i) => {
    const n = r.seats.length;
    pos[id] = { x: r.x + (r.w / (n + 1)) * (n - i), y: r.y + r.h * 0.62 };
  });
  return pos;
}

const pos = seatPositions();

export default function LiveOfficeFloor() {
  const [data, setData] = useState<Floor | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
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
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => { if (window.innerWidth < 760) setZoom(0.7); }, []);

  const byId = new Map((data?.employees || []).map((e) => [e.id, e]));
  const person = selected ? byId.get(selected) : undefined;

  // Each spend request in flight draws the hop into its current holder's desk.
  const hops = new Map<string, { from: string; to: string; count: number; title: string }>();
  for (const f of data?.flows || []) {
    const i = f.path.indexOf(f.holder);
    if (i <= 0) continue;
    const key = `${f.path[i - 1]}>${f.holder}`;
    const h = hops.get(key);
    if (h) h.count += f.count; else hops.set(key, { from: f.path[i - 1], to: f.holder, count: f.count, title: f.title });
  }

  const c = data?.counters;
  return (
    <section className={s.wrap} dir="rtl" aria-label="المكتب الحي">
      <header className={s.top}>
        <div className={s.brand}>
          <span className={s.live}><i />مباشر</span>
          <div><h1>المكتب الحي</h1><p>{data ? `آخر تحديث ${new Date(data.asOf).toLocaleTimeString("ar-SA-u-nu-latn", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · يتجدد كل ${POLL_MS / 1000} ث` : "جارٍ قراءة السجلات…"}</p></div>
        </div>
        <div className={s.counters}>
          {([["أوامر مفتوحة", c?.openCommands], ["قيد التنفيذ", c?.inProgress], ["بانتظار قرارك", c?.awaitingChairman, true], ["منجز اليوم", c?.completedToday], ["تنبيهات", c?.alerts]] as const).map(([label, v, hero]) => (
            <div key={label} className={hero ? s.hero : ""}><strong>{v == null ? "—" : num.format(v)}</strong><span>{label}</span></div>
          ))}
        </div>
      </header>
      {error ? <p className={s.error} role="alert">{error}{data ? " — المعروض آخر قراءة ناجحة." : ""}</p> : null}

      <div className={s.toolbar}>
        <ul className={s.legend}>{(Object.keys(STATUS_LABEL) as Status[]).map((k) => <li key={k}><i className={s[`dot_${k}`]} />{STATUS_LABEL[k]}</li>)}<li><i className={s.dot_doc} />طلب صرف يتنقل في السلسلة</li></ul>
        <div className={s.zoom}>
          <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))} aria-label="تصغير"><ZoomOut size={16} /></button>
          <span>{Math.round(zoom * 100)}٪</span>
          <button onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)))} aria-label="تكبير"><ZoomIn size={16} /></button>
          <button onClick={() => void load()} aria-label="تحديث" disabled={loading}><RefreshCw size={16} className={loading ? s.spin : ""} /></button>
        </div>
      </div>

      <div className={s.viewport}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W * zoom} height={H * zoom} className={s.floor} role="img" aria-label="مخطط المكتب">
          <defs>
            <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="rgba(148,163,184,.06)" /></pattern>
            <filter id="glow"><feGaussianBlur stdDeviation="3" /></filter>
          </defs>
          <rect width={W} height={H} fill="url(#grid)" />
          {CORRIDORS.map((k) => <g key={k.y}><line x1="40" x2="1160" y1={k.y + 15} y2={k.y + 15} className={s.corridor} /><text x="600" y={k.y + 9} className={s.corridorLabel}>{k.label}</text></g>)}
          {ROOMS.map((r) => (
            <g key={r.key}>
              <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="14" className={r.key === "board" ? `${s.room} ${s.roomBoard}` : s.room} />
              <rect x={r.x + r.w / 2 - 22} y={r.y + r.h - 2} width="44" height="4" className={s.door} />
              <text x={r.x + r.w - 16} y={r.y + 26} className={s.roomLabel}>{r.label}</text>
              {r.meeting ? <g>
                <rect x={r.x + 50} y={r.y + 80} width={r.w - 100} height="70" rx="35" className={s.table} />
                {Array.from({ length: 8 }).map((_, i) => <circle key={i} cx={r.x + 70 + (i % 4) * ((r.w - 140) / 3)} cy={i < 4 ? r.y + 68 : r.y + 162} r="8" className={s.chair} />)}
                <text x={r.x + r.w / 2} y={r.y + 200} className={s.muted}>لا يوجد اجتماع مسجّل الآن</text>
              </g> : null}
            </g>
          ))}
          {[...hops.values()].map((h) => {
            const a = pos[h.from], b = pos[h.to];
            if (!a || !b) return null;
            const d = `M${a.x},${a.y - 30} C${a.x},${(a.y + b.y) / 2} ${b.x},${(a.y + b.y) / 2} ${b.x},${b.y - 30}`;
            return <g key={`${h.from}-${h.to}`}>
              <path d={d} className={s.flow} />
              <g><rect x="-9" y="-11" width="18" height="22" rx="3" className={s.doc} /><path d="M-5 -5H5M-5 0H5M-5 5H2" className={s.docLines} />
                <animateMotion dur="3.2s" repeatCount="indefinite" path={d} /></g>
              <title>{`${h.count} طلب ينتقل إلى ${byId.get(h.to)?.name || h.to}: ${h.title}`}</title>
            </g>;
          })}
          {ROOMS.flatMap((r) => r.seats).map((id) => {
            const e = byId.get(id); const p = pos[id];
            if (!p) return null;
            const st: Status = e?.status || "idle";
            const bubble = e?.current?.title || (e ? "لا مهام مفتوحة" : "…");
            return (
              <g key={id} className={`${s.seat} ${s[`st_${st}`]}`} onClick={() => e && setSelected(id)} role="button" tabIndex={0} onKeyDown={(k) => k.key === "Enter" && e && setSelected(id)} aria-label={`${e?.name || id}: ${STATUS_LABEL[st]}`}>
                <rect x={p.x - 60} y={p.y + 8} width="120" height="44" rx="8" className={s.desk} />
                <rect x={p.x - 24} y={p.y + 14} width="48" height="26" rx="3" className={s.screen} />
                {st === "working" ? <rect x={p.x - 24} y={p.y + 14} width="48" height="26" rx="3" className={s.screenGlow} filter="url(#glow)" /> : null}
                <rect x={p.x - 6} y={p.y + 40} width="12" height="5" className={s.stand} />
                <circle cx={p.x} cy={p.y - 18} r="22" className={s.avatarRing} />
                <circle cx={p.x} cy={p.y - 18} r="18" className={s.avatar} />
                <text x={p.x} y={p.y - 12} className={s.initial}>{(e?.name || id).replace("ال", "").slice(0, 1)}</text>
                <circle cx={p.x + 15} cy={p.y - 33} r="6" className={s.badge} />
                {st === "working" ? <g className={s.typing}><circle cx={p.x - 8} cy={p.y + 58} r="2" /><circle cx={p.x} cy={p.y + 58} r="2" /><circle cx={p.x + 8} cy={p.y + 58} r="2" /></g> : null}
                <foreignObject x={p.x - 90} y={p.y - 104} width="180" height="56">
                  <div className={s.bubble} data-status={st}><span>{bubble}</span></div>
                </foreignObject>
                <foreignObject x={p.x - 80} y={p.y + 62} width="160" height="28">
                  <div className={s.nameTag}>{e?.name || id} · {e?.title.split(" ").slice(0, 2).join(" ") || ""}</div>
                </foreignObject>
              </g>
            );
          })}
        </svg>
      </div>

      {data && !data.tasksAvailable ? <p className={s.note}>جدول المهام غير متاح على هذه النسخة؛ الحالة مبنية على الأوامر وسلسلة الصرف فقط.</p> : null}
      {c?.returned ? <p className={s.note}>موقوف — أُعيد للأقسام: {num.format(c.returned)} طلب (لا ينتظر قرارك).</p> : null}

      {person ? (
        <aside className={s.panel} role="dialog" aria-label={`ملف ${person.name}`}>
          <button className={s.close} onClick={() => setSelected(null)} aria-label="إغلاق"><X size={18} /></button>
          <div className={s.panelHead}>
            <span className={`${s.bigAvatar} ${s[`st_${person.status}`]}`}>{person.name.replace("ال", "").slice(0, 1)}</span>
            <div><h2>{person.name}</h2><p>{person.title} · {person.department}</p><span className={s.pill} data-status={person.status}>{STATUS_LABEL[person.status]}</span> <small>{timeAgo(person.lastActivityAt)}</small></div>
          </div>
          <h3>يعمل الآن على</h3>
          <p className={s.current}>{person.current ? `${person.current.title}${person.current.amountSAR ? ` — ${money(person.current.amountSAR)}` : ""}` : "لا توجد مهمة مفتوحة — خامل."}</p>
          <PanelList title={`قائمة العمل المفتوحة (${person.queue.length})`} items={person.queue} empty="لا شيء في قائمته." />
          <h3>سلسلة الاعتماد التي يشارك فيها ({person.chain.length})</h3>
          {person.chain.length ? <ul className={s.list}>{person.chain.map((x) => <li key={x.id}><b>{x.title}</b><span>{money(x.amountSAR)} · {x.stageLabel} · لدى {byId.get(x.holder)?.name || x.holder}</span></li>)}</ul> : <p className={s.muted2}>لا يشارك في طلبات صرف مفتوحة.</p>}
          <PanelList title="أُنجز مؤخراً" items={person.completed} empty="لا يوجد إنجاز مسجل بعد." />
          <h3>سجل النشاط</h3>
          {person.timeline.length ? <ol className={s.timeline}>{person.timeline.map((t) => <li key={t.id}><b>{t.title}</b><span>{t.kind} · {timeAgo(t.at)}</span></li>)}</ol> : <p className={s.muted2}>لا أحداث مسجلة.</p>}
          <p className={s.readonly}>عرض فقط — القرارات تتم من مكتب القرار.</p>
        </aside>
      ) : null}
    </section>
  );
}

function PanelList({ title, items, empty }: { title: string; items: Item[]; empty: string }) {
  return <>
    <h3>{title}</h3>
    {items.length ? <ul className={s.list}>{items.map((x) => <li key={`${x.kind}-${x.id}`}><b>{x.title}</b><span>{x.status}{x.amountSAR ? ` · ${money(x.amountSAR)}` : ""}{x.at ? ` · ${timeAgo(x.at)}` : ""}</span></li>)}</ul> : <p className={s.muted2}>{empty}</p>}
  </>;
}
