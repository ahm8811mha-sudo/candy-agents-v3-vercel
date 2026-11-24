import { beforeEach, describe, expect, it } from "vitest";
import { _clearApprovals, listApprovals, writeApproval, type ApprovalItem } from "../approvals";
import { _clearChairmanCommands } from "./chairmanCommands";
import { advanceSpendChain, blankSpendChain, readSpendChain, spendEscalationDue, spendHolder, spendOverdue } from "./spendChain";
import { spendItem } from "./counterItems";
import { buildOfficeFloor } from "./officeFloor";
import { buildChairmanDigest } from "./chairmanDigest";
import { escalateStuckSpend } from "./spendEscalation";
import { listBridgeMessages, spendQueueForAgent } from "./agentBridge";

// The real incident: an opportunity-radar request created 27 Oct with no named department.
const created = "2026-10-27T05:55:00.000Z";
const now = new Date("2026-11-24T10:00:00.000Z");
function radar(chain: Record<string, unknown> = {}): ApprovalItem {
  return writeApproval({
    id: "apr-dedupe-radar", type: "GENERAL", title: "Opportunity radar pilot: Organic demand validation sprint before paid expansion",
    detail: "إجراء مؤسسي بانتظار الاعتماد · النوع opportunity_radar_runs", amount: 5000, requestedRole: "OWNER", status: "PENDING", createdAt: created,
    metadata: { spendChain: { ...blankSpendChain({ amountSAR: 5000, subject: "تجربة رادار" }), ...chain } },
  });
}

describe("a spend request can never sit unowned or unseen", () => {
  beforeEach(() => { _clearApprovals(); _clearChairmanCommands(); });

  it("names a real employee as holder of a department-stage request (not «القسم المعني»)", () => {
    const item = radar();
    expect(spendHolder(item)).toBe("rased");
    expect(spendItem(item, now)).toMatchObject({ holderId: "rased", holderName: "راصد" });
    expect(spendQueueForAgent("rased").map((i) => i.id)).toEqual(["apr-dedupe-radar"]);
    expect(spendQueueForAgent("sultan")).toHaveLength(0);
  });

  it("flags it overdue after 48 hours, shows the delay, and raises an office alert", () => {
    const item = radar();
    const overdue = spendOverdue(item, now)!;
    expect(overdue.holder).toBe("rased");
    expect(overdue.hours).toBeGreaterThan(600);
    expect(spendItem(item, now).reason).toContain("متأخر");
    const floor = buildOfficeFloor({ tasks: [], tasksAvailable: true, now });
    expect(floor.counterItems.alerts.map((a) => a.id)).toContain("apr-dedupe-radar");
    expect(floor.employees.find((e) => e.id === "rased")!.kpis.overdue).toBe(1);
    expect(spendOverdue(item, new Date("2026-10-28T05:55:00.000Z"))).toBeNull();
  });

  it("lists every in-chain request in the Chairman digest with who must act", () => {
    radar();
    const digest = buildChairmanDigest("2026-11-24T00:00:00.000Z", now);
    expect(digest.spendInChain).toEqual([expect.objectContaining({ id: "apr-dedupe-radar", holder: "rased", stage: "department", overdue: true, actionPath: "/api/bridge/agents/rased/actions" })]);
  });

  it("escalates to the holder and Sultan at most once a day, then to Rayyan", async () => {
    radar();
    expect(await escalateStuckSpend(now)).toEqual([expect.objectContaining({ id: "apr-dedupe-radar", holder: "rased", count: 1 })]);
    expect(await escalateStuckSpend(new Date(now.getTime() + 3_600_000))).toEqual([]);
    const notes = await listBridgeMessages("sultan");
    expect(notes[0].body).toContain("تصعيد تلقائي");
    expect((await listBridgeMessages("rased"))[0].body).toContain("مذكرة القسم");
    expect(await escalateStuckSpend(new Date(now.getTime() + 25 * 3_600_000))).toEqual([expect.objectContaining({ count: 2 })]);
    expect((await listBridgeMessages("diwan"))[0].body).toContain("تصعيد تلقائي (2)");
    expect(readSpendChain(listApprovals().find((a) => a.id === "apr-dedupe-radar")!)?.escalation?.count).toBe(2);
  });

  it("restarts the stage clock when the chain moves", () => {
    const item = radar();
    const state = readSpendChain(item)!;
    const moved = advanceSpendChain(state, "rased", { action: "submit_department", subject: "تجربة رادار", options: "أ أو ب", expectedReturn: "قائمة اهتمام", risks: "لا سيولة" }, now.toISOString());
    expect(moved).toMatchObject({ stage: "finance", stageEnteredAt: now.toISOString(), escalation: null, preparingAgentId: "rased" });
    const next = writeApproval({ ...item, metadata: { spendChain: moved } });
    expect(spendEscalationDue(next, new Date(now.getTime() + 3_600_000))).toBeNull();
    expect(spendOverdue(next, new Date(now.getTime() + 49 * 3_600_000))?.holder).toBe("abdulrahman");
  });
});

describe("scored options for the Chairman", () => {
  beforeEach(() => { _clearApprovals(); _clearChairmanCommands(); });
  const opts = [
    { key: "أ", label: "صرف 5,000 كاملة الآن", amountSAR: 5000, score: 5 },
    { key: "ب", label: "تحقق عضوي بلا صرف", amountSAR: 0, score: 70 },
    { key: "ج", label: "سقف 1,500 بعد رفع التعليق", amountSAR: 1500, score: 25 },
  ];
  it("only Sultan sets them, after the reviews; the top score is the recommendation", () => {
    const state = readSpendChain(radar({ stage: "sultan" }))!;
    expect(() => advanceSpendChain(state, "abdulrahman", { action: "set_options", options: opts })).toThrow("سلطان");
    expect(() => advanceSpendChain(readSpendChain(radar())!, "sultan", { action: "set_options", options: opts })).toThrow();
    const next = advanceSpendChain(state, "sultan", { action: "set_options", options: opts });
    expect(next.optionSet?.find((o) => o.recommended)?.key).toBe("ب");
    expect(next.stage).toBe("sultan");
    expect(() => advanceSpendChain(state, "sultan", { action: "set_options", options: opts.map((o) => ({ ...o, score: 50 })) })).toThrow("100%");
  });
  it("other departments add their opinion without moving the chain", () => {
    const state = readSpendChain(radar({ stage: "owner" }))!;
    const next = advanceSpendChain(state, "noura", { action: "consult", result: "موافق", note: "الحملة العضوية تكفي ضمن الطلب المسبق." });
    expect(next.consultations).toHaveLength(1);
    expect(next.stage).toBe("owner");
    expect(() => advanceSpendChain(state, "owner", { action: "consult", result: "x", note: "رأي رئيس المجلس" })).toThrow();
  });
});
