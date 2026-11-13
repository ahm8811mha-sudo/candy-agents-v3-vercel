import { beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "./route";
import {
  _clearChairmanCommands,
  getChairmanCommand,
  issueChairmanCommand,
  updateChairmanCommand,
} from "@/lib/company/chairmanCommands";
import { _clearApprovals } from "@/lib/approvals";

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(new Request("http://localhost/api/commands", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  }));
}

async function finishInternalWork(id: string) {
  for (let guard = 0; guard < 12; guard += 1) {
    const command = getChairmanCommand(id)!;
    const step = command.steps.find((item) => item.status !== "DONE" && (item.kind === "INTERNAL"));
    if (!step) return command;
    await updateChairmanCommand(step.ownerAgentId, id, { action: "progress", stepId: step.id, note: `أنجزت: ${step.title}`, evidence: "/docs/evidence" });
  }
  return getChairmanCommand(id)!;
}

describe("decision desk on /api/commands", () => {
  beforeEach(() => {
    _clearChairmanCommands();
    _clearApprovals();
  });

  it("raises a card after the internal work and lets only the Chairman decide it", async () => {
    const issued = await issueChairmanCommand("أرسل بريداً للعميل بتأكيد موعد التسليم");
    const ready = await finishInternalWork(issued.id);
    expect(ready.status).toBe("AWAITING_CHAIRMAN");

    const desk = await (await GET(new Request("http://localhost/api/commands?view=desk"))).json();
    expect(desk.desk.cards.some((card: { commandId: string }) => card.commandId === issued.id)).toBe(true);
    expect(desk.desk.cards.length).toBeLessThanOrEqual(7);

    const system = await post({ action: "decide", commandId: issued.id, decision: "approve" }, { "x-api-key": "anything" });
    expect(system.status).toBe(403);

    const noNote = await post({ action: "decide", commandId: issued.id, decision: "return" });
    expect(noNote.status).toBe(400);

    const deferred = await post({ action: "decide", commandId: issued.id, decision: "defer" });
    expect(deferred.status).toBe(200);
    expect(getChairmanCommand(issued.id)?.decision?.status).toBe("DEFERRED");
  });

  it("rejects an unknown decision and a spend approve through this route", async () => {
    expect((await post({ action: "decide", commandId: "x", decision: "maybe" })).status).toBe(400);
    expect((await post({ action: "decide", approvalId: "a1", decision: "approve" })).status).toBe(400);
  });
});
