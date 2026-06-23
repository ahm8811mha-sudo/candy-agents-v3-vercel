create extension if not exists "pgcrypto";

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  manager_id uuid,
  created_at timestamptz default now()
);

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete cascade,
  full_name text not null,
  email text unique not null,
  phone text,
  role text not null check (role in ('CEO', 'MANAGER', 'EMPLOYEE', 'ADMIN')),
  department_id uuid references departments(id),
  manager_id uuid references employees(id),
  job_title text,
  status text not null default 'ACTIVE',
  joined_at date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'TODO' check (status in ('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'BLOCKED')),
  priority text not null default 'MEDIUM' check (priority in ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  assigned_to uuid references employees(id),
  created_by uuid references employees(id),
  department_id uuid references departments(id),
  due_date timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  employee_id uuid references employees(id),
  comment text not null,
  created_at timestamptz default now()
);

create table if not exists daily_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id),
  log_date date not null,
  summary text not null,
  blockers text,
  progress_score int check (progress_score between 1 and 10),
  status text not null default 'SUBMITTED' check (status in ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED')),
  reviewed_by uuid references employees(id),
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  requested_by uuid references employees(id),
  approver_id uuid references employees(id),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  notes text,
  created_at timestamptz default now(),
  decided_at timestamptz
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id),
  title text not null,
  message text not null,
  type text not null default 'INFO' check (type in ('INFO', 'TASK', 'APPROVAL', 'WARNING', 'SYSTEM')),
  read_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references employees(id),
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists external_sync_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  entity_type text not null,
  entity_id uuid,
  status text not null check (status in ('SUCCESS', 'FAILED')),
  error_message text,
  created_at timestamptz default now()
);

create index if not exists idx_tasks_assigned_to on tasks(assigned_to);
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_daily_logs_employee_date on daily_logs(employee_id, log_date);
create index if not exists idx_activity_logs_created_at on activity_logs(created_at desc);
create index if not exists idx_notifications_employee on notifications(employee_id, read_at);
