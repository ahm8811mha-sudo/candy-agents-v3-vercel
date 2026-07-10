-- ORVANTA Company OS — core completion migration
-- Apply after:
--   1) docs/supabase-schema.sql
--   2) docs/supabase-multitenant.sql
--   3) docs/enable-pgvector.sql
--   4) docs/supabase-world-class-os.sql
--
-- Review in a staging Supabase project first. This migration is designed to be
-- re-runnable. Service-role server calls bypass RLS; browser clients do not.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tenant columns on every operational table used by the company core.
-- Existing rows are assigned to tenant zero.
-- ---------------------------------------------------------------------------
alter table if exists approvals add column if not exists tenant_id text not null default 'golden-star';
alter table if exists projects add column if not exists tenant_id text not null default 'golden-star';
alter table if exists tasks add column if not exists tenant_id text not null default 'golden-star';
alter table if exists business_kpis add column if not exists tenant_id text not null default 'golden-star';
alter table if exists business_alerts add column if not exists tenant_id text not null default 'golden-star';
alter table if exists business_actions add column if not exists tenant_id text not null default 'golden-star';
alter table if exists business_memory add column if not exists tenant_id text not null default 'golden-star';
alter table if exists financial_decisions add column if not exists tenant_id text not null default 'golden-star';
alter table if exists employees add column if not exists tenant_id text not null default 'golden-star';

alter table if exists projects add column if not exists workflow_instance_id uuid;
alter table if exists business_actions add column if not exists workflow_instance_id uuid;
alter table if exists decision_packets add column if not exists workflow_instance_id uuid;

create index if not exists approvals_tenant_idx on approvals (tenant_id, status, created_at desc);
create index if not exists projects_tenant_idx on projects (tenant_id, status, created_at desc);
create index if not exists tasks_tenant_idx on tasks (tenant_id, project_id, status);
create index if not exists business_kpis_tenant_idx on business_kpis (tenant_id, project_id, status);
create index if not exists business_alerts_tenant_idx on business_alerts (tenant_id, status, created_at desc);
create index if not exists business_actions_tenant_idx on business_actions (tenant_id, status, created_at desc);
create index if not exists business_memory_tenant_idx on business_memory (tenant_id, created_at desc);
create index if not exists financial_decisions_tenant_idx on financial_decisions (tenant_id, created_at desc);
create index if not exists employees_tenant_idx on employees (tenant_id, email);
create unique index if not exists projects_workflow_instance_uidx on projects (tenant_id, workflow_instance_id) where workflow_instance_id is not null;
create index if not exists business_actions_workflow_idx on business_actions (tenant_id, workflow_instance_id, status) where workflow_instance_id is not null;
create unique index if not exists decision_packets_workflow_uidx on decision_packets (tenant_id, workflow_instance_id) where workflow_instance_id is not null;

-- Required by the reconciliation and knowledge upsert contracts.
create unique index if not exists execution_reconciliations_action_uidx
  on execution_reconciliations (tenant_id, action_id) where action_id is not null;
create unique index if not exists knowledge_edges_relation_uidx
  on knowledge_edges (tenant_id, from_node_id, to_node_id, relationship);

alter table if exists event_outbox add column if not exists delivery_result jsonb;
alter table if exists event_outbox add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- Policy decisions and operational telemetry.
-- ---------------------------------------------------------------------------
create table if not exists policy_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  actor_id text not null,
  actor_role text not null,
  operation text not null,
  entity_type text,
  entity_id text,
  risk_level text not null,
  allowed boolean not null,
  required_approvals jsonb not null default '[]',
  missing_approvals jsonb not null default '[]',
  controls jsonb not null default '[]',
  reasons jsonb not null default '[]',
  policy_version text not null,
  created_at timestamptz not null default now()
);
create index if not exists policy_decisions_tenant_idx on policy_decisions (tenant_id, created_at desc);
create index if not exists policy_decisions_entity_idx on policy_decisions (tenant_id, entity_type, entity_id, created_at desc);

