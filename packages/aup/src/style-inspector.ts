/**
 * Style Inspector — floating panel for testing tone × palette × mode combinations.
 *
 * Activated by:
 * - Keyboard: Ctrl+Shift+S (or Cmd+Shift+S on Mac)
 * - URL: ?style-inspector=true
 * - JS: window.__styleInspector.toggle()
 *
 * Works in both AUP WebSocket client and web-device SSR pages.
 * Self-contained — single string of HTML + CSS + JS, no dependencies.
 */

import { AUP_PALETTES, AUP_RECIPES, AUP_TONES } from "./styles.js";

// ── Build palette accent swatches for visual preview ──

const TONE_META = Object.entries(AUP_TONES).map(([k, v]) => ({
  id: k,
  label: k.charAt(0).toUpperCase() + k.slice(1),
  desc: v.description,
}));

const PALETTE_META = Object.entries(AUP_PALETTES).map(([k, v]) => ({
  id: k,
  label: k.charAt(0).toUpperCase() + k.slice(1),
  darkAccent: v.dark["--color-accent"] || "#888",
  lightAccent: v.light["--color-accent"] || "#888",
  desc: v.description,
}));

const RECIPE_META = Object.entries(AUP_RECIPES).map(([k, v]) => ({
  id: k,
  label: k
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" "),
  tone: v.tone,
  palette: v.palette,
  desc: v.description,
}));

// ── Generate the injectable script ──

export const STYLE_INSPECTOR_JS = `
(function() {
  var TONES = ${JSON.stringify(TONE_META)};
  var PALETTES = ${JSON.stringify(PALETTE_META)};
  var RECIPES = ${JSON.stringify(RECIPE_META)};

  var panel = null;
  var visible = false;

  function getState() {
    var el = document.documentElement;
    return {
      tone: el.getAttribute("data-tone") || "editorial",
      palette: el.getAttribute("data-palette") || "neutral",
      mode: el.getAttribute("data-mode") || "dark"
    };
  }

  function apply(tone, palette, mode) {
    if (typeof setTone === "function") { setTone(tone, true); setPalette(palette, true); setMode(mode, true); }
    else {
      var el = document.documentElement;
      el.setAttribute("data-tone", tone);
      el.setAttribute("data-palette", palette);
      el.setAttribute("data-mode", mode);
      try { localStorage.setItem("web-tone", tone); localStorage.setItem("web-palette", palette); localStorage.setItem("web-mode", mode); } catch(_) {}
    }
    updateUI();
  }

  function createPanel() {
    if (panel) return;
    panel = document.createElement("div");
    panel.id = "style-inspector";
    panel.innerHTML = buildHTML();
    document.body.appendChild(panel);

    // Wire events
    panel.addEventListener("click", function(e) {
      var btn = e.target.closest("[data-si-action]");
      if (!btn) return;
      var action = btn.getAttribute("data-si-action");
      var state = getState();

      if (action === "close") { toggle(); return; }
      if (action === "set-tone") { apply(btn.getAttribute("data-si-value"), state.palette, state.mode); return; }
      if (action === "set-palette") { apply(state.tone, btn.getAttribute("data-si-value"), state.mode); return; }
      if (action === "toggle-mode") { apply(state.tone, state.palette, state.mode === "dark" ? "light" : "dark"); return; }
      if (action === "set-recipe") {
        var r = RECIPES.find(function(x) { return x.id === btn.getAttribute("data-si-value"); });
        if (r) apply(r.tone, r.palette, state.mode);
        return;
      }
    });

    updateUI();
  }

  function buildHTML() {
    var h = '<div class="si-header"><span class="si-title">Style Inspector</span><button data-si-action="close" class="si-close">&times;</button></div>';

    // Mode toggle
    h += '<div class="si-section"><div class="si-label">Mode</div><button data-si-action="toggle-mode" class="si-mode-btn" id="si-mode-btn">Dark</button></div>';

    // Tones
    h += '<div class="si-section"><div class="si-label">Tone</div><div class="si-grid si-tones">';
    TONES.forEach(function(t) {
      h += '<button data-si-action="set-tone" data-si-value="' + t.id + '" class="si-chip si-tone-chip" title="' + t.desc + '">' + t.label + '</button>';
    });
    h += '</div></div>';

    // Palettes
    h += '<div class="si-section"><div class="si-label">Palette</div><div class="si-grid si-palettes">';
    PALETTES.forEach(function(p) {
      h += '<button data-si-action="set-palette" data-si-value="' + p.id + '" class="si-chip si-palette-chip" title="' + p.desc + '">'
        + '<span class="si-swatch" style="background:' + p.darkAccent + '"></span>'
        + '<span class="si-swatch si-swatch-light" style="background:' + p.lightAccent + '"></span>'
        + p.label + '</button>';
    });
    h += '</div></div>';

    // Recipes
    h += '<div class="si-section"><div class="si-label">Recipes</div><div class="si-grid si-recipes">';
    RECIPES.forEach(function(r) {
      h += '<button data-si-action="set-recipe" data-si-value="' + r.id + '" class="si-chip si-recipe-chip" title="' + r.desc + '">' + r.label + '</button>';
    });
    h += '</div></div>';

    // Current state
    h += '<div class="si-state" id="si-state"></div>';

    return h;
  }

  function updateUI() {
    if (!panel) return;
    var state = getState();

    // Highlight active tone
    panel.querySelectorAll(".si-tone-chip").forEach(function(btn) {
      btn.classList.toggle("si-active", btn.getAttribute("data-si-value") === state.tone);
    });

    // Highlight active palette
    panel.querySelectorAll(".si-palette-chip").forEach(function(btn) {
      btn.classList.toggle("si-active", btn.getAttribute("data-si-value") === state.palette);
    });

    // Highlight matching recipe
    panel.querySelectorAll(".si-recipe-chip").forEach(function(btn) {
      var r = RECIPES.find(function(x) { return x.id === btn.getAttribute("data-si-value"); });
      btn.classList.toggle("si-active", r && r.tone === state.tone && r.palette === state.palette);
    });

    // Mode button
    var modeBtn = document.getElementById("si-mode-btn");
    if (modeBtn) modeBtn.textContent = state.mode === "dark" ? "☀ Switch to Light" : "🌙 Switch to Dark";

    // State display
    var stateEl = document.getElementById("si-state");
    if (stateEl) stateEl.textContent = state.tone + " × " + state.palette + " × " + state.mode;
  }

  function toggle() {
    if (!panel) createPanel();
    visible = !visible;
    panel.style.display = visible ? "block" : "none";
    if (visible) updateUI();
  }

  // Keyboard shortcut: Ctrl+Shift+S / Cmd+Shift+S
  document.addEventListener("keydown", function(e) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "S") {
      e.preventDefault();
      toggle();
    }
  });

  // Auto-open if URL has ?style-inspector
  if (new URLSearchParams(location.search).has("style-inspector")) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", toggle);
    else toggle();
  }

  // Expose API
  window.__styleInspector = { toggle: toggle, apply: apply, getState: getState };
})();
`;

