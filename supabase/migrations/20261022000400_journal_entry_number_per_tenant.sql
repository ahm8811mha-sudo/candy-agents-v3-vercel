-- 202607150002 replaces the legacy global unique on journal entry numbers
-- with one per tenant, and indexes journal lines by entry. Production still
-- holds the global constraint and lacks both indexes (production replay,
-- 2026-10-22). This applies what that migration would have.
--
-- It also drops accounting_journal_lines_account_idx: 202607150002 creates it
-- beside 202607130009's accounting_journal_lines_account_id_idx on the same
-- column, one index on account_id is enough, and production has only the
-- earlier one.

create unique index if not exists accounting_journal_entries_tenant_number_uidx
  on public.accounting_journal_entries (tenant_id, entry_number);
alter table public.accounting_journal_entries
  drop constraint if exists accounting_journal_entries_entry_number_key;
create index if not exists accounting_journal_lines_entry_idx
  on public.accounting_journal_lines (entry_id);
drop index if exists public.accounting_journal_lines_account_idx;

notify pgrst, 'reload schema';
