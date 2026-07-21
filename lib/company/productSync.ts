/**
 * One product, three places, kept in sync.
 *
 * A product is a single record shared by the store (Shopify), the warehouse
 * (inventory_items), and the books. Adding a product on the site pushes it to
 * Shopify AND registers it in the warehouse; a Shopify webhook pushes store
 * changes back into the warehouse. The `source`/`origin` fields break the echo
 * loop so a change we made is not re-applied when Shopify notifies us of it.
 *
 * Accounting stays honest: creating a product registers the ASSET (its unit
 * cost and target price) in the warehouse. No journal entry is posted here —
 * real money is recorded only when a real purchase or sale happens through the
 * existing runtime flows. This mirrors the execution-honesty gate.
 */

import { getSupabaseAdmin } from "../supabase";
import { invalidateCache } from "../cache";
import { recordAudit } from "./audit";
import {
  createShopifyProduct,
  deleteShopifyProduct,
  getShopifySnapshot,
  isShopifyWriteConfigured,
  type ShopifyProduct,
} from "../shopify";

const DEFAULT_TENANT = "golden-star";

export type ProductOrigin = "site" | "shopify-webhook" | "import";

export type SyncProductInput = {
  title: string;
  sku?: string;
  unitCost?: number;
  targetPrice?: number;
  onHand?: number;
  reorderPoint?: number;
  vendor?: string;
  status?: "ACTIVE" | "DRAFT";
  shopifyProductId?: string;
};

export type SyncedProduct = {
  id: string;
  sku: string;
  name: string;
  unitCost: number;
  targetPrice: number;
  onHand: number;
  reorderPoint: number;
  status: string;
  shopifyProductId: string | null;
  source: string;
};

export type SyncResult = {
  ok: boolean;
  product: SyncedProduct | null;
  shopify: "created" | "linked" | "skipped" | "not-configured";
  inventory: "upserted" | "archived" | "skipped";
  accounting: "asset-registered" | "asset-archived" | "none";
  reason?: string;
};

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function slugSku(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "sku";
  return `${base}-${Date.now().toString(36).slice(-5)}`;
}

function mapRow(row: Record<string, unknown>): SyncedProduct {
  return {
    id: String(row.id),
    sku: String(row.sku),
    name: String(row.name),
    unitCost: num(row.unit_cost),
    targetPrice: num(row.target_price),
    onHand: num(row.on_hand),
    reorderPoint: num(row.reorder_point),
    status: String(row.status),
    shopifyProductId: row.shopify_product_id ? String(row.shopify_product_id) : null,
    source: String(row.source),
  };
}

/**
 * Create (or update) a product across the store, the warehouse, and the books.
 * From the site it also creates the product on Shopify; from a webhook it only
 * lands the warehouse record (origin === "shopify-webhook" never writes back).
 */
