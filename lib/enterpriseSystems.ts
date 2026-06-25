import { calculateFinancials } from "./accountingSystem";
import { evaluateBusiness } from "./businessBrain";
import { evaluateGovernedAction, logDecision, seedGovernanceOS } from "./governanceOS";
import { getSupabaseAdmin } from "./supabase";

type AccountSeed = {
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  normal_balance: "DEBIT" | "CREDIT";
};

const accounts: AccountSeed[] = [
  { code: "1000", name: "Cash and bank", type: "ASSET", normal_balance: "DEBIT" },
  { code: "1100", name: "Accounts receivable", type: "ASSET", normal_balance: "DEBIT" },
  { code: "1200", name: "Inventory", type: "ASSET", normal_balance: "DEBIT" },
  { code: "2000", name: "Accounts payable", type: "LIABILITY", normal_balance: "CREDIT" },
  { code: "2100", name: "Tax payable", type: "LIABILITY", normal_balance: "CREDIT" },
  { code: "3000", name: "Owner equity", type: "EQUITY", normal_balance: "CREDIT" },
  { code: "4000", name: "Product revenue", type: "REVENUE", normal_balance: "CREDIT" },
  { code: "4100", name: "Service revenue", type: "REVENUE", normal_balance: "CREDIT" },
  { code: "5000", name: "Cost of goods sold", type: "EXPENSE", normal_balance: "DEBIT" },
  { code: "5100", name: "Marketing expense", type: "EXPENSE", normal_balance: "DEBIT" },
  { code: "5200", name: "Operations expense", type: "EXPENSE", normal_balance: "DEBIT" },
];

const marketingChannels = [
  { id: "google_ads", name: "Google Ads", funnel_stage: "DEMAND_CAPTURE", status: "READY_FOR_CONNECTION" },
  { id: "meta_ads", name: "Meta Ads", funnel_stage: "DEMAND_CREATION", status: "READY_FOR_CONNECTION" },
  { id: "tiktok_ads", name: "TikTok Ads", funnel_stage: "AWARENESS", status: "READY_FOR_CONNECTION" },
  { id: "seo_content", name: "SEO and content", funnel_stage: "ORGANIC_GROWTH", status: "ACTIVE" },
  { id: "email_whatsapp", name: "Email and WhatsApp", funnel_stage: "RETENTION", status: "READY_FOR_CONNECTION" },
];

const ceoCadence = [
  {
    item_type: "OPERATING_RHYTHM",
    title: "Daily executive standup",
    owner_role: "Chief of Staff",
    priority: "HIGH",
    cadence: "DAILY",
    notes: "Review blockers, approvals, cash position, active campaigns, and supply risks.",
  },
  {
    item_type: "BUSINESS_REVIEW",
    title: "Weekly CEO business review",
    owner_role: "CEO Office",
    priority: "HIGH",
    cadence: "WEEKLY",
    notes: "Review KPIs, budget variance, project delivery, opportunities, and next capital allocation.",
  },
  {
    item_type: "BOARD_PACK",
    title: "Monthly investor and board pack",
    owner_role: "CEO Office",
    priority: "MEDIUM",
    cadence: "MONTHLY",
    notes: "Prepare finance report, marketing ROI, operations status, risks, and investment decisions.",
  },
];

