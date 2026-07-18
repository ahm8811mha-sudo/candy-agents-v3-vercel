import { expect, test } from "@playwright/test";

// Abort render-blocking external font CSS so a stalled proxy can't hang paint.
test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
});

test("the protected Company Brain workspace opens on a trusted owner device", async ({ page }) => {
  await page.goto("/company-brain");
  await expect(page).toHaveURL(/\/login/);

  const ownerCode = process.env.ORVANTA_OWNER_ACCESS_KEY;
  if (!ownerCode) throw new Error("ORVANTA_OWNER_ACCESS_KEY is required for the browser test.");

  await page.locator('input[type="password"]').fill(ownerCode);
  await page.getByRole("button", { name: "فتح النسخة الخاصة" }).click();
  await expect(page).not.toHaveURL(/\/login/);

  await page.goto("/company-brain");
  await expect(page.getByRole("heading", { name: "العقل المؤسسي" })).toBeVisible();
  await expect(page.getByText("صحة الشركة", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "تحديث العقل المؤسسي" })).toBeVisible();
});
