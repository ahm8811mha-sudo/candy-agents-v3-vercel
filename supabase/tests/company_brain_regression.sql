begin;

create temporary table company_brain_test_results (
  test_name text primary key,
  passed boolean not null,
  detail text
) on commit drop;

do $$
declare
  v_definition_count integer;
  v_rls_enabled boolean;
  v_anon_select boolean;
  v_authenticated_select boolean;
  v_redacted jsonb;
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
end $$;

select * from company_brain_test_results order by test_name;

rollback;
