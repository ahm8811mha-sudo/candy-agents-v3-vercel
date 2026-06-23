import { getSupabaseAdmin } from "./supabase";

const rowId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export async function logActivity(input: { actorId?: string; action: string; entityType?: string; entityId?: string; metadata?: Record<string, unknown> }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase.from("activity_logs").insert({
    id: rowId("activity"),
    actor_id: input.actorId ?? null,
    action: input.action,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function logError(code: string, caught: unknown) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const message = caught instanceof Error ? caught.message : String(caught);
  await supabase.from("external_sync_logs").insert({
    id: rowId("sync"),
    provider: "system",
    entity_type: code,
    status: "FAILED",
    error_message: message,
  });
}
