-- The confirmation of a real-world step seals its proof in the same
-- transaction that closes the task.
--
-- orvanta_update_task_status gains p_proof_id and p_attested_facts, both
-- defaulted, so every existing caller keeps working unchanged (a text-only
-- confirmation is still proofVersion 2). With a proof, the function checks it
-- belongs to this tenant and task, is unsealed and has files, then seals it and
-- freezes into the task the fingerprints read from the file rows (never from
-- the client) and the facts the owner attested.
--
-- Plan: docs/superpowers/plans/2026-10-18-execution-document-proof.md, task 5
-- Idempotent.

-- Never replace a definition nobody has reviewed. The 8-argument function must
-- be exactly the one 20260907122056_idea_foundation_redesign.sql created
-- (md5 of its body, which Postgres stores verbatim).
do $$
declare
  v_body text;
begin
  select p.prosrc into v_body
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'orvanta_update_task_status'
    and pg_get_function_identity_arguments(p.oid) =
        'p_tenant_id text, p_id text, p_status text, p_progress integer, p_actor text, p_actor_role text, p_confirm_real boolean, p_proof_note text';
  if v_body is not null and md5(v_body) <> 'd7574ca22edb526c4dd46a85a2e14aa8' then
    raise exception 'orvanta_update_task_status here differs from 20260907122056 (md5 %); refusing to replace an unreviewed definition', md5(v_body);
  end if;
end
$$;

drop function if exists public.orvanta_update_task_status(text, text, text, integer, text, text, boolean, text);

create or replace function public.orvanta_update_task_status(
  p_tenant_id text, p_id text, p_status text, p_progress integer, p_actor text, p_actor_role text,
  p_confirm_real boolean default false, p_proof_note text default null,
  p_proof_id uuid default null, p_attested_facts jsonb default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_task public.tasks;
  v_metadata jsonb;
  v_real boolean;
  v_proof public.execution_proofs;
  v_hashes jsonb;
  v_readings jsonb;
  v_facts jsonb;
begin
  if p_status not in ('TODO','IN_PROGRESS','REVIEW','DONE','BLOCKED','ARCHIVED','WAITING_FUNDING','ON_HOLD')
    or p_progress not between 0 and 100 or nullif(trim(p_actor),'') is null then raise exception 'INVALID_TASK_STATUS'; end if;
  if (p_proof_id is not null or p_attested_facts is not null) and not p_confirm_real then raise exception 'PROOF_REQUIRES_CONFIRMATION'; end if;
  if p_attested_facts is not null and (p_proof_id is null or jsonb_typeof(p_attested_facts) <> 'object') then raise exception 'INVALID_PROOF_FACTS'; end if;
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
    -- A confirmation sealed with documents is never overwritten; reopening the
    -- step clears it, and only then can it be confirmed again.
    if v_metadata->>'proofVersion'='3' then raise exception 'PROOF_ALREADY_SEALED'; end if;
    if p_proof_id is not null then
      select * into v_proof from public.execution_proofs
        where id=p_proof_id and tenant_id=p_tenant_id and task_id=p_id for update;
      if not found then raise exception 'PROOF_NOT_FOUND'; end if;
      if v_proof.confirmed_at is not null then raise exception 'PROOF_ALREADY_SEALED'; end if;
      select jsonb_agg(f.sha256 order by f.created_at, f.id), jsonb_agg(f.reading order by f.created_at, f.id)
        into v_hashes, v_readings
        from public.execution_proof_files f where f.proof_id=p_proof_id;
      if v_hashes is null then raise exception 'PROOF_HAS_NO_FILES'; end if;
      v_facts := coalesce(p_attested_facts,'{}'::jsonb);
      update public.execution_proofs
        set facts_read=v_readings, facts_attested=v_facts, note=trim(p_proof_note), confirmed_by=p_actor, confirmed_at=now()
        where id=p_proof_id;
      v_metadata := v_metadata || jsonb_build_object('ownerConfirmed',true,'ownerConfirmedBy',p_actor,
        'ownerConfirmedAt',now(),'proofNote',trim(p_proof_note),'proofVersion',3,
        'proofId',p_proof_id,'proofFileSha256s',v_hashes,'proofFacts',v_facts);
    else
      v_metadata := v_metadata || jsonb_build_object('ownerConfirmed',true,'ownerConfirmedBy',p_actor,
        'ownerConfirmedAt',now(),'proofNote',trim(p_proof_note),'proofVersion',2);
    end if;
  elsif p_status not in ('DONE','ARCHIVED') then
    v_metadata := v_metadata - 'ownerConfirmed' - 'ownerConfirmedAt' - 'ownerConfirmedBy' - 'proofNote' - 'proofVersion'
      - 'proofId' - 'proofFileSha256s' - 'proofFacts';
  end if;
  update public.tasks set status=p_status,progress_percent=case when p_status in ('DONE','ARCHIVED') then 100 else p_progress end,
    metadata=v_metadata,updated_at=now(),completed_at=case when p_status in ('DONE','ARCHIVED') then coalesce(completed_at,now()) else null end,
    archived_at=case when p_status='ARCHIVED' then now() else null end
    where id=p_id and tenant_id=p_tenant_id returning * into v_task;
  insert into public.audit_log(id,tenant_id,actor,role,action,entity_type,entity_id,detail,created_at,metadata)
    values('aud-task-' || gen_random_uuid()::text,p_tenant_id,p_actor,p_actor_role,
      case when p_confirm_real then 'CONFIRM_REAL_EXECUTION' else 'UPDATE_TASK_STATUS' end,'task',p_id,
      v_task.title,now(),jsonb_build_object('status',p_status,'proofNote',case when p_confirm_real then trim(p_proof_note) else null end,
        'proofId',p_proof_id,'proofFileSha256s',v_hashes));
  return to_jsonb(v_task);
end $$;

revoke all on function public.orvanta_update_task_status(text,text,text,integer,text,text,boolean,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.orvanta_update_task_status(text,text,text,integer,text,text,boolean,text,uuid,jsonb) to service_role;

notify pgrst, 'reload schema';
