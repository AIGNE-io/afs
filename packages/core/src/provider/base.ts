import { minimatch } from "minimatch";
import type { OperationsDeclaration } from "../capabilities/types.js";
import { AFSAlreadyExistsError, AFSNotFoundError, AFSReadonlyError } from "../error.js";
import type { AFSEventSink } from "../events.js";
import { normalizePath as coreNormalizePath } from "../path.js";
import type {
  AFSAccessMode,
  AFSContext,
  AFSDeleteOptions,
  AFSDeleteResult,
  AFSEntry,
  AFSEntryMetadata,
  AFSExecOptions,
  AFSExecResult,
  AFSExplainOptions,
  AFSExplainResult,
  AFSListOptions,
  AFSListResult,
  AFSModule,
  AFSOperationOptions,
  AFSReadOptions,
  AFSReadResult,
  AFSRenameOptions,
  AFSRenameResult,
  AFSSearchOptions,
  AFSSearchResult,
  AFSStatOptions,
  AFSStatResult,
  AFSWriteEntryPayload,
  AFSWriteOptions,
  AFSWriteResult,
} from "../type.js";
import { applyPatches } from "../utils/patch.js";
import { getRoutes } from "./decorators.js";
import { ProviderRouter } from "./router.js";
import type {
  DeleteRouteHandler,
  ExecRouteHandler,
  ExplainRouteHandler,
  ListRouteHandler,
  ReadRouteHandler,
  RenameRouteHandler,
  RouteContext,
  RouteOperation,
  SearchRouteHandler,
  StatRouteHandler,
  WriteRouteHandler,
} from "./types.js";

/** Extract AFSContext from operation options (works for any option type). */
function extractContext(options?: unknown): AFSContext | undefined {
  return (options as AFSOperationOptions | undefined)?.context;
}

/**
 * Abstract base class for AFS providers using virtual routing
 *
 * All providers extend this class and use decorators to define routes:
 * - @List(pattern) - Handle list operations
 * - @Read(pattern) - Handle read operations
 * - @Write(pattern) - Handle write operations
 * - @Delete(pattern) - Handle delete operations
 * - @Exec(pattern) - Handle exec operations
 * - @Search(pattern) - Handle search operations
 * - @Meta(pattern) - Handle .meta path reads
 * - @Actions(pattern) - Handle .actions path listing
 *
 * @example
 * ```typescript
 * class MyProvider extends AFSBaseProvider {
 *   readonly name = "my-provider";
 *
 *   @List("/")
 *   async listRoot(ctx: RouteContext) {
 *     return { data: [...] };
 *   }
 *
 *   @Read("/:id")
 *   async getItem(ctx: RouteContext<{ id: string }>) {
 *     return { id: ctx.params.id, path: ctx.path, content: ... };
 *   }
 * }
 * ```
 */
export abstract class AFSBaseProvider implements AFSModule {
  /** Provider name, must be unique when mounted */
  abstract readonly name: string;

  /** Optional description */
  readonly description?: string;

  /** Access mode: "readonly" | "create" | "append" | "readwrite" */
  readonly accessMode: AFSAccessMode = "readonly";

  /** Visibility mode: "full" (default) | "meta" (read returns meta only, search denied) */
  readonly visibility: import("../type.js").AFSVisibility = "full";

  /** Action policy controlling which severity levels are permitted for exec */
  actionPolicy?: import("../type.js").ActionPolicy;

  /** Field names to mask when sensitivity is "redacted" */
  sensitiveFields?: string[];

  /** Sensitivity mode: "full" = no masking, "redacted" = mask sensitiveFields */
  sensitivity?: "full" | "redacted";

  /** Actions explicitly blocked regardless of severity or allowedActions */
  blockedActions?: string[];

  /** Actions explicitly allowed (skip severity check, but NOT blocked check) */
  allowedActions?: string[];

  /** Event sink injected by AFS.mount() */
  private _eventSink: AFSEventSink | null = null;

  /** Secret capability injected by AFS.mount() when vault is available */
  private _secretCap: import("../type.js").SecretCapability | null = null;

