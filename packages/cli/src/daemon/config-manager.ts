/**
 * ConfigManager Implementation
 *
 * Manages config.toml read/write operations for the daemon.
 * Implements the ConfigManager interface from @aigne/afs-explorer.
 */

import { type FSWatcher, watch } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AFS } from "@aigne/afs";
import { ProviderRegistry } from "@aigne/afs";
import type { ConfigManager } from "@aigne/afs-explorer";
import { parse, stringify } from "smol-toml";
import { ConfigLoader } from "../config/loader.js";
import type { MountConfig } from "../config/schema.js";

export interface MountFailure {
  path: string;
  uri: string;
  reason: string;
}

export interface ConfigManagerOptions {
  /** Working directory for config resolution. */
  cwd: string;
  /** AFS instance to mount/unmount providers on. */
  afs: AFS;
  /** Provider registry for creating providers at runtime (e.g. add-mount). */
  registry?: ProviderRegistry;
  /** Mount paths that came from config.toml at startup (only these are unmounted on reload). */
  configMountPaths?: string[];
  /** Initial mount failures from startup. */
  failures?: MountFailure[];
  /** Callback when config changes are detected (for WS broadcast). */
  onConfigChanged?: (added: string[], removed: string[]) => void;
}

interface ConfigMountEntry {
  path: string;
  uri: string;
  namespace?: string;
  description?: string;
  access_mode?: "readonly" | "readwrite";
  auth?: string;
  token?: string;
  options?: Record<string, unknown>;
}

export class DaemonConfigManager implements ConfigManager {
  private cwd: string;
  private afs: AFS;
  private onConfigChanged?: (added: string[], removed: string[]) => void;
  private watcher?: FSWatcher;
  private _selfWriteTimestamp = 0;
  private _debounceTimer?: ReturnType<typeof setTimeout>;
  private _failures: MountFailure[] = [];
  /** Tracks mount paths that originated from config.toml. Only these are eligible for unmount on reload. */
  private configManagedPaths: Set<string>;
  private registry?: ProviderRegistry;

  constructor(options: ConfigManagerOptions) {
    this.cwd = options.cwd;
    this.afs = options.afs;
    this.registry = options.registry;
    this.onConfigChanged = options.onConfigChanged;
    this.configManagedPaths = new Set(options.configMountPaths ?? []);
    if (options.failures) this._failures = [...options.failures];
  }

  async getConfig(): Promise<unknown> {
    const loader = new ConfigLoader();
    return loader.load(this.cwd);
  }

  async getMountList(): Promise<{ mounts: unknown[]; failures: unknown[] }> {
    const mounts = this.afs.getMounts();
    const mountInfos = await Promise.all(
      mounts.map(async (m) => {
        const ctor = m.module.constructor as unknown as Record<string, unknown>;
        const manifest =
          typeof ctor.manifest === "function" ? (ctor.manifest() as Record<string, unknown>) : null;

        // Try to get URL from provider meta (e.g. UI providers with web servers)
        let url: string | undefined;
        try {
          if (typeof m.module.stat === "function") {
            const statResult = await m.module.stat("/", {});
            url = (statResult?.data?.meta?.url as string) || undefined;
          }
        } catch {
          // Provider may not support stat — ignore
        }

        return {
          namespace: m.namespace,
          path: m.path,
          name: m.module.name,
          description: m.module.description,
          accessMode: m.module.accessMode,
          category: (manifest?.category as string) || undefined,
          tags: (manifest?.tags as string[]) || undefined,
          uri: (manifest?.uriTemplate as string) || undefined,
          url,
        };
      }),
    );
    return { mounts: mountInfos, failures: this._failures };
  }

  async addMount(mount: Record<string, unknown>): Promise<void> {
    const uri = mount.uri as string;
    const path = mount.path as string;
    if (!uri || !path) throw new Error("uri and path are required");

    // Build mount config with credential resolution (env, store, auth→field mapping)
    const mountConfig = await this.buildMountWithCredentials(
      uri,
      path,
      mount.auth as string | undefined,
      {
        description: mount.description as string | undefined,
        access_mode: mount.accessMode as "readonly" | "readwrite" | undefined,
        namespace: mount.namespace as string | undefined,
        options: mount.options as Record<string, unknown> | undefined,
      },
    );

    const registry = this.registry ?? new ProviderRegistry();
    const provider = await registry.createProvider(mountConfig);
    await this.afs.mount(provider, path, {
      namespace: mountConfig.namespace ?? null,
    });

    // Persist to config.toml and track as config-managed
    await this.persistAddMount(mountConfig);
    this.configManagedPaths.add(path);
  }

