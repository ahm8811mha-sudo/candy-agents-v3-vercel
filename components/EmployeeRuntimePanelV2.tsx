"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Bot,
  Boxes,
  Lightbulb,
  Loader2,
  Play,
  RefreshCw,
  ShieldAlert,
  ShoppingCart,
} from "lucide-react";

type RuntimeStatus = {
  ready: boolean;
  mode: "LIVE" | "SIMULATION";
  liveSideEffectsEnabled: boolean;
  databaseReady: boolean;
  workflows: string[];
  employees: Array<{
    id: string;
    name: string;
    title: string;
    backupEmployeeId?: string | null;
    capabilityCount: number;
    kpiCount: number;
  }>;
};

type Step = {
  id: string;
  title: string;
  employeeId: string;
  status: string;
  attempts: number;
  evidence?: { verified?: boolean; receiptId?: string } | null;
  error?: string | null;
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
  error?: string | null;
  steps: Step[];
  createdAt: string;
};

type WorkflowTab =
  | "ORDER_TO_CASH"
  | "PURCHASE_TO_PAY"
  | "IDEA_TO_EXECUTION";

const statusLabel: Record<string, string> = {
  RECEIVED: "مستلم",
  PLANNED: "مخطط",
  POLICY_CHECK: "فحص سياسات",
  WAITING_APPROVAL: "بانتظار اعتماد",
  READY: "جاهز",
  EXECUTING: "قيد التنفيذ",
  VERIFYING: "قيد التحقق",
  DONE: "مكتمل",
  RETRY: "إعادة محاولة",
  ESCALATED: "مصعّد",
  FAILED: "فشل",
  CANCELLED: "ملغي",
};

const workflowLabel: Record<string, string> = {
  ORDER_TO_CASH: "البيع إلى التحصيل",
  PURCHASE_TO_PAY: "الشراء إلى السداد",
  IDEA_TO_EXECUTION: "الفكرة إلى التنفيذ",
};

const inputStyle = { minWidth: 0 };

