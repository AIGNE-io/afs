import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import type { AFS } from "@aigne/afs";

/**
 * ConfigManager interface for mount management operations.
 * Implemented in CLI layer (knows config.toml path), injected into ws-server.
 */
export interface ConfigManager {
  getConfig(): Promise<unknown>;
  getMountList(): Promise<{ mounts: unknown[]; failures: unknown[] }>;
  addMount(mount: Record<string, unknown>): Promise<void>;
  removeMount(path: string): Promise<void>;
  updateMount(path: string, updates: Record<string, unknown>): Promise<void>;
  testMount(
    uri: string,
    auth?: string,
  ): Promise<{ success: boolean; error?: string; providerName?: string }>;
  reloadConfig(): Promise<void>;
  /** Get available providers from runtime discovery (scan installed @aigne/afs-* packages). */
  getRegistry?(): Promise<
    Array<{
      name: string;
      description: string;
      category: string;
      uriTemplate: string;
      tags?: string[];
      packageName?: string;
    }>
  >;
}

export interface WSServerOptions {
  port?: number;
  host?: string;
  /** Path to web/ directory for dev mode serving. */
  webRoot?: string;
  /** Embedded assets (for compiled binary mode). */
  embeddedAssets?: Record<string, string>;
  /** Open browser on start. */
  open?: boolean;
  /** Optional ConfigManager for mount management RPCs. */
  configManager?: ConfigManager;
  /**
   * Optional HTTP middleware. Called before static file serving.
   * Return true if the middleware handled the request.
   */
  httpMiddleware?: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
  /**
   * Base path prefix for Explorer UI (e.g. "/explorer").
   * When set, Explorer only serves static files and /api/read under this prefix.
   * Requests not matching the prefix are left to httpMiddleware.
   */
  explorerBasePath?: string;
  /**
   * Optional WebSocket upgrade handler for non-Explorer paths.
   * Called for upgrade requests that don't match the Explorer WS path (/ws).
   * The callback receives (ws, request) after a successful upgrade.
   */
  onWebSocketUpgrade?: (ws: import("ws").WebSocket, request: IncomingMessage) => void;
}

interface RPCRequest {
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface RPCResponse {
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function getMimeType(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf("."));
  return MIME_TYPES[ext] || "application/octet-stream";
}

export class ExplorerWSServer {
  private httpServer?: ReturnType<typeof createServer>;
  private wss?: import("ws").WebSocketServer;
  private afs: AFS;
  private options: WSServerOptions;

  constructor(afs: AFS, options: WSServerOptions = {}) {
    this.afs = afs;
    this.options = options;
  }

  /** Expose the underlying HTTP server (for adding upgrade listeners). */
  getHttpServer(): ReturnType<typeof createServer> | undefined {
    return this.httpServer;
  }

  /**
   * Broadcast a JSON-RPC notification to all connected WebSocket clients.
   */
  broadcast(method: string, params?: Record<string, unknown>): void {
    if (!this.wss) return;
    const message = JSON.stringify({ method, params });
    for (const client of this.wss.clients) {
      if (client.readyState === 1 /* WebSocket.OPEN */) {
        client.send(message);
      }
    }
  }

  async start(): Promise<{ port: number; url: string }> {
    const port = this.options.port || 0;
    const host = this.options.host || "localhost";
    const afs = this.afs;
    const opts = this.options;
    const configManager = this.options.configManager;
    const httpMiddleware = this.options.httpMiddleware;

    const { WebSocketServer } = await import("ws");

    const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);

      // HTTP middleware (e.g., REST API in daemon mode) — checked first
      if (httpMiddleware) {
        const handled = await httpMiddleware(req, res);
        if (handled) return;
      }

      // Resolve effective pathname — strip basePath prefix when configured
      const basePath = opts.explorerBasePath;
      let explorerPath: string | null = null; // null = not an Explorer request

      if (basePath) {
        // Redirect /explorer → /explorer/ so relative asset paths resolve correctly
        if (url.pathname === basePath) {
          res.writeHead(301, { Location: `${basePath}/` });
          res.end();
          return;
        }
        // Only serve Explorer for requests under the basePath
        if (url.pathname.startsWith(`${basePath}/`)) {
          explorerPath = url.pathname.slice(basePath.length);
        }
      } else {
        // No basePath — Explorer owns everything (legacy behavior)
        explorerPath = url.pathname;
      }

      if (explorerPath === null) {
        // Not an Explorer request — 404 (middleware should have handled it)
        res.writeHead(404);
        res.end("Not Found");
        return;
      }

