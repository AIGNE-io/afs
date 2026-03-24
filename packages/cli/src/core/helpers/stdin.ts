/**
 * stdin Helpers - Core Implementation
 *
 * Functions for reading from stdin in a non-blocking way.
 */

/**
 * Read content from stdin (non-blocking if TTY or no data available)
 *
 * @returns The stdin content, or null if no data available
 */
export async function readStdin(): Promise<string | null> {
  // Only read from stdin if it's not a TTY (i.e., there's pipe input)
  if (process.stdin.isTTY) {
    return null;
  }

  // For pipe input, collect all data with a generous timeout.
  // The builder phase (AFS loading, schema fetch) may take seconds,
  // so by the time we're called the pipe data is already buffered.
  const chunks: Buffer[] = [];

  return new Promise<string | null>((resolve) => {
    // Timeout: if no data arrives within 500ms, assume no pipe input
    const timeout = setTimeout(() => {
      cleanup();
      resolve(chunks.length > 0 ? decodeChunks(chunks) : null);
    }, 500);

    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
    };

    const onEnd = () => {
      cleanup();
      resolve(decodeChunks(chunks));
    };

    const onError = () => {
      cleanup();
      resolve(chunks.length > 0 ? decodeChunks(chunks) : null);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      process.stdin.removeListener("data", onData);
      process.stdin.removeListener("end", onEnd);
      process.stdin.removeListener("error", onError);
      process.stdin.pause();
    };

    process.stdin.on("data", onData);
    process.stdin.on("end", onEnd);
    process.stdin.on("error", onError);
    process.stdin.resume();
  });
}

function decodeChunks(chunks: Buffer[]): string | null {
  if (chunks.length === 0) return null;
  const content = Buffer.concat(chunks).toString("utf-8").trim();
  return content || null;
}
