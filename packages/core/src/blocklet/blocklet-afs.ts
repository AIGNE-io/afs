/**
 * Blocklet AFS — factory for creating isolated Runtime AFS namespaces.
 */

import { joinURL } from "ufo";
import { AFS, type MountInfo } from "../afs.js";
import type { AFSModule, AFSRoot, MountConfig } from "../type.js";
import { parseBlockletManifest } from "./parse-manifest.js";
import { ProjectionProvider } from "./projection-provider.js";
import type { BlockletManifest } from "./types.js";

/**
 * Escape a blocklet ID for use as a filesystem directory name.
 *
 * Safe set: `[a-zA-Z0-9-]` — everything else (including `_`, `:`, `.`, `%`)
 * is hex-encoded as `_XX` where XX is the lowercase hex char code.
 *
 * Because `_` itself is not in the safe set, the `_XX` pattern is unambiguous
 * and the encoding is reversible via {@link unescapeId}.
 *
 * Guarantees:
 * - Result contains only `[a-zA-Z0-9_-]` (filesystem-safe)
 * - No `..`, `/`, `\`, or null bytes in output
 * - Injective: different inputs → different outputs
 * - `unescapeId(escapeId(x)) === x` for all strings x
 * - Non-idempotent (like URL encoding): do not double-encode
 */
export function escapeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9-]/g, (ch) => `_${ch.charCodeAt(0).toString(16).padStart(2, "0")}`);
}

/**
 * Reverse {@link escapeId}: decode `_XX` hex sequences back to original characters.
 */
