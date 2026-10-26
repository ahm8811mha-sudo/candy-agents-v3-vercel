import { beforeEach, describe, expect, it } from "vitest";
import { createApproval, decideApproval, listApprovals, writeApproval, _clearApprovals } from "../approvals";
import { getInbox } from "../inbox";
import { agentInbox, spendQueueForAgent } from "./agentBridge";
import { returnedToDepartment, advanceSpendChain, blankSpendChain, chairmanSpendBlock, readSpendChain, spendStageAgent, spendStop } from "./spendChain";

const atGovernance = () => advanceSpendChain(blankSpendChain({ amountSAR: 5000, subject: "x", legacy: true, stage: "finance" }), "abdulrahman", { action: "finance_review", result: "موافق", note: "مراجعة مالية سليمة" } as never);

function seed(chain: ReturnType<typeof atGovernance>) {
  const item = createApproval({ type: "IDEA", title: "فكرة: مكررة", detail: "d", amount: 5000, requestedRole: "x", metadata: {} } as never);
  return writeApproval({ ...item, metadata: { ...item.metadata, spendChain: chain } });
}

describe("spend chain stops route to the Chairman", () => {
  beforeEach(() => _clearApprovals());
  it("governance موقوف leaves hares' queue and is returned to the department, not counted on the Chairman's desk", async () => {
    const stopped = advanceSpendChain(atGovernance(), "hares", { action: "governance_review", result: "موقوف", note: "طلب مكرر لفكرة سابقة" } as never);
    const item = seed(stopped);
    expect(spendStageAgent(stopped)).toBe("owner");
    expect(spendQueueForAgent("hares").find((a) => a.id === item.id)).toBeUndefined();
    expect(spendStop(stopped)?.label).toBe("موقوف من الحوكمة — بانتظار إقفال رئيس مجلس الإدارة");
    const inbox = agentInbox("hares");
    expect(inbox.spendQueue).toHaveLength(0);
    const all = await getInbox();
    const row = (all as unknown as { items?: { id: string; detail: string }[] }).items?.find((i) => i.id === item.id) ?? (all as unknown as { id: string; detail: string }[]).find?.((i) => i.id === item.id);
    expect(row).toBeUndefined();
    expect(returnedToDepartment(item)?.label).toBe("موقوف من الحوكمة — أُعيد للقسم");
  });
  it("legacy rows already persisted at stage governance with موقوف are also routed to the Chairman", () => {
    const legacy = { ...atGovernance(), governanceReview: { result: "موقوف", note: "n", by: "hares", at: "t" } };
    seed(legacy);
    expect(spendQueueForAgent("hares")).toHaveLength(0);
  });
  it("finance غير موافق skips governance and goes to the Chairman; never auto-rejected", () => {
    const s = advanceSpendChain(blankSpendChain({ amountSAR: 5000, subject: "x", legacy: true, stage: "finance" }), "abdulrahman", { action: "finance_review", result: "غير موافق", note: "غير مجدٍ مالياً الآن" } as never);
    const item = seed(s);
    expect(s.stage).toBe("owner"); expect(s.decision).toBeNull();
    expect(listApprovals().find((a) => a.id === item.id)?.status).toBe("PENDING");
    expect(spendStop(s)?.by).toBe("finance");
  });
  it("only the Chairman closes a stopped item, and he cannot approve it", () => {
    const s = advanceSpendChain(atGovernance(), "hares", { action: "governance_review", result: "موقوف", note: "طلب مكرر لفكرة سابقة" } as never);
    const item = seed(s);
    expect(chairmanSpendBlock("OWNER", item)).toBeNull();
    expect(chairmanSpendBlock(null, item)).not.toBeNull();
    expect(() => advanceSpendChain(s, "owner", { action: "owner_decision", decision: "APPROVED" } as never)).toThrow();
    expect(advanceSpendChain(s, "owner", { action: "owner_decision", decision: "REJECTED" } as never).decision).toBe("REJECTED");
    expect(() => decideApproval(item.id, "APPROVED", "owner")).toThrow();
    expect(readSpendChain(item)?.governanceReview?.result).toBe("موقوف");
  });
});

describe("chairman queue helpers", () => {
  it("collapses repeated requests (same title + amount) into one item with a count", async () => {
    const { collapseDuplicates } = await import("./spendChain");
    const out = collapseDuplicates([{ id: "a", title: "فكرة: س", amount: 4000 }, { id: "b", title: "فكرة:  س", amount: 4000 }, { id: "c", title: "فكرة: س", amount: 5000 }]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: "a", duplicateCount: 2, duplicateIds: ["a", "b"] });
  });
});
