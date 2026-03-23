/**
 * AUP (Agentic Universal Primitives) — Type definitions.
 *
 * Semantic node graph for structured UI rendering.
 * Zero visual attributes — only semantic tokens.
 */

// ── Node Graph ──

export interface AUPNode {
  /** Stable identity */
  id: string;
  /** Primitive name (from registry): view, text, media, input, action, overlay, table, chat; or component: terminal, frame */
  type: string;
  /** Static attributes (label, src, placeholder, columns, etc.) */
  props?: Record<string, unknown>;
  /** AFS path — read-only data binding (client subscribes for updates) */
  src?: string;
  /** AFS path — read-write data binding (input writes back) */
  bind?: string;
  /** UI-local state (selected tab, expanded, open, etc.) */
  state?: Record<string, unknown>;
  /** Event bindings — each maps to an AFS exec call */
  events?: Record<string, AUPEvent>;
  /** Child nodes */
  children?: AUPNode[];
}

export interface AUPEvent {
  /** AFS path to exec (required when no target+set or page) */
  exec?: string;
  /** Arguments to pass to exec */
  args?: Record<string, unknown>;
  /** Target node ID — update this node when event fires */
  target?: string;
  /** Fields to set on the target node (supports $args.* placeholders) */
  set?: {
    src?: string;
    props?: Record<string, unknown>;
    state?: Record<string, unknown>;
    /** Navigate to a named page (when target is "_root") */
    page?: string;
  };
  /**
   * Navigate to a named page — AUP session resolves page tree + style.
   * @deprecated Use `{ target: "_root", set: { page: "..." } }` instead.
   */
  page?: string;
  /** Browser-level navigation URL — handled client-side via window.location.href. */
  navigate?: string;
}

// ── Semantic Tokens ──

export type AUPVariant = "primary" | "secondary" | "ghost" | "destructive";
export type AUPSize = "xs" | "sm" | "md" | "lg" | "xl";
export type AUPIntent = "info" | "success" | "warning" | "error";

// ── Patch Operations ──

export type AUPPatchOp = AUPCreateOp | AUPUpdateOp | AUPRemoveOp | AUPReorderOp;

export interface AUPCreateOp {
  op: "create";
  id: string;
  parentId: string;
  node: AUPNode;
  index?: number;
}

export interface AUPUpdateOp {
  op: "update";
  id: string;
  /** Update node's AFS data-binding path */
  src?: string;
  props?: Record<string, unknown>;
  state?: Record<string, unknown>;
  events?: Record<string, AUPEvent>;
  /** Replace node's children wholesale (re-indexes the subtree) */
  children?: AUPNode[];
}

export interface AUPRemoveOp {
  op: "remove";
  id: string;
}

export interface AUPReorderOp {
  op: "reorder";
  id: string;
  parentId: string;
  index: number;
}

// ── WebSocket Messages ──

/** Server → Client: full render */
export interface AUPRenderMessage {
  type: "aup";
  action: "render";
  root: AUPNode;
  treeVersion: number;
}

/** Server → Client: incremental patch */
export interface AUPPatchMessage {
  type: "aup";
  action: "patch";
  ops: AUPPatchOp[];
  treeVersion: number;
}

/** Server → Client: scene staged (pre-rendered, not yet live) */
export interface AUPStageMessage {
  type: "aup";
  action: "stage";
  sceneId: string;
  root: AUPNode;
  treeVersion: number;
}

/** Server → Client: take staged scene live */
export interface AUPTakeMessage {
  type: "aup";
  action: "take";
  sceneId: string;
  treeVersion: number;
}

/** Client → Server: event fired */
export interface AUPEventMessage {
  type: "aup_event";
  nodeId: string;
  event: string;
  data?: Record<string, unknown>;
}

/** Server → Client: event result */
export interface AUPEventResultMessage {
  type: "aup_event_result";
  nodeId: string;
  event: string;
  result?: unknown;
  error?: string;
}

export type AUPServerMessage =
  | AUPRenderMessage
  | AUPPatchMessage
  | AUPStageMessage
  | AUPTakeMessage
  | AUPEventResultMessage;
export type AUPClientMessage = AUPEventMessage;

// ── Device Capabilities (D13) ──

/**
 * How a device can render a specific AUP primitive.
 *
 * - "native"      — native renderer, full functionality
 * - "webview"     — WebView renderer, full functionality
 * - "partial"     — renderable, but some props unsupported
 * - "unsupported" — cannot render; server applies degradation chain (D14)
 */
