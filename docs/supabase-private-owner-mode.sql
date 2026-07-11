-- ORVANTA private-owner mode
-- Keeps the current installation owner-only while commercial onboarding remains disabled.
-- Safe to re-run.

create or replace function public.orvanta_owner_setup_state()
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  existing_claim public.auth_bootstrap_claims%rowtype;
begin
  if exists (select 1 from auth.users limit 1) then
    return 'READY';
  end if;

  select *
    into existing_claim
  from public.auth_bootstrap_claims
  where id = 'first-owner';

  if not found then
    return 'FIRST_OWNER_SETUP';
  end if;

  if existing_claim.status = 'CLAIMED'
     and existing_claim.expires_at is not null
     and existing_claim.expires_at > now() then
    return 'SETUP_IN_PROGRESS';
  end if;

  return 'FIRST_OWNER_SETUP';
end;
$$;

revoke all on function public.orvanta_owner_setup_state() from public, anon, authenticated;
grant execute on function public.orvanta_owner_setup_state() to service_role;

notify pgrst, 'reload schema';