const commercialStrategy = {
  id: "company_thesis",
  focus: "AI-assisted commerce company focused on validated e-commerce opportunities, lean retail tests, and service/product experiments with measurable ROI.",
  investment_thesis:
    "Invest in small validated tests first, expand only when contribution margin, customer acquisition cost, and operational capacity are proven.",
  capital_rules: {
    pilot_budget_ratio: 0.15,
    cfo_gate_above: 5000,
    ceo_gate_above: 50000,
    stop_loss_rule: "Pause spend when CAC exceeds target or gross margin drops below 30%.",
  },
  target_markets: ["Saudi e-commerce", "gift products", "beauty and care products", "AI-enabled services"],
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getEnterpriseStatus() {
  const supabase = getSupabaseAdmin();
  const financials = await calculateFinancials();
  const intelligence = evaluateBusiness("تشغيل يومي للشركة", financials);

  if (!supabase) {
    return {
      financials,
      intelligence,
      accounts: [],
      journalEntries: [],
      ceoItems: [],
      marketingChannels: [],
      marketingCampaigns: [],
      opportunityRuns: [],
      strategy: commercialStrategy,
      configured: false,
    };
  }

  const [accountRows, journalRows, ceoRows, channelRows, campaignRows, radarRows, strategyRows, auditRows] =
    await Promise.all([
      supabase.from("accounting_accounts").select("*").order("code", { ascending: true }),
      supabase.from("accounting_journal_entries").select("*").order("created_at", { ascending: false }).limit(10),
      supabase.from("ceo_office_items").select("*").order("created_at", { ascending: false }).limit(20),
      supabase.from("marketing_channels").select("*").order("name", { ascending: true }),
      supabase.from("marketing_campaigns").select("*").order("created_at", { ascending: false }).limit(10),
      supabase.from("opportunity_radar_runs").select("*").order("created_at", { ascending: false }).limit(10),
      supabase.from("company_strategy").select("*").limit(1),
      supabase.from("decision_audit_log").select("*").order("created_at", { ascending: false }).limit(10),
    ]);

  for (const result of [accountRows, journalRows, ceoRows, channelRows, campaignRows, radarRows, strategyRows, auditRows]) {
    if (result.error) throw result.error;
  }

  return {
    financials,
    intelligence,
    accounts: accountRows.data || [],
    journalEntries: journalRows.data || [],
    ceoItems: ceoRows.data || [],
    marketingChannels: channelRows.data || [],
    marketingCampaigns: campaignRows.data || [],
    opportunityRuns: radarRows.data || [],
    strategy: strategyRows.data?.[0] || commercialStrategy,
    audits: auditRows.data || [],
    configured: true,
  };
}

export async function seedEnterpriseOperatingSystem() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  await seedGovernanceOS();

  const { error: accountError } = await supabase.from("accounting_accounts").upsert(
    accounts.map((account) => ({ ...account, is_system: true })),
    { onConflict: "code" }
  );
  if (accountError) throw accountError;

  const { error: channelError } = await supabase.from("marketing_channels").upsert(marketingChannels, {
    onConflict: "id",
  });
  if (channelError) throw channelError;

  const { error: strategyError } = await supabase.from("company_strategy").upsert(commercialStrategy, {
    onConflict: "id",
  });
  if (strategyError) throw strategyError;

  const { error: ceoError } = await supabase.from("ceo_office_items").upsert(
    ceoCadence.map((item) => ({
      id: item.item_type.toLowerCase(),
      ...item,
      status: "ACTIVE",
      metadata: { source: "enterprise_os_seed" },
    })),
    { onConflict: "id" }
  );
  if (ceoError) throw ceoError;

  return getEnterpriseStatus();
}

