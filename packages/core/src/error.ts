/**
 * Base error class for all AFS errors.
 */
export class AFSError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "AFSError";
    this.code = code;
  }
}

/**
 * Error thrown when attempting write operations on a readonly AFS or module.
 */
export class AFSReadonlyError extends AFSError {
  constructor(message: string) {
    super(message, "AFS_READONLY");
    this.name = "AFSReadonlyError";
  }
}

/**
 * Error thrown when a path does not exist.
 */
export class AFSNotFoundError extends AFSError {
  readonly path: string;

  constructor(path: string, message?: string) {
    super(message || `Path not found: ${path}`, "AFS_NOT_FOUND");
    this.name = "AFSNotFoundError";
    this.path = path;
  }
}

/**
 * Error thrown when attempting to create a path that already exists (create mode).
 */
export class AFSAlreadyExistsError extends AFSError {
  readonly path: string;

  constructor(path: string, message?: string) {
    super(message || `Path already exists: ${path}`, "AFS_ALREADY_EXISTS");
    this.name = "AFSAlreadyExistsError";
    this.path = path;
  }
}

/**
 * Error thrown when input validation fails.
 * Used by AFS Core to validate exec inputs against inputSchema.
 */
export class AFSValidationError extends AFSError {
  constructor(message: string) {
    super(message, "AFS_VALIDATION_ERROR");
    this.name = "AFSValidationError";
  }
}

/**
 * Error thrown when an action's severity exceeds the module's action policy.
 */
export class AFSSeverityError extends AFSError {
  readonly actionName: string;
  readonly severity: string;
  readonly policy: string;

  constructor(actionName: string, severity: string, policy: string) {
    super(
      `Action '${actionName}' severity '${severity}' exceeds policy '${policy}'`,
      "AFS_SEVERITY_DENIED",
    );
    this.name = "AFSSeverityError";
    this.actionName = actionName;
    this.severity = severity;
    this.policy = policy;
  }
}

/**
 * Error thrown when a patch operation fails.
 */
export class AFSPatchError extends AFSError {
  constructor(code: "PATCH_TARGET_NOT_FOUND" | "PATCH_TARGET_AMBIGUOUS", message: string) {
    super(message, code);
    this.name = "AFSPatchError";
  }
}

/**
 * Error thrown when an operation is denied by the mount's access mode.
 * E.g., write(replace) on a create-only mount, or delete on an append-only mount.
 */
export class AFSAccessModeError extends AFSError {
  readonly accessMode: string;
  readonly attemptedOp: string;

  constructor(accessMode: string, attemptedOp: string) {
    super(
      `Operation "${attemptedOp}" denied — mount access mode is "${accessMode}"`,
      "AFS_ACCESS_MODE",
    );
    this.name = "AFSAccessModeError";
    this.accessMode = accessMode;
    this.attemptedOp = attemptedOp;
  }
}

/**
 * Error thrown when provider mount check fails.
 */
export class AFSMountError extends AFSError {
  readonly providerName: string;
  readonly step: "stat" | "read" | "list" | "trust";

  constructor(providerName: string, step: AFSMountError["step"], message: string) {
    super(`Mount check failed for ${providerName} at ${step}: ${message}`, "AFS_MOUNT_FAILED");
    this.name = "AFSMountError";
    this.providerName = providerName;
    this.step = step;
  }
}
