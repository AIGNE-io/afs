import {
  type AFSAccessMode,
  type AFSDeleteOptions,
  type AFSDeleteResult,
  type AFSExecOptions,
  type AFSExecResult,
  type AFSExplainOptions,
  type AFSExplainResult,
  type AFSListOptions,
  type AFSListResult,
  type AFSModule,
  type AFSReadOptions,
  type AFSReadResult,
  type AFSRenameOptions,
  type AFSRenameResult,
  type AFSSearchOptions,
  type AFSSearchResult,
  type AFSStatOptions,
  type AFSStatResult,
  type AFSWriteEntryPayload,
  type AFSWriteOptions,
  type AFSWriteResult,
  AFSNotFoundError as CoreAFSNotFoundError,
  type ProviderManifest,
  type ProviderTreeSchema,
} from "@aigne/afs";
import { z } from "zod";
import { AFSNetworkError, AFSRuntimeError, AFSUnauthorizedError } from "./errors.js";
import {
  AFSErrorCode,
  type AFSRpcMethod,
  type AFSRpcResponse,
  type AFSRpcResults,
} from "./protocol.js";
import { DEFAULT_RETRY_OPTIONS, fetchWithRetry, type RetryOptions } from "./retry.js";
import { validateUrl } from "./url-validation.js";

/**
 * Options for AFSHttpClient
 */
export interface AFSHttpClientOptions {
  /** Server URL (required) */
  url: string;
  /** Module name for mounting to AFS (required) */
  name: string;
  /** Module description (optional) */
  description?: string;
  /** Access mode (default: "readwrite") */
  accessMode?: AFSAccessMode;
  /** Authorization token (optional) */
  token?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Maximum request body size in bytes (default: 10MB) */
  maxBodySize?: number;
  /** Retry configuration */
  retry?: RetryOptions;
  /**
   * If true, allows connections to private/internal network addresses.
   * Default: false — blocks requests to localhost, private IPs, link-local, etc.
   * Set to true for local development when connecting to a local AFS server.
   */
  allowPrivateNetwork?: boolean;
}

/**
 * Default client options
 */
const DEFAULT_CLIENT_OPTIONS = {
  timeout: 30000,
  maxBodySize: 10 * 1024 * 1024, // 10MB
  accessMode: "readwrite" as AFSAccessMode,
};

/**
 * AFS HTTP Client
 *
 * Implements the AFSModule interface, forwarding all operations to a remote
 * AFS server via HTTP RPC calls.
 *
 * @example
 * ```typescript
 * import { AFS } from "@aigne/afs";
 * import { AFSHttpClient } from "@aigne/afs-http";
 *
 * const afs = new AFS();
 * afs.mount(
 *   new AFSHttpClient({
 *     url: "https://remote-afs.example.com/afs/rpc",
 *     name: "remote",
 *   })
 * );
 *
 * // Use like any local provider
 * const result = await afs.list("/modules/remote/some-path");
 * ```
 */
export class AFSHttpClient implements AFSModule {
  readonly name: string;
  readonly description?: string;
  readonly accessMode: AFSAccessMode;

  private readonly url: string;
  private readonly token?: string;
  private readonly requestTimeout: number;
  private readonly maxBodySize: number;
  private readonly retryOptions: RetryOptions;

  static schema() {
    return z.object({
      url: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      token: z.string().meta({ sensitive: true }).optional(),
      timeout: z.number().optional(),
    });
  }

  static manifest(): ProviderManifest[] {
    return [
      {
        name: "http",
        description:
          "Remote AFS instance — proxy all operations to another AFS server over HTTP.\n- Transparently forwards read, write, search, exec, and all other operations\n- Supports bearer token authentication and configurable retry/timeout",
        uriTemplate: "http://{host+}",
        category: "bridge",
        schema: z.object({
          host: z.string(),
          token: z.string().meta({ sensitive: true }).optional(),
        }),
        tags: ["http", "remote", "integration"],
        capabilityTags: ["read-write", "search", "auth:token", "remote", "http"],
        security: {
          riskLevel: "external",
          resourceAccess: ["internet"],
          notes: ["Proxies all operations to a remote AFS server — security depends on the remote"],
        },
        capabilities: {
          network: { egress: true },
        },
      },
      {
        name: "https",
        description:
          "Remote AFS instance — proxy all operations to another AFS server over HTTPS.\n- Transparently forwards read, write, search, exec, and all other operations\n- Supports bearer token authentication and configurable retry/timeout",
        uriTemplate: "https://{host+}",
        category: "bridge",
        schema: z.object({
          host: z.string(),
          token: z.string().meta({ sensitive: true }).optional(),
        }),
        tags: ["https", "remote", "integration"],
        capabilityTags: ["read-write", "search", "auth:token", "remote", "http"],
        security: {
          riskLevel: "external",
          resourceAccess: ["internet"],
          notes: ["Proxies all operations to a remote AFS server — security depends on the remote"],
        },
        capabilities: {
          network: { egress: true },
        },
      },
    ];
  }

  static treeSchema(): ProviderTreeSchema {
    return {
      operations: ["list", "read", "write", "delete", "search", "exec", "stat", "explain"],
      tree: {
        "/": { kind: "http:root" },
        "/{path+}": { kind: "http:remote" },
      },
      auth: { type: "token" },
      bestFor: ["remote AFS proxy", "distributed mounts", "cross-network access"],
      notFor: ["low-latency local I/O", "large binary streams"],
    };
  }

