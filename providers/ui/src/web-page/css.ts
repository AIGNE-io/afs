import { AUP_PRIMITIVES_CSS, generateAllStyleCSS } from "@aigne/afs-aup";

/**
 * AUP CSS — Design Invariants
 *
 * 1. EXPLICIT WINS: Global layout defaults MUST NOT override elements with
 *    explicit sizing attributes (data-width, data-height, inline flex).
 *    Pattern: use :not([data-width]) to exclude explicitly sized elements.
 *
 * 2. LAYOUT vs SIZING are orthogonal:
 *    - layout (row/column/grid) controls spatial arrangement
 *    - size props (width/flex/maxWidth) control element dimensions
 *    When both are present, size props win.
 *
 * 3. FULL-PAGE mode: Root view becomes full-width (max-width:none).
 *    Children get max-width:1200px + margin:auto for centering.
 *    Panel-mode children get calculated padding for alignment.
 */
export const CSS = `
  /* ── Reset ── */
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  /* ── AUP Primitives (shared with web-device) — MUST come before themes ── */
${AUP_PRIMITIVES_CSS}

  /* ══════════════════════════════════════════════════
     Design Token System — Style Manager
     Composable Style System — tone × palette × mode
     JS sets data-tone + data-palette + data-mode on <html>
     ══════════════════════════════════════════════════ */

  /* ── Shared layout tokens ── */
  :root {
    --msg-gap: 0.8rem;
    --msg-padding: 0.7rem 1rem;
    --msg-max-width: 75%;
    --input-padding: 0.8rem 1.5rem;
  }

  /* ── Composable Style (4 tones × 5 palettes, from @aigne/afs-aup) ── */
  ${generateAllStyleCSS()}

  /* Per-theme overrides are now in generateAllThemesCSS() */

  /* ── Layout ── */
  html, body { height: 100%; }
  body { font-family: var(--font-body); line-height: 1.6; background: var(--color-bg); color: var(--color-text); display: flex; flex-direction: column; position: relative; }
  body::before { content: ""; position: fixed; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; z-index: -1; opacity: 0.7; background: var(--atmosphere, none); }
  body::after { content: ""; position: fixed; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; z-index: -1; opacity: 0.015; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); background-repeat: repeat; background-size: 256px 256px; mix-blend-mode: overlay; }
  [data-tone="bold"] body::after { opacity: 0; }

  /* Background grid texture — subtle structural depth for dark themes */
  html:not([data-mode="light"]):not([data-tone="bold"]) body { background-color: var(--color-bg); background-image: linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px); background-size: auto, 60px 60px, 60px 60px; }



  header { padding: 0.6rem 1.5rem; border-bottom: 1px solid var(--color-border); display: flex; align-items: center; gap: 0.8rem; background: var(--color-surface); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); position: sticky; top: 0; z-index: 10; }
  header h1 { font-family: var(--font-heading); font-size: 1rem; font-weight: 700; color: var(--color-accent); letter-spacing: var(--heading-spacing); }
  header .status { font-size: 0.75rem; color: var(--color-dim); }
  header .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  header .dot.on { background: var(--color-success); box-shadow: 0 0 6px var(--color-success); }
  header .dot.off { background: var(--color-error); }

  #messages { flex: 1; overflow-y: auto; padding: 1rem 1.5rem; display: flex; flex-direction: column; gap: var(--msg-gap); }

  /* ── Message bubbles ── */
  .msg { max-width: var(--msg-max-width); padding: var(--msg-padding); border-radius: var(--radius-lg); font-size: var(--msg-font-size); line-height: 1.6; word-wrap: break-word; overflow-wrap: break-word; position: relative; transition: background var(--transition), color var(--transition); }
  .msg.user { align-self: flex-end; background: var(--color-accent-bg); color: var(--color-accent); border-bottom-right-radius: var(--radius-sm); white-space: pre-wrap; }
  .msg.assistant { align-self: flex-start; background: var(--color-assistant-bg); color: var(--color-assistant); border-bottom-left-radius: var(--radius-sm); }
  .msg.system { align-self: center; color: var(--color-dim); font-size: 0.78rem; }
  .msg.error { align-self: center; background: #2a0000; color: var(--color-error); font-size: 0.78rem; white-space: pre-wrap; }
  .msg.notify { align-self: flex-start; background: #0d2a0d; color: var(--color-success); font-size: 0.82rem; white-space: pre-wrap; border-radius: var(--radius-md); }

  /* ── Copy button ── */
  .msg .copy-btn { position: absolute; top: 6px; right: 6px; background: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-dim); width: 26px; height: 26px; border-radius: var(--radius-sm); cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity var(--transition); font-size: 14px; line-height: 1; padding: 0; }
  .msg:hover .copy-btn { opacity: 1; }
  .msg .copy-btn:hover { border-color: var(--color-accent); color: var(--color-accent); }
  .msg .copy-btn.copied { border-color: var(--color-success); color: var(--color-success); }

  /* ── Markdown inside assistant bubbles ── */
  .msg.assistant p { margin: 0.4em 0; }
  .msg.assistant p:first-child { margin-top: 0; }
  .msg.assistant p:last-child { margin-bottom: 0; }
  .msg.assistant h1, .msg.assistant h2, .msg.assistant h3,
  .msg.assistant h4, .msg.assistant h5, .msg.assistant h6 { color: var(--color-text); margin: 0.8em 0 0.3em; font-size: 0.95em; }
  .msg.assistant h1 { font-size: 1.1em; }
  .msg.assistant h2 { font-size: 1.0em; }
  .msg.assistant strong { color: var(--color-text); }
  .msg.assistant em { color: var(--color-dim); }
  .msg.assistant a { color: var(--color-accent); text-decoration: underline; }
  .msg.assistant code { background: var(--color-bg); color: var(--color-accent); padding: 1px 5px; border-radius: var(--radius-sm); font-family: "JetBrains Mono", "Fira Code", monospace; font-size: 0.82em; }
  .msg.assistant pre { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 0.7em 0.9em; margin: 0.5em 0; overflow-x: auto; font-size: 0.82em; line-height: 1.5; }
  .msg.assistant pre code { background: none; padding: 0; color: var(--color-text); font-size: inherit; }
  .msg.assistant pre code.hljs { background: transparent; padding: 0; }
  .msg.assistant ul, .msg.assistant ol { margin: 0.4em 0; padding-left: 1.5em; }
  .msg.assistant li { margin: 0.2em 0; }
  .msg.assistant blockquote { border-left: 3px solid var(--color-border); padding-left: 0.8em; color: var(--color-dim); margin: 0.5em 0; }
  .msg.assistant table { border-collapse: collapse; margin: 0.5em 0; font-size: 0.82em; width: 100%; }
  .msg.assistant th, .msg.assistant td { border: 1px solid var(--color-border); padding: 0.3em 0.6em; text-align: left; }
  .msg.assistant th { background: var(--color-surface); color: var(--color-text); }
  .msg.assistant hr { border: none; border-top: 1px solid var(--color-border); margin: 0.6em 0; }
  .msg.assistant img { max-width: 100%; border-radius: var(--radius-sm); }

  /* ── Component: table ── */
  .component-table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 0.3em 0; border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }
  .component-table th, .component-table td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--color-border); }
  .component-table th { background: var(--color-surface); color: var(--color-text); border-bottom: 2px solid var(--color-border); }
  .component-table tbody tr:nth-child(even) td { background: color-mix(in srgb, var(--color-surface) 50%, transparent); }
  .component-table tbody tr:hover td { background: var(--color-accent-bg); }
  .component-table tbody tr:last-child td { border-bottom: none; }
  .component-image { max-width: 100%; border-radius: var(--radius-md); }

  /* ── Prompt area ── */
  #prompt-area { display: none; padding: 12px 1.5rem; background: var(--color-surface); border-top: 1px solid var(--color-border); }
  #prompt-area .prompt-msg { margin-bottom: 8px; font-weight: bold; color: var(--color-accent); }
  #prompt-area .prompt-options { display: flex; flex-direction: column; gap: 4px; }
  #prompt-area .prompt-options button { background: var(--color-bg); color: var(--color-text); border: 1px solid var(--color-border); padding: 6px 12px; border-radius: var(--radius-md); cursor: pointer; text-align: left; font-family: var(--font-body); font-size: var(--msg-font-size); transition: all var(--transition); }
  #prompt-area .prompt-options button:hover { background: var(--color-accent-bg); border-color: var(--color-accent); color: var(--color-accent); }

  /* ── Input bar ── */
  #input-bar { padding: var(--input-padding); border-top: 1px solid var(--color-border); display: flex; gap: 0.5rem; }
  #input-bar textarea { flex: 1; background: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-text); padding: 0.6rem 0.8rem; border-radius: var(--radius-md); font-family: var(--font-body); font-size: var(--msg-font-size); resize: none; outline: none; min-height: 40px; max-height: 120px; transition: border-color var(--transition); }
  #input-bar textarea:focus { border-color: var(--color-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 12%, transparent); }
  #input-bar button { background: var(--color-accent); border: 1px solid var(--color-accent); color: var(--color-bg); padding: 0 1.2rem; border-radius: var(--radius-md); font-family: var(--font-body); font-size: var(--msg-font-size); font-weight: 600; cursor: pointer; transition: all var(--transition); }
  #input-bar button:hover { filter: brightness(1.15); box-shadow: 0 2px 8px color-mix(in srgb, var(--color-accent) 35%, transparent); }
  #input-bar button:disabled { opacity: 0.4; cursor: default; }

  /* ── Page view ── */
  #page-view { display: none; flex: 1; overflow-y: auto; flex-direction: column; }
  #page-view .page-toolbar { padding: 6px 16px; background: var(--color-surface); border-bottom: 1px solid var(--color-border); display: flex; align-items: center; gap: 8px; }
  #page-view .page-toolbar button { background: var(--color-bg); color: var(--color-text); border: 1px solid var(--color-border); padding: 4px 10px; border-radius: var(--radius-sm); cursor: pointer; font-size: 0.85em; transition: all var(--transition); }
  #page-view .page-toolbar button:hover { border-color: var(--color-accent); color: var(--color-accent); }
  #page-view .page-toolbar span { font-size: 0.85em; color: var(--color-dim); }
  #page-content { flex: 1; padding: 16px; overflow-y: auto; color: var(--color-text); }

  /* ── Layout page grid ── */
  .layout-page { display: grid; grid-template-areas: "header header" "sidebar main" "footer footer"; grid-template-columns: 240px 1fr; grid-template-rows: auto 1fr auto; min-height: 100%; gap: 1px; background: var(--color-border); }
  .layout-header { grid-area: header; background: var(--color-surface); padding: 12px 16px; }
  .layout-sidebar { grid-area: sidebar; background: var(--color-bg); padding: 12px 16px; }
  .layout-main { grid-area: main; background: var(--color-bg); padding: 16px; }
  .layout-footer { grid-area: footer; background: var(--color-surface); padding: 8px 16px; font-size: 0.85em; color: var(--color-dim); }

  /* ── Desktop Splash ── */
  @keyframes splash-breathe { 0%, 100% { opacity: 0.18; transform: scale(1); } 50% { opacity: 0.35; transform: scale(1.04); } }
  @keyframes splash-orbit-spin { 0% { transform: translate(-50%, -50%) rotate(0deg); } 100% { transform: translate(-50%, -50%) rotate(360deg); } }
  @keyframes splash-glyph-breathe { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.5; } }
  @keyframes splash-core-pulse { 0%, 100% { opacity: 0.3; r: 6; } 50% { opacity: 0.6; r: 7; } }
  @keyframes splash-ray-flow { 0%, 100% { opacity: 0.1; } 50% { opacity: 0.3; } }
  #desktop-splash {
    flex: 1; display: flex; align-items: center; justify-content: center;
    background: var(--color-bg);
    position: relative; overflow: hidden;
    transition: opacity 0.6s ease-out;
  }
  #desktop-splash::before {
    content: ""; position: absolute; inset: 0;
    background:
      radial-gradient(ellipse 50% 50% at 50% 50%, color-mix(in srgb, var(--color-accent) 5%, transparent) 0%, transparent 70%);
    pointer-events: none;
    animation: splash-breathe 6s ease-in-out infinite;
  }
  #desktop-splash.hidden { opacity: 0; pointer-events: none; position: absolute; }
  .splash-orbit {
    position: absolute; top: 50%; left: 50%;
    border: 1px solid color-mix(in srgb, var(--color-accent) 8%, transparent);
    border-radius: 50%; pointer-events: none;
  }
  .splash-orbit-1 { width: 240px; height: 240px; animation: splash-orbit-spin 40s linear infinite; }
  .splash-orbit-2 { width: 360px; height: 360px; animation: splash-orbit-spin 60s linear infinite reverse; border-style: dashed; border-color: color-mix(in srgb, var(--color-dim) 6%, transparent); }
  .splash-orbit-3 { width: 500px; height: 500px; animation: splash-orbit-spin 90s linear infinite; border-color: color-mix(in srgb, var(--color-dim) 3%, transparent); }
  .splash-content { text-align: center; user-select: none; position: relative; z-index: 1; }
  .splash-glyph { width: 80px; height: 80px; margin: 0 auto 24px; color: var(--color-dim); }
  .splash-glyph svg { width: 100%; height: 100%; }
  .splash-glyph .glyph-outer { opacity: 0.15; animation: splash-glyph-breathe 5s ease-in-out infinite; }
  .splash-glyph .glyph-inner { opacity: 0.2; animation: splash-glyph-breathe 5s ease-in-out infinite 1.5s; }
  .splash-glyph .glyph-core { opacity: 0.35; animation: splash-core-pulse 4s ease-in-out infinite; }
  .splash-glyph .glyph-ray { opacity: 0.12; animation: splash-ray-flow 4s ease-in-out infinite; }
  .splash-glyph .glyph-ray:nth-child(5) { animation-delay: 0.4s; }
  .splash-glyph .glyph-ray:nth-child(6) { animation-delay: 0.8s; }
  .splash-glyph .glyph-ray:nth-child(7) { animation-delay: 1.2s; }
  .splash-glyph .glyph-ray:nth-child(8) { animation-delay: 1.6s; }
  .splash-glyph .glyph-ray:nth-child(9) { animation-delay: 2.0s; }
  .splash-glyph .glyph-ray:nth-child(10) { animation-delay: 2.4s; }
  .splash-wordmark {
    font-family: var(--font-heading); font-size: 2.4rem; font-weight: 800;
    letter-spacing: 0.15em; color: var(--color-dim); opacity: 0.2;
    text-transform: uppercase;
    animation: splash-breathe 6s ease-in-out infinite 0.5s;
  }
  .splash-sub {
    font-family: var(--font-body); font-size: 0.7rem; font-weight: 400;
    letter-spacing: 0.3em; text-transform: uppercase;
    color: var(--color-dim); opacity: 0.15; margin-top: 4px;
  }
  .splash-status {
    margin-top: 32px; display: flex; align-items: center; justify-content: center; gap: 6px;
    font-family: var(--font-body); font-size: 0.65rem; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--color-dim); opacity: 0.3;
  }

  /* ── Session Badge ── */
  #session-badge {
    position: fixed; bottom: 8px; left: 10px; z-index: 9999;
    display: flex; align-items: center; gap: 5px;
    font-family: var(--font-mono, "JetBrains Mono", "Share Tech Mono", monospace);
    font-size: 0.6rem; letter-spacing: 0.04em;
    color: var(--color-dim); opacity: 0.25;
    user-select: all; pointer-events: auto;
    transition: opacity 0.3s;
  }
  #session-badge:hover { opacity: 0.6; }
  #session-badge:hover #session-dot.connected { background: rgba(80,200,120,0.8); }
  #session-badge:hover #session-dot.disconnected { background: rgba(220,80,80,0.7); }
  #session-badge:hover #session-dot.connecting { background: rgba(200,180,80,0.7); }
  #session-id:empty { display: none; }
  #session-dot {
    width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0;
    background: rgba(100,100,100,0.4); transition: background 0.3s;
  }
  #session-dot.connected { background: rgba(80,200,120,0.35); }
  #session-dot.disconnected { background: rgba(220,80,80,0.35); }
  #session-dot.connecting { background: rgba(200,180,80,0.35); animation: session-dot-blink 1.2s ease-in-out infinite; }
  @keyframes session-dot-blink { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }

  /* ── AUP Display ── */
  #aup-display { display: none; flex: 1; overflow-y: auto; padding: 20px 24px; }
  #aup-display.active { display: flex; flex-direction: column; }
  #aup-display.full-page { padding: 0; overflow: hidden; }
  #aup-display.full-page .aup-toolbar { display: none; }
  #aup-display.full-page #aup-root { max-width: none; padding: 0; margin: 0; height: 100vh; overflow: hidden; display: flex; flex-direction: column; }
  #aup-display.full-page #aup-root > .aup-view,
  #aup-display.full-page #aup-root > .aup-surface { flex: 1; max-width: none !important; width: 100% !important; padding: 0 !important; margin: 0 !important; border-radius: 0 !important; background: none !important; border: none !important; box-shadow: none !important; overflow-y: auto; }
  #aup-display.full-page #aup-root > .aup-surface:has(.aup-surface-layout) { overflow: hidden !important; display: flex !important; flex-direction: column; }
  #aup-display.full-page #aup-root > .aup-view[data-layout="overlay-grid"] { padding: var(--overlay-pad) !important; }
  /* Full-page centering: non-panel, non-shell children get max-width + auto margin */
  #aup-display.full-page #aup-root > .aup-view > *:not([data-mode="panel"]):not([data-mode="shell"]) { max-width: 1200px; width: 100%; margin-left: auto !important; margin-right: auto !important; padding-left: 40px; padding-right: 40px; box-sizing: border-box; }
  /* Nav bar and footer panels bleed full width but pad their content */
  #aup-display.full-page #aup-root > .aup-view > .aup-view:first-child[data-mode="panel"] { padding-left: max(16px, calc((100% - 1200px) / 2 + 40px)); padding-right: max(16px, calc((100% - 1200px) / 2 + 40px)); }
  #aup-display.full-page #aup-root > .aup-view > .aup-view[data-mode="panel"]:last-child { padding-left: max(16px, calc((100% - 1200px) / 2 + 40px)); padding-right: max(16px, calc((100% - 1200px) / 2 + 40px)); }
  #aup-display.full-page .aup-deck-host { width: 100%; height: 100%; }
  .aup-toolbar { padding: 6px 16px; background: var(--color-surface); border-bottom: 1px solid var(--color-border); display: flex; align-items: center; gap: 8px; }
  .aup-toolbar button { background: var(--color-bg); color: var(--color-text); border: 1px solid var(--color-border); padding: 4px 10px; border-radius: var(--radius-sm); cursor: pointer; font-size: 0.85em; transition: all var(--transition); }
  .aup-toolbar button:hover { border-color: var(--color-accent); color: var(--color-accent); }
  #aup-root { flex: 1; max-width: 1200px; width: 100%; margin: 0 auto; }

  /* ── AUP Runtime: panel breakout from #aup-root max-width container ── */
  #aup-root > .aup-view:first-child[data-mode="panel"] { margin: -20px -24px 20px; padding: 10px 24px; width: calc(100% + 48px); max-width: none; }
  #aup-root > .aup-view[data-mode="panel"]:last-child { border-radius: 0; margin: 20px -24px -20px; padding: 16px 24px; width: calc(100% + 48px); max-width: none; border-top: 1px solid var(--color-border); background: color-mix(in srgb, var(--color-surface) 60%, transparent); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); font-size: 0.85em; color: var(--color-dim); }

  /* ── AUP Runtime: Page transition + message animation ── */
  #aup-root.aup-animating { animation: aup-page-in 0.25s ease-out; }
  .msg { animation: aup-msg-in 0.2s ease-out; }


`;

