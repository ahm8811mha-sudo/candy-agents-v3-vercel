-- Make the server-only security model explicit and add covering indexes for
-- every foreign key reported by the Supabase database advisor on 2026-07-15.

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'accounting_periods',
    'ai_usage_log',
    'api_rate_limits',
    'auth_bootstrap_claims',
    'autonomous_plans',
    'backup_verification_runs',
    'capability_registry',
    'company_fact_daily',
    'company_feature_values',
    'company_ingestion_runs',
    'company_intelligence_snapshots',
    'company_knowledge_edges',
    'company_knowledge_nodes',
    'company_learning_events',
    'company_prediction_runs',
    'company_twin_states',
    'cron_runs',
    'dead_letter_jobs',
    'decision_recommendations',
    'executive_narratives',
    'external_receipts',
    'failed_writes',
    'freelancer_assignments',
    'gov_document_types',
    'governance_roles',
    'integration_attempts',
    'inventory_movements',
    'market_reports',
    'marketing_ab_tests',
    'marketing_campaigns',
    'marketing_channels',
    'marketing_content_calendar',
    'marketing_funnel_events',
    'marketing_offers',
    'marketing_products',
    'marketing_segments',
    'opportunity_radar_runs',
    'opportunity_scores',
    'readiness_evidence',
    'sales_quotes',
    'simulation_runs',
    'skill_definitions',
    'skill_installations',
    'skill_runs',
    'strategies',
    'supplier_quotes',
    'system_alerts',
    'transactions',
    'workspace_activation_codes',
    'workspace_invites'
  ]
  loop
    if to_regclass(format('public.%I', v_table)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on table public.%I from anon, authenticated', v_table);

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = v_table
        and policyname = 'server_only_no_client_access'
    ) then
      -- A permissive false policy denies client roles today without preventing
      -- a future, intentionally-scoped allow policy from being introduced.
      execute format(
        'create policy server_only_no_client_access on public.%I for all to anon, authenticated using (false) with check (false)',
        v_table
      );
    end if;
  end loop;
end;
$$;

create index if not exists activity_logs_actor_id_idx on public.activity_logs (actor_id);
create index if not exists approvals_approver_id_idx on public.approvals (approver_id);
create index if not exists company_knowledge_edges_from_node_id_idx on public.company_knowledge_edges (from_node_id);
create index if not exists company_knowledge_edges_to_node_id_idx on public.company_knowledge_edges (to_node_id);
create index if not exists company_twin_states_source_snapshot_id_idx on public.company_twin_states (source_snapshot_id);
create index if not exists daily_logs_reviewed_by_idx on public.daily_logs (reviewed_by);
create index if not exists employees_department_id_idx on public.employees (department_id);
create index if not exists employees_manager_id_idx on public.employees (manager_id);
create index if not exists executive_narratives_source_snapshot_id_idx on public.executive_narratives (source_snapshot_id);
create index if not exists gov_document_field_evidence_document_id_idx on public.gov_document_field_evidence (document_id);
create index if not exists gov_documents_current_renewal_case_id_idx on public.gov_documents (current_renewal_case_id);
create index if not exists gov_regulatory_sources_document_type_idx on public.gov_regulatory_sources (document_type);
create index if not exists gov_regulatory_updates_document_type_idx on public.gov_regulatory_updates (document_type);
create index if not exists gov_renewal_cases_document_id_idx on public.gov_renewal_cases (document_id);
create index if not exists gov_renewal_cases_fee_source_id_idx on public.gov_renewal_cases (fee_source_id);
create index if not exists gov_renewal_cases_renewal_task_id_idx on public.gov_renewal_cases (renewal_task_id);
create index if not exists gov_renewal_events_document_id_idx on public.gov_renewal_events (document_id);
create index if not exists gov_renewal_events_renewal_case_id_idx on public.gov_renewal_events (renewal_case_id);
create index if not exists gov_renewal_tasks_renewal_case_id_idx on public.gov_renewal_tasks (renewal_case_id);
create index if not exists inventory_movements_item_id_idx on public.inventory_movements (item_id);
create index if not exists marketing_ab_tests_campaign_id_idx on public.marketing_ab_tests (campaign_id);
create index if not exists marketing_campaigns_channel_id_idx on public.marketing_campaigns (channel_id);
create index if not exists marketing_campaigns_cost_center_id_idx on public.marketing_campaigns (cost_center_id);
create index if not exists marketing_content_calendar_campaign_id_idx on public.marketing_content_calendar (campaign_id);
create index if not exists marketing_offers_product_id_idx on public.marketing_offers (product_id);
create index if not exists opportunities_market_report_id_idx on public.opportunities (market_report_id);
create index if not exists opportunities_objective_id_idx on public.opportunities (objective_id);
create index if not exists opportunity_scores_radar_run_id_idx on public.opportunity_scores (radar_run_id);
create index if not exists sales_quotes_deal_id_idx on public.sales_quotes (deal_id);
create index if not exists skill_installations_skill_id_idx on public.skill_installations (skill_id);
create index if not exists skill_runs_installation_id_idx on public.skill_runs (installation_id);
create index if not exists skill_runs_receipt_id_idx on public.skill_runs (receipt_id);
create index if not exists supplier_quotes_supplier_id_idx on public.supplier_quotes (supplier_id);
create index if not exists transactions_project_id_idx on public.transactions (project_id);
create index if not exists workspace_memberships_employee_id_idx on public.workspace_memberships (employee_id);
