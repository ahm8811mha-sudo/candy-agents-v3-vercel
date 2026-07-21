"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ShoppingBag, Loader2, Package, AlertTriangle, TrendingUp, Plus, Trash2, RefreshCcw, Warehouse, Link2 } from "lucide-react";

type Product = { id: string; title: string; status: string; totalInventory: number; price: number; vendor: string };
type Order = { id: string; name: string; totalPrice: number; financialStatus: string; fulfillmentStatus: string; createdAt: string };
type WarehouseItem = {
  id: string;
  sku: string;
  name: string;
  unitCost: number;
  targetPrice: number;
  onHand: number;
  reorderPoint: number;
  status: string;
  shopifyProductId: string | null;
  source: string;
};
type Snapshot = {
  ok: boolean;
  configured: boolean;
  writeEnabled: boolean;
  source: "live" | "mock";
  shopName: string;
  products: Product[];
  orders: Order[];
  warehouse: WarehouseItem[];
  summary: {
    totalRevenue: number;
    orderCount: number;
    averageOrderValue: number;
    unfulfilledCount: number;
    lowStockCount: number;
    currency: string;
  };
};

export default function ShopifyPanel() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/shopify", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setData(json);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function act(payload: Record<string, unknown>, okMessage: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/shopify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.reason || json.error || "تعذّر تنفيذ العملية.");
      setMessage(okMessage);
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تنفيذ العملية.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const ok = await act(
      {
        action: "create",
        title: String(form.get("title") || "").trim(),
        sku: String(form.get("sku") || "").trim() || undefined,
        unitCost: Number(form.get("unitCost") || 0),
        targetPrice: Number(form.get("targetPrice") || 0),
        onHand: Number(form.get("onHand") || 0),
        vendor: String(form.get("vendor") || "").trim() || undefined,
      },
      "أُضيف المنتج ووُصل بالمتجر والمخزون وسُجّل كأصل في المحاسبة."
    );
    if (ok) formEl.reset();
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat("ar-SA", { style: "currency", currency: data?.summary.currency || "SAR", maximumFractionDigits: 0 }).format(n);

  if (loading) {
    return (
      <div className="delivery-panel" style={{ padding: 24, textAlign: "center" }}>
        <Loader2 className="spin" size={24} style={{ color: "var(--muted)" }} />
      </div>
    );
  }
  if (!data) return null;

  const warehouse = data.warehouse || [];

  return (
    <div className="delivery-panel fade-in" style={{ display: "grid", gap: 16 }}>
      <div className="delivery-header">
        <div>
          <span className="eyebrow"><ShoppingBag size={16} /> متجر إلكتروني مربوط</span>
          <h2>{data.shopName}</h2>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className={`status-pill ${data.source === "live" ? "done" : "running"}`}>
            {data.source === "live" ? "متصل مباشرة" : "بيانات تجريبية"}
          </span>
          <button className="secondary-btn btn-sm" onClick={() => void load()} disabled={busy}><RefreshCcw size={14} /> تحديث</button>
        </div>
      </div>

      {data.source === "mock" && (
        <p className="notice" style={{ color: "var(--muted)" }}>
          أضف <code>SHOPIFY_STORE_DOMAIN</code> و <code>SHOPIFY_ACCESS_TOKEN</code> (و<code>SHOPIFY_WRITE_ENABLED=true</code> للكتابة) لربط متجرك الحقيقي.
        </p>
      )}
      {error && <p className="notice error">{error}</p>}
      {message && <p className="notice done">{message}</p>}

      <div className="finance-summary">
        <div className="metric-card green"><small>إجمالي المبيعات</small><strong>{fmt(data.summary.totalRevenue)}</strong></div>
        <div className="metric-card"><small>عدد الطلبات</small><strong>{data.summary.orderCount}</strong></div>
        <div className="metric-card"><small>في المستودع</small><strong>{warehouse.length}</strong></div>
      </div>

      {/* Add a product: one action lands the store + warehouse + books */}
      <div className="report-section-box">
        <div className="report-section-header">
          <Plus size={18} style={{ color: "var(--primary)" }} />
          <strong>إضافة منتج جديد</strong>
          <span className="mini-pill" style={{ marginInlineStart: "auto" }}><Link2 size={12} /> متجر + مستودع + محاسبة</span>
        </div>
        <form onSubmit={submitCreate} style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10 }}>
            <input className="field" name="title" required placeholder="اسم المنتج" />
            <input className="field" name="sku" placeholder="SKU (اختياري)" />
            <input className="field" name="vendor" placeholder="المورّد / العلامة" />
            <input className="field" name="unitCost" type="number" min="0" step="0.01" placeholder="تكلفة الوحدة (ر.س)" />
            <input className="field" name="targetPrice" type="number" min="0" step="0.01" placeholder="سعر البيع (ر.س)" />
            <input className="field" name="onHand" type="number" min="0" step="1" placeholder="الكمية الافتتاحية" />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="primary-btn btn-sm" disabled={busy}>{busy ? <Loader2 className="spin" size={14} /> : <Plus size={14} />} إضافة وربط</button>
            {data.configured && (
              <button type="button" className="secondary-btn btn-sm" disabled={busy} onClick={() => void act({ action: "pull" }, "تمت مزامنة منتجات المتجر إلى المستودع.")}>
                <RefreshCcw size={14} /> سحب منتجات المتجر
              </button>
            )}
            {data.writeEnabled && (
              <button type="button" className="secondary-btn btn-sm" disabled={busy} onClick={() => void act({ action: "registerWebhooks" }, "سُجّلت webhooks المتجر — التغييرات ستصل تلقائياً.")}>
                <Link2 size={14} /> تفعيل المزامنة التلقائية
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="report-two-col">
        {/* Warehouse: the synced source of truth */}
        <div className="report-section-box">
          <div className="report-section-header">
            <Warehouse size={18} style={{ color: "var(--primary)" }} />
            <strong>المستودع ({warehouse.length})</strong>
          </div>
          <div className="memory-list">
            {warehouse.length === 0 ? (
              <p style={{ color: "var(--muted)", padding: "8px 0" }}>لا توجد منتجات في المستودع بعد — أضف منتجاً بالأعلى.</p>
            ) : warehouse.slice(0, 8).map((it) => (
              <div key={it.id} className="statement-row">
                <span>
                  {it.name}
                  <br />
                  <small style={{ color: "var(--muted)" }}>
                    {it.sku} · {fmt(it.targetPrice)}
                    {it.shopifyProductId ? " · مربوط بالمتجر" : " · محلي فقط"}
                  </small>
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <b style={{ color: it.onHand <= it.reorderPoint ? "var(--amber)" : "var(--green)" }}>{it.onHand}</b>
                  <button
                    type="button"
                    title="أرشفة المنتج (حذف من المتجر مع حفظ التاريخ المحاسبي)"
                    disabled={busy}
                    onClick={() => { if (confirm(`أرشفة «${it.name}»؟ سيُحذف من المتجر ويبقى تاريخه المحاسبي.`)) void act({ action: "delete", sku: it.sku }, "أُرشف المنتج وأُزيل من المتجر."); }}
                    style={{ color: "var(--red)", background: "none", border: "none", cursor: "pointer", padding: 4 }}
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Store products (from Shopify) */}
        <div className="report-section-box">
          <div className="report-section-header">
            <Package size={18} style={{ color: "var(--green)" }} />
            <strong>منتجات المتجر ({data.products.length})</strong>
            {data.summary.lowStockCount > 0 && (
              <span className="mini-pill high" style={{ marginInlineStart: "auto" }}>
                <AlertTriangle size={12} /> {data.summary.lowStockCount} منخفض المخزون
              </span>
            )}
          </div>
          <div className="memory-list">
            {data.products.slice(0, 8).map((p) => (
              <div key={p.id} className="statement-row">
                <span>{p.title}<br /><small style={{ color: "var(--muted)" }}>{p.vendor} · {fmt(p.price)}</small></span>
                <b style={{ color: p.totalInventory <= 5 ? "var(--amber)" : "var(--green)" }}>{p.totalInventory} قطعة</b>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="report-section-box">
        <div className="report-section-header">
          <TrendingUp size={18} style={{ color: "var(--green)" }} />
          <strong>أحدث الطلبات</strong>
          {data.summary.unfulfilledCount > 0 && (
            <span className="mini-pill medium" style={{ marginInlineStart: "auto" }}>{data.summary.unfulfilledCount} بانتظار الشحن</span>
          )}
        </div>
        <div className="memory-list">
          {data.orders.slice(0, 6).map((o) => (
            <div key={o.id} className="statement-row">
              <span>{o.name}<br /><small style={{ color: "var(--muted)" }}>{o.fulfillmentStatus === "fulfilled" ? "تم الشحن" : "بانتظار الشحن"}</small></span>
              <b style={{ color: o.financialStatus === "paid" ? "var(--green)" : "var(--amber)" }}>{fmt(o.totalPrice)}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
