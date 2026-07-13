-- Cover foreign keys used by the active finance, reliability, CRM, government,
-- and owner workflow paths. Indexes are intentionally limited to current
-- high-value queries rather than adding every possible index blindly.

create index if not exists external_receipts_attempt_id_idx
  on public.external_receipts (integration_attempt_id);

create index if not exists accounting_journal_lines_account_id_idx
  on public.accounting_journal_lines (account_id);
create index if not exists accounting_journal_entries_cost_center_id_idx
  on public.accounting_journal_entries (cost_center_id);
create index if not exists accounting_invoices_cost_center_id_idx
  on public.accounting_invoices (cost_center_id);
create index if not exists accounting_bank_transactions_bank_account_id_idx
  on public.accounting_bank_transactions (bank_account_id);
create index if not exists accounting_bank_transactions_matched_entry_id_idx
  on public.accounting_bank_transactions (matched_entry_id);
create index if not exists accounting_payments_invoice_id_idx
  on public.accounting_payments (invoice_id);

create index if not exists crm_activities_lead_id_idx
  on public.crm_activities (lead_id);
create index if not exists crm_activities_deal_id_idx
  on public.crm_activities (deal_id);
create index if not exists crm_deals_lead_id_idx
  on public.crm_deals (lead_id);

create index if not exists gov_document_access_logs_document_id_idx
  on public.gov_document_access_logs (document_id);
create index if not exists gov_document_access_logs_file_id_idx
  on public.gov_document_access_logs (file_id);
create index if not exists gov_document_extractions_document_id_idx
  on public.gov_document_extractions (document_id);
create index if not exists gov_document_files_document_id_idx
  on public.gov_document_files (document_id);

create index if not exists task_comments_task_id_idx
  on public.task_comments (task_id);
create index if not exists task_comments_employee_id_idx
  on public.task_comments (employee_id);
create index if not exists tasks_department_id_idx
  on public.tasks (department_id);

notify pgrst, 'reload schema';
