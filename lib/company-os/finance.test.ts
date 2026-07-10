import { describe, expect, it } from "vitest";
import { buildDecisionPacket, prioritizeBoardAgenda } from "./board";
import { assertBalancedJournal, availableBudgetSAR, canReserveBudget, reconcileExecution } from "./finance";

describe("finance engine controls", () => {
  it("calculates available budget and blocks over-commitment", () => {
    const state = { approvedSAR: 100_000, committedSAR: 30_000, consumedSAR: 20_000, releasedSAR: 5_000 };
    expect(availableBudgetSAR(state)).toBe(55_000);
    expect(canReserveBudget(state, 50_000).allowed).toBe(true);
    expect(canReserveBudget(state, 60_000).allowed).toBe(false);
  });

  it("rejects unbalanced journals", () => {
    expect(assertBalancedJournal([{ debitSAR: 100, creditSAR: 0 }, { debitSAR: 0, creditSAR: 100 }]).balanced).toBe(true);
    expect(() => assertBalancedJournal([{ debitSAR: 100, creditSAR: 0 }])).toThrow("Unbalanced journal");
  });

  it("requires external receipt and balanced ledger for reconciliation", () => {
    expect(reconcileExecution({ expectedAmountSAR: 100, actualAmountSAR: 100, ledgerBalanced: true, receiptPresent: true }).status).toBe("RECONCILED");
    const failed = reconcileExecution({ expectedAmountSAR: 100, actualAmountSAR: 90, ledgerBalanced: false, receiptPresent: false });
    expect(failed.status).toBe("EXCEPTION");
    expect(failed.exceptions).toContain("AMOUNT_MISMATCH");
  });
});

describe("AI executive board protocol", () => {
  it("requires options and kill criteria for material decisions", () => {
    expect(() => buildDecisionPacket({
      tenantId: "t1",
      title: "Material investment",
      recommendation: "Invest",
      facts: ["Validated demand"],
      assumptions: [],
      options: [{ label: "Invest", benefits: [], risks: [] }],
      financialImpactSAR: 100_000,
      riskLevel: "HIGH",
      successCriteria: ["ROI > 20%"],
      killCriteria: ["No revenue in 90 days"],
      reviewAt: new Date().toISOString(),
    })).toThrow("at least two considered options");
  });

  it("prioritizes critical and overdue agenda items", () => {
    const ordered = prioritizeBoardAgenda([
      { id: "1", title: "Routine", riskLevel: "LOW", financialImpactSAR: 1_000, ownerRole: "COO", evidenceCount: 1, overdue: false },
      { id: "2", title: "Incident", riskLevel: "CRITICAL", financialImpactSAR: 10_000, ownerRole: "CRO", evidenceCount: 3, overdue: false },
      { id: "3", title: "Delayed approval", riskLevel: "HIGH", financialImpactSAR: 100_000, ownerRole: "CEO", evidenceCount: 2, overdue: true },
    ]);
    expect(ordered[0].id).toBe("2");
  });
});
