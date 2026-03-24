/**
 * ServiceRouter — path prefix to handler dispatch.
 *
 * Routes incoming requests to the appropriate ServiceHandler based on
 * URL path prefix matching. Longest-prefix-first matching ensures
 * /ui/ws matches before /ui.
 *
 * The router strips the matched prefix from the URL before forwarding,
 * so handlers see paths relative to their mount point.
 */

import type { ServiceHandler } from "./types.js";

interface Route {
  prefix: string;
  handler: ServiceHandler;
}

export class ServiceRouter implements ServiceHandler {
  private routes: Route[] = [];
  /** Sorted flag — routes are sorted longest-prefix-first on first fetch. */
  private sorted = false;

  /**
   * Register a handler at a path prefix.
   * Prefix must start with "/" (e.g., "/ui", "/sites/mysite", "/afs").
   * Duplicate prefixes overwrite the previous handler.
   */
  register(prefix: string, handler: ServiceHandler): void {
    if (!prefix.startsWith("/")) {
      throw new Error(`ServiceRouter: prefix must start with "/", got "${prefix}"`);
    }
    // Remove trailing slash for consistent matching (except root "/")
    const normalized = prefix.length > 1 ? prefix.replace(/\/+$/, "") : prefix;

    // Replace existing handler for same prefix
    const existing = this.routes.findIndex((r) => r.prefix === normalized);
    if (existing >= 0) {
      this.routes[existing] = { prefix: normalized, handler };
    } else {
      this.routes.push({ prefix: normalized, handler });
      this.sorted = false;
    }
  }

  /**
   * Unregister a handler at a path prefix.
   * Returns true if a handler was removed, false if no handler was found.
   */
  unregister(prefix: string): boolean {
    const normalized = prefix.length > 1 ? prefix.replace(/\/+$/, "") : prefix;
    const idx = this.routes.findIndex((r) => r.prefix === normalized);
    if (idx >= 0) {
      this.routes.splice(idx, 1);
      return true;
    }
    return false;
  }

  /** List all registered prefixes (for debugging / introspection). */
  get prefixes(): string[] {
    return this.routes.map((r) => r.prefix);
  }

  /**
   * Dispatch a request to the matching handler.
   * Returns 404 if no handler matches.
   */
  async fetch(request: Request): Promise<Response> {
    if (!this.sorted) {
      // Sort longest prefix first so "/ui/ws" matches before "/ui"
      this.routes.sort((a, b) => b.prefix.length - a.prefix.length);
      this.sorted = true;
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    for (const route of this.routes) {
      if (route.prefix === "/") {
        // Root handler matches everything that didn't match a more specific prefix
        // Only reached if no other route matched (because sorted longest-first)
        return route.handler.fetch(request);
      }

      if (pathname === route.prefix || pathname.startsWith(`${route.prefix}/`)) {
        // Strip the prefix from the URL, keeping query string and fragment
        const subPath = pathname.slice(route.prefix.length) || "/";
        const rewrittenUrl = new URL(request.url);
        rewrittenUrl.pathname = subPath;

        const rewritten = new Request(rewrittenUrl.toString(), {
          method: request.method,
          headers: request.headers,
          body: request.body,
          // @ts-expect-error -- duplex is needed for streaming bodies in Node 18+
          duplex: request.body ? "half" : undefined,
        });

        return route.handler.fetch(rewritten);
      }
    }

    return new Response("Not Found", { status: 404 });
  }
}
