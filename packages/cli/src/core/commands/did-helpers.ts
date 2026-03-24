/**
 * DID command helpers — pure filesystem operations for entity detection and manifest parsing.
 * Extracted from did.ts to enable direct unit testing.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

// ── Types ──────────────────────────────────────────────────

export type DetectedEntityType = "provider" | "blocklet";

/** Parsed blocklet.yaml manifest metadata */
export interface BlockletManifest {
  /** Machine identifier (filesystem-safe, used for identity derivation) */
  id: string;
  /** Display name (human-readable) */
  name: string;
  /** Manifest spec version */
  specVersion?: number;
}

/** Unified entity info — all subcommands use this instead of readPackageJson directly */
export interface EntityInfo {
  /** Identity key (provider: package name, blocklet: manifest id) */
  name: string;
  /** Display name (provider: same as name, blocklet: manifest name) */
  displayName: string;
  /** Package version (providers only) */
  version?: string;
  /** Entity type */
  entityType: DetectedEntityType;
  /** Blocklet manifest data (for VC subject, blocklet only) */
  blockletManifest?: BlockletManifest;
}

// ── Atomic readers ──────────────────────────────────────────

export async function readPackageJson(dir: string): Promise<{ name: string; version: string }> {
  const content = await fs.readFile(path.join(dir, "package.json"), "utf-8");
  return JSON.parse(content);
}

/**
 * Detect entity type from directory contents.
 * Checks for blocklet manifest first (higher specificity), then package.json.
 */
export async function detectEntityType(cwd: string): Promise<DetectedEntityType | null> {
  for (const filename of ["blocklet.yaml", "blocklet.yml"]) {
    try {
      await fs.access(path.join(cwd, filename));
      return "blocklet";
    } catch {
      /* continue */
    }
  }
  try {
    await fs.access(path.join(cwd, "package.json"));
    return "provider";
  } catch {
    return null;
  }
}

/**
 * Read blocklet manifest metadata from blocklet.yaml/yml.
 * Simple YAML parsing — extracts `id`, `name`, and `specVersion` fields.
 */
export async function readBlockletManifest(cwd: string): Promise<BlockletManifest> {
  for (const filename of ["blocklet.yaml", "blocklet.yml"]) {
    try {
      const content = await fs.readFile(path.join(cwd, filename), "utf-8");
      const idMatch = content.match(/^id:\s*['"]?([^\s'"#]+)/m);
      const nameMatch = content.match(/^name:\s*(.+?)\s*$/m);
      const specMatch = content.match(/^specVersion:\s*(\d+)/m);
      if (idMatch?.[1]) {
        return {
          id: idMatch[1],
          name: nameMatch?.[1]?.replace(/^['"]|['"]$/g, "").trim() ?? idMatch[1],
          specVersion: specMatch?.[1] ? Number(specMatch[1]) : undefined,
        };
      }
    } catch {
      /* continue */
    }
  }
  throw new Error("No valid blocklet manifest found (blocklet.yaml/yml with id field)");
}

// ── Composite resolvers ──────────────────────────────────────

/**
 * Unified entity info resolver.
 * Detects entity type then reads appropriate manifest for full metadata.
 */
export async function readEntityInfo(dir: string): Promise<EntityInfo> {
  const detected = await detectEntityType(dir);
  if (detected === "blocklet") {
    const manifest = await readBlockletManifest(dir);
    return {
      name: manifest.id,
      displayName: manifest.name,
      entityType: "blocklet",
      blockletManifest: manifest,
    };
  }
  if (detected === "provider") {
    const pkg = await readPackageJson(dir);
    return {
      name: pkg.name,
      displayName: pkg.name,
      version: pkg.version,
      entityType: "provider",
    };
  }
  throw new Error("No package.json or blocklet.yaml found in current directory");
}

export async function validateProviderPackage(
  cwd: string,
): Promise<{ name: string; version: string }> {
  try {
    return await readPackageJson(cwd);
  } catch {
    throw new Error("No valid package.json found in current directory");
  }
}

export async function validateBlockletPackage(cwd: string): Promise<{ name: string }> {
  const manifest = await readBlockletManifest(cwd);
  return { name: manifest.id };
}

// ── Directory scanning ──────────────────────────────────────

/**
 * Find all entity directories (providers + blocklets) under the project root.
 * Providers require package.json; blocklets require blocklet.yaml or blocklet.yml.
 */
export async function findEntityDirs(cwd: string): Promise<string[]> {
  const dirs: string[] = [];

  // Scan providers/ — directories with package.json
  const providersDir = path.join(cwd, "providers");
  try {
    const entries = await fs.readdir(providersDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pkgPath = path.join(providersDir, entry.name, "package.json");
        try {
          await fs.access(pkgPath);
          dirs.push(path.join(providersDir, entry.name));
        } catch {
          // skip dirs without package.json
        }
      }
    }
  } catch {
    // providers/ doesn't exist
  }

  // Scan blocklets/ — directories with blocklet.yaml or blocklet.yml
  const blockletsDir = path.join(cwd, "blocklets");
  try {
    const entries = await fs.readdir(blockletsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const entryDir = path.join(blockletsDir, entry.name);
        for (const manifest of ["blocklet.yaml", "blocklet.yml"]) {
          try {
            await fs.access(path.join(entryDir, manifest));
            dirs.push(entryDir);
            break;
          } catch {
            /* continue */
          }
        }
      }
    }
  } catch {
    // blocklets/ doesn't exist
  }

  return dirs;
}
