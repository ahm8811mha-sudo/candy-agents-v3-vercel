-- ORVANTA World-Class Company Operating System foundation
-- Run only after reviewing docs/supabase-schema.sql and docs/supabase-multitenant.sql.
-- This migration is idempotent where PostgreSQL allows it.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Strategic objectives and opportunities
-- ---------------------------------------------------------------------------
create table if not exists company_objectives (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  title text not null,
  description text,
  owner_role text not null default 'CEO',
  status text not null default 'ACTIVE',
  target_value numeric,
  current_value numeric,
  unit text,
  starts_at timestamptz,
  due_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_objectives_tenant_status_idx on company_objectives (tenant_id, status, due_at);

create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  objective_id uuid references company_objectives(id) on delete set null,
  title text not null,
  hypothesis text,
  strategic_fit_score numeric,
  estimated_value_sar numeric,
  confidence numeric,
  status text not null default 'DISCOVERED',
  evidence jsonb not null default '[]',
  unknowns jsonb not null default '[]',
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists opportunities_tenant_status_idx on opportunities (tenant_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Decision packets, governance and risk
-- ---------------------------------------------------------------------------
create table if not exists decision_packets (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  objective_id uuid references company_objectives(id) on delete set null,
  opportunity_id uuid references opportunities(id) on delete set null,
  project_id uuid,
  title text not null,
  recommendation text not null,
  facts jsonb not null default '[]',
  assumptions jsonb not null default '[]',
  options jsonb not null default '[]',
  financial_impact_sar numeric not null default 0,
  risk_level text not null,
  dissenting_view text,
  required_approvals jsonb not null default '[]',
  success_criteria jsonb not null default '[]',
  kill_criteria jsonb not null default '[]',
  status text not null default 'DRAFT',
  expires_at timestamptz,
  review_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists decision_packets_tenant_status_idx on decision_packets (tenant_id, status, risk_level, created_at desc);

create table if not exists decision_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  decision_id uuid not null references decision_packets(id) on delete cascade,
  required_role text not null,
  approver_id text,
  status text not null default 'PENDING',
  note text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (decision_id, required_role)
);
create index if not exists decision_approvals_tenant_status_idx on decision_approvals (tenant_id, status, created_at desc);

create table if not exists risk_register (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  entity_type text not null,
  entity_id text not null,
  category text not null,
  level text not null,
  title text not null,
  description text,
  probability numeric,
  impact numeric,
  owner_role text,
  mitigation_plan text,
  contingency_plan text,
  status text not null default 'OPEN',
  review_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists risk_register_tenant_status_idx on risk_register (tenant_id, status, level, review_at);

-- ---------------------------------------------------------------------------
-- Durable workflow runtime foundation
-- ---------------------------------------------------------------------------
create table if not exists workflow_definitions (
  id text primary key,
  version integer not null,
  name text not null,
  owner_engine text not null,
  material_risk text not null,
  definition jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, version)
);

create table if not exists workflow_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  workflow_id text not null,
  workflow_version integer not null,
  entity_type text not null,
  entity_id text not null,
  correlation_id text not null,
  status text not null default 'PENDING',
  current_step text,
  input jsonb not null default '{}',
  output jsonb,
  error jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  next_wake_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, correlation_id)
);
create index if not exists workflow_instances_tenant_status_idx on workflow_instances (tenant_id, status, next_wake_at);

create table if not exists workflow_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  workflow_instance_id uuid not null references workflow_instances(id) on delete cascade,
  step_key text not null,
  step_order integer not null,
  status text not null default 'PENDING',
  attempt integer not null default 0,
  idempotency_key text not null,
  input jsonb not null default '{}',
  output jsonb,
  error jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);
create index if not exists workflow_steps_ready_idx on workflow_steps (tenant_id, status, available_at);