  /** Internal router for path matching */
  private router: ProviderRouter;

  constructor() {
    this.router = new ProviderRouter();
    this.collectDecoratorRoutes();
    this.removeUnimplementedMethods();
  }

  /** Called by AFS.mount/unmount to inject/clear the event sink */
  setEventSink(sink: AFSEventSink | null): void {
    this._eventSink = sink;
  }

  /** @deprecated Use setEventSink() instead */
  _setEventSink(sink: AFSEventSink | null): void {
    this.setEventSink(sink);
  }

  /** Called by AFS.mount() to inject scoped secret access */
  setSecretCapability(cap: import("../type.js").SecretCapability | null): void {
    this._secretCap = cap;
  }

  /** @deprecated Use setSecretCapability() instead */
  _setSecretCapability(cap: import("../type.js").SecretCapability | null): void {
    this.setSecretCapability(cap);
  }

  /** Scoped access to vault secrets. Only available if vault is mounted and provider declares secrets. */
  protected get secretCapability(): import("../type.js").SecretCapability | null {
    return this._secretCap;
  }

  /**
   * Emit an event to the AFS event bus.
   * Provider-internal path is automatically prefixed with mount path.
   * Source and timestamp are auto-filled.
   * Silent no-op if not mounted.
   */
  protected emit(event: { type: string; path: string; data?: Record<string, unknown> }): void {
    this._eventSink?.(event);
  }

  /**
   * Collect routes from decorators and register them
   */
  private collectDecoratorRoutes(): void {
    const routes = getRoutes(this.constructor);

    for (const route of routes) {
      const handler = (this as Record<string, unknown>)[route.methodName];
      if (typeof handler !== "function") {
        console.warn(
          `[AFSBaseProvider] Method ${route.methodName} not found on ${this.constructor.name}`,
        );
        continue;
      }

      // Bind the handler to this instance
      const boundHandler = handler.bind(this);
      this.router.registerRoute(
        route.pattern,
        route.operation,
        boundHandler,
        route.description,
        route.listOptions,
      );
    }
  }

  /**
   * Remove methods for operations that have no routes registered.
   * This allows core to check if a provider supports a capability via typeof check.
   *
   * We set the method to undefined on the instance to shadow the prototype method,
   * since `delete` only removes instance properties, not inherited ones.
   */
  private removeUnimplementedMethods(): void {
    const operationToMethod: Record<string, keyof AFSBaseProvider> = {
      list: "list",
      read: "read",
      write: "write",
      delete: "delete",
      exec: "exec",
      search: "search",
      stat: "stat",
      explain: "explain",
      rename: "rename",
    };

    for (const [operation, methodName] of Object.entries(operationToMethod)) {
      const routes = this.router.getRoutesForOperation(operation as RouteOperation);

      // Keep the method only if there are routes registered for this operation
      if (routes.length === 0) {
        (this as Record<string, unknown>)[methodName] = undefined;
      }
    }
  }

  /**
   * Build an OperationsDeclaration based on which methods are implemented.
   * Uses the fact that removeUnimplementedMethods() sets unsupported methods to undefined.
   * Write/delete/exec/rename are also gated by accessMode.
   */
  protected getOperationsDeclaration(): OperationsDeclaration {
    const isReadwrite = this.accessMode === "readwrite";
    const write = typeof this.write === "function" && isReadwrite;
    const del = typeof this.delete === "function" && isReadwrite;
    return {
      read: typeof this.read === "function",
      list: typeof this.list === "function",
      write,
      delete: del,
      search: typeof this.search === "function",
      exec: typeof this.exec === "function",
      stat: typeof this.stat === "function",
      explain: typeof this.explain === "function",
      batchWrite: write,
      batchDelete: del,
    };
  }

  /**
   * Returns a record of capability flags based on registered routes and accessMode.
   * Write-side capabilities (write, delete, rename) are gated by accessMode.
   */
  getCapabilities(): Record<string, boolean> {
    return { ...this.getOperationsDeclaration() };
  }

