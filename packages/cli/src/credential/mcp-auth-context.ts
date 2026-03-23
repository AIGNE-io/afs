/**
 * MCP AuthContext implementation.
 *
 * Uses MCP elicitation protocol to collect credentials:
 * - Non-sensitive fields: form mode (Client renders UI)
 * - Sensitive fields: URL mode (local HTTP server, data never passes through Client/LLM)
 *
 * Requires an MCP Server instance that supports elicitation.
 */

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { AuthContext, CallbackServer, JSONSchema7 } from "@aigne/afs";
import { getSensitiveFields } from "@aigne/afs/utils/schema";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { createAuthServer } from "./auth-server.js";

export interface MCPAuthContextOptions {
  /** The MCP Server instance (for sending elicitation requests) */
  server: Server;
  /** Pre-resolved fields from Step 2 (env/store/config) */
  resolved?: Record<string, unknown>;
  /** Override browser URL opener (for testing). Falls back to platform-default open. */
  openURL?: (url: string) => Promise<void>;
}

/**
 * Send a logging message to the MCP client.
 * Falls back to console.error if sendLoggingMessage is not available.
 */
async function logToClient(
  server: Server,
  level: "info" | "notice" | "warning" | "error",
  message: string,
): Promise<void> {
  try {
    await server.sendLoggingMessage({ level, data: message });
  } catch {
    // Logging capability not available — fall back to stderr
    console.error(message);
  }
}

/**
 * Create an MCP AuthContext for MCP-based credential collection.
 */
export function createMCPAuthContext(options: MCPAuthContextOptions): AuthContext {
  const { server } = options;
  const resolved = options.resolved ?? {};
  const openURLFn = options.openURL;

  return {
    nonBlocking: true,

    get resolved() {
      return { ...resolved };
    },

    async collect(schema: JSONSchema7): Promise<Record<string, unknown> | null> {
      const properties = (schema as any).properties;
      if (!properties || typeof properties !== "object") return {};

      const sensitiveFields = new Set(getSensitiveFields(schema));
      const hasSensitive = sensitiveFields.size > 0;

      // Strategy: try elicitation first, fall back to browser if client doesn't support it.
      // ElicitationUnsupportedError means "not supported" → try next mode.
      // null means "user declined/cancelled" → stop and return null.

      if (hasSensitive) {
        // Sensitive fields: try URL mode (data stays local, never through Client/LLM)
        try {
          return await collectViaURLMode(server, schema);
        } catch (err) {
          if (!(err instanceof ElicitationUnsupportedError)) throw err;
        }
        // URL mode not supported — browser fallback (also keeps data local)
        return collectViaBrowser(server, schema, openURLFn);
      }

      // Non-sensitive only: try form mode (Client renders UI)
      try {
        return await collectViaFormMode(server, schema);
      } catch (err) {
        if (!(err instanceof ElicitationUnsupportedError)) throw err;
      }

      // Form mode not supported — browser fallback
      return collectViaBrowser(server, schema, openURLFn);
    },

    async createCallbackServer(): Promise<CallbackServer> {
      const authServer = await createAuthServer();
      return {
        callbackURL: authServer.callbackURL,
        waitForCallback: authServer.waitForCallback.bind(authServer),
        close: authServer.close.bind(authServer),
      };
    },

    async requestOpenURL(
      url: string,
      message: string,
    ): Promise<"accepted" | "declined" | "cancelled"> {
      try {
        const elicitationId = randomBytes(16).toString("hex");
        const result = await server.elicitInput({
          mode: "url",
          message,
          url,
          elicitationId,
        });

        if (result.action === "accept") return "accepted";
        if (result.action === "decline") return "declined";
        return "cancelled";
      } catch {
        // Client doesn't support elicitation — notify via logging and open browser directly
        try {
          await logToClient(server, "notice", `${message}\n${url}`);
          await (openURLFn ?? openURL)(url);
          return "accepted";
        } catch {
          return "cancelled";
        }
      }
    },
  };
}

/** Sentinel error: elicitation mode not supported by client */
class ElicitationUnsupportedError extends Error {
  constructor(mode: string) {
    super(`Client does not support ${mode} elicitation`);
  }
}

