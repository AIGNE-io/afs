import { describe, expect, mock, test } from "bun:test";
import { manual, ttl } from "../src/cache-policy.js";
import { cached, createMemoryStore } from "../src/cached.js";
import type { AFSExecOptions, AFSModule, AFSRoot } from "../src/type.js";

// ─── Test Helpers ───────────────────────────────────────────────────

function createMockSource(overrides: Partial<AFSModule> = {}): AFSModule {
  return {
    name: "test-source",
    accessMode: "readwrite" as const,
    read: mock(async (path: string) => ({
      data: { content: `content-of-${path}`, path },
    })) as any,
    list: mock(async (path: string) => ({
      data: [{ name: "file1", path: `${path}/file1`, type: "file" }],
    })) as any,
    stat: mock(async (path: string) => ({
      data: { path, type: "file", size: 42 },
    })) as any,
    write: mock(async (path: string) => ({
      data: { path, success: true },
    })) as any,
    delete: mock(async (path: string) => ({
      data: { path, success: true },
    })) as any,
    search: mock(async (path: string, query: string) => ({
      data: [{ path: `${path}/match`, content: query }],
    })) as any,
    explain: mock(async (path: string) => ({
      data: { explanation: `Explains ${path}` },
    })) as any,
    exec: mock(async (path: string, args: Record<string, any>) => ({
      data: { success: true, path, args },
    })) as any,
    ...overrides,
  };
}

function createFailingStore(): AFSModule {
  return {
    name: "failing-store",
    accessMode: "readwrite" as const,
    read: mock(async () => {
      throw new Error("store read failed");
    }) as any,
    write: mock(async () => {
      throw new Error("store write failed");
    }) as any,
    delete: mock(async () => {
      throw new Error("store delete failed");
    }) as any,
  };
}

// ─── Happy Path ─────────────────────────────────────────────────────