  // ========== AFSModule Interface Implementation ==========

  /**
   * List entries at a path
   */
  async list(path: string, options?: AFSListOptions): Promise<AFSListResult> {
    const maxDepth = options?.maxDepth ?? 1;

    // maxDepth=0: return empty array (no children levels to expand)
    if (maxDepth === 0) {
      return { data: [] };
    }

    const normalizedPath = this.normalizePath(path);
    const match = this.router.match(normalizedPath, "list");

    if (!match) {
      throw new AFSNotFoundError(normalizedPath);
    }

    const limit = options?.limit;
    const handleDepth = match.route.listOptions?.handleDepth ?? false;

    if (handleDepth || maxDepth <= 1) {
      const ctx: RouteContext = {
        path: normalizedPath,
        params: match.params,
        options,
        context: extractContext(options),
      };

      const handler = match.route.handler as ListRouteHandler;
      const handlerResult = await handler(ctx);

      // Inject default meta.kind if not set by handler
      for (const entry of handlerResult.data) {
        if (entry.meta && !entry.meta.kind) {
          const cc = entry.meta.childrenCount;
          entry.meta.kind = cc !== undefined ? "afs:node" : "afs:leaf";
        }
      }

      const result: AFSListResult = {
        data: handlerResult.data,
        total: handlerResult.total,
        message: handlerResult.message,
      };

      // Apply limit if specified
      if (limit !== undefined && result.data.length > limit) {
        const total = result.total ?? result.data.length;
        return {
          data: result.data.slice(0, limit),
          total,
          message: result.message,
        };
      }

      return result;
    }

    // Base provider handles depth expansion via BFS
    return this.listWithDepthExpansion(normalizedPath, options, maxDepth);
  }

  /**
   * Expand list results to specified depth using BFS traversal.
   * Used when handler has handleDepth: false.
   *
   * The handler is expected to return single-level results (direct children only).
   * This method recursively calls the handler to expand directories up to maxDepth.
   * Pattern filtering is applied after BFS completes to ensure directories are
   * traversed even if they don't match the pattern.
   */
  private async listWithDepthExpansion(
    basePath: string,
    options: AFSListOptions | undefined,
    maxDepth: number,
  ): Promise<AFSListResult> {
    const limit = options?.limit ?? 1000;
    const pattern = options?.pattern;

    const visited = new Set<string>();

    // BFS queue: [path, currentDepth]
    // depth 0 = basePath itself, depth 1 = children, etc.
    const queue: Array<{ path: string; depth: number }> = [{ path: basePath, depth: 0 }];

    // Track entries before pattern filtering (need more than limit for filtering)
    const unfilteredEntries: AFSEntry[] = [];

    while (queue.length > 0) {
      const { path, depth } = queue.shift()!;

      // Prevent infinite loops
      if (visited.has(path)) continue;
      visited.add(path);

      // Call handler with depth=1 and WITHOUT pattern to get all entries for expansion
      const singleLevelOptions: AFSListOptions = {
        ...options,
        maxDepth: 1, // Always request single level from handler
        pattern: undefined, // Don't filter during BFS - filter at end
      };

      const match = this.router.match(path, "list");
      if (!match) continue;

      const ctx: RouteContext = {
        path,
        params: match.params,
        options: singleLevelOptions,
        context: extractContext(options),
      };

      const handler = match.route.handler as ListRouteHandler;

      // Wrap in try-catch to handle files deleted during BFS traversal
      let result: Awaited<ReturnType<ListRouteHandler>>;
      try {
        result = await handler(ctx);
      } catch (error) {
        // Ignore not found errors - file may have been deleted during expansion
        const code = (error as NodeJS.ErrnoException).code;
        const isNotFound =
          code === "ENOENT" ||
          code === "ENOTDIR" ||
          (error instanceof Error && error.message.includes("not found"));
        if (isNotFound) {
          continue;
        }
        throw error;
      }

      // Collect paths that should not be expanded (internal hint from handler)
      const noExpandSet = new Set(result.noExpand ?? []);

      // Note: maxChildren is passed to handler via options, so handler applies it to children
      // We don't apply it again here to avoid double-limiting

      // Add entries to results and queue directories for expansion
      for (const entry of result.data) {
        // Skip the current path entry for depth > 0 (it was already added as a child by parent)
        // At depth 0, include the root entry
        if (entry.path === path && depth > 0) {
          continue;
        }

        // Inject default meta.kind if not set by handler
        const childrenCount = entry.meta?.childrenCount;
        const isDirectory = childrenCount !== undefined && childrenCount !== 0;
        if (entry.meta && !entry.meta.kind) {
          entry.meta.kind = isDirectory || childrenCount === 0 ? "afs:node" : "afs:leaf";
        }

        unfilteredEntries.push(entry);

        // Queue entry for expansion if:
        // 1. Within depth limit (depth < maxDepth means we can go one more level)
        // 2. Entry is a directory (childrenCount > 0 or -1, NOT undefined which means leaf)
        // 3. Entry is not the current path (which is already being processed)
        // 4. Entry is not in noExpand set (used for ignored directories)
        const shouldExpand = !noExpandSet.has(entry.path);

        if (depth < maxDepth - 1 && isDirectory && shouldExpand && entry.path !== path) {
          queue.push({ path: entry.path, depth: depth + 1 });
        }
      }
    }

    // Apply pattern filtering after BFS completes
    let matchedEntries: AFSEntry[];
    if (pattern) {
      matchedEntries = [];
      for (const entry of unfilteredEntries) {
        if (this.matchesPattern(entry.path, pattern)) {
          matchedEntries.push(entry);
        }
      }
    } else {
      matchedEntries = unfilteredEntries;
    }

    // Apply offset/limit pagination
    const offset = options?.offset ?? 0;
    const totalCount = matchedEntries.length;
    const sliced = offset > 0 ? matchedEntries.slice(offset) : matchedEntries;
    const limited = sliced.length > limit ? sliced.slice(0, limit) : sliced;

    return {
      data: limited,
      total: totalCount,
    };
  }