export function unescapeId(escaped: string): string {
  return escaped.replace(/_([0-9a-f]{2})/g, (_, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

/**
 * Migrate a legacy escaped ID (old `escapeId` that only replaced `:` → `_`)
 * to the new hex-encoding format.
 *
 * Reverses the old escaping (underscore → colon), then re-escapes with the new logic.
 */
export function migrateLegacyId(legacyEscaped: string): string {
  return escapeId(legacyEscaped.replaceAll("_", ":"));
}

/**
 * Derive a filesystem-safe instance ID from a mount path.
 * Strips leading `/`, replaces `/` with `_`.
 */
export function instanceIdFromMountPath(mountPath: string): string {
  return mountPath.replace(/^\//, "").replaceAll("/", "_");
}

/**
 * A user-side mount override from mounts.toml.
 * Provides a complete URI and optional extra options for a mount target.
 */
export interface MountOverride {
  /** Mount target path — must match a mount declaration's target in blocklet.yaml */
  target: string;
  /** Complete URI (overrides the placeholder URI in blocklet.yaml) */
  uri: string;
  /** Additional provider options to merge into mount config */
  options?: Record<string, unknown>;
}

/**
 * Options for createBlockletAFS.
 */
export interface CreateBlockletAFSOptions {
  /**
   * Factory function for creating providers from mount configs.
   * Handles credential resolution + provider instantiation.
   * Used for owned mounts (shared: false) and as fallback for shared mounts
   * whose URI isn't found in the host AFS.
   */
  createProvider?: (mount: MountConfig) => Promise<AFSModule>;
  /**
   * User-side mount overrides from mounts.toml.
   * Each override replaces the URI (and optionally adds options) for a matching
   * mount target declared in blocklet.yaml.
   */
  mountOverrides?: MountOverride[];
  /**
   * Factory to create the /data provider from a filesystem directory path.
   * When provided, the dataDir parameter is a filesystem path and this factory
   * creates the provider. When not provided, dataDir is treated as an AFS
   * virtual path and uses ProjectionProvider (legacy behavior).
   */
  createDataProvider?: (dataDir: string) => AFSModule | Promise<AFSModule>;
  /**
   * Called when a new provider is dynamically mounted at runtime via /.actions/mount.
   * Used to persist the mount to mounts.toml so it survives restarts.
   */
  onMountAdded?: (override: MountOverride) => Promise<void>;
  /**
   * Pre-parsed manifest — when provided, skips reading and parsing blocklet.yaml
   * from the host AFS. Useful when the caller has already parsed the manifest
   * (e.g., for blocklet type detection) and wants to avoid redundant I/O + validation.
   */
  manifest?: BlockletManifest;
  /**
   * Factory for creating system service providers (users, settings, audit).
   * When manifest declares `services: [users, settings]`, this factory is called
   * for each service name, and the returned provider is mounted at /sys/{serviceName}.
   */
  createSystemProvider?: (serviceName: string) => Promise<AFSModule | null>;
}

/** @deprecated Use CreateBlockletAFSOptions instead */
export type CreateProgramAFSOptions = CreateBlockletAFSOptions;

/**
 * Find mounts in an AFS instance whose module.uri matches the given URI exactly.
 * Accepts AFS class or any AFSRoot with getMounts() (duck-typed).
 */
export function findMountByURI(afs: AFSRoot | AFS, uri: string): MountInfo[] {
  const getMounts = (afs as AFS).getMounts;
  if (typeof getMounts !== "function") {
    return [];
  }
  return getMounts.call(afs).filter((m: MountInfo) => m.module.uri === uri);
}

/** Strip query params from a URI for safe error messages. */
function safeURI(uri: string): string {
  const qIdx = uri.indexOf("?");
  return qIdx >= 0 ? uri.slice(0, qIdx) : uri;
}

/**
 * Create an isolated Runtime AFS namespace for a blocklet.
 *
 * Mounts:
 * - `/program` → blockletPath (readonly via allowedOps)
 * - `/data` → dataPath (readwrite, no restriction)
 * - `/{target}` → shared: ProjectionProvider wrapping host AFS provider matched by URI
 *                  owned (shared: false): independent provider via createProvider factory
 *
 * @param blockletPath - Path to the blocklet definition directory in the host AFS
 * @param dataPath - Path to the blocklet runtime data directory in the host AFS
 * @param globalAFS - The host AFS instance (must be an AFS class instance for getMounts)
 * @param options - Optional: createProvider factory for owned/fallback mount creation
 * @returns The isolated Runtime AFS, parsed manifest, and owned providers for lifecycle management
 */
export async function createBlockletAFS(
  blockletPath: string,
  dataPath: string,
  globalAFS: AFS,
  options?: CreateBlockletAFSOptions,
): Promise<{
  afs: AFSRoot;
  manifest: BlockletManifest;
  ownedProviders: AFSModule[];
  /** Mount overrides resolved during provider creation (URI/options may differ from blocklet.yaml). */
  resolvedOverrides: MountOverride[];
}> {
  // 1. Use pre-parsed manifest or read and parse blocklet.yaml
  let manifest: BlockletManifest;
  if (options?.manifest) {
    manifest = options.manifest;
  } else {
    let yamlContent = "";
    for (const filename of ["blocklet.yaml", "program.yaml"]) {
      const manifestPath = joinURL(blockletPath, filename);
      try {
        const readResult = await globalAFS.read!(manifestPath);
        const content = String(readResult.data?.content ?? "");
        if (content.trim()) {
          yamlContent = content;
          break;
        }
      } catch {
        // Try next filename
      }
    }
    if (!yamlContent.trim()) {
      throw new Error(`blocklet.yaml at ${blockletPath} is empty or not readable`);
    }
    manifest = parseBlockletManifest(yamlContent);
  }

  // 2. Create new AFS instance
  const blockletAFS = new AFS();
  const ownedProviders: AFSModule[] = [];
  const resolvedOverrides: MountOverride[] = [];

  // Store manifest on the runtime AFS for fast detection in exec()
  (blockletAFS as any)._programManifest = manifest;

  // Allow exec from parent AFS (needed for inject-message, agent-run testing, etc.)
  (blockletAFS as any).accessMode = "readwrite";

  // 3. Mount /program → blockletPath (readonly)
  // Find the original provider to use as sourceModule — avoids circular reference
  // when BlockletManager.activate() later replaces the mount at blockletPath in
  // globalAFS with this runtime AFS.
  const originalProvider = globalAFS
    .getMounts(null)
    .find((m: MountInfo) => m.path === blockletPath)?.module;
  const blockletProvider = new ProjectionProvider({
    name: "program",
    globalAFS,
    sourcePath: blockletPath,
    allowedOps: new Set(["read", "list", "search", "stat", "explain", "exec"]),
    sourceModule: originalProvider,
  });
  await blockletAFS.mount(blockletProvider, "/program", { lenient: true });

  // 4. Mount /data → dataDir (readwrite, no restriction)
  if (options?.createDataProvider) {
    // New path: dataDir is a filesystem path, use factory to create provider
    const dataProvider = await Promise.resolve(options.createDataProvider(dataPath));
    await blockletAFS.mount(dataProvider, "/data", { lenient: true });
  } else {
    // Legacy path: dataDir is an AFS virtual path, use ProjectionProvider
    const dataProvider = new ProjectionProvider({
      name: "data",
      globalAFS,
      sourcePath: dataPath,
    });
    await blockletAFS.mount(dataProvider, "/data", { lenient: true });
  }

  // Helper: create owned provider via factory
  const createOwned = async (
    mountDecl: BlockletManifest["mounts"][0],
    effectiveUri: string,
    extraOptions?: Record<string, unknown>,
  ) => {
    if (!options?.createProvider) {
      if (mountDecl.required) {
        throw new Error(
          `Mount "${mountDecl.target}" (URI: ${safeURI(effectiveUri)}) requires a provider factory, but none was provided.`,
        );
      }
      return false;
    }
    const mountConfig: MountConfig = {
      path: mountDecl.target,
      uri: effectiveUri,
    };
    if (extraOptions && Object.keys(extraOptions).length > 0) {
      mountConfig.options = extraOptions;
    }
    const provider = await options.createProvider(mountConfig);
    ownedProviders.push(provider);
    await blockletAFS.mount(provider, mountDecl.target, { lenient: true });

    // Track resolved override: createProvider may have modified mountConfig.uri
    // (via normalizeURIWithSchemaDefaults / rebuildURIFromTemplate) and added
    // non-sensitive options. Record when URI or options differ from blocklet.yaml.
    if (mountConfig.uri !== mountDecl.uri || mountConfig.options) {
      const override: MountOverride = { target: mountDecl.target, uri: mountConfig.uri };
      if (mountConfig.options && Object.keys(mountConfig.options).length > 0) {
        override.options = { ...mountConfig.options };
      }
      resolvedOverrides.push(override);
    }
    return true;
  };

  // 5. Inject loadProvider so blocklet AFS exposes /.actions/mount
  if (options?.createProvider) {
    const createProviderFn = options.createProvider;
    const onMountAdded = options?.onMountAdded;
    blockletAFS.loadProvider = async (
      uri: string,
      mountPath: string,
      providerOpts?: Record<string, unknown>,
    ) => {
      const mountConfig: MountConfig = { path: mountPath, uri };
      if (providerOpts && Object.keys(providerOpts).length > 0) {
        mountConfig.options = providerOpts;
      }
      const provider = await createProviderFn(mountConfig);
      ownedProviders.push(provider);
      await blockletAFS.mount(provider, mountPath, { replace: true });
      // Persist to mounts.toml — strip internal fields (prefixed with _)
      const override: MountOverride = { target: mountPath, uri: mountConfig.uri };
      if (mountConfig.options) {
        const persistOpts: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(mountConfig.options)) {
          if (!k.startsWith("_")) persistOpts[k] = v;
        }
        if (Object.keys(persistOpts).length > 0) override.options = persistOpts;
      }
      await onMountAdded?.(override);
    };
  }

  // 6. Mount dependencies — shared via ProjectionProvider, owned via factory
  for (const mountDecl of manifest.mounts) {
    const isOwned = mountDecl.shared === false;

    // Apply user-side mount override (from mounts.toml) if available
    const override = options?.mountOverrides?.find((o) => o.target === mountDecl.target);
    // Replace $DATA_DIR / $PROGRAM_DIR placeholders with actual paths
    const effectiveUri = (override?.uri || mountDecl.uri)
      .replace(/\$DATA_DIR/g, dataPath)
      .replace(/\$PROGRAM_DIR/g, blockletPath);

    try {
      if (isOwned) {
        // ── Owned mount: create independent provider via factory ──
        await createOwned(mountDecl, effectiveUri, override?.options);
      } else {
        // ── Shared mount: ProjectionProvider wrapping global AFS ──
        const matches = findMountByURI(globalAFS, effectiveUri);

        if (matches.length === 0) {
          // Fallback: try creating via factory as an owned provider
          let fallbackOk = false;
          let fallbackError: unknown;
          if (options?.createProvider) {
            try {
              await createOwned(mountDecl, effectiveUri, override?.options);
              fallbackOk = true;
            } catch (err) {
              fallbackError = err;
            }
          }
          if (!fallbackOk) {
            if (mountDecl.required) {
              const reason = fallbackError
                ? ` Factory fallback failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
                : "";
              throw new Error(
                `Required mount URI "${safeURI(effectiveUri)}" not found in host AFS.${reason}`,
              );
            }
          }
          continue;
        }

        if (matches.length > 1) {
          throw new Error(
            `Mount conflict: URI "${safeURI(effectiveUri)}" matches ${matches.length} providers in host AFS. Expected exactly 1.`,
          );
        }

        const hostMount = matches[0]!;
        const projection = new ProjectionProvider({
          name: `projection:${mountDecl.target.replace(/^\//, "").replace(/\//g, "-")}`,
          globalAFS,
          sourcePath: hostMount.path,
          // Always include "stat" and "list" — needed by AFS mount system (checkProviderOnMount
          // validates childrenCount via list when stat reports children)
          allowedOps: mountDecl.ops ? new Set([...mountDecl.ops, "stat", "list"]) : undefined,
        });
        await blockletAFS.mount(projection, mountDecl.target, { lenient: true });
      }
    } catch (err) {
      if (mountDecl.required) {
        // Clean up already-created owned providers before re-throwing
        await cleanupOwnedProviders(ownedProviders);
        throw err;
      }
      // optional mount failed, continue
    }
  }

  // 7. Restore extra mounts from mounts.toml not declared in blocklet.yaml
  if (options?.mountOverrides && options.createProvider) {
    const declaredTargets = new Set(manifest.mounts.map((m) => m.target));
    const reservedPaths = new Set(["/program", "/data"]);
    for (const override of options.mountOverrides) {
      if (declaredTargets.has(override.target) || reservedPaths.has(override.target)) continue;
      try {
        const mountConfig: MountConfig = {
          path: override.target,
          uri: override.uri,
          options: override.options,
        };
        const provider = await options.createProvider(mountConfig);
        ownedProviders.push(provider);
        await blockletAFS.mount(provider, override.target, { lenient: true });
      } catch {
        // Extra mount restoration is best-effort — don't block activation
      }
    }
  }

  // Mount system providers (/sys/*) if manifest declares system services and factory is available
  if (manifest.system?.length && options?.createSystemProvider) {
    for (const serviceName of manifest.system) {
      try {
        const provider = await options.createSystemProvider(serviceName);
        if (provider) {
          await blockletAFS.mount(provider, joinURL("/sys", serviceName), { lenient: true });
        }
      } catch {
        // System service injection failure should not block blocklet startup
      }
    }
  }

  return { afs: blockletAFS, manifest, ownedProviders, resolvedOverrides };
}

/** @deprecated Use createBlockletAFS instead */
export const createProgramAFS = createBlockletAFS;

/**
 * Close all owned providers, swallowing individual errors.
 */
async function cleanupOwnedProviders(providers: AFSModule[]): Promise<void> {
  for (const provider of providers) {
    try {
      await provider.close?.();
    } catch {
      // Swallow individual close errors — best-effort cleanup
    }
  }
}
