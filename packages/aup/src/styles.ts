/**
 * AUP Style Definitions — Composable Style System.
 *
 * Style = Tone × Palette × Mode
 *
 * - Tone (4): controls typography, shape, effects, spacing (never touches --color-*)
 * - Palette (5): controls colors only (never touches fonts/radius/shadows)
 * - Mode: dark/light/auto (user preference)
 *
 * This file is the single source of truth. All downstream consumers
 * (aup-registry, ui-provider, web-device) derive from these definitions.
 */

// ── Types ──

export interface ToneDefinition {
  name: string;
  description: string;
  character: string;
  useWhen: string[];
  avoidWhen: string[];
  /** Base tokens: typography, type-scale, shape, shadow, card, effects, spacing */
  base: Record<string, string>;
  /** Optional CSS overrides for body/primitives scoped to this tone */
  overrides?: string;
}

export interface PaletteDefinition {
  name: string;
  description: string;
  mood: string;
  /** Dark mode color tokens */
  dark: Record<string, string>;
  /** Light mode color tokens */
  light: Record<string, string>;
}

export interface RecipeDefinition {
  name: string;
  tone: string;
  palette: string;
  description: string;
  useWhen: string;
}

// ── Default Style ──

export const AUP_DEFAULT_STYLE = { tone: "editorial", palette: "neutral" } as const;

// ── Tone Definitions ──

