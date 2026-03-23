/**
 * Schema utilities for extracting sensitive field metadata and env mappings
 * from JSON Schema output (produced by z.toJSONSchema()).
 *
 * Zod 4's .meta() transparently passes custom fields through to JSON Schema output.
 * These utilities read those fields to identify sensitive fields and environment variable bindings.
 */

import type { JSONSchema7 } from "../meta/type.js";

/**
 * Extended JSON Schema property with AFS credential metadata.
 * Fields are passed through from Zod 4's .meta({ sensitive, env }).
 */
interface SchemaPropertyWithMeta {
  sensitive?: boolean;
  env?: string[];
  [key: string]: unknown;
}

/**
 * Extract the list of top-level property names marked as sensitive.
 *
 * Works with both flat schemas and nested schemas (e.g. credentials.accessKeyId).
 * For nested objects, returns dot-notation paths (e.g. "credentials.accessKeyId").
 *
 * @param schema - JSON Schema (from z.toJSONSchema() or manifest schema)
 * @returns array of sensitive field paths
 */
export function getSensitiveFields(schema: JSONSchema7): string[] {
  const result: string[] = [];
  collectSensitiveFields(schema, "", result);
  return result;
}

function collectSensitiveFields(schema: JSONSchema7, prefix: string, result: string[]): void {
  if (typeof schema !== "object" || schema === null) return;

  const properties = (schema as Record<string, any>).properties;
  if (!properties || typeof properties !== "object") return;

  for (const [key, propSchema] of Object.entries(properties)) {
    const prop = propSchema as SchemaPropertyWithMeta;
    const fieldPath = prefix ? `${prefix}.${key}` : key;

    if (prop.sensitive === true) {
      result.push(fieldPath);
    }

    // Recurse into nested objects
    if (prop.type === "object" && prop.properties) {
      collectSensitiveFields(prop as JSONSchema7, fieldPath, result);
    }
  }
}

/**
 * Extract environment variable mappings from a JSON Schema.
 *
 * Returns a map from field path to array of env variable names.
 * Only includes fields that have `env` metadata set.
 *
 * @param schema - JSON Schema (from z.toJSONSchema() or manifest schema)
 * @returns map of field path → env variable names
 */
export function getEnvMappings(schema: JSONSchema7): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  collectEnvMappings(schema, "", result);
  return result;
}

function collectEnvMappings(
  schema: JSONSchema7,
  prefix: string,
  result: Record<string, string[]>,
): void {
  if (typeof schema !== "object" || schema === null) return;

  const properties = (schema as Record<string, any>).properties;
  if (!properties || typeof properties !== "object") return;

  for (const [key, propSchema] of Object.entries(properties)) {
    const prop = propSchema as SchemaPropertyWithMeta;
    const fieldPath = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(prop.env) && prop.env.length > 0) {
      result[fieldPath] = prop.env;
    }

    // Recurse into nested objects
    if (prop.type === "object" && prop.properties) {
      collectEnvMappings(prop as JSONSchema7, fieldPath, result);
    }
  }
}

/**
 * Resolve environment variables for schema fields that declare `env` metadata.
 *
 * For each field with env mapping, checks process.env for the first matching variable.
 * Only returns fields where an env variable was found.
 *
 * @param schema - JSON Schema with env metadata
 * @param env - Environment variables (defaults to process.env)
 * @returns resolved field values from environment
 */
export function resolveEnvFromSchema(
  schema: JSONSchema7,
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const mappings = getEnvMappings(schema);
  const resolved: Record<string, string> = {};

  for (const [field, envVars] of Object.entries(mappings)) {
    for (const envVar of envVars) {
      const value = env[envVar];
      if (value !== undefined && value !== "") {
        resolved[field] = value;
        break;
      }
    }
  }

  return resolved;
}

/**
 * Reserved key for passing sensitiveArgs annotations through mount.options.
 * Used by CLI --sensitive-args and exec mount actions to annotate which
 * user-provided options are sensitive (for ad-hoc schema construction).
 */
export const SENSITIVE_ARGS_KEY = "_sensitiveArgs";

/**
 * Build an ad-hoc JSON Schema from user-provided key-value pairs and sensitiveArgs.
 *
 * Used when a provider has no native schema() and no registry manifest schema,
 * e.g., generic MCP servers mounted via direct URI with extra options.
 *
 * @param values - Key-value pairs provided by the user
 * @param sensitiveArgs - Field names that should be marked as sensitive
 * @returns JSON Schema with properties derived from values
 */
export function buildAdHocSchema(
  values: Record<string, unknown>,
  sensitiveArgs: string[] = [],
): JSONSchema7 {
  const sensitiveSet = new Set(sensitiveArgs);
  const properties: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(values)) {
    const prop: Record<string, unknown> = {
      type:
        typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "string",
    };
    if (sensitiveSet.has(key)) {
      prop.sensitive = true;
    }
    properties[key] = prop;
  }

  const required = Object.keys(values);

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  } as JSONSchema7;
}

/**
 * Separate values into sensitive and non-sensitive groups based on schema metadata.
 *
 * @param schema - JSON Schema with sensitive metadata
 * @param values - Values to separate
 * @returns object with `sensitive` and `nonSensitive` value groups
 */
export function separateSensitiveValues(
  schema: JSONSchema7,
  values: Record<string, unknown>,
): { sensitive: Record<string, string>; nonSensitive: Record<string, unknown> } {
  const sensitiveFields = new Set(getSensitiveFields(schema));
  const sensitive: Record<string, string> = {};
  const nonSensitive: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(values)) {
    if (sensitiveFields.has(key)) {
      sensitive[key] = String(value);
    } else {
      nonSensitive[key] = value;
    }
  }

  return { sensitive, nonSensitive };
}
