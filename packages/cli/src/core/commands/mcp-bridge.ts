/**
 * AFS MCP Bridge Command
 *
 * Stdio-to-HTTP bridge: forwards MCP protocol between stdin/stdout and the running AFS daemon's /mcp endpoint.
 * Unlike `serve --transport mcp-stdio` which runs a full MCP server, this is a pure proxy — no AFS loading needed.
 *
 * Auto-reconnects when the daemon restarts. While disconnected, requests get immediate JSON-RPC errors
 * so Claude Desktop doesn't hang waiting for a timeout.
 */

import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { CommandModule } from "yargs";
import type { CommandFactoryOptions } from "./types.js";

export interface McpBridgeArgs {
  port: number;
}

const noopFormat = () => "";

/** Backoff config for reconnection */
const RECONNECT = {
  initialDelay: 500,
  maxDelay: 10_000,
  factor: 1.5,
} as const;

export function createMcpBridgeCommand(
  options: CommandFactoryOptions,
): CommandModule<unknown, McpBridgeArgs> {
  return {
    command: "mcp",
    describe: "Connect Claude Desktop (or any stdio MCP client) to AFS",
    builder: (yargs) =>
      yargs
        .option("port", {
          type: "number",
          default: 4900,
          description: "Daemon port",
        })
        .epilog(
          [
            "Bridges stdio ↔ the running AFS daemon's MCP endpoint.",
            "Auto-starts the daemon if not running.",
            "",
            "Claude Desktop config example:",
            '  { "mcpServers": { "AFS": { "command": "afs", "args": ["mcp"] } } }',
            "",
            "This is NOT a standalone MCP server. For that, use:",
            "  afs serve --transport mcp-stdio    (standalone, loads AFS directly)",
            "  afs serve --transport mcp-http     (standalone, HTTP transport)",
          ].join("\n"),
        ),
    handler: async (argv) => {
      const { getDaemonStatus, spawnDaemon } = await import("../../daemon/manager.js");
      const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
      const { StreamableHTTPClientTransport } = await import(
        "@modelcontextprotocol/sdk/client/streamableHttp.js"
      );

      // Ensure daemon is running
      let info = await getDaemonStatus();
      if (!info) {
        console.error("Starting AFS service...");
        try {
          info = await spawnDaemon(argv.port);
          console.error(`AFS service started on port ${info.port}`);
        } catch (err) {
          console.error(`Failed to start service: ${(err as Error).message}`);
          options.onResult({ command: "mcp", result: null, format: noopFormat });
          process.exitCode = 1;
          return;
        }
      }

      const mcpUrl = new URL(info.mcpUrl);

      // --- Reconnectable HTTP transport state ---
      let http: InstanceType<typeof StreamableHTTPClientTransport> | null = null;
      let connected = false;
      let reconnecting = false;
      // Promise that resolves when an in-flight connectHttp() finishes
      let connectingPromise: Promise<boolean> | null = null;
      // Cache the initialize request so we can replay it on reconnect
      let cachedInitialize: Record<string, unknown> | null = null;

      /**
       * Try to connect to the daemon's MCP endpoint.
       * Does NOT spawn a new daemon — only connects to an existing one.
       * Spawning is done once at startup; reconnect just waits for it to come back.
       *
       * On reconnect (when cachedInitialize is set), transparently replays the
       * initialize handshake so the new daemon session is established before
       * any client requests are forwarded.
       */
      async function connectHttp(): Promise<boolean> {
        try {
          const transport = new StreamableHTTPClientTransport(mcpUrl);

          // During re-init, suppress forwarding the initialize response to Claude Desktop
          let swallowNextResponse = false;

          // Wire http → stdio forwarding
          transport.onmessage = async (message) => {
            if (swallowNextResponse) {
              swallowNextResponse = false;
              return;
            }
            try {
              await stdio.send(message);
            } catch (err) {
              console.error(`Bridge receive error: ${(err as Error).message}`);
            }
          };

          transport.onclose = () => {
            // Only handle if this is still the active transport
            if (http !== transport) return;
            connected = false;
            http = null;
            console.error("Backend disconnected, will reconnect...");
            scheduleReconnect();
          };

          await transport.start();

          // On reconnect, replay the initialize handshake transparently
          if (cachedInitialize) {
            swallowNextResponse = true;
            await transport.send(cachedInitialize as JSONRPCMessage);
            // Send initialized notification to complete the handshake
            await transport.send({ jsonrpc: "2.0", method: "notifications/initialized" });
            console.error("Session re-initialized on new daemon");
          }

          http = transport;
          connected = true;
          return true;
        } catch {
          return false;
        }
      }

      /** Reconnect loop with exponential backoff */
      function scheduleReconnect() {
        if (reconnecting) return;
        reconnecting = true;

        // Create a gate promise immediately — incoming requests can await this
        // instead of getting an instant error during the reconnect window.
        let resolveGate!: (ok: boolean) => void;
        connectingPromise = new Promise<boolean>((r) => {
          resolveGate = r;
        });

        let delay: number = RECONNECT.initialDelay;
        const attempt = async () => {
          if (connected) {
            reconnecting = false;
            resolveGate(true);
            connectingPromise = null;
            return;
          }

          const ok = await connectHttp();

          if (ok) {
            reconnecting = false;
            resolveGate(true);
            connectingPromise = null;
            console.error(`MCP bridge reconnected to ${mcpUrl}`);
            return;
          }

          delay = Math.min(delay * RECONNECT.factor, RECONNECT.maxDelay);
          setTimeout(attempt, delay);
        };

        // First attempt immediate — no delay for fastest recovery
        attempt();
      }

      // --- Stdio transport (lives for the entire process lifetime) ---
      const stdio = new StdioServerTransport();

      /** Send a JSON-RPC error back to the client */
      async function sendError(id: string | number, message: string) {
        try {
          await stdio.send({
            jsonrpc: "2.0",
            id,
            error: { code: -32000, message },
          });
        } catch {
          // Client may have disconnected — error response is best-effort
        }
      }

      // Bridge: stdio → http (with fast error when disconnected)
      stdio.onmessage = async (message) => {
        const msg = message as Record<string, unknown>;

        // Cache the initialize request for replay on reconnect
        if (msg.method === "initialize") {
          cachedInitialize = msg;
        }

        // If we're in the middle of connecting, wait for it
        if (!connected && connectingPromise) {
          await connectingPromise;
        }

        if (!connected || !http) {
          if (msg.id != null) {
            await sendError(msg.id as string | number, "AFS service unavailable, reconnecting...");
          }
          return;
        }

        try {
          await http.send(message);
        } catch (err) {
          console.error(`Bridge send error: ${(err as Error).message}`);
          // Trigger reconnect
          if (connected) {
            connected = false;
            http = null;
            scheduleReconnect();
          }
          // Wait for reconnection and retry once
          if (connectingPromise) {
            await connectingPromise;
          }
          if (connected && http) {
            try {
              await http.send(message);
              return;
            } catch {
              // Retry also failed
            }
          }
          if (msg.id != null) {
            await sendError(msg.id as string | number, "AFS service unavailable, reconnecting...");
          }
        }
      };

      let shuttingDown = false;
      const shutdown = () => {
        if (shuttingDown) return;
        shuttingDown = true;
        // Detach onclose handlers BEFORE calling close() to prevent recursion
        stdio.onclose = undefined as never;
        if (http) {
          http.onclose = undefined as never;
          http.close().catch(() => {});
        }
        stdio.close().catch(() => {});
        // Give a tick for cleanup, then exit
        setTimeout(() => process.exit(0), 50);
      };

      stdio.onclose = () => shutdown();
      process.on("SIGINT", () => shutdown());
      process.on("SIGTERM", () => shutdown());

      // IMPORTANT: Connect HTTP FIRST, then start stdio.
      // This prevents the race where Claude Desktop sends `initialize`
      // before the backend connection is ready.
      connectingPromise = connectHttp();
      const ok = await connectingPromise;
      connectingPromise = null;

      if (ok) {
        console.error(`MCP bridge connected to ${info.mcpUrl}`);
      } else {
        console.error(`MCP bridge started, waiting for daemon at ${info.mcpUrl}...`);
        scheduleReconnect();
      }

      // Start stdio AFTER HTTP is connected (or reconnect is scheduled)
      await stdio.start();

      // Block forever — process lives until stdin closes or signal
      await new Promise(() => {});
    },
  };
}
