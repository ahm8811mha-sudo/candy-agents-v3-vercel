-- One durable, idempotent transaction for every company execution bundle.
-- Both the free-form company runner and approved-idea runner call this RPC.

create extension if not exists pgcrypto;

insert into public.workflow_definitions (
  id,
  version,
  name,
  owner_engine,
  material_risk,
  definition,
  active
) values (
  'company-execution',
  1,
  'Company execution bundle',
  'executionRepository',
  'MEDIUM',
  jsonb_build_object(
    'transactional', true,
    'steps', jsonb_build_array(
      'VALIDATE_INPUT',
      'CLASSIFY_GOVERNANCE',
      'CREATE_PROJECT',
      'CREATE_WORK_ITEMS',
      'WAIT_FOR_APPROVAL',
      'FINALIZE'
    )
  ),
  true
)
on conflict (id, version) do update
set name = excluded.name,
    owner_engine = excluded.owner_engine,
    material_risk = excluded.material_risk,
    definition = excluded.definition,
    active = true;

insert into public.workflow_definitions (
  id, version, name, owner_engine, material_risk, definition, active
) values (
  'idea-to-investment',
  1,
  'Idea to investment',
  'workflowRuntime',
  'HIGH',
  jsonb_build_object(
    'transactionalStart', true,
    'steps', jsonb_build_array(
      'VALIDATE_INPUT', 'CLASSIFY_RISK', 'CREATE_DECISION_PACKET',
      'WAIT_FOR_APPROVAL', 'RESERVE_BUDGET', 'CREATE_PROJECT',
      'DISPATCH_ACTIONS', 'FINALIZE'
    )
  ),
  true
)
on conflict (id, version) do update
set name = excluded.name,
    owner_engine = excluded.owner_engine,
    material_risk = excluded.material_risk,
    definition = excluded.definition,
    active = true;

