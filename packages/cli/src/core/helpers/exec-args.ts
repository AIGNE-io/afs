/**
 * exec-args Helpers - Core Implementation
 *
 * Functions for parsing exec command arguments with schema-aware type coercion.
 */

import type { JSONSchema } from "../types.js";
import { readStdin } from "./stdin.js";

/**
 * Reserved CLI option names that should not be passed as exec arguments
 */
export const RESERVED_OPTIONS = new Set([
  "json",
  "yaml",
  "view",
  "help",
  "h",
  "version",
  "V",
  "_", // yargs positional args array
  "$0", // yargs script name
  "executable_path", // positional exec target path (intentionally compound to avoid schema collision)
  "executablePath", // yargs camelCase alias
  "args", // our --args option (processed separately)
]);

/**
 * Parse exec arguments from CLI options, with optional schema-aware type coercion
 *
 * Priority: CLI flags > stdin > --args
 *
 * @param options - CLI options object
 * @param inputSchema - Optional JSON Schema for type coercion
 * @returns Parsed arguments for exec
 */
export function parseExecArgs(
  options: Record<string, unknown>,
  inputSchema?: JSONSchema,
): Record<string, unknown> {
  let result: Record<string, unknown> = {};

  // Parse --args JSON if provided (lowest priority)
  if (options.args && typeof options.args === "string") {
    try {
      const parsed = JSON.parse(options.args);
      if (typeof parsed === "object" && parsed !== null) {
        result = { ...parsed };
      }
    } catch (e) {
      throw new Error(`Invalid JSON in --args: ${(e as Error).message}`);
    }
  }

  // Get properties schema for type coercion
  const properties = inputSchema?.properties as Record<string, JSONSchema> | undefined;

  // Add named parameters (overwrite JSON args if same key) - highest priority
  for (const [key, value] of Object.entries(options)) {
    // Skip reserved options (unless defined in action schema) and undefined/null values
    const isSchemaProperty = inputSchema?.properties?.[key] !== undefined;
    if ((RESERVED_OPTIONS.has(key) && !isSchemaProperty) || value === undefined || value === null) {
      continue;
    }
    // Apply schema-aware parsing if schema is available
    const propSchema = properties?.[key];
    result[key] = parseValueBySchema(value, propSchema, key);
  }

  return result;
}

/**
 * Parse exec arguments with stdin support (async version)
 *
 * Priority: CLI flags > stdin > --args
 *
 * @param options - CLI options object from yargs
 * @param inputSchema - Optional JSON Schema for type-aware coercion
 * @returns Parsed arguments for exec
 */
export async function parseExecArgsWithStdin(
  options: Record<string, unknown>,
  inputSchema?: JSONSchema,
): Promise<Record<string, unknown>> {
  let result: Record<string, unknown> = {};

  // 1. Parse --args JSON if provided (lowest priority)
  if (options.args && typeof options.args === "string") {
    try {
      const parsed = JSON.parse(options.args);
      if (typeof parsed === "object" && parsed !== null) {
        result = { ...parsed };
      }
    } catch (e) {
      throw new Error(`Invalid JSON in --args: ${(e as Error).message}`);
    }
  }

  // 2. Read from stdin if available (medium priority)
  const stdinContent = await readStdin();
  if (stdinContent) {
    try {
      const parsed = JSON.parse(stdinContent);
      if (typeof parsed === "object" && parsed !== null) {
        result = { ...result, ...parsed };
      }
    } catch (e) {
      throw new Error(`Invalid JSON in stdin: ${(e as Error).message}`);
    }
  }

  // Get properties schema for type coercion
  const properties = inputSchema?.properties as Record<string, JSONSchema> | undefined;

  // 3. Add named CLI parameters (highest priority) with schema-aware parsing
  for (const [key, value] of Object.entries(options)) {
    // Skip reserved options (unless defined in action schema) and undefined/null values
    const isSchemaProperty = inputSchema?.properties?.[key] !== undefined;
    if ((RESERVED_OPTIONS.has(key) && !isSchemaProperty) || value === undefined || value === null) {
      continue;
    }
    // Apply schema-aware parsing if schema is available
    const propSchema = properties?.[key];
    result[key] = parseValueBySchema(value, propSchema, key);
  }

  return result;
}

/**
 * Parse a value according to its JSON Schema type
 *
 * @param value - The value to parse (typically a string from CLI)
 * @param schema - The JSON Schema for this property
 * @param paramName - Parameter name for error messages
 * @returns Parsed value with appropriate type
 */
export function parseValueBySchema(
  value: unknown,
  schema: JSONSchema | undefined,
  paramName: string,
): unknown {
  // If value is not a string, return as-is (already parsed by yargs or --args)
  if (typeof value !== "string") {
    return value;
  }

  // If no schema, return string as-is
  if (!schema) {
    return value;
  }

  const schemaType = schema.type;

  switch (schemaType) {
    case "integer": {
      const num = Number(value);
      if (Number.isNaN(num)) {
        throw new Error(`Invalid integer for '${paramName}': ${value}\nExpected: integer`);
      }
      return Math.floor(num);
    }

    case "number": {
      const num = Number(value);
      if (Number.isNaN(num)) {
        throw new Error(`Invalid number for '${paramName}': ${value}\nExpected: number`);
      }
      return num;
    }

    case "boolean": {
      if (value === "true") return true;
      if (value === "false") return false;
      throw new Error(`Invalid boolean for '${paramName}': ${value}\nExpected: "true" or "false"`);
    }

    case "array":
    case "object": {
      try {
        return JSON.parse(value);
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        throw new Error(
          `Invalid JSON for '${paramName}': ${errorMsg}\n` +
            `Value: ${value}\n` +
            `Hint: For ${schemaType}s, use valid JSON syntax. ` +
            (schemaType === "array"
              ? 'Arrays use [...], e.g., \'["a","b"]\''
              : 'Objects use {...}, e.g., \'{"key":"value"}\''),
        );
      }
    }

    default:
      // string or unknown type: return as-is
      return value;
  }
}

/**
 * Convert JSON Schema type to yargs type
 *
 * @param schemaType - JSON Schema type
 * @returns yargs type string
 */
export function schemaTypeToYargs(
  schemaType: JSONSchema["type"],
): "string" | "number" | "boolean" | "array" {
  switch (schemaType) {
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
    case "object":
      // Use "string" so yargs passes raw JSON string to parseValueBySchema for parsing
      return "string";
    default:
      return "string";
  }
}
