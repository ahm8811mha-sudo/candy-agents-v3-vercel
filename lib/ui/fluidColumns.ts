/**
 * A grid that keeps its designed column count on wide screens and folds on
 * narrow ones.
 *
 * Several screens set `gridTemplateColumns: "repeat(4, …)"` as an inline
 * style. An inline style outranks every stylesheet rule, so no media query
 * could reach it: on a 390px phone the four columns stayed four, cards shrank
 * to ~113px, words broke two to a line and text ran past the card edge.
 *
 * This returns a track list that the browser resolves on its own:
 * - each column is at least `minWidth` wide, so on a narrow screen fewer fit
 *   and the grid folds;
 * - each column is also at least 1/`max` of the row, so on a wide screen no
 *   more than `max` ever fit, and the designed layout is unchanged.
 *
 * `gap` must equal the grid's real gap, or the wide-screen count can drift by
 * one column at the boundary.
 */
export function fluidColumns(max: number, minWidth: number, gap: number): string {
  if (!Number.isInteger(max) || max < 1) throw new Error(`fluidColumns: max must be a positive integer, got ${max}`);
  const totalGap = (max - 1) * gap;
  const share = max === 1 ? "100%" : `calc((100% - ${totalGap}px) / ${max})`;
  return `repeat(auto-fill, minmax(max(${minWidth}px, ${share}), 1fr))`;
}
