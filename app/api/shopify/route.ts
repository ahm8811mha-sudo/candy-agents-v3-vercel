import { NextResponse } from "next/server";
import { getShopifySnapshot, isShopifyConfigured } from "@/lib/shopify";
import { withCache } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await withCache("shopify-snapshot", 30_000, getShopifySnapshot);
    return NextResponse.json({
      ok: true,
      configured: isShopifyConfigured(),
      ...snapshot,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Shopify fetch failed" },
      { status: 500 }
    );
  }
}
