-- Keep continuity-event foreign-key maintenance efficient as the audit log grows.
create index if not exists company_continuity_events_policy_idx
  on public.company_continuity_events (policy_id)
  where policy_id is not null;

create index if not exists company_continuity_events_project_idx
  on public.company_continuity_events (project_id)
  where project_id is not null;

create index if not exists company_continuity_events_action_idx
  on public.company_continuity_events (action_id)
  where action_id is not null;
