-- ORVANTA Government Relations V2
-- Adds tenant-safe file/extraction records and explicit analysis/automation state.

alter table public.gov_documents
  add column if not exists analysis_status text not null default 'PENDING',
  add column if not exists analysis_engine text,
  add column if not exists analysis_error text,
  add column if not exists analyzed_at timestamptz,
  add column if not exists automation_status text not null default 'PENDING',
  add column if not exists automation_summary jsonb not null default '{}'::jsonb;

alter table public.gov_document_files
  add column if not exists tenant_id text not null default 'golden-star',
  add column if not exists content_hash text;

alter table public.gov_document_extractions
  add column if not exists tenant_id text not null default 'golden-star',
  add column if not exists model_name text,
  add column if not exists latency_ms integer,
  add column if not exists error_message text;

alter table public.gov_document_access_logs
  add column if not exists tenant_id text not null default 'golden-star';

update public.gov_document_files f
set tenant_id = d.tenant_id
from public.gov_documents d
where f.document_id = d.id and f.tenant_id is distinct from d.tenant_id;

update public.gov_document_extractions e
set tenant_id = d.tenant_id
from public.gov_documents d
where e.document_id = d.id and e.tenant_id is distinct from d.tenant_id;

update public.gov_document_access_logs a
set tenant_id = d.tenant_id
from public.gov_documents d
where a.document_id = d.id and a.tenant_id is distinct from d.tenant_id;

-- Preserve legacy uploads and expose their actual analysis state instead of
-- leaving them indefinitely marked PENDING after this migration.
with latest as (
  select distinct on (x.document_id, x.tenant_id)
    x.document_id,
    x.tenant_id,
    x.extraction_engine,
    x.error_message,
    x.created_at
  from public.gov_document_extractions x
  order by x.document_id, x.tenant_id, x.created_at desc
)
update public.gov_documents d
set analysis_status = case
      when coalesce(d.extraction_confidence, 0) >= 0.75
       and coalesce(array_length(d.missing_fields, 1), 0) = 0
      then 'COMPLETED'
      else 'NEEDS_REVIEW'
    end,
    analysis_engine = latest.extraction_engine,
    analysis_error = latest.error_message,
    analyzed_at = coalesce(latest.created_at, d.updated_at, d.created_at),
    automation_status = case
      when exists (
        select 1
        from public.tasks t
        where t.tenant_id = d.tenant_id
          and t.source_table = 'gov_documents'
          and t.source_id = d.id::text
      ) then 'COMPLETED'
      else 'PENDING'
    end,
    automation_summary = jsonb_build_object(
      'backfilled', true,
      'reviewRequired', coalesce(array_length(d.missing_fields, 1), 0) > 0
    )
from latest
where latest.document_id = d.id
  and latest.tenant_id = d.tenant_id
  and d.analysis_status = 'PENDING';

create index if not exists gov_documents_tenant_created_idx
  on public.gov_documents (tenant_id, created_at desc);
create index if not exists gov_documents_tenant_status_idx
  on public.gov_documents (tenant_id, status, expiry_date);
create index if not exists gov_document_files_tenant_document_idx
  on public.gov_document_files (tenant_id, document_id, created_at desc);
create index if not exists gov_document_files_tenant_hash_idx
  on public.gov_document_files (tenant_id, content_hash)
  where content_hash is not null;
create index if not exists gov_document_extractions_tenant_document_idx
  on public.gov_document_extractions (tenant_id, document_id, created_at desc);
create index if not exists gov_document_access_logs_tenant_document_idx
  on public.gov_document_access_logs (tenant_id, document_id, created_at desc);

alter table public.gov_document_files enable row level security;
alter table public.gov_document_extractions enable row level security;
alter table public.gov_document_access_logs enable row level security;

-- Recreate tenant policies because these tables did not originally carry tenant_id.
do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array['gov_document_files','gov_document_extractions','gov_document_access_logs']
  loop
    for policy_name in
      select p.policyname from pg_policies p
      where p.schemaname='public' and p.tablename=table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
    end loop;

    execute format('create policy orvanta_tenant_select on public.%I for select to authenticated using (public.orvanta_has_tenant_access(tenant_id))', table_name);
    execute format('create policy orvanta_tenant_insert on public.%I for insert to authenticated with check (public.orvanta_has_tenant_access(tenant_id))', table_name);
    execute format('create policy orvanta_tenant_update on public.%I for update to authenticated using (public.orvanta_has_tenant_access(tenant_id)) with check (public.orvanta_has_tenant_access(tenant_id))', table_name);
    execute format('create policy orvanta_tenant_delete on public.%I for delete to authenticated using (public.orvanta_has_tenant_access(tenant_id))', table_name);

    execute format('revoke all on table public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end $$;

notify pgrst, 'reload schema';
