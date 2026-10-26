import { describe, expect, it } from "vitest";
import { AGENT_MANUALS, composeAgentSystemPrompt, liveManual, resolveManualAgents } from "./agentManuals";
import { prepareAgentCall } from "../ai";

const BOARD = "مجلس الإدارة في أورفانتا: يرأسه أحمد (المالك ورئيس مجلس الإدارة، ومهامه الاطلاع والاعتماد النهائي فقط)، وعضويته سلطان (الرئيس التنفيذي).";

describe("agent manuals", () => {
  it("stores the Chairman board line and Sultan's escalation line", () => {
    for (const text of Object.values(AGENT_MANUALS)) {
      expect(text).toContain(BOARD);
      expect(text).not.toContain("مجلس الإدارة في أورفانتا: سلطان (الرئيس التنفيذي) وأحمد (المالك والسلطة العليا).");
    }
    expect(AGENT_MANUALS.sultan).toContain("ترفع إلى: أحمد (المالك ورئيس مجلس الإدارة)");
    expect(AGENT_MANUALS.sultan).not.toContain("ترفع إلى: أحمد (المالك).");
  });

  it("replaces the not-connected sentence when the manual is used", () => {
    const live = liveManual("sultan") || "";
    expect(live).toContain("مربوط ببيانات أورفانتا المباشرة");
    expect(live).not.toContain("غير مربوط ببيانات موقع أورفانتا المباشرة");
    expect(AGENT_MANUALS.sultan).toContain("غير مربوط");
    const feminine = liveManual("noura") || "";
    expect(feminine).toContain("أنتِ مربوطة");
  });

  it("maps task agents and keeps the task instructions after the manual", () => {
    expect(resolveManualAgents("finance_feasibility_agent")).toEqual(["abdulrahman"]);
    expect(resolveManualAgents("market_strategy_agent")).toEqual(["noura"]);
    expect(resolveManualAgents("market_analyst_agent")).toEqual(["noura"]);
    expect(resolveManualAgents("operations_execution_agent")).toEqual(["fahad"]);
    expect(resolveManualAgents("procurement_agent")).toEqual(["khalid"]);
    expect(resolveManualAgents("risk_agent")).toEqual(["hares"]);
    expect(resolveManualAgents("decision_agent")).toEqual(["sultan"]);
    expect(resolveManualAgents("opportunity_agent")).toEqual(["rased"]);
    expect(resolveManualAgents("execution_agent")).toEqual(["fahad"]);
    expect(resolveManualAgents("initiative_execution_agent")).toEqual(["fahad"]);
    expect(resolveManualAgents("feasibility_agent")).toEqual(["abdulrahman", "noura", "fahad"]);
    expect(resolveManualAgents("correspondence_sara_agent")).toEqual(["sara"]);
    const prompt = composeAgentSystemPrompt("finance_feasibility_agent", "راجع هذا البند فقط.");
    expect(prompt.startsWith("دليل التشغيل: عبدالرحمن")).toBe(true);
    expect(prompt).toContain("تعليمات هذه المهمة:\nراجع هذا البند فقط.");
    const committee = composeAgentSystemPrompt("feasibility_agent", "مهمة اللجنة");
    expect(committee).toContain("كلجنة");
    expect(committee).toContain("نورة");
    expect(committee).toContain("فهد");
    const prepared = prepareAgentCall({ agentName: "risk_agent", system: "افحص الصلاحية." });
    expect(prepared.system).toContain("حارس");
    expect(prepared.system).toContain("افحص الصلاحية.");
  });
});
