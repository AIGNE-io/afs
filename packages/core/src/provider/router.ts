import { normalizePath } from "../path.js";
import type {
  ListDecoratorOptions,
  RouteDefinition,
  RouteHandler,
  RouteMatch,
  RouteOperation,
} from "./types.js";

/**
 * Compiled route with URLPattern and metadata
 */
interface CompiledRoute {
  /** URLPattern instance for matching */
  pattern: URLPattern;
  /** Original pattern string (e.g., /:path*\/.meta) */
  originalPattern: string;
  /** Route definition */
  definition: RouteDefinition;
  /** Specificity score for priority sorting */
  specificity: number;
}

/**
 * Internal storage for routes by operation
 */
interface RouterStorage {
  routes: CompiledRoute[];
}

/**
 * Calculate specificity score for a pattern.
 * Higher score = higher priority.
 *
 * Scoring rules:
 * - Static segment: +100
 * - Named parameter (single segment): +10
 * - Wildcard ((.*)  or (.+) or * or +): +1
 * - Bonus for more segments: +5 per segment
 *
 * Examples:
 * - /:path(.*) = 1 + 5 = 6 (low)
 * - /:path(.*)/.meta = 1 + 100 + 10 = 111 (higher - has static .meta)
 * - /:path(.*)/.meta/.kinds = 1 + 100 + 100 + 15 = 216 (highest)
 */
function calculateSpecificity(pattern: string): number {
  let score = 0;
  const segments = pattern.split("/").filter(Boolean);

  for (const segment of segments) {
    // Check for wildcard patterns: ends with *, +, (.*), or (.+)
    const isWildcard =
      segment.endsWith("*") ||
      segment.endsWith("+") ||
      segment.endsWith("(.*)") ||
      segment.endsWith("(.+)");

    if (isWildcard) {
      // Wildcard: lowest priority
      score += 1;
    } else if (segment.startsWith(":")) {
      // Named parameter
      score += 10;
    } else {
      // Static segment: highest priority
      score += 100;
    }
  }

  // Bonus for more segments (longer patterns are more specific)
  score += segments.length * 5;

  // Exact root "/" gets max specificity — it's the most specific possible match
  if (segments.length === 0) {
    score = 1000;
  }

  return score;
}

