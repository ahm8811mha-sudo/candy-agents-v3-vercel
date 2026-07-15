import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, rememberApproval, rememberAudit } = vi.hoisted(() => ({
  rpc: vi.fn(),
  rememberApproval: vi.fn((row: Record<string, unknown>) => ({
    id: String(row.id),
    type: "GENERAL" as const,
    title: String(row.title || "Approval"),
    detail: String(row.detail || ""),
    requestedRole: "CEO",
    status: "PENDING" as const,
    createdAt: String(row.created_at || "2026-07-15T00:00:00.000Z"),
  })),
  rememberAudit: vi.fn(),
}));

vi.mock("../supabase", () => ({
  getSupabaseAdmin: () => ({ rpc }),
}));
vi.mock("../approvals", () => ({
  rememberDurableApprovalRow: rememberApproval,
}));
vi.mock("./audit", () => ({
  rememberDurableAuditRow: rememberAudit,
}));

import { createExecutionBundle, executionCorrelationId, type CreateExecutionBundleInput } from "./executionRepository";

function input(): CreateExecutionBundleInput {
  return {
    source: "company-execution",
    idempotencyKey: "owner-click-123",
    actorId: "private-owner",
    actorRole: "OWNER",
    tenantId: "golden-star",
    project: {
      name: "Atomic project",
      request: "Create an atomic execution project",
      status: "PENDING_APPROVAL",
      budget: 5000,
      approvedBudget: 0,
      healthScore: 82,
      riskLevel: "MEDIUM",
      approvalStatus: "PENDING",
    },
    tasks: [{ title: "Task", content: "Do it", status: "BLOCKED", priority: "HIGH" }],
    kpis: [{ name: "KPI", target: 1, unit: "count", status: "WATCH" }],
    actions: [{
      actionType: "INTERNAL",
      title: "Action",
      status: "WAITING_APPROVAL",
      executionMode: "INTERNAL",
      requiresApproval: true,
      approvalStatus: "PENDING",
    }],
    approval: {
      title: "Approve",
      detail: "Approval required",
      amount: 5000,
      requestedRole: "CEO",
      tier: "T2",
      riskLevel: "MEDIUM",
    },
    audit: { action: "EXECUTION_BUNDLE_CREATED", detail: "Created atomically" },
  };
}

describe("executionRepository", () => {
  beforeEach(() => {
    rpc.mockReset();
    rememberApproval.mockClear();
    rememberAudit.mockClear();
  });

  it("derives a stable opaque correlation id without persisting the raw retry key", () => {
    const first = executionCorrelationId("company-execution", "retry-secret-value");
    const second = executionCorrelationId("company-execution", "retry-secret-value");
    expect(first).toBe(second);
    expect(first).toMatch(/^company-execution:[a-f0-9]{64}$/);
    expect(first).not.toContain("retry-secret-value");
    expect(executionCorrelationId("approved-idea", "retry-secret-value")).not.toBe(first);
  });

  it("uses one RPC for the complete project, governance, workflow, audit, and outbox bundle", async () => {
    rpc.mockImplementation(async (_name: string, args: { p_bundle: Record<string, any> }) => ({
      data: {
        idempotent: false,
        correlationId: args.p_bundle.correlationId,
        workflowInstanceId: args.p_bundle.workflowInstanceId,
        project: { id: args.p_bundle.project.id, name: args.p_bundle.project.name },
        tasks: [{ id: args.p_bundle.tasks[0].id, title: "Task" }],
        kpis: [{ id: args.p_bundle.kpis[0].id, name: "KPI" }],
        approval: { id: args.p_bundle.approval.id, title: "Approve", created_at: "2026-07-15T00:00:00Z" },
        audit: { id: args.p_bundle.audit.id, action: "EXECUTION_BUNDLE_CREATED" },
        outboxId: args.p_bundle.outboxId,
      },
      error: null,
    }));

    const result = await createExecutionBundle(input());

    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0] as [string, { p_bundle: Record<string, any> }];
    expect(name).toBe("orvanta_create_execution_bundle");
    expect(args.p_bundle).toMatchObject({
      tenantId: "golden-star",
      source: "company-execution",
      actorId: "private-owner",
      project: { name: "Atomic project" },
      approval: { metadata: { actionKind: "COMPANY_EXECUTION_PROJECT", governanceTier: "T2" } },
    });
    expect(args.p_bundle.tasks).toHaveLength(1);
    expect(args.p_bundle.kpis).toHaveLength(1);
    expect(args.p_bundle.actions).toHaveLength(1);
    expect(args.p_bundle.eventId).toMatch(/^evt-execution-/);
    expect(args.p_bundle.outboxId).toMatch(/^out-execution-/);
    expect(result.project.name).toBe("Atomic project");
    expect(result.approval?.id).toMatch(/^apr-execution-/);
    expect(rememberApproval).toHaveBeenCalledTimes(1);
    expect(rememberAudit).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the transactional RPC is unavailable", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    await expect(createExecutionBundle(input())).rejects.toThrow("Atomic execution bundle failed");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
