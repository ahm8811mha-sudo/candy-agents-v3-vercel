create extension if not exists pgcrypto;

create table if not exists public.cron_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  job_name text not null,
  status text not null default 'STARTED' check (status in ('STARTED', 'SUCCEEDED', 'FAILED', 'TIMED_OUT')),
  started_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer,
  processed_count integer not null default 0,
  failed_count integer not null default 0,
  request_id text,
  correlation_id text,
  schedule text,
  details jsonb not null default '{}',
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cron_runs_job_started_idx
  on public.cron_runs (job_name, started_at desc);
create index if not exists cron_runs_status_heartbeat_idx
  on public.cron_runs (status, heartbeat_at);
create index if not exists cron_runs_tenant_started_idx
  on public.cron_runs (tenant_id, started_at desc);

alter table public.cron_runs enable row level security;
revoke all on table public.cron_runs from public, anon, authenticated;
grant select, insert, update, delete on table public.cron_runs to service_role;

notify pgrst, 'reload schema';
