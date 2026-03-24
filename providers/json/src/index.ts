import {
  type AFSAccessMode,
  type AFSDeleteOptions,
  type AFSEntry,
  type AFSEntryMetadata,
  type AFSExplainOptions,
  type AFSExplainResult,
  type AFSListResult,
  type AFSModuleClass,
  type AFSModuleLoadParams,
  AFSNotFoundError,
  type AFSRenameOptions,
  type AFSSearchOptions,
  type AFSStatResult,
  type AFSWriteEntryPayload,
  type CapabilitiesManifest,
  getPlatform,
  type ProviderManifest,
  type ProviderTreeSchema,
} from "@aigne/afs";
import {
  AFSBaseProvider,
  Delete,
  Explain,
  List,
  Meta,
  Read,
  Rename,
  type RouteContext,
  Search,
  Stat,
  Write,
} from "@aigne/afs/provider";
import { camelize, optionalize, zodParse } from "@aigne/afs/utils/zod";
import { resolveLocalPath } from "@aigne/afs-provider-utils";
import { joinURL } from "ufo";
import { parse as parseYAML, stringify as stringifyYAML } from "yaml";
import { z } from "zod";

const LIST_MAX_LIMIT = 1000;

/** Hidden key for storing AFS metadata (mirrors FS provider's .afs directory) */
const AFS_KEY = ".afs";

/** Subkey for storing metadata (mirrors FS provider's meta.yaml file) */
const META_KEY = "meta";

/** Subkey for storing child node metadata (mirrors FS provider's .nodes directory) */
const NODES_KEY = ".nodes";

export interface AFSJSONOptions {
  name?: string;
  jsonPath: string;
  description?: string;
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

const afsJSONOptionsSchema = camelize(
  z.object({
    name: optionalize(z.string()),
    jsonPath: z.string().describe("The path to the JSON/YAML file to mount"),
    description: optionalize(z.string().describe("A description of the JSON module")),
    accessMode: optionalize(
      z.enum(["readonly", "readwrite"]).describe("Access mode for this module"),
    ),
    agentSkills: optionalize(
      z.boolean().describe("Enable automatic agent skill scanning for this module"),
    ),
  }),
);

/**
 * AFS module for mounting JSON/YAML files as virtual file systems.
 *
 * JSON/YAML objects are treated as directories, and properties/array items as files.
 * Supports nested structures and path-based access to data values.
 */
export class AFSJSON extends AFSBaseProvider {
  static schema() {
    return afsJSONOptionsSchema;
  }

  static manifest(): ProviderManifest {
    return {
      name: "json",
      description:
        "JSON or YAML file — navigate and edit structured data as a tree.\n- Objects and arrays become directories, primitives become leaf nodes\n- Read/write individual values, search across structure\n- Path structure: `/{key}/{nested-key}` (arrays indexed by position)",
      uriTemplate: "json://{localPath+}",
      category: "structured-data",
      schema: z.object({ localPath: z.string() }),
      tags: ["json", "yaml", "structured-data"],
      capabilityTags: ["read-write", "crud", "search", "auth:none", "local"],
      security: {
        riskLevel: "sandboxed",
        resourceAccess: [],
      },
      capabilities: {
        filesystem: { read: true, write: true },
      },
    };
  }

  static treeSchema(): ProviderTreeSchema {
    return {
      operations: ["list", "read", "write", "delete", "search", "stat", "explain"],
      tree: {
        "/": { kind: "json:root" },
        "/{key}": { kind: "json:value" },
      },
      auth: { type: "none" },
      bestFor: ["JSON/YAML navigation", "structured data editing", "config files"],
      notFor: ["binary files", "large datasets"],
    };
  }

  static async load({ basePath, config }: AFSModuleLoadParams = {}) {
    const valid = await AFSJSON.schema().parseAsync(config);
    return new AFSJSON({ ...valid, cwd: basePath });
  }

  readonly name: string;
  readonly description?: string;
  readonly accessMode: AFSAccessMode;
  readonly agentSkills?: boolean;

  private jsonData: any = null;
  private fileStats: {
    birthtime?: Date;
    mtime?: Date;
  } = {};
  private fileFormat: "json" | "yaml" = "json";
  private resolvedJsonPath: string;

