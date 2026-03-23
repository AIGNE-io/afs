import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AFS } from "@aigne/afs";
import { AFSFS } from "@aigne/afs-fs";
import { ExplorerWSServer } from "../src/ws-server.js";

let testDir: string;
let afs: AFS;
let server: ExplorerWSServer;
let serverUrl: string;
let wsUrl: string;

function rpc(
  ws: WebSocket,
  method: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  const id = Math.random();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`RPC timeout: ${method}`)), 5000);
    const handler = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      if (data.id === id) {
        clearTimeout(timer);
        ws.removeEventListener("message", handler);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function connectWS(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => reject(e);
  });
}

beforeAll(async () => {
  testDir = join(tmpdir(), `afs-ws-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
  await writeFile(join(testDir, "hello.txt"), "Hello World");
  await writeFile(join(testDir, "data.json"), JSON.stringify({ key: "value" }));
  await mkdir(join(testDir, "subdir"), { recursive: true });
  await writeFile(join(testDir, "subdir", "nested.txt"), "nested content");

  afs = new AFS();
  await afs.mount(new AFSFS({ localPath: testDir, name: "test" }));

  server = new ExplorerWSServer(afs, {
    webRoot: join(import.meta.dir, "..", "web"),
  });
  const info = await server.start();
  serverUrl = info.url;
  wsUrl = `ws://localhost:${info.port}/ws`;
});

afterAll(async () => {
  server.stop();
  await rm(testDir, { recursive: true, force: true });
});

// ── Static file serving ────────────────────────────────

describe("static files", () => {
  test("GET / returns index.html", async () => {
    const res = await fetch(serverUrl);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  test("GET /state.js returns JS", async () => {
    const res = await fetch(`${serverUrl}/state.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
  });

  test("GET /styles.css returns CSS", async () => {
    const res = await fetch(`${serverUrl}/styles.css`);
    // May be 404 if styles.css doesn't exist yet — that's OK for this phase
    expect([200, 404]).toContain(res.status);
  });

  test("GET /nonexistent returns 404", async () => {
    const res = await fetch(`${serverUrl}/does-not-exist.js`);
    expect(res.status).toBe(404);
  });

  test("path traversal blocked", async () => {
    const res = await fetch(`${serverUrl}/../../../etc/passwd`);
    expect(res.status).toBe(404);
  });
});

// ── WebSocket JSON-RPC ─────────────────────────────────

describe("WS RPC", () => {
  let ws: WebSocket;

  afterEach(() => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
  });

  test("connects successfully", async () => {
    ws = await connectWS(wsUrl);
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  test("list returns entries", async () => {
    ws = await connectWS(wsUrl);
    const result = (await rpc(ws, "list", { path: "/" })) as { list: unknown[] };
    expect(result).toHaveProperty("list");
    expect(Array.isArray(result.list)).toBe(true);
  });

  test("list root includes mounted provider", async () => {
    ws = await connectWS(wsUrl);
    const result = (await rpc(ws, "list", { path: "/modules/test" })) as {
      list: Array<{ path: string }>;
    };
    const names = result.list.map((e) => e.path.split("/").pop());
    expect(names).toContain("hello.txt");
    expect(names).toContain("data.json");
    expect(names).toContain("subdir");
  });

  test("read returns file content", async () => {
    ws = await connectWS(wsUrl);
    const result = (await rpc(ws, "read", { path: "/modules/test/hello.txt" })) as {
      content: string;
    };
    expect(result.content).toBe("Hello World");
  });

  test("read missing path returns error", async () => {
    ws = await connectWS(wsUrl);
    try {
      await rpc(ws, "read", {});
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).toContain("path is required");
    }
  });

  test("stat returns entry metadata", async () => {
    ws = await connectWS(wsUrl);
    const result = (await rpc(ws, "stat", { path: "/modules/test/hello.txt" })) as {
      path: string;
      meta?: Record<string, unknown>;
    };
    expect(result).toHaveProperty("path");
  });

  test("search returns matching results", async () => {
    ws = await connectWS(wsUrl);
    const result = (await rpc(ws, "search", { path: "/modules/test", pattern: "Hello" })) as {
      list?: unknown[];
    };
    expect(result).toBeDefined();
  });

  test("search without pattern returns error", async () => {
    ws = await connectWS(wsUrl);
    try {
      await rpc(ws, "search", { path: "/" });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).toContain("pattern is required");
    }
  });

  test("getMounts returns mount list", async () => {
    ws = await connectWS(wsUrl);
    const result = (await rpc(ws, "getMounts")) as { mounts: Array<{ name: string }> };
    expect(result.mounts).toHaveLength(1);
    expect(result.mounts[0]!.name).toBe("test");
  });

  test("unknown method returns error", async () => {
    ws = await connectWS(wsUrl);
    try {
      await rpc(ws, "nonExistentMethod", {});
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).toContain("Method not found");
    }
  });

  test("malformed JSON returns parse error", async () => {
    ws = await connectWS(wsUrl);
    return new Promise<void>((resolve) => {
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        expect(data.error.code).toBe(-32700);
        resolve();
      };
      ws.send("not-json{{{");
    });
  });

  test("explain returns entry data", async () => {
    ws = await connectWS(wsUrl);
    const result = (await rpc(ws, "explain", { path: "/modules/test/hello.txt" })) as {
      path: string;
    };
    expect(result).toHaveProperty("path");
  });

  test("read on non-existent file returns error", async () => {
    ws = await connectWS(wsUrl);
    try {
      await rpc(ws, "read", { path: "/modules/test/no-such-file.txt" });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).toBeDefined();
    }
  });

  test("multiple concurrent requests don't interfere", async () => {
    ws = await connectWS(wsUrl);
    const [r1, r2, r3] = await Promise.all([
      rpc(ws, "getMounts"),
      rpc(ws, "list", { path: "/" }),
      rpc(ws, "read", { path: "/modules/test/hello.txt" }),
    ]);
    expect(r1).toHaveProperty("mounts");
    expect(r2).toHaveProperty("list");
    expect((r3 as { content: string }).content).toBe("Hello World");
  });
});

// ── Embedded assets mode ───────────────────────────────

describe("embedded assets", () => {
  test("serves from embedded assets when provided", async () => {
    const embeddedServer = new ExplorerWSServer(afs, {
      embeddedAssets: {
        "index.html": "<html><body>Embedded</body></html>",
        "app.js": "console.log('embedded');",
      },
    });
    const info = await embeddedServer.start();
    try {
      const res = await fetch(info.url);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("Embedded");
    } finally {
      embeddedServer.stop();
    }
  });
});
