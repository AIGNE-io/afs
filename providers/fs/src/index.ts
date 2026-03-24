import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import type {
  AFSAccessMode,
  AFSDeleteOptions,
  AFSDeleteResult,
  AFSEntry,
  AFSExecResult,
  AFSExplainOptions,
  AFSExplainResult,
  AFSListOptions,
  AFSModuleClass,
  AFSModuleLoadParams,
  AFSRenameOptions,
  AFSRenameResult,
  AFSRoot,
  AFSSearchOptions,
  AFSSearchResult,
  AFSStatResult,
  AFSWriteEntryPayload,
  AFSWriteResult,
  CapabilitiesManifest,
  KindSchema,
  ProviderManifest,
  ProviderTreeSchema,
  RouteContext,
} from "@aigne/afs";
import {
  Actions,
  AFSBaseProvider,
  AFSNotFoundError,
  Delete,
  Exec,
  Explain,
  findMountByURI,
  List,
  Meta,
  Read,
  Rename,
  resolveKindSchema,
  Search,
  Stat,
  Write,
} from "@aigne/afs";
import { camelize, optionalize, zodParse } from "@aigne/afs/utils/zod";
import {
  assertPathWithinRoot,
  getMimeType,
  isBinaryFile,
  resolveLocalPath,
} from "@aigne/afs-provider-utils";
import ignore from "ignore";
import { dump as yamlDump, load as yamlLoad } from "js-yaml";
import { minimatch } from "minimatch";
import { joinURL } from "ufo";
import { z } from "zod";
import { searchWithRipgrep } from "./utils/ripgrep.js";

const LIST_MAX_LIMIT = 1000;

/**
 * Wrap fs ENOENT errors with AFSNotFoundError for consistent error handling.
 * Re-throws other errors unchanged.
 */
function wrapNotFoundError(error: unknown, path: string): never {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    throw new AFSNotFoundError(path);
  }
  throw error;
}

/** Hidden directory name for storing meta data */
const AFS_META_DIR = ".afs";

/** AUP recipe directory — hidden from listings like .afs */
const AUP_RECIPE_DIR = ".aup";

/** Subdirectory for storing file-level meta (to avoid conflicts with directory resources) */
const AFS_NODES_DIR = ".nodes";

/** Meta file name */
const META_FILE = "meta.yaml";

export interface AFSFSOptions {
  name?: string;
  localPath: string;
  description?: string;
  ignore?: string[];
  /**
   * Whether to apply .gitignore rules.
   * @default false
   */
  useGitignore?: boolean;
  /**
   * Whether to apply .afsignore rules.
   * @default true
   */
  useAfsignore?: boolean;
  /**
   * Access mode for this module.
   * - "readonly": Only read operations are allowed
   * - "readwrite": All operations are allowed (default, unless agentSkills is enabled)
   * @default "readwrite" (or "readonly" when agentSkills is true)
   */
  accessMode?: AFSAccessMode;
  /**
   * Enable automatic agent skill scanning for this module.
   * When enabled, defaults accessMode to "readonly" if not explicitly set.
   * @default false
   */
  agentSkills?: boolean;
}

const afsFSOptionsSchema = camelize(
  z.object({
    name: optionalize(z.string()),
    localPath: z.string().describe("The path to the local directory to mount"),
    description: optionalize(z.string().describe("A description of the mounted directory")),
    ignore: optionalize(z.array(z.string())),
    useGitignore: optionalize(z.boolean().describe("Whether to apply .gitignore rules")),
    useAfsignore: optionalize(z.boolean().describe("Whether to apply .afsignore rules")),
    accessMode: optionalize(
      z.enum(["readonly", "readwrite"]).describe("Access mode for this module"),
    ),
    agentSkills: optionalize(
      z.boolean().describe("Enable automatic agent skill scanning for this module"),
    ),
  }),
);

export class AFSFS extends AFSBaseProvider {
  static schema() {
    return afsFSOptionsSchema;
  }

  static manifest(): ProviderManifest {
    return {
      name: "fs",
      description:
        "Local filesystem directory access.\n- Browse directories, read/write files, search content by pattern\n- Exec actions: `archive` (create tar.gz/zip), `checksum` (MD5/SHA)\n- Path structure: direct filesystem paths (e.g., `/docs/guide.md`)",
      uriTemplate: "fs://{localPath+}",
      category: "storage",
      schema: z.object({ localPath: z.string() }),
      tags: ["local", "filesystem"],
      capabilityTags: ["read-write", "crud", "search", "auth:none", "local"],
      security: {
        riskLevel: "local",
        resourceAccess: ["local-filesystem"],
        dataSensitivity: ["code"],
        notes: ["Exposes a local directory — scope is limited to the configured localPath"],
      },
      capabilities: {
        filesystem: { read: true, write: true, allowedPaths: ["${localPath}/**"] },
      },
    };
  }

  static treeSchema(): ProviderTreeSchema {
    return {
      operations: ["list", "read", "write", "delete", "search", "stat", "explain"],
      tree: {
        "/": { kind: "fs:directory" },
        "/{path}": { kind: "fs:file" },
      },
      auth: { type: "none" },
      bestFor: ["local file access", "project source code", "config files"],
      notFor: ["remote storage", "large binary files"],
    };
  }

  static async load({ basePath, config }: AFSModuleLoadParams = {}) {
    const valid = await AFSFS.schema().parseAsync(config);

    return new AFSFS({ ...valid, cwd: basePath });
  }

  override readonly name: string;

  override readonly description?: string;

  override readonly accessMode: AFSAccessMode;

  constructor(public options: AFSFSOptions & { cwd?: string }) {
    super();
    zodParse(afsFSOptionsSchema, options);

    const localPath = resolveLocalPath(options.localPath, { cwd: options.cwd });

    this.name = options.name || basename(localPath) || "fs";
    this.description = options.description;
    this.agentSkills = options.agentSkills;
    // Default to "readwrite", but "readonly" if agentSkills is enabled
    this.accessMode = options.accessMode ?? (options.agentSkills ? "readonly" : "readwrite");
    this.options.localPath = localPath;

    // Ignore options with defaults
    this.useGitignore = options.useGitignore ?? false;
    this.useAfsignore = options.useAfsignore ?? true;
  }

  agentSkills?: boolean;
  private afsRoot?: AFSRoot;

  onMount(afs: AFSRoot): void {
    this.afsRoot = afs;
    // Scan for existing .ash files and emit script:registered events
    this.scanAshScripts().catch(() => {});
  }

  /** Recursively scan for .ash files and emit script:registered events */
  private async scanAshScripts(dir?: string): Promise<void> {
    const scanDir = dir ?? this.options.localPath;
    let items: string[];
    try {
      items = await readdir(scanDir);
    } catch {
      return;
    }
    for (const item of items) {
      if (this.isHiddenAfsDir(item)) continue;
      const fullPath = join(scanDir, item);
      try {
        const s = await stat(fullPath);
        if (s.isDirectory()) {
          await this.scanAshScripts(fullPath);
        } else if (item.endsWith(".ash")) {
          const relPath = join("/", relative(this.options.localPath, fullPath));
          this.emit({
            type: "script:registered",
            path: relPath,
            data: { runtime: "ash" },
          });
        }
      } catch {
        // skip unreadable entries
      }
    }
  }

