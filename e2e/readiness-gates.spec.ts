import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });
test("preview distinguishes expired isolation verification from an unconfigured outbox", async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  const auth = await page.context().request.post("/api/owner-access", { data: { code: process.env.ORVANTA_OWNER_ACCESS_KEY || "" } });
  expect(auth.status()).toBe(200);
  await page.route("**/api/health", (route) => route.fulfill({ json: {
    ok: true,
    checks: { supabase: true, ai: true, accessGate: true, tenantIsolation: false, workflowRuntime: true, outboxPublisher: false, reconciliation: true, vercelMonitoring: true },
    deployment: { platform: "vercel", environment: "preview", isPreview: true, detailedMonitoring: false },
    readiness: { checks: [
      { id: "rls-regression-tested", severity: "FAIL", label: "RLS", detail: "No current passing RLS regression evidence is stored." },
      { id: "outbox-publisher", severity: "FAIL", label: "Outbox", detail: "Outbox destination is not configured." },
    ] },
  } }));
  await page.route("**/api/health/supabase", (route) => route.fulfill({ json: { ok: true, configured: true, tables: {} } }));
  await page.goto("/status");
  const isolation = page.locator(".status-row").filter({ hasText: "عزل البيانات وRLS" });
  const outbox = page.locator(".status-row").filter({ hasText: "Outbox والتسليم الخارجي" });
  await expect(isolation).toContainText("يلزم تحقق حديث");
  await expect(outbox).toContainText("التسليم غير جاهز");
  await expect(isolation).not.toContainText("غير مهيأ للمعاينة");
  await expect(outbox).not.toContainText("غير مهيأ للمعاينة");
});
