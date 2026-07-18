import { calculateFinancials } from "./accountingSystem";
import { evaluateBusiness } from "./businessBrain";
import { getEnterpriseStatus, seedEnterpriseOperatingSystem } from "./enterpriseSystems";
import { evaluateGovernedAction, logDecision } from "./governanceOS";
import { getSupabaseAdmin } from "./supabase";

type CampaignInput = {
  productName: string;
  targetAudience: string;
  offer: string;
  channelId: string;
  budget: number;
  objective?: string;
  productId?: string;
  segmentId?: string;
  offerId?: string;
  costCenterId?: string;
};

type ProductInput = {
  name: string;
  category?: string;
  unitCost?: number;
  targetPrice?: number;
};

type SegmentInput = {
  name: string;
  persona: string;
  painPoints?: string[];
  channels?: string[];
};

type OfferInput = {
  productId?: string;
  name: string;
  promise: string;
  price: number;
};

type ContentInput = {
  campaignId?: string;
  publishDate?: string;
  channel: string;
  topic: string;
};

type ABTestInput = {
  campaignId?: string;
  name: string;
  variantA: string;
  variantB: string;
  metric?: string;
};

type FunnelInput = {
  campaignId: string;
  stage: string;
  count: number;
  cost?: number;
  revenue?: number;
};

const seedProducts = [
  {
    id: "prod-gift-care-bundle",
    name: "Gift and Care Pilot Bundle",
    category: "commerce",
    unit_cost: 55,
    target_price: 129,
    gross_margin: 0.57,
    status: "TESTING",
  },
  {
    id: "prod-ai-commerce-service",
    name: "AI Commerce Service Package",
    category: "service",
    unit_cost: 120,
    target_price: 499,
    gross_margin: 0.76,
    status: "TESTING",
  },
];

const seedSegments = [
  {
    id: "seg-saudi-gift-buyers",
    name: "Saudi gift buyers",
    persona: "Busy buyers looking for useful, fast, and premium gift bundles.",
    pain_points: ["Last-minute gifting", "Trust in product quality", "Delivery speed"],
    channels: ["meta_ads", "tiktok_ads", "email_whatsapp"],
  },
  {
    id: "seg-small-commerce-founders",
    name: "Small commerce founders",
    persona: "Founders who need AI-assisted growth, ads, and operational execution.",
    pain_points: ["Weak marketing process", "Unclear CAC", "Low operational visibility"],
    channels: ["google_ads", "seo_content", "email_whatsapp"],
  },
];

const seedOffers = [
  {
    id: "offer-care-pilot",
    product_id: "prod-gift-care-bundle",
    name: "Limited validation offer",
    promise: "A small test bundle to validate demand before scaling inventory.",
    price: 129,
    status: "ACTIVE",
  },
  {
    id: "offer-ai-growth-sprint",
    product_id: "prod-ai-commerce-service",
    name: "AI growth sprint",
    promise: "Seven-day growth diagnosis with campaign, finance, and execution recommendations.",
    price: 499,
    status: "ACTIVE",
  },
];

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function slug(value: string, prefix: string) {
  return `${prefix}-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || Date.now()}`;
}

function requireSupabase() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

async function seedMarketingIntelligence() {
  const supabase = requireSupabase();
  const [products, segments, offers] = await Promise.all([
    supabase.from("marketing_products").upsert(seedProducts, { onConflict: "id" }),
    supabase.from("marketing_segments").upsert(seedSegments, { onConflict: "id" }),
    supabase.from("marketing_offers").upsert(seedOffers, { onConflict: "id" }),
  ]);
  for (const result of [products, segments, offers]) {
    if (result.error) throw result.error;
  }
}

