import { expect, test } from "@playwright/test";

const ownerCode = process.env.ORVANTA_OWNER_ACCESS_KEY || "";

async function unlock(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("رمز وصول المالك").fill(ownerCode);
  await page.getByRole("button", { name: "فتح النسخة الخاصة" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("the action queue keeps zero counts legible and compact on mobile", async ({ page }) => {
  await page.route("**/api/company/actions?**", async (route) => {
    await route.fulfill({ json: { ok: true, actions: [] } });
  });
  await page.route("**/api/integrations/status", async (route) => {
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
  await page.goto("/operations?tab=dashboard");

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
  expect(Math.max(...boxes.map((box) => box.height))).toBeLessThanOrEqual(100);
  expect(new Set(boxes.map((box) => box.top)).size).toBeLessThanOrEqual(2);
});

test("a preview deployment explains isolated secrets instead of reporting a false production failure", async ({ page }) => {
  await page.route("**/api/health", async (route) => {
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
  await page.route("**/api/health/supabase", async (route) => {
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
