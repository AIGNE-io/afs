/**
 * ServiceHandler — unified interface for HTTP request handling.
 *
 * Any component that can handle HTTP requests (UI provider, web-device,
 * REST API, MCP, etc.) implements this interface. This allows the same
 * handler code to run in Node.js (via daemon), Workers (via fetch handler),
 * or any other runtime that can produce a Request and consume a Response.
 *
 * Uses the Web Standard Request/Response API — available in all target runtimes.
 */

/**
 * A handler that processes an HTTP request and returns a response.
 * This is the universal service interface for AFS.
 */
export interface ServiceHandler {
  /**
   * Handle an incoming HTTP request.
   * The request URL's pathname is relative to the handler's mount prefix
   * (the router strips the prefix before dispatching).
   */
  fetch(request: Request): Promise<Response>;
}

/**
 * Optional extension: handlers that support WebSocket upgrade.
 * The router will call upgradeWebSocket when an Upgrade: websocket header is present.
 */
export interface WebSocketCapableHandler extends ServiceHandler {
  /** Return true if this handler wants to upgrade the given request. */
  wantsUpgrade?(request: Request): boolean;
}
