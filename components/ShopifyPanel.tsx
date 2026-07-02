"use client";

import { useEffect, useState } from "react";
import { ShoppingBag, Loader2, Package, AlertTriangle, TrendingUp } from "lucide-react";

type Product = { id: string; title: string; status: string; totalInventory: number; price: number; vendor: string };
type Order = { id: string; name: string; totalPrice: number; financialStatus: string; fulfillmentStatus: string; createdAt: string };
type Snapshot = {
  ok: boolean;
  configured: boolean;
  source: "live" | "mock";
  shopName: string;
  products: Product[];
  orders: Order[];
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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/shopify");
        const json = await res.json();
        if (json.ok) setData(json);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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

  return (
    <div className="delivery-panel fade-in" style={{ display: "grid", gap: 16 }}>
      <div className="delivery-header">
        <div>
          <span className="eyebrow"><ShoppingBag size={16} /> متجر إلكتروني</span>
          <h2>{data.shopName}</h2>
        </div>
        <span className={`status-pill ${data.source === "live" ? "done" : "running"}`}>
          {data.source === "live" ? "متصل مباشرة" : "بيانات تجريبية"}
        </span>
      </div>

      {data.source === "mock" && (
        <p className="notice" style={{ color: "var(--muted)" }}>
          أضف <code>SHOPIFY_STORE_DOMAIN</code> و <code>SHOPIFY_ACCESS_TOKEN</code> لعرض بيانات متجرك الحقيقي.
        </p>
      )}

      <div className="finance-summary">
        <div className="metric-card green">
          <small>إجمالي المبيعات</small>
          <strong>{fmt(data.summary.totalRevenue)}</strong>
        </div>
        <div className="metric-card">
          <small>عدد الطلبات</small>
          <strong>{data.summary.orderCount}</strong>
        </div>
        <div className="metric-card">
          <small>متوسط قيمة الطلب</small>
          <strong>{fmt(data.summary.averageOrderValue)}</strong>
        </div>
      </div>

      <div className="report-two-col">
        <div className="report-section-box">
          <div className="report-section-header">
            <Package size={18} style={{ color: "var(--primary)" }} />
            <strong>المنتجات ({data.products.length})</strong>
            {data.summary.lowStockCount > 0 && (
              <span className="mini-pill high" style={{ marginInlineStart: "auto" }}>
                <AlertTriangle size={12} /> {data.summary.lowStockCount} منخفض المخزون
              </span>
            )}
          </div>
          <div className="memory-list">
            {data.products.slice(0, 6).map((p) => (
              <div key={p.id} className="statement-row">
                <span>
                  {p.title}
                  <br />
                  <small style={{ color: "var(--muted)" }}>{p.vendor} · {fmt(p.price)}</small>
                </span>
                <b style={{ color: p.totalInventory <= 5 ? "var(--amber)" : "var(--green)" }}>
                  {p.totalInventory} قطعة
                </b>
              </div>
            ))}
          </div>
        </div>

        <div className="report-section-box">
          <div className="report-section-header">
            <TrendingUp size={18} style={{ color: "var(--green)" }} />
            <strong>أحدث الطلبات</strong>
            {data.summary.unfulfilledCount > 0 && (
              <span className="mini-pill medium" style={{ marginInlineStart: "auto" }}>
                {data.summary.unfulfilledCount} بانتظار الشحن
              </span>
            )}
          </div>
          <div className="memory-list">
            {data.orders.slice(0, 6).map((o) => (
              <div key={o.id} className="statement-row">
                <span>
                  {o.name}
                  <br />
                  <small style={{ color: "var(--muted)" }}>
                    {o.fulfillmentStatus === "fulfilled" ? "تم الشحن" : "بانتظار الشحن"}
                  </small>
                </span>
                <b style={{ color: o.financialStatus === "paid" ? "var(--green)" : "var(--amber)" }}>
                  {fmt(o.totalPrice)}
                </b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