export async function getMarketingOS() {
  await seedEnterpriseOperatingSystem();
  await seedMarketingIntelligence();
  const [enterprise, financials] = await Promise.all([getEnterpriseStatus(), calculateFinancials()]);
  const supabase = requireSupabase();
  const intelligence = evaluateBusiness("Marketing budget and growth evaluation", financials);
  const campaigns = enterprise.marketingCampaigns || [];
  const totalBudget = campaigns.reduce((sum: number, campaign: any) => sum + number(campaign.budget), 0);
  const actualSpend = campaigns.reduce((sum: number, campaign: any) => sum + number(campaign.actual_spend), 0);
  const actualRevenue = campaigns.reduce((sum: number, campaign: any) => sum + number(campaign.actual_revenue), 0);
  const activeCampaigns = campaigns.filter((campaign: any) => ["ACTIVE", "TESTING", "READY"].includes(campaign.status)).length;
  const pilotBudget = Math.max(1500, Math.round(Math.max(financials.profit, 10000) * 0.15));

  const [products, segments, offers, abTests, contentRows, funnelRows] = await Promise.all([
    supabase.from("marketing_products").select("*").order("created_at", { ascending: false }).limit(25),
    supabase.from("marketing_segments").select("*").order("created_at", { ascending: false }).limit(25),
    supabase.from("marketing_offers").select("*").order("created_at", { ascending: false }).limit(25),
    supabase.from("marketing_ab_tests").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.from("marketing_content_calendar").select("*").order("publish_date", { ascending: true }).limit(30),
    supabase.from("marketing_funnel_events").select("*").order("created_at", { ascending: false }).limit(60),
  ]);
  for (const result of [products, segments, offers, abTests, contentRows, funnelRows]) {
    if (result.error) throw result.error;
  }

  return {
    enterprise,
    financials,
    products: products.data || [],
    segments: segments.data || [],
    offers: offers.data || [],
    abTests: abTests.data || [],
    contentCalendar: contentRows.data || [],
    funnelEvents: funnelRows.data || [],
    marketingBrief: {
      activeCampaigns,
      totalBudget,
      actualSpend,
      actualRevenue,
      blendedRoas: actualSpend > 0 ? actualRevenue / actualSpend : 0,
      pilotBudget,
      healthScore: intelligence.healthScore,
      riskLevel: intelligence.riskLevel,
      growthRule: "Do not scale any campaign until margin, CAC, ROAS, and operating capacity are proven.",
      recommendedFocus:
        financials.profit > 0
          ? "Run two small tests: one demand-capture campaign and one demand-creation campaign, then compare CAC and ROAS."
          : "Start with organic content and direct sales messages before increasing paid spend.",
    },
    playbooks: [
      {
        title: "Product offer validation",
        owner: "Marketing Innovation Lead",
        steps: ["One clear offer", "Three message tests", "CTR and CVR review", "Decision report within 7 days"],
      },
      {
        title: "Growth funnel",
        owner: "Growth Manager",
        steps: ["Awareness", "Lead capture", "Offer page", "Retargeting", "Conversion", "Retention"],
      },
      {
        title: "Spend governance",
        owner: "CFO + Marketing",
        steps: ["Pilot cap", "CAC target", "ROAS target", "Stop-loss", "CEO review"],
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
  await seedMarketingIntelligence();
  const supabase = requireSupabase();
  const financials = await calculateFinancials();
  const intelligence = evaluateBusiness(`Marketing campaign ${input.productName} budget ${budget}`, financials);
  const channelId = input.channelId || "google_ads";
  const kpis = buildCampaignKpis(budget, intelligence.riskLevel);
  const { data: campaign, error } = await supabase
    .from("marketing_campaigns")
    .insert({
      name: `${input.productName.trim()} - ${input.objective || "Pilot campaign"}`,
      product_name: input.productName.trim(),
      target_audience: input.targetAudience.trim(),
      offer: input.offer.trim(),
      channel_id: channelId,
      budget,
      status: "PENDING_GOVERNANCE",
      cost_center_id: input.costCenterId || "cc-marketing",
      product_id: input.productId || null,
      segment_id: input.segmentId || null,
      offer_id: input.offerId || null,
      kpis,
    })
    .select()
    .single();
  if (error) throw error;

  let governance;
  try {
    governance = await evaluateGovernedAction({
      title: `Marketing campaign: ${input.productName}`,
      entityType: "marketing_campaigns",
      entityId: campaign.id,
      amount: budget,
      riskLevel: intelligence.riskLevel,
      actorRole: "Marketing Director",
      metadata: { actionKind: "MARKETING_CAMPAIGN", channelId, objective: input.objective },
    });
  } catch (governanceError) {
    await supabase.from("marketing_campaigns").delete().eq("id", campaign.id);
    throw governanceError;
  }

  const status = governance.allowedToExecute ? "TESTING" : "PENDING_APPROVAL";
  const { error: statusError } = await supabase.from("marketing_campaigns").update({ status }).eq("id", campaign.id);
  if (statusError) throw statusError;

  await supabase.from("business_actions").insert({
    action_type: "MARKETING_CAMPAIGN_REVIEW",
    title: `Review campaign ${input.productName.trim()}`,
    description: `Pilot campaign budget ${budget.toLocaleString("ar-SA")} SAR on ${channelId}.`,
    status: status === "PENDING_APPROVAL" ? "WAITING_APPROVAL" : "QUEUED",
    execution_mode: "READY_FOR_INTEGRATION",
    provider: channelId,
    requires_approval: status === "PENDING_APPROVAL",
    approval_status: governance.approvalStatus,
    payload: { campaign_id: campaign.id, kpis, approval: intelligence.approval, governance },
  });

  await supabase.from("ceo_office_items").insert({
    id: newId("ceo-item"),
    item_type: "MARKETING_REVIEW",
    title: `Campaign review: ${input.productName.trim()}`,
    owner_role: "CEO Office",
    status: "PENDING",
    priority: status === "PENDING_APPROVAL" ? "HIGH" : "MEDIUM",
    due_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    notes: "Review CAC, ROAS, contribution margin, and fulfillment capacity before scaling.",
    metadata: { campaign_id: campaign.id, kpis, governance },
  });

  await logDecision({
    decisionType: "MARKETING_CAMPAIGN_CREATED",
    entityType: "marketing_campaigns",
    entityId: campaign.id,
    actorRole: "Marketing Director",
    action: `Created campaign ${campaign.name}`,
    amount: budget,
    riskLevel: intelligence.riskLevel,
    approvalStatus: governance.approvalStatus,
    metadata: { kpis, governance },
  });

  return { ...campaign, status };
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
    targetAudience:
      opportunity.marketing_review?.target_audience || "Saudi e-commerce customers interested in practical gifts, care products, and validated offers",
    offer: opportunity.marketing_review?.offer || "Limited pilot offer designed to validate demand before scaling.",
    channelId: opportunity.marketing_review?.channel || "meta_ads",
    budget: Math.max(
      1500,
      Math.round(
        number(opportunity.marketing_review?.pilot_budget) ||
          number(opportunity.pilot_marketing_budget) ||
          number(opportunity.budget_breakdown?.marketing) ||
          number(opportunity.budget) * 0.25
      )
    ),
    objective: "Radar opportunity pilot",
    costCenterId: "cc-radar",
  });
}

export async function createMarketingProduct(input: ProductInput) {
  if (!input.name?.trim()) throw new Error("Product name is required.");
  const unitCost = number(input.unitCost);
  const targetPrice = number(input.targetPrice);
  const grossMargin = targetPrice > 0 ? (targetPrice - unitCost) / targetPrice : 0;
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("marketing_products")
    .upsert(
      {
        id: slug(input.name, "prod"),
        name: input.name.trim(),
        category: input.category || "commerce",
        unit_cost: unitCost,
        target_price: targetPrice,
        gross_margin: grossMargin,
        status: "TESTING",
      },
      { onConflict: "id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createMarketingSegment(input: SegmentInput) {
  if (!input.name?.trim() || !input.persona?.trim()) throw new Error("Segment name and persona are required.");
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("marketing_segments")
    .upsert(
      {
        id: slug(input.name, "seg"),
        name: input.name.trim(),
        persona: input.persona.trim(),
        pain_points: input.painPoints || [],
        channels: input.channels || ["seo_content", "email_whatsapp"],
      },
      { onConflict: "id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createMarketingOffer(input: OfferInput) {
  if (!input.name?.trim() || !input.promise?.trim()) throw new Error("Offer name and promise are required.");
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("marketing_offers")
    .upsert(
      {
        id: slug(input.name, "offer"),
        product_id: input.productId || null,
        name: input.name.trim(),
        promise: input.promise.trim(),
        price: number(input.price),
        status: "ACTIVE",
      },
      { onConflict: "id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createContentCalendarItem(input: ContentInput) {
  if (!input.channel?.trim() || !input.topic?.trim()) throw new Error("Channel and topic are required.");
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("marketing_content_calendar")
    .insert({
      id: newId("content"),
      campaign_id: input.campaignId || null,
      publish_date: input.publishDate || new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      channel: input.channel.trim(),
      topic: input.topic.trim(),
      status: "PLANNED",
      owner_role: "Marketing Director",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createABTest(input: ABTestInput) {
  if (!input.name?.trim() || !input.variantA?.trim() || !input.variantB?.trim()) {
    throw new Error("A/B test name and variants are required.");
  }
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("marketing_ab_tests")
    .insert({
      id: newId("ab-test"),
      campaign_id: input.campaignId || null,
      name: input.name.trim(),
      variant_a: input.variantA.trim(),
      variant_b: input.variantB.trim(),
      metric: input.metric || "CVR",
      status: "RUNNING",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function recordFunnelEvent(input: FunnelInput) {
  if (!input.campaignId || !input.stage?.trim()) throw new Error("Campaign and funnel stage are required.");
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("marketing_funnel_events")
    .insert({
      campaign_id: input.campaignId,
      stage: input.stage.trim(),
      count: number(input.count),
      cost: number(input.cost),
      revenue: number(input.revenue),
      metadata: { source: "marketing_os" },
    })
    .select()
    .single();
  if (error) throw error;

  const totals = await supabase.from("marketing_funnel_events").select("cost,revenue").eq("campaign_id", input.campaignId);
  if (!totals.error) {
    const actualSpend = (totals.data || []).reduce((sum: number, row: any) => sum + number(row.cost), 0);
    const actualRevenue = (totals.data || []).reduce((sum: number, row: any) => sum + number(row.revenue), 0);
    await supabase.from("marketing_campaigns").update({ actual_spend: actualSpend, actual_revenue: actualRevenue }).eq("id", input.campaignId);
  }

  return data;
}

export async function createProactiveMarketingPlan() {
  await seedMarketingIntelligence();
  const status = await getMarketingOS();
  const product = status.products?.[0];
  const segment = status.segments?.[0];
  const offer = status.offers?.[0];
  const budget = status.marketingBrief.pilotBudget;
  const campaign = await createMarketingCampaign({
    productName: product?.name || "AI-assisted commerce pilot",
    targetAudience: segment?.persona || "Validated commerce customers in Saudi Arabia",
    offer: offer?.promise || "Small pilot offer with measurable CAC and margin.",
    channelId: segment?.channels?.[0] || "seo_content",
    budget,
    objective: "Proactive AI Marketing Director plan",
    productId: product?.id,
    segmentId: segment?.id,
    offerId: offer?.id,
    costCenterId: "cc-marketing",
  });
  await createABTest({
    campaignId: campaign.id,
    name: "Offer promise test",
    variantA: "Limited pilot with fast delivery",
    variantB: "Premium bundle with measurable savings",
    metric: "CVR",
  });
  await createContentCalendarItem({
    campaignId: campaign.id,
    channel: "seo_content",
    topic: `Validation content for ${campaign.product_name || campaign.name}`,
  });
  return campaign;
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