export default function EmployeeRuntimePanelV2() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [tab, setTab] = useState<WorkflowTab>("ORDER_TO_CASH");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [sale, setSale] = useState({
    orderId: "",
    customerName: "",
    customerEmail: "",
    productName: "",
    sku: "",
    quantity: "1",
    amountSAR: "150",
    taxSAR: "0",
    unitCostSAR: "0",
    paymentReference: "",
    channel: "direct",
  });

  const [purchase, setPurchase] = useState({
    requestId: "",
    supplierName: "",
    supplierEmail: "",
    itemName: "",
    sku: "",
    quantity: "1",
    unitPriceSAR: "0",
    taxSAR: "0",
    leadTimeDays: "7",
    qualityScore: "80",
    paymentDueDate: "",
    received: false,
    approved: false,
  });

  const [idea, setIdea] = useState({
    ideaId: "",
    title: "",
    budgetSAR: "0",
    approved: false,
    riskLevel: "MEDIUM",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ordersResponse, statusResponse] = await Promise.all([
        fetch("/api/employee-runtime/work-orders?limit=100", {
          cache: "no-store",
        }),
        fetch("/api/employee-runtime/status", { cache: "no-store" }),
      ]);
      const [ordersData, statusData] = await Promise.all([
        ordersResponse.json(),
        statusResponse.json(),
      ]);
      if (!ordersData.ok) {
        throw new Error(ordersData.error || "تعذر تحميل أوامر العمل");
      }
      if (!statusData.ok) {
        throw new Error(statusData.error || "تعذر فحص جاهزية المحرك");
      }
      setOrders(ordersData.workOrders || []);
      setRuntime(statusData);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "تعذر تحميل Employee Runtime"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submitWorkflow(
    endpoint: string,
    payload: Record<string, unknown>,
    successMessage: string
  ) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error || "تعذر تشغيل أمر العمل");
      }
      setNotice(
        `${successMessage}: ${
          data.workOrder?.workOrderNumber || "تم الإنشاء"
        } — ${
          statusLabel[data.workOrder?.status] || data.workOrder?.status
        }`
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "تعذر تشغيل أمر العمل"
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitSale(event: FormEvent) {
    event.preventDefault();
    await submitWorkflow(
      "/api/employee-runtime/order-to-cash",
      {
        ...sale,
        quantity: Number(sale.quantity),
        amountSAR: Number(sale.amountSAR),
        taxSAR: Number(sale.taxSAR),
        unitCostSAR: Number(sale.unitCostSAR),
        paymentConfirmed: true,
      },
      "تم استلام دورة البيع"
    );
  }

  async function submitPurchase(event: FormEvent) {
    event.preventDefault();
    await submitWorkflow(
      "/api/employee-runtime/purchase-to-pay",
      {
        ...purchase,
        quantity: Number(purchase.quantity),
        unitPriceSAR: Number(purchase.unitPriceSAR),
        taxSAR: Number(purchase.taxSAR),
        leadTimeDays: Number(purchase.leadTimeDays),
        qualityScore: Number(purchase.qualityScore),
      },
      "تم استلام دورة الشراء"
    );
  }

  async function submitIdea(event: FormEvent) {
    event.preventDefault();
    await submitWorkflow(
      "/api/employee-runtime/idea-to-execution",
      { ...idea, budgetSAR: Number(idea.budgetSAR) },
      "تم استلام الفكرة للتنفيذ"
    );
  }

  async function workOrderAction(
    id: string,
    action: "APPROVE" | "RETRY" | "RESUME" | "CANCEL"
  ) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/employee-runtime/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "تعذر تحديث أمر العمل");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "تعذر تحديث أمر العمل"
      );
    } finally {
      setBusy(false);
    }
  }

  const summary = useMemo(
    () => ({
      total: orders.length,
      done: orders.filter((item) => item.status === "DONE").length,
      active: orders.filter((item) =>
        [
          "EXECUTING",
          "VERIFYING",
          "PLANNED",
          "POLICY_CHECK",
          "RETRY",
        ].includes(item.status)
      ).length,
      exceptions: orders.filter((item) =>
        ["ESCALATED", "FAILED", "WAITING_APPROVAL"].includes(item.status)
      ).length,
    }),
    [orders]
  );

  const tabs: Array<{
    id: WorkflowTab;
    label: string;
    icon: typeof ShoppingCart;
  }> = [
    { id: "ORDER_TO_CASH", label: "بيع", icon: ShoppingCart },
    { id: "PURCHASE_TO_PAY", label: "شراء", icon: Boxes },
    { id: "IDEA_TO_EXECUTION", label: "فكرة", icon: Lightbulb },
  ];

  return (
    <main className="page-wrap">
      <header className="page-head">
        <div>
          <span className="eyebrow">
            <Bot size={16} /> Employee Runtime V2
          </span>
          <h1 className="glow-title">الموظفون الذاتيون</h1>
          <p className="page-sub">
            مستشارون ومنفذون: أمر عمل مرقم، صلاحية، تنفيذ، تحقق، إيصال،
            KPI، بديل وظيفي وتصعيد للاستثناء فقط.
          </p>
        </div>
        <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
          <span
            className={`mini-pill ${runtime?.mode === "LIVE" ? "" : "high"}`}
          >
            {runtime?.mode === "LIVE" ? "تنفيذ فعلي LIVE" : "محاكاة آمنة"}
          </span>
          <small>
            قاعدة البيانات: {runtime?.databaseReady ? "جاهزة" : "غير مكتملة"}
          </small>
        </div>
      </header>

      {error && (
        <p className="notice" style={{ color: "var(--red)" }}>
          {error}
        </p>
      )}
      {notice && <p className="notice">{notice}</p>}

      <section
        className="bento-grid"
        style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}
      >
        {[
          ["الإجمالي", summary.total],
          ["مكتمل", summary.done],
          ["قيد العمل", summary.active],
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
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={
                  tab === item.id
                    ? "primary-btn btn-sm"
                    : "secondary-btn btn-sm"
                }
                onClick={() => setTab(item.id)}
              >
                <Icon size={14} /> {item.label}
              </button>
            );
          })}
        </div>

        {tab === "ORDER_TO_CASH" && (
          <form onSubmit={submitSale} style={{ display: "grid", gap: 12 }}>
            <span className="bento-kicker">
              <ShoppingCart size={15} /> البيع إلى التحصيل
            </span>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,minmax(0,1fr))",
                gap: 10,
              }}
            >
              <input style={inputStyle} className="field" required placeholder="رقم الطلب" value={sale.orderId} onChange={(event) => setSale({ ...sale, orderId: event.target.value })} />
              <input style={inputStyle} className="field" required placeholder="اسم العميل" value={sale.customerName} onChange={(event) => setSale({ ...sale, customerName: event.target.value })} />
              <input style={inputStyle} className="field" placeholder="بريد العميل" value={sale.customerEmail} onChange={(event) => setSale({ ...sale, customerEmail: event.target.value })} />
              <input style={inputStyle} className="field" required placeholder="اسم المنتج" value={sale.productName} onChange={(event) => setSale({ ...sale, productName: event.target.value })} />
              <input style={inputStyle} className="field" required placeholder="SKU" value={sale.sku} onChange={(event) => setSale({ ...sale, sku: event.target.value })} />
              <input style={inputStyle} className="field" type="number" min="1" step="1" required placeholder="الكمية" value={sale.quantity} onChange={(event) => setSale({ ...sale, quantity: event.target.value })} />
              <input style={inputStyle} className="field" type="number" min="0.01" step="0.01" required placeholder="قيمة البيع" value={sale.amountSAR} onChange={(event) => setSale({ ...sale, amountSAR: event.target.value })} />
              <input style={inputStyle} className="field" type="number" min="0" step="0.01" placeholder="الضريبة" value={sale.taxSAR} onChange={(event) => setSale({ ...sale, taxSAR: event.target.value })} />
              <input style={inputStyle} className="field" type="number" min="0" step="0.01" placeholder="تكلفة الوحدة" value={sale.unitCostSAR} onChange={(event) => setSale({ ...sale, unitCostSAR: event.target.value })} />
              <input style={inputStyle} className="field" required placeholder="مرجع الدفع" value={sale.paymentReference} onChange={(event) => setSale({ ...sale, paymentReference: event.target.value })} />
              <input style={inputStyle} className="field" placeholder="قناة البيع" value={sale.channel} onChange={(event) => setSale({ ...sale, channel: event.target.value })} />
            </div>
            <button className="primary-btn" disabled={busy}>
              {busy ? <Loader2 className="spin" size={15} /> : <Play size={15} />}
              تشغيل دورة البيع
            </button>
          </form>
        )}

        {tab === "PURCHASE_TO_PAY" && (
          <form onSubmit={submitPurchase} style={{ display: "grid", gap: 12 }}>
            <span className="bento-kicker">
              <Boxes size={15} /> الشراء إلى السداد
            </span>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,minmax(0,1fr))",
                gap: 10,
              }}
            >
              <input style={inputStyle} className="field" required placeholder="رقم طلب الشراء" value={purchase.requestId} onChange={(event) => setPurchase({ ...purchase, requestId: event.target.value })} />
              <input style={inputStyle} className="field" required placeholder="اسم المورد" value={purchase.supplierName} onChange={(event) => setPurchase({ ...purchase, supplierName: event.target.value })} />
              <input style={inputStyle} className="field" placeholder="بريد المورد" value={purchase.supplierEmail} onChange={(event) => setPurchase({ ...purchase, supplierEmail: event.target.value })} />
              <input style={inputStyle} className="field" required placeholder="الصنف" value={purchase.itemName} onChange={(event) => setPurchase({ ...purchase, itemName: event.target.value })} />
              <input style={inputStyle} className="field" required placeholder="SKU" value={purchase.sku} onChange={(event) => setPurchase({ ...purchase, sku: event.target.value })} />
              <input style={inputStyle} className="field" type="number" min="1" step="1" required placeholder="الكمية" value={purchase.quantity} onChange={(event) => setPurchase({ ...purchase, quantity: event.target.value })} />
              <input style={inputStyle} className="field" type="number" min="0.01" step="0.01" required placeholder="سعر الوحدة" value={purchase.unitPriceSAR} onChange={(event) => setPurchase({ ...purchase, unitPriceSAR: event.target.value })} />
              <input style={inputStyle} className="field" type="number" min="0" step="0.01" placeholder="الضريبة" value={purchase.taxSAR} onChange={(event) => setPurchase({ ...purchase, taxSAR: event.target.value })} />
              <input style={inputStyle} className="field" type="number" min="1" step="1" placeholder="مدة التوريد بالأيام" value={purchase.leadTimeDays} onChange={(event) => setPurchase({ ...purchase, leadTimeDays: event.target.value })} />
              <input style={inputStyle} className="field" type="number" min="0" max="100" step="1" placeholder="تقييم الجودة" value={purchase.qualityScore} onChange={(event) => setPurchase({ ...purchase, qualityScore: event.target.value })} />
              <input style={inputStyle} className="field" type="date" value={purchase.paymentDueDate} onChange={(event) => setPurchase({ ...purchase, paymentDueDate: event.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <label>
                <input type="checkbox" checked={purchase.received} onChange={(event) => setPurchase({ ...purchase, received: event.target.checked })} /> تم استلام البضاعة فعليًا
              </label>
              <label>
                <input type="checkbox" checked={purchase.approved} onChange={(event) => setPurchase({ ...purchase, approved: event.target.checked })} /> يوجد اعتماد سابق
              </label>
            </div>
            <button className="primary-btn" disabled={busy}>
              {busy ? <Loader2 className="spin" size={15} /> : <Play size={15} />}
              تشغيل دورة الشراء
            </button>
          </form>
        )}

        {tab === "IDEA_TO_EXECUTION" && (
          <form onSubmit={submitIdea} style={{ display: "grid", gap: 12 }}>
            <span className="bento-kicker">
              <Lightbulb size={15} /> الفكرة إلى التنفيذ
            </span>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4,minmax(0,1fr))",
                gap: 10,
              }}
            >
              <input style={inputStyle} className="field" required placeholder="معرف الفكرة الحالي" value={idea.ideaId} onChange={(event) => setIdea({ ...idea, ideaId: event.target.value })} />
              <input style={inputStyle} className="field" placeholder="عنوان الفكرة" value={idea.title} onChange={(event) => setIdea({ ...idea, title: event.target.value })} />
              <input style={inputStyle} className="field" type="number" min="0.01" step="0.01" required placeholder="الميزانية" value={idea.budgetSAR} onChange={(event) => setIdea({ ...idea, budgetSAR: event.target.value })} />
              <select style={inputStyle} className="field" value={idea.riskLevel} onChange={(event) => setIdea({ ...idea, riskLevel: event.target.value })}>
                <option value="LOW">مخاطر منخفضة</option>
                <option value="MEDIUM">مخاطر متوسطة</option>
                <option value="HIGH">مخاطر مرتفعة</option>
                <option value="CRITICAL">مخاطر حرجة</option>
              </select>
            </div>
            <label>
              <input type="checkbox" checked={idea.approved} onChange={(event) => setIdea({ ...idea, approved: event.target.checked })} /> الفكرة معتمدة من مركز القرار
            </label>
            <button className="primary-btn" disabled={busy}>
              {busy ? <Loader2 className="spin" size={15} /> : <Play size={15} />}
              تحويل الفكرة إلى مشروع
            </button>
          </form>
        )}
      </section>

      <section style={{ display: "grid", gap: 10 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <strong className="shell-group" style={{ padding: 0 }}>
            أوامر العمل
          </strong>
          <button className="secondary-btn btn-sm" onClick={load}>
            <RefreshCw size={13} /> تحديث
          </button>
        </div>

        {loading ? (
          <Loader2 className="spin" />
        ) : (
          orders.map((item) => (
            <article
              className="bento-card bento-full"
              key={item.id}
              style={{ gap: 12 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <span className="bento-kicker">
                    {item.workOrderNumber} · {item.executionMode}
                  </span>
                  <strong style={{ display: "block", fontSize: "1.05rem" }}>
                    {item.title}
                  </strong>
                  <small>
                    {workflowLabel[item.kind] || item.kind} · {item.projectNumber} · {item.department} · {item.amountSAR.toLocaleString("ar-SA")} ر.س
                  </small>
                </div>
                <span
                  className={`mini-pill ${
                    ["ESCALATED", "FAILED", "WAITING_APPROVAL"].includes(
                      item.status
                    )
                      ? "high"
                      : ""
                  }`}
                >
                  {statusLabel[item.status] || item.status}
                </span>
              </div>

              <div className="bento-list">
                {item.steps.map((step) => (
                  <div className="bento-list__row" key={step.id}>
                    <span>
                      {step.title}
                      <br />
                      <small>
                        {step.employeeId} · محاولة {step.attempts}
                      </small>
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      {step.evidence?.verified ? (
                        <BadgeCheck size={14} />
                      ) : step.status === "FAILED" ? (
                        <ShieldAlert size={14} />
                      ) : null}
                      {statusLabel[step.status] || step.status}
                    </span>
                  </div>
                ))}
              </div>

              {item.error && (
                <p className="notice" style={{ color: "var(--red)" }}>
                  {item.error}
                </p>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {item.status === "WAITING_APPROVAL" && (
                  <button
                    className="primary-btn btn-sm"
                    disabled={busy}
                    onClick={() => workOrderAction(item.id, "APPROVE")}
                  >
                    اعتماد ومتابعة
                  </button>
                )}
                {["RETRY", "ESCALATED", "FAILED"].includes(item.status) && (
                  <button
                    className="secondary-btn btn-sm"
                    disabled={busy}
                    onClick={() => workOrderAction(item.id, "RETRY")}
                  >
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
