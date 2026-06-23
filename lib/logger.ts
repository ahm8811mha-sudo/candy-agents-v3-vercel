import { getSupabaseAdmin } from "./supabase";

export async function logActivity(input: { actorId?: string; action: string; entityType?: string; entityId?: string; metadata?: Record<string, unknown> }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) { console.info("[activity]", input); return; }
  await supabase.from("activity_logs").insert({
    actor_id: input.actorId ?? null,
    action: input.action,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function logError(code: string, error: unknown, metadata?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${code}]`, message, metadata ?? {});
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase.from("external_sync_logs").insert({ provider: "system", entity_type: code, status: "FAILED", error_message: message });
}
