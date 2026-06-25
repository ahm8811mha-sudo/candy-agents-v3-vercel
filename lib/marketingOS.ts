import { calculateFinancials } from "./accountingSystem";
import { evaluateBusiness } from "./businessBrain";
import { getEnterpriseStatus, seedEnterpriseOperatingSystem } from "./enterpriseSystems";
import { getSupabaseAdmin } from "./supabase";

type CampaignInput = {
  productName: string;
  targetAudience: string;
  offer: string;
  channelId: string;
  budget: number;
  objective?: string;
};

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function requireSupabase() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function getMarketingOS() {
  await seedEnterpriseOperatingSystem();
  const [enterprise, financials] = await Promise.all([getEnterpriseStatus(), calculateFinancials()]);
  const intelligence = evaluateBusiness("تقييم ميزانية التسويق الحالية", financials);
  const campaigns = enterprise.marketingCampaigns || [];
  const totalBudget = campaigns.reduce((sum: number, campaign: any) => sum + number(campaign.budget), 0);
  const activeCampaigns = campaigns.filter((campaign: any) => ["ACTIVE", "TESTING", "READY"].includes(campaign.status)).length;
  const pilotBudget = Math.max(1500, Math.round(Math.max(financials.profit, 10000) * 0.15));

  return {
    enterprise,
    financials,
    marketingBrief: {
      activeCampaigns,
      totalBudget,
      pilotBudget,
      healthScore: intelligence.healthScore,
      riskLevel: intelligence.riskLevel,
      growthRule: "لا يتم توسيع حملة إلا بعد إثبات الهامش، CAC، ROAS، وقدرة التشغيل.",
      recommendedFocus:
        financials.profit > 0
          ? "اختبار حملتين صغيرتين: واحدة لالتقاط الطلب وواحدة لخلق الطلب، ثم مقارنة CAC وROAS."
          : "ابدأ بمحتوى عضوي ورسائل مبيعات مباشرة قبل رفع الإنفاق المدفوع.",
    },
    playbooks: [
      {
        title: "اختبار عرض المنتج",
        owner: "Marketing Innovation Lead",
        steps: ["صياغة عرض واحد واضح", "اختبار 3 رسائل", "قياس CTR وCVR", "تقرير قرار خلال 7 أيام"],
      },
      {
        title: "قمع النمو",
        owner: "Growth Manager",
        steps: ["Awareness", "Lead capture", "Offer page", "Retargeting", "Conversion", "Retention"],
      },
      {
        title: "حوكمة الإنفاق",
        owner: "CFO + Marketing",
        steps: ["سقف تجربة", "CAC target", "ROAS target", "Stop-loss", "CEO review"],
      },
    ],
  };
}

export async function createMarketingCampaign(input: CampaignInput) {
  if (!input.productName?.trim()) throw new Error("Product name is required.");
  if (!input.targetAudience?.trim()) throw new Error("Target audience is required.");
  if (!input.offer?.trim()) throw new Error("Offer is required.");

  const budget = number(input.budget);
  if (budget <= 0) throw new Error("Campaign budget must be greater than zero.");

  await seedEnterpriseOperatingSystem();
  const supabase = requireSupabase();
  const financials = await calculateFinancials();
  const intelligence = evaluateBusiness(`حملة تسويق ${input.productName} بميزانية ${budget}`, financials);
  const channelId = input.channelId || "google_ads";
  const kpis = buildCampaignKpis(budget, intelligence.riskLevel);

  const status = intelligence.approval.requiredRole === "NONE" ? "TESTING" : "PENDING_APPROVAL";
  const { data: campaign, error } = await supabase
    .from("marketing_campaigns")
    .insert({
      name: `${input.productName.trim()} - ${input.objective || "Pilot campaign"}`,
      product_name: input.productName.trim(),
      target_audience: input.targetAudience.trim(),
      offer: input.offer.trim(),
      channel_id: channelId,
      budget,
      status,
      kpis,
    })
    .select()
    .single();
  if (error) throw error;

  await supabase.from("business_actions").insert({
    action_type: "MARKETING_CAMPAIGN_REVIEW",
    title: `مراجعة حملة ${input.productName.trim()}`,
    description: `اختبار حملة بميزانية ${budget.toLocaleString("ar-SA")} ريال على قناة ${channelId}.`,
    status: status === "PENDING_APPROVAL" ? "WAITING_APPROVAL" : "QUEUED",
    execution_mode: "READY_FOR_INTEGRATION",
    provider: channelId,
    requires_approval: status === "PENDING_APPROVAL",
    approval_status: status === "PENDING_APPROVAL" ? "PENDING" : "NOT_REQUIRED",
    payload: { campaign_id: campaign.id, kpis, approval: intelligence.approval },
  });

  await supabase.from("ceo_office_items").insert({
    id: newId("ceo-item"),
    item_type: "MARKETING_REVIEW",
    title: `مراجعة حملة: ${input.productName.trim()}`,
    owner_role: "CEO Office",
    status: "PENDING",
    priority: status === "PENDING_APPROVAL" ? "HIGH" : "MEDIUM",
    due_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    notes: "مراجعة CAC وROAS والهامش قبل توسيع الحملة.",
    metadata: { campaign_id: campaign.id, kpis },
  });

  return campaign;
}

export async function createCampaignFromRadar() {
  const status = await getEnterpriseStatus();
  const radar = status.opportunityRuns?.[0];
  const opportunity = radar?.recommended_opportunity as any;

  if (!opportunity?.title) {
    throw new Error("No radar opportunity is available. Run the opportunity radar first.");
  }

  return createMarketingCampaign({
    productName: opportunity.title,
    targetAudience: "عملاء التجارة الإلكترونية في السعودية المهتمون بعروض قابلة للتجربة السريعة",
    offer: "عرض تجربة محدود مع قياس الطلب قبل التوسع",
    channelId: "meta_ads",
    budget: Math.max(1500, Math.round(number(opportunity.budget) * 0.25)),
    objective: "Radar opportunity pilot",
  });
}

function buildCampaignKpis(budget: number, riskLevel: string) {
  const cacTarget = Math.max(35, Math.round(budget / 55));
  const leadTarget = Math.max(25, Math.round(budget / Math.max(cacTarget, 1)));
  return {
    cac_target: cacTarget,
    roas_target: riskLevel === "HIGH" ? 1.4 : 2,
    conversion_rate_target: riskLevel === "HIGH" ? 0.018 : 0.03,
    leads_target: leadTarget,
    test_duration_days: 7,
    stop_loss: "Pause if CAC exceeds target by 25% or ROAS stays below target after 72 hours.",
    scale_rule: "Scale only when contribution margin, CAC, ROAS, and fulfillment capacity are proven.",
  };
}
