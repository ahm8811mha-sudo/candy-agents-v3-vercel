-- ORVANTA core and operational foreign-key indexes
-- Run after the security hardening migration.

create index if not exists alerts_triggered_by_idx on public.alerts (triggered_by);
create index if not exists approval_policies_created_by_idx on public.approval_policies (created_by);
create index if not exists approvals_approval_policy_id_idx on public.approvals (approval_policy_id);
create index if not exists approvals_decided_by_idx on public.approvals (decided_by);
create index if not exists approvals_requested_by_idx on public.approvals (requested_by);
create index if not exists cash_flow_forecasts_created_by_idx on public.cash_flow_forecasts (created_by);
create index if not exists correspondence_tasks_created_by_idx on public.correspondence_tasks (created_by);
create index if not exists crisis_recommendations_crisis_id_idx on public.crisis_recommendations (crisis_id);
create index if not exists crisis_recommendations_recommended_by_idx on public.crisis_recommendations (recommended_by);
create index if not exists employees_managed_by_idx on public.employees (managed_by);
create index if not exists gov_documents_document_type_id_idx on public.gov_documents (document_type_id);
create index if not exists gov_documents_owner_id_idx on public.gov_documents (owner_id);
create index if not exists gov_fee_sources_created_by_idx on public.gov_fee_sources (created_by);
create index if not exists gov_renewal_tasks_document_id_idx on public.gov_renewal_tasks (document_id);
create index if not exists gov_renewal_tasks_owner_id_idx on public.gov_renewal_tasks (owner_id);
create index if not exists gov_renewal_tasks_source_id_idx on public.gov_renewal_tasks (source_id);
create index if not exists governance_audit_log_user_id_idx on public.governance_audit_log (user_id);
create index if not exists purchase_orders_approved_by_idx on public.purchase_orders (approved_by);
create index if not exists purchase_orders_supplier_id_idx on public.purchase_orders (supplier_id);
create index if not exists tasks_assigned_by_idx on public.tasks (assigned_by);
create index if not exists tasks_created_by_idx on public.tasks (created_by);
create index if not exists tasks_parent_task_id_idx on public.tasks (parent_task_id);
create index if not exists work_sessions_created_by_idx on public.work_sessions (created_by);
create index if not exists work_sessions_employee_id_idx on public.work_sessions (employee_id);

-- New company-OS runtime paths.
create index if not exists decision_packets_objective_id_idx on public.decision_packets (objective_id);
create index if not exists decision_packets_opportunity_id_idx on public.decision_packets (opportunity_id);
create index if not exists decision_packets_project_id_idx on public.decision_packets (project_id);
create index if not exists decision_packets_workflow_instance_id_idx on public.decision_packets (workflow_instance_id);
create index if not exists workflow_steps_instance_idx on public.workflow_steps (workflow_instance_id);
create index if not exists knowledge_edges_from_node_direct_idx on public.knowledge_edges (from_node_id);
create index if not exists knowledge_edges_to_node_direct_idx on public.knowledge_edges (to_node_id);
create index if not exists budget_commitments_decision_id_idx on public.budget_commitments (decision_id);
create index if not exists budget_commitments_project_id_idx on public.budget_commitments (project_id);
create index if not exists business_actions_workflow_instance_id_idx on public.business_actions (workflow_instance_id);
create index if not exists projects_workflow_instance_id_idx on public.projects (workflow_instance_id);
