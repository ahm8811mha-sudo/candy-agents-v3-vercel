import { expect, test } from "@playwright/test";

const ownerCode = process.env.ORVANTA_OWNER_ACCESS_KEY || "";

// External font CSS is render-blocking; when the sandbox/CI proxy stalls the
// request instead of resetting it, first paint hangs and visibility asserts
// time out. Abort those requests so browser tests are deterministic.
test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
});

test("only the top-level health endpoint is public", async ({ request }) => {
  const publicHealth = await request.get("/api/health");
  expect(publicHealth.status()).toBe(200);

  const detailedDatabaseHealth = await request.get("/api/health/supabase");
  expect(detailedDatabaseHealth.status()).toBe(401);
  await expect(detailedDatabaseHealth.json()).resolves.toMatchObject({ code: "OWNER_ACCESS_REQUIRED" });
});

test("anonymous visitors are redirected and the trusted owner device unlocks", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: /فتح Orvanta على هذا الجهاز/ })).toBeVisible();

  await page.getByLabel("رمز وصول المالك").fill(ownerCode);
  await page.getByRole("button", { name: "فتح النسخة الخاصة" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: /شركة كاملة يديرها الذكاء الاصطناعي/ })
  ).toBeVisible();

  await page.goto("/status");
  await expect(page.getByRole("heading", { name: "النظام" })).toBeVisible();
  await expect(page.getByText("مركز الاعتمادية والتشغيل")).toBeVisible();
});

test("locking the device restores the access gate", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("رمز وصول المالك").fill(ownerCode);
  await page.getByRole("button", { name: "فتح النسخة الخاصة" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.getByTitle("قفل النسخة الخاصة على هذا الجهاز").click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/status");
  await expect(page).toHaveURL(/\/login/);
});
