-- Evaluate auth context once per statement instead of once per row.

drop policy if exists orvanta_workflow_definition_read on public.workflow_definitions;
create policy orvanta_workflow_definition_read
on public.workflow_definitions
for select
to authenticated
using ((select auth.uid()) is not null);

notify pgrst, 'reload schema';
