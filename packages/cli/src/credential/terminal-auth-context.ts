/**
 * Terminal AuthContext implementation.
 *
 * Collects credentials via terminal readline prompts instead of a browser form.
 * Designed for headless/server environments (SSH, CI, Docker) where no browser
 * is available. Sensitive fields use masked input (stdin raw mode).
 */

import { createInterface } from "node:readline";
import type { AuthContext, CallbackServer, JSONSchema7 } from "@aigne/afs";
import { getSensitiveFields } from "@aigne/afs/utils/schema";
import { createAuthServer } from "./auth-server.js";
import { createCLIAuthContext } from "./cli-auth-context.js";

// ─── Types ────────────────────────────────────────────────────────────────

export interface TerminalAuthContextOptions {
  /** Pre-resolved fields from Step 2 (env/store/config) */
  resolved?: Record<string, unknown>;
  /** Input stream (for testing). Default: process.stdin */
  input?: NodeJS.ReadableStream;
  /** Output stream (for testing). Default: process.stderr */
  output?: NodeJS.WritableStream;
}

// ─── Terminal AuthContext ─────────────────────────────────────────────────

/**
 * Create a terminal AuthContext that collects credentials via readline prompts.
 */
export function createTerminalAuthContext(options?: TerminalAuthContextOptions): AuthContext {
  const resolved = options?.resolved ?? {};
  const input = options?.input ?? process.stdin;
  const output = options?.output ?? process.stderr;

  return {
    get resolved() {
      return { ...resolved };
    },

    async collect(schema: JSONSchema7): Promise<Record<string, unknown> | null> {
      const properties = (schema as any).properties;
      if (!properties || typeof properties !== "object") return {};
      if (Object.keys(properties).length === 0) return {};

      const sensitiveFields = new Set(getSensitiveFields(schema));
      const requiredFields = new Set(((schema as any).required as string[]) ?? []);
      const entries = Object.entries(properties) as [string, any][];
      const result: Record<string, unknown> = {};

      // For non-TTY streams (PassThrough in tests, pipes), pre-read all lines
      // because bun's readline fails when creating per-field interfaces on the
      // same non-TTY stream. For real TTY stdin, use interactive per-field prompts.
      const isTTY = !!(input as any).isTTY;
      const preReadLines = isTTY ? null : await readAllLines(input, entries.length);

      await writeToStream(output, "\n");

      let lineIdx = 0;
      for (const [key, prop] of entries) {
        const isSensitive = sensitiveFields.has(key);
        const isRequired = requiredFields.has(key);
        const description = prop.description || prop.title || key;
        const defaultValue = prop.default;
        const enumValues: string[] | undefined = prop.enum;

        // Build prompt string
        let prompt: string;
        if (prop.type === "boolean") {
          const defaultHint = defaultValue === true ? "Y/n" : "y/N";
          prompt = `  ${description} (${defaultHint}): `;
        } else if (isSensitive) {
          prompt = `  ${description}`;
          if (isRequired) prompt += " *";
          prompt += ": ";
        } else if (prop.type === "array") {
          prompt = `  ${description} (comma-separated)`;
          if (defaultValue !== undefined)
            prompt += ` (${Array.isArray(defaultValue) ? defaultValue.join(", ") : defaultValue})`;
          if (isRequired) prompt += " *";
          prompt += ": ";
        } else {
          prompt = `  ${description}`;
          if (enumValues) prompt += ` [${enumValues.join("/")}]`;
          if (defaultValue !== undefined) prompt += ` (${defaultValue})`;
          if (isRequired) prompt += " *";
          prompt += ": ";
        }

        // Read input: pre-read buffer for non-TTY, interactive prompt for TTY
        let rawValue: string;
        if (preReadLines) {
          await writeToStream(output, prompt);
          rawValue = (preReadLines[lineIdx++] ?? "").trim();
        } else if (isSensitive && isTTY) {
          rawValue = await promptMasked(input, output, prompt);
        } else {
          rawValue = await promptLine(input, output, prompt);
        }

        let value: unknown;

        if (prop.type === "boolean") {
          if (rawValue === "" || rawValue === undefined) {
            value = defaultValue ?? false;
          } else {
            const lower = rawValue.toLowerCase();
            value = lower === "y" || lower === "yes" || lower === "true" || lower === "1";
          }
        } else if (prop.type === "array") {
          if (rawValue === "" || rawValue === undefined) {
            value = defaultValue;
          } else {
            value = rawValue
              .split(",")
              .map((s: string) => s.trim())
              .filter(Boolean);
          }
        } else {
          value = rawValue;
        }

        // Handle empty values
        if (value === "" || value === undefined || value === null) {
          if (defaultValue !== undefined) {
            value = defaultValue;
          } else if (!isRequired) {
            continue;
          } else {
            result[key] = "";
            continue;
          }
        }

        // Type coercion
        if (prop.type === "number" || prop.type === "integer") {
          const num = Number(value);
          if (!Number.isNaN(num)) value = num;
        }

        if (value !== undefined && value !== null) {
          result[key] = value;
        }
      }

      return result;
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
      await writeToStream(output, `\n${message}\n${url}\n`);
      return "accepted";
    },
  };
}

