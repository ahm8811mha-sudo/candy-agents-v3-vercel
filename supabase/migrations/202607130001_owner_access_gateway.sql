-- Secure personal owner gateway.
-- The plaintext owner code is never stored in the repository or database.

create table if not exists public.owner_access_credentials (
  id text primary key,
  access_code_hash text not null check (length(access_code_hash) = 64),
  enabled boolean not null default true,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  last_failed_at timestamptz,
  last_success_at timestamptz,
  rotated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.owner_access_credentials enable row level security;
revoke all on table public.owner_access_credentials from public, anon, authenticated;
grant select, insert, update, delete on table public.owner_access_credentials to service_role;

insert into public.owner_access_credentials (
  id,
  access_code_hash,
  enabled,
  failed_attempts,
  rotated_at,
  updated_at
) values (
  'primary-owner',
  'e6632061fa5d9d22c304f162e3004e160e0c78ae24104fd285870155bb3811af',
  true,
  0,
  now(),
  now()
)
on conflict (id) do update set
  access_code_hash = excluded.access_code_hash,
  enabled = true,
  failed_attempts = 0,
  locked_until = null,
  last_failed_at = null,
  rotated_at = now(),
  updated_at = now();

notify pgrst, 'reload schema';
