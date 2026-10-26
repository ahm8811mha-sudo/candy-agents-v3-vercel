import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { _clearChairmanCommands, issueChairmanCommand } from "@/lib/company/chairmanCommands";

const env = {
  AGENT_BRIDGE_KEY: "master-key-value",
  AGENT_BRIDGE_KEY_SARA: "sara-key-value",
  CHAIRMAN_DIGEST_KEY: "digest-key-value",
};

function poll(since: string | null, headers: Record<string, string> = {}) {
  const path = since == null ? "/api/bridge/commands" : `/api/bridge/commands?since=${encodeURIComponent(since)}`;
  return GET(new NextRequest(`http://localhost${path}`, { headers }));
}

describe("GET /api/bridge/commands", () => {
  beforeEach(() => {
    _clearChairmanCommands();
    process.env.AGENT_BRIDGE_KEY = env.AGENT_BRIDGE_KEY;
    process.env.AGENT_BRIDGE_KEY_SARA = env.AGENT_BRIDGE_KEY_SARA;
    process.env.CHAIRMAN_DIGEST_KEY = env.CHAIRMAN_DIGEST_KEY;
  });

  afterEach(() => {
    delete process.env.AGENT_BRIDGE_KEY;
    delete process.env.AGENT_BRIDGE_KEY_SARA;
    delete process.env.CHAIRMAN_DIGEST_KEY;
  });

  it("returns open commands for the master key and writes nothing", async () => {
    const since = new Date(Date.now() - 60_000).toISOString();
    const open = await issueChairmanCommand("خالد: جهّز مقارنة الموردين وأرسلها للمورد");
    const response = await poll(since, { "x-agent-bridge-key": env.AGENT_BRIDGE_KEY });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.commands).toEqual([
      expect.objectContaining({
        id: open.id,
        subject: open.text,
        status: "AWAITING_CHAIRMAN",
        ownerAgentId: "khalid",
      }),
    ]);
    expect(Object.keys(body.commands[0]).sort()).toEqual(["id", "ownerAgentId", "status", "subject", "updatedAt"]);
    const again = await poll(since, { "x-agent-bridge-key": env.AGENT_BRIDGE_KEY });
    expect(await again.json()).toEqual(body);
  });

  it("rejects other keys and a missing or bad since", async () => {
    const since = new Date().toISOString();
    expect((await poll(since, { "x-agent-bridge-key": env.AGENT_BRIDGE_KEY_SARA })).status).toBe(401);
    expect((await poll(since, { "x-chairman-digest-key": env.CHAIRMAN_DIGEST_KEY })).status).toBe(401);
    expect((await poll(since)).status).toBe(401);
    expect((await poll(null, { "x-agent-bridge-key": env.AGENT_BRIDGE_KEY })).status).toBe(400);
    expect((await poll("tomorrow", { "x-agent-bridge-key": env.AGENT_BRIDGE_KEY })).status).toBe(400);
  });
});
