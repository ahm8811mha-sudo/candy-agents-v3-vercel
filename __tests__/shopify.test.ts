import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isShopifyConfigured, getShopifySnapshot } from "../lib/shopify";

describe("shopify", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.SHOPIFY_STORE_DOMAIN;
    delete process.env.SHOPIFY_ACCESS_TOKEN;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("reports not configured without env vars", () => {
    expect(isShopifyConfigured()).toBe(false);
  });

  it("reports configured when both env vars present", () => {
    process.env.SHOPIFY_STORE_DOMAIN = "test-store";
    process.env.SHOPIFY_ACCESS_TOKEN = "shpat_xxx";
    expect(isShopifyConfigured()).toBe(true);
  });

  it("returns mock snapshot when not configured", async () => {
    const snapshot = await getShopifySnapshot();
    expect(snapshot.source).toBe("mock");
    expect(snapshot.connected).toBe(false);
    expect(snapshot.products.length).toBeGreaterThan(0);
    expect(snapshot.orders.length).toBeGreaterThan(0);
  });

  it("computes sales summary correctly from mock data", async () => {
    const snapshot = await getShopifySnapshot();
    // Only "paid" orders count toward revenue.
    const expectedRevenue = snapshot.orders
      .filter((o) => o.financialStatus === "paid")
      .reduce((sum, o) => sum + o.totalPrice, 0);
    expect(snapshot.summary.totalRevenue).toBe(expectedRevenue);
    expect(snapshot.summary.orderCount).toBe(snapshot.orders.length);
  });

  it("computes average order value as revenue divided by order count", async () => {
    const snapshot = await getShopifySnapshot();
    const expected = Math.round(snapshot.summary.totalRevenue / snapshot.summary.orderCount);
    expect(snapshot.summary.averageOrderValue).toBe(expected);
  });

  it("flags low-stock active products only", async () => {
    const snapshot = await getShopifySnapshot();
    const expectedLow = snapshot.products.filter((p) => p.status === "active" && p.totalInventory <= 5).length;
    expect(snapshot.summary.lowStockCount).toBe(expectedLow);
  });
});
