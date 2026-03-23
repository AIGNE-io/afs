/**
 * AUP Primitive, Theme & Style Registry — enriched definitions.
 *
 * Every primitive declares: category, full props schema, events,
 * containable flag, constraints, and inline examples so that a new
 * AI agent can discover and compose any UI purely from AFS reads.
 *
 * The Style System (tones, palettes, recipes) is derived from
 * @aigne/afs-aup/styles.ts — the single source of truth.
 */

import { AUP_PALETTES, AUP_RECIPES, AUP_TONES } from "@aigne/afs-aup";

// ── Types ──

export interface PropDef {
  type: string;
  description: string;
  required?: boolean;
  default?: unknown;
  enum?: string[];
  items?: PropDef | Record<string, PropDef>;
}

export interface PrimitiveDef {
  name: string;
  category: "fundamental" | "subsystem" | "component";
  description: string;
  props: Record<string, PropDef>;
  events: string[];
  containable: boolean;
  constraints?: string;
  example: Record<string, unknown>;
  examples?: Record<string, unknown>[];
}

export interface StyleToneSummary {
  name: string;
  description: string;
  character: string;
  useWhen: string[];
  avoidWhen: string[];
  tokens: Record<string, string>;
}

export interface StylePaletteSummary {
  name: string;
  description: string;
  mood: string;
  dark: Record<string, string>;
  light: Record<string, string>;
}

export interface StyleRecipeSummary {
  name: string;
  tone: string;
  palette: string;
  description: string;
  useWhen: string;
}

export interface ThemeDef {
  name: string;
  description: string;
  tokens: Record<string, string>;
}

// ── Primitives ──

