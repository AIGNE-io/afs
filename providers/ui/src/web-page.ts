/**
 * Inline HTML template for the AFS UI web client.
 *
 * Self-contained — CDN dependencies for markdown rendering (marked + highlight.js).
 * Provides a chat-style interface with WebSocket communication.
 * Supports text, html, markdown, and component message formats.
 *
 * Ported from AOS chat-ui surface, adapted for AFS WebBackend WS protocol.
 *
 * Structure: assembler that imports CSS, skeleton, core JS, and renderer
 * modules, then concatenates them into a single HTML string.  All pieces
 * share the same IIFE scope — function declarations are hoisted, so
 * renderer order is flexible.
 */

import { STYLE_GOOGLE_FONTS_HTML, STYLE_INSPECTOR_HTML } from "@aigne/afs-aup";
import { AFS_UI_VERSION } from "./version.js";
import { CORE_HEAD_JS, CORE_TAIL_JS } from "./web-page/core.js";
import { CSS, DECK_SHADOW_CSS } from "./web-page/css.js";
import { ICONS_JS } from "./web-page/icons.js";
import { OVERLAY_THEMES_CSS, OVERLAY_THEMES_JS } from "./web-page/overlay-themes.js";
import { ACTION_JS } from "./web-page/renderers/action.js";
import { BLOCK_REVEALER_JS } from "./web-page/renderers/block-revealer.js";
import { BROADCAST_JS } from "./web-page/renderers/broadcast.js";
import { CALENDAR_JS } from "./web-page/renderers/calendar.js";
import { CANVAS_JS } from "./web-page/renderers/canvas.js";
import { CDN_LOADER_JS } from "./web-page/renderers/cdn-loader.js";
import { CHART_JS } from "./web-page/renderers/chart.js";
import { COMMAND_BAR_JS } from "./web-page/renderers/command-bar.js";
import { DECK_JS } from "./web-page/renderers/deck.js";
import { EDITOR_JS } from "./web-page/renderers/editor.js";
import { FINANCE_CHART_JS } from "./web-page/renderers/finance-chart.js";
import { FORMAT_CELL_JS } from "./web-page/renderers/format-cell.js";
import { FRAME_JS } from "./web-page/renderers/frame.js";
import { GLOBE_JS } from "./web-page/renderers/globe.js";
import { HERO_WIDGET_JS } from "./web-page/renderers/hero-widget.js";
import { INPUT_JS } from "./web-page/renderers/input.js";
import { LIST_JS } from "./web-page/renderers/list.js";
import { MAP_JS } from "./web-page/renderers/map.js";
import { MEDIA_JS } from "./web-page/renderers/media.js";
import { MOONPHASE_JS } from "./web-page/renderers/moonphase.js";
import { NATAL_CHART_JS } from "./web-page/renderers/natal-chart.js";
import { OVERLAY_JS } from "./web-page/renderers/overlay.js";
import { PHOTO_STORY_JS } from "./web-page/renderers/photo-story.js";
import { PLACEHOLDER_JS } from "./web-page/renderers/placeholder.js";
import { PROGRESS_BAR_3D_JS } from "./web-page/renderers/progress-bar-3d.js";
import { SCROLL_EXPLAINER_JS } from "./web-page/renderers/scroll-explainer.js";
import { SURFACE_JS } from "./web-page/renderers/surface.js";
import { TABLE_JS } from "./web-page/renderers/table.js";
import { TERMINAL_JS } from "./web-page/renderers/terminal.js";
import { TEXT_JS } from "./web-page/renderers/text.js";
import { TEXT_HIGHLIGHT_JS } from "./web-page/renderers/text-highlight.js";
import { TEXT_IMAGE_EXPAND_JS } from "./web-page/renderers/text-image-expand.js";
import { TICKER_JS } from "./web-page/renderers/ticker.js";
import { TIME_JS } from "./web-page/renderers/time.js";
import { TYPE_BLOCK_JS } from "./web-page/renderers/type-block.js";
import { UNKNOWN_JS } from "./web-page/renderers/unknown.js";
import { VIEW_JS } from "./web-page/renderers/view.js";
import { WEBGL_HERO_JS } from "./web-page/renderers/webgl-hero.js";
import { XEYES_JS } from "./web-page/renderers/xeyes.js";
import { SKELETON } from "./web-page/skeleton.js";