export const AUP_TONES: Record<string, ToneDefinition> = {
  editorial: {
    name: "editorial",
    description: "Premium serif+sans pairing with elegant spacing",
    character:
      "Serif headings, geometric sans body, large radius, backdrop blur, gradient atmosphere",
    useWhen: [
      "Consumer product landing pages",
      "Brand storytelling, showcases",
      "Luxury/premium positioning",
      "Content-rich editorial sites",
    ],
    avoidWhen: [
      "Data-heavy dashboards (light weight hurts data readability)",
      "Technical documentation (too decorative)",
      "Information-dense admin panels (too much whitespace)",
    ],
    base: {
      // Typography
      "--font-body":
        '"Sora", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", -apple-system, sans-serif',
      "--font-heading": '"DM Serif Display", Georgia, serif',
      "--font-display": '"DM Serif Display", Georgia, serif',
      "--font-mono": '"JetBrains Mono", monospace',
      "--heading-weight": "400",
      "--heading-spacing": "-0.02em",
      "--heading-transform": "none",
      "--msg-font-size": "0.88rem",
      // Type Scale
      "--type-display": "3rem",
      "--type-heading": "1.75rem",
      "--type-body": "1rem",
      "--type-caption": "0.875rem",
      "--type-small": "0.75rem",
      "--leading-tight": "1.2",
      "--leading-normal": "1.7",
      "--leading-relaxed": "1.9",
      // Shape
      "--radius-sm": "8px",
      "--radius-md": "12px",
      "--radius-lg": "2rem",
      // Shadow
      "--shadow-card": "0 2px 8px rgba(0,0,0,0.2)",
      "--shadow-hover": "0 16px 40px rgba(0,0,0,0.35)",
      // Card
      "--card-border": "1px solid var(--color-border)",
      "--card-bg": "var(--color-surface)",
      // Effects
      "--backdrop": "blur(20px)",
      "--transition": "0.3s",
      "--glow": "none",
      "--atmosphere":
        "radial-gradient(ellipse 60% 50% at 50% 0%, color-mix(in srgb, var(--color-accent) 6%, transparent) 0%, transparent 60%)",
      "--heading-gradient":
        "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-secondary) 100%)",
      // Spacing
      "--space-section": "4rem",
      "--space-block": "1.5rem",
      "--space-element": "0.75rem",
      "--space-page-x": "2rem",
      "--content-max": "48rem",
      "--container-max": "1200px",
    },
    overrides: `[data-tone="editorial"] body { font-weight: 300; line-height: var(--leading-normal); }
[data-tone="editorial"] .aup-action { border-radius: 2rem; }`,
  },

  clean: {
    name: "clean",
    description: "Neutral sans-serif with standard density",
    character: "Inter font family, medium radius, standard shadows, no effects",
    useWhen: [
      "Enterprise SaaS dashboards",
      "Admin panels and back-office tools",
      "Data tables and analytics",
      "Professional B2B products",
    ],
    avoidWhen: [
      "Brand-heavy consumer products (too generic)",
      "Creative/artistic portfolios (too corporate)",
      "Luxury positioning (lacks personality)",
    ],
    base: {
      // Typography
      "--font-body": '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
      "--font-heading": '"Inter", -apple-system, sans-serif',
      "--font-display": '"Inter", -apple-system, sans-serif',
      "--font-mono": '"JetBrains Mono", monospace',
      "--heading-weight": "600",
      "--heading-spacing": "-0.01em",
      "--heading-transform": "none",
      "--msg-font-size": "0.88rem",
      // Type Scale
      "--type-display": "2.25rem",
      "--type-heading": "1.5rem",
      "--type-body": "0.9375rem",
      "--type-caption": "0.8125rem",
      "--type-small": "0.75rem",
      "--leading-tight": "1.25",
      "--leading-normal": "1.5",
      "--leading-relaxed": "1.65",
      // Shape
      "--radius-sm": "6px",
      "--radius-md": "8px",
      "--radius-lg": "12px",
      // Shadow
      "--shadow-card": "0 1px 3px rgba(0,0,0,0.06)",
      "--shadow-hover": "0 8px 24px rgba(0,0,0,0.1)",
      // Card
      "--card-border": "1px solid var(--color-border)",
      "--card-bg": "var(--color-surface)",
      // Effects
      "--backdrop": "none",
      "--transition": "0.15s",
      "--glow": "none",
      "--atmosphere": "none",
      "--heading-gradient": "none",
      // Spacing
      "--space-section": "2.5rem",
      "--space-block": "1rem",
      "--space-element": "0.5rem",
      "--space-page-x": "1.5rem",
      "--content-max": "64rem",
      "--container-max": "1200px",
    },
  },

  bold: {
    name: "bold",
    description: "Heavy sans-serif with hard shadows and zero radius",
    character: "Outfit headings (weight 900), Rubik body, zero radius, hard offset shadows",
    useWhen: [
      "Creative products and design tools",
      "Startup landing pages",
      "Playful/young-audience products",
      "Portfolio and showcase sites",
    ],
    avoidWhen: [
      "Enterprise/corporate contexts (too informal)",
      "Financial products (lacks trust signals)",
      "Content-heavy reading experiences (hard edges fatigue eyes)",
    ],
    base: {
      // Typography
      "--font-body": '"Rubik", "Inter", -apple-system, sans-serif',
      "--font-heading": '"Outfit", "Inter", sans-serif',
      "--font-display": '"Outfit", "Inter", sans-serif',
      "--font-mono": '"JetBrains Mono", monospace',
      "--heading-weight": "900",
      "--heading-spacing": "-0.02em",
      "--heading-transform": "none",
      "--msg-font-size": "0.9rem",
      // Type Scale
      "--type-display": "3.5rem",
      "--type-heading": "2rem",
      "--type-body": "1rem",
      "--type-caption": "0.875rem",
      "--type-small": "0.75rem",
      "--leading-tight": "1.1",
      "--leading-normal": "1.5",
      "--leading-relaxed": "1.6",
      // Shape
      "--radius-sm": "0",
      "--radius-md": "0",
      "--radius-lg": "0",
      // Shadow — uses var(--color-text) for palette independence
      "--shadow-card": "4px 4px 0 var(--color-text)",
      "--shadow-hover": "6px 6px 0 var(--color-text)",
      // Card
      "--card-border": "3px solid var(--color-text)",
      "--card-bg": "var(--color-surface)",
      // Effects
      "--backdrop": "none",
      "--transition": "0s",
      "--glow": "none",
      "--atmosphere": "none",
      "--heading-gradient": "none",
      // Spacing
      "--space-section": "2rem",
      "--space-block": "1rem",
      "--space-element": "0.5rem",
      "--space-page-x": "1.5rem",
      "--content-max": "60rem",
      "--container-max": "1200px",
    },
  },

  mono: {
    name: "mono",
    description: "Monospace fonts with compact density and accent glow",
    character: "JetBrains Mono headings, IBM Plex Mono body, zero radius, glow effects",
    useWhen: [
      "Developer tools and CLI interfaces",
      "API documentation",
      "Technical/engineering products",
      "Code-centric applications",
    ],
    avoidWhen: [
      "Consumer products (too technical)",
      "Marketing pages (lacks warmth)",
      "Content-heavy editorial (monospace hurts readability at length)",
    ],
    base: {
      // Typography
      "--font-body":
        '"IBM Plex Mono", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", monospace',
      "--font-heading": '"JetBrains Mono", "Instrument Serif", Georgia, serif',
      "--font-display": '"JetBrains Mono", monospace',
      "--font-mono": '"IBM Plex Mono", monospace',
      "--heading-weight": "400",
      "--heading-spacing": "-0.03em",
      "--heading-transform": "none",
      "--msg-font-size": "0.85rem",
      // Type Scale
      "--type-display": "2rem",
      "--type-heading": "1.25rem",
      "--type-body": "0.875rem",
      "--type-caption": "0.8125rem",
      "--type-small": "0.6875rem",
      "--leading-tight": "1.3",
      "--leading-normal": "1.5",
      "--leading-relaxed": "1.6",
      // Shape
      "--radius-sm": "0",
      "--radius-md": "0",
      "--radius-lg": "0",
      // Shadow
      "--shadow-card": "none",
      "--shadow-hover": "none",
      // Card
      "--card-border": "1px solid var(--color-border)",
      "--card-bg": "var(--color-surface)",
      // Effects
      "--backdrop": "none",
      "--transition": "0s",
      "--glow": "0 0 8px color-mix(in srgb, var(--color-accent) 30%, transparent)",
      "--atmosphere": "none",
      "--heading-gradient": "none",
      // Spacing
      "--space-section": "1.5rem",
      "--space-block": "0.75rem",
      "--space-element": "0.375rem",
      "--space-page-x": "1rem",
      "--content-max": "72rem",
      "--container-max": "1400px",
    },
    overrides: `[data-tone="mono"] body { line-height: var(--leading-normal); }
[data-tone="mono"] .aup-text[data-scale="code"] { border-left: 3px solid var(--color-accent); border-radius: 0; }
[data-tone="mono"] .aup-text[data-mode="badge"] { font-size: 0.65rem; letter-spacing: 0.2em; text-transform: uppercase; border-radius: 0; }`,
  },
};