  async ready(): Promise<void> {
    const { localPath } = this.options;
    if (!existsSync(localPath)) {
      mkdirSync(localPath, { recursive: true });
    }
  }

  /** Whether to apply .gitignore rules (default: false) */
  private useGitignore: boolean;

  /** Whether to apply .afsignore rules (default: true) */
  private useAfsignore: boolean;

  private async assertWithinMount(fullPath: string): Promise<void> {
    return assertPathWithinRoot(fullPath, this.options.localPath);
  }

  private get localPathExists() {
    return stat(this.options.localPath)
      .then(() => true)
      .catch(() => false);
  }

  /**
   * Check if a segment is the hidden .afs directory.
   * Used to hide .afs from directory listings.
   */
  private isHiddenAfsDir(segment: string): boolean {
    return segment === AFS_META_DIR || segment === AUP_RECIPE_DIR;
  }

  /**
   * Get the physical storage path for a meta operation.
   *
   * Virtual path mapping:
   * - /dir/.meta → /dir/.afs/meta.yaml
   * - /dir/file.txt/.meta → /dir/.afs/.nodes/file.txt/meta.yaml
   */
  private getMetaStoragePath(nodePath: string, isDirectory: boolean): string {
    const mountRoot = this.options.localPath;
    const normalizedNodePath = nodePath === "/" ? "" : nodePath;
    const nodeFullPath = join(mountRoot, normalizedNodePath);
    const parentDir = dirname(nodeFullPath);
    const nodeName = basename(nodeFullPath);

    if (isDirectory || normalizedNodePath === "") {
      // Directory meta: /dir/.afs/meta.yaml
      return join(nodeFullPath, AFS_META_DIR, META_FILE);
    }
    // File meta: /parent/.afs/.nodes/{filename}/meta.yaml
    return join(parentDir, AFS_META_DIR, AFS_NODES_DIR, nodeName, META_FILE);
  }

  /**
   * Check if a node is a directory (exists and is directory)
   */
  private async isNodeDirectory(nodePath: string): Promise<boolean> {
    const mountRoot = this.options.localPath;
    const normalizedPath = nodePath === "/" ? "" : nodePath;
    const fullPath = join(mountRoot, normalizedPath);
    try {
      const stats = await stat(fullPath);
      return stats.isDirectory();
    } catch {
      // If the path doesn't exist, treat it as a directory (for root-level operations)
      return nodePath === "/";
    }
  }

