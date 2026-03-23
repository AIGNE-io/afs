/**
 * Canonical AUP Primitive CSS — single source of truth.
 * Both UI provider (realtime WebSocket) and web-device provider (SSR) import this.
 */
export const AUP_PRIMITIVES_CSS = `
/* === Derived Token Defaults === */
:root {
  --card-bg: var(--color-surface, #f8fafc);
  --card-border: 1px solid var(--color-border, #e2e8f0);
  --shadow-card: 0 2px 8px rgba(0,0,0,0.08);
  --shadow-hover: 0 4px 16px rgba(0,0,0,0.12);
  --backdrop: none;
  --transition: 0.2s ease;
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --hover: rgba(0,0,0,0.04);
  --color-accent-bg: color-mix(in srgb, var(--color-accent, #6366f1) 10%, transparent);
  --font-heading: var(--font-body, system-ui, -apple-system, sans-serif);
  --heading-weight: 700;
  --heading-spacing: normal;
  --heading-transform: none;
  --heading-gradient: var(--color-accent, #6366f1);
  --glow: none;
  --color-assistant: var(--color-accent, #6366f1);
  --color-error: #ef4444;
  --color-success: #22c55e;
  --accent-fg: #fff;
  --msg-font-size: var(--type-body, 0.95rem);
  --hover-bg: rgba(0,0,0,0.04);
  --error-bg: rgba(220,38,38,0.1);
  --muted: var(--color-dim, #64748b);
}

/* ── AUP Primitives ── */
.aup-view { display: flex; flex-direction: column; gap: var(--space-block, 12px); }
.aup-view[data-layout="row"] { flex-direction: row; }
.aup-view[data-layout="row"] > .aup-view:not([data-width]) { flex: 1; min-width: 0; }
.aup-view[data-layout="grid"] { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--grid-min-width, 200px), 1fr)); gap: 12px; }
.aup-view[data-layout="grid"] > * { min-width: 0; }
.aup-view[data-layout="stack"] { display: grid; width: 100%; height: 100%; }
.aup-view[data-layout="stack"] > * { grid-area: 1 / 1; }
.aup-view[data-layout="stack"] > *:first-child { z-index: 0; }
.aup-view[data-layout="stack"] > *:nth-child(2) { z-index: 1; }
.aup-view[data-layout="stack"] > *:nth-child(n+3) { z-index: 2; }

.aup-view[data-layout="overlay-grid"] { --overlay-pad: 5vw; display: grid; grid-template-columns: auto 1fr auto; grid-template-rows: auto 1fr auto auto auto; grid-template-areas: "top-start top-center top-end" "mid-start mid-center mid-end" "lower-start lower-center lower-end" "ticker ticker ticker" "bottom-start bottom-center bottom-end"; width: 100%; height: 100%; padding: var(--overlay-pad); pointer-events: none; gap: 8px; }
.aup-view[data-layout="overlay-grid"] > * { pointer-events: auto; }
.aup-view[data-layout="overlay-grid"] > .aup-text,
.aup-view[data-layout="overlay-grid"] > .aup-action,
.aup-view[data-layout="overlay-grid"] > .aup-time { width: fit-content; height: fit-content; }
.aup-view[data-layout="overlay-grid"] > .aup-map { min-width: 240px; max-width: 320px; aspect-ratio: 1; }
.aup-view[data-layout="overlay-grid"] > .aup-table,
.aup-view[data-layout="overlay-grid"] > .aup-chart,
.aup-view[data-layout="overlay-grid"] > .aup-finance-chart,
.aup-view[data-layout="overlay-grid"] > .aup-calendar { min-width: 240px; max-width: 320px; }
.aup-view[data-layout="overlay-grid"] > .aup-media { width: fit-content; height: fit-content; }
.aup-view[data-layout="overlay-grid"] > .aup-media img { max-height: 48px; object-fit: contain; width: auto; }
.aup-view[data-layout="overlay-grid"] > [data-region="top-start"]     { grid-area: top-start; align-self: start; justify-self: start; }
.aup-view[data-layout="overlay-grid"] > [data-region="top-center"]    { grid-area: top-center; align-self: start; justify-self: center; }
.aup-view[data-layout="overlay-grid"] > [data-region="top-end"]       { grid-area: top-end; align-self: start; justify-self: end; }
.aup-view[data-layout="overlay-grid"] > [data-region="mid-start"]     { grid-area: mid-start; align-self: center; justify-self: start; }
.aup-view[data-layout="overlay-grid"] > [data-region="mid-center"]    { grid-area: mid-center; align-self: center; justify-self: center; }
.aup-view[data-layout="overlay-grid"] > [data-region="mid-end"]       { grid-area: mid-end; align-self: center; justify-self: end; }
.aup-view[data-layout="overlay-grid"] > [data-region="lower-start"]   { grid-area: lower-start; align-self: end; justify-self: start; }
.aup-view[data-layout="overlay-grid"] > [data-region="lower-center"]  { grid-area: lower-center; align-self: end; justify-self: center; }
.aup-view[data-layout="overlay-grid"] > [data-region="lower-end"]     { grid-area: lower-end; align-self: end; justify-self: end; }
.aup-view[data-layout="overlay-grid"] > [data-region="ticker"]        { grid-area: ticker; justify-self: stretch; margin-left: calc(-1 * var(--overlay-pad)); margin-right: calc(-1 * var(--overlay-pad)); }
.aup-view[data-layout="overlay-grid"] > [data-region="bottom-start"]  { grid-area: bottom-start; align-self: end; justify-self: start; }
.aup-view[data-layout="overlay-grid"] > [data-region="bottom-center"] { grid-area: bottom-center; align-self: end; justify-self: center; }
.aup-view[data-layout="overlay-grid"] > [data-region="bottom-end"]    { grid-area: bottom-end; align-self: end; justify-self: end; }
.aup-view[data-mode="card"] { background: var(--card-bg); border: var(--card-border); border-radius: var(--radius-lg); padding: var(--space-block, 16px); box-shadow: var(--shadow-card); backdrop-filter: var(--backdrop); -webkit-backdrop-filter: var(--backdrop); transition: box-shadow var(--transition), transform var(--transition), background var(--transition); position: relative; overflow: hidden; }
.aup-view[data-mode="card"]::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: var(--heading-gradient, linear-gradient(90deg, var(--color-accent), var(--color-accent-secondary, var(--color-accent)))); opacity: 0; transition: opacity var(--transition); }
.aup-view[data-mode="card"]:hover { transform: translateY(-2px); box-shadow: var(--shadow-hover, var(--shadow-card)); }
.aup-view[data-mode="card"]:hover::before { opacity: 1; }
:is([data-tone="bold"], [data-tone="mono"]) .aup-view[data-mode="card"]::before { display: none; }
.aup-view[data-mode="panel"] { background: var(--card-bg); border-radius: var(--radius-sm); padding: 10px 16px; backdrop-filter: var(--backdrop); -webkit-backdrop-filter: var(--backdrop); }
/* Header panel: first panel child acts as sticky header */
.aup-view[data-mode="panel"]:first-child { position: sticky; top: 0; z-index: 20; border-radius: 0; padding: 10px max(16px, calc((100% - 1200px) / 2 + 40px)); background: color-mix(in srgb, var(--color-surface, #f8fafc) 85%, transparent); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-bottom: 1px solid var(--color-border, #e2e8f0); }
.aup-view[data-mode="panel"]:first-child .aup-action { flex-shrink: 0; }
/* Adjacent panels (e.g. nav bar) inherit centered padding */
.aup-view[data-mode="panel"]:first-child + .aup-view[data-mode="panel"] { border-radius: 0; padding: 10px max(16px, calc((100% - 1200px) / 2 + 40px)); border-bottom: 1px solid var(--color-border, #e2e8f0); }
.aup-view[data-mode="panel"]:first-child + .aup-view[data-mode="panel"] .aup-action { flex-shrink: 0; }

.aup-view[data-mode="pane"] { flex: 1; min-width: 0; overflow-y: auto; border-radius: var(--radius-md); padding: 16px; background: var(--card-bg); backdrop-filter: var(--backdrop); -webkit-backdrop-filter: var(--backdrop); }
.aup-view[data-mode="pane"] > .aup-text[data-level="2"]:first-child { background: var(--color-surface); margin: -16px -16px 12px; padding: 10px 16px; border-bottom: 1px solid var(--color-border); border-radius: var(--radius-md) var(--radius-md) 0 0; position: sticky; top: -16px; z-index: 1; }
.aup-view[data-mode="divider"] { height: 1px; background: var(--color-border); flex: none; padding: 0; gap: 0; border-radius: 0; }

/* ── Shell Layout: Desktop App Chrome ── */
.aup-view[data-mode="shell"] {
  display: grid;
  grid-template-areas:
    "menubar"
    "toolbar"
    "body"
    "statusbar"
    "dock";
  grid-template-rows: auto auto 1fr auto auto;
  width: 100%; height: 100vh; overflow: hidden; gap: 0;
  background: var(--color-bg);
  font-family: "SF Mono", "Consolas", "JetBrains Mono", "Fira Code", monospace;
  font-size: 13px;
}
.aup-view[data-mode="shell"] > [data-role="menubar"]   { grid-area: menubar; display: flex; align-items: center; gap: 8px; padding: 0 12px; height: 32px; background: var(--color-surface); border-bottom: 1px solid var(--color-border); font-size: 0.8rem; flex-shrink: 0; overflow: hidden; }
.aup-view[data-mode="shell"] > [data-role="menubar"] * { margin: 0; font-size: inherit; }
.aup-view[data-mode="shell"] > [data-role="statusbar"] * { margin: 0; font-size: inherit; }
.aup-view[data-mode="shell"] > [data-role="toolbar"]   { grid-area: toolbar; display: flex; align-items: center; gap: 8px; padding: 4px 12px; background: var(--color-surface); border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
.aup-view[data-mode="shell"] > [data-role="body"]      { grid-area: body; display: flex; overflow: hidden; min-height: 0; }
.aup-view[data-mode="shell"] > [data-role="statusbar"] { grid-area: statusbar; display: flex; align-items: center; gap: 12px; padding: 0 12px; height: 24px; background: var(--color-surface); border-top: 1px solid var(--color-border); font-size: 0.75rem; color: var(--color-dim); flex-shrink: 0; }
.aup-view[data-mode="shell"] > [data-role="dock"]      { grid-area: dock; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 4px 12px; background: var(--color-surface); border-top: 1px solid var(--color-border); flex-shrink: 0; }
/* Shell body children */
[data-role="sidebar"]   { width: 220px; overflow-y: auto; flex-shrink: 0; border-right: 1px solid var(--color-border); background: var(--color-surface); padding: 8px 0; }
[data-role="sidebar"] > .aup-view > .aup-text:first-child { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-dim); padding: 8px 12px 4px; }
[data-role="sidebar"] .aup-action { display: block; width: 100%; text-align: left; padding: 4px 12px; font-size: 0.8rem; border-radius: 0; background: none; border: none; color: var(--color-text); cursor: pointer; }
[data-role="sidebar"] .aup-action:hover { background: var(--hover); }
[data-role="sidebar"] .aup-action[data-variant="primary"] { background: var(--color-accent); color: var(--accent-fg, #fff); border-radius: var(--radius-sm); margin: 1px 8px; width: calc(100% - 16px); }
[data-role="content"]   { flex: 1; overflow-y: auto; min-width: 0; padding: 16px; }
[data-role="content"] > .aup-text[data-level="2"] { font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-dim); margin-bottom: 12px; }
[data-role="content"] > .aup-view[data-layout="row"] { padding: 8px 12px; border-radius: var(--radius-sm); margin-bottom: 2px; }
[data-role="content"] > .aup-view[data-layout="row"]:hover { background: var(--hover); }
[data-role="content"] > .aup-view[data-layout="row"] > .aup-text:first-child { min-width: 120px; font-weight: 500; font-size: 0.85rem; }
[data-role="content"] > .aup-view[data-layout="row"] > .aup-text:last-child { margin-left: auto; font-weight: 600; }
[data-role="inspector"] { width: 280px; overflow-y: auto; flex-shrink: 0; border-left: 1px solid var(--color-border); background: var(--color-surface); padding: 8px; }
[data-role="inspector"] > .aup-text[data-level="3"] { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-dim); padding: 8px 4px 4px; margin-bottom: 0; }
[data-role="inspector"] > .aup-text[data-variant="dim"] { font-size: 0.8rem; padding: 4px; }
/* Collapsible panels */
[data-collapsed="true"] > .aup-view-body { display: none; }
[data-collapsed="true"][data-role="sidebar"] { width: auto; min-width: 0; padding: 4px; }
[data-collapsed="true"][data-role="inspector"] { width: auto; min-width: 0; padding: 4px; }
.aup-collapse-toggle { background: none; border: none; cursor: pointer; padding: 4px 8px; color: var(--color-dim); font-size: 0.75rem; border-radius: var(--radius-sm); }
.aup-collapse-toggle:hover { background: var(--hover); color: var(--color-text); }
/* Shell responsive: hide sidebar/inspector/statusbar on small screens */
@media (max-width: 768px) {
  .aup-view[data-mode="shell"] > [data-role="body"] > [data-role="sidebar"]   { display: none; }
  .aup-view[data-mode="shell"] > [data-role="body"] > [data-role="inspector"] { display: none; }
  .aup-view[data-mode="shell"] > [data-role="statusbar"] { display: none; }
}

/* ── Tabs Mode ── */
.aup-view[data-mode="tabs"] { display: flex; flex-direction: column; overflow: hidden; }
.aup-view[data-mode="tabs"] > .aup-tab-bar { display: flex; gap: 0; border-bottom: 1px solid var(--color-border); background: var(--color-surface); padding: 0 8px; flex-shrink: 0; overflow-x: auto; }
.aup-view[data-mode="tabs"] > .aup-tab-bar > .aup-tab { padding: 6px 14px; font-size: 0.8rem; cursor: pointer; border: none; background: none; color: var(--color-dim); border-bottom: 2px solid transparent; white-space: nowrap; transition: color var(--transition), border-color var(--transition); }
.aup-view[data-mode="tabs"] > .aup-tab-bar > .aup-tab:hover { color: var(--color-text); background: var(--hover); }
.aup-view[data-mode="tabs"] > .aup-tab-bar > .aup-tab[data-active="true"] { color: var(--color-accent); border-bottom-color: var(--color-accent); }
.aup-view[data-mode="tabs"] > .aup-tab-panel { flex: 1; overflow-y: auto; padding: 12px 16px; }
.aup-view[data-mode="tabs"] > .aup-tab-panel[data-active="false"] { display: none; }

/* ── Spatial Intent: Layout ── */
.aup-view[data-align="start"] { justify-content: flex-start; }
.aup-view[data-align="center"] { justify-content: center; }
.aup-view[data-align="end"] { justify-content: flex-end; }
.aup-view[data-align="between"] { justify-content: space-between; }
.aup-view[data-cross-align="start"] { align-items: flex-start; }
.aup-view[data-cross-align="center"] { align-items: center; }
.aup-view[data-cross-align="end"] { align-items: flex-end; }
.aup-view[data-cross-align="stretch"] { align-items: stretch; }

/* ── Spatial Intent: Gap ── */
.aup-view[data-gap="none"] { gap: 0; }
.aup-view[data-gap="xs"] { gap: calc(var(--space-element, 0.5rem) * 0.5); }
.aup-view[data-gap="sm"] { gap: var(--space-element, 8px); }
.aup-view[data-gap="md"] { gap: var(--space-block, 16px); }
.aup-view[data-gap="lg"] { gap: calc(var(--space-block, 1rem) * 1.5); }
.aup-view[data-gap="xl"] { gap: var(--space-section, 40px); }

/* ── Spatial Intent: Wrap & Overflow ── */
.aup-view[data-wrap="true"] { flex-wrap: wrap; }
.aup-view[data-wrap="true"][style*="--grid-min-width"] {
  display: grid !important;
  grid-template-columns: repeat(auto-fill, minmax(var(--grid-min-width), 1fr));
}
.aup-view[data-overflow="auto"] { overflow: auto; }
.aup-view[data-overflow="hidden"] { overflow: hidden; }
.aup-view[data-overflow="scroll-x"] { overflow-x: auto; overflow-y: hidden; }
.aup-view[data-overflow="scroll-y"] { overflow-x: hidden; overflow-y: auto; }

/* ── Spatial Intent: Sizing ── */
[data-width="hug"] { width: fit-content; flex: none !important; }
[data-width="fill"] { width: 100%; }
[data-max-width="xs"] { max-width: 320px; }
[data-max-width="sm"] { max-width: 480px; }
[data-max-width="md"] { max-width: 640px; }
[data-max-width="lg"] { max-width: 960px; }
[data-max-width="xl"] { max-width: 1200px; }
[data-max-width="full"] { max-width: 100%; }
[data-height="fill"] { height: 100%; }
.aup-view[data-layout="row"] > .aup-view[data-width="fill"] { flex: 1; min-width: 0; }

.aup-text { color: var(--color-text); font-size: var(--type-body, 0.95rem); line-height: var(--leading-normal, 1.6); }
.aup-text[data-level="1"] { font-family: var(--font-heading); font-size: var(--type-display, 2em); font-weight: var(--heading-weight); color: var(--color-accent); text-shadow: var(--glow); letter-spacing: var(--heading-spacing); text-transform: var(--heading-transform); line-height: var(--leading-tight, 1.15); margin-bottom: 0.3em; }
/* Gradient heading text — themes with --heading-gradient get background-clip */
:not([data-tone="bold"]):not([data-tone="mono"]) .aup-text[data-level="1"] { background: var(--heading-gradient); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.aup-text[data-scale="display"] { background: var(--heading-gradient); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
:is([data-tone="bold"], [data-tone="mono"]) .aup-text[data-scale="display"] { background: none; -webkit-text-fill-color: unset; }
.aup-text[data-level="2"] { font-family: var(--font-heading); font-size: var(--type-heading, 1.5em); font-weight: var(--heading-weight); color: var(--color-text); letter-spacing: var(--heading-spacing); text-transform: var(--heading-transform); line-height: var(--leading-tight, 1.25); margin-bottom: 0.25em; display: flex; align-items: center; gap: 10px; }
.aup-text[data-level="2"]::before { content: ''; width: 4px; height: 0.9em; border-radius: 2px; background: var(--heading-gradient, var(--color-accent)); flex-shrink: 0; }
:is([data-tone="bold"], [data-tone="mono"]) .aup-text[data-level="2"]::before { border-radius: 0; background: var(--color-accent); }
.aup-text[data-level="3"] { font-family: var(--font-heading); font-size: var(--type-caption, 1.2em); font-weight: var(--heading-weight); color: var(--color-text); letter-spacing: var(--heading-spacing); margin-bottom: 0.2em; }
.aup-text[data-level="4"], .aup-text[data-level="5"], .aup-text[data-level="6"] { font-family: var(--font-heading); font-weight: var(--heading-weight); letter-spacing: var(--heading-spacing); }
.aup-text[data-format="code"] { font-family: var(--font-mono, monospace); background: var(--color-bg); padding: 0; border-radius: var(--radius-sm); border: 1px solid var(--color-border); white-space: pre-wrap; overflow: auto; }
.aup-text[data-format="code"] pre { margin: 0; padding: 12px; overflow: auto; }
.aup-text[data-format="code"] pre code { font-family: var(--font-mono, monospace); font-size: 0.85em; line-height: 1.5; }
.aup-text[data-format="code"] pre code.hljs { background: transparent; padding: 0; }
.aup-text[data-intent="info"] { color: var(--color-assistant); }
.aup-text[data-intent="success"] { color: var(--color-success); }
.aup-text[data-intent="warning"] { color: var(--color-accent); }
.aup-text[data-intent="error"] { color: var(--color-error); }

/* ── Spatial Intent: Typography Scale ── */
.aup-text[data-scale="display"] { font-family: var(--font-display, var(--font-heading)); font-size: 3.5em; font-weight: var(--heading-weight); letter-spacing: -0.03em; line-height: 1.05; }
.aup-text[data-scale="h1"] { font-family: var(--font-heading); font-size: 2.25em; font-weight: var(--heading-weight); letter-spacing: var(--heading-spacing); line-height: 1.15; }
.aup-text[data-scale="h2"] { font-family: var(--font-heading); font-size: 1.65em; font-weight: var(--heading-weight); letter-spacing: var(--heading-spacing); line-height: 1.25; }
.aup-text[data-scale="h3"] { font-family: var(--font-heading); font-size: 1.2em; font-weight: var(--heading-weight); letter-spacing: var(--heading-spacing); }
.aup-text[data-scale="body"] { font-size: 1em; }
.aup-text[data-scale="sm"] { font-size: 0.8em; }
.aup-text[data-scale="caption"] { font-size: 0.85em; color: var(--color-dim); }
.aup-text[data-scale="code"] { font-size: 0.85em; font-family: "JetBrains Mono", "Fira Code", monospace; }

/* ── Badge / Pill ── */
.aup-text[data-mode="badge"] { display: inline-block; padding: 3px 12px; border-radius: 999px; font-size: 0.78em; font-weight: 600; background: var(--color-surface); border: 1px solid var(--color-border); letter-spacing: 0.02em; }
.aup-text[data-mode="badge"][data-intent="info"] { background: color-mix(in srgb, var(--color-assistant) 20%, var(--color-bg)); border-color: color-mix(in srgb, var(--color-assistant) 40%, transparent); color: var(--color-assistant); box-shadow: 0 0 8px color-mix(in srgb, var(--color-assistant) 10%, transparent); }
.aup-text[data-mode="badge"][data-intent="success"] { background: color-mix(in srgb, var(--color-success) 22%, var(--color-bg)); border-color: color-mix(in srgb, var(--color-success) 40%, transparent); color: var(--color-success); box-shadow: 0 0 8px color-mix(in srgb, var(--color-success) 10%, transparent); }
.aup-text[data-mode="badge"][data-intent="warning"] { background: color-mix(in srgb, var(--color-accent) 22%, var(--color-bg)); border-color: color-mix(in srgb, var(--color-accent) 40%, transparent); color: var(--color-accent); box-shadow: 0 0 8px color-mix(in srgb, var(--color-accent) 10%, transparent); }
.aup-text[data-mode="badge"][data-intent="error"] { background: color-mix(in srgb, var(--color-error) 22%, var(--color-bg)); border-color: color-mix(in srgb, var(--color-error) 40%, transparent); color: var(--color-error); box-shadow: 0 0 8px color-mix(in srgb, var(--color-error) 10%, transparent); }

/* ── Copyable text ── */
.aup-text[data-copyable] { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; }
.aup-copy-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.aup-copy-btn { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); color: var(--color-dim); cursor: pointer; font-size: 0.7rem; padding: 0; transition: all 0.15s; flex-shrink: 0; }
.aup-copy-btn:hover { border-color: var(--color-accent); color: var(--color-accent); background: var(--hover); }
.aup-copy-btn[data-copied] { border-color: var(--color-success); color: var(--color-success); }

.aup-action { background: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-text); padding: 8px 16px; border-radius: var(--radius-md); cursor: pointer; font-family: var(--font-body); font-size: 0.9rem; transition: all var(--transition) cubic-bezier(0.4, 0, 0.2, 1); white-space: nowrap; }
.aup-action:hover { border-color: var(--color-accent); color: var(--color-accent); background: var(--color-accent-bg); transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
.aup-action:active { transform: translateY(0); }
.aup-action[data-variant="primary"] { background: var(--color-accent); border-color: var(--color-accent); color: var(--color-bg); font-weight: 600; box-shadow: 0 2px 8px color-mix(in srgb, var(--color-accent) 35%, transparent); }
.aup-action[data-variant="primary"]:hover { filter: brightness(1.15); box-shadow: 0 4px 16px color-mix(in srgb, var(--color-accent) 45%, transparent); transform: translateY(-1px); }
.aup-action[data-variant="primary"]:active { transform: translateY(0); filter: brightness(0.95); box-shadow: 0 1px 4px color-mix(in srgb, var(--color-accent) 25%, transparent); }
.aup-action[data-variant="destructive"] { background: color-mix(in srgb, var(--color-error) 12%, transparent); border-color: var(--color-error); color: var(--color-error); }
.aup-action[data-variant="destructive"]:hover { background: var(--color-error); color: var(--color-bg); box-shadow: 0 2px 8px color-mix(in srgb, var(--color-error) 35%, transparent); transform: translateY(-1px); }
.aup-action[data-variant="ghost"] { background: transparent; border-color: transparent; }
.aup-action[data-variant="ghost"]:hover { background: var(--color-surface); border-color: var(--color-border); transform: none; box-shadow: none; }
.aup-action { display: inline-flex; align-items: center; gap: 6px; }
.aup-action .aup-icon-svg { width: 1em; height: 1em; flex-shrink: 0; }
.aup-action[data-size="xs"] { padding: 3px 8px; font-size: 0.78em; }
.aup-action[data-size="sm"] { padding: 5px 12px; font-size: 0.85em; }
.aup-action[data-size="lg"] { padding: 10px 24px; font-size: 1em; }
.aup-action[data-size="xl"] { padding: 12px 32px; font-size: 1.1em; }

/* ── AUP Ticker Primitive ── */
.aup-ticker { overflow: hidden; width: 100%; white-space: nowrap; position: relative; font-family: var(--font-body); color: var(--color-text); padding: 8px 0; min-height: 2em; display: flex; align-items: center; }
.aup-ticker-track { display: inline-flex; align-items: center; will-change: transform; }
.aup-ticker[data-mode="scroll"] .aup-ticker-track { animation: ticker-scroll var(--ticker-duration, 20s) linear infinite; }
.aup-ticker[data-mode="scroll"][data-direction="ltr"] .aup-ticker-track { animation-direction: reverse; }
.aup-ticker[data-paused="true"] .aup-ticker-track { animation-play-state: paused; }
@keyframes ticker-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.aup-ticker[data-mode="scroll"] .aup-ticker-item,
.aup-ticker[data-mode="static"] .aup-ticker-item { display: inline-flex; align-items: center; flex-shrink: 0; }
.aup-ticker-separator { display: inline-flex; align-items: center; flex-shrink: 0; padding: 0 8px; opacity: 0.5; }
.aup-ticker[data-mode="flip"] .aup-ticker-track { position: relative; width: 100%; min-height: 1.5em; }
.aup-ticker[data-mode="flip"] .aup-ticker-item { position: absolute; inset: 0; display: flex; align-items: center; opacity: 0; pointer-events: none; transition: opacity 0.4s ease, transform 0.4s ease; }
.aup-ticker[data-mode="flip"][data-flip-transition="slide-up"] .aup-ticker-item { transform: translateY(100%); }
.aup-ticker[data-mode="flip"][data-flip-transition="slide-up"] .aup-ticker-item.active { transform: translateY(0); }
.aup-ticker[data-mode="flip"][data-flip-transition="slide-left"] .aup-ticker-item { transform: translateX(100%); }
.aup-ticker[data-mode="flip"][data-flip-transition="slide-left"] .aup-ticker-item.active { transform: translateX(0); }
.aup-ticker[data-mode="flip"] .aup-ticker-item.active { opacity: 1; pointer-events: auto; }
.aup-ticker[data-intent="breaking"] { background: rgba(220,38,38,0.85); color: #fff; padding: 6px 12px; }
.aup-ticker[data-intent="warning"] { background: rgba(245,158,11,0.85); color: #000; padding: 6px 12px; }
.aup-ticker[data-intent="success"] { background: rgba(22,163,74,0.85); color: #fff; padding: 6px 12px; }
.aup-ticker[data-intent="info"] { background: rgba(37,99,235,0.85); color: #fff; padding: 6px 12px; }
.aup-view[data-layout="overlay-grid"] > .aup-ticker { width: 100%; }

/* ── Role base — structural defaults (no colors, themes provide visual treatment) ── */
[data-role="live-badge"] { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 0.8rem; }
[data-role="speaker-bar"] { display: flex; flex-direction: column; gap: 2px; }
[data-role="lower-third"] { display: flex; flex-direction: column; gap: 2px; }
[data-role="alert"] { font-weight: 600; }
[data-role="clock"] { font-variant-numeric: tabular-nums; }
[data-role="score-bug"] { display: inline-flex; align-items: center; font-variant-numeric: tabular-nums; }
[data-role="data-widget"] { display: block; }
[data-role="featured-comment"] { display: block; max-width: 400px; }

.aup-unknown { border: 1px dashed var(--color-dim); padding: 8px; border-radius: var(--radius-sm); color: var(--color-dim); font-size: 0.8em; }

/* ── AUP Time Primitive ── */
.aup-time { font-family: var(--font-body); color: var(--color-text); font-variant-numeric: tabular-nums; }
.aup-time-display { font-size: 1em; }
.aup-time-clock { font-size: 2em; font-weight: 600; letter-spacing: 0.02em; }
.aup-time-timer, .aup-time-countdown { font-size: 1.5em; font-weight: 500; font-family: "Share Tech Mono", "JetBrains Mono", monospace; }
.aup-time-picker input { background: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text); padding: 6px 10px; border-radius: var(--radius-sm); font-family: var(--font-body); outline: none; }
.aup-time-picker input:focus { border-color: var(--color-accent); }

/* ── AUP Time Analog Clock ── */
.aup-time-analog-clock { display: inline-block; }
.aup-time-analog-clock svg { width: 120px; height: 120px; }
.aup-clock-face { fill: var(--card-bg); stroke: var(--color-border); stroke-width: 2; }
.aup-clock-tick { stroke: var(--color-dim); }
.aup-clock-number { fill: var(--color-text); font-size: 20px; font-weight: 600; text-anchor: middle; dominant-baseline: central; font-family: var(--font-body); }
.aup-clock-hand-hour { stroke: var(--color-text); stroke-width: 4; stroke-linecap: round; }
.aup-clock-hand-minute { stroke: var(--color-text); stroke-width: 2.5; stroke-linecap: round; }
.aup-clock-hand-second { stroke: var(--color-accent); stroke-width: 1; }
.aup-clock-center { fill: var(--color-text); }

/* ── AUP Time Calendar ── */
.aup-time-calendar { display: inline-block; width: 120px; text-align: center; border-radius: var(--radius-lg); overflow: hidden; border: 1px solid var(--color-border); background: var(--card-bg); box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
.aup-calendar-month { background: var(--color-accent); color: #fff; padding: 6px; font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; }
.aup-calendar-day { font-size: 3em; font-weight: 700; padding: 8px 0 4px; color: var(--color-text); line-height: 1; font-family: var(--font-body); }
.aup-calendar-weekday { font-size: 0.8em; color: var(--color-dim); padding: 0 0 10px; }

/* ── AUP Chart Primitive ── */
.aup-chart { position: relative; min-height: 200px; background: var(--card-bg); border: var(--card-border); border-radius: var(--radius-lg); padding: 16px; }
.aup-chart canvas { width: 100% !important; height: 100% !important; }
.aup-chart-loading { color: var(--color-dim); text-align: center; padding: 40px; font-size: 0.9em; }

/* ── AUP Finance Chart (TradingView Lightweight Charts) ── */
.aup-finance-chart { position: relative; min-height: 200px; background: var(--card-bg); border: var(--card-border); border-radius: var(--radius-lg); overflow: hidden; }
.aup-finance-chart-loading { color: var(--color-dim); text-align: center; padding: 40px; font-size: 0.9em; }

/* ── AUP Map Primitive ── */
.aup-map { min-height: 300px; border: var(--card-border); border-radius: var(--radius-lg); overflow: hidden; position: relative; }
.aup-map-loading { color: var(--color-dim); text-align: center; padding: 40px; font-size: 0.9em; }
.aup-map .leaflet-popup-content-wrapper { background: var(--card-bg); color: var(--color-text); border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); border: 1px solid var(--color-border); font-family: var(--font-body); }
.aup-map .leaflet-popup-tip { background: var(--card-bg); }
.aup-map .leaflet-popup-content { margin: 8px 12px; font-size: 0.85em; line-height: 1.5; }
.aup-map .leaflet-control-attribution { font-size: 10px; opacity: 0.6; }
.aup-map .leaflet-control-zoom a { background: var(--card-bg); color: var(--color-text); border-color: var(--color-border); }
.aup-map .leaflet-control-zoom a:hover { background: var(--hover-bg); }

/* ── AUP Calendar Primitive ── */
.aup-calendar { background: var(--card-bg); border: var(--card-border); border-radius: var(--radius-lg); padding: 16px; }
.aup-calendar-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.aup-calendar-header button { background: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text); padding: 4px 10px; border-radius: var(--radius-sm); cursor: pointer; transition: all var(--transition); }
.aup-calendar-header button:hover { border-color: var(--color-accent); color: var(--color-accent); }
.aup-calendar-header .aup-calendar-title { font-weight: 600; font-size: 1.05em; }
.aup-calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.aup-calendar-day-header { text-align: center; font-size: 0.75em; font-weight: 600; color: var(--color-dim); padding: 4px; text-transform: uppercase; }
.aup-calendar-day { text-align: center; padding: 6px 4px; border-radius: var(--radius-sm); font-size: 0.85em; cursor: default; position: relative; min-height: 32px; }
.aup-calendar-day.today { background: var(--color-accent-bg); color: var(--color-accent); font-weight: 700; }
.aup-calendar-day.other-month { color: var(--color-dim); opacity: 0.4; }
.aup-calendar-day .aup-calendar-event { display: block; font-size: 0.65em; margin-top: 2px; padding: 1px 3px; border-radius: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.aup-calendar-event[data-intent="info"] { background: rgba(96,165,250,0.2); color: #60a5fa; }
.aup-calendar-event[data-intent="success"] { background: rgba(74,222,128,0.2); color: #4ade80; }
.aup-calendar-event[data-intent="warning"] { background: rgba(251,191,36,0.2); color: #fbbf24; }
.aup-calendar-event[data-intent="error"] { background: rgba(248,113,113,0.2); color: #f87171; }

/* ── AUP Moon Phase ── */
.aup-moonphase { display: flex; flex-direction: column; align-items: center; gap: 12px; background: var(--card-bg); border: var(--card-border); border-radius: var(--radius-lg); padding: 24px; }
.aup-moonphase-visual { font-size: 4rem; line-height: 1; filter: drop-shadow(0 0 12px rgba(200,200,255,0.3)); }
.aup-moonphase-name { font-size: 1.1em; font-weight: 600; text-transform: capitalize; }
.aup-moonphase-details { display: flex; gap: 20px; font-size: 0.85em; color: var(--color-dim); }
.aup-moonphase-details span { display: flex; align-items: center; gap: 4px; }
.aup-moonphase-month { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; width: 100%; margin-top: 8px; }
.aup-moonphase-month-day { display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 0.72em; color: var(--color-dim); padding: 4px 2px; border-radius: var(--radius-sm); }
.aup-moonphase-month-day.today { background: rgba(99,102,241,0.15); color: var(--color-accent); }
.aup-moonphase-month-day .moon-emoji { font-size: 1.3em; }

/* ── XEyes ── */
.aup-xeyes { --xeyes-iris: #2c2c2c; --xeyes-bg: #fff; display: inline-flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; padding: 16px 20px 8px; background: var(--card-bg); border: var(--card-border); border-radius: var(--radius-lg); }
.aup-xeyes-eye { width: 64px; height: 80px; background: var(--xeyes-bg); border-radius: 50% / 55%; border: 2px solid #888; display: flex; align-items: center; justify-content: center; position: relative; box-shadow: inset 0 2px 8px rgba(0,0,0,0.1); transition: border-radius 0.15s; }
.aup-xeyes-pupil { width: 24px; height: 24px; position: relative; transition: transform 0.05s linear; }
.aup-xeyes-iris { width: 24px; height: 24px; background: var(--xeyes-iris); border-radius: 50%; position: absolute; inset: 0; box-shadow: inset -2px -1px 3px rgba(255,255,255,0.3), 0 0 0 3px rgba(80,60,30,0.15); }
.aup-xeyes-iris::after { content: ""; position: absolute; width: 8px; height: 8px; background: #fff; border-radius: 50%; top: 3px; left: 4px; opacity: 0.9; }
.aup-xeyes-blink .aup-xeyes-eye { border-radius: 50% / 10%; height: 8px; overflow: hidden; }
.aup-xeyes-blink .aup-xeyes-pupil { opacity: 0; }
.aup-xeyes-label { width: 100%; text-align: center; font-size: 0.7em; color: var(--color-dim); letter-spacing: 0.5px; padding-top: 2px; font-family: var(--font-mono); }
.aup-xeyes[data-xeyes-size="sm"] .aup-xeyes-eye { width: 40px; height: 52px; }
.aup-xeyes[data-xeyes-size="sm"] .aup-xeyes-pupil, .aup-xeyes[data-xeyes-size="sm"] .aup-xeyes-iris { width: 16px; height: 16px; }
.aup-xeyes[data-xeyes-size="sm"] .aup-xeyes-iris::after { width: 5px; height: 5px; top: 2px; left: 3px; }
.aup-xeyes[data-xeyes-size="lg"] .aup-xeyes-eye { width: 96px; height: 120px; border-width: 3px; }
.aup-xeyes[data-xeyes-size="lg"] .aup-xeyes-pupil, .aup-xeyes[data-xeyes-size="lg"] .aup-xeyes-iris { width: 36px; height: 36px; }
.aup-xeyes[data-xeyes-size="lg"] .aup-xeyes-iris::after { width: 12px; height: 12px; top: 5px; left: 6px; }

/* ── AUP Natal Chart ── */
.aup-natal-chart { position: relative; min-height: 200px; background: var(--card-bg); border: var(--card-border); border-radius: var(--radius-lg); overflow: hidden; padding: 16px; }
.aup-natal-chart-loading { color: var(--color-dim); text-align: center; padding: 40px; font-size: 0.9em; }
.aup-natal-chart svg { display: block; margin: 0 auto; }
.aup-natal-aspects { margin-top: 16px; }
.aup-natal-aspects table { width: 100%; border-collapse: collapse; font-size: 0.82em; }
.aup-natal-aspects th { text-align: left; padding: 6px 8px; border-bottom: 2px solid var(--color-border); color: var(--color-dim); font-weight: 600; }
.aup-natal-aspects td { padding: 5px 8px; border-bottom: 1px solid var(--color-border); }
.aup-natal-aspects tr:hover { background: rgba(99,102,241,0.06); }
.aup-natal-planets { margin-top: 12px; }
.aup-natal-planets table { width: 100%; border-collapse: collapse; font-size: 0.82em; }
.aup-natal-planets th { text-align: left; padding: 6px 8px; border-bottom: 2px solid var(--color-border); color: var(--color-dim); font-weight: 600; }
.aup-natal-planets td { padding: 5px 8px; border-bottom: 1px solid var(--color-border); }

/* ── AUP Input ── */
.aup-input { display: flex; flex-direction: column; gap: 4px; width: 100%; }
.aup-input label { color: var(--color-dim); font-size: 0.85em; }
.aup-input input, .aup-input select, .aup-input textarea { background: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text); padding: 8px 12px; border-radius: var(--radius-md); font-family: var(--font-body); font-size: 0.9rem; outline: none; transition: border-color var(--transition); width: 100%; }
.aup-input input:focus, .aup-input select:focus, .aup-input textarea:focus { border-color: var(--color-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 12%, transparent); }
.aup-input .aup-toggle { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.aup-input .aup-toggle-track { width: 40px; height: 22px; border-radius: 11px; background: var(--color-border); position: relative; transition: background var(--transition), box-shadow var(--transition); cursor: pointer; }
.aup-input .aup-toggle-track.on { background: var(--color-accent); box-shadow: 0 0 8px color-mix(in srgb, var(--color-accent) 30%, transparent); }
.aup-input .aup-toggle-thumb { width: 18px; height: 18px; border-radius: 50%; background: white; position: absolute; top: 2px; left: 2px; transition: left var(--transition) cubic-bezier(0.4, 0, 0.2, 1), box-shadow var(--transition); box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
.aup-input .aup-toggle-track.on .aup-toggle-thumb { left: 20px; }
.aup-input input[type="range"] { accent-color: var(--color-accent); }
.aup-input input[type="checkbox"] { accent-color: var(--color-accent); width: 16px; height: 16px; }
.aup-input .aup-checkbox-row { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.aup-progress { width: 100%; height: 8px; background: var(--color-border); border-radius: 4px; overflow: hidden; }
.aup-progress-fill { height: 100%; background: var(--color-accent); border-radius: 4px; transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1); background-image: linear-gradient(90deg, transparent 0%, color-mix(in srgb, white 15%, transparent) 50%, transparent 100%); background-size: 200% 100%; }
.aup-progress-fill[data-intent="success"] { background: var(--color-success); }
.aup-progress-fill[data-intent="error"] { background: var(--color-error); }
.aup-progress-fill[data-intent="info"] { background: var(--color-assistant); }
.aup-progress-row { display: flex; align-items: center; gap: 8px; }
.aup-progress-label { font-size: 0.85em; color: var(--color-dim); white-space: nowrap; }

/* ── AUP Command Bar ── */
.aup-command-bar { display: flex; flex-direction: column; height: 100%; min-height: 200px; background: var(--color-bg); }
.aup-cb-history { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.aup-cb-msg { padding: 8px 12px; border-radius: var(--radius-md); max-width: 85%; word-wrap: break-word; font-size: 0.9rem; line-height: 1.5; }
.aup-cb-msg-user { align-self: flex-end; background: var(--color-accent); color: white; border-bottom-right-radius: 2px; }
.aup-cb-msg-assistant, .aup-cb-msg-agent { align-self: flex-start; background: var(--color-surface); color: var(--color-text); border-bottom-left-radius: 2px; }
.aup-cb-msg-error { align-self: flex-start; background: rgba(255,60,60,0.15); color: #f44; border: 1px solid rgba(255,60,60,0.25); font-size: 0.85rem; }
.aup-cb-msg-assistant pre, .aup-cb-msg-agent pre { background: var(--color-bg); border-radius: var(--radius-sm); padding: 8px; overflow-x: auto; margin: 4px 0; font-size: 0.85em; }
.aup-cb-msg-assistant code, .aup-cb-msg-agent code { font-family: var(--font-mono, "JetBrains Mono", monospace); font-size: 0.9em; }
.aup-cb-msg-assistant p:first-child, .aup-cb-msg-agent p:first-child { margin-top: 0; }
.aup-cb-msg-assistant p:last-child, .aup-cb-msg-agent p:last-child { margin-bottom: 0; }
.aup-cb-bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-top: 1px solid var(--color-border); background: var(--color-surface); }
.aup-cb-model { font-size: 0.75em; color: var(--color-dim); background: var(--color-bg); padding: 2px 8px; border-radius: var(--radius-sm); white-space: nowrap; flex-shrink: 0; }
.aup-cb-input { flex: 1; background: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text); padding: 8px 12px; border-radius: var(--radius-md); font-family: var(--font-body); font-size: 0.9rem; outline: none; transition: border-color var(--transition); }
.aup-cb-input:focus { border-color: var(--color-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 12%, transparent); }
.aup-cb-input:disabled { opacity: 0.5; cursor: not-allowed; }
.aup-cb-send { background: var(--color-accent); color: white; border: none; border-radius: var(--radius-md); width: 34px; height: 34px; cursor: pointer; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: opacity var(--transition); }
.aup-cb-send:hover { opacity: 0.85; }
.aup-cb-timer { font-variant-numeric: tabular-nums; font-size: 0.85em; color: var(--color-dim); }
.aup-cb-timer::after { content: ""; display: inline-block; width: 1.2em; text-align: left; animation: aup-dots 1.4s steps(4, end) infinite; }
@keyframes aup-dots { 0% { content: ""; } 25% { content: "."; } 50% { content: ".."; } 75% { content: "..."; } }

/* ── Agent mode variants ── */
.aup-agent-chat { display: flex; flex-direction: column; height: 100%; }
.aup-agent-hud { position: fixed; top: 16px; right: 16px; max-width: 400px; max-height: 60vh; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: 0 8px 32px rgba(0,0,0,0.2); z-index: 1000; overflow: hidden; }
.aup-agent-bar { position: fixed; bottom: 0; left: 0; right: 0; background: var(--color-surface); border-top: 1px solid var(--color-border); padding: 8px 16px; z-index: 1000; }
.aup-agent-bar .aup-cb-history { display: none; }
.aup-agent-bar .aup-cb-bar { padding: 0; border-top: none; }

/* ── AUP Media ── */
.aup-media { display: inline-block; }
.aup-media img { max-width: 100%; height: auto; border-radius: var(--radius-md); object-fit: contain; }
.aup-media .aup-icon { font-size: 1.5em; display: inline-flex; align-items: center; justify-content: center; width: 2em; height: 2em; border-radius: 50%; background: var(--color-surface); }
.aup-media .aup-icon-svg { width: 1.25em; height: 1.25em; flex-shrink: 0; }
.aup-media video { max-width: 100%; border-radius: var(--radius-sm); }
.aup-media .aup-placeholder { width: 100px; height: 100px; background: var(--color-surface); border: 1px dashed var(--color-border); border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; color: var(--color-dim); font-size: 0.8em; }
.aup-avatar { display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; overflow: hidden; background: var(--color-accent-bg); color: var(--color-accent); font-weight: 600; flex-shrink: 0; }
.aup-avatar img { width: 100%; height: 100%; object-fit: cover; }
.aup-avatar[data-size="xs"] { width: 24px; height: 24px; font-size: 0.65em; }
.aup-avatar[data-size="sm"] { width: 32px; height: 32px; font-size: 0.75em; }
.aup-avatar[data-size="md"], .aup-avatar:not([data-size]) { width: 40px; height: 40px; font-size: 0.9em; }
.aup-avatar[data-size="lg"] { width: 56px; height: 56px; font-size: 1.1em; }
.aup-avatar[data-size="xl"] { width: 80px; height: 80px; font-size: 1.4em; }

/* ── AUP Overlay ── */
.aup-overlay { display: none; }
.aup-overlay.open { display: contents; }
.aup-overlay-backdrop { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); z-index: 1000; animation: aup-backdrop-in 0.25s ease both; }
.aup-overlay[data-scope="global"] > .aup-overlay-backdrop { position: fixed; }
.aup-overlay-dialog { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 24px; z-index: 1001; min-width: 320px; max-width: 80vw; max-height: 80vh; overflow-y: auto; box-shadow: 0 24px 48px rgba(0,0,0,0.2), 0 8px 16px rgba(0,0,0,0.1); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); animation: aup-dialog-in 0.2s cubic-bezier(0.4, 0, 0.2, 1) both; }
.aup-overlay[data-scope="global"] > .aup-overlay-dialog { position: fixed; }
.aup-overlay-dialog-title { font-family: var(--font-heading); font-weight: var(--heading-weight); color: var(--color-text); margin-bottom: 16px; font-size: 1.2em; letter-spacing: var(--heading-spacing); display: flex; justify-content: space-between; align-items: center; }
.aup-overlay-close { background: none; border: none; cursor: pointer; font-size: 16px; padding: 4px 8px; opacity: 0.6; color: inherit; }
.aup-overlay-close:hover { opacity: 1; }
.aup-overlay-popover { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 8px 0; z-index: 9999; min-width: 160px; max-width: 320px; max-height: 400px; overflow-y: auto; box-shadow: 0 8px 24px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.1); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); animation: aup-dialog-in 0.15s cubic-bezier(0.4, 0, 0.2, 1) both; }
.aup-overlay:not(.open) > .aup-overlay-popover { display: none; }
.aup-overlay-popover .aup-action { display: block; width: 100%; text-align: left; padding: 6px 16px; border-radius: 0; border: none; background: none; }
.aup-overlay-popover .aup-action:hover { background: var(--hover); }
.aup-overlay-drawer { position: absolute; top: 0; bottom: 0; background: var(--color-surface); border-left: 1px solid var(--color-border); z-index: 1001; width: 320px; padding: 16px; overflow-y: auto; box-shadow: -8px 0 24px rgba(0,0,0,0.15); }
.aup-overlay[data-scope="global"] > .aup-overlay-drawer { position: fixed; }
.aup-overlay-drawer.right { right: 0; animation: aup-drawer-right 0.3s cubic-bezier(0.4, 0, 0.2, 1) both; }
.aup-overlay-drawer.left { left: 0; border-left: none; border-right: 1px solid var(--color-border); animation: aup-drawer-left 0.3s cubic-bezier(0.4, 0, 0.2, 1) both; box-shadow: 8px 0 24px rgba(0,0,0,0.15); }
.aup-overlay-toast { position: absolute; z-index: 2100; max-width: 400px; min-width: 280px; animation: aup-toast-in 0.35s cubic-bezier(0.4, 0, 0.2, 1) both; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 0; box-shadow: 0 8px 24px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); overflow: hidden; display: flex; flex-direction: column; }
.aup-overlay[data-scope="global"] > .aup-overlay-toast { position: fixed; }
.aup-overlay-toast.exiting { animation: aup-toast-out 0.25s ease forwards; }
/* Position variants */
.aup-overlay-toast[data-position="bottom-right"], .aup-overlay-toast:not([data-position]) { bottom: 80px; right: 20px; }
.aup-overlay-toast[data-position="bottom-left"] { bottom: 80px; left: 20px; }
.aup-overlay-toast[data-position="bottom-center"] { bottom: 80px; left: 50%; transform: translateX(-50%); }
.aup-overlay-toast[data-position="top-right"] { top: 20px; right: 20px; }
.aup-overlay-toast[data-position="top-left"] { top: 20px; left: 20px; }
.aup-overlay-toast[data-position="top-center"] { top: 20px; left: 50%; transform: translateX(-50%); }
/* Intent accent — left border stripe */
.aup-overlay-toast[data-intent="success"] { border-left: 3px solid var(--color-success); }
.aup-overlay-toast[data-intent="error"] { border-left: 3px solid var(--color-error); }
.aup-overlay-toast[data-intent="warning"] { border-left: 3px solid var(--color-accent); }
.aup-overlay-toast[data-intent="info"] { border-left: 3px solid color-mix(in srgb, var(--color-accent) 60%, var(--color-text)); }
/* Body layout */
.aup-toast-body { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; }
.aup-toast-icon { flex-shrink: 0; font-size: 1.3em; line-height: 1; margin-top: 1px; }
.aup-toast-icon img { width: 22px; height: 22px; border-radius: 4px; object-fit: cover; }
.aup-toast-content { flex: 1; min-width: 0; }
.aup-toast-title { font-weight: 600; font-size: 0.9em; color: var(--color-text); margin-bottom: 2px; }
.aup-toast-message { font-size: 0.84em; color: var(--color-dim); line-height: 1.4; }
.aup-toast-close { flex-shrink: 0; background: none; border: none; color: var(--color-dim); cursor: pointer; font-size: 1.1em; padding: 0 2px; line-height: 1; opacity: 0.6; transition: opacity var(--transition); }
.aup-toast-close:hover { opacity: 1; }
/* Timer bar */
.aup-toast-timer { height: 3px; background: color-mix(in srgb, var(--color-accent) 20%, transparent); }
.aup-toast-timer-bar { height: 100%; background: var(--color-accent); transition: width linear; }
.aup-overlay-toast[data-intent="success"] .aup-toast-timer-bar { background: var(--color-success); }
.aup-overlay-toast[data-intent="error"] .aup-toast-timer-bar { background: var(--color-error); }
.aup-overlay-toast[data-intent="warning"] .aup-toast-timer-bar { background: var(--color-accent); }
/* ── Alert / Confirm ── */
.aup-overlay-alert { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 28px 32px; z-index: 1001; min-width: 340px; max-width: 480px; text-align: center; box-shadow: 0 24px 48px rgba(0,0,0,0.25); animation: aup-dialog-in 0.2s cubic-bezier(0.4, 0, 0.2, 1) both; }
.aup-alert-icon { font-size: 2.4em; margin-bottom: 12px; line-height: 1; }
.aup-alert-icon[data-intent="info"] { color: var(--color-accent); }
.aup-alert-icon[data-intent="success"] { color: var(--color-success); }
.aup-alert-icon[data-intent="error"] { color: var(--color-error); }
.aup-alert-icon[data-intent="warning"] { color: #f0a030; }
.aup-alert-title { font-family: var(--font-heading); font-weight: var(--heading-weight); color: var(--color-text); font-size: 1.25em; margin-bottom: 8px; letter-spacing: var(--heading-spacing); }
.aup-alert-message { color: var(--color-dim); font-size: 0.92em; line-height: 1.5; margin-bottom: 20px; }
.aup-alert-actions { display: flex; gap: 8px; justify-content: center; }
.aup-alert-btn { padding: 8px 24px; border-radius: var(--radius-md); font-family: var(--font-body); font-size: 0.9em; font-weight: 600; cursor: pointer; transition: all var(--transition); border: 1px solid var(--color-border); }
.aup-alert-btn.primary { background: var(--color-accent); border-color: var(--color-accent); color: var(--color-bg); }
.aup-alert-btn.primary:hover { filter: brightness(1.15); transform: translateY(-1px); }
.aup-alert-btn.secondary { background: transparent; color: var(--color-text); }
.aup-alert-btn.secondary:hover { background: var(--color-accent-bg); border-color: var(--color-accent); }
.aup-alert-btn.danger { background: var(--color-error); border-color: var(--color-error); color: #fff; }
.aup-alert-btn.danger:hover { filter: brightness(1.1); }

/* ── HUD (fullscreen status) ── */
.aup-overlay-hud { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1001; display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 32px 48px; background: color-mix(in srgb, var(--color-surface) 90%, transparent); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: 0 16px 48px rgba(0,0,0,0.25); animation: aup-dialog-in 0.25s cubic-bezier(0.4, 0, 0.2, 1) both; }
.aup-hud-spinner { width: 36px; height: 36px; border: 3px solid var(--color-border); border-top-color: var(--color-accent); border-radius: 50%; animation: aup-spin 0.8s linear infinite; }
.aup-hud-icon { font-size: 2em; }
.aup-hud-message { color: var(--color-text); font-size: 0.95em; font-weight: 500; }
.aup-hud-sub { color: var(--color-dim); font-size: 0.82em; }
.aup-hud-progress { width: 160px; height: 4px; background: var(--color-border); border-radius: 2px; overflow: hidden; }
.aup-hud-progress-bar { height: 100%; background: var(--color-accent); border-radius: 2px; transition: width 0.3s ease; }
@keyframes aup-spin { to { transform: rotate(360deg); } }

/* ── Choice / AskUser (Claude Code style) ── */
.aup-overlay-choice { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 0; z-index: 1001; min-width: 420px; max-width: 560px; max-height: 80vh; overflow: hidden; box-shadow: 0 24px 48px rgba(0,0,0,0.25); animation: aup-dialog-in 0.2s cubic-bezier(0.4, 0, 0.2, 1) both; display: flex; flex-direction: column; }
.aup-choice-header { padding: 20px 24px 0; }
.aup-choice-tag { display: inline-block; font-size: 0.7em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-accent); background: var(--color-accent-bg); padding: 3px 10px; border-radius: 999px; margin-bottom: 10px; }
.aup-choice-question { font-family: var(--font-heading); font-weight: var(--heading-weight); color: var(--color-text); font-size: 1.15em; line-height: 1.4; letter-spacing: var(--heading-spacing); margin-bottom: 4px; }
.aup-choice-hint { color: var(--color-dim); font-size: 0.82em; margin-bottom: 0; }
.aup-choice-options { padding: 12px 12px 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.aup-choice-option { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border: 1px solid var(--color-border); border-radius: var(--radius-md); cursor: pointer; transition: all var(--transition); background: transparent; text-align: left; font-family: var(--font-body); }
.aup-choice-option:hover { border-color: var(--color-accent); background: var(--color-accent-bg); }
.aup-choice-option.selected { border-color: var(--color-accent); background: var(--color-accent-bg); box-shadow: 0 0 0 1px var(--color-accent); }
.aup-choice-radio { flex-shrink: 0; width: 18px; height: 18px; border: 2px solid var(--color-border); border-radius: 50%; margin-top: 1px; display: flex; align-items: center; justify-content: center; transition: all var(--transition); }
.aup-choice-check { flex-shrink: 0; width: 18px; height: 18px; border: 2px solid var(--color-border); border-radius: 4px; margin-top: 1px; display: flex; align-items: center; justify-content: center; transition: all var(--transition); }
.aup-choice-option.selected .aup-choice-radio { border-color: var(--color-accent); }
.aup-choice-option.selected .aup-choice-radio::after { content: ""; width: 8px; height: 8px; background: var(--color-accent); border-radius: 50%; }
.aup-choice-option.selected .aup-choice-check { border-color: var(--color-accent); background: var(--color-accent); }
.aup-choice-option.selected .aup-choice-check::after { content: ""; width: 10px; height: 7px; border-left: 2px solid var(--color-bg); border-bottom: 2px solid var(--color-bg); transform: rotate(-45deg) translate(1px, -1px); }
.aup-choice-label { font-weight: 500; color: var(--color-text); font-size: 0.92em; }
.aup-choice-desc { color: var(--color-dim); font-size: 0.82em; line-height: 1.4; margin-top: 2px; }
.aup-choice-other { display: flex; gap: 8px; padding: 0 12px 16px; }
.aup-choice-other input { flex: 1; background: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text); padding: 8px 12px; border-radius: var(--radius-md); font-family: var(--font-body); font-size: 0.9em; outline: none; transition: border-color var(--transition); }
.aup-choice-other input:focus { border-color: var(--color-accent); }
.aup-choice-other input::placeholder { color: var(--color-dim); }
.aup-choice-footer { padding: 12px 16px; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: 8px; background: color-mix(in srgb, var(--color-bg) 50%, var(--color-surface)); }
.aup-choice-stepper { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 12px 24px 4px; }
.aup-choice-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--color-border); transition: all var(--transition); }
.aup-choice-dot.active { background: var(--color-accent); transform: scale(1.3); }
.aup-choice-dot.done { background: var(--color-accent); opacity: 0.5; }
.aup-choice-step-label { font-size: 0.72em; color: var(--color-dim); margin-left: 8px; }
.aup-choice-step-body { animation: aup-step-in 0.2s ease; }
@keyframes aup-step-in { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }
.aup-choice-footer { align-items: center; }
.aup-choice-footer .spacer { flex: 1; }

@keyframes aup-toast-in { from { opacity: 0; transform: translateY(10px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes aup-toast-out { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(-8px) scale(0.97); } }
@keyframes aup-page-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes aup-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes aup-dialog-in { from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
@keyframes aup-drawer-right { from { transform: translateX(100%); } to { transform: translateX(0); } }
@keyframes aup-drawer-left { from { transform: translateX(-100%); } to { transform: translateX(0); } }
@keyframes aup-msg-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

/* ── AUP Table ── */
.aup-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: var(--msg-font-size); border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }
.aup-table th { text-align: left; padding: 10px 14px; border-bottom: 2px solid var(--color-border); color: var(--color-dim); font-weight: 600; font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.06em; background: var(--color-surface); cursor: pointer; user-select: none; transition: color var(--transition), background var(--transition); }
.aup-table th:hover { color: var(--color-accent); background: var(--color-accent-bg); }
.aup-table th[data-align="right"] { text-align: right; }
.aup-table th[data-align="center"] { text-align: center; }
.aup-table td { padding: 10px 14px; border-bottom: 1px solid var(--color-border); color: var(--color-text); transition: background var(--transition); }
.aup-table td[data-align="right"] { text-align: right; }
.aup-table td[data-align="center"] { text-align: center; }
.aup-table tbody tr:nth-child(even) td { background: color-mix(in srgb, var(--color-surface) 50%, transparent); }
.aup-table tr:hover td { background: var(--color-accent-bg); }
.aup-table tbody tr:last-child td { border-bottom: none; }
.aup-table .aup-table-empty { text-align: center; color: var(--color-dim); padding: 20px; }

/* ── AUP Terminal Component ── */
.aup-terminal { background: var(--color-bg, #0c0c0c); border: none; border-radius: 0; overflow: hidden; }
.aup-terminal .xterm { padding: 4px; }
.aup-terminal .xterm-viewport { overflow-y: auto !important; }
.aup-terminal-placeholder { color: var(--color-dim); text-align: center; padding: 40px; font-size: 0.9em; }

/* ── AUP Editor Subsystem ── */
.aup-editor { display: flex; flex-direction: column; background: var(--card-bg); border: var(--card-border); border-radius: var(--radius-lg); overflow: hidden; }
.aup-editor-toolbar { display: flex; gap: 4px; padding: 6px 10px; border-bottom: 1px solid var(--color-border); background: var(--color-surface); flex-wrap: wrap; }
.aup-editor-toolbar button { background: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text); padding: 3px 8px; border-radius: var(--radius-sm); cursor: pointer; font-size: 0.78em; transition: all var(--transition); }
.aup-editor-toolbar button:hover { border-color: var(--color-accent); color: var(--color-accent); }
.aup-editor-toolbar .active { background: var(--color-accent-bg); border-color: var(--color-accent); color: var(--color-accent); }
.aup-editor-area { flex: 1; min-height: 200px; position: relative; }
.aup-editor-area textarea { width: 100%; height: 100%; min-height: 200px; background: transparent; color: transparent; caret-color: var(--color-text); border: none; padding: 12px; font-family: "JetBrains Mono", "Fira Code", monospace; font-size: 13px; line-height: 1.6; resize: vertical; outline: none; tab-size: 2; position: relative; z-index: 1; }
.aup-editor-highlight { position: absolute; top: 0; left: 0; right: 0; bottom: 0; padding: 12px; font-family: "JetBrains Mono", "Fira Code", monospace; font-size: 13px; line-height: 1.6; tab-size: 2; white-space: pre-wrap; word-wrap: break-word; overflow: hidden; pointer-events: none; background: var(--color-bg); color: var(--color-text); }
.aup-editor-highlight code { background: transparent !important; padding: 0 !important; font-size: inherit; line-height: inherit; }
.aup-editor-statusbar { display: flex; justify-content: space-between; padding: 4px 10px; font-size: 0.75em; color: var(--color-dim); border-top: 1px solid var(--color-border); background: var(--color-surface); }
.aup-editor-gutter { position: absolute; left: 0; top: 0; bottom: 0; width: 40px; padding: 12px 4px; text-align: right; font-family: "JetBrains Mono", monospace; font-size: 13px; line-height: 1.6; color: var(--color-dim); background: var(--color-surface); border-right: 1px solid var(--color-border); user-select: none; overflow: hidden; white-space: pre; }
.aup-editor-area.has-gutter textarea { padding-left: 48px; }
.aup-editor-area.has-gutter .aup-editor-highlight { padding-left: 48px; }

/* ── AUP Frame (sandboxed iframe page isolation) ── */
.aup-frame { position: relative; width: 100%; min-height: 200px; flex: 1; border-radius: var(--radius-lg); overflow: hidden; background: var(--card-bg); border: var(--card-border); display: flex; flex-direction: column; }
.aup-frame iframe { width: 100%; flex: 1; min-height: 200px; border: none; display: block; }
.aup-frame[data-size-width] iframe { width: auto; }
.aup-frame[data-size-height] { min-height: 0; }
.aup-frame[data-size-height] iframe { min-height: 0; }
.aup-frame-loading { position: absolute; inset: 0; z-index: 1; display: flex; align-items: center; justify-content: center; background: var(--color-surface); }
.aup-frame-loading-bar { width: 120px; height: 4px; background: var(--color-border); border-radius: 2px; overflow: hidden; position: relative; }
.aup-frame-loading-bar::after { content: ''; position: absolute; left: -40%; width: 40%; height: 100%; background: var(--color-accent); border-radius: 2px; animation: aup-frame-shimmer 1.2s ease-in-out infinite; }
@keyframes aup-frame-shimmer { 0% { left: -40%; } 100% { left: 100%; } }
.aup-frame-error { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; min-height: 200px; color: var(--color-dim); padding: 24px; text-align: center; }
.aup-frame-error-icon { font-size: 2em; }
.aup-frame-error-msg { font-size: 0.9em; }
.aup-frame-retry { background: var(--color-accent); color: var(--color-bg); border: none; padding: 6px 16px; border-radius: var(--radius-md); cursor: pointer; font-family: var(--font-body); font-size: 0.85em; font-weight: 500; transition: all var(--transition); }
.aup-frame-retry:hover { filter: brightness(1.15); }

/* ── AUP Device (nested AUP rendering surface) ── */
.aup-surface { position: relative; border: 1px solid var(--color-border); border-radius: var(--radius-md); min-height: 60px; }
.aup-surface[data-aup-surface-sizing="fixed"] { overflow: hidden; }
.aup-surface[data-aup-surface-sizing="fixed"] .aup-surface-content { width: 100%; height: 100%; overflow: auto; }
.aup-surface[data-aup-surface-sizing="fit"] .aup-surface-content { width: 100%; }
.aup-surface-status { position: absolute; top: 6px; right: 6px; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); z-index: 1; transition: background 0.3s; }
.aup-surface-status.connected { background: var(--color-success, #22c55e); }
.aup-surface-status.error { background: var(--color-error, #ef4444); }
.aup-surface-fallback { padding: 12px; background: var(--color-surface); border: 1px dashed var(--color-border); border-radius: var(--radius-sm); color: var(--muted); text-align: center; font-size: 0.85em; }
.aup-surface-breadcrumb { display: flex; align-items: center; gap: 2px; padding: 6px 12px; font-size: 12px; color: var(--color-dim); border-bottom: 1px solid var(--color-border); background: var(--color-surface); overflow-x: auto; white-space: nowrap; }
.aup-surface-breadcrumb-sep { opacity: 0.4; margin: 0 2px; }
.aup-surface-breadcrumb-seg { cursor: pointer; color: var(--color-accent); transition: opacity var(--transition); }
.aup-surface-breadcrumb-seg:hover { opacity: 0.8; text-decoration: underline; }
.aup-surface-breadcrumb-cur { color: var(--color-text); font-weight: 500; }

/* ── AUP Device view selector (tabs / dropdown) ── */
.aup-surface-view-selector { display: flex; align-items: center; gap: 0; padding: 0 8px; border-bottom: 1px solid var(--color-border); background: var(--color-surface); font-size: 13px; overflow-x: auto; white-space: nowrap; }
.aup-surface-view-tab { padding: 6px 12px; cursor: pointer; color: var(--color-dim); border-bottom: 2px solid transparent; transition: color 0.2s, border-color 0.2s; user-select: none; }
.aup-surface-view-tab:hover { color: var(--color-text); }
.aup-surface-view-tab.active { color: var(--color-accent); border-bottom-color: var(--color-accent); font-weight: 500; }
.aup-surface-view-dropdown { padding: 4px 8px; margin: 4px 8px; font-size: 13px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text); cursor: pointer; }
.aup-surface-view-dropdown:focus { outline: 2px solid var(--color-accent); outline-offset: -1px; }

/* ── Surface Sidebar Nav ── */
.aup-surface-layout { display: flex; flex: 1; min-height: 0; overflow: hidden; }
.aup-surface-nav { width: 200px; flex-shrink: 0; border-right: 1px solid var(--color-border); background: var(--color-surface); padding: 12px 0; overflow-y: auto; }
.aup-surface-nav-item { display: block; padding: 8px 16px; font-size: 0.85rem; color: var(--color-text); cursor: pointer; transition: background 0.15s, color 0.15s; user-select: none; }
.aup-surface-nav-item:hover { background: var(--hover); }
.aup-surface-nav-item.active { color: var(--color-accent); background: var(--hover); font-weight: 500; }
.aup-surface-main { flex: 1; min-width: 0; overflow-y: auto; display: flex; flex-direction: column; }
.aup-surface-main > .aup-surface-content { flex: 1; padding: 16px 24px; }
@media (max-width: 768px) {
  .aup-surface-nav { display: none; }
}

/* ── AUP src binding: loading skeleton & error banner ── */
.aup-src-loading { display: flex; align-items: center; justify-content: center; padding: 16px; }
.aup-src-loading-bar { width: 120px; height: 4px; background: var(--color-border); border-radius: 2px; overflow: hidden; position: relative; }
.aup-src-loading-bar::after { content: ''; position: absolute; left: -40%; width: 40%; height: 100%; background: var(--color-accent); border-radius: 2px; animation: aup-frame-shimmer 1.2s ease-in-out infinite; }
.aup-src-error { padding: 8px 12px; background: var(--error-bg, rgba(220,38,38,0.1)); color: var(--color-error, #ef4444); font-size: 0.85em; border-radius: var(--radius-sm); margin: 4px 0; }

/* ── AUP Canvas Subsystem ── */
.aup-canvas { background: var(--card-bg); border: var(--card-border); border-radius: var(--radius-lg); overflow: clip; }
.aup-canvas-toolbar { display: flex; gap: 4px; padding: 6px 10px; border-bottom: 1px solid var(--color-border); background: var(--color-surface); align-items: center; }
.aup-canvas-toolbar button { background: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-text); padding: 4px 10px; border-radius: var(--radius-sm); cursor: pointer; font-size: 0.8em; transition: all var(--transition); }
.aup-canvas-toolbar button:hover { border-color: var(--color-accent); color: var(--color-accent); }
.aup-canvas-toolbar button.active { background: var(--color-accent-bg); border-color: var(--color-accent); color: var(--color-accent); }
.aup-canvas-toolbar .separator { width: 1px; height: 18px; background: var(--color-border); }
.aup-canvas-toolbar input[type="color"] { width: 28px; height: 28px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); cursor: pointer; background: none; padding: 2px; }
.aup-canvas-toolbar input[type="range"] { width: 60px; accent-color: var(--color-accent); }
.aup-canvas-area { position: relative; }
.aup-canvas-area canvas { display: block; cursor: crosshair; }

/* ── Entrance Animations ── */
/* Entrance animations disabled — causes flicker on page transitions */

@keyframes aup-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes aup-slide-up { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
@keyframes aup-slide-down { from { opacity: 0; transform: translateY(-24px); } to { opacity: 1; transform: translateY(0); } }
@keyframes aup-slide-left { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: translateX(0); } }
@keyframes aup-zoom-in { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
@keyframes aup-blur-in { from { opacity: 0; filter: blur(8px); transform: scale(0.97); } to { opacity: 1; filter: blur(0); transform: scale(1); } }
@keyframes aup-scale-card { from { opacity: 0; transform: scale(0.92) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }

/* ── Background video ── */
.aup-bg-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; pointer-events: none; }
.aup-view:has(.aup-bg-video) > *:not(.aup-bg-video) { position: relative; z-index: 1; }

/* ── Audio ── */
.aup-media audio { width: 100%; max-width: 400px; }

a.aup-action { text-decoration: none; display: inline-block; }
a.aup-action[data-variant="active"] { background: var(--color-accent); border-color: var(--color-accent); color: var(--color-bg); }
/* ── Focus ring ── */
.aup-action:focus-visible, .aup-input input:focus-visible, .aup-input select:focus-visible, .aup-input textarea:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-accent) 15%, transparent); }

/* ══════════════════════════════════════════════════
   AFS List Primitive
   Two dimensions: layout (spatial) × itemStyle (per-item)
   ══════════════════════════════════════════════════ */
.aup-list { display: flex; flex-direction: column; height: 100%; overflow: hidden; font-family: var(--font-body); color: var(--color-text); }

.aup-list-loading { padding: 16px; color: var(--color-dim); font-size: 13px; text-align: center; }
.aup-list-empty { padding: 24px 16px; color: var(--color-dim); font-size: 13px; text-align: center; }
.aup-list-load-more { padding: 12px 16px; text-align: center; color: var(--color-accent); cursor: pointer; font-size: 12px; border-top: 1px solid var(--color-border); }
.aup-list-load-more:hover { background: color-mix(in srgb, var(--color-accent) 8%, transparent); }
.aup-list-virtual-spacer { flex-shrink: 0; }
.aup-list-virtual-content { flex-shrink: 0; }
.aup-list-template-item { cursor: pointer; }
.aup-list-template-header { flex-shrink: 0; }

/* ── Search ── */
.aup-list-search { padding: 6px 8px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
.aup-list-search-input { width: 100%; padding: 5px 10px; font-size: 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--color-bg) 80%, var(--color-surface)); color: var(--color-text); outline: none; font-family: var(--font-body); }
.aup-list-search-input:focus { border-color: var(--color-accent); }
.aup-list-search-input::placeholder { color: var(--color-dim); }

/* ── Breadcrumb ── */
.aup-list-breadcrumb { display: flex; align-items: center; gap: 2px; padding: 8px 12px; font-size: 12px; color: var(--color-dim); border-bottom: 1px solid var(--color-border); flex-shrink: 0; overflow-x: auto; white-space: nowrap; }
.aup-list-breadcrumb-sep { opacity: 0.4; margin: 0 2px; }
.aup-list-breadcrumb-seg { cursor: pointer; color: var(--color-accent); transition: opacity var(--transition); }
.aup-list-breadcrumb-seg:hover { opacity: 0.8; text-decoration: underline; }
.aup-list-breadcrumb-cur { color: var(--color-text); font-weight: 500; }

/* ── Body — layout dimension ── */
.aup-list-body { display: flex; flex-direction: column; overflow-y: auto; flex: 1; min-height: 0; }
.aup-list-body:focus { outline: none; }
.aup-list-body:focus-visible { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 40%, transparent); }

/* Layout: list (default) */
.aup-list[data-layout="list"] .aup-list-body { gap: 1px; }

/* Layout: grid */
.aup-list[data-layout="grid"] .aup-list-body {
  display: grid;
  grid-template-columns: repeat(var(--list-cols, 3), 1fr);
  gap: 12px; padding: 12px;
}
.aup-list[data-layout="grid"][data-auto-fill] .aup-list-body {
  grid-template-columns: repeat(auto-fill, minmax(var(--list-min-width, 200px), 1fr));
}
@media (max-width: 600px) {
  .aup-list[data-layout="grid"]:not([data-auto-fill]) .aup-list-body { grid-template-columns: repeat(2, 1fr); gap: 8px; padding: 8px; }
}

/* Layout: masonry — CSS columns */
.aup-list[data-layout="masonry"] .aup-list-body {
  display: block; column-count: var(--list-cols, 3); column-gap: 12px; padding: 12px;
}
.aup-list[data-layout="masonry"] .aup-list-body > * { break-inside: avoid; margin-bottom: 12px; }
.aup-list[data-layout="masonry"] .aup-list-media { aspect-ratio: auto; }
.aup-list[data-layout="masonry"] .aup-list-media-img { width: 100%; height: auto; object-fit: contain; }
@media (max-width: 600px) {
  .aup-list[data-layout="masonry"] .aup-list-body { column-count: 2; }
}

/* Layout: slideshow */
.aup-list[data-layout="slideshow"] .aup-list-body { position: relative; overflow: hidden; }
.aup-list-slideshow-nav { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 8px; border-top: 1px solid var(--color-border); flex-shrink: 0; }
.aup-list-slide-btn { background: none; border: 1px solid var(--color-border); color: var(--color-text); width: 32px; height: 32px; border-radius: var(--radius-sm); cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; transition: background var(--transition); }
.aup-list-slide-btn:hover { background: color-mix(in srgb, var(--color-accent) 10%, transparent); }
.aup-list-slide-counter { font-size: 12px; color: var(--color-dim); min-width: 48px; text-align: center; }

/* ── Item Style: row (default) ── */
.aup-list-row { display: flex; align-items: center; gap: 8px; padding: 6px 12px; cursor: pointer; transition: background var(--transition); border-radius: var(--radius-sm); margin: 0 4px; }
.aup-list-row:hover { background: color-mix(in srgb, var(--color-accent) 8%, transparent); }
.aup-list-row[data-selected="true"] { background: color-mix(in srgb, var(--color-accent) 15%, transparent); }
.aup-list-row[data-selected="true"] .aup-list-label { color: var(--color-accent); }

/* ── Item Style: card ── */
.aup-list-card { display: flex; flex-direction: column; border: var(--card-border); border-radius: var(--radius-md); background: var(--card-bg); box-shadow: var(--shadow-card); overflow: hidden; cursor: pointer; transition: box-shadow var(--transition), transform var(--transition); }
.aup-list-card:hover { box-shadow: var(--shadow-hover); transform: translateY(-2px); }
.aup-list-card[data-selected="true"] { outline: 2px solid var(--color-accent); outline-offset: -2px; }
.aup-list-card-image { height: 140px; background-size: cover; background-position: center; background-repeat: no-repeat; background-color: color-mix(in srgb, var(--color-surface) 80%, var(--color-border)); }
.aup-list-card-avatar-area { display: flex; align-items: center; justify-content: center; padding: 20px 0 8px; background: color-mix(in srgb, var(--color-surface) 80%, var(--color-border)); }
.aup-list-card-avatar { width: 80px; height: 80px; border-radius: 50%; background-size: cover; background-position: center; background-repeat: no-repeat; box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
.aup-list-card-icon-area { height: 80px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--color-surface) 80%, var(--color-border)); color: var(--color-dim); }
.aup-list-card-icon-area .aup-icon-svg { width: 32px; height: 32px; }
.aup-list-card-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; }
.aup-list-card-title { font-size: 13px; font-weight: 600; color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.aup-list-card-desc { font-size: 11px; color: var(--color-dim); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }

/* ── Item Style: compact ── */
.aup-list-compact { display: flex; align-items: center; gap: 6px; padding: 3px 8px; cursor: pointer; font-size: 12px; transition: background var(--transition); border-radius: var(--radius-sm); }
.aup-list-compact:hover { background: color-mix(in srgb, var(--color-accent) 8%, transparent); }
.aup-list-compact[data-selected="true"] { background: color-mix(in srgb, var(--color-accent) 15%, transparent); }
.aup-list-compact .aup-list-icon { width: 14px; height: 14px; }
.aup-list-compact .aup-icon-svg { width: 12px; height: 12px; }

/* ── Item Style: media ── */
.aup-list-media { position: relative; border-radius: var(--radius-md); overflow: hidden; cursor: pointer; aspect-ratio: 4/3; }
.aup-list-media:hover .aup-list-media-overlay { opacity: 1; }
.aup-list-media[data-selected="true"] { outline: 2px solid var(--color-accent); outline-offset: -2px; }
.aup-list-media-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.aup-list-media-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--color-surface) 70%, var(--color-border)); color: var(--color-dim); }
.aup-list-media-placeholder .aup-icon-svg { width: 40px; height: 40px; }
.aup-list-media-overlay { position: absolute; bottom: 0; left: 0; right: 0; padding: 8px 10px; background: linear-gradient(transparent, rgba(0,0,0,0.7)); opacity: 0; transition: opacity var(--transition); }
.aup-list-media-title { font-size: 12px; font-weight: 600; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.5); }
.aup-list-media-subtitle { font-size: 11px; color: rgba(255,255,255,0.75); margin-top: 2px; }
.aup-list-media-footer { font-size: 10px; color: rgba(255,255,255,0.6); margin-top: 4px; }

/* ── Item Style: hero ── */
.aup-list-hero { position: relative; min-height: 200px; border-radius: var(--radius-lg); overflow: hidden; cursor: pointer; background-size: cover; background-position: center; background-color: color-mix(in srgb, var(--color-surface) 70%, var(--color-border)); display: flex; align-items: flex-end; }
.aup-list-hero:hover { opacity: 0.95; }
.aup-list-hero[data-selected="true"] { outline: 3px solid var(--color-accent); outline-offset: -3px; }
.aup-list-hero-content { width: 100%; padding: 20px 24px; background: linear-gradient(transparent 0%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.85)); }
.aup-list-hero-title { font-size: 18px; font-weight: 700; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.5); }
.aup-list-hero-desc { font-size: 13px; color: rgba(255,255,255,0.8); margin-top: 4px; }
.aup-list-hero-footer { font-size: 11px; color: rgba(255,255,255,0.6); margin-top: 6px; }

/* ── Item Style: card footer ── */
.aup-list-card-footer { font-size: 11px; color: var(--color-dim); margin-top: 6px; padding-top: 6px; border-top: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent); }

/* ── Shared sub-elements ── */
.aup-list-icon { flex-shrink: 0; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; color: var(--color-dim); }
.aup-list-icon .aup-icon-svg { width: 16px; height: 16px; }
.aup-list-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.aup-list-label { font-size: 13px; font-weight: 500; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.aup-list-desc { font-size: 11px; color: var(--color-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.aup-list-badge { flex-shrink: 0; font-size: 11px; padding: 1px 6px; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--color-dim) 15%, transparent); color: var(--color-dim); font-weight: 500; }
.aup-list-chevron { flex-shrink: 0; width: 14px; font-size: 10px; color: var(--color-dim); user-select: none; }

/* ── Grouped children ── */
.aup-list-children { padding-left: 16px; display: none; border-left: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent); margin-left: 6px; }
.aup-list-children[data-expanded="true"] { display: block; }

/* ── Table layout ── */
.aup-list-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.aup-list-table th { text-align: left; padding: 6px 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-dim); border-bottom: 1px solid var(--color-border); position: sticky; top: 0; background: var(--color-bg); }
.aup-list-table td { padding: 5px 12px; border-bottom: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent); color: var(--color-text); }
.aup-list-table-row { cursor: pointer; transition: background var(--transition); }
.aup-list-table-row:hover { background: color-mix(in srgb, var(--color-accent) 8%, transparent); }
.aup-list-table-row[data-selected="true"] { background: color-mix(in srgb, var(--color-accent) 15%, transparent); }
.aup-list-table-expand { cursor: pointer; user-select: none; }

/* ── Kind-specific ── */
.aup-list-dir .aup-list-icon { color: var(--color-accent); }
.aup-list-file .aup-list-icon { color: var(--color-dim); }
.aup-list-group { font-weight: 600; }
.aup-list-group .aup-list-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-dim); }
.aup-list-group .aup-list-badge { background: color-mix(in srgb, var(--color-accent) 15%, transparent); color: var(--color-accent); }

/* Task status */
.aup-list-task--ready .aup-list-badge { background: color-mix(in srgb, var(--color-success, #4ec9b0) 15%, transparent); color: var(--color-success, #4ec9b0); }
.aup-list-task--in_progress .aup-list-badge { background: color-mix(in srgb, var(--color-accent) 15%, transparent); color: var(--color-accent); }
.aup-list-task--review .aup-list-badge { background: color-mix(in srgb, var(--color-assistant, #59c2ff) 15%, transparent); color: var(--color-assistant, #59c2ff); }
.aup-list-task--blocked .aup-list-badge { background: color-mix(in srgb, var(--color-error, #ff6b6b) 15%, transparent); color: var(--color-error, #ff6b6b); }
.aup-list-task--done .aup-list-badge { background: color-mix(in srgb, var(--color-dim) 10%, transparent); color: var(--color-dim); }
.aup-list-task--done .aup-list-label { opacity: 0.6; }
.aup-list-task--draft .aup-list-badge { background: color-mix(in srgb, var(--color-dim) 15%, transparent); color: var(--color-dim); }
.aup-list-queue .aup-list-icon { color: var(--color-assistant, #59c2ff); }
.aup-list-daemon .aup-list-icon { color: var(--color-success, #4ec9b0); }
`;
