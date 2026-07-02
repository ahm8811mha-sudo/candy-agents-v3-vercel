import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isVercelConfigured, getMonitoringSnapshot } from "../lib/vercelMonitor";

describe("vercelMonitor", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.VERCEL_API_TOKEN;
    delete process.env.VERCEL_PROJECT_ID;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("reports not configured without env vars", () => {
    expect(isVercelConfigured()).toBe(false);
  });

  it("reports configured when both env vars present", () => {
    process.env.VERCEL_API_TOKEN = "token";
    process.env.VERCEL_PROJECT_ID = "prj_123";
    expect(isVercelConfigured()).toBe(true);
  });

  it("returns mock snapshot when not configured", async () => {
    const snapshot = await getMonitoringSnapshot();
    expect(snapshot.source).toBe("mock");
    expect(snapshot.connected).toBe(false);
    expect(snapshot.deployments.length).toBeGreaterThan(0);
  });

  it("counts error deployments accurately", async () => {
    const snapshot = await getMonitoringSnapshot();
    const expectedErrors = snapshot.deployments.filter((d) => d.state === "ERROR").length;
    expect(snapshot.errorCount).toBe(expectedErrors);
  });

  it("derives healthy flag from current state", async () => {
    const snapshot = await getMonitoringSnapshot();
    expect(snapshot.healthy).toBe(snapshot.currentState === "READY");
  });
});
