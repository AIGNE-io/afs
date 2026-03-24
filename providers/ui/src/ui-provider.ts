import {
  type AFSAccessMode,
  type AFSDeleteResult,
  type AFSEntry,
  type AFSExecResult,
  type AFSExplainResult,
  type AFSListResult,
  AFSNotFoundError,
  type AFSRoot,
  type AFSStatResult,
  type AFSWriteResult,
  type CapabilitiesManifest,
  getPlatform,
  type ProviderManifest,
  type ProviderTreeSchema,
} from "@aigne/afs";
import {
  Actions,
  AFSBaseProvider,
  Delete,
  Explain,
  List,
  Meta,
  Read,
  type RouteContext,
  Stat,
  Write,
} from "@aigne/afs/provider";
import { joinURL } from "ufo";
import { z } from "zod";
import { runAgent } from "./agent-core.js";
import type { AUPNodeStore, AUPSceneManager } from "./aup-protocol.js";
import {
  COMPONENTS,
  OVERLAY_THEMES,
  PRIMITIVES,
  STYLE_PALETTES,
  STYLE_RECIPES,
  STYLE_TONES,
  THEMES,
} from "./aup-registry.js";
import { AUPSessionLogic } from "./aup-session-logic.js";
import { AUPSessionRegistry, type SessionLogicFactory } from "./aup-session-registry.js";
import { AUP_EXAMPLES, AUP_SPEC } from "./aup-spec.js";
import {
  DEVICE_CAPS_TERM,
  DEVICE_CAPS_TTY,
  DEVICE_CAPS_WEB_FULL,
  type DeviceCaps,
  validateDeviceCaps,
  validateNode,
} from "./aup-types.js";
import { isAUPTransport, isSessionAware, type UIBackend } from "./backend.js";
import { degradeTree } from "./degradation.js";
import { type Session, SessionManager } from "./session.js";
import { generateSnapshot } from "./snapshot.js";
import { TermBackend, type TermBackendOptions } from "./term.js";
import { TTYBackend, type TTYBackendOptions } from "./tty.js";
import { initVersion } from "./version.js";
import { WebBackend, type WebBackendOptions } from "./web.js";
/** Minimal AFS facade for agent submit (explorer-app excluded in OSS). */
interface ExplorerAFS {
  read(path: string): Promise<{ data?: unknown }>;
  list(path: string): Promise<{ data: unknown[] }>;
  stat?(path: string): Promise<{ data?: unknown }>;
  explain?(path: string): Promise<{ data?: unknown }>;
  exec?(path: string, args?: Record<string, unknown>): Promise<{ data?: unknown }>;
}

export interface AFSUIProviderOptions {
  name?: string;
  description?: string;
  backend?: "tty" | "web" | "term" | UIBackend;
  /** TTY backend options (only used when backend is "tty" and no web server needed) */
  ttyOptions?: TTYBackendOptions;
  /** Web backend options (only used when backend is "web") */
  webOptions?: WebBackendOptions;
  /** Term backend options (only used when backend is "term") */
  termOptions?: TermBackendOptions;
  /** Input timeout in ms (0 = no timeout) */
  inputTimeout?: number;
  /** Directory to persist pages (default: .afs-ui/pages). Set false to disable. */
  pagesDir?: string | false;
  /** Directory to persist session state (tree + metadata). Set false to disable. Default: .afs-ui/sessions */
  sessionsDir?: string | false;
  /** Maximum inactive duration before session GC (ms). Default: 30 minutes. */
  sessionMaxInactiveMs?: number;
}

interface PageData {
  content: string;
  format: string;
  layout?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

/** Shape of a persisted session file on disk. */
interface SessionDiskData {
  resumeToken: string;
  endpoint: string;
  tree: unknown;
  renderOptions?: Record<string, unknown>;
}

interface SharingEntryMeta {
  title?: string;
  description?: string;
  image?: string;
}

interface SharingEntry {
  target: string;
  access: "guest" | "link-only" | "user" | "admin";
  mode: "static" | "live";
  slug: string;
  meta?: SharingEntryMeta;
  /** Frozen HTML snapshot (populated by Phase 1 snapshot action) */
  snapshot?: string;
  createdAt: number;
  updatedAt: number;
}

const VALID_ACCESS_LEVELS = new Set(["guest", "link-only", "user", "admin"]);
const VALID_SHARING_MODES = new Set(["static", "live"]);

const afsUISchema = z.object({
  backend: z.enum(["tty", "web", "term"]).default("tty"),
  port: z.coerce.number().optional(),
});

// ── Static Registries (imported from aup-registry.ts) ──

export class AFSUIProvider extends AFSBaseProvider {
  readonly name: string;
  readonly description: string;
  override readonly accessMode: AFSAccessMode = "readwrite";

  protected backend: UIBackend;
  private inputTimeout: number;
  private pages = new Map<string, PageData>();
  private pagesDir: string | false;
  private sessionsDir: string | false;
  /** Per-session debounce timers for disk persistence. */
  private sessionPersistTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Sessions that have been fully initialized via onSessionStart. */
  private sessionsInitialized = new Set<string>();
  private initPromise: Promise<void> | null = null;
  private serverUrl: string | null = null;
  /** Web sharing entries: slug -> SharingEntry */
  private sharingEntries = new Map<string, SharingEntry>();

  /** Session management */
  readonly sessions = new SessionManager();
  /** Per-session AUP logic (stores + scene managers + WM operations) */
  private readonly aupRegistry: AUPSessionRegistry;
  /** Session GC threshold in milliseconds. */
  private sessionMaxInactiveMs: number;
  // WM state now lives in the AUP tree — wmStores removed
  /** AFS root reference for auto-dispatching AUP events to afs.exec() */
  private afsRoot: AFSRoot | null = null;

  /**
   * Resolve the AFS root for a given session.
   * Prefers per-session AFS (blocklet runtime AFS) over the global AFS root.
   */
  private resolveExecAFS(sessionId: string): AFSRoot | null {
    const sessionAFS = (this.backend as any).getSessionAFS?.(sessionId) as AFSRoot | undefined;
    return sessionAFS ?? this.afsRoot;
  }
  /** Endpoint type derived from backend (tty, web, term) */
  readonly endpointType: string;
  /** External callback for AUP events — allows app code to handle navigation etc. */
  onAupEvent?: (
    sessionId: string,
    nodeId: string,
    event: string,
    config: { exec: string; args: Record<string, unknown> },
  ) => Promise<unknown> | unknown;
  /**
   * External callback fired when a new session starts (first client connection).
   * Use this to build the initial UI tree (e.g. desktop, explorer, terminal).
   * Called only once per session — when getRoot() returns null.
   * Future: will fire after user authentication to build personalized UI.
   */
  onSessionStart?: (sessionId: string, logic: AUPSessionLogic) => Promise<void> | void;
  constructor(options: AFSUIProviderOptions = {}) {
    super();
    this.aupRegistry = new AUPSessionRegistry(this.createSessionLogicFactory());
    this.name = options.name ?? "ui";
    this.description = options.description ?? "Interactive UI device";
    this.inputTimeout = options.inputTimeout ?? 0;
    this.pagesDir = options.pagesDir ?? ""; // empty = auto-discover in onMount
    this.sessionsDir = options.sessionsDir ?? ""; // empty = auto-discover in onMount
    this.sessionMaxInactiveMs = Math.max(0, options.sessionMaxInactiveMs ?? 30 * 60 * 1000);

    if (typeof options.backend === "object") {
      this.backend = options.backend;
      // Auto-detect URL from already-constructed backend
      if ("url" in this.backend && typeof (this.backend as { url?: string }).url === "string") {
        this.serverUrl = (this.backend as { url: string }).url;
      }
    } else if (options.backend === "web") {
      const webOpts = { ...options.webOptions };
      if ((options as Record<string, unknown>).port != null) {
        webOpts.port = (options as Record<string, unknown>).port as number;
      }
      const web = new WebBackend(webOpts);
      this.backend = web;
      this.initPromise = web.listen().then(() => {
        this.serverUrl = web.url;
      });
    } else if (options.backend === "term") {
      const termOpts = { ...options.termOptions };
      if ((options as Record<string, unknown>).port != null) {
        termOpts.port = (options as Record<string, unknown>).port as number;
      }
      const term = new TermBackend(termOpts);
      this.backend = term;
      this.initPromise = term.listen().then(() => {
        this.serverUrl = term.url;
      });
    } else {
      // Default: plain TTY (no server)
      this.backend = new TTYBackend({
        ...options.ttyOptions,
        inputTimeout: this.inputTimeout,
      });
    }

    // Derive endpoint type from backend
    this.endpointType = this.backend.type;

    // Session-aware backends: allocate a session per connected client
    if (isSessionAware(this.backend)) {
      // Resolve default DeviceCaps based on backend type
      const defaultCaps: DeviceCaps =
        this.backend.type === "term" ? DEVICE_CAPS_TERM : DEVICE_CAPS_WEB_FULL;

      this.backend.setSessionFactory(
        async (
          endpoint: string,
          requestedSid?: string,
          requestedSessionToken?: string,
          rawCaps?: Record<string, unknown>,
        ): Promise<{ sessionId: string; sessionToken?: string }> => {
          this.gcStaleSessions();

          // Validate and resolve device caps from client handshake
          const caps: DeviceCaps =
            rawCaps && !validateDeviceCaps(rawCaps)
              ? (rawCaps as unknown as DeviceCaps)
              : defaultCaps;

          if (requestedSid && this.sessions.has(requestedSid)) {
            const existing = this.sessions.get(requestedSid);
            // Require token match for session resume; otherwise issue a fresh session.
            if (requestedSessionToken && requestedSessionToken === existing.resumeToken) {
              existing.touch();
              // Update caps on reconnect (device may have changed)
              existing.setDeviceCaps(caps);
              return { sessionId: requestedSid, sessionToken: existing.resumeToken };
            }
            const rotated = this.sessions.create(endpoint, caps);
            return { sessionId: rotated.id, sessionToken: rotated.resumeToken };
          }

          // Try restoring session from disk (survives service restart)
          if (requestedSid && requestedSessionToken) {
            const restored = await this.restoreSessionFromDisk(
              requestedSid,
              requestedSessionToken,
              endpoint,
              caps,
            );
            if (restored) {
              // Re-persist with new resumeToken (rotated on restore)
              this.scheduleSessionPersist(restored.sessionId);
              return restored;
            }
          }

          const fresh = this.sessions.create(endpoint, caps);
          return { sessionId: fresh.id, sessionToken: fresh.resumeToken };
        },
      );
    }

    // AUP transport: wire event handler + channel/session join handlers
    if (isAUPTransport(this.backend)) {
      this.backend.setAupEventHandler(async (msg, sessionId, channelId, caller) => {
        const storeId = channelId ? this.channelAupKey(channelId) : sessionId;
        if (!storeId) throw new Error("No session or channel for AUP event");
        return this.handleAupEvent(storeId, msg.nodeId, msg.event, msg.data, caller);
      });
      if ("onAupDispatch" in this.backend) {
        (this.backend as any).onAupDispatch(
          async (sessionId: string, action: Record<string, unknown>) => {
            const logic = this.aupRegistry.getOrCreate(sessionId);
            const result = await logic.dispatch(
              action as { action?: string; [key: string]: unknown },
            );
            return result.broadcast ?? [];
          },
        );
      }
      this.backend.setChannelJoinHandler((channelId, send) => {
        const store = this.aupRegistry.get(this.channelAupKey(channelId))?.getStore();
        const root = store?.getRoot();
        if (store && root) {
          const opts = store.renderOptions;
          const msg: Record<string, unknown> = {
            type: "aup",
            action: "render",
            root,
            treeVersion: store.version,
          };
          if (opts.fullPage) msg.fullPage = true;
          if (opts.chrome) msg.chrome = true;
          if (opts.tone) msg.tone = opts.tone;
          if (opts.palette) msg.palette = opts.palette;
          if (opts.locale) msg.locale = opts.locale;
          if (opts.title) msg.title = opts.title;
          if (opts.page) msg.page = opts.page;
          send(msg);
        }
      });

      // Replay AUP snapshot to reconnecting session clients (with degradation)
      this.backend.setSessionJoinHandler(async (sessionId, clientVersion, send) => {
        // Fire onSessionStart if not yet called for this session.
        // This covers: fresh sessions, disk-restored sessions (tree exists but
        // runtime state like pageResolver/data mounts is missing).
        const logic = this.aupRegistry.getOrCreate(sessionId);
        let freshlyInitialized = false;
        if (!this.sessionsInitialized.has(sessionId) && this.onSessionStart) {
          await this.onSessionStart(sessionId, logic);
          this.sessionsInitialized.add(sessionId);
          freshlyInitialized = true;
        }

        // For reconnecting sessions, apply pending locale from URL handshake.
        // onSessionStart (portal-setup) handles locale for fresh sessions, but
        // reconnecting sessions skip onSessionStart — consume locale here instead.
        if (!freshlyInitialized && this.backend instanceof WebBackend) {
          const pendingLocale = this.backend.consumeSessionInitialLocale(sessionId);
          if (pendingLocale && pendingLocale !== logic.locale) {
            logic.handleLocaleChange(pendingLocale);
          }
        }

        // Look up session for device caps degradation
        const session = this.sessions.has(sessionId) ? this.sessions.get(sessionId) : null;

        // Check scene manager first — if there's an active scene, replay that
        const mgr = this.aupRegistry.get(sessionId)?.getSceneManager();
        const activeScene = mgr?.getActiveScene();
        if (activeScene) {
          const { store } = activeScene;
          const root = store.getRoot();
          if (root) {
            // Skip replay if client is up-to-date, but always send for freshly
            // initialized sessions (client's version is from a stale session)
            if (!freshlyInitialized && clientVersion > 0 && clientVersion >= store.version) return;
            const degraded = session ? this.degradeForSession(root, session) : root;
            const opts = store.renderOptions;
            const msg: Record<string, unknown> = {
              type: "aup",
              action: "stage",
              sceneId: activeScene.sceneId,
              root: degraded,
              treeVersion: store.version,
            };
            if (opts.fullPage) msg.fullPage = true;
            if (opts.chrome) msg.chrome = true;
            if (opts.tone) msg.tone = opts.tone;
            if (opts.palette) msg.palette = opts.palette;
            if (opts.locale) msg.locale = opts.locale;
            if (opts.title) msg.title = opts.title;
            if (opts.page) msg.page = opts.page;
            // Include session context so client-side $session.* visibility works
            const sceneSessionCtx = logic.getSessionContext();
            if (sceneSessionCtx) msg.sessionContext = sceneSessionCtx;
            send(msg);
            // Also send take so client knows to activate it
            send({ type: "aup", action: "take", sceneId: activeScene.sceneId });
            return;
          }
        }

        // Fallback: legacy aup_render store
        const store = this.aupRegistry.get(sessionId)?.getStore();
        if (!store) return;
        const root = store.getRoot();
        if (!root) return;
        // Client is up-to-date — skip replay (but always send for fresh sessions)
        if (!freshlyInitialized && clientVersion > 0 && clientVersion >= store.version) return;
        const degraded = session ? this.degradeForSession(root, session) : root;
        const opts = store.renderOptions;
        const msg: Record<string, unknown> = {
          type: "aup",
          action: "render",
          root: degraded,
          treeVersion: store.version,
        };
        if (opts.fullPage) msg.fullPage = true;
        if (opts.chrome) msg.chrome = true;
        if (opts.tone) msg.tone = opts.tone;
        if (opts.palette) msg.palette = opts.palette;
        if (opts.locale) msg.locale = opts.locale;
        if (opts.title) msg.title = opts.title;
        if (opts.page) msg.page = opts.page;
        // Include session context so client-side $session.* visibility works
        const sessionCtx = logic.getSessionContext();
        if (sessionCtx) msg.sessionContext = sessionCtx;
        send(msg);

        // Note: session reconnect locale sync is handled client-side.
        // The client checks if ?locale= differs from server-sent locale
        // and sends a locale change request if needed.
      });

      // Wire page resolver for HTTP /p/:id serving (frame primitive)
      this.backend.setPageResolver(async (pageId, sessionId, sessionToken) => {
        if (sessionId && sessionToken && this.sessions.has(sessionId)) {
          const session = this.sessions.get(sessionId);
          if (session.resumeToken === sessionToken) {
            const page = session.getPage(pageId);
            if (page) return { content: page.content, format: page.format };
          }
        }
        const page = this.pages.get(pageId);
        if (page) return { content: page.content, format: page.format };
        return null;
      });

      // Wire snapshot resolver for HTTP /s/:slug serving (web sharing)
      if ("setSnapshotResolver" in this.backend) {
        (this.backend as import("./web.js").WebBackend).setSnapshotResolver((slug: string) => {
          const entry = this.sharingEntries.get(slug);
          if (!entry?.snapshot) return null;
          return entry.snapshot;
        });
      }
    }

    // TTY: auto-create a default session (there's only one terminal)
    if (this.endpointType === "tty") {
      this.sessions.create("tty", DEVICE_CAPS_TTY);
    }
  }

  /**
   * Create the factory function for session logic instances.
   * Override in subclass to use a different session logic class (e.g. without WM).
   */
  protected createSessionLogicFactory(): SessionLogicFactory {
    return () => new AUPSessionLogic();
  }

  /** Wait for the underlying transport (HTTP/WS server) to be ready. */
  async ready(): Promise<void> {
    if (this.initPromise) await this.initPromise;
  }

  /** Inject AFS root into AUP transport for browser AFS proxy + discover pages dir. */
  onMount(root: AFSRoot, _mountPath?: string): void {
    this.afsRoot = root;
    if (isAUPTransport(this.backend)) {
      this.backend.setAFS(root);
    }
    // Initialize version string (async, best-effort — used by snapshot/web-page)
    initVersion();
    // Discover workspace path for page persistence (async, best-effort)
    if (this.pagesDir !== false) {
      this.discoverAndLoadPages(root);
    }
    // Discover sessionsDir path (async, best-effort)
    if (this.sessionsDir !== false) {
      this.discoverSessionsDir(root);
    }
  }

  /** Discover workspace path from AFS root meta, then load persisted pages. */
  private async discoverAndLoadPages(root: AFSRoot): Promise<void> {
    const platform = getPlatform();
    try {
      // If pagesDir was explicitly set, use it directly
      if (this.pagesDir) {
        await this.loadPagesFromDisk(this.pagesDir);
        return;
      }
      // Auto-discover: read /.meta for workspace storagePath
      if (root.read) {
        try {
          const result = await root.read("/.meta");
          const storagePath = result?.data?.content?.storagePath as string | undefined;
          if (storagePath) {
            this.pagesDir = platform.path.join(storagePath, ".afs-ui", "pages");
            await this.loadPagesFromDisk(this.pagesDir);
            return;
          }
        } catch {
          // no workspace meta
        }
      }
      // Fallback: cwd/.afs-ui/pages
      const cwd = platform.process?.cwd?.() ?? ".";
      this.pagesDir = platform.path.join(cwd, ".afs-ui", "pages");
      await this.loadPagesFromDisk(this.pagesDir);
    } catch {
      // persistence disabled
    }
  }

  /** Load persisted page files from disk into the pages Map. */
  private async loadPagesFromDisk(dir: string): Promise<void> {
    const platform = getPlatform();
    if (!platform.fs) return;
    const exists = await platform.fs.exists(dir);
    if (!exists) return;
    const files = await platform.fs.readdir(dir);
    for (const file of files) {
      if (file.startsWith(".")) continue;
      try {
        const content = await platform.fs.readTextFile(platform.path.join(dir, file));
        const now = Date.now();
        this.pages.set(file, { content, format: "html", createdAt: now, updatedAt: now });
      } catch {
        // skip unreadable files
      }
    }
  }

