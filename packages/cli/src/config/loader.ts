import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parse } from "smol-toml";
import { resolveEnvVarsInObject } from "./env.js";
import {
  type AFSConfig,
  ConfigSchema,
  type DIDSpaceConfig,
  type MountConfig,
  type ServeConfig,
  type TrustConfig,
} from "./schema.js";

export const CONFIG_DIR_NAME = ".afs-config";
export const CONFIG_FILE_NAME = "config.toml";

export interface ConfigLoaderOptions {
  /** Custom path to user-level config directory (for testing) */
  userConfigDir?: string;
}

export interface LoadWithSourcesResult {
  config: AFSConfig;
  /** Map from "namespace:path" → config directory that defines this mount */
  mountSources: Map<string, string>;
  /** Config directories in order from outermost to innermost */
  configDirs: string[];
}

/**
 * Environment variable to override user config directory.
 * Useful for testing to isolate from real user config.
 */
export const AFS_USER_CONFIG_DIR_ENV = "AFS_USER_CONFIG_DIR";

/**
 * Loads and merges AFS configuration from multiple layers
 *
 * Layer priority (lowest to highest):
 * 1. User-level: ~/.afs-config/config.toml
 * 2. All intermediate directories from project root to cwd
 *
 * Example: if cwd is /project/packages/cli, configs are merged from:
 *   ~/.afs-config/config.toml (user)
 *   /project/.afs-config/config.toml (project root, has .git)
 *   /project/packages/.afs-config/config.toml (intermediate)
 *   /project/packages/cli/.afs-config/config.toml (cwd)
 */
export class ConfigLoader {
  private userConfigDir: string;

  constructor(options: ConfigLoaderOptions = {}) {
    // Priority: options > environment variable > default (~/.afs-config)
    this.userConfigDir =
      options.userConfigDir ??
      process.env[AFS_USER_CONFIG_DIR_ENV] ??
      join(homedir(), CONFIG_DIR_NAME);
  }

  /**
   * Load and merge configuration from all layers
   *
   * @param cwd - Current working directory (defaults to process.cwd())
   * @returns Merged configuration
   * @throws Error on invalid config, TOML parse error, or duplicate mount paths
   */
  async load(cwd: string = process.cwd()): Promise<AFSConfig> {
    const result = await this.loadWithSources(cwd);
    return result.config;
  }

  /**
   * Load and merge configuration, also returning the config directory for each mount.
   *
   * mountSources maps "namespace:path" → config directory path (dirname of config file).
   * Used by credential store to scope credentials per config location.
   */
  async loadWithSources(cwd: string = process.cwd()): Promise<LoadWithSourcesResult> {
    const configPaths = await this.getConfigPaths(cwd);
    const entries: { config: AFSConfig; configDir: string }[] = [];

    for (const configPath of configPaths) {
      const config = await this.loadSingleConfig(configPath);
      entries.push({ config, configDir: dirname(configPath) });
    }

    return this.mergeConfigsWithSources(entries);
  }

  /**
   * Get paths to all existing config files
   *
   * Collects configs from:
   * 1. User-level: ~/.afs-config/config.toml
   * 2. Project root (or topmost .afs-config dir) to cwd: all .afs-config/config.toml files
   */
  async getConfigPaths(cwd: string = process.cwd()): Promise<string[]> {
    const paths: string[] = [];

    // 1. User-level config
    const userConfigPath = join(this.userConfigDir, CONFIG_FILE_NAME);
    if (await this.fileExists(userConfigPath)) {
      paths.push(userConfigPath);
    }

    // 2. Find project root (look for .git going up)
    const projectRoot = await this.findProjectRoot(cwd);

    // 3. Determine start directory
    // If project root found, use it; otherwise find topmost .afs-config directory
    const startDir = projectRoot ?? (await this.findTopmostAfsDir(cwd)) ?? cwd;

    // 4. Collect all config files from start to cwd
    // Exclude user config directory to avoid loading it twice
    const intermediatePaths = await this.collectConfigsFromTo(startDir, cwd, this.userConfigDir);
    paths.push(...intermediatePaths);

    return paths;
  }

  /**
   * Find the topmost directory containing .afs-config from startDir going up
   */
  private async findTopmostAfsDir(startDir: string): Promise<string | null> {
    let currentDir = startDir;
    let topmostAfsDir: string | null = null;

    while (true) {
      if (await this.fileExists(join(currentDir, CONFIG_DIR_NAME))) {
        topmostAfsDir = currentDir;
      }

      const parentDir = dirname(currentDir);
      if (parentDir === currentDir) {
        // Reached filesystem root
        break;
      }
      currentDir = parentDir;
    }

    return topmostAfsDir;
  }

