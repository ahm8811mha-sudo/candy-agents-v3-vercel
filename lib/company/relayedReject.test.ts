import { beforeEach, describe, expect, it } from "vitest";
import { _clearApprovals, listApprovals, writeApproval } from "../approvals";
import { blankSpendChain, readSpendChain } from "./spendChain";
import { recordRelayedOwnerRejection } from "./projectStepsBridge";

describe("the Chairman's relayed rejection", () => {
  beforeEach(() => _clearApprovals());

  it("closes any pending spend request (not only project steps) and never approves", async () => {
    writeApproval({ id: "apr-radar", type: "GENERAL", title: "تجربة رادار الفرص", detail: "", amount: 5000, requestedRole: "OWNER", status: "PENDING", createdAt: "2026-10-27T05:55:00Z",
      metadata: { source: "governanceOS", entityType: "opportunity_radar_runs", entityId: "run-1", spendChain: { ...blankSpendChain({ amountSAR: 5000 }), stage: "owner" } } });
    const result = await recordRelayedOwnerRejection({ approvalId: "apr-radar", ownerWords: "ارفض الطلب", relayedBy: "It" });
    expect(result.status).toBe("REJECTED");
    const saved = listApprovals().find((a) => a.id === "apr-radar")!;
    expect(saved.status).toBe("REJECTED");
    expect(readSpendChain(saved)).toMatchObject({ stage: "decided", decision: "REJECTED" });
    expect(saved.metadata?.ownerDecision).toMatchObject({ decision: "REJECTED", words: "ارفض الطلب" });
    expect((await recordRelayedOwnerRejection({ approvalId: "apr-radar", ownerWords: "ارفض الطلب", relayedBy: "It" })).idempotent).toBe(true);
  });

  it("refuses a non-money approval", async () => {
    writeApproval({ id: "apr-policy", type: "GENERAL", title: "سياسة", detail: "", requestedRole: "OWNER", status: "PENDING", createdAt: "2026-11-01T00:00:00Z", metadata: {} });
    await expect(recordRelayedOwnerRejection({ approvalId: "apr-policy", ownerWords: "ارفض", relayedBy: "It" })).rejects.toThrow("الصرف");
  });
});
