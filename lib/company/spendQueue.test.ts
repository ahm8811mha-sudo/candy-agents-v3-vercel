import { beforeEach, describe, expect, it } from "vitest";
import { _clearApprovals, listApprovals, writeApproval, type ApprovalItem } from "../approvals";
import { _clearChairmanCommands } from "./chairmanCommands";
import { blankSpendChain } from "./spendChain";
import { buildSpendQueue } from "./spendQueue";
import { buildChairmanDigest } from "./chairmanDigest";

const now = new Date("2026-11-24T10:00:00.000Z");
function spend(id: string, chain: Record<string, unknown>, over: Partial<ApprovalItem> = {}): ApprovalItem {
  return writeApproval({
    id, type: "GENERAL", title: "طلب " + id, detail: "", amount: 5000, requestedRole: "OWNER", status: "PENDING", createdAt: "2026-11-20T10:00:00.000Z",
    metadata: { projectId: id === "a" ? "proj-1" : undefined, spendChain: { ...blankSpendChain({ amountSAR: 5000, subject: "طلب " + id }), ...chain } }, ...over,
  });
}

describe("the dispatcher's spend queue", () => {
  beforeEach(() => { _clearApprovals(); _clearChairmanCommands(); });

  it("lists every open spend request with holder, age and stuck flag, late ones first", () => {
    spend("a", { stage: "department", preparingAgentId: "department", stageEnteredAt: "2026-11-20T10:00:00.000Z" });
    spend("b", { stage: "owner", stageEnteredAt: "2026-11-24T09:00:00.000Z" });
    spend("c", { stage: "owner", stageEnteredAt: "2026-11-21T09:00:00.000Z" });
    spend("d", {}, { status: "REJECTED" });
    const items = buildSpendQueue(listApprovals(), now);
    expect(items.map((i) => i.id).sort()).toEqual(["a", "b", "c"]);
    const a = items.find((i) => i.id === "a")!;
    expect(a).toMatchObject({ holder: "sultan", holderName: "سلطان", stuck: true, ageHours: 96, stageAgeHours: 96, overdueHours: 48, projectId: "proj-1", actionPath: "/api/bridge/agents/sultan/actions", fileHref: "/spend/a" });
    expect(items.find((i) => i.id === "b")).toMatchObject({ holder: "owner", stuck: false, actionPath: null });
    expect(items.find((i) => i.id === "c")).toMatchObject({ holder: "owner", stuck: true, overdueHours: 25 });
    expect(items.slice(0, 2).every((i) => i.stuck)).toBe(true);
  });

  it("is in the Chairman digest as spendQueue and stuckSpend", () => {
    spend("a", { stage: "department", preparingAgentId: "department", stageEnteredAt: "2026-11-20T10:00:00.000Z" });
    const digest = buildChairmanDigest("2026-11-01T00:00:00.000Z", now);
    expect(digest.spendQueue.map((i) => i.id)).toEqual(["a"]);
    expect(digest.stuckSpend.map((i) => i.id)).toEqual(["a"]);
  });
});
