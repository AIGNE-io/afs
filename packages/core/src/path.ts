/**
 * AFS Path Validation and Normalization
 *
 * All AFS paths must follow Unix filesystem semantics:
 * - Must be absolute paths (start with /)
 * - Use / as path separator (not Windows \)
 * - No NUL characters in path components
 * - Consistent semantics regardless of underlying platform
 */

/**
 * Error thrown when path validation fails
 */
export class AFSPathError extends Error {
  constructor(
    message: string,
    public readonly path: string,
  ) {
    super(message);
    this.name = "AFSPathError";
  }
}

/**
 * Characters that are not allowed in AFS paths
 */
const FORBIDDEN_CHARS = [
  "\x00", // NUL
  "\x01", // SOH
  "\x02", // STX
  "\x03", // ETX
  "\x04", // EOT
  "\x05", // ENQ
  "\x06", // ACK
  "\x07", // BEL
  "\x08", // BS
  "\x09", // TAB
  "\x0a", // LF
  "\x0b", // VT
  "\x0c", // FF
  "\x0d", // CR
  "\x0e", // SO
  "\x0f", // SI
  "\x10", // DLE
  "\x11", // DC1
  "\x12", // DC2
  "\x13", // DC3
  "\x14", // DC4
  "\x15", // NAK
  "\x16", // SYN
  "\x17", // ETB
  "\x18", // CAN
  "\x19", // EM
  "\x1a", // SUB
  "\x1b", // ESC
  "\x1c", // FS
  "\x1d", // GS
  "\x1e", // RS
  "\x1f", // US
];

/**
 * Check if a string contains any forbidden control characters
 */
function containsForbiddenChars(str: string): boolean {
  for (const char of FORBIDDEN_CHARS) {
    if (str.includes(char)) {
      return true;
    }
  }
  return false;
}

/**
 * Normalize a path by:
 * - Collapsing multiple consecutive slashes
 * - Resolving . (current directory)
 * - Resolving .. (parent directory) while preventing escape above root
 * - Removing trailing slashes (except for root /)
 * - Rejecting whitespace-only path segments
 *
 * @throws AFSPathError if a path segment is whitespace-only
 */
export function normalizePath(path: string): string {
  // Split into segments, filtering out empty segments (from multiple slashes)
  const segments = path.split("/").filter((s) => s !== "");

  const result: string[] = [];

  for (const segment of segments) {
    // Check for whitespace-only segments
    if (segment.trim() === "") {
      throw new AFSPathError("Path segment cannot be whitespace-only", path);
    }

    if (segment === ".") {
      // Current directory - skip
      continue;
    }
    if (segment === "..") {
      // Parent directory - pop if possible, but never go above root
      if (result.length > 0) {
        result.pop();
      }
      // If result is empty, we're at root - don't go above
      continue;
    }
    result.push(segment);
  }

  return `/${result.join("/")}`;
}

/**
 * Validate an AFS path
 *
 * @param path - The path to validate
 * @throws AFSPathError if the path is invalid
 * @returns The normalized path
 */
export function validatePath(path: string): string {
  // Check for empty or whitespace-only path
  if (!path || path.trim() === "") {
    throw new AFSPathError("Path cannot be empty or whitespace-only", path);
  }

  // Check for forbidden control characters (before any decoding)
  if (containsForbiddenChars(path)) {
    throw new AFSPathError("Path contains forbidden control characters", path);
  }

  // Must start with / (absolute path)
  if (!path.startsWith("/")) {
    throw new AFSPathError("Path must be absolute (start with /)", path);
  }

  // URL-decode before further validation (defense against encoded traversal)
  // This prevents %2e%2e/%2e%2e/etc/passwd from bypassing .. checks
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // If decoding fails (e.g., malformed sequences), use raw path
  }

  // After decoding, re-check for control characters that were hidden by encoding
  if (decoded !== path && containsForbiddenChars(decoded)) {
    throw new AFSPathError("Path contains encoded control characters", path);
  }

  // Reject paths that still contain % sequences after decoding (double-encoding attack)
  // e.g., %252e%252e decodes to %2e%2e which would decode again to ../..
  if (decoded.includes("%")) {
    // Try a second decode to detect double-encoding
    try {
      const doubleDecoded = decodeURIComponent(decoded);
      if (doubleDecoded !== decoded) {
        throw new AFSPathError("Path contains double-encoded sequences", path);
      }
    } catch {
      // Second decode failed — the remaining % sequences are literal or malformed, which is fine
    }
  }

  // Check for tilde expansion attempts (must check before normalization)
  // Tilde at start of path (after any leading /) is an attack
  const trimmedPath = decoded.replace(/^\/+/, "");
  if (trimmedPath.startsWith("~")) {
    throw new AFSPathError("Path cannot use tilde expansion", path);
  }

  // Normalize the decoded path (resolves .., collapses //)
  const normalized = normalizePath(decoded);

  return normalized;
}

