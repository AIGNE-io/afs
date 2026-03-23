/**
 * Mount Configuration Commands
 *
 * CLI-specific commands for managing mount configuration files.
 * These operate on afs.toml config files, not the AFS instance directly.
 */

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { parse, stringify } from "smol-toml";
import {
  AFS_USER_CONFIG_DIR_ENV,
  CONFIG_DIR_NAME,
  CONFIG_FILE_NAME,
  ConfigLoader,
} from "./loader.js";
import { MountSchema } from "./schema.js";

// ─── Persistence Types ───────────────────────────────────────────────────

export type PersistScope = "cwd" | "project" | "user";

export interface PersistResult {
  success: boolean;
  configPath?: string;
  message?: string;
}

export interface ConfigMountEntry {
  path: string;
  uri: string;
  namespace?: string;
  description?: string;
  access_mode?: "readonly" | "readwrite";
  auth?: string;
  token?: string;
  options?: Record<string, unknown>;
}

export interface ConfigMountListResult {
  mounts: ConfigMountEntry[];
}

export interface MountCommandResult {
  success: boolean;
  message?: string;
  normalizedPath?: string;
}

export interface MountValidateResult {
  valid: boolean;
  errors: string[];
}

/**
 * Check if a path looks like a remote Git URL
 */
function isRemoteGitUrl(path: string): boolean {
  if (/^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+:/.test(path)) {
    return true;
  }
  if (/^(https?|ssh|git):\/\//.test(path)) {
    return true;
  }
  return false;
}

/**
 * Resolve relative paths in URI to absolute paths
 */
