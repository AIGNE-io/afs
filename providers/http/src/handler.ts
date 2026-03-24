import { createHash, timingSafeEqual } from "node:crypto";
import type {
  AFSDeleteOptions,
  AFSExecOptions,
  AFSExplainOptions,
  AFSListOptions,
  AFSModule,
  AFSReadOptions,
  AFSRenameOptions,
  AFSSearchOptions,
  AFSStatOptions,
  AFSWriteEntryPayload,
  AFSWriteOptions,
} from "@aigne/afs";
import {
  AFSHttpError,
  AFSInvalidRequestError,
  AFSPayloadTooLargeError,
  mapErrorToCode,
} from "./errors.js";
import {
  AFSErrorCode,
  type AFSRpcMethod,
  type AFSRpcRequest,
  type AFSRpcResponse,
  BLOCKED_METHODS,
  createErrorResponse,
  createSuccessResponse,
  isValidRpcMethod,
} from "./protocol.js";

/**
 * Token validator function type
 */
export type TokenValidator = (token: string) => boolean;

/**
 * Options for creating an AFS HTTP handler
 */
export interface AFSHttpHandlerOptions {
  /** The AFS module to expose */
  module: AFSModule;
  /** Maximum request body size in bytes (default: 10MB) */
  maxBodySize?: number;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /**
   * Token validation configuration (optional)
   * - Not configured: No authorization required (backward compatible)
   * - String: Static token, requests must carry matching Bearer token
   * - Function: Custom validation logic, returns true if valid
   */
  token?: string | TokenValidator;
}

/**
 * Default handler options
 */
const DEFAULT_OPTIONS = {
  maxBodySize: 10 * 1024 * 1024, // 10MB
  timeout: 30000, // 30 seconds
};

/**
 * Create an AFS HTTP handler function
 *
 * This function creates a pure handler that accepts a Web Standard Request
 * and returns a Web Standard Response. It can be used with any HTTP framework
 * that supports these standards (Hono, Bun, Deno, etc.) or adapted for
 * frameworks like Express and Koa.
 *
 * @param options - Handler options
 * @returns A handler function that processes AFS RPC requests
 *
 * @example
 * ```typescript
 * // With Hono
 * const handler = createAFSHttpHandler({ module: provider });
 * app.post("/afs/rpc", (c) => handler(c.req.raw));
 *
 * // With Bun
 * Bun.serve({
 *   fetch(req) {
 *     if (url.pathname === "/afs/rpc") return handler(req);
 *   }
 * });
 * ```
 */
