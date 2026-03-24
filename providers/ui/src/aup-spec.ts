/**
 * AUP (Agentic UI Protocol) — Document Spec + Examples.
 *
 * The spec defines the wire format for AUP documents.
 * Examples provide complete, working AUP documents that agents
 * can pattern-match from.
 */

// ── AUP Document Spec ──

export const AUP_SPEC = {
  version: "0.4",
  title: "Agentic UI Protocol (AUP) — Document Specification",
  description:
    "AUP is a semantic node graph for structured UI rendering. " +
    "An agent writes an AUP document (a tree of components) to create any UI. " +
    "The runtime renders the tree, handles events, and manages live data updates.",

  documentFormat: {
    description:
      "An AUP document is a JSON object written to a session tree or rendered via aup_render action.",
    fields: {
      id: {
        type: "string",
        required: true,
        description: "Unique node identifier. Must be unique across the entire tree.",
      },
      type: {
        type: "string",
        required: true,
        description:
          "Primitive name from the registry. Read /primitives to see all available types.",
      },
      props: {
        type: "object",
        required: false,
        description:
          "Primitive-specific attributes. Read /primitives/:name for full props schema of each type.",
      },
      src: {
        type: "string",
        required: false,
        description:
          "AFS path for read-only data binding. The client reads this path on mount and " +
          "subscribes for live updates. Supported by: chart, map, moonphase.",
      },
      bind: {
        type: "string",
        required: false,
        description:
          "AFS path for read-write data binding. Primarily used with input types — " +
          "value changes are written back to this path.",
      },
      state: {
        type: "object",
        required: false,
        description:
          "UI-local state. Used for: overlay.open (boolean), input value (state.value), " +
          "text heading level (state.level). State is maintained client-side.",
      },
      events: {
        type: "object",
        required: false,
        description:
          "Event bindings. Each key is an event name (click, change, send, sort, select, " +
          "confirm, cancel, dismiss). Two modes: " +
          "(1) exec mode: { exec: '/afs/path', args: {} } — triggers AFS exec server-side. " +
          "(2) target mode: { target: 'nodeId', set: { src, props, state } } — directly " +
          "updates another node's properties. Supports $args.* placeholders resolved from " +
          "event data. Example: { target: 'primary', set: { src: '$args.path' } } updates " +
          "the target surface's src when a list item is selected. " +
          "Special target '_root' with set.page navigates to a named page: " +
          "{ target: '_root', set: { page: 'pageName' } }. " +
          "(deprecated) { page: 'pageName' } — legacy page mode, internally converted to " +
          "target '_root'. Still works but emits a deprecation warning.",
      },
      children: {
        type: "array",
        required: false,
        description:
          "Child component nodes. Only containable primitives accept children: " +
          "view, overlay, chat, deck, ticker, frame (via iframe), unknown.",
      },
      region: {
        type: "string",
        required: false,
        description:
          "Universal prop — overlay-grid placement region. " +
          "Values: top-start, top-center, top-end, mid-start, mid-center, mid-end, " +
          "lower-start, lower-center, lower-end, ticker, bottom-start, bottom-center, bottom-end.",
      },
      role: {
        type: "string",
        required: false,
        description:
          "Universal prop — broadcast semantic role for overlay theme styling. " +
          "The role declares WHAT the element is; the overlay theme handles HOW it looks. " +
          "Roles: live-badge, clock, viewer-count, speaker-bar, hashtag, logo, " +
          "data-widget, alert, featured-comment, score-bug, lower-third, ticker-item.",
      },
    },
  },

  spatialIntent: {
    description:
      "Fine-grained layout control for view containers. " +
      "Pass an object as the layout prop instead of a string.",
    fields: {
      direction: {
        type: "string",
        enum: ["row", "column", "grid", "stack", "overlay-grid"],
        description:
          "row = horizontal flex, column = vertical flex (default), " +
          "grid = auto-fill responsive grid, stack = all children layered on top of each other, " +
          "overlay-grid = 15-region broadcast band system (TV industry standard) with pointer-events passthrough.",
      },
      align: {
        type: "string",
        enum: ["start", "center", "end", "stretch"],
        description: "Main axis alignment",
      },
      crossAlign: {
        type: "string",
        enum: ["start", "center", "end", "stretch"],
        description: "Cross axis alignment",
      },
      gap: { type: "number | string", description: "Gap between children in px or CSS value" },
      wrap: { type: "boolean", description: "Allow flex wrapping" },
      overflow: { type: "string", enum: ["visible", "hidden", "scroll", "auto"] },
    },
    example: {
      layout: {
        direction: "row",
        align: "center",
        crossAlign: "center",
        gap: 16,
        wrap: true,
      },
    },
  },

  sizing: {
    description: "Sizing constraints via the view.props.size object.",
    fields: {
      width: { type: "string", description: 'CSS width (e.g. "100%", "400px")' },
      maxWidth: { type: "string", description: 'CSS max-width (e.g. "800px")' },
      height: { type: "string", description: "CSS height" },
      flex: { type: "string", description: 'CSS flex shorthand (e.g. "1", "0 0 auto")' },
    },
  },

  themeTokens: {
    description:
      "Themes provide color tokens. Set the theme in the aup_render action " +
      "(style param) or page meta. Read /themes/:name for available tokens.",
    availableTokens: ["bg", "surface", "border", "text", "accent", "muted"],
  },

  overlayThemes: {
    description:
      "Overlay themes are broadcast 'graphics packages' for overlay-grid layouts. " +
      "Like TV graphics (CNN vs ESPN vs Apple Keynote), they control the visual identity " +
      "of overlay elements. Agents declare semantic roles (WHAT), themes handle styling (HOW). " +
      "Set theme prop on a view with layout: 'overlay-grid' to activate.",
    presets: {
      minimal: "Default — subtle glass effects, system fonts. Works with any content underneath.",
      cnn:
        "CNN Breaking News — red-dominant, bold condensed type (Barlow Condensed), sharp corners, " +
        "high-contrast badges. Loads font on demand.",
      apple:
        "Apple Keynote — frosted glass, large radii, Inter font, premium feel, " +
        "generous padding. Loads font on demand.",
    },
    roles: [
      "live-badge — LIVE indicator, recording status",
      "clock — time display with tabular-nums",
      "viewer-count — audience/viewer counter",
      "speaker-bar — name + title card for current speaker",
      "hashtag — event hashtag or topic tag",
      "logo — brand logo placement",
      "data-widget — live data card (stats, weather, stocks)",
      "alert — breaking/urgent notification",
      "featured-comment — highlighted audience comment",
      "score-bug — sports score compact display",
      "lower-third — TV-standard name/title bar",
      "ticker-item — individual ticker content item",
    ],
    customTheme:
      "Pass an object instead of a string for custom themes: " +
      '{ badgeBg: "#ff6b00", cardRadius: "0", fonts: ["CustomFont:wght@400;700"] }. ' +
      "camelCase keys are mapped to --overlay-* CSS variables.",
    example: {
      id: "themed-overlay",
      type: "view",
      props: { layout: "overlay-grid", theme: "cnn" },
      children: [
        {
          id: "live",
          type: "text",
          props: { region: "top-start", role: "live-badge", content: "\u25cf LIVE" },
        },
        {
          id: "speaker",
          type: "view",
          props: { region: "lower-start", role: "speaker-bar", layout: "column" },
          children: [
            { id: "sp-name", type: "text", props: { content: "Jane Doe" } },
            { id: "sp-title", type: "text", props: { content: "CEO, Acme Corp", scale: "xs" } },
          ],
        },
      ],
    },
  },

  i18n: {
    description:
      "AUP supports internationalization via server-side $t() resolution. " +
      "Translation is transparent to the agent — use $t(key) in any string prop, " +
      "and the server resolves it before the tree reaches the client.",
    pageTemplates: {
      description:
        "Use $t(key) syntax in AUP node string props for translatable text. " +
        "The pageResolver resolves all $t() placeholders server-side before rendering.",
      example: {
        id: "greeting",
        type: "text",
        props: { content: "$t(welcome)" },
      },
      localeFiles:
        "Translation files live in .aup/locales/ as JSON: " +
        'en.json → { "welcome": "Welcome" }, ' +
        'zh.json → { "welcome": "欢迎" }, ' +
        'ja.json → { "welcome": "ようこそ" }. ' +
        "Adding a new language = adding a new .json file.",
    },
    afsData: {
      description:
        "AFS data uses a suffix convention for locale variants: " +
        "intro.json (default), intro.zh.json (Chinese), intro.ja.json (Japanese). " +
        "When a node's src binds to an AFS path, the runtime reads with locale context. " +
        "Fallback chain: zh-CN → zh → default.",
    },
    localeState:
      "Locale is session-level. Set via ?locale=zh URL param or the settings bar. " +
      "Changing locale re-renders the current page with the new locale. " +
      "The locale field in render options syncs back to the client for URL state.",
    renderOptions:
      "Pass locale in aup_render: { root, fullPage: true, style: 'midnight', locale: 'zh' }. " +
      "The chrome settings bar also sends locale changes via WebSocket.",
  },

  eventModel: {
    description:
      "Events flow: user interacts → client sends aup_event → server resolves " +
      "node events config. Three dispatch modes: " +
      "(1) exec: calls AFS exec on the specified path; agent responds with aup_patch. " +
      "(2) target+set: directly patches another node (e.g. update surface src); " +
      "no exec round-trip needed. $args.* placeholders in set values are resolved " +
      "from the event data payload. " +
      "(3) page: navigates to a named page; AUP session resolves page tree + style " +
      "from the app's pageResolver, applies wrapper, and renders with fullPage.",
    eventPayload: {
      type: "aup_event",
      nodeId: "string — the node that fired the event",
      event: "string — event name (click, change, send, etc.)",
      data: "object — optional event-specific payload",
    },
    supportedEvents: {
      click: "Fired by action buttons",
      change: "Fired by input fields; data: { value }",
      send: "Fired by chat input",
      sort: "Fired by table header click",
      select: "Fired by table row click; overlay choice submit",
      confirm: "Fired by overlay confirm button",
      cancel: "Fired by overlay cancel button",
      dismiss: "Fired by overlay toast dismiss",
      complete: "Fired by deck when reaching the last slide without loop",
      load: "Fired by frame when iframe finishes loading",
      error: "Fired by frame when iframe fails to load",
      message: "Fired by frame when bridge receives postMessage from iframe",
    },
  },

  workflow: {
    description: "How an agent creates and manages UI",
    steps: [
      "1. Read /primitives to discover available components",
      "2. Read /primitives/:name for detailed props and examples",
      "3. Read /themes to choose a visual theme",
      "4. Read /examples for complete working documents",
      "5. Build an AUP node tree (JSON) with unique IDs",
      "6. Call aup_render action with { root, fullPage: true, style: 'midnight', chrome: true, locale: 'en' } — chrome shows lang/theme/mode toolbar",
      "7. Handle events: when user interacts, event triggers your AFS exec path",
      "8. Update UI: send aup_patch ops (create/update/remove/reorder nodes)",
    ],
  },

  frameWorkflow: {
    description:
      "How to use the frame primitive for full-page isolation. " +
      "AUP is the OS, pages are applications running inside it. " +
      "Use frame when you need a complete HTML page (complex JS, third-party libraries, " +
      "Canvas/WebGL, or any content that needs its own document context). " +
      "For standard UI, prefer native AUP primitives — they're faster and more integrated.",
    when: [
      "Page needs its own JavaScript runtime (games, visualizations, third-party widgets)",
      "Content includes <script> tags or complex CSS that would conflict with the surface",
      "You want crash isolation — if the page breaks, the surface survives",
      "Embedding external URLs (documentation sites, dashboards, tools)",
    ],
    steps: [
      "1. Write a complete HTML page to AFS: write('/ui/web/pages/mypage', { content: '<html>...</html>', format: 'html' })",
      "2. Reference it in the AUP tree: { type: 'frame', props: { src: '/pages/mypage', bridge: true } }",
      "3. The surface resolves /pages/mypage → HTTP URL /p/mypage?sid=...&st=...&bridge=1",
      "4. The iframe loads the page in a sandbox with the bridge script injected",
    ],
    bridgeAPI: {
      description:
        "When bridge: true, the page gets window.aup — a lightweight postMessage API " +
        "for communicating with the parent surface. The bridge script is ~2KB, auto-injected.",
      methods: {
        "aup.toast(message, intent)":
          "Show a toast notification on the surface. intent: 'info' | 'success' | 'warning' | 'error'",
        "aup.navigate(path)": "Navigate the iframe to another page. path: '/pages/other-page'",
        "aup.fetch(path)":
          "Read AFS data from the surface. Returns a Promise with the result. " +
          "Example: const users = await aup.fetch('/data/users')",
        "aup.emit(event, data)":
          "Send a custom event to the surface (routed as aup_event via WebSocket)",
        "aup.on(event, callback)": "Listen for messages sent from the surface to the iframe",
      },
    },
    example: {
      description: "Agent writes a chart page, then embeds it in a dashboard layout",
      step1_writePage:
        "write('/ui/web/pages/sales-chart', { content: '<html><head>...</head>" +
        '<body><canvas id="chart"></canvas><script>/* Chart.js code */</script></body></html>\' })',
      step2_renderTree: {
        id: "app",
        type: "view",
        props: { layout: { direction: "row", gap: 0 }, size: { height: "100vh" } },
        children: [
          {
            id: "sidebar",
            type: "view",
            props: { layout: "column", size: { width: "240px" }, variant: "card" },
            children: [{ id: "nav", type: "text", props: { content: "Navigation", level: 3 } }],
          },
          {
            id: "main",
            type: "frame",
            props: { src: "/pages/sales-chart", bridge: true, size: { height: "100%" } },
          },
        ],
      },
    },
  },
};

