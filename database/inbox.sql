create table if not exists inbox_items (
  id text primary key,
  request_text text not null,
  result_title text not null,
  result_content text not null,
  assigned_agent text,
  department_id text,
  task_id text,
  status text not null default 'DELIVERED',
  created_at timestamptz default now()
);

alter table inbox_items enable row level security;

drop policy if exists "app read inbox" on inbox_items;
drop policy if exists "app write inbox" on inbox_items;

create policy "app read inbox" on inbox_items for select to anon, authenticated using (true);
create policy "app write inbox" on inbox_items for insert to anon, authenticated with check (true);