create or replace function public.orvanta_start_workflow_bundle(
  p_instance jsonb,
  p_steps jsonb,
  p_event jsonb,
  p_outbox jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id text := trim(coalesce(p_instance ->> 'tenant_id', ''));
  v_correlation_id text := trim(coalesce(p_instance ->> 'correlation_id', ''));
  v_instance_id uuid := (p_instance ->> 'id')::uuid;
  v_existing public.workflow_instances%rowtype;
  v_step jsonb;
begin
  if v_tenant_id = '' or v_correlation_id = '' then
    raise exception 'workflow tenant and correlation are required';
  end if;
  if coalesce(p_instance ->> 'workflow_id', '') <> 'idea-to-investment'
     or coalesce((p_instance ->> 'workflow_version')::integer, 0) <> 1 then
    raise exception 'unsupported workflow definition';
  end if;
  if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) <> 8 then
    raise exception 'idea-to-investment requires exactly eight workflow steps';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_tenant_id || ':' || v_correlation_id, 0));

  select * into v_existing
  from public.workflow_instances
  where tenant_id = v_tenant_id and correlation_id = v_correlation_id
  limit 1;
  if found then
    return jsonb_build_object('instance', to_jsonb(v_existing), 'reused', true);
  end if;

  insert into public.workflow_instances (
    id, tenant_id, workflow_id, workflow_version, entity_type, entity_id,
    correlation_id, status, current_step, input, output, started_at,
    completed_at, next_wake_at, created_at, updated_at
  ) values (
    v_instance_id,
    v_tenant_id,
    p_instance ->> 'workflow_id',
    (p_instance ->> 'workflow_version')::integer,
    p_instance ->> 'entity_type',
    p_instance ->> 'entity_id',
    v_correlation_id,
    coalesce(p_instance ->> 'status', 'PENDING'),
    p_instance ->> 'current_step',
    coalesce(p_instance -> 'input', '{}'::jsonb),
    coalesce(p_instance -> 'output', '{}'::jsonb),
    nullif(p_instance ->> 'started_at', '')::timestamptz,
    nullif(p_instance ->> 'completed_at', '')::timestamptz,
    nullif(p_instance ->> 'next_wake_at', '')::timestamptz,
    coalesce(nullif(p_instance ->> 'created_at', '')::timestamptz, now()),
    now()
  );

  for v_step in select value from jsonb_array_elements(p_steps)
  loop
    insert into public.workflow_steps (
      id, tenant_id, workflow_instance_id, step_key, step_order, status,
      attempt, idempotency_key, input, output, error, started_at,
      completed_at, available_at, created_at, updated_at
    ) values (
      coalesce(nullif(v_step ->> 'id', '')::uuid, gen_random_uuid()),
      v_tenant_id,
      v_instance_id,
      v_step ->> 'step_key',
      (v_step ->> 'step_order')::integer,
      coalesce(v_step ->> 'status', 'PENDING'),
      coalesce((v_step ->> 'attempt')::integer, 0),
      v_step ->> 'idempotency_key',
      coalesce(v_step -> 'input', '{}'::jsonb),
      v_step -> 'output',
      v_step -> 'error',
      nullif(v_step ->> 'started_at', '')::timestamptz,
      nullif(v_step ->> 'completed_at', '')::timestamptz,
      coalesce(nullif(v_step ->> 'available_at', '')::timestamptz, now()),
      now(),
      now()
    );
  end loop;

  insert into public.company_events (
    id, tenant_id, event_type, event_version, actor_id, actor_type,
    entity_type, entity_id, correlation_id, causation_id, payload, occurred_at
  ) values (
    p_event ->> 'id',
    v_tenant_id,
    p_event ->> 'event_type',
    coalesce((p_event ->> 'event_version')::integer, 1),
    p_event ->> 'actor_id',
    p_event ->> 'actor_type',
    p_event ->> 'entity_type',
    p_event ->> 'entity_id',
    v_correlation_id,
    nullif(p_event ->> 'causation_id', ''),
    coalesce(p_event -> 'payload', '{}'::jsonb),
    (p_event ->> 'occurred_at')::timestamptz
  );

  insert into public.event_outbox (
    id, tenant_id, event_type, aggregate_type, aggregate_id, correlation_id,
    causation_id, payload, status, attempts, available_at, created_at, updated_at
  ) values (
    p_outbox ->> 'id',
    v_tenant_id,
    p_outbox ->> 'event_type',
    p_outbox ->> 'aggregate_type',
    p_outbox ->> 'aggregate_id',
    v_correlation_id,
    nullif(p_outbox ->> 'causation_id', ''),
    coalesce(p_outbox -> 'payload', '{}'::jsonb),
    'PENDING',
    0,
    (p_outbox ->> 'available_at')::timestamptz,
    (p_outbox ->> 'created_at')::timestamptz,
    now()
  );

  return jsonb_build_object('instance', p_instance, 'reused', false);
end;
$$;

