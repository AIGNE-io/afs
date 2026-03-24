/**
 * Tests for cached() observability — EventBus events, cache-status stats.
 *
 * cache:hit events include path, operation, age (ms).
 * cache:miss events include path, operation, reason.
 * cache-status returns entries, hitRate, hits, misses, operations.
 */

import { describe, expect, mock, test } from "bun:test";
import { ttl } from "../src/cache-policy.js";
import { cached, createMemoryStore } from "../src/cached.js";
import type { AFSEventSink } from "../src/events.js";
import type { AFSExecOptions, AFSModule, AFSReadResult } from "../src/type.js";

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

describe("cached observability — Happy Path", () => {
  test("cache:hit event includes path, operation, age", async () => {
    const source = createSource();
    const events: Array<{ type: string; path: string; data?: Record<string, unknown> }> = [];
    const sink: AFSEventSink = (event) => events.push(event);

    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
    });

    provider.setEventSink!(sink);

    // First read: miss
    await provider.read!("test/path");
    // Second read: hit
    await provider.read!("test/path");

    const hitEvents = events.filter((e) => e.type === "cache:hit");
    expect(hitEvents.length).toBe(1);
    expect(hitEvents[0]!.path).toBe("test/path");
    expect(hitEvents[0]!.data!.operation).toBe("read");
    expect(typeof hitEvents[0]!.data!.age).toBe("number");
    expect((hitEvents[0]!.data!.age as number) >= 0).toBe(true);
  });

  test("cache:miss event includes path, operation, reason", async () => {
    const source = createSource();
    const events: Array<{ type: string; path: string; data?: Record<string, unknown> }> = [];
    const sink: AFSEventSink = (event) => events.push(event);

    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
    });

    provider.setEventSink!(sink);

    await provider.read!("test/path");

    const missEvents = events.filter((e) => e.type === "cache:miss");
    expect(missEvents.length).toBe(1);
    expect(missEvents[0]!.path).toBe("test/path");
    expect(missEvents[0]!.data!.operation).toBe("read");
    expect(missEvents[0]!.data!.reason).toBe("not-found");
  });

  test("cache-status returns entries, hitRate, hits, misses, operations", async () => {
    const source = createSource();
    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
    });

    // Generate some stats
    await provider.read!("a");
    await provider.read!("b");
    await provider.read!("a"); // hit
    // Wait for async store writes
    await new Promise((r) => setTimeout(r, 20));

    const result = await provider.exec!("/.actions/cache-status", {}, {} as AFSExecOptions);
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.hits).toBe(1);
    expect(data.misses).toBe(2);
    expect(data.hitRate).toBeCloseTo(1 / 3, 5);
    expect(data.operations).toEqual(["read", "list", "stat"]);
  });

  test("cache-status includes refreshInterval when set", async () => {
    const source = createSource();
    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
      refreshInterval: 900,
    });

    const result = await provider.exec!("/.actions/cache-status", {}, {} as AFSExecOptions);
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.refreshInterval).toBe(900);
  });
});

// ─── Bad Path ───────────────────────────────────────────────────────

describe("cached observability — Bad Path", () => {
  test("no event sink → no error, events silently dropped", async () => {
    const source = createSource();
    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
    });

    // Don't set event sink — should not throw
    await provider.read!("test");
    await provider.read!("test");
  });

  test("cache-status on empty cache returns zeroed stats", async () => {
    const source = createSource();
    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
    });

    const result = await provider.exec!("/.actions/cache-status", {}, {} as AFSExecOptions);
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.hits).toBe(0);
    expect(data.misses).toBe(0);
    expect(data.entries).toBe(0);
    expect(data.hitRate).toBe(0);
  });

  test("event sink that throws → does not crash provider", async () => {
    const source = createSource();
    const sink: AFSEventSink = () => {
      throw new Error("subscriber exploded");
    };

    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
    });

    provider.setEventSink!(sink);

    // Should not throw despite broken sink
    await provider.read!("test");
    await provider.read!("test");
    expect(source.callCount).toBe(1); // Still working correctly
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────

