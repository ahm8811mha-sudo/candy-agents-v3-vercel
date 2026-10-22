-- 20260719000200 creates inventory_movements with a tenant and a source, and
-- keys its index on the tenant. Production's inventory_movements predates it,
-- without either column (production replay, 2026-10-22). This adds them under
-- the same names, with the index and the server-only policies that migration
-- gives both inventory tables.

alter table public.inventory_movements
  add column if not exists tenant_id text not null default 'golden-star',
  add column if not exists source text not null default 'manual';
create index if not exists inventory_movements_item_idx
  on public.inventory_movements (tenant_id, item_id, created_at desc);

alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
drop policy if exists server_only_no_client_access on public.inventory_items;
drop policy if exists server_only_no_client_access on public.inventory_movements;
create policy server_only_no_client_access on public.inventory_items
  for all to anon, authenticated using (false) with check (false);
create policy server_only_no_client_access on public.inventory_movements
  for all to anon, authenticated using (false) with check (false);

notify pgrst, 'reload schema';