  /**
   * Load meta object from storage (returns null if not found)
   */
  private async loadMeta(nodePath: string): Promise<Record<string, unknown> | null> {
    try {
      const isDir = await this.isNodeDirectory(nodePath);
      const storagePath = this.getMetaStoragePath(nodePath, isDir);
      const content = await readFile(storagePath, "utf8");
      return yamlLoad(content) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /**
   * Save metadata to meta.yaml (merges with existing)
   * Used internally by writeHandler to persist user metadata
   */
  private async saveMeta(nodePath: string, meta: Record<string, unknown>): Promise<void> {
    const isDir = await this.isNodeDirectory(nodePath);
    const storagePath = this.getMetaStoragePath(nodePath, isDir);

    // Ensure parent directory exists
    const parentDir = dirname(storagePath);
    await mkdir(parentDir, { recursive: true });

    // Read existing meta for merging
    let existingMeta: Record<string, unknown> = {};
    const existing = await this.loadMeta(nodePath);
    if (existing) {
      existingMeta = existing;
    }

    // Merge new metadata with existing
    const finalMeta = { ...existingMeta, ...meta };
    await writeFile(storagePath, yamlDump(finalMeta), "utf8");
  }

  /**
   * Read meta for a node silently (returns undefined if no meta exists).
   * Used internally by list/search/read methods.
   */
  private async getNodeMeta(
    nodePath: string,
  ): Promise<{ meta?: Record<string, unknown>; kind?: string } | undefined> {
    const meta = await this.loadMeta(nodePath);
    if (!meta) {
      return undefined;
    }
    const kind = typeof meta.kind === "string" ? meta.kind : undefined;
    return { meta, kind };
  }

  async symlinkToPhysical(path: string): Promise<void> {
    if (await this.localPathExists) {
      await symlink(this.options.localPath, path);
    }
  }

  // ========== Meta Handlers ==========
  // @Meta is read-only introspection. Metadata writes are handled by @Write via payload.meta.

  // Read meta.yaml (e.g., /.meta or /path/.meta)
  @Meta("/:path*")
  async readMetaHandler(ctx: RouteContext<{ path?: string }>): Promise<AFSEntry> {
    const nodePath = joinURL("/", ctx.params.path ?? "");
    // Use joinURL to properly construct meta path (handles root path correctly)
    const metaPath = joinURL(nodePath, ".meta");

    // First, verify the node itself exists
    const nodeFullPath = join(this.options.localPath, nodePath);
    let nodeStats: Awaited<ReturnType<typeof stat>>;
    try {
      nodeStats = await stat(nodeFullPath);
    } catch (error) {
      // Node doesn't exist - throw error
      wrapNotFoundError(error, metaPath);
    }

    const isDir = nodeStats.isDirectory();
    const storagePath = this.getMetaStoragePath(nodePath, isDir);

    // Try to read meta file - if it doesn't exist, return empty metadata
    let meta: Record<string, unknown> = {};
    let metaStats: Awaited<ReturnType<typeof stat>> | null = null;
    try {
      metaStats = await stat(storagePath);
      const content = await readFile(storagePath, "utf8");
      meta = (yamlLoad(content) as Record<string, unknown>) || {};
    } catch {
      // Meta file doesn't exist - return empty metadata (this is valid)
    }

    return {
      id: nodePath,
      path: metaPath,
      createdAt: metaStats?.birthtime ?? nodeStats.birthtime,
      updatedAt: metaStats?.mtime ?? nodeStats.mtime,
      meta: meta,
    };
  }

  // ========== General Handlers ==========
  // Note: Metadata writes are handled by @Write("/:path*") via payload.meta (spec compliant).
  // .meta paths are READ-ONLY - no @Write("/:path*/.meta") handler per spec.
  // No need for isMetaPath checks - suffix patterns handle .meta routing

  // List handler - base provider handles depth expansion via BFS (default behavior).
  // This handler only returns single-level results (direct children of the requested path).
  // Note: .meta paths are handled by suffix pattern decorator via URLPattern matching.
  @List("/:path*")
  async listHandler(
    ctx: RouteContext<{ path?: string }>,
  ): Promise<{ data: AFSEntry[]; total?: number; noExpand?: string[] }> {
    const options = ctx.options as AFSListOptions | undefined;
    // Use ctx.path directly (not params) because base provider BFS sets params: {}
    const path = join("/", ctx.path);

    const limit = Math.min(options?.limit || LIST_MAX_LIMIT, LIST_MAX_LIMIT);
    const maxChildren =
      typeof options?.maxChildren === "number" ? options.maxChildren : Number.MAX_SAFE_INTEGER;
    const pattern = options?.pattern;
    const mountRoot = this.options.localPath;

    // Check if localPath is a file (not a directory)
    const mountStats = await stat(mountRoot);
    if (!mountStats.isDirectory()) {
      // Mounted path is a file - files have no children
      // Note: list() returns only children, never the path itself (per new semantics)
      return { data: [] };
    }

    const fullPath = join(mountRoot, path.slice(1));

    // Validate maxChildren
    if (typeof maxChildren === "number" && maxChildren <= 0) {
      throw new Error(`Invalid maxChildren: ${maxChildren}. Must be positive.`);
    }

    const entries: AFSEntry[] = [];
    const noExpandPaths: string[] = [];

    // Get stats for the current path - throws AFSNotFoundError if path doesn't exist
    let stats: Awaited<ReturnType<typeof stat>>;
    try {
      stats = await stat(fullPath);
    } catch (error) {
      wrapNotFoundError(error, path);
    }

    const isDirectory = stats.isDirectory();

    if (!isDirectory) {
      // Files have no children - return empty array
      // Note: list() returns only children, never the path itself (per new semantics)
      return { data: [] };
    }

    // List directory contents (single level only - base provider handles depth expansion)
    // Note: list() returns only children, never the path itself (per new semantics)
    const items = (await readdir(fullPath)).sort().filter((name) => !this.isHiddenAfsDir(name));

    // Load ignore rules
    const ignoreResult = await this.loadIgnoreRules(fullPath, mountRoot);
    const ig = ignoreResult?.ig || null;
    const ignoreBase = ignoreResult?.ignoreBase || mountRoot;
    const mountIgnorePatterns =
      (ignoreResult as { mountIgnorePatterns?: string[] })?.mountIgnorePatterns || [];
    const negationPatterns =
      (ignoreResult as { negationPatterns?: string[] })?.negationPatterns || [];

    // Apply maxChildren limit
    const itemsToProcess = items.length > maxChildren ? items.slice(0, maxChildren) : items;

    // Cache realpath of mount root for symlink checks (computed once per list call)
    const realMountRoot = await realpath(mountRoot);
    const realMountPrefix = `${realMountRoot}/`;

    for (const childName of itemsToProcess) {
      if (entries.length >= limit) break;

      const childFullPath = join(fullPath, childName);
      const childRelativePath = joinURL(path, childName);
      const itemRelativePath = relative(ignoreBase, childFullPath);

      // Check ignore status
      let isIgnored = false;

      // Mount ignore has highest priority - cannot be overridden
      if (this.isIgnoredByMountPatterns(itemRelativePath, mountIgnorePatterns)) {
        isIgnored = true;
      } else if (this.isNegatedByPatterns(itemRelativePath, negationPatterns)) {
        // This path is negated - it should NOT be ignored
        isIgnored = false;
      } else if (ig) {
        isIgnored = ig.ignores(itemRelativePath) || ig.ignores(`${itemRelativePath}/`);
      }

      // Handle race condition: file may be deleted between readdir and stat
      let childStats: Awaited<ReturnType<typeof stat>>;
      try {
        childStats = await stat(childFullPath);
      } catch (err: any) {
        if (err.code === "ENOENT") {
          // File was deleted between readdir and stat - skip it
          continue;
        }
        throw err;
      }

      // Skip symlinks that escape the mount root — consistent with read/write guards
      try {
        const realChild = await realpath(childFullPath);
        if (realChild !== realMountRoot && !realChild.startsWith(realMountPrefix)) {
          continue; // Symlink points outside mount — hide from listing
        }
      } catch {
        // realpath failed (broken symlink, etc.) — skip entry
        continue;
      }
      const childIsDirectory = childStats.isDirectory();

      // Ignored FILES are hidden (not visible)
      // Ignored DIRECTORIES are visible but marked as noExpand to prevent BFS recursion
      const isIgnoredFile = isIgnored && !childIsDirectory;
      if (isIgnoredFile) {
        continue; // Skip ignored files
      }

      let childrenCount: number | undefined;
      if (childIsDirectory) {
        try {
          const childItems = (await readdir(childFullPath)).filter((n) => !this.isHiddenAfsDir(n));
          // Exclude children whose realpath escapes mount root (symlink filter)
          let visibleCount = 0;
          for (const name of childItems) {
            try {
              const rc = await realpath(join(childFullPath, name));
              if (rc === realMountRoot || rc.startsWith(realMountPrefix)) {
                visibleCount++;
              }
            } catch {
              // broken symlink — don't count
            }
          }
          childrenCount = visibleCount;
        } catch (err: any) {
          if (err.code === "ENOENT") {
            // Directory was deleted - skip it
            continue;
          }
          throw err;
        }
        if (isIgnored) {
          // Check if there are negation patterns that could match descendants
          const mayHaveNegatedDescendants = this.hasNegatedDescendants(
            itemRelativePath,
            negationPatterns,
          );
          // If ignored and no negated descendants, add to noExpand to prevent BFS expansion
          if (!mayHaveNegatedDescendants) {
            noExpandPaths.push(childRelativePath);
          }
        }
      }

      // Read meta if exists
      const nodeMeta = await this.getNodeMeta(childRelativePath);

      const meta: Record<string, any> = {
        ...nodeMeta?.meta,
        childrenCount,
        size: childStats.size,
        kind: nodeMeta?.kind ?? (childIsDirectory ? "fs:directory" : "fs:file"),
      };

      if (!childIsDirectory) {
        meta.mimeType = getMimeType(childFullPath);
      }

      const entry: AFSEntry = {
        id: childRelativePath,
        path: childRelativePath,
        createdAt: childStats.birthtime,
        updatedAt: childStats.mtime,
        meta,
      };

      // Apply pattern filter if specified in options
      // Note: When base provider calls us for BFS expansion, pattern is set to undefined
      // so we return all entries for BFS. Pattern filtering happens in base provider after BFS.
      const matchesPattern = !pattern || minimatch(childRelativePath, pattern, { matchBase: true });
      if (matchesPattern) {
        entries.push(entry);
      }
    }

    return { data: entries, noExpand: noExpandPaths.length > 0 ? noExpandPaths : undefined };
  }

  // Read handler for regular file/directory access.
  // Note: .meta paths are handled by dedicated suffix pattern decorators.
  @Read("/:path*")
  async readHandler(ctx: RouteContext<{ path?: string }>): Promise<AFSEntry | undefined> {
    // Use ctx.path directly for consistency with how base provider calls handlers
    const path = ctx.path;
    // Use absolute path (with leading /) for consistency across providers
    const normalizedPath = join("/", path);

    const mountRoot = this.options.localPath;
    const mountStats = await stat(mountRoot);

    let fullPath: string;
    let stats: Awaited<ReturnType<typeof stat>>;

    try {
      // Handle file mount case
      if (!mountStats.isDirectory()) {
        // For file mounts, only "/" or empty path is valid
        if (normalizedPath !== "/") {
          return undefined;
        }
        fullPath = mountRoot;
        stats = mountStats;
      } else {
        // Directory mount - normal case
        fullPath = join(mountRoot, path);
        await this.assertWithinMount(fullPath);
        stats = await stat(fullPath);
      }
    } catch (error) {
      wrapNotFoundError(error, normalizedPath);
    }

    let content: string | undefined;

    // Read meta if exists
    const nodeMeta = await this.getNodeMeta(normalizedPath);

    const meta: Record<string, any> = {
      size: stats.size,
      // Spread user-defined meta fields directly
      ...nodeMeta?.meta,
      kind: nodeMeta?.kind,
    };

    if (stats.isDirectory()) {
      // Count children for directories
      const children = await readdir(fullPath);
      meta.childrenCount = children.filter((c) => !this.isHiddenAfsDir(c)).length;
    } else if (stats.isFile()) {
      // Determine mimeType based on file extension
      const mimeType = getMimeType(fullPath);
      const isBinary = isBinaryFile(fullPath);
      meta.mimeType = mimeType;

      if (isBinary) {
        // For binary files, read as buffer and convert to base64
        const buffer = await readFile(fullPath);
        content = buffer.toString("base64");
        // Mark content as base64 in metadata
        meta.contentType = "base64";
      } else {
        // For text files, read as utf8
        content = await readFile(fullPath, "utf8");
      }
    }

    return {
      id: normalizedPath,
      path: normalizedPath,
      createdAt: stats.birthtime,
      updatedAt: stats.mtime,
      content,
      meta,
    };
  }

  // Write handler for regular file/directory access.
  // Note: .meta paths are handled by dedicated suffix pattern decorators.
  @Write("/:path*")
  async writeHandler(
    ctx: RouteContext<{ path?: string }>,
    entry: AFSWriteEntryPayload,
  ): Promise<AFSWriteResult> {
    const path = ctx.path;
    // Use absolute path (with leading /) for consistency across providers
    const normalizedPath = join("/", path);

    const fullPath = join(this.options.localPath, path);
    await this.assertWithinMount(fullPath);

    // Ensure parent directory exists
    const parentDir = dirname(fullPath);
    await mkdir(parentDir, { recursive: true });

    // Write content if provided (only "replace" mode reaches here; append/prepend handled by BaseProvider)
    if (entry.content !== undefined) {
      let contentToWrite: string;
      if (typeof entry.content === "string") {
        contentToWrite = entry.content;
      } else {
        contentToWrite = JSON.stringify(entry.content, null, 2);
      }
      await writeFile(fullPath, contentToWrite, { encoding: "utf8" });
    }

    // Write metadata to .afs/meta.yaml if provided (merge with existing)
    if (entry.meta && Object.keys(entry.meta).length > 0) {
      // Filter out built-in fields that shouldn't be persisted
      const { size: _size, mimeType: _mime, childrenCount: _cc, ...metaToPersist } = entry.meta;
      if (Object.keys(metaToPersist).length > 0) {
        await this.saveMeta(path, metaToPersist);
      }
    }

    // Get file stats after writing
    const stats = await stat(fullPath);

    // Read back merged metadata
    let finalMetadata: Record<string, unknown> = { size: stats.size };
    const meta = await this.loadMeta(path);
    if (meta) {
      finalMetadata = { ...meta, size: stats.size };
    }

    const writtenEntry: AFSEntry = {
      id: normalizedPath,
      path: normalizedPath,
      createdAt: stats.birthtime,
      updatedAt: stats.mtime,
      content: entry.content,
      summary: entry.summary,
      meta: finalMetadata,
      userId: entry.userId,
      sessionId: entry.sessionId,
      linkTo: entry.linkTo,
    };

    // Emit script:registered for .ash files
    if (normalizedPath.endsWith(".ash")) {
      this.emit({
        type: "script:registered",
        path: normalizedPath,
        data: { runtime: "ash" },
      });
    }

    return { data: writtenEntry };
  }

  @Delete("/:path*")
  async deleteHandler(ctx: RouteContext<{ path?: string }>): Promise<AFSDeleteResult> {
    // Use normalized path for operations, but strip leading slash for messages (backward compatibility)
    const path = ctx.path;
    const displayPath = path === "/" ? "/" : path.slice(1);
    const options = ctx.options as AFSDeleteOptions | undefined;
    const fullPath = join(this.options.localPath, path);
    await this.assertWithinMount(fullPath);
    const recursive = options?.recursive ?? false;

    let stats: Awaited<ReturnType<typeof stat>>;
    try {
      stats = await stat(fullPath);
    } catch (error) {
      wrapNotFoundError(error, path);
    }

    // If it's a directory and recursive is false, throw an error
    if (stats.isDirectory() && !recursive) {
      throw new Error(
        `Cannot delete directory '${displayPath}' without recursive option. Set recursive: true to delete directories.`,
      );
    }

    // Check if we're deleting a .ash file before removing
    const isAshScript = !stats.isDirectory() && path.endsWith(".ash");

    await rm(fullPath, { recursive, force: true });

    // Emit script:unregistered for .ash files
    if (isAshScript) {
      const normalizedPath = join("/", path);
      this.emit({
        type: "script:unregistered",
        path: normalizedPath,
        data: { runtime: "ash" },
      });
    }

    return { message: `Successfully deleted: ${displayPath}` };
  }

  @Rename("/:path*")
  async renameHandler(
    ctx: RouteContext<{ path?: string }>,
    newPath: string,
  ): Promise<AFSRenameResult> {
    const oldPath = ctx.path;
    // Use normalized path for operations, but strip leading slash for messages (backward compatibility)
    const displayOldPath = oldPath === "/" ? "/" : oldPath.slice(1);
    const overwrite = (ctx.options as AFSRenameOptions)?.overwrite ?? false;

    const oldFullPath = join(this.options.localPath, oldPath);
    const newFullPath = join(this.options.localPath, newPath);
    await this.assertWithinMount(oldFullPath);
    await this.assertWithinMount(newFullPath);

    // Check if source exists
    try {
      await stat(oldFullPath);
    } catch (error) {
      wrapNotFoundError(error, oldPath);
    }

    // Check if destination exists
    try {
      await stat(newFullPath);
      if (!overwrite) {
        throw new Error(
          `Destination '${newPath}' already exists. Set overwrite: true to replace it.`,
        );
      }
    } catch (error) {
      // Destination doesn't exist, which is fine
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    // Ensure parent directory of new path exists
    const newParentDir = dirname(newFullPath);
    await mkdir(newParentDir, { recursive: true });

    // Perform the rename/move
    await rename(oldFullPath, newFullPath);

    return { message: `Successfully renamed '${displayOldPath}' to '${newPath}'` };
  }

  @Search("/:path*")
  async searchHandler(
    ctx: RouteContext<{ path?: string }>,
    query: string,
    options?: AFSSearchOptions,
  ): Promise<AFSSearchResult> {
    const path = ctx.path;
    const limit = Math.min(options?.limit || LIST_MAX_LIMIT, LIST_MAX_LIMIT);
    const mountRoot = this.options.localPath;
    const basePath = join(mountRoot, path);

    // Verify path exists before searching
    try {
      await stat(basePath);
    } catch (error) {
      wrapNotFoundError(error, path);
    }

    const matches = await searchWithRipgrep(basePath, query, options);

    // Load ignore rules for the search base path
    const ignoreResult = await this.loadIgnoreRules(basePath, mountRoot);
    const ig = ignoreResult?.ig || null;
    const mountIgnorePatterns =
      (ignoreResult as { mountIgnorePatterns?: string[] })?.mountIgnorePatterns || [];

    const entries: AFSEntry[] = [];
    const processedFiles = new Set<string>();
    let hasMoreFiles = false;

    for (const match of matches) {
      if (match.type === "match" && match.data.path) {
        const absolutePath = match.data.path.text;
        const itemRelativePath = joinURL(path, relative(basePath, absolutePath));
        const pathFromRoot = relative(mountRoot, absolutePath);

        // Check if file is ignored
        if (this.isIgnoredByMountPatterns(pathFromRoot, mountIgnorePatterns)) {
          continue;
        }
        if (ig && (ig.ignores(pathFromRoot) || ig.ignores(`${pathFromRoot}/`))) {
          continue;
        }

        // Avoid duplicate files
        if (processedFiles.has(itemRelativePath)) continue;
        processedFiles.add(itemRelativePath);

        // Use absolute path (with leading /) for consistency across providers
        const normalizedEntryPath = join("/", itemRelativePath);

        const stats = await stat(absolutePath);

        // Read meta if exists
        const nodeMeta = await this.getNodeMeta(itemRelativePath);

        const entry: AFSEntry = {
          id: normalizedEntryPath,
          path: normalizedEntryPath,
          createdAt: stats.birthtime,
          updatedAt: stats.mtime,
          summary: match.data.lines?.text,
          meta: {
            size: stats.size,
            // Spread user-defined meta fields directly
            ...nodeMeta?.meta,
            kind: nodeMeta?.kind,
          },
        };

        entries.push(entry);

        if (entries.length >= limit) {
          hasMoreFiles = true;
          break;
        }
      }
    }

    return {
      data: entries,
      message: hasMoreFiles ? `Results truncated to limit ${limit}` : undefined,
    };
  }

  @Stat("/:path*")
  async statHandler(ctx: RouteContext<{ path?: string }>): Promise<AFSStatResult> {
    const normalizedPath = ctx.path;

    const fullPath = join(this.options.localPath, normalizedPath);
    let stats: Awaited<ReturnType<typeof stat>>;
    try {
      stats = await stat(fullPath);
    } catch (error) {
      wrapNotFoundError(error, normalizedPath);
    }

    // Try to read meta first
    const loadedMeta = await this.loadMeta(normalizedPath);
    const meta: Record<string, unknown> = { ...loadedMeta };

    if (stats.isFile()) {
      meta.size = stats.size;
    } else if (stats.isDirectory()) {
      // Count children for directories
      const children = await readdir(fullPath);
      meta.childrenCount = children.filter((c) => !this.isHiddenAfsDir(c)).length;
    }

    const result: NonNullable<AFSStatResult["data"]> = {
      id: basename(normalizedPath) || "/",
      path: normalizedPath,
      updatedAt: stats.mtime,
      createdAt: stats.birthtime,
      meta,
    };

    return { data: result };
  }

  @Explain("/:path*")
  async explainHandler(ctx: RouteContext<{ path?: string }>): Promise<AFSExplainResult> {
    const normalizedPath = ctx.path;
    const format = (ctx.options as AFSExplainOptions)?.format || "markdown";

    const fullPath = join(this.options.localPath, normalizedPath);
    const stats = await stat(fullPath);
    const isDir = stats.isDirectory();
    const nodeName = basename(normalizedPath) || "/";

    // Convention: if .afs/README.md exists, use it as the explain content
    if (isDir) {
      try {
        const readmePath = join(fullPath, ".afs", "README.md");
        const readmeContent = await readFile(readmePath, "utf-8");
        if (readmeContent) {
          return { content: readmeContent, format: "markdown" };
        }
      } catch {
        /* no .afs/README.md — continue with default explain */
      }
    }

    // Get meta if available
    const meta = await this.loadMeta(normalizedPath);

    // Get kind schema if available
    let kindSchema: KindSchema | undefined;
    if (meta?.kind && typeof meta.kind === "string") {
      kindSchema = resolveKindSchema(meta.kind);
    }

    // Get children for directories
    let children: string[] = [];
    if (isDir) {
      const items = await readdir(fullPath);
      children = items.filter((item) => !this.isHiddenAfsDir(item)).sort();
    }

    // Build the explanation
    const lines: string[] = [];

    if (format === "markdown") {
      // Markdown format
      lines.push(`# ${nodeName}`);
      lines.push("");
      lines.push(`**Path:** \`${normalizedPath}\``);
      lines.push(`**Type:** ${isDir ? "directory" : "file"}`);

      if (!isDir) {
        lines.push(`**Size:** ${stats.size} bytes`);
      }

      if (meta) {
        lines.push("");
        lines.push("## Metadata");

        if (meta.kind) {
          lines.push(`**Kind:** \`${meta.kind}\``);
        }

        if (meta.name) {
          lines.push(`**Name:** ${meta.name}`);
        }

        if (meta.description) {
          lines.push(`**Description:** ${meta.description}`);
        }

        // Other meta properties
        const otherProps = Object.entries(meta).filter(
          ([key]) => !["kind", "name", "description"].includes(key),
        );
        if (otherProps.length > 0) {
          lines.push("");
          for (const [key, value] of otherProps) {
            lines.push(`- **${key}:** ${JSON.stringify(value)}`);
          }
        }
      }

      if (kindSchema) {
        lines.push("");
        lines.push("## Kind Schema");
        lines.push(`This node is of kind \`${kindSchema.name}\`.`);
        if (kindSchema.description) {
          lines.push(`> ${kindSchema.description}`);
        }
        if (kindSchema.extends) {
          lines.push(`Extends: \`${kindSchema.extends}\``);
        }
      }

      if (isDir && children.length > 0) {
        lines.push("");
        lines.push("## Contents");
        lines.push("");
        for (const child of children.slice(0, 20)) {
          lines.push(`- ${child}`);
        }
        if (children.length > 20) {
          lines.push(`- ... and ${children.length - 20} more`);
        }
      } else if (isDir) {
        lines.push("");
        lines.push("*This directory is empty.*");
      }
    } else {
      // Text format (plain)
      lines.push(`${nodeName} (${isDir ? "directory" : "file"})`);
      lines.push(`Path: ${normalizedPath}`);

      if (!isDir) {
        lines.push(`Size: ${stats.size} bytes`);
      }

      if (meta) {
        if (meta.kind) {
          lines.push(`Kind: ${meta.kind}`);
        }
        if (meta.name) {
          lines.push(`Name: ${meta.name}`);
        }
        if (meta.description) {
          lines.push(`Description: ${meta.description}`);
        }
      }

      if (isDir && children.length > 0) {
        lines.push("");
        lines.push("Contents:");
        for (const child of children.slice(0, 20)) {
          lines.push(`  - ${child}`);
        }
        if (children.length > 20) {
          lines.push(`  ... and ${children.length - 20} more`);
        }
      }
    }

    return {
      content: lines.join("\n"),
      format,
    };
  }

  // ========== Capabilities ==========

  @Read("/.meta/.capabilities")
  async readCapabilitiesHandler(_ctx: RouteContext): Promise<AFSEntry | undefined> {
    const operations = ["list", "read", "stat", "explain", "search"];
    if (this.accessMode === "readwrite") {
      operations.push("write", "delete", "rename");
    }

    const manifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: this.name,
      description: this.description || "Local filesystem provider",
      tools: [],
      operations: this.getOperationsDeclaration(),
      actions: [
        {
          description: "Directory-level actions",
          catalog: [
            {
              name: "archive",
              description: "Create a compressed archive (tar.gz or zip) of the directory contents",
              inputSchema: {
                type: "object",
                properties: {
                  format: {
                    type: "string",
                    enum: ["tar.gz", "zip"],
                    description: "Archive format",
                  },
                  pattern: {
                    type: "string",
                    description: "Glob pattern to filter files (e.g., '**/*.ts')",
                  },
                },
                required: ["format"],
              },
            },
          ],
          discovery: {
            pathTemplate: "/:path*/.actions",
            note: "Archive action available on directories",
          },
        },
        {
          description: "File-level actions",
          catalog: [
            {
              name: "checksum",
              description: "Compute a cryptographic hash of the file content",
              inputSchema: {
                type: "object",
                properties: {
                  algorithm: {
                    type: "string",
                    enum: ["md5", "sha1", "sha256", "sha512"],
                    description: "Hash algorithm to use",
                  },
                },
                required: ["algorithm"],
              },
            },
          ],
          discovery: {
            pathTemplate: "/:path*/.actions",
            note: "Checksum action available on files",
          },
        },
      ],
    };

    return {
      id: "/.meta/.capabilities",
      path: "/.meta/.capabilities",
      content: manifest,
      meta: { kind: "afs:capabilities", operations },
    };
  }

  // ========== Actions ==========

  @Actions.Exec("/:path*", "archive")
  async archiveAction(
    ctx: RouteContext<{ path?: string }>,
    args: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    const normalizedPath = joinURL("/", ctx.params.path ?? "");
    const format = args.format as string | undefined;
    const pattern = args.pattern as string | undefined;
    const mountRoot = this.options.localPath;

    // Validate format
    if (!format || !["tar.gz", "zip"].includes(format)) {
      return {
        success: false,
        error: {
          code: "INVALID_FORMAT",
          message: `Unsupported archive format: ${format}. Supported formats: tar.gz, zip`,
        },
      };
    }

    // Resolve full path and validate it's within mount
    const fullPath = join(mountRoot, normalizedPath);
    if (!fullPath.startsWith(mountRoot)) {
      return {
        success: false,
        error: {
          code: "PATH_TRAVERSAL",
          message: "Path traversal is not allowed",
        },
      };
    }

    // Verify path exists and is a directory
    let stats: Awaited<ReturnType<typeof stat>>;
    try {
      stats = await stat(fullPath);
    } catch {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Path not found: ${normalizedPath}`,
        },
      };
    }

    if (!stats.isDirectory()) {
      return {
        success: false,
        error: {
          code: "NOT_DIRECTORY",
          message: `Archive action requires a directory, but ${normalizedPath} is a file`,
        },
      };
    }

    // Collect files recursively
    const files: string[] = [];
    await this.collectFilesForArchive(fullPath, fullPath, pattern, files);

    // Generate output path in tmpdir
    const ext = format === "tar.gz" ? ".tar.gz" : ".zip";
    const archiveName = `afs-archive-${Date.now()}${ext}`;
    const outputPath = join(tmpdir(), archiveName);

    try {
      if (format === "tar.gz") {
        await this.createTarGz(fullPath, files, outputPath);
      } else {
        await this.createZip(fullPath, files, outputPath);
      }

      // Get output file stats
      const outputStats = await stat(outputPath);

      return {
        success: true,
        data: {
          outputPath,
          size: outputStats.size,
          fileCount: files.length,
          format,
        },
      };
    } catch (error) {
      // Clean up partial output
      try {
        await rm(outputPath, { force: true });
      } catch {
        // ignore cleanup errors
      }

      return {
        success: false,
        error: {
          code: "ARCHIVE_ERROR",
          message: `Failed to create archive: ${error instanceof Error ? error.message : "unknown error"}`,
        },
      };
    }
  }

  @Actions.Exec("/:path*", "checksum")
  async checksumAction(
    ctx: RouteContext<{ path?: string }>,
    args: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    const normalizedPath = joinURL("/", ctx.params.path ?? "");
    const algorithm = args.algorithm as string | undefined;
    const mountRoot = this.options.localPath;

    // Validate algorithm
    const supportedAlgorithms = ["md5", "sha1", "sha256", "sha512"];
    if (!algorithm || !supportedAlgorithms.includes(algorithm)) {
      return {
        success: false,
        error: {
          code: "INVALID_ALGORITHM",
          message: `Unsupported algorithm: ${algorithm}. Supported: ${supportedAlgorithms.join(", ")}`,
        },
      };
    }

    // Resolve full path and validate it's within mount
    const fullPath = join(mountRoot, normalizedPath);
    if (!fullPath.startsWith(mountRoot)) {
      return {
        success: false,
        error: {
          code: "PATH_TRAVERSAL",
          message: "Path traversal is not allowed",
        },
      };
    }

    // Verify path exists and is a file
    let stats: Awaited<ReturnType<typeof stat>>;
    try {
      stats = await stat(fullPath);
    } catch {
      return {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Path not found: ${normalizedPath}`,
        },
      };
    }

    if (stats.isDirectory()) {
      return {
        success: false,
        error: {
          code: "NOT_FILE",
          message: `Checksum action requires a file, but ${normalizedPath} is a directory`,
        },
      };
    }

    try {
      // Stream-based hash computation for large file support
      const hash = await new Promise<string>((resolve, reject) => {
        const hasher = createHash(algorithm);
        const stream = createReadStream(fullPath);
        stream.on("data", (chunk) => hasher.update(chunk));
        stream.on("end", () => resolve(hasher.digest("hex")));
        stream.on("error", reject);
      });

      return {
        success: true,
        data: {
          hash,
          algorithm,
          size: stats.size,
          path: normalizedPath,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "CHECKSUM_ERROR",
          message: `Failed to compute checksum: ${error instanceof Error ? error.message : "unknown error"}`,
        },
      };
    }
  }

