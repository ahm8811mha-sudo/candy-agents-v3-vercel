import { describe, expect, it } from "vitest";
import { fluidColumns } from "@/lib/ui/fluidColumns";

// jsdom has no layout, so this applies the CSS auto-fill rule by hand:
// tracks of `track` px plus `gap` between them fit while n*track + (n-1)*gap <= width.
function columnsAt(width: number, max: number, minWidth: number, gap: number) {
  const track = Math.max(minWidth, max === 1 ? width : (width - (max - 1) * gap) / max);
  return Math.max(1, Math.floor((width + gap) / (track + gap) + 1e-9));
}

describe("fluidColumns", () => {
  it("emits an auto-fill track list the browser can fold", () => {
    expect(fluidColumns(4, 130, 14)).toBe("repeat(auto-fill, minmax(max(130px, calc((100% - 42px) / 4)), 1fr))");
    expect(fluidColumns(1, 200, 10)).toBe("repeat(auto-fill, minmax(max(200px, 100%), 1fr))");
  });

  it("keeps the designed count on a wide screen", () => {
    expect(columnsAt(1100, 4, 130, 14)).toBe(4);
    expect(columnsAt(1100, 5, 130, 14)).toBe(5);
    expect(columnsAt(1100, 3, 240, 14)).toBe(3);
  });

  it("folds on a phone instead of crushing the cards", () => {
    // 390px viewport minus the page and card gutters leaves about 334px.
    expect(columnsAt(334, 4, 130, 14)).toBe(2);
    expect(columnsAt(334, 3, 240, 14)).toBe(1);
    expect(columnsAt(334, 4, 180, 10)).toBe(1);
  });

  it("rejects a column count that is not a positive integer", () => {
    expect(() => fluidColumns(0, 100, 10)).toThrow();
    expect(() => fluidColumns(2.5, 100, 10)).toThrow();
  });
});
