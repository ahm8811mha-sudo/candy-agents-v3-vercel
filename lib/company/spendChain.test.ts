import { beforeEach, describe, expect, it } from "vitest";
import { createApproval, decideApproval, listApprovals, writeApproval, _clearApprovals } from "../approvals";
import { getInbox } from "../inbox";
import { spendQueueForAgent } from "./agentBridge";
import {
  advanceSpendChain,
  agentMayApproveSpend,
  approvalVisibleToChairman,
  blankSpendChain,
  chairmanSpendBlock,
  isOwnerReadySpend,
  readSpendChain,
} from "./spendChain";
import { readySpendForDecision } from "../../__tests__/fixtures/readySpend";

describe("owner-only spend chain", () => {
  beforeEach(() => _clearApprovals());

  it("lets no employee approve an amount above zero", () => {
    for (const agent of ["sultan", "abdulrahman", "hares", "sara", "diwan"]) {
      expect(agentMayApproveSpend(agent, 1)).toBe(false);
      expect(agentMayApproveSpend(agent, 25_000)).toBe(false);
    }
    expect(agentMayApproveSpend("owner", 1)).toBe(true);
    const item = createApproval({ type: "BUDGET", title: "شراء", detail: "d", amount: 800 });
    expect(() => decideApproval(item.id, "APPROVED", "سلطان")).toThrow(/سلسلة المراجعة|لا يملك/);
    expect(() => decideApproval(item.id, "APPROVED", "CEO")).toThrow(/سلسلة المراجعة|لا يملك/);
    expect(listApprovals("PENDING")).toHaveLength(1);
  });

  it("enforces department, finance, governance, then Sultan, and stops a governance hold", () => {
    let state = blankSpendChain({ amountSAR: 900, subject: "مواد", preparingAgentId: "khalid" });
    expect(() => advanceSpendChain(state, "abdulrahman", { action: "finance_review", result: "موافق", note: "ملاحظة كافية للمراجعة." })).toThrow(/بعد تجهيز/);
    state = advanceSpendChain(state, "khalid", {
      action: "submit_department",
      subject: "مواد تغليف",
      options: "الشراء أو التأجيل",
      expectedReturn: "استمرار التوريد",
      risks: "ارتفاع السعر",
    });
    expect(state.stage).toBe("finance");
    expect(() => advanceSpendChain(state, "sultan", { action: "finance_review", result: "موافق", note: "ملاحظة كافية للمراجعة." })).toThrow(/عبدالرحمن/);
    const refused = advanceSpendChain(state, "abdulrahman", { action: "finance_review", result: "غير موافق", note: "السيولة لا تتحمل هذا الشراء الآن." });
    expect(refused.stage).toBe("owner"); // a finance refusal goes to the Chairman to close
    state = advanceSpendChain(state, "abdulrahman", { action: "finance_review", result: "موافق", note: "السيولة تتحمل هذا الشراء الآن." });
    const held = advanceSpendChain(state, "hares", { action: "governance_review", result: "موقوف", note: "الطلب يقف عند الحوكمة ولا يُرفع." });
    expect(held.stage).toBe("owner"); // waiting for the Chairman to close it, never for Sultan
    expect(() => advanceSpendChain(held, "sultan", { action: "sultan_recommendation", result: "موافقة", note: "أوصي بالعرض على رئيس مجلس الإدارة." })).toThrow(/بعد فحص/);
  });

  it("shows the Chairman only a completed memo, and keeps a legacy money item with Abdulrahman", async () => {
    const legacy = createApproval({ type: "TRADE", title: "طلب قديم", detail: "قائم", amount: 15000, metadata: {} });
    writeApproval({ ...legacy, metadata: {} });
    const chain = readSpendChain(listApprovals().find((item) => item.id === legacy.id)!)!;
    expect(chain.stage).toBe("finance");
    expect(chain.needsChainReview).toBe(true);
    expect(chain.note).toContain("needs chain review");
    expect(approvalVisibleToChairman(legacy.id ? { ...legacy, metadata: {}, status: "PENDING" } : legacy)).toBe(false);
    expect(spendQueueForAgent("abdulrahman").some((item) => item.id === legacy.id)).toBe(true);
    expect(spendQueueForAgent("sultan").some((item) => item.id === legacy.id)).toBe(false);

    const operational = createApproval({ type: "DECISION", title: "ترتيب وردية", detail: "بلا مبلغ" });
    const inbox = await getInbox();
    expect(inbox.items.some((item) => item.title === "طلب قديم")).toBe(false);
    expect(inbox.items.some((item) => item.title === "ترتيب وردية")).toBe(true);

    readySpendForDecision(legacy.id);
    const ready = listApprovals().find((item) => item.id === legacy.id)!;
    expect(isOwnerReadySpend(readSpendChain(ready))).toBe(true);
    expect(chairmanSpendBlock("CEO", ready)).toMatch(/لا يملك/);
    expect(chairmanSpendBlock("OWNER", ready)).toBeNull();
    const decided = decideApproval(ready.id, "APPROVED", "أحمد ناصر الأحمد");
    expect(decided?.status).toBe("APPROVED");
    expect(listApprovals().find((item) => item.id === operational.id)?.status).toBe("PENDING");
  });
});
