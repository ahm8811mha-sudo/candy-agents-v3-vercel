-- Commerce inventory + Shopify link. The store, the warehouse, and the books
-- share one product record: adding a product anywhere lands here, and every
-- movement is tracked. Accounting stays honest — this registers the ASSET
-- (unit cost + target price); real money postings happen only when a real
-- purchase or sale event occurs through the existing runtime flows.

create extension if not exists pgcrypto;

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  sku text not null,
  name text not null,
  category text not null default 'commerce',
  unit_cost numeric not null default 0,
  target_price numeric not null default 0,
  on_hand numeric not null default 0,
  reorder_point numeric not null default 5,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','DRAFT','ARCHIVED')),
  -- Two-way Shopify link. `source` records who created the record so the
  -- webhook echo (Shopify notifying us of a change we just made) is a no-op.
  shopify_product_id text,
  source text not null default 'manual' check (source in ('manual','site','shopify','import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, sku)
);
create index if not exists inventory_items_tenant_status_idx on public.inventory_items (tenant_id, status, updated_at desc);
create unique index if not exists inventory_items_shopify_uidx on public.inventory_items (tenant_id, shopify_product_id) where shopify_product_id is not null;

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'golden-star',
  item_id uuid references public.inventory_items(id) on delete cascade,
  movement_type text not null default 'ADJUSTMENT' check (movement_type in ('IN','OUT','ADJUSTMENT','OPENING')),
  quantity numeric not null,
  unit_cost numeric not null default 0,
  note text,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);
create index if not exists inventory_movements_item_idx on public.inventory_movements (tenant_id, item_id, created_at desc);

alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;

-- Server-only: the app writes via service_role; browsers never touch these.
drop policy if exists server_only_no_client_access on public.inventory_items;
drop policy if exists server_only_no_client_access on public.inventory_movements;
create policy server_only_no_client_access on public.inventory_items for all to anon, authenticated using (false) with check (false);
create policy server_only_no_client_access on public.inventory_movements for all to anon, authenticated using (false) with check (false);

revoke all on public.inventory_items from public, anon, authenticated;
revoke all on public.inventory_movements from public, anon, authenticated;
grant select, insert, update, delete on public.inventory_items to service_role;
grant select, insert, update, delete on public.inventory_movements to service_role;

notify pgrst, 'reload schema';
