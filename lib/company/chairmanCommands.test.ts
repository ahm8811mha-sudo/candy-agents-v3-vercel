import { beforeEach, describe, expect, it } from "vitest";
import { _clearApprovals, decideApproval, listApprovals } from "../approvals";
import { postBridgeAction, _clearBridgeMessages } from "./agentBridge";
import {
  _clearChairmanCommands,
  getChairmanCommand,
  issueChairmanCommand,
  routeChairmanCommand,
  updateChairmanCommand,
} from "./chairmanCommands";
import { readySpendForDecision } from "../../__tests__/fixtures/readySpend";

describe("chairman commands", () => {
  beforeEach(() => {
    _clearChairmanCommands();
    _clearApprovals();
    _clearBridgeMessages();
  });

  it("routes a sales order to Sara and tracks it with Rayyan", async () => {
    expect(routeChairmanCommand("راجع عرض السعر للعميل").ownerAgentId).toBe("sara");
    const command = await issueChairmanCommand("راجع عرض السعر للعميل الحالي داخلياً");
    expect(command.ownerAgentId).toBe("sara");
    expect(command.steps.filter((step) => step.kind === "INTERNAL").every((step) => step.status === "DONE" && (step.evidence || "").length > 9)).toBe(true);
    expect(command.status).toBe("CLOSED");
    expect(command.diwan.status).toBe("COMPLETED");
    expect((command.resultReport || "").length).toBeGreaterThan(9);
  });

  it("sends money through the chain and refuses to close or approve it from an employee", async () => {
    const command = await issueChairmanCommand("اشتر مواد تغليف بميزانية 4000 ريال");
    expect(command.status).toBe("IN_SPEND_CHAIN");
    expect(command.spendApprovalId).toBeTruthy();
    const approval = listApprovals().find((item) => item.id === command.spendApprovalId)!;
    expect(approval.metadata?.spendChain).toMatchObject({ stage: "owner" });
    expect(() => decideApproval(approval.id, "APPROVED", "sultan")).toThrow(/لا يملك/);
    await expect(updateChairmanCommand(command.ownerAgentId, command.id, {
      action: "close",
      note: "أُغلق بلا اعتماد",
      evidence: "لا يوجد دليل اعتماد من رئيس مجلس الإدارة.",
    })).rejects.toThrow(/قبل اعتماد/);
    await expect(postBridgeAction("sultan", {
      kind: "spend",
      approvalId: approval.id,
      action: "owner_decision",
      decision: "APPROVED",
      note: "اعتماد",
    })).rejects.toThrow(/لا يملك/);
    readySpendForDecision(approval.id);
    decideApproval(approval.id, "APPROVED", "أحمد ناصر الأحمد");
    expect(listApprovals().find((item) => item.id === approval.id)?.status).toBe("APPROVED");
  });

  it("blocks an external send and a money request that has no number", async () => {
    const external = await issueChairmanCommand("أرسل بريداً للعميل بتأكيد الموعد");
    expect(external.status).toBe("AWAITING_CHAIRMAN");
    expect(external.steps.some((step) => step.kind === "EXTERNAL" && step.status === "BLOCKED")).toBe(true);
    await expect(updateChairmanCommand("sara", external.id, {
      action: "progress",
      stepId: external.steps.find((step) => step.kind === "EXTERNAL")?.id,
      note: "تم الإرسال",
    })).rejects.toThrow(/لا يُرسل/);

    const vague = await issueChairmanCommand("اعتمد ميزانية شراء للمخزن");
    expect(vague.steps.some((step) => step.kind === "SPEND" && step.status === "BLOCKED")).toBe(true);
    expect(getChairmanCommand(vague.id)?.spendApprovalId).toBeNull();
  });
});
