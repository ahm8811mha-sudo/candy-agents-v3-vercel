create extension if not exists pgcrypto;

create table if not exists public.company_knowledge_nodes (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  entity_type text not null,
  entity_id text not null,
  title text not null,
  summary text,
  attributes jsonb not null default '{}',
  source text not null default 'system',
  confidence numeric(5,4) not null default 1 check (confidence between 0 and 1),
  observed_at timestamptz not null default now(),
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, entity_type, entity_id)
);

create table if not exists public.company_knowledge_edges (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  from_node_id uuid not null references public.company_knowledge_nodes(id) on delete cascade,
  to_node_id uuid not null references public.company_knowledge_nodes(id) on delete cascade,
  relation_type text not null,
  strength numeric(5,4) not null default 1 check (strength between 0 and 1),
  evidence jsonb not null default '[]',
  source text not null default 'system',
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, from_node_id, to_node_id, relation_type)
);

create table if not exists public.company_feature_values (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  entity_type text not null,
  entity_id text not null,
  feature_key text not null,
  numeric_value numeric,
  text_value text,
  json_value jsonb,
  unit text,
  source text not null default 'system',
  confidence numeric(5,4) not null default 1 check (confidence between 0 and 1),
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.company_intelligence_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  snapshot_type text not null default 'COMPANY',
  period_start timestamptz,
  period_end timestamptz not null default now(),
  metrics jsonb not null default '{}',
  risks jsonb not null default '[]',
  opportunities jsonb not null default '[]',
  freshness jsonb not null default '{}',
  generated_by text not null default 'company-brain',
  created_at timestamptz not null default now()
);

create table if not exists public.decision_recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  recommendation_type text not null,
  title text not null,
  rationale text not null,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  risk_level text not null check (risk_level in ('LOW','MEDIUM','HIGH','CRITICAL')),
  expected_impact jsonb not null default '{}',
  alternatives jsonb not null default '[]',
  evidence jsonb not null default '[]',
  status text not null default 'PROPOSED' check (status in ('PROPOSED','ACCEPTED','REJECTED','EXPIRED','EXECUTED')),
  related_entity_type text,
  related_entity_id text,
  model_version text not null default 'rules-v1',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.simulation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  name text not null,
  scenario_type text not null,
  baseline jsonb not null,
  assumptions jsonb not null,
  results jsonb not null,
  confidence numeric(5,4) not null default 0.6 check (confidence between 0 and 1),
  sensitivity jsonb not null default '{}',
  limitations jsonb not null default '[]',
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.autonomous_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  goal text not null,
  goal_type text not null default 'BUSINESS',
  assumptions jsonb not null default '{}',
  plan jsonb not null,
  budget jsonb not null default '{}',
  timeline jsonb not null default '{}',
  risks jsonb not null default '[]',
  kpis jsonb not null default '[]',
  status text not null default 'DRAFT' check (status in ('DRAFT','AWAITING_APPROVAL','APPROVED','EXECUTING','PAUSED','COMPLETED','CANCELLED')),
  version integer not null default 1,
  created_by text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_learning_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  subject_type text not null,
  subject_id text not null,
  event_type text not null,
  expected jsonb not null default '{}',
  actual jsonb not null default '{}',
  outcome_score numeric(7,4),
  lessons jsonb not null default '[]',
  feature_updates jsonb not null default '{}',
  source text not null default 'system',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.executive_narratives (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  narrative_type text not null default 'EXECUTIVE_BRIEF',
  period_start timestamptz,
  period_end timestamptz not null default now(),
  headline text not null,
  narrative text not null,
  drivers jsonb not null default '[]',
  risks jsonb not null default '[]',
  recommended_actions jsonb not null default '[]',
  confidence numeric(5,4) not null default 0.7 check (confidence between 0 and 1),
  source_snapshot_id uuid references public.company_intelligence_snapshots(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists knowledge_nodes_tenant_type_idx on public.company_knowledge_nodes (tenant_id, entity_type, observed_at desc);
create index if not exists knowledge_edges_from_idx on public.company_knowledge_edges (tenant_id, from_node_id, relation_type);
create index if not exists knowledge_edges_to_idx on public.company_knowledge_edges (tenant_id, to_node_id, relation_type);
create index if not exists feature_values_lookup_idx on public.company_feature_values (tenant_id, entity_type, entity_id, feature_key, observed_at desc);
create index if not exists intelligence_snapshots_tenant_idx on public.company_intelligence_snapshots (tenant_id, period_end desc);
create index if not exists recommendations_status_idx on public.decision_recommendations (tenant_id, status, risk_level, created_at desc);
create index if not exists simulations_tenant_idx on public.simulation_runs (tenant_id, created_at desc);
create index if not exists plans_status_idx on public.autonomous_plans (tenant_id, status, created_at desc);
create index if not exists learning_subject_idx on public.company_learning_events (tenant_id, subject_type, subject_id, occurred_at desc);
create index if not exists narratives_tenant_idx on public.executive_narratives (tenant_id, period_end desc);

alter table public.company_knowledge_nodes enable row level security;
alter table public.company_knowledge_edges enable row level security;
alter table public.company_feature_values enable row level security;
alter table public.company_intelligence_snapshots enable row level security;
alter table public.decision_recommendations enable row level security;
alter table public.simulation_runs enable row level security;
alter table public.autonomous_plans enable row level security;
alter table public.company_learning_events enable row level security;
alter table public.executive_narratives enable row level security;

revoke all on table public.company_knowledge_nodes from public, anon, authenticated;
revoke all on table public.company_knowledge_edges from public, anon, authenticated;
revoke all on table public.company_feature_values from public, anon, authenticated;
revoke all on table public.company_intelligence_snapshots from public, anon, authenticated;
revoke all on table public.decision_recommendations from public, anon, authenticated;
revoke all on table public.simulation_runs from public, anon, authenticated;
revoke all on table public.autonomous_plans from public, anon, authenticated;
revoke all on table public.company_learning_events from public, anon, authenticated;
revoke all on table public.executive_narratives from public, anon, authenticated;

grant select, insert, update, delete on table public.company_knowledge_nodes to service_role;
grant select, insert, update, delete on table public.company_knowledge_edges to service_role;
grant select, insert, update, delete on table public.company_feature_values to service_role;
grant select, insert, update, delete on table public.company_intelligence_snapshots to service_role;
grant select, insert, update, delete on table public.decision_recommendations to service_role;
grant select, insert, update, delete on table public.simulation_runs to service_role;
grant select, insert, update, delete on table public.autonomous_plans to service_role;
grant select, insert, update, delete on table public.company_learning_events to service_role;
grant select, insert, update, delete on table public.executive_narratives to service_role;

notify pgrst, 'reload schema';
