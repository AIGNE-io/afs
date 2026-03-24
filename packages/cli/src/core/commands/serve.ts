/**
 * AFS Serve Command
 *
 * Starts an HTTP server to expose AFS providers over HTTP transport
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { AFS, AFSModule } from "@aigne/afs";
import type { CommandModule } from "yargs";
import { ConfigLoader } from "../../config/loader.js";
import type { MountConfig, ServeConfig } from "../../config/schema.js";
import { colors } from "../../ui/index.js";
import { type CommandFactoryOptions, resolveAFS } from "./types.js";

export interface ServeArgs {
  host: string;
  port: number;
  path: string;
  readonly: boolean;
  cors: boolean;
  transport: "http" | "mcp-stdio" | "mcp-http";
}

export interface ServeResult {
  success: boolean;
  host: string;
  port: number;
  path: string;
  url: string;
  mounts: Array<{ path: string; provider: string }>;
}

/**
 * Create an AFSModule wrapper around AFS
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
 * Format serve result for output
 */
export function formatServeOutput(result: ServeResult): string {
  const lines: string[] = [];

  lines.push(colors.green("AFS HTTP Server starting..."));
  lines.push(colors.bold("Mounted providers:"));

  for (const mount of result.mounts) {
    lines.push(`  ${colors.cyan(mount.path.padEnd(20))} ${colors.dim(mount.provider)}`);
  }

  lines.push("");
  lines.push(`${colors.dim("Listening on:")} ${colors.brightCyan(result.url)}`);
  lines.push(colors.dim("Press Ctrl+C to stop"));

  return lines.join("\n");
}

/**
 * Create serve command
 */