      // /api/read?path=... — serve AFS content with proper MIME type
      if (explorerPath === "/api/read") {
        const afsPath = url.searchParams.get("path");
        if (!afsPath) {
          res.writeHead(400);
          res.end("Missing path parameter");
          return;
        }
        try {
          const readResult = await afs.read(afsPath);
          const entry = readResult.data;
          const content = entry?.content;

          // Determine MIME type from path extension
          const ext = afsPath.slice(afsPath.lastIndexOf("."));
          const mime = MIME_TYPES[ext] || "application/octet-stream";

          if (content instanceof Buffer || content instanceof Uint8Array) {
            res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-cache" });
            res.end(Buffer.from(content));
          } else if (content instanceof ArrayBuffer) {
            res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-cache" });
            res.end(Buffer.from(new Uint8Array(content)));
          } else {
            const text =
              typeof content === "string"
                ? content
                : content !== undefined && content !== null
                  ? JSON.stringify(content, null, 2)
                  : "";
            res.writeHead(200, {
              "Content-Type": mime.includes("charset") ? mime : `${mime}; charset=utf-8`,
              "Cache-Control": "no-cache",
            });
            res.end(text);
          }
        } catch (err) {
          res.writeHead(500);
          res.end(err instanceof Error ? err.message : String(err));
        }
        return;
      }

      let fileName = explorerPath === "/" ? "index.html" : explorerPath.slice(1);
      fileName = fileName.replace(/\.\./g, "");
      serveStatic(fileName, opts, res);
    });

    // When onWebSocketUpgrade is provided, use noServer mode for both WSS instances
    // so we can manually dispatch upgrade requests by path.
    // (WebSocketServer({ server, path }) rejects non-matching paths with 400 before
    // other upgrade listeners can run.)
    const wss = opts.onWebSocketUpgrade
      ? new WebSocketServer({ noServer: true })
      : new WebSocketServer({ server: httpServer, path: "/ws" });
    this.wss = wss;

    if (opts.onWebSocketUpgrade) {
      const extraWss = new WebSocketServer({ noServer: true });
      const onUpgrade = opts.onWebSocketUpgrade;
      httpServer.on(
        "upgrade",
        (req: IncomingMessage, socket: import("node:net").Socket, head: Buffer) => {
          const reqUrl = new URL(req.url || "/", `http://${req.headers.host}`);
          if (reqUrl.pathname === "/ws") {
            wss.handleUpgrade(req, socket, head, (ws) => {
              wss.emit("connection", ws, req);
            });
          } else {
            extraWss.handleUpgrade(req, socket, head, (ws) => {
              onUpgrade(ws, req);
            });
          }
        },
      );
    }

    wss.on("connection", (ws) => {
      ws.on("message", async (raw) => {
        let req: RPCRequest;
        try {
          const text = typeof raw === "string" ? raw : raw.toString("utf-8");
          req = JSON.parse(text);
        } catch {
          ws.send(JSON.stringify({ id: null, error: { code: -32700, message: "Parse error" } }));
          return;
        }

        if (!req.method || req.id === undefined) {
          ws.send(
            JSON.stringify({
              id: req.id ?? null,
              error: { code: -32600, message: "Invalid request" },
            }),
          );
          return;
        }

        const response = await handleRPC(afs, req, configManager);
        ws.send(JSON.stringify(response));
      });
    });

    this.httpServer = httpServer;

    return new Promise((resolve) => {
      httpServer.listen(port, host, () => {
        const addr = httpServer.address();
        const actualPort = typeof addr === "object" && addr ? addr.port : port;
        const serverUrl = `http://${host}:${actualPort}`;

        if (opts.open) {
          const { exec } = require("node:child_process") as typeof import("node:child_process");
          const cmd =
            process.platform === "darwin"
              ? "open"
              : process.platform === "win32"
                ? "start"
                : "xdg-open";
          exec(`${cmd} ${serverUrl}`);
        }

        resolve({ port: actualPort, url: serverUrl });
      });
    });
  }

  stop() {
    if (this.wss) {
      this.wss.close();
      this.wss = undefined;
    }
    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = undefined;
    }
  }
}

function serveStatic(fileName: string, opts: WSServerOptions, res: ServerResponse): void {
  // Try embedded assets first
  if (opts.embeddedAssets && fileName in opts.embeddedAssets) {
    res.writeHead(200, { "Content-Type": getMimeType(fileName) });
    res.end(opts.embeddedAssets[fileName]);
    return;
  }

  // Try filesystem
  if (opts.webRoot) {
    const filePath = join(opts.webRoot, fileName);
    if (existsSync(filePath)) {
      const content = readFileSync(filePath);
      res.writeHead(200, {
        "Content-Type": getMimeType(fileName),
        "Cache-Control": "no-cache",
      });
      res.end(content);
      return;
    }
  }

  res.writeHead(404);
  res.end("Not Found");
}