  // ========== .ash Exec Delegation ==========

  @Exec("/:path*")
  async execHandler(
    ctx: RouteContext<{ path?: string }>,
    args: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    const path = ctx.path;
    if (path.includes("/.actions/")) {
      throw new Error(`No actions available for path: ${path}`);
    }
    if (!path.endsWith(".ash")) {
      return {
        success: false,
        error: {
          code: "UNSUPPORTED",
          message: `Exec not supported for non-.ash files: ${path}`,
        },
      };
    }

    const fullPath = join(this.options.localPath, path);
    await this.assertWithinMount(fullPath);

    // Read .ash source
    let source: string;
    try {
      source = await readFile(fullPath, "utf-8");
    } catch (error) {
      wrapNotFoundError(error, path);
    }

    // Delegate to ASH provider via afsRoot — find ASH by URI, not hardcoded path
    // Prefer context AFS (injected by AFS core from caller's namespace) over onMount afsRoot
    const contextAfs = (ctx.options as any)?.context?.afs as AFSRoot | undefined;
    const afs = contextAfs ?? this.afsRoot;
    if (!afs?.exec) {
      return {
        success: false,
        error: {
          code: "ASH_UNAVAILABLE",
          message: "ASH provider is not mounted or does not support exec",
        },
      };
    }

    const ashRunPath = this.resolveAshRunPath();
    if (!ashRunPath) {
      return {
        success: false,
        error: {
          code: "ASH_UNAVAILABLE",
          message: "ASH provider not found. No provider with URI 'ash://' is mounted.",
        },
      };
    }

    // Pass _runtime_afs so ASH executes in the caller's namespace (e.g. program AFS)
    const ashArgs = { ...args, source, _runtime_afs: afs };
    return afs.exec(ashRunPath, ashArgs, {});
  }

