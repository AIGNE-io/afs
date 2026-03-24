import { AFSErrorCode } from "./protocol.js";

/**
 * Base class for AFS HTTP errors
 */
export class AFSHttpError extends Error {
  constructor(
    message: string,
    public readonly code: AFSErrorCode,
    public readonly httpStatus: number = 200,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AFSHttpError";
  }
}

/**
 * Path not found error
 */
export class AFSNotFoundError extends AFSHttpError {
  constructor(path: string, details?: unknown) {
    super(`Path not found: ${path}`, AFSErrorCode.NOT_FOUND, 200, details);
    this.name = "AFSNotFoundError";
  }
}

/**
 * Permission denied error (including readonly mode)
 */
export class AFSPermissionError extends AFSHttpError {
  constructor(message: string, details?: unknown) {
    super(message, AFSErrorCode.PERMISSION_DENIED, 200, details);
    this.name = "AFSPermissionError";
  }
}

/**
 * Conflict error (concurrent modification)
 */
export class AFSConflictError extends AFSHttpError {
  constructor(message: string, details?: unknown) {
    super(message, AFSErrorCode.CONFLICT, 200, details);
    this.name = "AFSConflictError";
  }
}

/**
 * Runtime error
 */
export class AFSRuntimeError extends AFSHttpError {
  constructor(message: string, details?: unknown) {
    super(message, AFSErrorCode.RUNTIME_ERROR, 200, details);
    this.name = "AFSRuntimeError";
  }
}

/**
 * Invalid request error (bad JSON, invalid method, etc.)
 */
export class AFSInvalidRequestError extends AFSHttpError {
  constructor(message: string, details?: unknown) {
    super(message, AFSErrorCode.RUNTIME_ERROR, 400, details);
    this.name = "AFSInvalidRequestError";
  }
}

/**
 * Payload too large error
 */
export class AFSPayloadTooLargeError extends AFSHttpError {
  constructor(maxSize: number, actualSize?: number) {
    const message = actualSize
      ? `Payload too large: ${actualSize} bytes exceeds limit of ${maxSize} bytes`
      : `Payload too large: exceeds limit of ${maxSize} bytes`;
    super(message, AFSErrorCode.RUNTIME_ERROR, 413, { maxSize, actualSize });
    this.name = "AFSPayloadTooLargeError";
  }
}

/**
 * Unauthorized error (missing or invalid token)
 */
export class AFSUnauthorizedError extends AFSHttpError {
  constructor(message = "Unauthorized", details?: unknown) {
    super(message, AFSErrorCode.UNAUTHORIZED, 401, details);
    this.name = "AFSUnauthorizedError";
  }
}

/**
 * Network error (for client-side use)
 */
export class AFSNetworkError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
    public readonly retryable: boolean = true,
  ) {
    super(message);
    this.name = "AFSNetworkError";
  }
}

/**
 * Map common error messages to appropriate AFS error codes
 */
export function mapErrorToCode(error: Error): AFSErrorCode {
  const message = error.message.toLowerCase();

  if (
    message.includes("not found") ||
    message.includes("enoent") ||
    message.includes("does not exist")
  ) {
    return AFSErrorCode.NOT_FOUND;
  }

  if (
    message.includes("permission") ||
    message.includes("readonly") ||
    message.includes("read-only") ||
    message.includes("access denied") ||
    message.includes("eacces")
  ) {
    return AFSErrorCode.PERMISSION_DENIED;
  }

  if (
    message.includes("conflict") ||
    message.includes("already exists") ||
    message.includes("eexist")
  ) {
    return AFSErrorCode.CONFLICT;
  }

  return AFSErrorCode.RUNTIME_ERROR;
}
