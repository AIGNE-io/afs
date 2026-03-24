import type { AFSLogger, AFSRoot, AFSUnsubscribe } from "@aigne/afs";
import { joinURL } from "ufo";
import type {
  PromptOptions,
  PromptResult,
  ReadOptions,
  UIBackend,
  ViewportInfo,
  WriteOptions,
} from "./backend.js";
import { createMockInputSource, type TTYInputSource } from "./tty.js";
import type { UiConnection, UiHttpRequest, UiHttpResponse, UiTransport } from "./ui-transport.js";
import { WEB_CLIENT_HTML } from "./web-page.js";
import { WIDGET_ASSETS, WIDGET_IMAGES } from "./widget-assets/index.js";

export interface WebBackendOptions {
  /** Port to listen on (0 = OS-assigned random port) */
  port?: number;
  /** Host to bind to */
  host?: string;
  /** For testing: custom input source (bypasses WebSocket) */
  inputSource?: TTYInputSource & { push?: (line: string) => void };
  /** For testing: custom output handler (bypasses WebSocket) */
  stdout?: { write(data: string): boolean };
  /** Custom transport factory — overrides the default Node ws transport. */
  transportFactory?: () => Promise<UiTransport>;
  /** Optional structured logger — defaults to console */
  logger?: AFSLogger;
}

/**
 * WebBackend — HTTP + WebSocket based browser UI.
 *
 * Serves a web page and communicates with it via WebSocket.
 * For agent code, this behaves identically to TTYBackend — pure text I/O.
 *
 * For testing, accepts an inputSource/stdout to bypass WebSocket entirely.
 */
export class WebBackend implements UIBackend {
  readonly type = "web";
  readonly supportedFormats = ["text", "html", "markdown", "component"];
  readonly capabilities = ["text", "html", "markdown", "component"];

  private static readonly KNOWN_COMPONENTS = new Set(["code-block", "table", "image"]);

  private port: number;
  private host: string;
  /** Transport abstraction — lazy-loaded, never imported at top level */
  private transport: UiTransport | null = null;
  private clients = new Set<UiConnection>();

  /** Input queue — fed by WebSocket messages or test inputSource */
  private inputSource: TTYInputSource & { push?: (line: string) => void };
  /** Output handler — sends to WebSocket clients or test stdout */
  private outputHandler: (data: string) => void;

  /** Queue for messages sent before any client connects */
  private pendingMessages: string[] = [];

  /** Pending prompt resolve — only one prompt at a time */
  private promptResolve: ((value: PromptResult) => void) | null = null;
  /** Pending prompt message — re-sent on client reconnect */
  private pendingPromptMessage: string | null = null;

  private testMode: boolean;
  private _url: string | null = null;

  /** Per-client session tracking */
  private sessionForClient = new Map<UiConnection, string>();
  /** Per-client session token tracking */
  private sessionTokenForClient = new Map<UiConnection, string>();
  /** Per-client caller identity (SessionContext via x-session-context, or bare from x-caller-did) */
  private callerForClient = new Map<
    UiConnection,
    { did: string; pk?: string; [key: string]: unknown }
  >();
  /** Per-client blocklet name (from handshake or x-blocklet header) */
  private blockletForClient = new Map<UiConnection, string>();
  /** Per-session blocklet name */
  private blockletForSession = new Map<string, string>();
  /** Per-session initial page (from ?page= URL param via handshake) */
  private initialPageForSession = new Map<string, string>();
  /** Per-session initial locale (from ?locale= URL param via handshake) */
  private initialLocaleForSession = new Map<string, string>();
  /** Per-session instance ID (from ?instanceId= URL param via handshake) */
  private instanceIdForSession = new Map<string, string>();
  private createSessionCallback:
    | ((
        endpoint: string,
        requestedSessionId?: string,
        requestedSessionToken?: string,
        caps?: Record<string, unknown>,
      ) =>
        | { sessionId: string; sessionToken?: string }
        | Promise<{ sessionId: string; sessionToken?: string }>)
    | null = null;
  /** AUP event handler callback */
  private aupEventHandler:
    | ((
        msg: { nodeId: string; event: string; data?: Record<string, unknown> },
        sessionId?: string,
        channelId?: string,
        caller?: { did: string; pk?: string },
      ) => Promise<unknown>)
    | null = null;

  /** Page resolver callback — returns page content for HTTP serving */
  private pageResolver:
    | ((
        pageId: string,
        sessionId?: string,
        sessionToken?: string,
      ) => Promise<{ content: string; format: string } | null>)
    | null = null;

  /** AUP dispatch handler — routes generic AUP actions (locale, etc.) to session logic */
  private aupDispatchHandler:
    | ((sessionId: string, action: Record<string, unknown>) => Promise<Record<string, unknown>[]>)
    | null = null;

  /** Snapshot resolver callback — returns snapshot HTML for a sharing slug */
  private snapshotResolver: ((slug: string) => string | null) | null = null;

  /** AFS root instance — injected via setAFS() when provider is mounted */
  private afs: AFSRoot | null = null;
  /** Per-session AFS override — when set, AFS proxy uses this instead of global this.afs */
  private afsForSession = new Map<string, AFSRoot>();
  /** Per-client AFS event subscriptions: conn → subId → unsubscribe */
  private clientSubscriptions = new Map<UiConnection, Map<string, AFSUnsubscribe>>();

