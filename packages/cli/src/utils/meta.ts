/**
 * Check if a path is a meta path (ends with /.meta or contains /.meta/)
 */
export function isMetaPath(path: string): boolean {
  return path.endsWith("/.meta") || path.includes("/.meta/");
}

/**
 * Check if a path is an actions path (ends with /.actions or contains /.actions/)
 */
export function isActionsPath(path: string): boolean {
  return path.endsWith("/.actions") || path.includes("/.actions/");
}

/**
 * Extract the node path from a meta path
 * Examples:
 *   "/.meta" -> "/"
 *   "/dir/.meta" -> "/dir"
 *   "/dir/file.txt/.meta" -> "/dir/file.txt"
 *   "/dir/.meta/icon.png" -> "/dir"
 */
export function getNodePath(metaPath: string): string {
  const result = metaPath.replace(/\/.meta(\/.*)?$/, "");
  return result || "/";
}

/**
 * Infer the type of a string value
 * Rules:
 *   "" -> "" (empty string)
 *   "true" -> true (boolean)
 *   "false" -> false (boolean)
 *   "42" or "-3.14" -> number (if valid number format)
 *   everything else -> string
 */
export function inferType(value: string): unknown {
  // Empty string stays as empty string
  if (value === "") return "";

  // Boolean (case-sensitive)
  if (value === "true") return true;
  if (value === "false") return false;

  // Number: integer or decimal, optionally negative
  // Must not have leading zeros (except for "0" itself)
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  // Everything else is a string
  return value;
}

/**
 * Parse --set key=value options into an object
 * @param sets Array of "key=value" strings
 * @returns Object with inferred types
 * @throws Error if format is invalid
 */
export function parseSetOptions(sets: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const set of sets) {
    const eqIndex = set.indexOf("=");
    if (eqIndex === -1) {
      throw new Error(`Invalid --set format: ${set}. Expected key=value`);
    }

    const key = set.slice(0, eqIndex);
    const value = set.slice(eqIndex + 1);
    result[key] = inferType(value);
  }

  return result;
}
