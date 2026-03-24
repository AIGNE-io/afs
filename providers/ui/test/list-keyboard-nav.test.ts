/**
 * Keyboard navigation for afs-list — structural tests.
 *
 * Verifies LIST_JS template string contains correct keyboard navigation
 * code structure (order of handlers, guards, flags).
 */

import { describe, expect, test } from "bun:test";
import { LIST_JS } from "../src/web-page/renderers/list.js";

describe("afs-list keyboard navigation", () => {
  test("ArrowLeft handler is before the empty-list guard", () => {
    const arrowLeftIdx = LIST_JS.indexOf('e.key === "ArrowLeft"');
    const emptyGuardIdx = LIST_JS.indexOf("if (processed.length === 0) return");
    expect(arrowLeftIdx).toBeGreaterThan(-1);
    expect(emptyGuardIdx).toBeGreaterThan(-1);
    expect(arrowLeftIdx).toBeLessThan(emptyGuardIdx);
  });

  test("document-level keydown listener gated by _kbActive", () => {
    expect(LIST_JS).toContain('document.addEventListener("keydown"');
    expect(LIST_JS).toContain("if (!_kbActive) return");
  });

  test("_kbActive set on fetchPage completion", () => {
    expect(LIST_JS).toContain("_kbNavigating = false;\n        _kbActive = true;");
  });

  test("focusout suppressed during navigation via _kbNavigating", () => {
    expect(LIST_JS).toContain("_kbNavigating = true; // Suppress focusout during fetch");
    expect(LIST_JS).toContain("if (_kbNavigating) return;");
  });

  test("navigateTo called with parent path on ArrowLeft", () => {
    expect(LIST_JS).toContain(
      "navigateTo(_pathStack[_pathStack.length - 2], _pathStack.length - 2)",
    );
  });

  test("virtual .. entry injected in empty directories", () => {
    expect(LIST_JS).toContain('id: ".."');
    expect(LIST_JS).toContain("_pathStack.length > 1");
  });

  test("Enter on .. entry navigates to parent", () => {
    expect(LIST_JS).toContain('_selectedId === ".."');
  });
});