  /** Live channel subscribers: channelId → set of viewer connections */
  private channelSubscribers = new Map<string, Set<UiConnection>>();
  /** Reverse map: conn → channelId (only for channel viewers) */
  private channelForClient = new Map<UiConnection, string>();
  /** Callback invoked when a viewer joins a channel — provider sends snapshot */
  private channelJoinHandler:
    | ((channelId: string, send: (msg: Record<string, unknown>) => void) => void)
    | null = null;
  /** Callback invoked when a client joins/reconnects a session — provider sends snapshot if stale */
  private sessionJoinHandler:
    | ((
        sessionId: string,
        clientVersion: number,
        send: (msg: Record<string, unknown>) => void,
      ) => void)
    | null = null;

  /** Custom transport factory — allows injection for testing or alternative runtimes */
  private transportFactory: (() => Promise<UiTransport>) | null = null;

  private readonly logger: AFSLogger;

  constructor(options: WebBackendOptions = {}) {
    this.port = options.port ?? 0;
    this.host = options.host ?? "localhost";
    this.transportFactory = options.transportFactory ?? null;
    this.logger = options.logger ?? {
      debug: (d) => console.debug(d.message, d),
      info: (d) => console.info(d.message, d),
      warn: (d) => console.warn(d.message, d),
      error: (d) => console.error(d.message, d),
    };

    if (options.inputSource) {
      this.testMode = true;
      this.inputSource = options.inputSource;
      this.outputHandler = options.stdout
        ? (data) => {
            options.stdout!.write(data);
          }
        : () => {};
    } else {
      this.testMode = false;
      const queue = createMockInputSource();
      this.inputSource = queue;
      this.outputHandler = (data) =>
        this.broadcast(JSON.stringify({ type: "write", content: data }));
    }
  }

  /** URL of the running server, or null if not started. */
  get url(): string | null {
    return this._url;
  }

  /** Register a factory that creates or reattaches a session for each new WebSocket client. */
  setSessionFactory(
    fn: (
      endpoint: string,
      requestedSessionId?: string,
      requestedSessionToken?: string,
      caps?: Record<string, unknown>,
    ) =>
      | { sessionId: string; sessionToken?: string }
      | Promise<{ sessionId: string; sessionToken?: string }>,
  ): void {
    this.createSessionCallback = fn;
  }

  /** Broadcast a raw JSON-serializable message to all connected clients. */
  broadcastRaw(msg: Record<string, unknown>): void {
    if (this.testMode) return;
    this.broadcast(JSON.stringify(msg));
  }

  /** Send a raw JSON message to the client that owns a specific session. */
  sendToSession(sessionId: string, msg: Record<string, unknown>): void {
    if (this.testMode) return;
    const data = JSON.stringify(msg);
    for (const [conn, sid] of this.sessionForClient) {
      if (sid === sessionId && conn.isOpen) {
        conn.send(data);
        return;
      }
    }
  }

  /** Get caller identity for a session (for portal-setup session context injection). */
  getCallerForSession(sessionId: string): { did: string; [key: string]: unknown } | undefined {
    for (const [conn, sid] of this.sessionForClient) {
      if (sid === sessionId) {
        return this.callerForClient.get(conn);
      }
    }
    return undefined;
  }

  /** Clear caller identity for a session (e.g., on logout). */
  clearCallerForSession(sessionId: string): void {
    for (const [conn, sid] of this.sessionForClient) {
      if (sid === sessionId) {
        this.callerForClient.delete(conn);
      }
    }
  }

  /** Send a raw JSON message to all viewers of a live channel. */
  sendToLiveChannel(channelId: string, msg: Record<string, unknown>): void {
    if (this.testMode) return;
    const viewers = this.channelSubscribers.get(channelId);
    if (!viewers) return;
    const data = JSON.stringify(msg);
    for (const conn of viewers) {
      if (conn.isOpen) conn.send(data);
    }
  }

  /** Register a handler called when a viewer joins a channel (for snapshot delivery). */
  setChannelJoinHandler(
    fn: (channelId: string, send: (msg: Record<string, unknown>) => void) => void,
  ): void {
    this.channelJoinHandler = fn;
  }

  /** Register a handler called when a client joins/reconnects a session (for snapshot replay). */
  setSessionJoinHandler(
    fn: (
      sessionId: string,
      clientVersion: number,
      send: (msg: Record<string, unknown>) => void,
    ) => void,
  ): void {
    this.sessionJoinHandler = fn;
  }

  /** Return the set of active channel IDs. */
  getActiveChannelIds(): string[] {
    return [...this.channelSubscribers.keys()];
  }

  /** Register a handler for AUP events from clients. */
  setAupEventHandler(
    fn: (
      msg: { nodeId: string; event: string; data?: Record<string, unknown> },
      sessionId?: string,
      channelId?: string,
      caller?: { did: string; pk?: string },
    ) => Promise<unknown>,
  ): void {
    this.aupEventHandler = fn;
  }

  /** Register a handler for generic AUP dispatch messages (locale change, etc.). */
  onAupDispatch(
    fn: (sessionId: string, action: Record<string, unknown>) => Promise<Record<string, unknown>[]>,
  ): void {
    this.aupDispatchHandler = fn;
  }

  /** Inject the AFS root for browser AFS proxy operations. */
  setAFS(afs: AFSRoot): void {
    this.afs = afs;
  }

  /** Set a per-session AFS override. When set, AFS proxy uses this instead of the global AFS for this session. */
  setSessionAFS(sessionId: string, afs: AFSRoot): void {
    this.afsForSession.set(sessionId, afs);
  }

