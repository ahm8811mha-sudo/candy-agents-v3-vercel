"use client";

/**
 * The decision desk.
 *
 * The old screen was a scroll of equal-weight cards: every pending item shouted
 * the same, nothing said which one to open first, and the decided log was cut
 * at twelve rows for no reason. Deciding is the owner's actual job, so this is
 * built as a triage tool instead of a feed:
 *
 *  - a queue, ordered by what is late and what is expensive, with the money and
 *    the age visible on every row;
 *  - one decision open at a time, with its full context and its consequence
 *    spelled out before the button is pressed;
 *  - keyboard flow (A / R / D and the arrows) so a stack can be cleared without
 *    reaching for the mouse.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Inbox,
  Loader2,
  Check,
  X,
  MessageSquarePlus,
  Share2,
  CircleDollarSign,
  Building2,
  Filter,
  Clock,
  ExternalLink,
  Search,
  AlertTriangle,
  History,
} from "lucide-react";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import Link from "next/link";

type InboxItem = {
  id: string;
  channel: "SYSTEM" | "COMPANY";
  actionsVia: "approvals" | "decisions";
  type: string;
  title: string;
  detail: string;
  amount?: number;
  requestedBy: string;
  status: string;
  createdAt: string;
  ageLabel?: string;
  stale?: boolean;
  metadata?: {
    deferral?: { reason?: string; remindAt?: string; assignedTo?: string };
    [key: string]: unknown;
  };
};

const currency = new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 });

const DEPARTMENTS = ["دراسة الجدوى", "المالية", "التسويق", "المبيعات", "العمليات", "المشتريات", "المدير المالي", "التنفيذي"];

const statusMeta: Record<string, { label: string; pill: string }> = {
  PENDING: { label: "بانتظار قرارك", pill: "medium" },
  APPROVED: { label: "معتمد", pill: "done" },
  REJECTED: { label: "مرفوض", pill: "high" },
  DEFERRED: { label: "مؤجلة", pill: "medium" },
  NOTED: { label: "بها ملاحظة", pill: "medium" },
  FORWARDED: { label: "مُحالة", pill: "medium" },
};

const ASSIGNEES = [
  "سلطان — الرئيس التنفيذي",
  "المدير المالي",
  "مدير التسويق",
  "مدير العمليات",
  "مدير المشتريات",
  "مدير المبيعات",
];

type FilterKey = "ALL" | "SYSTEM" | "COMPANY";

/** Late first, then the largest sums: the order a person would triage in. */
function triageOrder(a: InboxItem, b: InboxItem) {
  if (Boolean(a.stale) !== Boolean(b.stale)) return a.stale ? -1 : 1;
  const amountGap = (b.amount || 0) - (a.amount || 0);
  if (amountGap !== 0) return amountGap;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

export default function InboxCenter() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "defer" | "note" | "forward">("none");
  const [noteText, setNoteText] = useState("");
  const [minDeferDate, setMinDeferDate] = useState("");
  const [deferReason, setDeferReason] = useState("");
  const [deferDate, setDeferDate] = useState("");
  const [deferAssignee, setDeferAssignee] = useState("");
  const [deferError, setDeferError] = useState("");
  const [showLog, setShowLog] = useState(false);
  const [execMsg, setExecMsg] = useState<{ text: string; ok: boolean; href?: string } | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تحميل الاعتمادات.");
      setItems(json.items || []);
      setPending(json.pending || 0);
    } catch (error) {
      setExecMsg({ text: error instanceof Error ? error.message : "تعذر تحميل الاعتمادات.", ok: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime-lite: refetch only when the company feed cursor changes.
  useLiveRefresh(load);

  const visible = useMemo(() => {
    const needle = query.trim();
    return items.filter((item) => {
      if (filter !== "ALL" && item.channel !== filter) return false;
      if (!needle) return true;
      return `${item.title} ${item.detail} ${item.requestedBy} ${item.type}`.includes(needle);
    });
  }, [items, filter, query]);

  const queue = useMemo(() => visible.filter((i) => i.status === "PENDING").sort(triageOrder), [visible]);
  const deferred = useMemo(() => visible.filter((i) => i.status === "DEFERRED"), [visible]);
  const decided = useMemo(() => visible.filter((i) => i.status !== "PENDING" && i.status !== "DEFERRED"), [visible]);

  const selected = useMemo(
    () => queue.find((i) => i.id === selectedId) || queue[0] || null,
    [queue, selectedId]
  );

  // Keep the open decision valid as the queue changes underneath it.
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
    if (!selected && selectedId) setSelectedId(null);
  }, [selected, selectedId]);

  useEffect(() => {
    setPanel("none");
    setDeferError("");
    setNoteText("");
  }, [selectedId]);

  const atStake = queue.reduce((sum, item) => sum + (item.amount || 0), 0);
  const lateCount = queue.filter((i) => i.stale).length;
  const oldest = queue.reduce<InboxItem | null>(
    (found, item) => (!found || new Date(item.createdAt) < new Date(found.createdAt) ? item : found),
    null
  );

  const move = useCallback(
    (step: 1 | -1) => {
      if (queue.length === 0) return;
      const index = queue.findIndex((i) => i.id === selected?.id);
      const next = queue[Math.min(queue.length - 1, Math.max(0, (index < 0 ? 0 : index) + step))];
      if (next) setSelectedId(next.id);
    },
    [queue, selected]
  );

  async function decideSystem(item: InboxItem, decision: "APPROVED" | "REJECTED") {
    setBusy(item.id);
    setExecMsg(null);
    try {
      const res = await fetch("/api/approvals/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, decision }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تسجيل قرار الاعتماد.");
      if (decision === "APPROVED") {
        const delivery = json.execution?.delivery;
        const projectId = delivery?.projectId || json.execution?.entityId;
        const completed = Number(delivery?.completed || 0);
        const total = Number(delivery?.total || 0);
        const attention = delivery?.status === "EXECUTION_ATTENTION";
        setExecMsg({
          text: attention
            ? `تم الاعتماد، لكن المشروع يحتاج متابعة تنفيذية (${completed}/${total} نتائج مكتملة).`
            : `تم الاعتماد وتشغيل الوكلاء. عادت ${completed} من ${total} نتائج إلى ملف المشروع.`,
          ok: !attention,
          href: projectId ? `/projects?project=${encodeURIComponent(projectId)}` : undefined,
        });
      } else {
        setExecMsg({ text: "تم رفض الطلب وتسجيل القرار.", ok: true });
      }
      await load();
    } catch (error) {
      setExecMsg({ text: error instanceof Error ? error.message : "تعذر تسجيل قرار الاعتماد.", ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function deferSystem(item: InboxItem) {
    if (!deferReason.trim() || !deferDate) {
      setDeferError("سبب التأجيل وتاريخ التذكير مطلوبان.");
      return;
    }
    setBusy(item.id);
    setDeferError("");
    try {
      const res = await fetch("/api/approvals/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          decision: "DEFERRED",
          note: deferReason.trim(),
          remindAt: new Date(`${deferDate}T09:00:00`).toISOString(),
          assignedTo: deferAssignee || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setDeferError(json.error || "تعذر تأجيل العنصر.");
        return;
      }
      setPanel("none");
      setDeferReason("");
      setDeferDate("");
      setDeferAssignee("");
      setExecMsg({ text: `تم التأجيل حتى ${deferDate}${deferAssignee ? ` — يتولى التجهيز: ${deferAssignee}` : ""}.`, ok: true });
      await load();
    } catch {
      setDeferError("تعذر تأجيل العنصر.");
    } finally {
      setBusy(null);
    }
  }

  async function reviewCompany(
    item: InboxItem,
    action: "APPROVED" | "REJECTED" | "NOTED" | "FORWARDED",
    extra: { note?: string; forwardedTo?: string } = {}
  ) {
    setBusy(item.id);
    try {
      const res = await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceType: "company-approval", sourceId: item.id, title: item.title, action, ...extra }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تسجيل القرار الإداري.");
      setPanel("none");
      setNoteText("");
      setExecMsg({ text: "تم تسجيل القرار الإداري بنجاح.", ok: true });
      await load();
    } catch (error) {
      setExecMsg({ text: error instanceof Error ? error.message : "تعذر تسجيل القرار الإداري.", ok: false });
    } finally {
      setBusy(null);
    }
  }

  function approve(item: InboxItem) {
    return item.actionsVia === "approvals" ? decideSystem(item, "APPROVED") : reviewCompany(item, "APPROVED");
  }

  function reject(item: InboxItem) {
    return item.actionsVia === "approvals" ? decideSystem(item, "REJECTED") : reviewCompany(item, "REJECTED");
  }

  function openDefer() {
    setPanel(panel === "defer" ? "none" : "defer");
    setDeferError("");
    setMinDeferDate(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  }

  // Keyboard triage. Ignored while typing, so the note and reason fields work.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!selected || busy) return;
      const key = event.key.toLowerCase();
      if (key === "arrowdown" || key === "j") { event.preventDefault(); move(1); }
      else if (key === "arrowup" || key === "k") { event.preventDefault(); move(-1); }
      else if (key === "a") { event.preventDefault(); void approve(selected); }
      else if (key === "r") { event.preventDefault(); void reject(selected); }
      else if (key === "d" && selected.actionsVia === "approvals") { event.preventDefault(); openDefer(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, busy, move, panel]);

  function select(item: InboxItem) {
    setSelectedId(item.id);
    // On a phone the detail sits under the queue; bring it into view.
    if (window.matchMedia("(max-width: 960px)").matches) {
      window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  return (
    <main className="page-wrap">
      <header className="page-head">
        <div>
          <span className="eyebrow"><Inbox size={16} /> مركز القرار</span>
          <h1>صندوق القرارات الموحّد</h1>
          <p className="page-sub">كل ما ينتظر اعتمادك من كل الأقسام والأنظمة، مرتّباً بالأهم: المتأخر أولاً، ثم الأعلى مبلغاً.</p>
        </div>
      </header>

      <div className="decide-summary">
        <div>
          <b>{pending}</b>
          <small>بانتظار قرارك</small>
        </div>
        <div className={lateCount ? "is-late" : ""}>
          <b>{lateCount}</b>
          <small>متأخر عن SLA</small>
        </div>
        <div className={atStake > 0 ? "" : "is-text"}>
          <b>{atStake > 0 ? currency.format(atStake) : "—"}</b>
          <small>المبلغ المرتبط بالقائمة</small>
        </div>
        <div className="is-text">
          <b>{oldest?.ageLabel || "—"}</b>
          <small>أقدم طلب ينتظر</small>
        </div>
      </div>

      <div className="decide-toolbar">
        <div className="section-tabs" role="tablist" aria-label="تصفية القرارات">
          {([
            { key: "ALL", label: "الكل", icon: Filter },
            { key: "SYSTEM", label: "التداول والنظام", icon: CircleDollarSign },
            { key: "COMPANY", label: "إدارية", icon: Building2 },
          ] as const).map((f) => {
            const Icon = f.icon;
            return (
              <button
                key={f.key}
                role="tab"
                aria-selected={filter === f.key}
                className={`section-tab ${filter === f.key ? "active" : ""}`}
                onClick={() => setFilter(f.key)}
              >
                <Icon size={15} /> {f.label}
              </button>
            );
          })}
        </div>
        <label className="decide-search">
          <Search size={15} aria-hidden />
          <input
            className="input"
            type="search"
            value={query}
            placeholder="ابحث في الطلبات…"
            aria-label="ابحث في الطلبات"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>

      {execMsg && (
        <div className={`notice inbox-execution-result ${execMsg.ok ? "done" : "error"}`}>
          <span>{execMsg.text}</span>
          {execMsg.href && <Link className="secondary-btn btn-sm" href={execMsg.href}>فتح ملف المشروع <ExternalLink size={14} /></Link>}
        </div>
      )}

      {loading && (
        <div className="delivery-panel" style={{ padding: 24, textAlign: "center" }}>
          <Loader2 className="spin" size={24} style={{ color: "var(--muted)" }} />
        </div>
      )}

      {!loading && queue.length === 0 && (
        <div className="empty-state" style={{ minHeight: 160 }}>
          <Inbox size={30} />
          <strong>لا توجد قرارات معلّقة</strong>
          <span>عند وصول طلب اعتماد من أي قسم أو صفقة تتجاوز الحد، يظهر هنا فوراً.</span>
        </div>
      )}

      {!loading && queue.length > 0 && (
        <div className="decide-desk">
          <div className="decide-queue" role="listbox" aria-label="قائمة القرارات">
            {queue.map((item) => (
              <button
                key={`${item.channel}-${item.id}`}
                role="option"
                aria-selected={selected?.id === item.id}
                className={`decide-row ${selected?.id === item.id ? "is-open" : ""}`}
                onClick={() => select(item)}
              >
                <span className="decide-row__top">
                  <b>{item.title}</b>
                  {item.amount !== undefined && <em>{currency.format(item.amount)}</em>}
                </span>
                <span className="decide-row__meta">
                  {item.channel === "SYSTEM" ? "نظام/تداول" : "إداري"} · {item.requestedBy}
                  {item.ageLabel ? ` · ${item.ageLabel}` : ""}
                </span>
                {item.stale && (
                  <span className="decide-row__late"><AlertTriangle size={13} /> متأخر عن SLA</span>
                )}
              </button>
            ))}
          </div>

          <div className="decide-detail" ref={detailRef}>
            {selected && (
              <article className="bento-card" style={{ gap: 14 }}>
                <div>
                  <span className="bento-kicker">
                    {selected.channel === "SYSTEM" ? "نظام/تداول" : "إداري"} · {selected.type} · من: {selected.requestedBy}
                  </span>
                  <h2 className="decide-detail__title">{selected.title}</h2>
                  <div className="decide-detail__facts">
                    {selected.amount !== undefined && (
                      <span><small>المبلغ</small><b>{currency.format(selected.amount)}</b></span>
                    )}
                    <span><small>عمر الطلب</small><b>{selected.ageLabel || "—"}</b></span>
                    <span><small>الحالة</small><b>{selected.stale ? "متأخر عن SLA" : "ضمن المهلة"}</b></span>
                  </div>
                </div>

                <p className="decide-detail__body">{selected.detail}</p>

                <p className="decide-consequence">
                  {selected.actionsVia === "approvals"
                    ? "الاعتماد هنا يشغّل الوكلاء وينشئ ملف مشروع بمهام قابلة للمتابعة. الخطوات ذات الأثر الفعلي تبقى بانتظار تأكيدك بعد التنفيذ."
                    : "الاعتماد هنا يسجّل قراراً إدارياً موثّقاً في سجل القرارات ويعيده إلى القسم صاحب الطلب."}
                </p>

                <div className="decide-actions">
                  {selected.actionsVia === "approvals" ? (
                    <>
                      <button className="primary-btn" disabled={busy === selected.id} onClick={() => decideSystem(selected, "APPROVED")}>
                        {busy === selected.id ? <Loader2 className="spin" size={15} /> : <Check size={15} />} اعتماد وتنفيذ
                      </button>
                      <button className="ghost-btn danger-text" disabled={busy === selected.id} onClick={() => decideSystem(selected, "REJECTED")}>
                        <X size={15} /> رفض
                      </button>
                      <button className="ghost-btn" disabled={busy === selected.id} onClick={() => openDefer()}>
                        <Clock size={15} /> تأجيل
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="primary-btn" disabled={busy === selected.id} onClick={() => reviewCompany(selected, "APPROVED")}>
                        {busy === selected.id ? <Loader2 className="spin" size={15} /> : <Check size={15} />} اعتماد
                      </button>
                      <button className="ghost-btn danger-text" disabled={busy === selected.id} onClick={() => reviewCompany(selected, "REJECTED")}>
                        <X size={15} /> رفض
                      </button>
                      <button className="ghost-btn" onClick={() => setPanel(panel === "note" ? "none" : "note")}>
                        <MessageSquarePlus size={15} /> ملاحظة
                      </button>
                      <button className="ghost-btn" onClick={() => setPanel(panel === "forward" ? "none" : "forward")}>
                        <Share2 size={15} /> إحالة
                      </button>
                    </>
                  )}
                </div>

                <p className="decide-keys">
                  اختصارات: <kbd>A</kbd> اعتماد · <kbd>R</kbd> رفض
                  {selected.actionsVia === "approvals" && <> · <kbd>D</kbd> تأجيل</>} · <kbd>↑</kbd><kbd>↓</kbd> تنقّل
                </p>

                {panel === "defer" && (
                  <div className="decide-panel">
                    <label>
                      سبب التأجيل (إلزامي)
                      <input className="input" value={deferReason} onChange={(e) => setDeferReason(e.target.value)} />
                    </label>
                    <div className="report-two-col">
                      <label>
                        تاريخ التذكير
                        <input className="input" type="date" min={minDeferDate} value={deferDate} onChange={(e) => setDeferDate(e.target.value)} />
                      </label>
                      <label>
                        الموظف المسؤول عن التجهيز
                        <select className="input" value={deferAssignee} onChange={(e) => setDeferAssignee(e.target.value)}>
                          <option value="">— بدون تعيين —</option>
                          {ASSIGNEES.map((name) => <option key={name} value={name}>{name}</option>)}
                        </select>
                      </label>
                    </div>
                    {deferError && <small className="decide-error">{deferError}</small>}
                    <button className="primary-btn btn-sm" disabled={busy === selected.id} onClick={() => deferSystem(selected)}>
                      {busy === selected.id ? <Loader2 className="spin" size={14} /> : <Clock size={14} />} تأكيد التأجيل
                    </button>
                  </div>
                )}

                {panel === "note" && (
                  <div className="decide-panel">
                    <label>
                      الملاحظة
                      <input
                        className="input"
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && noteText.trim() && reviewCompany(selected, "NOTED", { note: noteText.trim() })}
                      />
                    </label>
                    <button className="primary-btn btn-sm" disabled={!noteText.trim() || busy === selected.id} onClick={() => reviewCompany(selected, "NOTED", { note: noteText.trim() })}>
                      حفظ الملاحظة
                    </button>
                  </div>
                )}

                {panel === "forward" && (
                  <div className="decide-panel">
                    <label>
                      القسم المختص
                      <select className="input" defaultValue="" onChange={(e) => e.target.value && reviewCompany(selected, "FORWARDED", { forwardedTo: e.target.value })}>
                        <option value="" disabled>اختر القسم…</option>
                        {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </label>
                  </div>
                )}
              </article>
            )}
          </div>
        </div>
      )}

      {deferred.length > 0 && (
        <section className="decide-section">
          <h2 className="decide-section__title">
            <Clock size={15} /> المؤجلة ({deferred.length}): تعود تلقائياً في موعد التذكير
          </h2>
          {deferred.map((item) => (
            <div key={`${item.channel}-${item.id}`} className="statement-row">
              <span>
                {item.title}
                {item.metadata?.deferral?.remindAt && <> · ⏰ {String(item.metadata.deferral.remindAt).slice(0, 10)}</>}
                {item.metadata?.deferral?.assignedTo && <> · يجهّزها: {item.metadata.deferral.assignedTo}</>}
                {item.metadata?.deferral?.reason && (
                  <small style={{ color: "var(--muted)", display: "block" }}>السبب: {item.metadata.deferral.reason}</small>
                )}
              </span>
              <span className="mini-pill medium">مؤجلة</span>
            </div>
          ))}
        </section>
      )}

      {decided.length > 0 && (
        <section className="decide-section">
          <h2 className="decide-section__title"><History size={15} /> سجل القرارات ({decided.length})</h2>
          {(showLog ? decided : decided.slice(0, 8)).map((item) => (
            <div key={`${item.channel}-${item.id}`} className="statement-row">
              <span>
                {item.title}
                {item.amount !== undefined && <> · {currency.format(item.amount)}</>}
              </span>
              <span className={`mini-pill ${statusMeta[item.status]?.pill || ""}`}>
                {statusMeta[item.status]?.label || item.status}
              </span>
            </div>
          ))}
          {decided.length > 8 && (
            <button className="ghost-btn btn-sm" onClick={() => setShowLog((open) => !open)}>
              {showLog ? "عرض أقل" : `عرض السجل كاملاً (${decided.length})`}
            </button>
          )}
        </section>
      )}
    </main>
  );
}
