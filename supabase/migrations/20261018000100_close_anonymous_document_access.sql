-- Close every anonymous path to government documents.
--
-- database/schema.sql grants the anonymous role `select using (true)` on the
-- document tables, and database/policies.sql lets it read, upload and change
-- objects in the government-documents bucket. Which of those files ever ran
-- against production is unknown, and production holds document tables this
-- repository never defined (see 202607150003_database_advisor_hardening.sql).
-- So this works over whatever exists, not over a fixed list.
--
-- The application reaches these tables only with the service role (owner
-- access is a signed cookie, not Supabase Auth), so every gov_ object becomes
-- server-only, the pattern of 202607150003. Idempotent.
--
-- Design: docs/superpowers/specs/2026-10-18-execution-document-proof-design.md
-- Plan:   docs/superpowers/plans/2026-10-18-execution-document-proof.md, task 3

do $$
declare
  v_object record;
  v_policy record;
begin
  for v_object in
    select c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname like 'gov\_%'
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
  loop
    execute format('revoke all on table public.%I from anon, authenticated, public', v_object.relname);
    execute format('grant all on table public.%I to service_role', v_object.relname);

    if v_object.relkind in ('r', 'p') then
      execute format('alter table public.%I enable row level security', v_object.relname);
      -- Every policy, whatever its name: that is what removes `using (true)`.
      for v_policy in
        select policyname from pg_policies where schemaname = 'public' and tablename = v_object.relname
      loop
        execute format('drop policy %I on public.%I', v_policy.policyname, v_object.relname);
      end loop;
      execute format(
        'create policy server_only_no_client_access on public.%I for all to anon, authenticated using (false) with check (false)',
        v_object.relname
      );
    end if;
  end loop;
end
$$;

-- Storage: the bucket private, and no client-role policy on its objects.
-- Policies on other buckets are left alone.
do $$
declare
  v_policy record;
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets set public = false where id = 'government-documents' and public is distinct from false;
  end if;

  if to_regclass('storage.objects') is not null then
    for v_policy in
      select policyname
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and roles && array['anon', 'authenticated', 'public']::name[]
        and (coalesce(qual, '') like '%government-documents%' or coalesce(with_check, '') like '%government-documents%')
    loop
      execute format('drop policy %I on storage.objects', v_policy.policyname);
    end loop;
  end if;
exception when insufficient_privilege then
  -- The suite fails loudly if a client policy is left in place.
  raise warning 'storage policies could not be changed by this role: %', sqlerrm;
end
$$;

notify pgrst, 'reload schema';
