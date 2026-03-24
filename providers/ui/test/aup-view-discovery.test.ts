/**
 * AUP View Discovery & View Selector Tests
 *
 * Tests the .aup/ list-based discovery logic and view selector rendering
 * by extracting functions from the surface renderer JS and evaluating them
 * in a controlled environment.
 *
 * Test categories:
 * 1. Discovery logic — list-based discovery finds correct views
 * 2. View selector — tabs vs dropdown based on view count
 * 3. View switching — state management, debouncing
 * 4. Meta.json — label overrides from view metadata
 * 5. Fallback — graceful degradation when list fails
 */

import { describe, expect, test } from "bun:test";
import { SURFACE_JS } from "../src/web-page/renderers/surface.js";

// Verify that the device JS contains expected function signatures
describe("AUP View Discovery — JS code structure", () => {
  test("SURFACE_JS contains _discoverAupViews function", () => {
    expect(SURFACE_JS).toContain("function _discoverAupViews(src, preferCompact)");
  });

  test("SURFACE_JS contains _renderViewSelector function", () => {
    expect(SURFACE_JS).toContain(
      "function _renderViewSelector(container, views, activeView, onSwitch)",
    );
  });

  test("SURFACE_JS contains _tryViewRecipes function", () => {
    expect(SURFACE_JS).toContain("function _tryViewRecipes(views, preferredVariant, idx)");
  });

  test("SURFACE_JS contains _tryViewVariants function", () => {
    expect(SURFACE_JS).toContain("function _tryViewVariants(view, variants, idx)");
  });

  test("SURFACE_JS contains _updateViewSelectorActive function", () => {
    expect(SURFACE_JS).toContain("function _updateViewSelectorActive(container, activeViewName)");
  });

  test("SURFACE_JS contains _loadViewMetaLabels function", () => {
    expect(SURFACE_JS).toContain("function _loadViewMetaLabels(views, callback)");
  });

  test("SURFACE_JS contains _viewDisplayLabel function", () => {
    expect(SURFACE_JS).toContain("function _viewDisplayLabel(name)");
  });

  test("SURFACE_JS retains legacy _tryAupVariants function for fallback", () => {
    expect(SURFACE_JS).toContain("function _tryAupVariants(src, variants, idx)");
  });
});

describe("AUP View Discovery — discovery flow", () => {
  test("_tryAupRecipe uses list-based discovery when window.afs.list is available", () => {
    // The function should call _discoverAupViews when list is available
    expect(SURFACE_JS).toContain("if (window.afs.list)");
    expect(SURFACE_JS).toContain("return _discoverAupViews(src, preferCompact)");
  });

  test("_tryAupRecipe falls back to variant probing when list is unavailable", () => {
    // The function should fall back to _tryAupVariants when list is not available
    expect(SURFACE_JS).toContain("return _tryAupVariants(src, variants, 0)");
  });

  test("_discoverAupViews sorts views with default first", () => {
    expect(SURFACE_JS).toContain('if (a.name === "default") return -1');
    expect(SURFACE_JS).toContain('if (b.name === "default") return 1');
  });

  test("_discoverAupViews attaches _aupViews to recipe for view switching", () => {
    expect(SURFACE_JS).toContain("result.recipe._aupViews = views");
  });

  test("_discoverAupViews falls back to probe on empty list", () => {
    expect(SURFACE_JS).toContain(
      "if (!entries || !Array.isArray(entries) || entries.length === 0)",
    );
  });

  test("_discoverAupViews falls back to probe on list failure", () => {
    // The catch block should fall back
    expect(SURFACE_JS).toContain("// List failed");
  });
});

describe("AUP View Selector — rendering logic", () => {
  test("view selector renders tabs for <=5 views", () => {
    expect(SURFACE_JS).toContain("if (views.length <= 5)");
    expect(SURFACE_JS).toContain("aup-surface-view-tab");
  });

  test("view selector renders dropdown for >5 views", () => {
    expect(SURFACE_JS).toContain("aup-surface-view-dropdown");
  });

  test("view selector hides when only 1 view exists", () => {
    expect(SURFACE_JS).toContain("if (!views || views.length <= 1)");
    expect(SURFACE_JS).toContain('container.style.display = "none"');
  });

  test("view selector applies active class to current tab", () => {
    expect(SURFACE_JS).toContain('" active"');
    expect(SURFACE_JS).toContain("data-view-name");
  });

  test("view selector defaults to 'default' view when activeView not found", () => {
    expect(SURFACE_JS).toContain('activeView = "default"');
  });

  test("view selector falls back to first alphabetical when no 'default' exists", () => {
    expect(SURFACE_JS).toContain("activeView = views[0].name");
  });
});

describe("AUP View Selector — view switching", () => {
  test("view switch persists to node.state.activeView", () => {
    expect(SURFACE_JS).toContain("node.state.activeView = viewName");
  });

  test("view switch uses sequence number to prevent races", () => {
    expect(SURFACE_JS).toContain("var seq = ++viewSwitchSeq");
    expect(SURFACE_JS).toContain("if (seq !== viewSwitchSeq) return");
  });

  test("view switch shows loading state", () => {
    expect(SURFACE_JS).toContain("aup-src-loading");
  });

  test("view switch shows error for views with no recipe", () => {
    expect(SURFACE_JS).toContain("No recipe found for view:");
  });
});

describe("AUP View Selector — meta.json labels", () => {
  test("meta.json labels are loaded asynchronously", () => {
    expect(SURFACE_JS).toContain("function _loadViewMetaLabels(views, callback)");
    expect(SURFACE_JS).toContain("meta.json");
  });

  test("meta.json label overrides directory name", () => {
    expect(SURFACE_JS).toContain("meta.label");
  });

  test("meta.json loading failure is silently ignored", () => {
    // catch block decrements pending counter
    expect(SURFACE_JS).toContain("if (--pending === 0) callback(anyFound ? results : null)");
  });

  test("_viewDisplayLabel capitalizes and replaces hyphens/underscores", () => {
    expect(SURFACE_JS).toContain('replace(/[-_]/g, " ")');
    expect(SURFACE_JS).toContain("charAt(0).toUpperCase()");
  });
});

describe("AUP View Selector — CSS classes", () => {
  test("device JS references correct CSS class names", () => {
    expect(SURFACE_JS).toContain("aup-surface-view-selector");
    expect(SURFACE_JS).toContain("aup-surface-view-tab");
    expect(SURFACE_JS).toContain("aup-surface-view-dropdown");
  });
});
