import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { type WebSocket, WebSocketServer } from "ws";
import type {
  PromptOptions,
  PromptResult,
  ReadOptions,
  UIBackend,
  ViewportInfo,
  WriteOptions,
} from "./backend.js";
import { TERM_CLIENT_HTML } from "./term-page.js";
import { createMockInputSource, type TTYInputSource } from "./tty.js";

export interface TermBackendOptions {
  /** Port to listen on (0 = OS-assigned random port) */
  port?: number;
  /** Host to bind to */
  host?: string;
  /** For testing: custom input source (bypasses WebSocket) */
  inputSource?: TTYInputSource & { push?: (line: string) => void };
  /** For testing: custom output handler (bypasses WebSocket) */
  stdout?: { write(data: string): boolean };
}

/**
 * TermBackend — HTTP + WebSocket based xterm.js terminal.
 *
 * Serves an xterm.js web page and communicates via WebSocket.
 * Line-based I/O: client sends complete lines on Enter, server writes output text.
 */
export class TermBackend implements UIBackend {
  readonly type = "term";
  readonly supportedFormats = ["text"];
  readonly capabilities = ["text"];

  private port: number;
  private host: string;
  private server: Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private sockets = new Set<Socket>();

  private inputSource: TTYInputSource & { push?: (line: string) => void };
  private outputHandler: (data: string) => void;

  /** Queue for messages sent before any client connects */
  private pendingMessages: string[] = [];

  /** Pending prompt resolve */
  private promptResolve: ((value: PromptResult) => void) | null = null;
  /** Pending prompt message — re-sent on client reconnect */
  private pendingPromptMessage: string | null = null;

  /** Viewport info from last resize */
  private viewportCols = 80;
  private viewportRows = 24;

  private testMode: boolean;
  private _url: string | null = null;

  /** Per-client session tracking */
  private sessionForClient = new Map<WebSocket, string>();
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

  constructor(options: TermBackendOptions = {}) {
    this.port = options.port ?? 0;
    this.host = options.host ?? "localhost";

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
      this.outputHandler = (data) => {
        const payload = JSON.stringify({ type: "output", data });
        if (this.clients.size === 0) {
          this.pendingMessages.push(payload);
        } else {
          this.broadcast(payload);
        }
      };
    }
  }

  /** URL of the running server, or null if not started. */
  get url(): string | null {
    return this._url;
  }

  /** Register a factory that creates a session for each new WebSocket client. */
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

  /** Start the HTTP + WebSocket server. */
  async listen(): Promise<{ port: number; host: string }> {
    return new Promise((resolve, reject) => {
      const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        if (req.url === "/" || req.url === "/index.html") {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(TERM_CLIENT_HTML);
        } else {
          res.writeHead(404);
          res.end("Not Found");
        }
      });

      server.on("connection", (socket: Socket) => {
        this.sockets.add(socket);
        socket.on("close", () => this.sockets.delete(socket));
      });

      server.on("error", (err) => {
        server.close();
        reject(err);
      });

      const bindHost = this.host === "localhost" ? "127.0.0.1" : this.host;
      server.listen({ port: this.port, host: bindHost, exclusive: true }, () => {
        this.server = server;

        const addr = server.address();
        if (typeof addr === "object" && addr) {
          this.port = addr.port;
        }

        this._url = `http://127.0.0.1:${this.port}`;

        this.wss = new WebSocketServer({ server });
        this.wss.on("connection", (ws, req) => this.onConnection(ws, req));

        resolve({ port: this.port, host: this.host });
      });
    });
  }

  /** Shut down the server and disconnect all clients. */
  async close(): Promise<void> {
    for (const ws of this.clients) {
      ws.terminate();
    }
    this.clients.clear();
    this.sessionForClient.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    if (this.server) {
      this.server.close();
      for (const socket of this.sockets) {
        socket.destroy();
      }
      this.sockets.clear();
      this.server = null;
    }

    this._url = null;
  }

  // ─── UIBackend Interface ──────────────────────────────────

  async write(content: string, options?: WriteOptions): Promise<void> {
    if (options?.format && options.format !== "text") {
      throw new Error(`Term backend does not support format: ${options.format}`);
    }

    if (this.testMode) {
      this.outputHandler(content);
      return;
    }

    this.outputHandler(content);
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

    this.pendingPromptMessage = msg;

    if (this.clients.size > 0) {
      this.broadcast(msg);
    } else {
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
    return { cols: this.viewportCols, rows: this.viewportRows };
  }

  async dispose(): Promise<void> {
    await this.close();
  }

  // ─── Private ──────────────────────────────────────────────

  private async onConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
    const origin = req.headers.origin;
    if (typeof origin === "string" && origin && !this.isAllowedWsOrigin(origin)) {
      ws.close(1008, "Invalid origin");
      return;
    }

    this.clients.add(ws);

    // Allocate session for this client
    let sessionId: string | undefined;
    if (this.createSessionCallback) {
      const created = await this.createSessionCallback(this.type);
      sessionId = created.sessionId;
      this.sessionForClient.set(ws, sessionId);
      ws.send(
        JSON.stringify({
          type: "session",
          sessionId,
          sessionToken: created.sessionToken ?? null,
        }),
      );
    }

    // Flush pending messages
    for (const msg of this.pendingMessages) {
      ws.send(msg);
    }
    this.pendingMessages = [];

    // Re-send pending prompt to reconnecting client
    if (this.pendingPromptMessage && this.promptResolve) {
      ws.send(this.pendingPromptMessage);
    }

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        this.onMessage(msg);
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on("close", () => {
      this.clients.delete(ws);
      if (sessionId) this.sessionForClient.delete(ws);
    });
  }

  private onMessage(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case "line": {
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
      case "resize": {
        if (typeof msg.cols === "number") this.viewportCols = msg.cols;
        if (typeof msg.rows === "number") this.viewportRows = msg.rows;
        break;
      }
    }
  }

  private broadcast(data: string): void {
    for (const ws of this.clients) {
      if (ws.readyState === 1 /* OPEN */) {
        ws.send(data);
      }
    }
  }

  private isLoopbackHost(hostname: string): boolean {
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  }

  private isAllowedWsOrigin(origin: string): boolean {
    try {
      const u = new URL(origin);
      if (!this.isLoopbackHost(u.hostname)) return false;
      const port = u.port || (u.protocol === "https:" ? "443" : "80");
      return port === String(this.port);
    } catch {
      return false;
    }
  }

  /** TTY-style prompt for test mode */
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