  /** Get the per-session AFS override, if any. */
  getSessionAFS(sessionId: string): AFSRoot | undefined {
    return this.afsForSession.get(sessionId);
  }

  /** Register a resolver for serving pages via HTTP (/p/:id). */
  setPageResolver(
    fn: (
      pageId: string,
      sessionId?: string,
      sessionToken?: string,
    ) => Promise<{ content: string; format: string } | null>,
  ): void {
    this.pageResolver = fn;
  }

  /** Set the snapshot resolver for web sharing. */
  setSnapshotResolver(fn: (slug: string) => string | null): void {
    this.snapshotResolver = fn;
  }

  /** Get the blocklet name associated with a session (from handshake or x-blocklet header). */
  getSessionBlocklet(sessionId: string): string | undefined {
    return this.blockletForSession.get(sessionId);
  }

  /** Get and consume the initial page for a session (from ?page= URL param). */
  consumeSessionInitialPage(sessionId: string): string | undefined {
    const page = this.initialPageForSession.get(sessionId);
    if (page) this.initialPageForSession.delete(sessionId);
    return page;
  }

  /** Get and consume the initial locale for a session (from ?locale= URL param). */
  consumeSessionInitialLocale(sessionId: string): string | undefined {
    const locale = this.initialLocaleForSession.get(sessionId);
    if (locale) this.initialLocaleForSession.delete(sessionId);
    return locale;
  }

  /** Get the instance ID for a session (from ?instanceId= URL param). */
  getSessionInstanceId(sessionId: string): string | undefined {
    return this.instanceIdForSession.get(sessionId);
  }

  /** Start the HTTP + WebSocket server via the transport abstraction. */
  async listen(): Promise<{ port: number; host: string }> {
    // Lazy-load transport: default to Node ws transport, but allow injection
    const factory =
      this.transportFactory ?? (await import("./ui-transport.js")).createNodeWsTransport;
    const transport = await factory();
    this.transport = transport;

    // Wire HTTP request handler
    transport.onHttpRequest(async (req: UiHttpRequest): Promise<UiHttpResponse> => {
      const requestUrl = req.url;
      const pathname = requestUrl.split("?")[0] ?? "";
      if (pathname === "/" || pathname === "/index.html" || pathname.startsWith("/live/")) {
        return {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
          body: WEB_CLIENT_HTML,
        };
      }
      // Serve self-contained widget JS for iframe-based bridge components
      if (pathname.startsWith("/widgets/") && pathname.endsWith(".js")) {
        const name = pathname.slice("/widgets/".length, -".js".length);
        const js = WIDGET_ASSETS[name];
        if (js) {
          return {
            status: 200,
            headers: {
              "Content-Type": "application/javascript; charset=utf-8",
              "Cache-Control": "public, max-age=86400",
            },
            body: js,
          };
        }
      }
      // Serve widget image assets (e.g. marble textures for webgl-hero)
      if (pathname.startsWith("/assets/images/")) {
        const filename = pathname.slice("/assets/images/".length);
        const img = WIDGET_IMAGES[filename];
        if (img) {
          return {
            status: 200,
            headers: {
              "Content-Type": "image/jpeg",
              "Cache-Control": "public, max-age=86400",
            },
            body: img,
          };
        }
      }
      if (requestUrl.startsWith("/p/")) {
        return this.handlePageRequestPortable(requestUrl);
      }
      if (pathname.startsWith("/s/") && this.snapshotResolver) {
        return this.handleSnapshotRequestPortable(pathname);
      }
      return { status: 404, body: "Not Found" };
    });

    // Wire WebSocket connection handler
    transport.onConnection((conn, headers) => this.onConnection(conn, headers));

    // Start serving
    const result = await transport.serve({ port: this.port, host: this.host });
    this.port = result.port;
    this._url = result.url;

    return { port: this.port, host: this.host };
  }

  /** Inject an externally-managed WebSocket connection into the standard session path.
   *  Daemon and Workers create their own HTTP servers — they wrap each
   *  WebSocket as a UiConnection and inject it here instead of calling listen(). */
  injectConnection(conn: UiConnection, headers: Record<string, string | undefined> = {}): void {
    this.onConnection(conn, headers);
  }

  /** Shut down the server and disconnect all clients. */
  async close(): Promise<void> {
    // Close all WebSocket connections
    for (const conn of this.clients) {
      conn.close();
    }
    this.clients.clear();
    this.sessionForClient.clear();
    this.sessionTokenForClient.clear();
    this.callerForClient.clear();
    this.blockletForClient.clear();
    this.blockletForSession.clear();
    this.afsForSession.clear();
    this.initialPageForSession.clear();
    this.initialLocaleForSession.clear();
    this.instanceIdForSession.clear();
    this.channelSubscribers.clear();
    this.channelForClient.clear();

    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }

