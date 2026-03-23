/**
 * AUP Theme Definitions — Single Source of Truth.
 *
 * All 21 themes extracted from providers/ui/src/web-page/css.ts.
 * Both css.ts and web-device file trees should be generated from this data.
 */

// ── Types ──

export interface ThemeDefinition {
  name: string;
  label: string;
  description: string;
  /** Base tokens (mode-independent): fonts, radius, shadows, transitions, etc. */
  base: Record<string, string>;
  /** Per-theme CSS overrides for body and primitives (e.g. border-radius, font-weight) */
  overrides?: string;
  /** Dark mode color tokens (default for most themes) */
  dark: Record<string, string>;
  /** Light mode color tokens */
  light: Record<string, string>;
}

// ── Default Theme ──

export const AUP_DEFAULT_THEME = "opus";

// ── Theme Definitions ──

export const AUP_THEMES: Record<string, ThemeDefinition> = {
  midnight: {
    name: "midnight",
    label: "Midnight",
    description: "terminal/hacker",
    base: {
      "--font-body": '"Manrope", -apple-system, "Segoe UI", sans-serif',
      "--font-heading": '"Playfair Display", Georgia, serif',
      "--font-display": '"Playfair Display", Georgia, serif',
      "--heading-weight": "700",
      "--heading-spacing": "-0.02em",
      "--heading-transform": "none",
      "--msg-font-size": "0.85rem",
      "--radius-sm": "4px",
      "--radius-md": "6px",
      "--radius-lg": "8px",
      "--shadow-card":
        "0 1px 4px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2), 0 0 0 1px rgba(230,180,80,0.03)",
      "--shadow-hover":
        "0 12px 28px rgba(0,0,0,0.45), 0 4px 10px rgba(0,0,0,0.3), 0 0 20px rgba(230,180,80,0.06)",
      "--card-border": "1px solid var(--color-border)",
      "--card-bg": "var(--color-surface)",
      "--backdrop": "none",
      "--transition": "0.15s",
      "--glow": "none",
      "--atmosphere":
        "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(230,180,80,0.08) 0%, transparent 70%), radial-gradient(ellipse 40% 40% at 80% 20%, rgba(89,194,255,0.04) 0%, transparent 50%)",
      "--color-accent-secondary": "#59c2ff",
      "--heading-gradient":
        "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-secondary) 100%)",
    },
    dark: {
      "--color-bg": "#0a0e14",
      "--color-surface": "#131820",
      "--color-border": "#1d2433",
      "--color-text": "#b3b1ad",
      "--color-dim": "#626a73",
      "--color-accent": "#e6b450",
      "--color-accent-bg": "#2a2000",
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
      "--color-assistant": "#1a6dbd",
      "--color-assistant-bg": "#eaf2fc",
      "--color-success": "#4d8a30",
      "--color-error": "#c53030",
      "--shadow-card": "0 1px 4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
      "--shadow-hover": "0 12px 28px rgba(0,0,0,0.12), 0 4px 10px rgba(0,0,0,0.06)",
      "--atmosphere":
        "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(184,134,11,0.06) 0%, transparent 70%)",
    },
  },

  clean: {
    name: "clean",
    label: "Clean",
    description: "modern corporate",
    base: {
      "--font-body": '"DM Sans", -apple-system, "Segoe UI", sans-serif',
      "--font-heading": '"Plus Jakarta Sans", -apple-system, sans-serif',
      "--font-display": '"Plus Jakarta Sans", -apple-system, sans-serif',
      "--heading-weight": "800",
      "--heading-spacing": "-0.025em",
      "--heading-transform": "none",
      "--msg-font-size": "0.9rem",
      "--radius-sm": "6px",
      "--radius-md": "8px",
      "--radius-lg": "12px",
      "--shadow-card": "0 1px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.15)",
      "--shadow-hover": "0 16px 32px rgba(0,0,0,0.25), 0 6px 12px rgba(0,0,0,0.15)",
      "--card-border": "1px solid var(--color-border)",
      "--card-bg": "var(--color-surface)",
      "--backdrop": "none",
      "--transition": "0.2s",
      "--glow": "none",
      "--atmosphere":
        "radial-gradient(ellipse 60% 40% at 30% 0%, rgba(96,165,250,0.08) 0%, transparent 60%), radial-gradient(ellipse 30% 30% at 70% 80%, rgba(74,222,128,0.04) 0%, transparent 40%)",
      "--color-accent-secondary": "#4ade80",
      "--heading-gradient":
        "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-secondary) 100%)",
    },
    dark: {
      "--color-bg": "#1a1d24",
      "--color-surface": "#242830",
      "--color-border": "#353942",
      "--color-text": "#e2e4e9",
      "--color-dim": "#8890a0",
      "--color-accent": "#60a5fa",
      "--color-accent-bg": "#1a2e4a",
      "--color-assistant": "#93bbfc",
      "--color-assistant-bg": "#1a2540",
      "--color-success": "#4ade80",
      "--color-error": "#f87171",
    },
    light: {
      "--color-bg": "#f0f2f5",
      "--color-surface": "#ffffff",
      "--color-border": "#e0e4ea",
      "--color-text": "#1a1d23",
      "--color-dim": "#6b7280",
      "--color-accent": "#2563eb",
      "--color-accent-bg": "#eff6ff",
      "--color-assistant": "#1d4ed8",
      "--color-assistant-bg": "#e7f0fd",
      "--color-success": "#16a34a",
      "--color-error": "#dc2626",
      "--shadow-card": "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.05)",
      "--shadow-hover": "0 16px 32px rgba(0,0,0,0.12), 0 6px 12px rgba(0,0,0,0.06)",
      "--atmosphere":
        "linear-gradient(180deg, rgba(37,99,235,0.04) 0%, transparent 40%), radial-gradient(ellipse 40% 30% at 80% 80%, rgba(22,163,74,0.03) 0%, transparent 40%)",
    },
  },

  glass: {
    name: "glass",
    label: "Glass",
    description: "glassmorphism, frosted",
    base: {
      "--font-body": '"Sora", -apple-system, "Segoe UI", sans-serif',
      "--font-heading": '"Fraunces", Georgia, serif',
      "--font-display": '"Fraunces", Georgia, serif',
      "--heading-weight": "700",
      "--heading-spacing": "-0.01em",
      "--heading-transform": "none",
      "--msg-font-size": "0.88rem",
      "--radius-sm": "8px",
      "--radius-md": "12px",
      "--radius-lg": "16px",
      "--backdrop": "blur(20px) saturate(1.5)",
      "--transition": "0.3s",
      "--glow": "none",
      "--atmosphere":
        "radial-gradient(ellipse 50% 60% at 20% 0%, rgba(167,139,250,0.12) 0%, transparent 50%), radial-gradient(ellipse 40% 40% at 80% 20%, rgba(244,114,182,0.08) 0%, transparent 50%), radial-gradient(ellipse 30% 30% at 50% 60%, rgba(52,211,153,0.05) 0%, transparent 40%)",
      "--color-accent-secondary": "#f472b6",
      "--heading-gradient":
        "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-secondary) 100%)",
    },
    dark: {
      "--color-bg": "#0f0720",
      "--color-surface": "rgba(255,255,255,0.08)",
      "--color-border": "rgba(255,255,255,0.1)",
      "--color-text": "#e0dce8",
      "--color-dim": "#8a80a0",
      "--color-accent": "#a78bfa",
      "--color-accent-bg": "rgba(167,139,250,0.12)",
      "--color-assistant": "#c4b5fd",
      "--color-assistant-bg": "rgba(167,139,250,0.08)",
      "--color-success": "#34d399",
      "--color-error": "#fb7185",
      "--shadow-card": "0 8px 32px rgba(0,0,0,0.2)",
      "--shadow-hover": "0 16px 48px rgba(0,0,0,0.35), 0 0 20px rgba(167,139,250,0.1)",
      "--card-border": "1px solid rgba(255,255,255,0.12)",
      "--card-bg": "rgba(255,255,255,0.06)",
    },
    light: {
      "--color-bg": "#ece4f5",
      "--color-surface": "rgba(255,255,255,0.65)",
      "--color-border": "rgba(120,60,200,0.12)",
      "--color-text": "#2a1a45",
      "--color-dim": "#7a6a95",
      "--color-accent": "#7c3aed",
      "--color-accent-bg": "rgba(124,58,237,0.08)",
      "--color-assistant": "#6d28d9",
      "--color-assistant-bg": "rgba(124,58,237,0.06)",
      "--color-success": "#059669",
      "--color-error": "#e11d48",
      "--shadow-card": "0 8px 32px rgba(100,50,180,0.1)",
      "--shadow-hover": "0 16px 48px rgba(100,50,180,0.15), 0 0 16px rgba(124,58,237,0.06)",
      "--card-border": "1px solid rgba(120,60,200,0.1)",
      "--card-bg": "rgba(255,255,255,0.5)",
      "--atmosphere":
        "radial-gradient(ellipse 50% 60% at 20% 0%, rgba(124,58,237,0.06) 0%, transparent 50%), radial-gradient(ellipse 40% 40% at 80% 20%, rgba(219,39,119,0.04) 0%, transparent 50%)",
    },
  },

  brutalist: {
    name: "brutalist",
    label: "Brutalist",
    description: "raw anti-design",
    base: {
      "--font-body": '"Courier New", "Courier", monospace',
      "--font-heading": 'Georgia, "Times New Roman", serif',
      "--heading-weight": "900",
      "--heading-spacing": "0.02em",
      "--heading-transform": "uppercase",
      "--msg-font-size": "0.9rem",
      "--radius-sm": "0",
      "--radius-md": "0",
      "--radius-lg": "0",
      "--shadow-card": "4px 4px 0 var(--color-text)",
      "--shadow-hover": "6px 6px 0 var(--color-text)",
      "--card-border": "3px solid var(--color-text)",
      "--card-bg": "var(--color-surface)",
      "--backdrop": "none",
      "--transition": "0s",
      "--glow": "none",
      "--atmosphere": "none",
      "--color-accent-secondary": "#ff6600",
      "--heading-gradient": "none",
    },
    dark: {
      "--color-bg": "#111111",
      "--color-surface": "#1a1a1a",
      "--color-border": "#ffffff",
      "--color-text": "#ffffff",
      "--color-dim": "#999999",
      "--color-accent": "#ff3333",
      "--color-accent-bg": "#331111",
      "--color-assistant": "#6666ff",
      "--color-assistant-bg": "#1a1a33",
      "--color-success": "#33cc33",
      "--color-error": "#ff3333",
    },
    light: {
      "--color-bg": "#fffff0",
      "--color-surface": "#ffffff",
      "--color-border": "#000000",
      "--color-text": "#000000",
      "--color-dim": "#555555",
      "--color-accent": "#ff0000",
      "--color-accent-bg": "#ffff00",
      "--color-assistant": "#0000ff",
      "--color-assistant-bg": "#e0e0ff",
      "--color-success": "#008000",
      "--color-error": "#ff0000",
    },
  },

  soft: {
    name: "soft",
    label: "Soft",
    description: "neumorphism, embossed",
    base: {
      "--font-body": '"Outfit", -apple-system, "Segoe UI", sans-serif',
      "--font-heading": '"Crimson Pro", Georgia, serif',
      "--font-display": '"Crimson Pro", Georgia, serif',
      "--heading-weight": "700",
      "--heading-spacing": "-0.01em",
      "--heading-transform": "none",
      "--msg-font-size": "0.9rem",
      "--radius-sm": "12px",
      "--radius-md": "16px",
      "--radius-lg": "20px",
      "--card-border": "none",
      "--card-bg": "var(--color-surface)",
      "--backdrop": "none",
      "--transition": "0.25s",
      "--glow": "none",
      "--atmosphere":
        "radial-gradient(ellipse 70% 50% at 50% -10%, rgba(99,102,241,0.04) 0%, transparent 60%)",
      "--color-accent-secondary": "#818cf8",
      "--heading-gradient":
        "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-secondary) 100%)",
    },
    dark: {
      "--color-bg": "#2c2c34",
      "--color-surface": "#2c2c34",
      "--color-border": "#3a3a44",
      "--color-text": "#d0d0d8",
      "--color-dim": "#7a7a88",
      "--color-accent": "#818cf8",
      "--color-accent-bg": "#2a2a48",
      "--color-assistant": "#a5b4fc",
      "--color-assistant-bg": "#2a2a40",
      "--color-success": "#34d399",
      "--color-error": "#fb7185",
      "--shadow-card": "6px 6px 14px #1c1c24, -6px -6px 14px #3c3c44",
      "--shadow-hover": "8px 8px 18px #161620, -8px -8px 18px #424250",
      "--atmosphere":
        "radial-gradient(ellipse 70% 50% at 50% -10%, rgba(99,102,241,0.06) 0%, transparent 60%)",
    },
    light: {
      "--color-bg": "#e8e8e8",
      "--color-surface": "#e8e8e8",
      "--color-border": "#d0d0d0",
      "--color-text": "#444444",
      "--color-dim": "#888888",
      "--color-accent": "#6366f1",
      "--color-accent-bg": "#e0e0f8",
      "--color-assistant": "#4f46e5",
      "--color-assistant-bg": "#ebebf8",
      "--color-success": "#059669",
      "--color-error": "#e11d48",
      "--shadow-card": "6px 6px 14px #c5c5c5, -6px -6px 14px #ffffff",
      "--shadow-hover": "8px 8px 18px #b8b8b8, -8px -8px 18px #ffffff",
    },
  },

  cyber: {
    name: "cyber",
    label: "Cyber",
    description: "neon retro-futurism",
    base: {
      "--font-body": '"Share Tech Mono", "Fira Code", monospace',
      "--font-heading": "var(--font-body)",
      "--heading-weight": "400",
      "--heading-spacing": "0.08em",
      "--heading-transform": "uppercase",
      "--msg-font-size": "0.85rem",
      "--radius-sm": "2px",
      "--radius-md": "3px",
      "--radius-lg": "4px",
      "--backdrop": "none",
      "--transition": "0.15s",
      "--glow": "0 0 8px var(--color-accent), 0 0 20px rgba(0,255,255,0.1)",
      "--atmosphere":
        "radial-gradient(ellipse 40% 30% at 50% 0%, rgba(0,255,255,0.06) 0%, transparent 50%), radial-gradient(ellipse 30% 30% at 80% 70%, rgba(255,0,255,0.04) 0%, transparent 50%)",
      "--color-accent-secondary": "#ff00ff",
      "--heading-gradient":
        "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-secondary) 100%)",
    },
    dark: {
      "--color-bg": "#030810",
      "--color-surface": "#06101c",
      "--color-border": "rgba(0,255,255,0.2)",
      "--color-text": "#b0e0e6",
      "--color-dim": "#3a6a70",
      "--color-accent": "#00ffff",
      "--color-accent-bg": "#001a1a",
      "--color-assistant": "#ff00ff",
      "--color-assistant-bg": "#1a001a",
      "--color-success": "#00ff41",
      "--color-error": "#ff2040",
      "--shadow-card": "0 0 12px rgba(0,255,255,0.15), inset 0 0 12px rgba(0,255,255,0.03)",
      "--shadow-hover":
        "0 0 24px rgba(0,255,255,0.25), 0 0 48px rgba(0,255,255,0.08), inset 0 0 16px rgba(0,255,255,0.05)",
      "--card-border": "1px solid rgba(0,255,255,0.3)",
      "--card-bg": "rgba(0,10,20,0.8)",
    },
    light: {
      "--color-bg": "#f0fafa",
      "--color-surface": "#ffffff",
      "--color-border": "rgba(0,160,160,0.25)",
      "--color-text": "#0a2828",
      "--color-dim": "#4a7070",
      "--color-accent": "#0891b2",
      "--color-accent-bg": "#ecfeff",
      "--color-assistant": "#a21caf",
      "--color-assistant-bg": "#fdf4ff",
      "--color-success": "#059669",
      "--color-error": "#e11d48",
      "--shadow-card": "0 0 12px rgba(0,180,180,0.1), inset 0 0 8px rgba(0,180,180,0.02)",
      "--shadow-hover":
        "0 0 20px rgba(0,180,180,0.15), 0 0 40px rgba(0,180,180,0.06), inset 0 0 12px rgba(0,180,180,0.03)",
      "--card-border": "1px solid rgba(0,160,160,0.2)",
      "--card-bg": "rgba(240,250,250,0.8)",
      "--glow": "0 0 6px rgba(8,145,178,0.3)",
      "--atmosphere":
        "radial-gradient(ellipse 40% 30% at 50% 0%, rgba(8,145,178,0.05) 0%, transparent 50%)",
    },
  },

  editorial: {
    name: "editorial",
    label: "Editorial",
    description: "luxury tech magazine",
    overrides: `[data-theme="editorial"] body { font-weight: 300; line-height: 1.7; }
[data-theme="editorial"] .aup-action { border-radius: 2rem; }
[data-theme="editorial"] .aup-text[data-scale="code"] { font-family: "Courier New", monospace; }`,
    base: {
      "--font-body":
        '"Sora", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", -apple-system, sans-serif',
      "--font-heading": '"DM Serif Display", Georgia, serif',
      "--font-display": '"DM Serif Display", Georgia, serif',
      "--heading-weight": "400",
      "--heading-spacing": "-0.02em",
      "--heading-transform": "none",
      "--msg-font-size": "0.88rem",
      "--radius-sm": "8px",
      "--radius-md": "12px",
      "--radius-lg": "2rem",
      "--shadow-card": "0 2px 8px rgba(0,0,0,0.2)",
      "--shadow-hover": "0 16px 40px rgba(0,0,0,0.35), 0 0 20px rgba(196,240,77,0.08)",
      "--card-border": "1px solid var(--color-border)",
      "--card-bg": "var(--color-surface)",
      "--backdrop": "blur(20px)",
      "--transition": "0.3s",
      "--glow": "none",
      "--atmosphere":
        "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(196,240,77,0.08) 0%, transparent 60%), radial-gradient(ellipse 40% 40% at 80% 30%, rgba(196,240,77,0.04) 0%, transparent 50%)",
      "--color-accent-secondary": "#e879f9",
      "--heading-gradient":
        "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-secondary) 100%)",
    },
    dark: {
      "--color-bg": "#0a0a0f",
      "--color-surface": "#1a1a25",
      "--color-border": "rgba(255,255,255,0.06)",
      "--color-text": "#e8e6f0",
      "--color-dim": "#8b89a0",
      "--color-accent": "#c4f04d",
      "--color-accent-bg": "rgba(196,240,77,0.12)",
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
      "--color-assistant": "#2a6e00",
      "--color-assistant-bg": "rgba(42,110,0,0.06)",
      "--color-success": "#2a6e00",
      "--color-error": "#c53030",
      "--shadow-card": "0 2px 8px rgba(0,0,0,0.06)",
      "--shadow-hover": "0 12px 32px rgba(0,0,0,0.1), 0 0 12px rgba(42,110,0,0.04)",
      "--atmosphere":
        "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(42,110,0,0.03) 0%, transparent 60%)",
    },
  },

  "brutalist-mono": {
    name: "brutalist-mono",
    label: "Brutalist Mono",
    description: "terminal-inspired raw",
    overrides: `[data-theme="brutalist-mono"] body { cursor: crosshair; line-height: 1.6; }
[data-theme="brutalist-mono"] .aup-action { cursor: crosshair; }
[data-theme="brutalist-mono"] .aup-text[data-scale="code"] { border-left: 3px solid var(--color-accent); border-radius: 0; font-family: "Space Mono", monospace; }
[data-theme="brutalist-mono"] .aup-text[data-mode="badge"] { font-size: 0.65rem; letter-spacing: 0.2em; text-transform: uppercase; border-radius: 0; }
[data-theme="brutalist-mono"] .aup-text[data-intent="danger"] { border-left: 3px solid var(--color-error); background: color-mix(in srgb, var(--color-error) 8%, var(--color-bg)); }`,
    base: {
      "--font-body":
        '"Space Mono", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", monospace',
      "--font-heading": '"Instrument Serif", Georgia, serif',
      "--heading-weight": "400",
      "--heading-spacing": "-0.03em",
      "--heading-transform": "none",
      "--msg-font-size": "0.85rem",
      "--radius-sm": "0",
      "--radius-md": "0",
      "--radius-lg": "0",
      "--shadow-card": "none",
      "--shadow-hover": "none",
      "--card-border": "1px solid var(--color-border)",
      "--card-bg": "var(--color-surface)",
      "--backdrop": "none",
      "--transition": "0s",
      "--glow": "none",
      "--atmosphere": "none",
      "--color-accent-secondary": "#88ff00",
      "--heading-gradient": "none",
    },
    dark: {
      "--color-bg": "#000000",
      "--color-surface": "#111111",
      "--color-border": "#222222",
      "--color-text": "#ffffff",
      "--color-dim": "#888888",
      "--color-accent": "#00ff88",
      "--color-accent-bg": "rgba(0,255,136,0.08)",
      "--color-assistant": "#00ff88",
      "--color-assistant-bg": "rgba(0,255,136,0.06)",
      "--color-success": "#00ff88",
      "--color-error": "#ff3344",
    },
    light: {
      "--color-bg": "#f0ede6",
      "--color-surface": "#ffffff",
      "--color-border": "#dddddd",
      "--color-text": "#000000",
      "--color-dim": "#666666",
      "--color-accent": "#006633",
      "--color-accent-bg": "rgba(0,102,51,0.06)",
      "--color-assistant": "#006633",
      "--color-assistant-bg": "rgba(0,102,51,0.05)",
      "--color-success": "#006633",
      "--color-error": "#cc0022",
      "--shadow-card": "none",
      "--shadow-hover": "none",
    },
  },

  aurora: {
    name: "aurora",
    label: "Aurora",
    description: "cosmic northern lights",
    base: {
      "--font-body": '"DM Sans", "Inter", -apple-system, sans-serif',
      "--font-heading": '"Space Grotesk", "Inter", sans-serif',
      "--font-display": '"Space Grotesk", "Inter", sans-serif',
      "--heading-weight": "700",
      "--heading-spacing": "-0.02em",
      "--heading-transform": "none",
      "--msg-font-size": "0.88rem",
      "--radius-sm": "8px",
      "--radius-md": "12px",
      "--radius-lg": "16px",
      "--shadow-card": "0 2px 12px rgba(0,0,0,0.3), 0 0 20px rgba(255,20,147,0.05)",
      "--shadow-hover": "0 12px 36px rgba(0,0,0,0.4), 0 0 30px rgba(255,20,147,0.1)",
      "--card-border": "1px solid var(--color-border)",
      "--card-bg": "var(--color-surface)",
      "--backdrop": "blur(16px) saturate(1.4)",
      "--transition": "0.25s",
      "--glow": "0 0 12px rgba(255,20,147,0.15)",
      "--atmosphere":
        "radial-gradient(ellipse 60% 40% at 30% 0%, rgba(0,128,255,0.12) 0%, transparent 60%), radial-gradient(ellipse 40% 50% at 70% 20%, rgba(255,20,147,0.08) 0%, transparent 50%), radial-gradient(ellipse 50% 30% at 50% 80%, rgba(0,200,255,0.04) 0%, transparent 40%)",
      "--color-accent-secondary": "#0080ff",
      "--heading-gradient":
        "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-secondary) 100%)",
    },
    dark: {
      "--color-bg": "#0a0e1a",
      "--color-surface": "#111827",
      "--color-border": "#1e293b",
      "--color-text": "#e8edf5",
      "--color-dim": "#8892a8",
      "--color-accent": "#ff1493",
      "--color-accent-bg": "rgba(255,20,147,0.1)",
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
      "--color-assistant": "#0060cc",
      "--color-assistant-bg": "rgba(0,96,204,0.06)",
      "--color-success": "#059669",
      "--color-error": "#dc2626",
      "--shadow-card": "0 2px 12px rgba(0,0,0,0.06)",
      "--shadow-hover": "0 12px 36px rgba(0,0,0,0.1)",
      "--atmosphere":
        "radial-gradient(ellipse 60% 40% at 30% 0%, rgba(0,128,255,0.06) 0%, transparent 60%), radial-gradient(ellipse 40% 50% at 70% 20%, rgba(200,16,112,0.04) 0%, transparent 50%)",
    },
  },

  classic: {
    name: "classic",
    label: "Classic",
    description: "corporate indigo",
    base: {
      "--font-body": '"Inter", system-ui, -apple-system, sans-serif',
      "--font-heading": '"Inter", system-ui, sans-serif',
      "--font-display": '"Inter", system-ui, sans-serif',
      "--heading-weight": "700",
      "--heading-spacing": "-0.02em",
      "--heading-transform": "none",
      "--msg-font-size": "0.88rem",
      "--radius-sm": "6px",
      "--radius-md": "8px",
      "--radius-lg": "12px",
      "--shadow-card": "0 1px 3px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.18)",
      "--shadow-hover": "0 14px 30px rgba(0,0,0,0.3), 0 6px 12px rgba(0,0,0,0.2)",
      "--card-border": "1px solid var(--color-border)",
      "--card-bg": "var(--color-surface)",
      "--backdrop": "none",
      "--transition": "0.2s",
      "--glow": "none",
      "--atmosphere":
        "radial-gradient(ellipse 50% 40% at 40% 0%, rgba(79,70,229,0.06) 0%, transparent 60%), radial-gradient(ellipse 30% 30% at 70% 80%, rgba(6,182,212,0.04) 0%, transparent 40%)",
      "--color-accent-secondary": "#4F46E5",
      "--heading-gradient":
        "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-secondary) 100%)",
    },
    dark: {
      "--color-bg": "#0B1120",
      "--color-surface": "#131C2E",
      "--color-border": "#1E293B",
      "--color-text": "#E2E8F0",
      "--color-dim": "#94A3B8",
      "--color-accent": "#22D3EE",
      "--color-accent-bg": "rgba(34,211,238,0.1)",
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
      "--color-assistant": "#4F46E5",
      "--color-assistant-bg": "rgba(79,70,229,0.06)",
      "--color-success": "#059669",
      "--color-error": "#dc2626",
      "--shadow-card": "0 1px 3px rgba(0,0,0,0.06)",
      "--shadow-hover": "0 14px 30px rgba(0,0,0,0.1)",
      "--atmosphere":
        "radial-gradient(ellipse 50% 40% at 40% 0%, rgba(79,70,229,0.04) 0%, transparent 60%)",
    },
  },

  cyberpunk: {
    name: "cyberpunk",
    label: "Cyberpunk",
    description: "neon scanlines sci-fi",
    base: {
      "--font-body": '"Rajdhani", "Share Tech", -apple-system, sans-serif',
      "--font-heading": '"Orbitron", "Rajdhani", sans-serif',
      "--font-display": '"Orbitron", "Rajdhani", sans-serif',
      "--heading-weight": "700",
      "--heading-spacing": "0.1em",
      "--heading-transform": "uppercase",
      "--msg-font-size": "0.85rem",
      "--radius-sm": "2px",
      "--radius-md": "4px",
      "--radius-lg": "4px",
      "--backdrop": "none",
      "--transition": "0.1s",
      "--glow": "0 0 10px rgba(255,0,170,0.2), 0 0 30px rgba(255,0,170,0.05)",
      "--atmosphere":
        "radial-gradient(ellipse 40% 30% at 50% 0%, rgba(255,0,170,0.08) 0%, transparent 50%), radial-gradient(ellipse 30% 30% at 80% 70%, rgba(0,240,255,0.06) 0%, transparent 50%), repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,0,170,0.01) 2px, rgba(255,0,170,0.01) 4px)",
      "--color-accent-secondary": "#00F0FF",
      "--heading-gradient":
        "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-secondary) 100%)",
    },
    dark: {
      "--color-bg": "#050510",
      "--color-surface": "#0A0A1A",
      "--color-border": "#1A1A3A",
      "--color-text": "#E0E0FF",
      "--color-dim": "#8888AA",
      "--color-accent": "#FF00AA",
      "--color-accent-bg": "rgba(255,0,170,0.1)",
      "--color-assistant": "#00F0FF",
      "--color-assistant-bg": "rgba(0,240,255,0.08)",
      "--color-success": "#00ff41",
      "--color-error": "#ff2040",
      "--shadow-card": "0 0 12px rgba(255,0,170,0.12), inset 0 0 8px rgba(0,240,255,0.03)",
      "--shadow-hover": "0 0 24px rgba(255,0,170,0.2), 0 0 48px rgba(0,240,255,0.06)",
      "--card-border": "1px solid rgba(255,0,170,0.25)",
      "--card-bg": "rgba(10,10,26,0.9)",
    },
    light: {
      "--color-bg": "#f5f0ff",
      "--color-surface": "#ffffff",
      "--color-border": "rgba(255,0,170,0.15)",
      "--color-text": "#1a1a2e",
      "--color-dim": "#6a6a8a",
      "--color-accent": "#c80080",
      "--color-accent-bg": "rgba(200,0,128,0.06)",
      "--color-assistant": "#0090aa",
      "--color-assistant-bg": "rgba(0,144,170,0.06)",
      "--color-success": "#059669",
      "--color-error": "#e11d48",
      "--shadow-card": "0 0 8px rgba(200,0,128,0.08)",
      "--shadow-hover": "0 0 16px rgba(200,0,128,0.12)",
      "--card-border": "1px solid rgba(200,0,128,0.15)",
      "--card-bg": "rgba(245,240,255,0.9)",
      "--glow": "0 0 6px rgba(200,0,128,0.15)",
      "--atmosphere":
        "radial-gradient(ellipse 40% 30% at 50% 0%, rgba(200,0,128,0.04) 0%, transparent 50%)",
    },
  },

  dark: {
    name: "dark",
    label: "Dark",
    description: "simple dark override",
    base: {
      "--font-body": '"Inter", -apple-system, "Segoe UI", sans-serif',
      "--font-heading": '"Inter", -apple-system, sans-serif',
      "--font-display": '"Inter", -apple-system, sans-serif',
      "--heading-weight": "600",
      "--heading-spacing": "-0.01em",
      "--heading-transform": "none",
      "--msg-font-size": "0.88rem",
      "--radius-sm": "6px",
      "--radius-md": "8px",
      "--radius-lg": "12px",
      "--shadow-card": "0 1px 4px rgba(0,0,0,0.3)",
      "--shadow-hover": "0 8px 24px rgba(0,0,0,0.4)",
      "--card-border": "1px solid var(--color-border)",
      "--card-bg": "var(--color-surface)",
      "--backdrop": "none",
      "--transition": "0.15s",
      "--glow": "none",
      "--atmosphere": "none",
      "--color-accent-secondary": "#818cf8",
      "--heading-gradient": "none",
    },
    dark: {
      "--color-bg": "#0a0a0a",
      "--color-surface": "#161616",
      "--color-border": "#2a2a2a",
      "--color-text": "#e8e8e8",
      "--color-dim": "#a3a3a3",
      "--color-accent": "#5B9BF0",
      "--color-accent-bg": "rgba(91,155,240,0.1)",
      "--color-assistant": "#818cf8",
      "--color-assistant-bg": "rgba(129,140,248,0.08)",
      "--color-success": "#34d399",
      "--color-error": "#f87171",
    },
    light: {},
  },

  default: {
    name: "default",
    label: "Default",
    description: "minimal black & white serif",
    base: {
      "--font-body": '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
      "--font-heading": '"Newsreader", Georgia, serif',
      "--font-display": '"Newsreader", Georgia, serif',
      "--heading-weight": "600",
      "--heading-spacing": "-0.02em",
      "--heading-transform": "none",
      "--msg-font-size": "0.88rem",
      "--radius-sm": "4px",
      "--radius-md": "6px",
      "--radius-lg": "8px",
      "--shadow-card": "0 1px 3px rgba(0,0,0,0.06)",
      "--shadow-hover": "0 8px 24px rgba(0,0,0,0.1)",
      "--card-border": "1px solid var(--color-border)",
      "--card-bg": "var(--color-surface)",
      "--backdrop": "none",
      "--transition": "0.15s",
      "--glow": "none",
      "--atmosphere": "none",
      "--color-accent-secondary": "#1a56db",
      "--heading-gradient": "none",
    },
    dark: {
      "--color-bg": "#0a0a0a",
      "--color-surface": "#161616",
      "--color-border": "#2a2a2a",
      "--color-text": "#e8e8e8",
      "--color-dim": "#a3a3a3",
      "--color-accent": "#5B9BF0",
      "--color-accent-bg": "rgba(91,155,240,0.1)",
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
      "--color-assistant": "#1a56db",
      "--color-assistant-bg": "rgba(26,86,219,0.06)",
      "--color-success": "#059669",
      "--color-error": "#dc2626",
    },
  },

  hackernews: {
    name: "hackernews",
    label: "HackerNews",
    description: "HN orange mono geek",
    base: {
      "--font-body": '"SF Mono", "Fira Code", "Consolas", monospace',
      "--font-heading": '"SF Mono", "Fira Code", "Consolas", monospace',
      "--font-display": '"SF Mono", "Fira Code", "Consolas", monospace',
      "--heading-weight": "700",
      "--heading-spacing": "0",
      "--heading-transform": "none",
      "--msg-font-size": "0.82rem",
      "--radius-sm": "0",
      "--radius-md": "0",
      "--radius-lg": "0",
      "--shadow-card": "none",
      "--shadow-hover": "none",
      "--card-border": "1px solid var(--color-border)",
      "--card-bg": "var(--color-surface)",
      "--backdrop": "none",
      "--transition": "0s",
      "--glow": "none",
      "--atmosphere": "none",
      "--color-accent-secondary": "#ff8c40",
      "--heading-gradient": "none",
    },
    dark: {
      "--color-bg": "#1A1A1A",
      "--color-surface": "#2A2A2A",
      "--color-border": "#555555",
      "--color-text": "#D4D4D4",
      "--color-dim": "#999999",
      "--color-accent": "#FF8C40",
      "--color-accent-bg": "#332200",
      "--color-assistant": "#6699ff",
      "--color-assistant-bg": "#1a1a33",
      "--color-success": "#33cc33",
      "--color-error": "#ff3333",
    },
    light: {
      "--color-bg": "#F6F6EF",
      "--color-surface": "#FFFFFF",
      "--color-border": "#000000",
      "--color-text": "#000000",
      "--color-dim": "#666666",
      "--color-accent": "#FF6600",
      "--color-accent-bg": "#fff3e6",
      "--color-assistant": "#0000ff",
      "--color-assistant-bg": "#e6e6ff",
      "--color-success": "#008000",
      "--color-error": "#ff0000",
    },
  },

  magazine: {
    name: "magazine",
    label: "Magazine",
    description: "warm print burgundy",
    overrides: `[data-theme="magazine"] body { font-weight: 300; line-height: 1.7; }`,
    base: {
      "--font-body": '"Source Sans 3", "Source Sans Pro", "Helvetica Neue", sans-serif',
      "--font-heading": '"Playfair Display", "Cormorant Garamond", Georgia, serif',
      "--font-display": '"Playfair Display", Georgia, serif',
      "--heading-weight": "700",
      "--heading-spacing": "-0.01em",
      "--heading-transform": "none",
      "--msg-font-size": "0.88rem",
      "--radius-sm": "0",
      "--radius-md": "0",
      "--radius-lg": "0",
      "--shadow-card": "none",
      "--shadow-hover": "0 4px 12px rgba(0,0,0,0.08)",
      "--card-border": "none",
      "--card-bg": "transparent",
      "--backdrop": "none",
      "--transition": "0.2s",
      "--glow": "none",
      "--atmosphere": "none",
      "--color-accent-secondary": "#C4956A",
      "--heading-gradient": "none",
    },
    dark: {
      "--color-bg": "#1A1815",
      "--color-surface": "#252320",
      "--color-border": "#3A3530",
      "--color-text": "#E8E2D8",
      "--color-dim": "#A09888",
      "--color-accent": "#D4637B",
      "--color-accent-bg": "rgba(212,99,123,0.1)",
      "--color-assistant": "#D4A97A",
      "--color-assistant-bg": "rgba(212,169,122,0.08)",
      "--color-success": "#6aaa5e",
      "--color-error": "#f07178",
      "--shadow-hover": "0 4px 12px rgba(0,0,0,0.25)",
    },
    light: {
      "--color-bg": "#FFFDF7",
      "--color-surface": "#F7F3ED",
      "--color-border": "#E0D8CC",
      "--color-text": "#1C1C1C",
      "--color-dim": "#6B6B6B",
      "--color-accent": "#8B1A3A",
      "--color-accent-bg": "rgba(139,26,58,0.06)",
      "--color-assistant": "#8B1A3A",
      "--color-assistant-bg": "rgba(139,26,58,0.05)",
      "--color-success": "#2d6a30",
      "--color-error": "#c53030",
    },
  },

  mono: {
    name: "mono",
    label: "Mono",
    description: "extreme minimalist monospace",
    overrides: `[data-theme="mono"] body { cursor: crosshair; line-height: 1.6; }
[data-theme="mono"] .aup-action { cursor: crosshair; }
[data-theme="mono"] .aup-text[data-scale="code"] { border-left: 3px solid var(--color-accent); border-radius: 0; font-family: "Space Mono", monospace; }
[data-theme="mono"] .aup-text[data-mode="badge"] { font-size: 0.65rem; letter-spacing: 0.2em; text-transform: uppercase; border-radius: 0; }`,
    base: {
      "--font-body":
        '"Space Mono", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", monospace',
      "--font-heading": '"Instrument Serif", Georgia, serif',
      "--font-display": '"Instrument Serif", Georgia, serif',
      "--heading-weight": "400",
      "--heading-spacing": "-0.03em",
      "--heading-transform": "none",
      "--msg-font-size": "0.85rem",
      "--radius-sm": "0",
      "--radius-md": "0",
      "--radius-lg": "0",
      "--shadow-card": "none",
      "--shadow-hover": "none",
      "--card-border": "1px solid var(--color-border)",
      "--card-bg": "var(--color-surface)",
      "--backdrop": "none",
      "--transition": "0s",
      "--glow": "none",
      "--atmosphere": "none",
      "--color-accent-secondary": "#88ff00",
      "--heading-gradient": "none",
    },
    dark: {
      "--color-bg": "#000000",
      "--color-surface": "#111111",
      "--color-border": "#222222",
      "--color-text": "#ffffff",
      "--color-dim": "#888888",
      "--color-accent": "#00ff88",
      "--color-accent-bg": "rgba(0,255,136,0.08)",
      "--color-assistant": "#00ff88",
      "--color-assistant-bg": "rgba(0,255,136,0.06)",
      "--color-success": "#00ff88",
      "--color-error": "#ff3344",
    },
    light: {
      "--color-bg": "#f0ede6",
      "--color-surface": "#ffffff",
      "--color-border": "#dddddd",
      "--color-text": "#000000",
      "--color-dim": "#666666",
      "--color-accent": "#006633",
      "--color-accent-bg": "rgba(0,102,51,0.06)",
      "--color-assistant": "#006633",
      "--color-assistant-bg": "rgba(0,102,51,0.05)",
      "--color-success": "#006633",
      "--color-error": "#cc0022",
    },
  },

  neubrutal: {
    name: "neubrutal",
    label: "Neubrutal",
    description: "neo-brutalist bold yellow",
    base: {
      "--font-body": '"Rubik", "Inter", -apple-system, sans-serif',
      "--font-heading": '"Outfit", "Inter", sans-serif',
      "--font-display": '"Outfit", "Inter", sans-serif',
      "--heading-weight": "900",
      "--heading-spacing": "-0.02em",
      "--heading-transform": "none",
      "--msg-font-size": "0.9rem",
      "--radius-sm": "0",
      "--radius-md": "0",
      "--radius-lg": "0",
      "--backdrop": "none",
      "--transition": "0s",
      "--glow": "none",
      "--atmosphere": "none",
      "--color-accent-secondary": "#4169E1",
      "--heading-gradient": "none",
    },
    dark: {
      "--color-bg": "#1A1A1A",
      "--color-surface": "#2A2A2A",
      "--color-border": "#FFFFFF",
      "--color-text": "#FFFFFF",
      "--color-dim": "#CCCCCC",
      "--color-accent": "#FF7777",
      "--color-accent-bg": "#331111",
      "--color-assistant": "#6699ff",
      "--color-assistant-bg": "#1a2244",
      "--color-success": "#33cc33",
      "--color-error": "#ff4444",
      "--shadow-card": "4px 4px 0 #ffffff",
      "--shadow-hover": "6px 6px 0 #ffffff",
      "--card-border": "3px solid #ffffff",
    },
    light: {
      "--color-bg": "#FFDE59",
      "--color-surface": "#FFFFFF",
      "--color-border": "#000000",
      "--color-text": "#000000",
      "--color-dim": "#333333",
      "--color-accent": "#FF5757",
      "--color-accent-bg": "#ffe0e0",
      "--color-assistant": "#4169E1",
      "--color-assistant-bg": "#e0e8ff",
      "--color-success": "#008800",
      "--color-error": "#cc0000",
      "--shadow-card": "4px 4px 0 #000000",
      "--shadow-hover": "6px 6px 0 #000000",
      "--card-border": "3px solid #000000",
      "--card-bg": "var(--color-surface)",
    },
  },

  opus: {
    name: "opus",
    label: "Opus",
    description: "premium editorial dark",
    overrides: `[data-theme="opus"] body { font-weight: 300; line-height: 1.7; }
[data-theme="opus"] .aup-action { border-radius: 2rem; }`,
    base: {
      "--font-body":
        '"Sora", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", -apple-system, sans-serif',
      "--font-heading": '"DM Serif Display", Georgia, serif',
      "--font-display": '"DM Serif Display", Georgia, serif',
      "--heading-weight": "400",
      "--heading-spacing": "-0.02em",
      "--heading-transform": "none",
      "--msg-font-size": "0.88rem",
      "--radius-sm": "8px",
      "--radius-md": "12px",
      "--radius-lg": "2rem",
      "--shadow-card": "0 2px 8px rgba(0,0,0,0.2)",
      "--shadow-hover": "0 16px 40px rgba(0,0,0,0.35), 0 0 20px rgba(196,240,77,0.08)",
      "--card-border": "1px solid var(--color-border)",
      "--card-bg": "var(--color-surface)",
      "--backdrop": "blur(20px)",
      "--transition": "0.3s",
      "--glow": "none",
      "--atmosphere":
        "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(196,240,77,0.06) 0%, transparent 60%), radial-gradient(ellipse 30% 30% at 80% 30%, rgba(100,130,255,0.03) 0%, transparent 50%)",
      "--color-accent-secondary": "#e879f9",
      "--heading-gradient":
        "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-secondary) 100%)",
    },
    dark: {
      "--color-bg": "#0a0a0f",
      "--color-surface": "#1a1a25",
      "--color-border": "rgba(255,255,255,0.06)",
      "--color-text": "#e8e6f0",
      "--color-dim": "#8b89a0",
      "--color-accent": "#c4f04d",
      "--color-accent-bg": "rgba(196,240,77,0.12)",
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
      "--color-assistant": "#2a6e00",
      "--color-assistant-bg": "rgba(42,110,0,0.06)",
      "--color-success": "#2a6e00",
      "--color-error": "#c53030",
      "--shadow-card": "0 2px 8px rgba(0,0,0,0.06)",
      "--shadow-hover": "0 12px 32px rgba(0,0,0,0.1)",
      "--atmosphere":
        "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(42,110,0,0.03) 0%, transparent 60%)",
    },
  },

  organic: {
    name: "organic",
    label: "Organic",
    description: "eco forest green",
    base: {
      "--font-body": '"Raleway", "Segoe UI", -apple-system, sans-serif',
      "--font-heading": '"Lora", Georgia, serif',
      "--font-display": '"Lora", Georgia, serif',
      "--heading-weight": "600",
      "--heading-spacing": "-0.01em",
      "--heading-transform": "none",
      "--msg-font-size": "0.88rem",
      "--radius-sm": "8px",
      "--radius-md": "12px",
      "--radius-lg": "16px",
      "--shadow-card": "0 2px 8px rgba(26,58,26,0.08)",
      "--shadow-hover": "0 12px 32px rgba(26,58,26,0.14)",
      "--card-border": "1px solid var(--color-border)",
      "--card-bg": "var(--color-surface)",
      "--backdrop": "none",
      "--transition": "0.25s",
      "--glow": "none",
      "--atmosphere":
        "radial-gradient(ellipse 60% 50% at 30% 0%, rgba(34,139,34,0.04) 0%, transparent 60%), radial-gradient(ellipse 40% 40% at 70% 80%, rgba(139,105,20,0.03) 0%, transparent 40%)",
      "--color-accent-secondary": "#228B22",
      "--heading-gradient": "none",
    },
    dark: {
      "--color-bg": "#0D1A0D",
      "--color-surface": "#1A2E1A",
      "--color-border": "#2E4A2E",
      "--color-text": "#D4E4C4",
      "--color-dim": "#8CA88C",
      "--color-accent": "#C4956A",
      "--color-accent-bg": "rgba(196,149,106,0.1)",
      "--color-assistant": "#6aaa5e",
      "--color-assistant-bg": "rgba(106,170,94,0.08)",
      "--color-success": "#6aaa5e",
      "--color-error": "#f07178",
      "--shadow-card": "0 2px 8px rgba(0,0,0,0.3)",
      "--shadow-hover": "0 12px 32px rgba(0,0,0,0.4)",
      "--atmosphere":
        "radial-gradient(ellipse 60% 50% at 30% 0%, rgba(106,170,94,0.06) 0%, transparent 60%)",
    },
    light: {
      "--color-bg": "#FAF7F2",
      "--color-surface": "#F0EDE5",
      "--color-border": "#C5D5B5",
      "--color-text": "#1A3A1A",
      "--color-dim": "#5D6B5D",
      "--color-accent": "#8B6914",
      "--color-accent-bg": "rgba(139,105,20,0.06)",
      "--color-assistant": "#228B22",
      "--color-assistant-bg": "rgba(34,139,34,0.06)",
      "--color-success": "#228B22",
      "--color-error": "#c53030",
    },
  },

  terminal: {
    name: "terminal",
    label: "Terminal",
    description: "CRT phosphor retro",
    overrides: `[data-theme="terminal"] body { line-height: 1.5; }`,
    base: {
      "--font-body": '"IBM Plex Mono", "Courier New", monospace',
      "--font-heading": '"VT323", "Courier New", monospace',
      "--font-display": '"VT323", "Courier New", monospace',
      "--heading-weight": "400",
      "--heading-spacing": "0.05em",
      "--heading-transform": "uppercase",
      "--msg-font-size": "0.85rem",
      "--radius-sm": "0",
      "--radius-md": "0",
      "--radius-lg": "0",
      "--backdrop": "none",
      "--transition": "0s",
      "--glow": "0 0 8px rgba(0,204,51,0.3), 0 0 20px rgba(0,204,51,0.08)",
      "--atmosphere":
        "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(0,204,51,0.04) 0%, transparent 70%)",
      "--color-accent-secondary": "#00CCFF",
      "--heading-gradient": "none",
    },
    dark: {
      "--color-bg": "#0A0A0A",
      "--color-surface": "#0D1A0D",
      "--color-border": "#003300",
      "--color-text": "#00CC33",
      "--color-dim": "#008822",
      "--color-accent": "#00CCFF",
      "--color-accent-bg": "rgba(0,204,255,0.08)",
      "--color-assistant": "#00CC33",
      "--color-assistant-bg": "rgba(0,204,51,0.06)",
      "--color-success": "#00ff41",
      "--color-error": "#ff2040",
      "--shadow-card": "0 0 8px rgba(0,204,51,0.1), inset 0 0 6px rgba(0,204,51,0.02)",
      "--shadow-hover": "0 0 16px rgba(0,204,51,0.15), 0 0 32px rgba(0,204,51,0.05)",
      "--card-border": "1px solid rgba(0,204,51,0.3)",
      "--card-bg": "rgba(0,10,0,0.8)",
    },
    light: {
      "--color-bg": "#1A1400",
      "--color-surface": "#261E00",
      "--color-border": "#4D3800",
      "--color-text": "#FFD466",
      "--color-dim": "#CC8800",
      "--color-accent": "#FF6600",
      "--color-accent-bg": "rgba(255,102,0,0.1)",
      "--color-assistant": "#FFD466",
      "--color-assistant-bg": "rgba(255,212,102,0.06)",
      "--color-success": "#FFD466",
      "--color-error": "#ff4444",
      "--glow": "0 0 6px rgba(255,212,102,0.2)",
      "--atmosphere":
        "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(255,212,102,0.03) 0%, transparent 70%)",
      "--shadow-card": "0 0 6px rgba(255,212,102,0.08)",
      "--shadow-hover": "0 0 12px rgba(255,212,102,0.12)",
      "--card-border": "1px solid rgba(255,212,102,0.2)",
      "--card-bg": "rgba(26,20,0,0.9)",
    },
  },

  vaporwave: {
    name: "vaporwave",
    label: "Vaporwave",
    description: "neon retro-futurism",
    base: {
      "--font-body": '"Space Mono", "Courier New", monospace',
      "--font-heading": '"Syncopate", "Arial Black", sans-serif',
      "--font-display": '"Syncopate", "Arial Black", sans-serif',
      "--heading-weight": "700",
      "--heading-spacing": "0.12em",
      "--heading-transform": "uppercase",
      "--msg-font-size": "0.82rem",
      "--radius-sm": "0",
      "--radius-md": "2px",
      "--radius-lg": "4px",
      "--backdrop": "blur(12px)",
      "--transition": "0.2s",
      "--glow": "0 0 12px rgba(1,205,254,0.2), 0 0 30px rgba(255,113,206,0.08)",
      "--atmosphere":
        "radial-gradient(ellipse 50% 40% at 30% 0%, rgba(255,113,206,0.1) 0%, transparent 60%), radial-gradient(ellipse 40% 40% at 70% 30%, rgba(1,205,254,0.08) 0%, transparent 50%), linear-gradient(180deg, transparent 60%, rgba(255,113,206,0.03) 100%)",
      "--color-accent-secondary": "#ff71ce",
      "--heading-gradient":
        "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-secondary) 100%)",
    },
    dark: {
      "--color-bg": "#0d0221",
      "--color-surface": "#150535",
      "--color-border": "#2d1b69",
      "--color-text": "#e0d4f7",
      "--color-dim": "#9b8bb4",
      "--color-accent": "#01cdfe",
      "--color-accent-bg": "rgba(1,205,254,0.1)",
      "--color-assistant": "#ff71ce",
      "--color-assistant-bg": "rgba(255,113,206,0.08)",
      "--color-success": "#05ffa1",
      "--color-error": "#fe4365",
      "--shadow-card": "0 0 12px rgba(1,205,254,0.1), 0 2px 8px rgba(0,0,0,0.3)",
      "--shadow-hover":
        "0 0 24px rgba(1,205,254,0.18), 0 0 40px rgba(255,113,206,0.08), 0 8px 24px rgba(0,0,0,0.4)",
      "--card-border": "1px solid rgba(1,205,254,0.2)",
      "--card-bg": "rgba(21,5,53,0.8)",
    },
    light: {
      "--color-bg": "#f0e8ff",
      "--color-surface": "rgba(255,255,255,0.7)",
      "--color-border": "rgba(45,27,105,0.15)",
      "--color-text": "#1a0a3a",
      "--color-dim": "#6b5a8a",
      "--color-accent": "#0090b0",
      "--color-accent-bg": "rgba(0,144,176,0.06)",
      "--color-assistant": "#c050a0",
      "--color-assistant-bg": "rgba(192,80,160,0.06)",
      "--color-success": "#059669",
      "--color-error": "#e11d48",
      "--shadow-card": "0 0 8px rgba(0,144,176,0.08), 0 2px 8px rgba(0,0,0,0.06)",
      "--shadow-hover": "0 0 16px rgba(0,144,176,0.12), 0 8px 24px rgba(0,0,0,0.08)",
      "--card-border": "1px solid rgba(45,27,105,0.1)",
      "--card-bg": "rgba(255,255,255,0.5)",
      "--glow": "0 0 6px rgba(0,144,176,0.15)",
      "--atmosphere":
        "radial-gradient(ellipse 50% 40% at 30% 0%, rgba(192,80,160,0.04) 0%, transparent 60%)",
    },
  },
};