export const STYLE_INSPECTOR_CSS = `
#style-inspector {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 99999;
  width: 320px;
  max-height: 80vh;
  overflow-y: auto;
  background: rgba(20, 20, 28, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  padding: 12px;
  font-family: -apple-system, "Segoe UI", sans-serif;
  font-size: 12px;
  color: #e0e0e8;
  box-shadow: 0 16px 48px rgba(0,0,0,0.5);
  display: none;
}
#style-inspector * { box-sizing: border-box; margin: 0; padding: 0; }
.si-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.si-title { font-weight: 700; font-size: 13px; letter-spacing: 0.02em; }
.si-close { background: none; border: none; color: #888; font-size: 18px; cursor: pointer; padding: 2px 6px; border-radius: 4px; }
.si-close:hover { background: rgba(255,255,255,0.1); color: #fff; }
.si-section { margin-bottom: 10px; }
.si-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 6px; font-weight: 600; }
.si-grid { display: flex; flex-wrap: wrap; gap: 4px; }
.si-chip {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  padding: 4px 10px;
  color: #ccc;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}
.si-chip:hover { background: rgba(255,255,255,0.12); color: #fff; border-color: rgba(255,255,255,0.2); }
.si-chip.si-active { background: rgba(100,140,255,0.2); border-color: rgba(100,140,255,0.5); color: #fff; font-weight: 600; }
.si-swatch { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.si-swatch-light { margin-left: -3px; }
.si-mode-btn {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  padding: 6px 14px;
  color: #ccc;
  font-size: 11px;
  cursor: pointer;
  width: 100%;
  transition: all 0.15s;
}
.si-mode-btn:hover { background: rgba(255,255,255,0.15); color: #fff; }
.si-recipe-chip { font-size: 10px; padding: 3px 8px; }
.si-state { text-align: center; color: #666; font-size: 10px; margin-top: 8px; font-family: monospace; }

/* Inspector always uses dark chrome regardless of page mode */
`;

/**
 * Complete injectable snippet — add to <head> or end of <body>.
 * Includes both CSS and JS. Self-activates on Ctrl+Shift+S or ?style-inspector.
 */
export const STYLE_INSPECTOR_HTML = `<style>${STYLE_INSPECTOR_CSS}</style>\n<script>${STYLE_INSPECTOR_JS}</script>`;