// ── Palette Definitions ──

export const AUP_PALETTES: Record<string, PaletteDefinition> = {
  neutral: {
    name: "neutral",
    description: "Blue accent — professional and safe",
    mood: "Professional, safe",
    dark: {
      "--color-bg": "#0a0a0a",
      "--color-surface": "#161616",
      "--color-border": "#2a2a2a",
      "--color-text": "#e8e8e8",
      "--color-dim": "#a3a3a3",
      "--color-accent": "#5B9BF0",
      "--color-accent-bg": "rgba(91,155,240,0.1)",
      "--color-accent-secondary": "#818cf8",
      "--color-assistant": "#818cf8",
      "--color-assistant-bg": "rgba(129,140,248,0.08)",
      "--color-success": "#34d399",
      "--color-error": "#f87171",
    },
    light: {
      "--color-bg": "#FFFFFF",
      "--color-surface": "#FAFAFA",
      "--color-border": "#E8E8E8",
      "--color-text": "#171717",
      "--color-dim": "#737373",
      "--color-accent": "#1E6FD9",
      "--color-accent-bg": "rgba(30,111,217,0.06)",
      "--color-accent-secondary": "#1a56db",
      "--color-assistant": "#1a56db",
      "--color-assistant-bg": "rgba(26,86,219,0.06)",
      "--color-success": "#059669",
      "--color-error": "#dc2626",
    },
  },

  warm: {
    name: "warm",
    description: "Gold/amber accent — sophisticated and luxurious",
    mood: "Luxurious, sophisticated",
    dark: {
      "--color-bg": "#0a0e14",
      "--color-surface": "#131820",
      "--color-border": "#1d2433",
      "--color-text": "#b3b1ad",
      "--color-dim": "#626a73",
      "--color-accent": "#e6b450",
      "--color-accent-bg": "#2a2000",
      "--color-accent-secondary": "#59c2ff",
      "--color-assistant": "#59c2ff",
      "--color-assistant-bg": "#0d1a2d",
      "--color-success": "#91b362",
      "--color-error": "#f07178",
    },
    light: {
      "--color-bg": "#f5f3ef",
      "--color-surface": "#fefdfb",
      "--color-border": "#e0dcd4",
      "--color-text": "#2c2418",
      "--color-dim": "#8a7e6e",
      "--color-accent": "#b8860b",
      "--color-accent-bg": "#fef7e5",
      "--color-accent-secondary": "#1a6dbd",
      "--color-assistant": "#1a6dbd",
      "--color-assistant-bg": "#eaf2fc",
      "--color-success": "#4d8a30",
      "--color-error": "#c53030",
    },
  },

  vivid: {
    name: "vivid",
    description: "Pink accent — bold and energetic",
    mood: "Bold, energetic",
    dark: {
      "--color-bg": "#0a0e1a",
      "--color-surface": "#111827",
      "--color-border": "#1e293b",
      "--color-text": "#e8edf5",
      "--color-dim": "#8892a8",
      "--color-accent": "#ff1493",
      "--color-accent-bg": "rgba(255,20,147,0.1)",
      "--color-accent-secondary": "#0080ff",
      "--color-assistant": "#0080ff",
      "--color-assistant-bg": "rgba(0,128,255,0.1)",
      "--color-success": "#34d399",
      "--color-error": "#f87171",
    },
    light: {
      "--color-bg": "#f0f4ff",
      "--color-surface": "#ffffff",
      "--color-border": "#d0d8e8",
      "--color-text": "#1a1a2e",
      "--color-dim": "#6a7088",
      "--color-accent": "#c81070",
      "--color-accent-bg": "rgba(200,16,112,0.06)",
      "--color-accent-secondary": "#0060cc",
      "--color-assistant": "#0060cc",
      "--color-assistant-bg": "rgba(0,96,204,0.06)",
      "--color-success": "#059669",
      "--color-error": "#dc2626",
    },
  },

  natural: {
    name: "natural",
    description: "Lime accent — fresh and organic",
    mood: "Fresh, organic",
    dark: {
      "--color-bg": "#0a0a0f",
      "--color-surface": "#1a1a25",
      "--color-border": "rgba(255,255,255,0.06)",
      "--color-text": "#e8e6f0",
      "--color-dim": "#8b89a0",
      "--color-accent": "#c4f04d",
      "--color-accent-bg": "rgba(196,240,77,0.12)",
      "--color-accent-secondary": "#e879f9",
      "--color-assistant": "#c4f04d",
      "--color-assistant-bg": "rgba(196,240,77,0.08)",
      "--color-success": "#91b362",
      "--color-error": "#f07178",
    },
    light: {
      "--color-bg": "#fafaf8",
      "--color-surface": "#ffffff",
      "--color-border": "rgba(0,0,0,0.08)",
      "--color-text": "#1a1a1f",
      "--color-dim": "#6b6b78",
      "--color-accent": "#2a6e00",
      "--color-accent-bg": "rgba(42,110,0,0.08)",
      "--color-accent-secondary": "#228B22",
      "--color-assistant": "#2a6e00",
      "--color-assistant-bg": "rgba(42,110,0,0.06)",
      "--color-success": "#2a6e00",
      "--color-error": "#c53030",
    },
  },

  electric: {
    name: "electric",
    description: "Cyan accent — futuristic and tech",
    mood: "Futuristic, tech",
    dark: {
      "--color-bg": "#0B1120",
      "--color-surface": "#131C2E",
      "--color-border": "#1E293B",
      "--color-text": "#E2E8F0",
      "--color-dim": "#94A3B8",
      "--color-accent": "#22D3EE",
      "--color-accent-bg": "rgba(34,211,238,0.1)",
      "--color-accent-secondary": "#818cf8",
      "--color-assistant": "#818cf8",
      "--color-assistant-bg": "rgba(129,140,248,0.08)",
      "--color-success": "#34d399",
      "--color-error": "#f87171",
    },
    light: {
      "--color-bg": "#ffffff",
      "--color-surface": "#F8FAFC",
      "--color-border": "#E2E8F0",
      "--color-text": "#0F172A",
      "--color-dim": "#475569",
      "--color-accent": "#06B6D4",
      "--color-accent-bg": "rgba(6,182,212,0.06)",
      "--color-accent-secondary": "#4F46E5",
      "--color-assistant": "#4F46E5",
      "--color-assistant-bg": "rgba(79,70,229,0.06)",
      "--color-success": "#059669",
      "--color-error": "#dc2626",
    },
  },
};

