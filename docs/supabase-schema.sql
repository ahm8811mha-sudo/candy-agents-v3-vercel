-- ============================================================================
--  شركة النجمة الذهبية — مخطط قاعدة بيانات Supabase الإنتاجي
--  Golden Star Enterprise OS — production durable persistence schema.
--
--  كيف تشغّله:
--    Supabase Dashboard → SQL Editor → New query → الصق هذا الملف → Run.
--  آمن لإعادة التشغيل (create/alter-if-not-exists).
--
--  بعد التشغيل، أضف في Vercel → Settings → Environment Variables:
--    NEXT_PUBLIC_SUPABASE_URL   = https://<project-ref>.supabase.co
--    SUPABASE_SECRET_KEY        = <secret key من Project Settings → API Keys>
--    AUTH_ENABLED               = true
--    API_SECRET_KEY             = <strong secret>
--
--  لا تلصق المفاتيح في المحادثة أو في المستودع — فقط في متغيّرات بيئة Vercel.
--
--  ملاحظة أمان: يكتب النظام عبر مفتاح service_role من الخادم فقط، لذا يبقى
--  RLS مفعّلاً بدون سياسات عامة — لا وصول من المتصفح إلى هذه الجداول.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Audit / Governance
-- ---------------------------------------------------------------------------

