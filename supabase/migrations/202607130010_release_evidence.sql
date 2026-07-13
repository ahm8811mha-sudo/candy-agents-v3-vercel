create extension if not exists pgcrypto;

create table if not exists public.readiness_evidence (
  id uuid primary key default gen_random_uuid(),
  evidence_key text not null,
  environment text not null default 'production' check (environment in ('development','staging','production','restore-drill')),
  status text not null check (status in ('PASS','FAIL','WARN')),
  commit_sha text,
  details jsonb not null default '{}',
  performed_by text,
  performed_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists readiness_evidence_key_time_idx
  on public.readiness_evidence (evidence_key, environment, performed_at desc);

alter table public.readiness_evidence enable row level security;
revoke all on public.readiness_evidence from public, anon, authenticated;
grant select, insert, update, delete on public.readiness_evidence to service_role;

notify pgrst, 'reload schema';
