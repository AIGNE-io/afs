/**
 * Daemon Integration for Blocklet Activation
 *
 * Provides HTTP API handler for /api/blocklets/* routes.
 */

import type { BlockletManager } from "./blocklet-manager.js";

/**
 * Handle /api/blocklets/* HTTP requests.
 *
 * Routes:
 * - GET  /api/blocklets       → list activated blocklets
 * - POST /api/blocklets/reload → reload all blocklets
 */
export async function handleBlockletsAPI(
  request: Request,
  blockletManager: BlockletManager,
): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname;

  // GET /api/blocklets — list activated blocklets
  if (method === "GET" && path === "/api/blocklets") {
    const blocklets = blockletManager.getActivatedBlocklets();
    return Response.json({ blocklets });
  }

  // POST /api/blocklets/reload — trigger reload
  if (method === "POST" && path === "/api/blocklets/reload") {
    try {
      await blockletManager.reload();
      return Response.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const safeMessage = message.replace(/\/[^\s"']+/g, "[path]");
      return Response.json({ error: safeMessage }, { status: 500 });
    }
  }

  // Unknown route
  return Response.json({ error: "Not found" }, { status: 404 });
}
