\set ON_ERROR_STOP on

-- Rollback-only proof for durable project identities and the owner continuity
-- charter. Run after all Supabase migrations against staging.
begin;

do $$
declare
  v_tenant text := 'orvanta-continuity-regression';
  v_project_one uuid := gen_random_uuid();
  v_project_two uuid := gen_random_uuid();
  v_project_three uuid := gen_random_uuid();
  v_action uuid := gen_random_uuid();
  v_project_number_one bigint;
  v_project_number_two bigint;
  v_task_number text;
  v_action_number text;
  v_second_task_number text;
  v_project_identity_immutable boolean := false;
  v_task_identity_immutable boolean := false;
  v_guidance text := 'استمر في التشغيل القائم فقط ولا تغيّر الاستراتيجية أثناء غياب المالك.';
begin
  insert into public.owner_absence_policies (
    tenant_id, status, starts_at, ends_at, strategic_guidance, updated_by
  ) values (
    v_tenant, 'ACTIVE', now() - interval '1 hour', now() + interval '1 day',
    v_guidance, 'database-regression'
  );

  insert into public.projects (id, tenant_id, name, request, status)
  values
    (v_project_one, v_tenant, 'Continuity project one', 'Number this project', 'ACTIVE'),
    (v_project_two, v_tenant, 'Continuity project two', 'Number this project', 'ACTIVE');

  select project_number into v_project_number_one from public.projects where id = v_project_one;
  select project_number into v_project_number_two from public.projects where id = v_project_two;

  if v_project_number_one is null
     or v_project_number_two <> v_project_number_one + 1
     or (select project_date from public.projects where id = v_project_one) <> current_date then
    raise exception 'tenant project numbering or project date is invalid';
  end if;

  if (select owner_guidance from public.projects where id = v_project_one) <> v_guidance then
    raise exception 'active owner strategic guidance was not attached to the project';
  end if;

  delete from public.projects where id = v_project_two;
  insert into public.projects (id, tenant_id, name, request, status)
  values (v_project_three, v_tenant, 'Continuity project three', 'Do not reuse an identity', 'ACTIVE');
  if (select project_number from public.projects where id = v_project_three) <> v_project_number_two + 1 then
    raise exception 'a deleted project number was reused';
  end if;

  begin
    update public.projects set project_number = 999999 where id = v_project_one;
  exception when others then
    v_project_identity_immutable := position('immutable' in lower(sqlerrm)) > 0;
  end;
  if not v_project_identity_immutable then
    raise exception 'project operating identity can be edited';
  end if;

  insert into public.tasks (id, tenant_id, project_id, title, status, priority)
  values ('continuity-task-one', v_tenant, v_project_one, 'First project task', 'TODO', 'MEDIUM');

  insert into public.business_actions (
    id, tenant_id, project_id, action_type, title, status, execution_mode,
    provider, requires_approval, approval_status, payload
  ) values (
    v_action, v_tenant, v_project_one, 'AGENT_DELIVERABLE', 'Agent execution item',
    'QUEUED', 'INTERNAL', 'orvanta_agents', false, 'NOT_REQUIRED', '{}'::jsonb
  );

  insert into public.tasks (id, tenant_id, project_id, title, status, priority)
  values ('continuity-task-two', v_tenant, v_project_one, 'Second project task', 'TODO', 'MEDIUM');

  select task_number into v_task_number from public.tasks where id = 'continuity-task-one';
  select action_number into v_action_number from public.business_actions where id = v_action;
  select task_number into v_second_task_number from public.tasks where id = 'continuity-task-two';

  if v_task_number <> (v_project_number_one::text || '/1')
     or v_action_number <> (v_project_number_one::text || '/2')
     or v_second_task_number <> (v_project_number_one::text || '/3') then
    raise exception 'shared project work-item sequence is invalid: %, %, %',
      v_task_number, v_action_number, v_second_task_number;
  end if;

  if (select task_date from public.tasks where id = 'continuity-task-one') <> current_date
     or (select action_date from public.business_actions where id = v_action) <> current_date then
    raise exception 'work-item dates were not assigned';
  end if;

  delete from public.tasks where id = 'continuity-task-two';
  insert into public.tasks (id, tenant_id, project_id, title, status, priority)
  values ('continuity-task-three', v_tenant, v_project_one, 'Non-reused work item', 'TODO', 'MEDIUM');
  if (select task_number from public.tasks where id = 'continuity-task-three') <> (v_project_number_one::text || '/4') then
    raise exception 'a deleted project work-item number was reused';
  end if;

  begin
    update public.tasks set task_number = v_project_number_one::text || '/99'
    where id = 'continuity-task-one';
  exception when others then
    v_task_identity_immutable := position('immutable' in lower(sqlerrm)) > 0;
  end;
  if not v_task_identity_immutable then
    raise exception 'task operating identity can be edited';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.owner_absence_policies'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.company_continuity_events'::regclass) then
    raise exception 'continuity policy tables must have RLS enabled';
  end if;
end;
$$;

rollback;
