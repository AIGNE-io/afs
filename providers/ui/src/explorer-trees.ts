/**
 * Explorer tree builders and content-detection utilities.
 *
 * Pure computation — zero platform dependencies, zero heavy imports.
 * Used by PortalSession and the aup-explorer example.
 */

// ─── Content Detection ─────────────────────────────────────────────────────

export const CODE_EXT: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  html: "html",
  css: "css",
  scss: "scss",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  sh: "bash",
  zsh: "bash",
  bash: "bash",
  sql: "sql",
  xml: "xml",
  svg: "xml",
  c: "c",
  cpp: "cpp",
  h: "c",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  md: "markdown",
  mdx: "markdown",
};

export const IMAGE_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "ico",
  "webp",
  "avif",
  "svg",
]);

export const BINARY_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "bmp",
  "ico",
  "webp",
  "avif",
  "mp3",
  "mp4",
  "wav",
  "ogg",
  "webm",
  "zip",
  "tar",
  "gz",
  "bz2",
  "7z",
  "rar",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  "pdf",
  "exe",
  "dll",
  "so",
  "dylib",
  "o",
  "a",
]);

export function extOf(f: string): string {
  return (f.split(".").pop() || "").toLowerCase();
}
export function isImage(f: string): boolean {
  return IMAGE_EXT.has(extOf(f));
}
export function isBinary(f: string): boolean {
  return BINARY_EXT.has(extOf(f));
}
export function detectLang(f: string): string | null {
  return CODE_EXT[extOf(f)] ?? null;
}
export function isMarkdown(f: string): boolean {
  const e = extOf(f);
  return e === "md" || e === "mdx";
}
export function formatSize(b: unknown): string {
  if (typeof b !== "number") return "";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`;
  return `${(b / 1073741824).toFixed(1)} GB`;
}
export function fileIcon(f: string): string {
  const m: Record<string, string> = {
    ts: "code",
    tsx: "code",
    js: "code",
    jsx: "code",
    json: "braces",
    yaml: "file-text",
    yml: "file-text",
    toml: "file-text",
    md: "book",
    mdx: "book",
    html: "globe",
    css: "palette",
    py: "code",
    go: "code",
    rs: "code",
    sh: "terminal",
    sql: "database",
    png: "image",
    jpg: "image",
    svg: "image",
    pdf: "file",
  };
  return m[extOf(f)] || "file";
}

export function mimeForExt(ext: string): string {
  const m: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    bmp: "image/bmp",
    ico: "image/x-icon",
    webp: "image/webp",
    avif: "image/avif",
    svg: "image/svg+xml",
  };
  return m[ext] || "application/octet-stream";
}

// ─── Panel tree builders ────────────────────────────────────────────────────

export function explorerHeaderTree(browsePath: string): Record<string, unknown> {
  return {
    id: "root",
    type: "view",
    props: {
      layout: { direction: "row", gap: "sm", crossAlign: "center" },
    },
    children: [
      { id: "icon", type: "media", props: { type: "icon", content: "folder" } },
      { id: "title", type: "text", props: { content: "AFS Explorer", level: 3 } },
      { id: "path", type: "text", props: { content: browsePath, mode: "badge" } },
    ],
  };
}

export function explorerSidebarTree(browsePath: string): Record<string, unknown> {
  return {
    id: "root",
    type: "view",
    props: { layout: { gap: "none" } },
    children: [
      {
        id: "list",
        type: "afs-list",
        src: browsePath,
        props: {
          layout: "list",
          itemStyle: "row",
          clickMode: "both",
          showBreadcrumb: true,
          searchable: true,
          searchPlaceholder: "Filter files...",
          emptyText: "Empty directory",
        },
        events: {
          select: { exec: "file-select", args: {} },
          navigate: { exec: "dir-navigate", args: {} },
        },
      },
    ],
  };
}

export function explorerPrimaryTree(
  selectedPath: string | null,
  content: string | null,
  meta: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!selectedPath) {
    return {
      id: "root",
      type: "view",
      props: { layout: { gap: "lg", align: "center", crossAlign: "center" }, size: { flex: 1 } },
      children: [
        { id: "empty-icon", type: "media", props: { type: "icon", content: "folder-open" } },
        { id: "empty-title", type: "text", props: { content: "No file selected", level: 3 } },
        {
          id: "empty-hint",
          type: "text",
          props: { content: "Click a file in the sidebar to preview.", scale: "caption" },
        },
      ],
    };
  }

  const filename = selectedPath.split("/").pop() || selectedPath;
  const m = meta || {};
  const binary = isBinary(filename);
  const lang = detectLang(filename) || (m.detectedLang as string) || null;
  const kind = (m.kind as string) || "";

  const headerChildren: Record<string, unknown>[] = [
    { id: "file-icon", type: "media", props: { type: "icon", content: fileIcon(filename) } },
    { id: "file-name", type: "text", props: { content: filename, level: 2 } },
  ];
  if (kind)
    headerChildren.push({ id: "file-kind", type: "text", props: { content: kind, mode: "badge" } });
  if (lang)
    headerChildren.push({
      id: "file-lang",
      type: "text",
      props: { content: lang, mode: "badge", intent: "info" },
    });

  const metaParts: string[] = [];
  if (m.size != null) metaParts.push(formatSize(m.size));
  if (m.mimeType) metaParts.push(String(m.mimeType));
  metaParts.push(selectedPath);

  const children: Record<string, unknown>[] = [
    {
      id: "file-header",
      type: "view",
      props: { layout: { direction: "row", gap: "sm", crossAlign: "center", wrap: true } },
      children: headerChildren,
    },
    {
      id: "file-meta",
      type: "text",
      props: { content: metaParts.join("  ·  "), scale: "caption" },
    },
    { id: "file-div", type: "view", props: { mode: "divider" }, children: [] },
  ];

  if (binary && isImage(filename) && content != null) {
    const mime = (m.mimeType as string) || mimeForExt(extOf(filename));
    const dataUrl = `data:${mime};base64,${content}`;
    children.push({
      id: "file-content",
      type: "media",
      props: {
        type: "image",
        src: dataUrl,
        alt: filename,
        size: { width: "100%", height: "auto" },
      },
    });
  } else if (binary) {
    children.push({
      id: "file-content",
      type: "view",
      props: { layout: { gap: "sm", align: "center", crossAlign: "center" }, size: { flex: 1 } },
      children: [
        { id: "bin-icon", type: "media", props: { type: "icon", content: "file" } },
        {
          id: "bin-text",
          type: "text",
          props: { content: "Binary file — preview not available", intent: "warning" },
        },
      ],
    });
  } else if (content != null) {
    if (isMarkdown(filename)) {
      children.push({
        id: "file-content",
        type: "text",
        props: { content, format: "markdown" },
        events: {
          "link-click": { exec: "md-link-navigate", args: { fromPath: selectedPath } },
        },
      });
    } else if (lang) {
      children.push({
        id: "file-content",
        type: "text",
        props: { content, format: "code", language: lang },
      });
    } else {
      children.push({ id: "file-content", type: "text", props: { content, format: "code" } });
    }
  } else if (m.childrenCount != null || m.kind === "directory" || m.type === "directory") {
    // Directory or mount point — show child count hint
    const hint =
      m.childrenCount != null
        ? `Directory with ${m.childrenCount} item${m.childrenCount !== 1 ? "s" : ""}`
        : "Directory";
    children.push({
      id: "file-content",
      type: "text",
      props: { content: hint, scale: "body" },
    });
  } else {
    children.push({
      id: "file-content",
      type: "text",
      props: { content: "No preview available", scale: "body" },
    });
  }

  return {
    id: "root",
    type: "view",
    props: { layout: { gap: "md" }, style: { overflow: "auto", padding: "12px" } },
    children,
  };
}

// ─── Known metadata fields (excluded from "extra" auto-listing) ──────────
const KNOWN_META_FIELDS = new Set([
  "kind",
  "kinds",
  "provider",
  "hash",
  "tags",
  "permissions",
  "mount",
  "uri",
  "size",
  "description",
  "childrenCount",
  "events",
  "mimeType",
]);

/**
 * Build a metadata panel AUP tree for the inspector surface.
 *
 * Pure computation — accepts stat entry + optional explain result,
 * returns an AUP node tree displaying all available metadata.
 */
export function explorerMetadataTree(
  path: string,
  entry: {
    path?: string;
    size?: number;
    modified?: string;
    meta?: Record<string, unknown> | null;
    actions?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
  },
  explain?: { description?: string; content?: string; format?: string } | null,
): Record<string, unknown> {
  const meta = entry.meta ?? {};
  const children: Record<string, unknown>[] = [];

  // ── Title ──
  const filename = path.split("/").pop() || path;
  children.push({
    id: "meta-title",
    type: "text",
    props: { content: filename, level: 5 },
  });

  // ── Key-value card ──
  const rows: Record<string, unknown>[] = [];

  // Path — always shown
  rows.push(metaKVRow("meta-path", "path", path));

  // Size
  if (entry.size != null) {
    rows.push(metaKVRow("meta-size", "size", formatSize(entry.size)));
  }

  // Modified
  if (entry.modified) {
    rows.push(metaKVRow("meta-modified", "modified", String(entry.modified)));
  }

  // Kind
  if (meta.kind) {
    rows.push(metaKVRow("meta-kind", "kind", String(meta.kind)));
  }

  // Provider
  if (meta.provider) {
    rows.push(metaKVRow("meta-provider", "provider", String(meta.provider)));
  }

  // Hash (truncated to 12 chars)
  if (meta.hash) {
    const hash = String(meta.hash);
    rows.push(metaKVRow("meta-hash", "hash", hash.length > 12 ? hash.slice(0, 12) : hash));
  }

  // Mount
  if (meta.mount) {
    rows.push(metaKVRow("meta-mount", "mount", String(meta.mount)));
  }

  // URI
  if (meta.uri) {
    rows.push(metaKVRow("meta-uri", "uri", String(meta.uri)));
  }

  // ── Permissions ──
  if (Array.isArray(meta.permissions) && meta.permissions.length > 0) {
    rows.push(
      metaKVRow("meta-permissions", "permissions", (meta.permissions as string[]).join(", ")),
    );
  }

  // ── Extra meta fields (non-standard) ──
  const extraKeys = Object.keys(meta).filter((k) => !KNOWN_META_FIELDS.has(k) && meta[k] != null);
  for (const key of extraKeys) {
    const val = meta[key];
    const display = typeof val === "string" ? val : JSON.stringify(val);
    rows.push(metaKVRow(`meta-extra-${key}`, key, display));
  }

  // ── Create card with all rows collected above ──
  if (rows.length > 0) {
    children.push({
      id: "meta-fields",
      type: "view",
      props: { mode: "card", layout: { direction: "column", gap: "xs" } },
      children: rows,
    });
  }

  // ── Tags ──
  if (Array.isArray(meta.tags) && meta.tags.length > 0) {
    children.push({
      id: "meta-tags",
      type: "view",
      props: { layout: { direction: "row", gap: "xs", wrap: true } },
      children: (meta.tags as string[]).map((tag, i) => ({
        id: `meta-tag-${i}`,
        type: "text",
        props: { content: tag, mode: "badge" },
      })),
    });
  }

  // ── Actions ──
  if (Array.isArray(entry.actions) && entry.actions.length > 0) {
    children.push({
      id: "meta-actions",
      type: "view",
      props: { layout: { direction: "column", gap: "xs" } },
      children: [
        { id: "meta-actions-label", type: "text", props: { content: "Actions", level: 6 } },
        ...entry.actions.map((action, i) => ({
          id: `meta-action-${i}`,
          type: "action",
          props: {
            label: action.name,
            variant: "secondary",
            size: "sm",
            ...(action.description ? { title: action.description } : {}),
          },
          events: {
            click: {
              exec: "action-exec",
              args: { path, action: action.name },
            },
          },
        })),
      ],
    });
  }

  // ── Explain ──
  const explainText = explain?.content || explain?.description || "";
  if (explainText) {
    children.push({
      id: "meta-explain",
      type: "text",
      props: {
        content: explainText,
        format: explain?.format || "markdown",
      },
    });
  }

  return {
    id: "meta-panel",
    type: "view",
    props: { layout: { direction: "column", gap: "sm" }, padding: "md" },
    children,
  };
}

/** Build a key-value row for the metadata card. */
function metaKVRow(id: string, label: string, value: string): Record<string, unknown> {
  return {
    id,
    type: "view",
    props: { layout: { direction: "row", gap: "sm" } },
    children: [
      {
        id: `${id}-label`,
        type: "text",
        props: { content: label, scale: "caption", intent: "info" },
      },
      { id: `${id}-value`, type: "text", props: { content: value } },
    ],
  };
}

/**
 * Build an action params form tree from a JSON Schema inputSchema.
 * Returns null if no form is needed (no inputSchema or no properties).
 */
export function explorerActionFormTree(
  action: {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  },
  path: string,
): Record<string, unknown> | null {
  const schema = action.inputSchema;
  if (!schema) return null;

  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties || Object.keys(properties).length === 0) return null;

  const required = new Set((schema.required as string[]) || []);

  const inputNodes: Record<string, unknown>[] = [];
  for (const [key, prop] of Object.entries(properties)) {
    const propType = prop.type as string;
    const enumValues = prop.enum as string[] | undefined;
    const description = prop.description as string | undefined;

    let mode: string;
    const extraProps: Record<string, unknown> = {};

    if (enumValues) {
      mode = "select";
      extraProps.options = enumValues;
    } else if (propType === "boolean") {
      mode = "toggle";
    } else if (propType === "number" || propType === "integer") {
      mode = "number";
    } else {
      mode = "text";
    }

    inputNodes.push({
      id: `action-form-${key}`,
      type: "input",
      props: {
        name: key,
        mode,
        label: key,
        ...(description ? { placeholder: description } : {}),
        ...(required.has(key) ? { required: true } : {}),
        ...extraProps,
      },
    });
  }

  return {
    id: "action-form",
    type: "view",
    props: { layout: { direction: "column", gap: "sm" } },
    children: [
      ...(action.description
        ? [
            {
              id: "action-form-desc",
              type: "text",
              props: { content: action.description, scale: "caption" },
            },
          ]
        : []),
      ...inputNodes,
      {
        id: "action-form-submit",
        type: "action",
        props: { label: "Execute", variant: "primary", size: "sm" },
        events: {
          click: { exec: "action-form-submit", args: { action: action.name, path } },
        },
      },
    ],
  };
}

export function explorerStatusbarTree(): Record<string, unknown> {
  return {
    id: "root",
    type: "view",
    props: { layout: { direction: "row", gap: "sm" } },
    children: [{ id: "status", type: "text", props: { content: "Ready", scale: "caption" } }],
  };
}
