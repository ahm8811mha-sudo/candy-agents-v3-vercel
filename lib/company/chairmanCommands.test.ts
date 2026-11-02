import { beforeEach, describe, expect, it } from "vitest";
import { _clearApprovals, decideApproval, listApprovals } from "../approvals";
import { postBridgeAction, _clearBridgeMessages } from "./agentBridge";
import {
  _clearChairmanCommands,
  commandsForAgent,
  getChairmanCommand,
  issueChairmanCommand,
  listOpenCommandsSince,
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
    // A new command must stay open for its owner; nothing is auto-completed.
    expect(command.steps.filter((step) => step.kind === "INTERNAL").every((step) => step.status === "PENDING")).toBe(true);
    expect(command.status).toBe("IN_PROGRESS");
    expect(command.diwan.status).toBe("OPEN");
    expect(commandsForAgent("sara").map((item) => item.id)).toContain(command.id);
    expect(listOpenCommandsSince(new Date(Date.now() - 60_000).toISOString()).map((item) => item.id)).toContain(command.id);
  });

  it("reopens a closed command with a logged note and puts it back in the feed", async () => {
    const command = await issueChairmanCommand("راجع عرض السعر للعميل الحالي داخلياً");
    await updateChairmanCommand("sara", command.id, { action: "close", note: "أُنجز الملخص", evidence: "أُرسل الملخص الداخلي للمراجعة." });
    expect(command.status).toBe("CLOSED");
    expect(listOpenCommandsSince("2000-01-01T00:00:00Z").map((item) => item.id)).not.toContain(command.id);
    const reopened = await updateChairmanCommand("sara", command.id, { action: "reopen", note: "أُعيد فتحه لأنه أُغلق خطأً." });
    expect(reopened.status).toBe("IN_PROGRESS");
    expect(reopened.closedAt).toBeNull();
    expect(reopened.history?.at(-1)).toMatchObject({ action: "reopen", by: "sara" });
    expect(listOpenCommandsSince("2000-01-01T00:00:00Z").map((item) => item.id)).toContain(command.id);
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

  it("addresses the named employee before falling back to keywords", () => {
    const khalid = routeChairmanCommand("خالد: جهّز مقارنة موردين");
    expect(khalid.ownerAgentId).toBe("khalid");
    expect(khalid.sopId).toBe("SOP-P2P-001");

    const sara = routeChairmanCommand("يا سارة راجع الميزانية");
    expect(sara.ownerAgentId).toBe("sara");
    expect(sara.sopId).toBeNull();
    expect(sara.collaborators).toContain("abdulrahman");

    expect(routeChairmanCommand("سارة، راجعي عرض السعر").ownerAgentId).toBe("sara");
    expect(routeChairmanCommand("عبد الرحمن: راجع السيولة").ownerAgentId).toBe("abdulrahman");
    expect(routeChairmanCommand("امين: راجع القيد").ownerAgentId).toBe("ameen");
    expect(routeChairmanCommand("ريّان: تابع الإغلاق").ownerAgentId).toBe("diwan");
    expect(routeChairmanCommand("ريان: تابع الإغلاق").ownerAgentId).toBe("diwan");
    expect(routeChairmanCommand("@khalid راجع عرض السعر").ownerAgentId).toBe("khalid");
    expect(routeChairmanCommand("راجع الحملة ثم سلّمها إلى @fahad").ownerAgentId).toBe("fahad");
  });

  it("does not treat a bare name, or أمين meaning trustworthy, as an assignment", () => {
    expect(routeChairmanCommand("هذا التقرير أمين ويمكن الاعتماد عليه").ownerAgentId).not.toBe("ameen");
    expect(routeChairmanCommand("اختر مورداً أميناً للمخزن").ownerAgentId).toBe("khalid");
    expect(routeChairmanCommand("أمين الصندوق يراجع الدفتر").ownerAgentId).not.toBe("ameen");
    expect(routeChairmanCommand("حارس البوابة يحتاج جدولاً").ownerAgentId).not.toBe("hares");
    expect(routeChairmanCommand("سارة راجعت العرض الداخلي").ownerAgentId).not.toBe("sara");
    expect(routeChairmanCommand("@owner راجع الميزانية").ownerAgentId).toBe("abdulrahman");
  });

  it("lets an explicit assignee override the text and rejects an unknown employee", async () => {
    expect(routeChairmanCommand("يا سارة راجع الميزانية", { assignee: "fahad" }).ownerAgentId).toBe("fahad");
    expect(routeChairmanCommand("يا سارة راجع الميزانية", { assignee: "automatic" }).ownerAgentId).toBe("sara");
    expect(routeChairmanCommand("يا سارة راجع الميزانية", { assignee: "  " }).ownerAgentId).toBe("sara");
    expect(() => routeChairmanCommand("راجع العمل الداخلي", { assignee: "owner" })).toThrow(/غير معروف/);
    expect(() => routeChairmanCommand("راجع العمل الداخلي", { assignee: "ghost" })).toThrow(/غير معروف/);

    const assigned = await issueChairmanCommand("راجع الجدول الداخلي", { assignee: "fahad" });
    expect(assigned.ownerAgentId).toBe("fahad");
    const addressedMoney = await issueChairmanCommand("يا خالد: اشتر مواد تغليف بميزانية 4000 ريال");
    expect(addressedMoney.ownerAgentId).toBe("khalid");
    expect(addressedMoney.status).toBe("IN_SPEND_CHAIN");
    await expect(updateChairmanCommand("khalid", addressedMoney.id, {
      action: "close",
      note: "أُغلق بلا اعتماد",
      evidence: "لا يوجد دليل اعتماد من رئيس مجلس الإدارة.",
    })).rejects.toThrow(/قبل اعتماد/);
  });

  it("lists open commands changed since a timestamp and omits closed ones", async () => {
    const since = new Date(Date.now() - 60_000).toISOString();
    const open = await issueChairmanCommand("أرسل بريداً للعميل بتأكيد الموعد");
    const closed = await issueChairmanCommand("راجع عرض السعر للعميل الحالي داخلياً");
    await updateChairmanCommand("sara", closed.id, { action: "close", note: "أُنجز الملخص", evidence: "أُرسل الملخص الداخلي للمراجعة." });
    const listed = listOpenCommandsSince(since);
    expect(listed.map((item) => item.id)).toContain(open.id);
    expect(listed.map((item) => item.id)).not.toContain(closed.id);
    expect(listed.find((item) => item.id === open.id)).toMatchObject({
      ownerAgentId: "sara",
      status: "AWAITING_CHAIRMAN",
    });
    expect(listOpenCommandsSince(new Date(Date.now() + 60_000).toISOString())).toEqual([]);
    expect(() => listOpenCommandsSince("tomorrow")).toThrow(/ISO/);
  });
  it("routes investment research to the research procedure and shows progress in the report", async () => {
    const command = await issueChairmanCommand("اجتمعوا وعطوني أكبر الفرص القابلة للاستثمار مع عائد ٥٪ سنوياً");
    expect(command.ownerAgentId).toBe("sultan");
    expect(command.collaborators).toEqual(["fahad", "rased", "abdulrahman", "majed"]);
    expect(command.steps.map((step) => step.title)).toEqual(["بحث الفرص", "المراجعة المالية", "المراجعة النظامية", "توصية الرئيس التنفيذي", "قرار الرئيس"]);
    expect(command.currentStep).toBe("بحث الفرص");
    expect(command.diwan.status).toBe("OPEN");
    const updated = await updateChairmanCommand("sultan", command.id, { action: "progress", note: "جمعنا ثلاث فرص أولية من راصد." });
    expect(updated.resultReport).toContain("جمعنا ثلاث فرص أولية");
    expect(updated.resultReport).not.toContain("ما أُنجز: لا شيء بعد");
  });

  it("replans an open command and keeps earlier progress in history", async () => {
    const command = await issueChairmanCommand("راجع عرض السعر للعميل الحالي داخلياً");
    await updateChairmanCommand("sara", command.id, { action: "progress", note: "أنهيت الخطوة الأولى." });
    const replanned = await updateChairmanCommand("sara", command.id, { action: "replan", note: "تصحيح الإجراء." });
    expect(replanned.steps.every((step) => step.kind !== "INTERNAL" || step.status === "PENDING")).toBe(true);
    expect(replanned.history?.some((item) => item.note.includes("أنهيت الخطوة الأولى"))).toBe(true);
  });
});
