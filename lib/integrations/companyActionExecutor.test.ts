import { afterEach, describe, expect, it, vi } from "vitest";
import { getCompanyActionIntegrationPlan } from "./companyActionExecutor";
import { getGoogleWorkspaceStatus, isTransientGoogleError, withGoogleRetry } from "./googleWorkspace";

const ENV_KEYS = [
  "GOOGLE_INTEGRATIONS_ENABLED",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
] as const;

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  vi.restoreAllMocks();
});

describe("company action integration plans", () => {
  it("maps sales outreach to a safe Gmail draft", () => {
    expect(getCompanyActionIntegrationPlan({ action_type: "SALES_OUTREACH", payload: null })).toMatchObject({
      capability: "gmail",
      operation: "GMAIL_DRAFT",
    });
  });

  it("maps supplier lists to Sheets and campaign drafts to Drive", () => {
    expect(getCompanyActionIntegrationPlan({ action_type: "SUPPLIER_SHORTLIST", payload: null })?.operation).toBe("SHEETS_APPEND");
    expect(getCompanyActionIntegrationPlan({ action_type: "MARKETING_CAMPAIGN_DRAFT", payload: null })?.operation).toBe("DRIVE_UPLOAD");
  });

  it("allows an explicit integration operation in the action payload", () => {
    const plan = getCompanyActionIntegrationPlan({
      action_type: "CUSTOM_ACTION",
      payload: { integration: { operation: "GMAIL_SEND" } },
    });
    expect(plan?.operation).toBe("GMAIL_SEND");
  });
});

describe("Google Workspace readiness", () => {
  it("requires the kill switch and OAuth credentials", () => {
    const status = getGoogleWorkspaceStatus();
    expect(status.enabled).toBe(false);
    expect(status.capabilities.gmail).toBe(false);
    expect(status.missingEnvironmentVariables).toContain("GOOGLE_INTEGRATIONS_ENABLED");
  });

  it("reports all capabilities ready after configuration", () => {
    process.env.GOOGLE_INTEGRATIONS_ENABLED = "true";
    process.env.GOOGLE_CLIENT_ID = "client";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    process.env.GOOGLE_REFRESH_TOKEN = "refresh";
    const status = getGoogleWorkspaceStatus();
    expect(status.capabilities).toEqual({ gmail: true, sheets: true, drive: true });
    expect(status.missingEnvironmentVariables).toEqual([]);
  });
});

describe("Google retry policy", () => {
  it("classifies rate limits and server errors as transient", () => {
    expect(isTransientGoogleError({ response: { status: 429 } })).toBe(true);
    expect(isTransientGoogleError({ response: { status: 503 } })).toBe(true);
    expect(isTransientGoogleError({ response: { status: 400 } })).toBe(false);
  });

  it("retries transient failures and returns the successful result", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const promise = withGoogleRetry(async () => {
      attempts += 1;
      if (attempts < 2) throw { response: { status: 429 } };
      return "ok";
    }, 2);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe("ok");
    expect(attempts).toBe(2);
    vi.useRealTimers();
  });
});
