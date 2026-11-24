import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  const response = await page.context().request.post("/api/owner-access", { data: { code: process.env.ORVANTA_OWNER_ACCESS_KEY || "" } });
  expect(response.status()).toBe(200);
});

const id = "apr-dedupe-fixture";
const item = { id, kind: "decision", title: "تجربة رادار الفرص", amountSAR: 5000, stage: "قرار رئيس المجلس", holderId: "owner", holderName: "رئيس مجلس الإدارة", status: "بانتظار قرارك", reason: null, createdAt: "2026-10-27T05:55:00Z", updatedAt: "2026-11-24T10:00:00Z", dueAt: null, href: `/inbox?decision=${id}`, duplicateCount: 1 };
const file = (status = "PENDING") => ({
  ok: true, item, detail: "إجراء مؤسسي · النوع تجربة رادار الفرص", approvalStatus: status, decidedAt: status === "PENDING" ? null : "2026-11-24T11:00:00Z", decisionNote: status === "REJECTED" ? "لا سيولة الآن" : null,
  preparedBy: "راصد", memo: { options: "أ أو ب", expectedReturn: "قائمة اهتمام", risks: "لا سيولة" },
  reviews: [{ stage: "finance", stageName: "المالية (عبدالرحمن)", result: "مشروط", note: "لا صرف قبل رفع التعليق", by: "abdulrahman", byName: "عبدالرحمن", at: "2026-11-24T10:00:00Z" },
    { stage: "ceo", stageName: "الرئيس التنفيذي (سلطان)", result: "تعديل", note: "أوصي بالرفض الآن", by: "sultan", byName: "سلطان", at: "2026-11-24T10:05:00Z" }],
  archived: null,
  position: { stage: "owner", holder: "owner", holderName: "رئيس مجلس الإدارة", since: "2026-11-24T10:05:00Z", slaHours: 48, overdueHours: 0, escalations: 0, nextStep: "قرارك: اعتماد أو رفض" },
  decision: { actionable: status === "PENDING", canApprove: status === "PENDING", stopped: null },
});

