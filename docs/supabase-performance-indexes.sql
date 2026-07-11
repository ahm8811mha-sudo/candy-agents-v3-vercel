-- ORVANTA core and operational foreign-key indexes
-- Run after the security hardening migration.
-- Missing legacy tables/columns are skipped so this migration is portable.

do $$
declare
  pair text[];
  v_table text;
  v_column text;
  v_index text;
  pairs text[][] := array[
    array['alerts','triggered_by'],
    array['approval_policies','created_by'],
    array['approvals','approval_policy_id'],
    array['approvals','decided_by'],
    array['approvals','requested_by'],
    array['cash_flow_forecasts','created_by'],
    array['correspondence_tasks','created_by'],
    array['crisis_recommendations','crisis_id'],
    array['crisis_recommendations','recommended_by'],
    array['employees','managed_by'],
    array['gov_documents','document_type_id'],
    array['gov_documents','owner_id'],
    array['gov_fee_sources','created_by'],
    array['gov_renewal_tasks','document_id'],
    array['gov_renewal_tasks','owner_id'],
    array['gov_renewal_tasks','source_id'],
    array['governance_audit_log','user_id'],
    array['purchase_orders','approved_by'],
    array['purchase_orders','supplier_id'],
    array['tasks','assigned_by'],
    array['tasks','created_by'],
    array['tasks','parent_task_id'],
    array['work_sessions','created_by'],
    array['work_sessions','employee_id'],
    array['decision_packets','objective_id'],
    array['decision_packets','opportunity_id'],
    array['decision_packets','project_id'],
    array['decision_packets','workflow_instance_id'],
    array['workflow_steps','workflow_instance_id'],
    array['knowledge_edges','from_node_id'],
    array['knowledge_edges','to_node_id'],
    array['budget_commitments','decision_id'],
    array['budget_commitments','project_id'],
    array['business_actions','workflow_instance_id'],
    array['projects','workflow_instance_id']
  ];
begin
  foreach pair slice 1 in array pairs loop
    v_table := pair[1];
    v_column := pair[2];
    if to_regclass('public.' || v_table) is not null and exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = v_table
        and c.column_name = v_column
    ) then
      v_index := left(v_table || '_' || v_column || '_idx', 63);
      execute format(
        'create index if not exists %I on public.%I (%I)',
        v_index,
        v_table,
        v_column
      );
    end if;
  end loop;
end $$;
