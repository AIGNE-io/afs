import type {
  AFSContext,
  AFSDeleteOptions,
  AFSDeleteResult,
  AFSEntry,
  AFSExecOptions,
  AFSExecResult,
  AFSExplainResult,
  AFSListOptions,
  AFSReadOptions,
  AFSRenameResult,
  AFSSearchOptions,
  AFSSearchResult,
  AFSStatResult,
  AFSWriteEntryPayload,
  AFSWriteOptions,
  AFSWriteResult,
} from "../type.js";

/**
 * Route operation types matching AFSModule methods
 */
export type RouteOperation =
  | "list"
  | "read"
  | "write"
  | "delete"
  | "exec"
  | "search"
  | "stat"
  | "explain"
  | "rename";

/**
 * Union type for all possible operation options
 */
export type RouteOptions =
  | AFSListOptions
  | AFSReadOptions
  | AFSWriteOptions
  | AFSDeleteOptions
  | AFSExecOptions
  | AFSSearchOptions;

/**
 * Context passed to route handlers
 *
 * Note: Wildcard params (e.g., :path*) may be undefined for paths that
 * don't include that segment (e.g., root paths). Always check for undefined
 * when using optional wildcard params.
 */
export interface RouteContext<TParams = Record<string, string | undefined>> {
  /** The full request path */
  path: string;

  /** Parameters extracted from the route pattern */
  params: TParams;

  /** Operation options (type depends on operation) */
  options?: RouteOptions;

  /** Execution context (session, userId, etc.) — lifted from options.context */
  context?: AFSContext;
}

/**
 * Result type for @List handlers
 * - data: array of entries
 * - total: optional, if present indicates complete dataset size
 *          if absent, data.length IS the total (all data returned)
 * - noExpand: optional, paths that should not be expanded during BFS depth traversal
 *             (internal use only, not exposed in public API)
 */
export interface ListHandlerResult {
  data: AFSEntry[];
  total?: number;
  /** Optional message (e.g. error context when data is empty) */
  message?: string;
  /** Paths that should not be expanded during BFS (internal, not exposed in public API) */
  noExpand?: string[];
}

/**
 * Handler function types for each operation
 */
export type ListRouteHandler<TParams = Record<string, string | undefined>> = (
  ctx: RouteContext<TParams>,
) => Promise<ListHandlerResult>;

export type ReadRouteHandler<TParams = Record<string, string | undefined>> = (
  ctx: RouteContext<TParams>,
) => Promise<AFSEntry | undefined>;

export type WriteRouteHandler<TParams = Record<string, string | undefined>> = (
  ctx: RouteContext<TParams>,
  content: AFSWriteEntryPayload,
) => Promise<AFSWriteResult>;

export type DeleteRouteHandler<TParams = Record<string, string | undefined>> = (
  ctx: RouteContext<TParams>,
) => Promise<AFSDeleteResult>;

export type ExecRouteHandler<TParams = Record<string, string | undefined>> = (
  ctx: RouteContext<TParams>,
  args: Record<string, unknown>,
) => Promise<AFSExecResult>;

export type SearchRouteHandler<TParams = Record<string, string | undefined>> = (
  ctx: RouteContext<TParams>,
  query: string,
  options?: AFSSearchOptions,
) => Promise<AFSSearchResult>;

export type StatRouteHandler<TParams = Record<string, string | undefined>> = (
  ctx: RouteContext<TParams>,
) => Promise<AFSStatResult>;

export type ExplainRouteHandler<TParams = Record<string, string | undefined>> = (
  ctx: RouteContext<TParams>,
) => Promise<AFSExplainResult>;

export type RenameRouteHandler<TParams = Record<string, string | undefined>> = (
  ctx: RouteContext<TParams>,
  newPath: string,
) => Promise<AFSRenameResult>;

/**
 * Union type for all route handlers
 */
export type RouteHandler =
  | ListRouteHandler
  | ReadRouteHandler
  | WriteRouteHandler
  | DeleteRouteHandler
  | ExecRouteHandler
  | SearchRouteHandler
  | StatRouteHandler
  | ExplainRouteHandler
  | RenameRouteHandler;

/**
 * Route definition stored in the router
 */
export interface RouteDefinition {
  /** Route pattern (e.g., "/:table/:pk") */
  pattern: string;

  /** Operation type */
  operation: RouteOperation;

  /** Handler function */
  handler: RouteHandler;

  /** Optional description for documentation */
  description?: string;

  /** Options specific to list operations */
  listOptions?: ListDecoratorOptions;
}

/**
 * Options for @List decorator
 */
export interface ListDecoratorOptions {
  /**
   * Whether the handler handles maxDepth recursion itself.
   * - false (default): Base provider will auto-expand depth via BFS
   * - true: Handler is responsible for depth traversal
   *
   * Most providers can use the default (false) and just return single-level results.
   * Set to true for providers that need custom depth handling (like S3 with delimiter optimization).
   */
  handleDepth?: boolean;
}

/**
 * Metadata stored by decorators for later collection
 */
export interface RouteMetadata {
  /** Route pattern */
  pattern: string;

  /** Operation type */
  operation: RouteOperation;

  /** Method name on the class */
  methodName: string;

  /** Optional description */
  description?: string;

  /** Options specific to list operations */
  listOptions?: ListDecoratorOptions;
}

/**
 * Match result from router
 */
export interface RouteMatch {
  /** The matched route definition */
  route: RouteDefinition;

  /** Extracted parameters (wildcards may be undefined or empty string) */
  params: Record<string, string | undefined>;
}
