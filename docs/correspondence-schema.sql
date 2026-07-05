-- Orvanta Correspondence Center schema
-- Run this file in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists correspondence_messages (
  id text primary key,
  reference text not null unique,
  direction text not null check (direction in ('INBOUND', 'OUTBOUND')),
  mailbox text not null check (mailbox in ('INBOX', 'SENT', 'DRAFTS', 'ARCHIVED')),
  from_email text not null,
  from_name text,
  to_email text not null,
  to_name text,
  cc text,
  bcc text,
  subject text not null,
  body_text text not null default '',
  body_html text,
  status text not null check (status in ('RECEIVED', 'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'FAILED', 'ARCHIVED')),
  priority text not null default 'NORMAL' check (priority in ('NORMAL', 'IMPORTANT', 'URGENT')),
  contact_type text not null default 'COMPANY' check (contact_type in ('GOVERNMENT', 'COMPANY', 'INDIVIDUAL')),
  provider text default 'MANUAL',
  provider_message_id text,
  thread_id text,
  needs_approval boolean not null default false,
  approved_by text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  received_at timestamptz,
  archived_at timestamptz
);

create table if not exists correspondence_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id text not null references correspondence_messages(id) on delete cascade,
  file_name text not null,
  file_type text,
  file_size bigint,
  storage_path text,
  created_at timestamptz not null default now()
);

create table if not exists correspondence_approvals (
  id uuid primary key default gen_random_uuid(),
  message_id text not null references correspondence_messages(id) on delete cascade,
  requested_by text,
  approved_by text,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table if not exists correspondence_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  type text not null default 'COMPANY' check (type in ('GOVERNMENT', 'COMPANY', 'INDIVIDUAL')),
  organization text,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists correspondence_audit_log (
  id uuid primary key default gen_random_uuid(),
  message_id text references correspondence_messages(id) on delete set null,
  action text not null,
  actor text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_correspondence_messages_mailbox on correspondence_messages(mailbox);
create index if not exists idx_correspondence_messages_status on correspondence_messages(status);
create index if not exists idx_correspondence_messages_created_at on correspondence_messages(created_at desc);
create index if not exists idx_correspondence_messages_contact_type on correspondence_messages(contact_type);

alter table correspondence_messages enable row level security;
alter table correspondence_attachments enable row level security;
alter table correspondence_approvals enable row level security;
alter table correspondence_contacts enable row level security;
alter table correspondence_audit_log enable row level security;
