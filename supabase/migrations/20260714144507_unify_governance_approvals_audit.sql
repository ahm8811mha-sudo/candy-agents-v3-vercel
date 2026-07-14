-- Complete the governance consolidation with durable metadata and
-- serverless-safe approval idempotency. Safe to re-run.

alter table if exists public.audit_log
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table if exists public.company_approvals
  add column if not exists dedupe_key text;

update public.company_approvals
set dedupe_key = metadata ->> 'dedupeKey'
where dedupe_key is null
  and metadata ? 'dedupeKey';

-- Preserve all rows. If historical duplicates exist, only the oldest pending
-- row keeps the key; the duplicate rows remain visible for audit purposes.
with ranked as (
  select id,
         row_number() over (
           partition by tenant_id, dedupe_key
           order by created_at asc, id asc
         ) as position
  from public.company_approvals
  where status = 'PENDING'
    and dedupe_key is not null
)
update public.company_approvals approvals
set dedupe_key = null
from ranked
where approvals.id = ranked.id
  and ranked.position > 1;

create unique index if not exists company_approvals_pending_dedupe_idx
  on public.company_approvals (tenant_id, dedupe_key)
  where status = 'PENDING' and dedupe_key is not null;

create index if not exists company_approvals_entity_idx
  on public.company_approvals (
    tenant_id,
    ((metadata ->> 'entityType')),
    ((metadata ->> 'entityId')),
    created_at desc
  );

-- Migrate the legacy decision trail into the unified append-only log. The
-- deterministic id makes this backfill idempotent.
do $$
begin
  if to_regclass('public.decision_audit_log') is not null then
    execute $backfill$
      insert into public.audit_log (
        id, actor, role, action, entity_type, entity_id, detail, tier,
        metadata, created_at, tenant_id
      )
      select
        'legacy-decision-' || legacy.id::text,
        legacy.actor_role,
        legacy.actor_role,
        legacy.decision_type || ': ' || legacy.action,
        coalesce(legacy.entity_type, 'governance'),
        coalesce(legacy.entity_id, '-'),
        coalesce(legacy.immutable_note, legacy.action),
        null,
        coalesce(legacy.metadata, '{}'::jsonb) || jsonb_build_object(
          'decisionType', legacy.decision_type,
          'amount', legacy.amount,
          'riskLevel', legacy.risk_level,
          'approvalStatus', legacy.approval_status,
          'legacyAuditId', legacy.id
        ),
        coalesce(legacy.created_at, now()),
        legacy.tenant_id
      from public.decision_audit_log legacy
      on conflict (id) do nothing
    $backfill$;
  end if;
end;
$$;

comment on column public.company_approvals.dedupe_key is
  'Stable idempotency key for one pending approval per tenant and governed entity.';
comment on column public.audit_log.metadata is
  'Structured immutable context for governance, authority, and legacy audit compatibility.';
