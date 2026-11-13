import { beforeEach, describe, expect, it } from "vitest";
import { _clearApprovals, createApproval, listApprovals, writeApproval } from "../approvals";
import { _clearChairmanCommands } from "./chairmanCommands";
import { buildDecisionDesk, expiredReturns, nextDigestAt, DESK_CARD_LIMIT } from "./decisionDesk";
import { advanceSpendChain, readSpendChain } from "./spendChain";
import { readySpendForDecision } from "../../__tests__/fixtures/readySpend";

const NOW = new Date("2026-11-14T09:00:00.000Z");

describe("decision desk", () => {
  beforeEach(() => {
    _clearApprovals();
    _clearChairmanCommands();
  });

  it("shows at most seven cards, largest amount first, and keeps the rest waiting", () => {
    for (let index = 1; index <= 9; index += 1) {
      const item = createApproval({ type: "BUDGET", title: `طلب صرف رقم ${index}`, detail: "d", amount: index * 1000 });
      readySpendForDecision(item.id);
    }
    const desk = buildDecisionDesk(NOW);
    expect(desk.cards).toHaveLength(DESK_CARD_LIMIT);
    expect(desk.waiting).toBe(2);
    expect(desk.cards[0].amountSAR).toBe(9000);
    expect(desk.cards[0].recommendation).toContain("موافقة");
    expect(desk.cards[0].evidencePath).toContain("/inbox?decision=");
    expect(desk.cards[0].ifNoDecision).toContain("لا يُعتمد");
  });

  it("does not show a stopped item as a memo; it is returned to its department with seven days", () => {
    const item = createApproval({ type: "BUDGET", title: "طلب سيوقفه حارس", detail: "d", amount: 42000 });
    let state = readSpendChain(item)!;
    state = advanceSpendChain(state, state.preparingAgentId === "department" ? "fahad" : state.preparingAgentId, { action: "submit_department", subject: "طلب سيوقفه حارس", options: "بديلان", expectedReturn: "عائد", risks: "مخاطر" });
    state = advanceSpendChain(state, "hares", { action: "governance_review", result: "موقوف", note: "يتجاوز حدود الصلاحية المعتمدة.", reasonCode: "authority" });
    writeApproval({ ...listApprovals().find((row) => row.id === item.id)!, metadata: { ...item.metadata, spendChain: state } });
    const desk = buildDecisionDesk(NOW);
    expect(desk.cards).toHaveLength(0);
    expect(desk.returned).toHaveLength(1);
    expect(desk.returned[0].holderName).toBeTruthy();
    expect(Date.parse(desk.returned[0].expiresAt)).toBeGreaterThan(NOW.getTime());
    expect(expiredReturns(NOW)).toHaveLength(0);
    expect(expiredReturns(new Date("2026-11-21T18:00:00.000Z"))).toHaveLength(1);
  });

  it("schedules the digest at 20:00 Riyadh", () => {
    expect(nextDigestAt(new Date("2026-11-14T09:00:00.000Z"))).toBe("2026-11-14T17:00:00.000Z");
    expect(nextDigestAt(new Date("2026-11-14T18:00:00.000Z"))).toBe("2026-11-15T17:00:00.000Z");
  });
});
