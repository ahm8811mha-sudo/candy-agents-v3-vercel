-- Link an approved idea to the project it was executed into, so conversion
-- is idempotent (no duplicate projects) and the ideas board can show which
-- approved ideas are still waiting to be converted.
alter table public.company_ideas
  add column if not exists executed_project_id text;

create index if not exists company_ideas_status_idx
  on public.company_ideas (status, created_at desc);

notify pgrst, 'reload schema';