export async function createSyncedProduct(
  input: SyncProductInput,
  options: { tenantId?: string; actor?: string; origin?: ProductOrigin } = {}
): Promise<SyncResult> {
  const tenantId = options.tenantId || DEFAULT_TENANT;
  const origin = options.origin || "site";
  const actor = options.actor || "commerce-sync";
  const title = input.title?.trim();
  if (!title) return { ok: false, product: null, shopify: "skipped", inventory: "skipped", accounting: "none", reason: "اسم المنتج مطلوب." };

  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, product: null, shopify: "skipped", inventory: "skipped", accounting: "none", reason: "المزامنة تتطلب اتصال Supabase." };

  const sku = input.sku?.trim() || slugSku(title);
  let shopifyProductId = input.shopifyProductId?.trim() || null;
  let shopifyState: SyncResult["shopify"] = shopifyProductId ? "linked" : "skipped";

  // Site → Shopify (push). A webhook-originated call never writes back.
  if (origin !== "shopify-webhook" && !shopifyProductId) {
    if (isShopifyWriteConfigured()) {
      try {
        const created = await createShopifyProduct({
          title,
          price: num(input.targetPrice),
          status: (input.status || "ACTIVE") === "ACTIVE" ? "active" : "draft",
          vendor: input.vendor,
        });
        shopifyProductId = created.id;
        shopifyState = "created";
      } catch (error) {
        return { ok: false, product: null, shopify: "skipped", inventory: "skipped", accounting: "none", reason: `تعذّر إنشاء المنتج في Shopify: ${error instanceof Error ? error.message : String(error)}` };
      }
    } else {
      shopifyState = "not-configured";
    }
  }

  const source = origin === "shopify-webhook" ? "shopify" : origin === "import" ? "import" : "site";
  const { data, error } = await supabase
    .from("inventory_items")
    .upsert(
      {
        tenant_id: tenantId,
        sku,
        name: title,
        category: "commerce",
        unit_cost: num(input.unitCost),
        target_price: num(input.targetPrice),
        on_hand: num(input.onHand),
        reorder_point: num(input.reorderPoint) || 5,
        status: input.status || "ACTIVE",
        shopify_product_id: shopifyProductId,
        source,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,sku" }
    )
    .select()
    .single();
  if (error) return { ok: false, product: null, shopify: shopifyState, inventory: "skipped", accounting: "none", reason: `تعذّر تسجيل المنتج في المخزون: ${error.message}` };

  const product = mapRow(data);

  // Opening stock is tracked as a warehouse movement (asset quantity), not a
  // money posting. It records HOW MUCH arrived, honestly.
  if (num(input.onHand) > 0) {
    await supabase
      .from("inventory_movements")
      .insert({
        tenant_id: tenantId,
        item_id: product.id,
        movement_type: "OPENING",
        quantity: num(input.onHand),
        unit_cost: num(input.unitCost),
        note: "رصيد افتتاحي عند إضافة المنتج",
        source,
      })
      .then(() => undefined, () => undefined);
  }

  recordAudit({
    actor,
    action: origin === "shopify-webhook" ? "PRODUCT_SYNCED_FROM_SHOPIFY" : "PRODUCT_CREATED",
    entityType: "inventory_item",
    entityId: product.id,
    detail: `المنتج «${product.name}» (${product.sku}) — Shopify: ${shopifyState}، المخزون: مسجّل، المحاسبة: أصل مسجّل بتكلفة ${product.unitCost} وسعر ${product.targetPrice}.`,
  });

  invalidateCache("shopify-snapshot");
  return { ok: true, product, shopify: shopifyState, inventory: "upserted", accounting: "asset-registered" };
}

/**
 * Retire a product everywhere. The Shopify product is deleted (unless the call
 * came from a Shopify delete webhook); the warehouse record is ARCHIVED, never
 * hard-deleted, so accounting history and past movements survive.
 */
