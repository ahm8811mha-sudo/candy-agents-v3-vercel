begin;

create temporary table company_brain_test_results (
  test_name text primary key,
  passed boolean not null,
  detail text
) on commit drop;

do $$
declare
  v_definition_count integer;
  v_anon_visible integer;
  v_redacted jsonb;
  v_twin_id uuid := gen_random_uuid();
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

  insert into public.company_twin_states (
    id,tenant_id,scope_type,scope_id,health_score,maturity_score,capacity,constraints,state,observed_at
  ) values (
    v_twin_id,'qa-company-brain','COMPANY','root',75,60,'{}','[]','{}',now()
  );

  set local role anon;
  select count(*) into v_anon_visible
  from public.company_twin_states
  where tenant_id='qa-company-brain';
  reset role;

  insert into company_brain_test_results values (
    'company_twin_hidden_from_anon',
    v_anon_visible=0,
    format('anon_visible_rows=%s', v_anon_visible)
  );
end $$;

select * from company_brain_test_results order by test_name;

rollback;
