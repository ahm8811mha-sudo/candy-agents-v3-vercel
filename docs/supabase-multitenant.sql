-- ============================================================================
--  Orvanta — تفعيل تعدد الشركات (Multi-tenant)
--
--  شغّل هذا في Supabase → SQL Editor عندما تريد تشغيل أكثر من شركة على
--  المنصة، ثم أضف في Vercel:
--    ORVANTA_MULTI_TENANT = true
--    ORVANTA_TENANT_ID    = golden-star   (معرّف الشركة لهذا النشر)
--
--  آمن لإعادة التشغيل. الصفوف الحالية تُنسب تلقائياً إلى golden-star.
-- ============================================================================

alter table audit_log         add column if not exists tenant_id text not null default 'golden-star';
alter table company_approvals add column if not exists tenant_id text not null default 'golden-star';
alter table company_decisions add column if not exists tenant_id text not null default 'golden-star';
alter table company_ideas     add column if not exists tenant_id text not null default 'golden-star';
alter table ledger_entries    add column if not exists tenant_id text not null default 'golden-star';
alter table zatca_invoices    add column if not exists tenant_id text not null default 'golden-star';
alter table sales_income      add column if not exists tenant_id text not null default 'golden-star';
alter table sales_changes     add column if not exists tenant_id text not null default 'golden-star';

create index if not exists audit_log_tenant_idx         on audit_log (tenant_id, created_at desc);
create index if not exists company_approvals_tenant_idx on company_approvals (tenant_id, status, created_at desc);
create index if not exists company_decisions_tenant_idx on company_decisions (tenant_id, created_at desc);
create index if not exists company_ideas_tenant_idx     on company_ideas (tenant_id, created_at desc);
create index if not exists ledger_entries_tenant_idx    on ledger_entries (tenant_id, date desc);
create index if not exists zatca_invoices_tenant_idx    on zatca_invoices (tenant_id, issued_at desc);
create index if not exists sales_income_tenant_idx      on sales_income (tenant_id, recognized_at desc);
create index if not exists sales_changes_tenant_idx     on sales_changes (tenant_id, created_at desc);

NOTIFY pgrst, 'reload schema';
