/**
 * AFS Loader - Lazy loading with parallel tolerant mount
 *
 * Provides loadAFS() for on-demand AFS creation with caching.
 * createAFS() uses Promise.allSettled for parallel provider creation + mount,
 * tolerating individual failures while reporting them to stderr.
 *
 * Integrates 4-step credential resolution:
 * 1. Determine missing fields from provider schema
 * 2. Silent resolution (config > env > credential store)
 * 3. Interactive collection (provider auth() or default collect())
 * 4. Unified persistence (sensitive → credentials.toml, non-sensitive → config options)
 */

import type {
  AFSModule,
  AuthContext,
  MountCacheConfig,
  MountConfig,
  ProviderCacheDeclaration,
} from "@aigne/afs";
import {
  AFS,
  cached,
  createMemoryStore,
  manual,
  ProviderRegistry,
  timeWindow,
  ttl,
} from "@aigne/afs";
import { parseURI } from "@aigne/afs/utils/uri";
import type { CredentialStore } from "../credential/store.js";
import type { BlockletMountInfo } from "../program/blocklet-manager.js";
import {
  extractEnvFromURI,
  mergeStoredCredentials,
  normalizeURIWithSchemaDefaults,
  persistCredentialResult,
  type ResolveCredentialsForMountOptions,
  type ResolveCredentialsForMountResult,
  resolveAndMergeCredentials,
  resolveCredentialsForMount,
} from "./credential-helpers.js";
import { ConfigLoader } from "./loader.js";
import {
  type ConfigMountEntry,
  type PersistScope,
  persistMount,
  unpersistMount,
  updateMountOptions,
} from "./mount-commands.js";

// Re-export credential helpers for backward compatibility
export {
  extractEnvFromURI,
  resolveCredentialsForMount,
  type ResolveCredentialsForMountOptions,
  type ResolveCredentialsForMountResult,
};

// ─── Cache Auto-wrap ─────────────────────────────────────────────────────

/**
 * Build a CachePolicy from provider manifest declaration + config overrides.
 */
function buildPolicy(
  decl: ProviderCacheDeclaration,
  config?: MountCacheConfig,
): import("@aigne/afs").CachePolicy {
  const strategy = decl.strategy;
  const ttlSeconds = config?.ttlSeconds ?? decl.ttlSeconds;
  const operations = config?.operations ?? decl.operations;

  let policy: import("@aigne/afs").CachePolicy;

  switch (strategy) {
    case "ttl":
      policy = ttl(ttlSeconds ?? 3600);
      break;
    case "manual":
      policy = manual();
      break;
    case "time-window":
      policy = timeWindow(decl.granularity ?? "day");
      break;
    default:
      throw new Error(`Unsupported cache strategy: ${strategy}`);
  }

  if (operations) {
    policy = { ...policy, operations: operations as import("@aigne/afs").CachedOperation[] };
  }

  return policy;
}

/**
 * Wrap provider with cached() if manifest declares cache and config doesn't disable it.
 */
