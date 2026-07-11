-- ORVANTA flexible authentication integrity patch
-- Run after docs/supabase-flexible-auth-workspaces.sql.

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
declare
  actual_employee_id text;
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
    updated_at = now()
  returning id into actual_employee_id;

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
    actual_employee_id,
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

revoke all on function public.provision_orvanta_workspace_user(uuid,text,text,text,text,text,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.provision_orvanta_workspace_user(uuid,text,text,text,text,text,text,text,text,boolean) to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_memberships_employee_id_fkey'
      and conrelid = 'public.workspace_memberships'::regclass
  ) then
    alter table public.workspace_memberships
      add constraint workspace_memberships_employee_id_fkey
      foreign key (employee_id)
      references public.employees(id)
      on delete set null;
  end if;
end $$;

notify pgrst, 'reload schema';