export function resolveUriPath(uri: string, cwd: string): string {
  const schemeMatch = uri.match(/^([a-z][a-z0-9+.-]*):\/\//i);

  if (!schemeMatch) {
    if (isRemoteGitUrl(uri)) {
      return `git://${uri}`;
    }
    const absolutePath = isAbsolute(uri) ? uri : resolve(cwd, uri);
    return `fs://${absolutePath}`;
  }

  const scheme = schemeMatch[1];
  const pathPart = uri.slice(schemeMatch[0].length);

  if (!["fs", "git", "sqlite", "json"].includes(scheme!)) {
    return uri;
  }

  if (scheme === "git" && isRemoteGitUrl(pathPart)) {
    return uri;
  }

  if (isAbsolute(pathPart)) {
    return uri;
  }

  const absolutePath = resolve(cwd, pathPart);
  return `${scheme}://${absolutePath}`;
}

/**
 * List all mounts from config (merged from all config layers)
 */
export async function configMountListCommand(cwd: string): Promise<ConfigMountListResult> {
  const loader = new ConfigLoader();
  const config = await loader.load(cwd);
  return {
    mounts: config.mounts as ConfigMountEntry[],
  };
}

/**
 * Add a mount to config
 */
export async function mountAddCommand(
  cwd: string,
  path: string,
  uri: string,
  options: { description?: string; token?: string } = {},
): Promise<MountCommandResult> {
  if (!uri || uri.trim() === "") {
    return {
      success: false,
      message: "URI is required",
    };
  }

  const resolvedUri = resolveUriPath(uri, cwd);

  const validation = MountSchema.safeParse({
    path,
    uri: resolvedUri,
    ...options,
  });
  if (!validation.success) {
    const errors = validation.error.issues.map((e) => e.message).join("; ");
    return {
      success: false,
      message: errors,
    };
  }

  const newMount: ConfigMountEntry = {
    path: validation.data.path,
    uri: validation.data.uri,
    ...(options.description && { description: options.description }),
    ...(options.token && { token: options.token }),
  };

  const configDir = join(cwd, CONFIG_DIR_NAME);
  const configPath = join(configDir, CONFIG_FILE_NAME);

  const config: { mounts: ConfigMountEntry[] } = { mounts: [] };

  try {
    const content = await readFile(configPath, "utf-8");
    const parsed = parse(content) as { mounts?: ConfigMountEntry[] };
    config.mounts = parsed.mounts ?? [];
  } catch {
    // Config doesn't exist, will create
  }

  const normalizedPath = validation.data.path;
  if (config.mounts.some((m) => m.path === normalizedPath)) {
    return {
      success: false,
      message: `Mount path "${normalizedPath}" already exists`,
    };
  }

  config.mounts.push(newMount);

  try {
    await mkdir(configDir, { recursive: true });
  } catch {
    // Directory might already exist
  }

  await writeFile(configPath, stringify(config), "utf-8");

  return {
    success: true,
    normalizedPath,
  };
}

/**
 * Remove a mount from config
 */
export async function mountRemoveCommand(cwd: string, path: string): Promise<MountCommandResult> {
  const configPath = join(cwd, CONFIG_DIR_NAME, CONFIG_FILE_NAME);

  try {
    const content = await readFile(configPath, "utf-8");
    const config = parse(content) as { mounts?: ConfigMountEntry[] };
    const mounts = config.mounts ?? [];

    const index = mounts.findIndex((m) => m.path === path);
    if (index === -1) {
      return {
        success: false,
        message: `Mount path "${path}" not found`,
      };
    }

    mounts.splice(index, 1);
    config.mounts = mounts;

    await writeFile(configPath, stringify(config), "utf-8");

    return {
      success: true,
    };
  } catch {
    return {
      success: false,
      message: `Mount path "${path}" not found`,
    };
  }
}

// ─── Persistence Functions ────────────────────────────────────────────────

/**
 * Resolve a PersistScope to the config directory path.
 *
 * - "cwd"     → <cwd>/.afs-config/
 * - "project" → <projectRoot>/.afs-config/ (falls back to cwd if no .git found)
 * - "user"    → ~/.afs-config/
 */
export async function resolveScopeDir(cwd: string, scope: PersistScope): Promise<string> {
  if (scope === "user") {
    return process.env[AFS_USER_CONFIG_DIR_ENV] ?? join(homedir(), CONFIG_DIR_NAME);
  }

  if (scope === "project") {
    const loader = new ConfigLoader();
    const projectRoot = await loader.findProjectRoot(cwd);
    if (projectRoot) {
      return join(projectRoot, CONFIG_DIR_NAME);
    }
    // Fall back to cwd when no .git found
    return join(cwd, CONFIG_DIR_NAME);
  }

  // "cwd"
  return join(cwd, CONFIG_DIR_NAME);
}

/**
 * Persist a mount entry to config.toml at the given scope.
 *
 * Uses upsert semantics: if a mount with the same path already exists,
 * it is replaced. Otherwise the new entry is appended.
 */
export async function persistMount(
  cwd: string,
  entry: ConfigMountEntry,
  scope: PersistScope = "cwd",
): Promise<PersistResult> {
  const configDir = await resolveScopeDir(cwd, scope);
  const configPath = join(configDir, CONFIG_FILE_NAME);

  // Read existing config (or start empty)
  const config: Record<string, unknown> & { mounts: ConfigMountEntry[] } = { mounts: [] };
  try {
    const content = await readFile(configPath, "utf-8");
    const parsed = parse(content) as Record<string, unknown>;
    config.mounts = (parsed.mounts as ConfigMountEntry[] | undefined) ?? [];
    // Preserve non-mount sections (serve, registry, etc.)
    for (const key of Object.keys(parsed)) {
      if (key !== "mounts") {
        config[key] = parsed[key];
      }
    }
  } catch {
    // Config doesn't exist yet, will create
  }

  // Upsert: replace existing entry at same path, or append
  const existingIndex = config.mounts.findIndex((m) => m.path === entry.path);
  if (existingIndex >= 0) {
    config.mounts[existingIndex] = entry;
  } else {
    config.mounts.push(entry);
  }

  // Write back
  try {
    await mkdir(configDir, { recursive: true });
  } catch {
    // Directory might already exist
  }

  await writeFile(configPath, stringify(config), "utf-8");

  return { success: true, configPath };
}

/**
 * Update specific options on an existing mount entry in a config file.
 *
 * Merges `optionUpdates` into the mount's `options` field (shallow merge).
 * If the mount is not found in the given configDir, this is a no-op.
 */
export async function updateMountOptions(
  configDir: string,
  mountPath: string,
  optionUpdates: Record<string, unknown>,
): Promise<void> {
  const configPath = join(configDir, CONFIG_FILE_NAME);
  const content = await readFile(configPath, "utf-8");
  const parsed = parse(content) as Record<string, unknown>;
  const mounts = (parsed.mounts as ConfigMountEntry[]) ?? [];
  const entry = mounts.find((m) => m.path === mountPath);
  if (!entry) return;
  entry.options = { ...entry.options, ...optionUpdates };
  await writeFile(configPath, stringify(parsed as Record<string, unknown>), "utf-8");
}

/**
 * Remove a mount entry from config.toml.
 *
 * If `scope` is provided, only searches the specific config file for that scope.
 * If `scope` is undefined, searches all config files (cwd, project, user) and
 * removes from the first one that contains the mount path.
 */
export async function unpersistMount(
  cwd: string,
  mountPath: string,
  scope?: PersistScope,
): Promise<PersistResult> {
  if (scope) {
    return removeFromConfigFile(cwd, mountPath, scope);
  }

  // Search all scopes: cwd → project → user
  for (const s of ["cwd", "project", "user"] as PersistScope[]) {
    const result = await removeFromConfigFile(cwd, mountPath, s);
    if (result.success) return result;
  }

  return { success: false, message: `Mount path "${mountPath}" not found in any config` };
}

/**
 * Remove a mount from a specific config file.
 */
async function removeFromConfigFile(
  cwd: string,
  mountPath: string,
  scope: PersistScope,
): Promise<PersistResult> {
  const configDir = await resolveScopeDir(cwd, scope);
  const configPath = join(configDir, CONFIG_FILE_NAME);

  try {
    const content = await readFile(configPath, "utf-8");
    const parsed = parse(content) as Record<string, unknown>;
    const mounts = (parsed.mounts as ConfigMountEntry[] | undefined) ?? [];

    const index = mounts.findIndex((m) => m.path === mountPath);
    if (index === -1) {
      return { success: false, message: `Mount path "${mountPath}" not found in ${configPath}` };
    }

    mounts.splice(index, 1);
    parsed.mounts = mounts;

    await writeFile(configPath, stringify(parsed), "utf-8");

    return { success: true, configPath };
  } catch {
    return { success: false, message: `Config file not found or unreadable: ${configPath}` };
  }
}

/**
 * Validate mount configuration
 */
export async function mountValidateCommand(cwd: string): Promise<MountValidateResult> {
  const configPath = join(cwd, CONFIG_DIR_NAME, CONFIG_FILE_NAME);
  const errors: string[] = [];

  try {
    const content = await readFile(configPath, "utf-8");
    const config = parse(content) as { mounts?: ConfigMountEntry[] };
    const mounts = config.mounts ?? [];

    for (const mount of mounts) {
      const validation = MountSchema.safeParse(mount);
      if (!validation.success) {
        for (const err of validation.error.issues) {
          errors.push(`Mount "${mount.path}": ${err.message}`);
        }
        continue;
      }

      if (mount.uri.startsWith("fs://")) {
        const targetPath = mount.uri.replace("fs://", "");
        try {
          await access(targetPath);
        } catch {
          errors.push(`Mount target "${targetPath}" does not exist`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  } catch {
    return {
      valid: true,
      errors: [],
    };
  }
}
