/**
 * AFS Serve - Standalone serve function
 *
 * Starts an HTTP server exposing AFS providers over HTTP transport.
 * Can be called programmatically (e.g., from playground) without yargs.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { AFS, AFSModule } from "@aigne/afs";
import { type CreateAFSOptions, createAFS } from "./config/afs-loader.js";
import { colors } from "./ui/index.js";

export interface StartServeOptions {
  /** Working directory containing .afs-config/config.toml */
  cwd: string;
  /** Host to bind (default: "localhost") */
  host?: string;
  /** Port to listen on (default: 3000) */
  port?: number;
  /** API base path (default: "/afs") */
  path?: string;
  /** Read-only mode (default: false) */
  readonly?: boolean;
  /** Enable CORS (default: false) */
  cors?: boolean;
  /** Authorization token */
  token?: string;
  /** Maximum request body size in bytes (default: 10MB) */
  maxBodySize?: number;
  /** Callback when server is shutting down */
  onExit?: () => Promise<void>;
  /** AFS loading progress callback */
  onProgress?: CreateAFSOptions["onProgress"];
  /** Pre-created providers to mount directly (e.g. mock-based providers that can't be recreated from URI) */
  extraProviders?: Array<{ provider: AFSModule; mountPath: string }>;
}

/**
 * Create an AFSModule wrapper around AFS instance
 */
function createAFSModule(afs: AFS, readonly: boolean): AFSModule {
  return {
    name: "afs-server",
    accessMode: readonly ? "readonly" : "readwrite",
    async list(path, options) {
      return afs.list(path, options);
    },
    async read(path, options) {
      return afs.read(path, options);
    },
    async write(path, content, options) {
      if (readonly) {
        throw new Error("Server is in readonly mode");
      }
      return afs.write(path, content, options);
    },
    async delete(path, options) {
      if (readonly) {
        throw new Error("Server is in readonly mode");
      }
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
      if (readonly) {
        throw new Error("Server is in readonly mode");
      }
      return afs.exec(path, args, options);
    },
    async rename(oldPath, newPath, options) {
      if (readonly) {
        throw new Error("Server is in readonly mode");
      }
      return afs.rename(oldPath, newPath, options);
    },
  };
}

/**
 * Start an AFS HTTP server
 *
 * Loads AFS from config in cwd, wraps it as an AFSModule, and starts
 * an HTTP server. Blocks until the server is shut down (Ctrl+C / SIGTERM).
 */
export async function startServe(options: StartServeOptions): Promise<void> {
  const {
    cwd,
    host = "localhost",
    port = 3000,
    path: basePath = "/afs",
    readonly = false,
    cors = false,
    token,
    maxBodySize = 10 * 1024 * 1024,
    onExit,
    onProgress,
    extraProviders,
  } = options;

  // Load AFS from config
  const { afs, failures } = await createAFS(cwd, { onProgress });

  // Mount extra providers (mock-based, not in config.toml)
  if (extraProviders) {
    for (const { provider, mountPath } of extraProviders) {
      try {
        await afs.mount(provider, mountPath);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`  ${colors.yellow("⚠")} extra provider ${mountPath}: ${msg}`);
      }
    }
  }

  if (failures.length > 0) {
    console.warn(`${failures.length} provider(s) failed to mount:`);
    for (const f of failures) {
      console.warn(`  ${colors.yellow("⚠")} ${f.path}: ${f.reason}`);
    }
  }

  const mounts = afs.getMounts();

  // Create module wrapper and HTTP handler
  const module = createAFSModule(afs, readonly);
  let createAFSHttpHandler: typeof import("@aigne/afs-http")["createAFSHttpHandler"];
  try {
    ({ createAFSHttpHandler } = await import("@aigne/afs-http" as string));
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Missing optional dependency @aigne/afs-http required for HTTP serving. ` +
        `Install it to use startServe(). Original error: ${details}`,
    );
  }
  const handler = createAFSHttpHandler({ module, maxBodySize, token });

  // Create HTTP server
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const timestamp = new Date().toISOString();
    console.error(`${timestamp} ${req.method} ${url.pathname}`);

    // CORS support
    if (cors) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
    }

    // Check base path
    if (!url.pathname.startsWith(basePath)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 1, error: "Not found" }));
      return;
    }

    // Convert to Web Standard Request
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        headers.append(key, Array.isArray(value) ? value.join(", ") : value);
      }
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers,
      body: body.length > 0 ? body : undefined,
    });

    try {
      const response = await handler(request);
      res.writeHead(response.status, {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
      });
      const responseBody = await response.text();
      res.end(responseBody);
    } catch (error) {
      console.error("Error handling request:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 5, error: "Internal server error" }));
    }
  });

  // Start listening
  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => resolve());
    server.on("error", reject);
  });

  const serverUrl = `http://${host}:${port}${basePath}`;

  // Print server info
  console.log(colors.green("AFS HTTP Server started"));
  console.log(colors.bold("Mounted providers:"));
  for (const m of mounts) {
    console.log(`  ${colors.cyan(m.path.padEnd(20))} ${colors.dim(m.module.name)}`);
  }
  console.log("");
  console.log(`${colors.dim("Listening on:")} ${colors.brightCyan(serverUrl)}`);
  console.log(colors.dim("Press Ctrl+C to stop"));

  // Graceful shutdown
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      console.error("\nForce shutdown...");
      process.exit(1);
    }
    shuttingDown = true;
    console.error("\nShutting down server...");
    server.close();
    // Force-close idle keep-alive connections so server.close() can finish
    server.closeAllConnections();
    if (onExit) {
      await onExit();
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Block until server closes
  await new Promise<void>((resolve) => {
    server.on("close", resolve);
  });
}
