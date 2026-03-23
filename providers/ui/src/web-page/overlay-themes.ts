/**
 * Overlay Theme System — broadcast "graphics packages" for overlay-grid.
 *
 * Three built-in themes: minimal (default), cnn (hard-edge news), apple (frosted glass).
 * Theme CSS is injected on-demand when _applyOverlayTheme is called.
 * Font loading is lazy — Google Fonts <link> injected only when a theme activates.
 *
 * 12 broadcast roles styled per theme:
 *   live-badge, clock, viewer-count, speaker-bar, hashtag, logo,
 *   data-widget, alert, featured-comment, score-bug, lower-third, ticker-item
 *
 * Specificity strategy:
 *   - Role selectors use [data-overlay-theme][data-overlay-theme] double-attr
 *     to reach (0,3,0), beating primitive defaults like .aup-text[data-mode] (0,2,0).
 *   - Color inheritance is forced on all children inside themed overlay-grid
 *     so primitive default `color: var(--text)` doesn't override theme colors.
 *   - Ticker gets a dedicated override for .aup-ticker color.
 */

// ── CSS injected as a JS string, applied on demand ──

export const OVERLAY_THEMES_CSS = `
/* ── Overlay Theme: minimal ── */
[data-overlay-theme="minimal"] {
  --overlay-badge-bg: rgba(0,0,0,0.6);
  --overlay-badge-color: #fff;
  --overlay-badge-radius: 6px;
  --overlay-badge-font: inherit;
  --overlay-badge-size: 0.85rem;
  --overlay-badge-weight: 600;
  --overlay-card-bg: rgba(0,0,0,0.5);
  --overlay-card-color: #fff;
  --overlay-card-border: 1px solid rgba(255,255,255,0.1);
  --overlay-card-radius: 8px;
  --overlay-glass-blur: 8px;
  --overlay-lower-bg: rgba(0,0,0,0.5);
  --overlay-lower-color: #fff;
  --overlay-lower-accent: rgba(255,255,255,0.3);
  --overlay-lower-radius: 8px;
  --overlay-lower-size: 1rem;
  --overlay-ticker-bg: rgba(0,0,0,0.6);
  --overlay-ticker-color: #fff;
  --overlay-ticker-size: 0.85rem;
  --overlay-alert-bg: rgba(220,38,38,0.85);
  --overlay-alert-color: #fff;
  --overlay-alert-size: 0.9rem;
  --overlay-score-bg: rgba(0,0,0,0.7);
  --overlay-score-color: #fff;
  --overlay-score-radius: 6px;
  --overlay-viewer-bg: rgba(0,0,0,0.4);
  --overlay-viewer-color: #fff;
}

/* ── Overlay Theme: cnn ── */
[data-overlay-theme="cnn"] {
  --overlay-badge-bg: #cc0000;
  --overlay-badge-color: #fff;
  --overlay-badge-radius: 2px;
  --overlay-badge-font: "Barlow Condensed", "Arial Narrow", sans-serif;
  --overlay-badge-size: 1rem;
  --overlay-badge-weight: 700;
  --overlay-card-bg: rgba(0,0,0,0.9);
  --overlay-card-color: #fff;
  --overlay-card-border: 4px solid #cc0000;
  --overlay-card-radius: 0;
  --overlay-glass-blur: 0;
  --overlay-lower-bg: rgba(0,0,0,0.9);
  --overlay-lower-color: #fff;
  --overlay-lower-accent: #cc0000;
  --overlay-lower-radius: 0;
  --overlay-lower-size: 1.15rem;
  --overlay-ticker-bg: #111;
  --overlay-ticker-color: #fff;
  --overlay-ticker-size: 0.95rem;
  --overlay-alert-bg: #fbbf24;
  --overlay-alert-color: #111;
  --overlay-alert-size: 1.05rem;
  --overlay-score-bg: #1a1a1a;
  --overlay-score-color: #fff;
  --overlay-score-radius: 0;
  --overlay-viewer-bg: rgba(0,0,0,0.6);
  --overlay-viewer-color: rgba(255,255,255,0.9);
}

/* ── Overlay Theme: apple ── */
[data-overlay-theme="apple"] {
  --overlay-badge-bg: rgba(0,0,0,0.4);
  --overlay-badge-color: #fff;
  --overlay-badge-radius: 20px;
  --overlay-badge-font: "Inter", -apple-system, sans-serif;
  --overlay-badge-size: 0.78rem;
  --overlay-badge-weight: 500;
  --overlay-card-bg: rgba(0,0,0,0.3);
  --overlay-card-color: #fff;
  --overlay-card-border: 1px solid rgba(255,255,255,0.18);
  --overlay-card-radius: 16px;
  --overlay-glass-blur: 20px;
  --overlay-lower-bg: rgba(0,0,0,0.3);
  --overlay-lower-color: #fff;
  --overlay-lower-accent: rgba(255,255,255,0.2);
  --overlay-lower-radius: 16px;
  --overlay-lower-size: 0.95rem;
  --overlay-ticker-bg: rgba(0,0,0,0.25);
  --overlay-ticker-color: rgba(255,255,255,0.95);
  --overlay-ticker-size: 0.82rem;
  --overlay-alert-bg: rgba(220,38,38,0.8);
  --overlay-alert-color: #fff;
  --overlay-alert-size: 0.88rem;
  --overlay-score-bg: rgba(0,0,0,0.3);
  --overlay-score-color: #fff;
  --overlay-score-radius: 12px;
  --overlay-viewer-bg: rgba(0,0,0,0.3);
  --overlay-viewer-color: rgba(255,255,255,0.9);
}

/* ══════════════════════════════════════════════════════════
   Force color inheritance inside themed overlay-grid.
   Primitives (.aup-text, .aup-ticker etc.) normally set
   color: var(--text) which overrides theme colors.
   This resets all children to inherit from their role/region container.
   Double-attr [data-overlay-theme][data-overlay-theme] => (0,3,0)
   beats .aup-text[data-mode="badge"][data-intent="info"] (0,3,1) — close but
   we use * to catch all children.
   ══════════════════════════════════════════════════════════ */

[data-overlay-theme] [data-role] *,
[data-overlay-theme] [data-role] {
  color: inherit;
  font-family: inherit;
}

/* Ticker: the .aup-ticker inside [data-region="ticker"] sets its own color.
   Force it and all its children to inherit the region's color. */
[data-overlay-theme] > [data-region="ticker"],
[data-overlay-theme] > [data-region="ticker"] *,
[data-overlay-theme] > [data-region="ticker"] .aup-ticker {
  color: var(--overlay-ticker-color) !important;
}

/* ── Role styles — doubled attribute for (0,3,0) specificity ── */

/* live-badge */
[data-overlay-theme] [data-role="live-badge"][data-role] {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--overlay-badge-bg); color: var(--overlay-badge-color);
  padding: 6px 14px; border-radius: var(--overlay-badge-radius);
  font-family: var(--overlay-badge-font); font-weight: var(--overlay-badge-weight);
  font-size: var(--overlay-badge-size);
  text-transform: uppercase; letter-spacing: 0.05em;
  backdrop-filter: blur(var(--overlay-glass-blur));
  -webkit-backdrop-filter: blur(var(--overlay-glass-blur));
  border: none; box-shadow: none;
}

/* clock */
[data-overlay-theme] [data-role="clock"][data-role] {
  display: inline-flex; align-items: center;
  background: var(--overlay-badge-bg); color: var(--overlay-badge-color);
  padding: 6px 14px; border-radius: var(--overlay-badge-radius);
  font-family: var(--overlay-badge-font); font-variant-numeric: tabular-nums;
  font-size: var(--overlay-badge-size); font-weight: var(--overlay-badge-weight);
  backdrop-filter: blur(var(--overlay-glass-blur));
  -webkit-backdrop-filter: blur(var(--overlay-glass-blur));
  border: none; box-shadow: none;
}

/* viewer-count — lighter than badge, not same color */
[data-overlay-theme] [data-role="viewer-count"][data-role] {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--overlay-viewer-bg); color: var(--overlay-viewer-color);
  padding: 6px 14px; border-radius: var(--overlay-badge-radius);
  font-family: var(--overlay-badge-font); font-size: var(--overlay-badge-size);
  backdrop-filter: blur(var(--overlay-glass-blur));
  -webkit-backdrop-filter: blur(var(--overlay-glass-blur));
  border: none; box-shadow: none;
}

/* speaker-bar */
[data-overlay-theme] [data-role="speaker-bar"][data-role] {
  display: flex; flex-direction: column; gap: 4px;
  background: var(--overlay-card-bg); color: var(--overlay-card-color);
  padding: 14px 24px; border-radius: var(--overlay-card-radius);
  border-left: var(--overlay-card-border);
  backdrop-filter: blur(var(--overlay-glass-blur));
  -webkit-backdrop-filter: blur(var(--overlay-glass-blur));
  box-shadow: none;
}

/* hashtag */
[data-overlay-theme] [data-role="hashtag"][data-role] {
  display: inline-flex; align-items: center;
  background: var(--overlay-badge-bg); color: var(--overlay-badge-color);
  padding: 6px 14px; border-radius: var(--overlay-badge-radius);
  font-family: var(--overlay-badge-font); font-size: var(--overlay-badge-size);
  backdrop-filter: blur(var(--overlay-glass-blur));
  -webkit-backdrop-filter: blur(var(--overlay-glass-blur));
  border: none; box-shadow: none;
}

/* logo */
[data-overlay-theme] [data-role="logo"][data-role] {
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(var(--overlay-glass-blur));
  -webkit-backdrop-filter: blur(var(--overlay-glass-blur));
}

/* data-widget */
[data-overlay-theme] [data-role="data-widget"][data-role] {
  background: var(--overlay-card-bg); color: var(--overlay-card-color);
  padding: 14px 20px; border-radius: var(--overlay-card-radius);
  border: var(--overlay-card-border);
  backdrop-filter: blur(var(--overlay-glass-blur));
  -webkit-backdrop-filter: blur(var(--overlay-glass-blur));
  box-shadow: none;
}

/* alert — prominent bar */
[data-overlay-theme] [data-role="alert"][data-role] {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  background: var(--overlay-alert-bg); color: var(--overlay-alert-color);
  padding: 12px 32px; border-radius: var(--overlay-badge-radius);
  font-family: var(--overlay-badge-font); font-weight: 700;
  font-size: var(--overlay-alert-size);
  text-transform: uppercase; letter-spacing: 0.06em;
  backdrop-filter: blur(var(--overlay-glass-blur));
  -webkit-backdrop-filter: blur(var(--overlay-glass-blur));
  border: none; box-shadow: none;
}

/* featured-comment */
[data-overlay-theme] [data-role="featured-comment"][data-role] {
  background: var(--overlay-card-bg); color: var(--overlay-card-color);
  padding: 14px 24px; border-radius: var(--overlay-card-radius);
  border: var(--overlay-card-border);
  backdrop-filter: blur(var(--overlay-glass-blur));
  -webkit-backdrop-filter: blur(var(--overlay-glass-blur));
  max-width: 420px; box-shadow: none;
}

/* score-bug */
[data-overlay-theme] [data-role="score-bug"][data-role] {
  display: inline-flex; align-items: center; gap: 0;
  background: var(--overlay-score-bg); color: var(--overlay-score-color);
  border-radius: var(--overlay-score-radius);
  overflow: hidden; font-family: var(--overlay-badge-font);
  font-weight: 700; font-variant-numeric: tabular-nums;
  backdrop-filter: blur(var(--overlay-glass-blur));
  -webkit-backdrop-filter: blur(var(--overlay-glass-blur));
  border: none; box-shadow: none;
}

/* lower-third — wide bar, prominent */
[data-overlay-theme] [data-role="lower-third"][data-role] {
  display: flex; flex-direction: column; gap: 4px;
  background: var(--overlay-lower-bg); color: var(--overlay-lower-color);
  padding: 16px 28px; border-radius: var(--overlay-lower-radius);
  border-left: 4px solid var(--overlay-lower-accent);
  backdrop-filter: blur(var(--overlay-glass-blur));
  -webkit-backdrop-filter: blur(var(--overlay-glass-blur));
  font-size: var(--overlay-lower-size);
  min-width: 340px;
  border-top: none; border-right: none; border-bottom: none;
  box-shadow: none;
}

/* ticker region — background on the grid region container */
[data-overlay-theme] > [data-region="ticker"] {
  background: var(--overlay-ticker-bg);
  font-size: var(--overlay-ticker-size);
  padding: 8px 0;
}

/* ticker-item */
[data-overlay-theme] [data-role="ticker-item"][data-role] {
  display: inline-flex; align-items: center;
  font-family: var(--overlay-badge-font);
  font-size: var(--overlay-ticker-size);
}

/* ══════════════════════════════════════════════════════════
   CNN theme-specific overrides
   Real CNN: full-width bars, 0 gap, 0 radius, condensed bold,
   huge text (2-3rem headlines), white-bg black-text headline bar,
   red BREAKING NEWS bar, black ticker.
   ══════════════════════════════════════════════════════════ */

/* CNN: zero gap between lower regions & ticker — tight bar stacking */
[data-overlay-theme="cnn"] {
  gap: 8px 8px;
}
/* CNN broadcast: full-width bars for lower/ticker/bottom rows — break out of title-safe padding */
[data-overlay-theme="cnn"] > [data-region^="lower"],
[data-overlay-theme="cnn"] > [data-region="ticker"],
[data-overlay-theme="cnn"] > [data-region^="bottom"] {
  margin-top: -8px;
  margin-left: calc(-1 * var(--overlay-pad));
  margin-right: calc(-1 * var(--overlay-pad));
  padding-left: var(--overlay-pad);
  padding-right: var(--overlay-pad);
}

[data-overlay-theme="cnn"] [data-role="live-badge"][data-role] {
  font-size: 1.1rem; letter-spacing: 0.15em; padding: 10px 22px;
  font-weight: 700;
}
[data-overlay-theme="cnn"] [data-role="clock"][data-role] {
  font-size: 1rem; padding: 8px 16px;
}

/* CNN lower-third: name bar — dark bg, red left accent, bold white text */
[data-overlay-theme="cnn"] [data-role="lower-third"][data-role] {
  border-left: 5px solid #cc0000;
  background: rgba(0,0,0,0.95);
  padding: 14px 24px; min-width: 280px;
  font-size: 1rem; border-radius: 0;
}
[data-overlay-theme="cnn"] [data-role="lower-third"][data-role] .aup-text:first-child {
  font-size: 1.2rem; font-weight: 700; text-transform: uppercase;
}
[data-overlay-theme="cnn"] [data-role="lower-third"][data-role] .aup-text:nth-child(2) {
  font-size: 0.85rem; opacity: 0.7; font-weight: 400;
}

/* CNN alert (BREAKING NEWS): red bg, huge bold white text */
[data-overlay-theme="cnn"] [data-role="alert"][data-role] {
  background: #cc0000; color: #fff;
  font-size: 1.4rem; letter-spacing: 0.12em; font-weight: 700;
  padding: 12px 28px; border-radius: 0;
  text-transform: uppercase;
}

/* CNN headline: WHITE bg, BLACK text, enormous condensed bold, full-width bar */
[data-overlay-theme="cnn"] [data-role="headline"][data-role] {
  background: rgba(255,255,255,0.97); color: #111;
  font-size: 2.2rem; font-weight: 700; line-height: 1.15;
  padding: 18px 28px; border-radius: 0;
  text-transform: uppercase; letter-spacing: 0.02em;
  border: none; box-shadow: none;
  backdrop-filter: none; -webkit-backdrop-filter: none;
}

/* CNN speaker-bar (name card in lower-start) */
[data-overlay-theme="cnn"] [data-role="speaker-bar"][data-role] {
  border-left: 5px solid #cc0000; border-radius: 0;
  background: rgba(0,0,0,0.95); padding: 14px 24px;
}
[data-overlay-theme="cnn"] [data-role="speaker-bar"][data-role] .aup-text:first-child {
  font-size: 1.15rem; font-weight: 700; text-transform: uppercase;
}
[data-overlay-theme="cnn"] [data-role="speaker-bar"][data-role] .aup-text:nth-child(2) {
  font-size: 0.85rem; opacity: 0.7;
}

/* CNN logo system (vertical stack in lower-end) */
[data-overlay-theme="cnn"] [data-role="logo"][data-role] {
  background: #fff; padding: 8px 16px; border-radius: 0;
}

/* CNN data-widget / hashtag — compact, 0 radius */
[data-overlay-theme="cnn"] [data-role="data-widget"][data-role] {
  border-radius: 0; border: none; border-left: 4px solid #cc0000;
}
[data-overlay-theme="cnn"] [data-role="hashtag"][data-role] {
  border-radius: 0; font-size: 0.9rem; padding: 8px 16px;
  background: rgba(0,0,0,0.8);
}

/* CNN ticker: solid black, bold white, wider padding */
[data-overlay-theme="cnn"] > [data-region="ticker"] {
  background: #111; font-weight: 600; padding: 10px 16px;
}
[data-overlay-theme="cnn"] > [data-region="ticker"] .aup-ticker-separator {
  opacity: 0.4; padding: 0 16px;
}

/* ══════════════════════════════════════════════════════════
   Apple theme-specific overrides
   ══════════════════════════════════════════════════════════ */
[data-overlay-theme="apple"] [data-role="live-badge"][data-role] {
  font-weight: 500; font-size: 0.78rem; letter-spacing: 0.08em;
  padding: 7px 18px;
}
[data-overlay-theme="apple"] [data-role="lower-third"][data-role] {
  border-left: none; padding: 20px 32px; min-width: 320px;
  background: rgba(0,0,0,0.35);
  backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255,255,255,0.15);
  font-size: 0.95rem; font-weight: 400;
  border-radius: 16px;
}
[data-overlay-theme="apple"] [data-role="speaker-bar"][data-role] {
  border-left: none; padding: 18px 28px;
  background: rgba(0,0,0,0.35);
  backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 16px;
}
[data-overlay-theme="apple"] [data-role="alert"][data-role] {
  border-radius: 24px; font-weight: 500;
  text-transform: none; letter-spacing: 0;
  background: rgba(220,38,38,0.8);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  padding: 10px 28px;
}
[data-overlay-theme="apple"] > [data-region="ticker"] {
  background: rgba(0,0,0,0.25);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  padding: 6px 0;
}
`;