/**
 * Deck-specific CSS injected into Shadow DOM root.
 * Isolated from the main page — design tokens don't leak out.
 */
export const DECK_SHADOW_CSS = `
  /* ── Deck Layout ── */
  .aup-deck { position: relative; width: 100%; overflow: hidden; background: var(--deck-bg, var(--color-bg)); border-radius: var(--radius-lg, 12px); outline: none; color: var(--deck-text, var(--color-text, #fff)); font-family: var(--deck-font-body, var(--font-body, system-ui)); isolation: isolate; }
  .aup-deck[data-aspect="16-9"] { aspect-ratio: 16/9; }
  .aup-deck[data-aspect="4-3"] { aspect-ratio: 4/3; }
  .aup-deck:fullscreen { border-radius: 0; }
  .aup-deck[data-presentation="true"] { height: 100%; border-radius: 0; }
  .aup-deck[data-presentation="true"] .aup-deck-viewport { height: 100%; min-height: 100vh; }
  .aup-deck[data-presentation="true"] .aup-deck-slide > * { height: 100%; display: flex; flex-direction: column; justify-content: center; }
  .aup-deck[data-presentation="true"] .aup-deck-slide .aup-frame { flex: 1; }
  .aup-deck[data-presentation="true"] .aup-deck-slide { padding: 0; }
  .aup-deck[data-presentation="true"] .aup-deck-slide .aup-frame iframe { width: 100%; height: 100%; }
  .aup-deck-viewport { position: relative; width: 100%; height: 100%; min-height: 300px; }
  .aup-deck[data-aspect="16-9"] .aup-deck-viewport,
  .aup-deck[data-aspect="4-3"] .aup-deck-viewport { min-height: 0; height: 100%; }
  .aup-deck-slide { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: var(--deck-slide-padding, 40px); opacity: 0; pointer-events: none; transition: opacity var(--deck-transition-duration, 600ms) ease, transform var(--deck-transition-duration, 600ms) ease; }
  .aup-deck-slide > * { width: 100%; max-width: 100%; }
  .aup-deck-slide.active { opacity: 1; pointer-events: auto; z-index: 1; transform: none; }

  /* Slide background — keep absolute positioning, just add isolation for ::before/::after */
  .aup-deck[data-slide-bg="gradient"] .aup-deck-slide { background: var(--deck-gradient, linear-gradient(135deg, var(--deck-bg), var(--deck-surface))); }
  .aup-deck[data-slide-bg="dots"] .aup-deck-slide::before { content: ''; position: absolute; inset: 0; background-image: radial-gradient(circle, color-mix(in srgb, var(--deck-text, #fff) 8%, transparent) 1px, transparent 1px); background-size: 24px 24px; pointer-events: none; }
  .aup-deck[data-slide-bg="grid"] .aup-deck-slide::before { content: ''; position: absolute; inset: 0; background-image: linear-gradient(color-mix(in srgb, var(--deck-text, #fff) 5%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--deck-text, #fff) 5%, transparent) 1px, transparent 1px); background-size: 40px 40px; pointer-events: none; }
  .aup-deck[data-slide-bg="noise"] .aup-deck-slide::after { content: ''; position: absolute; inset: 0; opacity: 0.03; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); pointer-events: none; }
  .aup-deck[data-slide-bg="aurora"] .aup-deck-slide::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse 60% 40% at 20% 30%, color-mix(in srgb, var(--deck-accent, #6366f1) 15%, transparent), transparent), radial-gradient(ellipse 50% 50% at 80% 60%, color-mix(in srgb, var(--deck-accent, #6366f1) 10%, transparent), transparent); animation: deck-aurora 8s ease-in-out infinite alternate; pointer-events: none; }
  @keyframes deck-aurora { from { opacity: 0.5; transform: scale(1) rotate(0deg); } to { opacity: 1; transform: scale(1.1) rotate(2deg); } }

  /* Fade transition (default) */
  .aup-deck[data-transition="fade"] .aup-deck-slide.prev { opacity: 0; }
  /* Slide transition */
  .aup-deck[data-transition="slide"] .aup-deck-slide { transform: translateX(100%); }
  .aup-deck[data-transition="slide"] .aup-deck-slide.active { transform: translateX(0); }
  .aup-deck[data-transition="slide"] .aup-deck-slide.prev { transform: translateX(-100%); opacity: 1; }
  /* Zoom transition */
  .aup-deck[data-transition="zoom"] .aup-deck-slide { transform: scale(0.8); }
  .aup-deck[data-transition="zoom"] .aup-deck-slide.active { transform: scale(1); }
  .aup-deck[data-transition="zoom"] .aup-deck-slide.prev { transform: scale(1.2); opacity: 0; }
  /* None transition */
  .aup-deck[data-transition="none"] .aup-deck-slide { transition: none; }

  /* Deck controls */
  .aup-deck-controls { position: absolute; inset: 0; z-index: 2; pointer-events: none; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; }
  .aup-deck-prev, .aup-deck-next { pointer-events: auto; width: 40px; height: 40px; border-radius: 50%; border: none; background: color-mix(in srgb, var(--deck-bg, var(--color-bg)) 60%, transparent); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); color: var(--deck-text, var(--color-text)); cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s, background 0.2s; }
  .aup-deck-prev svg, .aup-deck-next svg { width: 20px; height: 20px; }
  .aup-deck:hover .aup-deck-prev, .aup-deck:hover .aup-deck-next { opacity: 0.7; }
  .aup-deck-prev:hover, .aup-deck-next:hover { opacity: 1 !important; background: color-mix(in srgb, var(--deck-bg, var(--color-bg)) 80%, transparent); }

  /* Deck dots */
  .aup-deck-dots { position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 2; display: flex; gap: 10px; }
  .aup-deck-dot { width: 12px; height: 12px; border-radius: 50%; border: none; background: color-mix(in srgb, var(--deck-text, var(--color-text)) 30%, transparent); cursor: pointer; padding: 0; transition: all 0.2s; }
  .aup-deck-dot.active { background: var(--deck-accent, var(--color-accent)); transform: scale(1.4); box-shadow: 0 0 8px var(--deck-accent-glow, var(--deck-accent, var(--color-accent))); }
  .aup-deck-dot:hover { background: color-mix(in srgb, var(--deck-text, var(--color-text)) 60%, transparent); }

  /* Deck progress bar */
  .aup-deck-progress { position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: color-mix(in srgb, var(--deck-text, var(--color-text)) 10%, transparent); z-index: 2; }
  .aup-deck-progress-fill { height: 100%; background: var(--deck-accent, var(--color-accent)); transition: width 0.3s ease; }

  /* Heading styles */
  .deck-heading-gradient h1, .deck-heading-gradient h2 { background: linear-gradient(135deg, var(--deck-text, #fff), var(--deck-accent, #6366f1)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .deck-heading-glow h1, .deck-heading-glow h2 { text-shadow: 0 0 40px var(--deck-accent-glow, rgba(99,102,241,0.4)), 0 0 80px var(--deck-accent-glow, rgba(99,102,241,0.4)); }

  /* Card styles */
  .deck-card-glass .aup-view[data-mode="card"] { background: color-mix(in srgb, var(--deck-surface, #141414) 60%, transparent); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid color-mix(in srgb, var(--deck-text, #fff) 10%, transparent); border-radius: 16px; }
  .deck-card-neon .aup-view[data-mode="card"] { background: transparent; border: 1px solid var(--deck-accent, #6366f1); border-radius: 12px; box-shadow: 0 0 15px var(--deck-accent-glow, rgba(99,102,241,0.4)), inset 0 0 15px var(--deck-accent-glow, rgba(99,102,241,0.4)); }
  .deck-card-bordered .aup-view[data-mode="card"] { background: transparent; border: 1px solid var(--deck-accent, #6366f1); border-radius: 12px; }

  /* Typography overrides */
  h1, h2, h3 { font-family: var(--deck-font-heading, var(--deck-font-body, inherit)); }
  h1 { font-size: var(--deck-heading-size, 3rem); }
  code, pre { font-family: var(--deck-font-mono, monospace); }

  /* ── AUP Scene Buffers (Stage-to-Live dual buffer) ── */
  .aup-buffer { position: absolute; inset: 0; width: 100%; height: 100%; overflow: auto; }
  .aup-buffer.staged { visibility: hidden; pointer-events: none; }
  .aup-buffer.active { visibility: visible; }
  .aup-buffer-hidden { display: none; }
  @keyframes aup-scene-fade-in { from { opacity: 0; } to { opacity: 1; } }

  /* ── Placeholder + Hidden (AUP Builder) ── */
  .aup-placeholder {
    color: var(--color-dim);
    border: 1px dashed var(--color-border);
    padding: 4px 8px;
    font-style: italic;
    opacity: 0.6;
  }
  /* ── Input placeholder styling ── */
  .aup-input input::placeholder,
  .aup-input textarea::placeholder { color: var(--color-dim); opacity: 0.55; }
  [data-aup-hidden="true"] { display: none; }
`;
