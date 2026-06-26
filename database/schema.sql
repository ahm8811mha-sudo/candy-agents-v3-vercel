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

create table if not exists strategies (
  id text primary key,
  name text not null,
  budget numeric not null default 0,
  risk_profile text not null default 'MEDIUM',
  goals text not null,
  market text,
  status text not null default 'ACTIVE',
  created_at timestamptz default now()
);

create table if not exists market_reports (
  id text primary key,
  strategy_id text references strategies(id) on delete cascade,
  agent_id text,
  market_name text not null,
  summary text not null,
  trend_score int,
  demand_score int,
  competition_score int,
  risk_score int,
  created_at timestamptz default now()
);

create table if not exists opportunities (
  id text primary key,
  strategy_id text references strategies(id) on delete cascade,
  market_report_id text references market_reports(id) on delete set null,
  title text not null,
  description text not null,
  category text not null,
  estimated_cost numeric not null default 0,
  expected_revenue numeric not null default 0,
  expected_roi numeric not null default 0,
  risk_level text not null default 'MEDIUM',
  status text not null default 'NEW',
  created_at timestamptz default now()
);

create table if not exists decisions (
  id text primary key,
  opportunity_id text references opportunities(id) on delete set null,
  recommendation text not null,
  rationale text not null,
  decision_status text not null default 'PENDING',
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists financial_transactions (
  id text primary key,
  opportunity_id text references opportunities(id) on delete set null,
  type text not null,
  amount numeric not null,
  description text not null,
  status text not null default 'PENDING',
  created_at timestamptz default now()
);

create table if not exists freelancer_assignments (
  id text primary key,
  opportunity_id text references opportunities(id) on delete set null,
  task_id text references tasks(id) on delete set null,
  role_needed text not null,
  brief text not null,
  budget numeric not null default 0,
  status text not null default 'DRAFT',
  created_at timestamptz default now()
);

create index if not exists idx_market_reports_strategy_id on market_reports(strategy_id);
create index if not exists idx_opportunities_strategy_id on opportunities(strategy_id);
create index if not exists idx_decisions_opportunity_id on decisions(opportunity_id);
create index if not exists idx_financial_transactions_opportunity_id on financial_transactions(opportunity_id);
create index if not exists idx_freelancer_assignments_opportunity_id on freelancer_assignments(opportunity_id);

alter table strategies enable row level security;
alter table market_reports enable row level security;
alter table opportunities enable row level security;
alter table decisions enable row level security;
alter table financial_transactions enable row level security;
alter table freelancer_assignments enable row level security;

drop policy if exists "app read strategies" on strategies;
drop policy if exists "app write strategies" on strategies;
drop policy if exists "app read market reports" on market_reports;
drop policy if exists "app write market reports" on market_reports;
drop policy if exists "app read opportunities" on opportunities;
drop policy if exists "app write opportunities" on opportunities;
drop policy if exists "app read decisions" on decisions;
drop policy if exists "app write decisions" on decisions;
drop policy if exists "app read financial transactions" on financial_transactions;
drop policy if exists "app write financial transactions" on financial_transactions;
drop policy if exists "app read freelancer assignments" on freelancer_assignments;
drop policy if exists "app write freelancer assignments" on freelancer_assignments;

create policy "app read strategies" on strategies for select to anon, authenticated using (true);
create policy "app write strategies" on strategies for insert to anon, authenticated with check (length(name) > 0);
create policy "app read market reports" on market_reports for select to anon, authenticated using (true);
create policy "app write market reports" on market_reports for insert to anon, authenticated with check (length(market_name) > 0);
create policy "app read opportunities" on opportunities for select to anon, authenticated using (true);
create policy "app write opportunities" on opportunities for insert to anon, authenticated with check (length(title) > 0);
create policy "app read decisions" on decisions for select to anon, authenticated using (true);
create policy "app write decisions" on decisions for insert to anon, authenticated with check (length(recommendation) > 0);
create policy "app read financial transactions" on financial_transactions for select to anon, authenticated using (true);
create policy "app write financial transactions" on financial_transactions for insert to anon, authenticated with check (amount >= 0 and length(description) > 0);
create policy "app read freelancer assignments" on freelancer_assignments for select to anon, authenticated using (true);
create policy "app write freelancer assignments" on freelancer_assignments for insert to anon, authenticated with check (length(role_needed) > 0);

grant select, insert on strategies to anon, authenticated, service_role;
grant select, insert on market_reports to anon, authenticated, service_role;
grant select, insert on opportunities to anon, authenticated, service_role;
grant select, insert on decisions to anon, authenticated, service_role;
grant select, insert on financial_transactions to anon, authenticated, service_role;
grant select, insert on freelancer_assignments to anon, authenticated, service_role;

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

create table if not exists accounting_accounts (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  type text not null check (type in ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
  normal_balance text not null check (normal_balance in ('DEBIT', 'CREDIT')),
  is_system boolean default false,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists accounting_journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_number text unique not null default ('JE-' || extract(epoch from now())::bigint::text),
  entry_date date not null default current_date,
  memo text,
  source text default 'manual',
  status text not null default 'POSTED' check (status in ('DRAFT', 'POSTED', 'VOID')),
  created_at timestamptz default now()
);

create table if not exists accounting_journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references accounting_journal_entries(id) on delete cascade,
  account_id uuid references accounting_accounts(id) on delete restrict,
  memo text,
  debit numeric not null default 0,
  credit numeric not null default 0,
  created_at timestamptz default now(),
  check (debit >= 0 and credit >= 0 and debit <> credit)
);

create table if not exists accounting_contacts (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('CUSTOMER', 'VENDOR')),
  name text not null,
  email text,
  phone text,
  tax_number text,
  created_at timestamptz default now()
);