revoke all on function public.orvanta_start_workflow_bundle(jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.orvanta_start_workflow_bundle(jsonb,jsonb,jsonb,jsonb) to service_role;

create or replace function public.orvanta_create_execution_bundle(p_bundle jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id text := trim(coalesce(p_bundle ->> 'tenantId', ''));
  v_correlation_id text := trim(coalesce(p_bundle ->> 'correlationId', ''));
  v_actor_id text := trim(coalesce(p_bundle ->> 'actorId', 'system'));
  v_source text := trim(coalesce(p_bundle ->> 'source', 'company-execution'));
  v_workflow_id uuid := (p_bundle ->> 'workflowInstanceId')::uuid;
  v_project_id uuid := (p_bundle #>> '{project,id}')::uuid;
  v_project jsonb := coalesce(p_bundle -> 'project', '{}'::jsonb);
  v_approval jsonb := p_bundle -> 'approval';
  v_audit jsonb := p_bundle -> 'audit';
  v_memory jsonb := p_bundle -> 'memory';
  v_financial_decision jsonb := p_bundle -> 'financialDecision';
  v_item jsonb;
  v_requires_approval boolean := jsonb_typeof(v_approval) = 'object';
  v_existing_workflow public.workflow_instances%rowtype;
  v_project_row public.projects%rowtype;
  v_approval_row public.company_approvals%rowtype;
  v_audit_row public.audit_log%rowtype;
  v_now timestamptz := now();
  v_tasks jsonb;
  v_kpis jsonb;
begin
  if v_tenant_id = '' or length(v_tenant_id) > 64 then
    raise exception 'valid tenantId is required';
  end if;
  if v_correlation_id = '' or length(v_correlation_id) > 160 then
    raise exception 'valid correlationId is required';
  end if;
  if trim(coalesce(v_project ->> 'name', '')) = '' then
    raise exception 'project name is required';
  end if;
  if coalesce((v_project ->> 'budget')::numeric, 0) < 0
     or coalesce((v_project ->> 'approvedBudget')::numeric, 0) < 0 then
    raise exception 'project budgets cannot be negative';
  end if;
  if coalesce((v_project ->> 'healthScore')::integer, 0) not between 0 and 100 then
    raise exception 'project health score must be between 0 and 100';
  end if;
  if coalesce(v_project ->> 'riskLevel', 'LOW') not in ('LOW', 'MEDIUM', 'HIGH') then
    raise exception 'invalid project risk level';
  end if;
  if jsonb_typeof(coalesce(p_bundle -> 'tasks', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_bundle -> 'kpis', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_bundle -> 'actions', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_bundle -> 'alerts', '[]'::jsonb)) <> 'array' then
    raise exception 'execution work items must be arrays';
  end if;
  if jsonb_array_length(coalesce(p_bundle -> 'tasks', '[]'::jsonb)) > 100
     or jsonb_array_length(coalesce(p_bundle -> 'kpis', '[]'::jsonb)) > 100
     or jsonb_array_length(coalesce(p_bundle -> 'actions', '[]'::jsonb)) > 100
     or jsonb_array_length(coalesce(p_bundle -> 'alerts', '[]'::jsonb)) > 100 then
    raise exception 'execution bundle exceeds the 100-item limit';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_tenant_id || ':' || v_correlation_id, 0));

  select * into v_existing_workflow
  from public.workflow_instances
  where tenant_id = v_tenant_id
    and correlation_id = v_correlation_id
  limit 1;

  if found then
    select * into v_project_row
    from public.projects
    where tenant_id = v_tenant_id
      and workflow_instance_id = v_existing_workflow.id
    limit 1;

    if v_project_row.id is null then
      raise exception 'idempotent execution record exists without its project';
    end if;

    select * into v_approval_row
    from public.company_approvals
    where tenant_id = v_tenant_id
      and metadata ->> 'workflowInstanceId' = v_existing_workflow.id::text
    order by created_at asc
    limit 1;

    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at asc), '[]'::jsonb)
      into v_tasks
    from public.tasks t
    where t.tenant_id = v_tenant_id and t.project_id = v_project_row.id;

    select coalesce(jsonb_agg(to_jsonb(k) order by k.created_at asc), '[]'::jsonb)
      into v_kpis
    from public.business_kpis k
    where k.tenant_id = v_tenant_id and k.project_id = v_project_row.id;

    return jsonb_build_object(
      'idempotent', true,
      'correlationId', v_existing_workflow.correlation_id,
      'workflowInstanceId', v_existing_workflow.id,
      'project', to_jsonb(v_project_row),
      'tasks', v_tasks,
      'kpis', v_kpis,
      'approval', case when v_approval_row.id is null then null else to_jsonb(v_approval_row) end,
      'audit', null
    );
  end if;

  insert into public.workflow_instances (
    id, tenant_id, workflow_id, workflow_version, entity_type, entity_id,
    correlation_id, status, current_step, input, output, started_at,
    completed_at, next_wake_at, created_at, updated_at
  ) values (
    v_workflow_id,
    v_tenant_id,
    'company-execution',
    1,
    'execution_request',
    v_project_id::text,
    v_correlation_id,
    case when v_requires_approval then 'WAITING_APPROVAL' else 'COMPLETED' end,
    case when v_requires_approval then 'WAIT_FOR_APPROVAL' else null end,
    jsonb_build_object(
      'source', v_source,
      'request', v_project ->> 'request',
      'projectName', v_project ->> 'name'
    ),
    jsonb_build_object(
      'actorId', v_actor_id,
      'projectId', v_project_id,
      'approvalId', case when v_requires_approval then v_approval ->> 'id' else null end
    ),
    v_now,
    case when v_requires_approval then null else v_now end,
    null,
    v_now,
    v_now
  );

  insert into public.workflow_steps (
    tenant_id, workflow_instance_id, step_key, step_order, status, attempt,
    idempotency_key, input, output, started_at, completed_at, available_at,
    created_at, updated_at
  )
  select
    v_tenant_id,
    v_workflow_id,
    step_key,
    step_order,
    case
      when step_key = 'WAIT_FOR_APPROVAL' and v_requires_approval then 'WAITING_APPROVAL'
      when step_key = 'FINALIZE' and v_requires_approval then 'PENDING'
      else 'COMPLETED'
    end,
    case when step_key = 'FINALIZE' and v_requires_approval then 0 else 1 end,
    v_tenant_id || ':' || v_correlation_id || ':' || step_key || ':v1',
    '{}'::jsonb,
    case
      when step_key = 'WAIT_FOR_APPROVAL' then jsonb_build_object(
        'approvalRequired', v_requires_approval,
        'approvalId', case when v_requires_approval then v_approval ->> 'id' else null end
      )
      else '{}'::jsonb
    end,
    case when step_key = 'FINALIZE' and v_requires_approval then null else v_now end,
    case when step_key = 'FINALIZE' and v_requires_approval then null else v_now end,
    v_now,
    v_now,
    v_now
  from (values
    ('VALIDATE_INPUT', 1),
    ('CLASSIFY_GOVERNANCE', 2),
    ('CREATE_PROJECT', 3),
    ('CREATE_WORK_ITEMS', 4),
    ('WAIT_FOR_APPROVAL', 5),
    ('FINALIZE', 6)
  ) as steps(step_key, step_order);

  insert into public.projects (
    id, tenant_id, workflow_instance_id, name, request, status, budget,
    approved_budget, health_score, risk_level, approval_status,
    strategic_direction, financial_snapshot, next_review_at
  ) values (
    v_project_id,
    v_tenant_id,
    v_workflow_id,
    left(v_project ->> 'name', 120),
    v_project ->> 'request',
    coalesce(v_project ->> 'status', 'ACTIVE'),
    coalesce((v_project ->> 'budget')::numeric, 0),
    coalesce((v_project ->> 'approvedBudget')::numeric, 0),
    coalesce((v_project ->> 'healthScore')::integer, 0),
    coalesce(v_project ->> 'riskLevel', 'LOW'),
    coalesce(v_project ->> 'approvalStatus', 'APPROVED'),
    v_project ->> 'strategicDirection',
    coalesce(v_project -> 'financialSnapshot', '{}'::jsonb),
    nullif(v_project ->> 'nextReviewAt', '')::timestamptz
  ) returning * into v_project_row;

  for v_item in select value from jsonb_array_elements(coalesce(p_bundle -> 'tasks', '[]'::jsonb))
  loop
    insert into public.tasks (
      id, tenant_id, project_id, title, description, content, status, priority,
      progress_percent, owner_role, kpi_name, kpi_target, due_date, metadata
    ) values (
      v_item ->> 'id',
      v_tenant_id,
      v_project_id,
      v_item ->> 'title',
      v_item ->> 'description',
      v_item ->> 'content',
      coalesce(v_item ->> 'status', 'TODO'),
      coalesce(v_item ->> 'priority', 'MEDIUM'),
      coalesce((v_item ->> 'progressPercent')::integer, 0),
      v_item ->> 'ownerRole',
      v_item ->> 'kpiName',
      nullif(v_item ->> 'kpiTarget', '')::numeric,
      nullif(v_item ->> 'dueDate', '')::timestamptz,
      coalesce(v_item -> 'metadata', '{}'::jsonb)
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_bundle -> 'kpis', '[]'::jsonb))
  loop
    insert into public.business_kpis (
      id, tenant_id, project_id, name, target, current, unit, status, due_date
    ) values (
      (v_item ->> 'id')::uuid,
      v_tenant_id,
      v_project_id,
      v_item ->> 'name',
      coalesce((v_item ->> 'target')::numeric, 0),
      coalesce((v_item ->> 'current')::numeric, 0),
      coalesce(v_item ->> 'unit', ''),
      coalesce(v_item ->> 'status', 'WATCH'),
      nullif(v_item ->> 'dueDate', '')::timestamptz
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_bundle -> 'actions', '[]'::jsonb))
  loop
    insert into public.business_actions (
      id, tenant_id, project_id, workflow_instance_id, action_type, title,
      description, status, execution_mode, provider, requires_approval,
      approval_status, payload, attempts
    ) values (
      (v_item ->> 'id')::uuid,
      v_tenant_id,
      v_project_id,
      v_workflow_id,
      v_item ->> 'actionType',
      v_item ->> 'title',
      v_item ->> 'description',
      coalesce(v_item ->> 'status', 'QUEUED'),
      coalesce(v_item ->> 'executionMode', 'INTERNAL'),
      coalesce(v_item ->> 'provider', 'internal'),
      coalesce((v_item ->> 'requiresApproval')::boolean, false),
      coalesce(v_item ->> 'approvalStatus', 'NOT_REQUIRED'),
      coalesce(v_item -> 'payload', '{}'::jsonb),
      0
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_bundle -> 'alerts', '[]'::jsonb))
  loop
    insert into public.business_alerts (
      id, tenant_id, severity, title, message, source, metadata
    ) values (
      (v_item ->> 'id')::uuid,
      v_tenant_id,
      coalesce(v_item ->> 'severity', 'MEDIUM'),
      v_item ->> 'title',
      v_item ->> 'message',
      coalesce(v_item ->> 'source', 'businessBrain'),
      coalesce(v_item -> 'metadata', '{}'::jsonb) || jsonb_build_object('projectId', v_project_id)
    );
  end loop;

  if jsonb_typeof(v_memory) = 'object' then
    insert into public.business_memory (
      id, tenant_id, event_type, title, summary, decision_quality, metadata
    ) values (
      (v_memory ->> 'id')::uuid,
      v_tenant_id,
      v_memory ->> 'eventType',
      v_memory ->> 'title',
      v_memory ->> 'summary',
      coalesce(v_memory ->> 'decisionQuality', 'WATCH'),
      coalesce(v_memory -> 'metadata', '{}'::jsonb) || jsonb_build_object(
        'projectId', v_project_id,
        'workflowInstanceId', v_workflow_id,
        'correlationId', v_correlation_id
      )
    );
  end if;

  if jsonb_typeof(v_financial_decision) = 'object' then
    insert into public.financial_decisions (
      id, tenant_id, request, financials, cfo_report, ceo_decision
    ) values (
      (v_financial_decision ->> 'id')::uuid,
      v_tenant_id,
      v_financial_decision ->> 'request',
      coalesce(v_financial_decision -> 'financials', '{}'::jsonb),
      v_financial_decision ->> 'cfoReport',
      v_financial_decision ->> 'ceoDecision'
    );
  end if;

  if v_requires_approval then
    insert into public.company_approvals (
      id, tenant_id, type, title, detail, amount, requested_role, status,
      created_at, metadata, dedupe_key
    ) values (
      v_approval ->> 'id',
      v_tenant_id,
      coalesce(v_approval ->> 'type', 'GENERAL'),
      v_approval ->> 'title',
      v_approval ->> 'detail',
      nullif(v_approval ->> 'amount', '')::numeric,
      coalesce(v_approval ->> 'requestedRole', 'CEO'),
      'PENDING',
      v_now,
      coalesce(v_approval -> 'metadata', '{}'::jsonb) || jsonb_build_object(
        'entityType', 'projects',
        'entityId', v_project_id,
        'workflowInstanceId', v_workflow_id,
        'correlationId', v_correlation_id
      ),
      v_approval ->> 'dedupeKey'
    ) returning * into v_approval_row;
  end if;

  if jsonb_typeof(v_audit) = 'object' then
    insert into public.audit_log (
      id, tenant_id, actor, role, action, entity_type, entity_id, detail,
      tier, metadata, created_at
    ) values (
      v_audit ->> 'id',
      v_tenant_id,
      coalesce(v_audit ->> 'actor', v_actor_id),
      nullif(v_audit ->> 'role', ''),
      v_audit ->> 'action',
      'project',
      v_project_id::text,
      v_audit ->> 'detail',
      nullif(v_audit ->> 'tier', ''),
      coalesce(v_audit -> 'metadata', '{}'::jsonb) || jsonb_build_object(
        'workflowInstanceId', v_workflow_id,
        'correlationId', v_correlation_id,
        'source', v_source
      ),
      v_now
    ) returning * into v_audit_row;
  end if;

  insert into public.company_events (
    id, tenant_id, event_type, event_version, actor_id, actor_type,
    entity_type, entity_id, correlation_id, payload, occurred_at
  ) values (
    p_bundle ->> 'eventId',
    v_tenant_id,
    'company.execution.created',
    1,
    v_actor_id,
    'SYSTEM',
    'project',
    v_project_id::text,
    v_correlation_id,
    jsonb_build_object(
      'source', v_source,
      'projectId', v_project_id,
      'workflowInstanceId', v_workflow_id,
      'approvalRequired', v_requires_approval,
      'taskCount', jsonb_array_length(coalesce(p_bundle -> 'tasks', '[]'::jsonb)),
      'kpiCount', jsonb_array_length(coalesce(p_bundle -> 'kpis', '[]'::jsonb)),
      'actionCount', jsonb_array_length(coalesce(p_bundle -> 'actions', '[]'::jsonb))
    ),
    v_now
  );

  insert into public.event_outbox (
    id, tenant_id, event_type, aggregate_type, aggregate_id, correlation_id,
    payload, status, attempts, available_at, created_at, updated_at
  ) values (
    p_bundle ->> 'outboxId',
    v_tenant_id,
    'company.execution.created',
    'project',
    v_project_id::text,
    v_correlation_id,
    jsonb_build_object(
      'source', v_source,
      'projectId', v_project_id,
      'workflowInstanceId', v_workflow_id,
      'approvalRequired', v_requires_approval
    ),
    'PENDING',
    0,
    v_now,
    v_now,
    v_now
  );

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at asc), '[]'::jsonb)
    into v_tasks
  from public.tasks t
  where t.tenant_id = v_tenant_id and t.project_id = v_project_id;

  select coalesce(jsonb_agg(to_jsonb(k) order by k.created_at asc), '[]'::jsonb)
    into v_kpis
  from public.business_kpis k
  where k.tenant_id = v_tenant_id and k.project_id = v_project_id;

  return jsonb_build_object(
    'idempotent', false,
    'correlationId', v_correlation_id,
    'workflowInstanceId', v_workflow_id,
    'project', to_jsonb(v_project_row),
    'tasks', v_tasks,
    'kpis', v_kpis,
    'approval', case when v_approval_row.id is null then null else to_jsonb(v_approval_row) end,
    'audit', case when v_audit_row.id is null then null else to_jsonb(v_audit_row) end,
    'outboxId', p_bundle ->> 'outboxId'
  );
