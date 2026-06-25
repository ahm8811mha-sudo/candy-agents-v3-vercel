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
  actual_spend?: number;
  actual_revenue?: number;
  ltv?: number;
  status: string;
  kpis?: Record<string, any>;
};

type MarketingData = {
  marketingBrief?: {
    activeCampaigns: number;
    totalBudget: number;
    actualSpend: number;
    actualRevenue: number;
    blendedRoas: number;
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
  products?: Array<{ id: string; name: string; category: string; gross_margin: number; status: string }>;
  segments?: Array<{ id: string; name: string; persona: string; channels?: string[] }>;
  offers?: Array<{ id: string; name: string; promise: string; price: number; status: string }>;
  abTests?: Array<{ id: string; name: string; metric: string; status: string; variant_a: string; variant_b: string }>;
  contentCalendar?: Array<{ id: string; publish_date: string; channel: string; topic: string; status: string }>;
  funnelEvents?: Array<{ id: string; stage: string; count: number; cost: number; revenue: number }>;
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

  async function run(
    action: "campaign" | "from-radar" | "proactive-plan" | "product" | "segment" | "offer" | "content" | "ab-test" | "funnel-event",
    payload?: Record<string, unknown>
  ) {
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
      setMessage(marketingMessage(action));
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
      productId: String(form.get("productId") || ""),
      segmentId: String(form.get("segmentId") || ""),
      offerId: String(form.get("offerId") || ""),
    }).then(() => event.currentTarget.reset());
  }

  function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run("product", {
      name: String(form.get("name") || ""),
      category: String(form.get("category") || "commerce"),
      unitCost: Number(form.get("unitCost") || 0),
      targetPrice: Number(form.get("targetPrice") || 0),
    }).then(() => event.currentTarget.reset());
  }

  function submitSegment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run("segment", {
      name: String(form.get("name") || ""),
      persona: String(form.get("persona") || ""),
      painPoints: String(form.get("painPoints") || "").split(",").map((item) => item.trim()).filter(Boolean),
      channels: String(form.get("channels") || "seo_content,email_whatsapp").split(",").map((item) => item.trim()).filter(Boolean),
    }).then(() => event.currentTarget.reset());
  }

  function submitOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run("offer", {
      productId: String(form.get("productId") || ""),
      name: String(form.get("name") || ""),
      promise: String(form.get("promise") || ""),
      price: Number(form.get("price") || 0),
    }).then(() => event.currentTarget.reset());
  }

  useEffect(() => {
    load();
  }, []);

  const brief = data?.marketingBrief;
  const channels = data?.enterprise?.marketingChannels || [];
  const campaigns = data?.enterprise?.marketingCampaigns || [];
  const products = data?.products || [];
  const segments = data?.segments || [];
  const offers = data?.offers || [];

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
        <button className="secondary-btn" onClick={() => run("proactive-plan")} disabled={Boolean(working)}>
          {working === "proactive-plan" ? <Loader2 className="spin" size={18} /> : <BrainCircuit size={18} />}
          خطة مبادرة من مدير التسويق
        </button>
        <button
          className="secondary-btn"
          onClick={() =>
            run("ab-test", {
              campaignId: campaigns[0]?.id,
              name: "Message angle test",
              variantA: "Offer with faster delivery",
              variantB: "Offer with higher value bundle",
              metric: "CVR",
            })
          }
          disabled={Boolean(working) || campaigns.length === 0}
        >
          اختبار A/B للحملة الأولى
        </button>
        <button
          className="secondary-btn"
          onClick={() =>
            run("content", {
              campaignId: campaigns[0]?.id,
              channel: "seo_content",
              topic: "محتوى يشرح العرض ويقيس الطلب",
            })
          }
          disabled={Boolean(working) || campaigns.length === 0}
        >
          جدولة محتوى
        </button>
        <button
          className="secondary-btn"
          onClick={() =>
            run("funnel-event", {
              campaignId: campaigns[0]?.id,
              stage: "Lead",
              count: 25,
              cost: 350,
              revenue: 1200,
            })
          }
          disabled={Boolean(working) || campaigns.length === 0}
        >
          تسجيل Funnel
        </button>
        {message && <p className="notice done">{message}</p>}
        {error && <p className="notice error">{error}</p>}
      </section>

      <section className="ops-metrics">
        <Metric icon={Megaphone} label="حملات نشطة" value={String(brief?.activeCampaigns || 0)} />
        <Metric icon={BadgePercent} label="ميزانية التسويق" value={currency.format(brief?.totalBudget || 0)} />
        <Metric icon={BadgePercent} label="الإنفاق الفعلي" value={currency.format(brief?.actualSpend || 0)} />
        <Metric icon={BarChart3} label="الإيراد من الحملات" value={currency.format(brief?.actualRevenue || 0)} />
        <Metric icon={BarChart3} label="ROAS مدمج" value={`${(brief?.blendedRoas || 0).toFixed(2)}x`} />
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
            <label>
              المنتج المسجل
              <select className="input" name="productId" defaultValue="">
                <option value="">بدون ربط</option>
                {products.map((product) => (
                  <option value={product.id} key={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              الشريحة
              <select className="input" name="segmentId" defaultValue="">
                <option value="">بدون ربط</option>
                {segments.map((segment) => (
                  <option value={segment.id} key={segment.id}>
                    {segment.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              العرض
              <select className="input" name="offerId" defaultValue="">
                <option value="">بدون ربط</option>
                {offers.map((offer) => (
                  <option value={offer.id} key={offer.id}>
                    {offer.name}
                  </option>
                ))}
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

      <section className="ops-workbench">
        <form className="ops-card" onSubmit={submitProduct}>
          <h2>منتج جديد</h2>
          <div className="ops-form-grid">
            <label>
              الاسم
              <input className="input" name="name" placeholder="باقة هدايا وعناية" required />
            </label>
            <label>
              التصنيف
              <input className="input" name="category" defaultValue="commerce" />
            </label>
            <label>
              تكلفة الوحدة
              <input className="input" name="unitCost" type="number" min="0" step="1" placeholder="55" />
            </label>
            <label>
              سعر البيع المستهدف
              <input className="input" name="targetPrice" type="number" min="0" step="1" placeholder="129" />
            </label>
          </div>
          <button className="secondary-btn" disabled={Boolean(working)}>
            حفظ المنتج
          </button>
        </form>

        <form className="ops-card" onSubmit={submitSegment}>
          <h2>شريحة عملاء</h2>
          <label>
            الاسم
            <input className="input" name="name" placeholder="عملاء الهدايا في السعودية" required />
          </label>
          <label>
            الوصف
            <textarea className="textarea compact" name="persona" placeholder="من هم؟ ماذا يريدون؟ ما الذي يمنعهم من الشراء؟" required />
          </label>
          <label>
            الألم / الحاجة
            <input className="input" name="painPoints" placeholder="سرعة التوصيل, الثقة, السعر" />
          </label>
          <label>
            القنوات
            <input className="input" name="channels" defaultValue="meta_ads,tiktok_ads,email_whatsapp" />
          </label>
          <button className="secondary-btn" disabled={Boolean(working)}>
            حفظ الشريحة
          </button>
        </form>

        <form className="ops-card" onSubmit={submitOffer}>
          <h2>عرض تسويقي</h2>
          <label>
            المنتج
            <select className="input" name="productId" defaultValue={products[0]?.id || ""}>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            اسم العرض
            <input className="input" name="name" placeholder="عرض تجربة محدود" required />
          </label>
          <label>
            الوعد
            <input className="input" name="promise" placeholder="اختبر الطلب قبل التوسع" required />
          </label>
          <label>
            السعر
            <input className="input" name="price" type="number" min="0" step="1" placeholder="129" />
          </label>
          <button className="secondary-btn" disabled={Boolean(working)}>
            حفظ العرض
          </button>
        </form>
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

      <section className="ops-board">
        <Panel title="المنتجات والشرائح">
          {products.slice(0, 5).map((product) => (
            <Statement key={product.id} label={`${product.name} - ${product.category}`} value={`${Math.round(Number(product.gross_margin) * 100)}% margin`} />
          ))}
          {segments.slice(0, 5).map((segment) => (
            <Statement key={segment.id} label={segment.name} value={(segment.channels || []).join(", ")} />
          ))}
        </Panel>
        <Panel title="العروض والتقويم">
          {offers.slice(0, 4).map((offer) => (
            <Statement key={offer.id} label={`${offer.name}: ${offer.promise}`} value={currency.format(Number(offer.price))} />
          ))}
          {(data?.contentCalendar || []).slice(0, 5).map((item) => (
            <Statement key={item.id} label={`${item.publish_date} - ${item.topic}`} value={item.channel} />
          ))}
        </Panel>
        <Panel title="A/B و Funnel">
          {(data?.abTests || []).slice(0, 5).map((test) => (
            <Statement key={test.id} label={`${test.name}: ${test.variant_a} / ${test.variant_b}`} value={test.status} />
          ))}
          {(data?.funnelEvents || []).slice(0, 5).map((event) => (
            <Statement key={event.id} label={`${event.stage}: ${event.count}`} value={`${currency.format(Number(event.cost))} / ${currency.format(Number(event.revenue))}`} />
          ))}
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

function marketingMessage(action: string) {
  if (action === "from-radar") return "تم تحويل آخر فرصة إلى حملة تجريبية.";
  if (action === "proactive-plan") return "تم إنشاء خطة تسويق مبادرة مع اختبار وتقويم محتوى.";
  if (action === "product") return "تم حفظ المنتج.";
  if (action === "segment") return "تم حفظ شريحة العملاء.";
  if (action === "offer") return "تم حفظ العرض التسويقي.";
  if (action === "content") return "تم حفظ عنصر التقويم.";
  if (action === "ab-test") return "تم إنشاء اختبار A/B.";
  if (action === "funnel-event") return "تم تسجيل حدث Funnel.";
  return "تم إنشاء الحملة وربطها بالحوكمة.";
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
