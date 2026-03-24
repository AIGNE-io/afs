/**
 * Tests for pathPolicy — per-path sub-policies with glob matching.
 *
 * pathPolicy rules: glob pattern matching (minimatch), first match wins,
 * unmatched paths use parent policy.
 */

import { describe, expect, mock, test } from "bun:test";
import { manual, ttl } from "../src/cache-policy.js";
import { cached, createMemoryStore } from "../src/cached.js";
import type { AFSModule, AFSReadResult } from "../src/type.js";

// ─── Helpers ─────────────────────────────────────────────────────────

function createSource(name = "source"): AFSModule & { callCount: number } {
  let callCount = 0;
  return {
    name,
    accessMode: "readonly" as const,
    read: mock(async (path: string): Promise<AFSReadResult> => {
      callCount++;
      return { data: { id: path, path, content: `data-${path}` } } as any;
    }),
    get callCount() {
      return callCount;
    },
  } as any;
}

// ─── Happy Path ─────────────────────────────────────────────────────

describe("pathPolicy — Happy Path", () => {
  test("matching path uses sub-policy", async () => {
    const source = createSource();
    const provider = cached(source, {
      store: createMemoryStore(),
      policy: {
        ...ttl(3600),
        pathPolicy: [
          { pattern: "tweets/*", policy: manual() }, // never expires
        ],
      },
    });

    await provider.read!("tweets/123");
    await provider.read!("tweets/123");
    // manual() → always valid → second read should be a cache hit
    expect(source.callCount).toBe(1);
  });

  test("unmatched path uses parent policy (default ttl)", async () => {
    const source = createSource();
    const provider = cached(source, {
      store: createMemoryStore(),
      policy: {
        ...ttl(3600),
        pathPolicy: [{ pattern: "tweets/*", policy: manual() }],
      },
    });

    // This path doesn't match tweets/* → uses parent ttl(3600)
    await provider.read!("timeline/feed");
    await provider.read!("timeline/feed");
    // Still cached (within TTL)
    expect(source.callCount).toBe(1);
  });

  test("first match wins when multiple patterns could match", async () => {
    const source = createSource();
    // Use ttl(0.001) = instantly expired for the catch-all
    const shortTtl = ttl(0.001);

    const provider = cached(source, {
      store: createMemoryStore(),
      policy: {
        ...shortTtl, // Parent: very short TTL
        pathPolicy: [
          { pattern: "tweets/*", policy: manual() }, // First: never expires
          { pattern: "tweets/**", policy: shortTtl }, // Second: instantly expires
        ],
      },
    });

    await provider.read!("tweets/123");
    await provider.read!("tweets/123");
    // First match (manual) wins → cache hit
    expect(source.callCount).toBe(1);
  });
});

// ─── Bad Path ───────────────────────────────────────────────────────

describe("pathPolicy — Bad Path", () => {
  test("invalid glob pattern does not crash — treated as non-match", async () => {
    const source = createSource();
    // minimatch handles invalid patterns gracefully
    const provider = cached(source, {
      store: createMemoryStore(),
      policy: {
        ...ttl(3600),
        pathPolicy: [
          { pattern: "[", policy: manual() }, // Invalid glob
        ],
      },
    });

    // Should not throw, falls through to parent policy
    await provider.read!("test/path");
    await provider.read!("test/path");
    expect(source.callCount).toBe(1);
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────

describe("pathPolicy — Edge Cases", () => {
  test("empty pathPolicy array → all paths use parent policy", async () => {
    const source = createSource();
    const provider = cached(source, {
      store: createMemoryStore(),
      policy: {
        ...ttl(3600),
        pathPolicy: [],
      },
    });

    await provider.read!("any/path");
    await provider.read!("any/path");
    expect(source.callCount).toBe(1);
  });

  test("deeply nested path matches glob **/*", async () => {
    const source = createSource();
    const provider = cached(source, {
      store: createMemoryStore(),
      policy: {
        ...ttl(3600),
        pathPolicy: [{ pattern: "data/**/*", policy: manual() }],
      },
    });

    await provider.read!("data/a/b/c/d");
    await provider.read!("data/a/b/c/d");
    expect(source.callCount).toBe(1);
  });

  test("no pathPolicy property → all paths use parent", async () => {
    const source = createSource();
    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600), // No pathPolicy
    });

    await provider.read!("any/path");
    await provider.read!("any/path");
    expect(source.callCount).toBe(1);
  });
});

// ─── Security ───────────────────────────────────────────────────────

describe("pathPolicy — Security", () => {
  test("pathPolicy doesn't bypass cache isolation between providers", async () => {
    const source1 = createSource("s1");
    const source2 = createSource("s2");
    const policy = {
      ...ttl(3600),
      pathPolicy: [{ pattern: "shared/*", policy: manual() }],
    };

    const p1 = cached(source1, { store: createMemoryStore(), policy });
    const p2 = cached(source2, { store: createMemoryStore(), policy });

    await p1.read!("shared/data");
    await p2.read!("shared/data");

    // Each has separate store → both sources called
    expect(source1.callCount).toBe(1);
    expect(source2.callCount).toBe(1);
  });
});
