"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ShoppingBag,
  Loader2,
  Inbox,
  BadgeDollarSign,
  PencilRuler,
  ArrowLeft,
  CheckCircle2,
  Package,
} from "lucide-react";

type Product = { id: string; title: string; price: number; status: string; totalInventory: number };
type IncomeEntry = { id: string; amount: number; currency: string; orderCount: number; note: string; recognizedAt: string };
type SalesChange = { id: string; kind: string; target: string; detail: string; status: string };

type Console = {
  ok: boolean;
  shopName: string;
  source: "live" | "mock";
  currency: string;
  paidRevenue: number;
  pendingRevenue: number;
  pendingOrderCount: number;
  recognizedTotal: number;
  writeEnabled: boolean;
  ledger: IncomeEntry[];
  changes: SalesChange[];
  products: Product[];
};

const kindLabel: Record<string, string> = { PRICE: "تعديل سعر", STATUS: "تغيير حالة", DISCOUNT: "خصم" };
const changeStatusPill: Record<string, string> = { PENDING: "medium", APPLIED: "done", REJECTED: "high" };

export default function SalesConsole() {
  const [data, setData] = useState<Console | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const fmt = (n: number) =>
    new Intl.NumberFormat("ar-SA", { style: "currency", currency: data?.currency || "SAR", maximumFractionDigits: 0 }).format(n);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/company/sales", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setData(json);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function recognizeIncome() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/company/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recognize-income" }),
      });
      const json = await res.json();
      setMsg({ text: json.reason || (json.ok ? "تم" : json.error), ok: json.ok });
      await load();
    } catch {
      // silent
    } finally {
      setBusy(false);
    }
  }

  async function proposeChange(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/company/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "propose-change",
          kind: form.get("kind"),
          target: form.get("target"),
          detail: form.get("detail"),
        }),
      });
      const json = await res.json();
      setMsg({ text: json.reason || (json.ok ? "تم" : json.error), ok: json.ok });
      if (json.ok) (e.target as HTMLFormElement).reset();
      await load();
    } catch {
      // silent
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="page-wrap" style={{ placeItems: "center" }}>
        <Loader2 className="spin" size={26} style={{ color: "var(--muted)" }} />
      </main>
    );
  }
  if (!data) return null;

  return (
    <main className="page-wrap">
      <header className="page-head">
        <div>
          <span className="eyebrow"><ShoppingBag size={16} /> قسم المبيعات · سارة · منصة {data.shopName}</span>
          <h1 className="glow-title">نظام المبيعات المدمج</h1>
          <p className="page-sub">
            متجر Shopify كقسم داخل الشركة — الفريق يعدّل نظام البيع، والمداخيل تُعتمد وتُسجّل عبر مركز القرار حسب الحوكمة.
          </p>
        </div>
        <span className={`status-pill ${data.source === "live" ? "done" : "running"}`}>
          {data.source === "live" ? "متصل مباشرة" : "بيانات تجريبية"}
        </span>
      </header>

      {msg && (
        <p className={`notice ${msg.ok ? "done" : "error"}`}>{msg.ok ? "✅ " : "⚠️ "}{msg.text}</p>
      )}

      {/* Income recognition — the governed money flow */}
      <section className="bento-card bento-full bento-card--glow" style={{ gap: 12 }}>
        <span className="bento-kicker"><BadgeDollarSign size={15} /> اعتماد المداخيل</span>
        <div className="report-kpi-grid">
          <div className="kpi-card-inner">
            <small>مداخيل بانتظار الاعتماد</small>
            <strong style={{ color: data.pendingRevenue > 0 ? "var(--amber)" : "var(--muted)" }}>{fmt(data.pendingRevenue)}</strong>
          </div>
          <div className="kpi-card-inner">
            <small>مسجّلة في دفتر الشركة</small>
            <strong style={{ color: "var(--green)" }}>{fmt(data.recognizedTotal)}</strong>
          </div>
          <div className="kpi-card-inner">
            <small>إجمالي المبيعات المدفوعة</small>
            <strong>{fmt(data.paidRevenue)}</strong>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="primary-btn" onClick={recognizeIncome} disabled={busy || data.pendingRevenue <= 0}>
            {busy ? <Loader2 className="spin" size={16} /> : <BadgeDollarSign size={16} />}
            رفع {data.pendingOrderCount} طلب لاعتماد المداخيل
          </button>
          <Link className="secondary-btn" href="/inbox"><Inbox size={16} /> مركز القرار <ArrowLeft size={13} /></Link>
        </div>
        {data.ledger.length > 0 && (
          <div className="bento-list">
            {data.ledger.map((e) => (
              <div key={e.id} className="bento-list__row">
                <span><CheckCircle2 size={13} style={{ color: "var(--green)", verticalAlign: "middle" }} /> {e.note} · {e.orderCount} طلب</span>
                <b style={{ color: "var(--green)" }}>{fmt(e.amount)}</b>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Store change request */}
      <section className="report-two-col">
        <div className="bento-card" style={{ gap: 12 }}>
          <span className="bento-kicker"><PencilRuler size={15} /> طلب تعديل على نظام البيع</span>
          <form onSubmit={proposeChange} style={{ display: "grid", gap: 10 }}>
            <div className="report-two-col" style={{ gap: 10 }}>
              <label>
                نوع التعديل
                <select className="input" name="kind" defaultValue="PRICE">
                  <option value="PRICE">تعديل سعر</option>
                  <option value="STATUS">تغيير حالة منتج</option>
                  <option value="DISCOUNT">خصم</option>
                </select>
              </label>
              <label>
                المنتج / الهدف
                <input className="input" name="target" required placeholder="مثال: حقيبة جلد فاخرة" />
              </label>
            </div>
            <label>
              تفاصيل التعديل
              <textarea className="textarea compact" name="detail" required placeholder="مثال: خفض السعر 10% لمدة أسبوع لاختبار الطلب" />
            </label>
            <button className="primary-btn" disabled={busy} style={{ width: "fit-content" }}>
              {busy ? <Loader2 className="spin" size={16} /> : <PencilRuler size={16} />} رفع الطلب للاعتماد
            </button>
            {!data.writeEnabled && (
              <small style={{ color: "var(--muted)" }}>
                التطبيق الفعلي على المتجر يتطلب <code>SHOPIFY_WRITE_ENABLED</code> — حالياً يُعتمد ويُسجّل (محاكاة).
              </small>
            )}
          </form>
          {data.changes.length > 0 && (
            <div className="bento-list">
              {data.changes.map((c) => (
                <div key={c.id} className="bento-list__row">
                  <span><b style={{ color: "var(--text-strong)" }}>{kindLabel[c.kind] || c.kind}</b> — {c.target}<br /><small>{c.detail}</small></span>
                  <span className={`mini-pill ${changeStatusPill[c.status] || ""}`}>{c.status === "APPLIED" ? "طُبِّق" : c.status === "REJECTED" ? "مرفوض" : "بانتظار"}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bento-card" style={{ gap: 10 }}>
          <span className="bento-kicker"><Package size={15} /> منتجات المتجر ({data.products.length})</span>
          <div className="bento-list">
            {data.products.map((p) => (
              <div key={p.id} className="bento-list__row">
                <span>{p.title}<br /><small>{fmt(p.price)} · {p.status}</small></span>
                <b style={{ color: p.totalInventory <= 5 ? "var(--amber)" : "var(--text-strong)" }}>{p.totalInventory} قطعة</b>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
