import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { signWebhookBody } from "../lib/company/webhooks";
import { getTenantId, isMultiTenantEnabled, withTenant, DEFAULT_TENANT_ID } from "../lib/tenant";
import {
  setAgentOverride,
  clearAgentOverride,
  getEffectiveAgents,
  getEffectiveAgent,
  _clearAgentOverrides,
} from "../lib/company/agentOverrides";
import { getFeedCursor } from "../lib/company/feed";
import { submitIdea, _clearIdeas } from "../lib/company/ideas";
import { _clearApprovals } from "../lib/approvals";
import { _clearDecisions } from "../lib/decisions";

describe("webhooks (roadmap #3)", () => {
  it("signs the body with HMAC-SHA256 hex", () => {
    const sig = signWebhookBody('{"event":"idea.submitted"}', "secret-1");
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
    // deterministic
    expect(signWebhookBody('{"event":"idea.submitted"}', "secret-1")).toBe(sig);
    // secret-sensitive
    expect(signWebhookBody('{"event":"idea.submitted"}', "secret-2")).not.toBe(sig);
  });
});

describe("multi-tenant groundwork (roadmap #2)", () => {
  afterEach(() => {
    delete process.env.ORVANTA_MULTI_TENANT;
    delete process.env.ORVANTA_TENANT_ID;
  });

  it("defaults to golden-star with multi-tenancy off", () => {
    expect(getTenantId()).toBe(DEFAULT_TENANT_ID);
    expect(isMultiTenantEnabled()).toBe(false);
    expect(withTenant({ id: "x" })).toEqual({ id: "x" });
  });

  it("stamps rows with the tenant id when enabled", () => {
    process.env.ORVANTA_MULTI_TENANT = "true";
    process.env.ORVANTA_TENANT_ID = "acme";
    expect(withTenant({ id: "x" })).toEqual({ id: "x", tenant_id: "acme" });
  });
});

describe("customizable agents (roadmap #5)", () => {
  beforeEach(() => _clearAgentOverrides());

  it("renames and retitles an agent without touching structure", () => {
    const updated = setAgentOverride({ agentId: "sultan", name: "طارق", title: "المدير التنفيذي" });
    expect(updated?.name).toBe("طارق");
    const effective = getEffectiveAgent("sultan")!;
    expect(effective.name).toBe("طارق");
    expect(effective.title).toBe("المدير التنفيذي");
    expect(effective.customized).toBe(true);
    // structure untouched
    expect(effective.rank).toBe("CEO");
    expect(effective.authorityLimitSAR).toBe(25_000);
  });

  it("deactivation flags the agent but keeps them in the registry", () => {
    setAgentOverride({ agentId: "noura", active: false });
    const effective = getEffectiveAgent("noura")!;
    expect(effective.active).toBe(false);
    expect(getEffectiveAgents().length).toBeGreaterThan(5);
  });

  it("the owner can never be customized", () => {
    expect(setAgentOverride({ agentId: "owner", name: "غيره" })).toBeNull();
    expect(getEffectiveAgent("owner")!.customized).toBe(false);
  });

  it("reset restores defaults", () => {
    setAgentOverride({ agentId: "sultan", name: "طارق" });
    clearAgentOverride("sultan");
    expect(getEffectiveAgent("sultan")!.name).toBe("سلطان");
  });
});

describe("realtime-lite feed cursor (roadmap #1)", () => {
  beforeEach(() => {
    _clearIdeas();
    _clearApprovals();
    _clearDecisions();
  });

  it("changes the fingerprint when a governed store mutates", () => {
    const before = getFeedCursor();
    submitIdea({ title: "فكرة للبث", hypothesis: "ف", budgetSAR: 8_000, horizonDays: 21 });
    const after = getFeedCursor();
    expect(after.version).not.toBe(before.version);
    expect(after.pending).toBeGreaterThan(before.pending);
  });

  it("is stable when nothing changes", () => {
    submitIdea({ title: "فكرة ثابتة", hypothesis: "ف", budgetSAR: 8_000, horizonDays: 21 });
    expect(getFeedCursor().version).toBe(getFeedCursor().version);
  });
});
