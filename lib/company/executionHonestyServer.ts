import { getSupabaseAdmin } from "../supabase";

/**
 * Server-side honesty sweep: reopens every DONE real-world task that lacks
 * the owner's confirmation (see orvanta_reopen_unproven_real_tasks). Returns
 * the number of reopened tasks; 0 when Supabase is not configured.
 */
export async function reopenUnprovenRealTasks(tenantId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc("orvanta_reopen_unproven_real_tasks", { p_tenant_id: tenantId });
  if (error) throw new Error(`Honesty sweep failed: ${error.message}`);
  return Number(data || 0);
}
