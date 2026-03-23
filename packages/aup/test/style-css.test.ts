import { describe, expect, test } from "bun:test";
import { generateAllStyleCSS, GOOGLE_FONTS_URL as STYLE_FONTS_URL } from "../src/style-css.js";

describe("generateAllStyleCSS", () => {
  const css = generateAllStyleCSS();

  // ── Basic structure ──

  test("generates non-empty CSS", () => {
    expect(css.length).toBeGreaterThan(100);
  });

  // ── Tone selectors ──

  test("contains [data-tone] selectors for all 4 tones", () => {
    expect(css).toContain('[data-tone="editorial"]');
    expect(css).toContain('[data-tone="clean"]');
    expect(css).toContain('[data-tone="bold"]');
    expect(css).toContain('[data-tone="mono"]');
  });

  test("default tone (editorial) uses :root prefix", () => {
    expect(css).toContain(':root, [data-tone="editorial"]');
  });

  // ── Palette selectors ──

  test("contains [data-palette][data-mode] selectors for all 5 palettes", () => {
    for (const palette of ["neutral", "warm", "vivid", "natural", "electric"]) {
      expect(css).toContain(`[data-palette="${palette}"][data-mode="dark"]`);
      expect(css).toContain(`[data-palette="${palette}"][data-mode="light"]`);
    }
  });

  test("default palette (neutral) dark mode uses :root prefix", () => {
    expect(css).toContain(':root, [data-palette="neutral"][data-mode="dark"]');
  });

  // ── Does NOT use old selectors ──

  test("does not contain [data-theme] selectors", () => {
    expect(css).not.toContain("[data-theme=");
  });

  // ── Orthogonality: tone CSS has no --color-* values ──

  test("tone sections do not set --color-bg/surface/text directly", () => {
    const toneBlocks = css.match(/\[data-tone="[^"]+"\]\s*\{([^}]+)\}/g) ?? [];
    expect(toneBlocks.length).toBeGreaterThan(0);
    for (const block of toneBlocks) {
      expect(block).not.toMatch(/^\s*--color-bg\s*:/m);
      expect(block).not.toMatch(/^\s*--color-surface\s*:/m);
      expect(block).not.toMatch(/^\s*--color-text\s*:/m);
      expect(block).not.toMatch(/^\s*--color-dim\s*:/m);
      expect(block).not.toMatch(/^\s*--color-success\s*:/m);
      expect(block).not.toMatch(/^\s*--color-error\s*:/m);
    }
  });

  // ── Orthogonality: palette CSS has no typography/shape tokens ──

  test("palette sections do not set --font-* or --radius-*", () => {
    const paletteBlocks =
      css.match(/\[data-palette="[^"]+"\]\[data-mode="[^"]+"\]\s*\{([^}]+)\}/g) ?? [];
    expect(paletteBlocks.length).toBeGreaterThan(0);
    for (const block of paletteBlocks) {
      expect(block).not.toMatch(/^\s*--font-/m);
      expect(block).not.toMatch(/^\s*--radius-/m);
      expect(block).not.toMatch(/^\s*--shadow-/m);
    }
  });

  // ── Key design decisions ──

  test("editorial atmosphere uses color-mix, not hardcoded rgba", () => {
    // Find the editorial tone block
    const editorialMatch = css.match(/\[data-tone="editorial"\]\s*\{([^}]+)\}/);
    expect(editorialMatch).toBeTruthy();
    const block = editorialMatch![1];
    expect(block).toContain("color-mix");
    expect(block).toContain("var(--color-accent)");
  });

  test("mono glow uses color-mix", () => {
    const monoMatch = css.match(/\[data-tone="mono"\]\s*\{([^}]+)\}/);
    expect(monoMatch).toBeTruthy();
    expect(monoMatch![1]).toContain("color-mix");
  });

  test("bold shadow uses var(--color-text)", () => {
    const boldMatch = css.match(/\[data-tone="bold"\]\s*\{([^}]+)\}/);
    expect(boldMatch).toBeTruthy();
    expect(boldMatch![1]).toContain("var(--color-text)");
  });

  // ── Contains type scale and spacing tokens ──

  test("tone CSS includes type scale tokens", () => {
    expect(css).toContain("--type-display:");
    expect(css).toContain("--type-heading:");
    expect(css).toContain("--type-body:");
    expect(css).toContain("--leading-normal:");
  });

  test("tone CSS includes spacing tokens", () => {
    expect(css).toContain("--space-section:");
    expect(css).toContain("--space-block:");
    expect(css).toContain("--content-max:");
  });
});

describe("GOOGLE_FONTS_URL (style)", () => {
  test("includes fonts for all 4 tones", () => {
    // editorial
    expect(STYLE_FONTS_URL).toContain("DM+Serif+Display");
    expect(STYLE_FONTS_URL).toContain("Sora");
    // clean
    expect(STYLE_FONTS_URL).toContain("Inter");
    // bold
    expect(STYLE_FONTS_URL).toContain("Outfit");
    expect(STYLE_FONTS_URL).toContain("Rubik");
    // mono
    expect(STYLE_FONTS_URL).toContain("IBM+Plex+Mono");
    expect(STYLE_FONTS_URL).toContain("JetBrains+Mono");
  });

  test("has fewer font families than the old 27-font URL", () => {
    // Count font families by counting "family=" occurrences
    const familyCount = (STYLE_FONTS_URL.match(/family=/g) || []).length;
    expect(familyCount).toBeLessThanOrEqual(10);
    expect(familyCount).toBeGreaterThanOrEqual(7);
  });
});
