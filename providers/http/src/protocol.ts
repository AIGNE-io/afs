import type {
  AFSDeleteOptions,
  AFSDeleteResult,
  AFSExecOptions,
  AFSExecResult,
  AFSExplainOptions,
  AFSExplainResult,
  AFSListOptions,
  AFSListResult,
  AFSReadOptions,
  AFSReadResult,
  AFSRenameOptions,
  AFSRenameResult,
  AFSSearchOptions,
  AFSSearchResult,
  AFSStatOptions,
  AFSStatResult,
  AFSWriteEntryPayload,
  AFSWriteOptions,
  AFSWriteResult,
} from "@aigne/afs";

/**
 * AFS HTTP RPC method names
 */
export type AFSRpcMethod =
  | "list"
  | "read"
  | "write"
  | "delete"
  | "rename"
  | "search"
  | "exec"
  | "stat"
  | "explain";

/**
 * RPC request body
 */
export interface AFSRpcRequest<M extends AFSRpcMethod = AFSRpcMethod> {
  method: M;
  params: AFSRpcParams[M];
}

/**
 * RPC response body
 */
export interface AFSRpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: AFSRpcError;
}

/**
 * RPC error object
 */
export interface AFSRpcError {
  /** CLI error code (0-6), compatible with AFS CLI */
  code: AFSErrorCode;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: unknown;
}

/**
 * CLI-compatible error codes
 * @see https://github.com/arcblock/afs/blob/main/intent/specs/afs-cli-spec.md
 */
export enum AFSErrorCode {
  /** Operation successful */
  OK = 0,
  /** Path not found */
  NOT_FOUND = 1,
  /** Permission denied (including readonly mode) */
  PERMISSION_DENIED = 2,
  /** Concurrent modification conflict */
  CONFLICT = 3,
  /** Partial success */
  PARTIAL = 4,
  /** Runtime error */
  RUNTIME_ERROR = 5,
  /** Unauthorized access */
  UNAUTHORIZED = 6,
}

/**
 * Parameter types for each RPC method
 */
export interface AFSRpcParams {
  list: {
    path: string;
    options?: AFSListOptions;
  };
  read: {
    path: string;
    options?: AFSReadOptions;
  };
  write: {
    path: string;
    content: AFSWriteEntryPayload;
    options?: AFSWriteOptions;
  };
  delete: {
    path: string;
    options?: AFSDeleteOptions;
  };
  rename: {
    oldPath: string;
    newPath: string;
    options?: AFSRenameOptions;
  };
  search: {
    path: string;
    query: string;
    options?: AFSSearchOptions;
  };
  exec: {
    path: string;
    args: Record<string, unknown>;
    options?: AFSExecOptions;
  };
  stat: {
    path: string;
    options?: AFSStatOptions;
  };
  explain: {
    path: string;
    options?: AFSExplainOptions;
  };
}

/**
 * Result types for each RPC method
 */
export interface AFSRpcResults {
  list: AFSListResult;
  read: AFSReadResult;
  write: AFSWriteResult;
  delete: AFSDeleteResult;
  rename: AFSRenameResult;
  search: AFSSearchResult;
  exec: AFSExecResult;
  stat: AFSStatResult;
  explain: AFSExplainResult;
}

/**
 * Valid RPC methods set for validation
 */
export const VALID_RPC_METHODS: Set<AFSRpcMethod> = new Set([
  "list",
  "read",
  "write",
  "delete",
  "rename",
  "search",
  "exec",
  "stat",
  "explain",
]);

/**
 * Internal/dangerous method names that must never be called via RPC
 */
export const BLOCKED_METHODS: Set<string> = new Set([
  "constructor",
  "toString",
  "valueOf",
  "toLocaleString",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "__proto__",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
]);

/**
 * Check if a string is a valid RPC method
 */
export function isValidRpcMethod(method: string): method is AFSRpcMethod {
  return VALID_RPC_METHODS.has(method as AFSRpcMethod);
}

/**
 * Create a success response
 */
export function createSuccessResponse<T>(data: T): AFSRpcResponse<T> {
  return {
    success: true,
    data,
  };
}

/**
 * Create an error response
 */
export function createErrorResponse(
  code: AFSErrorCode,
  message: string,
  details?: unknown,
): AFSRpcResponse<never> {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };
}
