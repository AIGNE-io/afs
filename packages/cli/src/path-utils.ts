/**
 * CLI Path Utilities
 *
 * Converts CLI UX layer paths to canonical AFS paths:
 * - /path → $afs/path (default namespace)
 * - @namespace/path → $afs:namespace/path (named namespace)
 * - $afs/path → $afs/path (passthrough)
 * - $afs:namespace/path → $afs:namespace/path (passthrough)
 */

import { isCanonicalPath, parseCanonicalPath, toCanonicalPath } from "@aigne/afs";

/**
 * Characters forbidden in namespace names (security-sensitive)
 */
const NAMESPACE_FORBIDDEN_CHARS = [
  "/", // Path separator (handled specially)
  "\\", // Windows path separator
  ":", // Namespace separator
  ";", // Shell metachar
  "|", // Shell pipe
  "&", // Shell background
  "`", // Shell command substitution
  "$", // Shell variable
  "(", // Shell subshell
  ")", // Shell subshell
  ">", // Shell redirect
  "<", // Shell redirect
  "\n", // Newline
  "\r", // Carriage return
  "\t", // Tab
  "\x00", // NUL
];

/**
 * Validate a namespace name from CLI input
 * @throws Error if namespace is invalid
 */
function validateCliNamespace(namespace: string): void {
  if (!namespace || namespace.trim() === "") {
    throw new Error("Namespace cannot be empty");
  }

  for (const char of NAMESPACE_FORBIDDEN_CHARS) {
    if (namespace.includes(char)) {
      throw new Error(`Namespace contains forbidden character: '${char}'`);
    }
  }
}

/**
 * Parsed CLI path result
 */
export interface ParsedCliPath {
  /** Namespace (null for default namespace) */
  namespace: string | null;
  /** Path within namespace (always starts with /) */
  path: string;
}

/**
 * Parse a CLI path into namespace and path components
 *
 * Supported formats:
 * - /path → { namespace: null, path: "/path" }
 * - @namespace/path → { namespace: "namespace", path: "/path" }
 * - $afs/path → { namespace: null, path: "/path" }
 * - $afs:namespace/path → { namespace: "namespace", path: "/path" }
 *
 * @param input - CLI path input
 * @returns Parsed namespace and path
 * @throws Error if input format is invalid
 */
export function parseCliPath(input: string): ParsedCliPath {
  if (!input || input.trim() === "") {
    throw new Error("Path cannot be empty");
  }

  const trimmed = input.trim();

  // Check for canonical path passthrough
  if (isCanonicalPath(trimmed)) {
    const parsed = parseCanonicalPath(trimmed);
    return {
      namespace: parsed.namespace,
      path: parsed.path,
    };
  }

  // Check for @ namespace syntax
  if (trimmed.startsWith("@")) {
    const rest = trimmed.slice(1); // Remove @

    // Find the / that separates namespace from path
    const slashIndex = rest.indexOf("/");
    if (slashIndex === -1) {
      throw new Error("Invalid path format: @namespace requires /path (e.g., @staging/api)");
    }

    const namespace = rest.slice(0, slashIndex);
    const path = rest.slice(slashIndex); // Includes leading /

    if (!namespace) {
      throw new Error("Namespace cannot be empty after @");
    }

    // Validate namespace
    validateCliNamespace(namespace);

    return {
      namespace,
      path: path || "/",
    };
  }

  // Check for / prefix (default namespace)
  if (trimmed.startsWith("/")) {
    return {
      namespace: null,
      path: trimmed,
    };
  }

  // Invalid format - not a recognized CLI path
  throw new Error(`Invalid path format: '${trimmed}'. Use /path, @namespace/path, or $afs/path`);
}

/**
 * Convert a CLI UX path to canonical AFS path
 *
 * Supported conversions:
 * - /path → $afs/path
 * - @namespace/path → $afs:namespace/path
 * - $afs/path → $afs/path (passthrough)
 * - $afs:namespace/path → $afs:namespace/path (passthrough)
 *
 * @param input - CLI path input
 * @returns Canonical AFS path
 * @throws Error if input format is invalid
 */
export function cliPathToCanonical(input: string): string {
  const { namespace, path } = parseCliPath(input);

  // Use toCanonicalPath to build the canonical form
  return toCanonicalPath(namespace, path);
}
