-- One rule for a real-world task reaching DONE, held everywhere: the owner's
-- confirmation and a proof note of at least 10 characters, the minimum
-- orvanta_update_task_status (20261018000300) asks for when it confirms.
--
-- The production replay of 2026-10-22 found two differences from
-- 20260719000100_task_execution_proof_gate.sql:
-- - production's guard asked for 12 characters, so a confirmation the
--   function had accepted with a 10- or 11-character note was then refused
--   by the trigger; the repository's guard asked for no note at all;
-- - orvanta_reopen_unproven_real_tasks was never created there, so the daily
--   autonomy loop stopped at its honesty sweep (cron_runs, 2026-10-22).
-- Trigger functions run with the caller's rights, as the accounting guards do
-- (202607130005); the sweep keeps its owner's rights and only the server may
-- run it.

create or replace function public.orvanta_guard_real_world_task()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'DONE'
     and (tg_op = 'INSERT' or old.status is distinct from 'DONE')
     and coalesce(new.metadata ->> 'executionKind', 'INTERNAL') = 'REAL_WORLD'
     and (coalesce(new.metadata ->> 'ownerConfirmed', 'false') <> 'true'
          or length(trim(coalesce(new.metadata ->> 'proofNote', ''))) < 10) then
    raise exception 'REAL_WORLD task % cannot be DONE without the owner''s confirmation and a proof note of at least 10 characters', new.id
      using hint = 'confirm the real execution with proof first';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_real_world_task on public.tasks;
create trigger trg_guard_real_world_task
before insert or update on public.tasks
for each row execute function public.orvanta_guard_real_world_task();

-- The daily sweep reopens any DONE real-world task the guard would refuse
-- today, so a task closed before the guard existed cannot stay closed.
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
    and (coalesce(metadata ->> 'ownerConfirmed', 'false') <> 'true'
         or length(trim(coalesce(metadata ->> 'proofNote', ''))) < 10);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.orvanta_guard_real_world_task() from public, anon, authenticated;
revoke all on function public.orvanta_reopen_unproven_real_tasks(text) from public, anon, authenticated;
grant execute on function public.orvanta_reopen_unproven_real_tasks(text) to service_role;

notify pgrst, 'reload schema';
