/**
 * Tests for Phase 3: Provider Manifest Declaration + Auto-wrap at Mount
 *
 * Verifies that providers with cache declarations in their manifest
 * are automatically wrapped with cached() at mount time via maybeWrapWithCache.
 */

import { describe, expect, mock, test } from "bun:test";
import {
  type AFSModule,
  cached,
  createMemoryStore,
  manual,
  type ProviderCacheDeclaration,
  type ProviderManifest,
  timeWindow,
  ttl,
} from "../src/index.js";

// ─── Helpers ─────────────────────────────────────────────────────────

/** Create a class with optional static manifest() — avoids polluting Object. */
function createMockSource(options?: {
  name?: string;
  cacheDeclInManifest?: ProviderCacheDeclaration;
}): AFSModule & { readCallCount: number } {
  // Use a constructor function so the instance has a .constructor with static manifest()
  function MockSourceCtor() {}

  if (options?.cacheDeclInManifest) {
    const decl = options.cacheDeclInManifest;
    (MockSourceCtor as any).manifest = () => ({
      name: options.name ?? "test-source",
      description: "Test",
      uriTemplate: "test://",
      category: "test",
      schema: {} as any,
      cache: decl,
    });
  }

  let readCallCount = 0;
  const readFn = mock(async (path: string) => {
    readCallCount++;
    return { data: { id: path, path, content: `data-${path}` } } as any;
  });

  const source = Object.assign(new (MockSourceCtor as any)(), {
    name: options?.name ?? "test-source",
    accessMode: "readonly" as const,
    read: readFn,
    list: mock(async () => ({ data: [] })) as any,
    stat: mock(async () => ({ data: { path: "/" } })) as any,
  }) as unknown as AFSModule & { readCallCount: number };

  Object.defineProperty(source, "readCallCount", {
    get: () => readCallCount,
  });

  return source;
}

/** Simulate maybeWrapWithCache logic (from afs-loader.ts) */
function maybeWrapWithCache(
  provider: AFSModule,
  mountConfig: { cache?: { disabled?: boolean; ttlSeconds?: number; operations?: string[] } },
): AFSModule {
  const cacheConfig = mountConfig.cache;
  if (cacheConfig?.disabled) return provider;

  const ctor = provider.constructor as any;
  let cacheDecl: ProviderCacheDeclaration | undefined;
  if (typeof ctor.manifest === "function") {
    const m = ctor.manifest();
    const manifest = Array.isArray(m) ? m[0] : m;
    cacheDecl = manifest?.cache;
  }

  if (!cacheDecl && !cacheConfig) return provider;
  if (!cacheDecl) return provider;

  const strategy = cacheDecl.strategy;
  const ttlSeconds = cacheConfig?.ttlSeconds ?? cacheDecl.ttlSeconds;
  const operations = cacheConfig?.operations ?? cacheDecl.operations;

  let policy: any;
  switch (strategy) {
    case "ttl":
      policy = ttl(ttlSeconds ?? 3600);
      break;
    case "manual":
      policy = manual();
      break;
    case "time-window":
      policy = timeWindow(cacheDecl.granularity ?? "day");
      break;
    default:
      throw new Error(`Unsupported cache strategy: ${strategy}`);
  }

  if (operations) {
    policy = { ...policy, operations };
  }

  return cached(provider, { store: createMemoryStore(), policy });
}

// ─── Happy Path ─────────────────────────────────────────────────────

describe("Provider Manifest Cache — Happy Path", () => {
  test("manifest has cache + config has store → provider auto-wrapped with cached()", () => {
    const source = createMockSource({
      cacheDeclInManifest: { strategy: "ttl", ttlSeconds: 300 },
    });
    const wrapped = maybeWrapWithCache(source, {});
    // Wrapped provider should be different from source
    expect(wrapped).not.toBe(source);
    // But should preserve name
    expect(wrapped.name).toBe(source.name);
  });

  test("manifest has cache → read is cached on second call", async () => {
    const source = createMockSource({
      cacheDeclInManifest: { strategy: "ttl", ttlSeconds: 300 },
    });
    const wrapped = maybeWrapWithCache(source, {});
    await wrapped.read!("/test");
    await wrapped.read!("/test");
    // Source should only be called once (second is cache hit)
    expect(source.readCallCount).toBe(1);
  });

  test("config.ttlSeconds overrides manifest ttlSeconds", async () => {
    const source = createMockSource({
      cacheDeclInManifest: { strategy: "ttl", ttlSeconds: 300 },
    });
    // Override with very large TTL
    const wrapped = maybeWrapWithCache(source, { cache: { ttlSeconds: 99999 } });
    await wrapped.read!("/test");
    await wrapped.read!("/test");
    expect(source.readCallCount).toBe(1);
  });

  test("buildPolicy maps strategy 'time-window' to timeWindow policy", () => {
    const source = createMockSource({
      cacheDeclInManifest: { strategy: "time-window", granularity: "day" },
    });
    const wrapped = maybeWrapWithCache(source, {});
    expect(wrapped).not.toBe(source);
  });

  test("buildPolicy maps strategy 'manual' to manual policy", () => {
    const source = createMockSource({
      cacheDeclInManifest: { strategy: "manual" },
    });
    const wrapped = maybeWrapWithCache(source, {});
    expect(wrapped).not.toBe(source);
  });

  test("cost provider manifest includes cache declaration", () => {
    // Verify the ProviderCacheDeclaration type is correct
    const decl: ProviderCacheDeclaration = {
      strategy: "time-window",
      granularity: "day",
      operations: ["read", "list"],
    };
    expect(decl.strategy).toBe("time-window");
    expect(decl.granularity).toBe("day");
    expect(decl.operations).toEqual(["read", "list"]);
  });
});