  /**
   * Resolve the ASH run action path by finding the ASH provider via URI.
   * Returns the full path to /.actions/run on the ASH provider, or undefined if not found.
   */
  private resolveAshRunPath(): string | undefined {
    const afs = this.afsRoot;
    if (!afs) return undefined;

    const matches = findMountByURI(afs, "ash://");
    if (matches.length !== 1) return undefined;

    return joinURL(matches[0]!.path, ".actions", "run");
  }

  // ========== Archive Helper Methods ==========

  /**
   * Recursively collect files for archiving.
   * Excludes .afs directories and respects optional glob pattern.
   */
  private async collectFilesForArchive(
    baseDir: string,
    currentDir: string,
    pattern: string | undefined,
    files: string[],
  ): Promise<void> {
    let items: string[];
    try {
      items = await readdir(currentDir);
    } catch {
      return;
    }

    for (const item of items) {
      // Skip .afs metadata directories
      if (this.isHiddenAfsDir(item)) continue;

      const fullPath = join(currentDir, item);
      let itemStats: Awaited<ReturnType<typeof stat>>;
      try {
        itemStats = await stat(fullPath);
      } catch {
        continue; // Skip files that disappear during collection
      }

      if (itemStats.isDirectory()) {
        await this.collectFilesForArchive(baseDir, fullPath, pattern, files);
      } else {
        const relativePath = relative(baseDir, fullPath);
        if (pattern) {
          if (minimatch(relativePath, pattern, { matchBase: true })) {
            files.push(relativePath);
          }
        } else {
          files.push(relativePath);
        }
      }
    }
  }