// ─── Input Helpers ────────────────────────────────────────────────────────

/**
 * Read all lines from a stream upfront.
 * Works reliably with PassThrough and piped streams in bun,
 * unlike creating per-field readline interfaces on the same stream.
 */
function readAllLines(input: NodeJS.ReadableStream, expectedCount: number): Promise<string[]> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: input as NodeJS.ReadableStream,
      terminal: false,
    });
    const lines: string[] = [];
    rl.on("line", (line) => {
      lines.push(line);
      if (lines.length >= expectedCount) {
        rl.close();
      }
    });
    rl.once("close", () => resolve(lines));
  });
}

/**
 * Prompt for a line of input via readline.
 */
async function promptLine(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
  prompt: string,
): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: input as NodeJS.ReadableStream,
      output: output as NodeJS.WritableStream,
      terminal: false,
    });
    let answered = false;
    writeToStream(output, prompt);
    rl.once("line", (answer) => {
      answered = true;
      rl.close();
      resolve(answer.trim());
    });
    // Fallback: stream closed without a line (e.g., Ctrl+D / EOF)
    rl.once("close", () => {
      if (!answered) resolve("");
    });
  });
}

/**
 * Prompt for masked input (sensitive fields).
 * Uses stdin raw mode when available (TTY), falls back to normal readline.
 */
async function promptMasked(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
  prompt: string,
): Promise<string> {
  const stdin = input as typeof process.stdin;

  // If not a TTY (e.g., pipe or PassThrough in tests), fall back to normal readline
  if (typeof stdin.setRawMode !== "function") {
    return promptLine(input, output, prompt);
  }

  return new Promise((resolve) => {
    writeToStream(output, prompt);

    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();

    let value = "";

    const onData = (chunk: Buffer) => {
      const chars = chunk.toString("utf-8");
      for (const c of chars) {
        const code = c.charCodeAt(0);

        if (code === 3) {
          // Ctrl+C — cancel
          cleanup();
          resolve("");
          return;
        }
        if (code === 13 || code === 10) {
          // Enter — submit
          cleanup();
          resolve(value);
          return;
        }
        if (code === 127 || code === 8) {
          // Backspace
          if (value.length > 0) {
            value = value.slice(0, -1);
            writeToStream(output, "\b \b");
          }
          continue;
        }
        if (code < 32) continue; // Ignore other control characters

        value += c;
        writeToStream(output, "*");
      }
    };

    const cleanup = () => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(wasRaw ?? false);
      writeToStream(output, "\n");
    };

    stdin.on("data", onData);
  });
}

function writeToStream(stream: NodeJS.WritableStream, text: string): Promise<void> {
  return new Promise((resolve) => {
    stream.write(text, () => resolve());
  });
}

// ─── Environment Detection ───────────────────────────────────────────────

/**
 * Detect if running in a headless/terminal-only environment
 * where browser-based auth is unlikely to work.
 */
export function isHeadlessEnvironment(): boolean {
  // Explicit override
  if (process.env.AFS_HEADLESS === "1") return true;
  if (process.env.AFS_HEADLESS === "0") return false;

  // SSH session
  if (process.env.SSH_TTY || process.env.SSH_CONNECTION) return true;

  // Linux without display server
  if (process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return true;
  }

  // CI environments
  if (process.env.CI === "true" || process.env.CI === "1") return true;

  return false;
}

// ─── AuthContext Selection ────────────────────────────────────────────────

/**
 * Select the appropriate AuthContext based on flags and environment.
 *
 * Priority:
 * 1. --terminal flag → terminal readline
 * 2. Auto-detect headless → terminal readline (if stdin is TTY)
 * 3. Default → browser form
 */
export function selectAuthContext(terminalFlag?: boolean): AuthContext {
  if (terminalFlag) {
    return createTerminalAuthContext();
  }

  if (isHeadlessEnvironment() && process.stdin.isTTY) {
    return createTerminalAuthContext();
  }

  return createCLIAuthContext();
}

// ─── --set Parameter Parsing ─────────────────────────────────────────────

/**
 * Parse --set key=value arguments into a Record.
 * Throws on invalid format.
 */
export function parseSetParams(raw?: string[]): Record<string, string> | undefined {
  if (!raw || raw.length === 0) return undefined;

  const params: Record<string, string> = {};
  for (const entry of raw) {
    const eqIdx = entry.indexOf("=");
    if (eqIdx <= 0) {
      throw new Error(`Invalid --set format: "${entry}". Expected key=value`);
    }
    params[entry.slice(0, eqIdx)] = entry.slice(eqIdx + 1);
  }
  return params;
}
