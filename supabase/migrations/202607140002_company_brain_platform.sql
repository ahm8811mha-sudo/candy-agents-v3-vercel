create extension if not exists pgcrypto;

create table if not exists public.company_twin_states (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  scope_type text not null default 'COMPANY',
  scope_id text not null default 'root',
  health_score numeric(5,2) not null check (health_score between 0 and 100),
  maturity_score numeric(5,2) not null check (maturity_score between 0 and 100),
  capacity jsonb not null default '{}',
  constraints jsonb not null default '[]',
  state jsonb not null default '{}',
  source_snapshot_id uuid references public.company_intelligence_snapshots(id) on delete set null,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, scope_type, scope_id)
);

create table if not exists public.company_prediction_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  prediction_type text not null,
  subject_type text not null,
  subject_id text not null,
  horizon_days integer not null check (horizon_days between 1 and 1825),
  input_features jsonb not null default '{}',
  prediction jsonb not null default '{}',
  probability numeric(5,4) not null check (probability between 0 and 1),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  data_quality numeric(5,4) not null check (data_quality between 0 and 1),
  model_version text not null default 'deterministic-v1',
  evidence jsonb not null default '[]',
  limitations jsonb not null default '[]',
  valid_until timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.company_fact_daily (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  fact_date date not null,
  domain text not null,
  metric_key text not null,
  numeric_value numeric,
  text_value text,
  json_value jsonb,
  unit text,
  source text not null,
  source_reference text,
  quality_score numeric(5,4) not null default 1 check (quality_score between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, fact_date, domain, metric_key, source, source_reference)
);

create table if not exists public.company_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  pipeline text not null,
  status text not null default 'STARTED' check (status in ('STARTED','SUCCEEDED','PARTIAL','FAILED')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  rows_read integer not null default 0,
  nodes_upserted integer not null default 0,
  features_written integer not null default 0,
  facts_written integer not null default 0,
  failures integer not null default 0,
  details jsonb not null default '{}',
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.skill_definitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  version text not null,
  name text not null,
  description text not null,
  category text not null,
  manifest jsonb not null default '{}',
  execution_mode text not null default 'SERVER' check (execution_mode in ('SERVER','HUMAN_CHECKPOINT','EXTERNAL','DISABLED')),
  risk_level text not null default 'LOW' check (risk_level in ('LOW','MEDIUM','HIGH','CRITICAL')),
  approval_required boolean not null default false,
  status text not null default 'ACTIVE' check (status in ('DRAFT','ACTIVE','DEPRECATED','DISABLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slug, version)
);

create table if not exists public.skill_installations (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  skill_id uuid not null references public.skill_definitions(id) on delete restrict,
  configuration jsonb not null default '{}',
  enabled boolean not null default true,
  installed_by text,
  installed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, skill_id)
);

create table if not exists public.skill_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  installation_id uuid not null references public.skill_installations(id) on delete restrict,
  idempotency_key text not null,
  input jsonb not null default '{}',
  output jsonb not null default '{}',
  status text not null default 'QUEUED' check (status in ('QUEUED','AWAITING_APPROVAL','RUNNING','SUCCEEDED','FAILED','CANCELLED')),
  requested_by text,
  approved_by text,
  approved_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  receipt_id uuid references public.external_receipts(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create index if not exists twin_states_tenant_scope_idx on public.company_twin_states (tenant_id, scope_type, scope_id);
create index if not exists prediction_runs_subject_idx on public.company_prediction_runs (tenant_id, subject_type, subject_id, prediction_type, created_at desc);
create index if not exists company_fact_daily_lookup_idx on public.company_fact_daily (tenant_id, domain, metric_key, fact_date desc);
create index if not exists ingestion_runs_tenant_idx on public.company_ingestion_runs (tenant_id, pipeline, started_at desc);
create index if not exists skill_definitions_status_idx on public.skill_definitions (status, category, slug);
create index if not exists skill_installations_tenant_idx on public.skill_installations (tenant_id, enabled, installed_at desc);
create index if not exists skill_runs_status_idx on public.skill_runs (tenant_id, status, created_at desc);

alter table public.company_twin_states enable row level security;
alter table public.company_prediction_runs enable row level security;
alter table public.company_fact_daily enable row level security;
alter table public.company_ingestion_runs enable row level security;
alter table public.skill_definitions enable row level security;
alter table public.skill_installations enable row level security;
alter table public.skill_runs enable row level security;

revoke all on table public.company_twin_states from public, anon, authenticated;
revoke all on table public.company_prediction_runs from public, anon, authenticated;
revoke all on table public.company_fact_daily from public, anon, authenticated;
revoke all on table public.company_ingestion_runs from public, anon, authenticated;
revoke all on table public.skill_definitions from public, anon, authenticated;
revoke all on table public.skill_installations from public, anon, authenticated;
revoke all on table public.skill_runs from public, anon, authenticated;

grant select, insert, update, delete on table public.company_twin_states to service_role;
grant select, insert, update, delete on table public.company_prediction_runs to service_role;
grant select, insert, update, delete on table public.company_fact_daily to service_role;
grant select, insert, update, delete on table public.company_ingestion_runs to service_role;
grant select, insert, update, delete on table public.skill_definitions to service_role;
grant select, insert, update, delete on table public.skill_installations to service_role;
grant select, insert, update, delete on table public.skill_runs to service_role;

insert into public.skill_definitions (slug, version, name, description, category, manifest, execution_mode, risk_level, approval_required, status)
values
  ('government-document-control','1.0.0','Government Document Control','Analyze, classify, store, create follow-up work, and monitor government documents.','GOVERNMENT_RELATIONS','{"capabilities":["DOCUMENT_ANALYSIS","CLASSIFICATION","TASK_CREATION","EXPIRY_MONITORING","FORM_PREPARATION"],"outputContract":"EXECUTION_RECEIPT"}'::jsonb,'SERVER','HIGH',true,'ACTIVE'),
  ('executive-decision-brief','1.0.0','Executive Decision Brief','Build an evidence-based recommendation with risks, alternatives, confidence, and expected impact.','DECISION_INTELLIGENCE','{"capabilities":["SNAPSHOT","RECOMMENDATION","NARRATIVE","ALTERNATIVES"],"outputContract":"DECISION_PACKAGE"}'::jsonb,'SERVER','MEDIUM',false,'ACTIVE'),
  ('company-simulation','1.0.0','Company Simulation','Run governed what-if scenarios against the digital twin.','SIMULATION','{"capabilities":["WHAT_IF","SENSITIVITY","BREAK_EVEN","CASH_IMPACT"],"outputContract":"SIMULATION_RESULT"}'::jsonb,'SERVER','MEDIUM',false,'ACTIVE'),
  ('autonomous-planner','1.0.0','Autonomous Planner','Convert a goal into phases, tasks, budget, risks, KPIs, and approval checkpoints.','PLANNING','{"capabilities":["GOAL_DECOMPOSITION","TASKS","BUDGET","TIMELINE","RISKS","KPIS"],"outputContract":"APPROVAL_GATED_PLAN"}'::jsonb,'SERVER','HIGH',true,'ACTIVE')
on conflict (slug, version) do update set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  manifest=excluded.manifest,
  execution_mode=excluded.execution_mode,
  risk_level=excluded.risk_level,
  approval_required=excluded.approval_required,
  status=excluded.status,
  updated_at=now();

notify pgrst, 'reload schema';