  /**
   * Create a tar.gz archive from a list of files.
   */
  private async createTarGz(baseDir: string, files: string[], outputPath: string): Promise<void> {
    // Use tar command for reliable tar.gz creation
    const { execSync } = await import("node:child_process");

    if (files.length === 0) {
      // Create an empty tar.gz
      execSync(`tar czf "${outputPath}" -T /dev/null`, { cwd: baseDir });
      return;
    }

    // Write file list to a temp file to avoid arg length limits
    const fileListPath = join(tmpdir(), `afs-tar-list-${Date.now()}.txt`);
    await writeFile(fileListPath, files.join("\n"), "utf8");

    try {
      execSync(`tar czf "${outputPath}" -T "${fileListPath}"`, { cwd: baseDir });
    } finally {
      await rm(fileListPath, { force: true });
    }
  }

  /**
   * Create a zip archive from a list of files.
   */
  private async createZip(baseDir: string, files: string[], outputPath: string): Promise<void> {
    const { execSync } = await import("node:child_process");

    if (files.length === 0) {
      // Create an empty zip (zip requires at least one file, use a workaround)
      execSync(`zip -q "${outputPath}" -T 2>/dev/null || true`, { cwd: baseDir });
      // If empty zip wasn't created, create a minimal one
      try {
        await stat(outputPath);
      } catch {
        // Create minimal empty zip (PK header for empty archive)
        const emptyZip = Buffer.from([
          0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        ]);
        await writeFile(outputPath, emptyZip);
      }
      return;
    }

    // Write file list to a temp file
    const fileListPath = join(tmpdir(), `afs-zip-list-${Date.now()}.txt`);
    await writeFile(fileListPath, files.join("\n"), "utf8");

    try {
      execSync(`cat "${fileListPath}" | zip -q "${outputPath}" -@`, { cwd: baseDir });
    } finally {
      await rm(fileListPath, { force: true });
    }
  }

