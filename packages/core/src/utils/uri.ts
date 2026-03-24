/**
 * Generic AFS URI parser.
 *
 * Parses any URI into { scheme, body, query } without scheme-specific logic.
 * Body interpretation is delegated to provider manifests via URI templates.
 */

/**
 * Parsed URI result — generic, scheme-agnostic.
 */
export interface ParsedURI {
  /** URI scheme (lowercased), e.g. "fs", "s3", "mcp+stdio" */
  scheme: string;
  /** URI body — everything between "://" and "?" (opaque to core) */
  body: string;
  /** Query parameters (multi-valued keys become arrays) */
  query: Record<string, string | string[]>;
  /** Host — only for SSH-style git URLs (git@host:path) */
  host?: string;
}

/**
 * Parse an AFS URI into generic components.
 *
 * Accepts any scheme — no hardcoded scheme validation.
 * Body is returned as-is (decoded for local paths, raw for MCP/HTTP).
 *
 * Special handling:
 * - SSH-style git URLs: git@host:path → { scheme: "git", body: "path", host: "host" }
 * - HTTP/HTTPS: Uses URL API for proper host/port parsing, body = host + path
 */
export function parseURI(uri: string): ParsedURI {
  if (!uri || uri.trim() === "") {
    throw new Error("URI cannot be empty");
  }

  // Handle SSH-style git URLs: git@host:path
  const sshGitMatch = uri.match(/^git@([^:]+):(.+)$/);
  if (sshGitMatch?.[1] && sshGitMatch[2]) {
    return {
      scheme: "git",
      host: sshGitMatch[1],
      body: sshGitMatch[2],
      query: {},
    };
  }

  // Extract scheme (supports compound schemes like mcp+stdio)
  const schemeMatch = uri.match(/^([a-z0-9][a-z0-9+.-]*):\/\//i);
  if (!schemeMatch?.[1]) {
    throw new Error(`Invalid URI format: cannot parse scheme from URI`);
  }

  const scheme = schemeMatch[1].toLowerCase();

  // Everything after "scheme://"
  const withoutScheme = uri.slice(scheme.length + 3);

  // Split body and query
  const queryIndex = withoutScheme.indexOf("?");
  let body: string;
  let queryString: string | undefined;

  if (queryIndex >= 0) {
    body = withoutScheme.slice(0, queryIndex);
    queryString = withoutScheme.slice(queryIndex + 1);
  } else {
    body = withoutScheme;
  }

  // Parse query params (multi-valued keys become arrays)
  const query: Record<string, string | string[]> = {};
  if (queryString) {
    const searchParams = new URLSearchParams(queryString);
    for (const key of new Set(searchParams.keys())) {
      const values = searchParams.getAll(key);
      query[key] = values.length === 1 ? values[0]! : values;
    }
  }

  return {
    scheme,
    body,
    query,
  };
}
