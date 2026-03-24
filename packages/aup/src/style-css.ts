/**
 * CSS generation for the composable style system.
 *
 * Generates independent CSS blocks for tones and palettes:
 * - [data-tone="editorial"] { ...typography, shape, effects, spacing... }
 * - [data-palette="neutral"][data-mode="dark"] { ...colors... }
 *
 * Tone and palette CSS are strictly orthogonal — no cross-contamination.
 */

import { AUP_DEFAULT_STYLE, AUP_PALETTES, AUP_TONES } from "./styles.js";

// ── CSS Generation ──

function generateToneCSS(name: string, base: Record<string, string>, isDefault: boolean): string {
  const selector = `[data-tone="${name}"]`;
  const prefix = isDefault ? `:root, ${selector}` : selector;

  const lines: string[] = [];
  lines.push(`${prefix} {`);
  for (const [key, value] of Object.entries(base)) {
    lines.push(`  ${key}: ${value};`);
  }
  lines.push("}");
  return lines.join("\n");
}

function generatePaletteCSS(
  name: string,
  mode: "dark" | "light",
  tokens: Record<string, string>,
  isDefault: boolean,
  isDefaultMode: boolean,
): string {
  const selector = `[data-palette="${name}"][data-mode="${mode}"]`;
  const prefix = isDefault && isDefaultMode ? `:root, ${selector}` : selector;

  const lines: string[] = [];
  lines.push(`${prefix} {`);
  for (const [key, value] of Object.entries(tokens)) {
    lines.push(`  ${key}: ${value};`);
  }
  lines.push("}");
  return lines.join("\n");
}

/**
 * Generate CSS blocks for the composable style system.
 *
 * Output structure:
 * 1. Tone blocks (4) — typography, shape, effects, spacing
 * 2. Palette blocks (5 × 2 modes = 10) — colors
 * 3. Tone overrides (body/primitives per tone)
 */
export function generateAllStyleCSS(): string {
  const parts: string[] = [];

  // ── Tone CSS ──
  parts.push("/* ═══ Tones ═══ */");

  const toneOrder = ["editorial", "clean", "bold", "mono"];
  for (const name of toneOrder) {
    const tone = AUP_TONES[name];
    if (!tone) throw new Error(`Unknown tone: ${name}`);
    const isDefault = name === AUP_DEFAULT_STYLE.tone;
    parts.push(`\n/* Tone: ${tone.name} — ${tone.description} */`);
    parts.push(generateToneCSS(name, tone.base, isDefault));
    if (tone.overrides) {
      parts.push(tone.overrides);
    }
  }

  // ── Palette CSS ──
  parts.push("\n/* ═══ Palettes ═══ */");

  const paletteOrder = ["neutral", "warm", "vivid", "natural", "electric"];
  for (const name of paletteOrder) {
    const palette = AUP_PALETTES[name];
    if (!palette) throw new Error(`Unknown palette: ${name}`);
    const isDefault = name === AUP_DEFAULT_STYLE.palette;
    parts.push(`\n/* Palette: ${palette.name} — ${palette.description} */`);
    // Dark mode first (default for most contexts)
    parts.push(generatePaletteCSS(name, "dark", palette.dark, isDefault, true));
    parts.push(generatePaletteCSS(name, "light", palette.light, isDefault, false));
  }

  return parts.join("\n");
}

// ── Google Fonts ──

/**
 * Google Fonts URL covering fonts for all 4 tones.
 * Reduced from 27 fonts (21 themes) to ~8 font families.
 */
export const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?" +
  "family=DM+Serif+Display:ital@0;1&" + // editorial heading
  "family=Sora:wght@300;400;500;600&" + // editorial body
  "family=Inter:wght@400;500;600;700&" + // clean
  "family=Outfit:wght@400;500;600;900&" + // bold heading
  "family=Rubik:wght@400;500;600&" + // bold body
  "family=IBM+Plex+Mono:wght@400;500&" + // mono body
  "family=JetBrains+Mono:wght@400;500;700&" + // mono heading + shared mono
  "display=swap";

/** HTML snippet for Google Fonts preconnect + stylesheet link. */
export const GOOGLE_FONTS_HTML = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${GOOGLE_FONTS_URL}" rel="stylesheet" media="print" onload="this.media='all'">
<noscript><link href="${GOOGLE_FONTS_URL}" rel="stylesheet"></noscript>`;
