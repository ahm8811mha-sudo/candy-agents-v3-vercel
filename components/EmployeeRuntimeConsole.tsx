"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Bot, Loader2, Play, RefreshCw, ShieldAlert } from "lucide-react";

type RuntimeStatus = {
  ready: boolean;
  mode: "LIVE" | "SIMULATION";
  databaseReady: boolean;
  sopRegistry?: { total: number; referenced: number; missing: string[] };
};

type Step = {
  id: string;
  title: string;
  employeeId: string;
  status: string;
  attempts: number;
  evidence?: { verified?: boolean } | null;
};

type WorkOrder = {
  id: string;
  kind: string;
  projectNumber: string;
  workOrderNumber: string;
  title: string;
  status: string;
  executionMode: string;
  amountSAR: number;
  department: string;
  approvalTier: string;
  error?: string | null;
  steps: Step[];
};

type Workflow = "sale" | "purchase" | "idea";

type ApprovedIdea = {
  id: string;
  title: string;
  budgetSAR?: number;
  executed?: boolean;
};

const labels: Record<string, string> = {
  RECEIVED: "مستلم",
  PLANNED: "مخطط",
  POLICY_CHECK: "فحص السياسات",
  WAITING_APPROVAL: "بانتظار اعتماد",
  READY: "جاهز",
  EXECUTING: "قيد التنفيذ",
  VERIFYING: "قيد التحقق",
  RETRY: "إعادة محاولة",
  ESCALATED: "مصعّد",
  DONE: "مكتمل",
  FAILED: "فشل",
  CANCELLED: "ملغي",
  ORDER_TO_CASH: "البيع إلى التحصيل",
  PURCHASE_TO_PAY: "الشراء إلى السداد",
  IDEA_TO_EXECUTION: "الفكرة إلى التنفيذ",
};

function text(form: FormData, key: string) {
  return String(form.get(key) || "").trim();
}

function number(form: FormData, key: string) {
  return Number(form.get(key) || 0);
}