// ── CSS Generation ──

/**
 * Token category classification for CSS generation.
 *
 * "base" tokens are mode-independent (fonts, radius, shadows, transitions).
 * "color" tokens are mode-dependent (--color-*).
 * Some tokens can appear in either base or mode-specific blocks depending on context.
 */
const BASE_TOKEN_PREFIXES = [
  "--font-",
  "--heading-",
  "--radius-",
  "--msg-font-size",
  "--backdrop",
  "--transition",
  "--glow",
  "--atmosphere",
  "--color-accent-secondary",
  "--heading-gradient",
  "--shadow-",
  "--card-",
];

function isBaseToken(key: string): boolean {
  return BASE_TOKEN_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Determine how a theme's natural/default mode is structured in CSS.
 *
 * Themes fall into two categories:
 * - "dark-default": base block contains base + dark tokens, light is the override
 *   (midnight, clean, glass, cyber, editorial, brutalist-mono, aurora, classic,
 *    cyberpunk, dark, opus, mono, terminal, vaporwave)
 * - "light-default": base block contains base + light tokens, dark is the override
 *   (brutalist, soft, default, hackernews, magazine, organic, neubrutal)
 */
const LIGHT_DEFAULT_THEMES = new Set([
  "brutalist",
  "soft",
  "default",
  "hackernews",
  "magazine",
  "organic",
  "neubrutal",
]);

/**
 * Merge base tokens with mode-specific tokens for the "natural" block.
 * Also handles multi-value shorthand lines (e.g. radius-sm + radius-md + radius-lg on one line).
 */
function buildNaturalBlock(
  base: Record<string, string>,
  modeTokens: Record<string, string>,
): Record<string, string> {
  return { ...base, ...modeTokens };
}

/**
 * Generate CSS for a single theme.
 *
 * For dark-default themes:
 *   [data-theme="xxx"] { base + dark tokens }
 *   [data-theme="xxx"][data-mode="light"] { light tokens }   (if non-empty)
 *
 * For light-default themes:
 *   [data-theme="xxx"] { base + light tokens }
 *   [data-theme="xxx"][data-mode="dark"] { dark tokens }     (if non-empty)
 */
function generateSingleThemeCSS(theme: ThemeDefinition): string {
  const isLightDefault = LIGHT_DEFAULT_THEMES.has(theme.name);
  const selector = `[data-theme="${theme.name}"]`;
  const rootPrefix = theme.name === AUP_DEFAULT_THEME ? `:root, ${selector}` : selector;

  const parts: string[] = [];

  // Comment header
  parts.push(
    `/* \u2550\u2550\u2550 Style: ${theme.label} \u2550\u2550\u2550 ${theme.description} \u2550\u2550\u2550 */`,
  );

  // Natural block: base + default-mode tokens
  const naturalMode = isLightDefault ? theme.light : theme.dark;
  const naturalTokens = buildNaturalBlock(theme.base, naturalMode);

  // Split into base-only and color-only for comment placement
  const baseEntries: [string, string][] = [];
  const colorEntries: [string, string][] = [];
  for (const [key, value] of Object.entries(naturalTokens)) {
    if (isBaseToken(key)) {
      baseEntries.push([key, value]);
    } else {
      colorEntries.push([key, value]);
    }
  }

  parts.push(`${rootPrefix} {`);

  // Emit base tokens first
  for (const [key, value] of baseEntries) {
    parts.push(`  ${key}: ${value};`);
  }

  // Comment for mode section
  if (colorEntries.length > 0) {
    const modeComment = isLightDefault ? "light (natural)" : "dark (default)";
    parts.push(`  /* ${modeComment} */`);
    for (const [key, value] of colorEntries) {
      parts.push(`  ${key}: ${value};`);
    }
  }

  parts.push("}");

  // Override block: alternate mode
  const overrideMode = isLightDefault ? theme.dark : theme.light;
  if (Object.keys(overrideMode).length > 0) {
    const overrideModeStr = isLightDefault ? "dark" : "light";
    parts.push(`${selector}[data-mode="${overrideModeStr}"] {`);
    for (const [key, value] of Object.entries(overrideMode)) {
      parts.push(`  ${key}: ${value};`);
    }
    parts.push("}");
  }

  // Per-theme primitive overrides (body weight, action border-radius, etc.)
  if (theme.overrides) {
    parts.push(theme.overrides);
  }

  return parts.join("\n");
}

/**
 * Generate CSS blocks for all 21 themes.
 *
 * Output is functionally identical to the theme section in
 * providers/ui/src/web-page/css.ts (lines ~37-818).
 */
export function generateAllThemesCSS(): string {
  const themeOrder = [
    "midnight",
    "clean",
    "glass",
    "brutalist",
    "soft",
    "cyber",
    "editorial",
    "brutalist-mono",
    "aurora",
    "classic",
    "cyberpunk",
    "dark",
    "default",
    "hackernews",
    "magazine",
    "mono",
    "neubrutal",
    "opus",
    "organic",
    "terminal",
    "vaporwave",
  ];

  return themeOrder
    .map((name) => {
      const theme = AUP_THEMES[name];
      if (!theme) throw new Error(`Unknown theme: ${name}`);
      return generateSingleThemeCSS(theme);
    })
    .join("\n\n");
}

/**
 * Google Fonts URL covering all fonts used across all 21 themes.
 * Both AUP and web-device should include this in their HTML <head>.
 */
export const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?" +
  "family=Cormorant+Garamond:ital,wght@0,400;0,700;1,400&" +
  "family=Crimson+Pro:ital,wght@0,400;0,600;1,400&" +
  "family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&" +
  "family=DM+Serif+Display:ital@0;1&" +
  "family=Fira+Code:wght@400;500&" +
  "family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,700;1,9..144,400&" +
  "family=IBM+Plex+Mono:wght@400;500&" +
  "family=Instrument+Serif:ital@0;1&" +
  "family=Inter:wght@400;500;600;700&" +
  "family=JetBrains+Mono:wght@400;500&" +
  "family=Lora:ital,wght@0,400;0,700;1,400&" +
  "family=Manrope:wght@400;500;600;700&" +
  "family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,700;1,6..72,400&" +
  "family=Orbitron:wght@400;700&" +
  "family=Outfit:wght@400;500;600;700&" +
  "family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&" +
  "family=Plus+Jakarta+Sans:wght@400;500;600;700;800&" +
  "family=Rajdhani:wght@400;500;600;700&" +
  "family=Raleway:wght@400;500;600;700&" +
  "family=Rubik:wght@400;500;600;700&" +
  "family=Share+Tech+Mono&" +
  "family=Sora:wght@300;400;500;600;700&" +
  "family=Source+Sans+3:wght@300;400;600&" +
  "family=Space+Grotesk:wght@400;500;600;700&" +
  "family=Space+Mono:ital,wght@0,400;0,700;1,400&" +
  "family=Syncopate:wght@400;700&" +
  "family=VT323&" +
  "display=swap";

/** HTML snippet for Google Fonts preconnect + stylesheet link. */
export const GOOGLE_FONTS_HTML = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${GOOGLE_FONTS_URL}" rel="stylesheet" media="print" onload="this.media='all'">
<noscript><link href="${GOOGLE_FONTS_URL}" rel="stylesheet"></noscript>`;
