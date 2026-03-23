/**
 * BlockletManager — manages activation and deactivation of program instances.
 *
 * Discovers program mounts via /programs/ prefix filtering.
 * Activation creates a persistent Runtime AFS, replaces the original mount
 * in the global AFS, and registers EventBus subscriptions and cron jobs
 * for trigger-bearing scripts. Deactivation cleans up everything.
 */

import {
  type AFS,
  type AFSEvent,
  type AFSModule,
  type AFSRoot,
  type BlockletManifest,
  type CreateBlockletAFSOptions,
  createBlockletAFS as defaultCreateProgramAFS,
  instanceIdFromMountPath,
  type MountConfig,
  type MountOverride,
} from "@aigne/afs";
import type {
  BlockletTriggerInfo,
  CompileFn,
  ScriptTriggerInfo,
} from "./blocklet-trigger-scanner.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BlockletMountInfo {
  mountPath: string;
  installPath: string;
  options?: Record<string, unknown>;
}

export interface BlockletManagerDeps {
  /** Global AFS instance — used for mount replacement and EventBus subscriptions */
  globalAFS: AFS;
  /** Optional: factory for creating providers (with credential resolution) */
  createProvider?: (mount: MountConfig) => Promise<AFSModule>;
  /** List program mounts with /programs/ prefix */
  listBlockletMounts: () => Promise<BlockletMountInfo[]>;
  /** Scan triggers in a program directory */
  scanTriggers: (programDir: string) => Promise<BlockletTriggerInfo | null>;
  /** Create Runtime AFS for a program. Default: createBlockletAFS from @aigne/afs */
  createBlockletAFS?: (
    programPath: string,
    dataPath: string,
    globalAFS: AFS,
    options?: CreateBlockletAFSOptions,
  ) => Promise<{
    afs: AFSRoot;
    manifest: BlockletManifest;
    ownedProviders: AFSModule[];
    resolvedOverrides?: MountOverride[];
  }>;
  /** Get data directory path for a mount path */
  dataDir: (mountPath: string) => string;
  /** Optional: callback when a trigger fires */
  onTrigger?: (
    mountPath: string,
    scriptPath: string,
    jobName: string,
    event?: AFSEvent | Record<string, unknown>,
  ) => void;
  /** Optional: read user-side mount overrides from mounts.toml */
  readMountOverrides?: (instanceId: string) => Promise<MountOverride[]>;
  /** Optional: write resolved mount overrides to mounts.toml */
  writeMountOverrides?: (instanceId: string, overrides: MountOverride[]) => Promise<void>;
  /** Optional: factory for creating data providers (e.g. AFSFS for /data mount) */
  createDataProvider?: (dataDir: string) => AFSModule | Promise<AFSModule>;
  /** Optional: ASH compile function for dynamic trigger re-registration */
  compile?: CompileFn;
  /** Optional: called when a blocklet with a domain is activated (DNS/CDN binding). */
  onDomainBind?: (domain: string, blockletId: string) => Promise<void>;
  /** Optional: called when a blocklet with a domain is deactivated (DNS/CDN unbinding). */
  onDomainUnbind?: (domain: string, blockletId: string) => Promise<void>;
}

interface ActivatedBlockletState {
  manifest: BlockletManifest;
  runtimeAFS: AFSRoot;
  ownedProviders: AFSModule[];
}

// ─── Implementation ─────────────────────────────────────────────────────────

export class BlockletManager {
  private activated = new Map<string, ActivatedBlockletState>();
  private reloadLock: Promise<void> | null = null;
  private readonly deps: BlockletManagerDeps;
  /** Global domain → blockletId registry for cross-blocklet uniqueness. */
  private readonly domainRegistry = new Map<string, string>();

  constructor(deps: BlockletManagerDeps) {
    this.deps = deps;
  }

  /** Look up which blocklet owns a domain. Returns undefined if unregistered. */
  getDomainOwner(domain: string): string | undefined {
    return this.domainRegistry.get(domain);
  }

  /** Find an activated blocklet by its manifest id (blocklet name). */
  findActivatedByName(
    name: string,
  ): { mountPath: string; manifest: BlockletManifest; runtimeAFS: AFSRoot } | undefined {
    for (const [mountPath, state] of this.activated) {
      if (state.manifest.id === name) {
        return { mountPath, manifest: state.manifest, runtimeAFS: state.runtimeAFS };
      }
    }
    return undefined;
  }