  /**
   * Collect all config files from startDir to endDir (inclusive)
   * Returns paths in order from startDir to endDir (parent to child)
   *
   * @param excludeConfigDir - Optional config directory to exclude (to avoid duplicates)
   */
  private async collectConfigsFromTo(
    startDir: string,
    endDir: string,
    excludeConfigDir?: string,
  ): Promise<string[]> {
    const paths: string[] = [];

    // Build list of directories from startDir to endDir
    const dirs: string[] = [];
    let current = endDir;

    while (true) {
      dirs.unshift(current); // prepend to maintain parent-to-child order

      if (current === startDir) {
        break;
      }

      const parent = dirname(current);
      if (parent === current) {
        // Reached filesystem root without finding startDir
        // This shouldn't happen if startDir is an ancestor of endDir
        break;
      }
      current = parent;
    }

    // Check each directory for config file
    for (const dir of dirs) {
      const configDir = join(dir, CONFIG_DIR_NAME);
      // Skip if this is the excluded config directory (e.g., user config already loaded)
      if (excludeConfigDir && configDir === excludeConfigDir) {
        continue;
      }
      const configPath = join(configDir, CONFIG_FILE_NAME);
      if (await this.fileExists(configPath)) {
        paths.push(configPath);
      }
    }

    return paths;
  }

  /**
   * Load a single config file
   */
  private async loadSingleConfig(configPath: string): Promise<AFSConfig> {
    const content = await readFile(configPath, "utf-8");

    let parsed: unknown;
    try {
      parsed = parse(content);
    } catch (error) {
      throw new Error(
        `Failed to parse TOML config at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Resolve environment variables with friendly error messages
    let resolved: unknown;
    try {
      resolved = resolveEnvVarsInObject(parsed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Extract variable name from error message like "Environment variable GITHUB_TOKEN is not defined"
      const match = message.match(/Environment variable (\w+) is not defined/);
      if (match) {
        const varName = match[1];
        throw new Error(
          `Missing environment variable ${varName} in ${configPath}.\n` +
            `  Set it in your shell: export ${varName}=your_value\n` +
            `  Or add to .env file: ${varName}=your_value`,
        );
      }
      throw new Error(`Failed to resolve environment variables in ${configPath}: ${message}`);
    }

    // Validate against schema
    const result = ConfigSchema.safeParse(resolved);
    if (!result.success) {
      const errors = result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      throw new Error(`Invalid config at ${configPath}: ${errors}`);
    }

    return result.data;
  }

  /**
   * Create a composite key for namespace+path duplicate detection
   * Uses empty string for undefined namespace (default namespace)
   */
  private makeNamespacePathKey(namespace: string | undefined, path: string): string {
    return `${namespace ?? ""}:${path}`;
  }

  /**
   * Merge configs with source tracking.
   * Returns merged config plus a map of mount key → config directory.
   */
  private mergeConfigsWithSources(
    entries: { config: AFSConfig; configDir: string }[],
  ): LoadWithSourcesResult {
    const mountIndexByKey = new Map<string, number>();
    const allMounts: MountConfig[] = [];
    const mountSources = new Map<string, string>();
    let mergedServe: ServeConfig | undefined;
    let mergedTrust: TrustConfig | undefined;
    let mergedDIDSpace: DIDSpaceConfig | undefined;
    let mergedRegistry: AFSConfig["registry"] | undefined;

    for (const { config, configDir } of entries) {
      for (const mount of config.mounts) {
        const key = this.makeNamespacePathKey(mount.namespace, mount.path);
        const existingIndex = mountIndexByKey.get(key);
        if (existingIndex !== undefined) {
          allMounts[existingIndex] = mount;
        } else {
          mountIndexByKey.set(key, allMounts.length);
          allMounts.push(mount);
        }
        // Track source (child overrides parent)
        mountSources.set(key, configDir);
      }

      if (config.serve) {
        mergedServe = mergedServe ? { ...mergedServe, ...config.serve } : config.serve;
      }

      // Trust config: project level overrides global, overrides are merged (not replaced)
      if (config.trust) {
        if (mergedTrust) {
          mergedTrust = {
            default: config.trust.default,
            overrides: { ...mergedTrust.overrides, ...config.trust.overrides },
          };
        } else {
          mergedTrust = config.trust;
        }
      }

      // DID Space: child overrides parent
      if (config.did_space) {
        mergedDIDSpace = config.did_space;
      }

      // Registry: child overrides parent
      if (config.registry) {
        mergedRegistry = config.registry;
      }
    }

    return {
      config: {
        mounts: allMounts,
        serve: mergedServe,
        trust: mergedTrust,
        did_space: mergedDIDSpace,
        registry: mergedRegistry,
      },
      mountSources,
      configDirs: entries.map((e) => e.configDir),
    };
  }

  /**
   * Find project root by looking for .git
   * Note: Only .git is used as project root marker, not .afs-config,
   * because .afs-config can exist at multiple levels for hierarchical config
   */
  async findProjectRoot(startDir: string): Promise<string | null> {
    let currentDir = startDir;

    while (true) {
      // Check for .git directory
      if (await this.fileExists(join(currentDir, ".git"))) {
        return currentDir;
      }

      const parentDir = dirname(currentDir);
      if (parentDir === currentDir) {
        // Reached filesystem root
        return null;
      }
      currentDir = parentDir;
    }
  }

  /**
   * Check if a file or directory exists
   */
  private async fileExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }
}

// Default singleton instance
export const configLoader = new ConfigLoader();