// Convert AFS route pattern syntax to URLPattern syntax.
// Conversions:
// - Standalone wildcard (e.g. at end) → /:_(.*) or /:name(.*)
// - Suffix patterns (wildcard followed by more path) → optional group {/:name(.*)}?/suffix
// - Trailing wildcard preceded by segments → optional group {/:name(.*)}?
// - :name+ → :name(.+) (one or more segments)
function convertToURLPattern(pattern: string): string {
  // Replace standalone /** with /:_(.*)
  let result = pattern.replace(/\/\*\*$/g, "/:_(.*)");
  result = result.replace(/\/\*\*\//g, "/:_(.*)/");

  // Handle /** at start or middle
  if (result.includes("/**")) {
    result = result.replace(/\/\*\*/g, "/:_(.*)");
  }

  // Convert :name* followed by more path (suffix pattern) to optional group
  // e.g., /:path*/.meta → {/:path(.*)}?/.meta
  result = result.replace(/\/:(\w+)\*(\/.+)/g, "{/:$1(.*)}?$2");

  // Convert trailing :name* (preceded by other segments) to optional group
  // e.g., /:branch/:path* → /:branch{/:path(.*)}?
  // This allows /main to match with path=undefined, and /main/foo to match with path="foo"
  // Only apply when there are at least 2 segments (prefix + wildcard)
  const segments = result.split("/").filter(Boolean);
  if (segments.length >= 2) {
    const lastSegment = segments[segments.length - 1];
    if (lastSegment && /^:\w+\*$/.test(lastSegment)) {
      // Last segment is a wildcard like :path*
      const wildcardName = lastSegment.slice(1, -1); // Remove : and *
      const prefix = `/${segments.slice(0, -1).join("/")}`;
      result = `${prefix}{/:${wildcardName}(.*)}?`;
    }
  }

  // Convert standalone :name* to :name(.*) for zero-or-more matching (including empty)
  result = result.replace(/:(\w+)\*/g, ":$1(.*)");

  // Convert :name+ to :name(.+) for one-or-more matching
  result = result.replace(/:(\w+)\+/g, ":$1(.+)");

  return result;
}

/**
 * Provider router using native URLPattern for type-safe route handling.
 * Supports suffix patterns like /:path*\/.meta for flexible routing.
 */
export class ProviderRouter {
  private routers: Map<RouteOperation, RouterStorage> = new Map();
  private allPatterns: Set<string> = new Set();

  constructor() {
    // Initialize routers for each operation type
    const operations: RouteOperation[] = [
      "list",
      "read",
      "write",
      "delete",
      "exec",
      "search",
      "stat",
      "explain",
      "rename",
    ];
    for (const op of operations) {
      this.routers.set(op, {
        routes: [],
      });
    }
  }

  /**
   * Register a route with the router
   */
  registerRoute(
    pattern: string,
    operation: RouteOperation,
    handler: RouteHandler,
    description?: string,
    listOptions?: ListDecoratorOptions,
  ): void {
    const storage = this.routers.get(operation);
    if (!storage) {
      throw new Error(`Unknown operation: ${operation}`);
    }

    // Check for conflict
    const existing = storage.routes.find((r) => r.originalPattern === pattern);
    if (existing) {
      console.warn(
        `[AFSBaseProvider] Route conflict: ${operation} ${pattern} is being overwritten`,
      );
      // Remove the existing route
      storage.routes = storage.routes.filter((r) => r.originalPattern !== pattern);
    }

    const definition: RouteDefinition = {
      pattern,
      operation,
      handler,
      description,
      listOptions,
    };

    // Convert pattern to URLPattern syntax
    const urlPatternPath = convertToURLPattern(pattern);

    // Create URLPattern (using pathname only)
    const urlPattern = new URLPattern({ pathname: urlPatternPath });

    const specificity = calculateSpecificity(urlPatternPath);

    const compiledRoute: CompiledRoute = {
      pattern: urlPattern,
      originalPattern: pattern,
      definition,
      specificity,
    };

    // Insert in sorted order (highest specificity first)
    let inserted = false;
    for (let i = 0; i < storage.routes.length; i++) {
      const existingRoute = storage.routes[i];
      if (existingRoute && specificity > existingRoute.specificity) {
        storage.routes.splice(i, 0, compiledRoute);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      storage.routes.push(compiledRoute);
    }

    this.allPatterns.add(pattern);
  }

  /**
   * Match a path against registered routes for an operation.
   * Routes are checked in specificity order (most specific first).
   */
  match(path: string, operation: RouteOperation): RouteMatch | null {
    const storage = this.routers.get(operation);
    if (!storage) {
      return null;
    }

    // Ensure path starts with /
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    // Try routes in order (already sorted by specificity)
    for (const route of storage.routes) {
      const result = route.pattern.exec({ pathname: normalizedPath });
      if (result) {
        // Detect wildcard param names from the original pattern
        const wildcardParams = new Set<string>();
        const wildcardRegex = /:(\w+)[*+]/g;
        for (const wm of route.originalPattern.matchAll(wildcardRegex)) {
          wildcardParams.add(wm[1]!);
        }
        // Internal underscore wildcard (from /** conversion)
        if (route.originalPattern.includes("/**")) {
          wildcardParams.add("_");
        }

        // Extract params from URLPattern groups
        const params: Record<string, string | undefined> = {};
        const groups = result.pathname.groups;

        for (const [key, value] of Object.entries(groups)) {
          if (value === undefined) {
            params[key] = value;
            continue;
          }

          // Decode URL-encoded characters (e.g., %20 for spaces)
          const decoded = decodeURIComponent(value);

          if (wildcardParams.has(key)) {
            // Wildcard params capture multi-segment paths — normalize to prevent traversal
            params[key] = normalizePath(`/${decoded}`).slice(1) || decoded;
          } else {
            // Named params should be single path segments — reject if they contain / or ..
            if (decoded.includes("/")) {
              return null; // Param contains path separator — no match
            }
            if (decoded === ".." || decoded === ".") {
              return null; // Param is a traversal sequence — no match
            }
            params[key] = decoded;
          }
        }

        return {
          route: route.definition,
          params: params as Record<string, string>,
        };
      }
    }

    return null;
  }

  /**
   * Get static children paths for a given path.
   * Used for list auto-expansion.
   *
   * This analyzes all registered patterns to find which ones
   * would be direct children of the given path.
   *
   * Excludes .meta and .actions as they are implicit paths.
   */
  getStaticChildren(basePath: string): string[] {
    const children: string[] = [];
    const normalizedBase = basePath === "/" ? "" : basePath;

    for (const pattern of this.allPatterns) {
      // Skip .meta and .actions - they are implicit
      if (pattern.endsWith("/.meta") || pattern.endsWith("/.actions")) {
        continue;
      }

      // Try to find a static child segment in this pattern
      const childPath = this.findStaticChild(normalizedBase, pattern);
      if (childPath && !children.includes(childPath)) {
        children.push(childPath);
      }
    }

    return children;
  }

  /**
   * Find a static child path from a pattern relative to basePath
   *
   * For patterns like "/:table/new" and basePath "/users",
   * we need to check if the pattern could match and what static
   * segment comes after.
   */
  private findStaticChild(basePath: string, pattern: string): string | null {
    const baseSegments = basePath ? basePath.split("/").filter(Boolean) : [];
    const patternSegments = pattern.split("/").filter(Boolean);

    // Pattern must be longer than base to have a child
    if (patternSegments.length <= baseSegments.length) {
      return null;
    }

    // Check if pattern could match basePath
    for (let i = 0; i < baseSegments.length; i++) {
      const patternSeg = patternSegments[i];
      const baseSeg = baseSegments[i];

      // Pattern segment must either match exactly or be a parameter/wildcard
      const isParam = patternSeg?.startsWith(":");
      const isWildcard =
        patternSeg === "**" ||
        patternSeg?.endsWith("*") ||
        patternSeg?.endsWith("+") ||
        patternSeg?.endsWith("(.*)") ||
        patternSeg?.endsWith("(.+)");
      if (patternSeg !== baseSeg && !isParam && !isWildcard) {
        return null;
      }
    }

    // Get the next segment after basePath
    const nextSegment = patternSegments[baseSegments.length];

    // Must be a static segment (not a parameter or wildcard)
    if (!nextSegment) {
      return null;
    }
    const isParam = nextSegment.startsWith(":");
    const isWildcard =
      nextSegment === "**" ||
      nextSegment.endsWith("*") ||
      nextSegment.endsWith("+") ||
      nextSegment.endsWith("(.*)") ||
      nextSegment.endsWith("(.+)");
    if (isParam || isWildcard) {
      return null;
    }

    // Build the child path
    return `${basePath}/${nextSegment}`;
  }

  /**
   * Get all registered patterns
   */
  getAllPatterns(): string[] {
    return Array.from(this.allPatterns);
  }

  /**
   * Get all routes for an operation
   */
  getRoutesForOperation(operation: RouteOperation): RouteDefinition[] {
    const storage = this.routers.get(operation);
    if (!storage) {
      return [];
    }
    return storage.routes.map((r) => r.definition);
  }
}
