-- Orvanta Employee Runtime V1
create extension if not exists pgcrypto;

create table if not exists employee_work_orders (
  id uuid primary key default gen_random_uuid(), tenant_id text not null,
  project_number text not null, work_order_number text not null, kind text not null,
  title text not null, objective text not null, requested_by text not null,
  owner_employee_id text not null, backup_employee_id text, department text not null,
  amount_sar numeric(18,2) not null default 0, risk_level text not null default 'LOW',
  status text not null default 'RECEIVED', execution_mode text not null default 'SIMULATION',
  requires_approval boolean not null default false, approval_tier text not null default 'T0',
  approval_status text not null default 'NOT_REQUIRED', idempotency_key text not null,
  acceptance_criteria jsonb not null default '[]', steps jsonb not null default '[]',
  context jsonb not null default '{}', result jsonb, error text,
  started_at timestamptz, completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(tenant_id,idempotency_key), unique(tenant_id,work_order_number)
);
create index if not exists employee_work_orders_status_idx on employee_work_orders(tenant_id,status,created_at desc);

create table if not exists employee_work_order_events (
  id uuid primary key default gen_random_uuid(), tenant_id text not null,
  work_order_id uuid not null references employee_work_orders(id) on delete cascade,
  event_type text not null, actor text not null, employee_id text, step_id text,
  detail jsonb not null default '{}', created_at timestamptz not null default now()
);

create table if not exists employee_execution_receipts (
  id text primary key, tenant_id text not null,
  work_order_id uuid not null references employee_work_orders(id) on delete cascade,
  work_order_number text not null, step_id text not null, employee_id text not null,
  tool text not null, mode text not null, input_hash text not null,
  provider_reference text, verified boolean not null default false,
  reconciliation_status text not null default 'NOT_REQUIRED', details jsonb not null default '{}',
  created_at timestamptz not null default now(), unique(work_order_id,step_id,input_hash)
);

create table if not exists employee_sales_orders (
  id uuid primary key default gen_random_uuid(), tenant_id text not null, order_id text not null,
  work_order_id uuid references employee_work_orders(id), customer_name text not null,
  customer_email text, product_name text not null, sku text not null, quantity integer not null,
  amount_sar numeric(18,2) not null, channel text not null default 'direct',
  payment_reference text not null, status text not null default 'PAID',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(tenant_id,order_id)
);

create table if not exists employee_inventory_items (
  id uuid primary key default gen_random_uuid(), tenant_id text not null, sku text not null,
  product_name text not null, on_hand integer not null default 0, reserved integer not null default 0,
  reorder_point integer not null default 0, unit_cost_sar numeric(18,2) not null default 0,
  updated_at timestamptz not null default now(), unique(tenant_id,sku),
  check(on_hand>=0 and reserved>=0 and reserved<=on_hand)
);

create table if not exists employee_inventory_reservations (
  id uuid primary key default gen_random_uuid(), tenant_id text not null,
  work_order_id uuid not null references employee_work_orders(id), order_id text not null,
  sku text not null, quantity integer not null, status text not null default 'RESERVED',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(tenant_id,work_order_id,sku)
);

create table if not exists employee_fulfillment_orders (
  id uuid primary key default gen_random_uuid(), tenant_id text not null, order_id text not null,
  work_order_id uuid not null references employee_work_orders(id), customer_name text not null,
  product_name text not null, sku text not null, quantity integer not null,
  status text not null default 'READY_TO_PICK', due_at timestamptz, completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(tenant_id,order_id)
);

create table if not exists employee_customers (
  id uuid primary key default gen_random_uuid(), tenant_id text not null, customer_key text not null,
  name text not null, email text, order_count integer not null default 0,
  lifetime_value_sar numeric(18,2) not null default 0, last_order_id text, last_channel text,
  last_order_at timestamptz, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(tenant_id,customer_key)
);

create table if not exists employee_kpi_events (
  id uuid primary key default gen_random_uuid(), tenant_id text not null, event_key text not null,
  work_order_id uuid references employee_work_orders(id), employee_id text not null,
  kpi_id text not null, value numeric(18,4) not null, unit text not null,
  metadata jsonb not null default '{}', created_at timestamptz not null default now(),
  unique(tenant_id,event_key)
);

create or replace function orvanta_reserve_employee_inventory(p_tenant_id text,p_sku text,p_quantity integer,p_work_order_id uuid,p_order_id text)
returns jsonb language plpgsql as $$
declare item employee_inventory_items%rowtype; reservation employee_inventory_reservations%rowtype;
begin
  select * into reservation from employee_inventory_reservations where tenant_id=p_tenant_id and work_order_id=p_work_order_id and sku=p_sku;
  if found then return to_jsonb(reservation); end if;
  select * into item from employee_inventory_items where tenant_id=p_tenant_id and sku=p_sku for update;
  if not found then raise exception 'Inventory item not configured'; end if;
  if item.on_hand-item.reserved<p_quantity then raise exception 'Insufficient inventory'; end if;
  update employee_inventory_items set reserved=reserved+p_quantity,updated_at=now() where id=item.id;
  insert into employee_inventory_reservations(tenant_id,work_order_id,order_id,sku,quantity)
  values(p_tenant_id,p_work_order_id,p_order_id,p_sku,p_quantity) returning * into reservation;
  return to_jsonb(reservation);
end $$;

create or replace function orvanta_upsert_employee_customer(p_tenant_id text,p_customer_key text,p_name text,p_email text,p_order_id text,p_order_amount numeric,p_channel text)
returns jsonb language plpgsql as $$
declare customer employee_customers%rowtype;
begin
  insert into employee_customers(tenant_id,customer_key,name,email,order_count,lifetime_value_sar,last_order_id,last_channel,last_order_at)
  values(p_tenant_id,p_customer_key,p_name,p_email,1,p_order_amount,p_order_id,p_channel,now())
  on conflict(tenant_id,customer_key) do update set
    name=excluded.name,email=coalesce(excluded.email,employee_customers.email),
    order_count=case when employee_customers.last_order_id=excluded.last_order_id then employee_customers.order_count else employee_customers.order_count+1 end,
    lifetime_value_sar=case when employee_customers.last_order_id=excluded.last_order_id then employee_customers.lifetime_value_sar else employee_customers.lifetime_value_sar+excluded.lifetime_value_sar end,
    last_order_id=excluded.last_order_id,last_channel=excluded.last_channel,last_order_at=now(),updated_at=now()
  returning * into customer;
  return to_jsonb(customer);
end $$;

alter table employee_work_orders enable row level security;
alter table employee_work_order_events enable row level security;
alter table employee_execution_receipts enable row level security;
alter table employee_sales_orders enable row level security;
alter table employee_inventory_items enable row level security;
alter table employee_inventory_reservations enable row level security;
alter table employee_fulfillment_orders enable row level security;
alter table employee_customers enable row level security;
alter table employee_kpi_events enable row level security;
