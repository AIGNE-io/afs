/**
 * Phase 5: Self-sizing layout tests.
 *
 * Tests the CSS generation logic for auto-fill grids with minItemWidth.
 */
import { describe, expect, test } from "bun:test";

// ── CSS Generation Logic ─────────────────────────────────────────

/**
 * Determines the grid-template-columns CSS value based on props.
 * gridCols overrides minItemWidth (explicit > auto).
 */
function resolveGridColumns(opts: {
  gridCols?: number | null;
  minItemWidth?: string | null;
}): string {
  // Explicit column count takes priority
  if (opts.gridCols && opts.gridCols > 0) {
    return `repeat(${opts.gridCols}, 1fr)`;
  }
  // Auto-fill with min width
  if (opts.minItemWidth) {
    return `repeat(auto-fill, minmax(${opts.minItemWidth}, 1fr))`;
  }
  // Default: 3 columns
  return "repeat(3, 1fr)";
}

// ── Tests ──

describe("Self-sizing grid layout", () => {
  test("minItemWidth produces auto-fill grid", () => {
    const css = resolveGridColumns({ minItemWidth: "200px" });
    expect(css).toBe("repeat(auto-fill, minmax(200px, 1fr))");
  });

  test("minItemWidth with different units", () => {
    expect(resolveGridColumns({ minItemWidth: "15rem" })).toBe(
      "repeat(auto-fill, minmax(15rem, 1fr))",
    );
    expect(resolveGridColumns({ minItemWidth: "250px" })).toBe(
      "repeat(auto-fill, minmax(250px, 1fr))",
    );
  });

  test("gridCols overrides minItemWidth", () => {
    const css = resolveGridColumns({ gridCols: 4, minItemWidth: "200px" });
    expect(css).toBe("repeat(4, 1fr)");
  });

  test("gridCols alone produces fixed columns", () => {
    const css = resolveGridColumns({ gridCols: 5 });
    expect(css).toBe("repeat(5, 1fr)");
  });

  test("no gridCols or minItemWidth defaults to 3 columns", () => {
    const css = resolveGridColumns({});
    expect(css).toBe("repeat(3, 1fr)");
  });

  test("gridCols: 0 falls through to minItemWidth", () => {
    const css = resolveGridColumns({ gridCols: 0, minItemWidth: "180px" });
    expect(css).toBe("repeat(auto-fill, minmax(180px, 1fr))");
  });

  test("null gridCols falls through to minItemWidth", () => {
    const css = resolveGridColumns({ gridCols: null, minItemWidth: "300px" });
    expect(css).toBe("repeat(auto-fill, minmax(300px, 1fr))");
  });
});