    this._url = null;
  }

  // ─── UIBackend Interface ──────────────────────────────────

  async write(content: string, options?: WriteOptions): Promise<void> {
    const format = options?.format ?? "text";

    if (!this.supportedFormats.includes(format)) {
      throw new Error(`Web backend does not support format: ${format}`);
    }

    if (format === "component") {
      if (!options?.component) {
        throw new Error("format 'component' requires a component type");
      }
      if (!WebBackend.KNOWN_COMPONENTS.has(options.component)) {
        throw new Error(`Unknown component type: ${options.component}`);
      }
    }

    // Sanitize HTML content server-side before sending
    const sanitizedContent = format === "html" ? sanitizeHtml(content) : content;

    if (this.testMode) {
      this.outputHandler(sanitizedContent);
      return;
    }

    const msg: Record<string, unknown> = { type: "write", content: sanitizedContent };
    if (format !== "text") {
      msg.format = format;
    }
    if (options?.component) {
      msg.component = options.component;
    }
    if (options?.componentProps) {
      msg.componentProps = options.componentProps;
    }

    const payload = JSON.stringify(msg);
    if (this.clients.size === 0) {
      this.pendingMessages.push(payload);
    } else {
      this.broadcast(payload);
    }
  }

  async read(options?: ReadOptions): Promise<string> {
    const timeout = options?.timeout ?? 0;
    if (timeout > 0) {
      return withTimeout(this.inputSource.readLine(), timeout);
    }
    return this.inputSource.readLine();
  }

  async prompt(options: PromptOptions): Promise<PromptResult> {
    if (this.testMode) {
      return this.ttyStylePrompt(options);
    }

    const msg = JSON.stringify({
      type: "prompt",
      message: options.message,
      promptType: options.type,
      options: options.options,
    });

    // Store for reconnect replay — if the client disconnects and reconnects
    // while a prompt is pending, the new client will receive it immediately
    this.pendingPromptMessage = msg;

    if (this.clients.size > 0) {
      this.broadcast(msg);
    } else {
      // No clients connected — queue so it's sent on first connect
      this.pendingMessages.push(msg);
    }

    return new Promise((resolve) => {
      this.promptResolve = resolve;
    });
  }

  async notify(message: string): Promise<void> {
    if (this.testMode) {
      this.outputHandler(`${message}\n`);
      return;
    }
    this.broadcast(JSON.stringify({ type: "notify", message }));
  }

  async navigate(
    pageId: string,
    content: string,
    format?: string,
    layout?: Record<string, string>,
  ): Promise<void> {
    // Sanitize HTML content
    const sanitizedContent = format === "html" ? sanitizeHtml(content) : content;

    if (this.testMode) {
      this.outputHandler(sanitizedContent);
      return;
    }

    const msg: Record<string, unknown> = {
      type: "navigate",
      pageId,
      content: sanitizedContent,
      format: format ?? "html",
    };
    if (layout) {
      msg.layout = layout;
    }
    this.broadcast(JSON.stringify(msg));
  }

  async clear(): Promise<void> {
    if (this.testMode) {
      this.outputHandler("\x1b[2J\x1b[H");
      return;
    }
    this.broadcast(JSON.stringify({ type: "clear" }));
  }

  hasPendingInput(): boolean {
    return this.inputSource.hasPending();
  }

  getViewport(): ViewportInfo {
    return {};
  }

  async dispose(): Promise<void> {
    await this.close();
  }

  // ─── Private ──────────────────────────────────────────────

  private onConnection(conn: UiConnection, headers: Record<string, string | undefined>): void {
    const origin = headers.origin;
    if (typeof origin === "string" && origin && !this.isAllowedWsOrigin(origin)) {
      conn.close(1008, "Invalid origin");
      return;
    }

    this.clients.add(conn);

    // Store caller identity — prefer full SessionContext, fall back to bare DID
    const sessionContextJson = headers["x-session-context"];
    if (sessionContextJson) {
      try {
        const ctx = JSON.parse(sessionContextJson);
        if (typeof ctx?.did === "string") {
          this.callerForClient.set(conn, ctx);
        }
      } catch {
        // Invalid JSON — fall through to legacy headers
      }
    }
    if (!this.callerForClient.has(conn)) {
      const callerDid = headers["x-caller-did"];
      if (callerDid) {
        this.callerForClient.set(conn, {
          did: callerDid,
          pk: headers["x-caller-pk"] ?? undefined,
        });
      }
    }

    // Store blocklet name from header (injected by daemon server)
    const blockletHeader = headers["x-blocklet"];
    if (blockletHeader) {
      this.blockletForClient.set(conn, blockletHeader);
    }

    let initialized = false;

    conn.onMessage((data) => {
      try {
        const msg = JSON.parse(data) as Record<string, unknown>;

        // First message is the handshake — route to session or channel
        if (!initialized) {
          initialized = true;
          this.onHandshake(conn, msg).catch((err) => {
            this.logger.error({
              message: "handshake failed",
              error: err instanceof Error ? err.message : String(err),
            });
            conn.close(1011, "handshake failed");
          });
          return;
        }

        this.onMessage(msg, conn);
      } catch {
        // Ignore malformed messages
      }
    });

    conn.onClose(() => {
      this.clients.delete(conn);
      // Clean up session tracking
      this.sessionForClient.delete(conn);
      this.sessionTokenForClient.delete(conn);
      this.callerForClient.delete(conn);
      this.blockletForClient.delete(conn);
      // Clean up channel tracking
      const channelId = this.channelForClient.get(conn);
      if (channelId) {
        this.channelForClient.delete(conn);
        const viewers = this.channelSubscribers.get(channelId);
        if (viewers) {
          viewers.delete(conn);
          if (viewers.size === 0) this.channelSubscribers.delete(channelId);
        }
      }
      // Clean up AFS subscriptions
      const subs = this.clientSubscriptions.get(conn);
      if (subs) {
        for (const unsub of subs.values()) unsub();
        this.clientSubscriptions.delete(conn);
      }
    });
  }

  /** Handle the first WS message as a typed handshake. */
  private async onHandshake(conn: UiConnection, msg: Record<string, unknown>): Promise<void> {
    if (msg.type === "join_channel") {
      // ── Live channel viewer ──
      const channelId = String(msg.channelId ?? "");
      if (!channelId) {
        conn.close(4000, "channelId required");
        return;
      }
      this.channelForClient.set(conn, channelId);
      if (!this.channelSubscribers.has(channelId)) {
        this.channelSubscribers.set(channelId, new Set());
      }
      this.channelSubscribers.get(channelId)!.add(conn);

      conn.send(JSON.stringify({ type: "channel", channelId }));

      // Deliver current tree snapshot to this viewer
      if (this.channelJoinHandler) {
        this.channelJoinHandler(channelId, (m) => {
          if (conn.isOpen) conn.send(JSON.stringify(m));
        });
      }
    } else {
      // ── Private session (join_session or legacy) ──
      if (this.createSessionCallback) {
        const requestedSid = msg.sessionId ? String(msg.sessionId) : undefined;
        const requestedSessionToken = msg.sessionToken ? String(msg.sessionToken) : undefined;
        const caps =
          msg.caps && typeof msg.caps === "object" && !Array.isArray(msg.caps)
            ? (msg.caps as Record<string, unknown>)
            : undefined;
        const created = await this.createSessionCallback(
          this.type,
          requestedSid,
          requestedSessionToken,
          caps,
        );
        const sessionId = created.sessionId;
        this.sessionForClient.set(conn, sessionId);
        if (created.sessionToken) this.sessionTokenForClient.set(conn, created.sessionToken);

        // Store blocklet name per-session (from handshake message or x-blocklet header)
        const blockletName =
          (msg.blocklet ? String(msg.blocklet) : undefined) ?? this.blockletForClient.get(conn);
        if (blockletName) {
          this.blockletForSession.set(sessionId, blockletName);
        }
        // Store initial page from handshake (?page= URL param)
        if (msg.page) {
          this.initialPageForSession.set(sessionId, String(msg.page));
        }
        // Store initial locale from handshake (?locale= URL param)
        if (msg.locale) {
          this.initialLocaleForSession.set(sessionId, String(msg.locale));
        }
        // Store instance ID from handshake (?instanceId= URL param)
        if (msg.instanceId) {
          this.instanceIdForSession.set(sessionId, String(msg.instanceId));
        }
        conn.send(
          JSON.stringify({
            type: "session",
            sessionId,
            sessionToken: created.sessionToken ?? null,
          }),
        );

        // Replay AUP snapshot if client is stale (or fresh connect)
        if (this.sessionJoinHandler) {
          const clientVersion =
            typeof msg.treeVersion === "number" ? (msg.treeVersion as number) : 0;
          await this.sessionJoinHandler(sessionId, clientVersion, (m) => {
            if (conn.isOpen) conn.send(JSON.stringify(m));
          });
        }
      }

      // Flush pending messages
      for (const m of this.pendingMessages) {
        conn.send(m);
      }
      this.pendingMessages = [];

      // Re-send pending prompt to reconnecting client
      if (this.pendingPromptMessage && this.promptResolve) {
        conn.send(this.pendingPromptMessage);
      }

      // If the handshake message was a regular message (legacy client), process it
      if (msg.type && msg.type !== "join_session") {
        this.onMessage(msg, conn);
      }
    }
  }

  private onMessage(msg: Record<string, unknown>, conn: UiConnection): void {
    if (String(msg.type).startsWith("afs_")) {
      this.logger.debug({
        message: "ws message received",
        type: String(msg.type),
        path: String(msg.path),
      });
    }
    switch (msg.type) {
      case "input": {
        const content = String(msg.content ?? "");
        this.inputSource.push?.(content);
        break;
      }
      case "prompt_response": {
        if (this.promptResolve) {
          const resolve = this.promptResolve;
          this.promptResolve = null;
          this.pendingPromptMessage = null;
          resolve(msg.value as PromptResult);
        }
        break;
      }
      case "aup_event": {
        if (this.aupEventHandler) {
          const sessionId = this.sessionForClient.get(conn);
          const channelId = this.channelForClient.get(conn);
          const caller = this.callerForClient.get(conn);
          const nodeId = String(msg.nodeId ?? "");
          const event = String(msg.event ?? "");
          const data = msg.data != null ? (msg.data as Record<string, unknown>) : undefined;
          this.aupEventHandler({ nodeId, event, data }, sessionId, channelId, caller)
            .then((result) => {
              if (conn.isOpen) {
                conn.send(
                  JSON.stringify({
                    type: "aup_event_result",
                    nodeId,
                    event,
                    result,
                  }),
                );
              }
            })
            .catch((err: Error) => {
              if (conn.isOpen) {
                conn.send(
                  JSON.stringify({
                    type: "aup_event_result",
                    nodeId,
                    event,
                    error: err.message,
                  }),
                );
              }
            });
        }
        break;
      }
      case "aup": {
        // AUP dispatch messages (locale change, etc.)
        const sessionId = this.sessionForClient.get(conn);
        if (sessionId && this.aupDispatchHandler) {
          this.aupDispatchHandler(sessionId, msg)
            .then((broadcasts) => {
              for (const bMsg of broadcasts) {
                this.sendToSession(sessionId, bMsg);
              }
            })
            .catch(() => {});
        }
        break;
      }
      case "navigate_request": {
        // Deep link / popstate: re-serve page content
        const pageId = String(msg.pageId ?? "");
        const afsNav = this.afs;
        if (pageId && afsNav) {
          const pagePath = joinURL("/ui/web/pages", pageId);
          afsNav
            .read?.(pagePath)
            ?.then((result) => {
              if (result.data && conn.isOpen) {
                const entry = result.data as unknown as Record<string, unknown>;
                const content = String(
                  (entry.content as Record<string, unknown>)?.content ?? entry.content ?? "",
                );
                conn.send(
                  JSON.stringify({
                    type: "navigate",
                    pageId,
                    content,
                    format: (entry.content as Record<string, unknown>)?.format ?? "html",
                  }),
                );
              }
            })
            ?.catch(() => {
              // Page not found — ignore silently
            });
        }
        break;
      }
      case "afs_read":
      case "afs_list":
      case "afs_write":
      case "afs_exec":
      case "afs_stat":
      case "afs_subscribe":
      case "afs_unsubscribe": {
        this.handleAfsMessage(msg, conn);
        break;
      }
    }
  }

  /** Handle AFS proxy messages from browser clients. */
  private handleAfsMessage(msg: Record<string, unknown>, conn: UiConnection): void {
    const reqId = msg.reqId as string | undefined;
    if (!reqId) return; // Ignore messages without reqId

    const sendResult = (data: unknown) => {
      if (conn.isOpen) {
        conn.send(JSON.stringify({ type: "afs_result", reqId, data }));
      }
    };
    const sendError = (error: string) => {
      if (conn.isOpen) {
        conn.send(JSON.stringify({ type: "afs_error", reqId, error }));
      }
    };

    // Resolve AFS: prefer per-session Runtime AFS, fall back to global
    const sessionId = this.sessionForClient.get(conn);
    const afs = (sessionId ? this.afsForSession.get(sessionId) : undefined) ?? this.afs;
    if (!afs) {
      sendError("AFS not available");
      return;
    }

    const path = String(msg.path ?? "/");
    this.logger.debug({
      message: "afs proxy",
      type: String(msg.type),
      path,
      sessionId: sessionId ?? "",
    });

    // Build AFS context with session info for downstream providers
    const caller = this.callerForClient.get(conn);
    const afsContext: Record<string, unknown> = { sessionId: sessionId ?? "" };
    if (caller?.did) afsContext.userId = caller.did;
    if (caller && "authMethod" in caller) afsContext.session = caller;

    switch (msg.type) {
      case "afs_read": {
        if (!afs.read) {
          sendError("read not supported");
          return;
        }
        afs.read(path, { context: afsContext }).then(
          (r) => sendResult(r.data),
          (e: Error) => sendError(e.message),
        );
        break;
      }
      case "afs_list": {
        const listOptions = (msg.options as Record<string, unknown>) || {};
        afs.list(path, { ...listOptions, context: afsContext }).then(
          (r) => sendResult({ data: r.data, total: r.total }),
          (e: Error) => sendError(e.message),
        );
        break;
      }
      case "afs_stat": {
        if (!afs.stat) {
          sendError("stat not supported");
          return;
        }
        afs.stat(path, { context: afsContext }).then(
          (r) => sendResult(r.data),
          (e: Error) => sendError(e.message),
        );
        break;
      }
      case "afs_write": {
        if (!afs.write) {
          sendError("write not supported");
          return;
        }
        const payload: Record<string, unknown> = {};
        if (msg.content !== undefined) payload.content = msg.content;
        if (msg.meta !== undefined) payload.meta = msg.meta;
        afs.write(path, payload, { context: afsContext }).then(
          (r) => sendResult(r.data),
          (e: Error) => sendError(e.message),
        );
        break;
      }
      case "afs_exec": {
        // Intercept /.auth/logout — AUP action clicks dispatch via exec channel,
        // so logout must be caught here before hitting real AFS exec.
        if (path === "/.auth/logout") {
          this.callerForClient.delete(conn);
          if (conn.isOpen) {
            conn.send(JSON.stringify({ type: "auth_logout" }));
          }
          sendResult({ success: true });
          break;
        }
        if (!afs.exec) {
          sendError("exec not supported");
          return;
        }
        const args = (msg.args as Record<string, unknown>) ?? {};
        afs.exec(path, args, { context: afsContext }).then(
          (r) => sendResult(r.data),
          (e: Error) => sendError(e.message),
        );
        break;
      }
      case "afs_subscribe": {
        const subId = String(msg.subId ?? "");
        const filter = (msg.filter as Record<string, string>) ?? {};
        if (!subId) {
          sendError("subId is required for subscribe");
          return;
        }
        if (!afs.subscribe) {
          sendError("subscribe not supported");
          return;
        }
        try {
          const unsub = afs.subscribe(filter, (event) => {
            if (conn.isOpen) {
              conn.send(JSON.stringify({ type: "afs_event", subId, event }));
            }
          });
          // Track for cleanup
          if (!this.clientSubscriptions.has(conn)) {
            this.clientSubscriptions.set(conn, new Map());
          }
          this.clientSubscriptions.get(conn)!.set(subId, unsub);
          sendResult(null);
        } catch (e: unknown) {
          sendError(e instanceof Error ? e.message : String(e));
        }
        break;
      }
      case "afs_unsubscribe": {
        const subId = String(msg.subId ?? "");
        const subs = this.clientSubscriptions.get(conn);
        if (subs) {
          const unsub = subs.get(subId);
          if (unsub) {
            unsub();
            subs.delete(subId);
          }
        }
        sendResult(null);
        break;
      }
    }
  }

  /** Serve a page as standalone HTML via /p/:id[?sid=xxx][&st=xxx][&bridge=1] (portable) */
  private async handlePageRequestPortable(requestUrl: string): Promise<UiHttpResponse> {
    if (!this.pageResolver) {
      return { status: 404, body: "Not Found" };
    }

    // Parse /p/:id and query params
    const url = new URL(requestUrl, "http://localhost");
    const pathParts = url.pathname.split("/").filter(Boolean); // ["p", "id"]
    let pageId = "";
    try {
      pageId = decodeURIComponent(pathParts[1] ?? "");
    } catch {
      return { status: 400, body: "Bad Request: invalid page ID encoding" };
    }
    const sessionId = url.searchParams.get("sid") ?? undefined;
    const sessionToken = url.searchParams.get("st") ?? undefined;
    const wantBridge = url.searchParams.get("bridge") === "1";

    if (!pageId) {
      return { status: 400, body: "Bad Request: missing page ID" };
    }

    try {
      const result = await this.pageResolver(pageId, sessionId, sessionToken);
      if (!result) {
        return { status: 404, body: "Page not found" };
      }

      let html: string;
      if (result.format === "html") {
        html = result.content;
      } else {
        html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body><pre>${escapeHtmlForPage(result.content)}</pre></body></html>`;
      }

      html = injectPageBaseCSS(html);

      if (wantBridge) {
        const serverOrigin = `http://127.0.0.1:${this.port}`;
        html = injectBridgeScript(html, serverOrigin);
      }

      return {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: html,
      };
    } catch {
      return { status: 500, body: "Internal Server Error" };
    }
  }

  /** Handle HTTP GET /s/:slug — serve snapshot HTML (portable) */
  private handleSnapshotRequestPortable(pathname: string): UiHttpResponse {
    if (!this.snapshotResolver) {
      return { status: 404, body: "Not Found" };
    }

    const slug = pathname.slice(3); // strip "/s/"
    if (!slug) {
      return { status: 404, body: "Not Found" };
    }

    const html = this.snapshotResolver(slug);
    if (!html) {
      return { status: 404, body: "Not Found" };
    }

    return {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
      body: html,
    };
  }

  private broadcast(data: string): void {
    for (const conn of this.clients) {
      if (conn.isOpen) {
        conn.send(data);
      }
    }
  }

  private isLoopbackHost(hostname: string): boolean {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  }

  private isAllowedWsOrigin(origin: string): boolean {
    try {
      const u = new URL(origin);
      // Allow any loopback origin (supports cross-port device connections)
      return this.isLoopbackHost(u.hostname);
    } catch {
      return false;
    }
  }

  /** TTY-style prompt for test mode (reuses TTYBackend logic) */
  private async ttyStylePrompt(options: PromptOptions): Promise<PromptResult> {
    const { message, type } = options;

    switch (type) {
      case "text":
      case "password": {
        this.outputHandler(`${message} `);
        const input = await this.read();
        return input.trim();
      }
      case "confirm": {
        this.outputHandler(`${message} (y/n) `);
        const input = await this.read();
        return input.trim().toLowerCase().startsWith("y");
      }
      case "select": {
        if (!options.options || options.options.length === 0) {
          throw new Error("select prompt requires options");
        }
        this.outputHandler(`${message}\n`);
        for (let i = 0; i < options.options.length; i++) {
          this.outputHandler(`  ${i + 1}. ${options.options[i]}\n`);
        }
        this.outputHandler("Choice: ");
        const input = await this.read();
        const idx = Number.parseInt(input.trim(), 10) - 1;
        if (idx >= 0 && idx < options.options.length) {
          return options.options[idx]!;
        }
        return options.options[0]!;
      }
      case "multiselect": {
        if (!options.options || options.options.length === 0) {
          throw new Error("multiselect prompt requires options");
        }
        this.outputHandler(`${message}\n`);
        for (let i = 0; i < options.options.length; i++) {
          this.outputHandler(`  ${i + 1}. ${options.options[i]}\n`);
        }
        this.outputHandler("Choices (comma-separated): ");
        const input = await this.read();
        const indices = input
          .split(",")
          .map((s) => Number.parseInt(s.trim(), 10) - 1)
          .filter((i) => i >= 0 && i < options.options!.length);
        return indices.map((i) => options.options![i]!);
      }
      default:
        throw new Error(`Unknown prompt type: ${type}`);
    }
  }
}

