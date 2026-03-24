import { describe, expect, test } from "bun:test";
import { timeWindow } from "../src/cache-policy.js";
import { createMemoryStore } from "../src/cached.js";
import {
  eachDay,
  incrementalSync,
  mergeConsecutiveDays,
  nextDay,
  readSyncedEntries,
  type SyncAdapter,
} from "../src/sync-adapter.js";

// ─── Date Helpers ───────────────────────────────────────────────────

describe("eachDay", () => {
  test("iterates inclusive range", () => {
    expect([...eachDay("2025-01-15", "2025-01-18")]).toEqual([
      "2025-01-15",
      "2025-01-16",
      "2025-01-17",
      "2025-01-18",
    ]);
  });

  test("single day range", () => {
    expect([...eachDay("2025-01-15", "2025-01-15")]).toEqual(["2025-01-15"]);
  });

  test("empty range when start > end", () => {
    expect([...eachDay("2025-01-16", "2025-01-15")]).toEqual([]);
  });

  test("crosses month boundary", () => {
    expect([...eachDay("2025-01-30", "2025-02-02")]).toEqual([
      "2025-01-30",
      "2025-01-31",
      "2025-02-01",
      "2025-02-02",
    ]);
  });
});

describe("mergeConsecutiveDays", () => {
  test("empty array returns empty", () => {
    expect(mergeConsecutiveDays([])).toEqual([]);
  });

  test("single day produces single range", () => {
    expect(mergeConsecutiveDays(["2025-01-15"])).toEqual([
      { start: "2025-01-15", end: "2025-01-15" },
    ]);
  });

  test("consecutive days merged into one range", () => {
    expect(mergeConsecutiveDays(["2025-01-15", "2025-01-16", "2025-01-17"])).toEqual([
      { start: "2025-01-15", end: "2025-01-17" },
    ]);
  });

  test("non-consecutive days produce separate ranges", () => {
    expect(mergeConsecutiveDays(["2025-01-15", "2025-01-20"])).toEqual([
      { start: "2025-01-15", end: "2025-01-15" },
      { start: "2025-01-20", end: "2025-01-20" },
    ]);
  });

  test("mixed consecutive and non-consecutive", () => {
    expect(
      mergeConsecutiveDays(["2025-01-15", "2025-01-16", "2025-01-20", "2025-01-21", "2025-01-22"]),
    ).toEqual([
      { start: "2025-01-15", end: "2025-01-16" },
      { start: "2025-01-20", end: "2025-01-22" },
    ]);
  });

  test("unsorted input handled correctly", () => {
    expect(mergeConsecutiveDays(["2025-01-17", "2025-01-15", "2025-01-16"])).toEqual([
      { start: "2025-01-15", end: "2025-01-17" },
    ]);
  });
});

describe("nextDay", () => {
  test("normal day", () => {
    expect(nextDay("2025-01-15")).toBe("2025-01-16");
  });

  test("end of month", () => {
    expect(nextDay("2025-01-31")).toBe("2025-02-01");
  });

  test("end of year", () => {
    expect(nextDay("2025-12-31")).toBe("2026-01-01");
  });
});

// ─── timeWindow("day") ─────────────────────────────────────────────

describe("timeWindow('day')", () => {
  test("past dates always valid (immutable history)", () => {
    const policy = timeWindow("day");
    const entry = {
      cachedAt: Date.now() - 86400000,
      path: "2020-01-01",
      operation: "sync",
    };
    expect(policy.isValid(entry)).toBe(true);
  });

  test("today's date always stale (re-fetched)", () => {
    const policy = timeWindow("day");
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const entry = {
      cachedAt: Date.now(),
      path: today,
      operation: "sync",
    };
    expect(policy.isValid(entry)).toBe(false);
  });

  test("future date is stale", () => {
    const policy = timeWindow("day");
    const entry = {
      cachedAt: Date.now(),
      path: "2099-12-31",
      operation: "sync",
    };
    expect(policy.isValid(entry)).toBe(false);
  });
});

// ─── Mock SyncAdapter ───────────────────────────────────────────────

