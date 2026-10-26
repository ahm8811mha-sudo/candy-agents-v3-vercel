import { beforeEach, describe, expect, it } from "vitest";
import { _clearApprovals, createApproval, listApprovals } from "../approvals";
import { buildChairmanDigest } from "./chairmanDigest";
import { _clearChairmanCommands, _setCommandDue, issueChairmanCommand } from "./chairmanCommands";
import { readySpendForDecision } from "../../__tests__/fixtures/readySpend";

describe("chairman digest", () => {
  beforeEach(() => {
    _clearApprovals();
    _clearChairmanCommands();
  });

  it("returns completed memos and since-filtered commands without writing", async () => {
    const hidden = createApproval({ type: "BUDGET", title: "قديم", detail: "d", amount: 2000, metadata: {} });
    const { writeApproval } = await import("../approvals");
    writeApproval({ ...hidden, metadata: {} });
    const ready = createApproval({ type: "BUDGET", title: "مذكرة جاهزة", detail: "d", amount: 900 });
    readySpendForDecision(ready.id);
    const before = listApprovals().map((item) => item.status).join(",");
    const closed = await issueChairmanCommand("رتب جدول التسليم الداخلي لهذا الأسبوع");
    const { updateChairmanCommand } = await import("./chairmanCommands");
    await updateChairmanCommand(closed.ownerAgentId, closed.id, {
      action: "close",
      note: "أُنجز الجدول الداخلي.",
      evidence: "الجدول محفوظ في سجل التشغيل.",
    });
    const digest = buildChairmanDigest("2020-01-01T00:00:00.000Z", new Date("2026-10-26T12:00:00.000Z"));
    expect(digest.memos.map((memo) => memo.subject)).toContain("مذكرة جاهزة");
    expect(digest.memos.some((memo) => memo.subject === "قديم")).toBe(false);
    expect(digest.memos[0].approvePath).toContain("/inbox?decision=");
    expect(digest.memos[0].sultanRecommendation).toContain("موافقة");
    expect(digest.commands.some((command) => command.id === closed.id && command.status === "CLOSED")).toBe(true);
    expect(listApprovals().map((item) => item.status).join(",")).toBe(before);
    expect(JSON.stringify(digest)).not.toMatch(/AGENT_BRIDGE_KEY|secret|sk-/);
  });

  it("skips a command that changed before since, and rejects a bad timestamp", async () => {
    const command = await issueChairmanCommand("راجع رخصة السجل التجاري");
    _setCommandDue(command.id, "2026-10-01T00:00:00.000Z");
    const later = buildChairmanDigest("2099-01-01T00:00:00.000Z", new Date("2026-10-26T12:00:00.000Z"));
    expect(later.commands.some((item) => item.id === command.id)).toBe(false);
    expect(() => buildChairmanDigest("yesterday")).toThrow(/ISO/);
  });
});