async function handleRPC(
  afs: AFS,
  req: RPCRequest,
  configManager?: ConfigManager,
): Promise<RPCResponse> {
  const params = req.params || {};

  try {
    switch (req.method) {
      case "list": {
        const path = (params.path as string) || "/";
        const maxDepth = (params.maxDepth as number) ?? 1;
        const offset = params.offset as number | undefined;
        const limit = params.limit as number | undefined;
        const result = await afs.list(path, { maxDepth, offset, limit });
        return { id: req.id, result: { list: result.data, total: result.total } };
      }

      case "read": {
        const path = params.path as string;
        if (!path) return { id: req.id, error: { code: -32602, message: "path is required" } };
        const readResult = await afs.read(path);
        const entry = readResult.data;
        let content: unknown = entry?.content;
        if (content instanceof Buffer || content instanceof Uint8Array) {
          content = new TextDecoder().decode(content);
        } else if (content instanceof ArrayBuffer) {
          content = new TextDecoder().decode(new Uint8Array(content));
        } else if (typeof content === "object" && content !== null) {
          content = JSON.stringify(content, null, 2);
        } else if (content !== undefined && typeof content !== "string") {
          content = String(content);
        }
        return { id: req.id, result: { content, entry } };
      }

      case "stat": {
        const path = params.path as string;
        if (!path) return { id: req.id, error: { code: -32602, message: "path is required" } };
        const result = await afs.stat(path);
        return { id: req.id, result: result.data || null };
      }

      case "search": {
        const path = (params.path as string) || "/";
        const pattern = params.pattern as string;
        if (!pattern)
          return { id: req.id, error: { code: -32602, message: "pattern is required" } };
        const result = await afs.search(path, pattern);
        return { id: req.id, result };
      }

      case "exec": {
        const path = params.path as string;
        if (!path) return { id: req.id, error: { code: -32602, message: "path is required" } };
        const args = (params.args as Record<string, unknown>) || {};
        const result = await afs.exec(path, args, {});
        return { id: req.id, result };
      }

      case "explain": {
        const path = params.path as string;
        if (!path) return { id: req.id, error: { code: -32602, message: "path is required" } };
        const result = await afs.stat(path);
        return { id: req.id, result: result.data || null };
      }

      case "write": {
        const path = params.path as string;
        if (!path) return { id: req.id, error: { code: -32602, message: "path is required" } };
        const content = params.content;
        await afs.write(path, { content });
        return { id: req.id, result: { success: true } };
      }

      case "delete": {
        const path = params.path as string;
        if (!path) return { id: req.id, error: { code: -32602, message: "path is required" } };
        const result = await afs.delete(path);
        return { id: req.id, result };
      }

      case "getMounts": {
        const mounts = afs.getMounts();
        const mountInfos = await Promise.all(
          mounts.map(async (m) => {
            const ctor = m.module.constructor as unknown as Record<string, unknown>;
            const manifest =
              typeof ctor.manifest === "function"
                ? (ctor.manifest() as Record<string, unknown>)
                : null;

            // Try to get URL from provider meta (e.g. UI providers with web servers)
            let url: string | undefined;
            try {
              if (typeof m.module.stat === "function") {
                const statResult = await m.module.stat("/", {});
                url = (statResult?.data?.meta?.url as string) || undefined;
              }
            } catch {
              // Provider may not support stat — ignore
            }

            return {
              namespace: m.namespace,
              path: m.path,
              name: m.module.name,
              description: m.module.description,
              accessMode: m.module.accessMode,
              category: (manifest?.category as string) || undefined,
              tags: (manifest?.tags as string[]) || undefined,
              url,
            };
          }),
        );
        return { id: req.id, result: { mounts: mountInfos } };
      }

      // ── Mount Management RPCs (require ConfigManager) ──

      case "mount.list": {
        if (!configManager)
          return { id: req.id, error: { code: -32601, message: "Mount management not available" } };
        const result = await configManager.getMountList();
        return { id: req.id, result };
      }

      case "mount.add": {
        if (!configManager)
          return { id: req.id, error: { code: -32601, message: "Mount management not available" } };
        await configManager.addMount(params);
        return { id: req.id, result: { success: true } };
      }

      case "mount.remove": {
        if (!configManager)
          return { id: req.id, error: { code: -32601, message: "Mount management not available" } };
        const path = params.path as string;
        if (!path) return { id: req.id, error: { code: -32602, message: "path is required" } };
        await configManager.removeMount(path);
        return { id: req.id, result: { success: true } };
      }

      case "mount.update": {
        if (!configManager)
          return { id: req.id, error: { code: -32601, message: "Mount management not available" } };
        const path = params.path as string;
        if (!path) return { id: req.id, error: { code: -32602, message: "path is required" } };
        const { path: _path, ...updates } = params;
        await configManager.updateMount(path, updates);
        return { id: req.id, result: { success: true } };
      }

      case "mount.test": {
        if (!configManager)
          return { id: req.id, error: { code: -32601, message: "Mount management not available" } };
        const uri = params.uri as string;
        if (!uri) return { id: req.id, error: { code: -32602, message: "uri is required" } };
        const result = await configManager.testMount(uri, params.auth as string | undefined);
        return { id: req.id, result };
      }

      case "config.get": {
        if (!configManager)
          return { id: req.id, error: { code: -32601, message: "Mount management not available" } };
        const config = await configManager.getConfig();
        return { id: req.id, result: { config } };
      }

      case "config.reload": {
        if (!configManager)
          return { id: req.id, error: { code: -32601, message: "Mount management not available" } };
        await configManager.reloadConfig();
        return { id: req.id, result: { success: true } };
      }

      case "registry.list": {
        if (!configManager?.getRegistry)
          return { id: req.id, error: { code: -32601, message: "Registry not available" } };
        const providers = await configManager.getRegistry();
        return { id: req.id, result: { providers } };
      }

      default:
        return { id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { id: req.id, error: { code: -32000, message } };
  }
}
