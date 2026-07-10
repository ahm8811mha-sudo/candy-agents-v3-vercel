import { describe, expect, it } from "vitest";
import { COMPANY_LIFECYCLE, validateLifecycle } from "./lifecycle";
import { createCompanyEvent, eventToOutboxRecord } from "./events";

describe("company OS lifecycle", () => {
  it("contains the ten governed stages in order", () => {
    expect(validateLifecycle()).toEqual({ valid: true, stageCount: 10 });
    expect(COMPANY_LIFECYCLE[0].id).toBe("OPPORTUNITY_DISCOVERY");
    expect(COMPANY_LIFECYCLE.at(-1)?.id).toBe("SCALE_HOLD_KILL");
  });

  it("requires every stage to define engines, approvals and metrics", () => {
    for (const stage of COMPANY_LIFECYCLE) {
      expect(stage.responsibleEngines.length).toBeGreaterThan(0);
      expect(stage.approvalRule.length).toBeGreaterThan(10);
      expect(stage.successMetrics.length).toBeGreaterThan(0);
    }
  });
});

describe("company OS event envelope", () => {
  it("creates tenant-scoped events and outbox records", () => {
    const event = createCompanyEvent({
      type: "decision.approved",
      tenantId: "tenant-1",
      actorId: "owner-1",
      actorType: "HUMAN",
      entityType: "decision",
      entityId: "decision-1",
      payload: { riskLevel: "HIGH" },
    });

    expect(event.correlationId).toBe(event.id);
    const outbox = eventToOutboxRecord(event);
    expect(outbox.tenant_id).toBe("tenant-1");
    expect(outbox.status).toBe("PENDING");
    expect(outbox.event_type).toBe("decision.approved");
  });

  it("rejects malformed event types", () => {
    expect(() => createCompanyEvent({
      type: "Decision Approved",
      tenantId: "tenant-1",
      actorId: "system",
      actorType: "SYSTEM",
      entityType: "decision",
      entityId: "1",
      payload: {},
    })).toThrow("Invalid company event type");
  });
});