  constructor(public options: AFSJSONOptions & { cwd?: string; localPath?: string; uri?: string }) {
    super();

    // Normalize registry-passed template vars: localPath → jsonPath
    if ((options as any).localPath && !options.jsonPath) {
      options.jsonPath = (options as any).localPath;
    }

    zodParse(afsJSONOptionsSchema, options);

    const jsonPath = resolveLocalPath(options.jsonPath, { cwd: options.cwd });

    // Note: file auto-creation moved to ensureLoaded() for async-only compatibility

    // Detect file format based on extension for writing
    const platform = getPlatform();
    const ext = platform.path.extname(jsonPath).toLowerCase();
    this.fileFormat = ext === ".yaml" || ext === ".yml" ? "yaml" : "json";

    // Extract name without extension
    const extensions = [".json", ".yaml", ".yml"];
    let name = platform.path.basename(jsonPath);
    for (const e of extensions) {
      if (name.endsWith(e)) {
        name = name.slice(0, -e.length);
        break;
      }
    }

    this.name = options.name || name || "json";
    this.description = options.description;
    this.agentSkills = options.agentSkills;
    // Default to "readwrite", but "readonly" if agentSkills is enabled
    this.accessMode = options.accessMode ?? (options.agentSkills ? "readonly" : "readwrite");
    this.resolvedJsonPath = jsonPath;
  }

  // ========== Meta Handlers ==========
  // Meta is read-only introspection. Metadata writes are handled by @Write via payload.meta.
  //
  // Meta storage strategy (mirrors FS provider's .afs directory):
  // - For objects (directories): metadata stored in `.afs.meta` key within the object
  // - For primitives (files): metadata stored in parent's `.afs[".nodes"][key].meta` structure
  //
  // Example JSON structure:
  // {
  //   "database": {
  //     "host": "localhost",
  //     ".afs": {
  //       "meta": { "description": "Database config" },  // object's own meta
  //       ".nodes": {
  //         "host": { "meta": { "description": "DB hostname" } }  // primitive's meta
  //       }
  //     }
  //   }
  // }

  /**
   * Read metadata for a JSON node via /.meta or /path/.meta
   * Returns stored metadata merged with computed type information
   * Note: Meta is read-only. To write metadata, use write() with payload.meta.
   */
  @Meta("/:path*")
  async readMetaHandler(ctx: RouteContext<{ path?: string }>): Promise<AFSEntry | undefined> {
    await this.ensureLoaded();

    const nodePath = joinURL("/", ctx.params.path ?? "");
    const segments = this.getPathSegments(nodePath);
    const value = this.getValueAtPath(this.jsonData, segments);

    if (value === undefined) {
      throw new AFSNotFoundError(nodePath);
    }

    const isDir = this.isDirectoryValue(value);
    const children = isDir ? this.getChildren(value) : [];

    // Determine the JSON type
    let type: string;
    if (Array.isArray(value)) {
      type = "array";
    } else if (value === null) {
      type = "null";
    } else if (typeof value === "object") {
      type = "object";
    } else {
      type = typeof value;
    }

    // Load stored user-defined metadata
    const storedMeta = this.loadMeta(nodePath) || {};

    // Build computed metadata (type info, etc.)
    const computedMeta: Record<string, unknown> = {
      type,
      path: nodePath,
    };

    if (isDir) {
      computedMeta.childrenCount = children.length;
      if (Array.isArray(value)) {
        computedMeta.length = value.length;
      } else {
        // Filter out internal keys from keys list
        computedMeta.keys = Object.keys(value).filter((k) => !this.isMetaKey(k));
      }
    } else {
      computedMeta.value = value;
    }

    if (this.fileStats.birthtime) {
      computedMeta.created = this.fileStats.birthtime;
    }
    if (this.fileStats.mtime) {
      computedMeta.modified = this.fileStats.mtime;
    }

    return this.buildEntry(joinURL(nodePath, ".meta"), {
      // User-defined metadata goes in metadata field (for conformance)
      meta: storedMeta as AFSEntryMetadata,
      // Computed type info goes in content (JSON-specific)
      content: computedMeta,
      createdAt: this.fileStats.birthtime,
      updatedAt: this.fileStats.mtime,
    });
  }

  // ========== Route Handlers ==========

