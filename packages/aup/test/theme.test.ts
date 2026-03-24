import { describe, expect, test } from "bun:test";
import {
  generateThemeCSS,
  loadThemeTokens,
  parseThemeMetadata,
  type ThemeMetadata,
  type ThemeTokens,
} from "../src/theme.js";

// ── Minimal AFS reader stub for testing ──

type Entry = { path: string; type?: string };
type FileTree = Record<string, string | Entry[]>;

function createStubAFS(tree: FileTree) {
  return {
    async read(path: string) {
      const val = tree[path];
      if (typeof val === "string") return { data: { content: val } };
      throw new Error(`Not found: ${path}`);
    },
    async list(path: string) {
      const val = tree[path];
      if (Array.isArray(val)) return { data: val };
      // Auto-discover from file keys — list all direct children under path
      const children: Entry[] = [];
      const prefix = path.endsWith("/") ? path : `${path}/`;
      const seen = new Set<string>();
      for (const key of Object.keys(tree)) {
        if (key.startsWith(prefix) && key !== path) {
          const rest = key.slice(prefix.length);
          const segment = rest.split("/")[0]!;
          if (!seen.has(segment)) {
            seen.add(segment);
            children.push({ path: `${prefix}${segment}` });
          }
        }
      }
      if (children.length > 0) return { data: children };
      throw new Error(`Not found: ${path}`);
    },
  };
}

// ── parseThemeMetadata ──

describe("parseThemeMetadata", () => {
  test("parses THEME.md frontmatter", () => {
    const md = `---
name: opus
description: "Premium editorial"
fonts:
  heading: "DM Serif Display, serif"
  body: "Sora, sans-serif"
google-fonts: "DM+Serif+Display&family=Sora"
palette:
  primary-light: "#2a6e00"
  primary-dark: "#c4f04d"
vibe: premium, editorial
---

# opus

Details here.
`;
    const meta = parseThemeMetadata(md);
    expect(meta.name).toBe("opus");
    expect(meta.description).toBe("Premium editorial");
    expect(meta.fonts?.heading).toBe("DM Serif Display, serif");
    expect(meta.fonts?.body).toBe("Sora, sans-serif");
    expect(meta.googleFonts).toBe("DM+Serif+Display&family=Sora");
    expect(meta.vibe).toBe("premium, editorial");
  });

  test("returns name-only for missing frontmatter", () => {
    const meta = parseThemeMetadata("# Just a heading\nNo frontmatter here.");
    expect(meta.name).toBeUndefined();
  });

  test("handles empty string", () => {
    const meta = parseThemeMetadata("");
    expect(meta.name).toBeUndefined();
  });
});

// ── loadThemeTokens ──

describe("loadThemeTokens", () => {
  test("loads light and dark tokens from file tree", async () => {
    const afs = createStubAFS({
      "/themes/opus/tokens/--color-bg": "#fafaf8",
      "/themes/opus/tokens/--color-surface": "#ffffff",
      "/themes/opus/tokens/--color-text": "#1a1a1f",
      "/themes/opus/tokens/--font-body": '"Sora", sans-serif',
      "/themes/opus/tokens/dark/--color-bg": "#0a0a0f",
      "/themes/opus/tokens/dark/--color-surface": "#1a1a25",
      "/themes/opus/tokens/dark/--color-text": "#e8e6f0",
    });

    const tokens = await loadThemeTokens(afs as never, "/themes/opus");
    expect(tokens.light["--color-bg"]).toBe("#fafaf8");
    expect(tokens.light["--color-surface"]).toBe("#ffffff");
    expect(tokens.light["--color-text"]).toBe("#1a1a1f");
    expect(tokens.base["--font-body"]).toBe('"Sora", sans-serif');
    expect(tokens.dark["--color-bg"]).toBe("#0a0a0f");
    expect(tokens.dark["--color-surface"]).toBe("#1a1a25");
    expect(tokens.dark["--color-text"]).toBe("#e8e6f0");
  });

  test("strips surrounding double quotes from token values", async () => {
    const afs = createStubAFS({
      "/themes/test/tokens/--font-body": '"Inter, sans-serif"',
    });
    const tokens = await loadThemeTokens(afs as never, "/themes/test");
    // Surrounding quotes should be stripped — the value IS the CSS value
    expect(tokens.base["--font-body"]).toBe("Inter, sans-serif");
  });

  test("returns empty objects when no tokens exist", async () => {
    const afs = createStubAFS({});
    const tokens = await loadThemeTokens(afs as never, "/themes/empty");
    expect(tokens.light).toEqual({});
    expect(tokens.dark).toEqual({});
    expect(tokens.base).toEqual({});
  });

  test("separates color tokens (mode-dependent) from base tokens (mode-independent)", async () => {
    const afs = createStubAFS({
      "/themes/mixed/tokens/--color-bg": "#fff",
      "/themes/mixed/tokens/--font-body": "Inter",
      "/themes/mixed/tokens/--radius-sm": "4px",
      "/themes/mixed/tokens/--container-max": "1200px",
      "/themes/mixed/tokens/dark/--color-bg": "#000",
    });
    const tokens = await loadThemeTokens(afs as never, "/themes/mixed");
    // Color tokens go into light/dark
    expect(tokens.light["--color-bg"]).toBe("#fff");
    expect(tokens.dark["--color-bg"]).toBe("#000");
    // Non-color tokens go into base (mode-independent)
    expect(tokens.base["--font-body"]).toBe("Inter");
    expect(tokens.base["--radius-sm"]).toBe("4px");
    expect(tokens.base["--container-max"]).toBe("1200px");
    // Non-color tokens should NOT appear in light
    expect(tokens.light["--font-body"]).toBeUndefined();
    expect(tokens.light["--radius-sm"]).toBeUndefined();
  });

  test("loads metadata from THEME.md if present", async () => {
    const afs = createStubAFS({
      "/themes/opus/THEME.md": `---
name: opus
description: "Premium editorial"
google-fonts: "DM+Serif+Display&family=Sora"
---
`,
      "/themes/opus/tokens/--color-bg": "#fafaf8",
    });
    const tokens = await loadThemeTokens(afs as never, "/themes/opus");
    expect(tokens.metadata?.name).toBe("opus");
    expect(tokens.metadata?.description).toBe("Premium editorial");
    expect(tokens.metadata?.googleFonts).toBe("DM+Serif+Display&family=Sora");
  });
});

