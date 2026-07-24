-- The Executive Secretariat's ledger. Every issued decision that must be
-- carried out becomes a tracked commitment here: it has an owner, a due date,
-- and a lifecycle that ends only in real completion. No decision can be "lost"
-- because the secretariat opens a row the moment a decision is approved or
-- forwarded, and the daily sweep chases anything overdue.

create extension if not exists pgcrypto;

create table if not exists public.decision_commitments (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  -- Link back to the originating decision / item.
  decision_id text,
  source_type text not null,
  source_id text not null,
  title text not null,
  detail text,
  -- Lifecycle: OPEN (caught, needs owner) → ASSIGNED → IN_PROGRESS →
  -- COMPLETED. BLOCKED / CANCELLED are terminal side-states.
  status text not null default 'OPEN'
    check (status in ('OPEN','ASSIGNED','IN_PROGRESS','COMPLETED','BLOCKED','CANCELLED')),
  priority text not null default 'MEDIUM' check (priority in ('LOW','MEDIUM','HIGH','CRITICAL')),
  -- The accountable person. assignee_id may reference a company agent id.
  assignee_id text,
  assignee_name text,
  decided_by text,
  due_at timestamptz,
  -- Chase / escalation bookkeeping, driven by the daily sweep.
  reminded_at timestamptz,
  reminder_count integer not null default 0,
  escalated boolean not null default false,
  escalated_at timestamptz,
  -- Honest closure: real-world commitments require proof to complete.
  requires_proof boolean not null default false,
  completed_at timestamptz,
  completed_by text,
  completion_note text,
  -- Ties the decision to what actually executed it.
  linked_entity_type text,
  linked_entity_id text,
  created_by text not null default 'diwan',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists decision_commitments_open_idx
  on public.decision_commitments (tenant_id, status, due_at)
  where status not in ('COMPLETED','CANCELLED');
create index if not exists decision_commitments_assignee_idx
  on public.decision_commitments (tenant_id, assignee_id, status);
create unique index if not exists decision_commitments_source_uidx
  on public.decision_commitments (tenant_id, source_type, source_id)
  where status not in ('COMPLETED','CANCELLED');

alter table public.decision_commitments enable row level security;
drop policy if exists server_only_no_client_access on public.decision_commitments;
create policy server_only_no_client_access on public.decision_commitments
  for all to anon, authenticated using (false) with check (false);

revoke all on public.decision_commitments from public, anon, authenticated;
grant select, insert, update, delete on public.decision_commitments to service_role;

notify pgrst, 'reload schema';
