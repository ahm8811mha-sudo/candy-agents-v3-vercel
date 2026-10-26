import { describe, expect, it } from "vitest";
import { authorizeBridgeHeaders } from "./agentBridgeAuth";

const env = {
  AGENT_BRIDGE_KEY: "master-key-value",
  AGENT_BRIDGE_KEY_SARA: "sara-key-value",
  CHAIRMAN_DIGEST_KEY: "digest-key-value",
} as unknown as NodeJS.ProcessEnv;

describe("bridge keys", () => {
  it("lets a per-agent key open only that employee", () => {
    const own = authorizeBridgeHeaders({
      pathname: "/api/bridge/agents/sara/inbox",
      agentBridgeKey: "sara-key-value",
      chairmanDigestKey: null,
      env,
    });
    expect(own).toMatchObject({ ok: true, scope: "agent", agentId: "sara" });
    const other = authorizeBridgeHeaders({
      pathname: "/api/bridge/agents/khalid/inbox",
      agentBridgeKey: "sara-key-value",
      chairmanDigestKey: null,
      env,
    });
    expect(other.ok).toBe(false);
    const digest = authorizeBridgeHeaders({
      pathname: "/api/bridge/chairman/digest",
      agentBridgeKey: "sara-key-value",
      chairmanDigestKey: null,
      env,
    });
    expect(digest.ok).toBe(false);
  });

  it("lets the master key open agents and the digest, and the digest key open only the digest", () => {
    expect(authorizeBridgeHeaders({
      pathname: "/api/bridge/agents",
      agentBridgeKey: "master-key-value",
      chairmanDigestKey: null,
      env,
    }).ok).toBe(true);
    expect(authorizeBridgeHeaders({
      pathname: "/api/bridge/chairman/digest",
      agentBridgeKey: null,
      chairmanDigestKey: "digest-key-value",
      env,
    })).toMatchObject({ ok: true, scope: "digest" });
    expect(authorizeBridgeHeaders({
      pathname: "/api/bridge/agents/sara/workspace",
      agentBridgeKey: null,
      chairmanDigestKey: "digest-key-value",
      env,
    }).ok).toBe(false);
    expect(authorizeBridgeHeaders({
      pathname: "/api/bridge/commands",
      agentBridgeKey: "master-key-value",
      chairmanDigestKey: null,
      env,
    })).toMatchObject({ ok: true, scope: "master" });
    expect(authorizeBridgeHeaders({
      pathname: "/api/bridge/commands",
      agentBridgeKey: "sara-key-value",
      chairmanDigestKey: null,
      env,
    })).toMatchObject({ ok: false, status: 401 });
    expect(authorizeBridgeHeaders({
      pathname: "/api/bridge/commands",
      agentBridgeKey: null,
      chairmanDigestKey: "digest-key-value",
      env,
    })).toMatchObject({ ok: false, presented: true, status: 401 });
    expect(authorizeBridgeHeaders({
      pathname: "/api/bridge/commands",
      agentBridgeKey: null,
      chairmanDigestKey: null,
      env,
    })).toMatchObject({ ok: false, presented: false, status: 401 });
  });

  it("rejects a presented wrong key and reports a missing key separately", () => {
    const wrong = authorizeBridgeHeaders({
      pathname: "/api/bridge/agents/sara/inbox",
      agentBridgeKey: "nope",
      chairmanDigestKey: null,
      env,
    });
    expect(wrong).toMatchObject({ ok: false, presented: true, status: 401 });
    const missing = authorizeBridgeHeaders({
      pathname: "/api/bridge/agents/sara/inbox",
      agentBridgeKey: null,
      chairmanDigestKey: null,
      env,
    });
    expect(missing).toMatchObject({ ok: false, presented: false, status: 401 });
  });
});
