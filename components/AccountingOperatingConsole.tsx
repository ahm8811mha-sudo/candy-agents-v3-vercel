"use client";

import { FormEvent, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Banknote,
  BookOpenCheck,
  Building2,
  FileText,
  Landmark,
  Loader2,
  Plus,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

type AccountingData = {
  statements?: {
    incomeStatement?: { revenue: number; expenses: number; netIncome: number };
    balanceSheet?: { assets: number; liabilities: number; equity: number; retainedEarnings: number };
    trialBalance?: { debit: number; credit: number };
    cash?: number;
    receivables?: number;
    payables?: number;
  };
  cfoSummary?: {
    status: string;
    message: string;
    controls: string[];
  };
  accounts?: Array<{ id: string; code: string; name: string; type: string; balance?: number }>;
  journalEntries?: Array<{ id: string; entry_number: string; memo?: string; status: string; created_at: string }>;
  invoices?: Array<{ id: string; invoice_type: string; status: string; total: number; paid: number; created_at: string }>;
  bankTransactions?: Array<{ id: string; description: string; amount: number; status: string; created_at: string }>;
};

const currency = new Intl.NumberFormat("ar-SA", {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 0,
});

export default function AccountingOperatingConsole() {
  const [data, setData] = useState<AccountingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/accounting-pro", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تحميل النظام المحاسبي.");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل النظام المحاسبي.");
    } finally {
      setLoading(false);
    }
  }

  async function submit(action: "seed" | "journal" | "invoice" | "bank", payload?: Record<string, unknown>) {
    setWorking(action);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/accounting-pro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data: payload }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تنفيذ العملية.");
      setMessage(operationMessage(action));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تنفيذ العملية.");
    } finally {
      setWorking("");
    }
  }

  function submitJournal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    submit("journal", {
      memo: String(form.get("memo") || ""),
      debitCode: String(form.get("debitCode") || "5100"),
      creditCode: String(form.get("creditCode") || "1000"),
      amount: Number(form.get("amount") || 0),
    }).then(() => event.currentTarget.reset());
  }

  function submitInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    submit("invoice", {
      invoiceType: String(form.get("invoiceType") || "SALES"),
      contactName: String(form.get("contactName") || ""),
      subtotal: Number(form.get("subtotal") || 0),
      tax: Number(form.get("tax") || 0),
      notes: String(form.get("notes") || ""),
    }).then(() => event.currentTarget.reset());
  }

  function submitBank(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    submit("bank", {
      description: String(form.get("description") || ""),
      amount: Number(form.get("amount") || 0),
      bankName: String(form.get("bankName") || "Main operating bank"),
    }).then(() => event.currentTarget.reset());
  }

  useEffect(() => {
    load();
  }, []);

  const income = data?.statements?.incomeStatement;
  const balance = data?.statements?.balanceSheet;

  return (
    <main className="company-app ops-console">
      <section className="department-hero department-hero-live">
        <div>
          <Link className="back-link" href="/">
            <ArrowRight size={16} /> العودة للشركة
          </Link>
          <span className="eyebrow">
            <BookOpenCheck size={16} /> الإدارة المالية
          </span>
          <h1>نظام محاسبي تشغيلي كامل</h1>
          <p>
            واجهة CFO لإدارة الحسابات، القيود المزدوجة، الفواتير، البنك، الذمم، قائمة الدخل، الميزانية، والتحكم المالي قبل أي توسع.
          </p>
          <div className="department-hero-actions">
            <span>
              <ShieldCheck size={16} /> حالة CFO: {data?.cfoSummary?.status || "READY"}
            </span>
            <span>
              <Landmark size={16} /> النقد: {currency.format(data?.statements?.cash || 0)}
            </span>
          </div>
        </div>
        <div className="department-badge">
          <strong>Accounting OS</strong>
          <small>Double-entry ready</small>
        </div>
      </section>

      <section className="enterprise-actions">
        <button className="primary-btn" onClick={() => submit("seed")} disabled={Boolean(working)}>
          {working === "seed" ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}
          تجهيز شجرة الحسابات
        </button>
        <button className="secondary-btn" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
          تحديث المالية
        </button>
        {message && <p className="notice done">{message}</p>}
        {error && <p className="notice error">{error}</p>}
      </section>

      <section className="ops-metrics">
        <Metric icon={Banknote} label="الإيرادات" value={currency.format(income?.revenue || 0)} />
        <Metric icon={ReceiptText} label="المصروفات" value={currency.format(income?.expenses || 0)} />
        <Metric icon={Building2} label="صافي الربح" value={currency.format(income?.netIncome || 0)} />
        <Metric icon={Landmark} label="الأصول" value={currency.format(balance?.assets || 0)} />
        <Metric icon={FileText} label="الذمم المدينة" value={currency.format(data?.statements?.receivables || 0)} />
        <Metric icon={FileText} label="الذمم الدائنة" value={currency.format(data?.statements?.payables || 0)} />
      </section>

      <section className="ops-workbench">
        <form className="ops-card" onSubmit={submitInvoice}>
          <h2>إصدار فاتورة</h2>
          <div className="ops-form-grid">
            <label>
              النوع
              <select className="input" name="invoiceType" defaultValue="SALES">
                <option value="SALES">فاتورة مبيعات</option>
                <option value="PURCHASE">فاتورة مشتريات</option>
              </select>
            </label>
            <label>
              العميل أو المورد
              <input className="input" name="contactName" placeholder="اسم العميل / المورد" required />
            </label>
            <label>
              المبلغ قبل الضريبة
              <input className="input" name="subtotal" type="number" min="1" step="1" placeholder="15000" required />
            </label>
            <label>
              الضريبة
              <input className="input" name="tax" type="number" min="0" step="1" placeholder="0" />
            </label>
          </div>
          <label>
            ملاحظات
            <input className="input" name="notes" placeholder="وصف مختصر للفاتورة" />
          </label>
          <button className="primary-btn" disabled={Boolean(working)}>
            {working === "invoice" ? <Loader2 className="spin" size={18} /> : <FileText size={18} />}
            حفظ الفاتورة وترحيل القيد
          </button>
        </form>

        <form className="ops-card" onSubmit={submitJournal}>
          <h2>قيد محاسبي مزدوج</h2>
          <div className="ops-form-grid">
            <label>
              الحساب المدين
              <select className="input" name="debitCode" defaultValue="5100">
                {(data?.accounts || []).map((account) => (
                  <option value={account.code} key={account.code}>
                    {account.code} - {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              الحساب الدائن
              <select className="input" name="creditCode" defaultValue="1000">
                {(data?.accounts || []).map((account) => (
                  <option value={account.code} key={account.code}>
                    {account.code} - {account.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              المبلغ
              <input className="input" name="amount" type="number" min="1" step="1" placeholder="5000" required />
            </label>
            <label>
              الوصف
              <input className="input" name="memo" placeholder="مثال: مصروف حملة تسويق" required />
            </label>
          </div>
          <button className="primary-btn" disabled={Boolean(working)}>
            {working === "journal" ? <Loader2 className="spin" size={18} /> : <BookOpenCheck size={18} />}
            ترحيل القيد
          </button>
        </form>

        <form className="ops-card" onSubmit={submitBank}>
          <h2>البنك والمطابقة</h2>
          <div className="ops-form-grid">
            <label>
              الحساب البنكي
              <input className="input" name="bankName" defaultValue="Main operating bank" />
            </label>
            <label>
              الحركة
              <input className="input" name="description" placeholder="إيداع مبيعات / سداد مورد" required />
            </label>
            <label>
              المبلغ
              <input className="input" name="amount" type="number" step="1" placeholder="2500" required />
            </label>
          </div>
          <button className="secondary-btn" disabled={Boolean(working)}>
            {working === "bank" ? <Loader2 className="spin" size={18} /> : <Landmark size={18} />}
            إضافة حركة بنك
          </button>
        </form>
      </section>

      <section className="ops-board">
        <Panel title="قائمة الدخل">
          <Statement label="الإيرادات" value={currency.format(income?.revenue || 0)} />
          <Statement label="المصروفات" value={currency.format(income?.expenses || 0)} />
          <Statement label="صافي الربح" value={currency.format(income?.netIncome || 0)} strong />
        </Panel>
        <Panel title="الميزانية">
          <Statement label="الأصول" value={currency.format(balance?.assets || 0)} />
          <Statement label="الالتزامات" value={currency.format(balance?.liabilities || 0)} />
          <Statement label="حقوق الملكية + الأرباح" value={currency.format((balance?.equity || 0) + (balance?.retainedEarnings || 0))} strong />
        </Panel>
        <Panel title="ضوابط CFO">
          <p className="muted">{data?.cfoSummary?.message}</p>
          {(data?.cfoSummary?.controls || []).map((control) => (
            <Statement key={control} label={control} value="فعال" />
          ))}
        </Panel>
      </section>

      <section className="ops-board two">
        <Panel title="دفتر الحسابات">
          {(data?.accounts || []).slice(0, 12).map((account) => (
            <Statement key={account.id} label={`${account.code} - ${account.name}`} value={account.type} />
          ))}
        </Panel>
        <Panel title="آخر القيود والفواتير والبنك">
          {(data?.journalEntries || []).slice(0, 5).map((entry) => (
            <Statement key={entry.id} label={entry.memo || entry.entry_number} value={entry.status} />
          ))}
          {(data?.invoices || []).slice(0, 4).map((invoice) => (
            <Statement key={invoice.id} label={`${invoice.invoice_type} ${currency.format(Number(invoice.total))}`} value={invoice.status} />
          ))}
          {(data?.bankTransactions || []).slice(0, 4).map((transaction) => (
            <Statement key={transaction.id} label={transaction.description} value={`${transaction.status} ${currency.format(Number(transaction.amount))}`} />
          ))}
        </Panel>
      </section>
    </main>
  );
}

function operationMessage(action: string) {
  if (action === "seed") return "تم تجهيز النظام المحاسبي المؤسسي.";
  if (action === "journal") return "تم ترحيل القيد المحاسبي.";
  if (action === "invoice") return "تم حفظ الفاتورة وترحيل أثرها المالي.";
  if (action === "bank") return "تمت إضافة حركة البنك للمطابقة.";
  return "تم تنفيذ العملية.";
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <article className="metric-card green">
      <span>
        <Icon size={20} />
      </span>
      <small>{label}</small>
      <strong>{value}</strong>
    </article>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="ops-card">
      <h2>{title}</h2>
      <div className="statement-list">{children}</div>
    </section>
  );
}

function Statement({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`statement-row ${strong ? "strong" : ""}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
