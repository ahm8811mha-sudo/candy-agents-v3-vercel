"use client";

import { FormEvent, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, BadgeDollarSign, CheckCircle2, FileText, Loader2, Plus, RefreshCw, Send, Users } from "lucide-react";
import Link from "next/link";

type CrmData = {
  leads: Array<{ id: string; name: string; company?: string; source?: string; interest?: string; status: string; estimated_value: number; next_follow_up_at?: string }>;
  deals: Array<{ id: string; title: string; stage: string; value: number; probability: number; expected_close_date?: string }>;
  activities: Array<{ id: string; summary: string; activity_type: string; status: string; due_at?: string }>;
  quotes: Array<{ id: string; quote_number: string; customer_name: string; total: number; status: string; valid_until?: string }>;
  campaigns: Array<{ id: string; name: string; status: string }>;
  metrics: { leads: number; qualifiedLeads: number; deals: number; openPipeline: number; wonValue: number; quoteValue: number; staleLeads: number; conversionRate: number };
  playbook: string[];
};

const empty: CrmData = {
  leads: [],
  deals: [],
  activities: [],
  quotes: [],
  campaigns: [],
  metrics: { leads: 0, qualifiedLeads: 0, deals: 0, openPipeline: 0, wonValue: 0, quoteValue: 0, staleLeads: 0, conversionRate: 0 },
  playbook: [],
};

const currency = new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 });

