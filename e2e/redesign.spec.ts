import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  const response = await page.context().request.post("/api/owner-access", { data: { code: process.env.ORVANTA_OWNER_ACCESS_KEY || "" } });
  expect(response.status()).toBe(200);
});

const card = {
  id: "cmd:cmd-fixture", kind: "command-decision", commandId: "cmd-fixture", approvalId: null,
  question: "هل تعتمد توصية سلطان في أمر: «تجديد عقد المستودع»؟", subject: "تجديد عقد المستودع", ownerName: "ماجد",
  options: "", recommendation: "موافقة: التجديد لسنة بنفس السعر.", finance: "موافق", governance: "سليم", legal: null, amountSAR: null,
  evidencePath: "/commands?id=cmd-fixture", ifNoDecision: "لا يُطبّق شيء تلقائياً.", requestedAt: "2026-11-13T10:00:00Z",
  remindAt: "2026-11-15T10:00:00Z", expiresAt: "2099-11-20T10:00:00Z", reminderDue: false, ageHours: 2, lowRisk: true, duplicateCount: 1,
  actions: ["approve", "reject", "return", "defer"],
};

test("the five screens are in the navigation and the desk decides a card", async ({ page }) => {
  let decided: unknown = null;
  await page.route("**/api/commands?view=desk", (route) => route.fulfill({ json: { ok: true, desk: { generatedAt: "2026-11-13T12:00:00Z", digestAt: "2026-11-13T17:00:00Z", cards: decided ? [] : [card], waiting: 0, deferred: [], expired: [], overdue: [], returned: [], counts: {} } } }));
  await page.route("**/api/commands", async (route) => {
    if (route.request().method() === "POST") { decided = route.request().postDataJSON(); return route.fulfill({ json: { ok: true } }); }
    return route.continue();
  });
  await page.goto("/");
  const narrow = (page.viewportSize()?.width || 1280) < 960;
  const nav = page.getByRole("navigation", { name: narrow ? "تنقل سريع" : "سير العمل" });
  for (const label of ["مكتبي", "المكتب الحي", "الأوامر", "الاجتماعات", "الأرشيف"]) await expect(nav.getByRole("link", { name: new RegExp(label) })).toBeVisible();
  const desk = page.getByRole("article", { name: card.question });
  await expect(desk.locator(".ov-rec")).toContainText("التجديد لسنة");
  await desk.getByRole("button", { name: "اعتماد" }).click();
  await expect.poll(() => decided).toMatchObject({ action: "decide", commandId: "cmd-fixture", decision: "approve" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("the live office seats every employee and opens a desk", async ({ page }) => {
  await page.goto("/office");
  await expect(page.getByRole("heading", { name: "المكتب الحي" })).toBeVisible();
  await expect(page.locator(".ov-deskbtn")).toHaveCount(11);
  await page.locator(".ov-deskbtn", { hasText: "سلطان" }).click();
  await expect(page.locator(".ov-panel")).toContainText("سلطان");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.goto("/office/finance");
  await expect(page.getByRole("heading", { level: 1, name: "قطاع المالية" })).toBeVisible();
});

test("meetings and archive open without errors", async ({ page }) => {
  await page.goto("/meetings");
  await expect(page.getByRole("heading", { name: "الاجتماعات" })).toBeVisible();
  await page.goto("/archive");
  await expect(page.getByRole("heading", { name: "الأرشيف" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /مؤرشف/ })).toBeVisible();
});

test("every office counter opens the list of what it counts", async ({ page }) => {
  const office = JSON.parse(readFileSync(path.join(__dirname, "fixtures", "office-counters.json"), "utf8")) as { counters: Record<string, number>; counterItems: Record<string, Array<{ title: string }>> };
  await page.route("**/api/company/office", (route) => route.fulfill({ json: { ...office, asOf: new Date().toISOString() } }));
  await page.goto("/office");
  const counters = page.getByRole("group", { name: "حالة الشركة" });
  const returned = counters.getByRole("button", { name: /معاد للأقسام/ });
  await expect(returned).toContainText(String(office.counters.returned));
  await returned.click();
  await expect(returned).toHaveAttribute("aria-expanded", "true");
  const panel = page.getByRole("region", { name: /معاد للأقسام: القائمة/ });
  await expect(panel.locator(".ov-drill-item")).toHaveCount(office.counters.returned);
  await expect(panel).toContainText("راصد");
  await expect(panel).toContainText("السبب:");
  await expect(panel.getByRole("link", { name: "فتح الملف" }).first()).toHaveAttribute("href", /\/spend\//);
  const chain = counters.getByRole("button", { name: /طلب صرف في السلسلة/ });
  await chain.click();
  await expect(page.getByRole("region", { name: /طلب صرف في السلسلة: القائمة/ }).locator(".ov-drill-item")).toHaveCount(office.counters.spendInChain);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
