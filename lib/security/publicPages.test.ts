import { describe, expect, it } from "vitest";
import { shouldServePublicDocument } from "./publicPages";

describe("public OAuth pages", () => {
  it("serves privacy and terms with or without a session", () => {
    expect(shouldServePublicDocument("/privacy", false)).toBe(true);
    expect(shouldServePublicDocument("/terms", false)).toBe(true);
    expect(shouldServePublicDocument("/privacy", true)).toBe(true);
    expect(shouldServePublicDocument("/terms", true)).toBe(true);
  });

  it("serves the home page only when the owner device is locked", () => {
    expect(shouldServePublicDocument("/", false)).toBe(true);
    expect(shouldServePublicDocument("/", true)).toBe(false);
  });

  it("leaves the private office and the login gate alone", () => {
    for (const path of ["/inbox", "/status", "/login", "/api/health", "/api/dashboard"]) {
      expect(shouldServePublicDocument(path, false)).toBe(false);
      expect(shouldServePublicDocument(path, true)).toBe(false);
    }
  });
});
