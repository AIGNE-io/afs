/**
 * AUP AuthContext — bridges provider auth flows with AUP WebSocket sessions.
 *
 * - collect(): extracts matching fields from the form data already submitted
 * - requestOpenURL(): sends a WebSocket message to open a URL in the browser
 * - createCallbackServer(): creates a standard localhost HTTP callback server
 */

import type { AuthContext, CallbackServer } from "@aigne/afs";

export interface AUPAuthContextOptions {
  /** Form data submitted by the AUP client (input field values from the dialog). */
  formData: Record<string, unknown>;
  /** Send a message to the AUP client via WebSocket. */
  sendToClient: (msg: Record<string, unknown>) => void;
}

export class AUPAuthContext implements AuthContext {
  readonly resolved: Record<string, unknown>;
  private sendToClient: (msg: Record<string, unknown>) => void;

  constructor(options: AUPAuthContextOptions) {
    this.resolved = { ...options.formData };
    this.sendToClient = options.sendToClient;
  }

  /**
   * Collect fields from schema.
   * Instead of prompting the user, extract matching fields from the already-submitted form data.
   */
  async collect(schema: {
    properties?: Record<string, unknown>;
    required?: string[];
  }): Promise<Record<string, unknown> | null> {
    const props = schema.properties ?? {};
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(props)) {
      if (this.resolved[key] !== undefined && this.resolved[key] !== "") {
        result[key] = this.resolved[key];
      }
    }
    return Object.keys(result).length > 0 ? result : null;
  }

  /**
   * Request the client to open a URL (e.g., OAuth authorization page).
   * Sends a WebSocket message; the client opens it via window.open().
   */
  async requestOpenURL(
    url: string,
    message: string,
  ): Promise<"accepted" | "declined" | "cancelled"> {
    this.sendToClient({ type: "open_url", url, message });
    return "accepted";
  }

  /**
   * Create a localhost callback server for OAuth redirect_uri flows.
   */
  async createCallbackServer(): Promise<CallbackServer> {
    const { createServer } = await import("node:http");
    return new Promise((resolve) => {
      let pendingResolve: ((params: Record<string, string> | null) => void) | null = null;

      const server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
        if (url.pathname === "/callback" && pendingResolve) {
          const params: Record<string, string> = {};
          for (const [key, value] of url.searchParams) {
            params[key] = value;
          }
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            "<html><body><h3>Authorization complete. You can close this tab.</h3></body></html>",
          );
          pendingResolve(params);
          pendingResolve = null;
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;

        resolve({
          callbackURL: `http://127.0.0.1:${port}/callback`,
          async waitForCallback(options?: { timeout?: number }) {
            const timeout = options?.timeout ?? 300_000;
            return new Promise<Record<string, string> | null>((res) => {
              pendingResolve = res;
              setTimeout(() => {
                if (pendingResolve) {
                  pendingResolve(null);
                  pendingResolve = null;
                }
              }, timeout);
            });
          },
          close() {
            server.close();
          },
        });
      });
    });
  }

  /** AUP auth waits for the user — not non-blocking. */
  readonly nonBlocking = false;
}
