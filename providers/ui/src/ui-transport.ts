/**
 * UiTransport — portable WebSocket transport abstraction.
 *
 * Separates WebSocket wire protocol from UI logic so the same
 * backend code can run on:
 * - Node/Bun: ws library (lazy-loaded, NOT imported at module top level)
 * - Workers: native WebSocket API
 * - Browser: native WebSocket client
 *
 * The WebBackend and TermBackend consume UiTransport for server mode.
 * In test mode they bypass it entirely (direct input/output queues).
 */

/**
 * A single WebSocket connection, abstracting away the ws library.
 */
export interface UiConnection {
  /** Send a string message. */
  send(msg: string): void;
  /** Register a handler for incoming messages. */
  onMessage(cb: (msg: string) => void): void;
  /** Register a handler for connection close. */
  onClose(cb: () => void): void;
  /** Close the connection with an optional code and reason. */
  close(code?: number, reason?: string): void;
  /** Whether the connection is currently open. */
  readonly isOpen: boolean;
}

/**
 * Server-side WebSocket transport — listens for connections and
 * serves HTTP on the same port.
 */
export interface UiTransport {
  /** Start serving. Returns the assigned port and host. */
  serve(options: UiTransportOptions): Promise<{ port: number; host: string; url: string }>;
  /** Register a handler for new connections. */
  onConnection(cb: (conn: UiConnection, headers: Record<string, string | undefined>) => void): void;
  /** Register an HTTP request handler for non-WebSocket requests. */
  onHttpRequest(cb: (req: UiHttpRequest) => UiHttpResponse | Promise<UiHttpResponse>): void;
  /** Close the transport and all connections. */
  close(): Promise<void>;
}

export interface UiTransportOptions {
  port: number;
  host: string;
}

/**
 * Minimal HTTP request representation — portable across runtimes.
 */
export interface UiHttpRequest {
  url: string;
  method: string;
  headers: Record<string, string | undefined>;
}

/**
 * Minimal HTTP response representation.
 */
export interface UiHttpResponse {
  status: number;
  headers?: Record<string, string>;
  body?: string | Buffer;
}

/**
 * Create a Node.js WebSocket transport using the ws library.
 * This function lazily imports ws — it is NOT loaded at module top level.
 */
export async function createNodeWsTransport(): Promise<UiTransport> {
  // Lazy import: ws is only loaded when this function is called.
  // This is critical — ws@8.19.0 has 7 hard node: dependencies that
  // would block Workers/Browser/QuickJS if imported at top level.
  const { WebSocketServer } = await import("ws");
  const { createServer } = await import("node:http");
  const nodeNet = await import("node:net");
  type NodeSocket = InstanceType<typeof nodeNet.Socket>;

  let httpHandler: ((req: UiHttpRequest) => UiHttpResponse | Promise<UiHttpResponse>) | null = null;
  let connHandler:
    | ((conn: UiConnection, headers: Record<string, string | undefined>) => void)
    | null = null;

  // Track all TCP sockets for force-close
  const sockets = new Set<NodeSocket>();
  let server: ReturnType<typeof createServer> | null = null;
  let wss: InstanceType<typeof WebSocketServer> | null = null;

  const transport: UiTransport = {
    async serve(options: UiTransportOptions) {
      return new Promise((resolve, reject) => {
        const httpServer = createServer(async (req, res) => {
          if (!httpHandler) {
            res.writeHead(404);
            res.end("Not Found");
            return;
          }
          try {
            const uiReq: UiHttpRequest = {
              url: req.url ?? "/",
              method: req.method ?? "GET",
              headers: req.headers as Record<string, string | undefined>,
            };
            const uiRes = await httpHandler(uiReq);
            const headers = uiRes.headers ?? {};
            res.writeHead(uiRes.status, headers);
            res.end(uiRes.body ?? "");
          } catch {
            res.writeHead(500);
            res.end("Internal Server Error");
          }
        });

        httpServer.on("connection", (socket) => {
          sockets.add(socket as NodeSocket);
          socket.on("close", () => sockets.delete(socket as NodeSocket));
        });

        httpServer.on("error", (err) => {
          httpServer.close();
          reject(err);
        });

        const bindHost = options.host === "localhost" ? "127.0.0.1" : options.host;
        httpServer.listen({ port: options.port, host: bindHost, exclusive: true }, () => {
          server = httpServer;
          const addr = httpServer.address();
          let assignedPort = options.port;
          if (typeof addr === "object" && addr) {
            assignedPort = addr.port;
          }

          wss = new WebSocketServer({ server: httpServer });
          wss.on("connection", (ws, req) => {
            if (!connHandler) {
              ws.close(4000, "No handler");
              return;
            }
            const conn: UiConnection = {
              send(msg: string) {
                if (ws.readyState === 1) ws.send(msg);
              },
              onMessage(cb: (msg: string) => void) {
                ws.on("message", (data) => cb(data.toString()));
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
            const headers: Record<string, string | undefined> = {};
            if (req.headers.origin) headers.origin = String(req.headers.origin);
            connHandler(conn, headers);
          });

          const url = `http://127.0.0.1:${assignedPort}`;
          resolve({ port: assignedPort, host: options.host, url });
        });
      });
    },

    onConnection(cb) {
      connHandler = cb;
    },

    onHttpRequest(cb) {
      httpHandler = cb;
    },

    async close() {
      if (wss) {
        wss.close();
        wss = null;
      }
      if (server) {
        server.close();
        for (const socket of sockets) {
          socket.destroy();
        }
        sockets.clear();
        server = null;
      }
    },
  };

  return transport;
}
