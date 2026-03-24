/**
 * Declarative manifest.json validation for AFS providers.
 *
 * Validates provider manifests as pure JSON objects (no Zod dependency).
 * Used for external providers that ship manifest.json files.
 */

import type { JSONSchema7 } from "./meta/type.js";
import type { CapabilityTag, DataSensitivity, ExternalDependency, ResourceAccess } from "./type.js";
import { CAPABILITY_TAGS } from "./type.js";

// =============================================================================
// TYPES
// =============================================================================

/**
 * JSON-serializable manifest format.
 * Unlike ProviderManifest (which allows Zod schemas), this only allows
 * JSON Schema objects for the `schema` field.
 */
export interface ManifestJSON {
  type?: "provider" | "recipe" | "skill";
  name: string;
  description: string;
  uriTemplate: string;
  category: string;
  version?: string;
  schema?: JSONSchema7;
  tags?: string[];
  capabilityTags?: CapabilityTag[];
  useCases?: string[];
  security?: {
    riskLevel: "sandboxed" | "external" | "local" | "system";
    resourceAccess: ResourceAccess[];
    requires?: ExternalDependency[];
    dataSensitivity?: DataSensitivity[];
    notes?: string[];
  };
  capabilities?: {
    network?: {
      egress?: boolean;
      ingress?: boolean;
      allowedDomains?: string[];
    };
    filesystem?: {
      read?: boolean;
      write?: boolean;
      allowedPaths?: string[];
    };
    crossProvider?: {
      afsAccess?: boolean;
      readPaths?: string[];
      execPaths?: string[];
    };
    process?: {
      spawn?: boolean;
      allowedCommands?: string[];
      requiredEnvVars?: string[];
    };
    secrets?: string[];
  };
  uriDefaults?: Record<string, string>;
  cache?: {
    strategy: "ttl" | "manual" | "time-window";
    ttlSeconds?: number;
    operations?: string[];
  };
}

export interface ManifestValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
  /** Sanitized manifest (prototype pollution fields removed) */
  manifest?: ManifestJSON;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_DESCRIPTION_LENGTH = 10240; // 10KB
const SEMVER_RE = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;
const URI_TEMPLATE_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const DANGEROUS_SCHEMES = new Set(["javascript:", "data:", "vbscript:"]);
const RISK_LEVELS = new Set(["sandboxed", "external", "local", "system"]);
const VALID_TYPES = new Set(["provider", "recipe", "skill"]);

const CREDENTIAL_PATTERNS = [
  /access.?key/i,
  /secret/i,
  /password/i,
  /\btoken\b/i,
  /api.?key/i,
  /private.?key/i,
];

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate and sanitize a manifest JSON object.
 * Returns a sanitized copy if valid, or errors if not.
 */
export function validateManifestJSON(input: unknown): ManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Null/undefined check
  if (input == null || typeof input !== "object") {
    return { valid: false, errors: ["manifest must be a non-null object"] };
  }

  const raw = input as Record<string, unknown>;

  // Sanitize — remove dangerous keys (deep)
  const sanitized = sanitizeObject(raw);

  // Required fields
  if (typeof sanitized.name !== "string" || !sanitized.name) {
    errors.push("name is required and must be a non-empty string");
  }
  if (typeof sanitized.description !== "string" || !sanitized.description) {
    errors.push("description is required and must be a non-empty string");
  }
  if (typeof sanitized.uriTemplate !== "string" || !sanitized.uriTemplate) {
    errors.push("uriTemplate is required and must be a non-empty string");
  }
  if (typeof sanitized.category !== "string" || !sanitized.category) {
    errors.push("category is required and must be a non-empty string");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const name = sanitized.name as string;
  const description = sanitized.description as string;
  const uriTemplate = sanitized.uriTemplate as string;

  // Name security checks
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    errors.push("name must not contain path traversal characters (../, /, \\)");
  }
  if (name.includes("\x00")) {
    errors.push("name must not contain null bytes");
  }

  // URI template checks
  if (!URI_TEMPLATE_SCHEME_RE.test(uriTemplate)) {
    errors.push("uriTemplate must have a scheme (e.g. test://{path})");
  } else {
    const scheme = `${uriTemplate.split("://")[0]!.toLowerCase()}:`;
    if (DANGEROUS_SCHEMES.has(scheme)) {
      errors.push(`uriTemplate must not use dangerous scheme: ${scheme}`);
    }
  }

  // Description length
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`description exceeds maximum length of ${MAX_DESCRIPTION_LENGTH} bytes`);
  }

  // Optional: version must be semver
  if (sanitized.version !== undefined) {
    if (typeof sanitized.version !== "string" || !SEMVER_RE.test(sanitized.version)) {
      errors.push("version must be a valid semver string (e.g. 1.0.0)");
    }
  }

  // Optional: type
  if (sanitized.type !== undefined && !VALID_TYPES.has(sanitized.type as string)) {
    errors.push("type must be one of: provider, recipe, skill");
  }

  // Optional: capabilityTags
  if (sanitized.capabilityTags !== undefined) {
    if (!Array.isArray(sanitized.capabilityTags)) {
      errors.push("capabilityTags must be an array");
    } else {
      const tagSet = new Set(CAPABILITY_TAGS as readonly string[]);
      for (const tag of sanitized.capabilityTags) {
        if (!tagSet.has(tag as string)) {
          errors.push(`invalid capabilityTag: ${tag}`);
        }
      }
    }
  }

  // Optional: security.riskLevel
  if (sanitized.security !== undefined) {
    const sec = sanitized.security as Record<string, unknown>;
    if (sec.riskLevel && !RISK_LEVELS.has(sec.riskLevel as string)) {
      errors.push(`invalid security.riskLevel: ${sec.riskLevel}`);
    }
  }

  // Check for credential-like values in schema defaults
  if (sanitized.schema && typeof sanitized.schema === "object") {
    checkCredentialLeakage(sanitized.schema as Record<string, unknown>, warnings);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    manifest: sanitized as unknown as ManifestJSON,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Deep-clone an object, removing dangerous prototype pollution keys.
 */
function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    const value = obj[key];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = sanitizeObject(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item !== null && typeof item === "object" && !Array.isArray(item)
          ? sanitizeObject(item as Record<string, unknown>)
          : item,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Check JSON Schema properties for credential-like default values.
 */
function checkCredentialLeakage(schema: Record<string, unknown>, warnings: string[]): void {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) return;

  for (const [fieldName, fieldDef] of Object.entries(properties)) {
    if (!fieldDef || typeof fieldDef !== "object") continue;

    // Check if field name looks like a credential
    const isCredentialField = CREDENTIAL_PATTERNS.some((p) => p.test(fieldName));

    if (isCredentialField && fieldDef.default !== undefined) {
      warnings.push(
        `schema property "${fieldName}" looks like a credential and has a default value — manifests should not contain actual credential values`,
      );
    }
  }
}
