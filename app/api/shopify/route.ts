import { NextRequest, NextResponse } from "next/server";
import { getShopifySnapshot, isShopifyConfigured, isShopifyWriteConfigured, registerShopifyProductWebhooks } from "@/lib/shopify";
import { withCache } from "@/lib/cache";
import { requireCompanyContext } from "@/lib/company-os/context";
import {
  archiveSyncedProduct,
  createSyncedProduct,
  listSyncedProducts,
  pullShopifyProductsIntoInventory,
} from "@/lib/company/productSync";

export const dynamic = "force-dynamic";

function tenantForRead() {
  return process.env.ORVANTA_TENANT_ID?.trim() || "golden-star";
}

export async function GET() {
  try {
    const snapshot = await withCache("shopify-snapshot", 30_000, getShopifySnapshot);
    const warehouse = await listSyncedProducts(tenantForRead()).catch(() => []);
    return NextResponse.json({
      ok: true,
      configured: isShopifyConfigured(),
      writeEnabled: isShopifyWriteConfigured(),
      warehouse,
      ...snapshot,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Shopify fetch failed" },
      { status: 500 }
    );
  }
}

/**
 * Site → everything. Owner/manager-authenticated product operations that keep
 * the store, the warehouse, and the books in one synced record.
 */
export async function POST(req: NextRequest) {
  const auth = await requireCompanyContext(req, "MANAGER");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const tenantId = auth.context.tenantId;
    const actor = auth.context.actor.name;

    switch (action) {
      case "create": {
        const result = await createSyncedProduct(
          {
            title: String(body.title || ""),
            sku: body.sku ? String(body.sku) : undefined,
            unitCost: Number(body.unitCost || 0),
            targetPrice: Number(body.targetPrice || 0),
            onHand: Number(body.onHand || 0),
            reorderPoint: Number(body.reorderPoint || 0),
            vendor: body.vendor ? String(body.vendor) : undefined,
            status: body.status === "DRAFT" ? "DRAFT" : "ACTIVE",
          },
          { tenantId, actor, origin: "site" }
        );
        return NextResponse.json(result, { status: result.ok ? 200 : 400 });
      }
      case "delete": {
        const result = await archiveSyncedProduct(
          { sku: body.sku ? String(body.sku) : undefined, shopifyProductId: body.shopifyProductId ? String(body.shopifyProductId) : undefined },
          { tenantId, actor, origin: "site" }
        );
        return NextResponse.json(result, { status: result.ok ? 200 : 400 });
      }
      case "pull": {
        const result = await pullShopifyProductsIntoInventory({ tenantId, actor });
        return NextResponse.json(result, { status: result.ok ? 200 : 400 });
      }
      case "registerWebhooks": {
        if (!isShopifyWriteConfigured()) {
          return NextResponse.json({ ok: false, error: "أكمل مفاتيح Shopify وفعّل SHOPIFY_WRITE_ENABLED أولاً." }, { status: 400 });
        }
        const base = String(body.callbackBaseUrl || process.env.APP_BASE_URL || "").trim();
        if (!base) return NextResponse.json({ ok: false, error: "يلزم رابط الموقع العام (APP_BASE_URL) لتسجيل الـ webhooks." }, { status: 400 });
        const results = await registerShopifyProductWebhooks(base);
        return NextResponse.json({ ok: true, webhooks: results });
      }
      default:
        return NextResponse.json({ ok: false, error: "إجراء غير معروف." }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Shopify action failed" },
      { status: 500 }
    );
  }
}