export async function runOpportunityRadar(source = "MANUAL") {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  await seedEnterpriseOperatingSystem();

  if (source === "DAILY_CRON") {
    const existing = await supabase
      .from("opportunity_radar_runs")
      .select("id, created_at")
      .gte("created_at", `${todayIso()}T00:00:00.000Z`)
      .limit(1);
    if (existing.error) throw existing.error;
    if (existing.data?.length) {
      return { skipped: true, reason: "Radar already ran today.", run: existing.data[0] };
    }
  }

  const status = await getEnterpriseStatus();
  const requestedBudget = Math.max(5000, Math.round(Math.max(status.financials.profit, 10000) * 0.2));
  const pilotMarketingBudget = Math.max(1500, Math.round(requestedBudget * 0.25));
  const isCashPositive = status.financials.profit > 0;
  const candidates = [
    {
      title: "Lean commerce pilot for gift and care products",
      profitability: isCashPositive ? 82 : 58,
      risk: status.intelligence.riskLevel === "HIGH" ? 45 : 22,
      capacity: isCashPositive ? 75 : 55,
      channel: "meta_ads",
    },
    {
      title: "AI-enabled service package for small commerce teams",
      profitability: 74,
      risk: 30,
      capacity: 80,
      channel: "seo_content",
    },
    {
      title: "Organic demand validation sprint before paid expansion",
      profitability: isCashPositive ? 60 : 72,
      risk: 18,
      capacity: 88,
      channel: "seo_content",
    },
  ].map((candidate) => ({
    ...candidate,
    score: Math.round(candidate.profitability * 0.45 + (100 - candidate.risk) * 0.3 + candidate.capacity * 0.25),
  }));
  const best = candidates.sort((a, b) => b.score - a.score)[0];
  const opportunity = {
    title: best.title,
    thesis: status.strategy?.investment_thesis || commercialStrategy.investment_thesis,
    budget: requestedBudget,
    pilot_marketing_budget: pilotMarketingBudget,
    expected_roi: isCashPositive ? 35 : 18,
    risk: status.intelligence.riskLevel,
    opportunity_score: best.score,
    commercial_fit:
      "Fits the company direction: AI-assisted commerce, small validated tests, and expansion only after margin/CAC/operations are proven.",
    marketing_tests: [
      "One offer page or sales message",
      "One paid or organic channel test",
      "CAC and conversion check after 72 hours",
      "CEO review after 7 days",
    ],
    financial_gate: requestedBudget > 5000 ? "CFO approval required before spend" : "Pilot spend allowed",
    decision_path: "CFO budget check -> Marketing pilot -> CEO review -> scale, modify, or stop",
    next_step: "CFO validates pilot budget, Marketing launches a limited test, CEO Office reviews evidence after 7 days.",
  };

  const { data: run, error: runError } = await supabase
    .from("opportunity_radar_runs")
    .insert({
      source,
      status: "PROPOSED",
      signal_summary: "Daily opportunity scan based on financial health, existing operating data, and company thesis.",
      recommended_opportunity: opportunity,
    cfo_required: requestedBudget > 5000,
    ceo_required: requestedBudget > 50000 || status.intelligence.riskLevel !== "LOW",
  })
    .select()
    .single();
  if (runError) throw runError;

  const scoreRows = candidates.map((candidate) => ({
    radar_run_id: run.id,
    opportunity_title: candidate.title,
    profitability_score: candidate.profitability,
    risk_score: candidate.risk,
    capacity_score: candidate.capacity,
    total_score: candidate.score,
    recommendation:
      candidate.title === best.title
        ? "Recommended for the next pilot cycle."
        : "Keep in watchlist until better margin or capacity signal appears.",
    metadata: { channel: candidate.channel, source },
  }));
  const { error: scoreError } = await supabase.from("opportunity_scores").insert(scoreRows);
  if (scoreError) throw scoreError;

  const governance = await evaluateGovernedAction({
    title: `Opportunity radar pilot: ${opportunity.title}`,
    entityType: "opportunity_radar_runs",
    entityId: run.id,
    amount: requestedBudget,
    riskLevel: status.intelligence.riskLevel,
    actorRole: "Opportunity Radar",
    metadata: { opportunity },
  });

  const { data: campaign, error: campaignError } = await supabase
    .from("marketing_campaigns")
    .insert({
      name: `${opportunity.title} - Radar draft`,
      product_name: opportunity.title,
      target_audience: "Saudi e-commerce customers interested in practical gifts, care products, and validated offers.",
      offer: "Limited pilot offer designed to validate demand before operational expansion.",
      channel_id: best.channel,
      budget: pilotMarketingBudget,
      status: governance.allowedToExecute ? "RADAR_DRAFT" : "PENDING_APPROVAL",
      cost_center_id: "cc-radar",
      kpis: {
        cac_target: Math.max(35, Math.round(pilotMarketingBudget / 55)),
        roas_target: isCashPositive ? 2 : 1.3,
        conversion_rate_target: isCashPositive ? 0.03 : 0.018,
        test_duration_days: 7,
        stop_loss: "Pause if CAC exceeds target by 25% or ROAS stays below target after 72 hours.",
      },
    })
    .select()
    .single();
  if (campaignError) throw campaignError;

  const { error: ceoError } = await supabase.from("ceo_office_items").insert({
    id: newId("ceo-item"),
    item_type: "OPPORTUNITY_REVIEW",
    title: opportunity.title,
    owner_role: "CEO Office",
    status: "PENDING",
    priority: status.intelligence.riskLevel === "HIGH" ? "URGENT" : "HIGH",
    due_at: new Date(Date.now() + 86400000).toISOString(),
    notes: opportunity.next_step,
    metadata: { radar_run_id: run.id, campaign_id: campaign.id, governance, opportunity },
  });
  if (ceoError) throw ceoError;

  const { error: actionError } = await supabase.from("business_actions").insert({
    action_type: "PROACTIVE_OPPORTUNITY_REVIEW",
    title: "Review proactive opportunity radar proposal",
    description: opportunity.next_step,
    status: "WAITING_APPROVAL",
    execution_mode: "INTERNAL",
    provider: "CEO Office + CFO + Marketing",
    requires_approval: true,
    approval_status: "PENDING",
    payload: { radar_run_id: run.id, campaign_id: campaign.id, governance, opportunity },
  });
  if (actionError) throw actionError;

  await logDecision({
    decisionType: "OPPORTUNITY_RADAR_CREATED",
    entityType: "marketing_campaigns",
    entityId: campaign.id,
    actorRole: "Opportunity Radar",
    action: `Created radar-linked campaign draft for ${opportunity.title}`,
    amount: pilotMarketingBudget,
    riskLevel: status.intelligence.riskLevel,
    approvalStatus: governance.approvalStatus,
    metadata: { radar_run_id: run.id, campaign_id: campaign.id, opportunity },
  });

  return { skipped: false, run, campaign, governance, candidates, opportunity };
}
