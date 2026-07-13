-- Orvanta operational reliability foundation (waves 2-6)
-- Idempotent and safe to re-run after the core schema.

create extension if not exists pgcrypto;

create table if not exists public.system_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  dedupe_key text not null,
  severity text not null check (severity in ('INFO','WARNING','CRITICAL')),
  source text not null,
  title text not null,
  message text not null,
  entity_type text,
  entity_id text,
  status text not null default 'OPEN' check (status in ('OPEN','ACKNOWLEDGED','RESOLVED')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  acknowledged_at timestamptz,
  acknowledged_by text,
  resolved_at timestamptz,
  resolution_note text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists system_alerts_open_dedupe_idx
  on public.system_alerts (tenant_id, dedupe_key)
  where status in ('OPEN','ACKNOWLEDGED');
create index if not exists system_alerts_status_severity_idx
  on public.system_alerts (tenant_id, status, severity, last_seen_at desc);

create table if not exists public.dead_letter_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  source_type text not null,
  source_id text not null,
  operation text not null,
  payload jsonb not null default '{}',
  error_message text not null,
  attempts integer not null default 1,
  status text not null default 'OPEN' check (status in ('OPEN','RETRYING','RESOLVED','IGNORED')),
  next_retry_at timestamptz,
  last_attempt_at timestamptz,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, source_type, source_id)
);
create index if not exists dead_letter_jobs_open_idx
  on public.dead_letter_jobs (tenant_id, status, next_retry_at, created_at);

create table if not exists public.integration_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  integration text not null,
  operation text not null,
  idempotency_key text not null,
  request_hash text,
  attempt_number integer not null default 1,
  status text not null default 'STARTED' check (status in ('STARTED','SUCCEEDED','FAILED','RETRY','DEAD_LETTER','SKIPPED')),
  external_id text,
  external_url text,
  response_code integer,
  request_metadata jsonb not null default '{}',
  response_metadata jsonb not null default '{}',
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists integration_attempts_success_idempotency_idx
  on public.integration_attempts (tenant_id, integration, operation, idempotency_key)
  where status in ('SUCCEEDED','SKIPPED');
create index if not exists integration_attempts_retry_idx
  on public.integration_attempts (tenant_id, status, next_retry_at, created_at);

create table if not exists public.external_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  integration_attempt_id uuid references public.integration_attempts(id) on delete restrict,
  integration text not null,
  operation text not null,
  idempotency_key text not null,
  external_id text,
  external_url text,
  receipt_type text not null default 'API_RESPONSE',
  receipt jsonb not null default '{}',
  verified boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, integration, operation, idempotency_key)
);

create table if not exists public.capability_registry (
  capability_key text primary key,
  domain text not null,
  title text not null,
  status text not null check (status in ('LIVE','SANDBOX','HUMAN_CHECKPOINT','NOT_INTEGRATED','DISABLED')),
  evidence_required boolean not null default false,
  integration text,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.backup_verification_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('STARTED','SUCCEEDED','FAILED')),
  backup_reference text,
  restore_target text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer,
  verified_tables jsonb not null default '{}',
  error_message text,
  performed_by text,
  created_at timestamptz not null default now()
);

alter table if exists public.failed_writes add column if not exists claimed_at timestamptz;
alter table if exists public.failed_writes add column if not exists claimed_by text;
alter table if exists public.failed_writes add column if not exists last_attempt_at timestamptz;
alter table if exists public.failed_writes add column if not exists max_attempts integer not null default 5;

