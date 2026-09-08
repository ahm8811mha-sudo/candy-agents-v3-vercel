-- Run after installing candidate functions, inside BEGIN ... ROLLBACK.
-- Synthetic rows only. No real decisions, transactions, or messages are executed.
begin;
do $$
declare
  v_id text := 'verification-idea-' || gen_random_uuid();
  v_task text := 'verification-task-' || gen_random_uuid();
  v_project uuid := gen_random_uuid();
  v_input jsonb; v_result jsonb; v_count integer;
begin
  v_input := jsonb_build_object('id',v_id,'title','اختبار معاملات مؤقت','hypothesis','بيانات اختبار معزولة ترجع بالكامل عند التراجع',
    'budget_sar',1000,'horizon_days',14,'source','OWNER','proposed_by','test','proposed_by_name','اختبار',
    'status','UNDER_STUDY','tier','T1','tier_label','CEO','recommendations','[]'::jsonb,'aggregate',
    '{"summary":"اختبار","assessment":{"version":2,"readyForDecision":false}}'::jsonb,'created_at',now());
  v_result := public.orvanta_save_idea('golden-star',v_input,'verification',null);
  if v_result#>>'{idea,status}' <> 'UNDER_STUDY' or v_result->>'approval' is not null then raise exception 'TEST_INCOMPLETE_GATE'; end if;
  perform public.orvanta_save_idea('golden-star',v_input,'verification',null);
  select count(*) into v_count from public.company_ideas where id=v_id;
  if v_count <> 1 then raise exception 'TEST_IDEMPOTENCY'; end if;
  begin
    perform public.orvanta_save_idea('other-tenant',v_input,'verification',0);
    raise exception 'TEST_TENANT_WAS_NOT_REJECTED';
  exception when others then if sqlerrm <> 'IDEA_TENANT_MISMATCH' then raise; end if; end;
  v_input := jsonb_set(jsonb_set(v_input,'{status}','"PENDING_APPROVAL"'),'{aggregate,assessment,readyForDecision}','true');
  v_result := public.orvanta_save_idea('golden-star',v_input,'verification',0);
  if v_result#>>'{approval,status}' <> 'PENDING' then raise exception 'TEST_APPROVAL_NOT_CREATED'; end if;
  -- A failed audit insert must roll back both the study and approval amount.
  insert into public.audit_log(id,tenant_id,actor,action,entity_type,entity_id,detail,created_at)
    values('aud-idea-' || v_id || '-r2','golden-star','verification','TEST_COLLISION','idea',v_id,'temporary',now());
  begin
    perform public.orvanta_save_idea('golden-star',jsonb_set(v_input,'{budget_sar}','900'),'verification',1);
    raise exception 'TEST_AUDIT_FAILURE_WAS_NOT_REJECTED';
  exception when unique_violation then null; end;
  if exists(select 1 from public.company_ideas where id=v_id and budget_sar <> 1000)
    or exists(select 1 from public.company_approvals where id='apr-'||v_id and amount <> 1000) then raise exception 'TEST_PARTIAL_AUDIT_COMMIT'; end if;
  perform public.orvanta_change_deferral('golden-star','apr-'||v_id,'verification',jsonb_build_object('reason','طلب اختبار مؤقت','remindAt',now()+interval '1 day','deferredBy','verification'));
  if not exists(select 1 from public.company_approvals where id='apr-'||v_id and status='DEFERRED') then raise exception 'TEST_DEFERRAL'; end if;
  update public.company_approvals set metadata=jsonb_set(metadata,'{deferral,remindAt}',to_jsonb(now()-interval '1 day')) where id='apr-'||v_id;
  perform public.orvanta_change_deferral('golden-star','apr-'||v_id,'verification',null);
  begin
    perform public.orvanta_save_idea('golden-star',v_input,'verification',0);
    raise exception 'TEST_STALE_WRITE_WAS_NOT_REJECTED';
  exception when others then if sqlerrm <> 'IDEA_CONFLICT' then raise; end if; end;
  perform public.orvanta_decide_approval('golden-star','apr-'||v_id,'APPROVED','verification',null);
  perform public.orvanta_decide_approval('golden-star','apr-'||v_id,'APPROVED','verification',null);
  begin
    perform public.orvanta_decide_approval('golden-star','apr-'||v_id,'REJECTED','verification',null);
    raise exception 'TEST_OPPOSING_DECISION_WAS_NOT_REJECTED';
  exception when others then if sqlerrm <> 'APPROVAL_CONFLICT' then raise; end if; end;
  insert into public.projects(id,tenant_id,name,status,budget,approved_budget,approval_status,financial_snapshot)
    values(v_project,'golden-star','مشروع اختبار مؤقت','ACTIVE',1000,1000,'APPROVED',jsonb_build_object('ideaId',v_id));
  insert into public.tasks(id,tenant_id,project_id,title,status,priority,metadata)
    values(v_task,'golden-star',v_project,'شراء تجريبي غير منفذ','WAITING_FUNDING','HIGH','{"requiresFunding":true,"estimatedCostSAR":250,"executionKind":"REAL_WORLD"}');
  perform public.orvanta_finalize_idea_funding('golden-star',v_id,v_project,'verification');
  begin
    perform public.orvanta_update_task_status('golden-star',v_task,'DONE',100,'verification','OWNER',true,'');
    raise exception 'TEST_EMPTY_PROOF_WAS_NOT_REJECTED';
  exception when others then if sqlerrm <> 'OWNER_PROOF_REQUIRED' then raise; end if; end;
  begin
    perform public.orvanta_update_task_status('golden-star',v_task,'DONE',100,'verification','OWNER',true,'إثبات اختبار فقط وليس تنفيذاً حقيقياً');
    raise exception 'TEST_UNFUNDED_TASK_WAS_NOT_REJECTED';
  exception when others then if sqlerrm <> 'FUNDING_REQUIRED' then raise; end if; end;
  perform public.orvanta_decide_approval('golden-star','apr-task-funding-'||v_task,'APPROVED','verification',null);
  perform public.orvanta_finalize_idea_funding('golden-star',v_id,v_project,'verification');
  select count(*) into v_count from public.company_approvals where tenant_id='golden-star' and metadata->>'taskId'=v_task;
  if v_count <> 1 then raise exception 'TEST_DUPLICATE_FUNDING'; end if;
  if not exists(select 1 from public.company_approvals where id='apr-task-funding-'||v_task and status='APPROVED') then raise exception 'TEST_FUNDING_RESET'; end if;
  perform public.orvanta_update_task_status('golden-star',v_task,'DONE',100,'verification','OWNER',true,'إثبات اختبار فقط وليس تنفيذاً حقيقياً');
  if not exists(select 1 from public.audit_log where entity_id=v_task and action='CONFIRM_REAL_EXECUTION' and metadata->>'proofNote' is not null) then raise exception 'TEST_MISSING_PROOF_AUDIT'; end if;
  if has_function_privilege('anon','public.orvanta_save_idea(text,jsonb,text,integer)','EXECUTE')
    or has_function_privilege('authenticated','public.orvanta_update_task_status(text,text,text,integer,text,text,boolean,text)','EXECUTE') then raise exception 'TEST_PUBLIC_RPC_ACCESS'; end if;
end $$;
select 'PASS: atomic save, tenant isolation, stale-write protection, decision consistency, funding retry, proof and service-only grants' as verification;
rollback;