  /**
   * Resolve a blocklet from a domain string.
   *
   * Lookup order:
   * 1. domainRegistry (production domains like "showcase.aigne.io")
   * 2. Direct blocklet name match (dev convenience — "showcase" matches manifest id)
   */
  resolveBlockletFromDomain(
    domain: string,
  ): { mountPath: string; manifest: BlockletManifest; runtimeAFS: AFSRoot } | undefined {
    // 1. Production domain lookup
    const blockletId = this.domainRegistry.get(domain);
    if (blockletId) {
      return this.findActivatedByName(blockletId);
    }
    // 2. Direct name match
    return this.findActivatedByName(domain);
  }

  /**
   * Activate a single program instance by mount path.
   * Creates Runtime AFS, registers event/cron subscriptions, then replaces
   * the original mount in the global AFS with the Runtime AFS.
   * If already activated, deactivates first then re-activates.
   */
  async activate(mountPath: string): Promise<void> {
    // Find the mount
    const mounts = await this.deps.listBlockletMounts();
    const mount = mounts.find((m) => m.mountPath === mountPath);
    if (!mount) {
      throw new Error(`Mount "${mountPath}" not found in program mounts`);
    }

    // Skip if explicitly disabled
    if (mount.options?.enabled === false) {
      return;
    }

    // If already activated, deactivate first
    if (this.activated.has(mountPath)) {
      await this.deactivate(mountPath);
    }

    // Scan for triggers in both program dir and data dir
    const triggerInfo = await this.deps.scanTriggers(mount.installPath);
    const dataPath = this.deps.dataDir(mountPath);
    const dataTriggers = await this.scanDataTriggers(dataPath, "data/scripts/");

    const allTriggers = [...(triggerInfo?.triggers ?? []), ...dataTriggers];
    const triggerDesc = allTriggers
      .map((t) => `${t.scriptPath}:${t.jobName}(${t.trigger?.kind ?? "?"})`)
      .join(", ");
    console.log(
      `[PM] Scan triggers for "${mountPath}": ${allTriggers.length} found [${triggerDesc}]`,
    );
    if (allTriggers.length === 0 && !triggerInfo) {
      return; // No triggers and no manifest — nothing to activate
    }

    // Create Runtime AFS (before any mount changes — failure preserves original)
    const createAFS = this.deps.createBlockletAFS ?? defaultCreateProgramAFS;
    const instId = instanceIdFromMountPath(mountPath);
    const mountOverrides = (await this.deps.readMountOverrides?.(instId)) ?? [];
    const createAFSOptions: CreateBlockletAFSOptions = {};
    if (this.deps.createProvider) {
      createAFSOptions.createProvider = this.deps.createProvider;
    }
    if (this.deps.createDataProvider) {
      createAFSOptions.createDataProvider = this.deps.createDataProvider;
    }
    if (mountOverrides.length > 0) {
      createAFSOptions.mountOverrides = mountOverrides;
    }
    if (this.deps.writeMountOverrides) {
      const writeOverrides = this.deps.writeMountOverrides;
      createAFSOptions.onMountAdded = async (override) => {
        await writeOverrides(instId, [override]);
      };
    }
    const { afs, manifest, ownedProviders, resolvedOverrides } = await createAFS(
      mountPath,
      dataPath,
      this.deps.globalAFS,
      Object.keys(createAFSOptions).length > 0 ? createAFSOptions : undefined,
    );

    // Register domains from manifest.sites[] — validate all first, then register
    if (manifest.sites) {
      // Phase 1: validate — check ALL domains before registering any
      for (const site of manifest.sites) {
        if (!site.domain) continue;
        const existing = this.domainRegistry.get(site.domain);
        if (existing && existing !== manifest.id) {
          // Clean up the Runtime AFS we just created
          for (const p of ownedProviders) {
            try {
              await p.close?.();
            } catch {
              // Swallow
            }
          }
          throw new Error(
            `Domain conflict: "${site.domain}" is already bound to blocklet "${existing}". ` +
              `Cannot activate blocklet "${manifest.id}".`,
          );
        }
      }
      // Phase 2: register — all validated, safe to commit
      for (const site of manifest.sites) {
        if (!site.domain) continue;
        this.domainRegistry.set(site.domain, manifest.id);
      }
      // Call domain bind callbacks after all domains are registered (no partial state)
      if (this.deps.onDomainBind) {
        const boundDomains: string[] = [];
        try {
          for (const site of manifest.sites) {
            if (site.domain) {
              await this.deps.onDomainBind(site.domain, manifest.id);
              boundDomains.push(site.domain);
            }
          }
        } catch (bindErr) {
          // Rollback: unbind domains that were successfully bound
          for (const domain of boundDomains) {
            try {
              await this.deps.onDomainUnbind?.(domain, manifest.id);
            } catch {
              // Best-effort unbind during rollback
            }
          }
          // Rollback: unregister all domains from registry
          for (const site of manifest.sites) {
            if (site.domain && this.domainRegistry.get(site.domain) === manifest.id) {
              this.domainRegistry.delete(site.domain);
            }
          }
          // Rollback: close owned providers
          for (const p of ownedProviders) {
            try {
              await p.close?.();
            } catch {
              // Swallow — best-effort cleanup
            }
          }
          throw bindErr;
        }
      }
    }

    // Persist resolved mount overrides so future runs use correct URIs
    if (resolvedOverrides?.length && this.deps.writeMountOverrides) {
      try {
        await this.deps.writeMountOverrides(instId, resolvedOverrides);
      } catch {
        // Persistence failure is non-fatal
      }
    }

    // Replace mount in global AFS with Runtime AFS view
    await this.deps.globalAFS.mount(afs as unknown as AFSModule, mountPath, {
      replace: true,
      lenient: true,
    });

    // Store activated state
    this.activated.set(mountPath, {
      manifest,
      runtimeAFS: afs,
      ownedProviders,
    });

    // Register ASH triggers (cron/event) via ASH provider's internal scheduler
    if (afs.exec) {
      try {
        const triggerResult = await afs.exec(
          "/ash/.actions/register-triggers",
          { _runtime_afs: afs, namespace: mountPath },
          {},
        );
        console.log(
          `[PM] Trigger registration for "${mountPath}":`,
          JSON.stringify(triggerResult?.data ?? triggerResult),
        );
      } catch (triggerErr) {
        console.warn(
          `[PM] Trigger registration failed for "${mountPath}":`,
          triggerErr instanceof Error ? triggerErr.message : triggerErr,
        );
      }
    }
  }