  /**
   * Check if a path matches a glob pattern
   */
  private matchesPattern(path: string, pattern: string): boolean {
    return minimatch(path, pattern, { matchBase: true });
  }

  /**
   * Read an entry at a path
   */
  async read(path: string, options?: AFSReadOptions): Promise<AFSReadResult> {
    const normalizedPath = this.normalizePath(path);

    // Handle reading individual action definitions: */.actions/:actionName
    // This allows providers to expose action details via read() without
    // needing to define individual read handlers for each action
    const actionsMatch = normalizedPath.match(/^(.*)\/\.actions\/([^/]+)$/);
    if (actionsMatch) {
      const actionsListPath = `${actionsMatch[1] || ""}/.actions`;
      const actionName = actionsMatch[2];

      // Try to find a list handler for the .actions path
      const listMatch = this.router.match(actionsListPath, "list");
      if (listMatch) {
        const ctx: RouteContext = {
          path: actionsListPath,
          params: listMatch.params,
          options: {},
          context: extractContext(options),
        };
        const handler = listMatch.route.handler as ListRouteHandler;
        const result = await handler(ctx);

        // Find the action by name (check summary, id, path suffix, or meta.name)
        const actionEntry = result.data.find(
          (entry) =>
            entry.summary === actionName ||
            entry.id === actionName ||
            entry.id.endsWith(`:${actionName}`) ||
            entry.id.endsWith(`/.actions/${actionName}`) ||
            entry.meta?.name === actionName,
        );

        if (actionEntry) {
          return { data: actionEntry };
        }
      }
    }

    // Standard handler matching
    const match = this.router.match(normalizedPath, "read");
    if (match) {
      const ctx: RouteContext = {
        path: normalizedPath,
        params: match.params,
        options,
        context: extractContext(options),
      };

      const handler = match.route.handler as ReadRouteHandler;
      const entry = await handler(ctx);

      return this.applyLineRange({ data: entry }, options);
    }

    // Fallback: if no read handler, try the .meta subpath handler (directory-like reads)
    const metaPath = normalizedPath === "/" ? "/.meta" : `${normalizedPath}/.meta`;
    const metaMatch = this.router.match(metaPath, "read");
    if (metaMatch) {
      const ctx: RouteContext = {
        path: normalizedPath,
        params: metaMatch.params,
        options,
        context: extractContext(options),
      };
      const handler = metaMatch.route.handler as ReadRouteHandler;
      const entry = await handler(ctx);
      return this.applyLineRange({ data: entry }, options);
    }

    throw new AFSNotFoundError(normalizedPath);
  }