export default function CrmSalesConsole() {
  const [data, setData] = useState<CrmData>(empty);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/crm-sales", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تحميل CRM.");
      setData({ ...empty, ...json });
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل CRM.");
    } finally {
      setLoading(false);
    }
  }

  async function run(action: string, payload?: Record<string, unknown>) {
    setWorking(action);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/crm-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data: payload }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تنفيذ أمر CRM.");
      setMessage(messageFor(action));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تنفيذ أمر CRM.");
    } finally {
      setWorking("");
    }
  }

  function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run("lead", {
      name: String(form.get("name") || ""),
      company: String(form.get("company") || ""),
      phone: String(form.get("phone") || ""),
      email: String(form.get("email") || ""),
      source: String(form.get("source") || "manual"),
      interest: String(form.get("interest") || ""),
      estimatedValue: Number(form.get("estimatedValue") || 0),
    }).then(() => event.currentTarget.reset());
  }

  function submitDeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run("deal", {
      leadId: String(form.get("leadId") || ""),
      title: String(form.get("title") || ""),
      stage: String(form.get("stage") || "DISCOVERY"),
      value: Number(form.get("value") || 0),
      probability: Number(form.get("probability") || 25),
    }).then(() => event.currentTarget.reset());
  }

  function submitQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run("quote", {
      dealId: String(form.get("dealId") || ""),
      customerName: String(form.get("customerName") || ""),
      total: Number(form.get("total") || 0),
      items: [{ item: String(form.get("item") || "عرض تجاري"), amount: Number(form.get("total") || 0) }],
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
          <span className="eyebrow">
            <Users size={16} /> إدارة المبيعات و CRM
          </span>
          <h1>نظام تحويل التسويق إلى مبيعات</h1>
          <p>كل حملة أو فرصة تتحول إلى Lead، ثم صفقة، ثم عرض سعر، ثم متابعة حتى الإغلاق أو الرفض.</p>
          <div className="department-hero-actions">
            <span>Pipeline {currency.format(data.metrics.openPipeline)}</span>
            <span>Leads تحتاج متابعة {data.metrics.staleLeads}</span>
          </div>
        </div>
        <div className="department-badge">
          <strong>CRM OS</strong>
          <small>Sales pipeline</small>
        </div>
      </section>

      <section className="enterprise-actions">
        <button className="secondary-btn" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />} تحديث
        </button>
        <button className="primary-btn" onClick={() => run("campaign-lead")} disabled={Boolean(working) || data.campaigns.length === 0}>
          {working === "campaign-lead" ? <Loader2 className="spin" size={18} /> : <Send size={18} />} تحويل آخر حملة إلى Lead
        </button>
        {message && <p className="notice done">{message}</p>}
        {error && <p className="notice error">{error}</p>}
      </section>

      <section className="ops-metrics">
        <Metric label="Leads" value={data.metrics.leads} />
        <Metric label="Qualified" value={data.metrics.qualifiedLeads} />
        <Metric label="Deals" value={data.metrics.deals} />
        <Metric label="Pipeline" value={currency.format(data.metrics.openPipeline)} />
        <Metric label="Won" value={currency.format(data.metrics.wonValue)} />
        <Metric label="Quotes" value={currency.format(data.metrics.quoteValue)} />
      </section>

      <section className="ops-workbench">
        <form className="ops-card" onSubmit={submitLead}>
          <h2>Lead جديد</h2>
          <div className="ops-form-grid">
            <label>الاسم<input className="input" name="name" required /></label>
            <label>الشركة<input className="input" name="company" /></label>
            <label>الجوال<input className="input" name="phone" /></label>
            <label>الإيميل<input className="input" name="email" /></label>
            <label>المصدر<input className="input" name="source" defaultValue="marketing" /></label>
            <label>القيمة المتوقعة<input className="input" name="estimatedValue" type="number" min="0" /></label>
          </div>
          <label>الاهتمام<input className="input" name="interest" placeholder="ما المنتج أو العرض المطلوب؟" /></label>
          <button className="primary-btn" disabled={Boolean(working)}><Plus size={18} /> حفظ Lead</button>
        </form>

        <form className="ops-card" onSubmit={submitDeal}>
          <h2>صفقة جديدة</h2>
          <label>
            Lead
            <select className="input" name="leadId" defaultValue="">
              <option value="">بدون ربط</option>
              {data.leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name}</option>)}
            </select>
          </label>
          <div className="ops-form-grid">
            <label>العنوان<input className="input" name="title" required /></label>
            <label>المرحلة<select className="input" name="stage" defaultValue="DISCOVERY"><option>DISCOVERY</option><option>PROPOSAL</option><option>NEGOTIATION</option><option>WON</option><option>LOST</option></select></label>
            <label>القيمة<input className="input" name="value" type="number" min="0" /></label>
            <label>الاحتمال %<input className="input" name="probability" type="number" min="0" max="100" defaultValue="25" /></label>
          </div>
          <button className="secondary-btn" disabled={Boolean(working)}>حفظ الصفقة</button>
        </form>

        <form className="ops-card" onSubmit={submitQuote}>
          <h2>عرض سعر</h2>
          <label>
            الصفقة
            <select className="input" name="dealId" defaultValue="">
              <option value="">بدون ربط</option>
              {data.deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.title}</option>)}
            </select>
          </label>
          <label>اسم العميل<input className="input" name="customerName" required /></label>
          <label>البند<input className="input" name="item" placeholder="منتج أو خدمة" /></label>
          <label>الإجمالي<input className="input" name="total" type="number" min="0" /></label>
          <button className="secondary-btn" disabled={Boolean(working)}><FileText size={18} /> حفظ العرض</button>
        </form>
      </section>

      <section className="ops-board">
        <Panel title="Leads">
          {data.leads.slice(0, 8).map((lead) => (
            <Statement key={lead.id} label={`${lead.name} - ${lead.source || "manual"}`} value={`${lead.status} · ${currency.format(Number(lead.estimated_value || 0))}`} />
          ))}
        </Panel>
        <Panel title="Deals">
          {data.deals.slice(0, 8).map((deal) => (
            <Statement key={deal.id} label={deal.title} value={`${deal.stage} · ${currency.format(Number(deal.value || 0))} · ${deal.probability}%`} />
          ))}
        </Panel>
        <Panel title="Quotes & Playbook">
          {data.quotes.slice(0, 5).map((quote) => (
            <Statement key={quote.id} label={`${quote.quote_number} - ${quote.customer_name}`} value={`${quote.status} · ${currency.format(Number(quote.total || 0))}`} />
          ))}
          {data.playbook.map((item) => <Statement key={item} label={item} value="قاعدة" />)}
        </Panel>
      </section>
    </main>
  );
}

function messageFor(action: string) {
  if (action === "campaign-lead") return "تم تحويل آخر حملة إلى عميل محتمل.";
  if (action === "lead") return "تم حفظ العميل المحتمل.";
  if (action === "deal") return "تم حفظ الصفقة.";
  if (action === "quote") return "تم حفظ عرض السعر.";
  return "تم تنفيذ العملية.";
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="metric-card green">
      <span><BadgeDollarSign size={20} /></span>
      <small>{label}</small>
      <strong>{value}</strong>
    </article>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="ops-card"><h2>{title}</h2><div className="statement-list">{children}</div></section>;
}

function Statement({ label, value }: { label: string; value: string | number }) {
  return <div className="statement-row"><span>{label}</span><b>{value}</b></div>;
}