export function createAFSHttpHandler(
  options: AFSHttpHandlerOptions,
): (request: Request) => Promise<Response> {
  const { module, maxBodySize = DEFAULT_OPTIONS.maxBodySize, token: tokenConfig } = options;

  return async (request: Request): Promise<Response> => {
    try {
      // Validate HTTP method
      if (request.method !== "POST") {
        return createJsonResponse(
          createErrorResponse(AFSErrorCode.RUNTIME_ERROR, `Method not allowed: ${request.method}`),
          405,
        );
      }

      // Validate token if configured
      if (tokenConfig) {
        const authResult = validateToken(request, tokenConfig);
        if (!authResult.valid) {
          return createJsonResponse(
            createErrorResponse(AFSErrorCode.UNAUTHORIZED, "Unauthorized"),
            401,
          );
        }
      }

      // Check Content-Type
      const contentType = request.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        return createJsonResponse(
          createErrorResponse(AFSErrorCode.RUNTIME_ERROR, "Content-Type must be application/json"),
          400,
        );
      }

      // Check Content-Length if available
      const contentLength = request.headers.get("content-length");
      if (contentLength && Number.parseInt(contentLength, 10) > maxBodySize) {
        const error = new AFSPayloadTooLargeError(maxBodySize, Number.parseInt(contentLength, 10));
        return createJsonResponse(
          createErrorResponse(error.code, error.message, error.details),
          error.httpStatus,
        );
      }

      // Parse request body
      let body: AFSRpcRequest;
      try {
        const text = await request.text();
        if (text.length > maxBodySize) {
          const error = new AFSPayloadTooLargeError(maxBodySize, text.length);
          return createJsonResponse(
            createErrorResponse(error.code, error.message, error.details),
            error.httpStatus,
          );
        }
        body = JSON.parse(text);
      } catch {
        return createJsonResponse(
          createErrorResponse(AFSErrorCode.RUNTIME_ERROR, "Invalid JSON body"),
          400,
        );
      }

      // Validate request structure
      if (!body || typeof body !== "object") {
        return createJsonResponse(
          createErrorResponse(AFSErrorCode.RUNTIME_ERROR, "Request body must be an object"),
          400,
        );
      }

      const { method, params, args } = body as {
        method?: string;
        params?: Record<string, unknown>;
        args?: unknown[];
      };

      // Validate method
      if (!method || typeof method !== "string") {
        return createJsonResponse(
          createErrorResponse(AFSErrorCode.RUNTIME_ERROR, "Missing or invalid method"),
          400,
        );
      }

      // Block internal/dangerous methods
      if (BLOCKED_METHODS.has(method)) {
        return createJsonResponse(
          createErrorResponse(AFSErrorCode.RUNTIME_ERROR, `Method not supported: ${method}`),
          400,
        );
      }

      // Determine dispatch mode: args array (new) or params object (legacy)
      if (args !== undefined) {
        // New transparent proxy mode: { method, args: [...] }
        if (!Array.isArray(args)) {
          return createJsonResponse(
            createErrorResponse(AFSErrorCode.RUNTIME_ERROR, "args must be an array"),
            400,
          );
        }

        // Validate method exists on module
        if (!isValidRpcMethod(method)) {
          return createJsonResponse(
            createErrorResponse(AFSErrorCode.RUNTIME_ERROR, `Method not supported: ${method}`),
            400,
          );
        }

        const result = await executeRpcMethodDynamic(module, method, args);
        return createJsonResponse(createSuccessResponse(result), 200);
      }

      // Legacy params mode: { method, params: { path, options, ... } }
      if (!isValidRpcMethod(method)) {
        return createJsonResponse(
          createErrorResponse(AFSErrorCode.RUNTIME_ERROR, `Unknown method: ${method}`),
          400,
        );
      }

      // Validate params
      if (!params || typeof params !== "object") {
        return createJsonResponse(
          createErrorResponse(AFSErrorCode.RUNTIME_ERROR, "Missing or invalid params"),
          400,
        );
      }

      // Execute the RPC method (legacy params dispatch)
      const result = await executeRpcMethod(module, method, params);
      return createJsonResponse(createSuccessResponse(result), 200);
    } catch (error) {
      // Handle known AFS errors
      if (error instanceof AFSHttpError) {
        return createJsonResponse(
          createErrorResponse(error.code, error.message, error.details),
          error.httpStatus,
        );
      }

      // Handle unknown errors
      const message = error instanceof Error ? error.message : String(error);
      const code = error instanceof Error ? mapErrorToCode(error) : AFSErrorCode.RUNTIME_ERROR;
      return createJsonResponse(createErrorResponse(code, message), 200);
    }
  };
}

/**
 * Execute an RPC method dynamically using args array (transparent proxy).
 * Calls module[method](...args) directly.
 */
async function executeRpcMethodDynamic(
  module: AFSModule,
  method: AFSRpcMethod,
  args: unknown[],
): Promise<unknown> {
  const fn = module[method];
  if (typeof fn !== "function") {
    throw new AFSInvalidRequestError(`Module does not support ${method} operation`);
  }
  return await (fn as (...a: unknown[]) => Promise<unknown>).call(module, ...args);
}

/**
 * Execute an RPC method on the module (legacy params format)
 */
