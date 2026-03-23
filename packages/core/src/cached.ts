/**
 * cached() — wraps any AFS Provider with transparent caching.
 *
 * Cached ops (read, list, stat): check store → miss → fetch source → write store → return
 * Pass-through ops (write, delete): delegate to source + invalidate cache
 * Never-cached ops (exec, search, explain): delegate to source directly
 * Injected actions: refresh, invalidate, cache-status
 * No-fabrication: if source lacks write/delete, cached wrapper also lacks them
 * Concurrency: request coalescing — concurrent reads for same path trigger one source fetch
 * Store writes: best-effort, async, non-blocking
 */

import { minimatch } from "minimatch";
import { joinURL } from "ufo";
import { type CacheEnvelope, type CachePolicy, ttl } from "./cache-policy.js";
import type { AFSEventSink } from "./events.js";
import type {
  AFSDeleteOptions,
  AFSDeleteResult,
  AFSExecOptions,
  AFSExecResult,
  AFSListOptions,
  AFSListResult,
  AFSModule,
  AFSReadOptions,
  AFSReadResult,
  AFSRoot,
  AFSStatOptions,
  AFSStatResult,
  AFSWriteEntryPayload,
  AFSWriteOptions,
  AFSWriteResult,
  SecretCapability,
} from "./type.js";

// ─── Types ──────────────────────────────────────────────────────────

export interface CachedOptions {
  /** Store provider (any AFSModule with read+write). Defaults to in-memory store. */
  store?: AFSModule;
  /** Cache policy. Defaults to ttl(3600). */
  policy?: CachePolicy;
  /** Periodic refresh interval in seconds. When > 0 and a scheduler is mounted, registers a cron job. */
  refreshInterval?: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  /** Approximate: increments on each store write (including overwrites), reset on clear. */
  entries: number;
}

// ─── In-memory Store ────────────────────────────────────────────────

