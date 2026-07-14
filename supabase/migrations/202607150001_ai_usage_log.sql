-- LLM usage ledger: one row per agent call with tokens and estimated cost.
create extension if not exists pgcrypto;

create table if not exists public.ai_usage_log (
  id text primary key,
  tenant_id text not null default 'golden-star',
  agent_name text not null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_usd numeric(12, 6) not null default 0,
  duration_ms integer not null default 0,
  ok boolean not null default true,
  demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_log_created_idx
  on public.ai_usage_log (created_at desc);
create index if not exists ai_usage_log_agent_created_idx
  on public.ai_usage_log (agent_name, created_at desc);
create index if not exists ai_usage_log_tenant_created_idx
  on public.ai_usage_log (tenant_id, created_at desc);

alter table public.ai_usage_log enable row level security;
revoke all on table public.ai_usage_log from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_usage_log to service_role;

notify pgrst, 'reload schema';
