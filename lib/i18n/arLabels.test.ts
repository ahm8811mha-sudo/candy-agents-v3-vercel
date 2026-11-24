import { describe, expect, it } from "vitest";
import { levelLabel, roleLabel, statusLabel, typeLabel } from "./arLabels";

describe("Arabic display labels", () => {
  it("maps raw statuses the Chairman saw in English", () => {
    expect(statusLabel("REJECTED")).toBe("مرفوض");
    expect(statusLabel("PENDING_APPROVAL")).toBe("بانتظار الاعتماد");
    expect(statusLabel("rejected")).toBe("مرفوض");
  });
  it("names the employee behind an English role", () => {
    expect(roleLabel("Risk Manager")).toBe("حارس (المخاطر والحوكمة)");
    expect(roleLabel("CFO")).toBe("عبدالرحمن (المالية)");
    expect(roleLabel("Operations Manager")).toBe("فهد (العمليات)");
    expect(roleLabel("CEO Office")).toBe("سلطان (المكتب التنفيذي)");
  });
  it("keeps unknown values and empty input safe", () => {
    expect(statusLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    expect(roleLabel(null)).toBe("");
    expect(levelLabel("HIGH")).toBe("مرتفع");
    expect(typeLabel("opportunity_radar_runs")).toBe("تجربة رادار الفرص");
  });
});
