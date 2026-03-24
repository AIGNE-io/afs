/**
 * Multi-tenant resource types.
 *
 * All types are pure interfaces — no runtime dependencies.
 * Implementations live in the runtime entry (Workers, Node, etc.).
 */

import type { AFSModule } from "../type.js";

/**
 * Per-request context identifying the tenant/resource being served.
 * Created by resolveResourceContext() from the incoming request domain.
 */
export interface ResourceContext {
  /** Opaque resource identifier (human-readable today, DID-ready tomorrow). */
  resourceId: string;
  /** The domain from the incoming request. */
  domain: string;
  /** Mount configuration for this resource. */
  config: ResourceConfig;
}

/**
 * Configuration for a single resource's AFS mount tree.
 * Stored in ConfigStore (KV in Workers, JSON file in Node).
 */
export interface ResourceConfig {
  /** Storage key prefix — isolates this resource's data in shared buckets/namespaces. */
  storagePrefix: string;
  /** Provider mount declarations. */
  mounts: Array<{
    /** AFS mount path (e.g., "/content", "/cache"). */
    path: string;
    /** Provider type name (e.g., "r2", "kv", "fs"). */
    provider: string;
    /** Provider-specific options. */
    options: Record<string, unknown>;
  }>;
  /** AUP session settings (optional). */
  aup?: { enabled: boolean; maxSessions?: number };
  /** Resource quotas (optional). */
  quota?: { storageBytes?: number; requestsPerDay?: number };
}

/**
 * Resolves a hostname to a resourceId.
 * Workers: KV lookup.  Node: JSON file / in-memory map.
 */
export interface AliasResolver {
  resolve(host: string): Promise<string | null>;
}

/**
 * Retrieves ResourceConfig by resourceId.
 * Workers: KV.  Node: JSON file / in-memory map.
 */
export interface ConfigStore {
  get(resourceId: string): Promise<ResourceConfig | null>;
}

/**
 * Creates an AFSModule from a provider type name and merged options.
 * The runtime entry provides this — it knows which provider classes are available.
 */
export type ResourceProviderFactory = (
  provider: string,
  options: Record<string, unknown>,
) => AFSModule;