export const PRIMITIVES: Record<string, PrimitiveDef> = {
  view: {
    name: "view",
    category: "fundamental",
    description:
      "Layout container that arranges children in row, column, grid, stack, or overlay-grid. " +
      "Supports Spatial Intent v0.3 for fine-grained alignment and spacing. " +
      "overlay-grid provides a 15-region broadcast band system (TV industry standard) for HUD/overlay content. " +
      "Set theme prop on overlay-grid to apply a broadcast graphics package (minimal, cnn, apple). " +
      "Children use role prop for semantic roles (live-badge, clock, speaker-bar, etc.).",
    props: {
      layout: {
        type: "string | object",
        description:
          'As string: "row" (horizontal), "column" (vertical, default), "grid" (responsive auto-fill), ' +
          '"stack" (all children layered on top of each other — use for overlays). ' +
          "As object (Spatial Intent): { direction, align, crossAlign, gap, wrap, overflow }.",
        default: "column",
        enum: ["row", "column", "grid", "stack", "overlay-grid"],
      },
      mode: { type: "string", description: "Visual mode hint (e.g. dark/light section)" },
      variant: {
        type: "string",
        description: "Semantic variant for pre-styled containers (e.g. card, section, hero)",
      },
      size: {
        type: "object",
        description:
          "Sizing constraints: { width, maxWidth, height, flex }. " +
          "Values are CSS strings (e.g. '100%', '800px').",
      },
      animate: {
        type: "string",
        description: "Entrance animation triggered by deck slide or viewport entry",
        enum: ["none", "fade-in", "slide-up", "slide-left", "zoom-in"],
      },
      animateDelay: {
        type: "number",
        description: "Animation delay in ms (for staggered reveals)",
      },
      animateDuration: {
        type: "number",
        description: "Animation duration in ms (default: 600)",
      },
      background: {
        type: "string | object",
        description:
          "Background: CSS color/gradient string, URL string (auto-detected), or object " +
          '{ type: "gradient"|"image"|"video", value/src, opacity?, blur? }.',
      },
      theme: {
        type: "string | object",
        description:
          'Overlay theme for overlay-grid layouts. Named presets: "minimal", "cnn", "apple". ' +
          "Pass a string for presets or an object with camelCase keys for custom CSS variables " +
          '(e.g. { badgeBg: "#ff6b00", cardRadius: "0" }). ' +
          "Themes style children that have a role prop — agents declare WHAT (role), themes handle HOW (styling).",
      },
    },
    events: [],
    containable: true,
    constraints:
      "Children are rendered in order. Grid layout uses CSS grid with auto-fill columns. " +
      "For overlay-grid with theme: children should use the role prop for themed styling.",
    example: {
      id: "layout-1",
      type: "view",
      props: { layout: "row", size: { maxWidth: "800px" } },
      children: [
        { id: "t1", type: "text", props: { content: "Left", level: 2 } },
        { id: "t2", type: "text", props: { content: "Right" } },
      ],
    },
  },

  text: {
    name: "text",
    category: "fundamental",
    description:
      "Text content display. Renders as h1-h6 for headings or div for body. " +
      "Supports markdown rendering via format prop.",
    props: {
      content: { type: "string", description: "The text content to display", required: true },
      level: {
        type: "number",
        description: "Heading level 1-6. Omit for body text.",
        enum: ["1", "2", "3", "4", "5", "6"],
      },
      format: {
        type: "string",
        description: 'Set to "markdown" for Markdown rendering',
        enum: ["text", "markdown"],
        default: "text",
      },
      scale: { type: "string", description: "Typography scale: xs, sm, base, lg, xl, 2xl" },
      intent: {
        type: "string",
        description: "Semantic intent for colored text",
        enum: ["info", "success", "warning", "error"],
      },
      mode: { type: "string", description: 'Visual mode: "mono" for monospace' },
      size: { type: "string", description: "Size variant for the text element" },
      animate: {
        type: "string",
        description:
          'Entrance animation. "count-up" animates numeric content from 0 to target value.',
        enum: ["none", "fade-in", "slide-up", "slide-left", "zoom-in", "count-up"],
      },
      animateDelay: {
        type: "number",
        description: "Animation delay in ms",
      },
      animateDuration: {
        type: "number",
        description: "Animation duration in ms (default: 600, count-up default: 2000)",
      },
    },
    events: [],
    containable: false,
    example: {
      id: "heading-1",
      type: "text",
      props: { content: "Welcome", level: 1 },
    },
  },

  action: {
    name: "action",
    category: "fundamental",
    description:
      "Clickable button or link. Emits a click event that triggers an AFS exec call. " +
      "Use href for navigation links, events.click for actions.",
    props: {
      label: {
        type: "string",
        description: "Button label text",
        required: true,
        default: "Action",
      },
      variant: {
        type: "string",
        description: "Visual variant",
        enum: ["primary", "secondary", "ghost", "destructive"],
        default: "primary",
      },
      size: { type: "string", description: "Button size", enum: ["sm", "md", "lg"] },
      icon: {
        type: "string",
        description:
          "Icon name from built-in set (~170 Lucide icons). " +
          "Navigation: search, home, menu, arrow-left/right/up/down, chevron-left/right/up/down, external-link, compass, move. " +
          "Actions: plus, close, x, check, edit, trash, copy, download, upload, refresh, filter, share, save, undo, redo, clipboard, scissors, power, log-out. " +
          "Status: info, warning, check-circle, x-circle, alert-circle, alert-triangle, loader, flag, ban, thumbs-up/down. " +
          "Files: file, file-text, folder, folder-open, folder-plus, archive, book, book-open, inbox, paperclip, bookmark, scroll. " +
          "Layout: list, layout, grid, sidebar, table-2, columns, maximize, minimize, panel-left/right, align-left/center/right. " +
          "Devices: monitor, cpu, server, hard-drive, smartphone, tablet, printer, camera, wifi. " +
          "Communication: mail, bell, message-circle, message-square, phone, send, at-sign, rss, megaphone. " +
          "Media: image, video, mic, play, pause, music, volume, volume-2, volume-x, film. " +
          "Data: chart, bar-chart, pie-chart, trending-up/down, activity, database, hash. " +
          "Users: user, users, user-plus, user-check, user-x, github, award. " +
          "Security: lock, unlock, shield, shield-check, eye, eye-off, key, fingerprint. " +
          "Nature: sun, moon, cloud, cloud-rain, wind, snowflake, thermometer, flame. " +
          "Commerce: dollar-sign, credit-card, shopping-cart, shopping-bag, receipt, wallet, gift, briefcase. " +
          "Dev: code, code-2, braces, terminal, git-branch, git-commit, git-merge, git-pull-request, settings, gear, tool, wrench, bug, package, zap, feather. " +
          "Objects: star, heart, bolt, rocket, lightbulb, robot, globe, link, calendar, clock, box, tag, map-pin, target, layers, pin, anchor, crosshair, disc, routes.",
      },
      href: {
        type: "string",
        description: "URL for link behavior (renders <a> instead of <button>)",
      },
      target: { type: "string", description: 'Link target (e.g. "_blank")' },
    },
    events: ["click"],
    containable: false,
    constraints: "If both href and events.click are present, click event takes priority.",
    example: {
      id: "save-btn",
      type: "action",
      props: { label: "Save", variant: "primary", icon: "check" },
      events: { click: { exec: "/api/.actions/save", args: { id: "123" } } },
    },
  },

  input: {
    name: "input",
    category: "fundamental",
    description:
      "User input field. Emits change events with the new value. " +
      "Supports text, password, date, select, toggle, checkbox, slider, progress, textarea.",
    props: {
      type: {
        type: "string",
        description: "Input subtype",
        enum: [
          "text",
          "password",
          "date",
          "select",
          "toggle",
          "checkbox",
          "slider",
          "progress",
          "textarea",
        ],
        default: "text",
      },
      label: { type: "string", description: "Visible label displayed above the input" },
      placeholder: { type: "string", description: "Placeholder text for text/textarea inputs" },
      options: {
        type: "array",
        description:
          "For select type: array of strings or {label, value} objects. " +
          'E.g. ["Option A", "Option B"] or [{label: "A", value: "a"}]',
      },
      min: { type: "number", description: "Minimum value for number/slider/date inputs" },
      max: { type: "number", description: "Maximum value for number/slider/date inputs" },
      step: { type: "number", description: "Step increment for slider inputs" },
      rows: {
        type: "number",
        description: "Number of visible rows for textarea (default: 3)",
        default: 3,
      },
      intent: {
        type: "string",
        description: "Semantic intent for progress bar fill color",
        enum: ["info", "success", "warning", "error"],
      },
      showValue: {
        type: "boolean",
        description: "Show numeric value on progress bar (default: true)",
        default: true,
      },
    },
    events: ["change"],
    containable: false,
    constraints:
      "Current value is read from node.state.value. " +
      "Change event payload includes { value } for select type.",
    example: {
      id: "email-input",
      type: "input",
      props: { type: "text", label: "Email", placeholder: "you@example.com" },
      state: { value: "" },
      events: { change: { exec: "/form/.actions/validate", args: { field: "email" } } },
    },
  },

  media: {
    name: "media",
    category: "fundamental",
    description:
      "Displays images, avatars, icons, videos, or audio. " +
      "For icons, uses the built-in icon vocabulary (same as action.icon).",
    props: {
      type: {
        type: "string",
        description: "Media subtype",
        enum: ["image", "avatar", "icon", "video", "audio"],
        default: "image",
      },
      src: { type: "string", description: "URL for image/video/audio/avatar" },
      alt: { type: "string", description: "Alt text for images and avatars" },
      width: { type: "number", description: "Width in pixels" },
      height: { type: "number", description: "Height in pixels (video only)" },
      name: { type: "string", description: "Avatar name (for initials fallback) or icon name" },
      content: {
        type: "string",
        description:
          "Icon name from the built-in set (~170 Lucide icons, same as action.icon). " +
          "Alias for name prop when type is icon.",
      },
      size: { type: "string", description: "Size variant for avatars" },
      autoPlay: { type: "boolean", description: "Auto-play video/audio (default: false)" },
      loop: { type: "boolean", description: "Loop video/audio playback (default: false)" },
      muted: { type: "boolean", description: "Mute video/audio (default: false)" },
      controls: {
        type: "boolean",
        description: "Show playback controls (default: true for video/audio)",
        default: true,
      },
      volume: {
        type: "number",
        description: "Initial volume 0.0-1.0 (default: 1.0)",
      },
      poster: { type: "string", description: "Poster image URL for video" },
      fit: {
        type: "string",
        description: "Object-fit for video (cover, contain, fill, none)",
        enum: ["cover", "contain", "fill", "none"],
      },
    },
    events: [],
    containable: false,
    example: {
      id: "profile-pic",
      type: "media",
      props: { type: "avatar", src: "/img/user.jpg", name: "Alice", alt: "Profile" },
    },
  },

  overlay: {
    name: "overlay",
    category: "fundamental",
    description:
      "Modal dialog, toast notification, drawer, alert, confirm dialog, HUD, or choice selector. " +
      "Visibility controlled by node.state.open. Children render into the content area.",
    props: {
      mode: {
        type: "string",
        description: "Overlay subtype",
        enum: ["dialog", "toast", "drawer", "alert", "confirm", "hud", "choice"],
        default: "dialog",
      },
      title: { type: "string", description: "Title for dialog/alert/confirm/toast" },
      message: { type: "string", description: "Body text for toast/alert/confirm/hud" },
      intent: {
        type: "string",
        description: "Semantic intent affecting icon and button color",
        enum: ["info", "success", "warning", "error"],
      },
      icon: {
        type: "string",
        description: "Custom icon (emoji or string). Set false to hide. HUD default: spinner",
      },
      side: {
        type: "string",
        description: "Drawer position",
        enum: ["left", "right"],
        default: "right",
      },
      position: {
        type: "string",
        description: "Toast position on screen",
        default: "bottom-right",
      },
      duration: {
        type: "number",
        description: "Toast auto-dismiss in ms (0 = never). Default: 5000",
        default: 5000,
      },
      dismissible: {
        type: "boolean",
        description: "Show close button on toast",
        default: true,
      },
      confirmLabel: {
        type: "string",
        description: 'Confirm button text (default: "OK" for alert, "Confirm" for confirm)',
      },
      cancelLabel: {
        type: "string",
        description: 'Cancel button text for confirm/choice modes (default: "Cancel")',
      },
      subtitle: { type: "string", description: "Secondary text for HUD mode" },
      progress: {
        type: "number",
        description: "Progress bar value 0-100 for HUD mode",
      },
      steps: {
        type: "array",
        description:
          "Choice mode: array of step objects with { header, question, options, multiSelect, allowOther }. " +
          "Each option: { label, value?, description? }",
      },
      submitLabel: {
        type: "string",
        description: 'Choice final submit button text (default: "Submit")',
        default: "Submit",
      },
    },
    events: ["confirm", "cancel", "dismiss", "select"],
    containable: true,
    constraints:
      "Set node.state.open = true to show. " +
      "Toast auto-dismisses after duration ms. " +
      "Choice emits select with { selected, other } for single-step or { answers } for multi-step.",
    example: {
      id: "confirm-delete",
      type: "overlay",
      props: {
        mode: "confirm",
        title: "Delete item?",
        message: "This action cannot be undone.",
        intent: "error",
        confirmLabel: "Delete",
      },
      state: { open: true },
      events: {
        confirm: { exec: "/items/.actions/delete", args: { id: "123" } },
        cancel: { exec: "/ui/.actions/close-overlay" },
      },
    },
  },

  table: {
    name: "table",
    category: "fundamental",
    description:
      "Tabular data display with column definitions and row data. " +
      "Supports sort and row-select events.",
    props: {
      columns: {
        type: "array",
        description:
          "Column definitions: [{ key, label, align? }]. " +
          "key maps to row object fields. align: left/center/right.",
        required: true,
      },
      rows: {
        type: "array",
        description:
          "Array of row objects keyed by column key. " +
          'E.g. [{ name: "Alice", email: "alice@example.com" }]',
        required: true,
      },
    },
    events: ["sort", "select"],
    containable: false,
    constraints: "sort event fires on header click. select event fires on row click.",
    example: {
      id: "user-table",
      type: "table",
      props: {
        columns: [
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
          { key: "role", label: "Role", align: "center" },
        ],
        rows: [
          { name: "Alice", email: "alice@co.com", role: "Admin" },
          { name: "Bob", email: "bob@co.com", role: "User" },
        ],
      },
      events: {
        select: { exec: "/users/.actions/view", args: {} },
      },
    },
  },

  time: {
    name: "time",
    category: "fundamental",
    description:
      "Date/time display, live clock, analog clock, calendar, timer, countdown, or date picker. " +
      "Supports locale-aware formatting via Intl.DateTimeFormat.",
    props: {
      mode: {
        type: "string",
        description: "Display mode",
        enum: ["display", "clock", "timer", "countdown", "picker", "analog-clock", "calendar"],
        default: "display",
      },
      value: {
        type: "string",
        description: "ISO date string for display/picker modes",
      },
      format: {
        type: "object",
        description:
          "Intl.DateTimeFormat options object. " +
          'E.g. { dateStyle: "medium", timeStyle: "short" }',
      },
      locale: {
        type: "string",
        description: 'BCP 47 locale (e.g. "en-US", "zh-CN")',
      },
      target: {
        type: "string",
        description: "ISO date string for countdown target",
      },
      expiredLabel: {
        type: "string",
        description: 'Text when countdown finishes (default: "00:00")',
        default: "00:00",
      },
    },
    events: [],
    containable: false,
    example: {
      id: "clock-1",
      type: "time",
      props: { mode: "clock", locale: "en-US" },
    },
  },

  chart: {
    name: "chart",
    category: "fundamental",
    description:
      "Data visualization chart powered by Chart.js. " +
      "Supports line, bar, area, pie, doughnut, gauge, histogram. " +
      "Use node.src for live AFS data binding.",
    props: {
      variant: {
        type: "string",
        description: "Chart type",
        enum: ["line", "bar", "area", "pie", "doughnut", "gauge", "histogram"],
        default: "line",
      },
      height: { type: "string", description: "CSS height for chart container" },
      data: {
        type: "object",
        description:
          "Chart.js data object: { labels: string[], datasets: [{ label, data, borderColor, backgroundColor }] }",
      },
      labels: {
        type: "array",
        description: "Shorthand: label array (used if data prop is absent)",
      },
      datasets: {
        type: "array",
        description: "Shorthand: datasets array (used if data prop is absent)",
      },
    },
    events: [],
    containable: false,
    constraints:
      "Either provide data prop (Chart.js format) or labels+datasets shorthand. " +
      "Set node.src to an AFS path for live-updating data.",
    example: {
      id: "revenue-chart",
      type: "chart",
      props: {
        variant: "bar",
        data: {
          labels: ["Jan", "Feb", "Mar", "Apr"],
          datasets: [{ label: "Revenue", data: [120, 190, 150, 210], backgroundColor: "#60a5fa" }],
        },
      },
    },
  },

  map: {
    name: "map",
    category: "fundamental",
    description:
      "Geographic map with markers, powered by Leaflet. " +
      "Supports multiple tile styles. Use node.src for live marker data.",
    props: {
      center: {
        type: "array",
        description: "[latitude, longitude] for initial center (default: [0, 0])",
        default: [0, 0],
      },
      zoom: { type: "number", description: "Initial zoom level (default: 2)", default: 2 },
      tileStyle: {
        type: "string",
        description: "Map tile style preset",
        enum: [
          "carto-light",
          "carto-dark",
          "carto-voyager",
          "osm",
          "stamen-toner",
          "stamen-watercolor",
          "alidade-smooth",
          "alidade-dark",
        ],
        default: "carto-voyager",
      },
      height: { type: "string", description: 'CSS height (default: "300px")', default: "300px" },
      markers: {
        type: "array",
        description:
          "Array of marker objects: { lat, lng, label?, color?, intent?, radius?, size? }",
      },
      fitMarkers: {
        type: "boolean",
        description: "Auto-fit map bounds to show all markers",
      },
      variant: {
        type: "string",
        description: 'Set to "globe" for 3D globe rendering (dispatches to globe renderer)',
        enum: ["flat", "globe"],
        default: "flat",
      },
    },
    events: [],
    containable: false,
    constraints: "Set node.src to an AFS path for live-updating markers.",
    example: {
      id: "office-map",
      type: "map",
      props: {
        center: [37.7749, -122.4194],
        zoom: 12,
        tileStyle: "carto-dark",
        markers: [
          { lat: 37.7749, lng: -122.4194, label: "HQ", intent: "info" },
          { lat: 37.785, lng: -122.409, label: "Office 2", intent: "success" },
        ],
        fitMarkers: true,
      },
    },
  },

  calendar: {
    name: "calendar",
    category: "fundamental",
    description:
      "Calendar view displaying events by month, week, day, or agenda. " +
      "Client-side navigation between months.",
    props: {
      mode: {
        type: "string",
        description: "View mode",
        enum: ["month", "week", "day", "agenda"],
        default: "month",
      },
      events: {
        type: "array",
        description:
          'Array of event objects: { date: "YYYY-MM-DD", label: string, intent?: "info"|"success"|"warning"|"error" }',
      },
      locale: {
        type: "string",
        description: 'BCP 47 locale for month/day names (e.g. "en-US")',
      },
    },
    events: [],
    containable: false,
    example: {
      id: "schedule",
      type: "calendar",
      props: {
        mode: "month",
        events: [
          { date: "2024-03-15", label: "Team standup", intent: "info" },
          { date: "2024-03-20", label: "Release v2.0", intent: "success" },
        ],
      },
    },
  },

  "afs-list": {
    name: "afs-list",
    category: "fundamental",
    description:
      "AFS-bound universal data view. Two orthogonal dimensions: layout (spatial arrangement) " +
      "× itemStyle (per-item rendering). Binds to node.src, fetches via window.afs.list(), " +
      "subscribes for live updates. Pipeline: fetch → filter → sort → transform → render. " +
      "Kind-based rendering: meta.kind drives icon, badge, and CSS class per item.",
    props: {
      layout: {
        type: "string",
        description:
          "Spatial arrangement: list (vertical), grid (CSS grid), " +
          "masonry (CSS columns), slideshow (one-at-a-time), table (data table)",
        enum: ["list", "grid", "masonry", "slideshow", "table"],
        default: "list",
      },
      itemStyle: {
        type: "string",
        description:
          "Per-item rendering: row (icon+label+badge), card (image/icon+body), " +
          "compact (minimal), media (image-heavy overlay), hero (full-width feature)",
        enum: ["row", "card", "compact", "media", "hero"],
        default: "row",
      },
      gridCols: {
        type: "number",
        description: "Column count for grid/masonry layouts. Default 3.",
        default: 3,
      },
      minItemWidth: {
        type: "string",
        description:
          "Minimum item width for auto-fill grid (e.g., '200px', '15rem'). " +
          "When set, grid uses auto-fill with minmax() instead of fixed columns. " +
          "gridCols overrides minItemWidth (explicit > auto).",
      },
      imageFit: {
        type: "string",
        description:
          "How card/media/hero images are scaled within their container. " +
          "cover (default): aspect-fill, crops to fill (good for photos). " +
          "contain: aspect-fit, shows entire image with letterboxing (good for logos/icons). " +
          "fill: stretches to fill (rarely wanted).",
        enum: ["cover", "contain", "fill"],
        default: "cover",
      },
      imageHeight: {
        type: "string",
        description:
          "Height of card image area. String CSS value ('200px', '50%') or number (px). " +
          "Default 140px for card, auto for media/hero.",
      },
      imageShape: {
        type: "string",
        description:
          "Shape of card images. rect (default): rectangular banner. " +
          "circle: centered circular avatar — ideal for people/team directories.",
        enum: ["rect", "circle"],
        default: "rect",
      },
      pageSize: {
        type: "number",
        description:
          "Items per page for pagination. 0 = load all at once (default). " +
          "When set, fetches data in pages via offset/limit and shows 'Load more' button.",
        default: 0,
      },
      virtual: {
        type: "boolean",
        description:
          "Enable virtual scrolling. Only renders visible items + buffer. " +
          "Use for large datasets (100+ items). Default false.",
        default: false,
      },
      estimatedItemHeight: {
        type: "number",
        description: "Estimated height per item in pixels for virtual scroll. Default 48.",
        default: 48,
      },
      bufferItems: {
        type: "number",
        description:
          "Extra items to render above/below viewport in virtual scroll mode. Default 5.",
        default: 5,
      },
      variant: {
        type: "string",
        description: "Legacy layout variant (use layout instead). flat→list, grouped, table.",
        enum: ["flat", "grouped", "table"],
        default: "flat",
      },
      clickMode: {
        type: "string",
        description:
          "Click behavior: select emits select event, navigate drills into child path, " +
          "both = directories navigate and leaves select",
        enum: ["select", "navigate", "both"],
        default: "select",
      },
      labelField: {
        type: "string",
        description: "Dot-path into entry for display label (e.g. 'id', 'content.name')",
        default: "id",
      },
      descriptionField: {
        type: "string",
        description:
          "Dot-path into entry for secondary text (e.g. 'meta.description'). Set null to hide.",
        default: "meta.description",
      },
      emptyText: {
        type: "string",
        description: "Text shown when list has no items",
        default: "No items",
      },
      showBreadcrumb: {
        type: "boolean",
        description: "Show breadcrumb trail in navigate/both click modes",
        default: true,
      },
      kindIcons: {
        type: "object",
        description:
          'Override icons per kind: { "ts:task": "check", "fs:directory": "folder" }. ' +
          "Keys are meta.kind values, values are icon names from the built-in set.",
      },
      maxDepth: {
        type: "number",
        description:
          "Max nesting depth for grouped variant (0 = flat groups, 3 = default). " +
          "Prevents runaway recursion in deep AFS trees.",
        default: 3,
      },
      filter: {
        type: "object",
        description:
          "Filter entries before rendering. String = match id substring. " +
          'Object: { kind: "ts:task" }, { field: "content.status", match: "ready" }, ' +
          '{ exclude: ["daemon"] }.',
      },
      sort: {
        type: "object",
        description:
          'Sort entries. String = field name (e.g. "id"). ' +
          'Object: { field: "content.status", desc: true }.',
      },
      transform: {
        type: "object",
        description:
          "Remap display fields. Each key is a dot-path into entry. " +
          '{ label: "content.name", description: "content.summary", badge: "content.status" }.',
      },
      columns: {
        type: "array",
        description:
          'Column defs for table layout: [{ key: "id", label: "Name", format?: "truncate:16", align?: "right", width?: "100px" }]. ' +
          "Built-in formatters: truncate:{n}, timeago, datetime, number, number:{decimals}, bignum:{decimal}, boolean:{yes}:{no}, bytes, json.",
      },
      data: {
        type: "array",
        description:
          "Inline data entries (array of objects with id field). " +
          "When provided, takes priority over src — no AFS call is made. " +
          "Use for small static datasets (e.g., detail page field tables).",
      },
      searchable: {
        type: "boolean",
        description: "Show live search input that filters entries by id.",
        default: false,
      },
      searchPlaceholder: {
        type: "string",
        description: "Placeholder text for search input.",
        default: "Search...",
      },
    },
    events: ["select", "navigate", "expand", "collapse"],
    containable: true,
    constraints:
      "node.src must be an AFS path. Client fetches data via window.afs.list(src). " +
      "Two orthogonal dimensions: layout (list/grid/masonry/slideshow/table) × itemStyle (row/card/compact/media/hero). " +
      "Data pipeline: raw entries → filter → sort → transform → render. " +
      "Children with role='item' define a custom item template (overrides itemStyle). " +
      "Children with role='header' render once at top. Children with role='empty' render when no items. " +
      "Template binding: ${entry.id}, ${entry.meta.kind}, ${entry.content.field} — any string prop. " +
      "Three-layer template resolution: role='item' child > kind registry > built-in itemStyle. " +
      "select: { path, id, meta, content }. navigate: { path, id, meta, previousPath }. " +
      "expand/collapse: { path, id, childrenCount }. " +
      "variant is legacy — prefer layout + itemStyle. " +
      "Live subscription via window.afs.subscribe for automatic refresh on writes.",
    examples: [
      // 1. Basic: grid with built-in card style
      {
        id: "project-grid",
        type: "afs-list",
        src: "/teams/arcblock-core/workspaces/",
        props: {
          layout: "grid",
          itemStyle: "card",
          gridCols: 3,
          clickMode: "select",
          searchable: true,
          emptyText: "No workspaces",
        },
        events: {
          select: { exec: "/ui/.actions/navigate-workspace", args: {} },
        },
      },
      // 2. Pagination + self-sizing grid
      {
        id: "task-list",
        type: "afs-list",
        src: "/data/tasks",
        props: {
          layout: "grid",
          minItemWidth: "250px",
          pageSize: 12,
          searchable: true,
        },
      },
      // 3. Custom template with ${entry.field} binding
      {
        id: "team-members",
        type: "afs-list",
        src: "/teams/arcblock-core/members/",
        props: { layout: "grid", gridCols: 3, pageSize: 9 },
        children: [
          {
            id: "tpl-header",
            type: "view",
            props: { role: "header", layout: "row" },
            children: [
              { id: "th-icon", type: "media", props: { type: "icon", content: "users" } },
              { id: "th-text", type: "text", props: { content: "Team Members", level: 3 } },
            ],
          },
          {
            id: "tpl-item",
            type: "view",
            props: { role: "item", mode: "card" },
            children: [
              { id: "ti-name", type: "text", props: { content: "${entry.id}", level: 3 } },
              {
                id: "ti-role",
                type: "text",
                props: { content: "${entry.meta.kind}", format: "code", intent: "info" },
              },
              {
                id: "ti-desc",
                type: "text",
                props: { content: "${entry.content}", intent: "muted" },
              },
            ],
          },
          {
            id: "tpl-empty",
            type: "view",
            props: { role: "empty" },
            children: [
              {
                id: "te-text",
                type: "text",
                props: { content: "No members found", intent: "muted" },
              },
            ],
          },
        ],
      },
      // 4. Virtual scroll for large datasets
      {
        id: "log-viewer",
        type: "afs-list",
        src: "/data/logs",
        props: {
          layout: "list",
          itemStyle: "row",
          virtual: true,
          estimatedItemHeight: 48,
          bufferItems: 5,
        },
      },
    ],
    // Keep single example for backward compat with tools that read example (singular)
    example: {
      id: "project-grid",
      type: "afs-list",
      src: "/teams/arcblock-core/workspaces/",
      props: {
        layout: "grid",
        itemStyle: "card",
        gridCols: 3,
        clickMode: "select",
        searchable: true,
        emptyText: "No workspaces",
      },
      events: {
        select: { exec: "/ui/.actions/navigate-workspace", args: {} },
      },
    },
  },

  surface: {
    name: "surface",
    category: "fundamental",
    description:
      "Universal rendering surface — renders any AFS path or remote AUP endpoint inline. " +
      "AFS paths (src starting with /) are auto-resolved: directories render as afs-list, " +
      "files render as text/detail views. WebSocket URLs connect to remote AUP backends. " +
      "Shares parent theming. Supports capability negotiation and live data subscription.",
    props: {
      src: {
        type: "string",
        description:
          "AFS path or WebSocket URL. AFS paths (starting with /) are auto-resolved: " +
          "directories → afs-list, files → text/detail view, sessions → AUP passthrough. " +
          "WebSocket URLs (ws://, wss://) connect to remote AUP backends. " +
          "This is the universal surface — any AFS path is a renderable component.",
      },
      url: {
        type: "string",
        description:
          "WebSocket URL of remote AUP backend (legacy — prefer src which handles both). " +
          'Shorthand: ":3300" or "localhost:3300" auto-expands to ws://.',
      },
      capabilities: {
        type: "object",
        description:
          "Rendering constraints: { primitives?: string[] (only render these types), " +
          "maxWidth?: string (CSS max-width) }",
      },
      sizing: {
        type: "string",
        description:
          '"fixed" — fixed height, scrolls internally (default when height is set). ' +
          '"fit" — auto-sizes to content, constrained by minHeight/maxHeight. ' +
          "Default: fixed if height is set, fit otherwise.",
        default: "fit",
      },
      height: {
        type: "string",
        description: 'Fixed container height (CSS value). Implies sizing="fixed".',
      },
      minHeight: {
        type: "string",
        description: 'Minimum height in fit mode (CSS value, e.g. "100px")',
      },
      maxHeight: {
        type: "string",
        description:
          'Maximum height in fit mode (CSS value, e.g. "500px"). ' +
          "Content scrolls if it exceeds this. Useful for embedding devices in page flow.",
      },
      showStatus: {
        type: "boolean",
        description: "Show connection status dot (green=connected, red=error)",
        default: true,
      },
    },
    events: ["connect", "disconnect", "error"],
    containable: false,
    constraints:
      "For WebSocket sources: establishes a 2nd WebSocket to the remote AUP backend. " +
      "Events from nested nodes route to the device's WS, not the parent. " +
      "Auto-reconnects on disconnect with exponential backoff. " +
      "For AFS paths: introspects via window.afs.stat/list/read, auto-selects rendering strategy. " +
      "Checks .aup/ for provider-authored recipes before fallback. " +
      "Supports in-device navigation: clicking items navigates within the surface with breadcrumb. " +
      "Subscribes to path for live updates.",
    example: {
      id: "afs-surface",
      type: "surface",
      src: "/modules/smart-home",
      props: {
        showStatus: true,
        capabilities: { primitives: ["view", "text", "action", "chart"] },
      },
    },
  },

  agent: {
    name: "agent",
    category: "subsystem",
    description:
      "LLM-powered agent with AFS context awareness. " +
      "src determines tool scope — the agent can read/search within src and exec actions. " +
      "mode controls interaction form: chat (fixed panel), hud (floating overlay), bar (bottom command line).",
    props: {
      mode: {
        type: "string",
        description:
          "Interaction mode: chat (fixed panel), hud (floating overlay), bar (bottom single-line)",
        enum: ["chat", "hud", "bar"],
        default: "chat",
      },
      model: {
        type: "string",
        description: "LLM model ID (e.g. claude-haiku-4-5). Defaults to haiku.",
      },
      placeholder: {
        type: "string",
        description: "Input placeholder text",
        default: "Ask anything...",
      },
    },
    events: ["submit"],
    containable: false,
    constraints:
      "src prop determines the agent's tool scope: read ops on src/**, exec on src/**/.actions/**. " +
      "Each instance maintains independent message history keyed by sessionId + nodeId.",
    example: {
      id: "inbox-agent",
      type: "agent",
      src: "/inbox",
      props: { mode: "chat", placeholder: "Ask about your inbox..." },
    },
  },

  explorer: {
    name: "explorer",
    category: "subsystem",
    description:
      "AFS data browser with three-surface layout: folder view (afs-list), " +
      "item view (content preview), and inspector (metadata + actions). " +
      "src determines the root path to browse. Events handled internally by UI provider.",
    props: {
      showMeta: {
        type: "boolean",
        description: "Show metadata inspector panel",
        default: true,
      },
      showActions: {
        type: "boolean",
        description: "Show action buttons in inspector",
        default: true,
      },
    },
    events: ["select", "navigate"],
    containable: false,
    constraints:
      "Expands server-side into a panels WM with sidebar, primary, and inspector surfaces. " +
      "Events (file-select, action-exec, md-link-navigate) are handled internally by UI provider.",
    example: {
      id: "file-browser",
      type: "explorer",
      src: "/",
    },
  },
};
// ── Components (browser-only rich interactive) ──

