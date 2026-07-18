-- Durable project/work-item identities and the owner-absence operating policy.
--
-- Project identities are tenant-scoped integers (10) and every task/action
-- receives one shared per-project sequence (10/5). The shared advisory lock
-- prevents concurrent task and action inserts from receiving the same number.

alter table public.projects
  add column if not exists project_number bigint,
  add column if not exists project_date date,
  add column if not exists owner_guidance text;

alter table public.tasks
  add column if not exists task_sequence integer,
  add column if not exists task_number text,
  add column if not exists task_date date;

alter table public.business_actions
  add column if not exists action_sequence integer,
  add column if not exists action_number text,
  add column if not exists action_date date;

update public.projects
set tenant_id = 'golden-star'
where tenant_id is null or trim(tenant_id) = '';

with ranked as (
  select
    id,
    row_number() over (
      partition by tenant_id
      order by created_at asc nulls first, id asc
    )::bigint as project_number
  from public.projects
)
update public.projects as project
set project_number = ranked.project_number,
    project_date = coalesce(project.project_date, project.created_at::date, current_date)
from ranked
where ranked.id = project.id
  and project.project_number is null;

update public.tasks
set task_date = coalesce(task_date, created_at::date, current_date)
where task_date is null;

update public.business_actions
set action_date = coalesce(action_date, created_at::date, current_date)
where action_date is null;

with combined as (
  select
    'TASK'::text as item_kind,
    task.id::text as item_id,
    task.project_id,
    task.created_at
  from public.tasks as task
  where task.project_id is not null
  union all
  select
    'ACTION'::text as item_kind,
    action.id::text as item_id,
    action.project_id,
    action.created_at
  from public.business_actions as action
  where action.project_id is not null
), numbered as (
  select
    item_kind,
    item_id,
    project_id,
    row_number() over (
      partition by project_id
      order by created_at asc nulls first, item_kind asc, item_id asc
    )::integer as item_sequence
  from combined
)
update public.tasks as task
set task_sequence = numbered.item_sequence,
    task_number = project.project_number::text || '/' || numbered.item_sequence::text
from numbered
join public.projects as project on project.id = numbered.project_id
where numbered.item_kind = 'TASK'
  and task.id::text = numbered.item_id
  and task.task_sequence is null;

with combined as (
  select
    'TASK'::text as item_kind,
    task.id::text as item_id,
    task.project_id,
    task.created_at
  from public.tasks as task
  where task.project_id is not null
  union all
  select
    'ACTION'::text as item_kind,
    action.id::text as item_id,
    action.project_id,
    action.created_at
  from public.business_actions as action
  where action.project_id is not null
), numbered as (
  select
    item_kind,
    item_id,
    project_id,
    row_number() over (
      partition by project_id
      order by created_at asc nulls first, item_kind asc, item_id asc
    )::integer as item_sequence
  from combined
)
update public.business_actions as action
set action_sequence = numbered.item_sequence,
    action_number = project.project_number::text || '/' || numbered.item_sequence::text
from numbered
join public.projects as project on project.id = numbered.project_id
where numbered.item_kind = 'ACTION'
  and action.id::text = numbered.item_id
  and action.action_sequence is null;

alter table public.projects
  alter column project_number set not null,
  alter column project_date set not null;

alter table public.tasks
  alter column task_date set not null;

