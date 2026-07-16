"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Bot, Loader2, Play, RefreshCw, ShieldAlert } from "lucide-react";

type Step = { id: string; title: string; employeeId: string; status: string; attempts: number; evidence?: { verified?: boolean; receiptId?: string } | null; error?: string | null };
type WorkOrder = { id: string; projectNumber: string; workOrderNumber: string; title: string; status: string; executionMode: string; amountSAR: number; department: string; error?: string | null; steps: Step[]; createdAt: string };

const statusLabel: Record<string, string> = {
  RECEIVED: "مستلم", PLANNED: "مخطط", POLICY_CHECK: "فحص سياسات", WAITING_APPROVAL: "بانتظار اعتماد",
  READY: "جاهز", EXECUTING: "قيد التنفيذ", VERIFYING: "قيد التحقق", DONE: "مكتمل",
  RETRY: "إعادة محاولة", ESCALATED: "مصعّد", FAILED: "فشل", CANCELLED: "ملغي",
};

export default function EmployeeRuntimePanel() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ orderId: "", customerName: "", productName: "", sku: "", quantity: "1", amountSAR: "150", taxSAR: "0", unitCostSAR: "0", paymentReference: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/employee-runtime/work-orders?limit=50", { cache: "no-store" });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "تعذر تحميل أوامر العمل");
      setOrders(data.workOrders || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل أوامر العمل");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const response = await fetch("/api/employee-runtime/order-to-cash", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, quantity: Number(form.quantity), amountSAR: Number(form.amountSAR), taxSAR: Number(form.taxSAR), unitCostSAR: Number(form.unitCostSAR), paymentConfirmed: true }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "تعذر تنفيذ دورة البيع");
      setForm((current) => ({ ...current, orderId: "", paymentReference: "" }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تنفيذ دورة البيع");
    } finally { setBusy(false); }
  }

  async function action(id: string, name: "APPROVE" | "RETRY" | "RESUME") {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/employee-runtime/work-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: name }) });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "تعذر تحديث أمر العمل");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحديث أمر العمل");
    } finally { setBusy(false); }
  }

  const summary = useMemo(() => ({
    total: orders.length,
    done: orders.filter((item) => item.status === "DONE").length,
    active: orders.filter((item) => ["EXECUTING", "VERIFYING", "PLANNED", "POLICY_CHECK", "RETRY"].includes(item.status)).length,
    exceptions: orders.filter((item) => ["ESCALATED", "FAILED", "WAITING_APPROVAL"].includes(item.status)).length,
  }), [orders]);

  return (
    <main className="page-wrap">
      <header className="page-head"><div><span className="eyebrow"><Bot size={16}/> Employee Runtime V1</span><h1 className="glow-title">الموظفون الذاتيون</h1><p className="page-sub">أوامر عمل فعلية: صلاحية، تنفيذ، تحقق، إيصال، KPI وتصعيد للاستثناء فقط.</p></div></header>
      {error && <p className="notice" style={{ color: "var(--red)" }}>{error}</p>}
      <section className="bento-grid" style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
        {[["الإجمالي",summary.total],["مكتمل",summary.done],["قيد العمل",summary.active],["استثناءات",summary.exceptions]].map(([label,value]) => <article className="bento-card" key={String(label)}><span className="bento-kicker">{label}</span><strong style={{ fontSize: "2rem" }}>{value}</strong></article>)}
      </section>
      <form className="bento-card bento-full" onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <span className="bento-kicker"><Play size={15}/> تشغيل دورة بيع كاملة</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10 }}>
          <input className="field" required placeholder="رقم الطلب" value={form.orderId} onChange={(e)=>setForm({...form,orderId:e.target.value})}/>
          <input className="field" required placeholder="اسم العميل" value={form.customerName} onChange={(e)=>setForm({...form,customerName:e.target.value})}/>
          <input className="field" required placeholder="اسم المنتج" value={form.productName} onChange={(e)=>setForm({...form,productName:e.target.value})}/>
          <input className="field" required placeholder="SKU" value={form.sku} onChange={(e)=>setForm({...form,sku:e.target.value})}/>
          <input className="field" type="number" min="1" required placeholder="الكمية" value={form.quantity} onChange={(e)=>setForm({...form,quantity:e.target.value})}/>
          <input className="field" type="number" min="0.01" step="0.01" required placeholder="قيمة البيع" value={form.amountSAR} onChange={(e)=>setForm({...form,amountSAR:e.target.value})}/>
          <input className="field" type="number" min="0" step="0.01" placeholder="الضريبة" value={form.taxSAR} onChange={(e)=>setForm({...form,taxSAR:e.target.value})}/>
          <input className="field" type="number" min="0" step="0.01" placeholder="تكلفة الوحدة" value={form.unitCostSAR} onChange={(e)=>setForm({...form,unitCostSAR:e.target.value})}/>
        </div>
        <input className="field" placeholder="مرجع الدفع" value={form.paymentReference} onChange={(e)=>setForm({...form,paymentReference:e.target.value})}/>
        <button className="primary-btn" disabled={busy}>{busy ? <Loader2 className="spin" size={15}/> : <Play size={15}/>} تنفيذ الآن</button>
      </form>
      <section style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><strong className="shell-group" style={{ padding: 0 }}>أوامر العمل</strong><button className="secondary-btn btn-sm" onClick={load}><RefreshCw size={13}/> تحديث</button></div>
        {loading ? <Loader2 className="spin"/> : orders.map((item) => (
          <article className="bento-card bento-full" key={item.id} style={{ gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}><div><span className="bento-kicker">{item.workOrderNumber} · {item.executionMode}</span><strong style={{ display: "block", fontSize: "1.05rem" }}>{item.title}</strong><small>{item.projectNumber} · {item.department} · {item.amountSAR.toLocaleString("ar-SA")} ر.س</small></div><span className={`mini-pill ${item.status === "ESCALATED" ? "high" : ""}`}>{statusLabel[item.status] || item.status}</span></div>
            <div className="bento-list">{item.steps.map((step) => <div className="bento-list__row" key={step.id}><span>{step.title}<br/><small>{step.employeeId} · محاولة {step.attempts}</small></span><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{step.evidence?.verified ? <BadgeCheck size={14}/> : step.status === "FAILED" ? <ShieldAlert size={14}/> : null}{statusLabel[step.status] || step.status}</span></div>)}</div>
            {item.error && <p className="notice" style={{ color: "var(--red)" }}>{item.error}</p>}
            {item.status === "WAITING_APPROVAL" && <button className="primary-btn btn-sm" disabled={busy} onClick={()=>action(item.id,"APPROVE")}>اعتماد ومتابعة</button>}
            {["RETRY","ESCALATED","FAILED"].includes(item.status) && <button className="secondary-btn btn-sm" disabled={busy} onClick={()=>action(item.id,"RETRY")}>إعادة المحاولة</button>}
          </article>
        ))}
      </section>
    </main>
  );
}
