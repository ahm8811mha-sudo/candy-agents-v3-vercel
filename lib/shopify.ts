/**
 * Shopify Admin API client.
 *
 * Follows the project's graceful-degradation pattern: when SHOPIFY_STORE_DOMAIN
 * and SHOPIFY_ACCESS_TOKEN are configured, real store data is fetched from the
 * Shopify Admin REST API. Otherwise representative mock data is returned so the
 * UI and downstream departments (finance / procurement / marketing) keep working.
 */

const API_VERSION = "2024-01";

export type ShopifyProduct = {
  id: string;
  title: string;
  status: string;
  totalInventory: number;
  price: number;
  vendor: string;
};

export type ShopifyOrder = {
  id: string;
  name: string;
  totalPrice: number;
  financialStatus: string;
  fulfillmentStatus: string;
  createdAt: string;
};

export type ShopifySalesSummary = {
  totalRevenue: number;
  orderCount: number;
  averageOrderValue: number;
  unfulfilledCount: number;
  lowStockCount: number;
  currency: string;
};

export type ShopifySnapshot = {
  connected: boolean;
  source: "live" | "mock";
  shopName: string;
  products: ShopifyProduct[];
  orders: ShopifyOrder[];
  summary: ShopifySalesSummary;
};

function storeDomain() {
  return process.env.SHOPIFY_STORE_DOMAIN;
}

function accessToken() {
  return process.env.SHOPIFY_ACCESS_TOKEN;
}

export function isShopifyConfigured(): boolean {
  return Boolean(storeDomain() && accessToken());
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function shopifyFetch<T>(path: string): Promise<T> {
  const domain = storeDomain();
  const token = accessToken();
  if (!domain || !token) throw new Error("Shopify is not configured.");

  const base = domain.includes(".") ? domain : `${domain}.myshopify.com`;
  const res = await fetch(`https://${base}/admin/api/${API_VERSION}/${path}`, {
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    // Shopify data changes frequently; never cache at the fetch layer.
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Shopify API error ${res.status}: ${res.statusText}`);
  }
  return (await res.json()) as T;
}

function mockSnapshot(): ShopifySnapshot {
  const products: ShopifyProduct[] = [
    { id: "p-1001", title: "حقيبة جلد فاخرة", status: "active", totalInventory: 8, price: 320, vendor: "Candy Leather" },
    { id: "p-1002", title: "ساعة كلاسيكية", status: "active", totalInventory: 3, price: 540, vendor: "Candy Time" },
    { id: "p-1003", title: "نظارة شمسية", status: "active", totalInventory: 45, price: 180, vendor: "Candy Optics" },
    { id: "p-1004", title: "محفظة رجالية", status: "draft", totalInventory: 0, price: 145, vendor: "Candy Leather" },
  ];
  const orders: ShopifyOrder[] = [
    { id: "o-5001", name: "#5001", totalPrice: 540, financialStatus: "paid", fulfillmentStatus: "fulfilled", createdAt: new Date(Date.now() - 86400000).toISOString() },
    { id: "o-5002", name: "#5002", totalPrice: 500, financialStatus: "paid", fulfillmentStatus: "unfulfilled", createdAt: new Date(Date.now() - 43200000).toISOString() },
    { id: "o-5003", name: "#5003", totalPrice: 180, financialStatus: "pending", fulfillmentStatus: "unfulfilled", createdAt: new Date().toISOString() },
  ];
  return {
    connected: false,
    source: "mock",
    shopName: "متجر تجريبي (Candy Store)",
    products,
    orders,
    summary: buildSummary(products, orders, "SAR"),
  };
}

function buildSummary(
  products: ShopifyProduct[],
  orders: ShopifyOrder[],
  currency: string
): ShopifySalesSummary {
  const totalRevenue = orders
    .filter((o) => o.financialStatus === "paid")
    .reduce((sum, o) => sum + o.totalPrice, 0);
  const orderCount = orders.length;
  return {
    totalRevenue,
    orderCount,
    averageOrderValue: orderCount ? Math.round(totalRevenue / orderCount) : 0,
    unfulfilledCount: orders.filter((o) => o.fulfillmentStatus !== "fulfilled").length,
    lowStockCount: products.filter((p) => p.status === "active" && p.totalInventory <= 5).length,
    currency,
  };
}

type RawProduct = {
  id: number;
  title: string;
  status: string;
  vendor: string;
  variants?: Array<{ price?: string; inventory_quantity?: number }>;
};

type RawOrder = {
  id: number;
  name: string;
  total_price?: string;
  financial_status?: string;
  fulfillment_status?: string | null;
  created_at: string;
  currency?: string;
};

export async function getShopifySnapshot(): Promise<ShopifySnapshot> {
  if (!isShopifyConfigured()) {
    return mockSnapshot();
  }

  try {
    const [productsRes, ordersRes, shopRes] = await Promise.all([
      shopifyFetch<{ products: RawProduct[] }>("products.json?limit=50"),
      shopifyFetch<{ orders: RawOrder[] }>("orders.json?status=any&limit=50"),
      shopifyFetch<{ shop: { name: string; currency: string } }>("shop.json"),
    ]);

    const products: ShopifyProduct[] = (productsRes.products || []).map((p) => ({
      id: String(p.id),
      title: p.title,
      status: p.status,
      vendor: p.vendor || "—",
      price: num(p.variants?.[0]?.price),
      totalInventory: (p.variants || []).reduce((sum, v) => sum + num(v.inventory_quantity), 0),
    }));

    const orders: ShopifyOrder[] = (ordersRes.orders || []).map((o) => ({
      id: String(o.id),
      name: o.name,
      totalPrice: num(o.total_price),
      financialStatus: o.financial_status || "unknown",
      fulfillmentStatus: o.fulfillment_status || "unfulfilled",
      createdAt: o.created_at,
    }));

    const currency = shopRes.shop?.currency || "SAR";

    return {
      connected: true,
      source: "live",
      shopName: shopRes.shop?.name || storeDomain() || "Shopify Store",
      products,
      orders,
      summary: buildSummary(products, orders, currency),
    };
  } catch {
    // On any live failure, degrade gracefully to mock data rather than break the UI.
    return { ...mockSnapshot(), shopName: "متجر غير متصل (تعذّر الوصول)" };
  }
}
