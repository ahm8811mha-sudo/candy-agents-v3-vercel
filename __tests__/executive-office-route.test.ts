import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/executiveOffice", () => ({
  createExecutiveItem: vi.fn(),
  createExecutiveCalendarEvent: vi.fn(),
  createMeetingMinutes: vi.fn(),
  generateExecutiveBrief: vi.fn(),
  getExecutiveOffice: vi.fn(),
  runExecutiveRadar: vi.fn(),
  runExecutiveRequest: vi.fn(),
  updateExecutiveItem: vi.fn(),
}));

import { GET, POST } from "@/app/api/executive-office/route";
import { getExecutiveOffice } from "@/lib/executiveOffice";

const ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VERCEL_ENV",
  "VERCEL_PROJECT_PRODUCTION_URL",
] as const;
const originalEnvironment = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ENV_KEYS) delete process.env[key];
});

afterAll(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("executive office database readiness", () => {
  it("explains an isolated preview without leaking or calling the office service", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "candy-agents-v3-vercel.vercel.app";

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json).toMatchObject({
      ok: false,
      code: "SUPABASE_NOT_CONFIGURED",
      configured: false,
      deployment: {
        environment: "preview",
        isPreview: true,
        productionUrl: "https://candy-agents-v3-vercel.vercel.app",
      },
    });
    expect(json.error).toContain("نسخة معاينة معزولة");
    expect(json.missingEnvironmentVariables).toHaveLength(2);
    expect(getExecutiveOffice).not.toHaveBeenCalled();
  });

  it("fails closed before a write when the database is not configured", async () => {
    const request = new Request("http://localhost/api/executive-office", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "radar" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "SUPABASE_NOT_CONFIGURED" });
  });

  it("accepts the current server secret and loads real office data", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_server-only";
    vi.mocked(getExecutiveOffice).mockResolvedValue({
      operatingBrief: { healthScore: 82 },
    } as Awaited<ReturnType<typeof getExecutiveOffice>>);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ ok: true, operatingBrief: { healthScore: 82 } });
    expect(JSON.stringify(json)).not.toContain("sb_secret_server-only");
  });

  it("does not expose internal database errors to the browser", async () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "legacy-secret";
    vi.mocked(getExecutiveOffice).mockRejectedValue(new Error("sensitive database detail"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await GET();
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json).toMatchObject({
        code: "EXECUTIVE_OFFICE_UNAVAILABLE",
        error: "تعذر تحميل بيانات المكتب التنفيذي حالياً.",
      });
      expect(JSON.stringify(json)).not.toContain("sensitive database detail");
    } finally {
      consoleError.mockRestore();
    }
  });
});