  @List("/:path*", { handleDepth: true })
  async listHandler(
    ctx: RouteContext<{ path?: string }>,
  ): Promise<AFSListResult & { noExpand?: string[] }> {
    await this.ensureLoaded();

    const normalizedPath = ctx.params.path ? `/${ctx.params.path}` : "/";
    const options = ctx.options as { limit?: number; maxChildren?: number; maxDepth?: number };
    const limit = Math.min(options?.limit || LIST_MAX_LIMIT, LIST_MAX_LIMIT);
    const maxChildren =
      typeof options?.maxChildren === "number" ? options.maxChildren : Number.MAX_SAFE_INTEGER;
    const maxDepth = options?.maxDepth ?? 1;

    const segments = this.getPathSegments(normalizedPath);
    const value = this.getValueAtPath(this.jsonData, segments);

    if (value === undefined) {
      throw new AFSNotFoundError(normalizedPath);
    }

    // Note: list() returns only children, never the path itself (per new semantics)
    // maxDepth=0 means no children, maxDepth=1 means immediate children only, etc.
    if (maxDepth === 0) {
      return { data: [] };
    }

    // If the value is not a directory, it has no children
    if (!this.isDirectoryValue(value)) {
      return { data: [] };
    }

    const entries: AFSEntry[] = [];

    interface QueueItem {
      path: string;
      value: any;
      depth: number;
    }

    // Start with immediate children at depth 1 (not the path itself at depth 0)
    const rootChildren = this.getChildren(value);
    const rootChildrenToProcess =
      rootChildren.length > maxChildren ? rootChildren.slice(0, maxChildren) : rootChildren;

    const queue: QueueItem[] = rootChildrenToProcess.map((child) => ({
      path: normalizedPath === "/" ? `/${child.key}` : `${normalizedPath}/${child.key}`,
      value: child.value,
      depth: 1,
    }));

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;

      const { path: itemPath, value: itemValue, depth } = item;

      const entry = this.valueToAFSEntry(itemPath, itemValue);
      entries.push(entry);

      if (entries.length >= limit) {
        break;
      }

      // Process children if within depth limit
      if (this.isDirectoryValue(itemValue) && depth < maxDepth) {
        const children = this.getChildren(itemValue);
        const childrenToProcess =
          children.length > maxChildren ? children.slice(0, maxChildren) : children;

        for (const child of childrenToProcess) {
          const childPath = itemPath === "/" ? `/${child.key}` : `${itemPath}/${child.key}`;
          queue.push({
            path: childPath,
            value: child.value,
            depth: depth + 1,
          });
        }
      }
    }

    return { data: entries };
  }

  @Read("/:path*")
  async readHandler(ctx: RouteContext<{ path?: string }>): Promise<AFSEntry | undefined> {
    await this.ensureLoaded();

    const normalizedPath = ctx.params.path ? `/${ctx.params.path}` : "/";
    const segments = this.getPathSegments(normalizedPath);
    const value = this.getValueAtPath(this.jsonData, segments);

    if (value === undefined) {
      throw new AFSNotFoundError(normalizedPath);
    }

    return this.valueToAFSEntry(normalizedPath, value);
  }

  /**
   * Write handler - supports writing content and/or metadata
   *
   * | payload | behavior |
   * |---------|----------|
   * | { content } | write content only |
   * | { metadata } | write metadata only (to .afs storage) |
   * | { content, metadata } | write both |
   */
  @Write("/:path*")
  async writeHandler(
    ctx: RouteContext<{ path?: string }>,
    payload: AFSWriteEntryPayload,
  ): Promise<{ data: AFSEntry }> {
    await this.ensureLoaded();

    const normalizedPath = ctx.params.path ? `/${ctx.params.path}` : "/";
    const segments = this.getPathSegments(normalizedPath);

    // Write content if provided
    if (payload.content !== undefined) {
      this.setValueAtPath(this.jsonData, segments, payload.content);
    }

    // Write metadata if provided (merge with existing)
    if (payload.meta !== undefined && typeof payload.meta === "object") {
      const existingMeta = this.loadMeta(normalizedPath) || {};
      const finalMeta = { ...existingMeta, ...payload.meta };
      this.saveMeta(normalizedPath, finalMeta);
    }

    // Save back to file
    await this.saveToFile();

    const newValue = this.getValueAtPath(this.jsonData, segments);
    const isDir = this.isDirectoryValue(newValue);
    const children = isDir ? this.getChildren(newValue) : [];

    // Load stored metadata for response
    const storedMeta = this.loadMeta(normalizedPath) || {};

    const writtenEntry: AFSEntry = {
      id: normalizedPath,
      path: normalizedPath,
      content: payload.content !== undefined ? payload.content : newValue,
      summary: payload.summary,
      createdAt: this.fileStats.birthtime,
      updatedAt: this.fileStats.mtime,
      meta: {
        ...storedMeta,
        childrenCount: isDir ? children.length : undefined,
      } as AFSEntryMetadata,
      userId: payload.userId,
      sessionId: payload.sessionId,
      linkTo: payload.linkTo,
    };

    return { data: writtenEntry };
  }

