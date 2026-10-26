import { listApprovals, writeApproval } from "../../lib/approvals";
import { advanceSpendChain, readSpendChain } from "../../lib/company/spendChain";

/** Walk a stored money request to the Chairman. Tests use this; employees still cannot decide it. */
export function readySpendForDecision(id: string) {
  const item = listApprovals().find((approval) => approval.id === id);
  if (!item) throw new Error(`approval ${id} missing`);
  let state = readSpendChain(item);
  if (!state) return item;
  if (state.stage === "department") {
    state = advanceSpendChain(state, "fahad", {
      action: "submit_department",
      subject: item.title,
      options: "البديل الأقل تكلفة",
      expectedReturn: "عائد محدد في الدراسة",
      risks: "مخاطر محددة في الدراسة",
    });
  }
  if (state.stage === "finance") {
    state = advanceSpendChain(state, "abdulrahman", {
      action: "finance_review",
      result: "موافق",
      note: "راجعت الميزانية والسيولة والعائد والبدائل.",
    });
  }
  if (state.stage === "governance") {
    state = advanceSpendChain(state, "hares", {
      action: "governance_review",
      result: "سليم",
      note: "الفحص سليم ولا تجاوز للصلاحيات في الطلب.",
    });
  }
  if (state.stage === "sultan") {
    state = advanceSpendChain(state, "sultan", {
      action: "sultan_recommendation",
      result: "موافقة",
      note: "أوصي بعرض المذكرة على رئيس مجلس الإدارة للاعتماد.",
    });
  }
  return writeApproval({ ...item, metadata: { ...item.metadata, spendChain: state } });
}
