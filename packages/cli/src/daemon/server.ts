/**
 * Daemon Server
 *
 * Unified HTTP server that serves:
 * - Web Explorer UI (static files + WebSocket JSON-RPC)
 * - HTTP REST API on /afs/* (backward compatible)
 * - MCP Streamable HTTP on /mcp (NEW)
 *
 * Uses ExplorerWSServer with httpMiddleware for REST API and MCP routing.
 */

import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import {
  type AFS,
  type AFSModule,
  createDomainRouter,
  type DomainRouter,
  loadBlockletRoutes,
  type ServiceHandler,
  ServiceRouter,
} from "@aigne/afs";
import { type ConfigManager, ExplorerWSServer } from "@aigne/afs-explorer";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { joinURL } from "ufo";
import { TerminalSession } from "../terminal-session.js";
import { collectBody, nodeRequestToWebRequest, webResponseToNodeResponse } from "./node-adapter.js";

export interface DaemonServerOptions {
  afs: AFS;
  port?: number;
  host?: string;
  /** REST API base path (default: "/afs") */
  apiPath?: string;
  /** Path to web/ directory for Explorer UI. */
  webRoot?: string;
  /** Optional ConfigManager for mount management RPCs. */
  configManager?: ConfigManager;
  /** Optional BlockletManager for /api/blocklets/* routes. */
  blockletManager?: import("../program/blocklet-manager.js").BlockletManager;
  /**
   * Additional ServiceHandler registrations — mounted at the given prefix.
   * Example: { "/ui": uiHandler, "/sites/mysite": siteHandler }
   */
  serviceHandlers?: Record<string, ServiceHandler>;
  /** WebBackend from AFSUIProvider — portal WS connections are injected here. */
  portalWebBackend?: {
    injectConnection(
      conn: {
        send(msg: string): void;
        onMessage(cb: (msg: string) => void): void;
        onClose(cb: () => void): void;
        close(code?: number, reason?: string): void;
        readonly isOpen: boolean;
      },
      headers?: Record<string, string | undefined>,
    ): void;
  };
}

export interface DaemonServerInfo {
  port: number;
  url: string;
  mcpUrl: string;
  server: ExplorerWSServer;
  /** The ServiceRouter used for HTTP dispatch — reusable in Workers entry. */
  router: ServiceRouter;
  /** Domain router for host-based blocklet routing (if blockletManager provided). */
  domainRouter?: DomainRouter;
  stop: () => void;
}

/**
 * Create an AFSModule wrapper around AFS for the REST API handler.
 */
function createAFSModule(afs: AFS): AFSModule {
  return {
    name: "afs-daemon",
    accessMode: "readwrite",
    async list(path, options) {
      return afs.list(path, options);
    },
    async read(path, options) {
      return afs.read(path, options);
    },
    async write(path, content, options) {
      return afs.write(path, content, options);
    },
    async delete(path, options) {
      return afs.delete(path, options);
    },
    async search(path, query, options) {
      return afs.search(path, query, options);
    },
    async stat(path, options) {
      return afs.stat(path, options);
    },
    async explain(path, options) {
      return afs.explain(path, options);
    },
    async exec(path, args, options) {
      return afs.exec(path, args, options);
    },
    async rename(oldPath, newPath, options) {
      return afs.rename(oldPath, newPath, options);
    },
  };
}

/**
 * Start the daemon server.
 *
 * Routes (via ExplorerWSServer with httpMiddleware):
 * - GET/POST/DELETE /mcp → MCP Streamable HTTP
 * - POST /afs/*          → HTTP REST API
 * - GET /api/read        → AFS content proxy (handled by ExplorerWSServer)
 * - WS /ws               → JSON-RPC (handled by ExplorerWSServer)
 * - GET /*               → Explorer UI static files (handled by ExplorerWSServer)
 */
