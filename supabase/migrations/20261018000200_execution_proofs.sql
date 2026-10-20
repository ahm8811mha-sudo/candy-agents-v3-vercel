-- Execution proofs: the documents behind a real-world step's confirmation.
--
-- A proof is a draft until its task is confirmed; the confirmation
-- (orvanta_update_task_status, next migration) seals it. Once sealed, no role
-- can change or delete it: the triggers below fire for every role, the service
-- role included, so a confirmation can never outlive its documents. File rows
-- are never updated at all. Proofs are their own records in their own private
-- bucket, out of reach of anything written for government documents.
--
-- Plan: docs/superpowers/plans/2026-10-18-execution-document-proof.md, task 4
-- Idempotent.

create table if not exists public.execution_proofs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  task_id text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  facts_read jsonb,
  facts_attested jsonb,
  note text,
  confirmed_by text,
  confirmed_at timestamptz,
  constraint execution_proofs_sealed_complete check (
    (confirmed_at is null and confirmed_by is null)
    or (
      confirmed_at is not null and confirmed_by is not null
      and facts_attested is not null and length(trim(coalesce(note, ''))) >= 10
    )
  )
);

create unique index if not exists execution_proofs_one_open_draft
  on public.execution_proofs (tenant_id, task_id) where confirmed_at is null;
create index if not exists execution_proofs_tenant_task_idx on public.execution_proofs (tenant_id, task_id);

create table if not exists public.execution_proof_files (
  id uuid primary key default gen_random_uuid(),
  proof_id uuid not null references public.execution_proofs(id) on delete restrict,
  tenant_id text not null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 20971520),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  reading jsonb not null,
  created_at timestamptz not null default now(),
  unique (proof_id, sha256)
);

create index if not exists execution_proof_files_proof_idx on public.execution_proof_files (proof_id);

create or replace function public.orvanta_seal_execution_proof()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.confirmed_at is not null then
    raise exception 'PROOF_SEALED';
  end if;
  if tg_op = 'UPDATE'
     and (new.id, new.tenant_id, new.task_id, new.created_by, new.created_at)
         is distinct from (old.id, old.tenant_id, old.task_id, old.created_by, old.created_at) then
    raise exception 'PROOF_IDENTITY_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create or replace function public.orvanta_guard_execution_proof_file()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_proof public.execution_proofs;
  v_files integer;
begin
  if tg_op = 'UPDATE' then
    raise exception 'PROOF_FILE_IMMUTABLE';
  end if;

  -- Locking the parent serialises concurrent attachments and the sealing.
  select * into v_proof
  from public.execution_proofs
  where id = case when tg_op = 'DELETE' then old.proof_id else new.proof_id end
  for update;

  if v_proof.confirmed_at is not null then
    raise exception 'PROOF_SEALED';
  end if;

  if tg_op = 'INSERT' then
    if new.tenant_id is distinct from v_proof.tenant_id then
      raise exception 'PROOF_TENANT_MISMATCH';
    end if;
    select count(*) into v_files from public.execution_proof_files where proof_id = new.proof_id;
    if v_files >= 10 then
      raise exception 'PROOF_FILE_LIMIT';
    end if;
    return new;
  end if;

  return old;
end
$$;

drop trigger if exists trg_seal_execution_proof on public.execution_proofs;
create trigger trg_seal_execution_proof
  before update or delete on public.execution_proofs
  for each row execute function public.orvanta_seal_execution_proof();

drop trigger if exists trg_guard_execution_proof_file on public.execution_proof_files;
create trigger trg_guard_execution_proof_file
  before insert or update or delete on public.execution_proof_files
  for each row execute function public.orvanta_guard_execution_proof_file();

alter table public.execution_proofs enable row level security;
alter table public.execution_proof_files enable row level security;
revoke all on table public.execution_proofs, public.execution_proof_files from anon, authenticated, public;
grant all on table public.execution_proofs, public.execution_proof_files to service_role;
revoke all on function public.orvanta_seal_execution_proof(), public.orvanta_guard_execution_proof_file() from public, anon, authenticated;

do $$
declare v_table text;
begin
  foreach v_table in array array['execution_proofs', 'execution_proof_files']
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = v_table and policyname = 'server_only_no_client_access'
    ) then
      execute format(
        'create policy server_only_no_client_access on public.%I for all to anon, authenticated using (false) with check (false)',
        v_table
      );
    end if;
  end loop;
end
$$;

-- The bucket. The application also ensures it, private, before first use, so
-- a role that cannot write storage.buckets does not block this migration.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('execution-proofs', 'execution-proofs', false, 20971520,
            array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set
      public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
  end if;
exception when insufficient_privilege then
  raise warning 'storage.buckets could not be written by this role; the application creates the bucket on first use: %', sqlerrm;
end
$$;

notify pgrst, 'reload schema';
