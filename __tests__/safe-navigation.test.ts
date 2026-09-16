import { describe, expect, it } from "vitest";
import { safeInternalDestination } from "../lib/security/navigation";
describe("owner navigation", () => {
  it.each(["//example.com", "/\\example.com", "https://example.com", "/login?next=/ideas", null])("rejects an unsafe or recursive destination %s", (url) => { expect(safeInternalDestination(url)).toBe("/"); });
  it("preserves the intended internal dossier", () => { expect(safeInternalDestination("/ideas?idea=example")).toBe("/ideas?idea=example"); });
});
