-- Execution honesty gate. A REAL_WORLD task (commercial registration, bank
-- account, paid fee, signed contract) can only reach DONE with the owner's
-- confirmation stamped into metadata. Agents producing paperwork must stop at
-- REVIEW. Enforced here so no code path — present or future — can lie.

create or replace function public.orvanta_guard_real_world_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transitioning boolean;
begin
  v_transitioning := new.status = 'DONE'
    and (tg_op = 'INSERT' or old.status is distinct from 'DONE');

  if v_transitioning
     and coalesce(new.metadata ->> 'executionKind', 'INTERNAL') = 'REAL_WORLD'
     and coalesce(new.metadata ->> 'ownerConfirmed', 'false') <> 'true' then
    raise exception 'REAL_WORLD task % cannot be DONE without owner confirmation (metadata.ownerConfirmed)', new.id
      using hint = 'confirm the real execution with proof first';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_real_world_task on public.tasks;
create trigger trg_guard_real_world_task
before insert or update on public.tasks
for each row execute function public.orvanta_guard_real_world_task();

-- Weekly sweep: any DONE real-world task without proof is reopened to REVIEW
-- and flagged, so a historical mislabel can never survive quietly.
create or replace function public.orvanta_reopen_unproven_real_tasks(p_tenant_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.tasks
    set status = 'REVIEW',
        progress_percent = least(coalesce(progress_percent, 0), 60),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'readyForOwner', true,
          'reopenedBy', 'honesty-sweep',
          'reopenedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        ),
        updated_at = now()
  where tenant_id = p_tenant_id
    and status = 'DONE'
    and coalesce(metadata ->> 'executionKind', 'INTERNAL') = 'REAL_WORLD'
    and coalesce(metadata ->> 'ownerConfirmed', 'false') <> 'true';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.orvanta_guard_real_world_task() from public, anon, authenticated;
revoke all on function public.orvanta_reopen_unproven_real_tasks(text) from public, anon, authenticated;
grant execute on function public.orvanta_reopen_unproven_real_tasks(text) to service_role;

notify pgrst, 'reload schema';