  /**
   * Apply line-range slicing to a read result.
   * Only applies to string content when startLine or endLine is specified.
   */
  private applyLineRange(result: AFSReadResult, options?: AFSReadOptions): AFSReadResult {
    const startLine = options?.startLine;
    const endLine = options?.endLine;
    if (startLine === undefined && endLine === undefined) return result;

    const entry = result.data;
    if (!entry || typeof entry.content !== "string") return result;

    const start = startLine ?? 1;
    const end = endLine ?? -1;
    if (end !== -1 && start > end) {
      throw new Error(`Invalid range: startLine ${start} > endLine ${end}`);
    }

    const lines = entry.content.split("\n");
    const totalLines = lines.length;
    const effectiveEnd = end === -1 ? totalLines : Math.min(end, totalLines);
    const sliced = start > totalLines ? "" : lines.slice(start - 1, effectiveEnd).join("\n");

    return {
      ...result,
      data: {
        ...entry,
        content: sliced,
        meta: {
          ...entry.meta,
          lineRange: { startLine: start, endLine: effectiveEnd, totalLines },
        },
      },
    };
  }

  /**
   * Write an entry at a path
   */
  async write(
    path: string,
    content: AFSWriteEntryPayload,
    options?: AFSWriteOptions,
  ): Promise<AFSWriteResult> {
    if (this.accessMode === "readonly") {
      throw new AFSReadonlyError("Cannot write on a readonly provider");
    }

    const mode = options?.mode ?? "replace";
    const normalizedPath = this.normalizePath(path);

    // create mode: fail if path already exists
    if (mode === "create") {
      try {
        await this.stat(path);
        throw new AFSAlreadyExistsError(normalizedPath);
      } catch (e) {
        if (e instanceof AFSAlreadyExistsError) throw e;
        if (!(e instanceof AFSNotFoundError)) throw e;
        // AFSNotFoundError → path doesn't exist → proceed as replace
      }
    }

    // update mode: fail if path does not exist
    if (mode === "update") {
      try {
        await this.stat(path);
      } catch (e) {
        if (e instanceof AFSNotFoundError) throw e;
        throw e;
      }
    }

    // patch mode: read current → apply patches → write(replace)
    if (mode === "patch") {
      const patches = content.patches;
      if (!patches || patches.length === 0) {
        const existing = await this.read(path);
        return { data: existing.data! };
      }
      const existing = await this.read(path);
      const text = String(existing.data?.content ?? "");
      const patched = applyPatches(text, patches);
      return this.write(path, { content: patched }, { mode: "replace" });
    }

    // prepend mode: read current → prepend → write(replace)
    if (mode === "prepend") {
      let text = "";
      try {
        const existing = await this.read(path);
        text = String(existing.data?.content ?? "");
      } catch (e) {
        if (!(e instanceof AFSNotFoundError)) throw e;
        // path doesn't exist → treat as empty
      }
      const prepended = String(content.content ?? "") + text;
      return this.write(path, { content: prepended }, { mode: "replace" });
    }

    // append mode: read current → append → write(replace)
    if (mode === "append") {
      let text = "";
      try {
        const existing = await this.read(path);
        text = String(existing.data?.content ?? "");
      } catch (e) {
        if (!(e instanceof AFSNotFoundError)) throw e;
        // path doesn't exist → treat as empty
      }
      const appended = text + String(content.content ?? "");
      return this.write(path, { content: appended }, { mode: "replace" });
    }

    // Only "replace" reaches the @Write handler
    const match = this.router.match(normalizedPath, "write");

    if (!match) {
      throw new Error(`No write handler for path: ${path}`);
    }

    const ctx: RouteContext = {
      path: normalizedPath,
      params: match.params,
      options: { ...options, mode: "replace" },
      context: extractContext(options),
    };

    const handler = match.route.handler as WriteRouteHandler;
    return handler(ctx, content);
  }

