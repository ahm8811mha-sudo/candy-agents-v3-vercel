import { getSupabaseAdmin } from "./supabase";
import { getTenantId } from "./tenant";

function requireSupabase() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required for accounting controls.");
  return supabase;
}

export async function createAccountingPeriod(input: {
  name: string;
  startsOn: string;
  endsOn: string;
}) {
  const supabase = requireSupabase();
  const tenantId = getTenantId();
  if (!input.name.trim()) throw new Error("اسم الفترة مطلوب.");
  if (input.endsOn < input.startsOn) throw new Error("نهاية الفترة لا يمكن أن تسبق بدايتها.");
  const { data, error } = await supabase.from("accounting_periods").insert({
    tenant_id: tenantId,
    period_name: input.name.trim(),
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    status: "OPEN",
  }).select("*").single();
  if (error) throw error;
  return data;
}

export async function closeAccountingPeriod(input: {
  periodId: string;
  actorId: string;
  note?: string;
}) {
  const supabase = requireSupabase();
  const tenantId = getTenantId();

  const trial = await getTrialBalance();
  const totalDebit = trial.reduce((sum, row) => sum + Number(row.total_debit || 0), 0);
  const totalCredit = trial.reduce((sum, row) => sum + Number(row.total_credit || 0), 0);
  if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) {
    throw new Error(`لا يمكن إقفال الفترة: ميزان المراجعة غير متوازن (${totalDebit} ≠ ${totalCredit}).`);
  }

  const { data, error } = await supabase.from("accounting_periods").update({
    status: "CLOSED",
    closed_at: new Date().toISOString(),
    closed_by: input.actorId,
    closing_note: input.note?.trim() || null,
    updated_at: new Date().toISOString(),
  }).eq("tenant_id", tenantId).eq("id", input.periodId).eq("status", "OPEN").select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("الفترة غير موجودة أو مقفلة مسبقًا.");
  return data;
}

export async function reverseAccountingEntry(input: {
  entryId: string;
  reversalDate: string;
  reason: string;
  actorId: string;
}) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc("orvanta_reverse_journal_entry", {
    p_tenant_id: getTenantId(),
    p_entry_id: input.entryId,
    p_reversal_date: input.reversalDate,
    p_reason: input.reason,
    p_actor_id: input.actorId,
  });
  if (error) throw error;
  return String(data);
}

export async function getTrialBalance() {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("accounting_trial_balance_v")
    .select("*")
    .eq("tenant_id", getTenantId())
    .order("code");
  if (error) throw error;
  return data || [];
}

export async function getOpenInvoices() {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("accounting_open_invoices_v")
    .select("*")
    .eq("tenant_id", getTenantId())
    .order("due_date", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getVatSummary() {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("accounting_vat_summary_v")
    .select("*")
    .eq("tenant_id", getTenantId())
    .order("period_month", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function listAccountingPeriods() {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("accounting_periods")
    .select("*")
    .eq("tenant_id", getTenantId())
    .order("starts_on", { ascending: false });
  if (error) throw error;
  return data || [];
}
