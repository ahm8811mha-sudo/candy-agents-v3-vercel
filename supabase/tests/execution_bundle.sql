-- Rollback-only proof that execution cannot leave partial state and retries do
-- not duplicate projects, tasks, approvals, audit, events, or outbox records.

begin;

do $$
declare
  v_bundle jsonb := jsonb_build_object(
    'tenantId', 'orvanta-execution-test',
    'correlationId', 'company-execution:test-atomic-idempotency',
    'workflowInstanceId', '00000000-0000-4000-8000-000000000201',
    'actorId', 'database-regression',
    'source', 'company-execution',
    'project', jsonb_build_object(
      'id', '00000000-0000-4000-8000-000000000202',
      'name', 'Rollback execution proof',
      'request', 'Prove atomic execution',
      'status', 'PENDING_APPROVAL',
      'budget', 5000,
      'approvedBudget', 0,
      'healthScore', 90,
      'riskLevel', 'MEDIUM',
      'approvalStatus', 'PENDING',
      'strategicDirection', 'Run safely',
      'financialSnapshot', jsonb_build_object('test', true),
      'nextReviewAt', (now() + interval '14 days')::text
    ),
    'tasks', jsonb_build_array(jsonb_build_object(
      'id', 'execution-task-database-regression',
      'title', 'Atomic task',
      'description', 'Must roll back with the project',
      'content', 'Must roll back with the project',
      'status', 'BLOCKED',
      'priority', 'HIGH',
      'progressPercent', 0
    )),
    'kpis', jsonb_build_array(jsonb_build_object(
      'id', '00000000-0000-4000-8000-000000000203',
      'name', 'Atomic KPI',
      'target', 1,
      'current', 0,
      'unit', 'count',
      'status', 'WATCH'
    )),
    'actions', jsonb_build_array(jsonb_build_object(
      'id', '00000000-0000-4000-8000-000000000204',
      'actionType', 'INTERNAL',
      'title', 'Atomic action',
      'status', 'WAITING_APPROVAL',
      'executionMode', 'INTERNAL',
      'provider', 'internal',
      'requiresApproval', true,
      'approvalStatus', 'PENDING',
      'payload', jsonb_build_object('test', true)
    )),
    'alerts', jsonb_build_array(jsonb_build_object(
      'id', '00000000-0000-4000-8000-000000000205',
      'severity', 'MEDIUM',
      'title', 'Atomic alert',
      'message', 'Rollback proof',
      'source', 'database-regression'
    )),
    'memory', jsonb_build_object(
      'id', '00000000-0000-4000-8000-000000000206',
      'eventType', 'COMPANY_EXECUTION',
      'title', 'Atomic memory',
      'summary', 'Rollback proof',
      'decisionQuality', 'WATCH'
    ),
    'approval', jsonb_build_object(
      'id', 'apr-execution-database-regression',
      'type', 'GENERAL',
      'title', 'Approve rollback proof',
      'detail', 'Database regression',
      'amount', 5000,
      'requestedRole', 'CEO',
      'dedupeKey', 'company-execution:database-regression',
      'metadata', jsonb_build_object(
        'source', 'governanceOS',
        'actionKind', 'COMPANY_EXECUTION_PROJECT',
        'governanceTier', 'T2',
        'requestedBudget', 5000
      )
    ),
    'audit', jsonb_build_object(
      'id', 'aud-execution-database-regression',
      'actor', 'database-regression',
      'role', 'ADMIN',
      'action', 'EXECUTION_BUNDLE_CREATED',
      'detail', 'Rollback proof',
      'tier', 'T2'
    ),
    'eventId', 'evt-execution-database-regression',
    'outboxId', 'out-execution-database-regression'
  );
  v_first jsonb;
  v_second jsonb;
