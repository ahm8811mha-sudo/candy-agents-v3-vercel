create table if not exists correspondence_tasks (
  id text primary key,
  message_id text not null,
  message_subject text,
  message_reference text,
  agent_id text not null,
  agent_name text,
  agent_title text,
  instruction text not null,
  execution_result text,
  status text not null default 'ASSIGNED',
  created_at timestamptz not null default now()
);

create index if not exists correspondence_tasks_message_id_idx
  on correspondence_tasks(message_id);

create index if not exists correspondence_tasks_created_at_idx
  on correspondence_tasks(created_at desc);
