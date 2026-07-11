-- ORVANTA zero-trust database hardening
-- Run after supabase-core-completion.sql.
--
-- The application uses server-side service-role access. Authenticated browser
-- clients may only access rows whose tenant_id equals the JWT tenant claim.
-- Anonymous clients receive no company rows and cannot write company data.

create schema if not exists extensions;

-- Move pgvector out of the exposed public schema. Existing vector columns retain
-- their type OID; future migrations should use extensions.vector explicitly.
do $$
begin
  if exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'vector' and n.nspname = 'public'
  ) then
    alter extension vector set schema extensions;
  end if;
end $$;

-- Lock helper function search paths and the SECURITY DEFINER RPC.
alter function public.orvanta_current_tenant() set search_path = public, auth;
alter function public.orvanta_has_tenant_access(text) set search_path = public, auth;
alter function public.orvanta_append_event(jsonb, jsonb) set search_path = public;
revoke all on function public.orvanta_append_event(jsonb, jsonb) from public;
revoke execute on function public.orvanta_append_event(jsonb, jsonb) from anon;
revoke execute on function public.orvanta_append_event(jsonb, jsonb) from authenticated;
grant execute on function public.orvanta_append_event(jsonb, jsonb) to service_role;

-- Every RLS-enabled application table becomes tenant-scoped. Existing policies
-- are removed because any permissive legacy policy would OR with the new tenant
-- policy and silently defeat isolation.
do $$
declare
  item record;
  policy_item record;
  index_name text;
begin
  for item in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity = true
      and c.relname not in ('workflow_definitions')
  loop
    execute format(
      'alter table public.%I add column if not exists tenant_id text not null default %L',
      item.table_name,
      'golden-star'
    );

    index_name := left(item.table_name, 48) || '_tenant_isolation_idx';
    execute format(
      'create index if not exists %I on public.%I (tenant_id)',
      index_name,
      item.table_name
    );

    for policy_item in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = item.table_name
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        policy_item.policyname,
        item.table_name
      );
    end loop;

    execute format(
      'create policy orvanta_tenant_select on public.%I for select to authenticated using (public.orvanta_has_tenant_access(tenant_id))',
      item.table_name
    );
    execute format(
      'create policy orvanta_tenant_insert on public.%I for insert to authenticated with check (public.orvanta_has_tenant_access(tenant_id))',
      item.table_name
    );
    execute format(
      'create policy orvanta_tenant_update on public.%I for update to authenticated using (public.orvanta_has_tenant_access(tenant_id)) with check (public.orvanta_has_tenant_access(tenant_id))',
      item.table_name
    );
    execute format(
      'create policy orvanta_tenant_delete on public.%I for delete to authenticated using (public.orvanta_has_tenant_access(tenant_id))',
      item.table_name
    );

    execute format('revoke all on table public.%I from anon', item.table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', item.table_name);
    execute format('grant all on table public.%I to service_role', item.table_name);
  end loop;
end $$;

-- Workflow definitions are global, immutable runtime configuration.
alter table public.workflow_definitions enable row level security;
do $$
declare
  policy_item record;
begin
  for policy_item in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'workflow_definitions'
  loop
    execute format('drop policy if exists %I on public.workflow_definitions', policy_item.policyname);
  end loop;
end $$;
create policy orvanta_workflow_definition_read
  on public.workflow_definitions
  for select to authenticated
  using (auth.uid() is not null);
revoke all on table public.workflow_definitions from anon;
grant select on table public.workflow_definitions to authenticated;
grant all on table public.workflow_definitions to service_role;

-- Server-only append/audit infrastructure: browser users may read their tenant
-- records through RLS, but cannot create or mutate authoritative system events.
revoke insert, update, delete on table public.event_outbox from authenticated;
revoke insert, update, delete on table public.company_events from authenticated;
revoke insert, update, delete on table public.policy_decisions from authenticated;
revoke insert, update, delete on table public.operational_telemetry from authenticated;
revoke insert, update, delete on table public.model_execution_log from authenticated;

notify pgrst, 'reload schema';
