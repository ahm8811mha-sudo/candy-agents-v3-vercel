-- ============================================================================
--  شركة النجمة الذهبية — مخطط قاعدة بيانات Supabase (النسخ الدائم)
--  Golden Star Enterprise OS — durable persistence schema.
--
--  كيف تشغّله:
--    Supabase Dashboard → SQL Editor → New query → الصق هذا الملف → Run.
--  آمن لإعادة التشغيل (كل الجداول create-if-not-exists).
--
--  بعد التشغيل، أضف في Vercel → Settings → Environment Variables:
--    NEXT_PUBLIC_SUPABASE_URL   = https://<project-ref>.supabase.co
--    SUPABASE_SERVICE_ROLE_KEY  = <service_role key من Project Settings → API>
--  لا تلصق المفاتيح في المحادثة أو في المستودع — فقط في متغيّرات بيئة Vercel.
--
--  ملاحظة أمان: يكتب النظام عبر مفتاح service_role من الخادم فقط، لذا يبقى
--  RLS مفعّلاً بدون سياسات عامة — لا وصول من المتصفح إلى هذه الجداول.
-- ============================================================================

-- سجل التدقيق — غير قابل للتعديل (append-only). يكتبه lib/company/audit.ts.
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

-- مركز القرار — كل عنصر يحتاج اعتماد المالك/الرئيس التنفيذي. lib/approvals.ts.
create table if not exists company_approvals (
  id            text primary key,
  type          text not null,
  title         text not null,
  detail        text,
  amount        numeric,
  requested_role text,
  status        text not null default 'PENDING',
  created_at    timestamptz not null,
  decided_at    timestamptz,
  decided_by    text,
  note          text,
  metadata      jsonb
);
create index if not exists company_approvals_status_idx on company_approvals (status, created_at desc);

-- سجل قرارات المراجعة العامة (اعتماد/رفض/ملاحظة/إحالة). lib/decisions.ts.
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

-- خط الأفكار والجدوى. lib/company/ideas.ts.
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
  recommendations  jsonb,
  aggregate        jsonb,
  study_mode       text,
  approval_id      text,
  day_key          text,
  created_at       timestamptz not null
);
create index if not exists company_ideas_created_at_idx on company_ideas (created_at desc);
create index if not exists company_ideas_day_key_idx on company_ideas (source, day_key);

-- دفتر القيود المزدوجة (كل قيد متوازن). lib/company/ledger.ts.
create table if not exists ledger_entries (
  id          text primary key,
  date        timestamptz not null,
  description text,
  reference   text,
  lines       jsonb not null
);
create index if not exists ledger_entries_date_idx on ledger_entries (date desc);

-- فواتير ZATCA المبسّطة (المرحلة الأولى) مع رمز QR. lib/company/zatca.ts.
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

-- مداخيل المبيعات المعتمدة والمسجّلة. lib/company/sales.ts.
create table if not exists sales_income (
  id            text primary key,
  amount        numeric,
  currency      text,
  order_count   integer,
  order_ids     jsonb,
  note          text,
  recognized_at timestamptz not null
);
create index if not exists sales_income_recognized_at_idx on sales_income (recognized_at desc);

-- طلبات تعديل المتجر (سعر/حالة/خصم/إضافة/إزالة منتج). lib/company/sales.ts.
create table if not exists sales_changes (
  id         text primary key,
  kind       text,
  target     text,
  detail     text,
  status     text,
  created_at timestamptz not null
);
create index if not exists sales_changes_created_at_idx on sales_changes (created_at desc);

-- تفعيل RLS (بدون سياسات — الوصول عبر مفتاح service_role من الخادم فقط).
alter table audit_log         enable row level security;
alter table company_approvals enable row level security;
alter table company_decisions enable row level security;
alter table company_ideas     enable row level security;
alter table ledger_entries    enable row level security;
alter table zatca_invoices    enable row level security;
alter table sales_income      enable row level security;
alter table sales_changes     enable row level security;