  /**
   * Deactivate a program instance by mount path.
   * Cancels subscriptions, stops cron jobs, closes owned providers.
   * No-op if instance is not activated.
   */
  async deactivate(mountPath: string): Promise<void> {
    const state = this.activated.get(mountPath);
    if (!state) return;

    // Remove from map first (prevents re-entrant issues)
    this.activated.delete(mountPath);

    // Remove domain registrations and call unbind callbacks
    if (state.manifest.sites) {
      for (const site of state.manifest.sites) {
        if (site.domain && this.domainRegistry.get(site.domain) === state.manifest.id) {
          this.domainRegistry.delete(site.domain);
          if (this.deps.onDomainUnbind) {
            try {
              await this.deps.onDomainUnbind(site.domain, state.manifest.id);
            } catch {
              // Domain unbind failure is non-fatal
            }
          }
        }
      }
    }

    // Close all owned providers (swallow individual errors)
    for (const provider of state.ownedProviders) {
      try {
        await provider.close?.();
      } catch {
        // Swallow — best-effort cleanup
      }
    }
  }

  /**
   * Activate all program mounts that have triggers.
   * Failures on individual instances are skipped.
   */
  async activateAll(): Promise<void> {
    const mounts = await this.deps.listBlockletMounts();
    for (const mount of mounts) {
      try {
        await this.activate(mount.mountPath);
      } catch (err) {
        console.error(
          `[PM] Failed to activate "${mount.mountPath}":`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  /**
   * Deactivate all currently activated instances.
   */
  async deactivateAll(): Promise<void> {
    const mountPaths = [...this.activated.keys()];
    for (const mp of mountPaths) {
      await this.deactivate(mp);
    }
  }

  /**
   * Reload all programs: deactivateAll + activateAll.
   * Serialized via lock to prevent concurrent reloads.
   */
  async reload(): Promise<void> {
    // Serialize concurrent reload calls
    if (this.reloadLock) {
      await this.reloadLock;
    }

    this.reloadLock = (async () => {
      try {
        await this.deactivateAll();
        await this.activateAll();
      } finally {
        this.reloadLock = null;
      }
    })();

    await this.reloadLock;
  }

  /**
   * Get list of activated mount paths.
   */
  getActivatedBlocklets(): string[] {
    return [...this.activated.keys()];
  }

  /** Scan data directory for .ash scripts with triggers. */
  private async scanDataTriggers(
    dataPath: string,
    prefix = "scripts/",
  ): Promise<ScriptTriggerInfo[]> {
    try {
      const { scanDataScriptTriggers } = await import("./blocklet-trigger-scanner.js");
      return await scanDataScriptTriggers(dataPath, this.deps.compile ?? null, prefix);
    } catch {
      return [];
    }
  }
}