create table if not exists operational_telemetry (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  correlation_id text not null,
  operation text not null,
  category text not null,
  status text not null,
  duration_ms integer not null default 0,
  actor_id text,
  entity_type text,
  entity_id text,
  attributes jsonb not null default '{}',
  error text,
  created_at timestamptz not null default now()
);
create index if not exists operational_telemetry_tenant_time_idx on operational_telemetry (tenant_id, created_at desc);
create index if not exists operational_telemetry_correlation_idx on operational_telemetry (tenant_id, correlation_id, created_at);
create index if not exists operational_telemetry_errors_idx on operational_telemetry (tenant_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Atomic event + outbox append. The same transaction either records both rows
-- or records neither. Server code calls this via Supabase RPC.
-- ---------------------------------------------------------------------------
create or replace function public.orvanta_append_event(p_event jsonb, p_outbox jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into company_events (
    id, tenant_id, event_type, event_version, actor_id, actor_type,
    entity_type, entity_id, correlation_id, causation_id, payload, occurred_at
  ) values (
    p_event->>'id',
    p_event->>'tenant_id',
    p_event->>'event_type',
    coalesce((p_event->>'event_version')::integer, 1),
    p_event->>'actor_id',
    p_event->>'actor_type',
    p_event->>'entity_type',
    p_event->>'entity_id',
    p_event->>'correlation_id',
    nullif(p_event->>'causation_id', ''),
    coalesce(p_event->'payload', '{}'::jsonb),
    (p_event->>'occurred_at')::timestamptz
  ) on conflict (id) do nothing;

  insert into event_outbox (
    id, tenant_id, event_type, aggregate_type, aggregate_id,
    correlation_id, causation_id, payload, status, attempts,
    available_at, created_at, updated_at
  ) values (
    p_outbox->>'id',
    p_outbox->>'tenant_id',
    p_outbox->>'event_type',
    p_outbox->>'aggregate_type',
    p_outbox->>'aggregate_id',
    p_outbox->>'correlation_id',
    nullif(p_outbox->>'causation_id', ''),
    coalesce(p_outbox->'payload', '{}'::jsonb),
    coalesce(p_outbox->>'status', 'PENDING'),
    coalesce((p_outbox->>'attempts')::integer, 0),
    (p_outbox->>'available_at')::timestamptz,
    (p_outbox->>'created_at')::timestamptz,
    now()
  ) on conflict (id) do nothing;
end;
$$;

revoke all on function public.orvanta_append_event(jsonb, jsonb) from public;
grant execute on function public.orvanta_append_event(jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Tenant claim helpers. Users must carry app_metadata.tenant_id in the JWT.
-- ---------------------------------------------------------------------------
create or replace function public.orvanta_current_tenant()
returns text
language sql
stable
as $$
  select nullif(coalesce(
    auth.jwt() -> 'app_metadata' ->> 'tenant_id',
    auth.jwt() -> 'user_metadata' ->> 'tenant_id'
  ), '');
$$;

create or replace function public.orvanta_has_tenant_access(row_tenant text)
returns boolean
language sql
stable
as $$
  select auth.role() = 'service_role'
    or (auth.uid() is not null and row_tenant = public.orvanta_current_tenant());
$$;

-- ---------------------------------------------------------------------------
-- RLS policies. Recreate named policies safely for all tenant-scoped tables.
-- ---------------------------------------------------------------------------
do $$
declare
  table_name text;
  tenant_tables text[] := array[
    'audit_log','company_approvals','company_decisions','approvals','company_ideas',
    'projects','tasks','business_kpis','business_alerts','business_actions',
    'business_memory','financial_decisions','ledger_entries','zatca_invoices',
    'sales_income','sales_changes','employees','company_objectives','opportunities',
    'decision_packets','decision_approvals','risk_register','workflow_instances',
    'workflow_steps','company_events','event_outbox','knowledge_nodes','knowledge_edges',
    'lessons_learned','budget_commitments','execution_reconciliations',
    'executive_board_sessions','model_execution_log','policy_decisions','operational_telemetry'
  ];
begin
  foreach table_name in array tenant_tables loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('drop policy if exists orvanta_tenant_select on public.%I', table_name);
      execute format('drop policy if exists orvanta_tenant_insert on public.%I', table_name);
      execute format('drop policy if exists orvanta_tenant_update on public.%I', table_name);
      execute format('drop policy if exists orvanta_tenant_delete on public.%I', table_name);
      execute format(
        'create policy orvanta_tenant_select on public.%I for select using (public.orvanta_has_tenant_access(tenant_id))',
        table_name
      );
      execute format(
        'create policy orvanta_tenant_insert on public.%I for insert with check (public.orvanta_has_tenant_access(tenant_id))',
        table_name
      );
      execute format(
        'create policy orvanta_tenant_update on public.%I for update using (public.orvanta_has_tenant_access(tenant_id)) with check (public.orvanta_has_tenant_access(tenant_id))',
        table_name
      );
      execute format(
        'create policy orvanta_tenant_delete on public.%I for delete using (public.orvanta_has_tenant_access(tenant_id))',
        table_name
      );
    end if;
  end loop;
end $$;

-- The workflow definition catalogue is global read-only configuration.
alter table if exists workflow_definitions enable row level security;
drop policy if exists orvanta_workflow_definition_read on workflow_definitions;
create policy orvanta_workflow_definition_read on workflow_definitions for select using (auth.uid() is not null or auth.role() = 'service_role');

-- Prevent browser roles from calling the atomic append function or touching the
-- outbox as a publisher. RLS still permits tenant reads for operational UI.
revoke insert, update, delete on event_outbox from anon, authenticated;
revoke insert, update, delete on company_events from anon, authenticated;
revoke insert, update, delete on policy_decisions from anon, authenticated;
revoke insert, update, delete on operational_telemetry from anon, authenticated;

notify pgrst, 'reload schema';