/**
 * Collect non-sensitive fields via MCP form mode elicitation.
 *
 * @throws ElicitationUnsupportedError if client doesn't support form mode
 * @returns collected values, or null if user declined/cancelled
 */
async function collectViaFormMode(
  server: Server,
  schema: JSONSchema7,
): Promise<Record<string, unknown> | null> {
  const properties = (schema as any).properties || {};
  const required = (schema as any).required || [];

  // Build elicitation form schema (simplified for MCP form mode)
  const formProperties: Record<string, any> = {};
  for (const [key, prop] of Object.entries(properties) as [string, any][]) {
    formProperties[key] = {
      type: "string",
      ...(prop.description ? { description: prop.description } : {}),
      ...(prop.title ? { title: prop.title } : {}),
      ...(prop.default != null ? { default: prop.default } : {}),
    };
  }

  try {
    const result = await server.elicitInput({
      mode: "form",
      message: "Please provide the required configuration:",
      requestedSchema: {
        type: "object" as const,
        properties: formProperties,
        required,
      },
    });

    if (result.action === "accept" && result.content) {
      return result.content as Record<string, unknown>;
    }

    // User declined or cancelled
    return null;
  } catch {
    // Client doesn't support form elicitation
    throw new ElicitationUnsupportedError("form");
  }
}

/**
 * Collect fields containing sensitive data via URL mode.
 * Starts a local HTTP server, sends URL mode elicitation so Client opens the browser.
 * Form data goes directly from browser to local server (never through Client/LLM).
 *
 * @throws ElicitationUnsupportedError if client doesn't support URL mode
 * @returns collected values, or null if user declined/cancelled
 */
async function collectViaURLMode(
  server: Server,
  schema: JSONSchema7,
): Promise<Record<string, unknown> | null> {
  const authServer = await createAuthServer();

  try {
    const elicitationId = randomBytes(16).toString("hex");
    const formURL = `${authServer.baseURL}/auth?nonce=${authServer.nonce}`;

    // Send URL mode elicitation to client — let errors propagate
    let elicitResult: { action: string };
    try {
      elicitResult = await server.elicitInput({
        mode: "url",
        message: "Please fill in the credential form in your browser:",
        url: formURL,
        elicitationId,
      });
    } catch {
      // Client doesn't support URL elicitation
      throw new ElicitationUnsupportedError("url");
    }

    if (elicitResult.action !== "accept") {
      // User declined or cancelled
      return null;
    }

    // Client accepted — wait for form submission with timeout
    const result = await authServer.waitForForm(schema as Record<string, any>, {
      title: "AFS Credential Collection",
      timeout: 120_000, // 2-minute safety timeout
    });

    // Notify client that elicitation is complete
    try {
      const notifyComplete = server.createElicitationCompletionNotifier(elicitationId);
      await notifyComplete();
    } catch {
      // Notification failure is non-critical
    }

    return result;
  } finally {
    authServer.close();
  }
}

/**
 * Fallback: collect credentials by opening a browser directly.
 * Used when MCP client doesn't support elicitation protocol.
 * Sends a logging notification to the client so the user can see the URL.
 */
async function collectViaBrowser(
  server: Server,
  schema: JSONSchema7,
  openURLFn?: (url: string) => Promise<void>,
): Promise<Record<string, unknown> | null> {
  const properties = (schema as any).properties || {};
  if (Object.keys(properties).length === 0) return {};

  const authServer = await createAuthServer();
  const formURL = `${authServer.baseURL}/auth?nonce=${authServer.nonce}`;

  await logToClient(server, "notice", `Please fill in credentials in your browser:\n${formURL}`);

  try {
    await (openURLFn ?? openURL)(formURL);
  } catch {
    // Browser failed to open; URL is already sent to client via logging
  }

  try {
    const result = await authServer.waitForForm(schema as Record<string, any>, {
      title: "AFS Credential Collection",
    });
    return result;
  } finally {
    authServer.close();
  }
}

/**
 * Open a URL in the default browser.
 */
function openURL(url: string): Promise<void> {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";

  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];

  return new Promise((resolve, reject) => {
    execFile(cmd, args, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