function maybeWrapWithCache(
  provider: AFSModule,
  mount: { cache?: MountCacheConfig },
  _registry: ProviderRegistry,
): AFSModule {
  const cacheConfig = mount.cache;

  // Config explicitly disables caching
  if (cacheConfig?.disabled) return provider;

  // Try to get cache declaration from provider manifest
  const ctor = provider.constructor as any;
  let cacheDecl: ProviderCacheDeclaration | undefined;
  if (typeof ctor.manifest === "function") {
    const m = ctor.manifest();
    // manifest() can return array — use first one
    const manifest = Array.isArray(m) ? m[0] : m;
    cacheDecl = manifest?.cache;
  }

  // No manifest cache declaration and no config → skip
  if (!cacheDecl && !cacheConfig) return provider;
  if (!cacheDecl) return provider;

  try {
    const policy = buildPolicy(cacheDecl, cacheConfig);
    // Store: use config store URI if provided, otherwise memory
    const store = createMemoryStore();
    return cached(provider, { store, policy, refreshInterval: cacheDecl.refreshInterval });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[cache] Auto-wrap failed for ${provider.name}: ${msg}`);
    return provider;
  }
}

// ─── Workspace Factory Helper ─────────────────────────────────────────────

/**
 * Register the workspace:// scheme on a ProviderRegistry.
 *
 * Extracted so that both createAFS() and verifyMount() can support
 * workspace URIs. createAFS() overrides this with a richer variant
 * that includes credential resolution.
 */
function registerWorkspaceFactory(registry: import("@aigne/afs").ProviderRegistry): void {
  registry.register("workspace", async (mount, parsed) => {
    const mod = await import("@aigne/afs-workspace" as string);
    const AFSWorkspace = mod.AFSWorkspace ?? mod.default;
    if (!AFSWorkspace) {
      throw new Error(
        "workspace:// scheme requires @aigne/afs-workspace package. Install it with: pnpm add @aigne/afs-workspace",
      );
    }
    return new AFSWorkspace({
      workspacePath: parsed.body,
      registry,
      name: mount.path.slice(1).replace(/\//g, "-") || "workspace",
      description: mount.description,
      accessMode: mount.access_mode,
      ...mount.options,
    });
  });
}

// ─── Types ────────────────────────────────────────────────────────────────

export interface MountProgressEvent {
  total: number;
  completed: number;
  failed: number;
}

export interface MountFailure {
  path: string;
  reason: string;
}

export interface CreateAFSResult {
  afs: AFS;
  failures: MountFailure[];
  /** Mount paths that were successfully loaded from config.toml (excludes code-managed mounts). */
  configMountPaths: string[];
  /** Provider registry with all registered factories (workspace, etc.). */
  registry: import("@aigne/afs").ProviderRegistry;
  /** Blocklet mount entries discovered from config (path starts with /blocklets/). */
  blockletMounts: BlockletMountInfo[];
  /** BlockletStorage when [did_space] is configured. */
  storage?: import("@aigne/afs").BlockletStorage;
}

export interface CreateAFSOptions {
  onProgress?: (event: MountProgressEvent) => void;
  /** Auth context for interactive credential collection (CLI or MCP) */
  authContext?: AuthContext;
  /** Credential store for reading/writing credentials */
  credentialStore?: CredentialStore;
}

// ─── Cache ────────────────────────────────────────────────────────────────

const cacheMap = new Map<string, AFS>();

function cacheKey(cwd: string): string {
  const { resolve } = require("node:path") as typeof import("node:path");
  return resolve(cwd);
}

/**
 * Reset all cached AFS instances (for testing)
 */
export function resetAFSCache(): void {
  cacheMap.clear();
}

/**
 * Load AFS with per-cwd caching — same cwd returns same instance,
 * different cwd creates a separate instance.
 */
export async function loadAFS(cwd: string, options?: CreateAFSOptions): Promise<CreateAFSResult> {
  const key = cacheKey(cwd);
  const cached = cacheMap.get(key);
  if (cached)
    return {
      afs: cached,
      failures: [],
      configMountPaths: [],
      registry: new ProviderRegistry(),
      blockletMounts: [],
    };
  const result = await createAFS(cwd, options);
  cacheMap.set(key, result.afs);
  return result;
}

/**
 * Create AFS instance from config with parallel tolerant mount
 *
 * - All providers are created and mounted in parallel via Promise.allSettled
 * - Individual failures are logged to stderr and skipped (unless onProgress is provided)
 * - If ALL providers fail, throws an error
 * - If no mounts configured, returns empty AFS (no error)
 */
export async function createAFS(cwd: string, options?: CreateAFSOptions): Promise<CreateAFSResult> {
  const loader = new ConfigLoader();
  const { config, mountSources } = await loader.loadWithSources(cwd);
  const authContext = options?.authContext;
  const credentialStore = options?.credentialStore;

  // ── Inject resolveDataDir + createDataProvider + readMountOverrides ──
  // These callbacks enable ad-hoc blocklet execution (execBlockletNode) to use
  // proper filesystem data dirs instead of the legacy /.data virtual path,
  // and to load user-configured mount overrides from mounts.toml.
  const { instanceIdFromMountPath } = await import("@aigne/afs");
  const { join: joinDataPath } = await import("node:path");
  const { homedir: getHomedir } = await import("node:os");
  const {
    existsSync: dataExists,
    readFileSync: readDataFile,
    mkdirSync: mkDataDir,
  } = await import("node:fs");

  const userConfigDataRoot = joinDataPath(getHomedir(), ".afs-config", "data");
  const resolveDataDir = (mountPath: string): string => {
    const instId = instanceIdFromMountPath(mountPath);
    return joinDataPath(userConfigDataRoot, instId);
  };
  const readBlockletMountOverrides = async (
    instId: string,
  ): Promise<import("@aigne/afs").MountOverride[]> => {
    const mountsPath = joinDataPath(userConfigDataRoot, instId, "mounts.toml");
    if (!dataExists(mountsPath)) return [];
    try {
      const { parse } = await import("smol-toml");
      const parsed = parse(readDataFile(mountsPath, "utf-8")) as {
        mounts?: Array<{ path?: string; uri?: string; options?: Record<string, unknown> }>;
      };
      return (parsed.mounts ?? [])
        .filter(
          (m): m is { path: string; uri: string; options?: Record<string, unknown> } =>
            !!m.path && !!m.uri,
        )
        .map((m) => ({ target: m.path, uri: m.uri, options: m.options }));
    } catch {
      return [];
    }
  };
  const writeBlockletMountOverrides = async (
    instId: string,
    overrides: import("@aigne/afs").MountOverride[],
  ): Promise<void> => {
    const mountsDir = joinDataPath(userConfigDataRoot, instId);
    if (!dataExists(mountsDir)) mkDataDir(mountsDir, { recursive: true });
    const { writeFileSync } = await import("node:fs");
    const lines = overrides.map((o) => {
      let s = `[[mounts]]\npath = "${o.target}"\nuri = "${o.uri}"\n`;
      if (o.options)
        s += `\n[mounts.options]\n${Object.entries(o.options)
          .map(([k, v]) => `${k} = ${JSON.stringify(v)}`)
          .join("\n")}\n`;
      return s;
    });
    writeFileSync(joinDataPath(mountsDir, "mounts.toml"), lines.join("\n"), "utf-8");
  };

  // ── DID Space initialization (if [did_space] section exists) ──
  let storage: import("@aigne/afs").BlockletStorage | undefined;
  if (config.did_space) {
    try {
      const { DIDSpace } = await import("@aigne/afs-did-space/local");
      const { DIDSpaceBlockletStorage } = await import("@aigne/afs-did-space/blocklet-storage");
      const didSpace = new DIDSpace({
        rootPath: config.did_space.root_path,
        userDid: config.did_space.user_did,
      });
      storage = new DIDSpaceBlockletStorage({ didSpace });
    } catch {
      // @aigne/afs-did-space not available — fall back to filesystem
    }
  }

  // ── Build trust gate configuration (if [trust] section exists) ──
  let trustOption: { config?: import("@aigne/afs").TrustConfig; issuers?: string[] } | undefined;
  if (config.trust) {
    const trustConfig: import("@aigne/afs").TrustConfig = {
      default: config.trust.default as import("@aigne/afs").TrustConfig["default"],
      overrides: config.trust.overrides as Record<
        string,
        import("@aigne/afs").TrustConfig["default"]
      >,
    };
    // Load trusted issuers from ~/.afs/trusted-issuers/
    let trustedIssuers: string[] = [];
    try {
      const trustPkg = "@aigne/afs-trust";
      const trust: any = await import(trustPkg);
      const { homedir } = await import("node:os");
      trustedIssuers = (await trust.buildTrustedIssuers("", homedir())).filter(Boolean);
    } catch {
      // @aigne/afs-trust not available or no issuers configured — use empty list
    }
    trustOption = { config: trustConfig, issuers: trustedIssuers };
  }

  const afs = new AFS({
    ...(trustOption ? { trust: trustOption } : {}),
    resolveDataDir: storage
      ? (programPath: string) => {
          // DID Space mode: return blocklet ID as the "data dir" token
          const blockletId = programPath.replace(/^\/blocklets\//, "");
          return blockletId;
        }
      : (programPath: string) => resolveDataDir(programPath),
    createDataProvider: storage
      ? async (blockletId: string) => {
          // DID Space mode: create provider from DID Space app data
          const dataAFS = await storage.getDataAFS(blockletId);
          const { ProjectionProvider } = await import("@aigne/afs");
          return new ProjectionProvider({
            name: "data",
            globalAFS: dataAFS,
            sourcePath: "/files",
          });
        }
      : async (dataDir: string) => {
          const { mkdir } = await import("node:fs/promises");
          await mkdir(dataDir, { recursive: true });
          const { AFSFS } = await import("@aigne/afs-fs" as string);
          return new AFSFS({ localPath: dataDir, accessMode: "readwrite", name: "data" });
        },
    readMountOverrides: storage
      ? async (blockletPath: string) => {
          const blockletId = blockletPath.replace(/^\/blocklets\//, "");
          return storage.readMountOverrides(blockletId);
        }
      : async (blockletPath: string) => {
          const instId = instanceIdFromMountPath(blockletPath);
          return readBlockletMountOverrides(instId);
        },
    writeMountOverrides: storage
      ? async (blockletPath, overrides) => {
          const blockletId = blockletPath.replace(/^\/blocklets\//, "");
          await storage.writeMountOverrides(blockletId, overrides);
        }
      : async (blockletPath, overrides) => {
          const instId = instanceIdFromMountPath(blockletPath);
          await writeBlockletMountOverrides(instId, overrides);
        },
  });

  // ── Extract blocklet mounts from config ──
  const blockletMounts: BlockletMountInfo[] = config.mounts
    .filter((m) => m.path.startsWith("/blocklets/"))
    .map((m) => {
      let installPath = m.path;
      try {
        const parsed = parseURI(m.uri);
        if (parsed.scheme === "fs") {
          installPath = parsed.body;
        }
      } catch {
        // Non-fs URI or parse failure — use mount path as fallback
      }
      return {
        mountPath: m.path,
        installPath,
        options: m.options,
      };
    });

  // Create registry — auto-loads built-in providers via manifest-driven resolution.
  // Only workspace needs explicit registration (to break circular deps + inject credential callback).
  const registry = new ProviderRegistry();
  registry.register("workspace", async (mount, parsed) => {
    const mod = await import("@aigne/afs-workspace" as string);
    const AFSWorkspace = mod.AFSWorkspace ?? mod.default;
    if (!AFSWorkspace) {
      throw new Error(
        "workspace:// scheme requires @aigne/afs-workspace package. Install it with: pnpm add @aigne/afs-workspace",
      );
    }
    const { resolve } = await import("node:path");
    const _workspacePath = resolve(parsed.body);
    return new AFSWorkspace({
      workspacePath: parsed.body,
      registry,
      createProvider: async (subMount: MountConfig) => {
        const credResult = await resolveAndMergeCredentials(
          subMount,
          authContext,
          credentialStore,
          registry,
        );
        // Create provider with resolved credentials in mount.options
        const provider = await registry.createProvider(subMount);
        // Persist sensitive credentials to credential store
        if (credResult) {
          await persistCredentialResult(subMount, credResult);
          // Strip sensitive values from mount.options (keep only non-sensitive for config)
          const opts = subMount.options ?? {};
          for (const key of Object.keys(credResult.sensitive)) {
            delete opts[key];
          }
          subMount.options = Object.keys(opts).length > 0 ? opts : undefined;
          // Merge non-sensitive resolved values back
          if (Object.keys(credResult.nonSensitive).length > 0) {
            subMount.options = { ...(subMount.options ?? {}), ...credResult.nonSensitive };
          }
        }
        return provider;
      },
      name: mount.path.slice(1).replace(/\//g, "-") || "workspace",
      description: mount.description,
      accessMode: mount.access_mode,
      ...mount.options,
    });
  });

  // ── Inject provider factory for blocklet mount fallback ──
  // Handles credential resolution + registry creation for blocklet mounts
  // when shared mount URI isn't found in host AFS.
  afs.createProviderFromMount = async (mount) => {
    // Extract dynamic auth context (injected by AUP for browser-based OAuth flows)
    const dynamicAuthContext = mount.options?._authContext as AuthContext | undefined;
    if (dynamicAuthContext && mount.options) delete mount.options._authContext;
    const effectiveAuthContext = dynamicAuthContext ?? authContext;

    // Pre-merge stored credentials into mount.options so that
    // resolveAndMergeCredentials sees them as "known" in Step 1
    // and skips interactive collection when all fields are satisfied.
    // Without this, credentials resolved silently in Step 2b may still
    // leave non-sensitive required fields unresolved if the mount.options
    // from mounts.toml overrides are incomplete.
    if (credentialStore) {
      try {
        const stored = await credentialStore.get(mount.uri);
        if (stored) {
          const opts = mount.options ?? {};
          for (const [key, value] of Object.entries(stored)) {
            if (key.startsWith("env:")) {
              if (!opts.env) opts.env = {};
              (opts.env as Record<string, string>)[key.slice(4)] = value;
            } else if (opts[key] === undefined) {
              opts[key] = value;
            }
          }
          if (Object.keys(opts).length > 0) {
            mount.options = opts;
          }
        }
      } catch {
        // Credential lookup failure is non-fatal
      }
    }

    // Extract _sensitiveArgs before credential resolution (it's an internal annotation)
    const sensitiveArgs = mount.options?._sensitiveArgs as string[] | undefined;
    if (sensitiveArgs && mount.options) delete mount.options._sensitiveArgs;

    const credResult = await resolveAndMergeCredentials(
      mount,
      effectiveAuthContext,
      credentialStore,
      registry,
    );
    const provider = await registry.createProvider(mount);
    // Persist sensitive credentials to credential store
    if (credResult) {
      await persistCredentialResult(mount, credResult);
    }
    // When credResult is null (all fields already known — e.g. AUP form submission),
    // manually persist sensitive fields annotated by _sensitiveArgs
    if (!credResult && credentialStore && sensitiveArgs && sensitiveArgs.length > 0) {
      const sensitiveCreds: Record<string, string> = {};
      for (const field of sensitiveArgs) {
        const val = mount.options?.[field];
        if (val !== undefined && val !== "") sensitiveCreds[field] = String(val);
      }
      if (Object.keys(sensitiveCreds).length > 0) {
        try {
          const existing = await credentialStore.get(mount.uri).catch(() => null);
          await credentialStore.set(mount.uri, { ...existing, ...sensitiveCreds });
        } catch {}
      }
    }

    // Clean up mount.options: strip URI template variables (already encoded in URI)
    // and sensitive fields (persisted in credentials.toml) so that callers recording
    // mount overrides don't persist redundant or sensitive data to mounts.toml.
    if (mount.options) {
      const info = await registry.getProviderInfo(mount.uri);
      if (info?.manifest?.uriTemplate) {
        const { getTemplateVariableNames } = await import("@aigne/afs/utils/uri-template");
        for (const varName of getTemplateVariableNames(info.manifest.uriTemplate)) {
          delete mount.options[varName];
        }
      }
      if (info?.schema) {
        const { getSensitiveFields } = await import("@aigne/afs/utils/schema");
        for (const field of getSensitiveFields(info.schema)) {
          delete mount.options[field];
        }
      }
      if (Object.keys(mount.options).length === 0) {
        mount.options = undefined;
      }
    }

    return provider;
  };

  // ── Inject loadProvider ──
  // Allows agents to mount new providers at runtime via /.actions/mount
  afs.loadProvider = async (uri: string, mountPath: string, options?: Record<string, unknown>) => {
    // Validate URI format before passing to factory
    parseURI(uri);

    // Extract env query params from MCP URIs for secure credential storage
    const { cleanUri: loadConfigUri, envRecord: loadEnvRecord } = extractEnvFromURI(uri);
    const hasLoadEnv = Object.keys(loadEnvRecord).length > 0;

    // Extract known mount-level fields; pass remaining as provider-specific options
    const { accessMode, auth, description, scope, _authContext, ...providerOptions } =
      options ?? {};
    const effectiveLoadAuthContext = (_authContext as AuthContext) ?? authContext;

    // Inject extracted env values into provider options
    if (hasLoadEnv) {
      const existingEnv = (providerOptions.env as Record<string, string>) ?? {};
      providerOptions.env = { ...existingEnv, ...loadEnvRecord };
    }

    const mount: MountConfig = {
      uri,
      path: mountPath,
      access_mode: (accessMode as "readonly" | "readwrite") ?? undefined,
      auth: (auth as string) ?? undefined,
      description: (description as string) ?? undefined,
      options: Object.keys(providerOptions).length > 0 ? providerOptions : undefined,
    };

    const persistScope = (scope as PersistScope) || "cwd";
    let credResult = await resolveAndMergeCredentials(
      mount,
      effectiveLoadAuthContext,
      credentialStore,
      registry,
    );

    {
      const provider = await registry.createProvider(mount);
      await afs.mount(provider, mountPath);
      try {
        // Explicitly await the async health check for fail-fast
        await afs.check(mountPath);
      } catch (mountError) {
        // Health check failed — unmount the broken provider before retry
        afs.unmount(mountPath);
        // Health check failed with silently resolved credentials →
        // retry once with forced interactive collection so user can fix values
        if (credResult === null && effectiveLoadAuthContext) {
          // credResult === null means all fields resolved silently (no interactive collection)
          // Rebuild mount config from scratch for retry
          const retryProviderOptions = { ...providerOptions };
          const retryMount: MountConfig = {
            uri,
            path: mountPath,
            access_mode: (accessMode as "readonly" | "readwrite") ?? undefined,
            auth: (auth as string) ?? undefined,
            description: (description as string) ?? undefined,
            options:
              Object.keys(retryProviderOptions).length > 0 ? retryProviderOptions : undefined,
          };
          credResult = await resolveAndMergeCredentials(
            retryMount,
            effectiveLoadAuthContext,
            credentialStore,
            registry,
            { forceCollect: true },
          );
          const retryProvider = await registry.createProvider(retryMount);
          await afs.mount(retryProvider, mountPath, { replace: true });
          await afs.check(mountPath);
          // Update mount reference for persistence below
          Object.assign(mount, retryMount);
        } else {
          throw mountError;
        }
      }
    }

    // Persist credentials if any were collected
    if (credResult) {
      await persistCredentialResult(mount, credResult);
    }

    // Persist extracted MCP env values to credentials.toml
    if (hasLoadEnv && credentialStore) {
      try {
        const envCreds: Record<string, string> = {};
        for (const [k, v] of Object.entries(loadEnvRecord)) {
          envCreds[`env:${k}`] = v;
        }
        // Merge with any existing sensitive values from credential resolution
        const existing = credResult ? { ...credResult.sensitive } : {};
        await credentialStore.set(loadConfigUri, { ...existing, ...envCreds });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[mount] env credential persistence failed: ${msg}`);
      }
    }

    // Always persist to config after successful mount
    try {
      // Use configUri (env stripped) for config.toml — env values are in credentials.toml
      const entry: ConfigMountEntry = {
        path: mountPath,
        uri: hasLoadEnv ? loadConfigUri : mount.uri,
      };
      if (description) entry.description = description as string;
      if (accessMode) entry.access_mode = accessMode as "readonly" | "readwrite";
      if (auth) entry.auth = auth as string;
      const mergedOptions = { ...providerOptions, ...credResult?.nonSensitive };
      // Strip env from config options — it's in credentials.toml
      if (hasLoadEnv) delete mergedOptions.env;
      if (Object.keys(mergedOptions).length > 0) entry.options = mergedOptions;
      await persistMount(cwd, entry, persistScope);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[mount] config persistence failed: ${msg}`);
    }
  };

  // ── Inject unloadProvider ──
  // Removes mount config when provider is unmounted via /.actions/unmount
  afs.unloadProvider = async (mountPath: string, options?: Record<string, unknown>) => {
    try {
      await unpersistMount(cwd, mountPath, (options?.scope as PersistScope) || undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[unmount] config removal failed: ${msg}`);
    }
  };

  // ── Inject updateProviderConfig ──
  // Allows providers to persist option changes back to their config file
  afs.updateProviderConfig = async (mountPath: string, optionUpdates: Record<string, unknown>) => {
    try {
      const key = `:${mountPath}`;
      const configDir = mountSources.get(key);
      if (!configDir) return;
      await updateMountOptions(configDir, mountPath, optionUpdates);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[updateProviderConfig] failed: ${msg}`);
    }
  };

  // ── Auto-mount Registry (tolerant — silent on failure) ──
  // Scans locally installed @aigne/afs-* packages at runtime.
  if (config.registry?.enabled !== false) {
    try {
      const { AFSRegistry } = await import("@aigne/afs-registry");
      const registry = new AFSRegistry(
        config.registry?.providers?.length
          ? { providers: config.registry.providers as any[] }
          : undefined,
      );
      await afs.mount(registry, "/registry");
    } catch {
      // Silent degradation — registry is optional
    }
  }

  if (config.mounts.length === 0) {
    return { afs, failures: [], configMountPaths: [], registry, blockletMounts, storage };
  }

  const total = config.mounts.length;
  let completed = 0;
  let failedCount = 0;

  options?.onProgress?.({ total, completed: 0, failed: 0 });

  // Normalize mount URIs (fill template defaults) so credential lookups use canonical keys.
  // e.g., aignehub:// → aignehub://hub.aigne.io (when host defaults to hub.aigne.io)
  await Promise.all(
    config.mounts.map(async (mount) => {
      try {
        const info = await registry.getProviderInfo(mount.uri);
        if (info?.manifest) {
          normalizeURIWithSchemaDefaults(mount, info.manifest, info.schema);
        }
      } catch {
        // Provider info unavailable — skip normalization
      }
    }),
  );

  // Load stored credentials keyed by URI
  if (credentialStore && mountSources.size > 0) {
    await mergeStoredCredentials(config.mounts, mountSources, credentialStore);
  }

  const results = await Promise.allSettled(
    config.mounts.map(async (mount) => {
      let provider = await registry.createProvider(mount);
      provider = maybeWrapWithCache(provider, mount, registry);
      await afs.mount(provider, mount.path, { namespace: mount.namespace ?? null });
      completed++;
      options?.onProgress?.({ total, completed, failed: failedCount });
      return mount.path;
    }),
  );

  const failures: MountFailure[] = [];
  const succeeded: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    if (result.status === "fulfilled") {
      succeeded.push(result.value);
    } else {
      const reason = result.reason;
      const msg = reason instanceof Error ? reason.message : String(reason);
      failures.push({ path: config.mounts[i]!.path, reason: msg });
      failedCount++;
      completed++;
      options?.onProgress?.({ total, completed, failed: failedCount });
    }
  }

  // When onProgress is provided, the caller handles display; otherwise log to stderr
  if (!options?.onProgress && failures.length > 0) {
    console.warn(`[mount] ${succeeded.length} succeeded, ${failures.length} failed:`);
    for (const f of failures) {
      console.warn(`  - ${f.path}: ${f.reason}`);
    }
  }

  if (succeeded.length === 0 && config.mounts.length > 0) {
    throw new Error("All providers failed to mount");
  }

  // Subscribe to credential-updated events from providers (e.g., OAuth token refresh)
  // and persist updated credentials to the credential store.
  if (credentialStore) {
    const mountsByPath = new Map(config.mounts.map((m) => [m.path, m.uri]));
    afs.subscribe({ type: "credential-updated" }, (event) => {
      if (!event.data) return;
      // Prefer explicit URI from event data (set by provider, survives event bubbling
      // through nested AFS instances where path-based matching would find the wrong mount)
      let uri: string | undefined = (event.data as Record<string, unknown>).uri as
        | string
        | undefined;
      if (!uri) {
        // Fallback: find mount URI by matching event path prefix against known mount paths
        for (const [mountPath, mountUri] of mountsByPath) {
          if (event.path === mountPath || event.path.startsWith(`${mountPath}/`)) {
            uri = mountUri;
            break;
          }
        }
      }
      if (!uri) return;
      // Merge with existing credentials (don't overwrite clientId, clientSecret, etc.)
      // Strip `uri` from data — it's a routing hint, not a credential field.
      const { uri: _uri, ...credentialData } = event.data as Record<string, string>;
      credentialStore
        .get(uri)
        .then((existing) => credentialStore.set(uri!, { ...existing, ...credentialData }))
        .catch(() => {});
    });
  }

  return { afs, failures, configMountPaths: succeeded, registry, blockletMounts, storage };
}

// ─── Mount Verification ───────────────────────────────────────────────────────

/**
 * Verify that a mount configuration produces a working provider.
 *
 * Creates the provider and mounts it on a temporary AFS instance,
 * which triggers the built-in checkProviderOnMount (stat + data validation + list).
 * Throws if the mount check fails.
 *
 * @param uri - Provider URI
 * @param mountPath - Mount path
 * @param options - Merged options (non-sensitive + sensitive) for provider creation
 */
export async function verifyMount(
  uri: string,
  mountPath: string,
  options?: Record<string, unknown>,
): Promise<void> {
  const mount: MountConfig = {
    uri,
    path: mountPath,
    options: options && Object.keys(options).length > 0 ? options : undefined,
  };

  const registry = new ProviderRegistry();
  registerWorkspaceFactory(registry);
  let provider: AFSModule;
  try {
    provider = await registry.createProvider(mount);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Mount verification failed (provider creation): ${msg}`);
  }

  // Mount on a temporary AFS and explicitly check health
  try {
    const { AFS } = await import("@aigne/afs");
    const tempAFS = new AFS();
    await tempAFS.mount(provider, mountPath);
    await tempAFS.check(mountPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Mount verification failed: could not reach provider at ${uri}. ` +
        `Error: ${msg}. Check your URI and credentials.`,
    );
  } finally {
    // Clean up provider resources (e.g., MCP process)
    try {
      await provider.close?.();
    } catch {
      // ignore cleanup errors
    }
  }
}
