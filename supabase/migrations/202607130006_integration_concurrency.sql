-- Prevent two serverless workers from executing the same external operation at
-- the same time. A STARTED/SUCCEEDED/SKIPPED record owns the idempotency key.

drop index if exists public.integration_attempts_success_idempotency_idx;
create unique index if not exists integration_attempts_active_idempotency_idx
  on public.integration_attempts (tenant_id, integration, operation, idempotency_key)
  where status in ('STARTED','SUCCEEDED','SKIPPED');

notify pgrst, 'reload schema';
