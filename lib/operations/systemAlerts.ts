import { getSupabaseAdmin } from "../supabase";
import { triggerNotification } from "../integrations";

export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";

export type RaiseAlertInput = {
  tenantId: string;
  dedupeKey: string;
  severity: AlertSeverity;
  source: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

export async function raiseSystemAlert(input: RaiseAlertInput) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required for system alerts.");

  const { data, error } = await supabase.rpc("orvanta_raise_system_alert", {
    p_tenant_id: input.tenantId,
    p_dedupe_key: input.dedupeKey,
    p_severity: input.severity,
    p_source: input.source,
    p_title: input.title,
    p_message: input.message,
    p_entity_type: input.entityType || null,
    p_entity_id: input.entityId || null,
    p_metadata: input.metadata || {},
  });
  if (error) throw error;

  if (input.severity === "CRITICAL") {
    const recipient = process.env.ORVANTA_OWNER_EMAIL;
    await Promise.allSettled([
      triggerNotification("EMAIL", `${input.title}\n\n${input.message}`, recipient),
      triggerNotification("WEBHOOK", `${input.title}\n${input.message}`, recipient),
    ]);
  }
  return String(data || "");
}

export async function resolveSystemAlert(tenantId: string, dedupeKey: string, note = "Recovered automatically") {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc("orvanta_resolve_system_alert", {
    p_tenant_id: tenantId,
    p_dedupe_key: dedupeKey,
    p_note: note,
  });
  if (error) throw error;
  return Number(data || 0);
}

export async function acknowledgeSystemAlert(tenantId: string, id: string, actorId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required for system alerts.");
  const { data, error } = await supabase
    .from("system_alerts")
    .update({
      status: "ACKNOWLEDGED",
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: actorId,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .eq("status", "OPEN")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listSystemAlerts(tenantId: string, limit = 100) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("system_alerts")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("last_seen_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));
  if (error) throw error;
  return data || [];
}
