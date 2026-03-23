/**
 * Options for environment variable resolution
 */
export interface ResolveEnvOptions {
  /** If true, undefined env vars resolve to empty string instead of throwing */
  allowUndefined?: boolean;
}

/**
 * Resolve environment variable references in a string
 *
 * Syntax: ${VAR_NAME}
 * Escape: \${VAR_NAME} (will not be resolved)
 *
 * @param value - String containing ${VAR} references
 * @param options - Resolution options
 * @returns String with env vars resolved
 * @throws Error if env var is undefined and allowUndefined is false
 */
export function resolveEnvVars(value: string, options: ResolveEnvOptions = {}): string {
  const { allowUndefined = false } = options;

  if (!value) {
    return value;
  }

  // First, handle escaped env vars (replace \${ with a placeholder)
  const ESCAPE_PLACEHOLDER = "\x00ESCAPED_ENV\x00";
  let result = value.replace(/\\\$\{/g, ESCAPE_PLACEHOLDER);

  // Match ${VAR_NAME} pattern
  const envVarPattern = /\$\{([^}]+)\}/g;

  result = result.replace(envVarPattern, (_match, varName: string) => {
    const envValue = process.env[varName];

    if (envValue === undefined) {
      if (allowUndefined) {
        return "";
      }
      throw new Error(`Environment variable ${varName} is not defined`);
    }

    return envValue;
  });

  // Restore escaped env vars
  result = result.replace(new RegExp(ESCAPE_PLACEHOLDER, "g"), "${");

  return result;
}

/**
 * Resolve environment variables in all string fields of an object (deep)
 */
export function resolveEnvVarsInObject<T>(obj: T, options: ResolveEnvOptions = {}): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    return resolveEnvVars(obj, options) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveEnvVarsInObject(item, options)) as T;
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveEnvVarsInObject(value, options);
    }
    return result as T;
  }

  return obj;
}
