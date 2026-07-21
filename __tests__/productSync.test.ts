import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { verifyShopifyWebhook, isShopifyWebhookConfigured } from "../lib/shopify";
import { createHmac } from "node:crypto";
import { createSyncedProduct, archiveSyncedProduct, pullShopifyProductsIntoInventory } from "../lib/company/productSync";

describe("verifyShopifyWebhook", () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; });

  it("is not configured without a secret", () => {
    delete process.env.SHOPIFY_WEBHOOK_SECRET;
    delete process.env.SHOPIFY_API_SECRET;
    expect(isShopifyWebhookConfigured()).toBe(false);
    expect(verifyShopifyWebhook("{}", "anything")).toBe(false);
  });

  it("accepts a correctly signed body and rejects a tampered one", () => {
    process.env.SHOPIFY_WEBHOOK_SECRET = "shhh-secret";
    const body = JSON.stringify({ id: 123, title: "Test" });
    const good = createHmac("sha256", "shhh-secret").update(body, "utf8").digest("base64");
    expect(verifyShopifyWebhook(body, good)).toBe(true);
    expect(verifyShopifyWebhook(body, good.slice(0, -2) + "xy")).toBe(false);
    expect(verifyShopifyWebhook(body + " ", good)).toBe(false);
    expect(verifyShopifyWebhook(body, null)).toBe(false);
  });
});

describe("productSync without Supabase", () => {
  const original = { ...process.env };
  beforeEach(() => {
    // No Supabase, no Shopify write — every path must degrade, never throw.
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SHOPIFY_STORE_DOMAIN;
    delete process.env.SHOPIFY_ACCESS_TOKEN;
    delete process.env.SHOPIFY_WRITE_ENABLED;
  });
  afterEach(() => { process.env = { ...original }; });

  it("createSyncedProduct fails safely without Supabase", async () => {
    const result = await createSyncedProduct({ title: "حقيبة" });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Supabase/);
  });

  it("createSyncedProduct rejects an empty title", async () => {
    const result = await createSyncedProduct({ title: "   " });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/مطلوب/);
  });

  it("archiveSyncedProduct fails safely without Supabase", async () => {
    const result = await archiveSyncedProduct({ sku: "x-1" });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Supabase/);
  });

  it("pullShopifyProductsIntoInventory reports disconnected store", async () => {
    const result = await pullShopifyProductsIntoInventory();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/المتجر غير متصل/);
  });
});