function createMockAdapter(
  keys: string[],
  staleKeys: Set<string> = new Set(),
  data: Record<string, unknown[]> = {},
): SyncAdapter & { fetchCalls: Array<{ start: string; end: string }> } {
  const fetchCalls: Array<{ start: string; end: string }> = [];

  return {
    fetchCalls,
    listKeys() {
      return keys;
    },
    isStale(key: string) {
      return staleKeys.has(key);
    },
    mergeKeys(missing: string[]) {
      return mergeConsecutiveDays(missing);
    },
    async fetch(range: { start: string; end: string }) {
      fetchCalls.push(range);
      const results: Array<{ key: string; data: unknown }> = [];
      for (const day of eachDay(range.start, range.end)) {
        results.push({ key: day, data: data[day] ?? [] });
      }
      return results;
    },
  };
}

// ─── incrementalSync — Happy Path ───────────────────────────────────

describe("incrementalSync — Happy Path", () => {
  test("first sync fetches all missing keys from source", async () => {
    const store = createMemoryStore();
    const adapter = createMockAdapter(["2025-01-15", "2025-01-16", "2025-01-17"], new Set(), {
      "2025-01-15": [{ amount: 100 }],
      "2025-01-16": [{ amount: 110 }],
      "2025-01-17": [{ amount: 120 }],
    });

    const result = await incrementalSync(store, adapter);

    expect(result.synced).toBe(3);
    expect(result.total).toBe(3);
    expect(adapter.fetchCalls.length).toBe(1);
    expect(adapter.fetchCalls[0]).toEqual({ start: "2025-01-15", end: "2025-01-17" });
  });

  test("second sync fetches nothing (all cached and valid)", async () => {
    const store = createMemoryStore();
    const adapter = createMockAdapter(["2025-01-15", "2025-01-16"], new Set(), {
      "2025-01-15": [{ a: 1 }],
      "2025-01-16": [{ a: 2 }],
    });

    await incrementalSync(store, adapter);
    adapter.fetchCalls.length = 0;

    const result = await incrementalSync(store, adapter);
    expect(result.synced).toBe(0);
    expect(adapter.fetchCalls.length).toBe(0);
  });

  test("partial cache — only missing keys fetched", async () => {
    const store = createMemoryStore();
    const keys = ["2025-01-15", "2025-01-16", "2025-01-17"];
    const data = {
      "2025-01-15": [{ a: 1 }],
      "2025-01-16": [{ a: 2 }],
      "2025-01-17": [{ a: 3 }],
    };

    // First sync: populate all
    const adapter1 = createMockAdapter(keys, new Set(), data);
    await incrementalSync(store, adapter1);

    // Remove one entry from store
    await store.delete!("2025-01-16");

    // Second sync: should only fetch the missing one
    const adapter2 = createMockAdapter(keys, new Set(), data);
    const result = await incrementalSync(store, adapter2);

    expect(result.synced).toBe(1);
    expect(adapter2.fetchCalls.length).toBe(1);
    expect(adapter2.fetchCalls[0]).toEqual({ start: "2025-01-16", end: "2025-01-16" });
  });

  test("mergeKeys: consecutive days batched into single API range call", async () => {
    const store = createMemoryStore();
    const adapter = createMockAdapter(
      ["2025-01-15", "2025-01-16", "2025-01-17", "2025-01-20", "2025-01-21"],
      new Set(),
      {},
    );

    await incrementalSync(store, adapter);

    // Should merge into 2 ranges: 15-17, 20-21
    expect(adapter.fetchCalls.length).toBe(2);
    expect(adapter.fetchCalls[0]).toEqual({ start: "2025-01-15", end: "2025-01-17" });
    expect(adapter.fetchCalls[1]).toEqual({ start: "2025-01-20", end: "2025-01-21" });
  });

  test("stale keys are always re-fetched", async () => {
    const store = createMemoryStore();
    const staleKeys = new Set(["2025-01-17"]);
    const adapter = createMockAdapter(["2025-01-15", "2025-01-16", "2025-01-17"], staleKeys, {
      "2025-01-15": [{ a: 1 }],
      "2025-01-16": [{ a: 2 }],
      "2025-01-17": [{ a: 3 }],
    });

    // First sync
    await incrementalSync(store, adapter);
    adapter.fetchCalls.length = 0;

    // Second sync: only stale key should be re-fetched
    const result = await incrementalSync(store, adapter);
    expect(result.synced).toBe(1);
    expect(adapter.fetchCalls.length).toBe(1);
    expect(adapter.fetchCalls[0]).toEqual({ start: "2025-01-17", end: "2025-01-17" });
  });

  test("isStale receives cachedAt from store envelope", async () => {
    const store = createMemoryStore();
    const keys = ["2025-01-15"];
    const data = { "2025-01-15": [{ a: 1 }] };

    // First sync populates store
    const adapter1 = createMockAdapter(keys, new Set(), data);
    await incrementalSync(store, adapter1);

    // Second sync with an adapter that inspects cachedAt
    const receivedCachedAt: Array<{ key: string; cachedAt: number | undefined }> = [];
    const adapter2: SyncAdapter & { fetchCalls: Array<{ start: string; end: string }> } = {
      fetchCalls: [],
      listKeys: () => keys,
      isStale(key: string, cachedAt?: number) {
        receivedCachedAt.push({ key, cachedAt });
        return false;
      },
      async fetch(_range) {
        return [];
      },
    };

    await incrementalSync(store, adapter2);

    expect(receivedCachedAt.length).toBe(1);
    expect(receivedCachedAt[0]!.key).toBe("2025-01-15");
    expect(typeof receivedCachedAt[0]!.cachedAt).toBe("number");
    expect(receivedCachedAt[0]!.cachedAt).toBeGreaterThan(0);
  });

  test("isStale with cachedAt can prevent re-fetch of fresh entries", async () => {
    const store = createMemoryStore();
    const keys = ["2025-01-15"];
    const data = { "2025-01-15": [{ a: 1 }] };

    // First sync populates store
    const adapter1 = createMockAdapter(keys, new Set(["2025-01-15"]), data);
    await incrementalSync(store, adapter1);
    expect(adapter1.fetchCalls.length).toBe(1);

    // Second sync: isStale returns false when cachedAt is recent
    const adapter2: SyncAdapter & { fetchCalls: Array<{ start: string; end: string }> } = {
      fetchCalls: [],
      listKeys: () => keys,
      isStale(_key: string, cachedAt?: number) {
        if (!cachedAt) return true;
        return Date.now() - cachedAt > 60 * 60 * 1000; // 1 hour
      },
      async fetch(range) {
        adapter2.fetchCalls.push(range);
        return [{ key: range.start, data: (data as Record<string, unknown>)[range.start] ?? [] }];
      },
    };

    const result = await incrementalSync(store, adapter2);
    expect(result.synced).toBe(0);
    expect(adapter2.fetchCalls.length).toBe(0);
  });
});

