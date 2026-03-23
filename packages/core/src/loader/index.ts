/**
 * AFS Provider Dynamic Loader
 *
 * Provides utilities for dynamically loading AFS providers at runtime.
 *
 * @example
 * ```typescript
 * import { loadProvider, getProviderSchema } from "@aigne/afs/loader";
 *
 * // Load a provider with configuration
 * const fs = await loadProvider("@aigne/afs-fs", {
 *   config: { localPath: "./data" },
 *   basePath: "/path/to/config/dir"
 * });
 *
 * // Get provider schema for validation
 * const schema = await getProviderSchema("@aigne/afs-fs");
 * ```
 */

import type { ZodType } from "zod";
import { getPlatform } from "../platform/global.js";
import type { AFSModule, AFSModuleLoadParams } from "../type.js";

// Re-export types for convenience
export type { AFSModuleLoadParams } from "../type.js";

/**
 * Resolve a package specifier to an importable path.
 * If the specifier is a directory path (e.g. from npm install),
 * read its package.json to find the ESM entry point.
 * We must use the ESM (.mjs) entry, not CJS (.cjs), because
 * importing CJS from ESM wraps module.exports in an extra default layer
 * which breaks the expected export shape.
 */
async function resolveImportPath(specifier: string): Promise<string> {
  if (!specifier.startsWith("/")) return specifier;

  const platform = getPlatform();
  const pkgJsonPath = platform.path.join(specifier, "package.json");
  try {
    const content = await platform.fs!.readTextFile(pkgJsonPath);
    const pkg = JSON.parse(content);
    // Prefer ESM entry: exports["."].import > module > main
    const esmEntry = (typeof pkg.exports === "object" && pkg.exports["."]?.import) || pkg.module;
    if (esmEntry) return platform.path.join(specifier, esmEntry);
    // Fallback to main (may be CJS)
    if (pkg.main) return platform.path.join(specifier, pkg.main);
  } catch {
    // Fall through to use original specifier (file not found or parse error)
  }
  return specifier;
}

/**
 * Dynamically load an AFS Provider from a package.
 *
 * @param packageName - Package name or subpath (e.g., "@aigne/afs-fs" or "@aigne/afs-cloud/s3")
 * @param options - Load options (optional)
 * @returns Provider instance
 *
 * @throws Error if package doesn't exist or doesn't export a valid AFS Provider
 *
 * @example
 * ```typescript
 * const fs = await loadProvider("@aigne/afs-fs", {
 *   config: { localPath: "./data" },
 *   basePath: "/path/to/config/dir"
 * });
 * ```
 */
export async function loadProvider<T extends AFSModule = AFSModule>(
  packageName: string,
  options?: AFSModuleLoadParams,
): Promise<T> {
  // 1. Dynamic import the package
  const importPath = await resolveImportPath(packageName);
  let module: Record<string, unknown>;
  try {
    module = (await import(importPath)) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Failed to import package "${packageName}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // 2. Get the default export
  const ProviderClass = module.default as {
    load?: (params: AFSModuleLoadParams) => Promise<T>;
  };

  if (!ProviderClass || typeof ProviderClass.load !== "function") {
    throw new Error(
      `Package "${packageName}" does not export a valid AFS Provider. ` +
        `Expected default export with static load() method.`,
    );
  }

  // 3. Call load() to create instance
  return ProviderClass.load(options ?? {});
}

/**
 * Get the configuration schema for an AFS Provider without creating an instance.
 *
 * Useful for:
 * - Configuration validation
 * - Documentation generation
 * - IDE integration
 *
 * @param packageName - Package name or subpath
 * @returns Zod schema for the provider's configuration
 *
 * @throws Error if package doesn't export schema() method
 *
 * @example
 * ```typescript
 * const schema = await getProviderSchema("@aigne/afs-fs");
 * const result = schema.safeParse(config);
 * if (!result.success) {
 *   console.error(result.error);
 * }
 * ```
 */
export async function getProviderSchema(packageName: string): Promise<ZodType<unknown>> {
  // Dynamic import the package
  const importPath = await resolveImportPath(packageName);
  let module: Record<string, unknown>;
  try {
    module = (await import(importPath)) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Failed to import package "${packageName}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const ProviderClass = module.default as {
    schema?: () => ZodType<unknown>;
  };

  if (!ProviderClass || typeof ProviderClass.schema !== "function") {
    throw new Error(`Package "${packageName}" does not export schema() method.`);
  }

  return ProviderClass.schema();
}
