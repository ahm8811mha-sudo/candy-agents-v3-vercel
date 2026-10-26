import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("an anonymous visit to the command page stays on the login", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/commands");
  await expect(page).toHaveURL(/\/login/);
  await context.close();
});

test.describe("owner command desk", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
    const response = await page.context().request.post("/api/owner-access", {
      data: { code: process.env.ORVANTA_OWNER_ACCESS_KEY || "" },
    });
    expect(response.status()).toBe(200);
  });

  test("the chairman issues an order and opens its tracking card", async ({ page }) => {
    const text = `يا سارة راجع الميزانية ${Date.now().toString(36)}`;
    await page.goto("/");
    const form = page.getByRole("form", { name: "أمر رئيس مجلس الإدارة" }).first();
    await expect(form.getByRole("combobox", { name: "الموظف المسؤول" })).toHaveValue("automatic");
    await form.getByRole("textbox", { name: "الأمر" }).fill(text);
    await form.getByRole("combobox", { name: "الأولوية" }).selectOption("HIGH");
    await form.getByRole("button", { name: "إصدار الأمر" }).click();
    await expect(form.getByRole("status")).toContainText("سارة");
    await form.getByRole("link", { name: "بطاقة المتابعة" }).click();
    await expect(page).toHaveURL(/\/commands#cmd-/);

    const card = page.locator("article", { hasText: text });
    await expect(card).toBeVisible();
    await expect(card.getByText("سارة", { exact: true })).toBeVisible();
    await expect(card.getByText("في سلسلة الصرف")).toBeVisible();
    await expect(card.getByText("النتيجة والدليل")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/commands");
    const phoneForm = page.getByRole("form", { name: "أمر رئيس مجلس الإدارة" });
    await expect(phoneForm.getByRole("button", { name: "إصدار الأمر" })).toBeVisible();
    await expect(page.getByRole("link", { name: /الأوامر/ }).first()).toBeVisible();
    const box = await phoneForm.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x || 0) + (box?.width || 0)).toBeLessThanOrEqual(391);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
});
