\set ON_ERROR_STOP on

-- Read-only. No client role can reach the business database: no table, view
-- or sequence privilege in public for anon or authenticated, and no function
-- that runs with its owner's rights is executable by them. The application,
-- which only ever connects as the service role, keeps every privilege it
-- uses. Counts only: this log can be public.

begin;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
    and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
    and (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
         or has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'));
  if v_count > 0 then
    raise exception 'client access: client roles hold privileges on % table(s) or view(s) in public', v_count;
  end if;

  select count(*) into v_count
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'S'
    and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
    and (has_sequence_privilege('anon', c.oid, 'USAGE,SELECT,UPDATE') or has_sequence_privilege('authenticated', c.oid, 'USAGE,SELECT,UPDATE'));
  if v_count > 0 then
    raise exception 'client access: client roles hold privileges on % sequence(s) in public', v_count;
  end if;

  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
    and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if v_count > 0 then
    raise exception 'client access: client roles can run % owner-rights function(s) in public', v_count;
  end if;

  select count(*) into v_count
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
    and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e');
  if v_count > 0 then
    raise exception 'client access: row level security is off on % table(s) in public', v_count;
  end if;

  -- The service role is how the application reaches every one of them, and
  -- it needs each privilege, not just one (a list in has_table_privilege
  -- means "any of").
  select count(*) into v_count
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
    and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
    and not (
      has_table_privilege('service_role', c.oid, 'SELECT')
      and (c.relkind in ('v', 'm') or (
        has_table_privilege('service_role', c.oid, 'INSERT')
        and has_table_privilege('service_role', c.oid, 'UPDATE')
        and has_table_privilege('service_role', c.oid, 'DELETE')))
    );
  if v_count > 0 then
    raise exception 'client access: the service role lost access to % table(s) or view(s)', v_count;
  end if;

  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
    and p.prorettype <> 'trigger'::regtype
    and not has_function_privilege('service_role', p.oid, 'EXECUTE');
  if v_count > 0 then
    raise exception 'client access: the service role cannot run % function(s) in public', v_count;
  end if;
end
$$;

rollback;