alter table public.business_actions
  alter column action_date set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_operating_number_positive_chk'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_operating_number_positive_chk
      check (project_number > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_operating_identity_complete_chk'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_operating_identity_complete_chk
      check (
        (project_id is null and task_sequence is null and task_number is null)
        or (project_id is not null and task_sequence > 0 and task_number is not null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'business_actions_operating_identity_complete_chk'
      and conrelid = 'public.business_actions'::regclass
  ) then
    alter table public.business_actions
      add constraint business_actions_operating_identity_complete_chk
      check (
        (project_id is null and action_sequence is null and action_number is null)
        or (project_id is not null and action_sequence > 0 and action_number is not null)
      );
  end if;
end;
$$;

alter table public.projects
  alter column project_date set default current_date;

alter table public.tasks
  alter column task_date set default current_date;

alter table public.business_actions
  alter column action_date set default current_date;

create unique index if not exists projects_tenant_project_number_uidx
  on public.projects (tenant_id, project_number)
  where project_number is not null;

create unique index if not exists tasks_project_sequence_uidx
  on public.tasks (project_id, task_sequence)
  where project_id is not null and task_sequence is not null;

create unique index if not exists business_actions_project_sequence_uidx
  on public.business_actions (project_id, action_sequence)
  where project_id is not null and action_sequence is not null;

create index if not exists projects_project_date_idx
  on public.projects (tenant_id, project_date desc, project_number desc);

create table if not exists public.project_number_counters (
  tenant_id text primary key,
  last_number bigint not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_work_item_counters (
  project_id uuid primary key references public.projects(id) on delete cascade,
  tenant_id text not null,
  last_sequence integer not null default 0 check (last_sequence >= 0),
  updated_at timestamptz not null default now()
);

insert into public.project_number_counters (tenant_id, last_number)
select tenant_id, coalesce(max(project_number), 0)
from public.projects
group by tenant_id
on conflict (tenant_id) do update
set last_number = greatest(public.project_number_counters.last_number, excluded.last_number),
    updated_at = now();

insert into public.project_work_item_counters (project_id, tenant_id, last_sequence)
select
  project.id,
  project.tenant_id,
  greatest(
    coalesce((select max(task.task_sequence) from public.tasks as task where task.project_id = project.id), 0),
    coalesce((select max(action.action_sequence) from public.business_actions as action where action.project_id = project.id), 0)
  )
from public.projects as project
on conflict (project_id) do update
set last_sequence = greatest(public.project_work_item_counters.last_sequence, excluded.last_sequence),
    tenant_id = excluded.tenant_id,
    updated_at = now();

alter table public.project_number_counters enable row level security;
alter table public.project_work_item_counters enable row level security;

revoke all on table public.project_number_counters from anon, authenticated;
revoke all on table public.project_work_item_counters from anon, authenticated;

drop policy if exists server_only_no_client_access on public.project_number_counters;
create policy server_only_no_client_access
  on public.project_number_counters
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists server_only_no_client_access on public.project_work_item_counters;
create policy server_only_no_client_access
  on public.project_work_item_counters
  for all to anon, authenticated
  using (false)
  with check (false);

grant select, insert, update, delete on table public.project_number_counters to service_role;
grant select, insert, update, delete on table public.project_work_item_counters to service_role;

create or replace function public.orvanta_assign_project_number()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_next_number bigint;
begin
  new.tenant_id := coalesce(nullif(trim(new.tenant_id), ''), 'golden-star');
  new.project_date := coalesce(new.project_date, new.created_at::date, current_date);

  if new.project_number is null then
    perform pg_advisory_xact_lock(hashtextextended('orvanta-project-number:' || new.tenant_id, 0));
    select coalesce(max(project.project_number), 0) + 1
      into v_next_number
    from public.projects as project
    where project.tenant_id = new.tenant_id;

    insert into public.project_number_counters (tenant_id, last_number)
    values (new.tenant_id, v_next_number - 1)
    on conflict (tenant_id) do update
    set last_number = greatest(public.project_number_counters.last_number, excluded.last_number),
        updated_at = now();

    update public.project_number_counters
    set last_number = last_number + 1,
        updated_at = now()
    where tenant_id = new.tenant_id
    returning last_number into new.project_number;
  end if;

  return new;
end;
$$;

drop trigger if exists orvanta_assign_project_number on public.projects;
create trigger orvanta_assign_project_number
before insert on public.projects
for each row execute function public.orvanta_assign_project_number();

create or replace function public.orvanta_preserve_project_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.tenant_id is distinct from old.tenant_id
     or new.project_number is distinct from old.project_number
     or new.project_date is distinct from old.project_date then
    raise exception 'project operating identity is immutable; create a new project instead';
  end if;
  return new;
end;
$$;

drop trigger if exists orvanta_preserve_project_identity on public.projects;
create trigger orvanta_preserve_project_identity
before update of tenant_id, project_number, project_date on public.projects
for each row execute function public.orvanta_preserve_project_identity();

create or replace function public.orvanta_allocate_work_item_number(p_project_id uuid)
returns table (
  allocated_project_number bigint,
  allocated_project_tenant text,
  allocated_sequence integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project_number bigint;
  v_project_tenant text;
  v_task_max integer;
  v_action_max integer;
  v_next_sequence integer;
begin
  select project.project_number, project.tenant_id
    into v_project_number, v_project_tenant
  from public.projects as project
  where project.id = p_project_id;

  if v_project_number is null then
    raise exception 'project % does not have an operating number', p_project_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('orvanta-project-work-item:' || p_project_id::text, 0));

  select coalesce(max(task.task_sequence), 0)
    into v_task_max
  from public.tasks as task
  where task.project_id = p_project_id;

  select coalesce(max(action.action_sequence), 0)
    into v_action_max
  from public.business_actions as action
  where action.project_id = p_project_id;

  v_next_sequence := greatest(v_task_max, v_action_max) + 1;
  insert into public.project_work_item_counters (
    project_id, tenant_id, last_sequence
  ) values (
    p_project_id, v_project_tenant, v_next_sequence - 1
  )
  on conflict (project_id) do update
  set last_sequence = greatest(public.project_work_item_counters.last_sequence, excluded.last_sequence),
      tenant_id = excluded.tenant_id,
      updated_at = now();

  update public.project_work_item_counters
  set last_sequence = last_sequence + 1,
      updated_at = now()
  where project_id = p_project_id
  returning last_sequence into v_next_sequence;

  return query select v_project_number, v_project_tenant, v_next_sequence;
end;
$$;

revoke all on function public.orvanta_allocate_work_item_number(uuid)
  from public, anon, authenticated;
grant execute on function public.orvanta_allocate_work_item_number(uuid)
  to service_role;

create or replace function public.orvanta_assign_task_number()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_identity record;
  v_reassign boolean := tg_op = 'INSERT';
begin
  if tg_op = 'UPDATE' then
    if old.project_id is not null and new.project_id is distinct from old.project_id then
      raise exception 'numbered project work items cannot be moved; create a new work item instead';
    end if;
    if old.task_sequence is not null
       and (
         new.task_sequence is distinct from old.task_sequence
         or new.task_number is distinct from old.task_number
         or new.task_date is distinct from old.task_date
       ) then
      raise exception 'task operating identity is immutable';
    end if;
    v_reassign := new.project_id is distinct from old.project_id;
  end if;

  if new.project_id is null then
    new.task_sequence := null;
    new.task_number := null;
    new.task_date := coalesce(new.task_date, new.created_at::date, current_date);
    return new;
  end if;

  if new.task_sequence is null then
    v_reassign := true;
  end if;
  if not v_reassign then
    return new;
  end if;

  select * into strict v_identity
  from public.orvanta_allocate_work_item_number(new.project_id);
  new.tenant_id := v_identity.allocated_project_tenant;
  new.task_sequence := v_identity.allocated_sequence;
  new.task_number := v_identity.allocated_project_number::text || '/' || v_identity.allocated_sequence::text;
  new.task_date := coalesce(new.task_date, new.created_at::date, current_date);
  return new;
end;
$$;

create or replace function public.orvanta_assign_action_number()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_identity record;
  v_reassign boolean := tg_op = 'INSERT';
begin
  if tg_op = 'UPDATE' then
    if old.project_id is not null and new.project_id is distinct from old.project_id then
      raise exception 'numbered project work items cannot be moved; create a new work item instead';
    end if;
    if old.action_sequence is not null
       and (
         new.action_sequence is distinct from old.action_sequence
         or new.action_number is distinct from old.action_number
         or new.action_date is distinct from old.action_date
       ) then
      raise exception 'action operating identity is immutable';
    end if;
    v_reassign := new.project_id is distinct from old.project_id;
  end if;

  if new.project_id is null then
    new.action_sequence := null;
    new.action_number := null;
    new.action_date := coalesce(new.action_date, new.created_at::date, current_date);
    return new;
  end if;

  if new.action_sequence is null then
    v_reassign := true;
  end if;
  if not v_reassign then
    return new;
  end if;

  select * into strict v_identity
  from public.orvanta_allocate_work_item_number(new.project_id);
  new.tenant_id := v_identity.allocated_project_tenant;
  new.action_sequence := v_identity.allocated_sequence;
  new.action_number := v_identity.allocated_project_number::text || '/' || v_identity.allocated_sequence::text;
  new.action_date := coalesce(new.action_date, new.created_at::date, current_date);
  return new;
end;
$$;

drop trigger if exists orvanta_assign_task_number on public.tasks;
create trigger orvanta_assign_task_number
before insert or update of project_id, task_sequence, task_number, task_date on public.tasks
for each row execute function public.orvanta_assign_task_number();

drop trigger if exists orvanta_assign_action_number on public.business_actions;
create trigger orvanta_assign_action_number
before insert or update of project_id, action_sequence, action_number, action_date on public.business_actions
for each row execute function public.orvanta_assign_action_number();

comment on column public.projects.project_number is
  'Tenant-scoped operating project number shown to the owner and agents.';
comment on column public.tasks.task_number is
  'Project-linked work item number in the form project/sequence, for example 10/5.';
comment on column public.business_actions.action_number is
  'Project-linked execution item number sharing the project work-item sequence.';

create table if not exists public.owner_absence_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null unique,
  status text not null default 'INACTIVE'
    check (status in ('INACTIVE', 'SCHEDULED', 'ACTIVE', 'PAUSED')),
  starts_at timestamptz,
  ends_at timestamptz,
  strategic_guidance text not null default '',
  prohibited_actions text[] not null default array[
    'STRATEGY_CHANGE',
    'LEGAL_COMMITMENT',
    'BANK_TRANSFER',
    'BORROWING',
    'BUDGET_GATE',
    'CAPITAL_ALLOCATION',
    'NEW_MARKET_ENTRY',
    'HIRING',
    'TERMINATION',
    'OWNERSHIP_CHANGE'
  ]::text[],
  routine_auto_limit_sar numeric not null default 5000 check (routine_auto_limit_sar >= 0),
  executive_agent_limit_sar numeric not null default 25000 check (executive_agent_limit_sar >= routine_auto_limit_sar),
  max_autonomous_risk text not null default 'MEDIUM' check (max_autonomous_risk in ('LOW', 'MEDIUM')),
  allow_external_actions boolean not null default false,
  require_completion_evidence boolean not null default true,
  delegated_human_name text,
  delegated_human_contact text,
  daily_brief_hour smallint not null default 18 check (daily_brief_hour between 0 and 23),
  last_run_at timestamptz,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'SCHEDULED' or starts_at is not null),
  check (status not in ('ACTIVE', 'SCHEDULED') or length(trim(strategic_guidance)) >= 20),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.company_continuity_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  policy_id uuid references public.owner_absence_policies(id) on delete set null,
  event_type text not null,
  project_id uuid references public.projects(id) on delete set null,
  action_id uuid references public.business_actions(id) on delete set null,
  approval_id text,
  decision text not null,
  reason text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists company_continuity_events_tenant_created_idx
  on public.company_continuity_events (tenant_id, created_at desc);

create index if not exists company_continuity_events_policy_idx
  on public.company_continuity_events (policy_id)
  where policy_id is not null;

create index if not exists company_continuity_events_project_idx
  on public.company_continuity_events (project_id)
  where project_id is not null;

create index if not exists company_continuity_events_action_idx
  on public.company_continuity_events (action_id)
  where action_id is not null;

alter table public.company_continuity_events
  add column if not exists approval_id text;

alter table public.owner_absence_policies enable row level security;
alter table public.company_continuity_events enable row level security;

revoke all on table public.owner_absence_policies from anon, authenticated;
revoke all on table public.company_continuity_events from anon, authenticated;

drop policy if exists server_only_no_client_access on public.owner_absence_policies;
create policy server_only_no_client_access
  on public.owner_absence_policies
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists server_only_no_client_access on public.company_continuity_events;
create policy server_only_no_client_access
  on public.company_continuity_events
  for all to anon, authenticated
  using (false)
  with check (false);

grant select, insert, update, delete on table public.owner_absence_policies to service_role;
grant select, insert, update, delete on table public.company_continuity_events to service_role;

insert into public.owner_absence_policies (
  tenant_id,
  status,
  strategic_guidance,
  updated_by
) values (
  'golden-star',
  'INACTIVE',
  'يحافظ الوكلاء على التشغيل القائم ضمن الميزانيات المعتمدة. يعود للمالك فقط تغيير الاستراتيجية أو الالتزام القانوني أو المالي الجوهري.',
  'system-migration'
)
on conflict (tenant_id) do nothing;

create or replace function public.orvanta_apply_owner_guidance_to_project()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_guidance text;
begin
  if nullif(trim(coalesce(new.owner_guidance, '')), '') is not null then
    return new;
  end if;

  select policy.strategic_guidance
    into v_guidance
  from public.owner_absence_policies as policy
  where policy.tenant_id = coalesce(nullif(trim(new.tenant_id), ''), 'golden-star')
    and policy.status in ('ACTIVE', 'SCHEDULED')
    and (policy.starts_at is null or policy.starts_at <= now())
    and (policy.ends_at is null or policy.ends_at > now())
  limit 1;

  new.owner_guidance := nullif(trim(coalesce(v_guidance, '')), '');
  return new;
end;
$$;

drop trigger if exists orvanta_apply_owner_guidance_to_project on public.projects;
create trigger orvanta_apply_owner_guidance_to_project
before insert on public.projects
for each row execute function public.orvanta_apply_owner_guidance_to_project();

comment on table public.owner_absence_policies is
  'Owner-approved continuity charter. Agents run operations inside its limits while strategic control remains with the owner.';
comment on table public.company_continuity_events is
  'Immutable operating evidence for autonomous work, deferrals, and escalations during owner absence.';
