/**
 * Term Backend unit tests.
 *
 * Tests the HTTP + WebSocket transport layer for the xterm.js terminal backend.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { AFS } from "@aigne/afs";
import { AFSUIProvider, createMockInputSource, TermBackend } from "@aigne/afs-ui";
import { WebSocket } from "ws";

describe("Term Backend", () => {
  let backend: TermBackend | null = null;
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
      socket.on("open", () => resolve(socket));
      socket.on("error", reject);
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
      backend = new TermBackend({ port: 0 });
      serverInfo = await backend.listen();
      expect(serverInfo.port).toBeGreaterThan(0);
      expect(serverInfo.host).toBe("localhost");
    });

    test("listen() assigns random port when port 0 is used", async () => {
      backend = new TermBackend({ port: 0 });
      serverInfo = await backend.listen();
      expect(serverInfo.port).not.toBe(0);
    });

    test("url getter returns URL after listen", async () => {
      backend = new TermBackend({ port: 0 });
      expect(backend.url).toBeNull();
      serverInfo = await backend.listen();
      expect(backend.url).toBe(`http://127.0.0.1:${serverInfo.port}`);
    });

    test("url getter returns null after close", async () => {
      backend = new TermBackend({ port: 0 });
      serverInfo = await backend.listen();
      await backend.close();
      expect(backend.url).toBeNull();
      backend = null;
    });

    test("close() shuts down the server", async () => {
      backend = new TermBackend({ port: 0 });
      serverInfo = await backend.listen();
      await backend.close();
      backend = null;

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
      backend = new TermBackend({ port: 0 });
      serverInfo = await backend.listen();
      ws = await connectWs();
      expect(ws.readyState).toBe(WebSocket.OPEN);
    });

    test("write() sends output to WebSocket client", async () => {
      backend = new TermBackend({ port: 0 });
      serverInfo = await backend.listen();
      ws = await connectWs();

      const msgPromise = nextMessage(ws);
      await backend.write("hello world");
      const msg = await msgPromise;
      expect(msg.type).toBe("output");
      expect(msg.data).toBe("hello world");
    });

    test("read() receives line from WebSocket client", async () => {
      backend = new TermBackend({ port: 0 });
      serverInfo = await backend.listen();
      ws = await connectWs();

      await new Promise((r) => setTimeout(r, 20));

      ws.send(JSON.stringify({ type: "line", content: "user says hi" }));
      const result = await backend.read();
      expect(result).toBe("user says hi");
    });

    test("prompt sends request and receives response", async () => {
      backend = new TermBackend({ port: 0 });
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
      backend = new TermBackend({ port: 0 });
      serverInfo = await backend.listen();
      ws = await connectWs();

      const msgPromise = nextMessage(ws);
      await backend.clear();
      const msg = await msgPromise;
      expect(msg.type).toBe("clear");
    });

    test("notify sends notification", async () => {
      backend = new TermBackend({ port: 0 });
      serverInfo = await backend.listen();
      ws = await connectWs();

      const msgPromise = nextMessage(ws);
      await backend.notify("Done!");
      const msg = await msgPromise;
      expect(msg.type).toBe("notify");
      expect(msg.message).toBe("Done!");
    });

    test("resize message updates viewport", async () => {
      backend = new TermBackend({ port: 0 });
      serverInfo = await backend.listen();
      ws = await connectWs();
      await new Promise((r) => setTimeout(r, 20));

      ws.send(JSON.stringify({ type: "resize", cols: 120, rows: 40 }));
      await new Promise((r) => setTimeout(r, 20));

      const viewport = backend.getViewport();
      expect(viewport.cols).toBe(120);
      expect(viewport.rows).toBe(40);
    });

    test("type and capabilities report correctly", () => {
      backend = new TermBackend({ port: 0 });
      expect(backend.type).toBe("term");
      expect(backend.supportedFormats).toEqual(["text"]);
      expect(backend.capabilities).toEqual(["text"]);
    });

    test("write before client connects queues message", async () => {
      backend = new TermBackend({ port: 0 });
      serverInfo = await backend.listen();

      await backend.write("queued message");

      ws = await connectWs();
      const msg = await nextMessage(ws);
      expect(msg.type).toBe("output");
      expect(msg.data).toBe("queued message");
    });
  });

  describe("HTTP serving", () => {
    test("GET / returns xterm.js HTML page", async () => {
      backend = new TermBackend({ port: 0 });
      serverInfo = await backend.listen();

      const response = await fetch(httpUrl());
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      const html = await response.text();
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("xterm");
    });
  });

  describe("test mode (mock input)", () => {
    test("write/read cycle works with mock input", async () => {
      const output: string[] = [];
      const inputSource = createMockInputSource(["hello from term"]);
      backend = new TermBackend({
        inputSource,
        stdout: {
          write: (d) => {
            output.push(d);
            return true;
          },
        },
      });

      await backend.write("prompt text");
      expect(output).toContain("prompt text");

      const line = await backend.read();
      expect(line).toBe("hello from term");
    });

    test("prompt works in test mode", async () => {
      const output: string[] = [];
      const inputSource = createMockInputSource(["yes"]);
      backend = new TermBackend({
        inputSource,
        stdout: {
          write: (d) => {
            output.push(d);
            return true;
          },
        },
      });

      const result = await backend.prompt({ message: "Continue?", type: "confirm" });
      expect(result).toBe(true);
    });
  });

  describe("through AFS mount", () => {
    test("meta('/') reports term backend", async () => {
      const inputSource = createMockInputSource(["test"]);
      backend = new TermBackend({ inputSource });

      const afs = new AFS();
      const provider = new AFSUIProvider({ backend });
      await afs.mount(provider, "/ui");

      const result = await afs.read("/ui/.meta");
      expect(result.data?.meta?.backend).toBe("term");
    });

    test("write/read cycle works through AFS", async () => {
      const inputSource = createMockInputSource(["hello from term"]);
      backend = new TermBackend({ inputSource });

      const afs = new AFS();
      const provider = new AFSUIProvider({ backend });
      await afs.mount(provider, "/ui");

      const readResult = await afs.read("/ui/input");
      expect(readResult.data?.content).toBe("hello from term");
    });
  });
});