// ── generateThemeCSS ──

describe("generateThemeCSS", () => {
  const tokens: ThemeTokens = {
    base: {
      "--font-body": '"Sora", sans-serif',
      "--radius-sm": "4px",
    },
    light: {
      "--color-bg": "#fafaf8",
      "--color-text": "#1a1a1f",
      "--color-accent": "#2a6e00",
    },
    dark: {
      "--color-bg": "#0a0a0f",
      "--color-text": "#e8e6f0",
      "--color-accent": "#c4f04d",
    },
  };

  test("generates CSS with data-theme and data-mode selectors", () => {
    const css = generateThemeCSS("opus", tokens);
    // Base tokens on theme selector (no mode)
    expect(css).toContain('[data-theme="opus"]');
    expect(css).toContain("--font-body");
    expect(css).toContain("--radius-sm: 4px");
    // Light mode
    expect(css).toContain('[data-theme="opus"][data-mode="light"]');
    expect(css).toContain("--color-bg: #fafaf8");
    expect(css).toContain("--color-text: #1a1a1f");
    // Dark mode
    expect(css).toContain('[data-theme="opus"][data-mode="dark"]');
    expect(css).toContain("--color-bg: #0a0a0f");
    expect(css).toContain("--color-text: #e8e6f0");
  });

  test("generates :root selector for default theme", () => {
    const css = generateThemeCSS("default", tokens);
    expect(css).toContain(":root");
    // Should also include data-theme selector for explicit use
    expect(css).toContain('[data-theme="default"]');
  });

  test("handles empty token sets", () => {
    const css = generateThemeCSS("empty", { base: {}, light: {}, dark: {} });
    // Should produce valid but empty CSS
    expect(css).toContain('[data-theme="empty"]');
  });

  test("includes google fonts @import when metadata provided", () => {
    const meta: ThemeMetadata = {
      name: "opus",
      googleFonts: "DM+Serif+Display&family=Sora:wght@300;400",
    };
    const css = generateThemeCSS("opus", tokens, meta);
    expect(css).toContain("@import url(");
    expect(css).toContain("fonts.googleapis.com");
    expect(css).toContain("DM+Serif+Display");
  });

  test("does not include @import when no google fonts", () => {
    const css = generateThemeCSS("opus", tokens);
    expect(css).not.toContain("@import");
  });

  test("produces valid CSS variable declarations", () => {
    const css = generateThemeCSS("test", {
      base: { "--x": "1px" },
      light: { "--color-a": "red" },
      dark: { "--color-a": "blue" },
    });
    // Every variable should be in format: --name: value;
    expect(css).toMatch(/--x:\s*1px;/);
    expect(css).toMatch(/--color-a:\s*red;/);
    expect(css).toMatch(/--color-a:\s*blue;/);
  });
});

// ── Integration: load + generate round-trip ──

describe("theme round-trip", () => {
  test("loadThemeTokens → generateThemeCSS produces complete CSS", async () => {
    const afs = createStubAFS({
      "/themes/opus/THEME.md": `---
name: opus
description: "Premium editorial"
google-fonts: "DM+Serif+Display&family=Sora"
vibe: premium
---
`,
      "/themes/opus/tokens/--color-bg": "#fafaf8",
      "/themes/opus/tokens/--color-surface": "#ffffff",
      "/themes/opus/tokens/--color-text": "#1a1a1f",
      "/themes/opus/tokens/--color-accent": "#2a6e00",
      "/themes/opus/tokens/--color-border": "rgba(0,0,0,0.08)",
      "/themes/opus/tokens/--font-body": '"Sora", sans-serif',
      "/themes/opus/tokens/--font-heading": '"DM Serif Display", serif',
      "/themes/opus/tokens/--radius-sm": "8px",
      "/themes/opus/tokens/--container-max": "1200px",
      "/themes/opus/tokens/dark/--color-bg": "#0a0a0f",
      "/themes/opus/tokens/dark/--color-surface": "#1a1a25",
      "/themes/opus/tokens/dark/--color-text": "#e8e6f0",
      "/themes/opus/tokens/dark/--color-accent": "#c4f04d",
      "/themes/opus/tokens/dark/--color-border": "rgba(255,255,255,0.06)",
    });

    const result = await loadThemeTokens(afs as never, "/themes/opus");
    const css = generateThemeCSS("opus", result, result.metadata);

    // Google fonts import
    expect(css).toContain("@import url(");
    // Base tokens (mode-independent)
    expect(css).toContain("--font-body");
    expect(css).toContain("--font-heading");
    expect(css).toContain("--radius-sm: 8px");
    expect(css).toContain("--container-max: 1200px");
    // Light mode colors
    expect(css).toContain("--color-bg: #fafaf8");
    expect(css).toContain("--color-accent: #2a6e00");
    // Dark mode colors
    expect(css).toContain("--color-bg: #0a0a0f");
    expect(css).toContain("--color-accent: #c4f04d");
  });
});