export const COMPONENTS: Record<string, PrimitiveDef> = {
  moonphase: {
    name: "moonphase",
    category: "fundamental",
    description:
      "Moon phase visualization for a single date or full month grid. " +
      "Renders SVG moon with illumination and phase name.",
    props: {
      mode: {
        type: "string",
        description: '"today" shows single moon, "month" shows full month grid',
        enum: ["today", "month"],
        default: "today",
      },
      date: {
        type: "string",
        description: "ISO date string for target date (default: today)",
      },
      locale: { type: "string", description: "BCP 47 locale for date labels" },
    },
    events: [],
    containable: false,
    example: {
      id: "moon-1",
      type: "moonphase",
      props: { mode: "month", date: "2024-03-01" },
    },
  },

  xeyes: {
    name: "xeyes",
    category: "component",
    description:
      "Classic X11 xeyes widget. Eyes follow the mouse cursor. " +
      "Customizable eye count (2-12), size, iris color.",
    props: {
      eyes: {
        type: "number",
        description: "Number of eyes (2-12, default 2)",
        default: 2,
      },
      size: {
        type: "string",
        description: "Eye size",
        enum: ["sm", "md", "lg"],
        default: "md",
      },
      color: { type: "string", description: "Iris color (CSS color value)" },
      bg: { type: "string", description: "Eyeball background color" },
      title: {
        type: "string",
        description: 'Label text (default "xeyes", set false to hide)',
      },
    },
    events: [],
    containable: false,
    example: {
      id: "xeyes-1",
      type: "xeyes",
      props: { eyes: 2, size: "lg" },
    },
  },

  "natal-chart": {
    name: "natal-chart",
    category: "fundamental",
    description:
      "Astrological natal chart visualization powered by @astrodraw/astrochart. " +
      "Supports radix, transit overlay, aspects table, and planets table.",
    props: {
      variant: {
        type: "string",
        description: "Chart variant",
        enum: ["radix", "transit", "aspects-table", "planets-table"],
        default: "radix",
      },
      height: { type: "string", description: 'Container height (default: "500px")' },
      width: { type: "number", description: "Chart width in px (default: 500)" },
      size: { type: "number", description: "Render size in px (capped at 500)" },
      data: {
        type: "object",
        description:
          "Planet positions: { planets: { Sun: [degrees], Moon: [degrees], ... }, cusps: [12 house cusp values] }",
        required: true,
      },
      transitData: {
        type: "object",
        description: "Secondary planet data for transit variant overlay",
      },
      settings: {
        type: "object",
        description:
          "Chart styling overrides merged into astrochart config (e.g. COLOR_BACKGROUND)",
      },
    },
    events: [],
    containable: false,
    example: {
      id: "natal-1",
      type: "natal-chart",
      props: {
        variant: "radix",
        data: {
          planets: { Sun: [0], Moon: [180], Mercury: [45], Venus: [90] },
          cusps: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330],
        },
      },
    },
  },

  terminal: {
    name: "terminal",
    category: "component",
    description:
      "Terminal emulator. Connects to a terminal WebSocket endpoint via the " +
      "standard terminal protocol (output/line/clear/resize). " +
      "Renderer loads xterm.js and establishes an independent WebSocket — " +
      "AUP protocol is not extended. Compatible with AFS REPL, Docker exec, " +
      "SSH proxy, or any backend speaking the terminal WS protocol.",
    props: {
      endpoint: {
        type: "string",
        description:
          "WebSocket URL or path for terminal connection. " +
          "Relative paths resolve against current origin. " +
          "Absolute wss:// URLs connect directly.",
        required: true,
      },
      rows: {
        type: "number",
        description: "Visible rows (default 24)",
        default: 24,
      },
      cols: {
        type: "number",
        description: "Visible columns. Omit to auto-fit container width.",
      },
      readonly: {
        type: "boolean",
        description: "Read-only mode — display output only, disable input",
        default: false,
      },
      fontSize: {
        type: "number",
        description: "Font size in pixels (default 14)",
        default: 14,
      },
      fontFamily: {
        type: "string",
        description: "Font family (default: monospace system stack)",
      },
    },
    events: [],
    containable: false,
    constraints:
      "Renderer establishes its own WebSocket to props.endpoint. " +
      "Terminal protocol is independent of AUP. " +
      "Multiple terminal nodes can coexist, each with its own connection.",
    example: {
      id: "term-1",
      type: "terminal",
      props: { endpoint: "/ws/terminal", rows: 24 },
    },
  },

  editor: {
    name: "editor",
    category: "fundamental",
    description:
      "Code/text editor with syntax highlighting (highlight.js), " +
      "line numbers, and optional toolbar. Emits change events.",
    props: {
      language: {
        type: "string",
        description: 'Language ID for syntax highlighting (default: "text")',
        default: "text",
      },
      readOnly: { type: "boolean", description: "Make editor read-only, hide toolbar" },
      lineNumbers: {
        type: "boolean",
        description: "Show line number gutter (default: true)",
        default: true,
      },
      content: { type: "string", description: "Initial editor content" },
    },
    events: ["change"],
    containable: false,
    constraints: "change event payload: { content: string }",
    example: {
      id: "code-editor",
      type: "editor",
      props: {
        language: "javascript",
        content: 'console.log("hello");',
        lineNumbers: true,
      },
      events: {
        change: { exec: "/files/.actions/save", args: { path: "/src/main.js" } },
      },
    },
  },

  canvas: {
    name: "canvas",
    category: "fundamental",
    description:
      "Freeform drawing canvas with pen, eraser, and color tools. " +
      "Client-side only — no server events emitted.",
    props: {
      width: { type: "number", description: "Canvas pixel width (default: 800)", default: 800 },
      height: { type: "number", description: "Canvas pixel height (default: 400)", default: 400 },
      background: {
        type: "string",
        description: 'Fill color (default: "#ffffff")',
        default: "#ffffff",
      },
      strokeColor: {
        type: "string",
        description: 'Initial brush color (default: "#000000")',
        default: "#000000",
      },
      strokeWidth: { type: "number", description: "Initial brush size (default: 2)", default: 2 },
    },
    events: [],
    containable: false,
    example: {
      id: "whiteboard",
      type: "canvas",
      props: { width: 1024, height: 600, background: "#fafafa" },
    },
  },

  deck: {
    name: "deck",
    category: "fundamental",
    description:
      "Slide deck container with transitions, keyboard navigation, autoplay, and scoped visual design. " +
      "Each direct child becomes a slide. Rendered in Shadow DOM — custom design tokens (fonts, colors, " +
      "effects) never leak to the parent surface. Use designPreset for quick theming or design for " +
      "fine-grained control. Combined with live channels, enables broadcast presentations.",
    props: {
      transition: {
        type: "string",
        description: "Slide transition style",
        enum: ["fade", "slide", "zoom", "none"],
        default: "fade",
      },
      transitionDuration: {
        type: "number",
        description: "Transition duration in ms (default: 600)",
        default: 600,
      },
      autoPlay: {
        type: "boolean",
        description: "Auto-advance slides (default: false)",
        default: false,
      },
      autoPlayInterval: {
        type: "number",
        description: "Auto-advance interval in ms (default: 5000)",
        default: 5000,
      },
      loop: {
        type: "boolean",
        description: "Loop back to first slide after last (default: false)",
        default: false,
      },
      showControls: {
        type: "boolean",
        description: "Show prev/next navigation arrows (default: true)",
        default: true,
      },
      showProgress: {
        type: "boolean",
        description: "Show thin progress bar at bottom (default: true)",
        default: true,
      },
      keyboard: {
        type: "boolean",
        description: "Enable keyboard navigation (default: true)",
        default: true,
      },
      aspectRatio: {
        type: "string",
        description: "Deck aspect ratio",
        enum: ["16:9", "4:3", "auto"],
        default: "auto",
      },
      presentation: {
        type: "boolean",
        description: "Full-height slides for presentation mode (viewport height per slide)",
        default: false,
      },
      designPreset: {
        type: "string",
        description: "Named design preset for quick theming",
        enum: [
          "tech-dark",
          "corporate-clean",
          "keynote-dark",
          "gradient-dream",
          "neon-night",
          "warm-earth",
          "retro-terminal",
          "frosted-glass",
          "brutalist",
        ],
      },
      design: {
        type: "object",
        description:
          "Structured design tokens — overrides designPreset values. " +
          "fonts: { heading, body, mono, urls[] }. " +
          "colors: { bg, surface, text, accent, accentGlow, muted, gradient }. " +
          "effects: { slideBackground (solid|gradient|dots|grid|noise|aurora), " +
          "headingStyle (plain|gradient-text|glow), cardStyle (flat|glass|neon|bordered) }. " +
          "spacing: { slidePadding, gap, headingSize }.",
      },
    },
    events: ["change", "complete"],
    containable: true,
    constraints:
      "Each direct child is one slide. state.current (0-based) controls active slide. " +
      "Shadow DOM isolates deck styling — design tokens don't affect parent. " +
      "Keyboard: Left/Up=prev, Right/Down/Space=next, 1-9=jump, F=fullscreen, Escape=exit fullscreen.",
    example: {
      id: "launch-deck",
      type: "deck",
      props: {
        transition: "slide",
        designPreset: "tech-dark",
        design: { colors: { accent: "#e6b450" }, effects: { headingStyle: "gradient-text" } },
      },
      state: { current: 0 },
      children: [
        {
          id: "slide-1",
          type: "view",
          props: { layout: "column" },
          children: [
            {
              id: "s1-title",
              type: "text",
              props: { content: "Welcome", level: 1, animate: "fade-in" },
            },
          ],
        },
        {
          id: "slide-2",
          type: "view",
          props: { layout: "column" },
          children: [
            {
              id: "s2-title",
              type: "text",
              props: { content: "Key Metrics", level: 2, animate: "slide-up" },
            },
            { id: "s2-num", type: "text", props: { content: "1,234,567", animate: "count-up" } },
          ],
        },
      ],
      events: { change: { exec: "/analytics/.actions/track", args: { event: "slide-change" } } },
    },
  },

  frame: {
    name: "frame",
    category: "subsystem",
    description:
      "Sandboxed iframe for full-page isolation. AUP is the OS, pages are applications running inside it. " +
      "Supports both AFS page paths (/pages/:id) and external URLs. " +
      "Optional bridge script enables postMessage communication (toast, navigate, fetch).",
    props: {
      src: {
        type: "string",
        description: "URL or /pages/:id path to embed",
        required: true,
      },
      bridge: {
        type: "boolean",
        description: "Inject aup-bridge.js for postMessage communication (default: false)",
        default: false,
      },
      sandbox: {
        type: "string",
        description:
          'iframe sandbox attribute (default: "allow-scripts allow-forms allow-popups"). allow-same-origin is only honored for trusted bridge frames.',
        default: "allow-scripts allow-forms allow-popups",
      },
      size: {
        type: "object",
        description: "Sizing: { width: CSS string, height: CSS string }",
      },
      loading: {
        type: "string",
        description: "iframe loading strategy",
        enum: ["eager", "lazy"],
        default: "lazy",
      },
      fallback: {
        type: "string",
        description: "URL to show if page crashes or fails to load",
      },
      transparent: {
        type: "boolean",
        description: "Make iframe background transparent (for overlays on top of other content)",
        default: false,
      },
      overlay: {
        type: "boolean",
        description:
          "Float frame as a fixed viewport overlay (position:fixed, z-index:99999, pointer-events:none). " +
          "Escapes any parent stacking context — use for broadcast overlays on top of deck slides. " +
          "Implies transparent. The iframe content should handle its own positioning.",
        default: false,
      },
    },
    events: ["load", "error", "message"],
    containable: false,
    constraints:
      "AFS page paths are resolved to HTTP URLs (/p/:id?sid=...&st=...&bridge=1). " +
      "Bridge script provides window.aup.{emit, on, navigate, toast, fetch} API inside the iframe.",
    example: {
      id: "app-frame",
      type: "frame",
      props: {
        src: "/pages/dashboard",
        bridge: true,
        size: { height: "600px" },
      },
      events: {
        load: { exec: "/analytics/.actions/track", args: { event: "page-loaded" } },
      },
    },
  },

  ticker: {
    name: "ticker",
    category: "fundamental",
    description:
      "Continuously scrolling horizontal band for news headlines, stock prices, scores, alerts. " +
      "Three modes: scroll (infinite loop), flip (cycle items one at a time), static (no animation). " +
      "Supports intent colors (breaking, warning, success, info) and overlay-grid ticker region.",
    props: {
      mode: {
        type: "string",
        description: "Display mode",
        enum: ["scroll", "flip", "static"],
        default: "scroll",
      },
      intent: {
        type: "string",
        description: "Semantic intent for background color",
        enum: ["breaking", "warning", "success", "info"],
      },
      separator: {
        type: "string",
        description: 'Text separator between items in scroll/static modes (default: " • ")',
        default: " • ",
      },
      speed: {
        type: "number",
        description:
          "Scroll mode: pixels per second (default: 60). Flip mode: interval in ms (default: 4000).",
      },
      pauseOnHover: {
        type: "boolean",
        description: "Pause scroll animation on mouse hover (default: true)",
        default: true,
      },
      direction: {
        type: "string",
        description: "Scroll direction",
        enum: ["rtl", "ltr"],
        default: "rtl",
      },
      flipTransition: {
        type: "string",
        description: "Transition style for flip mode",
        enum: ["fade", "slide-up", "slide-left"],
        default: "fade",
      },
    },
    events: [],
    containable: true,
    constraints:
      "Children are rendered as ticker items. Scroll mode duplicates items in DOM for seamless loop. " +
      "Use region: 'ticker' in overlay-grid for broadcast overlays.",
    example: {
      id: "news-ticker",
      type: "ticker",
      props: { mode: "scroll", intent: "breaking", separator: " • " },
      children: [
        { id: "t1", type: "text", props: { content: "Breaking: Market hits all-time high" } },
        { id: "t2", type: "text", props: { content: "Tech stocks surge 5%" } },
        { id: "t3", type: "text", props: { content: "Fed holds rates steady" } },
      ],
    },
  },

  broadcast: {
    name: "broadcast",
    category: "fundamental",
    description:
      "Broadcast overlay graphics — agent specifies semantic roles (live-badge, headline, ticker, etc.) " +
      "and a theme. The renderer auto-expands roles into typed elements and places them in broadcast " +
      "regions. Equivalent to manually building an overlay-grid view but with ~70% fewer props. " +
      "Roles: live-badge, clock, viewer-count, alert, headline, hashtag, speaker-bar, lower-third, " +
      "data-widget, featured-comment, score-bug, logo, ticker.",
    props: {
      theme: {
        type: "string | object",
        description:
          'Overlay theme preset or custom object. Named presets: "minimal", "cnn", "apple". ' +
          'Custom: { badgeBg: "#ff6b00", cardRadius: "0" }.',
        enum: ["minimal", "cnn", "apple"],
      },
      background: {
        type: "string | object",
        description:
          "Background for the broadcast surface (gradient, image, video). " +
          "Same format as view.background.",
      },
    },
    events: [],
    containable: true,
    constraints:
      "Children use simplified schema: { role, text?, lines?, items?, at?, src?, children?, intent?, mode? }. " +
      "role determines the rendered type and default region. " +
      "'at' overrides default placement (e.g. 'top-end'). " +
      "text → simple text content. lines[] → multi-line view. items[] → ticker items. " +
      "src → media source (logo). children[] → passthrough AUP nodes.",
    example: {
      type: "broadcast",
      props: { theme: "cnn" },
      children: [
        { role: "live-badge", text: "\u25cf LIVE" },
        { role: "clock", text: "2:36 PM ET" },
        { role: "alert", text: "BREAKING NEWS" },
        { role: "headline", text: "MAJOR POLICY ANNOUNCEMENT EXPECTED TODAY" },
        {
          role: "ticker",
          items: ["Markets surge 2%", "Oil drops 3%", "Fed holds rates"],
          intent: "breaking",
        },
      ],
    },
  },

  rtc: {
    name: "rtc",
    category: "subsystem",
    description:
      "Real-time communication placeholder (WebRTC). " +
      "Implementation pending — reserved primitive name.",
    props: {},
    events: [],
    containable: false,
    constraints: "Not yet implemented. Reserved for future WebRTC integration.",
    example: {
      id: "rtc-1",
      type: "rtc",
    },
  },

  // ── Web-Device Widget Components ──
  // Bridge components: AUP nodes rendered via web-device widget JS.
  // Agent sends {type, props} → renderer outputs widget activation HTML.

  "webgl-hero": {
    name: "webgl-hero",
    category: "subsystem",
    description:
      "WebGL animated background with 24 shader modes. " +
      "Renders a full-bleed animated canvas. Children render as overlay content on top.",
    props: {
      mode: {
        type: "string",
        description: "Shader mode",
        enum: [
          "wave",
          "blob",
          "cube",
          "rings",
          "galaxy",
          "collapse",
          "landscape",
          "ocean",
          "aurora",
          "topo",
          "retrowave",
          "clouds",
          "crystal",
          "phantom",
          "lightcube",
          "reflect",
          "network",
          "gyroid",
          "tunnel",
          "metaball",
          "cubegrid",
          "abstract",
          "meshline",
          "marble",
        ],
        default: "wave",
      },
      speed: { type: "number", description: "Animation speed multiplier (0.1–3.0)", default: 1.0 },
      bg: { type: "string", description: "Background color (hex)", default: "#000000" },
      colors: { type: "string", description: "Custom color palette (space-separated hex values)" },
      opacity: { type: "number", description: "Canvas opacity 0–1", default: 1.0 },
      height: { type: "number", description: "Height in pixels", default: 400 },
      mouse: { type: "boolean", description: "Enable mouse interaction", default: true },
    },
    events: [],
    containable: true,
    constraints: "Children render as overlay content centered on top of the WebGL canvas.",
    example: {
      id: "hero-bg",
      type: "webgl-hero",
      props: { mode: "marble", speed: 0.6, bg: "#0d0d14", height: 500 },
    },
  },

  "type-block": {
    name: "type-block",
    category: "subsystem",
    description:
      "Animated typing effect with multiple modes (shuffle, typewriter) and cascade/fade effects. " +
      "Content is multi-line text that animates in character by character.",
    props: {
      content: {
        type: "string",
        description: "Multi-line text content (newline-separated lines)",
        required: true,
      },
      mode: {
        type: "string",
        description: "Animation mode",
        enum: ["shuffle", "typewriter", "decode", "glitch"],
        default: "shuffle",
      },
      effect: {
        type: "string",
        description: "Entry effect",
        enum: ["cascade", "fade", "slide", "none"],
        default: "cascade",
      },
    },
    events: [],
    containable: false,
    example: {
      id: "typing-hero",
      type: "type-block",
      props: {
        content: "AGENTIC FILE SYSTEM\nSemantic Primitives for AI Agents\nBuild · Mount · Render",
        mode: "shuffle",
        effect: "cascade",
      },
    },
  },

  "hero-widget": {
    name: "hero-widget",
    category: "subsystem",
    description:
      "Rich hero section with multiple layout styles (cube, grid, showcase, stack, timeline, orbit, tree). " +
      "Uses a DSL format for defining structured content blocks with colors and descriptions.",
    props: {
      title: { type: "string", description: "Hero title", required: true },
      desc: { type: "string", description: "Hero description" },
      style: {
        type: "string",
        description: "Layout style",
        enum: ["cube", "grid", "showcase", "stack", "timeline", "orbit", "tree"],
        default: "cube",
      },
      callout: {
        type: "string",
        description: "Callout position",
        enum: ["left", "right", "center"],
        default: "left",
      },
      dsl: {
        type: "string",
        description: "DSL content defining blocks (## Section, - Item | | | colors format)",
      },
      height: { type: "number", description: "Minimum height in pixels", default: 400 },
    },
    events: [],
    containable: false,
    example: {
      id: "platform-hero",
      type: "hero-widget",
      props: {
        title: "AFS Platform",
        desc: "Agentic File System",
        style: "cube",
        callout: "left",
        dsl: "## Core | | | #FFEE58 #FFCA28 #FFA000\nAFS Runtime\n- AFS Core | | | #FFEE58 #FFCA28 #FFA000\n> The kernel",
      },
    },
  },

  "photo-story": {
    name: "photo-story",
    category: "subsystem",
    description:
      "Visual storytelling component with scroll, slideshow, and autoplay modes. " +
      "Children are rendered as story slides/blocks.",
    props: {
      mode: {
        type: "string",
        description: "Display mode",
        enum: ["scroll", "slideshow", "autoplay"],
        default: "scroll",
      },
      theme: {
        type: "string",
        description: "Color theme",
        enum: ["dark", "light"],
        default: "dark",
      },
      interval: {
        type: "number",
        description: "Auto-advance interval in ms (slideshow/autoplay)",
        default: 6000,
      },
    },
    events: [],
    containable: true,
    constraints: "Children become story slides. Each child is wrapped in a slide container.",
    example: {
      id: "story-1",
      type: "photo-story",
      props: { mode: "slideshow", theme: "dark" },
      children: [
        {
          id: "s1",
          type: "view",
          props: { layout: "column" },
          children: [{ id: "s1-title", type: "text", props: { content: "Chapter 1", level: 2 } }],
        },
      ],
    },
  },

  "block-revealer": {
    name: "block-revealer",
    category: "subsystem",
    description:
      "Animated block reveal effect — a colored block slides across to reveal content underneath. " +
      "Children are the content to reveal.",
    props: {
      direction: {
        type: "string",
        description: "Reveal direction",
        enum: ["lr", "rl", "tb", "bt"],
        default: "lr",
      },
      color: { type: "string", description: "Block color (hex or CSS color)", default: "#000000" },
      duration: { type: "number", description: "Animation duration in ms", default: 500 },
      easing: {
        type: "string",
        description: "Easing function",
        enum: ["easeInOutQuint", "easeInOutCirc", "easeOutExpo", "easeInOutQuad"],
        default: "easeInOutQuint",
      },
      delay: { type: "number", description: "Delay before animation starts in ms", default: 0 },
      trigger: {
        type: "string",
        description: "When to trigger the animation",
        enum: ["load", "scroll"],
        default: "scroll",
      },
    },
    events: [],
    containable: true,
    constraints: "Children are the content revealed after the block animation completes.",
    example: {
      id: "reveal-1",
      type: "block-revealer",
      props: { direction: "lr", color: "#d4a843" },
      children: [{ id: "revealed-text", type: "text", props: { content: "Revealed!", level: 2 } }],
    },
  },

  "text-image-expand": {
    name: "text-image-expand",
    category: "subsystem",
    description:
      "Interactive text-over-image component that expands on hover/click. " +
      "Children should include a media node (image) and text nodes.",
    props: {},
    events: [],
    containable: true,
    constraints: "Expects children with at least one media (image) and text content.",
    example: {
      id: "expand-1",
      type: "text-image-expand",
      children: [
        {
          id: "e-img",
          type: "media",
          props: { src: "https://example.com/image.jpg", alt: "Preview" },
        },
        { id: "e-title", type: "text", props: { content: "Feature Title", level: 3 } },
        { id: "e-desc", type: "text", props: { content: "Description text" } },
      ],
    },
  },

  "text-highlight": {
    name: "text-highlight",
    category: "subsystem",
    description:
      "Animated text highlighting with reveal or glow modes. " +
      "Use ==double equals== in content to mark highlighted spans.",
    props: {
      content: {
        type: "string",
        description: "Text content with ==highlighted== spans marked by double equals signs",
        required: true,
      },
      mode: {
        type: "string",
        description: "Highlight animation mode",
        enum: ["reveal", "glow"],
        default: "reveal",
      },
    },
    events: [],
    containable: false,
    example: {
      id: "highlight-1",
      type: "text-highlight",
      props: {
        content:
          "The AUP defines a ==semantic node graph== where agents describe ==what to display==.",
        mode: "reveal",
      },
    },
  },

  "scroll-explainer": {
    name: "scroll-explainer",
    category: "subsystem",
    description:
      "Step-by-step scroll-driven explainer with text steps on the left and media on the right. " +
      "Children become numbered steps.",
    props: {
      height: { type: "number", description: "Minimum height in pixels", default: 400 },
    },
    events: [],
    containable: true,
    constraints:
      "Children become explainer steps. Each child is wrapped in a numbered step container.",
    example: {
      id: "explainer-1",
      type: "scroll-explainer",
      props: { height: 500 },
      children: [
        { id: "step1", type: "text", props: { content: "Step 1: Mount the provider", level: 3 } },
        { id: "step2", type: "text", props: { content: "Step 2: Read primitives", level: 3 } },
        { id: "step3", type: "text", props: { content: "Step 3: Render the tree", level: 3 } },
      ],
    },
  },

  "progress-bar-3d": {
    name: "progress-bar-3d",
    category: "subsystem",
    description:
      "CSS 3D progress bar with perspective, fill animation, striped/heat/dotted styles, and tooltips.",
    props: {
      value: { type: "number", description: "Progress value 0–100", required: true, default: 0 },
      color: {
        type: "string",
        description: "Bar color preset",
        enum: [
          "navy",
          "orange",
          "cyan",
          "red",
          "yellow",
          "dark",
          "green",
          "purple",
          "pink",
          "blue",
          "teal",
          "gold",
        ],
        default: "cyan",
      },
      style: {
        type: "string",
        description: "Bar style",
        enum: ["striped", "striped-fade", "striped-simple", "heat", "dotted", "hover"],
        default: "striped",
      },
      tooltip: {
        type: "string",
        description: "Tooltip color theme",
        enum: ["white", "pink", "heat", "none"],
        default: "white",
      },
      size: { type: "string", description: "Bar height (CSS value)", default: "3em" },
      label: { type: "string", description: "Custom label (default: {value}%)" },
    },
    events: [],
    containable: false,
    example: {
      id: "progress-1",
      type: "progress-bar-3d",
      props: { value: 75, color: "cyan", style: "striped", tooltip: "white", size: "3em" },
    },
  },

  wm: {
    name: "wm",
    category: "subsystem",
    description:
      "Window manager container. Children must be wm-surface nodes. " +
      "Supports strategies: single (tabbed), floating (desktop), panels (IDE layout). " +
      "Chrome styles: minimal (default, simple titlebar), macos (traffic-light buttons, rounded shadows), " +
      "windows (Win11-style rectangular buttons, square corners), xwindows (classic X11 look, beveled borders). " +
      "Set props.style to switch chrome (4 base + 5 Hollywood OS presets). " +
      "Set props.theme for fine-grained customization: " +
      "{ titlebarBg, titlebarText, borderColor, shadow, accentColor, surfaceBg, borderRadius, titlebarHeight, glowColor, glowIntensity, buttonBg, buttonHoverBg, fontFamily, fontSize, contentText }.",
    props: {
      strategy: {
        type: "string",
        description: "Layout strategy: single (tabbed), floating (desktop), panels (IDE layout)",
        enum: ["single", "floating", "panels"],
        default: "floating",
      },
      style: {
        type: "string",
        description:
          "Window chrome style. Base styles: minimal (simple titlebar), macos (traffic lights), " +
          "windows (Win11 buttons), xwindows (classic X11). " +
          "Presets: neon (cyan glow, dark), cyberpunk (angular pink/yellow), hacker (green terminal), " +
          "glass (frosted blur), retro (amber CRT), winamp (classic media player skin), matrix (digital rain).",
        enum: [
          "minimal",
          "macos",
          "windows",
          "xwindows",
          "neon",
          "cyberpunk",
          "hacker",
          "glass",
          "retro",
          "winamp",
          "matrix",
        ],
        default: "minimal",
      },
      theme: {
        type: "object",
        description:
          "Theme token overrides. Keys: titlebarBg, titlebarText, borderColor, shadow, " +
          "accentColor, surfaceBg, borderRadius, titlebarHeight (CSS height), " +
          "glowColor (glow/border color for neon preset), glowIntensity (multiplier, default 1), " +
          "buttonBg (button background), buttonHoverBg (button hover background), " +
          "fontFamily (CSS font-family for titlebar), fontSize (CSS font-size for titlebar), " +
          "contentText (text color for surface content area). " +
          "Each style has sensible defaults; these override them.",
      },
    },
    events: [],
    containable: true,
    constraints: "Children must be wm-surface nodes.",
    example: {
      id: "desktop",
      type: "wm",
      props: { strategy: "floating", style: "macos" },
      children: [
        { id: "win1", type: "wm-surface", props: { surfaceName: "editor", title: "Code Editor" } },
      ],
    },
    examples: [
      {
        label: "macOS-style desktop",
        value: {
          id: "desktop",
          type: "wm",
          props: { strategy: "floating", style: "macos" },
          children: [
            {
              id: "win1",
              type: "wm-surface",
              props: { surfaceName: "editor", title: "Code Editor" },
            },
          ],
        },
      },
      {
        label: "Dark themed Windows-style",
        value: {
          id: "desktop",
          type: "wm",
          props: {
            strategy: "floating",
            style: "windows",
            theme: { titlebarBg: "#1e1e1e", titlebarText: "#ccc", surfaceBg: "#252526" },
          },
          children: [
            {
              id: "win1",
              type: "wm-surface",
              props: { surfaceName: "terminal", title: "Terminal" },
            },
          ],
        },
      },
    ],
  },

  "wm-surface": {
    name: "wm-surface",
    category: "subsystem",
    description:
      "A window/surface inside a wm container. Supports desktop-widget mode: " +
      "set background/titlebar/closable/movable/resizable/interactive to false " +
      "for transparent, chromeless, fixed decoration widgets.",
    props: {
      surfaceName: { type: "string", description: "Unique surface identifier (required)" },
      title: { type: "string", description: "Title bar text" },
      position: {
        type: "object",
        description: "Initial position { x, y } in pixels (floating strategy)",
      },
      size: {
        type: "object",
        description: "Initial size { width, height } in pixels",
      },
      zIndex: { type: "number", description: "Stack order (higher = on top)" },
      docked: { type: "boolean", description: "Start in dock (minimized)", default: false },
      panel: { type: "string", description: "Panel assignment (panels strategy)" },
      background: {
        type: "boolean",
        description:
          "Show window background/border (default true). Set false for transparent decoration widgets.",
        default: true,
      },
      titlebar: {
        type: "boolean",
        description: "Show title bar (default true). Set false for chromeless widgets.",
        default: true,
      },
      closable: {
        type: "boolean",
        description: "Show close button in title bar (default true).",
        default: true,
      },
      movable: {
        type: "boolean",
        description:
          "Allow dragging to reposition (default true). Set false for fixed-position widgets.",
        default: true,
      },
      resizable: {
        type: "boolean",
        description: "Allow resize handle (default true). Set false for fixed-size widgets.",
        default: true,
      },
      interactive: {
        type: "boolean",
        description:
          "Accept pointer events (default true). Set false for pure visual decorations that don't respond to clicks.",
        default: true,
      },
      bleed: {
        type: "boolean",
        description:
          "Remove default content padding so content fills edge-to-edge. " +
          "Use for maps, video players, canvases, or any app that needs full bleed.",
        default: false,
      },
      chromeActions: {
        type: "array",
        description:
          "Custom buttons rendered in the titlebar chrome. " +
          "Array of { id, label, icon? }. Click fires a 'chrome-action' event with { action: id }.",
      },
      system: {
        type: "boolean",
        description: "System surface — cannot be re-opened or closed via actions.",
        default: false,
      },
    },
    events: ["close", "minimize", "maximize", "move", "resize", "undock", "chrome-action"],
    containable: true,
    constraints:
      "Children are inline AUP content rendered inside the surface. " +
      "Alternatively, set src prop to connect to a remote AUP device or AFS path.",
    example: {
      id: "widget-1",
      type: "wm-surface",
      props: {
        surfaceName: "decoration",
        title: "3D Progress",
        background: false,
        titlebar: false,
        resizable: false,
        position: { x: 100, y: 50 },
        size: { width: 300, height: 200 },
      },
      children: [
        {
          id: "pb",
          type: "progress-bar-3d",
          props: { value: 75, color: "cyan" },
        },
      ],
    },
  },
};
/** All registered types (primitives + components) for validation. */
export const ALL_TYPES: Record<string, PrimitiveDef> = { ...PRIMITIVES, ...COMPONENTS };

