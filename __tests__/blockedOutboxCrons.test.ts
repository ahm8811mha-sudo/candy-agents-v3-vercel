// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Production has no outbox delivery target. From 2026-10-19 the refusal
// stopped the runtime sweep before agent recovery and the owner-absence
// continuity sweep, and marked the whole autonomy loop failed after its work
// had run.
const BLOCKED = "Outbox publishing is blocked: ORVANTA_WEBHOOK_URL, ORVANTA_WEBHOOK_SECRET or API_SECRET_KEY. No events were claimed.";
const calls = vi.hoisted(() => ({ recovered: 0, continuity: 0, succeeded: [] as Array<Record<string, unknown>>, failed: [] as unknown[] }));

vi.mock("../lib/company-os/context", () => ({
  requireCompanyContext: async () => ({ ok: true, context: { tenantId: "golden-star", requestId: "req-1", correlationId: "cor-1", actor: { id: "test-owner" } } }),
}));
vi.mock("../lib/operations/cronRun", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/operations/cronRun")>()),
  startCronRun: async () => ({ id: "run-1", startedAt: Date.now(), tracked: true }),
  heartbeatCronRun: async () => {},
  succeedCronRun: async (_run: unknown, input: Record<string, unknown>) => { calls.succeeded.push(input); },
  failCronRun: async (_run: unknown, error: unknown) => { calls.failed.push(error); },
}));
vi.mock("../lib/company-os/telemetry", () => ({ withTelemetrySpan: (_span: unknown, run: () => unknown) => run() }));
vi.mock("../lib/company-os/outboxPublisher", () => ({ publishOutboxBatch: async () => { throw new Error(BLOCKED); } }));
vi.mock("../lib/company-os/workflowRuntime", () => ({ runWorkflowTick: async () => ({ processed: 0 }) }));
vi.mock("../lib/company/internalAgentExecutor", () => ({ recoverPendingAgentProjects: async () => { calls.recovered += 1; return { selected: 1, results: [{ failed: 0 }] }; } }));
vi.mock("../lib/company/ownerAbsence", () => ({
  getOwnerAbsencePolicy: async () => ({ effectiveStatus: "INACTIVE" }),
  recordOwnerAbsenceSweep: async () => { calls.continuity += 1; return { active: false, overdueTasks: 0, pendingApprovals: 0 }; },
}));
vi.mock("../lib/company/hydrate", () => ({ hydrateCompany: async () => {} }));
vi.mock("../lib/approvals", () => ({ reviveDueDeferrals: async () => [] }));
vi.mock("../lib/company/executionHonestyServer", () => ({ reopenUnprovenRealTasks: async () => 2 }));
vi.mock("../lib/company/executiveSecretariat", () => ({ sweepDecisionCommitments: async () => ({ reminded: 1, escalated: 0 }) }));
vi.mock("../lib/company/ideas", () => ({ generateDailyIdeaCritical: async () => ({ idea: null, created: 0, reason: "no-signal" }), enrichIdea: async () => {} }));
vi.mock("../lib/company/learning", () => ({ getLearningSnapshot: () => ({ decisionsAnalyzed: 0, confidenceThreshold: 0.7, recommendation: "" }) }));
import { GET as runtimeCron } from "../app/api/company-os/runtime/cron/route";
import { GET as autonomyLoop } from "../app/api/company/loop/cron/route";

const cronRequest = (path: string) => new NextRequest(`http://localhost${path}`);
beforeEach(() => {
  calls.recovered = 0; calls.continuity = 0; calls.succeeded.length = 0; calls.failed.length = 0;
  process.env.ORVANTA_OUTBOX_ENABLED = "true";
});

describe("crons on a deployment with no outbox delivery target", () => {
  it("runs agent recovery and the continuity sweep, and records the blocked outbox as the run's failure", async () => {
    const response = await runtimeCron(cronRequest("/api/company-os/runtime/cron"));
    expect(calls.failed).toEqual([]);
    expect(response.status).toBe(200);
    expect(calls.recovered).toBe(1);
    expect(calls.continuity).toBe(1);
    expect(calls.succeeded).toHaveLength(1);
    expect(calls.succeeded[0]).toMatchObject({ failedCount: 1, details: expect.objectContaining({ outboxError: BLOCKED }) });
  });

  it("records what the autonomy loop did, with the blocked outbox as its failed item", async () => {
    const response = await autonomyLoop(cronRequest("/api/company/loop/cron"));
    expect(calls.failed).toEqual([]);
    expect(response.status).toBe(200);
    expect(calls.succeeded).toHaveLength(1);
    expect(calls.succeeded[0]).toMatchObject({ failedCount: 1, details: expect.objectContaining({ reopened: 2, decisionsChased: 1, outboxError: BLOCKED }) });
  });
});