// ── JS: theme presets, font loader, and _applyOverlayTheme function ──

export const OVERLAY_THEMES_JS = `
  // ── Overlay Theme Presets ──
  var _OVERLAY_THEMES = {
    minimal: {
      fonts: []
    },
    cnn: {
      fonts: ["Barlow+Condensed:wght@400;600;700"]
    },
    apple: {
      fonts: ["Inter:wght@300;400;500;600"]
    }
  };

  // ── Font loader (lazy, deduplicated) ──
  var _overlayLoadedFonts = {};

  function _isSafeOverlayFontURL(url) {
    return /^https:\\/\\/fonts\\.googleapis\\.com\\/css2/.test(url);
  }

  function _loadOverlayFonts(fonts) {
    if (!fonts || !fonts.length) return;
    for (var i = 0; i < fonts.length; i++) {
      var f = fonts[i];
      if (_overlayLoadedFonts[f]) continue;
      var url = "https://fonts.googleapis.com/css2?family=" + f + "&display=swap";
      if (!_isSafeOverlayFontURL(url)) continue;
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      document.head.appendChild(link);
      _overlayLoadedFonts[f] = true;
    }
  }

  // ── CSS injection (once) ──
  var _overlayThemeCSSInjected = false;

  function _injectOverlayThemeCSS() {
    if (_overlayThemeCSSInjected) return;
    _overlayThemeCSSInjected = true;
    var style = document.createElement("style");
    style.textContent = _OVERLAY_THEMES_CSS;
    document.head.appendChild(style);
  }

  // ── Apply overlay theme to an element ──
  function _applyOverlayTheme(el, theme) {
    if (!theme) return;
    _injectOverlayThemeCSS();

    if (typeof theme === "string") {
      // Named preset
      var preset = _OVERLAY_THEMES[theme];
      if (!preset) return;
      el.setAttribute("data-overlay-theme", theme);
      _loadOverlayFonts(preset.fonts);
    } else if (typeof theme === "object") {
      // Custom inline theme — apply as CSS variables
      el.setAttribute("data-overlay-theme", "custom");
      var keyMap = {
        badgeBg: "--overlay-badge-bg",
        badgeColor: "--overlay-badge-color",
        badgeRadius: "--overlay-badge-radius",
        badgeFont: "--overlay-badge-font",
        badgeSize: "--overlay-badge-size",
        badgeWeight: "--overlay-badge-weight",
        cardBg: "--overlay-card-bg",
        cardColor: "--overlay-card-color",
        cardBorder: "--overlay-card-border",
        cardRadius: "--overlay-card-radius",
        glassBlur: "--overlay-glass-blur",
        lowerBg: "--overlay-lower-bg",
        lowerColor: "--overlay-lower-color",
        lowerAccent: "--overlay-lower-accent",
        lowerRadius: "--overlay-lower-radius",
        lowerSize: "--overlay-lower-size",
        tickerBg: "--overlay-ticker-bg",
        tickerColor: "--overlay-ticker-color",
        tickerSize: "--overlay-ticker-size",
        alertBg: "--overlay-alert-bg",
        alertColor: "--overlay-alert-color",
        alertSize: "--overlay-alert-size",
        scoreBg: "--overlay-score-bg",
        scoreColor: "--overlay-score-color",
        scoreRadius: "--overlay-score-radius",
        viewerBg: "--overlay-viewer-bg",
        viewerColor: "--overlay-viewer-color"
      };
      for (var k in theme) {
        if (theme.hasOwnProperty(k)) {
          var cssVar = keyMap[k] || ("--overlay-" + k.replace(/([A-Z])/g, "-$1").toLowerCase());
          el.style.setProperty(cssVar, theme[k]);
        }
      }
      // Load custom fonts if provided
      if (theme.fonts) _loadOverlayFonts(theme.fonts);
    }
  }
`;