  /**
   * Delete an entry at a path
   */
  async delete(path: string, options?: AFSDeleteOptions): Promise<AFSDeleteResult> {
    if (this.accessMode === "readonly") {
      throw new AFSReadonlyError("Cannot delete on a readonly provider");
    }

    const normalizedPath = this.normalizePath(path);
    const match = this.router.match(normalizedPath, "delete");

    if (!match) {
      throw new AFSNotFoundError(normalizedPath);
    }

    const ctx: RouteContext = {
      path: normalizedPath,
      params: match.params,
      options,
      context: extractContext(options),
    };

    const handler = match.route.handler as DeleteRouteHandler;
    return handler(ctx);
  }

  /**
   * Search entries at a path
   */
  async search(path: string, query: string, options?: AFSSearchOptions): Promise<AFSSearchResult> {
    const normalizedPath = this.normalizePath(path);
    const match = this.router.match(normalizedPath, "search");

    if (!match) {
      return { data: [] };
    }

    const ctx: RouteContext = {
      path: normalizedPath,
      params: match.params,
      options,
      context: extractContext(options),
    };

    const handler = match.route.handler as SearchRouteHandler;
    return handler(ctx, query, options);
  }

  /**
   * Execute an action at a path
   */
  async exec(
    path: string,
    args: Record<string, unknown>,
    options?: AFSExecOptions,
  ): Promise<AFSExecResult> {
    if (this.accessMode === "readonly") {
      throw new AFSReadonlyError("Cannot exec on a readonly provider");
    }

    const normalizedPath = this.normalizePath(path);
    const match = this.router.match(normalizedPath, "exec");

    if (!match) {
      throw new Error(`No exec handler for path: ${path}`);
    }

    const ctx: RouteContext = {
      path: normalizedPath,
      params: match.params,
      options,
      context: extractContext(options),
    };

    const handler = match.route.handler as ExecRouteHandler;
    return handler(ctx, args);
  }

  /**
   * Get stat information for a path
   *
   * Note: Fallback to read() is handled at AFS core level, not here.
   */
  async stat(path: string, options?: AFSStatOptions): Promise<AFSStatResult> {
    const normalizedPath = this.normalizePath(path);
    const match = this.router.match(normalizedPath, "stat");

    if (match) {
      const ctx: RouteContext = {
        path: normalizedPath,
        params: match.params,
        options,
        context: extractContext(options),
      };

      const handler = match.route.handler as StatRouteHandler;
      return handler(ctx);
    }

    throw new AFSNotFoundError(normalizedPath);
  }

  /**
   * Get human-readable explanation for a path
   *
   * Note: Fallback to stat() is handled at AFS core level, not here.
   */
  async explain(path: string, options?: AFSExplainOptions): Promise<AFSExplainResult> {
    const normalizedPath = this.normalizePath(path);
    const match = this.router.match(normalizedPath, "explain");

    if (!match) {
      throw new Error(`No explain handler for path: ${path}`);
    }

    const ctx: RouteContext = {
      path: normalizedPath,
      params: match.params,
      options,
      context: extractContext(options),
    };

    const handler = match.route.handler as ExplainRouteHandler;
    return handler(ctx);
  }

  /**
   * Rename/move a path
   */
  async rename(
    oldPath: string,
    newPath: string,
    options?: AFSRenameOptions,
  ): Promise<AFSRenameResult> {
    if (this.accessMode === "readonly") {
      throw new AFSReadonlyError("Cannot rename on a readonly provider");
    }

    const normalizedPath = this.normalizePath(oldPath);
    const match = this.router.match(normalizedPath, "rename");

    if (!match) {
      throw new AFSNotFoundError(normalizedPath);
    }

    const ctx: RouteContext = {
      path: normalizedPath,
      params: match.params,
      options,
      context: extractContext(options),
    };

    const handler = match.route.handler as RenameRouteHandler;
    return handler(ctx, newPath);
  }

