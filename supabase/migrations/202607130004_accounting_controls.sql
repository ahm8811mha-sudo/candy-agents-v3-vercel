-- Accounting controls: one official journal, immutable posted entries, period
-- close, reversal entries, trial balance, receivables/payables, and VAT views.

create extension if not exists pgcrypto;

create table if not exists public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  period_name text not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'OPEN' check (status in ('OPEN','CLOSED')),
  closed_at timestamptz,
  closed_by text,
  closing_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  unique (tenant_id, period_name)
);
create index if not exists accounting_periods_dates_idx
  on public.accounting_periods (tenant_id, starts_on, ends_on, status);

alter table public.accounting_periods enable row level security;
revoke all on public.accounting_periods from public, anon, authenticated;
grant select, insert, update, delete on public.accounting_periods to service_role;

create or replace function public.orvanta_assert_accounting_period_open(
  p_tenant_id text,
  p_entry_date date
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.accounting_periods
    where tenant_id = p_tenant_id
      and status = 'CLOSED'
      and p_entry_date between starts_on and ends_on
  ) then
    raise exception 'accounting period is closed for date %', p_entry_date;
  end if;
end;
$$;

create or replace function public.orvanta_guard_journal_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.orvanta_assert_accounting_period_open(new.tenant_id, new.entry_date);
    return new;
  end if;

  if old.status = 'POSTED' then
    raise exception 'posted journal entries are immutable; create a reversal entry';
  end if;

  if tg_op = 'UPDATE' then
    perform public.orvanta_assert_accounting_period_open(new.tenant_id, new.entry_date);
    return new;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_guard_journal_entry on public.accounting_journal_entries;
create trigger trg_guard_journal_entry
before insert or update or delete on public.accounting_journal_entries
for each row execute function public.orvanta_guard_journal_entry();

create or replace function public.orvanta_guard_journal_line()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
  v_status text;
begin
  v_entry_id := case when tg_op = 'DELETE' then old.entry_id else new.entry_id end;
  select status into v_status from public.accounting_journal_entries where id = v_entry_id;
  if v_status = 'POSTED' and tg_op in ('UPDATE','DELETE') then
    raise exception 'lines of a posted journal entry are immutable';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_guard_journal_line on public.accounting_journal_lines;
create trigger trg_guard_journal_line
before update or delete on public.accounting_journal_lines
for each row execute function public.orvanta_guard_journal_line();

create or replace function public.orvanta_reverse_journal_entry(
  p_tenant_id text,
  p_entry_id uuid,
  p_reversal_date date,
  p_reason text,
  p_actor_id text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original public.accounting_journal_entries%rowtype;
  v_reversal_id uuid;
  v_number text;
begin
  select * into v_original
  from public.accounting_journal_entries
  where id = p_entry_id and tenant_id = p_tenant_id
  for share;

  if not found then raise exception 'journal entry not found'; end if;
  if v_original.status <> 'POSTED' then raise exception 'only posted entries may be reversed'; end if;
  if coalesce(length(trim(p_reason)),0) = 0 then raise exception 'reversal reason is required'; end if;
  perform public.orvanta_assert_accounting_period_open(p_tenant_id, p_reversal_date);

  v_number := p_tenant_id || '-REV-' || replace(p_entry_id::text, '-', '') || '-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS');

  insert into public.accounting_journal_entries (
    tenant_id, entry_number, entry_date, memo, source, status, cost_center_id
  ) values (
    p_tenant_id,
    v_number,
    p_reversal_date,
    'Reversal of ' || v_original.entry_number || ': ' || trim(p_reason),
    'REVERSAL:' || coalesce(p_actor_id,'system'),
    'POSTED',
    v_original.cost_center_id
  ) returning id into v_reversal_id;

  insert into public.accounting_journal_lines (
    tenant_id, entry_id, account_id, memo, debit, credit
  )
  select
    tenant_id,
    v_reversal_id,
    account_id,
    'Reversal: ' || coalesce(memo, v_original.memo, ''),
    credit,
    debit
  from public.accounting_journal_lines
  where entry_id = p_entry_id and tenant_id = p_tenant_id;

  if not found then raise exception 'original journal entry has no lines'; end if;
  return v_reversal_id;
end;
$$;

create or replace view public.accounting_trial_balance_v as
select
  a.tenant_id,
  a.id as account_id,
  a.code,
  a.name,
  a.type,
  a.normal_balance,
  coalesce(sum(case when e.status='POSTED' then l.debit else 0 end),0)::numeric(18,2) as total_debit,
  coalesce(sum(case when e.status='POSTED' then l.credit else 0 end),0)::numeric(18,2) as total_credit,
  coalesce(sum(case when e.status='POSTED' then l.debit-l.credit else 0 end),0)::numeric(18,2) as net_balance
from public.accounting_accounts a
left join public.accounting_journal_lines l
  on l.account_id=a.id and l.tenant_id=a.tenant_id
left join public.accounting_journal_entries e
  on e.id=l.entry_id and e.tenant_id=a.tenant_id
group by a.tenant_id,a.id,a.code,a.name,a.type,a.normal_balance;

create or replace view public.accounting_open_invoices_v as
select
  tenant_id,
  id,
  contact_id,
  invoice_type,
  status,
  issue_date,
  due_date,
  subtotal,
  tax,
  total,
  paid,
  greatest(total-paid,0)::numeric(18,2) as outstanding,
  tax_rate,
  tax_invoice_number,
  cost_center_id
from public.accounting_invoices
where status not in ('CANCELLED','VOID','PAID')
  and total > paid;

create or replace view public.accounting_vat_summary_v as
select
  tenant_id,
  date_trunc('month', issue_date::timestamp)::date as period_month,
  sum(case when upper(invoice_type) in ('SALE','SALES','REVENUE','CUSTOMER') then tax else 0 end)::numeric(18,2) as output_vat,
  sum(case when upper(invoice_type) in ('PURCHASE','EXPENSE','SUPPLIER','VENDOR') then tax else 0 end)::numeric(18,2) as input_vat,
  (
    sum(case when upper(invoice_type) in ('SALE','SALES','REVENUE','CUSTOMER') then tax else 0 end)
    - sum(case when upper(invoice_type) in ('PURCHASE','EXPENSE','SUPPLIER','VENDOR') then tax else 0 end)
  )::numeric(18,2) as net_vat
from public.accounting_invoices
where status not in ('CANCELLED','VOID')
group by tenant_id,date_trunc('month', issue_date::timestamp)::date;

revoke all on function public.orvanta_assert_accounting_period_open(text,date) from public,anon,authenticated;
revoke all on function public.orvanta_reverse_journal_entry(text,uuid,date,text,text) from public,anon,authenticated;
grant execute on function public.orvanta_assert_accounting_period_open(text,date) to service_role;
grant execute on function public.orvanta_reverse_journal_entry(text,uuid,date,text,text) to service_role;
revoke all on public.accounting_trial_balance_v,public.accounting_open_invoices_v,public.accounting_vat_summary_v from anon,authenticated;
grant select on public.accounting_trial_balance_v,public.accounting_open_invoices_v,public.accounting_vat_summary_v to service_role;

notify pgrst, 'reload schema';
