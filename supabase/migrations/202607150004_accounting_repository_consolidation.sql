-- Complete the accounting consolidation: journal, invoice, contact, bank
-- balance, and audit changes commit atomically through service-only RPCs.

alter function public.orvanta_post_journal_entry(text,text,timestamptz,text,text,text,jsonb)
  set search_path = '';

create unique index if not exists accounting_invoices_tenant_tax_number_uidx
  on public.accounting_invoices (tenant_id, tax_invoice_number)
  where tax_invoice_number is not null;

create unique index if not exists accounting_bank_accounts_tenant_name_uidx
  on public.accounting_bank_accounts (tenant_id, name);

create or replace function public.orvanta_create_accounting_invoice(
  p_tenant_id text,
  p_invoice jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid := (p_invoice ->> 'id')::uuid;
  v_contact_id uuid := (p_invoice ->> 'contactId')::uuid;
  v_invoice_type text := p_invoice ->> 'invoiceType';
  v_contact_name text := trim(coalesce(p_invoice ->> 'contactName', ''));
  v_subtotal numeric := coalesce((p_invoice ->> 'subtotal')::numeric, 0);
  v_tax numeric := coalesce((p_invoice ->> 'tax')::numeric, 0);
  v_total numeric := v_subtotal + v_tax;
  v_tax_rate numeric := coalesce((p_invoice ->> 'taxRate')::numeric, 0);
  v_tax_number text := trim(coalesce(p_invoice ->> 'taxInvoiceNumber', ''));
  v_entry_number text := trim(coalesce(p_invoice ->> 'entryNumber', ''));
  v_debit_code text;
  v_credit_code text;
  v_journal jsonb;
  v_invoice public.accounting_invoices%rowtype;
  v_audit public.audit_log%rowtype;
begin
  if coalesce(length(trim(p_tenant_id)), 0) = 0 then
    raise exception 'tenant is required';
  end if;
  if v_invoice_type not in ('SALES', 'PURCHASE') then
    raise exception 'invoice type must be SALES or PURCHASE';
  end if;
  if v_contact_name = '' then
    raise exception 'contact name is required';
  end if;
  if v_subtotal < 0 or v_tax < 0 or v_total <= 0 then
    raise exception 'invoice amounts are invalid';
  end if;
  if v_tax_number = '' or v_entry_number = '' then
    raise exception 'invoice and journal idempotency numbers are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id || ':invoice:' || v_tax_number, 0));

  select * into v_invoice
  from public.accounting_invoices
  where tenant_id = p_tenant_id and tax_invoice_number = v_tax_number
  limit 1;
  if found then
    return jsonb_build_object('invoice', to_jsonb(v_invoice), 'idempotent', true, 'audit', null);
  end if;

  insert into public.accounting_contacts (id, tenant_id, type, name)
  values (
    v_contact_id,
    p_tenant_id,
    case when v_invoice_type = 'SALES' then 'CUSTOMER' else 'VENDOR' end,
    v_contact_name
  );

  insert into public.accounting_invoices (
    id, tenant_id, contact_id, invoice_type, status, subtotal, tax, tax_rate,
    tax_invoice_number, total, paid, cost_center_id, notes
  ) values (
    v_invoice_id,
    p_tenant_id,
    v_contact_id,
    v_invoice_type,
    'ISSUED',
    v_subtotal,
    v_tax,
    v_tax_rate,
    v_tax_number,
    v_total,
    0,
    nullif(p_invoice ->> 'costCenterId', ''),
    nullif(trim(coalesce(p_invoice ->> 'notes', '')), '')
  ) returning * into v_invoice;

  if v_invoice_type = 'SALES' then
    v_debit_code := '1100';
    v_credit_code := '4000';
  else
    v_debit_code := '5200';
    v_credit_code := '2000';
  end if;

  select public.orvanta_post_journal_entry(
    p_tenant_id,
    v_entry_number,
    now(),
    case when v_invoice_type = 'SALES' then 'Sales invoice ' else 'Purchase invoice ' end || v_tax_number || ' - ' || v_contact_name,
    'invoice',
    nullif(p_invoice ->> 'costCenterId', ''),
    jsonb_build_array(
      jsonb_build_object('account_code', v_debit_code, 'debit', v_total, 'credit', 0),
      jsonb_build_object('account_code', v_credit_code, 'debit', 0, 'credit', v_total)
    )
  ) into v_journal;

  insert into public.audit_log (
    id, tenant_id, actor, role, action, entity_type, entity_id, detail,
    metadata, created_at
  ) values (
    'aud-invoice-' || v_invoice_id::text,
    p_tenant_id,
    'CFO',
    'CFO',
    'TAX_INVOICE_ISSUED: invoice issued and posted',
    'accounting_invoices',
    v_invoice_id::text,
    v_invoice_type || ' invoice issued and posted atomically',
    jsonb_build_object(
      'decisionType', 'TAX_INVOICE_ISSUED',
      'amount', v_total,
      'riskLevel', 'LOW',
      'approvalStatus', 'POSTED',
      'contactId', v_contact_id,
      'journalEntryId', v_journal ->> 'id',
      'tax', v_tax,
      'taxRate', v_tax_rate
    ),
    now()
  ) returning * into v_audit;

  return jsonb_build_object(
    'invoice', to_jsonb(v_invoice),
    'journal', v_journal,
    'audit', to_jsonb(v_audit),
    'idempotent', false
  );
end;
$$;

create or replace function public.orvanta_add_bank_transaction(
  p_tenant_id text,
  p_transaction jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := (p_transaction ->> 'bankAccountId')::uuid;
  v_transaction_id uuid := (p_transaction ->> 'transactionId')::uuid;
  v_bank_name text := trim(coalesce(p_transaction ->> 'bankName', ''));
  v_description text := trim(coalesce(p_transaction ->> 'description', ''));
  v_amount numeric := coalesce((p_transaction ->> 'amount')::numeric, 0);
  v_account public.accounting_bank_accounts%rowtype;
  v_transaction public.accounting_bank_transactions%rowtype;
  v_audit public.audit_log%rowtype;
begin
  if coalesce(length(trim(p_tenant_id)), 0) = 0 then
    raise exception 'tenant is required';
  end if;
  if v_bank_name = '' or v_description = '' or v_amount = 0 then
    raise exception 'bank name, description, and non-zero amount are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id || ':bank:' || lower(v_bank_name), 0));

  select * into v_transaction
  from public.accounting_bank_transactions
  where id = v_transaction_id and tenant_id = p_tenant_id
  limit 1;
  if found then
    select * into v_account
    from public.accounting_bank_accounts
    where id = v_transaction.bank_account_id and tenant_id = p_tenant_id;
    return jsonb_build_object('transaction', to_jsonb(v_transaction), 'bankAccount', to_jsonb(v_account), 'idempotent', true, 'audit', null);
  end if;

  select * into v_account
  from public.accounting_bank_accounts
  where tenant_id = p_tenant_id and name = v_bank_name
  for update;

  if not found then
    insert into public.accounting_bank_accounts (
      id, tenant_id, name, provider, currency, balance
    ) values (
      v_account_id, p_tenant_id, v_bank_name, 'manual', 'SAR', 0
    ) returning * into v_account;
  end if;

  insert into public.accounting_bank_transactions (
    id, tenant_id, bank_account_id, description, amount, status
  ) values (
    v_transaction_id, p_tenant_id, v_account.id, v_description, v_amount, 'UNMATCHED'
  ) returning * into v_transaction;

  update public.accounting_bank_accounts
  set balance = balance + v_amount
  where id = v_account.id and tenant_id = p_tenant_id
  returning * into v_account;

  insert into public.audit_log (
    id, tenant_id, actor, role, action, entity_type, entity_id, detail,
    metadata, created_at
  ) values (
    'aud-bank-' || v_transaction_id::text,
    p_tenant_id,
    'CFO',
    'CFO',
    'BANK_TRANSACTION_RECORDED',
    'accounting_bank_transactions',
    v_transaction_id::text,
    'Bank transaction and balance update committed atomically',
    jsonb_build_object('amount', v_amount, 'bankAccountId', v_account.id),
    now()
  ) returning * into v_audit;

  return jsonb_build_object(
    'transaction', to_jsonb(v_transaction),
    'bankAccount', to_jsonb(v_account),
    'audit', to_jsonb(v_audit),
    'idempotent', false
  );
end;
$$;

revoke all on function public.orvanta_create_accounting_invoice(text,jsonb) from public, anon, authenticated;
revoke all on function public.orvanta_add_bank_transaction(text,jsonb) from public, anon, authenticated;
grant execute on function public.orvanta_create_accounting_invoice(text,jsonb) to service_role;
grant execute on function public.orvanta_add_bank_transaction(text,jsonb) to service_role;

notify pgrst, 'reload schema';
