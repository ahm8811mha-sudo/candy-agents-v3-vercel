\set ON_ERROR_STOP on

-- Read-only. No government document is reachable by a client role: every gov_
-- table and view is server-only, the bucket is private, and no client policy
-- opens its objects. Messages give counts, not names, because the Production
-- Verification log of a public repository is public.

begin;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname like 'gov\_%' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  if v_count > 0 then
    raise exception 'document access: row level security is off on % gov_ table(s)', v_count;
  end if;

  -- A view or foreign table has no row level security of its own, so any
  -- client privilege on one is a way in. (A table's grant is not: with RLS on
  -- and only the deny-all policy, it opens nothing, and Supabase grants new
  -- tables to client roles by default.)
  select count(*) into v_count
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname like 'gov\_%' and c.relkind in ('v', 'm', 'f')
    and (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
         or has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE'));
  if v_count > 0 then
    raise exception 'document access: client roles can read % gov_ view(s)', v_count;
  end if;

  select count(*) into v_count
  from pg_policies
  where schemaname = 'public' and tablename like 'gov\_%'
    and not (policyname = 'server_only_no_client_access' and qual = 'false' and with_check = 'false');
  if v_count > 0 then
    raise exception 'document access: % policy(ies) on gov_ tables other than the server-only one', v_count;
  end if;

  if to_regclass('storage.buckets') is not null then
    select count(*) into v_count from storage.buckets where id = 'government-documents' and public;
    if v_count > 0 then
      raise exception 'document access: the government-documents bucket is public';
    end if;
  end if;

  if to_regclass('storage.objects') is not null then
    select count(*) into v_count
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and roles && array['anon', 'authenticated', 'public']::name[]
      and (
        coalesce(qual, '') like '%government-documents%'
        or coalesce(with_check, '') like '%government-documents%'
        -- A client policy that names no bucket opens every bucket.
        or (coalesce(qual, '') not like '%bucket_id%' and coalesce(with_check, '') not like '%bucket_id%')
      );
    if v_count > 0 then
      raise exception 'document access: % client storage policy(ies) can reach government documents', v_count;
    end if;
  end if;
end
$$;

rollback;