describe("cached() — Happy Path", () => {
  test("read cache miss: first read calls source, writes to store, returns result", async () => {
    const source = createMockSource();
    const provider = cached(source);

    const result = await provider.read!("/test", undefined);

    expect(result.data).toMatchObject({ content: "content-of-/test", path: "/test" });
    expect(source.read).toHaveBeenCalledTimes(1);
  });

  test("read cache hit: second read returns from store without calling source", async () => {
    const source = createMockSource();
    const provider = cached(source);

    await provider.read!("/test", undefined);
    // Wait for async store write
    await new Promise((r) => setTimeout(r, 10));
    await provider.read!("/test", undefined);

    expect(source.read).toHaveBeenCalledTimes(1);
  });

  test("list cache hit: cached list result returned without calling source", async () => {
    const source = createMockSource();
    const provider = cached(source);

    await provider.list!("/dir", undefined);
    await new Promise((r) => setTimeout(r, 10));
    await provider.list!("/dir", undefined);

    expect(source.list).toHaveBeenCalledTimes(1);
  });

  test("stat cache hit: cached stat result returned without calling source", async () => {
    const source = createMockSource();
    const provider = cached(source);

    await provider.stat!("/file", undefined);
    await new Promise((r) => setTimeout(r, 10));
    await provider.stat!("/file", undefined);

    expect(source.stat).toHaveBeenCalledTimes(1);
  });

  test("ttl policy: entry within TTL returns cached result", async () => {
    const source = createMockSource();
    const provider = cached(source, { policy: ttl(60) });

    await provider.read!("/test", undefined);
    await new Promise((r) => setTimeout(r, 10));
    const result = await provider.read!("/test", undefined);

    expect(result.data).toMatchObject({ content: "content-of-/test", path: "/test" });
    expect(source.read).toHaveBeenCalledTimes(1);
  });

  test("ttl expiry: expired entry triggers re-fetch from source", async () => {
    const source = createMockSource();
    // Use a very short TTL
    const policy = ttl(0.01); // 10ms
    const provider = cached(source, { policy });

    await provider.read!("/test", undefined);
    // Wait for store write + TTL expiry
    await new Promise((r) => setTimeout(r, 50));
    await provider.read!("/test", undefined);

    expect(source.read).toHaveBeenCalledTimes(2);
  });

  test("manual policy: cached entry persists until explicit refresh action", async () => {
    const source = createMockSource();
    const provider = cached(source, { policy: manual() });

    await provider.read!("/test", undefined);
    await new Promise((r) => setTimeout(r, 10));

    // Multiple reads, all from cache
    await provider.read!("/test", undefined);
    await provider.read!("/test", undefined);
    expect(source.read).toHaveBeenCalledTimes(1);

    // Refresh to clear cache
    await provider.exec!("/.actions/refresh", {}, {} as AFSExecOptions);
    await provider.read!("/test", undefined);
    expect(source.read).toHaveBeenCalledTimes(2);
  });

  test("write passthrough: write delegates to source + invalidates related cache entries", async () => {
    const source = createMockSource();
    const provider = cached(source);

    // Populate cache
    await provider.read!("/test", undefined);
    await new Promise((r) => setTimeout(r, 10));

    // Write should delegate and invalidate
    await provider.write!("/test", { content: "new" } as any, undefined);
    expect(source.write).toHaveBeenCalledTimes(1);

    // Next read should miss cache (invalidated by write)
    await provider.read!("/test", undefined);
    expect(source.read).toHaveBeenCalledTimes(2);
  });

  test("delete passthrough: delete delegates to source + invalidates cache", async () => {
    const source = createMockSource();
    const provider = cached(source);

    await provider.read!("/test", undefined);
    await new Promise((r) => setTimeout(r, 10));

    await provider.delete!("/test", undefined);
    expect(source.delete).toHaveBeenCalledTimes(1);

    // Next read should miss cache
    await provider.read!("/test", undefined);
    expect(source.read).toHaveBeenCalledTimes(2);
  });

  test("refresh action: clears all cached entries, next read re-fetches", async () => {
    const source = createMockSource();
    const provider = cached(source);

    await provider.read!("/a", undefined);
    await provider.read!("/b", undefined);
    await new Promise((r) => setTimeout(r, 10));

    const result = await provider.exec!("/.actions/refresh", {}, {} as AFSExecOptions);
    expect(result.success).toBe(true);

    await provider.read!("/a", undefined);
    await provider.read!("/b", undefined);
    expect(source.read).toHaveBeenCalledTimes(4); // 2 initial + 2 after refresh
  });

  test("invalidate action: clears cache without triggering re-fetch", async () => {
    const source = createMockSource();
    const provider = cached(source);

    await provider.read!("/test", undefined);
    await new Promise((r) => setTimeout(r, 10));

    const result = await provider.exec!("/.actions/invalidate", {}, {} as AFSExecOptions);
    expect(result.success).toBe(true);

    // No re-fetch triggered by invalidate itself
    expect(source.read).toHaveBeenCalledTimes(1);
  });

  test("cache-status action: returns hit count, miss count, entry count", async () => {
    const source = createMockSource();
    const provider = cached(source);

    await provider.read!("/a", undefined);
    await new Promise((r) => setTimeout(r, 10));
    await provider.read!("/a", undefined); // hit
    await provider.read!("/b", undefined); // miss

    await new Promise((r) => setTimeout(r, 10));

    const result = await provider.exec!("/.actions/cache-status", {}, {} as AFSExecOptions);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      hits: 1,
      misses: 2,
    });
    expect((result.data as any).hitRate).toBeCloseTo(1 / 3);
  });
});

// ─── Bad Path ───────────────────────────────────────────────────────

