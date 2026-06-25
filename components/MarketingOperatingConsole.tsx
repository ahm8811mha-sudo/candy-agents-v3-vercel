"use client";

import { FormEvent, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BadgePercent,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Loader2,
  Megaphone,
  RefreshCw,
  Rocket,
  Target,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

type MarketingCampaign = {
  id: string;
  name: string;
  product_name?: string;
  target_audience?: string;
  offer?: string;
  budget: number;
  status: string;
  kpis?: Record<string, any>;
};

type MarketingData = {
  marketingBrief?: {
    activeCampaigns: number;
    totalBudget: number;
    pilotBudget: number;
    healthScore: number;
    riskLevel: string;
    growthRule: string;
    recommendedFocus: string;
  };
  enterprise?: {
    marketingChannels?: Array<{ id: string; name: string; funnel_stage: string; status: string }>;
    marketingCampaigns?: MarketingCampaign[];
    opportunityRuns?: Array<{ id: string; status: string; signal_summary: string }>;
    strategy?: { focus?: string; investment_thesis?: string; target_markets?: string[] };
  };
  playbooks?: Array<{ title: string; owner: string; steps: string[] }>;
};

const currency = new Intl.NumberFormat("ar-SA", {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 0,
});

export default function MarketingOperatingConsole() {
  const [data, setData] = useState<MarketingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/marketing-os", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تحميل إدارة التسويق.");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل إدارة التسويق.");
    } finally {
      setLoading(false);
    }
  }

  async function run(action: "campaign" | "from-radar", payload?: Record<string, unknown>) {
    setWorking(action);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/marketing-os", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data: payload }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذر تنفيذ أمر التسويق.");
      setMessage(action === "from-radar" ? "تم تحويل آخر فرصة إلى حملة تجريبية." : "تم إنشاء الحملة وربطها بالحوكمة.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تنفيذ أمر التسويق.");
    } finally {
      setWorking("");
    }
  }

  function submitCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run("campaign", {
      productName: String(form.get("productName") || ""),
      targetAudience: String(form.get("targetAudience") || ""),
      offer: String(form.get("offer") || ""),
      channelId: String(form.get("channelId") || "google_ads"),
      budget: Number(form.get("budget") || 0),
      objective: String(form.get("objective") || "Pilot campaign"),
    }).then(() => event.currentTarget.reset());
  }

  useEffect(() => {
    load();
  }, []);

  const brief = data?.marketingBrief;
  const channels = data?.enterprise?.marketingChannels || [];
  const campaigns = data?.enterprise?.marketingCampaigns || [];

  return (
    <main className="company-app ops-console">
      <section className="department-hero department-hero-live">
        <div>
          <Link className="back-link" href="/">
            <ArrowRight size={16} /> العودة للشركة
          </Link>
          <span className="eyebrow">
            <Megaphone size={16} /> إدارة التسويق
          </span>
          <h1>نظام تسويق ونمو احترافي</h1>
          <p>
            إدارة تسويق مسؤولة عن المنتج، الجمهور، العرض، القنوات، CAC، ROAS، القمع التسويقي، التجارب، وربط التوسع بقرارات مالية وتنفيذية.
          </p>
          <div className="department-hero-actions">
            <span>
              <Target size={16} /> Pilot budget {currency.format(brief?.pilotBudget || 0)}
            </span>
            <span>
              <BrainCircuit size={16} /> Risk {brief?.riskLevel || "LOW"}
            </span>
          </div>
        </div>
        <div className="department-badge">
          <strong>Growth OS</strong>
          <small>World-class funnel</small>
        </div>
      </section>

      <section className="enterprise-actions">
        <button className="secondary-btn" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
          تحديث التسويق
        </button>
        <button className="primary-btn" onClick={() => run("from-radar")} disabled={Boolean(working)}>
          {working === "from-radar" ? <Loader2 className="spin" size={18} /> : <Rocket size={18} />}
          تحويل آخر فرصة إلى حملة
        </button>
        {message && <p className="notice done">{message}</p>}
        {error && <p className="notice error">{error}</p>}
      </section>

      <section className="ops-metrics">
        <Metric icon={Megaphone} label="حملات نشطة" value={String(brief?.activeCampaigns || 0)} />
        <Metric icon={BadgePercent} label="ميزانية التسويق" value={currency.format(brief?.totalBudget || 0)} />
        <Metric icon={BarChart3} label="صحة النمو" value={`${brief?.healthScore || 0}/100`} />
        <Metric icon={Users} label="القنوات" value={String(channels.length)} />
      </section>

      <section className="ops-card executive-brief">
        <span className="eyebrow">
          <CheckCircle2 size={16} /> قاعدة النمو
        </span>
        <h2>{brief?.recommendedFocus}</h2>
        <p>{brief?.growthRule}</p>
      </section>

      <section className="ops-workbench">
        <form className="ops-card" onSubmit={submitCampaign}>
          <h2>إنشاء حملة تسويق تجريبية</h2>
          <div className="ops-form-grid">
            <label>
              المنتج
              <input className="input" name="productName" placeholder="منتجات عناية وهدايا" required />
            </label>
            <label>
              القناة
              <select className="input" name="channelId" defaultValue="google_ads">
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name} - {channel.funnel_stage}
                  </option>
                ))}
              </select>
            </label>
            <label>
              الميزانية
              <input className="input" name="budget" type="number" min="1" step="1" defaultValue={brief?.pilotBudget || 1500} required />
            </label>
            <label>
              الهدف
              <select className="input" name="objective" defaultValue="Demand validation">
                <option value="Demand validation">إثبات الطلب</option>
                <option value="Lead generation">توليد عملاء محتملين</option>
                <option value="Conversion pilot">تجربة تحويل</option>
                <option value="Retention">احتفاظ وعودة شراء</option>
              </select>
            </label>
          </div>
          <label>
            الجمهور المستهدف
            <textarea className="textarea compact" name="targetAudience" placeholder="من هو العميل؟ ما حاجته؟ أين يتواجد؟" required />
          </label>
          <label>
            العرض التسويقي
            <input className="input" name="offer" placeholder="عرض محدود، باقة تجربة، أو ميزة سعرية واضحة" required />
          </label>
          <button className="primary-btn" disabled={Boolean(working)}>
            {working === "campaign" ? <Loader2 className="spin" size={18} /> : <Rocket size={18} />}
            إنشاء الحملة وربط KPIs
          </button>
        </form>

        <section className="ops-card">
          <h2>قنوات التسويق العالمية</h2>
          <div className="statement-list">
            {channels.map((channel) => (
              <Statement key={channel.id} label={`${channel.name} - ${channel.funnel_stage}`} value={channel.status} />
            ))}
          </div>
        </section>
      </section>

      <section className="ops-board">
        <Panel title="الحملات">
          {campaigns.length === 0 && <p className="muted">لا توجد حملات بعد. أنشئ حملة أو حوّل فرصة من الرادار.</p>}
          {campaigns.map((campaign) => (
            <CampaignRow key={campaign.id} campaign={campaign} />
          ))}
        </Panel>
        <Panel title="Playbooks التسويق">
          {(data?.playbooks || []).map((playbook) => (
            <div className="playbook-row" key={playbook.title}>
              <strong>{playbook.title}</strong>
              <small>{playbook.owner}</small>
              <p>{playbook.steps.join(" -> ")}</p>
            </div>
          ))}
        </Panel>
        <Panel title="التوجه التجاري">
          <p className="muted">{data?.enterprise?.strategy?.focus}</p>
          <Statement label="أطروحة الاستثمار" value={data?.enterprise?.strategy?.investment_thesis || "اختبارات صغيرة ثم توسع مشروط"} />
          <Statement label="الأسواق" value={(data?.enterprise?.strategy?.target_markets || []).join("، ")} />
        </Panel>
      </section>
    </main>
  );
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

function Statement({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="statement-row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function CampaignRow({ campaign }: { campaign: MarketingCampaign }) {
  const kpis = campaign.kpis || {};
  return (
    <div className="campaign-row">
      <div>
        <strong>{campaign.name}</strong>
        <small>{campaign.target_audience}</small>
      </div>
      <div className="campaign-kpis">
        <span>Budget {currency.format(Number(campaign.budget))}</span>
        <span>CAC {kpis.cac_target || "-"}</span>
        <span>ROAS {kpis.roas_target || "-"}</span>
        <span>{campaign.status}</span>
      </div>
    </div>
  );
}