/**
 * Validate a module name
 *
 * Module names must:
 * - Not be empty or whitespace-only
 * - Not contain / or \
 * - Not contain control characters
 * - Not be "." or ".."
 *
 * @param name - The module name to validate
 * @throws Error if the name is invalid
 */
export function validateModuleName(name: string): void {
  // Check for empty or whitespace-only name
  if (!name || name.trim() === "") {
    throw new Error("Module name cannot be empty or whitespace-only");
  }

  // Check for forbidden control characters
  if (containsForbiddenChars(name)) {
    throw new Error(
      `Invalid module name: ${name}. Module name must not contain control characters`,
    );
  }

  // Check for path separators
  if (name.includes("/")) {
    throw new Error(`Invalid module name: ${name}. Module name must not contain '/'`);
  }

  if (name.includes("\\")) {
    throw new Error(`Invalid module name: ${name}. Module name must not contain '\\'`);
  }

  // Check for . and ..
  if (name === ".") {
    throw new Error("Invalid module name: '.'. Module name cannot be '.'");
  }

  if (name === "..") {
    throw new Error("Invalid module name: '..'. Module name cannot be '..'");
  }
}

// =============================================================================
// CANONICAL PATH PARSING
// =============================================================================

/**
 * Canonical path prefix for AFS
 */
const CANONICAL_PREFIX = "$afs";

/**
 * Characters forbidden in namespace names (security-sensitive)
 */
const NAMESPACE_FORBIDDEN_CHARS = [
  "/", // Path separator
  "\\", // Windows path separator
  ":", // Namespace separator (only one allowed)
  ";", // Shell metachar
  "|", // Shell pipe
  "&", // Shell background
  "`", // Shell command substitution
  "$", // Shell variable (except in $afs prefix)
  "(", // Shell subshell
  ")", // Shell subshell
  ">", // Shell redirect
  "<", // Shell redirect
  "\n", // Newline
  "\r", // Carriage return
  "\t", // Tab
  "\x00", // NUL
  ...FORBIDDEN_CHARS, // All control chars
];

/**
 * Parsed canonical AFS path
 */
export interface ParsedCanonicalPath {
  /** Namespace name, or null for default namespace */
  namespace: string | null;
  /** Path within the namespace (always starts with /) */
  path: string;
}

/**
 * Check if a string contains any namespace-forbidden characters
 */
function containsNamespaceForbiddenChars(str: string): boolean {
  for (const char of NAMESPACE_FORBIDDEN_CHARS) {
    if (str.includes(char)) {
      return true;
    }
  }
  return false;
}

/**
 * Validate a namespace name
 *
 * @throws AFSPathError if namespace is invalid
 */
function validateNamespace(namespace: string, fullPath: string): void {
  // Check for empty or whitespace-only
  if (!namespace || namespace.trim() === "") {
    throw new AFSPathError("Namespace cannot be empty or whitespace-only", fullPath);
  }

  // Check for forbidden characters
  if (containsNamespaceForbiddenChars(namespace)) {
    throw new AFSPathError(`Namespace contains forbidden characters: ${namespace}`, fullPath);
  }

  // Check for path traversal attempts
  if (namespace === "." || namespace === "..") {
    throw new AFSPathError("Namespace cannot be '.' or '..'", fullPath);
  }

  if (namespace.startsWith("..") || namespace.includes("/..") || namespace.includes("\\..")) {
    throw new AFSPathError("Namespace cannot contain path traversal", fullPath);
  }
}

/**
 * Check if a string is a canonical AFS path
 *
 * Canonical paths have the format:
 * - $afs/path (default namespace)
 * - $afs:namespace/path (named namespace)
 *
 * @param input - String to check
 * @returns true if input is a canonical AFS path
 */
