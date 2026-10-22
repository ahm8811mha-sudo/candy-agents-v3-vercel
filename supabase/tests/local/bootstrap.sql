-- Throwaway databases only (the local harness and the CI job). Stands in for
-- what Supabase and the earlier migrations provide, so the release migrations
-- can be applied and their suites run without a copy of production. Never
-- applied to staging or production.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end
$$;

create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select null::jsonb $$;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select null::text $$;

create schema if not exists storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text
);
alter table storage.objects enable row level security;

-- The slice of the core tables that orvanta_update_task_status touches.
create table public.projects (id uuid primary key, tenant_id text not null, name text, request text, status text);
create table public.tasks (
  id text primary key,
  tenant_id text not null,
  project_id uuid references public.projects(id),
  title text not null default '',
  status text not null default 'TODO',
  priority text,
  progress_percent integer default 0,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz,
  archived_at timestamptz
);
create table public.audit_log (
  id text primary key, tenant_id text, actor text, role text, action text,
  entity_type text, entity_id text, detail text, created_at timestamptz default now(), metadata jsonb
);
create table public.company_approvals (
  id text primary key, tenant_id text, type text, title text, status text,
  amount numeric, metadata jsonb, created_at timestamptz default now()
);
-- A slice of the ideas board, which 202607170001_idea_execution_link.sql
-- extends and indexes.
create table public.company_ideas (
  id text primary key, tenant_id text not null default 'golden-star', title text,
  status text not null default 'NEW', created_at timestamptz default now()
);

-- Document tables as database/schema.sql and database/policies.sql leave
-- them: readable, and in storage writable, by the anonymous role. Two are the
-- shapes production holds that this repository never defined
-- (202607150003_database_advisor_hardening.sql indexes them), one without a
-- tenant column.
create table public.gov_documents (id text primary key, tenant_id text not null default 'golden-star', title text);
create table public.gov_document_files (id text primary key, tenant_id text not null default 'golden-star', document_id text);
create table public.gov_document_extractions (id text primary key, tenant_id text not null default 'golden-star', document_id text);
create table public.gov_document_field_evidence (id text primary key, tenant_id text not null default 'golden-star', excerpt text);
create table public.gov_renewal_events (id text primary key, note text);
create view public.gov_documents_overview as select id, title from public.gov_documents;

do $$
declare v_table text;
begin
  foreach v_table in array array['gov_documents','gov_document_files','gov_document_extractions','gov_document_field_evidence','gov_renewal_events']
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', 'public read ' || v_table, v_table);
    execute format('grant select on public.%I to anon, authenticated', v_table);
  end loop;
end
$$;
grant select on public.gov_documents_overview to anon;

insert into storage.buckets (id, name, public) values ('government-documents', 'government-documents', true);
create policy "app read government document objects" on storage.objects
  for select to anon, authenticated using (bucket_id = 'government-documents');
create policy "app write government document objects" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'government-documents');
create policy "app update government document objects" on storage.objects
  for update to anon, authenticated using (bucket_id = 'government-documents') with check (bucket_id = 'government-documents');
-- A policy on another bucket the closure must leave alone.
insert into storage.buckets (id, name, public) values ('unrelated-public-assets', 'unrelated-public-assets', true);
create policy "public assets" on storage.objects for select to anon using (bucket_id = 'unrelated-public-assets');