test("the spend file shows the full chain and the Chairman rejects it there with a reason", async ({ page }) => {
  let posted: Record<string, unknown> | null = null;
  await page.route(`**/api/company/spend/${id}`, (route) => route.fulfill({ json: file(posted ? "REJECTED" : "PENDING") }));
  await page.route("**/api/approvals/decisions", async (route) => { posted = route.request().postDataJSON(); await route.fulfill({ json: { ok: true } }); });
  await page.goto(`/spend/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: "ملف طلب صرف" })).toBeVisible();
  // The file never links to itself.
  await expect(page.getByRole("link", { name: "فتح الملف" })).toHaveCount(0);
  await expect(page.getByText("أوصي بالرفض الآن")).toBeVisible();
  await expect(page.getByRole("button", { name: "اعتماد الصرف" })).toBeVisible();
  await page.getByRole("button", { name: "رفض" }).click();
  await page.getByRole("button", { name: "تأكيد الرفض" }).click();
  await expect(page.locator("p.ov-alert")).toContainText("سبب الرفض");
  await page.getByRole("textbox", { name: "سبب الرفض" }).fill("لا سيولة الآن");
  await page.getByRole("button", { name: "تأكيد الرفض" }).click();
  await expect.poll(() => posted).toMatchObject({ id, decision: "REJECTED", note: "لا سيولة الآن" });
  await expect(page.getByRole("status").filter({ hasText: "سُجّل الرفض" })).toBeVisible();
  await expect(page.getByText("مرفوض")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("a request still in the chain shows who holds it and no decision buttons", async ({ page }) => {
  const inChain = { ...file(), item: { ...item, kind: "spend", stage: "إعداد القسم", holderId: "rased", holderName: "راصد" }, reviews: [],
    position: { stage: "department", holder: "rased", holderName: "راصد", since: "2026-10-27T05:55:00Z", slaHours: 48, overdueHours: 676, escalations: 1, nextStep: "مذكرة القسم" },
    decision: { actionable: false, canApprove: false, stopped: null } };
  await page.route(`**/api/company/spend/${id}`, (route) => route.fulfill({ json: inChain }));
  await page.goto(`/spend/${id}`);
  await expect(page.getByText("متأخر 676 ساعة")).toBeVisible();
  await expect(page.getByText("الطلب ما زال عند راصد")).toBeVisible();
  await expect(page.getByRole("button", { name: "اعتماد الصرف" })).toHaveCount(0);
});

test("a decision link opens that decision, not the first card", async ({ page }) => {
  const row = (n: number) => ({ id: `apr-${n}`, channel: "COMPANY", actionsVia: "approvals", type: "BUDGET", title: `قرار رقم ${n}`, detail: "", amount: 1000 * n, requestedBy: "CFO", status: "PENDING", createdAt: `2026-11-2${n}T08:00:00Z` });
  await page.route("**/api/inbox", (route) => route.fulfill({ json: { ok: true, items: [row(1), row(2), row(3)], commands: [], pending: 3 } }));
  await page.goto("/inbox?decision=apr-3");
  await expect(page.locator(".decide-detail__title")).toHaveText("قرار رقم 3");
  await expect(page.getByText("عبدالرحمن (المالية)").first()).toBeVisible();
});

test("the Chairman picks one of Sultan's scored options; the best one is marked with its percentage", async ({ page }) => {
  let posted: Record<string, unknown> | null = null;
  const options = [
    { key: "أ", label: "صرف 5,000 كاملة الآن", amountSAR: 5000, score: 5, recommended: false, rationale: "" },
    { key: "ب", label: "تحقق عضوي بلا صرف", amountSAR: 0, score: 70, recommended: true, rationale: "لا سيولة" },
    { key: "ج", label: "سقف 1,500 بعد رفع التعليق", amountSAR: 1500, score: 25, recommended: false, rationale: "" },
  ];
  await page.route(`**/api/company/spend/${id}`, (route) => route.fulfill({ json: { ...file(), options, consultations: [{ result: "موافق", note: "الحملة العضوية تكفي", by: "noura", byName: "نورة", at: "2026-11-24T10:10:00Z" }], project: { id: "p1", href: "/projects?project=p1" } } }));
  await page.route("**/api/approvals/decisions", async (route) => { posted = route.request().postDataJSON(); await route.fulfill({ json: { ok: true } }); });
  await page.goto(`/spend/${id}`);
  const best = page.locator(".ov-option.is-best");
  await expect(best).toContainText("70%");
  await expect(best).toContainText("الخيار الموصى به");
  await expect(page.getByText("الحملة العضوية تكفي")).toBeVisible();
  await expect(page.getByRole("link", { name: "فتح المشروع المرتبط" })).toHaveAttribute("href", "/projects?project=p1");
  await page.getByRole("button", { name: "اختيار الخيار (ب)" }).click();
  await expect.poll(() => posted).toMatchObject({ id, optionKey: "ب", decision: "REJECTED" });
});

test("the decisions file lists requests by stage with the best option and links", async ({ page }) => {
  await page.route("**/api/company/decisions-file", (route) => route.fulfill({ json: { ok: true, decisions: [
    { ...item, group: "awaiting", approvalStatus: "PENDING", decidedAt: null, decisionNote: null, bestOption: { key: "ب", label: "تحقق عضوي بلا صرف", score: 70, amountSAR: 0 }, optionsCount: 3, project: null, fileHref: `/spend/${id}` },
  ] } }));
  await page.goto("/decisions");
  await expect(page.getByRole("heading", { level: 1, name: "ملف القرارات" })).toBeVisible();
  await expect(page.getByText("تحقق عضوي بلا صرف (70%)")).toBeVisible();
  await expect(page.getByRole("link", { name: "افتح وقرّر" })).toHaveAttribute("href", `/spend/${id}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("the phone bottom bar keeps every main screen on one visible row", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/office");
  const links = page.locator(".mobile-work-nav a");
  await expect(links).toHaveCount(6);
  const boxes = await links.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), bottom: r.bottom })));
  expect(new Set(boxes.map((b) => b.top)).size).toBe(1);
  for (const box of boxes) expect(box.bottom).toBeLessThanOrEqual(844);
});
