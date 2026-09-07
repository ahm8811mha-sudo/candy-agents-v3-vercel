-- Additive, service-only workflow operations. Existing records are not rewritten.
-- Candidate SQL: install through the configured Supabase migration workflow.
alter table public.company_ideas add column if not exists revision integer not null default 0;

create or replace function public.orvanta_save_idea(
  p_tenant_id text, p_idea jsonb, p_actor text, p_expected_revision integer default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_old public.company_ideas; v_idea public.company_ideas; v_approval public.company_approvals;
  v_id text := p_idea->>'id'; v_ready boolean;
begin
  if nullif(trim(p_tenant_id),'') is null or nullif(trim(p_actor),'') is null or nullif(v_id,'') is null then
    raise exception 'IDEA_INVALID_CONTEXT';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id || ':idea:' || v_id,0));
  select * into v_old from public.company_ideas where id=v_id for update;
  if found then
    if v_old.tenant_id is distinct from p_tenant_id then raise exception 'IDEA_TENANT_MISMATCH'; end if;
    if p_expected_revision is null then return jsonb_build_object('idea',to_jsonb(v_old)); end if;
    if v_old.revision <> p_expected_revision then raise exception 'IDEA_CONFLICT'; end if;
    if v_old.status in ('APPROVED','REJECTED') or v_old.executed_project_id is not null then raise exception 'IDEA_ALREADY_DECIDED'; end if;
    if v_old.approval_id is not null then
      select * into v_approval from public.company_approvals where id=v_old.approval_id and tenant_id=p_tenant_id for update;
      if v_approval.status in ('APPROVED','REJECTED') then raise exception 'IDEA_ALREADY_DECIDED'; end if;
    end if;
  elsif p_expected_revision is not null then raise exception 'IDEA_CONFLICT';
  end if;
  v_idea := jsonb_populate_record(null::public.company_ideas,p_idea);
  if length(trim(v_idea.title)) < 3 or length(trim(v_idea.hypothesis)) < 10 or v_idea.budget_sar < 0
     or v_idea.budget_sar > 1000000000 or v_idea.horizon_days not between 1 and 3650 then raise exception 'IDEA_INVALID_INPUT'; end if;
  v_ready := coalesce((p_idea#>>'{aggregate,assessment,readyForDecision}')::boolean,false)
    and coalesce(p_idea#>>'{aggregate,assessment,version}'='2',false);
  if v_idea.status not in ('UNDER_STUDY','PENDING_APPROVAL') or (v_idea.status='PENDING_APPROVAL' and not v_ready) then
    raise exception 'STUDY_REQUIRED';
  end if;
  v_idea.tenant_id := p_tenant_id;
  v_idea.revision := coalesce(v_old.revision,-1)+1;
  v_idea.executed_project_id := v_old.executed_project_id;
  v_idea.created_at := coalesce(v_old.created_at,v_idea.created_at,now());
  v_idea.approval_id := case when v_idea.status='PENDING_APPROVAL' then 'apr-' || v_id else v_old.approval_id end;
  insert into public.company_ideas select (v_idea).*
  on conflict (id) do update set title=excluded.title,hypothesis=excluded.hypothesis,budget_sar=excluded.budget_sar,
    horizon_days=excluded.horizon_days,status=excluded.status,tier=excluded.tier,tier_label=excluded.tier_label,
    recommendations=excluded.recommendations,aggregate=excluded.aggregate,study_mode=excluded.study_mode,
    approval_id=excluded.approval_id,revision=excluded.revision
  returning * into v_idea;
  if v_idea.approval_id is not null then
    insert into public.company_approvals(id,tenant_id,type,title,detail,amount,requested_role,status,created_at,metadata,dedupe_key)
    values(v_idea.approval_id,p_tenant_id,'IDEA','فكرة: ' || v_idea.title,v_idea.aggregate->>'summary',v_idea.budget_sar,
      v_idea.tier_label,'PENDING',now(),jsonb_build_object('ideaId',v_id,'tier',v_idea.tier,'studyReady',v_ready),'idea-' || v_id)
    on conflict(id) do update set title=excluded.title,detail=excluded.detail,amount=excluded.amount,
      requested_role=excluded.requested_role,metadata=coalesce(company_approvals.metadata,'{}') || excluded.metadata
    where company_approvals.tenant_id=p_tenant_id and company_approvals.status in ('PENDING','DEFERRED')
    returning * into v_approval;
    if v_approval.id is null then raise exception 'IDEA_APPROVAL_CONFLICT'; end if;
  end if;
  insert into public.audit_log(id,tenant_id,actor,action,entity_type,entity_id,detail,created_at,metadata)
  values('aud-idea-' || v_id || '-r' || v_idea.revision,p_tenant_id,p_actor,
    case when p_expected_revision is null then 'CREATE_IDEA' else 'UPDATE_IDEA_STUDY' end,'idea',v_id,
    'حفظ الفكرة والدراسة وطلب الاعتماد في معاملة واحدة',now(),jsonb_build_object('revision',v_idea.revision,'studyReady',v_ready));
  return jsonb_build_object('idea',to_jsonb(v_idea),'approval',case when v_approval.id is not null then to_jsonb(v_approval) else null end);
end $$;

create or replace function public.orvanta_decide_approval(
  p_tenant_id text,p_id text,p_decision text,p_actor text,p_note text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_approval public.company_approvals; v_idea public.company_ideas;
begin
  if p_decision not in ('APPROVED','REJECTED') or nullif(trim(p_actor),'') is null then raise exception 'INVALID_DECISION'; end if;
  select * into v_approval from public.company_approvals where id=p_id and tenant_id=p_tenant_id;
  if not found then raise exception 'APPROVAL_NOT_FOUND'; end if;
  if v_approval.type='IDEA' then
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id || ':idea:' || (v_approval.metadata->>'ideaId'),0));
  end if;
  select * into v_approval from public.company_approvals where id=p_id and tenant_id=p_tenant_id for update;
  if v_approval.status=p_decision then return to_jsonb(v_approval); end if;
  if v_approval.status <> 'PENDING' then raise exception 'APPROVAL_CONFLICT'; end if;
  if v_approval.type='IDEA' then
    select * into v_idea from public.company_ideas where id=v_approval.metadata->>'ideaId' and tenant_id=p_tenant_id for update;
    if not found then raise exception 'IDEA_NOT_FOUND'; end if;
    if p_decision='APPROVED' and (coalesce(v_idea.aggregate#>>'{assessment,readyForDecision}','false') <> 'true'
      or coalesce(v_idea.aggregate#>>'{assessment,version}','0') <> '2') then raise exception 'STUDY_REQUIRED'; end if;
    update public.company_ideas set status=p_decision,revision=revision+1 where id=v_idea.id and tenant_id=p_tenant_id;
  end if;
  update public.company_approvals set status=p_decision,decided_at=now(),decided_by=p_actor,note=p_note
    where id=p_id and tenant_id=p_tenant_id returning * into v_approval;
  insert into public.audit_log(id,tenant_id,actor,action,entity_type,entity_id,detail,created_at,metadata)
    values('aud-approval-' || p_id || '-' || lower(p_decision),p_tenant_id,p_actor,
      case when p_decision='APPROVED' then 'APPROVE' else 'REJECT' end,lower(v_approval.type),p_id,v_approval.title,now(),
      jsonb_build_object('approvalId',p_id,'decision',p_decision,'note',p_note));
  return to_jsonb(v_approval);
end $$;

create or replace function public.orvanta_finalize_idea_funding(
  p_tenant_id text,p_idea_id text,p_project_id uuid,p_actor text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_idea public.company_ideas; v_project public.projects; v_task public.tasks;
  v_amount numeric; v_total numeric; v_approvals jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id || ':idea:' || p_idea_id,0));
  select * into v_idea from public.company_ideas where id=p_idea_id and tenant_id=p_tenant_id for update;
  if not found then raise exception 'IDEA_NOT_FOUND'; end if;
  if not exists(select 1 from public.company_approvals where id=v_idea.approval_id and tenant_id=p_tenant_id and status='APPROVED') then raise exception 'IDEA_NOT_APPROVED'; end if;
  if v_idea.executed_project_id is not null and v_idea.executed_project_id <> p_project_id::text then raise exception 'IDEA_PROJECT_CONFLICT'; end if;
  select * into v_project from public.projects where id=p_project_id and tenant_id=p_tenant_id for update;
  if not found or v_project.financial_snapshot->>'ideaId' is distinct from p_idea_id then raise exception 'IDEA_PROJECT_MISMATCH'; end if;
  select coalesce(sum((metadata->>'estimatedCostSAR')::numeric),0) into v_total from public.tasks
    where project_id=p_project_id and tenant_id=p_tenant_id and metadata->>'requiresFunding'='true';
  if v_total > v_idea.budget_sar then raise exception 'FUNDING_EXCEEDS_IDEA_BUDGET'; end if;
  for v_task in select * from public.tasks where project_id=p_project_id and tenant_id=p_tenant_id
    and metadata->>'requiresFunding'='true' order by id for update loop
    v_amount := (v_task.metadata->>'estimatedCostSAR')::numeric;
    if v_amount is null or v_amount <= 0 then raise exception 'FUNDING_AMOUNT_REQUIRED'; end if;
    -- Match historical requests by task, not by array position or pending status.
    if not exists(select 1 from public.company_approvals where tenant_id=p_tenant_id and type='BUDGET'
      and metadata->>'taskId'=v_task.id and metadata->>'kind'='TASK_FUNDING') then
      insert into public.company_approvals(id,tenant_id,type,title,detail,amount,requested_role,status,created_at,metadata,dedupe_key)
      values('apr-task-funding-' || v_task.id,p_tenant_id,'BUDGET','تمويل: ' || v_task.title,
        'مبلغ تقديري للخطوة ضمن ميزانية الفكرة؛ الاعتماد لا يعني صرف المبلغ.',v_amount,'CFO','PENDING',now(),
        jsonb_build_object('kind','TASK_FUNDING','taskId',v_task.id,'projectId',p_project_id,'ideaId',p_idea_id,'estimatedCostSAR',v_amount),
        'task-funding-' || v_task.id);
    end if;
  end loop;
  update public.company_ideas set executed_project_id=p_project_id::text,status='APPROVED',revision=revision+1
    where id=p_idea_id and tenant_id=p_tenant_id and executed_project_id is null returning * into v_idea;
  insert into public.audit_log(id,tenant_id,actor,action,entity_type,entity_id,detail,created_at,metadata)
  values('aud-idea-funding-' || p_idea_id,p_tenant_id,p_actor,'FINALIZE_IDEA_FUNDING','idea',p_idea_id,
    'ربط المشروع وطلبات التمويل المحفوظة؛ لا يوجد صرف آلي',now(),jsonb_build_object('projectId',p_project_id,'requestedSAR',v_total))
  on conflict(id) do nothing;
  select coalesce(jsonb_agg(to_jsonb(a)),'[]') into v_approvals from public.company_approvals a
    where tenant_id=p_tenant_id and type='BUDGET' and metadata->>'projectId'=p_project_id::text;
  return jsonb_build_object('projectId',p_project_id,'approvals',v_approvals);
end $$;

create or replace function public.orvanta_update_task_status(
  p_tenant_id text,p_id text,p_status text,p_progress integer,p_actor text,p_actor_role text,
  p_confirm_real boolean default false,p_proof_note text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_task public.tasks; v_metadata jsonb; v_real boolean;
begin
  if p_status not in ('TODO','IN_PROGRESS','REVIEW','DONE','BLOCKED','ARCHIVED','WAITING_FUNDING','ON_HOLD')
    or p_progress not between 0 and 100 or nullif(trim(p_actor),'') is null then raise exception 'INVALID_TASK_STATUS'; end if;
  select * into v_task from public.tasks where id=p_id and tenant_id=p_tenant_id for update;
  if not found then raise exception 'TASK_NOT_FOUND'; end if;
  v_metadata := coalesce(v_task.metadata,'{}');
  v_real := v_metadata->>'executionKind'='REAL_WORLD' or v_metadata->>'requiresFunding'='true';
  if p_confirm_real and (p_actor_role not in ('OWNER','ADMIN') or length(trim(coalesce(p_proof_note,''))) < 10) then
    raise exception 'OWNER_PROOF_REQUIRED';
  end if;
  if p_status in ('IN_PROGRESS','REVIEW','DONE') and (v_task.status='WAITING_FUNDING' or v_metadata->>'requiresFunding'='true') then
    if not exists(select 1 from public.company_approvals where tenant_id=p_tenant_id and type='BUDGET'
      and metadata->>'taskId'=p_id and metadata->>'kind'='TASK_FUNDING' and status='APPROVED') then raise exception 'FUNDING_REQUIRED'; end if;
  end if;
  if p_status='ARCHIVED' and v_task.status <> 'DONE' then raise exception 'COMPLETE_BEFORE_ARCHIVE'; end if;
  if v_real and p_status <> 'ARCHIVED' and (p_status='DONE' or p_progress=100) and not p_confirm_real then raise exception 'OWNER_PROOF_REQUIRED'; end if;
  if p_confirm_real then
    if p_status <> 'DONE' then raise exception 'INVALID_CONFIRMATION_STATUS'; end if;
    v_metadata := v_metadata || jsonb_build_object('ownerConfirmed',true,'ownerConfirmedBy',p_actor,
      'ownerConfirmedAt',now(),'proofNote',trim(p_proof_note),'proofVersion',2);
  elsif p_status not in ('DONE','ARCHIVED') then
    v_metadata := v_metadata - 'ownerConfirmed' - 'ownerConfirmedAt' - 'ownerConfirmedBy' - 'proofNote' - 'proofVersion';
  end if;
  update public.tasks set status=p_status,progress_percent=case when p_status in ('DONE','ARCHIVED') then 100 else p_progress end,
    metadata=v_metadata,updated_at=now(),completed_at=case when p_status in ('DONE','ARCHIVED') then coalesce(completed_at,now()) else null end,
    archived_at=case when p_status='ARCHIVED' then now() else null end
    where id=p_id and tenant_id=p_tenant_id returning * into v_task;
  insert into public.audit_log(id,tenant_id,actor,role,action,entity_type,entity_id,detail,created_at,metadata)
    values('aud-task-' || gen_random_uuid()::text,p_tenant_id,p_actor,p_actor_role,
      case when p_confirm_real then 'CONFIRM_REAL_EXECUTION' else 'UPDATE_TASK_STATUS' end,'task',p_id,
      v_task.title,now(),jsonb_build_object('status',p_status,'proofNote',case when p_confirm_real then trim(p_proof_note) else null end));
  return to_jsonb(v_task);
end $$;

create or replace function public.orvanta_change_deferral(p_tenant_id text,p_id text,p_actor text,p_deferral jsonb default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_item public.company_approvals; v_action text;
begin
  select * into v_item from public.company_approvals where id=p_id and tenant_id=p_tenant_id for update;
  if not found then raise exception 'APPROVAL_NOT_FOUND'; end if;
  if p_deferral is null then
    if v_item.status <> 'DEFERRED' or (v_item.metadata#>>'{deferral,remindAt}')::timestamptz > now() then return to_jsonb(v_item); end if;
    v_item.status := 'PENDING';
    v_item.note := 'عادت للصندوق بعد التأجيل — السبب السابق: ' || coalesce(v_item.metadata#>>'{deferral,reason}','');
    v_item.metadata := jsonb_set(v_item.metadata,'{deferral,revivedAt}',to_jsonb(now()));
    v_action := 'REVIVE_DEFERRAL';
  else
    if v_item.status <> 'PENDING' then raise exception 'APPROVAL_CONFLICT'; end if;
    if nullif(trim(p_deferral->>'reason'),'') is null or (p_deferral->>'remindAt')::timestamptz <= now() then raise exception 'INVALID_DEFERRAL'; end if;
    v_item.status := 'DEFERRED'; v_item.note := p_deferral->>'reason';
    v_item.metadata := coalesce(v_item.metadata,'{}') || jsonb_build_object('deferral',p_deferral);
    v_action := 'DEFER';
  end if;
  update public.company_approvals set status=v_item.status,note=v_item.note,metadata=v_item.metadata
    where id=p_id and tenant_id=p_tenant_id returning * into v_item;
  insert into public.audit_log(id,tenant_id,actor,action,entity_type,entity_id,detail,created_at,metadata)
    values('aud-deferral-' || gen_random_uuid()::text,p_tenant_id,p_actor,v_action,'approval',p_id,v_item.title,now(),v_item.metadata);
  return to_jsonb(v_item);
end $$;

revoke all on function public.orvanta_change_deferral(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.orvanta_change_deferral(text,text,text,jsonb) to service_role;
revoke all on function public.orvanta_save_idea(text,jsonb,text,integer) from public,anon,authenticated;
revoke all on function public.orvanta_decide_approval(text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.orvanta_finalize_idea_funding(text,text,uuid,text) from public,anon,authenticated;
revoke all on function public.orvanta_update_task_status(text,text,text,integer,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.orvanta_save_idea(text,jsonb,text,integer) to service_role;
grant execute on function public.orvanta_decide_approval(text,text,text,text,text) to service_role;
grant execute on function public.orvanta_finalize_idea_funding(text,text,uuid,text) to service_role;
grant execute on function public.orvanta_update_task_status(text,text,text,integer,text,text,boolean,text) to service_role;