// ── Themes ──

export const THEMES: Record<string, ThemeDef> = {
  midnight: {
    name: "midnight",
    description: "Dark theme with deep blues and high contrast",
    tokens: {
      "color-bg": "#0f1729",
      "color-surface": "#1a2332",
      "color-border": "#2a3a4a",
      "color-text": "#e2e8f0",
      "color-accent": "#60a5fa",
      "color-dim": "#94a3b8",
    },
  },
  clean: {
    name: "clean",
    description: "Minimal light theme with crisp whites",
    tokens: {
      "color-bg": "#ffffff",
      "color-surface": "#f8fafc",
      "color-border": "#e2e8f0",
      "color-text": "#1e293b",
      "color-accent": "#3b82f6",
      "color-dim": "#64748b",
    },
  },
  glass: {
    name: "glass",
    description: "Translucent glassmorphism style",
    tokens: {
      "color-bg": "rgba(15,23,42,0.8)",
      "color-surface": "rgba(30,41,59,0.6)",
      "color-border": "rgba(148,163,184,0.2)",
      "color-text": "#e2e8f0",
      "color-accent": "#818cf8",
      "color-dim": "#94a3b8",
    },
  },
  brutalist: {
    name: "brutalist",
    description: "Raw, high-contrast brutalist aesthetic",
    tokens: {
      "color-bg": "#000000",
      "color-surface": "#111111",
      "color-border": "#333333",
      "color-text": "#ffffff",
      "color-accent": "#ff0000",
      "color-dim": "#888888",
    },
  },
  soft: {
    name: "soft",
    description: "Gentle pastels and rounded forms",
    tokens: {
      "color-bg": "#fef7f0",
      "color-surface": "#fff5eb",
      "color-border": "#fed7aa",
      "color-text": "#451a03",
      "color-accent": "#f97316",
      "color-dim": "#9a3412",
    },
  },
  cyber: {
    name: "cyber",
    description: "Neon cyberpunk with electric greens",
    tokens: {
      "color-bg": "#0a0a0a",
      "color-surface": "#111111",
      "color-border": "#1a3a1a",
      "color-text": "#00ff41",
      "color-accent": "#00ff41",
      "color-dim": "#4ade80",
    },
  },
  editorial: {
    name: "editorial",
    description: "Magazine-style typography-focused theme",
    tokens: {
      "color-bg": "#fafaf9",
      "color-surface": "#f5f5f4",
      "color-border": "#d6d3d1",
      "color-text": "#1c1917",
      "color-accent": "#dc2626",
      "color-dim": "#78716c",
    },
  },
  aurora: {
    name: "aurora",
    description: "Cosmic northern lights with flowing gradients",
    tokens: {
      "color-bg": "#0a0e1a",
      "color-surface": "#111827",
      "color-border": "#1e293b",
      "color-text": "#e8edf5",
      "color-accent": "#ff1493",
      "color-dim": "#8892a8",
    },
  },
  classic: {
    name: "classic",
    description: "Corporate tech with indigo and cyan",
    tokens: {
      "color-bg": "#0B1120",
      "color-surface": "#131C2E",
      "color-border": "#1E293B",
      "color-text": "#E2E8F0",
      "color-accent": "#22D3EE",
      "color-dim": "#94A3B8",
    },
  },
  cyberpunk: {
    name: "cyberpunk",
    description: "Neon scanlines sci-fi with magenta and cyan",
    tokens: {
      "color-bg": "#050510",
      "color-surface": "#0A0A1A",
      "color-border": "#1A1A3A",
      "color-text": "#E0E0FF",
      "color-accent": "#FF00AA",
      "color-dim": "#8888AA",
    },
  },
  dark: {
    name: "dark",
    description: "Simple dark mode override",
    tokens: {
      "color-bg": "#0a0a0a",
      "color-surface": "#161616",
      "color-border": "#2a2a2a",
      "color-text": "#e8e8e8",
      "color-accent": "#5B9BF0",
      "color-dim": "#a3a3a3",
    },
  },
  default: {
    name: "default",
    description: "Minimal black and white with serif accents",
    tokens: {
      "color-bg": "#FFFFFF",
      "color-surface": "#FAFAFA",
      "color-border": "#E8E8E8",
      "color-text": "#171717",
      "color-accent": "#1E6FD9",
      "color-dim": "#737373",
    },
  },
  hackernews: {
    name: "hackernews",
    description: "HackerNews-inspired monospace geek aesthetic",
    tokens: {
      "color-bg": "#F6F6EF",
      "color-surface": "#FFFFFF",
      "color-border": "#000000",
      "color-text": "#000000",
      "color-accent": "#FF6600",
      "color-dim": "#666666",
    },
  },
  magazine: {
    name: "magazine",
    description: "Warm print magazine with burgundy tones",
    tokens: {
      "color-bg": "#FFFDF7",
      "color-surface": "#F7F3ED",
      "color-border": "#E0D8CC",
      "color-text": "#1C1C1C",
      "color-accent": "#8B1A3A",
      "color-dim": "#6B6B6B",
    },
  },
  mono: {
    name: "mono",
    description: "Extreme minimalist monospace with green accent",
    tokens: {
      "color-bg": "#000000",
      "color-surface": "#111111",
      "color-border": "#222222",
      "color-text": "#ffffff",
      "color-accent": "#00ff88",
      "color-dim": "#888888",
    },
  },
  neubrutal: {
    name: "neubrutal",
    description: "Neo-brutalist with bold yellow and hard shadows",
    tokens: {
      "color-bg": "#FFDE59",
      "color-surface": "#FFFFFF",
      "color-border": "#000000",
      "color-text": "#000000",
      "color-accent": "#FF5757",
      "color-dim": "#333333",
    },
  },
  opus: {
    name: "opus",
    description: "Premium editorial with lime green on dark",
    tokens: {
      "color-bg": "#0a0a0f",
      "color-surface": "#1a1a25",
      "color-border": "rgba(255,255,255,0.06)",
      "color-text": "#e8e6f0",
      "color-accent": "#c4f04d",
      "color-dim": "#8b89a0",
    },
  },
  organic: {
    name: "organic",
    description: "Eco-friendly natural with forest green",
    tokens: {
      "color-bg": "#FAF7F2",
      "color-surface": "#F0EDE5",
      "color-border": "#C5D5B5",
      "color-text": "#1A3A1A",
      "color-accent": "#8B6914",
      "color-dim": "#5D6B5D",
    },
  },
  terminal: {
    name: "terminal",
    description: "Retro CRT terminal with phosphor green",
    tokens: {
      "color-bg": "#0A0A0A",
      "color-surface": "#0D1A0D",
      "color-border": "#003300",
      "color-text": "#00CC33",
      "color-accent": "#00CCFF",
      "color-dim": "#008822",
    },
  },
  vaporwave: {
    name: "vaporwave",
    description: "Neon pink retro-futurism aesthetic",
    tokens: {
      "color-bg": "#0d0221",
      "color-surface": "#150535",
      "color-border": "#2d1b69",
      "color-text": "#e0d4f7",
      "color-accent": "#01cdfe",
      "color-dim": "#9b8bb4",
    },
  },
};

