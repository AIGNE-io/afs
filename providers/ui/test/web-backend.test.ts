/**
 * Web Backend unit tests.
 *
 * Tests the HTTP + WebSocket transport layer for the web UI backend.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { AFS } from "@aigne/afs";
import { AFSUIProvider, createMockInputSource, WebBackend } from "@aigne/afs-ui";
import { WebSocket } from "ws";
import { createMessageCollector } from "./helpers/message-collector.js";

describe("Web Backend", () => {
  let backend: WebBackend | null = null;
  let serverInfo: { port: number; host: string };

  afterEach(async () => {
    if (backend) {
      await backend.close();
      backend = null;
    }
  });

  function wsUrl(): string {
    return `ws://127.0.0.1:${serverInfo.port}`;
  }

  function httpUrl(): string {
    return `http://127.0.0.1:${serverInfo.port}`;
  }

  function connectWs(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl());
      socket.on("error", reject);
      socket.on("open", () => {
        socket.send(JSON.stringify({ type: "join_session" }));
        resolve(socket);
      });
    });
  }

  function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      socket.once("message", (data) => {
        resolve(JSON.parse(data.toString()));
      });
    });
  }

  describe("server lifecycle", () => {
    test("listen() starts HTTP server and returns port", async () => {
      backend = new WebBackend({ port: 0 });
      serverInfo = await backend.listen();
      expect(serverInfo.port).toBeGreaterThan(0);
      expect(serverInfo.host).toBe("localhost");
    });

    test("listen() assigns random port when port 0 is used", async () => {
      backend = new WebBackend({ port: 0 });
      serverInfo = await backend.listen();
      expect(serverInfo.port).not.toBe(0);
    });

    test("close() shuts down the server", async () => {
      backend = new WebBackend({ port: 0 });
      serverInfo = await backend.listen();
      await backend.close();
      backend = null;

      // Connecting after close should fail
      await expect(
        new Promise((resolve, reject) => {
          const ws = new WebSocket(`ws://127.0.0.1:${serverInfo.port}`);
          ws.on("error", reject);
          ws.on("open", () => {
            ws.close();
            resolve(true);
          });
        }),
      ).rejects.toThrow();
    });

    test("listen() on occupied port throws", async () => {
      backend = new WebBackend({ port: 0 });
      serverInfo = await backend.listen();

      const backend2 = new WebBackend({ port: serverInfo.port });
      try {
        await expect(backend2.listen()).rejects.toThrow();
      } finally {
        await backend2.close().catch(() => {});
      }
    });
  });

  describe("WebSocket communication", () => {
    let ws: WebSocket | null = null;

    afterEach(() => {
      if (ws && ws.readyState <= WebSocket.OPEN) {
        ws.terminate();
        ws = null;
      }
    });

    test("WebSocket connects successfully", async () => {
      backend = new WebBackend({ port: 0 });
      serverInfo = await backend.listen();
      ws = await connectWs();
      expect(ws.readyState).toBe(WebSocket.OPEN);
    });

    test("write() sends content to WebSocket client", async () => {
      backend = new WebBackend({ port: 0 });
      serverInfo = await backend.listen();
      ws = await connectWs();

      const msgPromise = nextMessage(ws);
      await backend.write("hello world");
      const msg = await msgPromise;
      expect(msg.type).toBe("write");
      expect(msg.content).toBe("hello world");
    });

    test("read() receives input from WebSocket client", async () => {
      backend = new WebBackend({ port: 0 });
      serverInfo = await backend.listen();
      ws = await connectWs();

      // Give WebSocket time to register
      await new Promise((r) => setTimeout(r, 20));

      ws.send(JSON.stringify({ type: "input", content: "user says hi" }));
      const result = await backend.read();
      expect(result).toBe("user says hi");
    });

    test("prompt sends request and receives response", async () => {
      backend = new WebBackend({ port: 0 });
      serverInfo = await backend.listen();
      ws = await connectWs();
      await new Promise((r) => setTimeout(r, 20));

      const promptPromise = backend.prompt({ message: "Name?", type: "text" });

      const msg = await nextMessage(ws);
      expect(msg.type).toBe("prompt");
      expect(msg.message).toBe("Name?");
      expect(msg.promptType).toBe("text");

      ws.send(JSON.stringify({ type: "prompt_response", value: "Alice" }));
      const result = await promptPromise;
      expect(result).toBe("Alice");
    });

    test("clear sends clear command", async () => {
      backend = new WebBackend({ port: 0 });
      serverInfo = await backend.listen();
      ws = await connectWs();

      const msgPromise = nextMessage(ws);
      await backend.clear();
      const msg = await msgPromise;
      expect(msg.type).toBe("clear");
    });

    test("notify sends notification", async () => {
      backend = new WebBackend({ port: 0 });
      serverInfo = await backend.listen();
      ws = await connectWs();

      const msgPromise = nextMessage(ws);
      await backend.notify("Done!");
      const msg = await msgPromise;
      expect(msg.type).toBe("notify");
      expect(msg.message).toBe("Done!");
    });

    test("type and capabilities report correctly", () => {
      backend = new WebBackend({ port: 0 });
      expect(backend.type).toBe("web");
      expect(backend.supportedFormats).toEqual(["text", "html", "markdown", "component"]);
      expect(backend.capabilities).toEqual(["text", "html", "markdown", "component"]);
    });

    test("write before client connects queues message", async () => {
      backend = new WebBackend({ port: 0 });
      serverInfo = await backend.listen();

      // Write before any client connects
      await backend.write("queued message");

      // Connect with message collector — handshake flushes pending messages
      const socket = new WebSocket(wsUrl());
      const { messages, assertNoBadMessages } = createMessageCollector(socket);
      ws = await new Promise<WebSocket>((resolve, reject) => {
        socket.on("error", reject);
        socket.on("open", () => {
          socket.send(JSON.stringify({ type: "join_session" }));
          setTimeout(() => resolve(socket), 50);
        });
      });
      assertNoBadMessages();

      const msg = (messages as Record<string, unknown>[]).find(
        (m) => (m as Record<string, unknown>).type === "write",
      );
      expect(msg).toBeDefined();
      expect(msg!.content).toBe("queued message");
    });
  });

  describe("HTTP serving", () => {
    test("GET / returns HTML page", async () => {
      backend = new WebBackend({ port: 0 });
      serverInfo = await backend.listen();

      const response = await fetch(httpUrl());
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      const html = await response.text();
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("WebSocket");
    });
  });

  describe("through AFS mount", () => {
    test("meta('/') reports web backend", async () => {
      const inputSource = createMockInputSource(["test"]);
      backend = new WebBackend({ port: 0, inputSource });

      const afs = new AFS();
      const provider = new AFSUIProvider({ backend });
      await afs.mount(provider, "/ui");

      const result = await afs.read("/ui/.meta");
      expect(result.data?.meta?.backend).toBe("web");
    });

    test("write/read cycle works through AFS", async () => {
      const inputSource = createMockInputSource(["hello from web"]);
      backend = new WebBackend({ port: 0, inputSource });

      const afs = new AFS();
      const provider = new AFSUIProvider({ backend });
      await afs.mount(provider, "/ui");

      const readResult = await afs.read("/ui/input");
      expect(readResult.data?.content).toBe("hello from web");
    });
  });
});