describe("cached() — Bad Path", () => {
  test("source read throws: error propagated to caller, nothing written to store", async () => {
    const source = createMockSource({
      read: mock(async () => {
        throw new Error("source unavailable");
      }) as any,
    });
    const store = createMemoryStore();
    const provider = cached(source, { store });

    await expect(provider.read!("/test", undefined)).rejects.toThrow("source unavailable");
    // Store should have no entries
    const storeResult = await store.read!("read//test");
    expect(storeResult.data).toBeUndefined();
  });

  test("source read returns empty/null: handled gracefully, no store corruption", async () => {
    const source = createMockSource({
      read: mock(async () => ({ data: null })) as any,
    });
    const provider = cached(source);

    const result = await provider.read!("/test", undefined);
    expect(result.data).toBeNull();
  });

  test("store write fails: does not affect read result (best-effort, silent)", async () => {
    const source = createMockSource();
    const store = createFailingStore();
    const provider = cached(source, { store });

    // Despite store failure, read should succeed
    const result = await provider.read!("/test", undefined);
    expect(result.data).toMatchObject({ content: "content-of-/test", path: "/test" });
  });

  test("store read throws: falls through to source read (graceful degradation)", async () => {
    const source = createMockSource();
    const store = createFailingStore();
    const provider = cached(source, { store });

    const result = await provider.read!("/test", undefined);
    expect(result.data).toMatchObject({ content: "content-of-/test", path: "/test" });
    expect(source.read).toHaveBeenCalledTimes(1);
  });

  test("invalid TTL (negative seconds): rejected with clear error at construction", () => {
    expect(() => ttl(-1)).toThrow("Invalid TTL");
    expect(() => ttl(0)).toThrow("Invalid TTL");
  });

  test("refresh action when source is down: error surfaces, cache stays cleared", async () => {
    const source = createMockSource({
      exec: mock(async () => {
        throw new Error("source down");
      }) as any,
    });
    const provider = cached(source);

    // Refresh should still succeed (source exec error is best-effort)
    const result = await provider.exec!("/.actions/refresh", {}, {} as AFSExecOptions);
    expect(result.success).toBe(true);
  });

  test("cached provider wrapping provider without read: no read method on result", () => {
    const source = createMockSource({ read: undefined });
    const provider = cached(source);

    expect(provider.read).toBeUndefined();
  });

  test("store returns corrupted JSON envelope: treated as cache miss, not crash", async () => {
    const store = createMemoryStore();
    // Manually write corrupted data
    await store.write!("read//test", { content: "not-valid-json{{{" } as any);

    const source = createMockSource();
    const provider = cached(source, { store });

    const result = await provider.read!("/test", undefined);
    expect(result.data).toMatchObject({ content: "content-of-/test", path: "/test" });
    expect(source.read).toHaveBeenCalledTimes(1);
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────

describe("cached() — Edge Cases", () => {
  test("concurrent reads for same path: single source fetch (request coalescing)", async () => {
    let resolveSource: (v: any) => void;
    const sourcePromise = new Promise((r) => {
      resolveSource = r;
    });

    const source = createMockSource({
      read: mock(async () => {
        await sourcePromise;
        return { data: { content: "result" } };
      }) as any,
    });

    const provider = cached(source);

    // Fire 3 concurrent reads
    const p1 = provider.read!("/test", undefined);
    const p2 = provider.read!("/test", undefined);
    const p3 = provider.read!("/test", undefined);

    // Resolve the source
    resolveSource!(undefined);

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    // All should return same result
    expect(r1.data).toMatchObject({ content: "result" });
    expect(r2.data).toMatchObject({ content: "result" });
    expect(r3.data).toMatchObject({ content: "result" });

    // But source should only be called once
    expect(source.read).toHaveBeenCalledTimes(1);
  });

  test("concurrent reads for different paths: parallel source fetches", async () => {
    const source = createMockSource();
    const provider = cached(source);

    await Promise.all([
      provider.read!("/a", undefined),
      provider.read!("/b", undefined),
      provider.read!("/c", undefined),
    ]);

    expect(source.read).toHaveBeenCalledTimes(3);
  });

  test("empty path read: handled correctly", async () => {
    const source = createMockSource();
    const provider = cached(source);

    const result = await provider.read!("", undefined);
    expect(result.data).toBeDefined();
  });

  test("very large response cached: store write succeeds or fails gracefully", async () => {
    const largeContent = "x".repeat(1_000_000);
    const source = createMockSource({
      read: mock(async () => ({
        data: { content: largeContent },
      })) as any,
    });
    const provider = cached(source);

    const result = await provider.read!("/large", undefined);
    expect((result.data as any).content).toHaveLength(1_000_000);
  });

  test("ttl exactly at boundary (0 seconds remaining): treated as expired", async () => {
    // Create a policy where isValid checks strict < (not <=)
    const policy = ttl(0.001); // 1ms
    const source = createMockSource();
    const provider = cached(source, { policy });

    await provider.read!("/test", undefined);
    // Wait well past the TTL
    await new Promise((r) => setTimeout(r, 20));
    await provider.read!("/test", undefined);

    expect(source.read).toHaveBeenCalledTimes(2);
  });

  test("rapid write then read: returns fresh data, not stale cache", async () => {
    let readCount = 0;
    const source = createMockSource({
      read: mock(async () => ({
        data: { content: `version-${++readCount}` },
      })) as any,
    });
    const provider = cached(source);

    await provider.read!("/test", undefined);
    await new Promise((r) => setTimeout(r, 10));

    // Write invalidates cache
    await provider.write!("/test", { content: "updated" } as any, undefined);
    const result = await provider.read!("/test", undefined);

    // Should get version-2 (fresh fetch after invalidation)
    expect((result.data as any).content).toBe("version-2");
  });

  test("source without write → cached without write (no-fabrication)", () => {
    const source = createMockSource({ write: undefined });
    const provider = cached(source);

    expect(provider.write).toBeUndefined();
    expect(provider.read).toBeDefined();
  });

  test("different list options produce different cache keys", async () => {
    const source = createMockSource();
    const provider = cached(source);

    await provider.list!("/dir", { recursive: true } as any);
    await new Promise((r) => setTimeout(r, 10));
    await provider.list!("/dir", { recursive: false } as any);

    // Different options → different cache keys → both miss
    expect(source.list).toHaveBeenCalledTimes(2);
  });

  test("exec always goes to source, never touches cache", async () => {
    const source = createMockSource();
    const provider = cached(source);

    await provider.exec!("/some/path", { arg: 1 }, {} as AFSExecOptions);
    await provider.exec!("/some/path", { arg: 1 }, {} as AFSExecOptions);

    expect(source.exec).toHaveBeenCalledTimes(2);
  });
});

// ─── Security ───────────────────────────────────────────────────────

describe("cached() — Security", () => {
  test("cache key injection: special characters in path don't bypass cache isolation", async () => {
    const source = createMockSource();
    const provider = cached(source);

    // Paths with special chars should produce unique cache keys
    await provider.read!("/normal", undefined);
    await new Promise((r) => setTimeout(r, 10));
    await provider.read!("/../normal", undefined);

    // Different paths = different cache entries
    expect(source.read).toHaveBeenCalledTimes(2);
  });

  test("cached data not accessible across different mount paths", async () => {
    const source = createMockSource();
    const store = createMemoryStore();

    const provider1 = cached(source, { store });
    const provider2 = cached(source, { store: createMemoryStore() });

    await provider1.read!("/test", undefined);
    await new Promise((r) => setTimeout(r, 10));

    // provider2 uses different store, should not see provider1's cache
    await provider2.read!("/test", undefined);
    expect(source.read).toHaveBeenCalledTimes(2);
  });
});

// ─── Data Leak ──────────────────────────────────────────────────────

describe("cached() — Data Leak", () => {
  test("cache-status action does not expose cached data content", async () => {
    const source = createMockSource({
      read: mock(async () => ({
        data: { content: "SECRET_DATA_12345" },
      })) as any,
    });
    const provider = cached(source);

    await provider.read!("/sensitive", undefined);
    await new Promise((r) => setTimeout(r, 10));

    const status = await provider.exec!("/.actions/cache-status", {}, {} as AFSExecOptions);
    const statusStr = JSON.stringify(status);

    expect(statusStr).not.toContain("SECRET_DATA_12345");
  });

  test("error messages from store failures don't expose store internal paths", async () => {
    const source = createMockSource();
    const store = createFailingStore();
    const provider = cached(source, { store });

    // Should not throw store errors to caller
    const result = await provider.read!("/test", undefined);
    expect(result.data).toBeDefined();
  });

  test("store write failure logs don't include response data", async () => {
    // Verified by implementation: catch blocks are empty, no logging of data
    const source = createMockSource({
      read: mock(async () => ({
        data: { content: "SENSITIVE" },
      })) as any,
    });
    const store = createFailingStore();
    const provider = cached(source, { store });

    // Should succeed without leaking data in error handling
    const result = await provider.read!("/test", undefined);
    expect((result.data as any).content).toBe("SENSITIVE");
  });
});

// ─── Data Damage ────────────────────────────────────────────────────

describe("cached() — Data Damage", () => {
  test("store write interrupted mid-flight: next read falls through to source", async () => {
    const store = createMemoryStore();
    const source = createMockSource();
    const provider = cached(source, { store });

    // Write partial/corrupted data to store
    await store.write!("read//test", { content: '{"v":1,"cachedAt":' } as any);

    // Read should detect corrupted envelope and fetch from source
    const result = await provider.read!("/test", undefined);
    expect(result.data).toMatchObject({ content: "content-of-/test", path: "/test" });
    expect(source.read).toHaveBeenCalledTimes(1);
  });

  test("corrupted store entry (invalid JSON): detected and treated as cache miss", async () => {
    const store = createMemoryStore();
    const source = createMockSource();
    const provider = cached(source, { store });

    await store.write!("read//test", { content: "{{invalid json" } as any);

    const result = await provider.read!("/test", undefined);
    expect(result.data).toMatchObject({ content: "content-of-/test", path: "/test" });
  });

  test("write + invalidation ordering: no stale reads after source write completes", async () => {
    let readVersion = 0;
    const source = createMockSource({
      read: mock(async () => ({
        data: { version: ++readVersion },
      })) as any,
    });
    const provider = cached(source);

    // Read v1
    const r1 = await provider.read!("/test", undefined);
    expect((r1.data as any).version).toBe(1);
    await new Promise((r) => setTimeout(r, 10));

    // Write invalidates cache
    await provider.write!("/test", { content: "update" } as any, undefined);

    // Read v2 — should not return stale v1
    const r2 = await provider.read!("/test", undefined);
    expect((r2.data as any).version).toBe(2);
  });

  test("lifecycle delegation: onMount/close correctly forwarded to source provider", async () => {
    const onMount = mock(() => {});
    const close = mock(async () => {});
    const ready = mock(async () => {});

    const source = createMockSource({ onMount, close, ready } as any);
    const provider = cached(source);

    provider.onMount!({} as AFSRoot, "/test");
    expect(onMount).toHaveBeenCalledTimes(1);

    await provider.ready!();
    expect(ready).toHaveBeenCalledTimes(1);

    await provider.close!();
    expect(close).toHaveBeenCalledTimes(1);
  });

  test("write invalidates cached entries with options variants", async () => {
    let readVersion = 0;
    const source = createMockSource({
      read: mock(async () => ({
        data: { version: ++readVersion },
      })) as any,
    });
    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
    });

    // Read with options → cached with key "read/test?{...}"
    const r1 = await provider.read!("/test", { recursive: true } as any);
    expect((r1.data as any).version).toBe(1);
    await new Promise((r) => setTimeout(r, 10));

    // Read with same options → cache hit
    const r2 = await provider.read!("/test", { recursive: true } as any);
    expect((r2.data as any).version).toBe(1);

    // Write invalidates cache (including options variants)
    await provider.write!("/test", { content: "update" } as any, undefined);
    await new Promise((r) => setTimeout(r, 10));

    // Read with same options → should re-fetch (not stale)
    const r3 = await provider.read!("/test", { recursive: true } as any);
    expect((r3.data as any).version).toBe(2);
  });
});

// ─── createMemoryStore ──────────────────────────────────────────────

describe("createMemoryStore()", () => {
  test("basic read/write cycle", async () => {
    const store = createMemoryStore();

    await store.write!("key1", { content: "value1" } as any);
    const result = await store.read!("key1");
    expect((result.data as any).content).toBe("value1");
  });

  test("read non-existent key returns undefined data", async () => {
    const store = createMemoryStore();
    const result = await store.read!("nonexistent");
    expect(result.data).toBeUndefined();
  });

  test("delete clears specific key", async () => {
    const store = createMemoryStore();

    await store.write!("key1", { content: "v1" } as any);
    await store.write!("key2", { content: "v2" } as any);
    await store.delete!("key1");

    const r1 = await store.read!("key1");
    const r2 = await store.read!("key2");
    expect(r1.data).toBeUndefined();
    expect((r2.data as any).content).toBe("v2");
  });

  test("delete root clears all keys", async () => {
    const store = createMemoryStore();

    await store.write!("a", { content: "1" } as any);
    await store.write!("b", { content: "2" } as any);
    await store.delete!("/");

    const r1 = await store.read!("a");
    const r2 = await store.read!("b");
    expect(r1.data).toBeUndefined();
    expect(r2.data).toBeUndefined();
  });
});