export function createServeCommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, ServeArgs> {
  return {
    command: "serve",
    describe: "Start AFS server (HTTP or MCP)",
    builder: {
      host: { type: "string", default: "localhost", description: "Host to bind" },
      port: { type: "number", default: 3000, description: "Port to listen on" },
      path: { type: "string", default: "/afs", description: "Base path for API" },
      readonly: { type: "boolean", default: false, description: "Read-only mode" },
      cors: { type: "boolean", default: false, description: "Enable CORS" },
      transport: {
        type: "string",
        default: "http",
        choices: ["http", "mcp-stdio", "mcp-http"],
        description: "Transport: http (default), mcp-stdio, or mcp-http",
      },
    },
    handler: async (argv) => {
      // Load config for serve defaults and mount info
      const configLoader = new ConfigLoader();
      const config = await configLoader.load(process.cwd());

      const serveConfig: Partial<ServeConfig> = config.serve ?? {};

      // Merge: command line > config file > defaults
      const host = argv.host ?? serveConfig.host ?? "localhost";
      const port = argv.port ?? serveConfig.port ?? 3000;
      const basePath = argv.path ?? serveConfig.path ?? "/afs";
      const readonly = argv.readonly ?? serveConfig.readonly ?? false;
      const cors = argv.cors ?? serveConfig.cors ?? false;
      const maxBodySize = serveConfig.max_body_size ?? 10 * 1024 * 1024;
      const token = serveConfig.token;

      const mounts: Array<{ path: string; provider: string }> = config.mounts.map(
        (m: MountConfig) => ({
          path: m.path,
          provider: m.uri,
        }),
      );

      // Dispatch based on transport mode
      if (argv.transport === "mcp-stdio") {
        const { createMcpServerInstance, createAFSMcpServer } = await import("../../mcp/server.js");
        const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
        const { createMCPAuthContext } = await import("../../credential/mcp-auth-context.js");
        const { loadAFS } = await import("../../config/afs-loader.js");
        const { createCredentialStore } = await import("../../credential/store.js");

        // Create MCP server first so elicitation auth context can reference it
        const mcpServer = createMcpServerInstance();
        const authContext = createMCPAuthContext({ server: mcpServer.server });
        const { afs } = await loadAFS(options.cwd ?? process.cwd(), {
          authContext,
          credentialStore: createCredentialStore(),
        });

        // Register AFS tools/resources/prompts on the pre-created server
        createAFSMcpServer({ afs, server: mcpServer });

        const transport = new StdioServerTransport();
        await mcpServer.connect(transport);
        // Block until server closes (stdin EOF, signal, or transport close)
        await new Promise<void>((resolve) => {
          const shutdown = async () => {
            try {
              await mcpServer.close();
            } catch {
              // Ignore close errors during shutdown
            }
            resolve();
          };
          transport.onclose = () => shutdown();
          process.on("SIGINT", () => shutdown());
          process.on("SIGTERM", () => shutdown());
          process.on("SIGHUP", () => shutdown());
        });
        return;
      }

      if (argv.transport === "mcp-http") {
        const { createMcpServerInstance, createAFSMcpServer } = await import("../../mcp/server.js");
        const { startMcpHttpServer } = await import("../../mcp/http-transport.js");
        const { createMCPAuthContext } = await import("../../credential/mcp-auth-context.js");
        const { loadAFS } = await import("../../config/afs-loader.js");
        const { createCredentialStore } = await import("../../credential/store.js");

        // Create MCP server first so elicitation auth context can reference it
        const mcpServer = createMcpServerInstance();
        const authContext = createMCPAuthContext({ server: mcpServer.server });
        const { afs } = await loadAFS(options.cwd ?? process.cwd(), {
          authContext,
          credentialStore: createCredentialStore(),
        });

        // Register AFS tools/resources/prompts on the pre-created server
        createAFSMcpServer({ afs, server: mcpServer });

        await startMcpHttpServer({
          mcpServer,
          host,
          port,
          cors,
        });
        // Block until server closes
        await new Promise<void>((resolve) => {
          process.on("SIGINT", async () => {
            await mcpServer.close();
            resolve();
          });
          process.on("SIGTERM", async () => {
            await mcpServer.close();
            resolve();
          });
        });
        return;
      }

      // Default: HTTP transport — uses CLI auth context
      const afs = await resolveAFS(options);
      const module = createAFSModule(afs, readonly);

      // Create HTTP handler
      let createAFSHttpHandler: typeof import("@aigne/afs-http")["createAFSHttpHandler"];
      try {
        ({ createAFSHttpHandler } = await import("@aigne/afs-http" as string));
      } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Missing optional dependency @aigne/afs-http required for HTTP transport. ` +
            `Install it to use \`afs serve --transport http\`. Original error: ${details}`,
        );
      }
      const handler = createAFSHttpHandler({
        module,
        maxBodySize,
        token,
      });

      // Create HTTP server with path routing
      const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || "/", `http://${req.headers.host}`);

        // Log request
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

        // Check if request is for our base path
        if (!url.pathname.startsWith(basePath)) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ code: 1, error: "Not found" }));
          return;
        }

        // Convert Node.js request to Web Standard Request
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (value) {
            headers.append(key, Array.isArray(value) ? value.join(", ") : value);
          }
        }

        // Collect request body
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
          // Call handler
          const response = await handler(request);

          // Copy response to Node.js response
          res.writeHead(response.status, {
            "Content-Type": response.headers.get("Content-Type") || "application/json",
          });

          const responseBody = await response.text();
          res.end(responseBody);

          // Log response
          console.error(`${timestamp} ${req.method} ${url.pathname} status=${response.status}`);
        } catch (error) {
          console.error(`Error handling request:`, error);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ code: 5, error: "Internal server error" }));
        }
      });

      // Start server
      await new Promise<void>((resolve, reject) => {
        server.listen(port, host, () => {
          resolve();
        });
        server.on("error", reject);
      });

      // Handle graceful shutdown
      let shuttingDown = false;
      const shutdown = () => {
        if (shuttingDown) {
          console.error("\nForce shutdown...");
          process.exit(1);
        }
        shuttingDown = true;
        console.error("\nShutting down server...");
        server.close(() => {
          process.exit(0);
        });
        // Force-close idle keep-alive connections so server.close() can finish
        server.closeAllConnections();
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      const url = `http://${host}:${port}${basePath}`;

      const result: ServeResult = {
        success: true,
        host,
        port,
        path: basePath,
        url,
        mounts,
      };

      console.log(formatServeOutput(result));

      // Keep running
      await new Promise(() => {});
    },
  };
}
