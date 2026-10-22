-- 20260719000200_commerce_inventory_shopify_link.sql links inventory to
-- Shopify, but production's inventory_items predates it: `create table if not
-- exists` left the table as it was, without shopify_product_id or source, and
-- the link's index could not be built (production replay, 2026-10-22). This
-- gives an existing table what that migration expects, under the same names
-- it uses, so a table it created and a table it found end up alike.

alter table public.inventory_items
  add column if not exists shopify_product_id text,
  add column if not exists source text not null default 'manual';

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.inventory_items'::regclass and conname = 'inventory_items_source_check') then
    alter table public.inventory_items
      add constraint inventory_items_source_check check (source in ('manual', 'site', 'shopify', 'import'));
  end if;
  -- The Shopify sync upserts on (tenant_id, sku).
  if not exists (select 1 from pg_constraint where conrelid = 'public.inventory_items'::regclass and conname = 'inventory_items_tenant_id_sku_key') then
    if exists (select 1 from public.inventory_items group by tenant_id, sku having count(*) > 1) then
      raise exception 'inventory_items holds the same SKU twice for one tenant; resolve the duplicates before the Shopify link keys on it';
    end if;
    alter table public.inventory_items
      add constraint inventory_items_tenant_id_sku_key unique (tenant_id, sku);
  end if;
end;
$$;

create index if not exists inventory_items_tenant_status_idx on public.inventory_items (tenant_id, status, updated_at desc);
create unique index if not exists inventory_items_shopify_uidx on public.inventory_items (tenant_id, shopify_product_id) where shopify_product_id is not null;

notify pgrst, 'reload schema';