// ── Examples ──

export interface AUPExample {
  name: string;
  title: string;
  description: string;
  concepts: string[];
  document: Record<string, unknown>;
}

export const AUP_EXAMPLES: Record<string, AUPExample> = {
  "login-form": {
    name: "login-form",
    title: "Login Form",
    description:
      "Simple login form with email/password inputs, validation, and submit action. " +
      "Demonstrates: input types, events.click, state.value, view layout.",
    concepts: ["input", "action", "events", "state", "view layout"],
    document: {
      id: "login-root",
      type: "view",
      props: {
        layout: { direction: "column", align: "center", crossAlign: "center", gap: 24 },
        size: { maxWidth: "400px" },
      },
      children: [
        {
          id: "login-title",
          type: "text",
          props: { content: "Sign In", level: 2 },
        },
        {
          id: "email-field",
          type: "input",
          props: { type: "text", label: "Email", placeholder: "you@example.com" },
          state: { value: "" },
          events: {
            change: { exec: "/auth/.actions/validate-email" },
          },
        },
        {
          id: "password-field",
          type: "input",
          props: { type: "password", label: "Password", placeholder: "Enter password" },
          state: { value: "" },
        },
        {
          id: "remember-toggle",
          type: "input",
          props: { type: "toggle", label: "Remember me" },
          state: { value: false },
        },
        {
          id: "submit-btn",
          type: "action",
          props: { label: "Sign In", variant: "primary", icon: "lock" },
          events: {
            click: { exec: "/auth/.actions/login" },
          },
        },
        {
          id: "forgot-link",
          type: "action",
          props: { label: "Forgot password?", variant: "ghost" },
          events: {
            click: { exec: "/auth/.actions/forgot-password" },
          },
        },
      ],
    },
  },

  dashboard: {
    name: "dashboard",
    title: "Analytics Dashboard",
    description:
      "Grid layout with stat cards, bar chart, and data table. " +
      "Demonstrates: grid layout, nested views, chart with data, table with columns/rows, node.src for live data.",
    concepts: ["grid layout", "nested views", "chart", "table", "node.src"],
    document: {
      id: "dash-root",
      type: "view",
      props: { layout: "column", size: { maxWidth: "1200px" } },
      children: [
        {
          id: "dash-header",
          type: "text",
          props: { content: "Dashboard", level: 1 },
        },
        {
          id: "stats-row",
          type: "view",
          props: { layout: "grid" },
          children: [
            {
              id: "stat-users",
              type: "view",
              props: { layout: "column", variant: "card" },
              children: [
                {
                  id: "stat-users-label",
                  type: "text",
                  props: { content: "Total Users", scale: "sm", intent: "info" },
                },
                { id: "stat-users-value", type: "text", props: { content: "12,847", level: 2 } },
              ],
            },
            {
              id: "stat-revenue",
              type: "view",
              props: { layout: "column", variant: "card" },
              children: [
                {
                  id: "stat-rev-label",
                  type: "text",
                  props: { content: "Revenue", scale: "sm", intent: "success" },
                },
                { id: "stat-rev-value", type: "text", props: { content: "$48,291", level: 2 } },
              ],
            },
            {
              id: "stat-orders",
              type: "view",
              props: { layout: "column", variant: "card" },
              children: [
                {
                  id: "stat-ord-label",
                  type: "text",
                  props: { content: "Orders", scale: "sm", intent: "warning" },
                },
                { id: "stat-ord-value", type: "text", props: { content: "1,024", level: 2 } },
              ],
            },
          ],
        },
        {
          id: "chart-section",
          type: "chart",
          props: {
            variant: "bar",
            height: "300px",
            data: {
              labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
              datasets: [
                {
                  label: "Orders",
                  data: [65, 59, 80, 81, 56, 55, 72],
                  backgroundColor: "#60a5fa",
                },
              ],
            },
          },
        },
        {
          id: "recent-orders",
          type: "table",
          props: {
            columns: [
              { key: "id", label: "Order ID" },
              { key: "customer", label: "Customer" },
              { key: "amount", label: "Amount", align: "right" },
              { key: "status", label: "Status" },
            ],
            rows: [
              { id: "#1001", customer: "Alice Chen", amount: "$299", status: "Shipped" },
              { id: "#1002", customer: "Bob Smith", amount: "$149", status: "Processing" },
              { id: "#1003", customer: "Carol Wu", amount: "$499", status: "Delivered" },
            ],
          },
          events: {
            select: { exec: "/orders/.actions/view" },
          },
        },
      ],
    },
  },

  "settings-page": {
    name: "settings-page",
    title: "Settings Page",
    description:
      "Column layout with grouped sections, multiple input types, and a confirm overlay. " +
      "Demonstrates: sections with headings, select/toggle/slider inputs, overlay confirm dialog, state.open.",
    concepts: ["sections", "select", "toggle", "slider", "overlay confirm", "state.open"],
    document: {
      id: "settings-root",
      type: "view",
      props: { layout: "column", size: { maxWidth: "600px" } },
      children: [
        {
          id: "settings-title",
          type: "text",
          props: { content: "Settings", level: 1 },
        },
        {
          id: "profile-section",
          type: "view",
          props: { layout: "column", variant: "card" },
          children: [
            { id: "profile-heading", type: "text", props: { content: "Profile", level: 3 } },
            {
              id: "name-input",
              type: "input",
              props: { type: "text", label: "Display Name", placeholder: "Your name" },
              state: { value: "Alice" },
            },
            {
              id: "language-select",
              type: "input",
              props: {
                type: "select",
                label: "Language",
                options: [
                  { label: "English", value: "en" },
                  { label: "Chinese", value: "zh" },
                  { label: "Japanese", value: "ja" },
                ],
              },
              state: { value: "en" },
            },
          ],
        },
        {
          id: "prefs-section",
          type: "view",
          props: { layout: "column", variant: "card" },
          children: [
            { id: "prefs-heading", type: "text", props: { content: "Preferences", level: 3 } },
            {
              id: "dark-mode",
              type: "input",
              props: { type: "toggle", label: "Dark Mode" },
              state: { value: true },
            },
            {
              id: "notifications",
              type: "input",
              props: { type: "toggle", label: "Email Notifications" },
              state: { value: false },
            },
            {
              id: "font-size",
              type: "input",
              props: { type: "slider", label: "Font Size", min: 12, max: 24, step: 1 },
              state: { value: 16 },
            },
          ],
        },
        {
          id: "actions-row",
          type: "view",
          props: { layout: "row" },
          children: [
            {
              id: "save-btn",
              type: "action",
              props: { label: "Save Changes", variant: "primary" },
              events: { click: { exec: "/settings/.actions/save" } },
            },
            {
              id: "delete-btn",
              type: "action",
              props: { label: "Delete Account", variant: "destructive" },
              events: { click: { exec: "/ui/.actions/show-delete-confirm" } },
            },
          ],
        },
        {
          id: "delete-confirm",
          type: "overlay",
          props: {
            mode: "confirm",
            title: "Delete Account?",
            message: "All data will be permanently deleted. This cannot be undone.",
            intent: "error",
            confirmLabel: "Delete Forever",
          },
          state: { open: false },
          events: {
            confirm: { exec: "/account/.actions/delete" },
          },
        },
      ],
    },
  },

  "file-manager": {
    name: "file-manager",
    title: "File Manager",
    description:
      "Explorer sidebar + code editor main area. " +
      "Demonstrates: row layout with fixed sidebar, editor with change event, subsystem primitives.",
    concepts: ["row layout", "editor", "explorer", "subsystem primitives"],
    document: {
      id: "fm-root",
      type: "view",
      props: {
        layout: { direction: "row", gap: 0 },
        size: { width: "100%", height: "100vh" },
      },
      children: [
        {
          id: "sidebar",
          type: "view",
          props: {
            layout: "column",
            size: { width: "280px", height: "100%" },
            variant: "card",
          },
          children: [
            { id: "fm-title", type: "text", props: { content: "Files", level: 3 } },
            {
              id: "file-tree",
              type: "frame",
              props: { url: "/files/browse", height: "calc(100% - 60px)" },
            },
          ],
        },
        {
          id: "editor-area",
          type: "view",
          props: { layout: "column", size: { flex: "1" } },
          children: [
            {
              id: "file-tabs",
              type: "view",
              props: { layout: "row" },
              children: [
                {
                  id: "tab-main",
                  type: "action",
                  props: { label: "main.ts", variant: "ghost", icon: "edit" },
                },
              ],
            },
            {
              id: "code-editor",
              type: "editor",
              props: {
                language: "typescript",
                content: 'export function hello() {\n  return "world";\n}',
                lineNumbers: true,
              },
              events: {
                change: { exec: "/files/.actions/auto-save", args: { path: "/src/main.ts" } },
              },
            },
          ],
        },
      ],
    },
  },

  "data-visualization": {
    name: "data-visualization",
    title: "Data Explorer",
    description:
      "Filter controls + chart + table showing the same dataset. " +
      "Demonstrates: row/column hybrid layout, multiple input types for filtering, " +
      "chart with live data (node.src), table with sort/select events.",
    concepts: ["filter inputs", "chart with node.src", "table events", "hybrid layout"],
    document: {
      id: "viz-root",
      type: "view",
      props: { layout: "column", size: { maxWidth: "1000px" } },
      children: [
        {
          id: "viz-header",
          type: "view",
          props: { layout: "row" },
          children: [
            { id: "viz-title", type: "text", props: { content: "Sales Analytics", level: 1 } },
            {
              id: "export-btn",
              type: "action",
              props: { label: "Export CSV", variant: "secondary", icon: "download" },
              events: { click: { exec: "/reports/.actions/export", args: { format: "csv" } } },
            },
          ],
        },
        {
          id: "filters",
          type: "view",
          props: { layout: { direction: "row", gap: 12, wrap: true } },
          children: [
            {
              id: "date-from",
              type: "input",
              props: { type: "date", label: "From" },
              state: { value: "2024-01-01" },
              events: { change: { exec: "/reports/.actions/filter" } },
            },
            {
              id: "date-to",
              type: "input",
              props: { type: "date", label: "To" },
              state: { value: "2024-03-31" },
              events: { change: { exec: "/reports/.actions/filter" } },
            },
            {
              id: "region-select",
              type: "input",
              props: {
                type: "select",
                label: "Region",
                options: ["All", "North America", "Europe", "Asia"],
              },
              state: { value: "All" },
              events: { change: { exec: "/reports/.actions/filter" } },
            },
          ],
        },
        {
          id: "sales-chart",
          type: "chart",
          props: {
            variant: "line",
            height: "300px",
          },
          src: "/data/sales-by-month",
        },
        {
          id: "sales-table",
          type: "table",
          props: {
            columns: [
              { key: "month", label: "Month" },
              { key: "region", label: "Region" },
              { key: "units", label: "Units Sold", align: "right" },
              { key: "revenue", label: "Revenue", align: "right" },
            ],
            rows: [
              { month: "Jan 2024", region: "North America", units: "1,240", revenue: "$62,000" },
              { month: "Jan 2024", region: "Europe", units: "890", revenue: "$44,500" },
              { month: "Feb 2024", region: "North America", units: "1,380", revenue: "$69,000" },
              { month: "Feb 2024", region: "Europe", units: "1,020", revenue: "$51,000" },
            ],
          },
          events: {
            sort: { exec: "/reports/.actions/sort" },
            select: { exec: "/reports/.actions/drill-down" },
          },
        },
      ],
    },
  },

  "presentation-deck": {
    name: "presentation-deck",
    title: "Presentation Deck",
    description:
      "Slide deck with design tokens, preset theme, entrance animations, and count-up. " +
      "Demonstrates: deck with Shadow DOM isolation, designPreset, design token overrides, " +
      "slide transitions, animate, count-up.",
    concepts: [
      "deck",
      "designPreset",
      "design tokens",
      "Shadow DOM",
      "animate",
      "count-up",
      "slide transitions",
    ],
    document: {
      id: "pitch-deck",
      type: "deck",
      props: {
        transition: "slide",
        designPreset: "tech-dark",
        design: {
          colors: { accent: "#e6b450", accentGlow: "rgba(230,180,80,0.4)" },
          effects: { headingStyle: "gradient-text", cardStyle: "glass", slideBackground: "grid" },
        },
      },
      state: { current: 0 },
      children: [
        {
          id: "slide-title",
          type: "view",
          props: {
            layout: { direction: "column", align: "center", crossAlign: "center", gap: 24 },
          },
          children: [
            {
              id: "title-heading",
              type: "text",
              props: { content: "Product Launch 2026", level: 1, animate: "fade-in" },
            },
            {
              id: "title-sub",
              type: "text",
              props: {
                content: "Building the future of agentic computing",
                scale: "lg",
                animate: "slide-up",
                animateDelay: 200,
              },
            },
          ],
        },
        {
          id: "slide-metrics",
          type: "view",
          props: { layout: { direction: "column", align: "center", gap: 32 } },
          children: [
            {
              id: "metrics-heading",
              type: "text",
              props: { content: "Key Metrics", level: 2, animate: "fade-in" },
            },
            {
              id: "metrics-row",
              type: "view",
              props: { layout: "grid" },
              children: [
                {
                  id: "metric-users",
                  type: "view",
                  props: { layout: "column", variant: "card" },
                  children: [
                    {
                      id: "m-users-num",
                      type: "text",
                      props: { content: "1,234,567", level: 2, animate: "count-up" },
                    },
                    {
                      id: "m-users-label",
                      type: "text",
                      props: { content: "Active Users", scale: "sm" },
                    },
                  ],
                },
                {
                  id: "metric-revenue",
                  type: "view",
                  props: { layout: "column", variant: "card" },
                  children: [
                    {
                      id: "m-rev-num",
                      type: "text",
                      props: { content: "$48,291,000", level: 2, animate: "count-up" },
                    },
                    {
                      id: "m-rev-label",
                      type: "text",
                      props: { content: "Annual Revenue", scale: "sm" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      events: {
        change: { exec: "/analytics/.actions/track", args: { event: "slide-change" } },
        complete: { exec: "/analytics/.actions/track", args: { event: "deck-complete" } },
      },
    },
  },

  "dashboard-with-iframe": {
    name: "dashboard-with-iframe",
    title: "Dashboard with Embedded Page",
    description:
      "SPA-style layout with a native AUP sidebar and a full-page iframe main content area. " +
      "Demonstrates: frame primitive, bridge communication, row layout with sidebar + frame.",
    concepts: ["frame", "bridge", "postMessage", "page isolation", "SPA layout"],
    document: {
      id: "spa-root",
      type: "view",
      props: {
        layout: { direction: "row", gap: 0 },
        size: { width: "100%", height: "100vh" },
      },
      children: [
        {
          id: "sidebar",
          type: "view",
          props: {
            layout: "column",
            size: { width: "240px", height: "100%" },
            variant: "card",
          },
          children: [
            { id: "nav-title", type: "text", props: { content: "My App", level: 3 } },
            {
              id: "nav-home",
              type: "action",
              props: { label: "Home", variant: "ghost", icon: "home" },
              events: { click: { exec: "/nav/.actions/goto", args: { page: "home" } } },
            },
            {
              id: "nav-dashboard",
              type: "action",
              props: { label: "Dashboard", variant: "ghost", icon: "chart" },
              events: { click: { exec: "/nav/.actions/goto", args: { page: "dashboard" } } },
            },
            {
              id: "nav-settings",
              type: "action",
              props: { label: "Settings", variant: "ghost", icon: "gear" },
              events: { click: { exec: "/nav/.actions/goto", args: { page: "settings" } } },
            },
          ],
        },
        {
          id: "main-frame",
          type: "frame",
          props: {
            src: "/pages/dashboard",
            bridge: true,
            size: { height: "100%" },
          },
          events: {
            load: { exec: "/analytics/.actions/track", args: { event: "page-loaded" } },
          },
        },
      ],
    },
  },

  "broadcast-news": {
    name: "broadcast-news",
    title: "Broadcast News Overlay",
    description:
      "CNN-style breaking news overlay using the broadcast primitive. " +
      "Compared to the manual overlay-grid approach (live-overlay example), " +
      "this achieves the same visual result with ~70% fewer props. " +
      "Agents specify semantic roles and content; the renderer handles type mapping, " +
      "region placement, and theme application.",
    concepts: ["broadcast", "roles", "theme", "ticker", "overlay shorthand"],
    document: {
      id: "broadcast-root",
      type: "broadcast",
      props: { theme: "cnn" },
      children: [
        { role: "live-badge", text: "\u25cf LIVE" },
        { role: "clock", text: "2:36 PM ET" },
        { role: "alert", text: "BREAKING NEWS" },
        { role: "headline", text: "MAJOR POLICY ANNOUNCEMENT EXPECTED FROM WHITE HOUSE TODAY" },
        {
          role: "speaker-bar",
          lines: ["JOHN DOE", "Senior Policy Advisor"],
        },
        {
          role: "ticker",
          items: [
            "Stock markets surge as Fed signals rate pause",
            "Oil prices drop 3% on surprise inventory build",
            "European markets close mixed amid uncertainty",
          ],
          intent: "breaking",
        },
      ],
    },
  },

  "live-overlay": {
    name: "live-overlay",
    title: "Live Broadcast Overlay",
    description:
      "Deck presentation with stack + overlay-grid for live broadcast HUD. " +
      "Stack layers the deck (layer 0) and overlay (layer 1). Overlay-grid places children " +
      "in 15 broadcast regions (top-start, top-center, top-end, mid-*, lower-*, ticker, bottom-*). " +
      "Deck uses isolation:isolate so its transitions don't break the overlay stacking.",
    concepts: ["stack layout", "overlay-grid", "region", "deck", "live broadcast", "isolation"],
    document: {
      id: "live-root",
      type: "view",
      props: { layout: "stack", size: { width: "full", height: "100vh" } },
      children: [
        {
          id: "slides",
          type: "deck",
          props: { presentation: true, keyboard: true, transition: "fade" },
          children: [
            {
              id: "slide-1",
              type: "frame",
              props: { src: "/pages/slide-intro" },
            },
            {
              id: "slide-2",
              type: "frame",
              props: { src: "/pages/slide-demo" },
            },
          ],
        },
        {
          id: "overlay-layer",
          type: "view",
          props: { layout: "overlay-grid", theme: "cnn" },
          children: [
            {
              id: "live-badge",
              type: "text",
              props: {
                region: "top-start",
                role: "live-badge",
                content: "\u25cf LIVE",
              },
            },
            {
              id: "viewer-count",
              type: "text",
              props: { region: "top-center", role: "viewer-count", content: "1,247 watching" },
            },
            {
              id: "timer",
              type: "text",
              props: { region: "top-end", role: "clock", content: "12:35" },
            },
            {
              id: "speaker-bar",
              type: "view",
              props: { region: "lower-start", role: "speaker-bar", layout: "column" },
              children: [
                { id: "sp-name", type: "text", props: { content: "Robert Mao" } },
                {
                  id: "sp-title",
                  type: "text",
                  props: { content: "CEO, ArcBlock", scale: "xs" },
                },
              ],
            },
            {
              id: "news-ticker",
              type: "ticker",
              props: {
                region: "ticker",
                mode: "scroll",
                intent: "info",
              },
              children: [
                { id: "tk1", type: "text", props: { content: "AUP v0.4 released", scale: "sm" } },
                {
                  id: "tk2",
                  type: "text",
                  props: { content: "22 primitives", scale: "sm" },
                },
                {
                  id: "tk3",
                  type: "text",
                  props: {
                    content: "Deck + Frame + Overlay + Ticker now live",
                    scale: "sm",
                  },
                },
              ],
            },
            {
              id: "logo",
              type: "media",
              props: { region: "bottom-end", src: "/logo.png", size: { width: "48px" } },
            },
          ],
        },
      ],
    },
  },

  "scene-management": {
    name: "scene-management",
    title: "Stage-to-Live Scene Management",
    description:
      "Pre-render scenes off-screen with aup_stage, swap live with aup_take (zero DOM teardown), " +
      "release with aup_release. TV-industry Preview/Program model for broadcast-style switching.",
    concepts: [
      "aup_stage pre-renders a scene off-screen in a hidden buffer",
      "aup_take swaps a staged scene to live via CSS class toggle — no DOM teardown",
      "aup_release frees a staged scene's buffer resources",
      "Transition support: 'cut' (instant) or 'dissolve' (fade)",
      "Active scene survives reconnect (replayed automatically)",
      "LRU eviction keeps memory bounded (default max 3 scenes)",
    ],
    document: {
      id: "scene-example",
      type: "view",
      props: { layout: "column" },
      children: [
        { id: "s-title", type: "text", props: { content: "Scene Management Demo", level: 1 } },
        {
          id: "s-info",
          type: "text",
          props: {
            content:
              "Use aup_stage to pre-render scenes, aup_take to swap live, aup_release to free.",
          },
        },
      ],
    },
  },
};
