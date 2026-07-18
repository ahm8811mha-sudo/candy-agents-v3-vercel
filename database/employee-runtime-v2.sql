-- Employee Runtime V2: Purchase-to-Pay persistence and secure RPC access.

create table if not exists employee_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  request_id text not null,
  work_order_id uuid not null references employee_work_orders(id),
  supplier_name text not null,
  supplier_email text,
  item_name text not null,
  sku text not null,
  quantity integer not null check (quantity > 0),
  unit_price_sar numeric(18,2) not null check (unit_price_sar > 0),
  subtotal_sar numeric(18,2) not null check (subtotal_sar > 0),
  tax_sar numeric(18,2) not null default 0 check (tax_sar >= 0),
  total_sar numeric(18,2) not null check (total_sar > 0),
  status text not null default 'APPROVED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, request_id)
);

create table if not exists employee_goods_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  request_id text not null,
  work_order_id uuid not null references employee_work_orders(id),
  sku text not null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_cost_sar numeric(18,2) not null check (unit_cost_sar >= 0),
  status text not null default 'RECEIVED',
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, work_order_id, sku)
);

create table if not exists employee_payables (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  request_id text not null,
  work_order_id uuid not null references employee_work_orders(id),
  supplier_name text not null,
  amount_sar numeric(18,2) not null check (amount_sar > 0),
  due_date date not null,
  status text not null default 'SCHEDULED'
    check (status in ('SCHEDULED','APPROVED','PAID','CANCELLED')),
  payment_reference text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, request_id)
);

create index if not exists employee_purchase_orders_tenant_status_idx
  on employee_purchase_orders (tenant_id, status, created_at desc);
create index if not exists employee_payables_tenant_due_idx
  on employee_payables (tenant_id, status, due_date);

create or replace function orvanta_receive_employee_inventory(
  p_tenant_id text,
  p_work_order_id uuid,
  p_request_id text,
  p_sku text,
  p_product_name text,
  p_quantity integer,
  p_unit_cost_sar numeric
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  existing_receipt employee_goods_receipts%rowtype;
  saved_receipt employee_goods_receipts%rowtype;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Receipt quantity must be positive';
  end if;
  if p_unit_cost_sar is null or p_unit_cost_sar < 0 then
    raise exception 'Unit cost must be zero or greater';
  end if;

  select * into existing_receipt
  from employee_goods_receipts
  where tenant_id = p_tenant_id
    and work_order_id = p_work_order_id
    and sku = p_sku;

  if found then
    return jsonb_build_object(
      'idempotent', true,
      'receipt', to_jsonb(existing_receipt)
    );
  end if;

  insert into employee_inventory_items (
    tenant_id, sku, product_name, on_hand, reserved,
    reorder_point, unit_cost_sar, updated_at
  ) values (
    p_tenant_id, p_sku, p_product_name, p_quantity, 0,
    0, p_unit_cost_sar, now()
  )
  on conflict (tenant_id, sku) do update set
    product_name = excluded.product_name,
    on_hand = employee_inventory_items.on_hand + excluded.on_hand,
    unit_cost_sar = excluded.unit_cost_sar,
    updated_at = now();

  insert into employee_goods_receipts (
    tenant_id, request_id, work_order_id, sku,
    product_name, quantity, unit_cost_sar, status
  ) values (
    p_tenant_id, p_request_id, p_work_order_id, p_sku,
    p_product_name, p_quantity, p_unit_cost_sar, 'RECEIVED'
  ) returning * into saved_receipt;

  return jsonb_build_object(
    'idempotent', false,
    'receipt', to_jsonb(saved_receipt)
  );
end;
$$;

alter table employee_purchase_orders enable row level security;
alter table employee_goods_receipts enable row level security;
alter table employee_payables enable row level security;

revoke execute on function orvanta_reserve_employee_inventory(text,text,integer,uuid,text)
  from public, anon, authenticated;
revoke execute on function orvanta_upsert_employee_customer(text,text,text,text,text,numeric,text)
  from public, anon, authenticated;
revoke execute on function orvanta_receive_employee_inventory(text,uuid,text,text,text,integer,numeric)
  from public, anon, authenticated;

grant execute on function orvanta_reserve_employee_inventory(text,text,integer,uuid,text)
  to service_role;
grant execute on function orvanta_upsert_employee_customer(text,text,text,text,text,numeric,text)
  to service_role;
grant execute on function orvanta_receive_employee_inventory(text,uuid,text,text,text,integer,numeric)
  to service_role;
