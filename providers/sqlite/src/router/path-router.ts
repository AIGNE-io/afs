import { createRouter, type RadixRouter } from "radix3";
import type { RouteData, RouteMatch, RouteParams } from "./types.js";

export type { RouteData };

/**
 * Creates a radix3 router for SQLite AFS path routing
 *
 * Routes:
 * - / → listTables
 * - /:table → listTable
 * - /:table/new → createRow
 * - /:table/:pk → readRow
 * - /:table/:pk/@meta → getMeta
 * - /:table/:pk/.actions → listActions
 * - /:table/:pk/.actions/:action → executeAction
 */
export function createPathRouter(): RadixRouter<RouteData> {
  return createRouter<RouteData>({
    routes: {
      // Root - list all tables
      "/": { action: "listTables" },

      // Table-level routes
      "/:table": { action: "listTable" },
      "/:table/new": { action: "createRow" },

      // Row-level routes
      "/:table/:pk": { action: "readRow" },
      "/:table/:pk/@meta": { action: "getMeta" },
      "/:table/:pk/.actions": { action: "listActions" },
      "/:table/:pk/.actions/:action": { action: "executeAction" },
    },
  });
}

/**
 * Parses a path and returns the matched route with params
 * @param router - The radix3 router instance
 * @param path - The path to match
 * @returns RouteMatch if matched, undefined otherwise
 */
export function matchPath(router: RadixRouter<RouteData>, path: string): RouteMatch | undefined {
  const result = router.lookup(path);
  if (!result) return undefined;

  return {
    action: result.action,
    params: (result.params ?? {}) as RouteParams,
  };
}

/**
 * Builds a path from components
 */
export function buildPath(table?: string, pk?: string, suffix?: string): string {
  const parts = ["/"];
  if (table) parts.push(table);
  if (pk) parts.push(pk);
  if (suffix) parts.push(suffix);
  return parts.join("/").replace(/\/+/g, "/");
}

/**
 * Checks if a path segment is a virtual path (@meta, .actions, .meta)
 */
export function isVirtualPath(segment: string): boolean {
  return segment.startsWith("@") || segment.startsWith(".");
}

/**
 * Gets the type of virtual path
 */
export function getVirtualPathType(segment: string): "meta" | "actions" | null {
  if (segment === "@meta") return "meta";
  if (segment === ".actions") return "actions";
  return null;
}
