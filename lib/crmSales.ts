import { getSupabaseAdmin } from "./supabase";

type LeadInput = {
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  source?: string;
  interest?: string;
  estimatedValue?: number;
  nextFollowUpAt?: string;
};

type DealInput = {
  leadId?: string;
  title: string;
  stage?: string;
  value?: number;
  probability?: number;
  expectedCloseDate?: string;
};

type ActivityInput = {
  leadId?: string;
  dealId?: string;
  activityType?: string;
  summary: string;
  nextStep?: string;
  dueAt?: string;
};

type QuoteInput = {
  dealId?: string;
  customerName: string;
  total?: number;
  validUntil?: string;
  items?: Array<Record<string, unknown>>;
};

function requireSupabase() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function defaultFollowUp() {
  const date = new Date();
  date.setDate(date.getDate() + 2);
  return date.toISOString();
}

export async function seedCrmSalesOS() {
  const supabase = requireSupabase();
  const { error: departmentError } = await supabase.from("departments").upsert(
    {
      id: "sales",
      name: "إدارة المبيعات وCRM",
      description: "إدارة العملاء المحتملين، الصفقات، العروض، المتابعات، والتحويل من التسويق إلى مبيعات.",
    },
    { onConflict: "id" }
  );
  if (departmentError) throw departmentError;

  const { error: integrationError } = await supabase.from("business_integrations").upsert(
    [
      { id: "crm-whatsapp", provider: "WhatsApp Sales Follow-up", status: "READY_FOR_CONNECTION", config: { scope: "crm_followup" } },
      { id: "crm-email", provider: "Email Sales Outreach", status: "READY_FOR_CONNECTION", config: { scope: "quotes_and_followups" } },
      { id: "crm-payment-link", provider: "Payment Link / Checkout", status: "READY_FOR_CONNECTION", config: { scope: "deal_to_payment" } },
    ],
    { onConflict: "id" }
  );
  if (integrationError) throw integrationError;
}

export async function getCrmSalesOS() {
  await seedCrmSalesOS();
  const supabase = requireSupabase();
  const [leads, deals, activities, quotes, campaigns] = await Promise.all([
    supabase.from("crm_leads").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("crm_deals").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("crm_activities").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("sales_quotes").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("marketing_campaigns").select("*").order("created_at", { ascending: false }).limit(25),
  ]);

  for (const result of [leads, deals, activities, quotes, campaigns]) {
    if (result.error) throw result.error;
  }

  const leadRows = leads.data || [];
  const dealRows = deals.data || [];
  const wonValue = dealRows.filter((deal: any) => deal.stage === "WON").reduce((sum: number, deal: any) => sum + number(deal.value), 0);
  const openPipeline = dealRows
    .filter((deal: any) => !["WON", "LOST"].includes(deal.stage))
    .reduce((sum: number, deal: any) => sum + number(deal.value) * (number(deal.probability) / 100), 0);
  const quoteValue = (quotes.data || []).reduce((sum: number, quote: any) => sum + number(quote.total), 0);
  const staleLeads = leadRows.filter((lead: any) => {
    if (["WON", "LOST"].includes(lead.status)) return false;
    if (!lead.next_follow_up_at) return true;
    return new Date(lead.next_follow_up_at).getTime() < Date.now();
  }).length;

  return {
    leads: leadRows,
    deals: dealRows,
    activities: activities.data || [],
    quotes: quotes.data || [],
    campaigns: campaigns.data || [],
    metrics: {
      leads: leadRows.length,
      qualifiedLeads: leadRows.filter((lead: any) => lead.status === "QUALIFIED").length,
      deals: dealRows.length,
      openPipeline,
      wonValue,
      quoteValue,
      staleLeads,
      conversionRate: leadRows.length ? dealRows.filter((deal: any) => deal.stage === "WON").length / leadRows.length : 0,
    },
    playbook: [
      "كل Lead يدخل من التسويق يجب أن يحصل على متابعة خلال 48 ساعة.",
      "كل صفقة فوق 5,000 ريال تحتاج عرض سعر واضح وسبب شراء.",
      "أي حملة تسويقية لا تنتج Leads تتحول لمراجعة Marketing + CEO.",
      "كل عميل محتمل له مصدر، قيمة تقديرية، وخطوة تالية.",
    ],
  };
}

export async function createLead(input: LeadInput) {
  if (!input.name?.trim()) throw new Error("Lead name is required.");
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("crm_leads")
    .insert({
      name: input.name.trim(),
      company: input.company?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      source: input.source || "manual",
      interest: input.interest || null,
      estimated_value: number(input.estimatedValue),
      status: "NEW",
      next_follow_up_at: input.nextFollowUpAt || defaultFollowUp(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createDeal(input: DealInput) {
  if (!input.title?.trim()) throw new Error("Deal title is required.");
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("crm_deals")
    .insert({
      lead_id: input.leadId || null,
      title: input.title.trim(),
      stage: input.stage || "DISCOVERY",
      value: number(input.value),
      probability: number(input.probability) || 25,
      expected_close_date: input.expectedCloseDate || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createActivity(input: ActivityInput) {
  if (!input.summary?.trim()) throw new Error("Activity summary is required.");
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("crm_activities")
    .insert({
      lead_id: input.leadId || null,
      deal_id: input.dealId || null,
      activity_type: input.activityType || "FOLLOW_UP",
      summary: input.summary.trim(),
      next_step: input.nextStep || null,
      due_at: input.dueAt || defaultFollowUp(),
      status: "OPEN",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createSalesQuote(input: QuoteInput) {
  if (!input.customerName?.trim()) throw new Error("Customer name is required.");
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("sales_quotes")
    .insert({
      deal_id: input.dealId || null,
      quote_number: `Q-${Date.now()}`,
      customer_name: input.customerName.trim(),
      total: number(input.total),
      status: "DRAFT",
      valid_until: input.validUntil || null,
      items: input.items || [],
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function convertLatestCampaignToLead() {
  await seedCrmSalesOS();
  const supabase = requireSupabase();
  const campaign = await supabase.from("marketing_campaigns").select("*").order("created_at", { ascending: false }).limit(1).single();
  if (campaign.error) throw campaign.error;
  return createLead({
    name: `Lead from ${campaign.data.name}`,
    company: campaign.data.product_name || "Marketing campaign prospect",
    source: campaign.data.channel_id || "marketing_campaign",
    interest: campaign.data.offer || campaign.data.name,
    estimatedValue: number(campaign.data.actual_revenue) || number(campaign.data.budget) * 2,
  });
}
