-- Accounting core baseline.
--
-- Panel finding (DB review): the financial hot path RPC
-- orvanta_post_journal_entry lived only in docs/supabase-operational-hardening.sql
-- (the legacy generation), and the core accounting tables only in
-- database/schema.sql — a fresh database built from supabase/migrations alone
-- could not post a single journal entry. This migration makes the ordered
-- migration chain self-sufficient: core DDL (idempotent), tenant scoping,
-- a per-tenant UNIQUE on entry_number (previously only a non-unique index —
-- the advisory lock was the sole duplicate guard), money as numeric(18,2),
-- and the canonical RPC definition.

create extension if not exists pgcrypto;

-- 1. Core tables (no-ops where they already exist).

create table if not exists public.accounting_accounts (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  type text not null check (type in ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
  normal_balance text not null check (normal_balance in ('DEBIT', 'CREDIT')),
  is_system boolean default false,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.accounting_journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  entry_number text not null default ('JE-' || extract(epoch from now())::bigint::text),
  entry_date date not null default current_date,
  memo text,
  source text default 'manual',
  status text not null default 'POSTED' check (status in ('DRAFT', 'POSTED', 'VOID')),
  cost_center_id text,
  created_at timestamptz default now()
);

create table if not exists public.accounting_journal_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  entry_id uuid references public.accounting_journal_entries(id) on delete cascade,
  account_id uuid references public.accounting_accounts(id) on delete restrict,
  memo text,
  debit numeric(18,2) not null default 0,
  credit numeric(18,2) not null default 0,
  created_at timestamptz default now(),
  check (debit >= 0 and credit >= 0 and debit <> credit)
);

-- 2. Bring pre-existing (legacy-created) tables up to the same shape.

alter table public.accounting_journal_entries
  add column if not exists tenant_id text not null default 'golden-star';
alter table public.accounting_journal_entries
  add column if not exists cost_center_id text;
alter table public.accounting_journal_lines
  add column if not exists tenant_id text not null default 'golden-star';

-- Money columns must carry an explicit scale; round any drifted values once.
alter table public.accounting_journal_lines
  alter column debit type numeric(18,2) using round(debit, 2),
  alter column credit type numeric(18,2) using round(credit, 2);

-- 3. Entry-number uniqueness per tenant (the real duplicate guard).
-- The legacy schema had a GLOBAL unique on entry_number, which is wrong under
-- multi-tenancy; replace it with a tenant-scoped unique index.
alter table public.accounting_journal_entries
  drop constraint if exists accounting_journal_entries_entry_number_key;
create unique index if not exists accounting_journal_entries_tenant_number_uidx
  on public.accounting_journal_entries (tenant_id, entry_number);

create index if not exists accounting_journal_entries_tenant_created_idx
  on public.accounting_journal_entries (tenant_id, created_at desc);
create index if not exists accounting_journal_lines_entry_idx
  on public.accounting_journal_lines (entry_id);
create index if not exists accounting_journal_lines_account_idx
  on public.accounting_journal_lines (account_id);

-- 4. Access model: server-only, like every protected table.

alter table public.accounting_accounts enable row level security;
alter table public.accounting_journal_entries enable row level security;
alter table public.accounting_journal_lines enable row level security;
revoke all on public.accounting_accounts from public, anon, authenticated;
revoke all on public.accounting_journal_entries from public, anon, authenticated;
revoke all on public.accounting_journal_lines from public, anon, authenticated;
grant select, insert, update, delete on public.accounting_accounts to service_role;
grant select, insert, update, delete on public.accounting_journal_entries to service_role;
grant select, insert, update, delete on public.accounting_journal_lines to service_role;

-- 5. Canonical atomic posting RPC (moved from docs/supabase-operational-hardening.sql).

create or replace function public.orvanta_post_journal_entry(
  p_tenant_id text,
  p_entry_number text,
  p_entry_date timestamptz,
  p_memo text,
  p_source text,
  p_cost_center_id text,
  p_lines jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id public.accounting_journal_entries.id%type;
  v_account_id public.accounting_accounts.id%type;
  v_line jsonb;
  v_debit numeric;
  v_credit numeric;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
begin
  if coalesce(length(trim(p_tenant_id)), 0) = 0 then
    raise exception 'tenant is required';
  end if;
  if coalesce(length(trim(p_entry_number)), 0) = 0 then
    raise exception 'entry number is required';
  end if;
  if coalesce(length(trim(p_memo)), 0) = 0 then
    raise exception 'journal memo is required';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'at least two journal lines are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id || ':' || p_entry_number, 0));

  select id into v_entry_id
  from public.accounting_journal_entries
  where tenant_id = p_tenant_id and entry_number = p_entry_number
  order by created_at asc
  limit 1;

  if found then
    return jsonb_build_object('id', v_entry_id, 'entry_number', p_entry_number, 'idempotent', true);
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_debit := coalesce((v_line->>'debit')::numeric, 0);
    v_credit := coalesce((v_line->>'credit')::numeric, 0);
    if v_debit < 0 or v_credit < 0 then
      raise exception 'journal amounts cannot be negative';
    end if;
    if (v_debit > 0 and v_credit > 0) or (v_debit = 0 and v_credit = 0) then
      raise exception 'each journal line must contain exactly one debit or credit amount';
    end if;
    v_total_debit := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;
  end loop;

  if round(v_total_debit, 2) <= 0 or round(v_total_debit, 2) <> round(v_total_credit, 2) then
    raise exception 'unbalanced journal entry: debit %, credit %', v_total_debit, v_total_credit;
  end if;

  insert into public.accounting_journal_entries (
    tenant_id,
    entry_number,
    entry_date,
    memo,
    source,
    status,
    cost_center_id
  ) values (
    p_tenant_id,
    p_entry_number,
    coalesce(p_entry_date, now())::date,
    p_memo,
    coalesce(p_source, 'system'),
    'POSTED',
    nullif(trim(p_cost_center_id), '')
  ) returning id into v_entry_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    select id into v_account_id
    from public.accounting_accounts
    where code = v_line->>'account_code'
    order by created_at asc nulls last
    limit 1;

    if v_account_id is null then
      raise exception 'account code % does not exist', v_line->>'account_code';
    end if;

    insert into public.accounting_journal_lines (
      tenant_id,
      entry_id,
      account_id,
      memo,
      debit,
      credit
    ) values (
      p_tenant_id,
      v_entry_id,
      v_account_id,
      coalesce(v_line->>'memo', p_memo),
      coalesce((v_line->>'debit')::numeric, 0),
      coalesce((v_line->>'credit')::numeric, 0)
    );
  end loop;

  return jsonb_build_object(
    'id', v_entry_id,
    'entry_number', p_entry_number,
    'tenant_id', p_tenant_id,
    'idempotent', false
  );
end;
$$;

revoke all on function public.orvanta_post_journal_entry(text, text, timestamptz, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.orvanta_post_journal_entry(text, text, timestamptz, text, text, text, jsonb)
  to service_role;

notify pgrst, 'reload schema';
