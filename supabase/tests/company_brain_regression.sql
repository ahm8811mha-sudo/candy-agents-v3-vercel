\set ON_ERROR_STOP on

begin;

create temporary table company_brain_test_results (
  test_name text primary key,
  passed boolean not null,
  detail text
) on commit drop;

create temporary table expected_company_brain_tables (table_name text primary key) on commit drop;
insert into expected_company_brain_tables (table_name) values
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

do $$
declare
  v_definition_count integer;
  v_rls_enabled boolean;
  v_anon_select boolean;
  v_authenticated_select boolean;
  v_redacted jsonb;
  v_present_count integer;
  v_rls_count integer;
  v_unsafe_grants integer;
  v_idempotency_index boolean;
begin
  select count(*) into v_definition_count
  from public.skill_definitions
  where status='ACTIVE'
    and slug in ('government-document-control','executive-decision-brief','company-simulation','autonomous-planner');

  insert into company_brain_test_results values (
    'builtin_skills_seeded',
    v_definition_count=4,
    format('active_builtin_skills=%s', v_definition_count)
  );

  v_redacted := public.orvanta_redact_company_json(
    jsonb_build_object(
      'safe_field','visible',
      'credential_value','private',
      'nested',jsonb_build_object('session_value','private','safe_nested','visible')
    )
  );

  insert into company_brain_test_results values (
    'knowledge_payload_redaction',
    v_redacted->>'credential_value'='[REDACTED]'
      and v_redacted#>>'{nested,session_value}'='[REDACTED]'
      and v_redacted#>>'{nested,safe_nested}'='visible',
    v_redacted::text
  );

  select c.relrowsecurity,
         has_table_privilege('anon', 'public.company_twin_states', 'SELECT'),
         has_table_privilege('authenticated', 'public.company_twin_states', 'SELECT')
    into v_rls_enabled, v_anon_select, v_authenticated_select
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname='company_twin_states';

  insert into company_brain_test_results values (
    'company_twin_private_access_boundary',
    coalesce(v_rls_enabled,false) and not coalesce(v_anon_select,false) and not coalesce(v_authenticated_select,false),
    format('rls=%s, anon_select=%s, authenticated_select=%s', v_rls_enabled, v_anon_select, v_authenticated_select)
  );

  select count(*), count(*) filter (where c.relrowsecurity)
    into v_present_count, v_rls_count
  from expected_company_brain_tables e
  join pg_class c on c.relname=e.table_name
  join pg_namespace n on n.oid=c.relnamespace and n.nspname='public';

  insert into company_brain_test_results values (
    'all_company_brain_tables_use_rls',
    v_present_count=16 and v_rls_count=16,
    format('present=%s, rls_enabled=%s', v_present_count, v_rls_count)
  );

  select count(*) into v_unsafe_grants
  from information_schema.role_table_grants g
  join expected_company_brain_tables e on e.table_name=g.table_name
  where g.table_schema='public'
    and g.grantee in ('anon','authenticated');

  insert into company_brain_test_results values (
    'company_brain_has_no_direct_user_grants',
    v_unsafe_grants=0,
    format('anon_or_authenticated_grants=%s', v_unsafe_grants)
  );

  select exists (
    select 1
    from pg_indexes
    where schemaname='public'
      and tablename='company_feature_values'
      and indexname='company_feature_values_idempotency_idx'
      and indexdef ilike '%UNIQUE INDEX%'
  ) into v_idempotency_index;

  insert into company_brain_test_results values (
    'feature_materialization_is_idempotent',
    v_idempotency_index,
    format('unique_index=%s', v_idempotency_index)
  );
end $$;

do $$
declare
  broken text;
begin
  select string_agg(test_name||' ('||coalesce(detail,'')||')', ', ' order by test_name)
    into broken
  from company_brain_test_results
  where not passed;

  if broken is not null then
    raise exception 'Company Brain regression failed: %', broken;
  end if;
end $$;

select * from company_brain_test_results order by test_name;

rollback;
