/**
 * Shared MCP tool helpers.
 */

/** Default timeout for MCP tool calls (30 seconds) */
export const TOOL_TIMEOUT_MS = 30_000;

/** Extended timeout for exec operations (5 minutes) — covers agent-run and other long-running actions */
export const EXEC_TIMEOUT_MS = 300_000;

/**
 * Wrap an async operation with a timeout.
 * Returns an error result instead of blocking the MCP connection indefinitely.
 */
export function withTimeout<T>(fn: () => Promise<T>, timeoutMs = TOOL_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    fn().then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Create a safe error result for MCP tools.
 * Strips stack traces and internal details from error messages.
 */
export function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const safeMessage = message.split("\n")[0] || "Operation failed";
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: safeMessage }],
  };
}

/**
 * Create a text result for MCP tools.
 */
export function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}
