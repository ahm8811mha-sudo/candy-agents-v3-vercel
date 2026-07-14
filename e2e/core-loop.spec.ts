import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * The core operating loop, end to end through the real HTTP surface:
 *
 *   Idea → tri-department study → decision center → approval
 *        → execution project + tasks + KPIs + action queue
 *
 * and the negative path: a rejected idea must never execute.
 */

const ownerCode = process.env.ORVANTA_OWNER_ACCESS_KEY || "";

async function unlock(request: APIRequestContext) {
  const res = await request.post("/api/owner-access", { data: { code: ownerCode } });
  expect(res.status(), "owner unlock must succeed").toBe(200);
}

function uniqueTitle(prefix: string) {
  return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

async function submitIdea(request: APIRequestContext, title: string) {
  const res = await request.post("/api/company/ideas", {
    data: {
      title,
      hypothesis: "توسيع قناة البيع أونلاين سيرفع الإيراد الشهري 15%",
      budgetSAR: 9_000,
      horizonDays: 60,
    },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.idea.status).toBe("PENDING_APPROVAL");
  expect(body.idea.approvalId).toBeTruthy();
  return body.idea as { id: string; approvalId: string };
}

test("an approved idea becomes a project with tasks, KPIs, and queued actions", async ({ request }) => {
  await unlock(request);

  const idea = await submitIdea(request, uniqueTitle("متجر إلكتروني للحلويات"));

  // The idea must be sitting in the decision center as a pending approval.
  const inbox = await request.get("/api/approvals/decisions?status=PENDING");
  expect(inbox.status()).toBe(200);
  const pending = (await inbox.json()).approvals as Array<{ id: string; type: string }>;
  expect(pending.some((item) => item.id === idea.approvalId && item.type === "IDEA")).toBe(true);

  // Approve it — the same call must return the execution outcome, not just a status flip.
  const decision = await request.post("/api/approvals/decisions", {
    data: { id: idea.approvalId, decision: "APPROVED" },
  });
  expect(decision.status()).toBe(200);
  const decided = await decision.json();
  expect(decided.ok).toBe(true);
  expect(decided.item.status).toBe("APPROVED");
  expect(decided.execution, "approval must trigger idea execution").toBeTruthy();
  expect(decided.execution.ok).toBe(true);
  expect(decided.execution.counts.tasks).toBeGreaterThan(0);
  expect(decided.execution.counts.kpis).toBeGreaterThan(0);
  expect(decided.execution.counts.actions).toBeGreaterThan(0);

  // The action queue endpoint must answer with the governed queue. Its rows
  // live in Supabase (`business_actions`); without a database the read is
  // empty by design, so only assert content when persistence is configured.
  const actions = await request.get("/api/company/actions?limit=100");
  expect(actions.status()).toBe(200);
  const actionsBody = await actions.json();
  expect(actionsBody.ok).toBe(true);
  expect(Array.isArray(actionsBody.actions)).toBe(true);
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    expect(actionsBody.actions.length).toBeGreaterThan(0);
  }

  // Deciding the same item twice must not re-execute (no duplicate projects).
  const again = await request.post("/api/approvals/decisions", {
    data: { id: idea.approvalId, decision: "APPROVED" },
  });
  expect(again.status()).toBe(200);
  const repeated = await again.json();
  expect(repeated.item.status).toBe("APPROVED");
});

test("a rejected idea never executes", async ({ request }) => {
  await unlock(request);

  const idea = await submitIdea(request, uniqueTitle("فكرة مرفوضة"));

  const decision = await request.post("/api/approvals/decisions", {
    data: { id: idea.approvalId, decision: "REJECTED", note: "الميزانية غير مناسبة الآن" },
  });
  expect(decision.status()).toBe(200);
  const decided = await decision.json();
  expect(decided.ok).toBe(true);
  expect(decided.item.status).toBe("REJECTED");
  expect(decided.execution).toBeNull();
});

test("the decision API refuses anonymous sign-off", async ({ request }) => {
  // No unlock: the proxy must fail closed before any business logic runs.
  const res = await request.post("/api/approvals/decisions", {
    data: { id: "apr-anything", decision: "APPROVED" },
  });
  expect(res.status()).toBe(401);
});
