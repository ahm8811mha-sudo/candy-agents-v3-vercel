-- Owner-only spend, chairman commands, and the per-agent bridge.
-- Additive and idempotent. Pending money with no review chain is marked for
-- Abdulrahman's finance review. Rows are not deleted and not approved.
-- Non-financial decisions are left untouched. No webhook destination is set.

create table if not exists public.agent_bridge_messages (
  id text primary key,
  tenant_id text not null,
  agent_id text not null,
  direction text not null check (direction in ('inbound', 'outbound', 'note')),
  body text not null,
  author text not null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists agent_bridge_messages_agent_idx
  on public.agent_bridge_messages (tenant_id, agent_id, created_at desc);

create table if not exists public.chairman_commands (
  id text primary key,
  tenant_id text not null,
  status text not null,
  owner_agent_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists chairman_commands_tenant_idx
  on public.chairman_commands (tenant_id, updated_at desc);

alter table public.agent_bridge_messages enable row level security;
alter table public.chairman_commands enable row level security;

drop policy if exists server_only_no_client_access on public.agent_bridge_messages;
drop policy if exists server_only_no_client_access on public.chairman_commands;
create policy server_only_no_client_access on public.agent_bridge_messages
  for all to anon, authenticated using (false) with check (false);
create policy server_only_no_client_access on public.chairman_commands
  for all to anon, authenticated using (false) with check (false);

grant select, insert, update, delete on table public.agent_bridge_messages to service_role;
grant select, insert, update, delete on table public.chairman_commands to service_role;
revoke all on table public.agent_bridge_messages from anon, authenticated, public;
revoke all on table public.chairman_commands from anon, authenticated, public;

do $$
begin
  if to_regclass('public.company_approvals') is not null then
    update public.company_approvals
    set metadata = jsonb_set(
      coalesce(metadata, '{}'::jsonb),
      '{spendChain}',
      jsonb_build_object(
        'stage', 'finance',
        'legacy', true,
        'needsChainReview', true,
        'preparingAgentId', coalesce(metadata->>'preparingAgentId', 'department'),
        'subject', coalesce(title, 'طلب صرف قائم'),
        'amountSAR', amount,
        'options', '',
        'expectedReturn', '',
        'risks', '',
        'financeReview', null,
        'governanceReview', null,
        'sultanRecommendation', null,
        'note', 'needs chain review',
        'decision', null,
        'decidedAt', null
      ),
      true
    )
    where status in ('PENDING', 'DEFERRED')
      and coalesce(amount, 0) > 0
      and (
        metadata->'spendChain' is null
        or coalesce(metadata->'spendChain'->>'stage', '') = ''
      );
  end if;

  if to_regclass('public.owner_absence_policies') is not null then
    alter table public.owner_absence_policies alter column routine_auto_limit_sar set default 0;
    alter table public.owner_absence_policies alter column executive_agent_limit_sar set default 0;
    update public.owner_absence_policies
      set routine_auto_limit_sar = 0,
          executive_agent_limit_sar = 0
      where routine_auto_limit_sar <> 0 or executive_agent_limit_sar <> 0;
  end if;
end
$$;

notify pgrst, 'reload schema';