begin
  v_first := public.orvanta_create_execution_bundle(v_bundle);
  if coalesce((v_first ->> 'idempotent')::boolean, true) then
    raise exception 'first execution was incorrectly reported as idempotent';
  end if;

  if (select count(*) from public.projects where tenant_id = 'orvanta-execution-test') <> 1
     or (select count(*) from public.tasks where tenant_id = 'orvanta-execution-test') <> 1
     or (select count(*) from public.business_kpis where tenant_id = 'orvanta-execution-test') <> 1
     or (select count(*) from public.business_actions where tenant_id = 'orvanta-execution-test') <> 1
     or (select count(*) from public.company_approvals where tenant_id = 'orvanta-execution-test') <> 1
     or (select count(*) from public.audit_log where tenant_id = 'orvanta-execution-test') <> 1
     or (select count(*) from public.workflow_instances where tenant_id = 'orvanta-execution-test') <> 1
     or (select count(*) from public.workflow_steps where tenant_id = 'orvanta-execution-test') <> 6
     or (select count(*) from public.company_events where tenant_id = 'orvanta-execution-test') <> 1
     or (select count(*) from public.event_outbox where tenant_id = 'orvanta-execution-test') <> 1 then
    raise exception 'execution bundle did not create every durable artifact';
  end if;

  v_second := public.orvanta_create_execution_bundle(v_bundle);
  if not coalesce((v_second ->> 'idempotent')::boolean, false) then
    raise exception 'retry was not reported as idempotent';
  end if;
  if (select count(*) from public.projects where tenant_id = 'orvanta-execution-test') <> 1
     or (select count(*) from public.tasks where tenant_id = 'orvanta-execution-test') <> 1
     or (select count(*) from public.event_outbox where tenant_id = 'orvanta-execution-test') <> 1 then
    raise exception 'idempotent retry created duplicate execution artifacts';
  end if;

  v_first := public.orvanta_decide_execution_bundle(
    'apr-execution-database-regression',
    'APPROVED',
    'database-regression',
    'Atomic approval proof',
    jsonb_build_object(
      'id', 'aud-approval-apr-execution-database-regression-approved',
      'role', 'OWNER',
      'tier', 'T2',
      'detail', 'Atomic approval proof'
    )
  );
  if coalesce((v_first ->> 'idempotent')::boolean, true) then
    raise exception 'first execution approval was incorrectly reported as idempotent';
  end if;
  if (select status from public.company_approvals where id = 'apr-execution-database-regression') <> 'APPROVED'
     or (select status from public.projects where id = '00000000-0000-4000-8000-000000000202') <> 'ACTIVE'
     or (select approved_budget from public.projects where id = '00000000-0000-4000-8000-000000000202') <> 5000
     or (select status from public.tasks where id = 'execution-task-database-regression') <> 'TODO'
     or (select status from public.business_actions where id = '00000000-0000-4000-8000-000000000204') <> 'QUEUED'
     or (select status from public.workflow_instances where id = '00000000-0000-4000-8000-000000000201') <> 'COMPLETED'
     or (select count(*) from public.workflow_steps where workflow_instance_id = '00000000-0000-4000-8000-000000000201' and status <> 'COMPLETED') <> 0
     or (select count(*) from public.audit_log where id = 'aud-approval-apr-execution-database-regression-approved') <> 1
     or (select count(*) from public.event_outbox where tenant_id = 'orvanta-execution-test') <> 2 then
    raise exception 'execution approval did not atomically transition every durable artifact';
  end if;

  v_second := public.orvanta_decide_execution_bundle(
    'apr-execution-database-regression',
    'APPROVED',
    'database-regression',
    'Atomic approval proof',
    jsonb_build_object('id', 'aud-approval-apr-execution-database-regression-approved')
  );
  if not coalesce((v_second ->> 'idempotent')::boolean, false)
     or (select count(*) from public.audit_log where id = 'aud-approval-apr-execution-database-regression-approved') <> 1
     or (select count(*) from public.event_outbox where tenant_id = 'orvanta-execution-test') <> 2 then
    raise exception 'execution approval retry was not idempotent';
  end if;
end;
$$;

rollback;