/** Creates a simple in-memory store implementing read+write as an AFSModule. */
export function createMemoryStore(): AFSModule {
  const data = new Map<string, string>();
  return {
    name: "memory-cache-store",
    accessMode: "readwrite" as const,
    async read(path: string) {
      const content = data.get(path);
      if (content === undefined) {
        return { data: undefined } as unknown as AFSReadResult;
      }
      return { data: { id: path, path, content } } as unknown as AFSReadResult;
    },
    async write(path: string, payload: AFSWriteEntryPayload) {
      data.set(path, (payload as any).content ?? JSON.stringify(payload));
      return { data: { id: path, path } } as unknown as AFSWriteResult;
    },
    async list(path: string) {
      const prefix = path === "/" || path === "" ? "" : path;
      const entries: Array<{ id: string; name: string; path: string }> = [];
      for (const key of data.keys()) {
        if (prefix === "" || key.startsWith(prefix)) {
          entries.push({ id: key, name: key, path: key });
        }
      }
      return { data: entries } as unknown as AFSListResult;
    },
    async delete(path: string) {
      if (path === "/" || path === "") {
        data.clear();
      } else {
        const keysToDelete: string[] = [];
        for (const key of data.keys()) {
          if (key === path || key.startsWith(`${path}/`)) {
            keysToDelete.push(key);
          }
        }
        for (const key of keysToDelete) {
          data.delete(key);
        }
      }
      return {} as AFSDeleteResult;
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function defaultCacheKey(op: string, path: string, options?: unknown): string {
  const base = `${op}/${path}`;
  if (!options || typeof options !== "object" || Object.keys(options).length === 0) {
    return base;
  }
  // Sort keys for deterministic hashing
  const sorted = JSON.stringify(options, Object.keys(options).sort());
  return `${base}?${sorted}`;
}

function parseEnvelope(raw: unknown): CacheEnvelope | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as any;
  // Could be { content: "..." } from store read result
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

function makeEnvelope(op: string, path: string, data: unknown): CacheEnvelope {
  return {
    v: 1,
    cachedAt: Date.now(),
    operation: op,
    path,
    data,
  };
}

// ─── CachedProvider ─────────────────────────────────────────────────

const INJECTED_ACTIONS = new Set(["refresh", "invalidate", "cache-status"]);

class CachedProvider implements AFSModule {
  readonly name: string;
  readonly description?: string;
  readonly uri?: string;
  readonly accessMode?: AFSModule["accessMode"];
  readonly visibility?: AFSModule["visibility"];
  readonly agentSkills?: boolean;
  readonly timeout?: number;
  readonly actionPolicy?: AFSModule["actionPolicy"];
  readonly sensitiveFields?: string[];
  readonly sensitivity?: AFSModule["sensitivity"];
  readonly riskLevel?: AFSModule["riskLevel"];
  readonly blockedActions?: string[];
  readonly allowedActions?: string[];
  readonly credential?: Record<string, unknown>;

  private readonly source: AFSModule;
  private readonly store: AFSModule;
  private readonly policy: CachePolicy;
  private readonly cachedOps: Set<string>;
  /** Approximate: entries increments on each store write (overwrites counted again). */
  private readonly stats: CacheStats = { hits: 0, misses: 0, entries: 0 };
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly refreshInterval: number;
  private root?: AFSRoot;
  private mountPath?: string;
  private eventSink: AFSEventSink | null = null;

  // No-fabrication: only expose operations the source has
  readonly list?: AFSModule["list"];
  readonly read?: AFSModule["read"];
  readonly write?: AFSModule["write"];
  readonly delete?: AFSModule["delete"];
  readonly search?: AFSModule["search"];
  readonly stat?: AFSModule["stat"];
  readonly explain?: AFSModule["explain"];
  readonly exec: AFSModule["exec"];

  // Lifecycle
  readonly ready?: AFSModule["ready"];
  readonly close?: AFSModule["close"];
  readonly setEventSink?: AFSModule["setEventSink"];
  readonly setSecretCapability?: AFSModule["setSecretCapability"];
  readonly onMount?: AFSModule["onMount"];

  constructor(source: AFSModule, options: CachedOptions = {}) {
    this.source = source;
    this.store = options.store ?? createMemoryStore();
    this.policy = options.policy ?? ttl(3600);
    this.cachedOps = new Set(this.policy.operations ?? ["read", "list", "stat"]);
    this.refreshInterval = options.refreshInterval ?? 0;

    // Forward identity properties from source
    this.name = source.name;
    this.description = source.description;
    this.uri = source.uri;
    this.accessMode = source.accessMode;
    this.visibility = source.visibility;
    this.agentSkills = source.agentSkills;
    this.timeout = source.timeout;
    this.actionPolicy = source.actionPolicy;
    this.sensitiveFields = source.sensitiveFields;
    this.sensitivity = source.sensitivity;
    this.riskLevel = source.riskLevel;
    this.blockedActions = source.blockedActions;
    this.allowedActions = source.allowedActions;
    this.credential = source.credential;

    // ── Bind cached operations (no-fabrication) ──

    if (source.read) {
      this.read = async (path: string, options?: AFSReadOptions): Promise<AFSReadResult> => {
        if (this.cachedOps.has("read")) {
          return this.cachedOp("read", path, options, () => source.read!(path, options));
        }
        return source.read!(path, options);
      };
    }

    if (source.list) {
      this.list = async (path: string, options?: AFSListOptions): Promise<AFSListResult> => {
        if (this.cachedOps.has("list")) {
          return this.cachedOp("list", path, options, () => source.list!(path, options));
        }
        return source.list!(path, options);
      };
    }

    if (source.stat) {
      this.stat = async (path: string, options?: AFSStatOptions): Promise<AFSStatResult> => {
        if (this.cachedOps.has("stat")) {
          return this.cachedOp("stat", path, options, () => source.stat!(path, options));
        }
        return source.stat!(path, options);
      };
    }

    // ── Pass-through with invalidation ──

    if (source.write) {
      this.write = async (
        path: string,
        content: AFSWriteEntryPayload,
        options?: AFSWriteOptions,
      ): Promise<AFSWriteResult> => {
        const result = await source.write!(path, content, options);
        this.invalidateByPath(path);
        return result;
      };
    }

    if (source.delete) {
      this.delete = async (path: string, options?: AFSDeleteOptions): Promise<AFSDeleteResult> => {
        const result = await source.delete!(path, options);
        this.invalidateByPath(path);
        return result;
      };
    }

    // ── Never-cached ops ──

    if (source.search) {
      this.search = source.search.bind(source);
    }

    if (source.explain) {
      this.explain = source.explain.bind(source);
    }

    // ── Exec: intercept injected actions, pass rest to source ──

    this.exec = async (
      path: string,
      args: Record<string, any>,
      options: AFSExecOptions,
    ): Promise<AFSExecResult> => {
      const actionName = extractActionName(path);
      if (actionName && INJECTED_ACTIONS.has(actionName)) {
        return this.handleAction(actionName, args);
      }
      if (source.exec) {
        return source.exec(path, args, options);
      }
      return {
        success: false,
        error: { code: "NOT_SUPPORTED", message: "exec not supported" },
      };
    };

    // ── Lifecycle delegation ──

    if (source.ready) {
      this.ready = () => source.ready!();
    }

    // close: delegate to source + unschedule cron (best-effort)
    this.close = () => {
      if (this.refreshInterval > 0 && this.root?.exec && this.mountPath) {
        this.root
          .exec(
            "/scheduler/.actions/unschedule",
            { name: `cache-refresh:${this.mountPath}` },
            {} as AFSExecOptions,
          )
          .catch(() => {
            /* best-effort */
          });
      }
      return source.close?.() as any;
    };

    // setEventSink: capture for cache events + delegate to source
    this.setEventSink = (sink: AFSEventSink | null) => {
      this.eventSink = sink;
      source.setEventSink?.(sink);
    };

    if (source.setSecretCapability) {
      this.setSecretCapability = (cap: SecretCapability | null) => source.setSecretCapability!(cap);
    }

    // onMount: delegate to source + register scheduler cron if refreshInterval
    this.onMount = (root: AFSRoot, mountPath?: string) => {
      source.onMount?.(root, mountPath);
      this.root = root;
      this.mountPath = mountPath;
      if (this.refreshInterval > 0 && root.exec && mountPath) {
        root
          .exec(
            "/scheduler/.actions/schedule",
            {
              name: `cache-refresh:${mountPath}`,
              cron: intervalToCron(this.refreshInterval),
              task: joinURL(mountPath, ".actions/refresh"),
              args: {},
            },
            {} as AFSExecOptions,
          )
          .catch(() => {
            /* scheduler not mounted — silent */
          });
      }
    };
  }

  // ── Core cache logic ──────────────────────────────────────────────

  /** Resolve effective policy for a path (pathPolicy first-match, fallback to parent). */
  private resolvePolicy(path: string): CachePolicy {
    if (!this.policy.pathPolicy?.length) return this.policy;
    for (const rule of this.policy.pathPolicy) {
      if (minimatch(path, rule.pattern)) {
        return rule.policy;
      }
    }
    return this.policy;
  }

  private getCacheKey(op: string, path: string, options?: unknown): string {
    if (this.policy.cacheKey) {
      return this.policy.cacheKey(op, path, options);
    }
    return defaultCacheKey(op, path, options);
  }

  private async cachedOp<T>(
    op: string,
    path: string,
    options: unknown,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const key = this.getCacheKey(op, path, options);

    // Try store read (pass path for pathPolicy resolution)
    const hit = await this.tryStoreRead(key, op, path);
    if (hit !== undefined) {
      this.stats.hits++;
      this.emitEvent("cache:hit", path, { operation: op, age: Date.now() - (hit.cachedAt ?? 0) });
      return hit.data as T;
    }

    // Cache miss — use request coalescing
    this.stats.misses++;
    this.emitEvent("cache:miss", path, { operation: op, reason: "not-found" });
    return this.coalescedFetch(key, op, path, fetcher);
  }

  private async tryStoreRead(
    key: string,
    _op: string,
    path?: string,
  ): Promise<{ data: unknown; cachedAt: number } | undefined> {
    try {
      if (!this.store.read) return undefined;
      const result = await this.store.read(key);
      if (!result?.data) return undefined;

      const envelope = parseEnvelope(result.data);
      if (!envelope) return undefined;

      const entry = {
        cachedAt: envelope.cachedAt,
        path: envelope.path,
        operation: envelope.operation,
        meta: undefined,
      };

      // Use path-specific policy (pathPolicy first-match) or parent policy
      const effectivePolicy = path ? this.resolvePolicy(path) : this.policy;
      if (!effectivePolicy.isValid(entry)) return undefined;

      return { data: envelope.data, cachedAt: envelope.cachedAt };
    } catch {
      // Store read failure → graceful degradation (treat as miss)
      return undefined;
    }
  }

  private async coalescedFetch<T>(
    key: string,
    op: string,
    path: string,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    // Request coalescing: if an identical fetch is in-flight, reuse it
    const existing = this.inflight.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = (async () => {
      try {
        const result = await fetcher();
        // Best-effort async store write
        this.storeWrite(key, op, path, result);
        return result;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, promise);
    return promise;
  }

  private storeWrite(key: string, op: string, path: string, data: unknown): void {
    if (!this.store.write) return;
    const envelope = makeEnvelope(op, path, data);
    try {
      // Fire-and-forget: don't await, don't propagate errors
      this.store
        .write(key, { content: JSON.stringify(envelope) } as any)
        .then(() => {
          this.stats.entries++;
        })
        .catch(() => {
          // Best-effort: silent failure
        });
    } catch {
      // Sync error during write initiation — ignore
    }
  }

  /** Emit a cache event through the event sink (fire-and-forget). */
  private emitEvent(type: string, path: string, data: Record<string, unknown>): void {
    if (!this.eventSink) return;
    try {
      this.eventSink({ type, path, data });
    } catch {
      // fire-and-forget
    }
  }

  private invalidateByPath(path: string): void {
    if (!this.store.delete) return;
    for (const op of this.cachedOps) {
      const baseKey = defaultCacheKey(op, path);
      // Delete exact key (no options)
      this.store.delete(baseKey).catch(() => {});
      // Best-effort: scan for options-variant keys (e.g., read/path?{"recursive":true})
      if (this.store.list) {
        this.store
          .list(baseKey)
          .then((result) => {
            for (const entry of (result?.data ?? []) as Array<{ path?: string; id?: string }>) {
              const key = entry.path ?? entry.id;
              if (key && key !== baseKey && key.startsWith(`${baseKey}?`)) {
                this.store.delete!(key).catch(() => {});
              }
            }
          })
          .catch(() => {});
      }
    }
  }

  // ── Injected actions ──────────────────────────────────────────────

  private async handleAction(action: string, args: Record<string, any>): Promise<AFSExecResult> {
    switch (action) {
      case "refresh":
        await this.clearStore();
        // If source also has a refresh action, call it
        if (this.source.exec) {
          try {
            await this.source.exec("/.actions/refresh", args, {} as AFSExecOptions);
          } catch {
            // Source refresh is best-effort
          }
        }
        return { success: true, data: { message: "Cache cleared, next read will re-fetch" } };

      case "invalidate":
        await this.clearStore();
        return { success: true, data: { message: "Cache invalidated" } };

      case "cache-status":
        return {
          success: true,
          data: {
            hits: this.stats.hits,
            misses: this.stats.misses,
            entries: this.stats.entries,
            hitRate:
              this.stats.hits + this.stats.misses > 0
                ? this.stats.hits / (this.stats.hits + this.stats.misses)
                : 0,
            operations: [...this.cachedOps],
            refreshInterval: this.refreshInterval || undefined,
          },
        };

      default:
        return {
          success: false,
          error: { code: "UNKNOWN_ACTION", message: `Unknown action: ${action}` },
        };
    }
  }

  private async clearStore(): Promise<void> {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.entries = 0;
    if (this.store.delete) {
      try {
        await this.store.delete("/");
      } catch {
        // Best-effort
      }
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Convert a refresh interval (seconds) to a cron expression.
 * - < 60s → every minute ("* * * * *")
 * - 60–3599s → every N minutes
 * - 3600–86399s → every N hours (on the hour)
 * - >= 86400s → daily at 3am UTC
 */
export function intervalToCron(seconds: number): string {
  if (seconds < 60) return "* * * * *";
  if (seconds < 3600) {
    const minutes = Math.round(seconds / 60);
    return minutes === 1 ? "* * * * *" : `*/${minutes} * * * *`;
  }
  if (seconds < 86400) {
    const hours = Math.round(seconds / 3600);
    return hours === 1 ? "0 * * * *" : `0 */${hours} * * *`;
  }
  return "0 3 * * *";
}

function extractActionName(path: string): string | null {
  const match = path.match(/\/?\.actions\/(.+)/);
  return match?.[1] ?? null;
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Wrap an AFS Provider with transparent caching.
 *
 * @param source The provider to cache
 * @param options Cache configuration (store, policy)
 * @returns A new AFSModule that caches read/list/stat operations
 *
 * @example
 * ```typescript
 * // Zero-config: memory store + ttl(3600)
 * afs.mount(cached(provider));
 *
 * // Custom store and policy
 * afs.mount(cached(provider, {
 *   store: sqliteProvider,
 *   policy: ttl(300),
 * }));
 * ```
 */
export function cached(source: AFSModule, options?: CachedOptions): AFSModule {
  return new CachedProvider(source, options);
}
