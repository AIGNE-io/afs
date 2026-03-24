/**
 * AUP Snapshot Generator — Freeze an AUP tree into a self-contained HTML file.
 *
 * The snapshot HTML includes:
 * - All CSS (inlined)
 * - All renderer JS (inlined)
 * - AUP tree data (embedded as JSON)
 * - CDN dependencies (marked.js, highlight.js, DOMPurify, Google Fonts)
 * - SEO metadata (og tags, title, description)
 *
 * The snapshot does NOT include:
 * - WebSocket connection code
 * - Session/token management
 * - Input/prompt handling
 * - Chat UI elements
 */

import type { AUPNode } from "./aup-types.js";
import { AFS_UI_VERSION } from "./version.js";
import { CORE_HEAD_JS } from "./web-page/core.js";
import { CSS, DECK_SHADOW_CSS } from "./web-page/css.js";
import { ICONS_JS } from "./web-page/icons.js";
import { OVERLAY_THEMES_CSS, OVERLAY_THEMES_JS } from "./web-page/overlay-themes.js";
import { ACTION_JS } from "./web-page/renderers/action.js";
import { BROADCAST_JS } from "./web-page/renderers/broadcast.js";
import { CALENDAR_JS } from "./web-page/renderers/calendar.js";
import { CANVAS_JS } from "./web-page/renderers/canvas.js";
import { CDN_LOADER_JS } from "./web-page/renderers/cdn-loader.js";
import { CHART_JS } from "./web-page/renderers/chart.js";
import { DECK_JS } from "./web-page/renderers/deck.js";
import { EDITOR_JS } from "./web-page/renderers/editor.js";
import { FINANCE_CHART_JS } from "./web-page/renderers/finance-chart.js";
import { FORMAT_CELL_JS } from "./web-page/renderers/format-cell.js";
import { FRAME_JS } from "./web-page/renderers/frame.js";
import { GLOBE_JS } from "./web-page/renderers/globe.js";
import { INPUT_JS } from "./web-page/renderers/input.js";
import { LIST_JS } from "./web-page/renderers/list.js";
import { MAP_JS } from "./web-page/renderers/map.js";
import { MEDIA_JS } from "./web-page/renderers/media.js";
import { MOONPHASE_JS } from "./web-page/renderers/moonphase.js";
import { NATAL_CHART_JS } from "./web-page/renderers/natal-chart.js";
import { OVERLAY_JS } from "./web-page/renderers/overlay.js";
import { PLACEHOLDER_JS } from "./web-page/renderers/placeholder.js";
import { SURFACE_JS } from "./web-page/renderers/surface.js";
import { TABLE_JS } from "./web-page/renderers/table.js";
import { TERMINAL_JS } from "./web-page/renderers/terminal.js";
import { TEXT_JS } from "./web-page/renderers/text.js";
import { TICKER_JS } from "./web-page/renderers/ticker.js";
import { TIME_JS } from "./web-page/renderers/time.js";
import { UNKNOWN_JS } from "./web-page/renderers/unknown.js";
import { VIEW_JS } from "./web-page/renderers/view.js";

// Version comes from the shared version.ts module (initialized at provider mount time).

export interface SnapshotOptions {
  /** AUP tree to embed */
  tree: AUPNode;
  /** Sharing entry slug (for og:url) */
  slug: string;
  /** SEO metadata */
  meta?: {
    title?: string;
    description?: string;
    image?: string;
  };
  /** Tone for the snapshot */
  tone?: string;
  /** Palette for the snapshot */
  palette?: string;
  /** Locale for the snapshot */
  locale?: string;
}

/** HTML-escape a string for safe embedding in HTML attributes and content */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** Build SEO meta tags for the <head> section */
function buildSeoTags(slug: string, meta?: SnapshotOptions["meta"]): string {
  const tags: string[] = [];
  const title = meta?.title || slug;

  // Title tag
  tags.push(`<title>${escapeHtml(title)}</title>`);

  // Description meta tag (only if description is provided)
  if (meta?.description) {
    const desc =
      meta.description.length > 200 ? `${meta.description.slice(0, 200)}...` : meta.description;
    tags.push(`<meta name="description" content="${escapeHtml(desc)}">`);
  }

  // Open Graph tags
  tags.push(`<meta property="og:title" content="${escapeHtml(title)}">`);
  tags.push(`<meta property="og:type" content="website">`);
  tags.push(`<meta property="og:url" content="/s/${escapeHtml(slug)}">`);

  if (meta?.description) {
    const ogDesc =
      meta.description.length > 200 ? `${meta.description.slice(0, 200)}...` : meta.description;
    tags.push(`<meta property="og:description" content="${escapeHtml(ogDesc)}">`);
  }

  // Only include og:image for http/https URLs
  if (meta?.image && /^https?:\/\//i.test(meta.image)) {
    tags.push(`<meta property="og:image" content="${escapeHtml(meta.image)}">`);
  }

  return tags.join("\n");
}

/** Generate a self-contained HTML snapshot of an AUP tree */
export function generateSnapshot(options: SnapshotOptions): string {
  const { tree, slug, meta, tone, palette, locale } = options;

  const AFS_VERSION_LITERAL = JSON.stringify(String(AFS_UI_VERSION)).replace(/</g, "\\u003c");

  // Serialize tree to JSON for embedding
  const treeJson = JSON.stringify(tree).replace(/<\/script>/gi, "<\\/script>");

  const seoTags = buildSeoTags(slug, meta);

  const langAttr = locale ? escapeHtml(locale) : "en";

  return `<!DOCTYPE html>
<html lang="${langAttr}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${seoTags}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Manrope:wght@400;500;600;700&family=Sora:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700&family=Share+Tech+Mono&family=JetBrains+Mono:wght@400;500&family=DM+Serif+Display:ital@0;1&family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Instrument+Serif:ital@0;1&family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,700;1,9..144,400&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/marked@15/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked-highlight@2/lib/index.umd.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11/build/styles/github-dark-dimmed.min.css">
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11/build/highlight.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js"></script>
<style>
${CSS}
</style>
</head>
<body>
<div id="aup-display" class="active full-page" style="display:flex">
<div id="aup-root" class="aup-animating"></div>
</div>
<script>
(function() {
var _AFS_VERSION = ${AFS_VERSION_LITERAL};
var _SNAPSHOT_MODE = true;
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
${LIST_JS}
${SURFACE_JS}
var _OVERLAY_THEMES_CSS = ${JSON.stringify(OVERLAY_THEMES_CSS)};
${OVERLAY_THEMES_JS}
var _DECK_SHADOW_CSS = ${JSON.stringify(DECK_SHADOW_CSS)};
${DECK_JS}
${UNKNOWN_JS}

// ── Snapshot: static render (no WebSocket) ──
var aupDisplayEl = document.getElementById("aup-display");
var aupRootEl = document.getElementById("aup-root");
var aupNodeTree = ${treeJson};

${tone ? `setTone(${JSON.stringify(tone)});` : ""}
${palette ? `setPalette(${JSON.stringify(palette)});` : ""}

function renderAupTree() {
  if (!aupNodeTree || !aupRootEl) return;
  aupRootEl.innerHTML = "";
  var el = renderAupNode(aupNodeTree);
  if (el) aupRootEl.appendChild(el);
  aupRootEl.classList.remove("aup-animating");
}

renderAupTree();
})();
</script>
</body>
</html>`;
}