  /** Persist a page to disk as a plain file (best-effort, fire-and-forget). */
  private persistPageToDisk(pageId: string, data: PageData): void {
    if (!this.pagesDir) return;
    const platform = getPlatform();
    if (!platform.fs) return;
    const dir = this.pagesDir;
    const filePath = platform.path.join(dir, pageId);
    // Fire-and-forget async write
    (async () => {
      try {
        const exists = await platform.fs!.exists(dir);
        if (!exists) await platform.fs!.mkdir(dir, { recursive: true });
        await platform.fs!.writeFile(filePath, data.content);
      } catch {
        // best-effort
      }
    })();
  }

  /** Remove a persisted page from disk (best-effort, fire-and-forget). */
  private removePageFromDisk(pageId: string): void {
    if (!this.pagesDir) return;
    const platform = getPlatform();
    if (!platform.fs) return;
    const filePath = platform.path.join(this.pagesDir, pageId);
    // Fire-and-forget async remove
    (async () => {
      try {
        const exists = await platform.fs!.exists(filePath);
        if (exists) await platform.fs!.rm(filePath);
      } catch {
        // best-effort
      }
    })();
  }

  // ── Session State Persistence ──

  /** Discover sessionsDir path from AFS root meta (async, best-effort). */
  private async discoverSessionsDir(root: AFSRoot): Promise<void> {
    if (this.sessionsDir) return; // already set explicitly
    const platform = getPlatform();
    try {
      if (root.read) {
        const result = await root.read("/.meta");
        const storagePath = result?.data?.content?.storagePath as string | undefined;
        if (storagePath) {
          this.sessionsDir = platform.path.join(storagePath, ".afs-ui", "sessions");
          return;
        }
      }
    } catch {
      // no workspace meta
    }
    const cwd = platform.process?.cwd?.() ?? ".";
    this.sessionsDir = platform.path.join(cwd, ".afs-ui", "sessions");
  }

  /** Schedule a debounced persist of session state to disk. */
  protected scheduleSessionPersist(sessionId: string): void {
    if (this.sessionsDir === false || !this.sessionsDir) return;
    const existing = this.sessionPersistTimers.get(sessionId);
    if (existing) clearTimeout(existing);
    this.sessionPersistTimers.set(
      sessionId,
      setTimeout(() => {
        this.sessionPersistTimers.delete(sessionId);
        this.persistSessionToDisk(sessionId);
      }, 400),
    );
  }

  /** Write session metadata + AUP tree to disk (best-effort, fire-and-forget). */
  private persistSessionToDisk(sessionId: string): void {
    if (this.sessionsDir === false || !this.sessionsDir) return;
    const platform = getPlatform();
    if (!platform.fs) return;
    const session = this.sessions.has(sessionId) ? this.sessions.get(sessionId) : null;
    if (!session) return;
    const store = this.aupRegistry.get(sessionId)?.getStore();
    const root = store?.getRoot();
    if (!root) return;
    const dir = this.sessionsDir;
    const filePath = platform.path.join(dir, `${sessionId}.json`);
    const payload = JSON.stringify({
      resumeToken: session.resumeToken,
      endpoint: session.endpoint,
      tree: root,
      renderOptions: store!.renderOptions as Record<string, unknown>,
    } satisfies SessionDiskData);
    (async () => {
      try {
        const exists = await platform.fs!.exists(dir);
        if (!exists) await platform.fs!.mkdir(dir, { recursive: true });
        await platform.fs!.writeFile(filePath, payload);
      } catch {
        // best-effort
      }
    })();
  }

  /** Try to restore a session from disk. Returns session info on success, null on failure. */
  private async restoreSessionFromDisk(
    sessionId: string,
    sessionToken: string,
    endpoint: string,
    caps: DeviceCaps,
  ): Promise<{ sessionId: string; sessionToken?: string } | null> {
    if (this.sessionsDir === false || !this.sessionsDir) return null;
    const platform = getPlatform();
    if (!platform.fs) return null;
    const filePath = platform.path.join(this.sessionsDir, `${sessionId}.json`);
    try {
      const exists = await platform.fs.exists(filePath);
      if (!exists) return null;
      const raw = await platform.fs.readTextFile(filePath);
      const data = JSON.parse(raw) as SessionDiskData;
      if (!data.resumeToken || data.resumeToken !== sessionToken) return null;
      // Reclaim the session with its original ID
      const session = this.sessions.createWithId(sessionId, endpoint, caps);
      // Restore AUP tree
      if (data.tree) {
        const logic = this.aupRegistry.getOrCreate(sessionId);
        const store = logic.getStore();
        store.setRoot(data.tree as import("./aup-types.js").AUPNode);
        if (data.renderOptions) {
          store.setRenderOptions(
            data.renderOptions as import("./aup-protocol.js").AUPRenderOptions,
          );
        }
      }
      return { sessionId, sessionToken: session.resumeToken };
    } catch {
      return null;
    }
  }

  /** Remove a persisted session file from disk (best-effort, fire-and-forget). */
  private removeSessionFromDisk(sessionId: string): void {
    if (this.sessionsDir === false || !this.sessionsDir) return;
    const platform = getPlatform();
    if (!platform.fs) return;
    const filePath = platform.path.join(this.sessionsDir, `${sessionId}.json`);
    (async () => {
      try {
        const exists = await platform.fs!.exists(filePath);
        if (exists) await platform.fs!.rm(filePath);
      } catch {
        // best-effort
      }
    })();
  }

  /** Assert the endpoint param matches this provider's type */
  protected assertEndpoint(ctx: RouteContext): string {
    this.gcStaleSessions();
    const endpoint = ctx.params.endpoint as string;
    if (endpoint !== this.endpointType) throw new AFSNotFoundError(`/${endpoint}`);
    return endpoint;
  }

  /** Reclaim stale sessions and cleanup corresponding AUP session state. */
  private gcStaleSessions(): void {
    if (this.sessionMaxInactiveMs <= 0) return;

    const beforeIds = new Set(this.sessions.list().map((s) => s.id));
    this.sessions.gc(this.sessionMaxInactiveMs);
    const afterIds = new Set(this.sessions.list().map((s) => s.id));

    // Remove AUP state and disk files for sessions reclaimed by SessionManager.gc().
    for (const sid of beforeIds) {
      if (!afterIds.has(sid)) {
        this.aupRegistry.destroy(sid);
        this.sessionsInitialized.delete(sid);
        this.removeSessionFromDisk(sid);
      }
    }

    // Also cleanup orphaned non-live AUP session state.
    const aupKeys = [...this.aupRegistry.keys()];
    for (const key of aupKeys) {
      if (key.startsWith("live:")) continue;
      if (!afterIds.has(key)) {
        this.aupRegistry.destroy(key);
      }
    }
  }

  /** Resolve session from route params, throwing if not found.
   *  Accepts `~` as alias for the most recently active session of the endpoint. */
  protected resolveSession(ctx: RouteContext): Session {
    this.assertEndpoint(ctx);
    const sid = ctx.params.sid as string;
    if (sid === "~") {
      const endpoint = ctx.params.endpoint as string;
      const sessions = this.sessions.list(endpoint);
      if (sessions.length === 0) throw new Error(`No active sessions for endpoint "${endpoint}"`);
      // Pick the most recently active session
      sessions.sort((a, b) => b.lastActive - a.lastActive);
      return sessions[0]!;
    }
    return this.sessions.get(sid);
  }

  /** Get AUP logic for a session (public — for external event handlers like portal-setup). */
  getSessionAupLogic(sessionId: string): AUPSessionLogic {
    return this.aupRegistry.getOrCreate(sessionId);
  }

  /** Send a message to a specific session's client (public — for external event handlers). */
  sendToSession(sessionId: string, msg: Record<string, unknown>): void {
    if (isAUPTransport(this.backend)) {
      this.backend.sendToSession(sessionId, msg);
    }
  }

  /** Get or create AUP node store for a session */
  protected getAupLogic(sessionId: string): AUPSessionLogic {
    return this.aupRegistry.getOrCreate(sessionId);
  }

  protected getAupStore(sessionId: string): AUPNodeStore {
    return this.getAupLogic(sessionId).getStore();
  }

  private getAupManager(sessionId: string): AUPSceneManager {
    return this.getAupLogic(sessionId).getSceneManager();
  }

  /** AUP store key for a live channel */
  private channelAupKey(channelId: string): string {
    return `live:${channelId}`;
  }

  /** Get or create AUP node store for a live channel */
  private getChannelAupStore(channelId: string): AUPNodeStore {
    const key = this.channelAupKey(channelId);
    return this.aupRegistry.getOrCreate(key).getStore();
  }

  /** Degrade an AUP root for a session's device capabilities (D14). */
  private degradeForSession(
    root: import("./aup-types.js").AUPNode,
    session: Session,
  ): import("./aup-types.js").AUPNode {
    return degradeTree(root, session.deviceCaps);
  }

  /** Count active live channels (stores with live: prefix that have content) */
  private getActiveChannelCount(): number {
    let count = 0;
    for (const key of this.aupRegistry.keys()) {
      if (key.startsWith("live:")) count++;
    }
    return count;
  }

  /** List active channel IDs */
  private getActiveChannelIds(): string[] {
    const ids: string[] = [];
    for (const key of this.aupRegistry.keys()) {
      if (key.startsWith("live:")) ids.push(key.slice(5));
    }
    // Also include channels with connected viewers (even if no tree yet)
    if (isAUPTransport(this.backend)) {
      for (const id of this.backend.getActiveChannelIds()) {
        if (!ids.includes(id)) ids.push(id);
      }
    }
    return ids;
  }

  /** Handle an AUP event from a client — resolve exec path and call it */
  private async handleAupEvent(
    sessionId: string,
    nodeId: string,
    event: string,
    data?: Record<string, unknown>,
    caller?: { did: string; pk?: string },
  ): Promise<unknown> {
    const logic = this.aupRegistry.get(sessionId);
    const store = this.getAupStore(sessionId);
    const node = store.findNode(nodeId);
    if (!node) throw new Error(`AUP node not found: ${nodeId}`);

    // ── Built-in WM / surface events — delegate to AUPSessionLogic ──
    if (logic && (node.type === "wm" || node.type === "wm-surface")) {
      // Wire onExecEvent so handleEvent can resolve external exec paths
      const prevHandler = logic.onExecEvent;
      logic.onExecEvent = async (_nid, _evt, execPath, args) => {
        if (this.onAupEvent) {
          const result = await this.onAupEvent(sessionId, _nid, _evt, { exec: execPath, args });
          if (result !== undefined) return result;
        }
        const execAFS = this.resolveExecAFS(sessionId);
        if (execAFS?.exec) {
          const context: Record<string, unknown> = { sessionId };
          if (caller?.did) context.userId = caller.did;
          if (caller && "authMethod" in caller) context.session = caller;
          const execResult = await execAFS.exec(execPath, args, { context });
          return execResult?.data;
        }
        return { nodeId: _nid, event: _evt, exec: execPath, args };
      };
      try {
        const result = await logic.handleEvent(nodeId, event, data);
        // Broadcast patch messages to client
        if (result.broadcast && isAUPTransport(this.backend)) {
          for (const msg of result.broadcast) {
            this.backend.sendToSession(sessionId, msg);
          }
        }
        this.scheduleSessionPersist(sessionId);
        return result.returnValue;
      } catch {
        // Not a built-in WM/surface event — fall through to generic event handling
      } finally {
        logic.onExecEvent = prevHandler;
      }
    }

    const evtConfig = node.events?.[event];
    if (!evtConfig) {
      // Agent/command-bar submit — route to internal handler directly
      if (event === "submit" && (node.type === "agent" || node.type === "command-bar")) {
        const internalResult = await this.handleInternalPrimitiveEvent(
          sessionId,
          nodeId,
          "agent-submit",
          data ?? {},
          store,
          caller,
        );
        if (internalResult !== undefined) return internalResult;
      }
      // Overlay-generated events (confirm, cancel, select) may not have exec config.
      // Pass them to onAupEvent with a synthetic config if a handler is registered.
      if (this.onAupEvent) {
        const config = { exec: event, args: data ?? {} };
        const result = await this.onAupEvent(sessionId, nodeId, event, config);
        if (result !== undefined) return result;
      }
      // No handler or handler didn't handle it — report error
      if (!node.events) throw new Error(`Node '${nodeId}' has no events`);
      throw new Error(`Node '${nodeId}' has no '${event}' event`);
    }

    // ── page / target+set dispatch — delegate to AUPSessionLogic ──
    if (logic && (evtConfig.page || evtConfig.target)) {
      const prevHandler = logic.onExecEvent;
      logic.onExecEvent = async (_nid, _evt, execPath, args) => {
        if (this.onAupEvent) {
          const result = await this.onAupEvent(sessionId, _nid, _evt, { exec: execPath, args });
          if (result !== undefined) return result;
        }
        const execAFS2 = this.resolveExecAFS(sessionId);
        if (execAFS2?.exec) {
          const context: Record<string, unknown> = { sessionId };
          if (caller?.did) context.userId = caller.did;
          if (caller && "authMethod" in caller) context.session = caller;
          const execResult = await execAFS2.exec(execPath, args, { context });
          return execResult?.data;
        }
        return { nodeId: _nid, event: _evt, exec: execPath, args };
      };
      try {
        const result = await logic.handleEvent(nodeId, event, data);
        if (result.broadcast && isAUPTransport(this.backend)) {
          for (const msg of result.broadcast) {
            this.backend.sendToSession(sessionId, msg);
          }
        }
        this.scheduleSessionPersist(sessionId);
        return result.returnValue;
      } finally {
        logic.onExecEvent = prevHandler;
      }
    }

    // ── navigate dispatch — client-side, return URL ──
    if (evtConfig.navigate) {
      return { navigate: evtConfig.navigate };
    }

    // ── exec dispatch — resolve exec path and call it ──
    const execPath = evtConfig.exec;
    if (!execPath || typeof execPath !== "string") throw new Error("Event exec path is required");
    if (execPath.includes("..")) throw new Error("Event exec path cannot contain '..'");

    // Intercept /.auth/logout — notify client to clear cookie + reload
    // Intercept /.auth/logout — redirect client to server-side logout endpoint.
    // The login_token cookie is HttpOnly, so JavaScript cannot clear it.
    // The server's logout handler responds with Set-Cookie: Max-Age=0 + redirect to /.
    if (execPath === "/.auth/logout" && isAUPTransport(this.backend)) {
      this.backend.sendToSession(sessionId, {
        type: "navigate",
        url: "/.well-known/service/api/did/logout",
      });
      return { success: true };
    }

    const config = {
      exec: execPath,
      args: { ...(evtConfig.args ?? {}), ...(data ?? {}) } as Record<string, unknown>,
    };

    // ── Internal routing for explorer/agent primitives ──
    // Check if this event should be handled internally (no blocklet onEvent needed)
    const internalResult = await this.handleInternalPrimitiveEvent(
      sessionId,
      nodeId,
      config.exec,
      config.args,
      store,
      caller,
    );
    if (internalResult !== undefined) return internalResult;

    // Call external handler if registered
    if (this.onAupEvent) {
      const result = await this.onAupEvent(sessionId, nodeId, event, config);
      if (result !== undefined) return result;
    }

    // Auto-dispatch to AFS if mounted (closes the reactive loop)
    // Prefer per-session AFS (blocklet runtime AFS) over global AFS root
    const execAFS = this.resolveExecAFS(sessionId);
    if (execAFS?.exec) {
      // Inject AUP AuthContext for mount actions — enables OAuth flows via browser
      if (config.exec === "/.actions/mount") {
        // Coerce HTML form string values: "true"/"false" → boolean
        for (const [k, v] of Object.entries(config.args)) {
          if (v === "true") config.args[k] = true;
          else if (v === "false") config.args[k] = false;
        }
        const { AUPAuthContext } = await import("./aup-auth-context.js");
        config.args._authContext = new AUPAuthContext({
          formData: config.args,
          sendToClient: (msg) => this.sendToSession(sessionId, msg),
        });
      }
      const context: Record<string, unknown> = { sessionId };
      if (caller?.did) context.userId = caller.did;
      if (caller && "authMethod" in caller) context.session = caller;
      const execResult = await execAFS.exec(config.exec, config.args, { context });

      // On successful mount, close the dialog
      if (config.exec === "/.actions/mount" && execResult?.success) {
        const logic = this.aupRegistry.get(sessionId);
        if (logic) {
          const patchOps: import("./aup-types.js").AUPPatchOp[] = [
            { op: "update", id: "dlg-mount", state: { open: false } },
          ];
          logic.getStore().applyPatch(patchOps);
          this.broadcastResult(sessionId, {
            broadcast: [
              {
                type: "aup",
                action: "patch",
                ops: patchOps,
                treeVersion: logic.getStore().version,
              },
            ],
          });
        }
      }

      return execResult?.data;
    }

    // Fallback: return config (backward compat when no AFS available)
    return { ...config, nodeId, event };
  }