  @Delete("/:path*")
  async deleteHandler(ctx: RouteContext<{ path?: string }>): Promise<{ message: string }> {
    await this.ensureLoaded();

    const normalizedPath = ctx.params.path ? `/${ctx.params.path}` : "/";
    const options = ctx.options as AFSDeleteOptions | undefined;
    const segments = this.getPathSegments(normalizedPath);
    const value = this.getValueAtPath(this.jsonData, segments);

    if (value === undefined) {
      throw new AFSNotFoundError(normalizedPath);
    }

    const hasChildren = this.isDirectoryValue(value) && this.getChildren(value).length > 0;
    if (hasChildren && !options?.recursive) {
      throw new Error(
        `Cannot delete directory '${normalizedPath}' without recursive option. Set recursive: true to delete directories.`,
      );
    }

    this.deleteValueAtPath(this.jsonData, segments);
    await this.saveToFile();

    return { message: `Successfully deleted: ${normalizedPath}` };
  }

  @Rename("/:path*")
  async renameHandler(
    ctx: RouteContext<{ path?: string }>,
    newPath: string,
  ): Promise<{ message: string }> {
    await this.ensureLoaded();

    const normalizedOldPath = ctx.params.path ? `/${ctx.params.path}` : "/";
    const normalizedNewPath = this.normalizePath(newPath);
    const options = ctx.options as AFSRenameOptions | undefined;

    const oldSegments = this.getPathSegments(normalizedOldPath);
    const newSegments = this.getPathSegments(normalizedNewPath);

    const oldValue = this.getValueAtPath(this.jsonData, oldSegments);
    if (oldValue === undefined) {
      throw new AFSNotFoundError(normalizedOldPath);
    }

    const existingNewValue = this.getValueAtPath(this.jsonData, newSegments);
    if (existingNewValue !== undefined && !options?.overwrite) {
      throw new Error(
        `Destination '${normalizedNewPath}' already exists. Set overwrite: true to replace it.`,
      );
    }

    // Copy to new location and delete old
    this.setValueAtPath(this.jsonData, newSegments, oldValue);
    this.deleteValueAtPath(this.jsonData, oldSegments);
    await this.saveToFile();

    return {
      message: `Successfully renamed '${normalizedOldPath}' to '${normalizedNewPath}'`,
    };
  }

  @Search("/:path*")
  async searchHandler(
    ctx: RouteContext<{ path?: string }>,
    query: string,
    options?: AFSSearchOptions,
  ): Promise<{ data: AFSEntry[]; message?: string }> {
    await this.ensureLoaded();

    const normalizedPath = ctx.params.path ? `/${ctx.params.path}` : "/";
    const limit = Math.min(options?.limit || LIST_MAX_LIMIT, LIST_MAX_LIMIT);
    const caseSensitive = options?.caseSensitive ?? false;

    const segments = this.getPathSegments(normalizedPath);
    const rootValue = this.getValueAtPath(this.jsonData, segments);

    if (rootValue === undefined) {
      throw new AFSNotFoundError(normalizedPath);
    }

    const entries: AFSEntry[] = [];
    const searchQuery = caseSensitive ? query : query.toLowerCase();

    const searchInValue = (valuePath: string, value: any): void => {
      if (entries.length >= limit) return;

      let matched = false;

      // Search in the value itself
      if (!this.isDirectoryValue(value)) {
        const valueStr = typeof value === "string" ? value : JSON.stringify(value);
        const searchValue = caseSensitive ? valueStr : valueStr.toLowerCase();
        if (searchValue.includes(searchQuery)) {
          matched = true;
        }
      }

      if (matched) {
        entries.push(this.valueToAFSEntry(valuePath, value));
      }

      // Recursively search children
      if (this.isDirectoryValue(value)) {
        const children = this.getChildren(value);
        for (const child of children) {
          if (entries.length >= limit) break;
          const childPath = valuePath === "/" ? `/${child.key}` : `${valuePath}/${child.key}`;
          searchInValue(childPath, child.value);
        }
      }
    };

    searchInValue(normalizedPath, rootValue);

    return {
      data: entries,
      message: entries.length >= limit ? `Results truncated to limit ${limit}` : undefined,
    };
  }

