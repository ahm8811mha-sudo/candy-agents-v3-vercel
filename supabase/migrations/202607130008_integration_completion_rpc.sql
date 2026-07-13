-- Atomically persist the external receipt and mark its attempt successful.

create or replace function public.orvanta_complete_integration_attempt(
  p_attempt_id uuid,
  p_tenant_id text,
  p_external_id text,
  p_external_url text,
  p_response_code integer,
  p_receipt_type text,
  p_receipt jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.integration_attempts%rowtype;
  v_receipt_id uuid;
begin
  select * into v_attempt
  from public.integration_attempts
  where id = p_attempt_id
    and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'integration attempt not found';
  end if;

  if v_attempt.status in ('SUCCEEDED','SKIPPED') then
    select id into v_receipt_id
    from public.external_receipts
    where tenant_id = p_tenant_id
      and integration = v_attempt.integration
      and operation = v_attempt.operation
      and idempotency_key = v_attempt.idempotency_key;
    return jsonb_build_object(
      'attempt_id', v_attempt.id,
      'receipt_id', v_receipt_id,
      'idempotent', true
    );
  end if;

  if v_attempt.status <> 'STARTED' then
    raise exception 'integration attempt is not active: %', v_attempt.status;
  end if;

  insert into public.external_receipts (
    id,
    tenant_id,
    integration_attempt_id,
    integration,
    operation,
    idempotency_key,
    external_id,
    external_url,
    receipt_type,
    receipt,
    verified,
    verified_at
  ) values (
    gen_random_uuid(),
    p_tenant_id,
    p_attempt_id,
    v_attempt.integration,
    v_attempt.operation,
    v_attempt.idempotency_key,
    nullif(p_external_id, ''),
    nullif(p_external_url, ''),
    coalesce(nullif(p_receipt_type, ''), 'API_RESPONSE'),
    coalesce(p_receipt, '{}'::jsonb),
    true,
    now()
  )
  on conflict (tenant_id, integration, operation, idempotency_key)
  do update set
    integration_attempt_id = excluded.integration_attempt_id,
    external_id = excluded.external_id,
    external_url = excluded.external_url,
    receipt_type = excluded.receipt_type,
    receipt = excluded.receipt,
    verified = true,
    verified_at = now()
  returning id into v_receipt_id;

  update public.integration_attempts
    set status = 'SUCCEEDED',
        external_id = nullif(p_external_id, ''),
        external_url = nullif(p_external_url, ''),
        response_code = coalesce(p_response_code, 200),
        response_metadata = coalesce(p_receipt, '{}'::jsonb),
        error_message = null,
        completed_at = now(),
        next_retry_at = null,
        updated_at = now()
  where id = p_attempt_id
    and tenant_id = p_tenant_id
    and status = 'STARTED';

  if not found then
    raise exception 'integration attempt changed before completion';
  end if;

  return jsonb_build_object(
    'attempt_id', p_attempt_id,
    'receipt_id', v_receipt_id,
    'idempotent', false
  );
end;
$$;

revoke all on function public.orvanta_complete_integration_attempt(uuid,text,text,text,integer,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.orvanta_complete_integration_attempt(uuid,text,text,text,integer,text,jsonb)
  to service_role;

notify pgrst, 'reload schema';
