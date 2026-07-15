\set ON_ERROR_STOP on

-- Run against an isolated staging/restore project with a privileged migration
-- connection. The script is read-only and fails on the first broken invariant.

begin;

create temporary table expected_protected_tables (table_name text primary key);
insert into expected_protected_tables (table_name) values
  ('employees'),
  ('projects'),
  ('tasks'),
  ('company_events'),
  ('event_outbox'),
  ('workflow_instances'),
  ('workflow_steps'),
  ('accounting_journal_entries'),
  ('accounting_journal_lines'),
  ('accounting_periods'),
  ('ai_usage_log'),
  ('gov_documents'),
  ('gov_document_extractions'),
  ('failed_writes'),
  ('cron_runs'),
  ('system_alerts'),
  ('dead_letter_jobs'),
  ('integration_attempts'),
  ('external_receipts'),
  ('backup_verification_runs'),
  ('readiness_evidence'),
  ('company_knowledge_nodes'),
  ('company_knowledge_edges'),
  ('company_feature_values'),
  ('company_intelligence_snapshots'),
  ('decision_recommendations'),
  ('simulation_runs'),
  ('autonomous_plans'),
  ('company_learning_events'),
  ('executive_narratives'),
  ('company_twin_states'),
  ('company_prediction_runs'),
  ('company_fact_daily'),
  ('company_ingestion_runs'),
  ('skill_definitions'),
  ('skill_installations'),
  ('skill_runs');

-- Every present protected table must have RLS enabled and not forced off.
do $$
declare
  broken text;
begin
  select string_agg(e.table_name, ', ' order by e.table_name)
    into broken
  from expected_protected_tables e
  left join pg_class c on c.relname=e.table_name
  left join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
  where c.oid is null or n.oid is null;

  if broken is not null then
    raise exception 'Required protected tables are missing: %', broken;
  end if;

  select string_agg(e.table_name, ', ' order by e.table_name)
    into broken
  from expected_protected_tables e
  join pg_class c on c.relname=e.table_name
  join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
  where not c.relrowsecurity;

  if broken is not null then
    raise exception 'RLS is disabled on protected tables: %', broken;
  end if;
end;
$$;

-- Anonymous and authenticated roles may not own broad table grants for the
-- server-only reliability, evidence, and financial-control tables.
do $$
declare
  broken text;
begin
  select string_agg(table_name||':'||grantee||':'||privilege_type, ', ' order by table_name,grantee,privilege_type)
    into broken
  from information_schema.role_table_grants
  where table_schema='public'
    and table_name in (
      'failed_writes','cron_runs','system_alerts','dead_letter_jobs',
      'integration_attempts','external_receipts','backup_verification_runs',
      'accounting_periods','ai_usage_log','readiness_evidence',
      'company_knowledge_nodes','company_knowledge_edges','company_feature_values',
      'company_intelligence_snapshots','decision_recommendations','simulation_runs',
      'autonomous_plans','company_learning_events','executive_narratives',
      'company_twin_states','company_prediction_runs','company_fact_daily',
      'company_ingestion_runs','skill_definitions','skill_installations','skill_runs'
    )
    and grantee in ('anon','authenticated')
    and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER');

  if broken is not null then
    raise exception 'Unsafe direct grants found: %', broken;
  end if;
end;
$$;

-- Tables that contain tenant_id must either be server-only (no user grants) or
-- have at least one policy whose USING/WITH CHECK expression references tenant
-- context. This prevents accidental permissive policies before commercial mode.
do $$
declare
  broken text;
begin
  with tenant_tables as (
    select distinct c.table_name
    from information_schema.columns c
    join expected_protected_tables e on e.table_name=c.table_name
    where c.table_schema='public' and c.column_name='tenant_id'
  ), user_granted as (
    select distinct table_name
    from information_schema.role_table_grants
    where table_schema='public'
      and grantee in ('anon','authenticated')
      and privilege_type='SELECT'
  ), tenant_policy as (
    select distinct tablename
    from pg_policies
    where schemaname='public'
      and (
        coalesce(qual,'') ilike '%tenant%'
        or coalesce(with_check,'') ilike '%tenant%'
        or coalesce(qual,'') ilike '%app_metadata%'
        or coalesce(with_check,'') ilike '%app_metadata%'
      )
  )
  select string_agg(t.table_name, ', ' order by t.table_name)
    into broken
  from tenant_tables t
  join user_granted g on g.table_name=t.table_name
  left join tenant_policy p on p.tablename=t.table_name
  where p.tablename is null;

  if broken is not null then
    raise exception 'User-readable tenant tables lack tenant-bound policies: %', broken;
  end if;
end;
$$;

-- Security-definer functions must pin search_path.
do $$
declare
  broken text;
begin
  select string_agg(n.nspname||'.'||p.proname, ', ' order by n.nspname,p.proname)
    into broken
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and p.proname like 'orvanta_%'
    and not exists (
      select 1 from unnest(coalesce(p.proconfig,array[]::text[])) config
      where config like 'search_path=%'
    );

  if broken is not null then
    raise exception 'Security-definer functions without pinned search_path: %', broken;
  end if;
end;
$$;

rollback;