create table if not exists accounting_invoices (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references accounting_contacts(id) on delete set null,
  invoice_type text not null check (invoice_type in ('SALES', 'PURCHASE')),
  status text not null default 'DRAFT',
  issue_date date not null default current_date,
  due_date date,
  subtotal numeric not null default 0,
  tax numeric not null default 0,
  total numeric not null default 0,
  paid numeric not null default 0,
  notes text,
  created_at timestamptz default now()
);

create table if not exists accounting_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider text,
  currency text not null default 'SAR',
  balance numeric not null default 0,
  status text not null default 'ACTIVE',
  created_at timestamptz default now()
);

create table if not exists accounting_bank_transactions (
  id uuid primary key default gen_random_uuid(),
  bank_account_id uuid references accounting_bank_accounts(id) on delete cascade,
  transaction_date date not null default current_date,
  description text not null,
  amount numeric not null,
  matched_entry_id uuid references accounting_journal_entries(id) on delete set null,
  status text not null default 'UNMATCHED',
  created_at timestamptz default now()
);

create table if not exists ceo_office_items (
  id text primary key,
  item_type text not null,
  title text not null,
  owner_role text not null,
  status text not null default 'PENDING',
  priority text not null default 'MEDIUM',
  cadence text,
  due_at timestamptz,
  notes text,
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists marketing_channels (
  id text primary key,
  name text not null,
  funnel_stage text not null,
  status text not null default 'READY_FOR_CONNECTION',
  config jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  product_name text,
  target_audience text,
  offer text,
  channel_id text references marketing_channels(id) on delete set null,
  budget numeric not null default 0,
  status text not null default 'DRAFT',
  kpis jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists opportunity_radar_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'MANUAL',
  status text not null default 'PROPOSED',
  signal_summary text not null,
  request_text text,
  recommended_opportunity jsonb not null default '{}',
  allocated_budget numeric not null default 0,
  opportunity_window_days integer not null default 0,
  execution_duration_days integer not null default 0,
  finance_review jsonb not null default '{}',
  marketing_review jsonb not null default '{}',
  ceo_decision jsonb not null default '{}',
  cfo_required boolean default true,
  ceo_required boolean default false,
  created_at timestamptz default now()
);

create table if not exists company_strategy (
  id text primary key,
  focus text not null,
  investment_thesis text not null,
  capital_rules jsonb default '{}',
  target_markets text[] default '{}',
  updated_at timestamptz default now()
);

alter table opportunity_radar_runs add column if not exists request_text text;
alter table opportunity_radar_runs add column if not exists allocated_budget numeric not null default 0;
alter table opportunity_radar_runs add column if not exists opportunity_window_days integer not null default 0;
alter table opportunity_radar_runs add column if not exists execution_duration_days integer not null default 0;
alter table opportunity_radar_runs add column if not exists finance_review jsonb not null default '{}';
alter table opportunity_radar_runs add column if not exists marketing_review jsonb not null default '{}';
alter table opportunity_radar_runs add column if not exists ceo_decision jsonb not null default '{}';

create index if not exists idx_business_kpis_project_id on business_kpis(project_id);
create index if not exists idx_business_actions_project_id on business_actions(project_id);
create index if not exists idx_business_alerts_status on business_alerts(status, severity);
create index if not exists idx_accounting_journal_lines_entry_id on accounting_journal_lines(entry_id);
create index if not exists idx_accounting_invoices_contact_id on accounting_invoices(contact_id);
create index if not exists idx_ceo_office_items_status on ceo_office_items(status, priority);
create index if not exists idx_marketing_campaigns_status on marketing_campaigns(status);
create index if not exists idx_opportunity_radar_runs_created_at on opportunity_radar_runs(created_at desc);

alter table projects enable row level security;
alter table business_kpis enable row level security;
alter table business_alerts enable row level security;
alter table business_actions enable row level security;
alter table business_memory enable row level security;
alter table business_integrations enable row level security;
alter table accounting_accounts enable row level security;
alter table accounting_journal_entries enable row level security;
alter table accounting_journal_lines enable row level security;
alter table accounting_contacts enable row level security;
alter table accounting_invoices enable row level security;
alter table accounting_bank_accounts enable row level security;
alter table accounting_bank_transactions enable row level security;
alter table ceo_office_items enable row level security;
alter table marketing_channels enable row level security;
alter table marketing_campaigns enable row level security;
alter table opportunity_radar_runs enable row level security;
alter table company_strategy enable row level security;

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
drop policy if exists "app read accounting accounts" on accounting_accounts;
drop policy if exists "app write accounting accounts" on accounting_accounts;
drop policy if exists "app read accounting journal entries" on accounting_journal_entries;
drop policy if exists "app write accounting journal entries" on accounting_journal_entries;
drop policy if exists "app read accounting journal lines" on accounting_journal_lines;
drop policy if exists "app write accounting journal lines" on accounting_journal_lines;
drop policy if exists "app read accounting contacts" on accounting_contacts;
drop policy if exists "app write accounting contacts" on accounting_contacts;
drop policy if exists "app read accounting invoices" on accounting_invoices;
drop policy if exists "app write accounting invoices" on accounting_invoices;
drop policy if exists "app read accounting bank accounts" on accounting_bank_accounts;
drop policy if exists "app write accounting bank accounts" on accounting_bank_accounts;
drop policy if exists "app read accounting bank transactions" on accounting_bank_transactions;
drop policy if exists "app write accounting bank transactions" on accounting_bank_transactions;
drop policy if exists "app read ceo office items" on ceo_office_items;
drop policy if exists "app write ceo office items" on ceo_office_items;
drop policy if exists "app update ceo office items" on ceo_office_items;
drop policy if exists "app read marketing channels" on marketing_channels;
drop policy if exists "app write marketing channels" on marketing_channels;
drop policy if exists "app read marketing campaigns" on marketing_campaigns;
drop policy if exists "app write marketing campaigns" on marketing_campaigns;
drop policy if exists "app read opportunity radar runs" on opportunity_radar_runs;
drop policy if exists "app write opportunity radar runs" on opportunity_radar_runs;
drop policy if exists "app read company strategy" on company_strategy;
drop policy if exists "app write company strategy" on company_strategy;

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
create policy "app read accounting accounts" on accounting_accounts for select to anon, authenticated using (true);
create policy "app write accounting accounts" on accounting_accounts for insert to anon, authenticated with check (length(code) > 0);
create policy "app read accounting journal entries" on accounting_journal_entries for select to anon, authenticated using (true);
create policy "app write accounting journal entries" on accounting_journal_entries for insert to anon, authenticated with check (true);
create policy "app read accounting journal lines" on accounting_journal_lines for select to anon, authenticated using (true);
create policy "app write accounting journal lines" on accounting_journal_lines for insert to anon, authenticated with check (debit >= 0 and credit >= 0);
create policy "app read accounting contacts" on accounting_contacts for select to anon, authenticated using (true);
create policy "app write accounting contacts" on accounting_contacts for insert to anon, authenticated with check (length(name) > 0);
create policy "app read accounting invoices" on accounting_invoices for select to anon, authenticated using (true);
create policy "app write accounting invoices" on accounting_invoices for insert to anon, authenticated with check (total >= 0);
create policy "app read accounting bank accounts" on accounting_bank_accounts for select to anon, authenticated using (true);
create policy "app write accounting bank accounts" on accounting_bank_accounts for insert to anon, authenticated with check (length(name) > 0);
create policy "app read accounting bank transactions" on accounting_bank_transactions for select to anon, authenticated using (true);
create policy "app write accounting bank transactions" on accounting_bank_transactions for insert to anon, authenticated with check (length(description) > 0);
create policy "app read ceo office items" on ceo_office_items for select to anon, authenticated using (true);
create policy "app write ceo office items" on ceo_office_items for insert to anon, authenticated with check (length(title) > 0);
create policy "app update ceo office items" on ceo_office_items for update to anon, authenticated using (true) with check (length(title) > 0);
create policy "app read marketing channels" on marketing_channels for select to anon, authenticated using (true);
create policy "app write marketing channels" on marketing_channels for insert to anon, authenticated with check (length(name) > 0);
create policy "app read marketing campaigns" on marketing_campaigns for select to anon, authenticated using (true);
create policy "app write marketing campaigns" on marketing_campaigns for insert to anon, authenticated with check (length(name) > 0);
create policy "app read opportunity radar runs" on opportunity_radar_runs for select to anon, authenticated using (true);
create policy "app write opportunity radar runs" on opportunity_radar_runs for insert to anon, authenticated with check (length(signal_summary) > 0);
create policy "app read company strategy" on company_strategy for select to anon, authenticated using (true);
create policy "app write company strategy" on company_strategy for insert to anon, authenticated with check (length(id) > 0);

grant select, insert on projects to anon, authenticated, service_role;
grant select, insert, update on tasks to anon, authenticated, service_role;
grant select, insert, update on approvals to anon, authenticated, service_role;
grant select, insert, update on business_kpis to anon, authenticated, service_role;
grant select, insert, update on business_alerts to anon, authenticated, service_role;
grant select, insert, update on business_actions to anon, authenticated, service_role;
grant select, insert on business_memory to anon, authenticated, service_role;
grant select, insert, update on business_integrations to anon, authenticated, service_role;
grant select, insert, update on accounting_accounts to anon, authenticated, service_role;
grant select, insert, update on accounting_journal_entries to anon, authenticated, service_role;
grant select, insert, update on accounting_journal_lines to anon, authenticated, service_role;
grant select, insert, update on accounting_contacts to anon, authenticated, service_role;
grant select, insert, update on accounting_invoices to anon, authenticated, service_role;
grant select, insert, update on accounting_bank_accounts to anon, authenticated, service_role;
grant select, insert, update on accounting_bank_transactions to anon, authenticated, service_role;
grant select, insert, update on ceo_office_items to anon, authenticated, service_role;
grant select, insert, update on marketing_channels to anon, authenticated, service_role;
grant select, insert, update on marketing_campaigns to anon, authenticated, service_role;
grant select, insert, update on opportunity_radar_runs to anon, authenticated, service_role;
grant select, insert, update on company_strategy to anon, authenticated, service_role;

create table if not exists governance_roles (
  id text primary key,
  name text not null,
  description text,
  permissions jsonb default '{}',
  spend_limit numeric not null default 0,
  approval_limit numeric not null default 0,
  created_at timestamptz default now()
);

create table if not exists approval_policies (
  id text primary key,
  rule_name text not null,
  min_amount numeric not null default 0,
  max_amount numeric,
  risk_level text not null default 'ANY',
  required_role text not null,
  auto_approve boolean default false,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists decision_audit_log (
  id uuid primary key default gen_random_uuid(),
  decision_type text not null,
  entity_type text,
  entity_id text,
  actor_role text not null default 'SYSTEM',
  action text not null,
  amount numeric not null default 0,
  risk_level text not null default 'LOW',
  approval_status text not null default 'NOT_REQUIRED',
  immutable_note text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists cost_centers (
  id text primary key,
  name text not null,
  owner_role text not null,
  monthly_budget numeric not null default 0,
  status text not null default 'ACTIVE',
  created_at timestamptz default now()
);

alter table accounting_journal_entries add column if not exists cost_center_id text references cost_centers(id) on delete set null;
alter table accounting_invoices add column if not exists tax_rate numeric not null default 0;
alter table accounting_invoices add column if not exists tax_invoice_number text;
alter table accounting_invoices add column if not exists cost_center_id text references cost_centers(id) on delete set null;
alter table marketing_campaigns add column if not exists cost_center_id text references cost_centers(id) on delete set null;
alter table marketing_campaigns add column if not exists product_id text;
alter table marketing_campaigns add column if not exists segment_id text;
alter table marketing_campaigns add column if not exists offer_id text;
alter table marketing_campaigns add column if not exists actual_spend numeric not null default 0;
alter table marketing_campaigns add column if not exists actual_revenue numeric not null default 0;
alter table marketing_campaigns add column if not exists ltv numeric not null default 0;

create table if not exists accounting_period_closes (
  id text primary key,
  period text unique not null,
  status text not null default 'CLOSED',
  revenue numeric not null default 0,
  expenses numeric not null default 0,
  net_income numeric not null default 0,
  closed_by_role text not null default 'CFO',
  report jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists cash_flow_forecasts (
  id uuid primary key default gen_random_uuid(),
  forecast_date date not null,
  scenario text not null default 'BASE',
  inflow numeric not null default 0,
  outflow numeric not null default 0,
  net_cash numeric not null default 0,
  source text not null default 'system',
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists executive_calendar_events (
  id text primary key,
  title text not null,
  event_type text not null default 'FOLLOW_UP',
  starts_at timestamptz not null,
  ends_at timestamptz,
  owner_role text not null default 'CEO Office',
  status text not null default 'SCHEDULED',
  linked_entity_type text,
  linked_entity_id text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists executive_meeting_minutes (
  id text primary key,
  title text not null,
  meeting_date date not null default current_date,
  attendees text[] default '{}',
  decisions text,
  action_items jsonb default '[]',
  linked_entity_type text,
  linked_entity_id text,
  created_at timestamptz default now()
);

create table if not exists executive_daily_briefs (
  id text primary key,
  brief_date date not null default current_date,
  brief_type text not null default 'MORNING',
  summary text not null,
  priorities jsonb default '[]',
  risks jsonb default '[]',
  approvals jsonb default '[]',
  created_at timestamptz default now()
);

create table if not exists marketing_products (
  id text primary key,
  name text not null,
  category text not null default 'commerce',
  unit_cost numeric not null default 0,
  target_price numeric not null default 0,
  gross_margin numeric not null default 0,
  status text not null default 'TESTING',
  created_at timestamptz default now()
);

create table if not exists marketing_segments (
  id text primary key,
  name text not null,
  persona text not null,
  pain_points text[] default '{}',
  channels text[] default '{}',
  created_at timestamptz default now()
);

create table if not exists marketing_offers (
  id text primary key,
  product_id text references marketing_products(id) on delete set null,
  name text not null,
  promise text not null,
  price numeric not null default 0,
  status text not null default 'DRAFT',
  created_at timestamptz default now()
);

create table if not exists marketing_ab_tests (
  id text primary key,
  campaign_id uuid references marketing_campaigns(id) on delete cascade,
  name text not null,
  variant_a text not null,
  variant_b text not null,
  metric text not null default 'CVR',
  status text not null default 'RUNNING',
  result jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists marketing_content_calendar (
  id text primary key,
  campaign_id uuid references marketing_campaigns(id) on delete set null,
  publish_date date not null,
  channel text not null,
  topic text not null,
  status text not null default 'PLANNED',
  owner_role text not null default 'Marketing Director',
  created_at timestamptz default now()
);

create table if not exists marketing_funnel_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references marketing_campaigns(id) on delete cascade,
  stage text not null,
  count numeric not null default 0,
  cost numeric not null default 0,
  revenue numeric not null default 0,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists opportunity_scores (
  id uuid primary key default gen_random_uuid(),
  radar_run_id uuid references opportunity_radar_runs(id) on delete cascade,
  opportunity_title text not null,
  profitability_score numeric not null default 0,
  risk_score numeric not null default 0,
  capacity_score numeric not null default 0,
  total_score numeric not null default 0,
  recommendation text not null,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists idx_cost_centers_status on cost_centers(status);
create index if not exists idx_decision_audit_log_created_at on decision_audit_log(created_at desc);
create index if not exists idx_accounting_period_closes_period on accounting_period_closes(period);
create index if not exists idx_executive_calendar_events_starts_at on executive_calendar_events(starts_at);
create index if not exists idx_marketing_products_status on marketing_products(status);
create index if not exists idx_marketing_funnel_events_campaign_id on marketing_funnel_events(campaign_id);

alter table governance_roles enable row level security;
alter table approval_policies enable row level security;
alter table decision_audit_log enable row level security;
alter table cost_centers enable row level security;
alter table accounting_period_closes enable row level security;
alter table cash_flow_forecasts enable row level security;
alter table executive_calendar_events enable row level security;
alter table executive_meeting_minutes enable row level security;
alter table executive_daily_briefs enable row level security;
alter table marketing_products enable row level security;
alter table marketing_segments enable row level security;
alter table marketing_offers enable row level security;
alter table marketing_ab_tests enable row level security;
alter table marketing_content_calendar enable row level security;
alter table marketing_funnel_events enable row level security;
alter table opportunity_scores enable row level security;

drop policy if exists "app read governance roles" on governance_roles;
drop policy if exists "app write governance roles" on governance_roles;
drop policy if exists "app read approval policies" on approval_policies;
drop policy if exists "app write approval policies" on approval_policies;
drop policy if exists "app read decision audit log" on decision_audit_log;
drop policy if exists "app write decision audit log" on decision_audit_log;
drop policy if exists "app read cost centers" on cost_centers;
drop policy if exists "app write cost centers" on cost_centers;
drop policy if exists "app read accounting period closes" on accounting_period_closes;
drop policy if exists "app write accounting period closes" on accounting_period_closes;
drop policy if exists "app read cash flow forecasts" on cash_flow_forecasts;
drop policy if exists "app write cash flow forecasts" on cash_flow_forecasts;
drop policy if exists "app read executive calendar events" on executive_calendar_events;
drop policy if exists "app write executive calendar events" on executive_calendar_events;
drop policy if exists "app read executive meeting minutes" on executive_meeting_minutes;
drop policy if exists "app write executive meeting minutes" on executive_meeting_minutes;
drop policy if exists "app read executive daily briefs" on executive_daily_briefs;
drop policy if exists "app write executive daily briefs" on executive_daily_briefs;
drop policy if exists "app read marketing products" on marketing_products;
drop policy if exists "app write marketing products" on marketing_products;
drop policy if exists "app read marketing segments" on marketing_segments;
drop policy if exists "app write marketing segments" on marketing_segments;
drop policy if exists "app read marketing offers" on marketing_offers;
drop policy if exists "app write marketing offers" on marketing_offers;
drop policy if exists "app read marketing ab tests" on marketing_ab_tests;
drop policy if exists "app write marketing ab tests" on marketing_ab_tests;
drop policy if exists "app read marketing content calendar" on marketing_content_calendar;
drop policy if exists "app write marketing content calendar" on marketing_content_calendar;
drop policy if exists "app read marketing funnel events" on marketing_funnel_events;
drop policy if exists "app write marketing funnel events" on marketing_funnel_events;
drop policy if exists "app read opportunity scores" on opportunity_scores;
drop policy if exists "app write opportunity scores" on opportunity_scores;

create policy "app read governance roles" on governance_roles for select to anon, authenticated using (true);
create policy "app write governance roles" on governance_roles for insert to anon, authenticated with check (length(id) > 0);
create policy "app read approval policies" on approval_policies for select to anon, authenticated using (true);
create policy "app write approval policies" on approval_policies for insert to anon, authenticated with check (length(id) > 0);
create policy "app read decision audit log" on decision_audit_log for select to anon, authenticated using (true);
create policy "app write decision audit log" on decision_audit_log for insert to anon, authenticated with check (length(action) > 0);
create policy "app read cost centers" on cost_centers for select to anon, authenticated using (true);
create policy "app write cost centers" on cost_centers for insert to anon, authenticated with check (length(name) > 0);
create policy "app read accounting period closes" on accounting_period_closes for select to anon, authenticated using (true);
create policy "app write accounting period closes" on accounting_period_closes for insert to anon, authenticated with check (length(period) > 0);
create policy "app read cash flow forecasts" on cash_flow_forecasts for select to anon, authenticated using (true);
create policy "app write cash flow forecasts" on cash_flow_forecasts for insert to anon, authenticated with check (true);
create policy "app read executive calendar events" on executive_calendar_events for select to anon, authenticated using (true);
create policy "app write executive calendar events" on executive_calendar_events for insert to anon, authenticated with check (length(title) > 0);
create policy "app read executive meeting minutes" on executive_meeting_minutes for select to anon, authenticated using (true);
create policy "app write executive meeting minutes" on executive_meeting_minutes for insert to anon, authenticated with check (length(title) > 0);
create policy "app read executive daily briefs" on executive_daily_briefs for select to anon, authenticated using (true);
create policy "app write executive daily briefs" on executive_daily_briefs for insert to anon, authenticated with check (length(summary) > 0);
create policy "app read marketing products" on marketing_products for select to anon, authenticated using (true);
create policy "app write marketing products" on marketing_products for insert to anon, authenticated with check (length(name) > 0);
create policy "app read marketing segments" on marketing_segments for select to anon, authenticated using (true);
create policy "app write marketing segments" on marketing_segments for insert to anon, authenticated with check (length(name) > 0);
create policy "app read marketing offers" on marketing_offers for select to anon, authenticated using (true);
create policy "app write marketing offers" on marketing_offers for insert to anon, authenticated with check (length(name) > 0);
create policy "app read marketing ab tests" on marketing_ab_tests for select to anon, authenticated using (true);
create policy "app write marketing ab tests" on marketing_ab_tests for insert to anon, authenticated with check (length(name) > 0);
create policy "app read marketing content calendar" on marketing_content_calendar for select to anon, authenticated using (true);
create policy "app write marketing content calendar" on marketing_content_calendar for insert to anon, authenticated with check (length(topic) > 0);
create policy "app read marketing funnel events" on marketing_funnel_events for select to anon, authenticated using (true);
create policy "app write marketing funnel events" on marketing_funnel_events for insert to anon, authenticated with check (length(stage) > 0);
create policy "app read opportunity scores" on opportunity_scores for select to anon, authenticated using (true);
create policy "app write opportunity scores" on opportunity_scores for insert to anon, authenticated with check (length(opportunity_title) > 0);

grant select, insert, update on governance_roles to anon, authenticated, service_role;
grant select, insert, update on approval_policies to anon, authenticated, service_role;
grant select, insert on decision_audit_log to anon, authenticated, service_role;
grant select, insert, update on cost_centers to anon, authenticated, service_role;
grant select, insert, update on accounting_period_closes to anon, authenticated, service_role;
grant select, insert, update on cash_flow_forecasts to anon, authenticated, service_role;
grant select, insert, update on executive_calendar_events to anon, authenticated, service_role;
grant select, insert, update on executive_meeting_minutes to anon, authenticated, service_role;
grant select, insert, update on executive_daily_briefs to anon, authenticated, service_role;
grant select, insert, update on marketing_products to anon, authenticated, service_role;
grant select, insert, update on marketing_segments to anon, authenticated, service_role;
grant select, insert, update on marketing_offers to anon, authenticated, service_role;
grant select, insert, update on marketing_ab_tests to anon, authenticated, service_role;
grant select, insert, update on marketing_content_calendar to anon, authenticated, service_role;
grant select, insert, update on marketing_funnel_events to anon, authenticated, service_role;
grant select, insert, update on opportunity_scores to anon, authenticated, service_role;

create table if not exists gov_document_types (
  id text primary key,
  name text not null,
  issuer text not null,
  official_url text,
  renewal_url text,
  required_fields text[] default '{}',
  automation_level text not null default 'PORTAL_PREPARATION',
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists gov_fee_sources (
  id uuid primary key default gen_random_uuid(),
  document_type text not null references gov_document_types(id) on delete cascade,
  issuer text not null,
  service_name text not null,
  official_url text not null,
  renewal_url text,
  fee_amount numeric,
  fee_currency text not null default 'SAR',
  fee_text text not null,
  source_confidence text not null default 'OFFICIAL_SOURCE',
  last_checked_at timestamptz,
  last_checked_status text,
  last_checked_excerpt text,
  created_at timestamptz default now(),
  unique(document_type, issuer, service_name)
);

create table if not exists gov_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null references gov_document_types(id) on delete restrict,
  title text not null,
  document_number text,
  issuer text,
  owner_name text,
  tax_number text,
  start_date date,
  expiry_date date,
  renewal_date date,
  city text,
  activity text,
  status text not null default 'NEEDS_REVIEW',
  official_url text,
  renewal_url text,
  fee_amount numeric,
  fee_currency text not null default 'SAR',
  fee_text text,
  extracted_data jsonb default '{}',
  missing_fields text[] default '{}',
  extraction_confidence numeric not null default 0,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists gov_document_files (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references gov_documents(id) on delete cascade,
  file_name text not null,
  mime_type text,
  file_size numeric not null default 0,
  file_payload text,
  text_payload text,
  created_at timestamptz default now()
);

create table if not exists gov_document_extractions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references gov_documents(id) on delete cascade,
  extraction_engine text not null,
  raw_text text,
  extracted_json jsonb default '{}',
  confidence numeric not null default 0,
  status text not null default 'EXTRACTED',
  created_at timestamptz default now()
);

create table if not exists gov_renewal_tasks (
  id text primary key,
  document_id uuid references gov_documents(id) on delete cascade,
  task_type text not null default 'RENEWAL_PREPARATION',
  title text not null,
  due_date date,
  priority text not null default 'MEDIUM',
  status text not null default 'OPEN',
  fee_amount numeric,
  fee_currency text not null default 'SAR',
  official_url text,
  renewal_url text,
  checklist jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_gov_documents_status on gov_documents(status);
create index if not exists idx_gov_documents_expiry_date on gov_documents(expiry_date);
create index if not exists idx_gov_documents_document_type on gov_documents(document_type);
create index if not exists idx_gov_renewal_tasks_due_date on gov_renewal_tasks(due_date);
create index if not exists idx_gov_fee_sources_document_type on gov_fee_sources(document_type);

alter table gov_document_types enable row level security;
alter table gov_fee_sources enable row level security;
alter table gov_documents enable row level security;
alter table gov_document_files enable row level security;
alter table gov_document_extractions enable row level security;
alter table gov_renewal_tasks enable row level security;

drop policy if exists "app read gov document types" on gov_document_types;
drop policy if exists "app write gov document types" on gov_document_types;
drop policy if exists "app read gov fee sources" on gov_fee_sources;
drop policy if exists "app write gov fee sources" on gov_fee_sources;
drop policy if exists "app update gov fee sources" on gov_fee_sources;
drop policy if exists "app read gov documents" on gov_documents;
drop policy if exists "app write gov documents" on gov_documents;
drop policy if exists "app update gov documents" on gov_documents;
drop policy if exists "app read gov document files" on gov_document_files;
drop policy if exists "app write gov document files" on gov_document_files;
drop policy if exists "app read gov document extractions" on gov_document_extractions;
drop policy if exists "app write gov document extractions" on gov_document_extractions;
drop policy if exists "app read gov renewal tasks" on gov_renewal_tasks;
drop policy if exists "app write gov renewal tasks" on gov_renewal_tasks;
drop policy if exists "app update gov renewal tasks" on gov_renewal_tasks;

create policy "app read gov document types" on gov_document_types for select to anon, authenticated using (true);
create policy "app write gov document types" on gov_document_types for insert to anon, authenticated with check (length(id) > 0);
create policy "app read gov fee sources" on gov_fee_sources for select to anon, authenticated using (true);
create policy "app write gov fee sources" on gov_fee_sources for insert to anon, authenticated with check (length(service_name) > 0);
create policy "app update gov fee sources" on gov_fee_sources for update to anon, authenticated using (true) with check (length(service_name) > 0);
create policy "app read gov documents" on gov_documents for select to anon, authenticated using (true);
create policy "app write gov documents" on gov_documents for insert to anon, authenticated with check (length(title) > 0);
create policy "app update gov documents" on gov_documents for update to anon, authenticated using (true) with check (length(title) > 0);
create policy "app read gov document files" on gov_document_files for select to anon, authenticated using (true);
create policy "app write gov document files" on gov_document_files for insert to anon, authenticated with check (length(file_name) > 0);
create policy "app read gov document extractions" on gov_document_extractions for select to anon, authenticated using (true);
create policy "app write gov document extractions" on gov_document_extractions for insert to anon, authenticated with check (length(extraction_engine) > 0);
create policy "app read gov renewal tasks" on gov_renewal_tasks for select to anon, authenticated using (true);
create policy "app write gov renewal tasks" on gov_renewal_tasks for insert to anon, authenticated with check (length(title) > 0);
create policy "app update gov renewal tasks" on gov_renewal_tasks for update to anon, authenticated using (true) with check (length(title) > 0);

grant select, insert, update on gov_document_types to anon, authenticated, service_role;
grant select, insert, update on gov_fee_sources to anon, authenticated, service_role;
grant select, insert, update on gov_documents to anon, authenticated, service_role;
grant select, insert on gov_document_files to anon, authenticated, service_role;
grant select, insert on gov_document_extractions to anon, authenticated, service_role;
grant select, insert, update on gov_renewal_tasks to anon, authenticated, service_role;

alter table gov_document_files add column if not exists storage_bucket text not null default 'government-documents';
alter table gov_document_files add column if not exists storage_path text;
alter table gov_document_files add column if not exists file_category text;
alter table gov_document_files add column if not exists version_no int not null default 1;
alter table gov_document_files add column if not exists is_current boolean not null default true;

create table if not exists gov_document_access_logs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references gov_documents(id) on delete cascade,
  file_id uuid references gov_document_files(id) on delete cascade,
  actor_role text not null default 'SYSTEM',
  action text not null,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists operational_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_key text unique not null,
  department text not null,
  severity text not null default 'MEDIUM',
  title text not null,
  message text not null,
  source_table text,
  source_id text,
  action_url text,
  due_date date,
  status text not null default 'OPEN',
  metadata jsonb default '{}',
  last_seen_at timestamptz default now(),
  resolved_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists crm_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  phone text,
  email text,
  source text not null default 'manual',
  interest text,
  estimated_value numeric not null default 0,
  status text not null default 'NEW',
  next_follow_up_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists crm_deals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references crm_leads(id) on delete set null,
  title text not null,
  stage text not null default 'DISCOVERY',
  value numeric not null default 0,
  probability numeric not null default 0,
  expected_close_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists crm_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references crm_leads(id) on delete cascade,
  deal_id uuid references crm_deals(id) on delete cascade,
  activity_type text not null default 'FOLLOW_UP',
  summary text not null,
  next_step text,
  due_at timestamptz,
  status text not null default 'OPEN',
  created_at timestamptz default now()
);

create table if not exists sales_quotes (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references crm_deals(id) on delete set null,
  quote_number text unique not null,
  customer_name text not null,
  total numeric not null default 0,
  status text not null default 'DRAFT',
  valid_until date,
  items jsonb default '[]',
  created_at timestamptz default now()
);

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'general',
  contact_name text,
  phone text,
  email text,
  rating numeric not null default 3,
  status text not null default 'ACTIVE',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists supplier_quotes (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references suppliers(id) on delete cascade,
  title text not null,
  total numeric not null default 0,
  status text not null default 'RECEIVED',
  items jsonb default '[]',
  created_at timestamptz default now()
);

create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references suppliers(id) on delete set null,
  po_number text unique not null,
  title text not null,
  status text not null default 'DRAFT',
  total numeric not null default 0,
  expected_delivery date,
  items jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  name text not null,
  category text not null default 'commerce',
  unit_cost numeric not null default 0,
  target_price numeric not null default 0,
  on_hand numeric not null default 0,
  reorder_point numeric not null default 0,
  status text not null default 'ACTIVE',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references inventory_items(id) on delete cascade,
  movement_type text not null default 'ADJUSTMENT',
  quantity numeric not null default 0,
  unit_cost numeric not null default 0,
  note text,
  created_at timestamptz default now()
);

create table if not exists accounting_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references accounting_invoices(id) on delete cascade,
  amount numeric not null default 0,
  payment_date date not null default current_date,
  method text not null default 'manual',
  reference text,
  created_at timestamptz default now()
);

create table if not exists bank_reconciliation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  match_text text not null,
  account_code text not null,
  active boolean default true,
  created_at timestamptz default now()
);

create index if not exists idx_operational_alerts_status on operational_alerts(status, severity);
create index if not exists idx_crm_leads_status on crm_leads(status);
create index if not exists idx_crm_deals_stage on crm_deals(stage);
create index if not exists idx_inventory_items_reorder on inventory_items(on_hand, reorder_point);
create index if not exists idx_purchase_orders_status on purchase_orders(status);
create index if not exists idx_gov_document_access_logs_created_at on gov_document_access_logs(created_at desc);

alter table gov_document_access_logs enable row level security;
alter table operational_alerts enable row level security;
alter table crm_leads enable row level security;
alter table crm_deals enable row level security;
alter table crm_activities enable row level security;
alter table sales_quotes enable row level security;
alter table suppliers enable row level security;
alter table supplier_quotes enable row level security;
alter table purchase_orders enable row level security;
alter table inventory_items enable row level security;
alter table inventory_movements enable row level security;
alter table accounting_payments enable row level security;
alter table bank_reconciliation_rules enable row level security;

drop policy if exists "app read gov document access logs" on gov_document_access_logs;
drop policy if exists "app write gov document access logs" on gov_document_access_logs;
drop policy if exists "app read operational alerts" on operational_alerts;
drop policy if exists "app write operational alerts" on operational_alerts;
drop policy if exists "app update operational alerts" on operational_alerts;
drop policy if exists "app read crm leads" on crm_leads;
drop policy if exists "app write crm leads" on crm_leads;
drop policy if exists "app update crm leads" on crm_leads;
drop policy if exists "app read crm deals" on crm_deals;
drop policy if exists "app write crm deals" on crm_deals;
drop policy if exists "app update crm deals" on crm_deals;
drop policy if exists "app read crm activities" on crm_activities;
drop policy if exists "app write crm activities" on crm_activities;
drop policy if exists "app read sales quotes" on sales_quotes;
drop policy if exists "app write sales quotes" on sales_quotes;
drop policy if exists "app read suppliers" on suppliers;
drop policy if exists "app write suppliers" on suppliers;
drop policy if exists "app update suppliers" on suppliers;
drop policy if exists "app read supplier quotes" on supplier_quotes;
drop policy if exists "app write supplier quotes" on supplier_quotes;
drop policy if exists "app read purchase orders" on purchase_orders;
drop policy if exists "app write purchase orders" on purchase_orders;
drop policy if exists "app update purchase orders" on purchase_orders;
drop policy if exists "app read inventory items" on inventory_items;
drop policy if exists "app write inventory items" on inventory_items;
drop policy if exists "app update inventory items" on inventory_items;
drop policy if exists "app read inventory movements" on inventory_movements;
drop policy if exists "app write inventory movements" on inventory_movements;
drop policy if exists "app read accounting payments" on accounting_payments;
drop policy if exists "app write accounting payments" on accounting_payments;
drop policy if exists "app read bank reconciliation rules" on bank_reconciliation_rules;
drop policy if exists "app write bank reconciliation rules" on bank_reconciliation_rules;

create policy "app read gov document access logs" on gov_document_access_logs for select to anon, authenticated using (true);
create policy "app write gov document access logs" on gov_document_access_logs for insert to anon, authenticated with check (length(action) > 0);
create policy "app read operational alerts" on operational_alerts for select to anon, authenticated using (true);
create policy "app write operational alerts" on operational_alerts for insert to anon, authenticated with check (length(title) > 0);
create policy "app update operational alerts" on operational_alerts for update to anon, authenticated using (true) with check (length(title) > 0);
create policy "app read crm leads" on crm_leads for select to anon, authenticated using (true);
create policy "app write crm leads" on crm_leads for insert to anon, authenticated with check (length(name) > 0);
create policy "app update crm leads" on crm_leads for update to anon, authenticated using (true) with check (length(name) > 0);
create policy "app read crm deals" on crm_deals for select to anon, authenticated using (true);
create policy "app write crm deals" on crm_deals for insert to anon, authenticated with check (length(title) > 0);
create policy "app update crm deals" on crm_deals for update to anon, authenticated using (true) with check (length(title) > 0);
create policy "app read crm activities" on crm_activities for select to anon, authenticated using (true);
create policy "app write crm activities" on crm_activities for insert to anon, authenticated with check (length(summary) > 0);
create policy "app read sales quotes" on sales_quotes for select to anon, authenticated using (true);
create policy "app write sales quotes" on sales_quotes for insert to anon, authenticated with check (length(customer_name) > 0);
create policy "app read suppliers" on suppliers for select to anon, authenticated using (true);
create policy "app write suppliers" on suppliers for insert to anon, authenticated with check (length(name) > 0);
create policy "app update suppliers" on suppliers for update to anon, authenticated using (true) with check (length(name) > 0);
create policy "app read supplier quotes" on supplier_quotes for select to anon, authenticated using (true);
create policy "app write supplier quotes" on supplier_quotes for insert to anon, authenticated with check (length(title) > 0);
create policy "app read purchase orders" on purchase_orders for select to anon, authenticated using (true);
create policy "app write purchase orders" on purchase_orders for insert to anon, authenticated with check (length(title) > 0);
create policy "app update purchase orders" on purchase_orders for update to anon, authenticated using (true) with check (length(title) > 0);
create policy "app read inventory items" on inventory_items for select to anon, authenticated using (true);
create policy "app write inventory items" on inventory_items for insert to anon, authenticated with check (length(sku) > 0 and length(name) > 0);
create policy "app update inventory items" on inventory_items for update to anon, authenticated using (true) with check (length(sku) > 0 and length(name) > 0);
create policy "app read inventory movements" on inventory_movements for select to anon, authenticated using (true);
create policy "app write inventory movements" on inventory_movements for insert to anon, authenticated with check (quantity <> 0);
create policy "app read accounting payments" on accounting_payments for select to anon, authenticated using (true);
create policy "app write accounting payments" on accounting_payments for insert to anon, authenticated with check (amount > 0);
create policy "app read bank reconciliation rules" on bank_reconciliation_rules for select to anon, authenticated using (true);
create policy "app write bank reconciliation rules" on bank_reconciliation_rules for insert to anon, authenticated with check (length(name) > 0);

grant select, insert on gov_document_access_logs to anon, authenticated, service_role;
grant select, insert, update on operational_alerts to anon, authenticated, service_role;
grant select, insert, update on crm_leads to anon, authenticated, service_role;
grant select, insert, update on crm_deals to anon, authenticated, service_role;
grant select, insert on crm_activities to anon, authenticated, service_role;
grant select, insert on sales_quotes to anon, authenticated, service_role;
grant select, insert, update on suppliers to anon, authenticated, service_role;
grant select, insert on supplier_quotes to anon, authenticated, service_role;
grant select, insert, update on purchase_orders to anon, authenticated, service_role;
grant select, insert, update on inventory_items to anon, authenticated, service_role;
grant select, insert on inventory_movements to anon, authenticated, service_role;
grant select, insert on accounting_payments to anon, authenticated, service_role;
grant select, insert, update on bank_reconciliation_rules to anon, authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'government-documents',
  'government-documents',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain', 'application/json', 'text/csv']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "app read government document objects" on storage.objects;
drop policy if exists "app write government document objects" on storage.objects;
drop policy if exists "app update government document objects" on storage.objects;

create policy "app read government document objects" on storage.objects
for select to anon, authenticated
using (bucket_id = 'government-documents');

create policy "app write government document objects" on storage.objects
for insert to anon, authenticated
with check (bucket_id = 'government-documents');

create policy "app update government document objects" on storage.objects
for update to anon, authenticated
using (bucket_id = 'government-documents')
with check (bucket_id = 'government-documents');