  /** Handle events for built-in explorer/agent primitives internally. */
  private async handleInternalPrimitiveEvent(
    sessionId: string,
    nodeId: string,
    exec: string,
    args: Record<string, unknown>,
    store: AUPNodeStore,
    caller?: { did: string; pk?: string },
  ): Promise<unknown> {
    // ── Explorer events (stripped in OSS) ──

    // ── Mount configuration form ──
    if (exec === "/.ui/mount-form") {
      const uri = String(args.uri || "").trim();
      const mountPath = String(args.path || "").trim();
      const dialogId = String(args.dialogId || "dlg-mount");
      const formId = String(args.formId || "mount-form");
      if (!uri) return { error: "uri is required" };

      const formNodes = await this.buildMountFormNodes(uri, mountPath);
      if (formNodes.length === 0) return { error: `Could not load provider schema for: ${uri}` };

      const logic = this.aupRegistry.get(sessionId);
      if (!logic) return { error: "No AUP session" };

      // Patch: replace dialog children with form nodes, then open
      const patchOps: import("./aup-types.js").AUPPatchOp[] = [
        { op: "update", id: formId, children: formNodes },
        { op: "update", id: dialogId, state: { open: true } },
      ];
      logic.getStore().applyPatch(patchOps);
      this.broadcastResult(sessionId, {
        broadcast: [
          {
            type: "aup",
            action: "patch",
            ops: patchOps,
            treeVersion: logic.getStore().version,
          },
        ],
      });
      return { ok: true };
    }

    // ── Agent submit events ──
    if (exec === "command-bar-submit" || exec === "agent-submit") {
      const node = store.findNode(nodeId);
      if (node?.type === "agent" || node?.type === "command-bar") {
        const text = String(args.text || "").trim();
        if (!text) return undefined;

        const history = (node.state?.messages as Array<{ role: string; content: string }>) || [];
        const script = node.props?.script as string | undefined;

        // Immediately show user message before waiting for response
        const messagesWithUser = [...history, { role: "user", content: text }];
        const logic = this.aupRegistry.get(sessionId);
        if (logic) {
          const userPatch: import("./aup-types.js").AUPPatchOp = {
            op: "update",
            id: nodeId,
            state: { messages: messagesWithUser },
          };
          logic.getStore().applyPatch([userPatch]);
          this.broadcastResult(sessionId, {
            broadcast: [
              {
                type: "aup",
                action: "patch",
                ops: [userPatch],
                treeVersion: logic.getStore().version,
              },
            ],
          });
        }

        let reply: { role: string; content: string };

        if (script) {
          // Script-backed agent: run ASH script (e.g. chat.ash) via the session's AFS
          const execAFS = this.resolveExecAFS(sessionId);
          if (!execAFS?.exec) return { error: "No AFS available" };

          // Read script source — runJob expects source code, not a file path
          let source = script;
          if (execAFS.read) {
            try {
              const readResult = await execAFS.read(script);
              source = String(readResult.data?.content ?? script);
            } catch {
              // Read failed — fall through with path as source (will error in ASH)
            }
          }

          const job = (node.props?.job as string) || undefined;
          const session = (node.props?.session as string) || undefined;
          const scriptArgs: Record<string, unknown> = {
            source,
            message: text,
            _runtime_afs: execAFS,
          };
          if (job) scriptArgs.job = job;
          if (session) scriptArgs.session = session;

          try {
            const result = await execAFS.exec("/ash/.actions/run", scriptArgs, {});
            const d = (result?.data ?? {}) as Record<string, unknown>;
            let content: string | undefined;
            if (typeof d.result === "string") {
              content = d.result;
            } else if (d.result && typeof d.result === "object") {
              // ASH output stage returns { kind, content, context } — extract content
              const r = d.result as Record<string, unknown>;
              content = r.content != null ? String(r.content) : JSON.stringify(r);
            }
            if (content) {
              reply = { role: "assistant", content };
            } else if (d.error) {
              const details = Array.isArray(d.errors) ? `\n${d.errors.join("\n")}` : "";
              reply = { role: "assistant", content: `Error: ${d.error}${details}` };
            } else {
              reply = { role: "assistant", content: `Agent finished (${d.status || "unknown"}).` };
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            reply = { role: "assistant", content: `Error: ${msg}` };
          }
        } else {
          // Built-in agent: use runAgent with tool derivation from src
          const afs = this.buildExplorerAFS(sessionId, caller);
          // Fallback to global AFS for /ash paths (declarative blocklets lack /ash mount)
          const globalAFS = this.afsRoot;
          const src = node.src || "/";
          const agentCtx = {
            afs: {
              async exec(path: string, a?: Record<string, unknown>) {
                // Try session AFS first; fall back to global AFS
                // (declarative blocklets lack /ash, /aignehub etc.)
                if (afs.exec) {
                  try {
                    return await afs.exec(path, a);
                  } catch {
                    if (globalAFS?.exec) {
                      return { data: (await globalAFS.exec(path, a ?? {}, {}))?.data };
                    }
                    throw new Error(`exec failed for path: ${path}`);
                  }
                }
                if (globalAFS?.exec) {
                  return { data: (await globalAFS.exec(path, a ?? {}, {}))?.data };
                }
                throw new Error("exec not available");
              },
            },
          };
          reply = await runAgent(text, history, { src }, agentCtx);
        }

        const messages = [...messagesWithUser, reply];
        if (logic) {
          const patchOp: import("./aup-types.js").AUPPatchOp = {
            op: "update",
            id: nodeId,
            state: { messages },
          };
          const result = logic.patch([patchOp]);
          this.broadcastResult(sessionId, result);
        }
        return { ok: true };
      }
    }

    return undefined;
  }

  /** Walk up the AUP tree to find an ancestor node matching a type or marker prop. */
  private findAncestorOfType(store: AUPNodeStore, nodeId: string, type: string): string | null {
    // Match by type OR by _<type>Root marker (set by expandCompositePrimitives)
    const markerKey = `_${type}Root`;
    const isMatch = (node: { type: string; props?: Record<string, unknown> }) =>
      node.type === type || node.props?.[markerKey] === true;
    const current = store.findNode(nodeId);
    if (current && isMatch(current)) return current.id;
    let currentId = nodeId;
    let maxDepth = 20;
    while (maxDepth-- > 0) {
      const parent = store.findParent(currentId);
      if (!parent) return null;
      if (isMatch(parent)) return parent.id;
      currentId = parent.id;
    }
    return null;
  }

  /**
   * Build AUP form nodes from a provider's JSON Schema.
   * Reads schema via ProviderRegistry (dynamic import to avoid hard dependency).
   */
  private async buildMountFormNodes(
    uri: string,
    mountPath: string,
  ): Promise<import("./aup-types.js").AUPNode[]> {
    try {
      const { ProviderRegistry } = await import("@aigne/afs");
      const registry = new ProviderRegistry();
      const info = await registry.getProviderInfo(uri);
      if (!info?.schema) return [];

      const schema = info.schema as {
        properties?: Record<string, any>;
        required?: string[];
      };
      const properties = schema.properties ?? {};
      const _required = new Set(schema.required ?? []);
      const hasAuth =
        !!info.auth || Object.values(properties).some((p: any) => p.sensitive === true);

      const nodes: import("./aup-types.js").AUPNode[] = [];
      const sensitiveFields: string[] = [];

      for (const [key, prop] of Object.entries(properties)) {
        const isSensitive = prop.sensitive === true;
        const isBoolean = prop.type === "boolean";
        const isArray = prop.type === "array";

        if (isSensitive) sensitiveFields.push(key);

        const node: import("./aup-types.js").AUPNode = {
          id: `mf-${key}`,
          type: "input",
          props: {
            name: key,
            label: prop.description || key,
            mode: isBoolean ? "toggle" : isSensitive ? "password" : "text",
          },
        };

        if (prop.default !== undefined && !isBoolean) {
          node.props!.placeholder = String(prop.default);
        }
        if (isBoolean) {
          node.state = { value: prop.default ?? false };
        }
        if (isArray) {
          node.props!.placeholder = `${node.props!.placeholder ?? ""} (comma-separated)`;
        }

        nodes.push(node);
      }

      // Save button
      nodes.push({
        id: "mf-save",
        type: "action",
        props: {
          label: hasAuth ? "Authorize & Connect" : "Save",
          variant: "primary",
        },
        events: {
          click: {
            exec: "/.actions/mount",
            args: {
              uri,
              path: mountPath,
              ...(sensitiveFields.length > 0 ? { sensitiveArgs: sensitiveFields } : {}),
            },
          },
        },
      });

      return nodes;
    } catch (err) {
      console.warn(
        `[mount-form] Failed to load schema for ${uri}:`,
        err instanceof Error ? err.message : err,
      );
      return [];
    }
  }

  /** Broadcast patch/render results to the session's client. */
  private broadcastResult(
    sessionId: string,
    result: { broadcast?: Array<Record<string, unknown>> },
  ): void {
    if (result.broadcast && isAUPTransport(this.backend)) {
      for (const msg of result.broadcast) {
        this.backend.sendToSession(sessionId, msg);
      }
    }
  }

  /** Build an ExplorerAFS from the mounted AFS root. */
  private buildExplorerAFS(sessionId: string, caller?: { did: string; pk?: string }): ExplorerAFS {
    // Prefer per-session Runtime AFS (has /data, /program mounts) over global AFS
    const afsRoot = this.resolveExecAFS(sessionId) ?? this.afsRoot;
    const context: Record<string, unknown> = { sessionId };
    if (caller?.did) context.userId = caller.did;
    if (caller && "authMethod" in caller) context.session = caller;
    if (!afsRoot) {
      return {
        read: async () => ({ data: undefined }),
        list: async () => ({ data: [] }),
      };
    }
    const root = afsRoot;
    return {
      read: root.read
        ? async (path) => ({ data: (await root.read!(path, { context }))?.data })
        : async () => ({ data: undefined }),
      list: root.list
        ? async (path) => ({ data: (await root.list!(path, { context }))?.data ?? [] })
        : async () => ({ data: [] }),
      stat: root.stat
        ? async (path) => ({ data: (await root.stat!(path, { context }))?.data })
        : undefined,
      explain: root.explain
        ? async (path) => ({ data: await root.explain!(path, { context }) })
        : undefined,
      exec: root.exec
        ? async (path, a) => ({ data: (await root.exec!(path, a ?? {}, { context }))?.data })
        : undefined,
    };
  }

  static schema() {
    return afsUISchema;
  }

  static manifest(): ProviderManifest {
    return {
      name: "ui",
      description:
        "Interactive UI device with window manager — build UIs, control desktop layout (open/close/arrange windows, switch strategies), manage focus and panels",
      uriTemplate: "ui://{backend}",
      category: "device",
      schema: afsUISchema,
      tags: ["ui", "device", "interactive", "term"],
      capabilityTags: ["read-write", "auth:none", "local"],
      security: {
        riskLevel: "local",
        resourceAccess: ["local-network"],
        notes: ["Interacts with local terminal, web, or messaging backend"],
      },
      capabilities: {
        network: { egress: true, ingress: true },
      },
    };
  }

  static treeSchema(): ProviderTreeSchema {
    return {
      operations: ["list", "read", "write", "delete", "exec", "stat", "explain"],
      tree: {
        "/": {
          kind: "device",
          operations: ["list", "read", "exec"],
          actions: [
            "prompt",
            "clear",
            "notify",
            "navigate",
            "dialog",
            "progress",
            "form",
            "table",
            "toast",
          ],
        },
        "/input": { kind: "input-channel", operations: ["read"] },
        "/output": { kind: "output-channel", operations: ["read", "write"] },
        "/pages": { kind: "pages-directory", operations: ["list", "read"] },
        "/pages/{id}": { kind: "page", operations: ["read", "write", "delete"] },
      },
      auth: { type: "none" },
      bestFor: ["user interaction", "terminal UI", "web chat"],
      notFor: ["data storage"],
    };
  }

  // ─── Capabilities ───────────────────────────────────────────

  @Read("/.meta/.capabilities")
  async readCapabilities(_ctx: RouteContext): Promise<AFSEntry> {
    const manifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: this.name,
      description: this.description,
      tools: [],
      actions: [],
      operations: this.getOperationsDeclaration(),
    };

    return {
      id: "/.meta/.capabilities",
      path: "/.meta/.capabilities",
      content: manifest,
      meta: { kind: "afs:capabilities" },
    };
  }

  // ─── Meta ───────────────────────────────────────────────────

  @Meta("/")
  async metaRoot(_ctx: RouteContext): Promise<AFSEntry> {
    if (this.initPromise) await this.initPromise;
    const viewport = this.backend.getViewport();
    const meta: Record<string, unknown> = {
      kind: "device",
      backend: this.backend.type,
      supportedFormats: this.backend.supportedFormats,
      capabilities: this.backend.capabilities,
      viewport,
      childrenCount: 12,
    };
    if (this.serverUrl) {
      meta.url = this.serverUrl;
    }
    return {
      id: ".meta",
      path: "/.meta",
      meta,
    };
  }

  @Meta("/input")
  async metaInput(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: ".meta",
      path: "/input/.meta",
      meta: {
        kind: "input-channel",
        childrenCount: 0,
        description: "Read user input from this device",
        pending: this.backend.hasPendingInput(),
      },
    };
  }

