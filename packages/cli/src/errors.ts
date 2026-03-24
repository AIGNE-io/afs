/**
 * AFS CLI Exit Codes
 *
 * Exit codes are part of the protocol - agents and scripts depend on them.
 */
export const ExitCode = {
  /** Operation successful */
  OK: 0,
  /** Path or resource not found */
  NOT_FOUND: 1,
  /** Permission denied */
  PERMISSION_DENIED: 2,
  /** Conflict (e.g., concurrent modification) */
  CONFLICT: 3,
  /** Partial success (some operations succeeded, some failed) */
  PARTIAL: 4,
  /** Runtime error */
  RUNTIME_ERROR: 5,
} as const;

export type ExitCodeType = (typeof ExitCode)[keyof typeof ExitCode];

/**
 * CLI Error with exit code
 */
export class CLIError extends Error {
  constructor(
    message: string,
    public exitCode: ExitCodeType = ExitCode.RUNTIME_ERROR,
  ) {
    super(message);
    this.name = "CLIError";
  }
}

/**
 * Not found error
 */
export class NotFoundError extends CLIError {
  constructor(message: string) {
    super(message, ExitCode.NOT_FOUND);
    this.name = "NotFoundError";
  }
}

/**
 * Permission denied error
 */
export class PermissionDeniedError extends CLIError {
  constructor(message: string) {
    super(message, ExitCode.PERMISSION_DENIED);
    this.name = "PermissionDeniedError";
  }
}
