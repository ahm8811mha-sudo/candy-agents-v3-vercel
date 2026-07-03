import { describe, it, expect } from "vitest";
import { hasPermission, isAuthEnabled } from "../lib/auth";

describe("auth", () => {
  describe("hasPermission", () => {
    it("ADMIN has all permissions", () => {
      expect(hasPermission("ADMIN", "VIEWER")).toBe(true);
      expect(hasPermission("ADMIN", "EMPLOYEE")).toBe(true);
      expect(hasPermission("ADMIN", "CEO")).toBe(true);
      expect(hasPermission("ADMIN", "ADMIN")).toBe(true);
    });

    it("CEO has high permissions but not ADMIN", () => {
      expect(hasPermission("CEO", "VIEWER")).toBe(true);
      expect(hasPermission("CEO", "MANAGER")).toBe(true);
      expect(hasPermission("CEO", "CFO")).toBe(true);
      expect(hasPermission("CEO", "ADMIN")).toBe(false);
    });

    it("VIEWER has limited permissions", () => {
      expect(hasPermission("VIEWER", "VIEWER")).toBe(true);
      expect(hasPermission("VIEWER", "EMPLOYEE")).toBe(false);
      expect(hasPermission("VIEWER", "CEO")).toBe(false);
    });

    it("EMPLOYEE can view but not manage", () => {
      expect(hasPermission("EMPLOYEE", "VIEWER")).toBe(true);
      expect(hasPermission("EMPLOYEE", "EMPLOYEE")).toBe(true);
      expect(hasPermission("EMPLOYEE", "MANAGER")).toBe(false);
    });

    it("CFO outranks MANAGER", () => {
      expect(hasPermission("CFO", "MANAGER")).toBe(true);
      expect(hasPermission("MANAGER", "CFO")).toBe(false);
    });
  });

  describe("isAuthEnabled", () => {
    it("returns false when AUTH_ENABLED is not set", () => {
      delete process.env.AUTH_ENABLED;
      expect(isAuthEnabled()).toBe(false);
    });
  });
});