  async removeMount(path: string): Promise<void> {
    // Unmount from AFS
    this.afs.unmount(path);

    // Remove from config.toml and stop tracking
    await this.persistRemoveMount(path);
    this.configManagedPaths.delete(path);
  }

  async updateMount(path: string, updates: Record<string, unknown>): Promise<void> {
    // Update config.toml
    const config = await this.readConfigFile();
    const mounts = (config.mounts as ConfigMountEntry[]) ?? [];
    const entry = mounts.find((m) => m.path === path);
    if (!entry) throw new Error(`Mount "${path}" not found in config`);

    if (updates.description !== undefined) entry.description = updates.description as string;
    if (updates.accessMode !== undefined)
      entry.access_mode = updates.accessMode as "readonly" | "readwrite";
    if (updates.auth !== undefined) entry.auth = updates.auth as string;

    await this.writeConfigFile(config);

    // Re-mount with updated config: unmount + remount
    try {
      this.afs.unmount(path);
    } catch {
      // May not be mounted
    }

    const mount = await this.buildMountWithCredentials(entry.uri, entry.path, entry.auth, {
      description: entry.description,
      access_mode: entry.access_mode,
      namespace: entry.namespace,
      options: entry.options,
    });

    const registry = new ProviderRegistry();
    const provider = await registry.createProvider(mount);
    await this.afs.mount(provider, path, {
      namespace: entry.namespace ?? null,
    });
  }

