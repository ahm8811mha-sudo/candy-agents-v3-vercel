-- Correct only false delivery claims. Never resend these events automatically.
-- All previous delivery metadata remains available for review.
begin;

create temporary table skipped_outbox_repair on commit drop as
select id, tenant_id, published_at, delivery_result
from public.event_outbox
where tenant_id = 'golden-star'
  and status = 'PUBLISHED'
  and delivery_result->>'skipped' = 'true';

update public.external_receipts r
set verified = false, verified_at = null,
    receipt = coalesce(r.receipt, '{}'::jsonb) || jsonb_build_object(
      'verificationCorrection', 'No external delivery occurred: integration was disabled',
      'correctedAt', now())
from skipped_outbox_repair q
where r.id::text = q.delivery_result->>'receiptId'
  and r.tenant_id = q.tenant_id
  and r.integration = 'ORVANTA_WEBHOOK'
  and r.receipt_type = 'DISABLED_INTEGRATION';

update public.event_outbox e
set status = 'DEAD_LETTER', published_at = null, updated_at = now(),
    last_error = 'No external delivery occurred. Previous configuration skipped sending. Manual review is required before any new delivery attempt.',
    delivery_result = e.delivery_result || jsonb_build_object('correction',
      jsonb_build_object('previousStatus', 'PUBLISHED', 'previousPublishedAt', q.published_at,
                        'correctedAt', now(), 'reason', 'disabled integration is not delivery'))
from skipped_outbox_repair q
where e.id = q.id and e.tenant_id = q.tenant_id
  and e.status = 'PUBLISHED' and e.delivery_result->>'skipped' = 'true';

insert into public.readiness_evidence
  (evidence_key, environment, status, details, performed_by, expires_at)
select 'outbox-delivery-correction', 'production', 'WARN',
       jsonb_build_object('correctedEvents', count(*), 'eventIds', jsonb_agg(id),
                          'autoResend', false, 'reason', 'Skipped events were incorrectly labelled PUBLISHED'),
       'Codex verified repair', now() + interval '14 days'
from skipped_outbox_repair having count(*) > 0;

do $$
begin
  if exists (
    select 1 from public.event_outbox e join skipped_outbox_repair q
      on e.id=q.id and e.tenant_id=q.tenant_id
    where e.status <> 'DEAD_LETTER' or e.published_at is not null
  ) then raise exception 'Skipped outbox repair did not complete'; end if;
  if exists (
    select 1 from public.external_receipts r join skipped_outbox_repair q
      on r.id::text=q.delivery_result->>'receiptId' and r.tenant_id=q.tenant_id
    where r.receipt_type='DISABLED_INTEGRATION' and r.verified
  ) then raise exception 'Disabled integration still has verified delivery evidence'; end if;
end $$;

select count(*) as corrected_events from skipped_outbox_repair;
commit;
