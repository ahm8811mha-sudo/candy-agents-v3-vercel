-- Advisor follow-up hardening after applying the full migration chain.
-- 1) orvanta_append_event was re-created by a later migration, which restored
--    the default PUBLIC execute grant on a SECURITY DEFINER function. Client
--    roles must never write events/outbox directly.
-- 2) Pin search_path on the tenant helper functions used inside RLS policies.

revoke all on function public.orvanta_append_event(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.orvanta_append_event(jsonb, jsonb) to service_role;

alter function public.orvanta_current_tenant() set search_path = public;
alter function public.orvanta_has_tenant_access(text) set search_path = public;

notify pgrst, 'reload schema';
