import { getPlatform } from "./platform/global.js";
import type { AFSModule, MountConfig, ProviderManifest } from "./type.js";
import { resolveEnvFromSchema } from "./utils/schema.js";
import { type ParsedURI, parseURI } from "./utils/uri.js";
import { extractSchemeFromTemplate, parseTemplate } from "./utils/uri-template.js";

/**
 * Factory function that creates a provider from a mount config and pre-parsed URI.
 */
export type ProviderFactory = (mount: MountConfig, parsed: ParsedURI) => Promise<AFSModule>;

/**
 * Resolve a package specifier to an importable path.
 * If the specifier is a directory path (e.g. from npm install),
 * read its package.json to find the ESM entry point.
 */
async function resolveImportPath(specifier: string): Promise<string> {
  if (!specifier.startsWith("/")) return specifier;

  const platform = getPlatform();
  const pkgJsonPath = platform.path.join(specifier, "package.json");
  try {
    const content = await platform.fs!.readTextFile(pkgJsonPath);
    const pkg = JSON.parse(content);
    const esmEntry = (typeof pkg.exports === "object" && pkg.exports["."]?.import) || pkg.module;
    if (esmEntry) return platform.path.join(specifier, esmEntry);
    if (pkg.main) return platform.path.join(specifier, pkg.main);
  } catch {
    // Fall through to use original specifier (file not found or parse error)
  }
  return specifier;
}

/** Mutex for npm install operations to prevent concurrent installs */
const npmInstallLocks = new Map<string, Promise<void>>();

/**
 * Validate npm package name format.
 * Rejects path traversal and shell metacharacters.
 */
function isValidNpmPackageName(name: string): boolean {
  if (!name || name.length > 214) return false;
  if (name.includes("..") || name.startsWith("/") || name.startsWith("\\")) return false;
  const dangerous = [";", "|", "&", "`", "$", "(", ")", ">", "<", "\n", "\r", "\t", "\x00"];
  for (const char of dangerous) {
    if (name.includes(char)) return false;
  }
  if (name.startsWith("@")) {
    const parts = name.slice(1).split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  }
  return true;
}

/**
 * Install an npm package if not already present.
 * Uses per-package mutex to prevent concurrent installs.
 */