  // ========== Utility Methods ==========

  /**
   * Normalize a path to ensure consistent format
   * - Always starts with /
   * - No trailing slash (except for root)
   * - Resolves .. (parent directory) — prevents traversal above root
   * - Collapses multiple consecutive slashes
   * - Rejects whitespace-only segments
   */
  protected normalizePath(path: string): string {
    if (!path || path === "/") {
      return "/";
    }

    // Ensure leading slash before delegating to core normalization
    const withSlash = path.startsWith("/") ? path : `/${path}`;
    return coreNormalizePath(withSlash);
  }

  /**
   * Join path segments
   */
  protected joinPath(...segments: string[]): string {
    const joined = segments
      .map((s) => s.replace(/^\/+|\/+$/g, ""))
      .filter(Boolean)
      .join("/");

    return `/${joined}`;
  }

  /**
   * Build an AFSEntry helper
   *
   * @param path - The entry path (will be normalized)
   * @param options - Entry options
   * @param options.id - Entry ID. Defaults to normalized path if not provided
   * @param options.content - Entry content
   * @param options.meta - Entry metadata
   * @param options.createdAt - Creation time. Undefined if not available from data source
   * @param options.updatedAt - Last update time. Undefined if not available from data source
   *
   * @example
   * ```typescript
   * // Simple entry with just path
   * this.buildEntry("/items/1")
   *
   * // Entry with content and metadata
   * this.buildEntry("/items/1", {
   *   content: { name: "Item 1" },
   *   meta: { size: 100 },
   * })
   *
   * // Entry with all fields
   * this.buildEntry("/items/1", {
   *   id: "custom-id",
   *   content: data,
   *   meta: { size: stats.size },
   *   createdAt: stats.birthtime,
   *   updatedAt: stats.mtime,
   * })
   * ```
   */
  protected buildEntry(
    path: string,
    options?: {
      id?: string;
      content?: unknown;
      meta?: Partial<AFSEntryMetadata>;
      createdAt?: Date;
      updatedAt?: Date;
    },
  ): AFSEntry {
    const normalizedPath = this.normalizePath(path);
    return {
      id: options?.id ?? normalizedPath,
      path: normalizedPath,
      content: options?.content,
      meta: options?.meta as AFSEntryMetadata,
      createdAt: options?.createdAt,
      updatedAt: options?.updatedAt,
    };
  }

  /**
   * Get the router (for testing/debugging)
   */
  protected getRouter(): ProviderRouter {
    return this.router;
  }

  /**
   * Return a structured capability summary for the knowledge index.
   *
   * Default implementation auto-introspects registered routes to list
   * actions (exec routes with descriptions) and documentation paths
   * (explain routes). Providers can override to add richer content.
   */
  summarize(): AFSProviderSummary {
    const actions: AFSProviderSummary["actions"] = [];

    // Introspect exec routes for actions
    for (const route of this.router.getRoutesForOperation("exec")) {
      if (!route.description) continue;
      actions.push({
        pattern: route.pattern,
        description: route.description,
      });
    }

    // Introspect explain routes for documentation paths
    const docs: string[] = [];
    for (const route of this.router.getRoutesForOperation("explain")) {
      if (route.pattern && route.pattern !== "/") {
        docs.push(route.pattern);
      }
    }

    return {
      name: this.name,
      description: this.description,
      actions,
      docs,
    };
  }
}

/**
 * Structured capability summary returned by provider.summarize().
 * Used by the knowledge index to build the AFS-wide capability catalog.
 */
export interface AFSProviderSummary {
  name: string;
  description?: string;
  /** Executable actions with patterns and descriptions */
  actions: Array<{ pattern: string; description: string; params?: string }>;
  /** Paths where explain handlers provide documentation */
  docs: string[];
}