  @Meta("/output")
  async metaOutput(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: ".meta",
      path: "/output/.meta",
      meta: {
        kind: "output-channel",
        childrenCount: 0,
        description: "Write content to this device",
      },
    };
  }

  @Meta("/pages")
  async metaPages(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: ".meta",
      path: "/pages/.meta",
      meta: {
        kind: "pages-directory",
        childrenCount: this.pages.size,
        description: "Managed pages for full-page rendering",
      },
    };
  }

  @Meta("/pages/:id")
  async metaPage(ctx: RouteContext): Promise<AFSEntry> {
    const pageId = ctx.params.id as string;
    const page = this.pages.get(pageId);
    if (!page) throw new Error(`Page not found: ${pageId}`);
    return {
      id: ".meta",
      path: joinURL("/pages", pageId, ".meta"),
      meta: {
        kind: "page",
        format: page.format,
        childrenCount: 0,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
      },
    };
  }

  // ─── List ───────────────────────────────────────────────────

  @List("/input")
  async listInput(_ctx: RouteContext): Promise<AFSListResult> {
    return { data: [] };
  }

  @List("/output")
  async listOutput(_ctx: RouteContext): Promise<AFSListResult> {
    return { data: [] };
  }

  @List("/pages")
  async listPages(_ctx: RouteContext): Promise<AFSListResult> {
    const entries: AFSEntry[] = [];
    for (const [id, page] of this.pages) {
      entries.push({
        id,
        path: joinURL("/pages", id),
        meta: {
          kind: "page",
          format: page.format,
          childrenCount: 0,
          createdAt: page.createdAt,
          updatedAt: page.updatedAt,
        },
      });
    }
    return { data: entries };
  }

  @List("/")
  async listRoot(_ctx: RouteContext): Promise<AFSListResult> {
    return {
      data: [
        {
          id: "spec",
          path: "/spec",
          meta: {
            kind: "aup:spec",
            description: "AUP document format specification — start here",
          },
        },
        {
          id: "primitives",
          path: "/primitives",
          meta: {
            kind: "primitives-directory",
            childrenCount: Object.keys(PRIMITIVES).length,
            description: "Available UI primitives with full props, events, and examples",
          },
        },
        {
          id: "components",
          path: "/components",
          meta: {
            kind: "components-directory",
            childrenCount: Object.keys(COMPONENTS).length,
            description: "Browser-only rich interactive components",
          },
        },
        {
          id: "style",
          path: "/style",
          meta: {
            kind: "style-directory",
            childrenCount: 3,
            description: "Composable style system (tone × palette × mode)",
          },
        },
        {
          id: "themes",
          path: "/themes",
          meta: {
            kind: "themes-directory",
            childrenCount: Object.keys(THEMES).length,
            description: "Visual themes with color tokens (legacy — use /style/ instead)",
          },
        },
        {
          id: "overlay-themes",
          path: "/overlay-themes",
          meta: {
            kind: "overlay-themes-directory",
            childrenCount: Object.keys(OVERLAY_THEMES).length,
            description: "Broadcast overlay themes (graphics packages) for overlay-grid",
          },
        },
        {
          id: "examples",
          path: "/examples",
          meta: {
            kind: "examples-directory",
            childrenCount: Object.keys(AUP_EXAMPLES).length,
            description: "Complete working AUP documents to learn from",
          },
        },
        {
          id: this.endpointType,
          path: joinURL("/", this.endpointType),
          meta: {
            kind: "endpoint",
            childrenCount: 1,
            description: `${this.endpointType} endpoint with session management`,
          },
        },
        // Legacy compat
        {
          id: "input",
          path: "/input",
          meta: {
            kind: "input-channel",
            childrenCount: 0,
            description: "Read user input (legacy — use sessions/:id/messages instead)",
          },
        },
        {
          id: "output",
          path: "/output",
          meta: {
            kind: "output-channel",
            childrenCount: 0,
            description: "Write content (legacy — use sessions/:id/messages instead)",
          },
        },
        {
          id: "pages",
          path: "/pages",
          meta: {
            kind: "pages-directory",
            childrenCount: this.pages.size,
            description: "Managed pages (legacy — use sessions/:id/pages instead)",
          },
        },
        {
          id: "sharing",
          path: "/sharing",
          meta: {
            kind: "sharing-directory",
            childrenCount: this.sharingEntries.size,
            description: "Web sharing entries — publish AFS subtrees as public URLs",
          },
        },
      ],
    };
  }

  // ─── Read ───────────────────────────────────────────────────

  @Read("/")
  async readRoot(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: this.name,
      path: "/",
      content: `UI Device (${this.backend.type})`,
      meta: {
        kind: "device",
        childrenCount: 12,
        backend: this.backend.type,
      },
    };
  }

  @Read("/input")
  async readInput(_ctx: RouteContext): Promise<AFSEntry> {
    const content = await this.backend.read({ timeout: this.inputTimeout });
    return {
      id: "input",
      path: "/input",
      content,
    };
  }

  @Read("/output")
  async readOutput(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: "output",
      path: "/output",
      content: "",
      meta: { kind: "output-channel" },
    };
  }

  @Read("/pages")
  async readPages(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: "pages",
      path: "/pages",
      content: "",
      meta: {
        kind: "pages-directory",
        childrenCount: this.pages.size,
      },
    };
  }

  @Read("/pages/:id")
  async readPage(ctx: RouteContext): Promise<AFSEntry> {
    const pageId = ctx.params.id as string;
    const page = this.pages.get(pageId);
    if (!page) throw new Error(`Page not found: ${pageId}`);
    return {
      id: pageId,
      path: joinURL("/pages", pageId),
      content: page.content,
      meta: {
        kind: "page",
        format: page.format,
        layout: page.layout,
      },
    };
  }

  // ─── Primitives & Themes ───────────────────────────────────

  @List("/primitives")
  async listPrimitives(_ctx: RouteContext): Promise<AFSListResult> {
    return {
      data: Object.values(PRIMITIVES).map((p) => ({
        id: p.name,
        name: p.name,
        path: joinURL("/primitives", p.name),
        meta: { kind: "aup:primitive", category: p.category, description: p.description },
      })),
    };
  }

  @Read("/primitives")
  async readPrimitivesDir(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: "primitives",
      path: "/primitives",
      content: `AUP Primitive Registry (${Object.keys(PRIMITIVES).length} primitives)`,
      meta: { kind: "primitives-directory", childrenCount: Object.keys(PRIMITIVES).length },
    };
  }

  @Stat("/primitives")
  async statPrimitivesDir(_ctx: RouteContext): Promise<AFSStatResult> {
    return {
      data: {
        id: "primitives",
        path: "/primitives",
        meta: { kind: "primitives-directory", childrenCount: Object.keys(PRIMITIVES).length },
      },
    };
  }

  @Meta("/primitives")
  async metaPrimitivesDir(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: "primitives",
      path: "/primitives/.meta",
      meta: { kind: "primitives-directory", childrenCount: Object.keys(PRIMITIVES).length },
    };
  }

  @Read("/primitives/:name")
  async readPrimitive(ctx: RouteContext): Promise<AFSEntry> {
    const name = ctx.params.name as string;
    const prim = PRIMITIVES[name];
    if (!prim) throw new AFSNotFoundError(joinURL("/primitives", name));
    return {
      id: prim.name,
      path: joinURL("/primitives", prim.name),
      content: prim,
      meta: { kind: "aup:primitive", category: prim.category, description: prim.description },
    };
  }

  @Stat("/primitives/:name")
  async statPrimitive(ctx: RouteContext): Promise<AFSStatResult> {
    const name = ctx.params.name as string;
    const prim = PRIMITIVES[name];
    if (!prim) throw new AFSNotFoundError(joinURL("/primitives", name));
    return {
      data: {
        id: prim.name,
        path: joinURL("/primitives", prim.name),
        meta: { kind: "aup:primitive", category: prim.category, description: prim.description },
      },
    };
  }

  @Meta("/primitives/:name")
  async metaPrimitive(ctx: RouteContext): Promise<AFSEntry> {
    const name = ctx.params.name as string;
    const prim = PRIMITIVES[name];
    if (!prim) throw new AFSNotFoundError(joinURL("/primitives", name));
    return {
      id: prim.name,
      path: joinURL("/primitives", prim.name, ".meta"),
      meta: { kind: "aup:primitive", category: prim.category, description: prim.description },
    };
  }

  // ─── Components ──────────────────────────────────────────

  @List("/components")
  async listComponents(_ctx: RouteContext): Promise<AFSListResult> {
    return {
      data: Object.values(COMPONENTS).map((p) => ({
        id: p.name,
        name: p.name,
        path: joinURL("/components", p.name),
        meta: { kind: "aup:component", category: p.category, description: p.description },
      })),
    };
  }

  @Read("/components")
  async readComponentsDir(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: "components",
      path: "/components",
      content: `AUP Component Registry (${Object.keys(COMPONENTS).length} components)`,
      meta: { kind: "components-directory", childrenCount: Object.keys(COMPONENTS).length },
    };
  }

  @Stat("/components")
  async statComponentsDir(_ctx: RouteContext): Promise<AFSStatResult> {
    return {
      data: {
        id: "components",
        path: "/components",
        meta: { kind: "components-directory", childrenCount: Object.keys(COMPONENTS).length },
      },
    };
  }

  @Meta("/components")
  async metaComponentsDir(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: "components",
      path: "/components/.meta",
      meta: { kind: "components-directory", childrenCount: Object.keys(COMPONENTS).length },
    };
  }

  @Read("/components/:name")
  async readComponent(ctx: RouteContext): Promise<AFSEntry> {
    const name = ctx.params.name as string;
    const comp = COMPONENTS[name];
    if (!comp) throw new AFSNotFoundError(joinURL("/components", name));
    return {
      id: comp.name,
      path: joinURL("/components", comp.name),
      content: comp,
      meta: { kind: "aup:component", category: comp.category, description: comp.description },
    };
  }

  @Stat("/components/:name")
  async statComponent(ctx: RouteContext): Promise<AFSStatResult> {
    const name = ctx.params.name as string;
    const comp = COMPONENTS[name];
    if (!comp) throw new AFSNotFoundError(joinURL("/components", name));
    return {
      data: {
        id: comp.name,
        path: joinURL("/components", comp.name),
        meta: { kind: "aup:component", category: comp.category, description: comp.description },
      },
    };
  }

  @Meta("/components/:name")
  async metaComponent(ctx: RouteContext): Promise<AFSEntry> {
    const name = ctx.params.name as string;
    const comp = COMPONENTS[name];
    if (!comp) throw new AFSNotFoundError(joinURL("/components", name));
    return {
      id: comp.name,
      path: joinURL("/components", comp.name, ".meta"),
      meta: { kind: "aup:component", category: comp.category, description: comp.description },
    };
  }

  // ─── Composable Style System ────────────────────────────────

  @Read("/style")
  async readStyleDir(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: "style",
      path: "/style",
      content:
        "AUP Style System — Composable visual styling via tone × palette × mode. Use list/explain to discover tones, palettes, and recipes.",
      meta: { kind: "style-directory", childrenCount: 3 },
    };
  }

  @Stat("/style")
  async statStyleDir(_ctx: RouteContext): Promise<AFSStatResult> {
    return {
      data: { id: "style", path: "/style", meta: { kind: "style-directory", childrenCount: 3 } },
    };
  }

  @Meta("/style")
  async metaStyleDir(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: "style",
      path: "/style/.meta",
      meta: { kind: "style-directory", childrenCount: 3 },
    };
  }

  @List("/style")
  async listStyle(_ctx: RouteContext): Promise<AFSListResult> {
    return {
      data: [
        {
          id: "tones",
          path: "/style/tones",
          meta: { kind: "style-tones-directory", childrenCount: Object.keys(STYLE_TONES).length },
        },
        {
          id: "palettes",
          path: "/style/palettes",
          meta: {
            kind: "style-palettes-directory",
            childrenCount: Object.keys(STYLE_PALETTES).length,
          },
        },
        {
          id: "recipes",
          path: "/style/recipes",
          meta: {
            kind: "style-recipes-directory",
            childrenCount: Object.keys(STYLE_RECIPES).length,
          },
        },
      ],
    };
  }

  @Explain("/style")
  async explainStyle(_ctx: RouteContext): Promise<AFSExplainResult> {
    return {
      format: "markdown",
      content: [
        "# AUP Style System — Composable visual styling via tone × palette.",
        "",
        "**Style = Tone × Palette × Mode**",
        "- **Tone** (4 options): controls typography, shape, spacing, effects",
        "- **Palette** (5 options): controls colors (dark + light modes)",
        "- **Mode**: dark / light / auto (user preference)",
        "",
        "## Quick start",
        "1. `list /style/recipes/` — find a matching scenario",
        "2. `read /style/recipes/{name}` — get tone + palette combination",
        '3. Use in page: `{ "style": { "tone": "...", "palette": "..." } }`',
        "",
        "## Decision tree",
        "- Premium/brand → tone: **editorial**",
        "- Enterprise/data → tone: **clean**",
        "- Creative/playful → tone: **bold**",
        "- Developer/technical → tone: **mono**",
        "- Safe color → palette: **neutral**",
        "- Luxury/finance → palette: **warm**",
        "- Bold/consumer → palette: **vivid**",
        "- Fresh/tech → palette: **natural**",
        "- Futuristic/AI → palette: **electric**",
        "",
        "Default: editorial + neutral",
      ].join("\n"),
    };
  }

  // ─── Style: Tones ─────────────────────────────

  @Read("/style/tones")
  async readTonesDir(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: "tones",
      path: "/style/tones",
      content: `AUP Tone Registry (${Object.keys(STYLE_TONES).length} tones)`,
      meta: { kind: "style-tones-directory", childrenCount: Object.keys(STYLE_TONES).length },
    };
  }

  @Stat("/style/tones")
  async statTonesDir(_ctx: RouteContext): Promise<AFSStatResult> {
    return {
      data: {
        id: "tones",
        path: "/style/tones",
        meta: { kind: "style-tones-directory", childrenCount: Object.keys(STYLE_TONES).length },
      },
    };
  }

  @List("/style/tones")
  async listTones(_ctx: RouteContext): Promise<AFSListResult> {
    return {
      data: Object.values(STYLE_TONES).map((t) => ({
        id: t.name,
        name: t.name,
        path: joinURL("/style/tones", t.name),
        meta: { kind: "aup:tone", description: t.description },
      })),
    };
  }

  @Explain("/style/tones")
  async explainTones(_ctx: RouteContext): Promise<AFSExplainResult> {
    const lines = [
      "# Tones — control typography, shape, spacing, and effects",
      "",
      "Each tone is a fundamentally different design paradigm, not a color variation.",
      "",
    ];
    for (const tone of Object.values(STYLE_TONES)) {
      lines.push(`- **${tone.name}**: ${tone.description} — ${tone.character}`);
    }
    return { format: "markdown", content: lines.join("\n") };
  }

  @Read("/style/tones/:name")
  async readTone(ctx: RouteContext): Promise<AFSEntry> {
    const name = ctx.params.name as string;
    const tone = STYLE_TONES[name];
    if (!tone) throw new AFSNotFoundError(joinURL("/style/tones", name));
    return {
      id: tone.name,
      path: joinURL("/style/tones", tone.name),
      content: tone,
      meta: { kind: "aup:tone", description: tone.description },
    };
  }

  @Stat("/style/tones/:name")
  async statTone(ctx: RouteContext): Promise<AFSStatResult> {
    const name = ctx.params.name as string;
    const tone = STYLE_TONES[name];
    if (!tone) throw new AFSNotFoundError(joinURL("/style/tones", name));
    return {
      data: {
        id: tone.name,
        path: joinURL("/style/tones", tone.name),
        meta: { kind: "aup:tone", description: tone.description },
      },
    };
  }

  // ─── Style: Palettes ──────────────────────────

  @Read("/style/palettes")
  async readPalettesDir(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: "palettes",
      path: "/style/palettes",
      content: `AUP Palette Registry (${Object.keys(STYLE_PALETTES).length} palettes)`,
      meta: { kind: "style-palettes-directory", childrenCount: Object.keys(STYLE_PALETTES).length },
    };
  }

  @Stat("/style/palettes")
  async statPalettesDir(_ctx: RouteContext): Promise<AFSStatResult> {
    return {
      data: {
        id: "palettes",
        path: "/style/palettes",
        meta: {
          kind: "style-palettes-directory",
          childrenCount: Object.keys(STYLE_PALETTES).length,
        },
      },
    };
  }

  @List("/style/palettes")
  async listPalettes(_ctx: RouteContext): Promise<AFSListResult> {
    return {
      data: Object.values(STYLE_PALETTES).map((p) => ({
        id: p.name,
        name: p.name,
        path: joinURL("/style/palettes", p.name),
        meta: { kind: "aup:palette", description: p.description },
      })),
    };
  }

  @Explain("/style/palettes")
  async explainPalettes(_ctx: RouteContext): Promise<AFSExplainResult> {
    const lines = [
      "# Palettes — control colors (dark + light modes)",
      "",
      "Each palette provides a complete color set. Choose based on emotional temperature.",
      "",
    ];
    for (const p of Object.values(STYLE_PALETTES)) {
      lines.push(`- **${p.name}**: ${p.description} (${p.mood})`);
    }
    return { format: "markdown", content: lines.join("\n") };
  }

  @Read("/style/palettes/:name")
  async readPalette(ctx: RouteContext): Promise<AFSEntry> {
    const name = ctx.params.name as string;
    const palette = STYLE_PALETTES[name];
    if (!palette) throw new AFSNotFoundError(joinURL("/style/palettes", name));
    return {
      id: palette.name,
      path: joinURL("/style/palettes", palette.name),
      content: palette,
      meta: { kind: "aup:palette", description: palette.description },
    };
  }

  @Stat("/style/palettes/:name")
  async statPalette(ctx: RouteContext): Promise<AFSStatResult> {
    const name = ctx.params.name as string;
    const palette = STYLE_PALETTES[name];
    if (!palette) throw new AFSNotFoundError(joinURL("/style/palettes", name));
    return {
      data: {
        id: palette.name,
        path: joinURL("/style/palettes", palette.name),
        meta: { kind: "aup:palette", description: palette.description },
      },
    };
  }

  // ─── Style: Recipes ───────────────────────────

  @Read("/style/recipes")
  async readRecipesDir(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: "recipes",
      path: "/style/recipes",
      content: `AUP Recipe Registry (${Object.keys(STYLE_RECIPES).length} recipes)`,
      meta: { kind: "style-recipes-directory", childrenCount: Object.keys(STYLE_RECIPES).length },
    };
  }

  @Stat("/style/recipes")
  async statRecipesDir(_ctx: RouteContext): Promise<AFSStatResult> {
    return {
      data: {
        id: "recipes",
        path: "/style/recipes",
        meta: { kind: "style-recipes-directory", childrenCount: Object.keys(STYLE_RECIPES).length },
      },
    };
  }

  @List("/style/recipes")
  async listRecipes(_ctx: RouteContext): Promise<AFSListResult> {
    return {
      data: Object.values(STYLE_RECIPES).map((r) => ({
        id: r.name,
        name: r.name,
        path: joinURL("/style/recipes", r.name),
        meta: { kind: "aup:recipe", description: r.description },
      })),
    };
  }

  @Explain("/style/recipes")
  async explainRecipes(_ctx: RouteContext): Promise<AFSExplainResult> {
    const lines = [
      "# Recipes — pre-composed tone + palette combinations",
      "",
      "Match your scenario to a recipe and copy it. Zero understanding needed.",
      "",
    ];
    for (const r of Object.values(STYLE_RECIPES)) {
      lines.push(`- **${r.name}**: ${r.tone} + ${r.palette} — ${r.useWhen}`);
    }
    return { format: "markdown", content: lines.join("\n") };
  }

  @Read("/style/recipes/:name")
  async readRecipe(ctx: RouteContext): Promise<AFSEntry> {
    const name = ctx.params.name as string;
    const recipe = STYLE_RECIPES[name];
    if (!recipe) throw new AFSNotFoundError(joinURL("/style/recipes", name));
    return {
      id: recipe.name,
      path: joinURL("/style/recipes", recipe.name),
      content: recipe,
      meta: { kind: "aup:recipe", description: recipe.description },
    };
  }

  @Stat("/style/recipes/:name")
  async statRecipe(ctx: RouteContext): Promise<AFSStatResult> {
    const name = ctx.params.name as string;
    const recipe = STYLE_RECIPES[name];
    if (!recipe) throw new AFSNotFoundError(joinURL("/style/recipes", name));
    return {
      data: {
        id: recipe.name,
        path: joinURL("/style/recipes", recipe.name),
        meta: { kind: "aup:recipe", description: recipe.description },
      },
    };
  }

  // ─── Legacy Themes ────────────────────────────────────────

  @List("/themes")
  async listThemes(_ctx: RouteContext): Promise<AFSListResult> {
    return {
      data: Object.values(THEMES).map((t) => ({
        id: t.name,
        name: t.name,
        path: joinURL("/themes", t.name),
        meta: { kind: "aup:theme", description: t.description },
      })),
    };
  }

  @Read("/themes")
  async readThemesDir(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: "themes",
      path: "/themes",
      content: `AUP Theme Registry (${Object.keys(THEMES).length} themes)`,
      meta: { kind: "themes-directory", childrenCount: Object.keys(THEMES).length },
    };
  }

  @Stat("/themes")
  async statThemesDir(_ctx: RouteContext): Promise<AFSStatResult> {
    return {
      data: {
        id: "themes",
        path: "/themes",
        meta: { kind: "themes-directory", childrenCount: Object.keys(THEMES).length },
      },
    };
  }

  @Meta("/themes")
  async metaThemesDir(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: "themes",
      path: "/themes/.meta",
      meta: { kind: "themes-directory", childrenCount: Object.keys(THEMES).length },
    };
  }

  @Read("/themes/:name")
  async readTheme(ctx: RouteContext): Promise<AFSEntry> {
    const name = ctx.params.name as string;
    const theme = THEMES[name];
    if (!theme) throw new AFSNotFoundError(joinURL("/themes", name));
    return {
      id: theme.name,
      path: joinURL("/themes", theme.name),
      content: theme,
      meta: { kind: "aup:theme", description: theme.description },
    };
  }

  @Stat("/themes/:name")
  async statTheme(ctx: RouteContext): Promise<AFSStatResult> {
    const name = ctx.params.name as string;
    const theme = THEMES[name];
    if (!theme) throw new AFSNotFoundError(joinURL("/themes", name));
    return {
      data: {
        id: theme.name,
        path: joinURL("/themes", theme.name),
        meta: { kind: "aup:theme", description: theme.description },
      },
    };
  }

  @Meta("/themes/:name")
  async metaTheme(ctx: RouteContext): Promise<AFSEntry> {
    const name = ctx.params.name as string;
    const theme = THEMES[name];
    if (!theme) throw new AFSNotFoundError(joinURL("/themes", name));
    return {
      id: theme.name,
      path: joinURL("/themes", theme.name, ".meta"),
      meta: { kind: "aup:theme", description: theme.description },
    };
  }

  // ─── Overlay Themes ────────────────────────────────────────

  @List("/overlay-themes")
  async listOverlayThemes(_ctx: RouteContext): Promise<AFSListResult> {
    return {
      data: Object.values(OVERLAY_THEMES).map((t) => ({
        id: t.name,
        name: t.name,
        path: joinURL("/overlay-themes", t.name),
        meta: { kind: "aup:overlay-theme", description: t.description },
      })),
    };
  }

  @Read("/overlay-themes")
  async readOverlayThemesDir(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: "overlay-themes",
      path: "/overlay-themes",
      content: `AUP Overlay Theme Registry (${Object.keys(OVERLAY_THEMES).length} themes)\n\nBroadcast "graphics packages" for overlay-grid layouts. Apply via theme prop on view with layout: "overlay-grid".\n\nAvailable: ${Object.keys(OVERLAY_THEMES).join(", ")}`,
      meta: { kind: "overlay-themes-directory", childrenCount: Object.keys(OVERLAY_THEMES).length },
    };
  }

  @Stat("/overlay-themes")
  async statOverlayThemesDir(_ctx: RouteContext): Promise<AFSStatResult> {
    return {
      data: {
        id: "overlay-themes",
        path: "/overlay-themes",
        meta: {
          kind: "overlay-themes-directory",
          childrenCount: Object.keys(OVERLAY_THEMES).length,
        },
      },
    };
  }

  @Meta("/overlay-themes")
  async metaOverlayThemesDir(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: "overlay-themes",
      path: "/overlay-themes/.meta",
      meta: { kind: "overlay-themes-directory", childrenCount: Object.keys(OVERLAY_THEMES).length },
    };
  }

  @Read("/overlay-themes/:name")
  async readOverlayTheme(ctx: RouteContext): Promise<AFSEntry> {
    const name = ctx.params.name as string;
    const theme = OVERLAY_THEMES[name];
    if (!theme) throw new AFSNotFoundError(joinURL("/overlay-themes", name));
    return {
      id: theme.name,
      path: joinURL("/overlay-themes", theme.name),
      content: theme,
      meta: { kind: "aup:overlay-theme", description: theme.description },
    };
  }

  @Stat("/overlay-themes/:name")
  async statOverlayTheme(ctx: RouteContext): Promise<AFSStatResult> {
    const name = ctx.params.name as string;
    const theme = OVERLAY_THEMES[name];
    if (!theme) throw new AFSNotFoundError(joinURL("/overlay-themes", name));
    return {
      data: {
        id: theme.name,
        path: joinURL("/overlay-themes", theme.name),
        meta: { kind: "aup:overlay-theme", description: theme.description },
      },
    };
  }

  @Meta("/overlay-themes/:name")
  async metaOverlayTheme(ctx: RouteContext): Promise<AFSEntry> {
    const name = ctx.params.name as string;
    const theme = OVERLAY_THEMES[name];
    if (!theme) throw new AFSNotFoundError(joinURL("/overlay-themes", name));
    return {
      id: theme.name,
      path: joinURL("/overlay-themes", theme.name, ".meta"),
      meta: { kind: "aup:overlay-theme", description: theme.description },
    };
  }

  // ─── Overlay Theme Examples ───────────────────────────────

  @List("/overlay-themes/:name/examples")
  async listOverlayExamples(ctx: RouteContext): Promise<AFSListResult> {
    const name = ctx.params.name as string;
    const theme = OVERLAY_THEMES[name];
    if (!theme) throw new AFSNotFoundError(joinURL("/overlay-themes", name));
    return {
      data: (theme.examples || []).map((ex) => ({
        id: ex.name,
        name: ex.name,
        path: joinURL("/overlay-themes", name, "examples", ex.name),
        meta: { kind: "aup:overlay-example", description: ex.description },
      })),
    };
  }

  @Read("/overlay-themes/:name/examples/:example")
  async readOverlayExample(ctx: RouteContext): Promise<AFSEntry> {
    const name = ctx.params.name as string;
    const exName = ctx.params.example as string;
    const theme = OVERLAY_THEMES[name];
    if (!theme) throw new AFSNotFoundError(joinURL("/overlay-themes", name));
    const ex = (theme.examples || []).find((e) => e.name === exName);
    if (!ex) throw new AFSNotFoundError(joinURL("/overlay-themes", name, "examples", exName));
    return {
      id: ex.name,
      path: joinURL("/overlay-themes", name, "examples", ex.name),
      content: ex.tree,
      meta: { kind: "aup:overlay-example", description: ex.description },
    };
  }

  // ─── Spec & Examples ──────────────────────────────────────

  @Read("/spec")
  async readSpec(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: "spec",
      path: "/spec",
      content: AUP_SPEC,
      meta: { kind: "aup:spec", version: AUP_SPEC.version },
    };
  }

  @Stat("/spec")
  async statSpec(_ctx: RouteContext): Promise<AFSStatResult> {
    return {
      data: {
        id: "spec",
        path: "/spec",
        meta: { kind: "aup:spec", version: AUP_SPEC.version },
      },
    };
  }

  @List("/spec")
  async listSpec(_ctx: RouteContext): Promise<AFSListResult> {
    return { data: [] };
  }

  @Meta("/spec")
  async metaSpec(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: ".meta",
      path: "/spec/.meta",
      meta: { kind: "aup:spec", version: AUP_SPEC.version, childrenCount: 0 },
    };
  }

  @Explain("/spec")
  async explainSpec(_ctx: RouteContext): Promise<AFSExplainResult> {
    return {
      format: "markdown",
      content: [
        "# AUP Document Specification",
        "",
        "Read `/spec` to get the full AUP wire format definition,",
        "including node fields, spatial intent system, sizing, event model, and workflow.",
        "",
        "This is the starting point for any agent building UI with AUP.",
      ].join("\n"),
    };
  }

  @List("/examples")
  async listExamples(_ctx: RouteContext): Promise<AFSListResult> {
    return {
      data: Object.values(AUP_EXAMPLES).map((ex) => ({
        id: ex.name,
        name: ex.name,
        path: joinURL("/examples", ex.name),
        meta: {
          kind: "aup:example",
          title: ex.title,
          description: ex.description,
          concepts: ex.concepts,
        },
      })),
    };
  }

  @Read("/examples")
  async readExamplesDir(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: "examples",
      path: "/examples",
      content: `AUP Examples (${Object.keys(AUP_EXAMPLES).length} examples)`,
      meta: {
        kind: "examples-directory",
        childrenCount: Object.keys(AUP_EXAMPLES).length,
      },
    };
  }

  @Stat("/examples")
  async statExamplesDir(_ctx: RouteContext): Promise<AFSStatResult> {
    return {
      data: {
        id: "examples",
        path: "/examples",
        meta: {
          kind: "examples-directory",
          childrenCount: Object.keys(AUP_EXAMPLES).length,
        },
      },
    };
  }

  @Meta("/examples")
  async metaExamplesDir(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: "examples",
      path: "/examples/.meta",
      meta: {
        kind: "examples-directory",
        childrenCount: Object.keys(AUP_EXAMPLES).length,
      },
    };
  }

  @Read("/examples/:name")
  async readExample(ctx: RouteContext): Promise<AFSEntry> {
    const name = ctx.params.name as string;
    const ex = AUP_EXAMPLES[name];
    if (!ex) throw new AFSNotFoundError(joinURL("/examples", name));
    return {
      id: ex.name,
      path: joinURL("/examples", ex.name),
      content: ex,
      meta: {
        kind: "aup:example",
        title: ex.title,
        description: ex.description,
        concepts: ex.concepts,
      },
    };
  }

  @Stat("/examples/:name")
  async statExample(ctx: RouteContext): Promise<AFSStatResult> {
    const name = ctx.params.name as string;
    const ex = AUP_EXAMPLES[name];
    if (!ex) throw new AFSNotFoundError(joinURL("/examples", name));
    return {
      data: {
        id: ex.name,
        path: joinURL("/examples", ex.name),
        meta: {
          kind: "aup:example",
          title: ex.title,
          description: ex.description,
        },
      },
    };
  }

  @Meta("/examples/:name")
  async metaExample(ctx: RouteContext): Promise<AFSEntry> {
    const name = ctx.params.name as string;
    const ex = AUP_EXAMPLES[name];
    if (!ex) throw new AFSNotFoundError(joinURL("/examples", name));
    return {
      id: ex.name,
      path: joinURL("/examples", ex.name, ".meta"),
      meta: {
        kind: "aup:example",
        title: ex.title,
        description: ex.description,
      },
    };
  }

  // ─── Write ──────────────────────────────────────────────────

  @Write("/output")
  async writeOutput(
    _ctx: RouteContext,
    payload: { content?: string; meta?: Record<string, unknown> },
  ): Promise<AFSWriteResult> {
    const content =
      typeof payload.content === "string" ? payload.content : String(payload.content ?? "");
    const format = (payload.meta?.format as string) ?? undefined;
    const component = (payload.meta?.component as string) ?? undefined;
    const componentProps = (payload.meta?.componentProps as Record<string, unknown>) ?? undefined;
    await this.backend.write(content, { format, component, componentProps });
    return {
      data: {
        id: "output",
        path: "/output",
        content,
        meta: { kind: "output-channel" },
      },
    };
  }

  @Write("/pages/:id")
  async writePage(
    ctx: RouteContext,
    payload: { content?: string; meta?: Record<string, unknown> },
  ): Promise<AFSWriteResult> {
    const pageId = ctx.params.id as string;
    const content =
      typeof payload.content === "string" ? payload.content : String(payload.content ?? "");
    const format = (payload.meta?.format as string) ?? "html";
    const layout = (payload.meta?.layout as Record<string, string>) ?? undefined;
    const now = Date.now();

    const existing = this.pages.get(pageId);
    const pageData: PageData = {
      content,
      format,
      layout,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.pages.set(pageId, pageData);
    this.persistPageToDisk(pageId, pageData);

    return {
      data: {
        id: pageId,
        path: joinURL("/pages", pageId),
        content,
        meta: { kind: "page", format },
      },
    };
  }

  // ─── Delete ─────────────────────────────────────────────────

  @Delete("/pages/:id")
  async deletePage(ctx: RouteContext): Promise<AFSDeleteResult> {
    const pageId = ctx.params.id as string;
    if (!this.pages.has(pageId)) {
      throw new Error(`Page not found: ${pageId}`);
    }
    this.pages.delete(pageId);
    this.removePageFromDisk(pageId);
    return { message: `Deleted page: ${pageId}` };
  }

  // ─── Sharing Declaration ────────────────────────────────────

  /** Validate and parse a sharing entry payload */
  private parseSharingPayload(
    payload: { content?: unknown },
    existingCreatedAt?: number,
  ): SharingEntry {
    const raw = payload.content as Record<string, unknown> | undefined;
    if (!raw || typeof raw !== "object") throw new Error("Sharing entry requires a content object");

    const target = raw.target as string | undefined;
    if (!target || typeof target !== "string") {
      throw new Error("Sharing entry requires 'target' field");
    }

    const access = (raw.access as string) ?? "guest";
    if (!VALID_ACCESS_LEVELS.has(access)) {
      throw new Error(
        `Invalid access level: '${access}'. Must be one of: ${[...VALID_ACCESS_LEVELS].join(", ")}`,
      );
    }

    const mode = (raw.mode as string) ?? "static";
    if (!VALID_SHARING_MODES.has(mode)) {
      throw new Error(
        `Invalid sharing mode: '${mode}'. Must be one of: ${[...VALID_SHARING_MODES].join(", ")}`,
      );
    }

    const now = Date.now();
    const entryMeta = raw.meta as SharingEntryMeta | undefined;

    return {
      target,
      access: access as SharingEntry["access"],
      mode: mode as SharingEntry["mode"],
      slug: "", // filled by caller
      meta: entryMeta,
      createdAt: existingCreatedAt ?? now,
      updatedAt: now,
    };
  }

  @Write("/sharing/:slug")
  async writeSharingEntry(
    ctx: RouteContext,
    payload: { content?: unknown },
  ): Promise<AFSWriteResult> {
    const slug = ctx.params.slug as string;
    const existing = this.sharingEntries.get(slug);
    const entry = this.parseSharingPayload(payload, existing?.createdAt);
    entry.slug = slug;
    this.sharingEntries.set(slug, entry);

    return {
      data: {
        id: slug,
        path: joinURL("/sharing", slug),
        content: entry,
        meta: { kind: "sharing-entry" },
      },
    };
  }

  @Read("/sharing/:slug")
  async readSharingEntry(ctx: RouteContext): Promise<AFSEntry> {
    const slug = ctx.params.slug as string;
    const entry = this.sharingEntries.get(slug);
    if (!entry) throw new AFSNotFoundError(joinURL("/sharing", slug));
    return {
      id: slug,
      path: joinURL("/sharing", slug),
      content: entry,
      meta: { kind: "sharing-entry", access: entry.access, mode: entry.mode },
    };
  }

  @Read("/sharing")
  async readSharingDir(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: "sharing",
      path: "/sharing",
      content: `Web Sharing Entries (${this.sharingEntries.size} entries)`,
      meta: {
        kind: "sharing-directory",
        childrenCount: this.sharingEntries.size,
      },
    };
  }

  @List("/sharing")
  async listSharingEntries(_ctx: RouteContext): Promise<AFSListResult> {
    const entries: AFSEntry[] = [];
    for (const [slug, entry] of this.sharingEntries) {
      entries.push({
        id: slug,
        path: joinURL("/sharing", slug),
        meta: {
          kind: "sharing-entry",
          target: entry.target,
          access: entry.access,
          mode: entry.mode,
        },
      });
    }
    return { data: entries };
  }

  @Delete("/sharing/:slug")
  async deleteSharingEntry(ctx: RouteContext): Promise<AFSDeleteResult> {
    const slug = ctx.params.slug as string;
    if (!this.sharingEntries.has(slug)) {
      throw new AFSNotFoundError(joinURL("/sharing", slug));
    }
    this.sharingEntries.delete(slug);
    return { message: `Deleted sharing entry: ${slug}` };
  }

  @Meta("/sharing")
  async metaSharingDir(_ctx: RouteContext): Promise<AFSEntry> {
    return {
      id: "sharing",
      path: "/sharing/.meta",
      meta: {
        kind: "sharing-directory",
        childrenCount: this.sharingEntries.size,
      },
    };
  }

  @Meta("/sharing/:slug")
  async metaSharingEntry(ctx: RouteContext): Promise<AFSEntry> {
    const slug = ctx.params.slug as string;
    const entry = this.sharingEntries.get(slug);
    if (!entry) throw new AFSNotFoundError(joinURL("/sharing", slug));
    return {
      id: slug,
      path: joinURL("/sharing", slug, ".meta"),
      meta: { kind: "sharing-entry", access: entry.access, mode: entry.mode },
    };
  }

  @Stat("/sharing")
  async statSharingDir(_ctx: RouteContext): Promise<AFSStatResult> {
    return {
      data: {
        id: "sharing",
        path: "/sharing",
        meta: {
          kind: "sharing-directory",
          childrenCount: this.sharingEntries.size,
        },
      },
    };
  }

  @Stat("/sharing/:slug")
  async statSharingEntry(ctx: RouteContext): Promise<AFSStatResult> {
    const slug = ctx.params.slug as string;
    const entry = this.sharingEntries.get(slug);
    if (!entry) throw new AFSNotFoundError(joinURL("/sharing", slug));
    return {
      data: {
        id: slug,
        path: joinURL("/sharing", slug),
        meta: { kind: "sharing-entry", access: entry.access, mode: entry.mode },
      },
    };
  }

  @Actions("/sharing/:slug")
  async listSharingActions(ctx: RouteContext): Promise<AFSListResult> {
    const slug = ctx.params.slug as string;
    const entry = this.sharingEntries.get(slug);
    if (!entry) throw new AFSNotFoundError(joinURL("/sharing", slug));
    const basePath = joinURL("/sharing", slug, ".actions");
    const actions: AFSEntry[] = [];
    if (entry.mode === "static") {
      actions.push({
        id: "snapshot",
        path: joinURL(basePath, "snapshot"),
        meta: {
          kind: "afs:executable",
          description: "Freeze the AUP tree from a session into a static HTML snapshot",
          inputSchema: {
            type: "object",
            required: ["sessionId"],
            properties: {
              sessionId: {
                type: "string",
                description: "Session ID whose AUP tree to snapshot",
              },
            },
          },
        },
      });
    }
    return { data: actions };
  }

  @Actions.Exec("/sharing/:slug", "snapshot")
  async execSharingSnapshot(
    ctx: RouteContext,
    args: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    const slug = ctx.params.slug as string;
    const entry = this.sharingEntries.get(slug);
    if (!entry) throw new AFSNotFoundError(joinURL("/sharing", slug));

    if (entry.mode !== "static") {
      throw new Error("Static snapshot not available for live mode entries");
    }

    const sessionId = args.sessionId as string | undefined;
    if (!sessionId) {
      throw new Error("snapshot action requires 'sessionId' argument");
    }

    // Get AUP tree from the session
    const store = this.aupRegistry.get(sessionId)?.getStore();
    const tree = store?.getRoot();
    if (!tree) {
      throw new Error("No AUP tree found for the specified session — render content first");
    }

    // Generate snapshot HTML
    const html = generateSnapshot({
      tree,
      slug,
      meta: entry.meta,
      tone: store!.renderOptions.tone,
      palette: store!.renderOptions.palette,
      locale: store!.renderOptions.locale,
    });

    // Store snapshot on the entry
    entry.snapshot = html;
    entry.updatedAt = Date.now();

    return { success: true, data: { slug, size: html.length } };
  }

  // ─── Stat ───────────────────────────────────────────────────

  @Stat("/")
  async statRoot(_ctx: RouteContext): Promise<AFSStatResult> {
    if (this.initPromise) await this.initPromise;
    const meta: Record<string, unknown> = {
      kind: "device",
      childrenCount: 12,
      backend: this.backend.type,
    };
    if (this.serverUrl) {
      meta.url = this.serverUrl;
    }
    return {
      data: {
        id: this.name,
        path: "/",
        meta,
      },
    };
  }

  @Stat("/input")
  async statInput(_ctx: RouteContext): Promise<AFSStatResult> {
    return {
      data: {
        id: "input",
        path: "/input",
        meta: {
          kind: "input-channel",
          childrenCount: 0,
          pending: this.backend.hasPendingInput(),
        },
      },
    };
  }

  @Stat("/output")
  async statOutput(_ctx: RouteContext): Promise<AFSStatResult> {
    return {
      data: {
        id: "output",
        path: "/output",
        meta: {
          kind: "output-channel",
          childrenCount: 0,
        },
      },
    };
  }

  @Stat("/pages")
  async statPages(_ctx: RouteContext): Promise<AFSStatResult> {
    return {
      data: {
        id: "pages",
        path: "/pages",
        meta: {
          kind: "pages-directory",
          childrenCount: this.pages.size,
        },
      },
    };
  }

  @Stat("/pages/:id")
  async statPage(ctx: RouteContext): Promise<AFSStatResult> {
    const pageId = ctx.params.id as string;
    const page = this.pages.get(pageId);
    if (!page) throw new Error(`Page not found: ${pageId}`);
    return {
      data: {
        id: pageId,
        path: joinURL("/pages", pageId),
        meta: {
          kind: "page",
          format: page.format,
          childrenCount: 0,
        },
      },
    };
  }

  // ─── Explain ────────────────────────────────────────────────

  @Explain("/")
  async explainRoot(_ctx: RouteContext): Promise<AFSExplainResult> {
    return {
      format: "markdown",
      content: [
        `# UI Device (${this.backend.type})`,
        "",
        "You can build **any UI** by composing AUP (Agentic UI Protocol) component trees.",
        "",
        "## Quick Start",
        "",
        "1. **Read `/spec`** — Full AUP document format, node fields, event model, and workflow",
        `2. **Read \`/primitives\`** — ${Object.keys(PRIMITIVES).length} cross-platform atomic UI primitives`,
        `3. **Read \`/components\`** — ${Object.keys(COMPONENTS).length} browser-only rich interactive components`,
        `4. **Read \`/themes\`** — ${Object.keys(THEMES).length} visual themes with color tokens`,
        `5. **Read \`/overlay-themes\`** — ${Object.keys(OVERLAY_THEMES).length} broadcast overlay themes (graphics packages) for overlay-grid`,
        `6. **Read \`/examples\`** — ${Object.keys(AUP_EXAMPLES).length} complete working documents to learn from`,
        "",
        "## Creating a UI",
        "",
        "```",
        "// 1. Build a node tree",
        '{ id: "root", type: "view", props: { layout: "column" }, children: [...] }',
        "",
        "// 2. Render it via session action",
        `exec('/${this.endpointType}/sessions/:sid/.actions/aup_render', {`,
        "  root: nodeTree,",
        "  fullPage: true,",
        "  style: 'midnight'",
        "})",
        "",
        "// 3. Handle events (user clicks, input changes)",
        "// Events call your AFS exec paths defined in node.events",
        "",
        "// 4. Update UI incrementally",
        `exec('/${this.endpointType}/sessions/:sid/.actions/aup_patch', {`,
        '  ops: [{ op: "update", id: "node-id", props: { content: "new text" } }]',
        "})",
        "```",
        "",
        "## Key Concepts",
        "",
        `- **${Object.keys(PRIMITIVES).length} primitives**: view, text, action, input, media, overlay, table, time, chart, map, calendar, afs-list, surface`,
        `- **${Object.keys(COMPONENTS).length} components**: moonphase, natal-chart, terminal, editor, canvas, deck, frame, ticker, broadcast, rtc`,
        "- **Events**: click, change, send, sort, select, confirm, cancel — each triggers an AFS exec call",
        "- **Live data**: Set `node.src` to an AFS path for auto-updating charts, maps, etc.",
        "- **Themes**: midnight, clean, glass, brutalist, soft, cyber, editorial",
        "",
        "## Session Actions",
        "",
        "| Action | Description |",
        "|--------|-------------|",
        "| `aup_render` | Render a full AUP component tree |",
        "| `aup_patch` | Incremental updates (create/update/remove/reorder) |",
        "| `aup_stage` | Stage a scene off-screen (pre-render for instant switching) |",
        "| `aup_take` | Take a staged scene live (CSS swap, zero DOM teardown) |",
        "| `aup_release` | Release a staged scene's resources |",
        "| `aup_save` | Save current graph to a session page |",
        "| `aup_load` | Load a saved graph and render it |",
        "| `prompt` | Ask user a question (text/password/confirm/select) |",
        "| `dialog` | Show dialog with custom buttons |",
        "| `toast` | Lightweight toast notification |",
        "| `form` | Collect structured input |",
        "| `navigate` | Navigate to a page |",
        "",
        "## Window Manager (Desktop Control)",
        "",
        `Path: \`/${this.endpointType}/sessions/:sid/wm\``,
        "",
        "The WM gives you full programmatic control over the desktop layout — open/close windows,",
        "arrange them side-by-side, switch between floating/panel/single-view modes, and manage focus.",
        "",
        "| Action | Description |",
        "|--------|-------------|",
        "| `open-surface` | Create a new window (AFS path, WebSocket URL, or inline AUP content). Supports desktop-widget mode via `background`, `titlebar`, `closable`, `movable`, `resizable`, `interactive` props (all default true, set false to disable). Cannot re-open system surfaces. |",
        "| `close-surface` | Close a window. Cannot close system surfaces (terminal, explorer, sites, command-bar). |",
        "| `set-active` | Focus/activate a specific window |",
        "| `set-surface-geometry` | Set position `{x,y}`, size `{width,height}`, and/or title of a specific window. Safe for system surfaces. |",
        "| `set-strategy` | Switch layout mode: `floating`, `panels`, `single`, `virtual` |",
        "| `set-style` | Switch chrome: base (`minimal`/`macos`/`windows`/`xwindows`) or presets (`neon`/`cyberpunk`/`hacker`/`glass`/`retro`/`winamp`/`matrix`/`stealth`). Optional `theme` object. |",
        "| `set-layout` | Apply panel preset: `explorer`, `settings`, `simple`, `miller` |",
        "| `auto-arrange` | Tile all floating windows in an optimal grid |",
        "| `pin-to-dock` / `unpin-from-dock` | Move surfaces between desktop and dock bar. Dock auto-creates on first pin, auto-removes on last unpin. |",
        "| `set-dock` | Configure dock appearance and behavior: edge (bottom/top/left/right), mode (thumbnail/live), overlay (float/push), appearance (frosted/liquid/metal/plastic/transparent), layout (edge/floating/island), shadow, visibility (always/autohide/peek), magnification, glow, item shapes, custom colors. |",
        "| `move-surface` | Reassign a window to a different panel (panels mode only) |",
        "| `popout` / `redock` | Float a panel window or return it |",
        "",
        "### Quick Start",
        "",
        `1. **Read \`/${this.endpointType}/sessions/:sid/wm\`** — Current strategy, active surface, surface count`,
        `2. **List \`/${this.endpointType}/sessions/:sid/wm/surfaces\`** — All open windows`,
        `3. **List \`/${this.endpointType}/sessions/:sid/wm/.actions\`** — All actions with full schemas`,
        "",
        `> **Tip**: Use \`~\` as session ID alias for the current session, e.g. \`/${this.endpointType}/sessions/~/wm\``,
        "",
        `## Capabilities: ${this.backend.capabilities.join(", ")}`,
        `## Formats: ${this.backend.supportedFormats.join(", ")}`,
      ].join("\n"),
    };
  }

  @Explain("/input")
  async explainInput(_ctx: RouteContext): Promise<AFSExplainResult> {
    return {
      format: "text",
      content:
        "Input channel — use `read('/input')` to wait for user input. " +
        "Use `stat('/input')` to check if input is pending without blocking.",
    };
  }

  @Explain("/output")
  async explainOutput(_ctx: RouteContext): Promise<AFSExplainResult> {
    return {
      format: "text",
      content:
        "Output channel — use `write('/output', { content: '...' })` to display content to the user.",
    };
  }

  @Explain("/pages")
  async explainPages(_ctx: RouteContext): Promise<AFSExplainResult> {
    return {
      format: "text",
      content:
        "Pages directory — use `write('/pages/:id', { content, meta: { format } })` to create pages. " +
        "Use `exec('/.actions/navigate', { page: ':id' })` to display a page.",
    };
  }

  // ─── Endpoint Routes ───────────────────────────────────────

  @Read("/:endpoint")
  async readEndpoint(ctx: RouteContext): Promise<AFSEntry> {
    const endpoint = this.assertEndpoint(ctx);
    const sessions = this.sessions.list(endpoint);
    const isWeb = endpoint === "web";
    return {
      id: endpoint,
      path: joinURL("/", endpoint),
      content: `${endpoint} endpoint — ${sessions.length} active session(s)`,
      meta: {
        kind: "endpoint",
        childrenCount: isWeb ? 2 : 1, // sessions + live (web only)
      },
    };
  }

  @Stat("/:endpoint")
  async statEndpoint(ctx: RouteContext): Promise<AFSStatResult> {
    const endpoint = this.assertEndpoint(ctx);
    const isWeb = endpoint === "web";
    return {
      data: {
        id: endpoint,
        path: joinURL("/", endpoint),
        meta: {
          kind: "endpoint",
          childrenCount: isWeb ? 2 : 1,
        },
      },
    };
  }

  @List("/:endpoint")
  async listEndpoint(ctx: RouteContext): Promise<AFSListResult> {
    const endpoint = this.assertEndpoint(ctx);
    const sessions = this.sessions.list(endpoint);
    const entries: AFSEntry[] = [
      {
        id: "sessions",
        path: joinURL("/", endpoint, "sessions"),
        meta: {
          kind: "sessions-directory",
          childrenCount: sessions.length,
        },
      },
    ];
    if (endpoint === "web") {
      const channelCount = this.getActiveChannelCount();
      entries.push({
        id: "live",
        path: joinURL("/", endpoint, "live"),
        meta: {
          kind: "live-directory",
          childrenCount: channelCount,
        },
      });
    }
    return { data: entries };
  }

  @Meta("/:endpoint")
  async metaEndpoint(ctx: RouteContext): Promise<AFSEntry> {
    const endpoint = this.assertEndpoint(ctx);
    const isWeb = endpoint === "web";
    return {
      id: endpoint,
      path: joinURL("/", endpoint, ".meta"),
      meta: {
        kind: "endpoint",
        childrenCount: isWeb ? 2 : 1,
      },
    };
  }

  @Read("/:endpoint/sessions")
  async readSessions(ctx: RouteContext): Promise<AFSEntry> {
    const endpoint = this.assertEndpoint(ctx);
    const sessions = this.sessions.list(endpoint);
    return {
      id: "sessions",
      path: joinURL("/", endpoint, "sessions"),
      content: `${sessions.length} active session(s)`,
      meta: {
        kind: "sessions-directory",
        childrenCount: sessions.length,
      },
    };
  }

  @Meta("/:endpoint/sessions")
  async metaSessions(ctx: RouteContext): Promise<AFSEntry> {
    const endpoint = this.assertEndpoint(ctx);
    const sessions = this.sessions.list(endpoint);
    return {
      id: "sessions",
      path: joinURL("/", endpoint, "sessions", ".meta"),
      meta: {
        kind: "sessions-directory",
        childrenCount: sessions.length,
      },
    };
  }

  // ─── Session-Scoped Routes ─────────────────────────────────

  @List("/:endpoint/sessions")
  async listSessions(_ctx: RouteContext): Promise<AFSListResult> {
    const endpoint = this.assertEndpoint(_ctx);
    const sessions = this.sessions.list(endpoint);
    sessions.sort((a, b) => b.lastActive - a.lastActive);
    return {
      data: sessions.map((s) => ({
        id: s.id,
        path: joinURL("/", endpoint, "sessions", s.id),
        meta: { ...s.toMeta(), kind: "session", childrenCount: -1 },
      })),
    };
  }

  @List("/:endpoint/sessions/:sid")
  async listSession(ctx: RouteContext): Promise<AFSListResult> {
    const session = this.resolveSession(ctx);
    const endpoint = ctx.params.endpoint as string;
    const basePath = joinURL("/", endpoint, "sessions", session.id);
    return {
      data: [
        {
          id: "messages",
          path: joinURL(basePath, "messages"),
          meta: { kind: "messages-directory", childrenCount: session.listMessages().length },
        },
        {
          id: "pages",
          path: joinURL(basePath, "pages"),
          meta: { kind: "pages-directory", childrenCount: session.listPages().length },
        },
        {
          id: "tree",
          path: joinURL(basePath, "tree"),
          meta: { kind: "aup:tree", childrenCount: 0 },
        },
        {
          id: "wm",
          path: joinURL(basePath, "wm"),
          meta: { kind: "wm", childrenCount: 3 },
        },
      ],
    };
  }

  @Read("/:endpoint/sessions/:sid")
  async readSession(ctx: RouteContext): Promise<AFSEntry> {
    const session = this.resolveSession(ctx);
    const endpoint = ctx.params.endpoint as string;
    return {
      id: session.id,
      path: joinURL("/", endpoint, "sessions", session.id),
      content: `Session ${session.id} (${session.endpoint})`,
      meta: { kind: "session", ...session.toMeta() },
    };
  }

  @Meta("/:endpoint/sessions/:sid")
  async metaSession(ctx: RouteContext): Promise<AFSEntry> {
    const session = this.resolveSession(ctx);
    const endpoint = ctx.params.endpoint as string;
    return {
      id: session.id,
      path: joinURL("/", endpoint, "sessions", session.id, ".meta"),
      meta: {
        kind: "session",
        ...session.toMeta(),
        capabilities: {
          supportedTypes: [
            "text",
            "table",
            "form",
            "select",
            "confirm",
            "dialog",
            "progress",
            "notification",
            "markdown",
            "code",
          ],
          interactive: ["prompt", "select", "confirm", "form", "dialog"],
          pages: true,
          fallback: "degrade_to_text",
        },
        viewport: this.backend.getViewport(),
      },
    };
  }

  @Stat("/:endpoint/sessions/:sid")
  async statSession(ctx: RouteContext): Promise<AFSStatResult> {
    const session = this.resolveSession(ctx);
    const endpoint = ctx.params.endpoint as string;
    return {
      data: {
        id: session.id,
        path: joinURL("/", endpoint, "sessions", session.id),
        meta: { kind: "session", ...session.toMeta() },
      },
    };
  }

  // ── Messages ──

  @List("/:endpoint/sessions/:sid/messages")
  async listSessionMessages(ctx: RouteContext): Promise<AFSListResult> {
    const session = this.resolveSession(ctx);
    const endpoint = ctx.params.endpoint as string;
    const msgs = session.listMessages();
    return {
      data: msgs.map((m) => ({
        id: m.id,
        path: joinURL("/", endpoint, "sessions", session.id, "messages", m.id),
        content: m,
        meta: { kind: "message", type: m.type, from: m.from },
      })),
    };
  }

  @Read("/:endpoint/sessions/:sid/messages/:mid")
  async readSessionMessage(ctx: RouteContext): Promise<AFSEntry> {
    const session = this.resolveSession(ctx);
    const mid = ctx.params.mid as string;
    const endpoint = ctx.params.endpoint as string;
    const msg = session.findMessage(mid);
    if (!msg) throw new Error(`Message not found: ${mid}`);
    return {
      id: msg.id,
      path: joinURL("/", endpoint, "sessions", session.id, "messages", mid),
      content: msg,
      meta: { kind: "message", type: msg.type, from: msg.from },
    };
  }

  @Write("/:endpoint/sessions/:sid/messages")
  async writeSessionMessage(
    ctx: RouteContext,
    payload: { content?: unknown; meta?: Record<string, unknown> },
  ): Promise<AFSWriteResult> {
    const session = this.resolveSession(ctx);
    const endpoint = ctx.params.endpoint as string;
    const msgData =
      typeof payload.content === "object" && payload.content !== null
        ? (payload.content as Record<string, unknown>)
        : { type: "text", from: "agent", content: String(payload.content ?? "") };
    const msg = session.addMessage(msgData);

    // Forward to backend for rendering (text messages go to write)
    if (msg.type === "text" && msg.from === "agent" && typeof msg.content === "string") {
      await this.backend.write(msg.content as string);
    }

    return {
      data: {
        id: msg.id,
        path: joinURL("/", endpoint, "sessions", session.id, "messages", msg.id),
        content: msg,
        meta: { kind: "message", type: msg.type },
      },
    };
  }

  // ── Session Pages ──

  @List("/:endpoint/sessions/:sid/pages")
  async listSessionPages(ctx: RouteContext): Promise<AFSListResult> {
    const session = this.resolveSession(ctx);
    const endpoint = ctx.params.endpoint as string;
    return {
      data: session.listPages().map(({ id, page }) => ({
        id,
        path: joinURL("/", endpoint, "sessions", session.id, "pages", id),
        meta: { kind: "page", format: page.format, childrenCount: 0 },
      })),
    };
  }

  @Read("/:endpoint/sessions/:sid/pages/:pid")
  async readSessionPage(ctx: RouteContext): Promise<AFSEntry> {
    const session = this.resolveSession(ctx);
    const pid = ctx.params.pid as string;
    const endpoint = ctx.params.endpoint as string;
    const page = session.getPage(pid);
    if (!page) throw new Error(`Page not found: ${pid}`);
    return {
      id: pid,
      path: joinURL("/", endpoint, "sessions", session.id, "pages", pid),
      content: page.content,
      meta: { kind: "page", format: page.format, layout: page.layout },
    };
  }

  @Write("/:endpoint/sessions/:sid/pages/:pid")
  async writeSessionPage(
    ctx: RouteContext,
    payload: { content?: string; meta?: Record<string, unknown> },
  ): Promise<AFSWriteResult> {
    const session = this.resolveSession(ctx);
    const pid = ctx.params.pid as string;
    const endpoint = ctx.params.endpoint as string;
    const content =
      typeof payload.content === "string" ? payload.content : String(payload.content ?? "");
    const format = (payload.meta?.format as string) ?? "html";
    const layout = (payload.meta?.layout as Record<string, string>) ?? undefined;
    session.setPage(pid, { content, format, layout });
    return {
      data: {
        id: pid,
        path: joinURL("/", endpoint, "sessions", session.id, "pages", pid),
        content,
        meta: { kind: "page", format },
      },
    };
  }

  // ── Session Device Caps (D13) ──

  @Read("/:endpoint/sessions/:sid/.caps")
  async readSessionCaps(ctx: RouteContext): Promise<AFSEntry> {
    const session = this.resolveSession(ctx);
    const endpoint = ctx.params.endpoint as string;
    return {
      id: ".caps",
      path: joinURL("/", endpoint, "sessions", session.id, ".caps"),
      content: session.deviceCaps,
      meta: { kind: "aup:device-caps" },
    };
  }

  @Write("/:endpoint/sessions/:sid/.caps")
  async writeSessionCaps(
    ctx: RouteContext,
    payload: { content?: unknown },
  ): Promise<AFSWriteResult> {
    const session = this.resolveSession(ctx);
    const endpoint = ctx.params.endpoint as string;
    const err = session.setDeviceCaps(payload.content);
    if (err) throw new Error(`Invalid DeviceCaps: ${err}`);
    const capsPath = joinURL("/", endpoint, "sessions", session.id, ".caps");
    return {
      data: { id: capsPath, path: capsPath },
    };
  }

  // ── Session AUP Tree ──

  @Read("/:endpoint/sessions/:sid/tree")
  async readSessionTree(ctx: RouteContext): Promise<AFSEntry> {
    const session = this.resolveSession(ctx);
    const endpoint = ctx.params.endpoint as string;
    const store = this.aupRegistry.get(session.id)?.getStore();
    const root = store?.getRoot() ?? null;
    return {
      id: "tree",
      path: joinURL("/", endpoint, "sessions", session.id, "tree"),
      content: root,
      meta: { kind: "aup:tree" },
    };
  }

  @Write("/:endpoint/sessions/:sid/tree")
  async writeSessionTree(
    ctx: RouteContext,
    payload: { content?: unknown; meta?: Record<string, unknown> },
  ): Promise<AFSWriteResult> {
    const session = this.resolveSession(ctx);
    const endpoint = ctx.params.endpoint as string;
    const root = payload.content;
    if (!root || typeof root !== "object")
      throw new Error("tree write requires a node object as content");

    const err = validateNode(root);
    if (err) throw new Error(`Invalid AUP node: ${err}`);

    const store = this.getAupStore(session.id);
    store.setRoot(root as import("./aup-types.js").AUPNode);

    // Extract render options from meta
    const meta = payload.meta ?? {};
    const fullPage = meta.fullPage === true;
    const chrome = meta.chrome === true;
    const tone = typeof meta.tone === "string" ? meta.tone : undefined;
    const palette = typeof meta.palette === "string" ? meta.palette : undefined;
    const locale = typeof meta.locale === "string" ? meta.locale : undefined;

    // Send to the session's connected client (degraded for device caps)
    if (isAUPTransport(this.backend)) {
      const degraded = this.degradeForSession(store.getRoot()!, session);
      const msg: Record<string, unknown> = { type: "aup", action: "render", root: degraded };
      if (fullPage) msg.fullPage = true;
      if (chrome) msg.chrome = true;
      if (tone) msg.tone = tone;
      if (palette) msg.palette = palette;
      if (locale) msg.locale = locale;
      this.backend.sendToSession(session.id, msg);
    }

    // Emit event so subscribers get notified
    const treePath = joinURL("/", endpoint, "sessions", session.id, "tree");
    this.emit({ type: "afs:write", path: treePath, data: { root: store.getRoot() } });

    this.scheduleSessionPersist(session.id);

    return {
      data: {
        id: "tree",
        path: treePath,
        content: store.getRoot(),
        meta: { kind: "aup:tree" },
      },
    };
  }

  // ── Session Explain ──

  @Explain("/:endpoint/sessions/:sid")
  async explainSession(ctx: RouteContext): Promise<AFSExplainResult> {
    const session = this.resolveSession(ctx);
    return {
      format: "markdown",
      content: [
        `# Session ${session.id}`,
        "",
        `Endpoint: ${session.endpoint}`,
        `Messages: ${session.listMessages().length}`,
        `Pages: ${session.listPages().length}`,
        "",
        "## Paths",
        "- `messages/` — Message stream (read/write)",
        "- `pages/:id` — Managed pages (CRUD)",
        "- `wm/` — Window Manager (surfaces, layout, strategy, 16 desktop-control actions)",
        "- `.actions/*` — Interactive actions (aup_render, aup_patch, prompt, dialog, ...)",
      ].join("\n"),
    };
  }

  // ─── Live Channel Routes (web endpoint only) ─────────────────

  /** Assert web endpoint and return channelId from params */
  private assertLiveChannel(ctx: RouteContext): string {
    const endpoint = ctx.params.endpoint as string;
    if (endpoint !== "web") throw new AFSNotFoundError(`/${endpoint}/live`);
    this.assertEndpoint(ctx);
    return ctx.params.channelId as string;
  }

  @List("/:endpoint/live")
  async listLiveChannels(ctx: RouteContext): Promise<AFSListResult> {
    const endpoint = ctx.params.endpoint as string;
    if (endpoint !== "web") throw new AFSNotFoundError(`/${endpoint}/live`);
    this.assertEndpoint(ctx);
    const ids = this.getActiveChannelIds();
    return {
      data: ids.map((id) => ({
        id,
        path: joinURL("/", endpoint, "live", id),
        meta: { kind: "live-channel", childrenCount: 1 },
      })),
    };
  }

  @Read("/:endpoint/live")
  async readLiveDirectory(ctx: RouteContext): Promise<AFSEntry> {
    const endpoint = ctx.params.endpoint as string;
    if (endpoint !== "web") throw new AFSNotFoundError(`/${endpoint}/live`);
    this.assertEndpoint(ctx);
    const ids = this.getActiveChannelIds();
    return {
      id: "live",
      path: joinURL("/", endpoint, "live"),
      content: `${ids.length} active live channel(s)`,
      meta: { kind: "live-directory", childrenCount: ids.length },
    };
  }

  @Meta("/:endpoint/live")
  async metaLiveDirectory(ctx: RouteContext): Promise<AFSEntry> {
    const endpoint = ctx.params.endpoint as string;
    if (endpoint !== "web") throw new AFSNotFoundError(`/${endpoint}/live`);
    this.assertEndpoint(ctx);
    const ids = this.getActiveChannelIds();
    return {
      id: "live",
      path: joinURL("/", endpoint, "live", ".meta"),
      meta: { kind: "live-directory", childrenCount: ids.length },
    };
  }

  @Read("/:endpoint/live/:channelId")
  async readLiveChannel(ctx: RouteContext): Promise<AFSEntry> {
    const channelId = this.assertLiveChannel(ctx);
    const endpoint = ctx.params.endpoint as string;
    const store = this.aupRegistry.get(this.channelAupKey(channelId))?.getStore();
    const hasTree = !!store?.getRoot();
    return {
      id: channelId,
      path: joinURL("/", endpoint, "live", channelId),
      content: `Live channel: ${channelId}`,
      meta: { kind: "live-channel", hasTree, childrenCount: 1 },
    };
  }

  @Meta("/:endpoint/live/:channelId")
  async metaLiveChannel(ctx: RouteContext): Promise<AFSEntry> {
    const channelId = this.assertLiveChannel(ctx);
    const endpoint = ctx.params.endpoint as string;
    return {
      id: channelId,
      path: joinURL("/", endpoint, "live", channelId, ".meta"),
      meta: { kind: "live-channel", childrenCount: 1 },
    };
  }

  @List("/:endpoint/live/:channelId")
  async listLiveChannel(ctx: RouteContext): Promise<AFSListResult> {
    const channelId = this.assertLiveChannel(ctx);
    const endpoint = ctx.params.endpoint as string;
    return {
      data: [
        {
          id: "tree",
          path: joinURL("/", endpoint, "live", channelId, "tree"),
          meta: { kind: "aup:tree", childrenCount: 0 },
        },
      ],
    };
  }

  @Read("/:endpoint/live/:channelId/tree")
  async readLiveChannelTree(ctx: RouteContext): Promise<AFSEntry> {
    const channelId = this.assertLiveChannel(ctx);
    const endpoint = ctx.params.endpoint as string;
    const store = this.aupRegistry.get(this.channelAupKey(channelId))?.getStore();
    const root = store?.getRoot() ?? null;
    return {
      id: "tree",
      path: joinURL("/", endpoint, "live", channelId, "tree"),
      content: root,
      meta: { kind: "aup:tree" },
    };
  }

  @Meta("/:endpoint/live/:channelId/tree")
  async metaLiveChannelTree(ctx: RouteContext): Promise<AFSEntry> {
    const channelId = this.assertLiveChannel(ctx);
    const endpoint = ctx.params.endpoint as string;
    return {
      id: "tree",
      path: joinURL("/", endpoint, "live", channelId, "tree", ".meta"),
      meta: { kind: "aup:tree" },
    };
  }

  @Write("/:endpoint/live/:channelId/tree")
  async writeLiveChannelTree(
    ctx: RouteContext,
    payload: { content?: unknown; meta?: Record<string, unknown> },
  ): Promise<AFSWriteResult> {
    const channelId = this.assertLiveChannel(ctx);
    const endpoint = ctx.params.endpoint as string;
    const root = payload.content;
    if (!root || typeof root !== "object")
      throw new Error("tree write requires a node object as content");

    const err = validateNode(root);
    if (err) throw new Error(`Invalid AUP node: ${err}`);

    const store = this.getChannelAupStore(channelId);
    store.setRoot(root as import("./aup-types.js").AUPNode);

    // Extract render options from meta
    const meta = payload.meta ?? {};
    const fullPage = meta.fullPage !== false; // default true for channels
    const chrome = meta.chrome === true;
    const tone = typeof meta.tone === "string" ? meta.tone : undefined;
    const palette = typeof meta.palette === "string" ? meta.palette : undefined;
    const locale = typeof meta.locale === "string" ? meta.locale : undefined;

    // Broadcast to all channel viewers
    if (isAUPTransport(this.backend)) {
      const msg: Record<string, unknown> = { type: "aup", action: "render", root: store.getRoot() };
      if (fullPage) msg.fullPage = true;
      if (chrome) msg.chrome = true;
      if (tone) msg.tone = tone;
      if (palette) msg.palette = palette;
      if (locale) msg.locale = locale;
      this.backend.sendToLiveChannel(channelId, msg);
    }

    // Emit event for subscribers
    const treePath = joinURL("/", endpoint, "live", channelId, "tree");
    this.emit({ type: "afs:write", path: treePath, data: { root: store.getRoot() } });

    return {
      data: {
        id: "tree",
        path: treePath,
        content: store.getRoot(),
        meta: { kind: "aup:tree" },
      },
    };
  }

  @Actions("/:endpoint/live/:channelId")
  async listLiveChannelActions(ctx: RouteContext): Promise<AFSListResult> {
    const channelId = this.assertLiveChannel(ctx);
    const endpoint = ctx.params.endpoint as string;
    const basePath = joinURL("/", endpoint, "live", channelId, ".actions");
    return {
      data: [
        {
          id: "aup_render",
          path: joinURL(basePath, "aup_render"),
          meta: {
            kind: "afs:executable",
            description: "Render AUP tree to all live channel viewers",
            inputSchema: {
              type: "object",
              required: ["root"],
              properties: {
                root: { type: "object", description: "AUP node tree" },
                fullPage: { type: "boolean", default: true },
                chrome: { type: "boolean", description: "Show lang/theme/mode toolbar" },
                theme: { type: "string", enum: ["dark", "light", "auto"] },
                style: { type: "string" },
                locale: { type: "string" },
              },
            },
          },
        },
        {
          id: "aup_patch",
          path: joinURL(basePath, "aup_patch"),
          meta: {
            kind: "afs:executable",
            description: "Patch AUP tree for all live channel viewers",
            inputSchema: {
              type: "object",
              required: ["ops"],
              properties: {
                ops: {
                  type: "array",
                  description: "Patch operations to apply",
                  items: {
                    type: "object",
                    required: ["op", "id"],
                    properties: {
                      op: {
                        type: "string",
                        enum: ["create", "update", "remove", "reorder"],
                        description: "Operation type",
                      },
                      id: {
                        type: "string",
                        description:
                          "Target node id (for update/remove/reorder) or new node id (for create)",
                      },
                      props: {
                        type: "object",
                        description: "Props to merge into node (for update)",
                      },
                      parentId: { type: "string", description: "Parent node id (for create)" },
                      node: {
                        type: "object",
                        description: "Full AUP node { id, type, props, children } (for create)",
                      },
                      index: { type: "number", description: "Position index (for create/reorder)" },
                    },
                  },
                },
              },
            },
          },
        },
      ],
    };
  }

  @Actions.Exec("/:endpoint/live/:channelId", "aup_render")
  async execLiveChannelAupRender(
    ctx: RouteContext,
    args: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    const channelId = this.assertLiveChannel(ctx);
    const endpoint = ctx.params.endpoint as string;
    const root = args.root as Record<string, unknown> | undefined;
    if (!root) throw new Error("aup_render action requires 'root' argument");
    const fullPage = args.fullPage !== false; // default true for channels
    const chrome = args.chrome === true;
    const tone = typeof args.tone === "string" ? args.tone : undefined;
    const palette = typeof args.palette === "string" ? args.palette : undefined;
    const locale = typeof args.locale === "string" ? args.locale : undefined;

    const err = validateNode(root);
    if (err) throw new Error(`Invalid AUP node: ${err}`);

    const store = this.getChannelAupStore(channelId);
    store.setRoot(root as unknown as import("./aup-types.js").AUPNode);
    store.setRenderOptions({ fullPage, chrome, tone, palette, locale });

    // Broadcast to all channel viewers
    if (isAUPTransport(this.backend)) {
      const msg: Record<string, unknown> = {
        type: "aup",
        action: "render",
        root: store.getRoot(),
        treeVersion: store.version,
      };
      if (fullPage) msg.fullPage = true;
      if (chrome) msg.chrome = true;
      if (tone) msg.tone = tone;
      if (palette) msg.palette = palette;
      if (locale) msg.locale = locale;
      this.backend.sendToLiveChannel(channelId, msg);
    }

    // Emit AFS event for subscribers
    const treePath = joinURL("/", endpoint, "live", channelId, "tree");
    this.emit({ type: "afs:write", path: treePath, data: { root: store.getRoot() } });

    return { success: true };
  }

  @Actions.Exec("/:endpoint/live/:channelId", "aup_patch")
  async execLiveChannelAupPatch(
    ctx: RouteContext,
    args: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    const channelId = this.assertLiveChannel(ctx);
    const endpoint = ctx.params.endpoint as string;
    const ops = args.ops as unknown[] | undefined;
    if (!ops || !Array.isArray(ops))
      throw new Error("aup_patch action requires 'ops' array argument");

    const store = this.getChannelAupStore(channelId);
    store.applyPatch(ops as import("./aup-types.js").AUPPatchOp[]);

    // Broadcast patch to all channel viewers
    if (isAUPTransport(this.backend)) {
      this.backend.sendToLiveChannel(channelId, {
        type: "aup",
        action: "patch",
        ops,
        treeVersion: store.version,
      });
    }

    // Emit AFS event for subscribers
    const treePath = joinURL("/", endpoint, "live", channelId, "tree");
    this.emit({ type: "afs:write", path: treePath, data: { root: store.getRoot() } });

    return { success: true };
  }

  // ─── Per-Session Actions ────────────────────────────────────

  private sessionActionEntries(basePath: string): AFSEntry[] {
    return [
      {
        id: "prompt",
        path: joinURL(basePath, "prompt"),
        meta: {
          kind: "afs:executable",
          description: "Ask user a question",
          inputSchema: {
            type: "object",
            required: ["message"],
            properties: {
              message: { type: "string" },
              type: {
                type: "string",
                enum: ["text", "password", "confirm", "select", "multiselect"],
                default: "text",
              },
              options: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
      {
        id: "clear",
        path: joinURL(basePath, "clear"),
        meta: {
          kind: "afs:executable",
          description: "Clear screen",
          inputSchema: { type: "object", properties: {} },
        },
      },
      {
        id: "notify",
        path: joinURL(basePath, "notify"),
        meta: {
          kind: "afs:executable",
          description: "Send notification",
          inputSchema: {
            type: "object",
            required: ["message"],
            properties: { message: { type: "string" } },
          },
        },
      },
      {
        id: "navigate",
        path: joinURL(basePath, "navigate"),
        meta: {
          kind: "afs:executable",
          description: "Navigate to a managed page",
          inputSchema: {
            type: "object",
            required: ["page"],
            properties: { page: { type: "string" } },
          },
        },
      },
      {
        id: "dialog",
        path: joinURL(basePath, "dialog"),
        meta: {
          kind: "afs:executable",
          description: "Show dialog with custom buttons",
          inputSchema: {
            type: "object",
            required: ["title", "content", "buttons"],
            properties: {
              title: { type: "string" },
              content: { type: "string" },
              buttons: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
      {
        id: "progress",
        path: joinURL(basePath, "progress"),
        meta: {
          kind: "afs:executable",
          description: "Display/update progress indicator",
          inputSchema: {
            type: "object",
            required: ["label", "value", "max"],
            properties: {
              label: { type: "string" },
              value: { type: "number" },
              max: { type: "number" },
            },
          },
        },
      },
      {
        id: "form",
        path: joinURL(basePath, "form"),
        meta: {
          kind: "afs:executable",
          description: "Collect structured input via form",
          inputSchema: {
            type: "object",
            required: ["fields"],
            properties: {
              title: { type: "string" },
              fields: { type: "array", items: { type: "object" } },
            },
          },
        },
      },
      {
        id: "table",
        path: joinURL(basePath, "table"),
        meta: {
          kind: "afs:executable",
          description: "Display tabular data",
          inputSchema: {
            type: "object",
            required: ["headers", "rows"],
            properties: {
              headers: { type: "array", items: { type: "string" } },
              rows: { type: "array", items: { type: "array", items: { type: "string" } } },
            },
          },
        },
      },
      {
        id: "toast",
        path: joinURL(basePath, "toast"),
        meta: {
          kind: "afs:executable",
          description: "Show lightweight toast notification",
          inputSchema: {
            type: "object",
            required: ["message"],
            properties: {
              message: { type: "string" },
              toastType: {
                type: "string",
                enum: ["info", "success", "warning", "error"],
                default: "info",
              },
            },
          },
        },
      },
      {
        id: "aup_render",
        path: joinURL(basePath, "aup_render"),
        meta: {
          kind: "afs:executable",
          description: "Render an AUP node graph (full replacement)",
          inputSchema: {
            type: "object",
            required: ["root"],
            properties: {
              root: { type: "object", description: "AUP node tree (id, type, props, children)" },
              fullPage: {
                type: "boolean",
                description: "When true, renders AUP as full-page (no chat chrome)",
              },
              chrome: {
                type: "boolean",
                description: "When true, shows lang/theme/mode toolbar. Hidden by default.",
              },
              theme: {
                type: "string",
                enum: ["dark", "light", "auto"],
                description: "Color mode (default: auto, follows system preference)",
              },
              style: {
                type: "string",
                enum: ["midnight", "clean", "glass", "brutalist", "soft", "cyber"],
                description: "Structural style (default: midnight)",
              },
              locale: {
                type: "string",
                description: "Display locale for UI chrome (e.g. 'en', 'zh', 'ja')",
              },
            },
          },
        },
      },
      {
        id: "aup_patch",
        path: joinURL(basePath, "aup_patch"),
        meta: {
          kind: "afs:executable",
          description: "Apply incremental patches to the AUP graph",
          inputSchema: {
            type: "object",
            required: ["ops"],
            properties: {
              ops: {
                type: "array",
                description: "Patch operations to apply",
                items: {
                  type: "object",
                  required: ["op", "id"],
                  properties: {
                    op: {
                      type: "string",
                      enum: ["create", "update", "remove", "reorder"],
                      description: "Operation type",
                    },
                    id: {
                      type: "string",
                      description:
                        "Target node id (for update/remove/reorder) or new node id (for create)",
                    },
                    props: { type: "object", description: "Props to merge into node (for update)" },
                    parentId: { type: "string", description: "Parent node id (for create)" },
                    node: {
                      type: "object",
                      description: "Full AUP node { id, type, props, children } (for create)",
                    },
                    index: { type: "number", description: "Position index (for create/reorder)" },
                  },
                },
              },
            },
          },
        },
      },
      {
        id: "aup_save",
        path: joinURL(basePath, "aup_save"),
        meta: {
          kind: "afs:executable",
          description: "Save current AUP graph to a session page",
          inputSchema: {
            type: "object",
            required: ["pageId"],
            properties: {
              pageId: { type: "string", description: "Page ID to save the graph under" },
            },
          },
        },
      },
      {
        id: "aup_load",
        path: joinURL(basePath, "aup_load"),
        meta: {
          kind: "afs:executable",
          description: "Load a previously saved AUP graph from a session page",
          inputSchema: {
            type: "object",
            required: ["pageId"],
            properties: {
              pageId: { type: "string", description: "Page ID to load the graph from" },
              fullPage: {
                type: "boolean",
                description: "When true, renders AUP as full-page (no chat chrome)",
              },
              chrome: {
                type: "boolean",
                description: "When true, shows lang/theme/mode toolbar. Hidden by default.",
              },
              theme: {
                type: "string",
                enum: ["dark", "light", "auto"],
                description: "Color mode (default: auto, follows system preference)",
              },
              style: {
                type: "string",
                enum: ["midnight", "clean", "glass", "brutalist", "soft", "cyber"],
                description: "Structural style (default: midnight)",
              },
              locale: {
                type: "string",
                description: "Display locale for UI chrome (e.g. 'en', 'zh', 'ja')",
              },
            },
          },
        },
      },
      {
        id: "aup_stage",
        path: joinURL(basePath, "aup_stage"),
        meta: {
          kind: "afs:executable",
          description: "Stage an AUP scene (pre-render off-screen). Use aup_take to swap it live.",
          inputSchema: {
            type: "object",
            required: ["sceneId", "root"],
            properties: {
              sceneId: { type: "string", description: "Unique scene identifier" },
              root: { type: "object", description: "AUP node tree" },
              fullPage: { type: "boolean" },
              chrome: { type: "boolean" },
              theme: { type: "string" },
              style: { type: "string" },
              locale: { type: "string" },
            },
          },
        },
      },
      {
        id: "aup_take",
        path: joinURL(basePath, "aup_take"),
        meta: {
          kind: "afs:executable",
          description: "Take a staged scene live (CSS swap, zero DOM teardown).",
          inputSchema: {
            type: "object",
            required: ["sceneId"],
            properties: {
              sceneId: { type: "string", description: "Scene to take live" },
              transition: {
                type: "string",
                enum: ["cut", "dissolve"],
                description: "Transition type (default: cut)",
              },
              duration: { type: "number", description: "Transition duration in ms" },
            },
          },
        },
      },
      {
        id: "aup_release",
        path: joinURL(basePath, "aup_release"),
        meta: {
          kind: "afs:executable",
          description: "Release a staged scene's resources. Cannot release the active scene.",
          inputSchema: {
            type: "object",
            required: ["sceneId"],
            properties: {
              sceneId: { type: "string", description: "Scene to release" },
            },
          },
        },
      },
    ];
  }

  @Actions("/:endpoint/sessions/:sid")
  async listSessionActions(ctx: RouteContext): Promise<AFSListResult> {
    const session = this.resolveSession(ctx);
    const endpoint = ctx.params.endpoint as string;
    const basePath = joinURL("/", endpoint, "sessions", session.id, ".actions");
    return { data: this.sessionActionEntries(basePath) };
  }

  // ── Interactive Session Actions (write message + await response) ──

  @Actions.Exec("/:endpoint/sessions/:sid", "prompt")
  async execSessionPrompt(
    ctx: RouteContext,
    args: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    const session = this.resolveSession(ctx);
    const message = args.message as string;
    if (!message) throw new Error("prompt action requires 'message' argument");
    const type = (args.type as string) ?? "text";
    const options = args.options as string[] | undefined;

    // Write prompt message
    const promptMsg = session.addMessage({
      type: "prompt",
      from: "agent",
      message,
      promptType: type,
      ...(options ? { options } : {}),
    });

    // Call backend
    const result = await this.backend.prompt({
      message,
      type: type as "text" | "password" | "confirm" | "select" | "multiselect",
      options,
    });

    // Write response message
    session.addMessage({
      type: "prompt.response",
      from: "user",
      ref: promptMsg.id,
      value: result,
    });

    return { success: true, data: { response: result } };
  }

  @Actions.Exec("/:endpoint/sessions/:sid", "form")
  async execSessionForm(ctx: RouteContext, args: Record<string, unknown>): Promise<AFSExecResult> {
    const session = this.resolveSession(ctx);
    const fields = args.fields as Array<{ name: string; label: string; type: string }> | undefined;
    if (!fields || fields.length === 0)
      throw new Error("form action requires non-empty 'fields' argument");
    const title = args.title as string | undefined;

    // Write form message
    const formMsg = session.addMessage({
      type: "form",
      from: "agent",
      ...(title ? { title } : {}),
      fields,
    });

    // Collect values via sequential prompts
    const values: Record<string, unknown> = {};
    for (const field of fields) {
      const promptType = field.type === "password" ? "password" : "text";
      const result = await this.backend.prompt({
        message: `${field.label}:`,
        type: promptType as "text" | "password",
      });
      values[field.name] = result;
    }

    // Write response message
    session.addMessage({
      type: "form.response",
      from: "user",
      ref: formMsg.id,
      data: values,
    });

    return { success: true, data: { values } };
  }

  @Actions.Exec("/:endpoint/sessions/:sid", "dialog")
  async execSessionDialog(
    ctx: RouteContext,
    args: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    const session = this.resolveSession(ctx);
    const title = args.title as string;
    if (!title) throw new Error("dialog action requires 'title' argument");
    const content = (args.content as string) ?? "";
    const buttons = args.buttons as string[] | undefined;
    if (!buttons || buttons.length === 0)
      throw new Error("dialog action requires 'buttons' argument");

    // Write dialog message
    const dialogMsg = session.addMessage({
      type: "dialog",
      from: "agent",
      title,
      content,
      buttons,
    });

    // Use prompt with select
    const result = await this.backend.prompt({
      message: `${title}\n${content}`,
      type: "select",
      options: buttons,
    });

    // Write response message
    session.addMessage({
      type: "dialog.response",
      from: "user",
      ref: dialogMsg.id,
      selected: result,
    });

    return { success: true, data: { selection: result as string } };
  }

  // ── Non-Interactive Session Actions (fire-and-forget with message trail) ──

  @Actions.Exec("/:endpoint/sessions/:sid", "table")
  async execSessionTable(ctx: RouteContext, args: Record<string, unknown>): Promise<AFSExecResult> {
    const session = this.resolveSession(ctx);
    const headers = args.headers as string[] | undefined;
    if (!headers || headers.length === 0)
      throw new Error("table action requires 'headers' argument");
    const rows = (args.rows as string[][]) ?? [];

    // Write table message
    session.addMessage({ type: "table", from: "agent", headers, rows });

    // Format and write to backend
    const colWidths = headers.map((h, i) => {
      let max = h.length;
      for (const row of rows) {
        if (row[i] && row[i].length > max) max = row[i].length;
      }
      return max;
    });
    const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));
    const headerLine = headers.map((h, i) => pad(h, colWidths[i]!)).join(" | ");
    const separator = colWidths.map((w) => "-".repeat(w)).join("-+-");
    const dataLines = rows.map((row) =>
      headers.map((_, i) => pad(row[i] ?? "", colWidths[i]!)).join(" | "),
    );
    await this.backend.write([headerLine, separator, ...dataLines].join("\n"));

    return { success: true };
  }

  @Actions.Exec("/:endpoint/sessions/:sid", "toast")
  async execSessionToast(ctx: RouteContext, args: Record<string, unknown>): Promise<AFSExecResult> {
    const session = this.resolveSession(ctx);
    const message = args.message as string;
    if (!message) throw new Error("toast action requires 'message' argument");

    session.addMessage({ type: "notification", from: "agent", message });
    await this.backend.notify(message);
    return { success: true };
  }

  @Actions.Exec("/:endpoint/sessions/:sid", "progress")
  async execSessionProgress(
    ctx: RouteContext,
    args: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    const session = this.resolveSession(ctx);
    const label = (args.label as string) ?? "";
    const value = args.value as number | undefined;
    if (value === undefined || value === null)
      throw new Error("progress action requires 'value' argument");
    const max = (args.max as number) ?? 100;
    const pct = Math.round((value / max) * 100);

    session.addMessage({ type: "progress", from: "agent", label, value, max });
    await this.backend.notify(`[${pct}%] ${label}`);
    return { success: true, data: { value, max, percent: pct } };
  }

  @Actions.Exec("/:endpoint/sessions/:sid", "clear")
  async execSessionClear(
    ctx: RouteContext,
    _args: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    this.resolveSession(ctx); // validate session exists
    await this.backend.clear();
    return { success: true };
  }

  @Actions.Exec("/:endpoint/sessions/:sid", "navigate")
  async execSessionNavigate(
    ctx: RouteContext,
    args: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    const session = this.resolveSession(ctx);
    const pageId = args.page as string;
    if (!pageId) throw new Error("navigate action requires 'page' argument");

    // Look in session pages first, then legacy pages
    const page = session.getPage(pageId) ?? this.pages.get(pageId);
    if (!page) throw new Error(`Page not found: ${pageId}`);

    if (this.backend.navigate) {
      await this.backend.navigate(pageId, page.content, page.format, page.layout);
    } else {
      await this.backend.write(page.content);
    }
    return { success: true };
  }

  @Actions.Exec("/:endpoint/sessions/:sid", "notify")
  async execSessionNotify(
    ctx: RouteContext,
    args: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    const session = this.resolveSession(ctx);
    const message = args.message as string;
    if (!message) throw new Error("notify action requires 'message' argument");
    session.addMessage({ type: "notification", from: "agent", message });
    await this.backend.notify(message);
    return { success: true };
  }

  // ── AUP Session Actions ──

  @Actions.Exec("/:endpoint/sessions/:sid", "aup_render")
  async execSessionAupRender(
    ctx: RouteContext,
    args: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    const session = this.resolveSession(ctx);
    const root = args.root as Record<string, unknown> | undefined;
    if (!root) throw new Error("aup_render action requires 'root' argument");
    const fullPage = args.fullPage === true;
    const chrome = args.chrome === true;
    const tone = typeof args.tone === "string" ? args.tone : undefined;
    const palette = typeof args.palette === "string" ? args.palette : undefined;
    const locale = typeof args.locale === "string" ? args.locale : undefined;

    const err = validateNode(root);
    if (err) throw new Error(`Invalid AUP node: ${err}`);

    const store = this.getAupStore(session.id);
    store.setRoot(root as unknown as import("./aup-types.js").AUPNode);
    store.setRenderOptions({ fullPage, chrome, tone, palette, locale });

    // Send to the session's connected client (degraded for device caps)
    if (isAUPTransport(this.backend)) {
      const degraded = this.degradeForSession(store.getRoot()!, session);
      const msg: Record<string, unknown> = {
        type: "aup",
        action: "render",
        root: degraded,
        treeVersion: store.version,
      };
      if (fullPage) msg.fullPage = true;
      if (chrome) msg.chrome = true;
      if (tone) msg.tone = tone;
      if (palette) msg.palette = palette;
      if (locale) msg.locale = locale;
      this.backend.sendToSession(session.id, msg);
    }

    // Emit AFS event for subscribers
    const endpoint = ctx.params.endpoint as string;
    const treePath = joinURL("/", endpoint, "sessions", session.id, "tree");
    this.emit({ type: "afs:write", path: treePath, data: { root: store.getRoot() } });

    this.scheduleSessionPersist(session.id);
    return { success: true };
  }

  @Actions.Exec("/:endpoint/sessions/:sid", "aup_patch")
  async execSessionAupPatch(
    ctx: RouteContext,
    args: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    const session = this.resolveSession(ctx);
    const ops = args.ops as unknown[] | undefined;
    if (!ops || !Array.isArray(ops))
      throw new Error("aup_patch action requires 'ops' array argument");

    const store = this.getAupStore(session.id);
    store.applyPatch(ops as import("./aup-types.js").AUPPatchOp[]);

    // Send patch to the session's connected client
    if (isAUPTransport(this.backend)) {
      this.backend.sendToSession(session.id, {
        type: "aup",
        action: "patch",
        ops,
        treeVersion: store.version,
      });
    }

    // Emit AFS event for subscribers
    const endpoint = ctx.params.endpoint as string;
    const treePath = joinURL("/", endpoint, "sessions", session.id, "tree");
    this.emit({ type: "afs:write", path: treePath, data: { root: store.getRoot() } });

    this.scheduleSessionPersist(session.id);
    return { success: true };
  }

  @Actions.Exec("/:endpoint/sessions/:sid", "aup_save")
  async execSessionAupSave(
    ctx: RouteContext,
    args: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    const session = this.resolveSession(ctx);
    const pageId = args.pageId as string | undefined;
    if (!pageId) throw new Error("aup_save action requires 'pageId' argument");

    const store = this.aupRegistry.get(session.id)?.getStore();
    const root = store?.getRoot();
    if (!root) throw new Error("No active AUP graph to save");

    // Save the graph as JSON in the session's pages
    const graphJson = JSON.stringify(root);
    session.setPage(pageId, { content: graphJson, format: "application/json" });

    return { success: true };
  }

  @Actions.Exec("/:endpoint/sessions/:sid", "aup_load")
  async execSessionAupLoad(
    ctx: RouteContext,
    args: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    const session = this.resolveSession(ctx);
    const pageId = args.pageId as string | undefined;
    if (!pageId) throw new Error("aup_load action requires 'pageId' argument");
    const fullPage = args.fullPage === true;
    const chrome = args.chrome === true;
    const tone = typeof args.tone === "string" ? args.tone : undefined;
    const palette = typeof args.palette === "string" ? args.palette : undefined;
    const locale = typeof args.locale === "string" ? args.locale : undefined;

    const page = session.getPage(pageId);
    if (!page) throw new Error(`AUP page not found: ${pageId}`);

    // Parse the stored graph
    const root = JSON.parse(page.content) as import("./aup-types.js").AUPNode;

    // Validate it
    const err = validateNode(root);
    if (err) throw new Error(`Invalid stored AUP graph: ${err}`);

    // Store it and send to the session's connected client (degraded for device caps)
    const store = this.getAupStore(session.id);
    store.setRoot(root);

    if (isAUPTransport(this.backend)) {
      const degraded = this.degradeForSession(store.getRoot()!, session);
      const msg: Record<string, unknown> = { type: "aup", action: "render", root: degraded };
      if (fullPage) msg.fullPage = true;
      if (chrome) msg.chrome = true;
      if (tone) msg.tone = tone;
      if (palette) msg.palette = palette;
      if (locale) msg.locale = locale;
      this.backend.sendToSession(session.id, msg);
    }

    return { success: true };
  }

  // ── AUP Stage-to-Live Session Actions ──

  @Actions.Exec("/:endpoint/sessions/:sid", "aup_stage")
  async execSessionAupStage(
    ctx: RouteContext,
    args: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    const session = this.resolveSession(ctx);
    const sceneId = args.sceneId as string | undefined;
    if (!sceneId) throw new Error("aup_stage action requires 'sceneId' argument");
    const root = args.root as Record<string, unknown> | undefined;
    if (!root) throw new Error("aup_stage action requires 'root' argument");
    const fullPage = args.fullPage === true;
    const chrome = args.chrome === true;
    const tone = typeof args.tone === "string" ? args.tone : undefined;
    const palette = typeof args.palette === "string" ? args.palette : undefined;
    const locale = typeof args.locale === "string" ? args.locale : undefined;

    const err = validateNode(root);
    if (err) throw new Error(`Invalid AUP node: ${err}`);

    const mgr = this.getAupManager(session.id);
    const store = mgr.stage(sceneId, root as unknown as import("./aup-types.js").AUPNode, {
      fullPage,
      chrome,
      tone,
      palette,
      locale,
    });

    // Send stage message to the session's connected client (degraded for device caps)
    if (isAUPTransport(this.backend)) {
      const degraded = this.degradeForSession(store.getRoot()!, session);
      const msg: Record<string, unknown> = {
        type: "aup",
        action: "stage",
        sceneId,
        root: degraded,
        treeVersion: store.version,
      };
      if (fullPage) msg.fullPage = true;
      if (chrome) msg.chrome = true;
      if (tone) msg.tone = tone;
      if (palette) msg.palette = palette;
      if (locale) msg.locale = locale;
      this.backend.sendToSession(session.id, msg);
    }

    return { success: true };
  }

  @Actions.Exec("/:endpoint/sessions/:sid", "aup_take")
  async execSessionAupTake(
    ctx: RouteContext,
    args: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    const session = this.resolveSession(ctx);
    const sceneId = args.sceneId as string | undefined;
    if (!sceneId) throw new Error("aup_take action requires 'sceneId' argument");
    const transition = typeof args.transition === "string" ? args.transition : undefined;
    const duration = typeof args.duration === "number" ? args.duration : undefined;

    const mgr = this.getAupManager(session.id);
    mgr.take(sceneId); // throws if not staged

    // Send take message to the session's connected client
    if (isAUPTransport(this.backend)) {
      const msg: Record<string, unknown> = {
        type: "aup",
        action: "take",
        sceneId,
      };
      if (transition) msg.transition = transition;
      if (duration) msg.duration = duration;
      this.backend.sendToSession(session.id, msg);
    }

    return { success: true };
  }

  @Actions.Exec("/:endpoint/sessions/:sid", "aup_release")
  async execSessionAupRelease(
    ctx: RouteContext,
    args: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    const session = this.resolveSession(ctx);
    const sceneId = args.sceneId as string | undefined;
    if (!sceneId) throw new Error("aup_release action requires 'sceneId' argument");

    const mgr = this.getAupManager(session.id);
    mgr.release(sceneId); // throws if active scene

    // Send release message to the session's connected client
    if (isAUPTransport(this.backend)) {
      this.backend.sendToSession(session.id, {
        type: "aup",
        action: "release",
        sceneId,
      });
    }

    return { success: true };
  }

  // ─── Root Actions (backward compat — delegate to default session) ──

  @Actions("/")
  async listActions(_ctx: RouteContext): Promise<AFSListResult> {
    return {
      data: [
        {
          id: "prompt",
          path: "/.actions/prompt",
          meta: {
            kind: "afs:executable",
            description: "Ask user a question",
            inputSchema: {
              type: "object",
              required: ["message"],
              properties: {
                message: { type: "string", description: "The question to ask" },
                type: {
                  type: "string",
                  enum: ["text", "password", "confirm", "select", "multiselect"],
                  default: "text",
                  description: "Input type",
                },
                options: {
                  type: "array",
                  items: { type: "string" },
                  description: "Options for select/multiselect",
                },
              },
            },
          },
        },
        {
          id: "clear",
          path: "/.actions/clear",
          meta: {
            kind: "afs:executable",
            description: "Clear screen",
            inputSchema: { type: "object", properties: {} },
          },
        },
        {
          id: "notify",
          path: "/.actions/notify",
          meta: {
            kind: "afs:executable",
            description: "Send notification",
            inputSchema: {
              type: "object",
              required: ["message"],
              properties: {
                message: { type: "string", description: "Notification message" },
              },
            },
          },
        },
        {
          id: "navigate",
          path: "/.actions/navigate",
          meta: {
            kind: "afs:executable",
            description: "Navigate to a managed page",
            inputSchema: {
              type: "object",
              required: ["page"],
              properties: {
                page: { type: "string", description: "Page ID to navigate to" },
              },
            },
          },
        },
        {
          id: "dialog",
          path: "/.actions/dialog",
          meta: {
            kind: "afs:executable",
            description: "Show dialog with custom buttons",
            inputSchema: {
              type: "object",
              required: ["title", "content", "buttons"],
              properties: {
                title: { type: "string", description: "Dialog title" },
                content: { type: "string", description: "Dialog content" },
                buttons: {
                  type: "array",
                  items: { type: "string" },
                  description: "Button labels",
                },
              },
            },
          },
        },
        {
          id: "progress",
          path: "/.actions/progress",
          meta: {
            kind: "afs:executable",
            description: "Display/update progress indicator",
            inputSchema: {
              type: "object",
              required: ["label", "value", "max"],
              properties: {
                label: { type: "string", description: "Progress label" },
                value: { type: "number", description: "Current value" },
                max: { type: "number", description: "Maximum value" },
              },
            },
          },
        },
        {
          id: "form",
          path: "/.actions/form",
          meta: {
            kind: "afs:executable",
            description: "Collect structured input via form",
            inputSchema: {
              type: "object",
              required: ["fields"],
              properties: {
                title: { type: "string", description: "Form title" },
                fields: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["name", "label", "type"],
                    properties: {
                      name: { type: "string" },
                      label: { type: "string" },
                      type: {
                        type: "string",
                        enum: ["text", "number", "password", "select", "checkbox", "textarea"],
                      },
                      options: { type: "array", items: { type: "string" } },
                      required: { type: "boolean" },
                    },
                  },
                  description: "Form field definitions",
                },
              },
            },
          },
        },
        {
          id: "table",
          path: "/.actions/table",
          meta: {
            kind: "afs:executable",
            description: "Display tabular data",
            inputSchema: {
              type: "object",
              required: ["headers", "rows"],
              properties: {
                headers: {
                  type: "array",
                  items: { type: "string" },
                  description: "Column headers",
                },
                rows: {
                  type: "array",
                  items: { type: "array", items: { type: "string" } },
                  description: "Table rows",
                },
              },
            },
          },
        },
        {
          id: "toast",
          path: "/.actions/toast",
          meta: {
            kind: "afs:executable",
            description: "Show lightweight toast notification",
            inputSchema: {
              type: "object",
              required: ["message"],
              properties: {
                message: { type: "string", description: "Toast message" },
                toastType: {
                  type: "string",
                  enum: ["info", "success", "warning", "error"],
                  default: "info",
                  description: "Toast type",
                },
              },
            },
          },
        },
      ],
    };
  }

  // ─── Action Implementations ─────────────────────────────────

  @Actions.Exec("/", "prompt")
  async execPrompt(_ctx: RouteContext, args: Record<string, unknown>): Promise<AFSExecResult> {
    const message = args.message as string;
    if (!message) {
      throw new Error("prompt action requires 'message' argument");
    }
    const type = (args.type as string) ?? "text";
    const validTypes = ["text", "password", "confirm", "select", "multiselect"];
    if (!validTypes.includes(type)) {
      throw new Error(`Invalid prompt type: ${type}. Must be one of: ${validTypes.join(", ")}`);
    }
    const options = args.options as string[] | undefined;
    const result = await this.backend.prompt({
      message,
      type: type as "text" | "password" | "confirm" | "select" | "multiselect",
      options,
    });
    return { success: true, data: { response: result } };
  }

  @Actions.Exec("/", "clear")
  async execClear(_ctx: RouteContext, _args: Record<string, unknown>): Promise<AFSExecResult> {
    await this.backend.clear();
    return { success: true };
  }

  @Actions.Exec("/", "notify")
  async execNotify(_ctx: RouteContext, args: Record<string, unknown>): Promise<AFSExecResult> {
    const message = args.message as string;
    if (!message) {
      throw new Error("notify action requires 'message' argument");
    }
    await this.backend.notify(message);
    return { success: true };
  }

  @Actions.Exec("/", "navigate")
  async execNavigate(_ctx: RouteContext, args: Record<string, unknown>): Promise<AFSExecResult> {
    const pageId = args.page as string;
    if (!pageId) {
      throw new Error("navigate action requires 'page' argument");
    }
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page not found: ${pageId}`);
    }

    if (this.backend.navigate) {
      await this.backend.navigate(pageId, page.content, page.format, page.layout);
    } else {
      // Fallback: write page content to output
      await this.backend.write(page.content);
    }
    return { success: true };
  }

  @Actions.Exec("/", "dialog")
  async execDialog(_ctx: RouteContext, args: Record<string, unknown>): Promise<AFSExecResult> {
    const title = args.title as string;
    if (!title) throw new Error("dialog action requires 'title' argument");
    const content = (args.content as string) ?? "";
    const buttons = args.buttons as string[] | undefined;
    if (!buttons || buttons.length === 0) {
      throw new Error("dialog action requires 'buttons' argument");
    }

    // Use prompt with select to implement dialog
    const result = await this.backend.prompt({
      message: `${title}\n${content}`,
      type: "select",
      options: buttons,
    });
    return { success: true, data: { selection: result as string } };
  }

  @Actions.Exec("/", "progress")
  async execProgress(_ctx: RouteContext, args: Record<string, unknown>): Promise<AFSExecResult> {
    const label = (args.label as string) ?? "";
    const value = args.value as number | undefined;
    if (value === undefined || value === null) {
      throw new Error("progress action requires 'value' argument");
    }
    const max = (args.max as number) ?? 100;
    const pct = Math.round((value / max) * 100);

    await this.backend.notify(`[${pct}%] ${label}`);
    return { success: true, data: { value, max, percent: pct } };
  }

  @Actions.Exec("/", "form")
  async execForm(_ctx: RouteContext, args: Record<string, unknown>): Promise<AFSExecResult> {
    const fields = args.fields as Array<{ name: string; label: string; type: string }> | undefined;
    if (!fields || fields.length === 0) {
      throw new Error("form action requires non-empty 'fields' argument");
    }

    // Collect values via sequential prompts
    const values: Record<string, unknown> = {};
    for (const field of fields) {
      const promptType = field.type === "password" ? "password" : "text";
      const result = await this.backend.prompt({
        message: `${field.label}:`,
        type: promptType as "text" | "password",
      });
      values[field.name] = result;
    }

    return { success: true, data: { values } };
  }

  @Actions.Exec("/", "table")
  async execTable(_ctx: RouteContext, args: Record<string, unknown>): Promise<AFSExecResult> {
    const headers = args.headers as string[] | undefined;
    if (!headers || headers.length === 0) {
      throw new Error("table action requires 'headers' argument");
    }
    const rows = (args.rows as string[][]) ?? [];

    // Format as text table
    const colWidths = headers.map((h, i) => {
      let max = h.length;
      for (const row of rows) {
        if (row[i] && row[i].length > max) max = row[i].length;
      }
      return max;
    });

    const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));
    const headerLine = headers.map((h, i) => pad(h, colWidths[i]!)).join(" | ");
    const separator = colWidths.map((w) => "-".repeat(w)).join("-+-");
    const dataLines = rows.map((row) =>
      headers.map((_, i) => pad(row[i] ?? "", colWidths[i]!)).join(" | "),
    );

    const tableText = [headerLine, separator, ...dataLines].join("\n");
    await this.backend.write(tableText);

    return { success: true };
  }

  @Actions.Exec("/", "toast")
  async execToast(_ctx: RouteContext, args: Record<string, unknown>): Promise<AFSExecResult> {
    const message = args.message as string;
    if (!message) throw new Error("toast action requires 'message' argument");

    await this.backend.notify(message);
    return { success: true };
  }
}
