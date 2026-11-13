-- Decision desk, append-only work events, and archiving of duplicate spend requests.
-- Additive and idempotent. Nothing is deleted and nothing is approved:
-- duplicates are only marked archived in metadata and stay readable.

create table if not exists public.orvanta_work_events (
  id text primary key,
  tenant_id text not null,
  entity_type text not null,
  entity_id text not null,
  actor text not null,
  action text not null,
  from_state text,
  to_state text,
  note text not null default '',
  evidence text,
  at timestamptz not null default now()
);

create index if not exists orvanta_work_events_tenant_at_idx
  on public.orvanta_work_events (tenant_id, at desc);
create index if not exists orvanta_work_events_entity_idx
  on public.orvanta_work_events (tenant_id, entity_type, entity_id, at desc);

alter table public.orvanta_work_events enable row level security;
drop policy if exists server_only_no_client_access on public.orvanta_work_events;
create policy server_only_no_client_access on public.orvanta_work_events
  for all to anon, authenticated using (false) with check (false);
grant select, insert on table public.orvanta_work_events to service_role;
revoke all on table public.orvanta_work_events from anon, authenticated, public;

-- The log is append-only: no update, no delete, for any role.
create or replace function public.orvanta_work_events_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'WORK_EVENTS_APPEND_ONLY';
end;
$$;

drop trigger if exists orvanta_work_events_no_change on public.orvanta_work_events;
create trigger orvanta_work_events_no_change
  before update or delete on public.orvanta_work_events
  for each row execute function public.orvanta_work_events_append_only();

create index if not exists agent_bridge_messages_command_idx
  on public.agent_bridge_messages (tenant_id, (metadata->>'commandId'), created_at desc);

-- Archive (never delete) open spend requests that repeat the same title and
-- amount. The earliest request of each group stays; the rest point to it.
do $$
begin
  if to_regclass('public.company_approvals') is not null then
    with ranked as (
      select id,
             first_value(id) over w as keep_id,
             row_number() over w as position
      from public.company_approvals
      where status in ('PENDING', 'DEFERRED')
        and coalesce(amount, 0) > 0
        and coalesce(metadata->>'archived', '') = ''
      window w as (
        partition by tenant_id, regexp_replace(btrim(title), '\s+', ' ', 'g'), amount
        order by created_at asc, id asc
      )
    )
    update public.company_approvals as approval
    set metadata = jsonb_set(
      coalesce(approval.metadata, '{}'::jsonb),
      '{archived}',
      jsonb_build_object(
        'reason', 'duplicate',
        'mergedInto', ranked.keep_id,
        'at', now(),
        'by', 'system',
        'note', 'مكرر بنفس العنوان والمبلغ؛ أُرشف بموافقة رئيس مجلس الإدارة (أرشفة لا حذف).'
      ),
      true
    )
    from ranked
    where approval.id = ranked.id
      and ranked.position > 1;
  end if;
end
$$;

notify pgrst, 'reload schema';