export type PrimitiveCap = "native" | "webview" | "partial" | "unsupported";

/** Display characteristics of a device. All fields optional — informational context. */
export interface DeviceDisplay {
  type?: "visual" | "spatial" | "audio-only" | "tactile";
  color?: "full" | "limited" | "mono";
  refresh?: "realtime" | "slow";
  resolution?: { w: number; h: number };
  depth?: "2d" | "3d";
}

/** Input modalities available on a device. */
export interface DeviceInput {
  touch?: boolean;
  keyboard?: boolean;
  voice?: boolean;
  gaze?: boolean;
  gesture?: boolean;
  controller?: boolean;
}

/**
 * Device capability declaration (D13).
 *
 * Sent by client during session handshake. Agent reads via AFS path.
 * Server uses `primitives` map + degradation chain (D14) to adapt AUP tree.
 */
export interface DeviceCaps {
  /** Platform identifier: "web", "ios", "android", "vr", etc. */
  platform: string;
  /** Form factor: "desktop", "phone", "tablet", "watch", "tv", "headset", etc. */
  formFactor: string;
  /** Display characteristics (optional, informational) */
  display?: DeviceDisplay;
  /** Input modalities (optional, informational) */
  input?: DeviceInput;
  /** Per-primitive rendering capability */
  primitives: Record<string, PrimitiveCap>;
  /** Platform features: camera, gps, biometric, haptic, etc. */
  features?: Record<string, boolean>;
}

/** Validate DeviceCaps has required fields. Returns error string or null. */
export function validateDeviceCaps(caps: unknown): string | null {
  if (!caps || typeof caps !== "object") return "caps must be an object";
  const c = caps as Record<string, unknown>;
  if (!c.platform || typeof c.platform !== "string")
    return "caps.platform is required and must be a string";
  if (!c.formFactor || typeof c.formFactor !== "string")
    return "caps.formFactor is required and must be a string";
  if (!c.primitives || typeof c.primitives !== "object" || Array.isArray(c.primitives))
    return "caps.primitives is required and must be an object";

  const validCaps = new Set(["native", "webview", "partial", "unsupported"]);
  for (const [key, val] of Object.entries(c.primitives as Record<string, unknown>)) {
    if (typeof val !== "string" || !validCaps.has(val)) {
      return `caps.primitives.${key} must be one of: native, webview, partial, unsupported`;
    }
  }
  return null;
}

// ── Default Device Caps Presets (D16) ──

/** All AUP primitives */
export const AUP_PRIMITIVES = [
  "view",
  "text",
  "media",
  "input",
  "action",
  "overlay",
  "table",
  "time",
  "chart",
  "map",
  "calendar",
  "chat",
  "rtc",
  "explorer",
  "editor",
  "canvas",
  "afs-list",
] as const;

/** Build a primitives map with overrides and a fallback for unspecified primitives. */
export function fillPrimitives(
  overrides: Partial<Record<string, PrimitiveCap>>,
  fallback: PrimitiveCap,
): Record<string, PrimitiveCap> {
  const result: Record<string, PrimitiveCap> = {};
  for (const p of AUP_PRIMITIVES) {
    result[p] = overrides[p] ?? fallback;
  }
  return result;
}

/** TTY: stdin/stdout, text only. Everything else unsupported → degraded to text by server. */
export const DEVICE_CAPS_TTY: DeviceCaps = {
  platform: "cli",
  formFactor: "terminal",
  input: { keyboard: true },
  primitives: fillPrimitives({ text: "native" }, "unsupported"),
};

/** Term: xterm.js in browser, text + terminal subsystem. */
export const DEVICE_CAPS_TERM: DeviceCaps = {
  platform: "web",
  formFactor: "terminal",
  display: { type: "visual", color: "full", refresh: "realtime" },
  input: { keyboard: true },
  primitives: fillPrimitives({ text: "native" }, "unsupported"),
};

/** Web chat: browser with chat + basic UI. No full AUP. */
export const DEVICE_CAPS_WEB_CHAT: DeviceCaps = {
  platform: "web",
  formFactor: "desktop",
  display: { type: "visual", color: "full", refresh: "realtime" },
  input: { keyboard: true, touch: true },
  primitives: fillPrimitives(
    { text: "webview", chat: "webview", overlay: "webview", media: "webview", action: "webview" },
    "unsupported",
  ),
};