describe("cached observability — Edge Cases", () => {
  test("hit/miss events accumulate correctly across many reads", async () => {
    const source = createSource();
    const events: Array<{ type: string }> = [];
    const sink: AFSEventSink = (event) => events.push(event);

    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
    });

    provider.setEventSink!(sink);

    // 3 misses (unique paths) + 3 hits (re-reads)
    await provider.read!("a");
    await provider.read!("b");
    await provider.read!("c");
    await provider.read!("a");
    await provider.read!("b");
    await provider.read!("c");

    const misses = events.filter((e) => e.type === "cache:miss");
    const hits = events.filter((e) => e.type === "cache:hit");
    expect(misses.length).toBe(3);
    expect(hits.length).toBe(3);
  });

  test("hitRate calculation correct with integer values", async () => {
    const source = createSource();
    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
    });

    // 1 miss + 2 hits = 2/3 hitRate
    await provider.read!("x");
    await provider.read!("x");
    await provider.read!("x");

    const result = await provider.exec!("/.actions/cache-status", {}, {} as AFSExecOptions);
    const data = result.data as Record<string, unknown>;
    expect(data.hitRate).toBeCloseTo(2 / 3, 5);
  });

  test("cache-status refreshInterval undefined when not set", async () => {
    const source = createSource();
    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
    });

    const result = await provider.exec!("/.actions/cache-status", {}, {} as AFSExecOptions);
    const data = result.data as Record<string, unknown>;
    expect(data.refreshInterval).toBeUndefined();
  });

  test("setEventSink with null removes sink", async () => {
    const source = createSource();
    const events: Array<{ type: string }> = [];
    const sink: AFSEventSink = (event) => events.push(event);

    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
    });

    provider.setEventSink!(sink);
    await provider.read!("x"); // miss event

    provider.setEventSink!(null);
    await provider.read!("x"); // hit — but no event since sink removed

    expect(events.length).toBe(1); // Only the initial miss
  });
});

// ─── Security ───────────────────────────────────────────────────────

describe("cached observability — Security", () => {
  test("cache:hit/miss events don't expose cached data content", async () => {
    const source = createSource();
    const events: Array<{ type: string; data?: Record<string, unknown> }> = [];
    const sink: AFSEventSink = (event) => events.push(event);

    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
    });

    provider.setEventSink!(sink);
    await provider.read!("secret/data");
    await provider.read!("secret/data");

    for (const event of events) {
      // Events should only contain operation metadata, not actual cached content
      if (event.data) {
        expect(event.data).not.toHaveProperty("content");
        expect(event.data).not.toHaveProperty("data");
        // Verify only expected keys
        const keys = Object.keys(event.data);
        for (const key of keys) {
          expect(["operation", "age", "reason"]).toContain(key);
        }
      }
    }
  });

  test("cache-status doesn't return cached entry values", async () => {
    const source = createSource();
    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
    });

    await provider.read!("sensitive/path");
    await new Promise((r) => setTimeout(r, 20));

    const result = await provider.exec!("/.actions/cache-status", {}, {} as AFSExecOptions);
    const data = result.data as Record<string, unknown>;

    // Should NOT contain any actual cached data values
    expect(data).not.toHaveProperty("cache");
    expect(data).not.toHaveProperty("data");
    expect(data).not.toHaveProperty("content");
    // Only metadata
    expect(data).toHaveProperty("hits");
    expect(data).toHaveProperty("misses");
    expect(data).toHaveProperty("entries");
    expect(data).toHaveProperty("hitRate");
  });
});

// ─── Data Damage ────────────────────────────────────────────────────

describe("cached observability — Data Damage", () => {
  test("adding observability: zero functional regression", async () => {
    const source = createSource();
    const events: Array<{ type: string }> = [];
    const sink: AFSEventSink = (event) => events.push(event);

    const provider = cached(source, {
      store: createMemoryStore(),
      policy: ttl(3600),
    });

    provider.setEventSink!(sink);

    // Standard cache behavior still works
    const r1 = await provider.read!("test");
    expect(r1.data).toBeDefined();
    expect(source.callCount).toBe(1);

    const r2 = await provider.read!("test");
    expect(r2.data).toBeDefined();
    expect(source.callCount).toBe(1); // cache hit

    // Events emitted correctly alongside normal operation
    expect(events.length).toBe(2); // 1 miss + 1 hit
  });
});