async function npmInstall(packageName: string, packagesDir: string): Promise<void> {
  const existing = npmInstallLocks.get(packageName);
  if (existing) {
    await existing;
    return;
  }

  const platform = getPlatform();
  if (!platform.capabilities.has("process.spawn")) {
    throw new Error(
      `Cannot install npm package "${packageName}": process.spawn not available. ` +
        `Pre-register providers using registry.register() in non-Node environments.`,
    );
  }
  const installPromise = (async () => {
    await platform.fs!.mkdir(packagesDir, { recursive: true });
    const { exec } = await import(/* webpackIgnore: true */ "node:child_process");
    try {
      await new Promise<void>((resolve, reject) => {
        const child = exec(
          `npm install --prefix ${JSON.stringify(packagesDir)} ${JSON.stringify(packageName)}`,
          { timeout: 120_000 },
          (error) => (error ? reject(error) : resolve()),
        );
        child.stdout?.resume();
        child.stderr?.resume();
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to install npm package "${packageName}": ${message}`);
    }
  })();

  npmInstallLocks.set(packageName, installPromise);
  try {
    await installPromise;
  } finally {
    npmInstallLocks.delete(packageName);
  }
}

/**
 * Get the npm packages install directory (~/.afs-config/packages/).
 */
async function getNpmPackagesDir(): Promise<string> {
  const platform = getPlatform();
  // HOME/USERPROFILE env vars cover Node, Workers (via config), and most environments
  const home = platform.env.get("HOME") || platform.env.get("USERPROFILE") || "/tmp";
  return platform.path.resolve(home, ".afs-config", "packages");
}

/** How often to check for package updates (24 hours). */
const UPDATE_CHECK_STALE_MS = 24 * 60 * 60 * 1000;

/**
 * Trigger a background npm update if the package hasn't been checked recently.
 * Completely silent — never blocks, never throws, never produces output.
 */
async function npmUpdateIfStale(packageName: string, packagesDir: string): Promise<void> {
  const platform = getPlatform();
  const checkFile = platform.path.join(packagesDir, ".update-check.json");
  const now = Date.now();

  let checks: Record<string, number> = {};
  try {
    checks = JSON.parse(await platform.fs!.readTextFile(checkFile));
  } catch {
    /* file missing or corrupt — treat all packages as stale */
  }

  const lastCheck = checks[packageName] ?? 0;
  if (now - lastCheck < UPDATE_CHECK_STALE_MS) return;

  // Record check time immediately to prevent duplicate triggers
  checks[packageName] = now;
  try {
    await platform.fs!.writeFile(checkFile, JSON.stringify(checks, null, 2));
  } catch {
    /* write failure is non-fatal */
  }

  // Fire-and-forget background update
  npmUpdateBackground(packageName, packagesDir).catch(() => {});
}

/**
 * Run `npm update` for a single package in the background.
 * Errors are silently swallowed (e.g. no network).
 */
async function npmUpdateBackground(packageName: string, packagesDir: string): Promise<void> {
  const platform = getPlatform();
  if (!platform.capabilities.has("process.spawn")) return; // silently skip in non-Node
  const { exec } = await import(/* webpackIgnore: true */ "node:child_process");
  try {
    await new Promise<void>((resolve, reject) => {
      const child = exec(
        `npm update --prefix ${JSON.stringify(packagesDir)} ${JSON.stringify(packageName)}`,
        { timeout: 120_000 },
        (error) => (error ? reject(error) : resolve()),
      );
      child.stdout?.resume();
      child.stderr?.resume();
    });
  } catch {
    // Silent — no network, npm error, etc.
  }
}

// ─── pnpm workspace resolution ──────────────────────────────────────────────

/** Cached workspace package map: package name → absolute directory path. */
let workspacePackageMap: Map<string, string> | undefined;

/**
 * Walk up from `startDir` looking for `pnpm-workspace.yaml`.
 * Returns the workspace root directory, or undefined if not found.
 */
async function findWorkspaceRoot(startDir: string): Promise<string | undefined> {
  const platform = getPlatform();
  let dir = startDir;
  for (;;) {
    try {
      const exists = await platform.fs!.exists(platform.path.join(dir, "pnpm-workspace.yaml"));
      if (exists) return dir;
    } catch {
      // not found — continue
    }
    const parent = platform.path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Build a map of package name → directory for all packages in the pnpm workspace.
 * Result is cached for the lifetime of the process.
 */
async function buildWorkspacePackageMap(workspaceRoot: string): Promise<Map<string, string>> {
  if (workspacePackageMap) return workspacePackageMap;

  const platform = getPlatform();
  const yamlContent = await platform.fs!.readTextFile(
    platform.path.join(workspaceRoot, "pnpm-workspace.yaml"),
  );

  // Parse `packages:` globs — the format is simple enough for regex
  const globs: string[] = [];
  let inPackages = false;
  for (const line of yamlContent.split("\n")) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      const match = line.match(/^\s+-\s+(.+)$/);
      if (match) {
        globs.push(match[1]!.trim().replace(/['"]/g, ""));
      } else if (/^\S/.test(line)) {
        break; // next top-level key
      }
    }
  }

  const map = new Map<string, string>();

  for (const glob of globs) {
    if (glob.includes("*")) {
      // Expand "packages/*" → list subdirs of "packages/"
      const baseDir = platform.path.join(workspaceRoot, glob.split("*")[0]!);
      try {
        const entries = await platform.fs!.readdir(baseDir);
        for (const name of entries) {
          const pkgDir = platform.path.join(baseDir, name);
          try {
            const s = await platform.fs!.stat(pkgDir);
            if (!s.isDirectory) continue;
          } catch {
            continue;
          }
          await readPackageNameInto(map, pkgDir);
        }
      } catch {
        // baseDir unreadable or doesn't exist — skip
      }
    } else {
      // Non-glob entry (e.g. "scripts", "benchmarks")
      await readPackageNameInto(map, platform.path.join(workspaceRoot, glob));
    }
  }

  workspacePackageMap = map;
  return map;
}

/** Read package.json in `dir` and add `name → dir` to the map. */
async function readPackageNameInto(map: Map<string, string>, dir: string): Promise<void> {
  const platform = getPlatform();
  const pkgJsonPath = platform.path.join(dir, "package.json");
  try {
    const pkg = JSON.parse(await platform.fs!.readTextFile(pkgJsonPath));
    if (pkg.name) map.set(pkg.name, dir);
  } catch {
    // file missing or corrupt — skip
  }
}

/**
 * Try to find a package inside the pnpm workspace.
 * Returns the package directory path, or undefined if not in a workspace or not found.
 */
async function locateInWorkspace(packageName: string): Promise<string | undefined> {
  const root = await findWorkspaceRoot(process.cwd());
  if (!root) return undefined;
  const map = await buildWorkspacePackageMap(root);
  return map.get(packageName);
}

// ─── Built-in provider package mapping ─────────────────────────────────────
// Maps base scheme → npm package name for providers that don't follow
// the @aigne/afs-{scheme} convention, or need explicit class name mapping.

/**
 * Package name overrides for schemes that don't follow the @aigne/afs-{scheme} convention.
 * Class discovery uses the .manifest() static method — no class name mapping needed.
 */
const PACKAGE_OVERRIDES: Record<string, string> = {
  https: "@aigne/afs-http",
};

/**
 * Derive the base scheme for compound schemes.
 * e.g. "mcp+stdio" → "mcp", "mcp+http" → "mcp"
 */
function baseScheme(scheme: string): string {
  const plusIdx = scheme.indexOf("+");
  return plusIdx >= 0 ? scheme.slice(0, plusIdx) : scheme;
}

/**
 * Registry of provider factories with unified manifest-driven loading.
 *
 * Loading flow:
 * 1. parseURI → get scheme
 * 2. Check registered factories (workspace, custom) → use directly
 * 3. Resolve package: mount.provider or @aigne/afs-{baseScheme}
 * 4. Import package → get ProviderClass
 * 5. Get manifest from ProviderClass.manifest()
 * 6. Match manifest by scheme (for multi-manifest providers)
 * 7. parseTemplate(uriTemplate, body) → extract path variables
 * 8. Merge params: body vars > query > mount.options
 * 9. Construct provider with merged options
 */
export class ProviderRegistry {
  private factories = new Map<string, ProviderFactory>();
  /** Static manifest store — shared across all instances. */
  private static registeredManifests = new Map<string, ProviderManifest>();

  /** Register a scheme → factory mapping. Overwrites any existing registration. */
  register(scheme: string, factory: ProviderFactory): void {
    this.factories.set(scheme.toLowerCase(), factory);
  }

  /**
   * Pre-register a provider manifest for a scheme.
   * Used in environments where dynamic import is unavailable (e.g., Cloudflare Workers).
   * getProviderInfo() checks registered manifests before attempting dynamic import.
   */
  registerManifest(scheme: string, manifest: ProviderManifest): void {
    ProviderRegistry.registeredManifests.set(scheme.toLowerCase(), manifest);
  }

  /** Check if a scheme has a registered factory. */
  has(scheme: string): boolean {
    return this.factories.has(scheme.toLowerCase());
  }

  /**
   * Get provider metadata (schema, auth, manifest) for a URI.
   *
   * Used by CLI credential resolution to get schema and auth method
   * without constructing the provider.
   *
   * Returns null if the provider class can't be loaded (e.g., unknown scheme).
   */
  async getProviderInfo(uri: string): Promise<{
    schema: any | null;
    auth: ((context: any) => Promise<Record<string, unknown> | null>) | undefined;
    manifest: ProviderManifest | null;
  } | null> {
    try {
      const parsed = parseURI(uri);
      const base = baseScheme(parsed.scheme);

      // Check pre-registered manifests first (for Workers / non-Node environments)
      const registered = ProviderRegistry.registeredManifests.get(base);
      if (registered) {
        const schema = registered.schema as any;
        return { schema: schema ?? null, auth: undefined, manifest: registered };
      }

      const packageName = PACKAGE_OVERRIDES[base] ?? `@aigne/afs-${base}`;

      const { providerClass: ProviderClass } = await this.importProviderClass(packageName, base);

      // Get auth method
      const auth = ProviderClass.auth ? ProviderClass.auth.bind(ProviderClass) : undefined;

      // Get manifest
      let manifest: ProviderManifest | null = null;
      if (ProviderClass.manifest) {
        const manifests = this.getManifests(ProviderClass, packageName);
        manifest = this.matchManifest(manifests, parsed.scheme, packageName);
      }

      // Get schema: prefer manifest.schema (user-facing fields only),
      // fall back to deprecated static schema() (full constructor schema).
      // manifest.schema can be either a Zod schema (needs toJSONSchema) or
      // a plain JSON Schema object (used directly).
      let schema: any = null;
      if (manifest?.schema) {
        const ms = manifest.schema as any;
        if (ms.type && ms.properties && typeof ms.properties === "object") {
          // Already a plain JSON Schema object — use directly
          schema = ms;
        } else {
          // Assume Zod schema — convert to JSON Schema
          try {
            const { z } = await import("zod");
            schema = (z as unknown as { toJSONSchema: (s: unknown) => unknown }).toJSONSchema(ms);
          } catch {
            // Schema conversion failed — fall through
          }
        }
      }
      if (!schema && ProviderClass.schema) {
        try {
          const zodSchema = ProviderClass.schema();
          const { z } = await import("zod");
          schema = (z as unknown as { toJSONSchema: (s: unknown) => unknown }).toJSONSchema(
            zodSchema,
          );
        } catch {
          // Schema conversion failed — fall through
        }
      }

      return { schema, auth, manifest };
    } catch {
      return null;
    }
  }

  /**
   * Create a provider from a mount config.
   *
   * Uses registered factory if available, otherwise auto-loads
   * via manifest-driven resolution.
   */
  async createProvider(mount: MountConfig): Promise<AFSModule> {
    const parsed = parseURI(mount.uri);

    // Step 1: Check registered factories (workspace, custom providers)
    const factory = this.factories.get(parsed.scheme);
    if (factory) {
      const provider = await factory(mount, parsed);
      (provider as { uri?: string }).uri = mount.uri;
      return provider;
    }

    // Step 2: Auto-load via manifest-driven resolution
    const provider = await this.autoLoadProvider(mount, parsed);
    (provider as { uri?: string }).uri = mount.uri;
    return provider;
  }

  /**
   * Auto-load a provider using the manifest-driven unified flow.
   */
  private async autoLoadProvider(mount: MountConfig, parsed: ParsedURI): Promise<AFSModule> {
    // Step 3: Resolve package name
    const base = baseScheme(parsed.scheme);
    const packageName = PACKAGE_OVERRIDES[base] ?? `@aigne/afs-${base}`;

    // Step 4: Import the provider package (also returns packageDir for credential injection)
    const { providerClass, packageDir } = await this.importProviderClass(packageName, base);

    // Step 5: Get manifest(s)
    const manifests = this.getManifests(providerClass, packageName);

    // Step 6: Match manifest by scheme
    const manifest = this.matchManifest(manifests, parsed.scheme, packageName);

    // Step 7: Parse template — extract path variables from URI body
    const templateVars = parseTemplate(manifest.uriTemplate, parsed.body);

    // Step 8: Merge params (body vars > query > mount.options)
    const mergedOptions = this.mergeOptions(templateVars, parsed.query, mount);

    // Step 9: Construct provider
    return this.constructProvider(
      providerClass,
      mount,
      parsed,
      mergedOptions,
      manifest,
      packageDir,
    );
  }

  /**
   * Import a provider class from a package name.
   * Resolution order:
   * 1. Direct import (works when package is a dependency of the importing module)
   * 2. createRequire from process.cwd() (works in monorepo dev environments)
   * 3. npm auto-install to ~/.afs-config/packages/
   *
   * Returns both the provider class and the resolved packageDir (for credential injection).
   */
  private async importProviderClass(
    packageName: string,
    scheme: string,
    explicitClassName?: string,
  ): Promise<{ providerClass: ProviderClassLike; packageDir?: string }> {
    let mod: Record<string, unknown>;
    let packageDir: string | undefined;

    try {
      const resolved = await this.resolveAndImport(packageName);
      mod = resolved.module;
      packageDir = resolved.packageDir;
    } catch {
      // Package not found locally — try npm auto-install.
      // This covers both @aigne/* packages (e.g. used from core without CLI)
      // and third-party packages.
      if (!isValidNpmPackageName(packageName)) {
        throw new Error(
          `Unknown URI scheme "${scheme}": package "${packageName}" not found and name is invalid.`,
        );
      }

      const platform = getPlatform();
      const packagesDir = await getNpmPackagesDir();
      const nodeModulesPath = platform.path.resolve(
        packagesDir,
        "node_modules",
        ...packageName.split("/"),
      );

      let packageExists = false;
      try {
        packageExists = await platform.fs!.exists(nodeModulesPath);
      } catch {
        // not found
      }

      if (!packageExists) {
        await npmInstall(packageName, packagesDir);
      } else {
        // Package exists — check for stale version and update in background
        npmUpdateIfStale(packageName, packagesDir).catch(() => {});
      }

      packageDir = nodeModulesPath;
      const importPath = await resolveImportPath(nodeModulesPath);
      try {
        mod = (await import(importPath)) as Record<string, unknown>;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to import provider package "${packageName}" for scheme "${scheme}": ${msg}`,
        );
      }
    }

    // Find the provider class in the module
    if (explicitClassName && mod[explicitClassName]) {
      return { providerClass: mod[explicitClassName] as ProviderClassLike, packageDir };
    }

    // Convention: try common export patterns
    // 1. Named export matching AFS{PascalCase}
    const conventionName = `AFS${scheme.charAt(0).toUpperCase()}${scheme.slice(1).toUpperCase()}`;
    if (mod[conventionName])
      return { providerClass: mod[conventionName] as ProviderClassLike, packageDir };

    // 2. Try common naming patterns for the scheme
    for (const key of Object.keys(mod)) {
      const val = mod[key];
      if (typeof val === "function" && key !== "default" && "manifest" in val) {
        return { providerClass: val as ProviderClassLike, packageDir };
      }
    }

    // 3. Default export
    if (mod.default && typeof mod.default === "function") {
      return { providerClass: mod.default as ProviderClassLike, packageDir };
    }

    throw new Error(
      `Package "${packageName}" does not export a valid AFS Provider class for scheme "${scheme}".`,
    );
  }

  /**
   * Get manifest(s) from a provider class.
   */
  private getManifests(ProviderClass: ProviderClassLike, packageName: string): ProviderManifest[] {
    if (!ProviderClass.manifest) {
      throw new Error(
        `Provider class from "${packageName}" does not implement static manifest(). ` +
          `Please add a static manifest() method to the provider class.`,
      );
    }

    const result = ProviderClass.manifest();
    return Array.isArray(result) ? result : [result];
  }

  /**
   * Find the matching manifest for a given scheme.
   * For multi-manifest providers (e.g., MCP with mcp+stdio, mcp+http, mcp+sse),
   * match by the full scheme from the URI template.
   */
  private matchManifest(
    manifests: ProviderManifest[],
    scheme: string,
    packageName: string,
  ): ProviderManifest {
    if (manifests.length === 1) {
      return manifests[0]!;
    }

    // Match by extracting scheme from each manifest's uriTemplate
    for (const m of manifests) {
      try {
        const templateScheme = extractSchemeFromTemplate(m.uriTemplate);
        if (templateScheme === scheme) return m;
      } catch {
        // Skip invalid templates
      }
    }

    // Fallback: use first manifest
    if (manifests.length > 0) {
      return manifests[0]!;
    }

    throw new Error(
      `No matching manifest found for scheme "${scheme}" in package "${packageName}".`,
    );
  }

  /**
   * Merge parameters from multiple sources.
   * Priority: template vars (from URI body) > query params > mount.options
   */
  private mergeOptions(
    templateVars: Record<string, string | undefined>,
    query: Record<string, string | string[]>,
    mount: MountConfig,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    // Start with mount.options (lowest priority)
    if (mount.options) {
      Object.assign(result, mount.options);
    }

    // Layer on query params (medium priority)
    for (const [key, value] of Object.entries(query)) {
      if (value !== "") {
        result[key] = value;
      }
    }

    // Layer on template vars (highest priority)
    for (const [key, value] of Object.entries(templateVars)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Construct a provider instance with merged options.
   * @param packageDir - resolved package directory, used to inject credential from .afs/credential.vc.json
   */
  private async constructProvider(
    ProviderClass: ProviderClassLike,
    mount: MountConfig,
    _parsed: ParsedURI,
    mergedOptions: Record<string, unknown>,
    manifest: ProviderManifest,
    packageDir?: string,
  ): Promise<AFSModule> {
    // Resolve env vars declared in manifest schema (e.g. AIGNE_HUB_API_KEY → apiKey)
    const envResolved = manifest.schema ? resolveEnvFromSchema(manifest.schema as any) : {};

    const constructorOptions: Record<string, unknown> = {
      ...envResolved,
      ...mergedOptions,
      name: mount.path.slice(1).replace(/\//g, "-") || manifest.name,
      description: mount.description,
      accessMode: mount.access_mode,
      uri: mount.uri,
    };

    // Only inject registry when the provider schema declares it (e.g. workspace).
    // Providers with .strict() schemas reject unknown keys, so unconditional injection breaks them.
    const schema = ProviderClass.schema?.();
    if (schema?.shape?.registry) {
      constructorOptions.registry = this;
    }

    // Mount-level auth/token passthrough
    if (mount.auth !== undefined) constructorOptions.auth = mount.auth;
    if (mount.token !== undefined) constructorOptions.token = mount.token;

    // Construct the provider — all normalization is handled by the provider itself
    const provider = new ProviderClass(constructorOptions);

    // Set registry on the provider after construction (not in constructor options)
    // to avoid strict Zod schema rejection of unknown keys
    (provider as { registry?: ProviderRegistry }).registry = this;

    // Generic post-construction initialization
    await provider.ready?.();

    // Inject credential from .did/vc.json if available (with .afs/credential.vc.json fallback)
    if (packageDir) {
      try {
        const trustPkg = "@aigne/afs-trust";
        const trust: any = await import(trustPkg);
        const { credential } = await trust.loadCredential(packageDir);
        if (credential)
          (provider as { credential?: Record<string, unknown> }).credential = credential;
      } catch {
        // @aigne/afs-trust not installed or credential read failed — silently skip
      }
    }

    return provider;
  }

  /**
   * Resolve and import a package, trying multiple resolution strategies.
   *
   * In a monorepo (pnpm workspace), `import("@aigne/afs-fs")` inside packages/core
   * won't find packages/cli's dependencies. We locate the package directory via
   * createRequire, then use resolveImportPath to find the correct ESM entry.
   *
   * Returns both the module and the resolved packageDir (for credential injection).
   */
  private async resolveAndImport(
    packageName: string,
  ): Promise<{ module: Record<string, unknown>; packageDir?: string }> {
    // Strategy 1: Direct import (works if package is a direct/transitive dependency)
    try {
      const importPath = await resolveImportPath(packageName);
      const mod = (await import(importPath)) as Record<string, unknown>;
      // For direct imports, try to locate packageDir separately for credential injection
      const dir = await this.locatePackageDir(packageName);
      return { module: mod, packageDir: dir };
    } catch {
      // Fall through to next strategy
    }

    // Strategy 2+3: Locate the package directory via createRequire,
    // then use resolveImportPath to find the correct ESM entry point.
    const packageDir = await this.locatePackageDir(packageName);
    if (packageDir) {
      const importPath = await resolveImportPath(packageDir);
      const mod = (await import(importPath)) as Record<string, unknown>;
      return { module: mod, packageDir };
    }

    // Strategy 4: pnpm workspace scan — packages in providers/* and packages/*
    // aren't hoisted to root node_modules, so createRequire can't find them.
    const workspaceDir = await locateInWorkspace(packageName);
    if (workspaceDir) {
      const importPath = await resolveImportPath(workspaceDir);
      const mod = (await import(importPath)) as Record<string, unknown>;
      return { module: mod, packageDir: workspaceDir };
    }

    // All strategies failed
    throw new Error(`Cannot resolve module "${packageName}"`);
  }

  /**
   * Locate a package directory using createRequire from various contexts.
   * Returns the package directory path, or undefined if not found.
   */
  private async locatePackageDir(packageName: string): Promise<string | undefined> {
    const platform = getPlatform();
    if (!platform.capabilities.has("module.require")) return undefined;
    const { createRequire } = await import(/* webpackIgnore: true */ "node:module");

    // Try resolving the package's package.json to find its directory
    const contexts = [
      platform.path.join(process.cwd(), "__resolve__.js"),
      ...(process.argv[1]
        ? [platform.path.join(platform.path.dirname(process.argv[1]), "__resolve__.js")]
        : []),
    ];

    for (const context of contexts) {
      try {
        const req = createRequire(context);
        // Resolve package.json to get the package directory reliably
        const pkgJsonPath = req.resolve(platform.path.join(packageName, "package.json"));
        return platform.path.dirname(pkgJsonPath);
      } catch {
        // Try resolving the main entry and walking up to find package.json
        try {
          const req = createRequire(context);
          const resolvedEntry = req.resolve(packageName);
          // Walk up from the resolved entry to find the package root
          let dir = platform.path.dirname(resolvedEntry);
          for (let i = 0; i < 5; i++) {
            try {
              const exists = await platform.fs!.exists(platform.path.join(dir, "package.json"));
              if (exists) return dir;
            } catch {
              // not found — continue
            }
            const parent = platform.path.dirname(dir);
            if (parent === dir) break;
            dir = parent;
          }
        } catch {
          // Continue to next context
        }
      }
    }

    return undefined;
  }
}

/**
 * Provider class shape (what we expect from importing a provider package).
 */
type ProviderClassLike = {
  manifest?(): ProviderManifest | ProviderManifest[];
  schema?(): any;
  auth?(context: any): Promise<Record<string, unknown> | null>;
  new (options: any): AFSModule;
};