export async function archiveSyncedProduct(
  ref: { sku?: string; shopifyProductId?: string },
  options: { tenantId?: string; actor?: string; origin?: ProductOrigin } = {}
): Promise<SyncResult> {
  const tenantId = options.tenantId || DEFAULT_TENANT;
  const origin = options.origin || "site";
  const actor = options.actor || "commerce-sync";
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, product: null, shopify: "skipped", inventory: "skipped", accounting: "none", reason: "المزامنة تتطلب اتصال Supabase." };

  let query = supabase.from("inventory_items").select("*").eq("tenant_id", tenantId);
  query = ref.sku ? query.eq("sku", ref.sku) : query.eq("shopify_product_id", String(ref.shopifyProductId));
  const { data: existing, error: findError } = await query.maybeSingle();
  if (findError) return { ok: false, product: null, shopify: "skipped", inventory: "skipped", accounting: "none", reason: findError.message };
  if (!existing) return { ok: false, product: null, shopify: "skipped", inventory: "skipped", accounting: "none", reason: "المنتج غير موجود في المخزون." };

  const product = mapRow(existing);
  let shopifyState: SyncResult["shopify"] = "skipped";
  if (origin !== "shopify-webhook" && product.shopifyProductId && isShopifyWriteConfigured()) {
    try {
      await deleteShopifyProduct(product.shopifyProductId);
      shopifyState = "created"; // deleted upstream
    } catch (error) {
      return { ok: false, product, shopify: "skipped", inventory: "skipped", accounting: "none", reason: `تعذّر حذف المنتج من Shopify: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  const { error: updateError } = await supabase
    .from("inventory_items")
    .update({ status: "ARCHIVED", updated_at: new Date().toISOString() })
    .eq("id", product.id);
  if (updateError) return { ok: false, product, shopify: shopifyState, inventory: "skipped", accounting: "none", reason: updateError.message };

  recordAudit({
    actor,
    action: origin === "shopify-webhook" ? "PRODUCT_ARCHIVED_FROM_SHOPIFY" : "PRODUCT_ARCHIVED",
    entityType: "inventory_item",
    entityId: product.id,
    detail: `أُرشف المنتج «${product.name}» (${product.sku}). المخزون محفوظ للتاريخ المحاسبي، ولم يُحذف.`,
  });

  invalidateCache("shopify-snapshot");
  return { ok: true, product: { ...product, status: "ARCHIVED" }, shopify: shopifyState, inventory: "archived", accounting: "asset-archived" };
}

/** Handle a verified Shopify product webhook (create/update/delete). */
export async function applyShopifyProductWebhook(
  topic: string,
  payload: Record<string, unknown>,
  options: { tenantId?: string } = {}
): Promise<SyncResult> {
  const tenantId = options.tenantId || DEFAULT_TENANT;
  const shopifyProductId = payload.id != null ? String(payload.id) : undefined;
  if (topic === "products/delete") {
    return archiveSyncedProduct({ shopifyProductId }, { tenantId, actor: "shopify-webhook", origin: "shopify-webhook" });
  }
  const variants = Array.isArray(payload.variants) ? (payload.variants as Array<Record<string, unknown>>) : [];
  const firstVariant = variants[0] || {};
  return createSyncedProduct(
    {
      title: String(payload.title || "منتج بلا اسم"),
      sku: firstVariant.sku ? String(firstVariant.sku) : shopifyProductId ? `shopify-${shopifyProductId}` : undefined,
      targetPrice: num(firstVariant.price),
      onHand: variants.reduce((sum, v) => sum + num(v.inventory_quantity), 0),
      status: String(payload.status || "active") === "active" ? "ACTIVE" : "DRAFT",
      vendor: payload.vendor ? String(payload.vendor) : undefined,
      shopifyProductId,
    },
    { tenantId, actor: "shopify-webhook", origin: "shopify-webhook" }
  );
}

/** Pull the whole Shopify catalogue into the warehouse (one-shot reconcile). */
export async function pullShopifyProductsIntoInventory(
  options: { tenantId?: string; actor?: string } = {}
): Promise<{ ok: boolean; imported: number; failed: number; reason?: string }> {
  const snapshot = await getShopifySnapshot();
  if (!snapshot.connected) return { ok: false, imported: 0, failed: 0, reason: "المتجر غير متصل — أضف مفاتيح Shopify أولاً." };
  let imported = 0;
  let failed = 0;
  for (const p of snapshot.products as ShopifyProduct[]) {
    const result = await createSyncedProduct(
      {
        title: p.title,
        sku: `shopify-${p.id}`,
        targetPrice: p.price,
        onHand: p.totalInventory,
        vendor: p.vendor,
        status: p.status === "active" ? "ACTIVE" : "DRAFT",
        shopifyProductId: p.id,
      },
      { tenantId: options.tenantId, actor: options.actor || "shopify-pull", origin: "import" }
    );
    if (result.ok) imported += 1;
    else failed += 1;
  }
  return { ok: true, imported, failed };
}

/** The warehouse view of the catalogue, newest first. */
export async function listSyncedProducts(tenantId = DEFAULT_TENANT): Promise<SyncedProduct[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("tenant_id", tenantId)
    .neq("status", "ARCHIVED")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return [];
  return (data || []).map(mapRow);
}
