import { expect, test } from "@playwright/test";
import { assessIdea } from "../lib/company/ideaAssessment";
import type { Idea } from "../lib/company/ideas";

// Visual/interaction fixtures only. Durability is tested independently by SQL.
test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  const response = await page.context().request.post("/api/owner-access", { data: { code: process.env.ORVANTA_OWNER_ACCESS_KEY || "" } });
  expect(response.status()).toBe(200);
});
test("work desk renders the actual fixture counts and fits desktop and phone", async ({ page }, info) => {
  await page.route("**/api/company/workspace", (route) => route.fulfill({ json: { ok: true, asOf: "2026-09-07T08:00:00Z", counts: { decisions: 3, projects: 2, blocked: 1, proof: 0 }, stages: { study: 2, decision: 3, approved: 1, execution: 2 },
    approvals: [{ id: "fixture-approval", title: "اختبار قناة توزيع جديدة", amount: 8500, requested_role: "المالك", type: "IDEA" }],
    projects: [{ id: "fixture-project", name: "تطوير مسار تجهيز الطلبات", project_number: 14, budget: 12000 }],
    blockers: [{ id: "fixture-task", title: "اعتماد عرض المورد للتجربة", status: "WAITING_FUNDING", project_id: "fixture-project" }],
  } }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "الشركة، بوضوح." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "اختبار قناة توزيع جديدة" })).toBeVisible();
  await expect(page.getByRole("link", { name: "فتح ملف القرار" })).toHaveAttribute("href", "/inbox?decision=fixture-approval");
  await expect(page.getByText("اعتماد عرض المورد للتجربة")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await info.attach("workspace-fixture", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});
test("owner can open a draft, save an operational study, and reach its decision", async ({ page }, info) => {
  const ideas: Idea[] = [];
  await page.route("**/api/company/ideas", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { ok: true, ideas } });
    const body = route.request().postDataJSON();
    if (body.action === "submit") {
      ideas.unshift({ id: "fixture-idea", title: body.title, hypothesis: body.hypothesis, budgetSAR: body.budgetSAR, horizonDays: body.horizonDays, status: "UNDER_STUDY", source: "OWNER", proposedBy: "owner", proposedByName: "المالك", tier: "T1", tierLabel: "التنفيذي", recommendations: [], revision: 0, createdAt: "2026-09-07T08:00:00Z", aggregate: { verdict: "CONDITIONAL", confidence: 0, summary: "غير مكتملة", assessment: assessIdea(body.budgetSAR) } });
      return route.fulfill({ json: { ok: true, idea: ideas[0] } });
    }
    if (body.action === "study") {
      expect(body.revision).toBe(0);
      const assessment = assessIdea(body.budgetSAR, body.study);
      expect(assessment.readyForDecision).toBe(true);
      Object.assign(ideas[0], { revision: 1, status: "PENDING_APPROVAL", approvalId: "fixture-approval", aggregate: { verdict: "CONDITIONAL", confidence: 1, summary: "المدخلات مكتملة، بانتظار القرار.", assessment } });
      return route.fulfill({ json: { ok: true, idea: ideas[0] } });
    }
    return route.fulfill({ status: 400, json: { ok: false, error: "Unexpected fixture command" } });
  });
  await page.goto("/ideas?new=1");
  await page.getByLabel("عنوان الفكرة", { exact: true }).fill("تقليل زمن تجهيز الطلب");
  await page.getByLabel("الفرضية التي سنختبرها").fill("نختبر ترتيب خطوات التجهيز لخفض الوقت دون شراء أدوات جديدة.");
  await page.getByRole("button", { name: "حفظ وفتح الدراسة" }).click();
  await page.getByLabel("نوع الدراسة").selectOption("OPERATIONAL");
  await page.getByLabel("الأثر التشغيلي المتوقع").fill("تقليل مدة تجهيز 10 طلبات من يومين إلى يوم واحد");
  await page.getByLabel("دليل الطلب أو الحاجة", { exact: true }).fill("سجل اختبار يوضح التأخر في تجهيز الطلبات");
  await page.getByLabel("مرجع الدليل", { exact: true }).fill("سجل تجريبي رقم 14 بتاريخ الاختبار");
  await page.getByLabel("مسؤول التنفيذ", { exact: true }).fill("مسؤول التشغيل");
  await page.getByLabel("مؤشر النجاح", { exact: true }).fill("تجهيز عشرة طلبات خلال يوم واحد");
  await page.getByLabel("المخاطر وحدود التجربة", { exact: true }).fill("إيقاف التجربة إذا زادت أخطاء تجهيز الطلبات");
  await page.getByRole("button", { name: "حفظ الدراسة وإعادة التقييم" }).click();
  await expect(page.getByRole("link", { name: "فتح طلب الاعتماد" })).toHaveAttribute("href", "/inbox?decision=fixture-approval");
  await expect(page.getByText("اكتمال المدخلات ليس احتمالاً للنجاح", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await info.attach("operational-study-fixture", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});
test("failed data reads stay distinct from an empty company", async ({ page }) => {
  await page.route("**/api/company/ideas", (route) => route.fulfill({ status: 503, json: { ok: false, error: "تعذر الاتصال بقاعدة البيانات" } }));
  await page.goto("/ideas");
  await expect(page.getByRole("alert").filter({ hasText: "تعذر الاتصال بقاعدة البيانات" })).toBeVisible();
  await expect(page.getByText("مساحة للأفكار التي تستحق الدراسة.")).toHaveCount(0);
});