export async function startDaemonServer(options: DaemonServerOptions): Promise<DaemonServerInfo> {
  const { afs, host = "localhost", apiPath = "/afs", configManager } = options;
  const port = options.port || 4900;

  // Resolve web root for Explorer assets
  let webRoot = options.webRoot;
  if (!webRoot) {
    try {
      const { createRequire } = await import("node:module");
      const req = createRequire(import.meta.url);
      const explorerPkg = req.resolve("@aigne/afs-explorer/package.json");
      webRoot = resolve(explorerPkg, "..", "web");
    } catch {
      // Fallback — embedded assets may be used
    }
  }

  // Create REST API handler for backward compatibility
  const module = createAFSModule(afs);
  let createAFSHttpHandler: typeof import("@aigne/afs-http")["createAFSHttpHandler"];
  try {
    ({ createAFSHttpHandler } = await import("@aigne/afs-http" as string));
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Missing optional dependency @aigne/afs-http required for daemon REST API. ` +
        `Install it to use daemon HTTP routes. Original error: ${details}`,
    );
  }
  const restHandler = createAFSHttpHandler({ module });

  // MCP: per-session server + transport
  const { createMcpServerInstance, createAFSMcpServer } = await import("../mcp/server.js");

  /** Create a fresh McpServer wired to the AFS instance (one per session). */
  const createSessionMcpServer = () => {
    const srv = createMcpServerInstance();
    createAFSMcpServer({ afs, server: srv });
    return srv;
  };

  // Per-session state: transport + its dedicated McpServer
  const mcpSessions = new Map<
    string,
    { transport: StreamableHTTPServerTransport; server: McpServer }
  >();

  const logTs = () => new Date().toISOString();

  // Build ServiceRouter — all non-MCP routes go through here
  const router = new ServiceRouter();

  // REST API handler wrapped as ServiceHandler
  router.register(apiPath, { fetch: (req) => restHandler(req) });

  // Blocklets API (lazy-import on first request)
  if (options.blockletManager) {
    const bm = options.blockletManager;
    router.register("/api/blocklets", {
      async fetch(request: Request) {
        const { handleBlockletsAPI } = await import("../program/blocklet-daemon-integration.js");
        return handleBlockletsAPI(request, bm);
      },
    });
  }

  // Shared AUP HTML cache — used by both "/" handler and domain router's AUP handler
  let aupHtmlCache: string | undefined;
  async function getAupHtml(): Promise<string> {
    if (!aupHtmlCache) {
      const webPageModule = "@aigne/afs-ui/dist/web-page.mjs";
      const mod = (await import(/* webpackIgnore: true */ webPageModule)) as {
        WEB_CLIENT_HTML: string;
      };
      aupHtmlCache = mod.WEB_CLIENT_HTML;
    }
    return aupHtmlCache;
  }

  // AUP Web Client at / and Terminal page at /terminal
  let termHtmlCache: string | undefined;
  router.register("/", {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);

      // Terminal page (embedded in WM frame via iframe)
      if (url.pathname === "/terminal") {
        if (!termHtmlCache) {
          const termModule = "@aigne/afs-ui/dist/term-page.mjs";
          const mod = (await import(/* webpackIgnore: true */ termModule)) as {
            TERM_CLIENT_HTML: string;
          };
          // Rewrite WS URL to connect to /ws/terminal
          termHtmlCache = mod.TERM_CLIENT_HTML.replace(
            "ws = new WebSocket(proto + '//' + location.host)",
            "ws = new WebSocket(proto + '//' + location.host + '/ws/terminal')",
          );
        }
        return new Response(termHtmlCache, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      // Serve widget JS assets for iframe-based bridge components
      if (url.pathname.startsWith("/widgets/") && url.pathname.endsWith(".js")) {
        const name = url.pathname.slice("/widgets/".length, -".js".length);
        try {
          const widgetModule = "@aigne/afs-ui/dist/widget-assets/index.mjs";
          const { WIDGET_ASSETS } = (await import(/* webpackIgnore: true */ widgetModule)) as {
            WIDGET_ASSETS: Record<string, string>;
          };
          const js = WIDGET_ASSETS[name];
          if (js) {
            return new Response(js, {
              headers: {
                "Content-Type": "application/javascript; charset=utf-8",
                "Cache-Control": "public, max-age=86400",
              },
            });
          }
        } catch {
          // widget-assets not available
        }
        return new Response("Not Found", { status: 404 });
      }

      // Serve widget image assets (e.g. marble textures for webgl-hero)
      if (url.pathname.startsWith("/assets/images/")) {
        const filename = url.pathname.slice("/assets/images/".length);
        try {
          const widgetModule = "@aigne/afs-ui/dist/widget-assets/index.mjs";
          const { WIDGET_IMAGES } = (await import(/* webpackIgnore: true */ widgetModule)) as {
            WIDGET_IMAGES: Record<string, Buffer>;
          };
          const img = WIDGET_IMAGES[filename];
          if (img) {
            return new Response(new Uint8Array(img), {
              headers: {
                "Content-Type": "image/jpeg",
                "Cache-Control": "public, max-age=86400",
              },
            });
          }
        } catch {
          // widget-assets not available
        }
        return new Response("Not Found", { status: 404 });
      }

      if (url.pathname !== "/" && url.pathname !== "") {
        return new Response("Not Found", { status: 404 });
      }
      return new Response(await getAupHtml(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    },
  });

  // Additional ServiceHandlers from options
  if (options.serviceHandlers) {
    for (const [prefix, handler] of Object.entries(options.serviceHandlers)) {
      router.register(prefix, handler);
    }
  }

  // Domain-routed web rendering: per-blocklet SiteServer with basePath "/"
  type DomainSiteServer = {
    render(
      pathname: string,
      options?: unknown,
    ): Promise<{ body: string; contentType: string; status?: number } | null>;
  };
  const domainSiteServerCache = new Map<string, Promise<DomainSiteServer | null>>();
  async function getDomainSiteServer(blockletName: string): Promise<DomainSiteServer | null> {
    let cached = domainSiteServerCache.get(blockletName);
    if (!cached) {
      cached = (async () => {
        try {
          // Check if /_blocklet-web/{name} mount exists (created by daemon.ts .web/ discovery)
          const sourcePath = `/_blocklet-web/${blockletName}`;
          const hasMount = afs.getMounts(null).some((m: { path: string }) => m.path === sourcePath);
          if (!hasMount) {
            // Don't cache — mount may appear later (lazy blocklet discovery)
            domainSiteServerCache.delete(blockletName);
            return null;
          }

          const webDeviceMod = "@aigne/afs-web-device";
          const { SiteServer } = (await import(/* webpackIgnore: true */ webDeviceMod)) as {
            SiteServer: new (
              afs: unknown,
              sitePath: string,
              options?: { libraryThemesDir?: string },
            ) => {
              basePath: string;
              init(): Promise<void>;
              render(
                pathname: string,
                options?: unknown,
              ): Promise<{ body: string; contentType: string; status?: number } | null>;
            };
          };

          // Find library themes from existing mount (if available)
          const libraryThemesDir = afs
            .getMounts(null)
            .find((m: { path: string }) => m.path === "/_blocklet-web/_library/themes")
            ? "/_blocklet-web/_library/themes"
            : undefined;

          const server = new SiteServer(afs, sourcePath, { libraryThemesDir });
          // basePath defaults to "/" — correct for domain routing
          await server.init();
          return server;
        } catch (err) {
          // Evict on failure so next request retries
          domainSiteServerCache.delete(blockletName);
          console.warn(
            `[${logTs()}] Failed to init domain SiteServer for "${blockletName}": ${err instanceof Error ? err.message : err}`,
          );
          return null;
        }
      })();
      domainSiteServerCache.set(blockletName, cached);
    }
    return cached;
  }

  // Domain router: host-header-based blocklet routing (showcase.localhost:4900 → showcase)
  // Uses AFS mounts directly — no BlockletManager dependency.
  // Lazy-mounts blocklets on first domain request (same as ?blocklet= path).
  const domainRouter = createDomainRouter({
    resolveBlocklet: async (nameOrDomain) => {
      // Check if /blocklets/{name} is already mounted
      const mountPath = `/blocklets/${nameOrDomain}`;
      const exists = afs.getMounts(null).some((m: { path: string }) => m.path === mountPath);
      if (exists) return nameOrDomain;

      // Not mounted yet — try lazy mount from local blocklets/ directory
      try {
        const { join } = await import("node:path");
        const { existsSync } = await import("node:fs");
        const searchDirs: string[] = [];
        const actualCwd = process.cwd();
        searchDirs.push(join(actualCwd, "blocklets", nameOrDomain));
        const processDir = process.env.AFS_PROJECT_DIR;
        if (processDir) searchDirs.push(join(processDir, "blocklets", nameOrDomain));

        let blockletDir: string | undefined;
        for (const dir of searchDirs) {
          if (existsSync(join(dir, "blocklet.yaml"))) {
            blockletDir = dir;
            break;
          }
        }
        if (!blockletDir) return undefined;

        // Mount the blocklet directory to AFS
        const fsMod = "@aigne/afs-fs";
        const { AFSFS } = (await import(
          /* webpackIgnore: true */ fsMod
        )) as typeof import("@aigne/afs-fs");
        const fsProvider = new AFSFS({
          localPath: blockletDir,
          description: `Blocklet "${nameOrDomain}"`,
        });
        await afs.mount(fsProvider, mountPath);
        console.log(`[${logTs()}] Domain route: lazy-mounted "${nameOrDomain}" at ${mountPath}`);
        return nameOrDomain;
      } catch {
        return undefined;
      }
    },
    loadRoutes: async (blockletName) => {
      return loadBlockletRoutes(afs, `/blocklets/${blockletName}`);
    },
    getAupClientResponse: async () =>
      new Response(await getAupHtml(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    renderWebPage: async (blockletName: string, subPath: string, _context?: unknown) => {
      // Lazily create a SiteServer with basePath "/" for domain-routed web rendering.
      // Uses /_blocklet-web/{name} mount (same source as /sites/{name} but basePath="/").
      try {
        const server = await getDomainSiteServer(blockletName);
        if (!server) {
          return new Response("Site not found", { status: 404 });
        }
        const result = await server.render(subPath);
        if (!result) {
          return new Response("Not Found", { status: 404 });
        }
        return new Response(result.body, {
          status: result.status ?? 200,
          headers: { "Content-Type": result.contentType },
        });
      } catch (err) {
        console.error(
          `[${logTs()}] Web render error for "${blockletName}": ${err instanceof Error ? err.message : err}`,
        );
        return new Response("Internal Server Error", { status: 500 });
      }
    },
    handleExec: async (
      blockletName: string,
      source: string,
      subPath: string,
      method: string,
      body?: unknown,
      query?: Record<string, string>,
      context?: { requestId?: string },
    ) => {
      // Path traversal guard
      if (subPath.includes("..") || source.includes("..")) {
        return new Response(JSON.stringify({ error: "Path traversal not allowed" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Route exec through global AFS at the blocklet's mount
      const normalizedSource = source === "." ? "" : source.replace(/^\.\//, "");
      const execPath = joinURL("/blocklets", blockletName, normalizedSource, subPath);
      try {
        const args: Record<string, unknown> = {};
        if (method !== "GET" && method !== "HEAD" && body) {
          Object.assign(args, typeof body === "object" ? body : { body });
        }
        if (method === "GET" && query && Object.keys(query).length > 0) {
          args.method = "GET";
          args.query = query;
        }
        const result = await afs.exec(execPath, args, {
          context: { ...context, requestId: context?.requestId ?? crypto.randomUUID() },
        });
        return new Response(JSON.stringify(result.data ?? result), {
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } },
        );
      }
    },
  });

  // HTTP middleware: MCP uses raw req/res, everything else goes through router
  const httpMiddleware = async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    // --- MCP Streamable HTTP on /mcp (uses raw req/res for MCP SDK) ---
    if (url.pathname === "/mcp") {
      return handleMcpRequest(req, res, createSessionMcpServer, mcpSessions);
    }

    // Collect body once — shared between domain router and service router.
    // Skip for GET/HEAD — avoids unnecessary async stream drain on static file requests.
    const body =
      req.method === "GET" || req.method === "HEAD" ? Buffer.alloc(0) : await collectBody(req);
    const webReq = nodeRequestToWebRequest(req, body);

    // --- Domain routing: Host header → blocklet → route dispatch ---
    if (domainRouter) {
      try {
        const domainRes = await domainRouter.handleRequest(webReq);
        if (domainRes) {
          await webResponseToNodeResponse(domainRes, res);
          return true;
        }
      } catch (err) {
        console.error(
          `[${logTs()}] Domain route error ${req.method} ${req.url}: ${err instanceof Error ? err.stack || err.message : err}`,
        );
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
        return true;
      }
    }

    // --- All other routes: single convert → router → respond ---
    if (
      !router.prefixes.some(
        (p) => p === "/" || url.pathname === p || url.pathname.startsWith(`${p}/`),
      )
    ) {
      return false; // No matching route — let ExplorerWSServer handle static files
    }

    try {
      const webRes = await router.fetch(webReq);
      if (webRes.status === 404) return false; // Router didn't match — fall through to static
      await webResponseToNodeResponse(webRes, res);
    } catch (err) {
      console.error(
        `[${logTs()}] Route error ${req.method} ${req.url}: ${err instanceof Error ? err.stack || err.message : err}`,
      );
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }

    return true;
  };

  const terminalSession = new TerminalSession(afs);
  const { portalWebBackend } = options;

  // Explorer UI now serves under /explorer (static files, /api/read, WS at /ws unchanged)
  const explorerServer = new ExplorerWSServer(afs, {
    port,
    host,
    webRoot,
    configManager,
    httpMiddleware,
    explorerBasePath: "/explorer",
    // WebSocket dispatch: /ws/terminal → TerminalSession, everything else → standard path
    onWebSocketUpgrade: (ws, req) => {
      const reqUrl = new URL(req.url || "/", `http://${req.headers.host}`);

      // ── Terminal REPL WebSocket ──
      if (reqUrl.pathname === "/ws/terminal") {
        handleTerminalWs(ws, terminalSession);
        return;
      }

      // ── AUP Portal WebSocket — inject into WebBackend standard path ──
      if (portalWebBackend) {
        const conn = {
          send(msg: string) {
            if (ws.readyState === 1) ws.send(msg);
          },
          onMessage(cb: (msg: string) => void) {
            ws.on("message", (data: unknown) => cb(String(data)));
          },
          onClose(cb: () => void) {
            ws.on("close", cb);
          },
          close(code?: number, reason?: string) {
            ws.close(code, reason);
          },
          get isOpen() {
            return ws.readyState === 1;
          },
        };

        // Extract blocklet from Host header for domain-based routing
        // e.g., "showcase.localhost:4900" → x-blocklet: "showcase"
        const headers: Record<string, string | undefined> = {};
        if (domainRouter) {
          const wsHost = req.headers.host || "";
          const blockletName = domainRouter.extractBlockletForWs(wsHost);
          if (blockletName) {
            headers["x-blocklet"] = blockletName;
          }
        }

        portalWebBackend.injectConnection(conn, headers);
      }
    },
  });

  const info = await explorerServer.start();

  return {
    port: info.port,
    url: info.url,
    mcpUrl: `http://${host}:${info.port}/mcp`,
    server: explorerServer,
    router,
    domainRouter,
    stop: () => explorerServer.stop(),
  };
}

