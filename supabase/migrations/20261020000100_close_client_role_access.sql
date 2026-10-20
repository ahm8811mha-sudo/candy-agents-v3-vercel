-- Close every client-role path into the business database.
--
-- The production build log of 2026-10-20 (the release before this one) listed
-- more than eighty public tables a client role could reach: accounting,
-- invoices, employees, tasks, approvals, the audit log. Anyone holding the
-- project's anonymous key could read them, and in places write them.
--
-- The application never uses a client role. Its only database client is the
-- service role (lib/supabase.ts, getSupabaseAdmin), and Supabase Auth is used
-- only to verify tokens on the server. So in public:
-- - anon, authenticated and PUBLIC lose every table, view and sequence
--   privilege, and row level security is on for every table (the service role
--   bypasses it);
-- - functions that run with their owner's rights lose EXECUTE for them;
-- - the service role is granted everything it needs, explicitly, first.
-- Existing policies stay as they are: without a privilege they open nothing,
-- and tenant-scoped ones are kept for a future client mode. Objects that
-- belong to an extension, or to a role this one cannot act for, are skipped;
-- client_access_regression.sql fails if any of them is still reachable.
-- Data is not touched. Reversible by granting again. Idempotent.

do $$
declare
  v record;
begin
  for v in
    select c.relname, c.relkind
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
      and pg_has_role(c.relowner, 'USAGE')
      and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
  loop
    if v.relkind = 'S' then
      execute format('grant all on sequence public.%I to service_role', v.relname);
      execute format('revoke all on sequence public.%I from anon, authenticated, public', v.relname);
    else
      execute format('grant all on table public.%I to service_role', v.relname);
      execute format('revoke all on table public.%I from anon, authenticated, public', v.relname);
      if v.relkind in ('r', 'p') then
        execute format('alter table public.%I enable row level security', v.relname);
      end if;
    end if;
  end loop;

  for v in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prokind, p.prosecdef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and p.prorettype <> 'trigger'::regtype
      and pg_has_role(p.proowner, 'USAGE')
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('grant execute on %s public.%I(%s) to service_role',
      case when v.prokind = 'p' then 'procedure' else 'function' end, v.proname, v.args);
    if v.prosecdef then
      execute format('revoke execute on %s public.%I(%s) from anon, authenticated, public',
        case when v.prokind = 'p' then 'procedure' else 'function' end, v.proname, v.args);
    end if;
  end loop;
end
$$;

-- What this role creates from now on is not handed to the client roles.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

notify pgrst, 'reload schema';
