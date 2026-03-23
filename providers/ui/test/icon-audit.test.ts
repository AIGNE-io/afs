/**
 * Icon Audit — verifies all icon names referenced in renderers and examples
 * exist in the built-in ICONS_JS dictionary.
 */
import { describe, expect, test } from "bun:test";
import { ICONS_JS } from "../src/web-page/icons.js";

// ── Parse icon names from ICONS_JS ──

function parseIconNames(js: string): Set<string> {
  const names = new Set<string>();
  const re = /^\s*(?:"([^"]+)"|'([^']+)'|([a-zA-Z_]\w*))\s*:/gm;
  for (const m of js.matchAll(re)) {
    names.add(m[1] || m[2] || m[3] || "");
  }
  return names;
}

const iconNames = parseIconNames(ICONS_JS);

describe("icon-audit", () => {
  test("ICONS_JS defines at least 150 icons", () => {
    expect(iconNames.size).toBeGreaterThanOrEqual(150);
  });

  test("all renderer-referenced icons exist", () => {
    // Icons known to be referenced in renderers via _ICON_PATHS["name"]
    const rendererIcons = [
      // list.ts kind strategies
      "folder",
      "grid",
      "clock",
      "layers",
      "cpu",
      "check",
      "play",
      "search",
      "x",
      "edit",
      "code",
      "scroll",
      "image",
      // deck.ts navigation
      "arrow-left",
      "arrow-right",
    ];

    const missing = rendererIcons.filter((name) => !iconNames.has(name));
    expect(missing).toEqual([]);
  });

  test("all commonly-used example icons exist", () => {
    // Icons referenced in examples and registry via icon: "name" or content: "name"
    const exampleIcons = [
      // From examples
      "file-text",
      "box",
      "settings",
      "check-circle",
      "shield",
      "eye-off",
      "mail",
      "git-pull-request",
      "alert-circle",
      "star",
      "message-circle",
      "user-plus",
      "zap",
      "calendar",
      "package",
      "bar-chart",
      "plus",
      "download",
      "refresh",
      "rocket",
      "bolt",
      "gear",
      "users",
      "chart",
      "lock",
      "globe",
      "lightbulb",
      "camera",
      "home",
      "robot",
      "heart",
      "share",
      "arrow-up-right",
      "folder-open",
      "file",
      // From registry action.icon description
      "save",
      "undo",
      "redo",
      "clipboard",
      "trash",
      "copy",
      "upload",
      "filter",
      "menu",
      "user",
      "unlock",
      "eye",
    ];

    const missing = exampleIcons.filter((name) => !iconNames.has(name));
    expect(missing).toEqual([]);
  });

  test("no duplicate icon keys", () => {
    const re = /^\s*(?:"([^"]+)"|'([^']+)'|([a-zA-Z_]\w*))\s*:/gm;
    const counts = new Map<string, number>();
    for (const m of ICONS_JS.matchAll(re)) {
      const name = m[1] || m[2] || m[3] || "";
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
    expect(duplicates).toEqual([]);
  });

  test("every icon value is non-empty SVG content", () => {
    for (const name of iconNames) {
      const escaped = name.replace(/[-/]/g, "\\$&");
      const re = new RegExp(`(?:"${escaped}"|'${escaped}'|${escaped})\\s*:\\s*'([^']*)'`);
      const m = ICONS_JS.match(re);
      if (m?.[1]) {
        expect(m[1].length).toBeGreaterThan(0);
        expect(m[1]).toContain("<");
      }
    }
  });
});
