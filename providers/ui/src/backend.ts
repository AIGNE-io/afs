/**
 * UIBackend — pluggable I/O backend interface.
 *
 * Each backend (tty, web, telegram) implements this interface
 * to provide the actual I/O channel for the UI provider.
 */
export interface UIBackend {
  /** Backend type identifier */
  readonly type: string;

  /** Supported output formats */
  readonly supportedFormats: string[];

  /** Capabilities of this backend */
  readonly capabilities: string[];

  /** Write content to the output channel */
  write(content: string, options?: WriteOptions): Promise<void>;

  /** Read input from the user (blocks until input available or timeout) */
  read(options?: ReadOptions): Promise<string>;

  /**
   * Prompt the user for input with specific type.
   * Returns the user's response.
   */
  prompt(options: PromptOptions): Promise<PromptResult>;

  /** Send a non-blocking notification */
  notify(message: string): Promise<void>;

  /** Clear the output channel */
  clear(): Promise<void>;

  /** Check if there is pending input available */
  hasPendingInput(): boolean;

  /** Get viewport/dimension info */
  getViewport(): ViewportInfo;

  /** Cleanup resources */
  dispose(): Promise<void>;

  /** Navigate to a page (optional — for page-capable backends) */
  navigate?(
    pageId: string,
    content: string,
    format?: string,
    layout?: Record<string, string>,
  ): Promise<void>;
}

export interface WriteOptions {
  format?: string;
  component?: string;
  componentProps?: Record<string, unknown>;
}

export interface ReadOptions {
  timeout?: number;
}

export interface PromptOptions {
  message: string;
  type: "text" | "password" | "confirm" | "select" | "multiselect";
  options?: string[];
  defaultValue?: string | boolean;
}

export type PromptResult = string | boolean | string[];

export interface ViewportInfo {
  cols?: number;
  rows?: number;
  width?: number;
  height?: number;
}

export interface FormField {
  name: string;
  label: string;
  type: "text" | "number" | "password" | "select" | "checkbox" | "textarea";
  options?: string[];
  defaultValue?: string | number | boolean;
  required?: boolean;
}

// ── Transport Interfaces (D16: Transport ≠ Capability) ──

/** Callback types for transport handler registration */
export type SessionFactory = (
  endpoint: string,
  requestedSessionId?: string,
  requestedSessionToken?: string,
  caps?: Record<string, unknown>,
) =>
  | { sessionId: string; sessionToken?: string }
  | Promise<{ sessionId: string; sessionToken?: string }>;

export type AupEventHandler = (
  msg: { nodeId: string; event: string; data?: Record<string, unknown> },
  sessionId?: string,
  channelId?: string,
  caller?: { did: string; pk?: string },
) => Promise<unknown>;

export type ChannelJoinHandler = (
  channelId: string,
  send: (msg: Record<string, unknown>) => void,
) => void;

export type SessionJoinHandler = (
  sessionId: string,
  clientVersion: number,
  send: (msg: Record<string, unknown>) => void,
) => void | Promise<void>;

export type PageResolver = (
  pageId: string,
  sessionId?: string,
  sessionToken?: string,
) => Promise<{ content: string; format: string } | null>;

/** Backend that manages per-client sessions (e.g. WebSocket-based backends). */
export interface SessionAwareBackend {
  setSessionFactory(fn: SessionFactory): void;
}

/** Backend that can push AUP messages to sessions and live channels. */
export interface AUPTransportBackend extends SessionAwareBackend {
  sendToSession(sessionId: string, msg: Record<string, unknown>): void;
  sendToLiveChannel(channelId: string, msg: Record<string, unknown>): void;
  broadcastRaw(msg: Record<string, unknown>): void;
  getActiveChannelIds(): string[];
  setAupEventHandler(fn: AupEventHandler): void;
  setChannelJoinHandler(fn: ChannelJoinHandler): void;
  setSessionJoinHandler(fn: SessionJoinHandler): void;
  setPageResolver(fn: PageResolver): void;
  setAFS(afs: unknown): void;
}

/** Type guard: does this backend support per-client session management? */
export function isSessionAware(b: UIBackend): b is UIBackend & SessionAwareBackend {
  return (
    "setSessionFactory" in b &&
    typeof (b as Record<string, unknown>).setSessionFactory === "function"
  );
}

/** Type guard: does this backend support AUP message push to sessions/channels? */
export function isAUPTransport(b: UIBackend): b is UIBackend & AUPTransportBackend {
  return "sendToSession" in b && typeof (b as Record<string, unknown>).sendToSession === "function";
}
