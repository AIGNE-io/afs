/**
 * SyncAdapter — incremental sync engine for data-heavy providers.
 *
 * The adapter knows how to list keys, check staleness, fetch data in ranges,
 * and merge consecutive keys for batch API calls.
 *
 * Used by cost providers (per-day records), and extensible to any
 * provider with range-based data (analytics, logs, etc.).
 */

import type { CacheEnvelope } from "./cache-policy.js";
import type { AFSModule } from "./type.js";

// ─── Date Helpers ───────────────────────────────────────────────────

/** Format a Date as YYYY-MM-DD in UTC. */
function utcDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Add one day to a YYYY-MM-DD string, return the next day. */
export function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return utcDateStr(d);
}

/** Iterate over each day in [startDate, endDate] (inclusive). */
export function* eachDay(startDate: string, endDate: string): Generator<string> {
  const end = new Date(`${endDate}T00:00:00Z`);
  const current = new Date(`${startDate}T00:00:00Z`);
  while (current <= end) {
    yield utcDateStr(current);
    current.setUTCDate(current.getUTCDate() + 1);
  }
}

/** Merge sorted day strings into consecutive date ranges. */
export function mergeConsecutiveDays(days: string[]): Array<{ start: string; end: string }> {
  if (days.length === 0) return [];
  const sorted = [...days].sort();
  const ranges: Array<{ start: string; end: string }> = [];
  let start = sorted[0]!;
  let end = start;

  for (let i = 1; i < sorted.length; i++) {
    const day = sorted[i]!;
    if (day === nextDay(end)) {
      end = day;
    } else {
      ranges.push({ start, end });
      start = day;
      end = day;
    }
  }
  ranges.push({ start, end });
  return ranges;
}

// ─── SyncAdapter Interface ──────────────────────────────────────────

export interface SyncAdapter {
  /** List all keys that should exist in the store. */
  listKeys(): string[];
  /** Whether a key is stale (needs re-fetching even if in store).
   *  @param cachedAt - epoch ms when the entry was last cached (undefined if not in store)
   */
  isStale(key: string, cachedAt?: number): boolean;
  /**
   * Fetch data for a range of keys from the source.
   * Returns per-key results for granular store writes.
   */
  fetch(range: { start: string; end: string }): Promise<Array<{ key: string; data: unknown }>>;
  /** Merge consecutive keys into ranges to reduce API calls. */
  mergeKeys?(keys: string[]): Array<{ start: string; end: string }>;
}

// ─── Envelope Helpers ───────────────────────────────────────────────

function makeSyncEnvelope(key: string, data: unknown): CacheEnvelope {
  return {
    v: 1,
    cachedAt: Date.now(),
    operation: "sync",
    path: key,
    data,
  };
}

function parseSyncEnvelope(raw: unknown): CacheEnvelope | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as any;
  let envelope: any;
  if (typeof obj.content === "string") {
    try {
      envelope = JSON.parse(obj.content);
    } catch {
      return null;
    }
  } else {
    envelope = obj;
  }
  if (envelope?.v !== 1 || typeof envelope.cachedAt !== "number") return null;
  return envelope as CacheEnvelope;
}

// ─── incrementalSync ────────────────────────────────────────────────

export interface SyncResult {
  /** Number of keys synced in this run */
  synced: number;
  /** Total number of keys */
  total: number;
}

/**
 * Incrementally sync data from a source to a store using a SyncAdapter.
 *
 * 1. List all keys from adapter
 * 2. Find missing or stale keys by checking store
 * 3. Merge consecutive keys into ranges (minimize API calls)
 * 4. Fetch each range and write per-key to store
 *
 * @param store - AFSModule with read+write (the cache store)
 * @param adapter - SyncAdapter (knows key layout, staleness, and fetch logic)
 * @returns { synced, total } counts
 */
export async function incrementalSync(store: AFSModule, adapter: SyncAdapter): Promise<SyncResult> {
  const allKeys = adapter.listKeys();

  // Find missing/stale keys — always read store first so isStale() can
  // use cachedAt to decide whether a "potentially stale" key (e.g. today)
  // actually needs re-fetching.
  const toSync: string[] = [];
  for (const key of allKeys) {
    try {
      if (!store.read) {
        toSync.push(key);
        continue;
      }
      const result = await store.read(key);
      if (!result?.data) {
        toSync.push(key);
        continue;
      }
      const envelope = parseSyncEnvelope(result.data);
      if (!envelope) {
        toSync.push(key);
        continue;
      }
      if (adapter.isStale(key, envelope.cachedAt)) {
        toSync.push(key);
      }
    } catch {
      toSync.push(key);
    }
  }

  if (toSync.length === 0) return { synced: 0, total: allKeys.length };

  // Merge into ranges
  const ranges = adapter.mergeKeys?.(toSync) ?? toSync.map((k) => ({ start: k, end: k }));

  let synced = 0;
  for (const range of ranges) {
    const entries = await adapter.fetch(range);
    for (const { key, data } of entries) {
      if (!store.write) continue;
      const envelope = makeSyncEnvelope(key, data);
      await store.write(key, { content: JSON.stringify(envelope) } as any);
      synced++;
    }
  }

  return { synced, total: allKeys.length };
}

/**
 * Read all synced entries from store for the given keys.
 * Returns data arrays (suited for cost records) in key order.
 */
export async function readSyncedEntries<T = unknown>(
  store: AFSModule,
  keys: string[],
): Promise<T[]> {
  const results: T[] = [];
  for (const key of keys) {
    try {
      if (!store.read) continue;
      const result = await store.read(key);
      if (!result?.data) continue;
      const envelope = parseSyncEnvelope(result.data);
      if (envelope?.data) {
        const data = envelope.data;
        if (Array.isArray(data)) {
          results.push(...(data as T[]));
        } else {
          results.push(data as T);
        }
      }
    } catch {
      // Skip unreadable entries
    }
  }
  return results;
}
