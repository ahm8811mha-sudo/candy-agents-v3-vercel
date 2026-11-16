import { beforeEach, describe, expect, it } from "vitest";
import { _clearApprovals, writeApproval, type ApprovalItem } from "../approvals";
import { _clearChairmanCommands, issueChairmanCommand } from "./chairmanCommands";
import { blankSpendChain } from "./spendChain";
import { buildOfficeFloor } from "./officeFloor";

const at = "2026-11-10T09:00:00.000Z";
function spend(id: string, title: string, amount: number, chain: Record<string, unknown>, type: ApprovalItem["type"] = "IDEA"): ApprovalItem {
  return writeApproval({ id, type, title, detail: "", amount, requestedRole: "OWNER", status: "PENDING", createdAt: at, metadata: { spendChain: { ...blankSpendChain({ amountSAR: amount, subject: title }), ...chain } } });
}

describe("counter drill-down", () => {
  beforeEach(() => { _clearApprovals(); _clearChairmanCommands(); });

  it("every office counter equals the length of the list it opens, with stage, holder and reason", async () => {
    spend("apr-dedupe-radar", "Opportunity radar pilot", 5000, { stage: "department", preparingAgentId: "sultan" }, "BUDGET");
    for (let i = 1; i <= 9; i += 1) {
      spend(`apr-idea-daily-2026-09-${String(i).padStart(2, "0")}`, `فكرة رقم ${i}`, 1000 * i, {
        stage: "finance",
        financeReview: { result: "غير موافق", note: `لا ميزانية معتمدة للفكرة ${i}.`, by: "abdulrahman", at },
      });
    }
    await issueChairmanCommand("راجع عرض السعر للعميل الحالي داخلياً");
    const floor = buildOfficeFloor({ tasks: [{ id: "t1", title: "جرد المخزون", status: "IN_PROGRESS", assigned_to: "fahad" }], tasksAvailable: true });
    for (const [key, value] of Object.entries(floor.counters)) expect(floor.counterItems[key]).toHaveLength(value as number);
    expect(floor.counters.returned).toBe(9);
    expect(floor.counters.spendInChain).toBe(1);

    const radar = floor.counterItems.spendInChain[0];
    expect(radar).toMatchObject({ id: "apr-dedupe-radar", amountSAR: 5000, stage: "إعداد القسم", holderId: "sultan", href: "/spend/apr-dedupe-radar" });

    const returned = floor.counterItems.returned.find((item) => item.id === "apr-idea-daily-2026-09-03")!;
    expect(returned).toMatchObject({ kind: "returned", amountSAR: 3000, holderId: "rased" });
    expect(returned.reason).toContain("لا ميزانية معتمدة للفكرة 3");
    expect(returned.dueAt).toBeTruthy();

    expect(floor.counterItems.inProgress.map((item) => item.title)).toContain("جرد المخزون");

    const rased = floor.employees.find((e) => e.id === "rased")!;
    expect(rased.kpiItems.returned).toHaveLength(rased.kpis.returned);
    expect(rased.kpiItems.open).toHaveLength(rased.kpis.open);
    expect(rased.kpis.returned).toBe(9);
  });
});