const AFS_VERSION_LITERAL = JSON.stringify(String(AFS_UI_VERSION)).replace(/</g, "\\u003c");

// ── Shared constants (eliminate duplication between WEB_CLIENT_HTML & buildAupHtmlShell) ──

const HEAD_COMMON = `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AFS</title>
${STYLE_GOOGLE_FONTS_HTML}
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<script async src="https://cdn.jsdelivr.net/npm/marked@15/marked.min.js"></script>
<script async src="https://cdn.jsdelivr.net/npm/marked-highlight@2/lib/index.umd.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11/build/styles/github-dark-dimmed.min.css" media="print" onload="this.media='all'">
<script async src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11/build/highlight.min.js"></script>
<script async src="https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js"></script>`;

const EARLY_WS_SCRIPT = `<script>try{var _p=location.protocol==="https:"?"wss:":"ws:";var _s=new URLSearchParams(location.search).get("sid");window._earlyWs=new WebSocket(_p+"//"+location.host+(_s?"?sid="+encodeURIComponent(_s):""));}catch(e){}</script>`;

const HTML_OPEN = `<!DOCTYPE html>
<html lang="en" data-tone="editorial" data-palette="neutral" data-mode="dark">
<head>`;

const HTML_CLOSE = `${STYLE_INSPECTOR_HTML}
</body>
</html>`;

// ── New export 1: CSS string ──
export const WEB_CLIENT_CSS = CSS;

// ── New export 2: JS IIFE string ──
// Content identical to the IIFE in WEB_CLIENT_HTML, guaranteed by sharing the same variable.
// Note: CORE_TAIL_JS ends with })(); — no extra closure needed.
export const WEB_CLIENT_JS = `(function() {
var _AFS_VERSION = ${AFS_VERSION_LITERAL};
${CORE_HEAD_JS}
${ICONS_JS}
${FORMAT_CELL_JS}
${PLACEHOLDER_JS}

${VIEW_JS}
${TEXT_JS}
${ACTION_JS}
${INPUT_JS}
${MEDIA_JS}
${OVERLAY_JS}
${TABLE_JS}
${CDN_LOADER_JS}
${TERMINAL_JS}
${TIME_JS}
${CHART_JS}
${FINANCE_CHART_JS}
${MAP_JS}
${GLOBE_JS}
${CALENDAR_JS}
${MOONPHASE_JS}
${NATAL_CHART_JS}
${EDITOR_JS}
${FRAME_JS}
${CANVAS_JS}
${TICKER_JS}
${BROADCAST_JS}
${COMMAND_BAR_JS}
${LIST_JS}
${SURFACE_JS}
${WEBGL_HERO_JS}
${TYPE_BLOCK_JS}
${HERO_WIDGET_JS}
${PHOTO_STORY_JS}
${BLOCK_REVEALER_JS}
${TEXT_IMAGE_EXPAND_JS}
${TEXT_HIGHLIGHT_JS}
${SCROLL_EXPLAINER_JS}
${PROGRESS_BAR_3D_JS}
${XEYES_JS}
var _OVERLAY_THEMES_CSS = ${JSON.stringify(OVERLAY_THEMES_CSS)};
${OVERLAY_THEMES_JS}
var _DECK_SHADOW_CSS = ${JSON.stringify(DECK_SHADOW_CSS)};
${DECK_JS}
${UNKNOWN_JS}

${CORE_TAIL_JS}`;

// ── New export 3: HTML shell generator ──
export function buildAupHtmlShell(assetHash: string): string {
  return `${HTML_OPEN}
${HEAD_COMMON}
<link rel="stylesheet" href="/aup.css?v=${assetHash}">
</head>
${SKELETON}
${EARLY_WS_SCRIPT}
<script src="/aup.js?v=${assetHash}"></script>
${HTML_CLOSE}`;
}

// ── Backward compat: complete inline HTML ──
// Refactored to reference WEB_CLIENT_JS; output is identical to the original.
export const WEB_CLIENT_HTML = `${HTML_OPEN}
${HEAD_COMMON}
<style>
${CSS}
</style>
</head>
${SKELETON}
${EARLY_WS_SCRIPT}
<script>
${WEB_CLIENT_JS}
</script>
${HTML_CLOSE}`;