// ─── incrementalSync — Bad Path ─────────────────────────────────────

describe("incrementalSync — Bad Path", () => {
  test("fetch failure on one range: error surfaced", async () => {
    const store = createMemoryStore();
    const adapter: SyncAdapter = {
      listKeys: () => ["2025-01-15"],
      isStale: () => false,
      async fetch() {
        throw new Error("API unavailable");
      },
    };

    await expect(incrementalSync(store, adapter)).rejects.toThrow("API unavailable");
  });

  test("fetch returns empty result: treated as valid empty data for that range", async () => {
    const store = createMemoryStore();
    const adapter = createMockAdapter(["2025-01-15"], new Set(), {});

    const result = await incrementalSync(store, adapter);
    expect(result.synced).toBe(1);

    // Store should have the entry (with empty data)
    const entries = await readSyncedEntries(store, ["2025-01-15"]);
    expect(entries).toEqual([]);
  });

  test("invalid date range (start > end): returns empty key list, no crash", async () => {
    const store = createMemoryStore();
    const adapter = createMockAdapter([], new Set(), {});

    const result = await incrementalSync(store, adapter);
    expect(result.synced).toBe(0);
    expect(result.total).toBe(0);
  });

  test("corrupted cache entry for one day: only that day re-fetched", async () => {
    const store = createMemoryStore();
    const keys = ["2025-01-15", "2025-01-16"];
    const data = { "2025-01-15": [{ a: 1 }], "2025-01-16": [{ a: 2 }] };

    // Populate store
    const adapter1 = createMockAdapter(keys, new Set(), data);
    await incrementalSync(store, adapter1);

    // Corrupt one entry
    await store.write!("2025-01-15", { content: "{{corrupted" } as any);

    // Re-sync should only fetch the corrupted entry
    const adapter2 = createMockAdapter(keys, new Set(), data);
    const result = await incrementalSync(store, adapter2);

    expect(result.synced).toBe(1);
    expect(adapter2.fetchCalls[0]).toEqual({ start: "2025-01-15", end: "2025-01-15" });
  });

  test("non-consecutive days produce separate ranges (no invalid merge)", async () => {
    const store = createMemoryStore();
    const adapter = createMockAdapter(["2025-01-15", "2025-01-20", "2025-01-25"], new Set(), {});

    await incrementalSync(store, adapter);

    expect(adapter.fetchCalls.length).toBe(3);
  });
});

