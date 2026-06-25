"use client";

import { FormEvent, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, Boxes, Building2, Loader2, PackagePlus, Plus, RefreshCw, Truck } from "lucide-react";
import Link from "next/link";

type ProcurementData = {
  suppliers: Array<{ id: string; name: string; category: string; rating: number; status: string }>;
  purchaseOrders: Array<{ id: string; po_number: string; title: string; status: string; total: number; expected_delivery?: string }>;
  items: Array<{ id: string; sku: string; name: string; category: string; unit_cost: number; target_price: number; on_hand: number; reorder_point: number; status: string }>;
  movements: Array<{ id: string; movement_type: string; quantity: number; unit_cost: number; note?: string }>;
  metrics: { suppliers: number; items: number; lowStock: number; inventoryValue: number; expectedMargin: number; openOrders: number; openOrderValue: number };
  policy: string[];
};

const empty: ProcurementData = {
  suppliers: [],
  purchaseOrders: [],
  items: [],
  movements: [],
  metrics: { suppliers: 0, items: 0, lowStock: 0, inventoryValue: 0, expectedMargin: 0, openOrders: 0, openOrderValue: 0 },
  policy: [],
};

const currency = new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 });

export default function ProcurementInventoryConsole() {
  const [data, setData] = useState<ProcurementData>(empty);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/procurement-inventory", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تحميل المشتريات والمخزون.");
      setData({ ...empty, ...json });
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل المشتريات والمخزون.");
    } finally {
      setLoading(false);
    }
  }

  async function run(action: string, payload?: Record<string, unknown>) {
    setWorking(action);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/procurement-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data: payload }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تنفيذ أمر المشتريات.");
      setMessage(messageFor(action));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تنفيذ أمر المشتريات.");
    } finally {
      setWorking("");
    }
  }

  function submitSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run("supplier", {
      name: String(form.get("name") || ""),
      category: String(form.get("category") || "general"),
      contactName: String(form.get("contactName") || ""),
      phone: String(form.get("phone") || ""),
      rating: Number(form.get("rating") || 3),
    }).then(() => event.currentTarget.reset());
  }

  function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run("item", {
      sku: String(form.get("sku") || ""),
      name: String(form.get("name") || ""),
      category: String(form.get("category") || "commerce"),
      unitCost: Number(form.get("unitCost") || 0),
      targetPrice: Number(form.get("targetPrice") || 0),
      onHand: Number(form.get("onHand") || 0),
      reorderPoint: Number(form.get("reorderPoint") || 5),
    }).then(() => event.currentTarget.reset());
  }

  function submitPo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run("po", {
      supplierId: String(form.get("supplierId") || ""),
      title: String(form.get("title") || ""),
      total: Number(form.get("total") || 0),
      items: [{ item: String(form.get("item") || "مخزون"), total: Number(form.get("total") || 0) }],
    }).then(() => event.currentTarget.reset());
  }

  function submitMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run("movement", {
      itemId: String(form.get("itemId") || ""),
      movementType: String(form.get("movementType") || "IN"),
      quantity: Number(form.get("quantity") || 0),
      note: String(form.get("note") || ""),
    }).then(() => event.currentTarget.reset());
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="company-app ops-console">
      <section className="department-hero department-hero-live">
        <div>
          <Link className="back-link" href="/">
            <ArrowRight size={16} /> العودة للشركة
          </Link>
          <span className="eyebrow"><Truck size={16} /> المشتريات والمخزون</span>
          <h1>نظام موردين ومخزون للشركة التجارية</h1>
          <p>إدارة الموردين، أوامر الشراء، الأصناف، تكلفة الوحدة، الهامش، وحدود إعادة الطلب.</p>
          <div className="department-hero-actions">
            <span>قيمة المخزون {currency.format(data.metrics.inventoryValue)}</span>
            <span>أصناف تحت الحد {data.metrics.lowStock}</span>
          </div>
        </div>
        <div className="department-badge"><strong>Procurement OS</strong><small>Inventory ready</small></div>
      </section>

      <section className="enterprise-actions">
        <button className="secondary-btn" onClick={load} disabled={loading}>{loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />} تحديث</button>
        <button className="primary-btn" onClick={() => run("seed")} disabled={Boolean(working)}>{working === "seed" ? <Loader2 className="spin" size={18} /> : <Plus size={18} />} تهيئة الإدارة</button>
        {message && <p className="notice done">{message}</p>}
        {error && <p className="notice error">{error}</p>}
      </section>

      <section className="ops-metrics">
        <Metric label="الموردين" value={data.metrics.suppliers} />
        <Metric label="الأصناف" value={data.metrics.items} />
        <Metric label="مخزون منخفض" value={data.metrics.lowStock} />
        <Metric label="قيمة المخزون" value={currency.format(data.metrics.inventoryValue)} />
        <Metric label="هامش متوقع" value={currency.format(data.metrics.expectedMargin)} />
        <Metric label="أوامر مفتوحة" value={data.metrics.openOrders} />
      </section>

      <section className="ops-workbench">
        <form className="ops-card" onSubmit={submitSupplier}>
          <h2>مورد جديد</h2>
          <div className="ops-form-grid">
            <label>الاسم<input className="input" name="name" required /></label>
            <label>التصنيف<input className="input" name="category" defaultValue="commerce" /></label>
            <label>المسؤول<input className="input" name="contactName" /></label>
            <label>الجوال<input className="input" name="phone" /></label>
            <label>التقييم<input className="input" name="rating" type="number" min="1" max="5" defaultValue="3" /></label>
          </div>
          <button className="secondary-btn" disabled={Boolean(working)}>حفظ المورد</button>
        </form>

        <form className="ops-card" onSubmit={submitItem}>
          <h2>صنف مخزون</h2>
          <div className="ops-form-grid">
            <label>SKU<input className="input" name="sku" required /></label>
            <label>الاسم<input className="input" name="name" required /></label>
            <label>التصنيف<input className="input" name="category" defaultValue="commerce" /></label>
            <label>تكلفة الوحدة<input className="input" name="unitCost" type="number" min="0" /></label>
            <label>سعر البيع<input className="input" name="targetPrice" type="number" min="0" /></label>
            <label>المتوفر<input className="input" name="onHand" type="number" min="0" /></label>
            <label>حد إعادة الطلب<input className="input" name="reorderPoint" type="number" min="0" defaultValue="5" /></label>
          </div>
          <button className="primary-btn" disabled={Boolean(working)}><PackagePlus size={18} /> حفظ الصنف</button>
        </form>

        <form className="ops-card" onSubmit={submitPo}>
          <h2>أمر شراء</h2>
          <label>المورد<select className="input" name="supplierId" defaultValue=""><option value="">بدون مورد</option>{data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>العنوان<input className="input" name="title" required /></label>
          <label>البند<input className="input" name="item" placeholder="منتج / مخزون" /></label>
          <label>الإجمالي<input className="input" name="total" type="number" min="0" /></label>
          <button className="secondary-btn" disabled={Boolean(working)}>حفظ أمر الشراء</button>
        </form>

        <form className="ops-card" onSubmit={submitMovement}>
          <h2>حركة مخزون</h2>
          <label>الصنف<select className="input" name="itemId" required>{data.items.map((item) => <option key={item.id} value={item.id}>{item.sku} - {item.name}</option>)}</select></label>
          <label>النوع<select className="input" name="movementType"><option value="IN">إدخال</option><option value="OUT">إخراج</option><option value="ADJUSTMENT">تسوية</option></select></label>
          <label>الكمية<input className="input" name="quantity" type="number" min="1" required /></label>
          <label>ملاحظة<input className="input" name="note" /></label>
          <button className="secondary-btn" disabled={Boolean(working)}><Boxes size={18} /> تسجيل الحركة</button>
        </form>
      </section>

      <section className="ops-board">
        <Panel title="الأصناف">
          {data.items.slice(0, 10).map((item) => (
            <Statement key={item.id} label={`${item.sku} - ${item.name}`} value={`${item.on_hand} متوفر · حد ${item.reorder_point} · هامش ${currency.format(Number(item.target_price) - Number(item.unit_cost))}`} />
          ))}
        </Panel>
        <Panel title="الموردون وأوامر الشراء">
          {data.suppliers.slice(0, 6).map((supplier) => <Statement key={supplier.id} label={`${supplier.name} - ${supplier.category}`} value={`${supplier.rating}/5`} />)}
          {data.purchaseOrders.slice(0, 6).map((po) => <Statement key={po.id} label={`${po.po_number} - ${po.title}`} value={`${po.status} · ${currency.format(Number(po.total))}`} />)}
        </Panel>
        <Panel title="سياسات المخزون">
          {data.policy.map((item) => <Statement key={item} label={item} value="فعال" />)}
        </Panel>
      </section>
    </main>
  );
}

function messageFor(action: string) {
  if (action === "supplier") return "تم حفظ المورد.";
  if (action === "item") return "تم حفظ الصنف.";
  if (action === "po") return "تم حفظ أمر الشراء.";
  if (action === "movement") return "تم تسجيل حركة المخزون.";
  return "تم تنفيذ العملية.";
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <article className="metric-card green"><span><Building2 size={20} /></span><small>{label}</small><strong>{value}</strong></article>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="ops-card"><h2>{title}</h2><div className="statement-list">{children}</div></section>;
}

function Statement({ label, value }: { label: string; value: string | number }) {
  return <div className="statement-row"><span>{label}</span><b>{value}</b></div>;
}