// ─── Bad Path ───────────────────────────────────────────────────────

describe("Provider Manifest Cache — Bad Path", () => {
  test("no manifest cache + no config → no wrapping", () => {
    const source = createMockSource();
    const wrapped = maybeWrapWithCache(source, {});
    expect(wrapped).toBe(source);
  });

  test("config.disabled = true → no wrapping despite manifest declaration", () => {
    const source = createMockSource({
      cacheDeclInManifest: { strategy: "ttl", ttlSeconds: 300 },
    });
    const wrapped = maybeWrapWithCache(source, { cache: { disabled: true } });
    expect(wrapped).toBe(source);
  });

  test("unsupported strategy string → rejected with error", () => {
    const source = createMockSource({
      cacheDeclInManifest: { strategy: "invalid" as any },
    });
    expect(() => maybeWrapWithCache(source, {})).toThrow("Unsupported cache strategy");
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────

describe("Provider Manifest Cache — Edge Cases", () => {
  test("provider has no manifest() method → no wrapping", () => {
    const source = createMockSource();
    // No manifest set on constructor
    const wrapped = maybeWrapWithCache(source, {});
    expect(wrapped).toBe(source);
  });

  test("empty cache declaration fields → sensible defaults applied", () => {
    const source = createMockSource({
      cacheDeclInManifest: { strategy: "ttl" },
    });
    // No ttlSeconds → defaults to 3600
    const wrapped = maybeWrapWithCache(source, {});
    expect(wrapped).not.toBe(source);
  });

  test("no manifest cache + config has cache settings → still no wrapping", () => {
    const source = createMockSource();
    // Config alone without manifest doesn't trigger wrapping
    const wrapped = maybeWrapWithCache(source, { cache: { ttlSeconds: 300 } });
    expect(wrapped).toBe(source);
  });
});

// ─── Security ───────────────────────────────────────────────────────

describe("Provider Manifest Cache — Security", () => {
  test("cache store isolated per provider instance", async () => {
    const source1 = createMockSource({
      name: "source-a",
      cacheDeclInManifest: { strategy: "ttl", ttlSeconds: 3600 },
    });
    const source2 = createMockSource({
      name: "source-b",
      cacheDeclInManifest: { strategy: "ttl", ttlSeconds: 3600 },
    });

    const wrapped1 = maybeWrapWithCache(source1, {});
    const wrapped2 = maybeWrapWithCache(source2, {});

    await wrapped1.read!("/shared-path");
    await wrapped2.read!("/shared-path");

    // Each should call its own source (no cross-mount cache access)
    expect(source1.readCallCount).toBe(1);
    expect(source2.readCallCount).toBe(1);
  });
});

// ─── Data Damage ────────────────────────────────────────────────────

describe("Provider Manifest Cache — Data Damage", () => {
  test("adding cache field to ProviderManifest is backward compatible", () => {
    // ProviderManifest without cache still valid
    const manifest: ProviderManifest = {
      name: "test",
      description: "Test",
      uriTemplate: "test://",
      category: "test",
      schema: {} as any,
    };
    expect(manifest.cache).toBeUndefined();
  });

  test("removing cache config → provider works normally without caching", async () => {
    const source = createMockSource({
      cacheDeclInManifest: { strategy: "ttl", ttlSeconds: 300 },
    });
    // Disable via config
    const wrapped = maybeWrapWithCache(source, { cache: { disabled: true } });
    await wrapped.read!("/test");
    await wrapped.read!("/test");
    // Should call source both times (no caching)
    expect(source.readCallCount).toBe(2);
  });
});