  /**
   * Read .gitignore content safely from a directory.
   * Returns empty string if file doesn't exist or is unreadable.
   */
  private async readGitignoreContent(dirPath: string): Promise<string> {
    try {
      const gitignorePath = join(dirPath, ".gitignore");
      return await readFile(gitignorePath, "utf8");
    } catch {
      return "";
    }
  }

  /**
   * Read .afsignore content safely from a directory.
   * Returns empty string if file doesn't exist or is unreadable.
   */
  private async readAfsignoreContent(dirPath: string): Promise<string> {
    try {
      const afsignorePath = join(dirPath, ".afsignore");
      return await readFile(afsignorePath, "utf8");
    } catch {
      return "";
    }
  }

  /**
   * Parse .afsignore content and expand @inherit directives.
   * Returns an array of patterns with @inherit .gitignore replaced by actual gitignore rules.
   * @param content - The .afsignore file content
   * @param dirPath - The directory containing the .afsignore file
   * @param mountRoot - The mount root path for security checks
   * @param visitedPaths - Set of already visited paths to detect circular references
   */
  private async parseAfsignoreContent(
    content: string,
    dirPath: string,
    mountRoot: string,
    visitedPaths: Set<string> = new Set(),
  ): Promise<string[]> {
    const patterns: string[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();

      // Handle @inherit directive
      if (trimmed.startsWith("@inherit ")) {
        const target = trimmed.slice("@inherit ".length).trim();

        if (target === ".gitignore") {
          // Load gitignore rules from this directory
          const gitignoreContent = await this.readGitignoreContent(dirPath);
          if (gitignoreContent) {
            patterns.push(...gitignoreContent.split("\n"));
          }
        } else {
          // Handle other @inherit targets (e.g., relative paths)
          // Security check: prevent path traversal outside mountRoot
          const targetPath = join(dirPath, target);
          const normalizedTarget = targetPath;

          // Check for path traversal attack
          if (
            !normalizedTarget.startsWith(mountRoot) ||
            isAbsolute(target) ||
            visitedPaths.has(normalizedTarget)
          ) {
            // Skip invalid or circular inherit - just ignore the directive
            continue;
          }

          // Mark as visited to prevent circular references
          visitedPaths.add(normalizedTarget);

          try {
            const inheritedContent = await readFile(normalizedTarget, "utf8");
            // Check if it's an .afsignore file (recursive parsing)
            if (target.endsWith(".afsignore")) {
              const inheritedPatterns = await this.parseAfsignoreContent(
                inheritedContent,
                dirname(normalizedTarget),
                mountRoot,
                visitedPaths,
              );
              patterns.push(...inheritedPatterns);
            } else {
              // Treat as plain gitignore-style file
              patterns.push(...inheritedContent.split("\n"));
            }
          } catch {
            // Target file doesn't exist, skip
          }
        }
      } else {
        // Regular pattern line
        patterns.push(line);
      }
    }

    return patterns;
  }

