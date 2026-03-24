/**
 * Cache Policy — defines when cached entries are valid and how cache keys are generated.
 */

export type CachedOperation = "read" | "list" | "stat" | "search";

/** Metadata stored alongside each cached entry */
export interface CacheEntry {
  /** Epoch ms when the entry was cached */
  cachedAt: number;
  /** AFS path that was cached */
  path: string;
  /** Operation type (read, list, stat) */
  operation: string;
  /** Provider-defined metadata */
  meta?: Record<string, unknown>;
}

/** JSON envelope persisted in the store */
export interface CacheEnvelope {
  /** Schema version */
  v: 1;
  /** Epoch ms when cached */
  cachedAt: number;
  /** Operation type */
  operation: string;
  /** Original path */
  path: string;
  /** Cached result data */
  data: unknown;
}

export interface CachePolicy {
  /** Whether a cached entry is still valid */
  isValid(entry: CacheEntry): boolean;
  /** Generate cache key. Default: `{op}/{path}` */
  cacheKey?(op: string, path: string, options?: unknown): string;
  /** Which operations to cache. Default: ["read", "list", "stat"] */
  operations?: CachedOperation[];
  /** Per-path sub-policies (first match wins) */
  pathPolicy?: Array<{ pattern: string; policy: CachePolicy }>;
}

// ─── Built-in Policies ──────────────────────────────────────────────

/**
 * TTL policy — entries expire after `seconds` from cache time.
 * @param seconds TTL in seconds (must be > 0)
 */
export function ttl(seconds: number): CachePolicy {
  if (seconds <= 0) {
    throw new Error(`Invalid TTL: ${seconds}s (must be > 0)`);
  }
  const ttlMs = seconds * 1000;
  return {
    isValid(entry: CacheEntry): boolean {
      return Date.now() - entry.cachedAt < ttlMs;
    },
  };
}

/**
 * Manual policy — entries never expire on their own.
 * Only invalidated via explicit refresh/invalidate actions.
 */
export function manual(): CachePolicy {
  return {
    isValid(): boolean {
      return true;
    },
  };
}

/**
 * Time Window policy — entries for past time periods are immutable (always valid),
 * entries for the current period are always stale (re-fetched).
 *
 * For granularity "day": dates before today (UTC) → valid; today or future → stale.
 * The entry's path is used to extract the date key.
 *
 * @param granularity Currently only "day" is supported
 */
export function timeWindow(granularity: "day"): CachePolicy {
  if (granularity !== "day") {
    throw new Error(`Unsupported time window granularity: ${granularity}`);
  }
  return {
    isValid(entry: CacheEntry): boolean {
      // Extract date from path (the sync key is the date itself, e.g., "2025-01-15")
      const key = entry.path;
      return !isTodayOrFuture(key);
    },
  };
}

/** Check if a date string (YYYY-MM-DD) is today or in the future (UTC). */
function isTodayOrFuture(dateStr: string): boolean {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const today = `${y}-${m}-${d}`;
  return dateStr >= today;
}