  constructor(options: AFSHttpClientOptions & { host?: string; uri?: string }) {
    // Normalize registry-passed template vars: host → url
    if ((options as any).host && !options.url) {
      const scheme = (options as any).uri?.startsWith("https") ? "https" : "http";
      options.url = `${scheme}://${(options as any).host}`;
    }
    if (!options.name && (options as any).host) {
      options.name = (options as any).host;
    }

    if (!options.url) {
      throw new Error("AFSHttpClient requires a url option");
    }
    if (!options.name) {
      throw new Error("AFSHttpClient requires a name option");
    }

    // SSRF validation — reject private/internal network addresses.
    // When `uri` is present the mount was created from a config file (admin-authored),
    // so private-network addresses are intentional — skip SSRF checks.
    const trusted = options.allowPrivateNetwork ?? (options as any).uri !== undefined;
    validateUrl(options.url, trusted);

    this.url = options.url.endsWith("/rpc") ? options.url : `${options.url}/rpc`;
    this.name = options.name;
    this.description = options.description;
    this.accessMode = options.accessMode ?? DEFAULT_CLIENT_OPTIONS.accessMode;
    this.token = options.token;
    this.requestTimeout = options.timeout ?? DEFAULT_CLIENT_OPTIONS.timeout;
    this.maxBodySize = options.maxBodySize ?? DEFAULT_CLIENT_OPTIONS.maxBodySize;
    this.retryOptions = {
      ...DEFAULT_RETRY_OPTIONS,
      ...options.retry,
    };
  }

  /**
   * Make an RPC call to the remote server using args array format
   */
  private async rpc<M extends AFSRpcMethod>(method: M, args: unknown[]): Promise<AFSRpcResults[M]> {
    const body = JSON.stringify({ method, args });

    // Check body size before sending
    if (body.length > this.maxBodySize) {
      throw new AFSRuntimeError(
        `Request body too large: ${body.length} bytes exceeds limit of ${this.maxBodySize} bytes`,
      );
    }

    // Build headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    let response: Response;
    try {
      response = await fetchWithRetry(
        this.url,
        {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(this.requestTimeout),
        },
        this.retryOptions,
      );
    } catch (error) {
      throw new AFSNetworkError(
        `Failed to connect to ${this.url}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
      );
    }

    // Parse response
    let result: AFSRpcResponse<AFSRpcResults[M]>;
    try {
      result = await response.json();
    } catch {
      throw new AFSRuntimeError(
        `Invalid response from server: expected JSON, got ${response.headers.get("content-type")}`,
      );
    }

    // Check for RPC-level errors
    if (!result.success) {
      const error = result.error;
      if (error) {
        // Handle unauthorized error specifically
        if (error.code === AFSErrorCode.UNAUTHORIZED) {
          throw new AFSUnauthorizedError(error.message, error.details);
        }
        // Handle not-found error — map to core AFSNotFoundError
        if (error.code === AFSErrorCode.NOT_FOUND) {
          // Extract path from message like "Path not found: /some/path"
          const pathMatch = error.message.match(/Path not found:\s*(.+)/);
          const errorPath = pathMatch?.[1]?.trim() ?? (args[0] as string) ?? "/";
          throw new CoreAFSNotFoundError(errorPath, error.message);
        }
        // Re-throw with the appropriate error type based on code
        const errorMessage = error.message || "Unknown error";
        throw new AFSRuntimeError(errorMessage, {
          code: error.code,
          details: error.details,
        });
      }
      throw new AFSRuntimeError("Request failed without error details");
    }

    // Revive Date fields that were serialized to ISO strings via JSON
    return reviveDates(result.data) as AFSRpcResults[M];
  }

  async list(path: string, options?: AFSListOptions): Promise<AFSListResult> {
    return this.rpc("list", [path, options]);
  }

  async read(path: string, options?: AFSReadOptions): Promise<AFSReadResult> {
    return this.rpc("read", [path, options]);
  }

  async write(
    path: string,
    content: AFSWriteEntryPayload,
    options?: AFSWriteOptions,
  ): Promise<AFSWriteResult> {
    return this.rpc("write", [path, content, options]);
  }

  async delete(path: string, options?: AFSDeleteOptions): Promise<AFSDeleteResult> {
    return this.rpc("delete", [path, options]);
  }

  async rename(
    oldPath: string,
    newPath: string,
    options?: AFSRenameOptions,
  ): Promise<AFSRenameResult> {
    return this.rpc("rename", [oldPath, newPath, options]);
  }

  async search(path: string, query: string, options?: AFSSearchOptions): Promise<AFSSearchResult> {
    return this.rpc("search", [path, query, options]);
  }

  async exec(
    path: string,
    args: Record<string, unknown>,
    options: AFSExecOptions,
  ): Promise<AFSExecResult> {
    return this.rpc("exec", [path, args, options]);
  }

  async stat(path: string, options?: AFSStatOptions): Promise<AFSStatResult> {
    return this.rpc("stat", [path, options]);
  }

  async explain(path: string, options?: AFSExplainOptions): Promise<AFSExplainResult> {
    return this.rpc("explain", [path, options]);
  }
}

/**
 * ISO 8601 date string pattern for reviving serialized Date objects.
 * Matches strings like "2024-01-15T10:30:00.000Z" or "2024-01-15T10:30:00+00:00"
 */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/** Known date field names in AFS entry/result objects */
const DATE_FIELDS = new Set(["createdAt", "updatedAt"]);

/**
 * Recursively walk a JSON-parsed result and convert ISO date strings
 * back to Date objects for known date fields (createdAt, updatedAt).
 *
 * This is necessary because JSON.stringify converts Date → string,
 * so the HTTP transport loses Date type information.
 */
function reviveDates<T>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      obj[i] = reviveDates(obj[i]);
    }
    return obj;
  }

  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (DATE_FIELDS.has(key) && typeof value === "string" && ISO_DATE_RE.test(value)) {
      record[key] = new Date(value);
    } else if (typeof value === "object" && value !== null) {
      reviveDates(value);
    }
  }
  return obj;
}