-- Business tables as production holds them (release build log, 2026-10-20):
-- a client role can reach them because row level security is off, or a
-- permissive policy is in place, and Supabase grants every new table to the
-- client roles by default.
create table public.accounting_payments (id bigserial primary key, tenant_id text not null, amount numeric);
grant select, insert, update on public.accounting_payments to anon, authenticated;
grant usage on sequence public.accounting_payments_id_seq to anon, authenticated;
create table public.employees_directory (id text primary key, tenant_id text not null, full_name text);
alter table public.employees_directory enable row level security;
create policy "tenant members read" on public.employees_directory
  for select to authenticated using (tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id'));
create policy "open read" on public.employees_directory for select to anon using (true);
grant select on public.employees_directory to anon, authenticated;
grant all on public.accounting_payments, public.employees_directory to service_role;
grant all on sequence public.accounting_payments_id_seq to service_role;
-- A function that runs with its owner's rights, executable by everyone, as
-- Postgres grants new functions to PUBLIC.
create function public.orvanta_regression_definer() returns integer
  language sql security definer set search_path = '' as $$ select 1 $$;

-- The tenant helpers as production holds them (release build log,
-- 2026-10-22), before 20260718000200_advisor_followup_hardening.sql pins
-- their search path, and the event writer it closes to client roles.
create function public.orvanta_current_tenant() returns text
  language sql stable set search_path = public, auth
  as $$ select nullif(coalesce(auth.jwt() -> 'app_metadata' ->> 'tenant_id', auth.jwt() -> 'user_metadata' ->> 'tenant_id'), '') $$;
create function public.orvanta_has_tenant_access(row_tenant text) returns boolean
  language sql stable set search_path = public, auth
  as $$ select auth.role() = 'service_role' or (auth.uid() is not null and row_tenant = public.orvanta_current_tenant()) $$;
create function public.orvanta_append_event(p_event jsonb, p_outbox jsonb) returns void
  language plpgsql security definer set search_path = public as $$ begin end $$;

-- The accounting core as production holds it: journal amounts in plain
-- numeric, read by the trial-balance view 202607130004 creates, with a line
-- whose amounts already have two decimals.
create table public.accounting_accounts (
  id uuid primary key default gen_random_uuid(), tenant_id text not null default 'golden-star',
  code text not null, name text not null, type text not null, normal_balance text not null
);
create table public.accounting_journal_entries (
  id uuid primary key default gen_random_uuid(), tenant_id text not null default 'golden-star',
  entry_number text, entry_date date not null default current_date, status text not null default 'DRAFT',
  constraint accounting_journal_entries_entry_number_key unique (entry_number)
);
create table public.accounting_journal_lines (
  id uuid primary key default gen_random_uuid(), entry_id uuid, account_id uuid,
  debit numeric not null default 0, credit numeric not null default 0, tenant_id text not null default 'golden-star'
);
create view public.accounting_trial_balance_v as
select a.tenant_id, a.id as account_id, a.code, a.name, a.type, a.normal_balance,
  coalesce(sum(case when e.status='POSTED' then l.debit else 0 end),0)::numeric(18,2) as total_debit,
  coalesce(sum(case when e.status='POSTED' then l.credit else 0 end),0)::numeric(18,2) as total_credit,
  coalesce(sum(case when e.status='POSTED' then l.debit-l.credit else 0 end),0)::numeric(18,2) as net_balance
from public.accounting_accounts a
left join public.accounting_journal_lines l on l.account_id=a.id and l.tenant_id=a.tenant_id
left join public.accounting_journal_entries e on e.id=l.entry_id and e.tenant_id=a.tenant_id
group by a.tenant_id,a.id,a.code,a.name,a.type,a.normal_balance;
revoke all on public.accounting_trial_balance_v from anon, authenticated;
grant select on public.accounting_trial_balance_v to service_role;
insert into public.accounting_accounts (id, code, name, type, normal_balance)
  values ('00000000-0000-4000-8000-00000000a001', '1000', 'Cash', 'ASSET', 'DEBIT');
insert into public.accounting_journal_lines (account_id, debit, credit)
  values ('00000000-0000-4000-8000-00000000a001', 12.50, 0);

-- Inventory as production holds it: older than the Shopify link
-- 20260719000200_commerce_inventory_shopify_link.sql describes.
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(), sku text not null, name text not null,
  category text not null default 'commerce', unit_cost numeric not null default 0,
  target_price numeric not null default 0, on_hand numeric not null default 0,
  reorder_point numeric not null default 5, status text not null default 'ACTIVE',
  created_at timestamptz default now(), updated_at timestamptz default now(),
  tenant_id text not null default 'golden-star'
);
create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(), item_id uuid references public.inventory_items(id) on delete cascade,
  movement_type text not null default 'ADJUSTMENT', quantity numeric not null,
  unit_cost numeric not null default 0, note text, created_at timestamptz default now()
);
