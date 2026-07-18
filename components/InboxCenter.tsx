"use client";

import { useCallback, useEffect, useState } from "react";
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

export default function InboxCenter() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [forwardFor, setForwardFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [deferFor, setDeferFor] = useState<string | null>(null);
  const [minDeferDate, setMinDeferDate] = useState("");
  const [deferReason, setDeferReason] = useState("");
  const [deferDate, setDeferDate] = useState("");
  const [deferAssignee, setDeferAssignee] = useState("");
  const [deferError, setDeferError] = useState("");
  const [execMsg, setExecMsg] = useState<{ text: string; ok: boolean; href?: string } | null>(null);

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
          href: projectId ? `/operations?project=${encodeURIComponent(projectId)}#approved-projects` : undefined,
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
      setDeferFor(null);
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
      setNoteFor(null);
      setForwardFor(null);
      setNoteText("");
      setExecMsg({ text: "تم تسجيل القرار الإداري بنجاح.", ok: true });
      await load();
    } catch (error) {
      setExecMsg({ text: error instanceof Error ? error.message : "تعذر تسجيل القرار الإداري.", ok: false });
    } finally {
      setBusy(null);
    }
  }

  const visible = items.filter((i) => filter === "ALL" || i.channel === filter);
  const visiblePending = visible.filter((i) => i.status === "PENDING");
  const visibleDeferred = visible.filter((i) => i.status === "DEFERRED");
  const visibleDecided = visible.filter((i) => i.status !== "PENDING" && i.status !== "DEFERRED");

  return (
    <main className="page-wrap">
      <header className="page-head">
        <div>
          <span className="eyebrow"><Inbox size={16} /> مركز القرار</span>
          <h1 className="glow-title">صندوق القرارات الموحّد</h1>
          <p className="page-sub">كل ما ينتظر اعتمادك من كل الأقسام والأنظمة — في مكان واحد، بدورة قرار كاملة.</p>
        </div>
        <span className={`status-pill ${pending > 0 ? "running" : "done"}`}>{pending} بانتظار القرار</span>
      </header>

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

      {execMsg && (
        <div className={`notice inbox-execution-result ${execMsg.ok ? "done" : "warning"}`}>
          <span>{execMsg.ok ? "✅ " : "⚠️ "}{execMsg.text}</span>
          {execMsg.href && <Link className="secondary-btn btn-sm" href={execMsg.href}>فتح ملف المشروع <ExternalLink size={14} /></Link>}
        </div>
      )}

      {loading && (
        <div className="delivery-panel" style={{ padding: 24, textAlign: "center" }}>
          <Loader2 className="spin" size={24} style={{ color: "var(--muted)" }} />
        </div>
      )}

      {!loading && visiblePending.length === 0 && (
        <div className="empty-state" style={{ minHeight: 160 }}>
          <Inbox size={30} />
          <strong>لا توجد قرارات معلّقة</strong>
          <span>عند وصول طلب اعتماد من أي قسم أو صفقة تتجاوز الحد، تظهر هنا فوراً.</span>
        </div>
      )}

      <div className="inbox-list">
        {visiblePending.map((item) => (
          <article key={`${item.channel}-${item.id}`} className="bento-card inbox-item">
            <div className="inbox-item__head">
              <div>
                <strong>{item.title}</strong>
                <small className="inbox-item__meta">
                  {item.channel === "SYSTEM" ? "نظام/تداول" : "إداري"} · {item.type} · من: {item.requestedBy}
                  {item.ageLabel ? <> · {item.ageLabel}</> : null}
                  {item.stale ? <b style={{ color: "var(--red)" }}> · متأخر عن SLA ⏰</b> : null}
                </small>
              </div>
              {item.amount !== undefined && <b className="inbox-item__amount">{currency.format(item.amount)}</b>}
            </div>
            <p className="inbox-item__detail">{item.detail}</p>

            <div className="inbox-item__actions">
              {item.actionsVia === "approvals" ? (
                <>
                  <button className="primary-btn btn-sm" disabled={busy === item.id} onClick={() => decideSystem(item, "APPROVED")}>
                    {busy === item.id ? <Loader2 className="spin" size={14} /> : <Check size={14} />} اعتماد وتنفيذ
                  </button>
                  <button className="secondary-btn btn-sm danger-text" disabled={busy === item.id} onClick={() => decideSystem(item, "REJECTED")}>
                    <X size={14} /> رفض
                  </button>
                  <button
                    className="secondary-btn btn-sm"
                    disabled={busy === item.id}
                    onClick={() => {
                      setDeferFor(deferFor === item.id ? null : item.id);
                      setDeferError("");
                      setMinDeferDate(new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
                    }}
                  >
                    <Clock size={14} /> تأجيل
                  </button>
                </>
              ) : (
                <>
                  <button className="primary-btn btn-sm" disabled={busy === item.id} onClick={() => reviewCompany(item, "APPROVED")}>
                    {busy === item.id ? <Loader2 className="spin" size={14} /> : <Check size={14} />} اعتماد
                  </button>
                  <button className="secondary-btn btn-sm danger-text" disabled={busy === item.id} onClick={() => reviewCompany(item, "REJECTED")}>
                    <X size={14} /> رفض
                  </button>
                  <button className="secondary-btn btn-sm" onClick={() => { setNoteFor(noteFor === item.id ? null : item.id); setForwardFor(null); }}>
                    <MessageSquarePlus size={14} /> ملاحظة
                  </button>
                  <button className="secondary-btn btn-sm" onClick={() => { setForwardFor(forwardFor === item.id ? null : item.id); setNoteFor(null); }}>
                    <Share2 size={14} /> إحالة
                  </button>
                </>
              )}
            </div>

            {deferFor === item.id && (
              <div style={{ display: "grid", gap: 8, padding: "10px 0" }}>
                <input
                  className="input"
                  placeholder="سبب التأجيل (إلزامي)"
                  value={deferReason}
                  onChange={(e) => setDeferReason(e.target.value)}
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <label style={{ display: "grid", gap: 4, flex: 1, minWidth: 150 }}>
                    <small style={{ color: "var(--muted)" }}>تاريخ التذكير بالفكرة</small>
                    <input
                      className="input"
                      type="date"
                      min={minDeferDate}
                      value={deferDate}
                      onChange={(e) => setDeferDate(e.target.value)}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 4, flex: 1, minWidth: 170 }}>
                    <small style={{ color: "var(--muted)" }}>الموظف المسؤول عن التجهيز</small>
                    <select className="input" value={deferAssignee} onChange={(e) => setDeferAssignee(e.target.value)}>
                      <option value="">— بدون تعيين —</option>
                      {ASSIGNEES.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </label>
                </div>
                {deferError && <small style={{ color: "var(--red)" }}>{deferError}</small>}
                <button className="primary-btn btn-sm" disabled={busy === item.id} onClick={() => deferSystem(item)}>
                  {busy === item.id ? <Loader2 className="spin" size={14} /> : <Clock size={14} />} تأكيد التأجيل
                </button>
              </div>
            )}

            {noteFor === item.id && (
              <div className="memory-search-bar">
                <input
                  className="input"
                  placeholder="اكتب ملاحظتك..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && noteText.trim() && reviewCompany(item, "NOTED", { note: noteText.trim() })}
                />
                <button className="primary-btn" disabled={!noteText.trim() || busy === item.id} onClick={() => reviewCompany(item, "NOTED", { note: noteText.trim() })}>
                  حفظ
                </button>
              </div>
            )}

            {forwardFor === item.id && (
              <div className="memory-search-bar">
                <select className="input" defaultValue="" onChange={(e) => e.target.value && reviewCompany(item, "FORWARDED", { forwardedTo: e.target.value })}>
                  <option value="" disabled>اختر القسم المختص...</option>
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}
          </article>
        ))}
      </div>

      {visibleDeferred.length > 0 && (
        <section style={{ display: "grid", gap: 8 }}>
          <strong style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            <Clock size={14} style={{ verticalAlign: "-2px" }} /> المؤجلة ({visibleDeferred.length}) — تعود تلقائياً في موعد التذكير
          </strong>
          {visibleDeferred.map((item) => (
            <div key={`${item.channel}-${item.id}`} className="statement-row">
              <span>
                {item.title}
                {item.metadata?.deferral?.remindAt && (
                  <> · ⏰ {String(item.metadata.deferral.remindAt).slice(0, 10)}</>
                )}
                {item.metadata?.deferral?.assignedTo && (
                  <> · يجهّزها: {item.metadata.deferral.assignedTo}</>
                )}
                {item.metadata?.deferral?.reason && (
                  <small style={{ color: "var(--muted)", display: "block" }}>السبب: {item.metadata.deferral.reason}</small>
                )}
              </span>
              <span className="mini-pill medium">مؤجلة</span>
            </div>
          ))}
        </section>
      )}

      {visibleDecided.length > 0 && (
        <section style={{ display: "grid", gap: 8 }}>
          <strong style={{ color: "var(--muted)", fontSize: "0.9rem" }}>سجل القرارات ({visibleDecided.length})</strong>
          {visibleDecided.slice(0, 12).map((item) => (
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
        </section>
      )}
    </main>
  );
}