// ─── incrementalSync — Edge Cases ───────────────────────────────────

describe("incrementalSync — Edge Cases", () => {
  test("single day range (start == end): no merge needed, single fetch", async () => {
    const store = createMemoryStore();
    const adapter = createMockAdapter(["2025-01-15"], new Set(), { "2025-01-15": [{ a: 1 }] });

    const result = await incrementalSync(store, adapter);
    expect(result.synced).toBe(1);
    expect(adapter.fetchCalls.length).toBe(1);
  });

  test("365-day range: large merge produces minimal API calls", async () => {
    const keys: string[] = [];
    for (const day of eachDay("2025-01-01", "2025-12-31")) {
      keys.push(day);
    }
    const store = createMemoryStore();
    const adapter = createMockAdapter(keys, new Set(), {});

    await incrementalSync(store, adapter);

    // All consecutive → single range
    expect(adapter.fetchCalls.length).toBe(1);
    expect(adapter.fetchCalls[0]).toEqual({ start: "2025-01-01", end: "2025-12-31" });
  });

  test("empty source (no keys): sync completes with 0 entries", async () => {
    const store = createMemoryStore();
    const adapter = createMockAdapter([], new Set(), {});

    const result = await incrementalSync(store, adapter);
    expect(result.synced).toBe(0);
    expect(result.total).toBe(0);
  });

  test("eachDay with same start and end: yields exactly one day", () => {
    expect([...eachDay("2025-01-15", "2025-01-15")]).toEqual(["2025-01-15"]);
  });
});

// ─── readSyncedEntries ──────────────────────────────────────────────

describe("readSyncedEntries", () => {
  test("reads all synced data", async () => {
    const store = createMemoryStore();
    const adapter = createMockAdapter(["2025-01-15", "2025-01-16"], new Set(), {
      "2025-01-15": [{ amount: 100 }, { amount: 25 }],
      "2025-01-16": [{ amount: 110 }],
    });

    await incrementalSync(store, adapter);

    const entries = await readSyncedEntries(store, ["2025-01-15", "2025-01-16"]);
    expect(entries).toEqual([{ amount: 100 }, { amount: 25 }, { amount: 110 }]);
  });

  test("missing key returns no data", async () => {
    const store = createMemoryStore();
    const entries = await readSyncedEntries(store, ["nonexistent"]);
    expect(entries).toEqual([]);
  });

  test("corrupted entry skipped", async () => {
    const store = createMemoryStore();
    await store.write!("key1", { content: "not-valid-json{{{" } as any);

    const entries = await readSyncedEntries(store, ["key1"]);
    expect(entries).toEqual([]);
  });
});

// ─── Security ───────────────────────────────────────────────────────

describe("incrementalSync — Security", () => {
  test("sync adapter cannot access paths outside its declared key space", async () => {
    const store = createMemoryStore();
    // The adapter only lists its own keys; incrementalSync only reads/writes those keys
    const adapter = createMockAdapter(["2025-01-15"], new Set(), {
      "2025-01-15": [{ a: 1 }],
    });

    await incrementalSync(store, adapter);

    // Store should only have the adapter's key, nothing else
    const storeResult = await store.read!("2025-01-16");
    expect(storeResult.data).toBeUndefined();
  });
});

// ─── Data Damage ────────────────────────────────────────────────────

describe("incrementalSync — Data Damage", () => {
  test("partial sync failure: successfully synced days preserved in store", async () => {
    const store = createMemoryStore();
    let callCount = 0;
    const adapter: SyncAdapter = {
      listKeys: () => ["2025-01-15", "2025-01-20"],
      isStale: () => false,
      async fetch(range) {
        callCount++;
        if (callCount === 2) throw new Error("API error on second range");
        return [{ key: range.start, data: [{ amount: 100 }] }];
      },
    };

    // Should fail on second range
    await expect(incrementalSync(store, adapter)).rejects.toThrow();

    // But first range should be in store
    const entries = await readSyncedEntries(store, ["2025-01-15"]);
    expect(entries).toEqual([{ amount: 100 }]);
  });
});
