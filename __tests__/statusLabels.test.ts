import { describe, expect, it } from "vitest";
import { approvalGateLabel, entityLabel, financialStateLabel, riskLabel, workStatusLabel } from "@/lib/ui/statusLabels";

describe("status labels", () => {
  it("names every risk level the server reports, in any case", () => {
    expect(riskLabel("LOW")).toBe("منخفضة");
    expect(riskLabel("medium")).toBe("متوسطة");
    expect(riskLabel("HIGH")).toBe("مرتفعة");
    expect(riskLabel("CRITICAL")).toBe("حرجة");
  });

  it("names the approval gates and the financial state", () => {
    expect(approvalGateLabel("AUTO")).toBe("تلقائي ضمن الحدود");
    expect(approvalGateLabel("OWNER")).toBe("المالك");
    expect(financialStateLabel("LOSS_MAKING")).toBe("خاسر");
  });

  it("says a value is missing instead of showing a blank", () => {
    expect(riskLabel(undefined)).toBe("غير محددة");
    expect(approvalGateLabel("")).toBe("غير محدد");
    expect(financialStateLabel(null)).toBe("جاهز");
  });

  it("names work statuses and the record a request is about", () => {
    expect(workStatusLabel("IN_PROGRESS")).toBe("قيد التنفيذ");
    expect(workStatusLabel("watch")).toBe("تحت المراقبة");
    expect(entityLabel("business_action")).toBe("إجراء تجاري");
    expect(entityLabel(undefined)).toBe("طلب اعتماد");
  });

  it("shows an unknown code as it came rather than hiding it", () => {
    expect(riskLabel("SEVERE")).toBe("SEVERE");
    expect(entityLabel("some_new_table")).toBe("some_new_table");
  });
});
