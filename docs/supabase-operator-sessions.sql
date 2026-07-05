create table if not exists public.operator_sessions (
  id text primary key,
  title text not null,
  target_url text not null,
  service_name text not null,
  operator_name text not null default 'Majed',
  request text,
  status text not null default 'READY',
  prepared_fields jsonb not null default '[]'::jsonb,
  checklist jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operator_sessions_status_idx on public.operator_sessions(status);
create index if not exists operator_sessions_created_at_idx on public.operator_sessions(created_at desc);

alter table public.operator_sessions enable row level security;
