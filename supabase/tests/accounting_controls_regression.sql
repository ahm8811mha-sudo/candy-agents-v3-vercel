\set ON_ERROR_STOP on

-- Rollback-only smoke coverage for the official accounting journal controls.
begin;

create temporary table accounting_control_test_results (
  test_name text primary key,
  passed boolean not null,
  detail text
) on commit drop;

do $$
declare
  v_tenant text := 'orvanta-accounting-regression';
  v_suffix text := replace(gen_random_uuid()::text, '-', '');
  v_debit_account uuid := gen_random_uuid();
  v_credit_account uuid := gen_random_uuid();
  v_entry uuid := gen_random_uuid();
  v_reversal uuid;
  v_entry_immutable boolean := false;
  v_lines_immutable boolean := false;
  v_closed_period_guard boolean := false;
  v_reversal_debit numeric;
  v_reversal_credit numeric;
begin
  insert into public.accounting_accounts (
    id, tenant_id, code, name, type, normal_balance, is_system, active
  ) values
    (v_debit_account, v_tenant, 'REG-D-'||v_suffix, 'Regression Debit', 'ASSET', 'DEBIT', false, true),
    (v_credit_account, v_tenant, 'REG-C-'||v_suffix, 'Regression Credit', 'REVENUE', 'CREDIT', false, true);

  insert into public.accounting_journal_entries (
    id, tenant_id, entry_number, entry_date, memo, source, status
  ) values (
    v_entry, v_tenant, 'REG-JE-'||v_suffix, date '2099-02-01',
    'Rollback-only accounting regression', 'REGRESSION', 'DRAFT'
  );

  insert into public.accounting_journal_lines (
    tenant_id, entry_id, account_id, memo, debit, credit
  ) values
    (v_tenant, v_entry, v_debit_account, 'Regression debit', 1250, 0),
    (v_tenant, v_entry, v_credit_account, 'Regression credit', 0, 1250);

  update public.accounting_journal_entries set status='POSTED' where id=v_entry;

  begin
    update public.accounting_journal_entries set memo='must fail' where id=v_entry;
  exception when others then
    v_entry_immutable := position('immutable' in lower(sqlerrm)) > 0;
  end;

  begin
    update public.accounting_journal_lines set memo='must fail' where entry_id=v_entry;
  exception when others then
    v_lines_immutable := position('immutable' in lower(sqlerrm)) > 0;
  end;

  insert into public.accounting_periods (
    tenant_id, period_name, starts_on, ends_on, status, closed_at, closed_by
  ) values (
    v_tenant, 'REG-CLOSED-'||v_suffix, date '2099-01-01', date '2099-01-31',
    'CLOSED', now(), 'regression'
  );

  begin
    insert into public.accounting_journal_entries (
      tenant_id, entry_number, entry_date, memo, source, status
    ) values (
      v_tenant, 'REG-CLOSED-JE-'||v_suffix, date '2099-01-15',
      'must fail', 'REGRESSION', 'DRAFT'
    );
  exception when others then
    v_closed_period_guard := position('closed' in lower(sqlerrm)) > 0;
  end;

  v_reversal := public.orvanta_reverse_journal_entry(
    v_tenant, v_entry, date '2099-02-02', 'Regression reversal', 'regression'
  );

  select coalesce(sum(debit),0), coalesce(sum(credit),0)
    into v_reversal_debit, v_reversal_credit
  from public.accounting_journal_lines
  where tenant_id=v_tenant and entry_id=v_reversal;

  insert into accounting_control_test_results values
    ('posted_entry_is_immutable', v_entry_immutable, format('blocked=%s', v_entry_immutable)),
    ('posted_lines_are_immutable', v_lines_immutable, format('blocked=%s', v_lines_immutable)),
    ('closed_period_blocks_posting', v_closed_period_guard, format('blocked=%s', v_closed_period_guard)),
    ('reversal_is_balanced', v_reversal_debit=1250 and v_reversal_credit=1250,
      format('debit=%s, credit=%s', v_reversal_debit, v_reversal_credit));
end $$;

do $$
declare
  broken text;
begin
  select string_agg(test_name||' ('||coalesce(detail,'')||')', ', ' order by test_name)
    into broken
  from accounting_control_test_results
  where not passed;

  if broken is not null then
    raise exception 'Accounting controls regression failed: %', broken;
  end if;
end $$;

select * from accounting_control_test_results order by test_name;

rollback;
