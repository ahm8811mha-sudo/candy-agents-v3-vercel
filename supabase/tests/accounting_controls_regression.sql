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
  v_tenant text := 'orvanta-accounting-regression';
  v_suffix text := replace(gen_random_uuid()::text, '-', '');
  v_invoice_id uuid := gen_random_uuid();
  v_contact_id uuid := gen_random_uuid();
  v_bank_account_id uuid := gen_random_uuid();
  v_bank_transaction_id uuid := gen_random_uuid();
  v_invoice_result jsonb;
  v_bank_first jsonb;
  v_bank_second jsonb;
  v_invoice_count integer;
  v_line_debit numeric;
  v_line_credit numeric;
  v_bank_balance numeric;
begin
  insert into public.accounting_accounts (
    id, tenant_id, code, name, type, normal_balance, is_system, active
  ) values
    (gen_random_uuid(), v_tenant, '1100', 'Regression receivable', 'ASSET', 'DEBIT', true, true),
    (gen_random_uuid(), v_tenant, '4000', 'Regression revenue', 'REVENUE', 'CREDIT', true, true)
  on conflict (code) do nothing;

  v_invoice_result := public.orvanta_create_accounting_invoice(
    v_tenant,
    jsonb_build_object(
      'id', v_invoice_id,
      'contactId', v_contact_id,
      'invoiceType', 'SALES',
      'contactName', 'Rollback customer',
      'subtotal', 100,
      'tax', 15,
      'taxRate', 0.15,
      'taxInvoiceNumber', 'REG-TAX-' || v_suffix,
      'entryNumber', 'REG-INVOICE-JE-' || v_suffix
    )
  );

  select count(*) into v_invoice_count
  from public.accounting_invoices
  where tenant_id = v_tenant and id = v_invoice_id;

  select coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0)
    into v_line_debit, v_line_credit
  from public.accounting_journal_lines l
  join public.accounting_journal_entries e on e.id = l.entry_id
  where e.tenant_id = v_tenant and e.entry_number = 'REG-INVOICE-JE-' || v_suffix;

  v_bank_first := public.orvanta_add_bank_transaction(
    v_tenant,
    jsonb_build_object(
      'bankAccountId', v_bank_account_id,
      'transactionId', v_bank_transaction_id,
      'bankName', 'Regression bank ' || v_suffix,
      'description', 'Atomic bank movement',
      'amount', 250
    )
  );
  v_bank_second := public.orvanta_add_bank_transaction(
    v_tenant,
    jsonb_build_object(
      'bankAccountId', v_bank_account_id,
      'transactionId', v_bank_transaction_id,
      'bankName', 'Regression bank ' || v_suffix,
      'description', 'Atomic bank movement',
      'amount', 250
    )
  );

  select balance into v_bank_balance
  from public.accounting_bank_accounts
  where tenant_id = v_tenant and id = v_bank_account_id;

  insert into accounting_control_test_results values
    ('invoice_and_journal_are_atomic',
      v_invoice_count = 1 and v_line_debit = 115 and v_line_credit = 115 and (v_invoice_result ->> 'idempotent')::boolean = false,
      format('invoice=%s, debit=%s, credit=%s', v_invoice_count, v_line_debit, v_line_credit)),
    ('bank_retry_is_idempotent',
      v_bank_balance = 250 and (v_bank_first ->> 'idempotent')::boolean = false and (v_bank_second ->> 'idempotent')::boolean = true,
      format('balance=%s', v_bank_balance));
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
