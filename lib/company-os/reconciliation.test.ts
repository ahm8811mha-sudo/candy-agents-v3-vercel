import { describe, expect, it } from "vitest";
import { externalReferenceFromOutput } from "./reconciliation";
import { reconcileExecution } from "./finance";

describe("action reconciliation", () => {
  it("extracts stable provider receipts", () => {
    expect(externalReferenceFromOutput({ messageId: "gmail-1" })).toBe("gmail-1");
    expect(externalReferenceFromOutput({ fileId: "drive-1" })).toBe("drive-1");
    expect(externalReferenceFromOutput({ spreadsheetId: "sheet-1" })).toBe("sheet-1");
  });

  it("blocks completion without an external receipt", () => {
    const result = reconcileExecution({ ledgerBalanced: true, receiptPresent: false });
    expect(result.reconciled).toBe(false);
    expect(result.exceptions).toContain("MISSING_EXTERNAL_RECEIPT");
  });

  it("blocks financial completion with an unbalanced ledger", () => {
    const result = reconcileExecution({
      expectedAmountSAR: 1000,
      actualAmountSAR: 1000,
      ledgerBalanced: false,
      receiptPresent: true,
    });
    expect(result.reconciled).toBe(false);
    expect(result.exceptions).toContain("UNBALANCED_LEDGER");
  });
});
