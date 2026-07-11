-- ORVANTA flexible authentication and workspace onboarding
-- Supports one codebase with founder, licensed company, and invited employee flows.
-- Run after the core tenant/RLS helpers and docs/supabase-auth-bootstrap.sql.

create table if not exists public.orvanta_workspaces (
  id text primary key,
  name text not null,
  mode text not null check (mode in ('FOUNDER', 'COMPANY')),
  owner_user_id uuid,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED', 'ARCHIVED')),
  plan text not null default 'FOUNDER',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.orvanta_workspaces(id) on delete cascade,
  user_id uuid not null,
  employee_id text,
  role text not null check (role in ('ADMIN','OWNER','CEO','CFO','COO','CRO','CGO','MANAGER','EMPLOYEE','VIEWER')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','SUSPENDED','REVOKED')),
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.workspace_activation_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  workspace_id text not null unique,
  workspace_name text not null,
  plan text not null default 'COMPANY',
  status text not null default 'ACTIVE' check (status in ('ACTIVE','CLAIMED','COMPLETED','REVOKED')),
  claimed_by_email text,
  claim_token uuid,
  claim_expires_at timestamptz,
  used_by_user_id uuid,
  expires_at timestamptz,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.orvanta_workspaces(id) on delete cascade,
  code_hash text not null unique,
  email text,
  role text not null default 'EMPLOYEE' check (role in ('ADMIN','OWNER','CEO','CFO','COO','CRO','CGO','MANAGER','EMPLOYEE','VIEWER')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','CLAIMED','COMPLETED','REVOKED')),
  claim_token uuid,
  claimed_by_email text,
  claim_expires_at timestamptz,
  used_by_user_id uuid,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists orvanta_workspaces_mode_status_idx
  on public.orvanta_workspaces (mode, status, created_at desc);
create index if not exists workspace_memberships_user_idx
  on public.workspace_memberships (user_id, status, created_at desc);
create index if not exists workspace_memberships_workspace_idx
  on public.workspace_memberships (workspace_id, status, role);
create index if not exists workspace_activation_codes_status_idx
  on public.workspace_activation_codes (status, expires_at, created_at desc);
create index if not exists workspace_invites_workspace_status_idx
  on public.workspace_invites (workspace_id, status, expires_at);

alter table public.orvanta_workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.workspace_activation_codes enable row level security;
alter table public.workspace_invites enable row level security;

revoke all on table public.orvanta_workspaces from anon;
revoke all on table public.workspace_memberships from anon;
revoke all on table public.workspace_activation_codes from anon, authenticated;
revoke all on table public.workspace_invites from anon, authenticated;

grant select on table public.orvanta_workspaces to authenticated;
grant select on table public.workspace_memberships to authenticated;
grant all on table public.orvanta_workspaces to service_role;
grant all on table public.workspace_memberships to service_role;
grant all on table public.workspace_activation_codes to service_role;
grant all on table public.workspace_invites to service_role;

drop policy if exists orvanta_workspace_select on public.orvanta_workspaces;
create policy orvanta_workspace_select
  on public.orvanta_workspaces
  for select to authenticated
  using (public.orvanta_has_tenant_access(id));

drop policy if exists orvanta_membership_select on public.workspace_memberships;
create policy orvanta_membership_select
  on public.workspace_memberships
  for select to authenticated
  using (public.orvanta_has_tenant_access(workspace_id));

create or replace function public.provision_orvanta_workspace_user(
  p_user_id uuid,
  p_employee_id text,
  p_workspace_id text,
  p_workspace_name text,
  p_workspace_mode text,
  p_plan text,
  p_name text,
  p_email text,
  p_role text,
  p_create_workspace boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_role not in ('ADMIN','OWNER','CEO','CFO','COO','CRO','CGO','MANAGER','EMPLOYEE','VIEWER') then
    raise exception 'Invalid workspace role';
  end if;

  if p_workspace_mode not in ('FOUNDER','COMPANY') then
    raise exception 'Invalid workspace mode';
  end if;

  if p_create_workspace then
    insert into public.orvanta_workspaces (
      id, name, mode, owner_user_id, status, plan, metadata, updated_at
    ) values (
      p_workspace_id,
      p_workspace_name,
      p_workspace_mode,
      p_user_id,
      'ACTIVE',
      coalesce(nullif(p_plan, ''), case when p_workspace_mode = 'FOUNDER' then 'FOUNDER' else 'COMPANY' end),
      jsonb_build_object('provisionedBy', 'auth-onboarding'),
      now()
    )
    on conflict (id) do update set
      name = excluded.name,
      owner_user_id = coalesce(public.orvanta_workspaces.owner_user_id, excluded.owner_user_id),
      updated_at = now();
  elsif not exists (
    select 1 from public.orvanta_workspaces where id = p_workspace_id and status = 'ACTIVE'
  ) then
    raise exception 'Workspace is not active';
  end if;

  insert into public.employees (
    id,
    auth_user_id,
    full_name,
    email,
    role,
    job_title,
    status,
    joined_at,
    tenant_id,
    updated_at
  ) values (
    p_employee_id,
    p_user_id,
    p_name,
    lower(trim(p_email)),
    p_role,
    case when p_role = 'OWNER' then 'مالك الشركة' else 'عضو فريق' end,
    'ACTIVE',
    current_date,
    p_workspace_id,
    now()
  )
  on conflict (email) do update set
    auth_user_id = excluded.auth_user_id,
    full_name = excluded.full_name,
    role = excluded.role,
    tenant_id = excluded.tenant_id,
    status = 'ACTIVE',
    updated_at = now();

  insert into public.workspace_memberships (
    workspace_id,
    user_id,
    employee_id,
    role,
    status,
    is_primary,
    updated_at
  ) values (
    p_workspace_id,
    p_user_id,
    p_employee_id,
    p_role,
    'ACTIVE',
    true,
    now()
  )
  on conflict (workspace_id, user_id) do update set
    employee_id = excluded.employee_id,
    role = excluded.role,
    status = 'ACTIVE',
    updated_at = now();

  return true;
end;
$$;

create or replace function public.claim_orvanta_activation_code(
  p_code_hash text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data public.workspace_activation_codes%rowtype;
  new_token uuid := gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtext('orvanta-activation:' || p_code_hash));

  select * into row_data
  from public.workspace_activation_codes
  where code_hash = p_code_hash
  for update;

  if not found
     or row_data.status in ('COMPLETED','REVOKED')
     or (row_data.expires_at is not null and row_data.expires_at <= now())
     or (row_data.status = 'CLAIMED' and coalesce(row_data.claim_expires_at, now() + interval '1 hour') > now()) then
    return null;
  end if;

  update public.workspace_activation_codes
  set status = 'CLAIMED',
      claimed_by_email = lower(trim(p_email)),
      claim_token = new_token,
      claim_expires_at = now() + interval '15 minutes'
  where id = row_data.id;

  return jsonb_build_object(
    'id', row_data.id,
    'claimToken', new_token,
    'workspaceId', row_data.workspace_id,
    'workspaceName', row_data.workspace_name,
    'plan', row_data.plan
  );
end;
$$;

create or replace function public.complete_orvanta_activation_code(
  p_id uuid,
  p_claim_token uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.workspace_activation_codes
  set status = 'COMPLETED',
      used_by_user_id = p_user_id,
      completed_at = now(),
      claim_expires_at = now()
  where id = p_id
    and claim_token = p_claim_token
    and status = 'CLAIMED';
  return found;
end;
$$;

create or replace function public.release_orvanta_activation_code(
  p_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.workspace_activation_codes
  set status = 'ACTIVE',
      claimed_by_email = null,
      claim_token = null,
      claim_expires_at = null
  where id = p_id
    and claim_token = p_claim_token
    and status = 'CLAIMED';
  return found;
end;
$$;

create or replace function public.claim_orvanta_workspace_invite(
  p_code_hash text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data public.workspace_invites%rowtype;
  workspace_name text;
  new_token uuid := gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtext('orvanta-invite:' || p_code_hash));

  select * into row_data
  from public.workspace_invites
  where code_hash = p_code_hash
  for update;

  if not found
     or row_data.status in ('COMPLETED','REVOKED')
     or row_data.expires_at <= now()
     or (row_data.email is not null and lower(trim(row_data.email)) <> lower(trim(p_email)))
     or (row_data.status = 'CLAIMED' and coalesce(row_data.claim_expires_at, now() + interval '1 hour') > now()) then
    return null;
  end if;

  select name into workspace_name
  from public.orvanta_workspaces
  where id = row_data.workspace_id and status = 'ACTIVE';

  if workspace_name is null then
    return null;
  end if;

  update public.workspace_invites
  set status = 'CLAIMED',
      claimed_by_email = lower(trim(p_email)),
      claim_token = new_token,
      claim_expires_at = now() + interval '15 minutes'
  where id = row_data.id;

  return jsonb_build_object(
    'id', row_data.id,
    'claimToken', new_token,
    'workspaceId', row_data.workspace_id,
    'workspaceName', workspace_name,
    'role', row_data.role
  );
end;
$$;

create or replace function public.complete_orvanta_workspace_invite(
  p_id uuid,
  p_claim_token uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.workspace_invites
  set status = 'COMPLETED',
      used_by_user_id = p_user_id,
      completed_at = now(),
      claim_expires_at = now()
  where id = p_id
    and claim_token = p_claim_token
    and status = 'CLAIMED';
  return found;
end;
$$;

create or replace function public.release_orvanta_workspace_invite(
  p_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.workspace_invites
  set status = 'ACTIVE',
      claimed_by_email = null,
      claim_token = null,
      claim_expires_at = null
  where id = p_id
    and claim_token = p_claim_token
    and status = 'CLAIMED';
  return found;
end;
$$;

revoke all on function public.provision_orvanta_workspace_user(uuid,text,text,text,text,text,text,text,text,boolean) from public, anon, authenticated;
revoke all on function public.claim_orvanta_activation_code(text,text) from public, anon, authenticated;
revoke all on function public.complete_orvanta_activation_code(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.release_orvanta_activation_code(uuid,uuid) from public, anon, authenticated;
revoke all on function public.claim_orvanta_workspace_invite(text,text) from public, anon, authenticated;
revoke all on function public.complete_orvanta_workspace_invite(uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.release_orvanta_workspace_invite(uuid,uuid) from public, anon, authenticated;

grant execute on function public.provision_orvanta_workspace_user(uuid,text,text,text,text,text,text,text,text,boolean) to service_role;
grant execute on function public.claim_orvanta_activation_code(text,text) to service_role;
grant execute on function public.complete_orvanta_activation_code(uuid,uuid,uuid) to service_role;
grant execute on function public.release_orvanta_activation_code(uuid,uuid) to service_role;
grant execute on function public.claim_orvanta_workspace_invite(text,text) to service_role;
grant execute on function public.complete_orvanta_workspace_invite(uuid,uuid,uuid) to service_role;
grant execute on function public.release_orvanta_workspace_invite(uuid,uuid) to service_role;

notify pgrst, 'reload schema';