  /**
   * Add patterns to an ignore instance, handling prefixing for subdirectories.
   * @param ig - The ignore instance to add patterns to
   * @param patterns - Array of pattern lines
   * @param dirPath - The directory these patterns come from
   * @param baseDir - The base directory for relative path calculation
   */
  private addPatternsToIgnore(
    ig: ReturnType<typeof ignore>,
    patterns: string[],
    dirPath: string,
    baseDir: string,
  ): void {
    // Normalize paths to remove trailing slashes for comparison
    const normalizedDirPath = dirPath.endsWith("/") ? dirPath.slice(0, -1) : dirPath;
    const normalizedBaseDir = baseDir.endsWith("/") ? baseDir.slice(0, -1) : baseDir;
    const needsPrefix = normalizedDirPath !== normalizedBaseDir;
    const prefix = needsPrefix ? relative(normalizedBaseDir, normalizedDirPath) : "";

    for (const line of patterns) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      // Handle negation patterns
      const isNegation = trimmed.startsWith("!");
      const pattern = isNegation ? trimmed.slice(1) : trimmed;

      if (needsPrefix) {
        // Prefix the pattern for subdirectory matching
        let prefixedPattern: string;

        if (pattern.startsWith("/")) {
          // Root-anchored pattern relative to the afsignore location
          prefixedPattern = `/${prefix}${pattern}`;
        } else if (pattern.includes("/") && !pattern.startsWith("**/")) {
          // Path pattern, prefix it directly
          prefixedPattern = `${prefix}/${pattern}`;
        } else {
          // Simple pattern or ** pattern - match at any depth within this directory
          prefixedPattern = `${prefix}/**/${pattern}`;
        }

        ig.add(isNegation ? `!${prefixedPattern}` : prefixedPattern);
      } else {
        // At base directory, use pattern as-is
        ig.add(trimmed);
      }
    }
  }

  /**
   * Load combined ignore rules from mountRoot down to checkPath.
   * Combines .gitignore (if useGitignore), .afsignore (if useAfsignore), and mount ignore options.
   *
   * Priority order (later rules override earlier):
   * 1. Mount config `ignore` option (highest priority - always applied first as base)
   * 2. .gitignore rules (if useGitignore=true, or via @inherit in .afsignore)
   * 3. .afsignore rules (if useAfsignore=true)
   *
   * @param checkPath - The directory whose files we're checking
   * @param mountRoot - The mounted local filesystem root
   * @returns An object with ignore instance and the base path for matching
   */
  private async loadIgnoreRules(
    checkPath: string,
    mountRoot: string,
  ): Promise<{
    ig: ReturnType<typeof ignore>;
    ignoreBase: string;
    mountIgnorePatterns: string[];
    negationPatterns: string[];
  } | null> {
    const ig = ignore();

    // Collect directories from mountRoot down to checkPath
    const dirsToCheck: string[] = [];
    let currentPath = checkPath;

    while (true) {
      dirsToCheck.unshift(currentPath);

      if (currentPath === mountRoot) {
        break;
      }

      const parentPath = dirname(currentPath);
      if (!currentPath.startsWith(mountRoot) || parentPath === currentPath) {
        break;
      }
      currentPath = parentPath;
    }

    // Always add mount-level ignore patterns first (highest priority base)
    // These patterns are applied and cannot be negated by file-based rules
    const mountIgnorePatterns = this.options.ignore || [];

    // Process directories from parent to child
    for (const dirPath of dirsToCheck) {
      // Load .gitignore if useGitignore is enabled
      if (this.useGitignore) {
        const gitignoreContent = await this.readGitignoreContent(dirPath);
        if (gitignoreContent) {
          const gitignorePatterns = gitignoreContent.split("\n");
          this.addPatternsToIgnore(ig, gitignorePatterns, dirPath, mountRoot);
        }
      }

      // Load .afsignore if useAfsignore is enabled
      if (this.useAfsignore) {
        const afsignoreContent = await this.readAfsignoreContent(dirPath);
        if (afsignoreContent) {
          const afsignorePatterns = await this.parseAfsignoreContent(
            afsignoreContent,
            dirPath,
            mountRoot,
          );
          this.addPatternsToIgnore(ig, afsignorePatterns, dirPath, mountRoot);
        }
      }
    }

    // Collect negation patterns for special handling of directory recursion
    const negationPatterns: string[] = [];
    // We need to extract negation patterns from the ignore rules
    // These are patterns that start with !
    const collectNegationPatterns = (content: string) => {
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("!") && !trimmed.startsWith("!#")) {
          negationPatterns.push(trimmed.slice(1)); // Remove the ! prefix
        }
      }
    };

    // Re-process afsignore files to extract negation patterns
    for (const dirPath of dirsToCheck) {
      if (this.useAfsignore) {
        const afsignoreContent = await this.readAfsignoreContent(dirPath);
        if (afsignoreContent) {
          collectNegationPatterns(afsignoreContent);
        }
      }
    }

    return { ig, ignoreBase: mountRoot, mountIgnorePatterns, negationPatterns };
  }

  /**
   * Check if an ignored directory might have un-ignored children based on negation patterns.
   * This allows recursing into ignored directories when negation patterns exist for their contents.
   */
  private hasNegatedDescendants(relativePath: string, negationPatterns: string[]): boolean {
    const normalizedPath = relativePath.replace(/\/$/, "");
    for (const pattern of negationPatterns) {
      // Check if the negation pattern could match something inside this directory
      // Pattern could be like: dist/types/ or dist/types/** or dist/**/*.d.ts
      const normalizedPattern = pattern.replace(/\/$/, "");
      if (
        normalizedPattern.startsWith(`${normalizedPath}/`) ||
        normalizedPattern === normalizedPath
      ) {
        return true;
      }
      // Also check for glob patterns that might match
      const firstSegment = normalizedPath.split("/")[0] || "";
      if (pattern.includes("**") && firstSegment && pattern.startsWith(firstSegment)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a path is explicitly negated by negation patterns.
   * This is used to override the ignore library's decision for paths that match negation patterns.
   */
  private isNegatedByPatterns(relativePath: string, negationPatterns: string[]): boolean {
    const normalizedPath = relativePath.replace(/\/$/, "");
    for (const pattern of negationPatterns) {
      const normalizedPattern = pattern.replace(/\/$/, "");
      // Direct match
      if (normalizedPattern === normalizedPath) {
        return true;
      }
      // Pattern with trailing ** matches descendants
      if (normalizedPattern.endsWith("/**") || normalizedPattern.endsWith("/*")) {
        const basePath = normalizedPattern.replace(/\/\*+$/, "");
        if (normalizedPath.startsWith(`${basePath}/`) || normalizedPath === basePath) {
          return true;
        }
      }
      // Check if path starts with the pattern (for directory patterns)
      if (normalizedPath.startsWith(`${normalizedPattern}/`)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a file path should be ignored based on mount-level ignore patterns.
   * Mount-level ignores have highest priority and cannot be overridden.
   */
  private isIgnoredByMountPatterns(relativePath: string, mountIgnorePatterns: string[]): boolean {
    if (mountIgnorePatterns.length === 0) {
      return false;
    }

    const mountIg = ignore();
    mountIg.add(mountIgnorePatterns);

    // Check both with and without leading slash, and with trailing slash for directories
    const pathWithoutSlash = relativePath.startsWith("/") ? relativePath.slice(1) : relativePath;
    return mountIg.ignores(pathWithoutSlash) || mountIg.ignores(`${pathWithoutSlash}/`);
  }
}

const _typeCheck: AFSModuleClass<AFSFS, AFSFSOptions> = AFSFS;

export default AFSFS;
