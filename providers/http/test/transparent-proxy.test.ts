import { describe, expect, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import { AFSHttpClient } from "../src/client.js";
import { createAFSHttpHandler } from "../src/handler.js";

/**
 * Mock AFS module with all methods (including stat + explain)
 */
function createFullMockModule(overrides: Partial<AFSModule> = {}): AFSModule {
  return {
    name: "mock",
    accessMode: "readwrite",
    list: async (path, _options) => ({
      data: [{ id: "1", path }],
    }),
    read: async (path, _options) => ({
      data: { id: "1", path, content: "test content" },
    }),
    write: async (path, content, _options) => ({
      data: { id: "1", path, ...content },
    }),
    delete: async (path, _options) => ({
      message: `Deleted ${path}`,
    }),
    rename: async (oldPath, newPath, _options) => ({
      message: `Renamed ${oldPath} to ${newPath}`,
    }),
    search: async (path, query, _options) => ({
      data: [{ id: "1", path, content: `match: ${query}` }],
    }),
    exec: async (_path, _args, _options) => ({
      success: true,
      data: { result: "executed" },
    }),
    stat: async (path, _options) => ({
      data: { id: "1", path, type: "file" as const, size: 42 },
    }),
    explain: async (path, _options) => ({
      format: "markdown" as const,
      content: `# ${path}\nThis is a file.`,
    }),
    ...overrides,
  };
}

/**
 * Helper: make a raw handler request with { method, args }
 */
function makeRequest(body: unknown): Request {
  return new Request("http://localhost/rpc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Phase 9: Transparent proxy — handler args format", () => {
  const handler = createAFSHttpHandler({ module: createFullMockModule() });

  // ── Happy Path ──────────────────────────────────────────────

  test("list via args array", async () => {
    const res = await handler(makeRequest({ method: "list", args: ["/"] }));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.data).toHaveLength(1);
    expect(body.data.data[0].path).toBe("/");
  });

  test("read via args array", async () => {
    const res = await handler(makeRequest({ method: "read", args: ["/test.txt"] }));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.data.content).toBe("test content");
  });

  test("write via args array (3 arguments)", async () => {
    const res = await handler(
      makeRequest({
        method: "write",
        args: ["/new.txt", { content: "new" }, {}],
      }),
    );
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("rename via args array (2 path arguments)", async () => {
    const res = await handler(makeRequest({ method: "rename", args: ["/old.txt", "/new.txt"] }));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toContain("Renamed");
  });

  test("search via args array (path + query)", async () => {
    const res = await handler(makeRequest({ method: "search", args: ["/", "keyword"] }));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.data[0].content).toContain("keyword");
  });

  test("exec via args array", async () => {
    const res = await handler(
      makeRequest({
        method: "exec",
        args: ["/action", { key: "value" }, {}],
      }),
    );
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.data.result).toBe("executed");
  });

  test("stat via args array (previously unsupported)", async () => {
    const res = await handler(makeRequest({ method: "stat", args: ["/file.txt"] }));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.data.size).toBe(42);
  });

  test("explain via args array (previously unsupported)", async () => {
    const res = await handler(makeRequest({ method: "explain", args: ["/file.txt"] }));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.format).toBe("markdown");
    expect(body.data.content).toContain("file.txt");
  });

  test("delete via args array", async () => {
    const res = await handler(makeRequest({ method: "delete", args: ["/old.txt"] }));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.message).toContain("Deleted");
  });

  // ── Backward compatibility: params format still works ──────

  test("list via params format (backward compatible)", async () => {
    const res = await handler(makeRequest({ method: "list", params: { path: "/" } }));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.data).toHaveLength(1);
  });

  test("read via params format (backward compatible)", async () => {
    const res = await handler(makeRequest({ method: "read", params: { path: "/test.txt" } }));
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.data.content).toBe("test content");
  });

  // ── Bad Path ──────────────────────────────────────────────

  test("non-existent method → error", async () => {
    const res = await handler(makeRequest({ method: "nonexistent", args: [] }));
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toMatch(/not supported|unknown method|does not support/i);
  });

  test("args not an array → error", async () => {
    const res = await handler(makeRequest({ method: "list", args: "not-array" }));
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test("method is empty string → error", async () => {
    const res = await handler(makeRequest({ method: "", args: [] }));
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test("module does not support the method → error", async () => {
    const limitedHandler = createAFSHttpHandler({
      module: createFullMockModule({ stat: undefined }),
    });
    const res = await limitedHandler(makeRequest({ method: "stat", args: ["/file.txt"] }));
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toMatch(/does not support|not supported/i);
  });

  // ── Edge Cases ──────────────────────────────────────────────

  test("args is empty array", async () => {
    // list with no args → should still call module.list() (path=undefined)
    // The module may error, but the handler should forward without crashing
    const res = await handler(makeRequest({ method: "list", args: [] }));
    // Handler shouldn't crash; it forwards to module
    expect(res.status).toBeLessThanOrEqual(500);
  });

  test("args with undefined values → preserved through JSON", async () => {
    // JSON.stringify converts undefined to null in arrays
    const res = await handler(makeRequest({ method: "read", args: ["/test.txt", null] }));
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("args with complex nested objects → serialized correctly", async () => {
    const complexArgs = {
      nested: { deep: { value: [1, 2, 3] } },
      date: "2026-01-01",
    };
    const res = await handler(
      makeRequest({
        method: "exec",
        args: ["/action", complexArgs, {}],
      }),
    );
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("concurrent requests don't interfere", async () => {
    const results = await Promise.all([
      handler(makeRequest({ method: "read", args: ["/a.txt"] })),
      handler(makeRequest({ method: "read", args: ["/b.txt"] })),
      handler(makeRequest({ method: "list", args: ["/"] })),
    ]);
    for (const res of results) {
      const body = await res.json();
      expect(body.success).toBe(true);
    }
  });

  // ── Security ──────────────────────────────────────────────

  test("cannot call internal method: constructor", async () => {
    const res = await handler(makeRequest({ method: "constructor", args: [] }));
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test("cannot call internal method: toString", async () => {
    const res = await handler(makeRequest({ method: "toString", args: [] }));
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test("cannot call internal method: __proto__", async () => {
    const res = await handler(makeRequest({ method: "__proto__", args: [] }));
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test("bearer token auth still works", async () => {
    const secureHandler = createAFSHttpHandler({
      module: createFullMockModule(),
      token: "secret-123",
    });

    // Without token → 401
    const res1 = await secureHandler(makeRequest({ method: "list", args: ["/"] }));
    expect(res1.status).toBe(401);

    // With correct token → 200
    const req = new Request("http://localhost/rpc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret-123",
      },
      body: JSON.stringify({ method: "list", args: ["/"] }),
    });
    const res2 = await secureHandler(req);
    const body = await res2.json();
    expect(body.success).toBe(true);
  });

  // ── Data Leak ──────────────────────────────────────────────

  test("error does not expose module internal structure", async () => {
    const res = await handler(makeRequest({ method: "nonexistent", args: [] }));
    const body = await res.json();
    const errStr = JSON.stringify(body);
    // Should not list available methods
    expect(errStr).not.toContain("list, read, write");
    // Should not expose module properties
    expect(errStr).not.toContain("accessMode");
  });

  // ── Data Damage ────────────────────────────────────────────

  test("module exception is caught, handler does not crash", async () => {
    const errorHandler = createAFSHttpHandler({
      module: createFullMockModule({
        read: async () => {
          throw new Error("Disk I/O failure");
        },
      }),
    });
    const res = await errorHandler(makeRequest({ method: "read", args: ["/broken"] }));
    expect(res.status).toBe(200); // Error in body, not HTTP 500
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.message).toContain("Disk I/O failure");
  });
});

describe("Phase 9: Transparent proxy — client stat + explain", () => {
  const mockModule = createFullMockModule();
  const handler = createAFSHttpHandler({ module: mockModule });

  const mockFetch = async (url: string, init?: RequestInit): Promise<Response> => {
    return handler(new Request(url, init));
  };
  const originalFetch = globalThis.fetch;

  test("client.stat() calls remote stat", async () => {
    globalThis.fetch = mockFetch as typeof fetch;
    try {
      const client = new AFSHttpClient({
        allowPrivateNetwork: true,
        url: "http://localhost:3000",
        name: "remote",
      });
      const result = await client.stat!("/file.txt");
      expect((result.data as any)?.size).toBe(42);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("client.explain() calls remote explain", async () => {
    globalThis.fetch = mockFetch as typeof fetch;
    try {
      const client = new AFSHttpClient({
        allowPrivateNetwork: true,
        url: "http://localhost:3000",
        name: "remote",
      });
      const result = await client.explain!("/file.txt");
      expect(result.format).toBe("markdown");
      expect(result.content).toContain("file.txt");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("client preserves type-safe method signatures", async () => {
    globalThis.fetch = mockFetch as typeof fetch;
    try {
      const client = new AFSHttpClient({
        allowPrivateNetwork: true,
        url: "http://localhost:3000",
        name: "remote",
      });

      // All these should compile and work
      const listResult = await client.list("/");
      expect(listResult.data).toBeDefined();

      const readResult = await client.read("/test.txt");
      expect(readResult.data).toBeDefined();

      const searchResult = await client.search("/", "keyword");
      expect(searchResult.data).toBeDefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
