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
  blockers text,
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
