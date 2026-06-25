create table if not exists departments (
  id text primary key,
  name text not null,
  description text,
  manager_id text,
  created_at timestamptz default now()
);

create table if not exists employees (
  id text primary key,
  auth_user_id uuid,
  full_name text not null,
  email text unique not null,
  phone text,
  role text not null check (role in ('CEO', 'MANAGER', 'EMPLOYEE', 'ADMIN')),
  department_id text references departments(id),
  manager_id text references employees(id),
  job_title text,
  status text not null default 'ACTIVE',
  joined_at date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists tasks (
  id text primary key,
  title text not null,
  description text,
  status text not null default 'TODO' check (status in ('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'BLOCKED')),
  priority text not null default 'MEDIUM' check (priority in ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  assigned_to text references employees(id),
  created_by text references employees(id),
  department_id text references departments(id),
  due_date timestamptz,
  progress_percent int not null default 0 check (progress_percent between 0 and 100),
  archived_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists task_comments (
  id text primary key,
  task_id text references tasks(id) on delete cascade,
  employee_id text references employees(id),
  comment text not null,
  created_at timestamptz default now()
);

create table if not exists daily_logs (
  id text primary key,
  employee_id text references employees(id),
  log_date date not null,
  summary text not null,
  achievements text,
  blockers text,
  next_step text,
  progress_score int check (progress_score between 1 and 10),
  status text not null default 'SUBMITTED' check (status in ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED')),
  reviewed_by text references employees(id),
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists approvals (
  id text primary key,
  entity_type text not null,
  entity_id text not null,
  requested_by text references employees(id),
  approver_id text references employees(id),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  notes text,
  created_at timestamptz default now(),
  decided_at timestamptz
);

create table if not exists notifications (
  id text primary key,
  employee_id text references employees(id),
  title text not null,
  message text not null,
  type text not null default 'INFO' check (type in ('INFO', 'TASK', 'APPROVAL', 'WARNING', 'SYSTEM')),
  read_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists activity_logs (
  id text primary key,
  actor_id text references employees(id),
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists external_sync_logs (
  id text primary key,
  provider text not null,
  entity_type text not null,
  entity_id text,
  status text not null check (status in ('SUCCESS', 'FAILED')),
  error_message text,
  created_at timestamptz default now()
);

create index if not exists idx_tasks_assigned_to on tasks(assigned_to);
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_daily_logs_employee_date on daily_logs(employee_id, log_date);
create index if not exists idx_activity_logs_created_at on activity_logs(created_at desc);
create index if not exists idx_notifications_employee on notifications(employee_id, read_at);

create extension if not exists pgcrypto;

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  request text,
  status text not null default 'ACTIVE',
  budget numeric default 0,
  approved_budget numeric default 0,
  health_score int default 0 check (health_score between 0 and 100),
  risk_level text default 'LOW',
  approval_status text default 'NOT_REQUIRED',
  strategic_direction text,
  financial_snapshot jsonb default '{}',
  next_review_at timestamptz,
  created_at timestamptz default now()
);

alter table tasks add column if not exists project_id uuid references projects(id) on delete set null;
alter table tasks add column if not exists content text;
alter table tasks add column if not exists owner_role text;
alter table tasks add column if not exists kpi_name text;
alter table tasks add column if not exists kpi_target numeric;

create index if not exists idx_tasks_project_id on tasks(project_id);

create table if not exists ai_logs (
  id text primary key,
  type text not null,
  content text not null,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists agent_runs (
  id text primary key,
  agent_name text not null,
  input text not null,
  output text not null,
  status text not null default 'COMPLETED',
  created_at timestamptz default now()
);

alter table ai_logs enable row level security;
alter table agent_runs enable row level security;

drop policy if exists "app read ai logs" on ai_logs;
drop policy if exists "app write ai logs" on ai_logs;
drop policy if exists "app read agent runs" on agent_runs;
drop policy if exists "app write agent runs" on agent_runs;

create policy "app read ai logs" on ai_logs for select to anon, authenticated using (true);
create policy "app write ai logs" on ai_logs for insert to anon, authenticated with check (true);
create policy "app read agent runs" on agent_runs for select to anon, authenticated using (true);
create policy "app write agent runs" on agent_runs for insert to anon, authenticated with check (true);

grant select, insert on ai_logs to anon, authenticated, service_role;
grant select, insert on agent_runs to anon, authenticated, service_role;

create table if not exists company_logs (
  id uuid primary key default gen_random_uuid(),
  request text not null,
  accounting text,
  marketing text,
  operations text,
  supply text,
  final text,
  created_at timestamptz default now()
);

alter table company_logs enable row level security;

drop policy if exists "app read company logs" on company_logs;
drop policy if exists "app write company logs" on company_logs;

create policy "app read company logs" on company_logs for select to anon, authenticated using (true);
create policy "app write company logs" on company_logs for insert to anon, authenticated with check (true);

grant select, insert on company_logs to anon, authenticated, service_role;

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('income', 'expense')),
  amount numeric not null check (amount > 0),
  description text not null,
  created_at timestamptz default now()
);

alter table transactions enable row level security;

alter table transactions add column if not exists category text not null default 'general';
alter table transactions add column if not exists project_id uuid references projects(id) on delete set null;
alter table transactions add column if not exists channel text;

drop policy if exists "app read transactions" on transactions;
drop policy if exists "app write transactions" on transactions;

create policy "app read transactions" on transactions for select to anon, authenticated using (true);
create policy "app write transactions" on transactions for insert to anon, authenticated with check (type in ('income', 'expense') and amount > 0 and length(description) > 0);

grant select, insert on transactions to anon, authenticated, service_role;

create table if not exists financial_decisions (
  id uuid primary key default gen_random_uuid(),
  request text not null,
  financials jsonb,
  cfo_report text,
  ceo_decision text,
  created_at timestamptz default now()
);

alter table financial_decisions enable row level security;

drop policy if exists "app read financial decisions" on financial_decisions;
drop policy if exists "app write financial decisions" on financial_decisions;

create policy "app read financial decisions" on financial_decisions for select to anon, authenticated using (true);
create policy "app write financial decisions" on financial_decisions for insert to anon, authenticated with check (length(request) > 0);

grant select, insert on financial_decisions to anon, authenticated, service_role;

create table if not exists business_kpis (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  target numeric not null default 0,
  current numeric not null default 0,
  unit text default '',
  status text not null default 'WATCH',
  due_date timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists business_alerts (
  id uuid primary key default gen_random_uuid(),
  severity text not null default 'MEDIUM',
  title text not null,
  message text not null,
  source text not null default 'rules_engine',
  status text not null default 'OPEN',
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists business_actions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  action_type text not null,
  title text not null,
  description text,
  status text not null default 'QUEUED',
  execution_mode text not null default 'INTERNAL',
  provider text,
  requires_approval boolean default false,
  approval_status text default 'NOT_REQUIRED',
  payload jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists business_memory (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  title text not null,
  summary text,
  decision_quality text default 'WATCH',
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists business_integrations (
  id text primary key,
  provider text not null,
  status text not null default 'NOT_CONNECTED',
  config jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_business_kpis_project_id on business_kpis(project_id);
create index if not exists idx_business_actions_project_id on business_actions(project_id);
create index if not exists idx_business_alerts_status on business_alerts(status, severity);

alter table projects enable row level security;
alter table business_kpis enable row level security;
alter table business_alerts enable row level security;
alter table business_actions enable row level security;
alter table business_memory enable row level security;
alter table business_integrations enable row level security;

drop policy if exists "app read projects" on projects;
drop policy if exists "app write projects" on projects;
drop policy if exists "app read business kpis" on business_kpis;
drop policy if exists "app write business kpis" on business_kpis;
drop policy if exists "app read business alerts" on business_alerts;
drop policy if exists "app write business alerts" on business_alerts;
drop policy if exists "app read business actions" on business_actions;
drop policy if exists "app write business actions" on business_actions;
drop policy if exists "app read business memory" on business_memory;
drop policy if exists "app write business memory" on business_memory;
drop policy if exists "app read business integrations" on business_integrations;
drop policy if exists "app write business integrations" on business_integrations;

create policy "app read projects" on projects for select to anon, authenticated using (true);
create policy "app write projects" on projects for insert to anon, authenticated with check (length(name) > 0);
create policy "app read business kpis" on business_kpis for select to anon, authenticated using (true);
create policy "app write business kpis" on business_kpis for insert to anon, authenticated with check (length(name) > 0);
create policy "app read business alerts" on business_alerts for select to anon, authenticated using (true);
create policy "app write business alerts" on business_alerts for insert to anon, authenticated with check (length(title) > 0);
create policy "app read business actions" on business_actions for select to anon, authenticated using (true);
create policy "app write business actions" on business_actions for insert to anon, authenticated with check (length(title) > 0);
create policy "app read business memory" on business_memory for select to anon, authenticated using (true);
create policy "app write business memory" on business_memory for insert to anon, authenticated with check (length(title) > 0);
create policy "app read business integrations" on business_integrations for select to anon, authenticated using (true);
create policy "app write business integrations" on business_integrations for insert to anon, authenticated with check (length(id) > 0);

grant select, insert on projects to anon, authenticated, service_role;
grant select, insert, update on tasks to anon, authenticated, service_role;
grant select, insert, update on approvals to anon, authenticated, service_role;
grant select, insert, update on business_kpis to anon, authenticated, service_role;
grant select, insert, update on business_alerts to anon, authenticated, service_role;
grant select, insert, update on business_actions to anon, authenticated, service_role;
grant select, insert on business_memory to anon, authenticated, service_role;
grant select, insert, update on business_integrations to anon, authenticated, service_role;
