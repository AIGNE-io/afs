/**
 * MCP HTTP Transport
 *
 * Starts an HTTP server that serves MCP over Streamable HTTP transport.
 * Creates a new transport per client session to support reconnection.
 */

import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export interface StartMcpHttpServerOptions {
  mcpServer: McpServer;
  host: string;
  port: number;
  cors: boolean;
}

export interface StartMcpHttpServerResult {
  httpServer: Server;
  port: number;
  url: string;
}

/**
 * Start MCP server over Streamable HTTP transport.
 *
 * Creates a new transport per client session so that reconnections
 * and multiple clients are supported.
 */
export async function startMcpHttpServer(
  options: StartMcpHttpServerOptions,
): Promise<StartMcpHttpServerResult> {
  const { mcpServer, host, port, cors } = options;

  // Per-session transport map
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Strip version headers to avoid data leaks
    res.removeHeader("X-Powered-By");

    // CORS handling
    if (cors) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
    }

    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    // Only handle /mcp path
    if (url.pathname !== "/mcp") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    // Only allow GET, POST, DELETE (MCP protocol methods)
    if (req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    // Look up existing session or create new one for initialization requests
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport | undefined;

    if (sessionId) {
      transport = sessions.get(sessionId);
      if (!transport) {
        // Stale/unknown session — tell client to re-initialize (MCP spec)
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Session not found" } }),
        );
        return;
      }
    }

    if (!transport) {
      // No session ID — new client, create a fresh transport
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          sessions.set(sid, transport!);
        },
      });

      transport.onclose = () => {
        const sid = transport!.sessionId;
        if (sid) sessions.delete(sid);
      };

      await mcpServer.connect(transport);
    }

    try {
      await transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
  });

  // Start listening
  const actualPort = await new Promise<number>((resolve, reject) => {
    httpServer.on("error", reject);
    httpServer.listen(port, host, () => {
      const addr = httpServer.address();
      if (addr && typeof addr === "object") {
        resolve(addr.port);
      } else {
        resolve(port);
      }
    });
  });

  const url = `http://${host}:${actualPort}/mcp`;

  // Print listening info to stderr (stdout reserved for protocol)
  console.error(`MCP HTTP server listening on ${url}`);

  return { httpServer, port: actualPort, url };
}
