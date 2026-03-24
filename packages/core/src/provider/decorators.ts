import type { ListDecoratorOptions, RouteMetadata, RouteOperation } from "./types.js";

// biome-ignore lint/complexity/noBannedTypes: WeakMap requires object key type, Function is appropriate for class constructors
type Constructor = Function;

/**
 * WeakMap-based route registry
 * Using WeakMap to avoid memory leaks - when class is garbage collected,
 * its routes are automatically cleaned up
 */
const routeRegistry = new WeakMap<Constructor, RouteMetadata[]>();

/**
 * Get all registered routes for a class (including inherited routes)
 */
export function getRoutes(ctor: Constructor): RouteMetadata[] {
  const routes: RouteMetadata[] = [];

  // Walk up the prototype chain to collect routes from parent classes
  let current: Constructor | null = ctor;
  while (current && current !== Function.prototype && current !== Object) {
    const classRoutes = routeRegistry.get(current);
    if (classRoutes) {
      // Prepend parent routes so child routes can override
      routes.unshift(...classRoutes);
    }
    current = Object.getPrototypeOf(current);
  }

  // Deduplicate: when a child class overrides a parent's route (same pattern + operation),
  // keep only the child's version (last occurrence) to avoid "Route conflict" warnings.
  const seen = new Set<string>();
  const deduped: RouteMetadata[] = [];
  for (let i = routes.length - 1; i >= 0; i--) {
    const r = routes[i]!;
    const key = `${r.operation}:${r.pattern}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.unshift(r);
    }
  }

  return deduped;
}

/**
 * Clear routes for a class (mainly for testing)
 */
export function clearRoutes(ctor: Constructor): void {
  routeRegistry.delete(ctor);
}

/**
 * Register a route on a class
 */
function registerRoute(
  ctor: Constructor,
  pattern: string,
  operation: RouteOperation,
  methodName: string,
  description?: string,
  listOptions?: ListDecoratorOptions,
): void {
  const routes = routeRegistry.get(ctor) || [];
  routes.push({ pattern, operation, methodName, description, listOptions });
  routeRegistry.set(ctor, routes);
}

/**
 * Create a route decorator for a specific operation
 */
function createRouteDecorator(operation: RouteOperation) {
  return (pattern: string, description?: string): MethodDecorator =>
    (target: object, propertyKey: string | symbol): void => {
      const ctor = target.constructor;
      registerRoute(ctor, pattern, operation, String(propertyKey), description);
    };
}

/**
 * @List decorator - handles list operations
 * Handler should return: { data: AFSEntry[], total?: number }
 *
 * @param pattern - Route pattern to match
 * @param optionsOrDescription - Either a description string or ListDecoratorOptions
 *
 * @example
 * ```typescript
 * // Simple usage
 * @List("/:table")
 * async listRows(ctx: RouteContext<{ table: string }>) {
 *   return { data: rows, total: 100 };
 * }
 *
 * // Default behavior - base provider handles depth via BFS
 * @List("/**")
 * async listDir(ctx: RouteContext) {
 *   // Only need to return single-level results
 *   return { data: entries };
 * }
 *
 * // Handler manages depth itself (opt-in for special cases like S3)
 * @List("/**", { handleDepth: true })
 * async listDirWithDepth(ctx: RouteContext) {
 *   // Handler implements maxDepth logic
 *   return { data: entries };
 * }
 * ```
 */
export function List(
  pattern: string,
  optionsOrDescription?: string | ListDecoratorOptions,
): MethodDecorator {
  return (target: object, propertyKey: string | symbol): void => {
    const ctor = target.constructor;
    const description = typeof optionsOrDescription === "string" ? optionsOrDescription : undefined;
    const listOptions = typeof optionsOrDescription === "object" ? optionsOrDescription : undefined;
    registerRoute(ctor, pattern, "list", String(propertyKey), description, listOptions);
  };
}

/**
 * @Read decorator - handles read operations
 * Handler should return: AFSEntry
 *
 * @example
 * ```typescript
 * @Read("/:table/:pk")
 * async getRow(ctx: RouteContext<{ table: string; pk: string }>) {
 *   return { id: pk, path: ctx.path, content: row };
 * }
 * ```
 */
export const Read = createRouteDecorator("read");

/**
 * @Write decorator - handles write operations
 * Handler should return: AFSWriteResult
 *
 * @example
 * ```typescript
 * @Write("/:table/:pk")
 * async updateRow(ctx: RouteContext, content: AFSWriteEntryPayload) {
 *   return { data: updatedEntry };
 * }
 * ```
 */
export const Write = createRouteDecorator("write");

/**
 * @Delete decorator - handles delete operations
 * Handler should return: AFSDeleteResult
 *
 * @example
 * ```typescript
 * @Delete("/:table/:pk")
 * async deleteRow(ctx: RouteContext<{ table: string; pk: string }>) {
 *   return { message: "Deleted" };
 * }
 * ```
 */
export const Delete = createRouteDecorator("delete");

/**
 * @Exec decorator - handles exec operations
 * Handler should return: AFSExecResult
 *
 * @example
 * ```typescript
 * @Exec("/:table/:pk/.actions/:action")
 * async executeAction(ctx: RouteContext, args: Record<string, unknown>) {
 *   return { data: { success: true } };
 * }
 * ```
 */
export const Exec = createRouteDecorator("exec");

/**
 * @Search decorator - handles search operations
 * Handler should return: AFSSearchResult
 *
 * @example
 * ```typescript
 * @Search("/:table")
 * async searchTable(ctx: RouteContext, query: string, options?: AFSSearchOptions) {
 *   return { data: matchingEntries };
 * }
 * ```
 */
export const Search = createRouteDecorator("search");

/**
 * @Meta decorator - handles .meta path reads (introspection only, read-only)
 * Automatically appends /.meta to the pattern
 * Handler should return: AFSEntry
 *
 * Note: Meta is read-only. To write metadata, use @Write handler with payload.meta.
 *
 * @example
 * ```typescript
 * @Meta("/:table/:pk")  // Registers as /:table/:pk/.meta
 * async getRowMeta(ctx: RouteContext<{ table: string; pk: string }>) {
 *   return { id: "meta", path: `${ctx.path}/.meta`, content: schema };
 * }
 *
 * @Meta("/")  // Registers as /.meta (root metadata)
 * async getRootMeta(ctx: RouteContext) {
 *   return { id: "meta", path: "/.meta", content: rootSchema };
 * }
 * ```
 */
export function Meta(pattern: string, description?: string): MethodDecorator {
  // Handle root pattern specially to avoid double slash
  const metaPattern = pattern === "/" ? "/.meta" : `${pattern}/.meta`;
  return createRouteDecorator("read")(metaPattern, description);
}

/**
 * Creates a list decorator for .actions path
 */
function createActionsListDecorator(pattern: string, description?: string): MethodDecorator {
  const actionsPattern = pattern === "/" ? "/.actions" : `${pattern}/.actions`;
  return createRouteDecorator("list")(actionsPattern, description);
}

/**
 * Creates an exec decorator for action execution
 */
function createActionsExecuteDecorator(
  pattern: string,
  actionName?: string,
  description?: string,
): MethodDecorator {
  const basePath = pattern === "/" ? "" : pattern;
  const fullPattern = actionName
    ? `${basePath}/.actions/${actionName}`
    : `${basePath}/.actions/:action`;
  return createRouteDecorator("exec")(fullPattern, description);
}

/**
 * Actions decorator interface - callable function with Execute method
 */
interface ActionsDecorator {
  /**
   * @Actions decorator - handles .actions path listing
   * Automatically appends /.actions to the pattern
   * Handler should return: { data: AFSEntry[] }
   *
   * @param pattern - Base path pattern for the node
   * @param description - Optional description for the route
   *
   * @example
   * ```typescript
   * @Actions("/:table/:pk")  // Registers as /:table/:pk/.actions
   * async listRowActions(ctx: RouteContext<{ table: string; pk: string }>) {
   *   return { data: availableActions };
   * }
   * ```
   */
  (pattern: string, description?: string): MethodDecorator;

  /**
   * @Actions.Exec decorator - handles action execution on nodes
   * Automatically constructs the full .actions path for action execution.
   * Handler should return: AFSExecResult
   *
   * @param pattern - Base path pattern for the node (e.g., "/issues/:number")
   * @param actionName - Optional specific action name. If omitted, registers catch-all pattern.
   * @param description - Optional description for the route
   *
   * @example
   * ```typescript
   * // Specific action - registers as /issues/:number/.actions/close
   * @Actions.Exec("/issues/:number", "close")
   * async closeIssue(ctx: RouteContext<{ number: string }>, args: Record<string, unknown>) {
   *   return { data: { success: true } };
   * }
   *
   * // Catch-all action - registers as /issues/:number/.actions/:action
   * @Actions.Exec("/issues/:number")
   * async handleIssueAction(ctx: RouteContext<{ number: string; action: string }>, args: Record<string, unknown>) {
   *   return { data: { action: ctx.params.action } };
   * }
   *
   * // Root-level action - registers as /.actions/refresh
   * @Actions.Exec("/", "refresh")
   * async refreshAll(ctx: RouteContext, args: Record<string, unknown>) {
   *   return { data: { refreshed: true } };
   * }
   * ```
   */
  Exec: (pattern: string, actionName?: string, description?: string) => MethodDecorator;
}

/**
 * @Actions decorator - handles action-related routes
 *
 * Use directly for listing actions:
 * @example
 * ```typescript
 * @Actions("/:table/:pk")  // Registers as /:table/:pk/.actions
 * async listRowActions(ctx: RouteContext<{ table: string; pk: string }>) {
 *   return { data: availableActions };
 * }
 * ```
 *
 * Use Actions.Exec for action execution:
 * @example
 * ```typescript
 * @Actions.Exec("/:table/:pk", "close")
 * async closeAction(ctx: RouteContext, args: Record<string, unknown>) { ... }
 * ```
 */
export const Actions: ActionsDecorator = Object.assign(
  // Main function - for listing actions
  (pattern: string, description?: string): MethodDecorator => {
    return createActionsListDecorator(pattern, description);
  },
  // Additional methods
  {
    Exec: createActionsExecuteDecorator,
  },
);

/**
 * @Stat decorator - handles stat operations
 * Handler should return: AFSStatResult
 *
 * @example
 * ```typescript
 * @Stat("/:path*")
 * async statPath(ctx: RouteContext<{ path?: string }>) {
 *   return { data: { path: ctx.path, size: 100, modified: new Date() } };
 * }
 * ```
 */
export const Stat = createRouteDecorator("stat");

/**
 * @Explain decorator - handles explain operations
 * Handler should return: AFSExplainResult
 *
 * @example
 * ```typescript
 * @Explain("/:path*")
 * async explainPath(ctx: RouteContext<{ path?: string }>) {
 *   return { data: { content: "...", format: "markdown" } };
 * }
 * ```
 */
export const Explain = createRouteDecorator("explain");

/**
 * @Rename decorator - handles rename operations
 * Handler should return: AFSRenameResult
 *
 * @example
 * ```typescript
 * @Rename("/:path*")
 * async renamePath(ctx: RouteContext<{ path?: string }>, newPath: string) {
 *   return { message: "Renamed successfully" };
 * }
 * ```
 */
export const Rename = createRouteDecorator("rename");