// ── Recipe Definitions ──

export const AUP_RECIPES: Record<string, RecipeDefinition> = {
  "premium-consumer": {
    name: "premium-consumer",
    tone: "editorial",
    palette: "vivid",
    description: "Premium consumer product with bold, energetic colors",
    useWhen: "Consumer app landing pages, fashion/beauty brands",
  },
  enterprise: {
    name: "enterprise",
    tone: "clean",
    palette: "neutral",
    description: "Professional enterprise dashboard with safe, neutral colors",
    useWhen: "SaaS dashboards, admin panels, B2B tools",
  },
  fintech: {
    name: "fintech",
    tone: "editorial",
    palette: "warm",
    description: "Sophisticated financial product with warm, luxurious feel",
    useWhen: "Financial products, investment platforms, banking apps",
  },
  developer: {
    name: "developer",
    tone: "mono",
    palette: "electric",
    description: "Technical developer tool with futuristic cyan accents",
    useWhen: "DevTools, API docs, CLI interfaces, developer portals",
  },
  "creative-studio": {
    name: "creative-studio",
    tone: "bold",
    palette: "vivid",
    description: "Playful creative product with bold shapes and vivid colors",
    useWhen: "Design tools, creative products, artistic portfolios",
  },
  "content-magazine": {
    name: "content-magazine",
    tone: "editorial",
    palette: "warm",
    description: "Elegant content platform with warm editorial feel",
    useWhen: "Media sites, blogs, content platforms, online magazines",
  },
  "eco-brand": {
    name: "eco-brand",
    tone: "editorial",
    palette: "natural",
    description: "Fresh organic brand with natural lime accents",
    useWhen: "Health products, sustainability brands, organic food",
  },
  "startup-tech": {
    name: "startup-tech",
    tone: "clean",
    palette: "electric",
    description: "Modern tech startup with clean design and electric accents",
    useWhen: "Tech startups, AI products, SaaS landing pages",
  },
};