/** Web full: browser with all primitives via WebView rendering. Default for web clients. */
export const DEVICE_CAPS_WEB_FULL: DeviceCaps = {
  platform: "web",
  formFactor: "desktop",
  display: { type: "visual", color: "full", refresh: "realtime" },
  input: { keyboard: true, touch: true },
  primitives: fillPrimitives({}, "webview"),
};

// ── Validation ──

/** Check if a path contains directory traversal sequences. */
function containsTraversal(path: string): boolean {
  return /(^|[\\/])\.\.($|[\\/])/.test(path);
}

/** Validate an AUPNode has required fields. Returns error string or null. */
export function validateNode(node: unknown): string | null {
  if (!node || typeof node !== "object") return "node must be an object";
  const n = node as Record<string, unknown>;
  if (!n.id || typeof n.id !== "string") return "node.id is required and must be a string";
  if (!n.type || typeof n.type !== "string") return "node.type is required and must be a string";

  // Validate src/bind — must be strings, no javascript: or path traversal
  if (n.src !== undefined) {
    if (typeof n.src !== "string") return "node.src must be a string";
    if (n.src.toLowerCase().startsWith("javascript:"))
      return "node.src cannot use javascript: protocol";
    if (containsTraversal(n.src)) return "node.src cannot contain path traversal (..)";
  }
  if (n.bind !== undefined) {
    if (typeof n.bind !== "string") return "node.bind must be a string";
    if (n.bind.toLowerCase().startsWith("javascript:"))
      return "node.bind cannot use javascript: protocol";
    if (containsTraversal(n.bind)) return "node.bind cannot contain path traversal (..)";
  }

  // Validate events — exec paths and set.src must not contain javascript: or path traversal
  if (n.events && typeof n.events === "object") {
    for (const [, evt] of Object.entries(n.events as Record<string, unknown>)) {
      if (evt && typeof evt === "object") {
        const e = evt as Record<string, unknown>;
        if (typeof e.exec === "string") {
          if (e.exec.toLowerCase().startsWith("javascript:")) {
            return "event exec path cannot use javascript: protocol";
          }
          if (containsTraversal(e.exec)) {
            return "event exec path cannot contain path traversal (..)";
          }
        }
        // Validate set.src security
        if (e.set && typeof e.set === "object") {
          const setObj = e.set as Record<string, unknown>;
          if (typeof setObj.src === "string") {
            // Allow $args.* placeholders — they're resolved at runtime
            if (!setObj.src.startsWith("$args.")) {
              if (setObj.src.toLowerCase().startsWith("javascript:")) {
                return "event set.src cannot use javascript: protocol";
              }
              if (containsTraversal(setObj.src)) {
                return "event set.src cannot contain path traversal (..)";
              }
            }
          }
        }
      }
    }
  }

  // Recurse children
  if (n.children && Array.isArray(n.children)) {
    for (const child of n.children) {
      const err = validateNode(child);
      if (err) return err;
    }
  }
  return null;
}

/** Validate a patch op has required fields. Returns error string or null. */
export function validatePatchOp(op: unknown): string | null {
  if (!op || typeof op !== "object") return "patch op must be an object";
  const o = op as Record<string, unknown>;
  const opType = o.op;

  switch (opType) {
    case "create":
      if (!o.id || typeof o.id !== "string") return "create op requires id";
      if (!o.parentId || typeof o.parentId !== "string") return "create op requires parentId";
      if (!o.node) return "create op requires node";
      return validateNode(o.node);
    case "update":
      if (!o.id || typeof o.id !== "string") return "update op requires id";
      if (!o.props && !o.state && !o.events && o.src === undefined && !o.children)
        return "update op requires at least one of: src, props, state, events, children";
      if (o.src !== undefined) {
        if (typeof o.src !== "string" || o.src === "")
          return "update op src must be a non-empty string";
      }
      return null;
    case "remove":
      if (!o.id || typeof o.id !== "string") return "remove op requires id";
      return null;
    case "reorder":
      if (!o.id || typeof o.id !== "string") return "reorder op requires id";
      if (!o.parentId || typeof o.parentId !== "string") return "reorder op requires parentId";
      if (typeof o.index !== "number") return "reorder op requires numeric index";
      return null;
    default:
      return `unknown patch op type: ${String(opType)}`;
  }
}