interface McpSession {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

/**
 * Handle MCP Streamable HTTP requests on /mcp.
 *
 * Each client session gets its own McpServer + StreamableHTTPServerTransport pair.
 * The MCP SDK's McpServer only supports one transport at a time, so we create
 * a dedicated instance per session rather than sharing one across connections.
 */
async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  createMcpServer: () => McpServer,
  sessions: Map<string, McpSession>,
): Promise<true> {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }

  // Only GET, POST, DELETE are valid MCP methods
  if (req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return true;
  }

  // Look up existing session or create new one
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  let session: McpSession | undefined;

  if (sessionId) {
    session = sessions.get(sessionId);
  }

  if (!session) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        sessions.set(sid, session!);
      },
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) sessions.delete(sid);
    };

    const server = createMcpServer();

    try {
      await server.connect(transport);
    } catch (err) {
      const ts = new Date().toISOString();
      console.error(
        `[${ts}] MCP connect error: ${err instanceof Error ? err.stack || err.message : err}`,
      );
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "MCP session initialization failed" }));
      }
      return true;
    }

    session = { transport, server };
  }

  try {
    await session.transport.handleRequest(req, res);
  } catch (err) {
    const ts = new Date().toISOString();
    console.error(
      `[${ts}] MCP error ${req.method} /mcp: ${err instanceof Error ? err.stack || err.message : err}`,
    );
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }

  return true;
}

// ─── Terminal WebSocket handler ──────────────────────────────────────────

function handleTerminalWs(ws: import("ws").WebSocket, session: TerminalSession): void {
  // Send banner on connect
  const banner = session.getBanner();
  ws.send(JSON.stringify({ type: "output", data: banner }));

  ws.on("message", async (raw: unknown) => {
    const text = typeof raw === "string" ? raw : String(raw);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }

    if (parsed.type === "line") {
      const content = String(parsed.content ?? "").trim();
      if (!content) return;

      try {
        const messages = await session.handleLine(content);
        if (messages.length === 0) {
          ws.send(JSON.stringify({ type: "done" }));
        } else {
          for (const m of messages) {
            ws.send(JSON.stringify(m));
          }
        }
      } catch (err) {
        ws.send(
          JSON.stringify({
            type: "output",
            data: `Error: ${err instanceof Error ? err.message : String(err)}`,
          }),
        );
      }
    }
  });
}
