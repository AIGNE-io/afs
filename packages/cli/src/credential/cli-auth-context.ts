/**
 * CLI AuthContext implementation.
 *
 * Collects credentials by launching a local HTTP form in the browser.
 * Opens URLs via the platform `open` command.
 * Creates callback servers via the shared auth-server module.
 */

import { execFile } from "node:child_process";
import type { AuthContext, CallbackServer, JSONSchema7 } from "@aigne/afs";
import { createAuthServer } from "./auth-server.js";

export interface CLIAuthContextOptions {
  /** Pre-resolved fields from Step 2 (env/store/config) */
  resolved?: Record<string, unknown>;
  /** Output stream (for testing). Default: process.stderr */
  output?: NodeJS.WritableStream;
  /** Custom URL opener (for testing). Default: platform `open` command. */
  openURL?: (url: string) => Promise<void>;
}

/**
 * Create a CLI AuthContext that collects credentials via a local browser form.
 */
export function createCLIAuthContext(options?: CLIAuthContextOptions): AuthContext {
  const resolved = options?.resolved ?? {};
  const output = options?.output ?? process.stderr;
  const openURLFn = options?.openURL ?? openURL;

  return {
    get resolved() {
      return { ...resolved };
    },

    async collect(schema: JSONSchema7): Promise<Record<string, unknown> | null> {
      const properties = (schema as any).properties;
      if (!properties || typeof properties !== "object") return {};
      if (Object.keys(properties).length === 0) return {};

      // Start auth server and open form in browser
      const server = await createAuthServer();
      const formURL = `${server.baseURL}/auth?nonce=${server.nonce}`;

      const writeOutput = (text: string) =>
        new Promise<void>((resolve) => {
          (output as NodeJS.WritableStream).write(text, () => resolve());
        });

      await writeOutput(`\nPlease fill in credentials in your browser:\n${formURL}\n`);

      try {
        await openURLFn(formURL);
      } catch {
        // Browser failed to open; URL is already printed above
      }

      try {
        const result = await server.waitForForm(schema as Record<string, any>, {
          title: "AFS Credential Collection",
        });
        return result;
      } finally {
        server.close();
      }
    },

    async createCallbackServer(): Promise<CallbackServer> {
      const server = await createAuthServer();
      return {
        callbackURL: server.callbackURL,
        waitForCallback: server.waitForCallback.bind(server),
        close: server.close.bind(server),
      };
    },

    async requestOpenURL(
      url: string,
      message: string,
    ): Promise<"accepted" | "declined" | "cancelled"> {
      const writeOutput = (text: string) => {
        return new Promise<void>((resolve) => {
          (output as NodeJS.WritableStream).write(text, () => resolve());
        });
      };

      await writeOutput(`\n${message}\n`);

      await writeOutput(`${url}\n`);

      try {
        await openURLFn(url);
      } catch {
        // Browser failed to open; URL is already printed above
      }

      return "accepted";
    },
  };
}

/**
 * Open a URL in the default browser using platform-specific commands.
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