async function executeRpcMethod(
  module: AFSModule,
  method: AFSRpcMethod,
  params: Record<string, unknown>,
): Promise<unknown> {
  switch (method) {
    case "list": {
      if (!module.list) {
        throw new AFSInvalidRequestError("Module does not support list operation");
      }
      const { path, options } = params as { path: string; options?: AFSListOptions };
      return await module.list(path, options);
    }

    case "read": {
      if (!module.read) {
        throw new AFSInvalidRequestError("Module does not support read operation");
      }
      const { path, options } = params as { path: string; options?: AFSReadOptions };
      return await module.read(path, options);
    }

    case "write": {
      if (!module.write) {
        throw new AFSInvalidRequestError("Module does not support write operation");
      }
      const { path, content, options } = params as {
        path: string;
        content: AFSWriteEntryPayload;
        options?: AFSWriteOptions;
      };
      return await module.write(path, content, options);
    }

    case "delete": {
      if (!module.delete) {
        throw new AFSInvalidRequestError("Module does not support delete operation");
      }
      const { path, options } = params as { path: string; options?: AFSDeleteOptions };
      return await module.delete(path, options);
    }

    case "rename": {
      if (!module.rename) {
        throw new AFSInvalidRequestError("Module does not support rename operation");
      }
      const { oldPath, newPath, options } = params as {
        oldPath: string;
        newPath: string;
        options?: AFSRenameOptions;
      };
      return await module.rename(oldPath, newPath, options);
    }

    case "search": {
      if (!module.search) {
        throw new AFSInvalidRequestError("Module does not support search operation");
      }
      const { path, query, options } = params as {
        path: string;
        query: string;
        options?: AFSSearchOptions;
      };
      return await module.search(path, query, options);
    }

    case "exec": {
      if (!module.exec) {
        throw new AFSInvalidRequestError("Module does not support exec operation");
      }
      const { path, args, options } = params as {
        path: string;
        args: Record<string, unknown>;
        options?: AFSExecOptions;
      };
      return await module.exec(path, args, options ?? {});
    }

    case "stat": {
      if (!module.stat) {
        throw new AFSInvalidRequestError("Module does not support stat operation");
      }
      const { path, options } = params as { path: string; options?: AFSStatOptions };
      return await module.stat(path, options);
    }

    case "explain": {
      if (!module.explain) {
        throw new AFSInvalidRequestError("Module does not support explain operation");
      }
      const { path, options } = params as { path: string; options?: AFSExplainOptions };
      return await module.explain(path, options);
    }

    default: {
      // For unknown methods, reject
      throw new AFSInvalidRequestError(`Unknown method: ${method}`);
    }
  }
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return null;
  }

  // Case-insensitive check for "Bearer " prefix
  const lowerHeader = authHeader.toLowerCase();
  if (!lowerHeader.startsWith("bearer ")) {
    return null;
  }

  // Extract and trim the token
  return authHeader.slice(7).trim();
}

/**
 * Constant-time string comparison to prevent timing side-channel attacks.
 * When strings have different lengths, hashes both to avoid leaking length info.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) {
    // Hash both to avoid leaking length information via timing
    const hashA = createHash("sha256").update(bufA).digest();
    const hashB = createHash("sha256").update(bufB).digest();
    return timingSafeEqual(hashA, hashB);
  }

  return timingSafeEqual(bufA, bufB);
}

/**
 * Validate token against configuration
 */
function validateToken(request: Request, tokenConfig: string | TokenValidator): { valid: boolean } {
  const token = extractBearerToken(request);

  // No token provided
  if (!token) {
    return { valid: false };
  }

  // Constant-time static token comparison (prevents timing side-channel attacks)
  if (typeof tokenConfig === "string") {
    return { valid: constantTimeEqual(token, tokenConfig) };
  }

  // Custom validator function
  try {
    return { valid: tokenConfig(token) };
  } catch {
    // Validator threw an exception, treat as invalid
    return { valid: false };
  }
}

/**
 * Create a JSON Response with proper headers
 */
function createJsonResponse(body: AFSRpcResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
