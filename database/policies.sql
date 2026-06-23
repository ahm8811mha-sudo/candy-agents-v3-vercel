alter table departments enable row level security;
alter table employees enable row level security;
alter table tasks enable row level security;
alter table daily_logs enable row level security;
alter table approvals enable row level security;
alter table notifications enable row level security;
alter table activity_logs enable row level security;

create policy "authenticated can read departments" on departments for select to authenticated using (true);
create policy "authenticated can read employees" on employees for select to authenticated using (true);
create policy "authenticated can read tasks" on tasks for select to authenticated using (true);
create policy "authenticated can write tasks" on tasks for insert to authenticated with check (true);
create policy "authenticated can update tasks" on tasks for update to authenticated using (true);
create policy "authenticated can read logs" on daily_logs for select to authenticated using (true);
create policy "authenticated can submit logs" on daily_logs for insert to authenticated with check (true);
create policy "authenticated can read approvals" on approvals for select to authenticated using (true);
create policy "authenticated can update approvals" on approvals for update to authenticated using (true);
create policy "authenticated can read notifications" on notifications for select to authenticated using (true);
create policy "authenticated can read activity" on activity_logs for select to authenticated using (true);
