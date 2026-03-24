/**
 * Domain router — host-header-based blocklet routing.
 *
 * Extracts blocklet name from Host header (e.g., "showcase.localhost:4900"),
 * loads route configs from the blocklet's AFS mount, and dispatches requests
 * to the appropriate handler (web/aup/exec).
 */

import { joinURL } from "ufo";
import { parseRouteConfig, type RouteConfig } from "../blocklet/route-config.js";
import type { AFSContext } from "../type.js";

// ─── Inlined Route Matching (from @aigne/afs-web-device) ─────────────────────
// matchRoute + LoadedRoute are small and stable. Inlining avoids pulling in
// the entire web-device package as a hard dependency of the CLI.

/** A loaded route with its file name. */
export interface LoadedRoute extends RouteConfig {
  name: string;
}

/** Longest-prefix-match routing. */
function matchRoute(
  routes: LoadedRoute[],
  pathname: string,
): { route: LoadedRoute; subPath: string } | undefined {
  const sorted = [...routes].sort((a, b) => b.path.length - a.path.length);
  for (const route of sorted) {
    if (route.path === "/") return { route, subPath: pathname };
    if (pathname === route.path || pathname.startsWith(`${route.path}/`)) {
      return { route, subPath: pathname.slice(route.path.length) || "/" };
    }
  }
  return undefined;
}

// ─── Host Header Parsing ─────────────────────────────────────────────────────

/**
 * Extract blocklet name from a Host header using *.localhost convention.
 *
 * Examples:
 * - "showcase.localhost:4900" → "showcase"
 * - "showcase.localhost" → "showcase"
 * - "localhost:4900" → undefined
 * - "showcase.aigne.io" → undefined (production domains use domainRegistry)
 * - "127.0.0.1:4900" → undefined
 *
 * Only handles `{name}.localhost` patterns. Production domains (e.g.,
 * "showcase.aigne.io") are resolved through BlockletManager.domainRegistry.
 */
export function extractBlockletFromHost(host: string): string | undefined {
  if (!host) return undefined;

  // Strip port
  const hostname = host.split(":")[0]!;

  // Only match *.localhost
  if (!hostname.endsWith(".localhost")) return undefined;

  // Extract everything before .localhost
  const name = hostname.slice(0, -".localhost".length);
  if (!name) return undefined;

  return name;
}

// ─── Route Loading ───────────────────────────────────────────────────────────

/** Minimal AFS interface needed for route loading. */
interface RouteLoadableAFS {
  list(path: string, options?: unknown): Promise<{ data?: Array<{ path: string }> }>;
  read(path: string, options?: unknown): Promise<{ data?: { content?: string } | string }>;
}

/**
 * Load route configs from a blocklet's AFS mount.
 *
 * Searches in order:
 * 1. /data/.route/ — runtime-mutable (activated blocklets with Runtime AFS)
 * 2. /blocklet/.route/ — initial seed (activated blocklets with Runtime AFS)
 * 3. /.route/ — raw filesystem mount (non-activated / lazy-mounted blocklets)
 */
export async function loadBlockletRoutes(
  afs: RouteLoadableAFS,
  blockletMountPath: string,
): Promise<LoadedRoute[]> {
  const candidates = [
    joinURL(blockletMountPath, "data/.route"),
    joinURL(blockletMountPath, "blocklet/.route"),
    joinURL(blockletMountPath, ".route"),
  ];

  for (const dir of candidates) {
    const routes = await readRouteDir(afs, dir);
    if (routes.length > 0) return routes;
  }

  return [];
}

/** Read all valid route files from a directory. */
async function readRouteDir(afs: RouteLoadableAFS, dirPath: string): Promise<LoadedRoute[]> {
  let entries: Array<{ path: string }>;
  try {
    const result = await afs.list(dirPath);
    entries = result.data ?? [];
  } catch {
    return []; // Directory doesn't exist
  }

  if (entries.length === 0) return [];

  const routes: LoadedRoute[] = [];
  for (const entry of entries) {
    const name = entry.path.split("/").pop();
    if (!name) continue;

    try {
      const readResult = await afs.read(joinURL(dirPath, name));
      const raw = readResult.data;
      const content =
        typeof raw === "string" ? raw : typeof raw?.content === "string" ? raw.content : "";
      if (!content.trim()) continue;

      const config = parseRouteConfig(content);
      routes.push({ ...config, name });
    } catch {
      // Skip invalid route files
    }
  }

  return routes;
}

// ─── Domain Router ───────────────────────────────────────────────────────────

/** Dependencies for createDomainRouter — injectable for testing. */
export interface DomainRouterDeps {
  /**
   * Resolve a blocklet name from a domain/subdomain string.
   * Returns the blocklet ID if found, undefined otherwise.
   * May trigger lazy mount (hence async).
   *
   * Called with:
   * - subdomain from *.localhost (e.g., "showcase")
   * - full hostname for production domains (e.g., "showcase.aigne.io")
   */
  resolveBlocklet: (nameOrDomain: string) => Promise<string | undefined> | string | undefined;

