/**
 * Phase 4: Virtual scrolling tests.
 *
 * Tests the scroll math engine (visible range calculation, height accumulation).
 * DOM-level tests (actual recycling, spacers) would require a browser environment,
 * but the core math is testable in unit tests.
 */
import { describe, expect, test } from "bun:test";

// ── Virtual Scroll Engine (math functions) ──────────────────────

/**
 * Finds the first visible item index given a scrollTop.
 * Uses measured heights (or estimated) per item.
 */
function findStartIndex(
  scrollTop: number,
  itemHeights: number[],
  estimatedHeight: number,
  totalCount: number,
): number {
  let accumulated = 0;
  for (let i = 0; i < totalCount; i++) {
    const h = itemHeights[i] ?? estimatedHeight;
    if (accumulated + h > scrollTop) return i;
    accumulated += h;
  }
  return Math.max(0, totalCount - 1);
}

/**
 * Finds the last visible item index given a start index and viewport height.
 */
function findEndIndex(
  startIdx: number,
  viewportHeight: number,
  itemHeights: number[],
  estimatedHeight: number,
  totalCount: number,
): number {
  let accumulated = 0;
  for (let i = startIdx; i < totalCount; i++) {
    const h = itemHeights[i] ?? estimatedHeight;
    accumulated += h;
    if (accumulated >= viewportHeight) return i;
  }
  return totalCount - 1;
}

/**
 * Sums heights for a range [from, to).
 */
function sumHeights(
  from: number,
  to: number,
  itemHeights: number[],
  estimatedHeight: number,
): number {
  let sum = 0;
  for (let i = from; i < to; i++) {
    sum += itemHeights[i] ?? estimatedHeight;
  }
  return sum;
}

/**
 * Computes the visible range with buffer.
 */
function computeVisibleRange(opts: {
  scrollTop: number;
  viewportHeight: number;
  itemHeights: number[];
  estimatedHeight: number;
  totalCount: number;
  bufferItems: number;
}): { startIdx: number; endIdx: number } {
  const raw = findStartIndex(
    opts.scrollTop,
    opts.itemHeights,
    opts.estimatedHeight,
    opts.totalCount,
  );
  const rawEnd = findEndIndex(
    raw,
    opts.viewportHeight,
    opts.itemHeights,
    opts.estimatedHeight,
    opts.totalCount,
  );
  return {
    startIdx: Math.max(0, raw - opts.bufferItems),
    endIdx: Math.min(opts.totalCount - 1, rawEnd + opts.bufferItems),
  };
}

// ── Tests ──

describe("Virtual scroll math", () => {
  test("findStartIndex at scrollTop=0 returns 0", () => {
    const idx = findStartIndex(0, [], 48, 100);
    expect(idx).toBe(0);
  });

  test("findStartIndex with uniform heights", () => {
    // 100 items, each 48px. scrollTop=240 → item 5
    const idx = findStartIndex(240, [], 48, 100);
    expect(idx).toBe(5);
  });

  test("findStartIndex with measured heights", () => {
    // Items: 50, 30, 80, 40, 60 (total 260)
    const heights = [50, 30, 80, 40, 60];
    // scrollTop=100: 50+30=80 (not enough), 50+30+80=160 (enough) → idx 2
    const idx = findStartIndex(100, heights, 48, 5);
    expect(idx).toBe(2);
  });

  test("findEndIndex fills viewport", () => {
    // 100 items, each 48px. Viewport 200px. Start at 5.
    // 5*48=240..288..336..384..432 → need 200/48 ≈ 4.2 → idx 9
    const idx = findEndIndex(5, 200, [], 48, 100);
    expect(idx).toBe(9);
  });

  test("findEndIndex with measured heights", () => {
    const heights = [50, 30, 80, 40, 60, 100, 45];
    // Start at 2 (offset into heights[2]=80). Viewport 200.
    // 80+40+60=180, +100=280 > 200 → idx 5
    const idx = findEndIndex(2, 200, heights, 48, 7);
    expect(idx).toBe(5);
  });

  test("sumHeights for a range", () => {
    const heights = [50, 30, 80, 40, 60];
    // sum [1, 4) = 30 + 80 + 40 = 150
    expect(sumHeights(1, 4, heights, 48)).toBe(150);
  });

  test("sumHeights uses estimated for unmeasured items", () => {
    // Only items 0-2 measured, items 3-9 use estimated
    const heights = [50, 30, 80];
    // sum [0, 5) = 50 + 30 + 80 + 48 + 48 = 256
    expect(sumHeights(0, 5, heights, 48)).toBe(256);
  });

  test("computeVisibleRange includes buffer", () => {
    // 50 items, 48px each. Viewport 200px. scrollTop=0. buffer=5.
    // visible: 0-4. With buffer: 0-9.
    const range = computeVisibleRange({
      scrollTop: 0,
      viewportHeight: 200,
      itemHeights: [],
      estimatedHeight: 48,
      totalCount: 50,
      bufferItems: 5,
    });
    expect(range.startIdx).toBe(0);
    expect(range.endIdx).toBe(9);
  });

  test("buffer doesn't go below 0 or above total", () => {
    const range = computeVisibleRange({
      scrollTop: 0,
      viewportHeight: 200,
      itemHeights: [],
      estimatedHeight: 48,
      totalCount: 3,
      bufferItems: 5,
    });
    expect(range.startIdx).toBe(0);
    expect(range.endIdx).toBe(2); // 3 items, max idx = 2
  });

  test("scrolled to middle shows correct range", () => {
    // 100 items, 48px. scrollTop = 480 (item 10). Viewport 192 (4 items visible).
    // visible 10-13. buffer 5: 5-18
    const range = computeVisibleRange({
      scrollTop: 480,
      viewportHeight: 192,
      itemHeights: [],
      estimatedHeight: 48,
      totalCount: 100,
      bufferItems: 5,
    });
    expect(range.startIdx).toBe(5);
    expect(range.endIdx).toBe(18);
  });

  test("total scroll height = sum of all items", () => {
    // 100 items, estimated 48px each
    const totalH = sumHeights(0, 100, [], 48);
    expect(totalH).toBe(4800);
  });

  test("DOM node count stays bounded", () => {
    // Simulate: 1000 items, viewport shows 10, buffer 5 → 20 nodes max
    const range = computeVisibleRange({
      scrollTop: 4800, // item 100
      viewportHeight: 480, // 10 items
      itemHeights: [],
      estimatedHeight: 48,
      totalCount: 1000,
      bufferItems: 5,
    });
    const nodeCount = range.endIdx - range.startIdx + 1;
    expect(nodeCount).toBeLessThanOrEqual(21); // visible + 2*buffer + 1
    expect(nodeCount).toBeGreaterThanOrEqual(11); // at least visible + 1
  });
});