/**
 * Strip dangerous HTML: <script> tags, on* event handlers, javascript: URLs.
 */
function sanitizeHtml(html: string): string {
  const stripped = html
    // Remove <script>...</script> (including multiline)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    // Remove standalone <script> tags (unclosed)
    .replace(/<script\b[^>]*\/?>/gi, "")
    // Remove on* event attributes
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  return stripped.replace(
    /\b(href|src|action|xlink:href|formaction)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (full, attrName: string, dqValue?: string, sqValue?: string, bareValue?: string) => {
      const rawValue = dqValue ?? sqValue ?? bareValue ?? "";
      const normalized = [...rawValue]
        .filter((ch) => {
          const code = ch.charCodeAt(0);
          return code > 0x1f && code !== 0x7f && ch.trim() !== "";
        })
        .join("")
        .toLowerCase();
      const dangerous =
        normalized.startsWith("javascript:") ||
        normalized.startsWith("vbscript:") ||
        normalized.startsWith("data:text/html");
      return dangerous ? `${attrName}=""` : full;
    },
  );
}

/** Escape HTML for embedding in a minimal page shell. */
function escapeHtmlForPage(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** AUP Bridge script (~2KB) — injected into iframe pages when bridge=1. */
function buildBridgeScript(serverOrigin: string): string {
  const escaped = serverOrigin.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `<script>
(function(){
  var _msgId = 0;
  var _parentOrigin = '${escaped}';

  function _isTrustedParentMessage(e) {
    if (e.source !== parent) return false;
    if (e.origin !== _parentOrigin) return false;
    return true;
  }

  function _bridgeRequest(type, params) {
    return new Promise(function(resolve, reject) {
      var id = 'b' + (++_msgId);
      function handler(e) {
        if (!_isTrustedParentMessage(e)) return;
        if (e.data && e.data.type === 'aup_bridge_response' && e.data.id === id) {
          window.removeEventListener('message', handler);
          if (e.data.error) reject(new Error(e.data.error));
          else resolve(e.data.payload);
        }
      }
      window.addEventListener('message', handler);
      parent.postMessage({ type: type, id: id, params: params }, _parentOrigin);
    });
  }

  var _subs = {};
  window.addEventListener('message', function(e) {
    if (!_isTrustedParentMessage(e)) return;
    if (e.data && e.data.type === 'aup_subscribe_event' && e.data.subId && _subs[e.data.subId]) {
      _subs[e.data.subId](e.data.payload);
    }
  });

  window.aup = {
    emit: function(event, data) {
      parent.postMessage({ type: 'aup_event', event: event, data: data }, _parentOrigin);
    },
    on: function(event, fn) {
      window.addEventListener('message', function(e) {
        if (!_isTrustedParentMessage(e)) return;
        if (e.data && e.data.type === 'aup_data' && e.data.event === event) fn(e.data.payload);
      });
    },
    navigate: function(path) {
      parent.postMessage({ type: 'aup_navigate', path: path }, _parentOrigin);
    },
    toast: function(message, intent) {
      parent.postMessage({ type: 'aup_toast', message: message, intent: intent || 'info' }, _parentOrigin);
    },
    fetch: function(path) {
      return _bridgeRequest('aup_bridge_read', { path: path });
    },
    read: function(path) {
      return _bridgeRequest('aup_bridge_read', { path: path });
    },
    list: function(path, options) {
      return _bridgeRequest('aup_bridge_list', { path: path, options: options });
    },
    write: function(path, content, meta) {
      return _bridgeRequest('aup_bridge_write', { path: path, content: content, meta: meta });
    },
    exec: function(path, args) {
      return _bridgeRequest('aup_bridge_exec', { path: path, args: args || {} });
    },
    subscribe: function(filter, callback) {
      var subId = 'bs' + (++_msgId);
      _subs[subId] = callback;
      parent.postMessage({ type: 'aup_bridge_subscribe', subId: subId, filter: filter }, _parentOrigin);
      return function() {
        delete _subs[subId];
        parent.postMessage({ type: 'aup_bridge_unsubscribe', subId: subId }, _parentOrigin);
      };
    }
  };
})();
</script>`;
}

/** Inject bridge script into HTML — inserts before </head> or at start of <body>. */
const PAGE_BASE_CSS = `<style data-aup-base>
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --color-bg: #0a0e14; --color-surface: #131820; --color-border: #1d2433;
  --color-text: #b3b1ad; --color-dim: #626a73;
  --color-accent: #e6b450; --color-accent-bg: #2a2000;
  --font-body: "Manrope", -apple-system, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", "Fira Code", monospace;
  --radius: 8px;
  color-scheme: dark;
}
@media (prefers-color-scheme: light) {
  :root {
    --color-bg: #f5f3ef; --color-surface: #fefdfb; --color-border: #e0dcd4;
    --color-text: #2c2418; --color-dim: #8a7e6e;
    --color-accent: #b8860b; --color-accent-bg: #fef7e5;
    color-scheme: light;
  }
}
html, body { min-height: 100vh; background: var(--color-bg); color: var(--color-text); font-family: var(--font-body); line-height: 1.6; -webkit-font-smoothing: antialiased; }
a { color: var(--color-accent); }
code, pre { font-family: var(--font-mono); }
pre { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 1em; overflow-x: auto; }
img, video { max-width: 100%; height: auto; }
</style>`;

function injectPageBaseCSS(html: string): string {
  // Try before </head>
  if (html.includes("</head>")) {
    return html.replace("</head>", `${PAGE_BASE_CSS}\n</head>`);
  }
  // Try after <head...>
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch) {
    return html.replace(headMatch[0], `${headMatch[0]}\n${PAGE_BASE_CSS}`);
  }
  // Fallback: prepend
  return PAGE_BASE_CSS + html;
}

function injectBridgeScript(html: string, serverOrigin: string): string {
  const script = buildBridgeScript(serverOrigin);
  // Try before </head>
  if (html.includes("</head>")) {
    return html.replace("</head>", `${script}\n</head>`);
  }
  // Try after <body...>
  const bodyMatch = html.match(/<body[^>]*>/i);
  if (bodyMatch) {
    return html.replace(bodyMatch[0], `${bodyMatch[0]}\n${script}`);
  }
  // Fallback: prepend
  return script + html;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Input timeout")), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
