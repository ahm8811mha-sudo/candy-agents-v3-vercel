/**
 * Machine auth for the per-agent bridge and the Chairman digest.
 * Keys are compared in constant time and never returned to callers.
 */

export const AGENT_BRIDGE_HEADER = "x-agent-bridge-key";
export const CHAIRMAN_DIGEST_HEADER = "x-chairman-digest-key";

export type BridgeAccess =
  | { ok: true; scope: "master" | "agent" | "digest"; agentId?: string }
  | { ok: false; presented: boolean; status: 401 | 403; error: string };

function secureEqual(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export function agentKeyEnvName(agentId: string) {
  return `AGENT_BRIDGE_KEY_${agentId.toUpperCase()}`;
}

function agentFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/api\/bridge\/agents\/([a-z]+)(?:\/|$)/);
  return match ? match[1] : null;
}

export function authorizeBridgeHeaders(input: {
  pathname: string;
  agentBridgeKey: string | null;
  chairmanDigestKey: string | null;
  env?: NodeJS.ProcessEnv;
}): BridgeAccess {
  const env = input.env || process.env;
  const master = env.AGENT_BRIDGE_KEY || "";
  const digestSecret = env.CHAIRMAN_DIGEST_KEY || "";
  const presented = Boolean(input.agentBridgeKey || input.chairmanDigestKey);
  const denied = (status: 401 | 403, error: string): BridgeAccess => ({ ok: false, presented, status, error });

  if (input.pathname === "/api/bridge/chairman/digest") {
    if (input.chairmanDigestKey && secureEqual(input.chairmanDigestKey, digestSecret)) {
      return { ok: true, scope: "digest" };
    }
    if (input.agentBridgeKey && secureEqual(input.agentBridgeKey, master)) {
      return { ok: true, scope: "master" };
    }
    if (!presented) return denied(401, "يلزم مفتاح الجسر أو مفتاح ملخص رئيس مجلس الإدارة.");
    return denied(401, "المفتاح غير مقبول لهذا المسار.");
  }

  if (input.pathname === "/api/bridge/commands") {
    if (input.agentBridgeKey && secureEqual(input.agentBridgeKey, master)) {
      return { ok: true, scope: "master" };
    }
    if (!presented) return denied(401, "يلزم مفتاح جسر الوكلاء.");
    return denied(401, "المفتاح غير مقبول لهذا المسار.");
  }

  if (!input.pathname.startsWith("/api/bridge/agents")) {
    return denied(403, "مسار غير معروف.");
  }

  const pathAgent = agentFromPath(input.pathname);
  if (input.agentBridgeKey && secureEqual(input.agentBridgeKey, master)) {
    return { ok: true, scope: "master", agentId: pathAgent || undefined };
  }

  const rosterAgent = pathAgent;
  if (input.agentBridgeKey && rosterAgent) {
    const dedicated = env[agentKeyEnvName(rosterAgent)] || "";
    if (secureEqual(input.agentBridgeKey, dedicated)) {
      return { ok: true, scope: "agent", agentId: rosterAgent };
    }
  }

  if (!pathAgent && input.agentBridgeKey) {
    const entries = Object.entries(env).filter(([key, value]) => key.startsWith("AGENT_BRIDGE_KEY_") && value);
    for (const [key, value] of entries) {
      if (secureEqual(input.agentBridgeKey, value)) {
        const agentId = key.slice("AGENT_BRIDGE_KEY_".length).toLowerCase();
        return { ok: true, scope: "agent", agentId };
      }
    }
  }

  if (!presented) return denied(401, "يلزم مفتاح جسر الوكلاء.");
  return denied(401, "المفتاح غير مقبول لهذا المسار.");
}