  @Stat("/:path*")
  async statHandler(ctx: RouteContext<{ path?: string }>): Promise<AFSStatResult> {
    await this.ensureLoaded();

    const normalizedPath = ctx.params.path ? `/${ctx.params.path}` : "/";
    const segments = this.getPathSegments(normalizedPath);
    const value = this.getValueAtPath(this.jsonData, segments);

    if (value === undefined) {
      throw new AFSNotFoundError(normalizedPath);
    }

    const isDir = this.isDirectoryValue(value);
    const children = isDir ? this.getChildren(value) : [];
    const loadedMeta = this.loadMeta(normalizedPath);
    const meta: Record<string, unknown> = { ...loadedMeta };
    if (isDir) {
      meta.childrenCount = children.length;
    }

    const id = segments.length > 0 ? (segments[segments.length - 1] as string) : "/";

    return {
      data: {
        id,
        path: normalizedPath,
        createdAt: this.fileStats.birthtime,
        updatedAt: this.fileStats.mtime,
        meta,
      },
    };
  }

  // ========== Explain & Capabilities ==========

  @Read("/.meta/.capabilities")
  async readCapabilitiesHandler(_ctx: RouteContext): Promise<AFSEntry | undefined> {
    await this.ensureLoaded();

    const operations = ["list", "read", "stat", "explain", "search"];
    if (this.accessMode === "readwrite") {
      operations.push("write", "delete", "rename");
    }

    const manifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: this.name,
      description: this.description || `JSON/YAML virtual filesystem (${this.fileFormat} format)`,
      tools: [],
      actions: [],
      operations: this.getOperationsDeclaration(),
    };

