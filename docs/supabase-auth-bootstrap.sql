-- ORVANTA first-owner bootstrap guard
-- Prevents concurrent unauthenticated requests from creating multiple OWNER users.

create table if not exists public.auth_bootstrap_claims (
  id text primary key,
  claim_token uuid not null default gen_random_uuid(),
  email text not null,
  status text not null default 'CLAIMED' check (status in ('CLAIMED', 'COMPLETED')),
  user_id uuid,
  claimed_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  completed_at timestamptz,
  constraint auth_bootstrap_first_owner_only check (id = 'first-owner')
);

alter table public.auth_bootstrap_claims enable row level security;
revoke all on table public.auth_bootstrap_claims from anon, authenticated;
grant all on table public.auth_bootstrap_claims to service_role;

create or replace function public.claim_orvanta_first_owner(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  existing_claim public.auth_bootstrap_claims%rowtype;
  new_token uuid := gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtext('orvanta-first-owner-bootstrap'));

  if exists (select 1 from auth.users limit 1) then
    return null;
  end if;

  select *
  into existing_claim
  from public.auth_bootstrap_claims
  where id = 'first-owner'
  for update;

  if not found then
    insert into public.auth_bootstrap_claims (
      id, claim_token, email, status, claimed_at, expires_at
    ) values (
      'first-owner', new_token, lower(trim(p_email)), 'CLAIMED', now(), now() + interval '15 minutes'
    );
    return new_token;
  end if;

  if existing_claim.status = 'COMPLETED' then
    return null;
  end if;

  if existing_claim.expires_at > now() then
    return null;
  end if;

  update public.auth_bootstrap_claims
  set claim_token = new_token,
      email = lower(trim(p_email)),
      status = 'CLAIMED',
      user_id = null,
      claimed_at = now(),
      expires_at = now() + interval '15 minutes',
      completed_at = null
  where id = 'first-owner';

  return new_token;
end;
$$;

create or replace function public.complete_orvanta_first_owner(p_token uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.auth_bootstrap_claims
  set status = 'COMPLETED',
      user_id = p_user_id,
      completed_at = now(),
      expires_at = now()
  where id = 'first-owner'
    and claim_token = p_token
    and status = 'CLAIMED';

  return found;
end;
$$;

create or replace function public.release_orvanta_first_owner(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform pg_advisory_xact_lock(hashtext('orvanta-first-owner-bootstrap'));

  if exists (select 1 from auth.users limit 1) then
    return false;
  end if;

  delete from public.auth_bootstrap_claims
  where id = 'first-owner'
    and claim_token = p_token
    and status = 'CLAIMED';

  return found;
end;
$$;

revoke all on function public.claim_orvanta_first_owner(text) from public, anon, authenticated;
revoke all on function public.complete_orvanta_first_owner(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_orvanta_first_owner(uuid) from public, anon, authenticated;
grant execute on function public.claim_orvanta_first_owner(text) to service_role;
grant execute on function public.complete_orvanta_first_owner(uuid, uuid) to service_role;
grant execute on function public.release_orvanta_first_owner(uuid) to service_role;

notify pgrst, 'reload schema';