  /** Load routes for a blocklet by name. */
  loadRoutes: (blockletName: string) => Promise<LoadedRoute[]>;

  /** Get the AUP web client as a complete Response (may be pre-compressed). */
  getAupClientResponse: (blockletName?: string) => Promise<Response>;

  /** Serve a web page for a blocklet (handler: web). */
  renderWebPage: (blockletName: string, subPath: string, context?: AFSContext) => Promise<Response>;

  /** Handle an exec route (handler: exec). */
  handleExec: (
    blockletName: string,
    source: string,
    subPath: string,
    method: string,
    body?: unknown,
    query?: Record<string, string>,
    context?: AFSContext,
  ) => Promise<Response>;
}

export interface DomainRouter {
  /**
   * Handle an HTTP request via domain routing.
   * Returns a Response if the request matched a blocklet domain, null otherwise.
   * Pass `blockletName` to skip host resolution when already resolved upstream.
   */
  handleRequest(
    request: Request,
    options?: { context?: AFSContext; blockletName?: string },
  ): Promise<Response | null>;

  /**
   * Extract blocklet name for WebSocket upgrade from Host header.
   * Returns the blocklet name if the host resolves to a blocklet, undefined otherwise.
   */
  extractBlockletForWs(host: string): string | undefined;

  /** Clear the route cache (e.g., on blocklet reload). */
  clearCache(): void;
}

/**
 * Create a domain router that dispatches HTTP requests based on Host header.
 *
 * Flow:
 * 1. Parse Host header → blocklet name (*.localhost subdomain or production domain)
 * 2. Load + cache routes for the blocklet
 * 3. matchRoute(pathname) → handler dispatch (web/aup/exec)
 */
export function createDomainRouter(deps: DomainRouterDeps): DomainRouter {
  // Per-blocklet route cache
  const routeCache = new Map<string, Promise<LoadedRoute[]>>();

  async function getCachedRoutes(blockletName: string): Promise<LoadedRoute[]> {
    let cached = routeCache.get(blockletName);
    if (!cached) {
      cached = deps.loadRoutes(blockletName).catch((err) => {
        routeCache.delete(blockletName); // evict so next request retries
        throw err;
      });
      routeCache.set(blockletName, cached);
    }
    return cached;
  }

  async function resolveHost(host: string): Promise<string | undefined> {
    // 1. Try *.localhost subdomain extraction (e.g. "showcase.localhost:8787" → "showcase")
    const subdomain = extractBlockletFromHost(host);
    if (subdomain) {
      const resolved = await deps.resolveBlocklet(subdomain);
      if (resolved) return resolved;
    }

    // 2. Try full host (includes port) — handles instance domains in DOMAIN_KV
    //    e.g. "z3hztrey.localhost:8787" → KV lookup → JSON → blocklet slug
    const resolved = await deps.resolveBlocklet(host);
    if (resolved) return resolved;

    // 3. Try hostname without port (production domains)
    const hostname = host.split(":")[0]!;
    if (hostname && hostname !== host && hostname !== "localhost") {
      return deps.resolveBlocklet(hostname);
    }

    return undefined;
  }

  return {
    async handleRequest(
      request: Request,
      options?: { context?: AFSContext; blockletName?: string },
    ): Promise<Response | null> {
      const url = new URL(request.url);

      // Use pre-resolved blockletName if provided, skip host resolution
      const blockletName = options?.blockletName ?? (await resolveHost(url.host));
      if (!blockletName) return null;

      // Load routes
      const routes = await getCachedRoutes(blockletName);
      if (routes.length === 0) return null;

      // Match route
      const match = matchRoute(routes, url.pathname);
      if (!match) {
        return new Response("Not Found", { status: 404 });
      }

      const { route, subPath } = match;

      // Dispatch by handler type
      switch (route.handler) {
        case "web":
          return deps.renderWebPage(blockletName, subPath, options?.context);

        case "aup":
          return deps.getAupClientResponse(blockletName);

        case "exec": {
          const query: Record<string, string> = {};
          for (const [k, v] of url.searchParams) {
            query[k] = v;
          }
          let body: unknown;
          if (request.method !== "GET" && request.method !== "HEAD") {
            try {
              body = await request.json();
            } catch {
              // No body or non-JSON
            }
          }
          return deps.handleExec(
            blockletName,
            route.source,
            subPath,
            request.method,
            body,
            query,
            options?.context,
          );
        }

        default:
          return new Response("Unknown handler", { status: 500 });
      }
    },

    extractBlockletForWs(host: string): string | undefined {
      // Sync path — just extract subdomain from *.localhost, no async resolve
      return extractBlockletFromHost(host);
    },

    clearCache() {
      routeCache.clear();
    },
  };
}