// ── Overlay Themes ──

/** A single overlay example — complete AUP tree agents can read and adapt. */
export interface OverlayExample {
  name: string;
  description: string;
  /** Complete AUP node tree — paste into a page and change text. */
  tree: Record<string, unknown>;
}

export interface OverlayThemeDef {
  name: string;
  description: string;
  fonts: string[];
  roles: string[];
  vars: Record<string, string>;
  examples: OverlayExample[];
}

const OVERLAY_ROLES = [
  "live-badge",
  "clock",
  "viewer-count",
  "speaker-bar",
  "hashtag",
  "logo",
  "data-widget",
  "alert",
  "headline",
  "featured-comment",
  "score-bug",
  "lower-third",
  "ticker-item",
];

export const OVERLAY_THEMES: Record<string, OverlayThemeDef> = {
  minimal: {
    name: "minimal",
    description: "Clean default — translucent cards and badges, system fonts",
    fonts: [],
    roles: OVERLAY_ROLES,
    vars: {
      "--overlay-badge-bg": "rgba(0,0,0,0.6)",
      "--overlay-badge-color": "#fff",
      "--overlay-badge-radius": "6px",
      "--overlay-card-bg": "rgba(0,0,0,0.5)",
      "--overlay-card-radius": "8px",
      "--overlay-glass-blur": "8px",
      "--overlay-lower-bg": "rgba(0,0,0,0.5)",
      "--overlay-lower-radius": "8px",
      "--overlay-ticker-bg": "rgba(0,0,0,0.6)",
      "--overlay-alert-bg": "rgba(220,38,38,0.8)",
      "--overlay-score-bg": "rgba(0,0,0,0.7)",
      "--overlay-score-radius": "6px",
    },
    examples: [
      {
        name: "livestream",
        description: "Simple livestream overlay — LIVE badge, viewer count, clock",
        tree: {
          type: "view",
          props: { layout: "overlay-grid", theme: "minimal" },
          children: [
            {
              type: "text",
              props: { mode: "badge", role: "live-badge", region: "top-start" },
              text: "● LIVE",
            },
            {
              type: "text",
              props: { role: "viewer-count", region: "top-center" },
              text: "👁 1,234",
            },
            { type: "text", props: { role: "clock", region: "top-end" }, text: "14:36" },
            {
              type: "view",
              props: { role: "speaker-bar", region: "lower-start" },
              children: [
                { type: "text", text: "Jane Smith" },
                { type: "text", text: "Product Manager, ArcBlock" },
              ],
            },
          ],
        },
      },
    ],
  },
  cnn: {
    name: "cnn",
    description:
      "Hard-edge news broadcast — red accents, Barlow Condensed, yellow alerts, sharp corners",
    fonts: ["Barlow Condensed"],
    roles: OVERLAY_ROLES,
    vars: {
      "--overlay-badge-bg": "#cc0000",
      "--overlay-badge-color": "#fff",
      "--overlay-badge-radius": "2px",
      "--overlay-card-bg": "rgba(0,0,0,0.85)",
      "--overlay-card-border": "3px solid #cc0000",
      "--overlay-card-radius": "0",
      "--overlay-glass-blur": "0",
      "--overlay-lower-bg": "#cc0000",
      "--overlay-lower-radius": "0",
      "--overlay-ticker-bg": "#111",
      "--overlay-alert-bg": "#fbbf24",
      "--overlay-alert-color": "#111",
      "--overlay-score-bg": "#1a1a1a",
      "--overlay-score-radius": "0",
    },
    examples: [
      {
        name: "breaking-news",
        description: "CNN breaking news — red BREAKING NEWS bar, white headline, crawl ticker",
        tree: {
          type: "view",
          props: { layout: "overlay-grid", theme: "cnn" },
          children: [
            {
              type: "text",
              props: { mode: "badge", role: "live-badge", region: "top-start" },
              text: "● LIVE",
            },
            { type: "text", props: { role: "clock", region: "top-end" }, text: "2:36 PM ET" },
            {
              type: "text",
              props: { role: "alert", region: "lower-start" },
              text: "BREAKING NEWS",
            },
            {
              type: "text",
              props: { role: "headline", region: "lower-center" },
              text: "MAJOR POLICY ANNOUNCEMENT EXPECTED FROM WHITE HOUSE TODAY",
            },
            {
              type: "view",
              props: { region: "ticker" },
              children: [
                {
                  type: "ticker",
                  props: { intent: "breaking" },
                  children: [
                    { type: "text", text: "Stock markets surge as Fed signals rate pause" },
                    { type: "text", text: "Oil prices drop 3% on surprise inventory build" },
                    { type: "text", text: "European markets close mixed amid uncertainty" },
                  ],
                },
              ],
            },
          ],
        },
      },
      {
        name: "interview",
        description: "CNN interview — speaker name bar, topic headline, live badge",
        tree: {
          type: "view",
          props: { layout: "overlay-grid", theme: "cnn" },
          children: [
            {
              type: "text",
              props: { mode: "badge", role: "live-badge", region: "top-start" },
              text: "● LIVE",
            },
            { type: "text", props: { role: "clock", region: "top-end" }, text: "3:15 PM ET" },
            {
              type: "view",
              props: { role: "speaker-bar", region: "lower-start" },
              children: [
                { type: "text", text: "JOHN DOE" },
                { type: "text", text: "Senior Policy Advisor" },
              ],
            },
            {
              type: "text",
              props: { role: "headline", region: "lower-center" },
              text: "INFRASTRUCTURE BILL DEBATE CONTINUES IN SENATE",
            },
            {
              type: "view",
              props: { region: "ticker" },
              children: [
                {
                  type: "ticker",
                  children: [
                    { type: "text", text: "DOW +0.8% • S&P +1.2% • NASDAQ +1.5%" },
                    { type: "text", text: "10Y Treasury yield at 4.25%" },
                  ],
                },
              ],
            },
          ],
        },
      },
      {
        name: "election",
        description: "CNN election night — score bug with candidate tallies, alert banner",
        tree: {
          type: "view",
          props: { layout: "overlay-grid", theme: "cnn" },
          children: [
            {
              type: "text",
              props: { mode: "badge", role: "live-badge", region: "top-start" },
              text: "● ELECTION NIGHT",
            },
            { type: "text", props: { role: "clock", region: "top-end" }, text: "9:45 PM ET" },
            {
              type: "view",
              props: { role: "score-bug", region: "mid-end" },
              children: [
                { type: "text", text: "SMITH (D) — 214" },
                { type: "text", text: "JONES (R) — 198" },
                { type: "text", text: "270 TO WIN" },
              ],
            },
            {
              type: "text",
              props: { role: "alert", region: "lower-start" },
              text: "KEY RACE ALERT",
            },
            {
              type: "text",
              props: { role: "headline", region: "lower-center" },
              text: "POLLS CLOSING IN FIVE KEY SWING STATES",
            },
            {
              type: "view",
              props: { region: "ticker" },
              children: [
                {
                  type: "ticker",
                  children: [
                    { type: "text", text: "Florida: 52% reporting — too close to call" },
                    { type: "text", text: "Pennsylvania: 38% reporting — too early to call" },
                    { type: "text", text: "Arizona: polls close in 15 minutes" },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
  },
  apple: {
    name: "apple",
    description: "Frosted glass premium — dark glass on any background, Inter font, large radii",
    fonts: ["Inter"],
    roles: OVERLAY_ROLES,
    vars: {
      "--overlay-badge-bg": "rgba(0,0,0,0.35)",
      "--overlay-badge-color": "#fff",
      "--overlay-badge-radius": "20px",
      "--overlay-card-bg": "rgba(0,0,0,0.25)",
      "--overlay-card-border": "1px solid rgba(255,255,255,0.15)",
      "--overlay-card-radius": "16px",
      "--overlay-glass-blur": "20px",
      "--overlay-lower-bg": "rgba(0,0,0,0.25)",
      "--overlay-lower-radius": "16px",
      "--overlay-ticker-bg": "rgba(0,0,0,0.2)",
      "--overlay-alert-bg": "rgba(220,38,38,0.6)",
      "--overlay-score-bg": "rgba(0,0,0,0.25)",
      "--overlay-score-radius": "12px",
    },
    examples: [
      {
        name: "keynote",
        description: "Apple keynote — speaker name pill, topic card, minimal chrome",
        tree: {
          type: "view",
          props: { layout: "overlay-grid", theme: "apple" },
          children: [
            {
              type: "text",
              props: { mode: "badge", role: "live-badge", region: "top-end" },
              text: "● LIVE",
            },
            {
              type: "view",
              props: { role: "speaker-bar", region: "lower-start" },
              children: [
                { type: "text", text: "Craig Federighi" },
                { type: "text", text: "SVP Software Engineering" },
              ],
            },
            {
              type: "view",
              props: { role: "lower-third", region: "lower-center" },
              children: [
                { type: "text", text: "Introducing Intelligence Everywhere" },
                { type: "text", text: "Apple Intelligence comes to every device" },
              ],
            },
          ],
        },
      },
      {
        name: "product-showcase",
        description: "Apple product reveal — clean stats, frosted glass data widgets",
        tree: {
          type: "view",
          props: { layout: "overlay-grid", theme: "apple" },
          children: [
            {
              type: "text",
              props: { mode: "badge", role: "live-badge", region: "top-end" },
              text: "● LIVE",
            },
            {
              type: "view",
              props: { role: "data-widget", region: "mid-end" },
              children: [
                { type: "text", text: "M4 Ultra" },
                { type: "text", text: "32-core CPU • 80-core GPU" },
                { type: "text", text: "192 GB Unified Memory" },
              ],
            },
            {
              type: "view",
              props: { role: "lower-third", region: "lower-center" },
              children: [
                { type: "text", text: "Mac Pro with M4 Ultra" },
                { type: "text", text: "The most powerful Mac ever" },
              ],
            },
            {
              type: "view",
              props: { region: "ticker" },
              children: [
                {
                  type: "ticker",
                  children: [
                    { type: "text", text: "Available starting at $6,999" },
                    { type: "text", text: "Order today, ships next week" },
                    { type: "text", text: "Trade-in values up to $2,000" },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
  },
};

// ── Composable Style System (derived from @aigne/afs-aup) ──

export const STYLE_TONES: Record<string, StyleToneSummary> = Object.fromEntries(
  Object.entries(AUP_TONES).map(([k, v]) => [
    k,
    {
      name: v.name,
      description: v.description,
      character: v.character,
      useWhen: v.useWhen,
      avoidWhen: v.avoidWhen,
      tokens: v.base,
    },
  ]),
);

export const STYLE_PALETTES: Record<string, StylePaletteSummary> = Object.fromEntries(
  Object.entries(AUP_PALETTES).map(([k, v]) => [
    k,
    {
      name: v.name,
      description: v.description,
      mood: v.mood,
      dark: v.dark,
      light: v.light,
    },
  ]),
);

export const STYLE_RECIPES: Record<string, StyleRecipeSummary> = Object.fromEntries(
  Object.entries(AUP_RECIPES).map(([k, v]) => [
    k,
    {
      name: v.name,
      tone: v.tone,
      palette: v.palette,
      description: v.description,
      useWhen: v.useWhen,
    },
  ]),
);
