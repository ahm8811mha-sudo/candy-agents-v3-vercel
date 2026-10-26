import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "./route";
import { _clearChairmanCommands } from "@/lib/company/chairmanCommands";

function post(body: unknown) {
  return POST(new Request("http://localhost/api/commands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

describe("POST /api/commands", () => {
  beforeEach(() => {
    _clearChairmanCommands();
  });

  it("accepts an assignee and addresses a name when routing stays automatic", async () => {
    const assigned = await post({ command: "راجع الجدول الداخلي", assignee: "fahad" });
    expect(assigned.status).toBe(200);
    expect((await assigned.json()).command.ownerAgentId).toBe("fahad");

    const named = await post({ command: "يا سارة راجع الميزانية", assignee: "automatic" });
    expect((await named.json()).command.ownerAgentId).toBe("sara");
  });

  it("returns 400 for an unknown employee and a short command", async () => {
    expect((await post({ command: "راجع العمل الداخلي", assignee: "ghost" })).status).toBe(400);
    expect((await post({ command: "راجع العمل الداخلي", assignee: "owner" })).status).toBe(400);
    expect((await post({ command: "لا" })).status).toBe(400);
  });
});
