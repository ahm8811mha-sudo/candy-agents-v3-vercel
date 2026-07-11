-- ORVANTA operational hardening
-- Apply after the existing core/accounting migrations.
-- Idempotent and safe to re-run.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Failed durable writes: payloads are redacted by the application before insert.
-- ---------------------------------------------------------------------------
create table if not exists public.failed_writes (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  table_name text not null,
  operation text not null,
  payload jsonb not null default '{}',
  error_message text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'RETRYING', 'RESOLVED', 'DEAD_LETTER')),
  attempts integer not null default 1 check (attempts >= 1),
  next_retry_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists failed_writes_retry_idx
  on public.failed_writes (status, next_retry_at, created_at);
create index if not exists failed_writes_tenant_idx
  on public.failed_writes (tenant_id, created_at desc);
alter table public.failed_writes enable row level security;
revoke all on table public.failed_writes from anon, authenticated;
grant select, insert, update, delete on table public.failed_writes to service_role;

-- ---------------------------------------------------------------------------
-- Distributed API rate limiting. The RPC serializes each key with an advisory
-- lock, so concurrent Vercel instances share one authoritative counter.
-- ---------------------------------------------------------------------------
create table if not exists public.api_rate_limits (
  key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);
create index if not exists api_rate_limits_updated_idx
  on public.api_rate_limits (updated_at);
alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from anon, authenticated;
grant select, insert, update, delete on table public.api_rate_limits to service_role;

create or replace function public.orvanta_check_rate_limit(
  p_key text,
  p_window_seconds integer,
  p_limit integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_count integer;
  v_reset_at timestamptz;
begin
  if coalesce(length(trim(p_key)), 0) = 0 then
    raise exception 'rate-limit key is required';
  end if;
  if p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid rate-limit window';
  end if;
  if p_limit < 1 or p_limit > 100000 then
    raise exception 'invalid rate-limit limit';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_key, 0));

  select window_started_at, request_count
    into v_window_start, v_count
  from public.api_rate_limits
  where key = p_key
  for update;

  if not found or v_window_start + make_interval(secs => p_window_seconds) <= v_now then
    v_window_start := v_now;
    v_count := 1;
    insert into public.api_rate_limits (key, window_started_at, request_count, updated_at)
    values (p_key, v_window_start, v_count, v_now)
    on conflict (key) do update
      set window_started_at = excluded.window_started_at,
          request_count = excluded.request_count,
          updated_at = excluded.updated_at;
  else
    v_count := v_count + 1;
    update public.api_rate_limits
      set request_count = v_count,
          updated_at = v_now
    where key = p_key;
  end if;

  v_reset_at := v_window_start + make_interval(secs => p_window_seconds);
  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'remaining', greatest(p_limit - v_count, 0),
    'reset_at', v_reset_at,
    'count', v_count
  );
end;
$$;
revoke all on function public.orvanta_check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.orvanta_check_rate_limit(text, integer, integer) to service_role;

-- Optional housekeeping; call from an existing daily cron when desired.
create or replace function public.orvanta_cleanup_rate_limits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.api_rate_limits where updated_at < now() - interval '2 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke all on function public.orvanta_cleanup_rate_limits() from public, anon, authenticated;
grant execute on function public.orvanta_cleanup_rate_limits() to service_role;

-- ---------------------------------------------------------------------------
-- Unified accounting journal: all financial summaries read from these tables.
-- Legacy ledger entries are mirrored through the atomic RPC below.
-- ---------------------------------------------------------------------------
alter table if exists public.accounting_journal_entries
  add column if not exists tenant_id text;
alter table if exists public.accounting_journal_lines
  add column if not exists tenant_id text;

update public.accounting_journal_entries
set tenant_id = coalesce(tenant_id, 'golden-star')
where tenant_id is null;
update public.accounting_journal_lines
set tenant_id = coalesce(tenant_id, 'golden-star')
where tenant_id is null;

alter table if exists public.accounting_journal_entries
  alter column tenant_id set default 'golden-star';
alter table if exists public.accounting_journal_lines
  alter column tenant_id set default 'golden-star';
alter table if exists public.accounting_journal_entries
  alter column tenant_id set not null;
alter table if exists public.accounting_journal_lines
  alter column tenant_id set not null;

create index if not exists accounting_journal_entries_tenant_number_idx
  on public.accounting_journal_entries (tenant_id, entry_number);
create index if not exists accounting_journal_entries_tenant_created_idx
  on public.accounting_journal_entries (tenant_id, created_at desc);
create index if not exists accounting_journal_lines_tenant_entry_idx
  on public.accounting_journal_lines (tenant_id, entry_id);

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
