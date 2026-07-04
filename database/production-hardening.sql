-- ============================================================================
-- Production hardening override
-- Run this after any legacy database/*.sql scripts if they were already applied.
-- It removes public anon/authenticated write/read policies from sensitive company
-- tables. Server routes should use SUPABASE_SERVICE_ROLE_KEY only.
-- ============================================================================

-- Legacy/demo policies that must not exist in production.
drop policy if exists "app read company logs" on company_logs;
drop policy if exists "app write company logs" on company_logs;
drop policy if exists "app read transactions" on transactions;
drop policy if exists "app write transactions" on transactions;
drop policy if exists "app read financial decisions" on financial_decisions;
drop policy if exists "app write financial decisions" on financial_decisions;
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

-- Add action queue columns if the legacy schema was applied first.
alter table business_actions add column if not exists result jsonb;
alter table business_actions add column if not exists error text;
alter table business_actions add column if not exists attempts integer not null default 0;
alter table business_actions add column if not exists last_attempt_at timestamptz;
alter table business_actions add column if not exists updated_at timestamptz default now();

-- RLS stays enabled; no public policies are created here.
alter table company_logs enable row level security;
alter table transactions enable row level security;
alter table financial_decisions enable row level security;
alter table business_kpis enable row level security;
alter table business_alerts enable row level security;
alter table business_actions enable row level security;
alter table business_memory enable row level security;