export function isCanonicalPath(input: string): boolean {
  if (!input || typeof input !== "string") {
    return false;
  }

  // Must start with $afs
  if (!input.startsWith(CANONICAL_PREFIX)) {
    return false;
  }

  const afterPrefix = input.slice(CANONICAL_PREFIX.length);

  // After $afs, must have / or :
  if (afterPrefix.length === 0) {
    return false;
  }

  const firstChar = afterPrefix[0];
  if (firstChar !== "/" && firstChar !== ":") {
    return false;
  }

  // If starts with :, must have namespace then /
  if (firstChar === ":") {
    const slashIndex = afterPrefix.indexOf("/", 1);
    if (slashIndex === -1) {
      return false; // No / after namespace
    }
    const namespace = afterPrefix.slice(1, slashIndex);
    if (!namespace || namespace.trim() === "") {
      return false; // Empty namespace
    }
  }

  return true;
}

/**
 * Parse a canonical AFS path
 *
 * Canonical paths have the format:
 * - $afs/path (default namespace)
 * - $afs:namespace/path (named namespace)
 *
 * @param canonical - Canonical path string
 * @returns Parsed path with namespace and path
 * @throws AFSPathError if path format is invalid
 */
export function parseCanonicalPath(canonical: string): ParsedCanonicalPath {
  // Check for empty or whitespace-only
  if (!canonical || canonical.trim() === "") {
    throw new AFSPathError("Canonical path cannot be empty", canonical);
  }

  // Check for control characters in entire input
  if (containsForbiddenChars(canonical)) {
    throw new AFSPathError("Canonical path contains forbidden control characters", canonical);
  }

  // Must start exactly with $afs (case-sensitive)
  if (!canonical.startsWith(CANONICAL_PREFIX)) {
    throw new AFSPathError(
      `Canonical path must start with '${CANONICAL_PREFIX}', got: ${canonical}`,
      canonical,
    );
  }

  const afterPrefix = canonical.slice(CANONICAL_PREFIX.length);

  // After $afs, must have / or :
  if (afterPrefix.length === 0) {
    throw new AFSPathError("Canonical path must have '/' or ':' after $afs", canonical);
  }

  const firstChar = afterPrefix[0];

  // Default namespace: $afs/path
  if (firstChar === "/") {
    const pathPart = afterPrefix; // Includes leading /
    const normalizedPath = normalizePath(pathPart);
    return {
      namespace: null,
      path: normalizedPath,
    };
  }

  // Named namespace: $afs:namespace/path
  if (firstChar === ":") {
    const rest = afterPrefix.slice(1); // Skip the :

    // Find the / that separates namespace from path
    const slashIndex = rest.indexOf("/");
    if (slashIndex === -1) {
      throw new AFSPathError("Named namespace path must have '/' after namespace", canonical);
    }

    const namespace = rest.slice(0, slashIndex);
    const pathPart = rest.slice(slashIndex); // Includes leading /

    // Validate namespace
    validateNamespace(namespace, canonical);

    // Check for multiple colons in namespace (already forbidden by validateNamespace,
    // but explicit check for clarity)
    if (namespace.includes(":")) {
      throw new AFSPathError("Namespace cannot contain ':'", canonical);
    }

    // Validate and normalize path
    const normalizedPath = normalizePath(pathPart);

    return {
      namespace,
      path: normalizedPath,
    };
  }

  // Invalid character after $afs
  throw new AFSPathError(
    `Canonical path must have '/' or ':' after $afs, got: '${firstChar}'`,
    canonical,
  );
}

/**
 * Create a canonical AFS path from components
 *
 * @param namespace - Namespace name, or null for default namespace
 * @param path - Path within namespace (must start with /)
 * @returns Canonical path string
 * @throws AFSPathError if namespace or path is invalid
 */
export function toCanonicalPath(namespace: string | null, path: string): string {
  // Validate path
  if (!path || path.trim() === "") {
    throw new AFSPathError("Path cannot be empty", path);
  }

  if (!path.startsWith("/")) {
    throw new AFSPathError("Path must start with '/'", path);
  }

  if (containsForbiddenChars(path)) {
    throw new AFSPathError("Path contains forbidden control characters", path);
  }

  // Normalize path
  const normalizedPath = normalizePath(path);

  // Default namespace
  if (namespace === null || namespace === undefined) {
    return `${CANONICAL_PREFIX}${normalizedPath}`;
  }

  // Validate namespace
  validateNamespace(namespace, `${CANONICAL_PREFIX}:${namespace}${path}`);

  // Named namespace
  return `${CANONICAL_PREFIX}:${namespace}${normalizedPath}`;
}