-- ---------------------------------------------------------------------------
-- Event store and transactional outbox
-- ---------------------------------------------------------------------------
create table if not exists company_events (
  id text primary key,
  tenant_id text not null,
  event_type text not null,
  event_version integer not null default 1,
  actor_id text not null,
  actor_type text not null,
  entity_type text not null,
  entity_id text not null,
  correlation_id text not null,
  causation_id text,
  payload jsonb not null default '{}',
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists company_events_tenant_entity_idx on company_events (tenant_id, entity_type, entity_id, occurred_at);
create index if not exists company_events_tenant_correlation_idx on company_events (tenant_id, correlation_id, occurred_at);

create table if not exists event_outbox (
  id text primary key,
  tenant_id text not null,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  correlation_id text not null,
  causation_id text,
  payload jsonb not null default '{}',
  status text not null default 'PENDING',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  published_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists event_outbox_ready_idx on event_outbox (status, available_at, created_at);

-- ---------------------------------------------------------------------------
-- Organizational memory and temporal knowledge graph
-- ---------------------------------------------------------------------------
create table if not exists knowledge_nodes (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  node_type text not null,
  external_id text,
  name text not null,
  summary text,
  source text not null,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  metadata jsonb not null default '{}',
  embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists knowledge_nodes_tenant_type_idx on knowledge_nodes (tenant_id, node_type, valid_from desc);
create unique index if not exists knowledge_nodes_tenant_external_idx on knowledge_nodes (tenant_id, node_type, external_id) where external_id is not null;

create table if not exists knowledge_edges (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  from_node_id uuid not null references knowledge_nodes(id) on delete cascade,
  to_node_id uuid not null references knowledge_nodes(id) on delete cascade,
  relationship text not null,
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists knowledge_edges_from_idx on knowledge_edges (tenant_id, from_node_id, relationship);
create index if not exists knowledge_edges_to_idx on knowledge_edges (tenant_id, to_node_id, relationship);

create table if not exists lessons_learned (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  entity_type text not null,
  entity_id text not null,
  expected_outcome jsonb not null default '{}',
  actual_outcome jsonb not null default '{}',
  forecast_error jsonb not null default '{}',
  root_cause text,
  lesson text not null,
  policy_change text,
  playbook_change text,
  created_at timestamptz not null default now()
);
create index if not exists lessons_learned_tenant_entity_idx on lessons_learned (tenant_id, entity_type, entity_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Financial commitments and reconciliation controls
-- ---------------------------------------------------------------------------
create table if not exists budget_commitments (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  decision_id uuid references decision_packets(id) on delete set null,
  project_id uuid,
  amount_sar numeric not null check (amount_sar >= 0),
  status text not null default 'RESERVED',
  reference text,
  expires_at timestamptz,
  released_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists budget_commitments_tenant_status_idx on budget_commitments (tenant_id, status, expires_at);

create table if not exists execution_reconciliations (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  action_id uuid,
  external_reference text,
  expected_result jsonb not null default '{}',
  actual_result jsonb,
  financial_entry_reference text,
  status text not null default 'PENDING',
  exception_reason text,
  reconciled_by text,
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, external_reference)
);
create index if not exists execution_reconciliations_tenant_status_idx on execution_reconciliations (tenant_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- AI board and model governance
-- ---------------------------------------------------------------------------
create table if not exists executive_board_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  session_type text not null,
  status text not null default 'OPEN',
  agenda jsonb not null default '[]',
  participants jsonb not null default '[]',
  decisions jsonb not null default '[]',
  dissent jsonb not null default '[]',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists executive_board_sessions_tenant_idx on executive_board_sessions (tenant_id, session_type, started_at desc);

create table if not exists model_execution_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  correlation_id text not null,
  engine_id text not null,
  model_provider text not null,
  model_name text not null,
  prompt_version text,
  policy_version text,
  input_hash text,
  output_hash text,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  estimated_cost_usd numeric,
  confidence numeric,
  evaluation jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists model_execution_log_tenant_correlation_idx on model_execution_log (tenant_id, correlation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: enabled. Policies must be installed with real authenticated tenant claims.
-- Service-role writes bypass RLS. Do not expose service-role keys to clients.
-- ---------------------------------------------------------------------------
alter table company_objectives enable row level security;
alter table opportunities enable row level security;
alter table decision_packets enable row level security;
alter table decision_approvals enable row level security;
alter table risk_register enable row level security;
alter table workflow_instances enable row level security;
alter table workflow_steps enable row level security;
alter table company_events enable row level security;
alter table event_outbox enable row level security;
alter table knowledge_nodes enable row level security;
alter table knowledge_edges enable row level security;
alter table lessons_learned enable row level security;
alter table budget_commitments enable row level security;
alter table execution_reconciliations enable row level security;
alter table executive_board_sessions enable row level security;
alter table model_execution_log enable row level security;

notify pgrst, 'reload schema';