export default function EmployeeRuntimeConsole() {
  const [workflow, setWorkflow] = useState<Workflow>("sale");
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [approvedIdeas, setApprovedIdeas] = useState<ApprovedIdea[]>([]);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersResponse, statusResponse, ideasResponse] = await Promise.all([
        fetch("/api/employee-runtime/work-orders?limit=100", { cache: "no-store" }),
        fetch("/api/employee-runtime/status", { cache: "no-store" }),
        fetch("/api/company/ideas", { cache: "no-store" }),
      ]);
      const [ordersData, statusData, ideasData] = await Promise.all([
        ordersResponse.json(),
        statusResponse.json(),
        ideasResponse.json().catch(() => null),
      ]);
      if (!ordersData.ok) throw new Error(ordersData.error || "تعذر تحميل أوامر العمل.");
      if (!statusData.ok) throw new Error(statusData.error || "تعذر فحص جاهزية المحرك.");
      setOrders(ordersData.workOrders || []);
      setRuntime(statusData);
      if (ideasData?.ok) setApprovedIdeas((ideasData.approvedIdeas || []) as ApprovedIdea[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل المحرك.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(endpoint: string, payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "تعذر تشغيل أمر العمل.");
      const order = data.workOrder as WorkOrder | undefined;
      setMessage(
        order
          ? `${order.workOrderNumber} — ${labels[order.status] || order.status}`
          : "تم استلام الطلب."
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تشغيل أمر العمل.");
    } finally {
      setBusy(false);
    }
  }

  async function submitSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await post("/api/employee-runtime/order-to-cash", {
      orderId: text(form, "orderId"),
      customerName: text(form, "customerName"),
      customerEmail: text(form, "customerEmail") || undefined,
      productName: text(form, "productName"),
      sku: text(form, "sku"),
      quantity: number(form, "quantity"),
      amountSAR: number(form, "amountSAR"),
      taxSAR: number(form, "taxSAR"),
      unitCostSAR: number(form, "unitCostSAR"),
      minimumMarginPercent: number(form, "minimumMarginPercent") || 20,
      paymentReference: text(form, "paymentReference"),
      paymentConfirmed: true,
      channel: text(form, "channel") || "direct",
    });
  }

  async function submitPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await post("/api/employee-runtime/purchase-to-pay", {
      requestId: text(form, "requestId"),
      supplierName: text(form, "supplierName"),
      supplierEmail: text(form, "supplierEmail") || undefined,
      itemName: text(form, "itemName"),
      sku: text(form, "sku"),
      quantity: number(form, "quantity"),
      unitPriceSAR: number(form, "unitPriceSAR"),
      taxSAR: number(form, "taxSAR"),
      leadTimeDays: number(form, "leadTimeDays") || 7,
      qualityScore: number(form, "qualityScore") || 80,
      paymentDueDate: text(form, "paymentDueDate") || undefined,
      received: form.get("received") === "on",
    });
  }

  async function submitIdea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await post("/api/employee-runtime/idea-to-execution", {
      ideaId: text(form, "ideaId"),
      riskLevel: text(form, "riskLevel") || "MEDIUM",
    });
  }

  async function control(id: string, action: "APPROVE" | "RETRY") {
    await post("/api/employee-runtime/work-orders", { id, action });
  }

  const summary = useMemo(
    () => ({
      total: orders.length,
      done: orders.filter((item) => item.status === "DONE").length,
      waiting: orders.filter((item) => item.status === "WAITING_APPROVAL").length,
      exceptions: orders.filter((item) => ["ESCALATED", "FAILED"].includes(item.status)).length,
    }),
    [orders]
  );

  const fields = "field";

  return (
    <main className="page-wrap">
      <header className="page-head">
        <div>
          <span className="eyebrow"><Bot size={16} /> Employee Runtime V2</span>
          <h1 className="glow-title">الموظفون الذاتيون</h1>
          <p className="page-sub">
            الموظف يخطط وينفذ ويتحقق ويسجل إيصالًا، ويصعّد لك الاعتماد أو الاستثناء فقط.
          </p>
        </div>
        <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
          <span className={`mini-pill ${runtime?.mode === "LIVE" ? "" : "high"}`}>
            {runtime?.mode === "LIVE" ? "تنفيذ فعلي LIVE" : "محاكاة آمنة"}
          </span>
          <small>
            قاعدة البيانات: {runtime?.databaseReady ? "جاهزة" : "غير مكتملة"} · SOP: {runtime?.sopRegistry?.missing?.length ? "ناقص" : "مكتمل"}
          </small>
        </div>
      </header>

      {message && <p className="notice">{message}</p>}
      {error && <p className="notice" style={{ color: "var(--red)" }}>{error}</p>}

      <section className="bento-grid" style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
        {[
          ["الإجمالي", summary.total],
          ["مكتمل", summary.done],
          ["بانتظار اعتماد", summary.waiting],
          ["استثناءات", summary.exceptions],
        ].map(([label, value]) => (
          <article className="bento-card" key={String(label)}>
            <span className="bento-kicker">{label}</span>
            <strong style={{ fontSize: "2rem" }}>{value}</strong>
          </article>
        ))}
      </section>

      <section className="bento-card bento-full" style={{ gap: 14 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            ["sale", "بيع"],
            ["purchase", "شراء"],
            ["idea", "فكرة معتمدة"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={workflow === id ? "primary-btn btn-sm" : "secondary-btn btn-sm"}
              onClick={() => setWorkflow(id as Workflow)}
            >
              {label}
            </button>
          ))}
        </div>

        {workflow === "sale" && (
          <form onSubmit={submitSale} style={{ display: "grid", gap: 10 }}>
            <strong>البيع إلى التحصيل</strong>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10 }}>
              <input className={fields} name="orderId" required placeholder="رقم الطلب" />
              <input className={fields} name="customerName" required placeholder="اسم العميل" />
              <input className={fields} name="customerEmail" placeholder="بريد العميل" />
              <input className={fields} name="productName" required placeholder="اسم المنتج" />
              <input className={fields} name="sku" required placeholder="SKU" />
              <input className={fields} name="quantity" type="number" min="1" step="1" defaultValue="1" required />
              <input className={fields} name="amountSAR" type="number" min="0.01" step="0.01" placeholder="قيمة البيع" required />
              <input className={fields} name="taxSAR" type="number" min="0" step="0.01" defaultValue="0" placeholder="الضريبة" />
              <input className={fields} name="unitCostSAR" type="number" min="0" step="0.01" defaultValue="0" placeholder="تكلفة الوحدة" />
              <input className={fields} name="minimumMarginPercent" type="number" min="0" step="0.01" defaultValue="20" placeholder="أقل هامش" />
              <input className={fields} name="paymentReference" required placeholder="مرجع الدفع" />
              <input className={fields} name="channel" defaultValue="direct" placeholder="قناة البيع" />
            </div>
            <button className="primary-btn" disabled={busy}>
              {busy ? <Loader2 className="spin" size={15} /> : <Play size={15} />} تشغيل دورة البيع
            </button>
          </form>
        )}

        {workflow === "purchase" && (
          <form onSubmit={submitPurchase} style={{ display: "grid", gap: 10 }}>
            <strong>الشراء إلى السداد</strong>
            <p className="page-sub">لا يوجد اعتماد من النموذج. المبلغ يمر تلقائيًا عبر T0–T3، ولا ينفذ تحويل بنكي.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10 }}>
              <input className={fields} name="requestId" required placeholder="رقم طلب الشراء" />
              <input className={fields} name="supplierName" required placeholder="اسم المورد" />
              <input className={fields} name="supplierEmail" placeholder="بريد المورد" />
              <input className={fields} name="itemName" required placeholder="الصنف" />
              <input className={fields} name="sku" required placeholder="SKU" />
              <input className={fields} name="quantity" type="number" min="1" step="1" defaultValue="1" required />
              <input className={fields} name="unitPriceSAR" type="number" min="0.01" step="0.01" placeholder="سعر الوحدة" required />
              <input className={fields} name="taxSAR" type="number" min="0" step="0.01" defaultValue="0" placeholder="الضريبة" />
              <input className={fields} name="leadTimeDays" type="number" min="1" step="1" defaultValue="7" placeholder="مدة التوريد" />
              <input className={fields} name="qualityScore" type="number" min="0" max="100" step="1" defaultValue="80" placeholder="تقييم الجودة" />
              <input className={fields} name="paymentDueDate" type="date" />
            </div>
            <label><input name="received" type="checkbox" /> تم استلام البضاعة فعليًا</label>
            <button className="primary-btn" disabled={busy}>
              {busy ? <Loader2 className="spin" size={15} /> : <Play size={15} />} تشغيل دورة الشراء
            </button>
          </form>
        )}

        {workflow === "idea" && (
          <form onSubmit={submitIdea} style={{ display: "grid", gap: 10 }}>
            <strong>الفكرة إلى التنفيذ</strong>
            <p className="page-sub">اختر فكرة من الأفكار المعتمدة فعلياً في مركز القرار؛ العنوان والميزانية وحالة الاعتماد تُقرأ من السجل الرسمي.</p>
            {approvedIdeas.filter((idea) => !idea.executed).length === 0 ? (
              <p className="page-sub">لا توجد أفكار معتمدة متاحة للتحويل بعد — اعتمد فكرة من مركز القرار أولاً، ثم ستظهر هنا تلقائياً.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>
                <select className={fields} name="ideaId" required defaultValue="">
                  <option value="" disabled>اختر الفكرة المعتمدة</option>
                  {approvedIdeas.filter((idea) => !idea.executed).map((idea) => (
                    <option key={idea.id} value={idea.id}>
                      {idea.title}{Number(idea.budgetSAR || 0) > 0 ? ` — ${Number(idea.budgetSAR).toLocaleString("ar-SA-u-nu-latn")} ر.س` : ""}
                    </option>
                  ))}
                </select>
                <select className={fields} name="riskLevel" defaultValue="MEDIUM">
                  <option value="LOW">مخاطر منخفضة</option>
                  <option value="MEDIUM">مخاطر متوسطة</option>
                  <option value="HIGH">مخاطر مرتفعة</option>
                  <option value="CRITICAL">مخاطر حرجة</option>
                </select>
              </div>
            )}
            <button className="primary-btn" disabled={busy || approvedIdeas.filter((idea) => !idea.executed).length === 0}>
              {busy ? <Loader2 className="spin" size={15} /> : <Play size={15} />} تحويل الفكرة إلى مشروع
            </button>
          </form>
        )}
      </section>

      <section style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>أوامر العمل</strong>
          <button className="secondary-btn btn-sm" onClick={() => void load()}>
            <RefreshCw size={13} /> تحديث
          </button>
        </div>
        {loading ? (
          <Loader2 className="spin" />
        ) : (
          orders.map((order) => (
            <article className="bento-card bento-full" key={order.id} style={{ gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <span className="bento-kicker">{order.workOrderNumber} · {order.executionMode}</span>
                  <strong style={{ display: "block" }}>{order.title}</strong>
                  <small>{labels[order.kind] || order.kind} · {order.projectNumber} · {order.amountSAR.toLocaleString("ar-SA")} ر.س</small>
                </div>
                <span className={`mini-pill ${["WAITING_APPROVAL", "ESCALATED", "FAILED"].includes(order.status) ? "high" : ""}`}>
                  {labels[order.status] || order.status}
                </span>
              </div>
              <div className="bento-list">
                {order.steps.map((step) => (
                  <div className="bento-list__row" key={step.id}>
                    <span>{step.title}<br /><small>{step.employeeId} · محاولة {step.attempts}</small></span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      {step.evidence?.verified ? <BadgeCheck size={14} /> : step.status === "FAILED" ? <ShieldAlert size={14} /> : null}
                      {labels[step.status] || step.status}
                    </span>
                  </div>
                ))}
              </div>
              {order.error && <p className="notice" style={{ color: "var(--red)" }}>{order.error}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                {order.status === "WAITING_APPROVAL" && (
                  <button className="primary-btn btn-sm" disabled={busy} onClick={() => void control(order.id, "APPROVE")}>
                    اعتماد {order.approvalTier} ومتابعة
                  </button>
                )}
                {["RETRY", "ESCALATED", "FAILED"].includes(order.status) && (
                  <button className="secondary-btn btn-sm" disabled={busy} onClick={() => void control(order.id, "RETRY")}>
                    إعادة المحاولة
                  </button>
                )}
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