  async testMount(
    uri: string,
    auth?: string,
  ): Promise<{ success: boolean; error?: string; providerName?: string }> {
    try {
      const registry = new ProviderRegistry();
      const mount = await this.buildMountWithCredentials(uri, "/test", auth);
      const provider = await registry.createProvider(mount);

      // Try listing root to verify connection
      await provider.list!("/", {});
      const providerName = provider.name;

      // Clean up
      try {
        await provider.close?.();
      } catch {
        // ignore
      }

      return { success: true, providerName };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async reloadConfig(): Promise<void> {
    const loader = new ConfigLoader();
    const newConfig = await loader.load(this.cwd);

    const currentMounts = new Set(this.afs.getMounts().map((m) => m.path));
    const newMountPaths = new Set(newConfig.mounts.map((m) => m.path));

    // Find removed mounts — only check config-managed paths (leave code-managed providers untouched)
    const removed: string[] = [];
    for (const path of this.configManagedPaths) {
      if (!newMountPaths.has(path)) {
        try {
          this.afs.unmount(path);
          removed.push(path);
        } catch {
          // ignore
        }
        this.configManagedPaths.delete(path);
      }
    }

    // Find added mounts
    const added: string[] = [];
    const registry = new ProviderRegistry();
    for (const mount of newConfig.mounts) {
      if (!currentMounts.has(mount.path)) {
        try {
          const provider = await registry.createProvider(mount);
          await this.afs.mount(provider, mount.path, {
            namespace: mount.namespace ?? null,
          });
          added.push(mount.path);
          this.configManagedPaths.add(mount.path);
        } catch (err) {
          console.warn(
            `[reload] Failed to mount ${mount.path}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    if (this.onConfigChanged && (added.length > 0 || removed.length > 0)) {
      this.onConfigChanged(added, removed);
    }
  }

  /**
   * Start watching config file for external changes.
   */
  startWatching(): void {
    const configPath = this.getConfigPath();
    try {
      this.watcher = watch(dirname(configPath), (_event, filename) => {
        if (filename !== "config.toml") return;

        // Skip self-write events
        if (Date.now() - this._selfWriteTimestamp < 500) return;

        // Debounce
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
          this.reloadConfig().catch((err) => {
            console.warn(
              `[watch] Reload failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
        }, 300);
      });
    } catch {
      // fs.watch may not be supported
    }
  }

  async getRegistry(): Promise<
    Array<{
      name: string;
      description: string;
      category: string;
      uriTemplate: string;
      tags?: string[];
      packageName?: string;
    }>
  > {
    try {
      const { scanInstalledProviders } = await import("@aigne/afs-registry");
      const manifests = await scanInstalledProviders();
      return manifests.map((m) => ({
        name: m.name,
        description: m.description,
        category: m.category,
        uriTemplate: m.uriTemplate,
        tags: m.tags,
      }));
    } catch {
      return [];
    }
  }

  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = undefined;
    }
  }

  // ── Private helpers ──

  /**
   * Build a MountConfig with proper credential mapping.
   *
   * Uses the provider schema to:
   * 1. Resolve credentials from env vars (e.g. AIGNE_HUB_API_KEY)
   * 2. Resolve credentials from the credential store (vault)
   * 3. Map generic `auth` to the provider's specific credential field (e.g. apiKey)
   */
  private async buildMountWithCredentials(
    uri: string,
    path: string,
    auth?: string,
    extra?: {
      description?: string;
      access_mode?: "readonly" | "readwrite";
      namespace?: string;
      options?: Record<string, unknown>;
    },
  ): Promise<MountConfig> {
    const mount: MountConfig = {
      uri,
      path,
      auth,
      description: extra?.description,
      access_mode: extra?.access_mode,
      namespace: extra?.namespace,
      options: extra?.options ? { ...extra.options } : undefined,
    };

    try {
      const registry = new ProviderRegistry();
      const info = await registry.getProviderInfo(uri);
      if (!info?.schema) return mount;

      const { getSensitiveFields, resolveEnvFromSchema } = await import("@aigne/afs/utils/schema");
      const opts = mount.options ?? {};

      // Step 1: Resolve env vars declared in schema (e.g. AIGNE_HUB_API_KEY → apiKey)
      const envResolved = resolveEnvFromSchema(info.schema);
      for (const [field, value] of Object.entries(envResolved)) {
        if (opts[field] === undefined) {
          opts[field] = value;
        }
      }

      // Step 2: Resolve from credential store
      try {
        const { createCredentialStore } = await import("../credential/store.js");
        const store = createCredentialStore();
        const stored = await store.get(uri);
        if (stored) {
          for (const [field, value] of Object.entries(stored)) {
            if (!field.startsWith("env:") && opts[field] === undefined) {
              opts[field] = value;
            }
          }
        }
      } catch {
        // Credential store unavailable — continue
      }

      // Step 3: Map generic auth → provider's sensitive credential field
      // e.g. auth token → apiKey for aignehub, token for github
      if (auth) {
        const sensitiveFields = getSensitiveFields(info.schema);
        for (const field of sensitiveFields) {
          if (field !== "auth" && field !== "token" && opts[field] === undefined) {
            opts[field] = auth;
            break;
          }
        }
      }

      if (Object.keys(opts).length > 0) {
        mount.options = opts;
      }
    } catch {
      // Schema resolution failed — return mount as-is
    }

    return mount;
  }

  private getConfigPath(): string {
    return join(this.cwd, ".afs-config", "config.toml");
  }

  private async readConfigFile(): Promise<Record<string, unknown>> {
    const configPath = this.getConfigPath();
    try {
      const content = await readFile(configPath, "utf-8");
      return parse(content) as Record<string, unknown>;
    } catch {
      return { mounts: [] };
    }
  }

  private async writeConfigFile(config: Record<string, unknown>): Promise<void> {
    const configPath = this.getConfigPath();
    const configDir = dirname(configPath);
    try {
      await mkdir(configDir, { recursive: true });
    } catch {
      // may exist
    }
    this._selfWriteTimestamp = Date.now();
    await writeFile(configPath, stringify(config), "utf-8");
  }

  private async persistAddMount(mount: MountConfig): Promise<void> {
    const config = await this.readConfigFile();
    const mounts = (config.mounts as ConfigMountEntry[]) ?? [];

    const entry: ConfigMountEntry = {
      path: mount.path,
      uri: mount.uri,
    };
    if (mount.description) entry.description = mount.description;
    if (mount.access_mode) entry.access_mode = mount.access_mode;
    if (mount.auth) entry.auth = mount.auth;
    if (mount.namespace) entry.namespace = mount.namespace;
    if (mount.options) entry.options = mount.options;

    // Upsert
    const existing = mounts.findIndex((m) => m.path === mount.path);
    if (existing >= 0) {
      mounts[existing] = entry;
    } else {
      mounts.push(entry);
    }
    config.mounts = mounts;

    await this.writeConfigFile(config);
  }

  private async persistRemoveMount(path: string): Promise<void> {
    const config = await this.readConfigFile();
    const mounts = (config.mounts as ConfigMountEntry[]) ?? [];
    config.mounts = mounts.filter((m) => m.path !== path);
    await this.writeConfigFile(config);
  }
}