create table if not exists audit_log (
  id          text primary key,
  actor       text not null,
  role        text,
  action      text not null,
  entity_type text,
  entity_id   text,
  detail      text,
  tier        text,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_created_at_idx on audit_log (created_at desc);

create table if not exists company_approvals (
  id              text primary key,
  type            text not null,
  title           text not null,
  detail          text,
  amount          numeric,
  requested_role  text,
  status          text not null default 'PENDING',
  created_at      timestamptz not null,
  decided_at      timestamptz,
  decided_by      text,
  note            text,
  metadata        jsonb default '{}'
);
create index if not exists company_approvals_status_idx on company_approvals (status, created_at desc);

create table if not exists company_decisions (
  id           text primary key,
  source_type  text not null,
  source_id    text not null,
  title        text,
  action       text not null,
  note         text,
  forwarded_to text,
  decided_by   text,
  created_at   timestamptz not null
);
create index if not exists company_decisions_source_idx on company_decisions (source_type, created_at desc);

-- Legacy/project approval table used by lib/companyExecutionSystem.ts.
create table if not exists approvals (
  id          text primary key,
  entity_type text not null,
  entity_id   text not null,
  status      text not null default 'PENDING',
  notes       text,
  created_at  timestamptz default now(),
  decided_at  timestamptz
);
create index if not exists approvals_status_idx on approvals (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Ideas / Execution Loop
-- ---------------------------------------------------------------------------

create table if not exists company_ideas (
  id               text primary key,
  title            text not null,
  hypothesis       text,
  budget_sar       numeric,
  horizon_days     integer,
  source           text,
  proposed_by      text,
  proposed_by_name text,
  status           text,
  tier             text,
  tier_label       text,
  recommendations  jsonb default '{}',
  aggregate        jsonb default '{}',
  study_mode       text,
  approval_id      text,
  day_key          text,
  created_at       timestamptz not null
);
create index if not exists company_ideas_created_at_idx on company_ideas (created_at desc);
create index if not exists company_ideas_day_key_idx on company_ideas (source, day_key);

create table if not exists projects (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  request             text,
  status              text not null default 'ACTIVE',
  budget              numeric default 0,
  approved_budget     numeric default 0,
  health_score        int default 0 check (health_score between 0 and 100),
  risk_level          text default 'LOW',
  approval_status     text default 'NOT_REQUIRED',
  strategic_direction text,
  financial_snapshot  jsonb default '{}',
  next_review_at      timestamptz,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);
create index if not exists projects_created_at_idx on projects (created_at desc);
create index if not exists projects_status_idx on projects (status, approval_status);

create table if not exists tasks (
  id               text primary key,
  project_id       uuid references projects(id) on delete cascade,
  title            text not null,
  description      text,
  content          text,
  status           text not null default 'TODO',
  priority         text not null default 'MEDIUM',
  due_date         timestamptz,
  progress_percent int not null default 0 check (progress_percent between 0 and 100),
  owner_role       text,
  kpi_name         text,
  kpi_target       numeric,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
create index if not exists tasks_project_idx on tasks (project_id, status);
create index if not exists tasks_created_at_idx on tasks (created_at desc);

create table if not exists business_kpis (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  name       text not null,
  target     numeric not null default 0,
  current    numeric not null default 0,
  unit       text default '',
  status     text not null default 'WATCH',
  due_date   timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists business_kpis_project_idx on business_kpis (project_id, status);

create table if not exists business_alerts (
  id         uuid primary key default gen_random_uuid(),
  severity   text not null default 'MEDIUM',
  title      text not null,
  message    text not null,
  source     text not null default 'rules_engine',
  status     text not null default 'OPEN',
  metadata   jsonb default '{}',
  created_at timestamptz default now()
);
create index if not exists business_alerts_created_at_idx on business_alerts (created_at desc);

create table if not exists business_actions (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid references projects(id) on delete set null,
  action_type       text not null,
  title             text not null,
  description       text,
  status            text not null default 'QUEUED',
  execution_mode    text not null default 'INTERNAL',
  provider          text,
  requires_approval boolean default false,
  approval_status   text default 'NOT_REQUIRED',
  payload           jsonb default '{}',
  result            jsonb,
  error             text,
  attempts          integer not null default 0,
  last_attempt_at   timestamptz,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);
create index if not exists business_actions_status_idx on business_actions (status, created_at desc);
create index if not exists business_actions_project_idx on business_actions (project_id, status);

create table if not exists business_memory (
  id               uuid primary key default gen_random_uuid(),
  event_type       text not null,
  title            text not null,
  summary          text,
  decision_quality text,
  metadata         jsonb default '{}',
  created_at       timestamptz default now()
);
create index if not exists business_memory_created_at_idx on business_memory (created_at desc);

-- ---------------------------------------------------------------------------
-- Finance / Ledger
-- ---------------------------------------------------------------------------

create table if not exists financial_decisions (
  id           uuid primary key default gen_random_uuid(),
  request      text not null,
  financials   jsonb default '{}',
  cfo_report   text,
  ceo_decision text,
  created_at   timestamptz default now()
);
create index if not exists financial_decisions_created_at_idx on financial_decisions (created_at desc);

create table if not exists ledger_entries (
  id          text primary key,
  date        timestamptz not null,
  description text,
  reference   text,
  lines       jsonb not null
);
create index if not exists ledger_entries_date_idx on ledger_entries (date desc);

create table if not exists zatca_invoices (
  invoice_number text primary key,
  issued_at      timestamptz not null,
  seller_name    text,
  vat_number     text,
  currency       text,
  net_amount     numeric,
  vat_amount     numeric,
  vat_rate       numeric,
  total_amount   numeric,
  reference      text,
  qr             text
);
create index if not exists zatca_invoices_issued_at_idx on zatca_invoices (issued_at desc);

create table if not exists sales_income (
  id            text primary key,
  amount        numeric,
  currency      text,
  order_count   integer,
  order_ids     jsonb default '[]',
  note          text,
  recognized_at timestamptz not null
);
create index if not exists sales_income_recognized_at_idx on sales_income (recognized_at desc);

create table if not exists sales_changes (
  id         text primary key,
  kind       text,
  target     text,
  detail     text,
  status     text,
  created_at timestamptz not null
);
create index if not exists sales_changes_created_at_idx on sales_changes (created_at desc);

-- ---------------------------------------------------------------------------
-- Safe migrations for existing installs
-- ---------------------------------------------------------------------------

alter table business_actions add column if not exists result jsonb;
alter table business_actions add column if not exists error text;
alter table business_actions add column if not exists attempts integer not null default 0;
alter table business_actions add column if not exists last_attempt_at timestamptz;
alter table business_actions add column if not exists updated_at timestamptz default now();
alter table projects add column if not exists updated_at timestamptz default now();
alter table tasks add column if not exists content text;
alter table tasks add column if not exists owner_role text;
alter table tasks add column if not exists kpi_name text;
alter table tasks add column if not exists kpi_target numeric;

-- ---------------------------------------------------------------------------
-- RLS hardening: enabled without public policies. Service role bypasses RLS.
-- ---------------------------------------------------------------------------

alter table audit_log         enable row level security;
alter table company_approvals enable row level security;
alter table company_decisions enable row level security;
alter table approvals         enable row level security;
alter table company_ideas     enable row level security;
alter table projects          enable row level security;
alter table tasks             enable row level security;
alter table business_kpis     enable row level security;
alter table business_alerts   enable row level security;
alter table business_actions  enable row level security;
alter table business_memory   enable row level security;
alter table financial_decisions enable row level security;
alter table ledger_entries    enable row level security;
alter table zatca_invoices    enable row level security;
alter table sales_income      enable row level security;
alter table sales_changes     enable row level security;

-- ---------------------------------------------------------------------------
-- Customizable agents (Roadmap #5) — owner renames/retitles/deactivates
-- ---------------------------------------------------------------------------

create table if not exists agent_overrides (
  agent_id   text primary key,
  name       text,
  title      text,
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table agent_overrides enable row level security;

NOTIFY pgrst, 'reload schema';