create or replace function public.orvanta_raise_system_alert(
  p_tenant_id text,
  p_dedupe_key text,
  p_severity text,
  p_source text,
  p_title text,
  p_message text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_severity not in ('INFO','WARNING','CRITICAL') then
    raise exception 'invalid alert severity';
  end if;

  select id into v_id
  from public.system_alerts
  where tenant_id = p_tenant_id
    and dedupe_key = p_dedupe_key
    and status in ('OPEN','ACKNOWLEDGED')
  for update;

  if found then
    update public.system_alerts
      set severity = p_severity,
          source = p_source,
          title = p_title,
          message = p_message,
          entity_type = p_entity_type,
          entity_id = p_entity_id,
          metadata = coalesce(p_metadata, '{}'::jsonb),
          last_seen_at = now(),
          occurrence_count = occurrence_count + 1,
          updated_at = now()
    where id = v_id;
    return v_id;
  end if;

  insert into public.system_alerts (
    tenant_id, dedupe_key, severity, source, title, message,
    entity_type, entity_id, metadata
  ) values (
    p_tenant_id, p_dedupe_key, p_severity, p_source, p_title, p_message,
    p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.orvanta_resolve_system_alert(
  p_tenant_id text,
  p_dedupe_key text,
  p_note text default 'Recovered automatically'
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.system_alerts
    set status = 'RESOLVED',
        resolved_at = now(),
        resolution_note = p_note,
        updated_at = now()
  where tenant_id = p_tenant_id
    and dedupe_key = p_dedupe_key
    and status in ('OPEN','ACKNOWLEDGED');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.orvanta_claim_failed_writes(
  p_tenant_id text,
  p_worker_id text,
  p_limit integer default 25
) returns setof public.failed_writes
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id
    from public.failed_writes
    where tenant_id = p_tenant_id
      and status in ('PENDING','RETRYING')
      and coalesce(next_retry_at, now()) <= now()
      and (claimed_at is null or claimed_at < now() - interval '15 minutes')
    order by created_at
    for update skip locked
    limit least(greatest(p_limit, 1), 100)
  )
  update public.failed_writes fw
    set status = 'RETRYING',
        claimed_at = now(),
        claimed_by = p_worker_id,
        last_attempt_at = now(),
        updated_at = now()
  from candidates
  where fw.id = candidates.id
  returning fw.*;
end;
$$;

revoke all on table public.system_alerts from public, anon, authenticated;
revoke all on table public.dead_letter_jobs from public, anon, authenticated;
revoke all on table public.integration_attempts from public, anon, authenticated;
revoke all on table public.external_receipts from public, anon, authenticated;
revoke all on table public.capability_registry from public, anon, authenticated;
revoke all on table public.backup_verification_runs from public, anon, authenticated;

grant select, insert, update, delete on all tables in schema public to service_role;
revoke all on function public.orvanta_raise_system_alert(text,text,text,text,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.orvanta_resolve_system_alert(text,text,text) from public, anon, authenticated;
revoke all on function public.orvanta_claim_failed_writes(text,text,integer) from public, anon, authenticated;
grant execute on function public.orvanta_raise_system_alert(text,text,text,text,text,text,text,text,jsonb) to service_role;
grant execute on function public.orvanta_resolve_system_alert(text,text,text) to service_role;
grant execute on function public.orvanta_claim_failed_writes(text,text,integer) to service_role;

alter table public.system_alerts enable row level security;
alter table public.dead_letter_jobs enable row level security;
alter table public.integration_attempts enable row level security;
alter table public.external_receipts enable row level security;
alter table public.capability_registry enable row level security;
alter table public.backup_verification_runs enable row level security;

insert into public.capability_registry (capability_key, domain, title, status, evidence_required, integration, notes)
values
  ('google.gmail.draft','google','إنشاء مسودة Gmail','LIVE',true,'GOOGLE_WORKSPACE','يتطلب external receipt'),
  ('google.drive.file','google','إنشاء ملف Google Drive','LIVE',true,'GOOGLE_WORKSPACE','يتطلب external receipt'),
  ('google.sheets.row','google','إضافة سجل إلى Google Sheets','LIVE',true,'GOOGLE_WORKSPACE','يتطلب external receipt'),
  ('google.calendar.event','google','إنشاء حدث Google Calendar','SANDBOX',true,'GOOGLE_WORKSPACE','يُرقى إلى LIVE بعد E2E'),
  ('government.document.analysis','government','تحليل وثيقة حكومية','LIVE',true,'OPENAI_SUPABASE','يتطلب سجل استخراج وملف محفوظ'),
  ('government.portal.submission','government','إرسال معاملة في بوابة حكومية','HUMAN_CHECKPOINT',true,null,'النفاذ وOTP والدفع والإرسال النهائي بيد المالك'),
  ('finance.journal.post','finance','ترحيل قيد محاسبي','LIVE',true,'SUPABASE','القيد الرسمي فقط'),
  ('finance.zatca.submit','finance','إرسال فاتورة ZATCA','SANDBOX',true,'ZATCA','لا يُصنف LIVE حتى اعتماد بيئة الإنتاج'),
  ('shopify.orders','commerce','مزامنة طلبات Shopify','NOT_INTEGRATED',true,'SHOPIFY','مخفي من المسار الرئيسي حتى يكتمل'),
  ('trading.execution','trading','تنفيذ تداول حقيقي','DISABLED',true,'ALPACA','غير داخل نطاق النسخة الحالية')
on conflict (capability_key) do update set
  domain = excluded.domain,
  title = excluded.title,
  status = excluded.status,
  evidence_required = excluded.evidence_required,
  integration = excluded.integration,
  notes = excluded.notes,
  updated_at = now();

notify pgrst, 'reload schema';