end;
$$;

revoke all on function public.orvanta_create_execution_bundle(jsonb) from public, anon, authenticated;
grant execute on function public.orvanta_create_execution_bundle(jsonb) to service_role;

comment on function public.orvanta_create_execution_bundle(jsonb) is
  'Atomically persists one idempotent company execution workflow, project, work items, approval, audit event, and outbox record.';

create or replace function public.orvanta_decide_execution_bundle(
  p_approval_id text,
  p_decision text,
  p_decided_by text,
  p_note text,
  p_audit jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_approval public.company_approvals%rowtype;
  v_project public.projects%rowtype;
  v_workflow public.workflow_instances%rowtype;
  v_audit public.audit_log%rowtype;
  v_tenant_id text;
  v_entity_id uuid;
  v_workflow_id uuid;
  v_correlation_id text;
  v_audit_id text;
  v_now timestamptz := now();
begin
  if p_decision not in ('APPROVED', 'REJECTED') then
    raise exception 'decision must be APPROVED or REJECTED';
  end if;
  if trim(coalesce(p_approval_id, '')) = '' or trim(coalesce(p_decided_by, '')) = '' then
    raise exception 'approval id and decision actor are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('execution-approval:' || p_approval_id, 0));

  select * into v_approval
  from public.company_approvals
  where id = p_approval_id
  for update;

  if not found then
    raise exception 'execution approval not found';
  end if;
  if coalesce(v_approval.metadata ->> 'source', '') <> 'governanceOS'
     or coalesce(v_approval.metadata ->> 'actionKind', '') <> 'COMPANY_EXECUTION_PROJECT' then
    raise exception 'approval is not a company execution decision';
  end if;

  v_tenant_id := v_approval.tenant_id;
  v_entity_id := nullif(v_approval.metadata ->> 'entityId', '')::uuid;
  v_workflow_id := nullif(v_approval.metadata ->> 'workflowInstanceId', '')::uuid;
  v_correlation_id := coalesce(
    nullif(v_approval.metadata ->> 'correlationId', ''),
    'execution-approval:' || p_approval_id
  );
  v_audit_id := coalesce(
    nullif(p_audit ->> 'id', ''),
    'aud-approval-' || p_approval_id || '-' || lower(p_decision)
  );

  if v_entity_id is null or v_workflow_id is null then
    raise exception 'execution approval is missing its project or workflow reference';
  end if;

  if v_approval.status <> 'PENDING' then
    if v_approval.status <> p_decision then
      raise exception 'approval was already decided as %', v_approval.status;
    end if;
    select * into v_project
    from public.projects
    where id = v_entity_id and tenant_id = v_tenant_id;
    select * into v_workflow
    from public.workflow_instances
    where id = v_workflow_id and tenant_id = v_tenant_id;
    select * into v_audit from public.audit_log where id = v_audit_id;
    return jsonb_build_object(
      'idempotent', true,
      'approval', to_jsonb(v_approval),
      'project', to_jsonb(v_project),
      'workflow', to_jsonb(v_workflow),
      'audit', case when v_audit.id is null then null else to_jsonb(v_audit) end
    );
  end if;

  select * into v_project
  from public.projects
  where id = v_entity_id
    and tenant_id = v_tenant_id
    and workflow_instance_id = v_workflow_id
  for update;
  if not found then
    raise exception 'execution project does not match the approval workflow';
  end if;

  select * into v_workflow
  from public.workflow_instances
  where id = v_workflow_id
    and tenant_id = v_tenant_id
    and workflow_id = 'company-execution'
  for update;
  if not found then
    raise exception 'company execution workflow not found';
  end if;

  update public.company_approvals
  set status = p_decision,
      decided_at = v_now,
      decided_by = left(p_decided_by, 160),
      note = nullif(p_note, '')
  where id = p_approval_id
  returning * into v_approval;

  update public.projects
  set status = case when p_decision = 'APPROVED' then 'ACTIVE' else 'REJECTED' end,
      approval_status = p_decision,
      approved_budget = case
        when p_decision = 'APPROVED' then greatest(
          0,
          coalesce(nullif(v_approval.metadata ->> 'requestedBudget', '')::numeric, budget, 0)
        )
        else 0
      end,
      updated_at = v_now
  where id = v_entity_id and tenant_id = v_tenant_id
  returning * into v_project;

  update public.tasks
  set status = case when p_decision = 'APPROVED' then 'TODO' else 'BLOCKED' end,
      updated_at = v_now
  where project_id = v_entity_id and tenant_id = v_tenant_id;

  update public.business_actions
  set status = case when p_decision = 'APPROVED' then 'QUEUED' else 'CANCELLED' end,
      approval_status = p_decision,
      updated_at = v_now
  where project_id = v_entity_id
    and tenant_id = v_tenant_id
    and requires_approval = true;

  update public.workflow_steps
  set status = 'COMPLETED',
      attempt = greatest(attempt, 1),
      output = coalesce(output, '{}'::jsonb) || jsonb_build_object(
        'approvalId', p_approval_id,
        'decision', p_decision,
        'decidedBy', p_decided_by
      ),
      started_at = coalesce(started_at, v_now),
      completed_at = v_now,
      updated_at = v_now
  where tenant_id = v_tenant_id
    and workflow_instance_id = v_workflow_id
    and step_key in ('WAIT_FOR_APPROVAL', 'FINALIZE');

  update public.workflow_instances
  set status = 'COMPLETED',
      current_step = null,
      output = coalesce(output, '{}'::jsonb) || jsonb_build_object(
        'approvalId', p_approval_id,
        'decision', p_decision,
        'decidedBy', p_decided_by,
        'projectId', v_entity_id
      ),
      completed_at = v_now,
      next_wake_at = null,
      updated_at = v_now
  where id = v_workflow_id and tenant_id = v_tenant_id
  returning * into v_workflow;

  insert into public.audit_log (
    id, tenant_id, actor, role, action, entity_type, entity_id, detail,
    tier, metadata, created_at
  ) values (
    v_audit_id,
    v_tenant_id,
    left(p_decided_by, 160),
    nullif(p_audit ->> 'role', ''),
    case when p_decision = 'APPROVED' then 'APPROVE' else 'REJECT' end,
    'project',
    v_entity_id::text,
    coalesce(nullif(p_audit ->> 'detail', ''), p_decision || ': ' || v_approval.title),
    nullif(p_audit ->> 'tier', ''),
    coalesce(p_audit -> 'metadata', '{}'::jsonb) || jsonb_build_object(
      'approvalId', p_approval_id,
      'decision', p_decision,
      'workflowInstanceId', v_workflow_id,
      'correlationId', v_correlation_id,
      'atomic', true
    ),
    v_now
  )
  on conflict (id) do nothing;
  select * into v_audit from public.audit_log where id = v_audit_id;

  insert into public.company_events (
    id, tenant_id, event_type, event_version, actor_id, actor_type,
    entity_type, entity_id, correlation_id, causation_id, payload, occurred_at
  ) values (
    'evt-approval-' || p_approval_id || '-' || lower(p_decision),
    v_tenant_id,
    'company.execution.approval_decided',
    1,
    left(p_decided_by, 160),
    'USER',
    'project',
    v_entity_id::text,
    v_correlation_id,
    p_approval_id,
    jsonb_build_object(
      'approvalId', p_approval_id,
      'decision', p_decision,
      'workflowInstanceId', v_workflow_id
    ),
    v_now
  )
  on conflict (id) do nothing;

  insert into public.event_outbox (
    id, tenant_id, event_type, aggregate_type, aggregate_id, correlation_id,
    causation_id, payload, status, attempts, available_at, created_at, updated_at
  ) values (
    'out-approval-' || p_approval_id || '-' || lower(p_decision),
    v_tenant_id,
    'company.execution.approval_decided',
    'project',
    v_entity_id::text,
    v_correlation_id,
    p_approval_id,
    jsonb_build_object(
      'approvalId', p_approval_id,
      'decision', p_decision,
      'workflowInstanceId', v_workflow_id
    ),
    'PENDING',
    0,
    v_now,
    v_now,
    v_now
  )
  on conflict (id) do nothing;

  return jsonb_build_object(
    'idempotent', false,
    'approval', to_jsonb(v_approval),
    'project', to_jsonb(v_project),
    'workflow', to_jsonb(v_workflow),
    'audit', to_jsonb(v_audit)
  );
end;
$$;

revoke all on function public.orvanta_decide_execution_bundle(text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.orvanta_decide_execution_bundle(text,text,text,text,jsonb) to service_role;

comment on function public.orvanta_decide_execution_bundle(text,text,text,text,jsonb) is
  'Atomically decides a company execution approval and transitions the project, work items, workflow, audit log, event, and outbox.';

notify pgrst, 'reload schema';
