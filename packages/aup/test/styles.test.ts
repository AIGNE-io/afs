import { describe, expect, test } from "bun:test";
import { AUP_DEFAULT_STYLE, AUP_PALETTES, AUP_RECIPES, AUP_TONES } from "../src/styles.js";

// ── Tone Definitions ──

describe("AUP_TONES", () => {
  const EXPECTED_TONES = ["editorial", "clean", "bold", "mono"];

  test("has exactly 4 tones", () => {
    expect(Object.keys(AUP_TONES).sort()).toEqual(EXPECTED_TONES.sort());
  });

  test("each tone has required metadata", () => {
    for (const [key, tone] of Object.entries(AUP_TONES)) {
      expect(tone.name).toBe(key);
      expect(tone.description).toBeTruthy();
      expect(tone.character).toBeTruthy();
      expect(Array.isArray(tone.useWhen)).toBe(true);
      expect(tone.useWhen.length).toBeGreaterThan(0);
      expect(Array.isArray(tone.avoidWhen)).toBe(true);
      expect(tone.avoidWhen.length).toBeGreaterThan(0);
    }
  });

  // ── Typography tokens ──
  const TYPOGRAPHY_TOKENS = [
    "--font-body",
    "--font-heading",
    "--font-display",
    "--font-mono",
    "--heading-weight",
    "--heading-spacing",
    "--heading-transform",
    "--msg-font-size",
  ];

  test("each tone has all typography tokens", () => {
    for (const tone of Object.values(AUP_TONES)) {
      for (const token of TYPOGRAPHY_TOKENS) {
        expect(tone.base[token]).toBeDefined();
      }
    }
  });

  // ── Type scale tokens ──
  const TYPE_SCALE_TOKENS = [
    "--type-display",
    "--type-heading",
    "--type-body",
    "--type-caption",
    "--type-small",
    "--leading-tight",
    "--leading-normal",
    "--leading-relaxed",
  ];

  test("each tone has all type scale tokens", () => {
    for (const tone of Object.values(AUP_TONES)) {
      for (const token of TYPE_SCALE_TOKENS) {
        expect(tone.base[token]).toBeDefined();
      }
    }
  });

  // ── Shape tokens ──
  const SHAPE_TOKENS = ["--radius-sm", "--radius-md", "--radius-lg"];

  test("each tone has all shape tokens", () => {
    for (const tone of Object.values(AUP_TONES)) {
      for (const token of SHAPE_TOKENS) {
        expect(tone.base[token]).toBeDefined();
      }
    }
  });

  // ── Shadow + Card tokens ──
  const SHADOW_CARD_TOKENS = ["--shadow-card", "--shadow-hover", "--card-border", "--card-bg"];

  test("each tone has all shadow/card tokens", () => {
    for (const tone of Object.values(AUP_TONES)) {
      for (const token of SHADOW_CARD_TOKENS) {
        expect(tone.base[token]).toBeDefined();
      }
    }
  });

  // ── Effects tokens ──
  const EFFECTS_TOKENS = ["--backdrop", "--transition", "--glow", "--atmosphere"];

  test("each tone has all effects tokens", () => {
    for (const tone of Object.values(AUP_TONES)) {
      for (const token of EFFECTS_TOKENS) {
        expect(tone.base[token]).toBeDefined();
      }
    }
  });

  // ── Spacing tokens ──
  const SPACING_TOKENS = [
    "--space-section",
    "--space-block",
    "--space-element",
    "--space-page-x",
    "--content-max",
    "--container-max",
  ];

  test("each tone has all spacing tokens", () => {
    for (const tone of Object.values(AUP_TONES)) {
      for (const token of SPACING_TOKENS) {
        expect(tone.base[token]).toBeDefined();
      }
    }
  });

  // ── Orthogonality: tone base tokens must NOT contain --color-* ──
  test("tone base tokens do not contain --color-* tokens (orthogonality)", () => {
    for (const tone of Object.values(AUP_TONES)) {
      const directColorKeys = Object.keys(tone.base).filter(
        (k) =>
          k === "--color-bg" ||
          k === "--color-surface" ||
          k === "--color-border" ||
          k === "--color-dim" ||
          k === "--color-success" ||
          k === "--color-error" ||
          k === "--color-assistant" ||
          k === "--color-assistant-bg",
      );
      expect(directColorKeys).toEqual([]);
    }
  });

  // ── Specific tone characteristics ──
  test("editorial uses serif heading font", () => {
    expect(AUP_TONES.editorial!.base["--font-heading"]).toContain("DM Serif Display");
  });

  test("clean uses Inter font", () => {
    expect(AUP_TONES.clean!.base["--font-heading"]).toContain("Inter");
  });

  test("bold has zero radius", () => {
    expect(AUP_TONES.bold!.base["--radius-sm"]).toBe("0");
    expect(AUP_TONES.bold!.base["--radius-md"]).toBe("0");
    expect(AUP_TONES.bold!.base["--radius-lg"]).toBe("0");
  });

  test("mono uses monospace fonts", () => {
    expect(AUP_TONES.mono!.base["--font-body"]).toContain("Mono");
    expect(AUP_TONES.mono!.base["--font-heading"]).toContain("Mono");
  });

  test("editorial atmosphere uses color-mix (palette-independent)", () => {
    const atmo = AUP_TONES.editorial!.base["--atmosphere"]!;
    expect(atmo).toContain("color-mix");
    expect(atmo).toContain("var(--color-accent)");
    // Must NOT hardcode a specific color
    expect(atmo).not.toMatch(/rgba\(\d+,\d+,\d+/);
  });

  test("mono glow uses color-mix (palette-independent)", () => {
    const glow = AUP_TONES.mono!.base["--glow"]!;
    expect(glow).toContain("color-mix");
    expect(glow).toContain("var(--color-accent)");
  });

  test("bold shadow uses var(--color-text) (palette-independent)", () => {
    expect(AUP_TONES.bold!.base["--shadow-card"]).toContain("var(--color-text)");
  });

  // ── Type scale differentiation ──
  test("editorial has larger type-display than clean", () => {
    const editorial = Number.parseFloat(AUP_TONES.editorial!.base["--type-display"]!);
    const clean = Number.parseFloat(AUP_TONES.clean!.base["--type-display"]!);
    expect(editorial).toBeGreaterThan(clean);
  });

  test("mono has smallest type-body", () => {
    const mono = Number.parseFloat(AUP_TONES.mono!.base["--type-body"]!);
    for (const tone of Object.values(AUP_TONES)) {
      if (tone.name === "mono") continue;
      expect(Number.parseFloat(tone.base["--type-body"]!)).toBeGreaterThanOrEqual(mono);
    }
  });

  // ── Spacing differentiation ──
  test("editorial has widest space-section", () => {
    const editorial = Number.parseFloat(AUP_TONES.editorial!.base["--space-section"]!);
    for (const tone of Object.values(AUP_TONES)) {
      if (tone.name === "editorial") continue;
      expect(editorial).toBeGreaterThan(Number.parseFloat(tone.base["--space-section"]!));
    }
  });

  test("mono has widest content-max", () => {
    // mono has largest content-max (72rem) — widest for code
    const mono = Number.parseFloat(AUP_TONES.mono!.base["--content-max"]!);
    for (const tone of Object.values(AUP_TONES)) {
      if (tone.name === "mono") continue;
      expect(mono).toBeGreaterThan(Number.parseFloat(tone.base["--content-max"]!));
    }
  });
});

// ── Palette Definitions ──

describe("AUP_PALETTES", () => {
  const EXPECTED_PALETTES = ["neutral", "warm", "vivid", "natural", "electric"];

  test("has exactly 5 palettes", () => {
    expect(Object.keys(AUP_PALETTES).sort()).toEqual(EXPECTED_PALETTES.sort());
  });

  const PALETTE_COLOR_TOKENS = [
    "--color-bg",
    "--color-surface",
    "--color-border",
    "--color-text",
    "--color-dim",
    "--color-accent",
    "--color-accent-bg",
    "--color-accent-secondary",
    "--color-assistant",
    "--color-assistant-bg",
    "--color-success",
    "--color-error",
  ];

  test("each palette has required metadata", () => {
    for (const [key, palette] of Object.entries(AUP_PALETTES)) {
      expect(palette.name).toBe(key);
      expect(palette.description).toBeTruthy();
      expect(palette.mood).toBeTruthy();
    }
  });

  test("each palette has all 12 dark color tokens", () => {
    for (const palette of Object.values(AUP_PALETTES)) {
      for (const token of PALETTE_COLOR_TOKENS) {
        expect(palette.dark[token]).toBeDefined();
      }
    }
  });

  test("each palette has all 12 light color tokens", () => {
    for (const palette of Object.values(AUP_PALETTES)) {
      for (const token of PALETTE_COLOR_TOKENS) {
        expect(palette.light[token]).toBeDefined();
      }
    }
  });

  // ── Orthogonality: palette must NOT contain typography/shape tokens ──
  test("palette tokens do not contain --font-* or --radius-* (orthogonality)", () => {
    for (const palette of Object.values(AUP_PALETTES)) {
      for (const tokens of [palette.dark, palette.light]) {
        const nonColorTokens = Object.keys(tokens).filter(
          (k) => k.startsWith("--font-") || k.startsWith("--radius-") || k.startsWith("--shadow-"),
        );
        expect(nonColorTokens).toEqual([]);
      }
    }
  });

  // ── Specific palette characteristics ──
  test("warm has gold accent in dark mode", () => {
    expect(AUP_PALETTES.warm!.dark["--color-accent"]).toBe("#e6b450");
  });

  test("natural has lime accent in dark mode", () => {
    expect(AUP_PALETTES.natural!.dark["--color-accent"]).toBe("#c4f04d");
  });

  test("electric has cyan accent in dark mode", () => {
    expect(AUP_PALETTES.electric!.dark["--color-accent"]).toBe("#22D3EE");
  });
});

// ── Recipe Definitions ──

describe("AUP_RECIPES", () => {
  const EXPECTED_RECIPES = [
    "premium-consumer",
    "enterprise",
    "fintech",
    "developer",
    "creative-studio",
    "content-magazine",
    "eco-brand",
    "startup-tech",
  ];

  test("has exactly 8 recipes", () => {
    expect(Object.keys(AUP_RECIPES).sort()).toEqual(EXPECTED_RECIPES.sort());
  });

  test("each recipe references a valid tone and palette", () => {
    for (const recipe of Object.values(AUP_RECIPES)) {
      expect(recipe.tone in AUP_TONES).toBe(true);
      expect(recipe.palette in AUP_PALETTES).toBe(true);
      expect(recipe.description).toBeTruthy();
      expect(recipe.useWhen).toBeTruthy();
    }
  });
});

// ── Default Style ──

describe("AUP_DEFAULT_STYLE", () => {
  test("default style references valid tone and palette", () => {
    expect(AUP_DEFAULT_STYLE.tone in AUP_TONES).toBe(true);
    expect(AUP_DEFAULT_STYLE.palette in AUP_PALETTES).toBe(true);
  });

  test("default is editorial + neutral", () => {
    expect(AUP_DEFAULT_STYLE.tone).toBe("editorial");
    expect(AUP_DEFAULT_STYLE.palette).toBe("neutral");
  });
});
