import { expect, test } from "@playwright/test";

const ownerCode = process.env.ORVANTA_OWNER_ACCESS_KEY || "";

// Network mocks must win over the PWA worker in both Chromium and WebKit.
test.use({ serviceWorkers: "block" });

async function unlock(page: import("@playwright/test").Page) {
  // Layout tests should not duplicate the dedicated login-UI journey. Using
  // the browser context's request client shares the signed cookie with the
  // page and avoids a WebKit navigation race under parallel CI load.
  const response = await page.context().request.post("/api/owner-access", {
    data: { code: ownerCode },
  });
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({ ok: true, authenticated: true });
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
}

test("the action queue keeps zero counts legible and compact on mobile", async ({ page }) => {
  await page.route(/\/api\/company\/actions\?/, async (route) => {
    await route.fulfill({ json: { ok: true, actions: [] } });
  });
  await page.route(/\/api\/integrations\/status$/, async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        googleWorkspace: {
          enabled: true,
          disabledByFlag: false,
          credentialsConfigured: true,
          capabilities: { gmail: true, sheets: true, drive: true },
          missingEnvironmentVariables: [],
        },
        supportedActionTypes: [],
        actionPlans: {},
      },
    });
  });

  await unlock(page);
  await page.goto("/operations");
  await page.getByRole("tab", { name: "لوحة المتابعة" }).click();
  await expect(page.getByRole("heading", { name: "لوحة متابعة الشركة" })).toBeVisible();

  await expect(page.getByText("Google Workspace جاهز للتنفيذ")).toBeVisible();
  for (const label of ["بانتظار", "قيد التنفيذ", "مكتمل", "فشل"]) {
    await expect(page.getByLabel(`${label}: 0`)).toBeVisible();
  }

  const cards = page.locator(".action-queue-metric");
  await expect(cards).toHaveCount(4);
  const boxes = await cards.evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { top: Math.round(box.top), height: Math.round(box.height) };
  }));
  const summaryHeight = await page.locator(".action-queue-summary").evaluate((element) =>
    Math.round(element.getBoundingClientRect().height)
  );
  expect(Math.max(...boxes.map((box) => box.height))).toBeLessThanOrEqual(140);
  expect(new Set(boxes.map((box) => box.top)).size).toBeLessThanOrEqual(2);
  expect(summaryHeight).toBeLessThanOrEqual(260);
});

test("a preview deployment explains isolated secrets instead of reporting a false production failure", async ({ page }) => {
  await page.route(/\/api\/health$/, async (route) => {
    await route.fulfill({
      json: {
        ok: true,
        productionReady: false,
        checks: {
          supabase: false,
          ai: true,
          accessGate: true,
          tenantIsolation: false,
          workflowRuntime: true,
          outboxPublisher: true,
          reconciliation: true,
          vercelMonitoring: true,
        },
        deployment: {
          platform: "vercel",
          environment: "preview",
          isPreview: true,
          productionUrl: "https://candy-agents-v3-vercel.vercel.app",
          detailedMonitoring: false,
        },
      },
    });
  });
  await page.route(/\/api\/health\/supabase$/, async (route) => {
    await route.fulfill({ status: 503, json: { ok: false, configured: false } });
  });

  await unlock(page);
  await page.goto("/status");

  await expect(page.getByText(/هذه نسخة معاينة معزولة/)).toBeVisible();
  await expect(page.getByRole("link", { name: "افتح النسخة الإنتاجية" })).toHaveAttribute(
    "href",
    "https://candy-agents-v3-vercel.vercel.app"
  );
  await expect(page.getByText("غير مهيأ للمعاينة").first()).toBeVisible();
  await expect(page.getByText("النشر على Vercel")).toBeVisible();
  await expect(page.getByText("النشر يعمل")).toBeVisible();
});

test("the executive office replaces the raw Supabase error with an actionable preview state", async ({ page }) => {
  await page.route(/\/api\/executive-office$/, async (route) => {
    await route.fulfill({
      status: 503,
      json: {
        ok: false,
        code: "SUPABASE_NOT_CONFIGURED",
        configured: false,
        error: "هذه نسخة معاينة معزولة ولا تحتوي على اتصال قاعدة البيانات. افتح النسخة الإنتاجية لعرض بيانات المكتب التنفيذي الفعلية.",
        deployment: {
          environment: "preview",
          isPreview: true,
          productionUrl: "https://candy-agents-v3-vercel.vercel.app",
        },
        missingEnvironmentVariables: [
          "NEXT_PUBLIC_SUPABASE_URL (أو SUPABASE_URL)",
          "SUPABASE_SECRET_KEY (أو SUPABASE_SERVICE_ROLE_KEY)",
        ],
      },
    });
  });

  await unlock(page);
  await page.goto("/departments/executive");

  await expect(page.getByText("نسخة المعاينة معزولة عن بيانات الإنتاج")).toBeVisible();
  await expect(page.getByRole("link", { name: "فتح النسخة الإنتاجية" })).toHaveAttribute(
    "href",
    "https://candy-agents-v3-vercel.vercel.app"
  );
  await expect(page.getByText("Supabase is not configured.")).toHaveCount(0);
  await expect(page.getByText("صحة الشركة —")).toBeVisible();
  await expect(page.getByText("Preview isolated")).toBeVisible();
  await expect(page.getByRole("button", { name: "تشغيل رادار الفرص" })).toBeDisabled();
  await expect(page.locator(".ops-metrics")).toHaveCount(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