    return {
      id: "/.meta/.capabilities",
      path: "/.meta/.capabilities",
      content: manifest,
      meta: { kind: "afs:capabilities", operations },
    };
  }

  @Explain("/:path*")
  async explainHandler(ctx: RouteContext<{ path?: string }>): Promise<AFSExplainResult> {
    await this.ensureLoaded();

    const normalizedPath = joinURL("/", ctx.params.path ?? "");
    const format = (ctx.options as AFSExplainOptions)?.format || "markdown";
    const segments = this.getPathSegments(normalizedPath);
    const value = this.getValueAtPath(this.jsonData, segments);

    if (value === undefined) {
      throw new AFSNotFoundError(normalizedPath);
    }

    const nodeName = segments.length > 0 ? segments[segments.length - 1]! : "/";
    const isDir = this.isDirectoryValue(value);
    const storedMeta = this.loadMeta(normalizedPath);
    const lines: string[] = [];

    if (format === "markdown") {
      lines.push(`# ${nodeName}`);
      lines.push("");
      lines.push(`**Path:** \`${normalizedPath}\``);
      lines.push(`**Format:** ${this.fileFormat.toUpperCase()}`);

      if (normalizedPath === "/") {
        // Root: describe file path, format, top-level structure
        const topType = Array.isArray(this.jsonData) ? "array" : "object";
        const children = this.getChildren(this.jsonData);
        lines.push(`**Structure:** ${topType}`);
        lines.push(`**Top-level keys:** ${children.length}`);
        if (children.length > 0) {
          lines.push("");
          lines.push("## Keys");
          lines.push("");
          for (const child of children.slice(0, 30)) {
            const childVal = child.value;
            const childType = this.describeType(childVal);
            lines.push(`- \`${child.key}\` — ${childType}`);
          }
          if (children.length > 30) {
            lines.push(`- ... and ${children.length - 30} more`);
          }
        }
      } else if (Array.isArray(value)) {
        // Array node
        lines.push(`**Type:** array`);
        lines.push(`**Elements:** ${value.length}`);
        if (value.length > 0) {
          const elementType = this.describeType(value[0]);
          const isHomogeneous = value.every((v: unknown) => this.describeType(v) === elementType);
          lines.push(`**Element type:** ${isHomogeneous ? elementType : "mixed"}`);
        }
      } else if (typeof value === "object" && value !== null) {
        // Object node
        const children = this.getChildren(value);
        lines.push(`**Type:** object`);
        lines.push(`**Keys:** ${children.length}`);
        if (children.length > 0) {
          lines.push("");
          lines.push("## Keys");
          lines.push("");
          for (const child of children.slice(0, 30)) {
            const childType = this.describeType(child.value);
            lines.push(`- \`${child.key}\` — ${childType}`);
          }
          if (children.length > 30) {
            lines.push(`- ... and ${children.length - 30} more`);
          }
        }
      } else {
        // Primitive node
        const valType = value === null ? "null" : typeof value;
        lines.push(`**Type:** ${valType}`);
        const valStr = String(value);
        if (valStr.length > 200) {
          lines.push(`**Value:** ${valStr.slice(0, 200)}...`);
        } else {
          lines.push(`**Value:** ${valStr}`);
        }
      }

      if (storedMeta) {
        lines.push("");
        lines.push("## Metadata");
        for (const [key, val] of Object.entries(storedMeta)) {
          lines.push(`- **${key}:** ${JSON.stringify(val)}`);
        }
      }
    } else {
      // text format
      lines.push(`${nodeName} (${isDir ? "directory" : "value"})`);
      lines.push(`Path: ${normalizedPath}`);
      lines.push(`Format: ${this.fileFormat}`);
      if (isDir) {
        const children = this.getChildren(value);
        lines.push(`Children: ${children.length}`);
      } else {
        const valStr = String(value);
        lines.push(`Type: ${value === null ? "null" : typeof value}`);
        lines.push(`Value: ${valStr.length > 200 ? `${valStr.slice(0, 200)}...` : valStr}`);
      }
    }

    return { content: lines.join("\n"), format };
  }

  /**
   * Get a human-readable type description for a JSON value.
   */
  private describeType(value: unknown): string {
    if (value === null) return "null";
    if (Array.isArray(value)) return `array[${value.length}]`;
    if (typeof value === "object") {
      const keys = Object.keys(value).filter((k) => !this.isMetaKey(k));
      return `object{${keys.length} keys}`;
    }
    return typeof value;
  }

  // ========== Private Helper Methods ==========

  /**
   * Check if a key is a hidden meta key that should be filtered from listings
   */
  private isMetaKey(key: string): boolean {
    return key === AFS_KEY;
  }

  /**
   * Load metadata for a node.
   *
   * Storage location depends on node type (mirrors FS provider's .afs structure):
   * - Objects: `.afs.meta` key within the object itself
   * - Primitives: parent's `.afs[".nodes"][key].meta`
   */
  private loadMeta(nodePath: string): Record<string, unknown> | null {
    const segments = this.getPathSegments(nodePath);
    const value = this.getValueAtPath(this.jsonData, segments);

    if (value === undefined) {
      return null;
    }

    if (this.isDirectoryValue(value) && !Array.isArray(value)) {
      // Object: meta is in value[".afs"].meta
      const afs = value[AFS_KEY];
      if (afs && typeof afs === "object" && !Array.isArray(afs)) {
        const meta = afs[META_KEY];
        if (meta && typeof meta === "object" && !Array.isArray(meta)) {
          return meta as Record<string, unknown>;
        }
      }
      return null;
    }

    // Primitive or array: meta is in parent's .afs[".nodes"][key].meta
    if (segments.length === 0) {
      // Root is always an object, handled above
      return null;
    }

    const parentSegments = segments.slice(0, -1);
    const nodeKey = segments[segments.length - 1]!;
    const parentValue = this.getValueAtPath(this.jsonData, parentSegments);

    if (!parentValue || Array.isArray(parentValue) || typeof parentValue !== "object") {
      return null;
    }

    const afs = parentValue[AFS_KEY];
    if (!afs || typeof afs !== "object" || Array.isArray(afs)) {
      return null;
    }

    const nodes = afs[NODES_KEY];
    if (!nodes || typeof nodes !== "object" || Array.isArray(nodes)) {
      return null;
    }

    const nodeEntry = nodes[nodeKey];
    if (!nodeEntry || typeof nodeEntry !== "object" || Array.isArray(nodeEntry)) {
      return null;
    }

    const meta = nodeEntry[META_KEY];
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
      return null;
    }

    return meta as Record<string, unknown>;
  }

  /**
   * Save metadata for a node.
   *
   * Storage location depends on node type (mirrors FS provider's .afs structure):
   * - Objects: `.afs.meta` key within the object itself
   * - Primitives: parent's `.afs[".nodes"][key].meta`
   */
  private saveMeta(nodePath: string, meta: Record<string, unknown>): void {
    const segments = this.getPathSegments(nodePath);
    const value = this.getValueAtPath(this.jsonData, segments);

    if (value === undefined) {
      throw new AFSNotFoundError(nodePath);
    }

    if (this.isDirectoryValue(value) && !Array.isArray(value)) {
      // Object: store in value[".afs"].meta
      if (!value[AFS_KEY]) {
        value[AFS_KEY] = {};
      }
      // Store in .meta key
      value[AFS_KEY][META_KEY] = meta;
      return;
    }

    // Primitive or array: store in parent's .afs[".nodes"][key].meta
    if (segments.length === 0) {
      throw new Error("Cannot save meta for root when root is not an object");
    }

    const parentSegments = segments.slice(0, -1);
    const nodeKey = segments[segments.length - 1]!;
    const parentValue = this.getValueAtPath(this.jsonData, parentSegments);

    if (!parentValue || typeof parentValue !== "object") {
      throw new Error(`Parent path is not an object`);
    }

    if (Array.isArray(parentValue)) {
      throw new Error(`Cannot save meta for array elements`);
    }

    // Ensure .afs exists
    if (!parentValue[AFS_KEY]) {
      parentValue[AFS_KEY] = {};
    }

    // Ensure .afs[".nodes"] exists
    if (!parentValue[AFS_KEY][NODES_KEY]) {
      parentValue[AFS_KEY][NODES_KEY] = {};
    }

    // Ensure .afs[".nodes"][nodeKey] exists
    if (!parentValue[AFS_KEY][NODES_KEY][nodeKey]) {
      parentValue[AFS_KEY][NODES_KEY][nodeKey] = {};
    }

    // Store the meta in .meta key
    parentValue[AFS_KEY][NODES_KEY][nodeKey][META_KEY] = meta;
  }

  /**
   * Load JSON/YAML data from file. Called lazily on first access.
   * Uses YAML parser which can handle both JSON and YAML formats.
   */
  private async ensureLoaded(): Promise<void> {
    if (this.jsonData !== null) return;

    const platform = getPlatform();
    try {
      const stats = await platform.fs!.stat(this.resolvedJsonPath);
      this.fileStats = {
        birthtime: stats.birthtime ? new Date(stats.birthtime) : undefined,
        mtime: stats.mtime ? new Date(stats.mtime) : undefined,
      };

      const content = await platform.fs!.readTextFile(this.resolvedJsonPath);

      // YAML parser can handle both JSON and YAML formats
      this.jsonData = parseYAML(content);
    } catch {
      // File doesn't exist yet — auto-create with empty object
      try {
        await platform.fs!.mkdir(platform.path.dirname(this.resolvedJsonPath), {
          recursive: true,
        });
        await platform.fs!.writeFile(this.resolvedJsonPath, "{}");
      } catch {
        // mkdir/write failure is non-fatal — just start with empty data
      }
      this.jsonData = {};
    }
  }

  /**
   * Save JSON/YAML data back to file. Only called in readwrite mode.
   */
  private async saveToFile(): Promise<void> {
    let content: string;

    // Serialize based on file format
    if (this.fileFormat === "yaml") {
      content = stringifyYAML(this.jsonData);
    } else {
      content = JSON.stringify(this.jsonData, null, 2);
    }

    const platform = getPlatform();
    await platform.fs!.writeFile(this.resolvedJsonPath, content);

    // Update file stats
    const stats = await platform.fs!.stat(this.resolvedJsonPath);
    this.fileStats = {
      birthtime: this.fileStats.birthtime,
      mtime: stats.mtime ? new Date(stats.mtime) : undefined,
    };
  }

  /**
   * Get path segments from normalized path
   */
  /**
   * Dangerous property names that must never be used as object keys.
   * Prevents prototype pollution attacks (e.g., writing to /__proto__/polluted).
   */
  private static readonly DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

  private getPathSegments(path: string): string[] {
    const normalized = this.normalizePath(path);
    if (normalized === "/") return [];
    const segments = normalized.slice(1).split("/");

    // Guard against prototype pollution
    for (const segment of segments) {
      if (AFSJSON.DANGEROUS_KEYS.has(segment)) {
        throw new Error(`Path segment "${segment}" is not allowed (prototype pollution guard)`);
      }
    }

    return segments;
  }

  /**
   * Navigate to a value in the JSON structure using path segments
   */
  private getValueAtPath(data: any, segments: string[]): any {
    let current = data;
    for (const segment of segments) {
      if (current == null) return undefined;

      // Handle array indices
      if (Array.isArray(current)) {
        const index = Number.parseInt(segment, 10);
        if (Number.isNaN(index) || index < 0 || index >= current.length) {
          return undefined;
        }
        current = current[index];
      } else if (typeof current === "object") {
        current = current[segment as keyof typeof current];
      } else {
        return undefined;
      }
    }
    return current;
  }

  /**
   * Set a value in the JSON structure at the given path
   */
  private setValueAtPath(data: any, segments: string[], value: any): void {
    if (segments.length === 0) {
      throw new Error("Cannot set value at root path");
    }

    let current = data;
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i]!;
      const nextSegment = segments[i + 1]!;

      if (Array.isArray(current)) {
        const index = Number.parseInt(segment, 10);
        if (Number.isNaN(index) || index < 0) {
          throw new Error(`Invalid array index: ${segment}`);
        }

        // Extend array if necessary
        while (current.length <= index) {
          current.push(null);
        }

        if (current[index] == null) {
          // Determine if next level should be array or object
          const isNextArray = !Number.isNaN(Number.parseInt(nextSegment, 10));
          current[index] = isNextArray ? [] : {};
        }
        current = current[index];
      } else if (typeof current === "object") {
        if (current[segment] == null) {
          // Determine if next level should be array or object
          const isNextArray = !Number.isNaN(Number.parseInt(nextSegment, 10));
          current[segment] = isNextArray ? [] : {};
        }
        current = current[segment];
      } else {
        throw new Error(
          `Cannot set property on non-object at ${segments.slice(0, i + 1).join("/")}`,
        );
      }
    }

    const lastSegment = segments[segments.length - 1]!;
    if (Array.isArray(current)) {
      const index = Number.parseInt(lastSegment, 10);
      if (Number.isNaN(index) || index < 0) {
        throw new Error(`Invalid array index: ${lastSegment}`);
      }
      current[index] = value;
    } else if (typeof current === "object") {
      current[lastSegment] = value;
    } else {
      throw new Error("Cannot set property on non-object");
    }
  }

  /**
   * Delete a value from the JSON structure at the given path
   */
  private deleteValueAtPath(data: any, segments: string[]): boolean {
    if (segments.length === 0) {
      throw new Error("Cannot delete root path");
    }

    let current = data;
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i]!;

      if (Array.isArray(current)) {
        const index = Number.parseInt(segment, 10);
        if (Number.isNaN(index) || index < 0 || index >= current.length) {
          return false;
        }
        current = current[index];
      } else if (typeof current === "object") {
        if (!(segment in current)) return false;
        current = current[segment];
      } else {
        return false;
      }
    }

    const lastSegment = segments[segments.length - 1]!;
    if (Array.isArray(current)) {
      const index = Number.parseInt(lastSegment, 10);
      if (Number.isNaN(index) || index < 0 || index >= current.length) {
        return false;
      }
      current.splice(index, 1);
      return true;
    }
    if (typeof current === "object") {
      if (!(lastSegment in current)) return false;
      delete current[lastSegment];
      return true;
    }
    return false;
  }

  /**
   * Check if a value is a "directory" (object or array with children)
   */
  private isDirectoryValue(value: any): boolean {
    if (Array.isArray(value)) return true;
    if (typeof value === "object" && value !== null) return true;
    return false;
  }

  /**
   * Get children of a directory value (filters out .afs meta key)
   */
  private getChildren(value: any): Array<{ key: string; value: any }> {
    if (Array.isArray(value)) {
      return value.map((item, index) => ({ key: String(index), value: item }));
    }
    if (typeof value === "object" && value !== null) {
      return Object.entries(value)
        .filter(([key]) => !this.isMetaKey(key))
        .map(([key, val]) => ({ key, value: val }));
    }
    return [];
  }

  /**
   * Convert a JSON value to an AFSEntry
   */
  private valueToAFSEntry(path: string, value: any): AFSEntry {
    const isDir = this.isDirectoryValue(value);
    const children = isDir ? this.getChildren(value) : [];
    const kind = Array.isArray(value) ? "json:array" : isDir ? "json:object" : "json:value";

    return this.buildEntry(path, {
      content: isDir ? undefined : value,
      meta: {
        kind,
        childrenCount: isDir ? children.length : undefined,
      },
      createdAt: this.fileStats.birthtime,
      updatedAt: this.fileStats.mtime,
    });
  }
}

const _typeCheck: AFSModuleClass<AFSJSON, AFSJSONOptions> = AFSJSON;

export default AFSJSON;
