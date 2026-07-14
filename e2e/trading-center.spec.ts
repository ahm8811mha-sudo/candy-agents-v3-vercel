import { expect, test } from "@playwright/test";

const ownerCode = process.env.ORVANTA_OWNER_ACCESS_KEY || "";

test.use({ serviceWorkers: "block" });

async function unlock(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("رمز وصول المالك").fill(ownerCode);
  await page.getByRole("button", { name: "فتح النسخة الخاصة" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("trading center shows an honest paper setup and demo data without mobile overflow", async ({ page }) => {
  await page.route(/\/api\/trading\/account$/, async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        configured: false,
        mode: "paper",
        liveRequested: false,
        liveEnabled: false,
        missingEnvironmentVariables: ["ALPACA_API_KEY (أو APCA_API_KEY_ID)", "ALPACA_API_SECRET (أو APCA_API_SECRET_KEY)"],
        symbol: "SPY",
        feed: "iex",
        deployment: {
          environment: "preview",
          isPreview: true,
          productionUrl: "https://candy-agents-v3-vercel.vercel.app",
        },
      },
    });
  });
  await page.route(/\/api\/trading\/signal$/, async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        demo: true,
        source: "demo",
        symbol: "SPY",
        asOf: null,
        signal: {
          signal: "HOLD",
          reason: "لا توجد إشارة واضحة",
          price: 100,
          takeProfit: null,
          stopLoss: null,
          volatilityPct: 0.001,
          indicators: {
            rsi: 48.2,
            bb: { upper: 101, middle: 100, lower: 99 },
            macd: { macd: 0.1, signal: 0.1, histogram: 0 },
            atr: 0.2,
          },
        },
        market: { isOpen: false, minutesToClose: 0, shouldFlatten: false, source: "local" },
        config: { volatilityMaxPct: 0.005, takeProfitPct: 0.003, stopLossPct: 0.002 },
        sessionLimits: { maxDailyLossPct: 0.02, maxOpenPositions: 3, maxTradesPerDay: 8 },
        broker: { configured: false, mode: "paper", feed: "iex" },
      },
    });
  });
  await page.route(/\/api\/trading$/, async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        liveEnabled: false,
        budget: 100000,
        broker: {
          configured: false,
          mode: "paper",
          liveRequested: false,
          liveEnabled: false,
          missingEnvironmentVariables: ["ALPACA_API_KEY", "ALPACA_API_SECRET"],
        },
        opportunities: [],
      },
    });
  });
  await page.route(/\/api\/approvals\/decisions$/, async (route) => {
    await route.fulfill({ json: { ok: true, approvals: [], stats: { pending: 0, approved: 0, rejected: 0, total: 0 } } });
  });

  await unlock(page);
  await page.goto("/operations");
  await page.getByRole("tab", { name: "التداول" }).click();

  await expect(page.getByRole("heading", { name: "الرصيد وحالة الوسيط" })).toBeVisible();
  await expect(page.getByText("تهيئة Alpaca Paper مطلوبة")).toBeVisible();
  await expect(page.getByText("بيانات تجريبية", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("الوسيط غير مربوط")).toBeVisible();
  await expect(page.getByRole("button", { name: "طلب تنفيذ حقيقي" })).toBeDisabled();
  await expect(page.getByRole("link", { name: /افتح نسخة الإنتاج/ })).toHaveAttribute(
    "href",
    "https://candy-agents-v3-vercel.vercel.app"
  );

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
