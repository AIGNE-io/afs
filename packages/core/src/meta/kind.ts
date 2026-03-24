/**
 * Kind System - defineKind API with layer-by-layer validation
 *
 * Provides:
 * - defineKind() function for creating Kind definitions
 * - Layer-by-layer validation (validates each ancestor separately)
 * - Inheritance chain resolution
 *
 * Uses zod built-in fromJSONSchema for runtime JSON Schema to Zod conversion.
 */

import { fromJSONSchema, type ZodType } from "zod";
import { zodParse } from "../utils/zod.js";
import type { JSONSchema7, KindSchema, NodesConstraints, ValidationResult } from "./type.js";
import { validateNodes } from "./validation.js";
import { WELL_KNOWN_KINDS_MAP } from "./well-known-kinds.js";

// =============================================================================
// Kind definition and instance types
// =============================================================================

/**
 * Input for defineKind function.
 */
export interface KindDefinition {
  /** Unique name in format "provider:kind" */
  name: string;
  /** Parent kind name for inheritance */
  extends?: string;
  /** Human-readable description */
  description?: string;
  /** Meta schema in JSON Schema format */
  meta?: JSONSchema7;
  /** Child node structure constraints */
  nodes?: NodesConstraints;
}

/**
 * A defined Kind with validation capabilities.
 */
export interface Kind {
  /** The underlying schema */
  readonly schema: KindSchema;

  /** Kind name */
  readonly name: string;

  /** Parent kind name */
  readonly extends?: string;

  /**
   * Validate meta data against this kind and all ancestors.
   * Performs layer-by-layer validation from root to leaf.
   *
   * @param meta - Meta data to validate
   * @param resolver - Function to resolve kind by name (for inheritance)
   * @returns Validation result with all errors from all layers
   */
  validate(meta: unknown, resolver?: KindResolver): ValidationResult;

  /**
   * Validate node structure against this kind's nodes constraints.
   *
   * @param basePath - Base path for error reporting (e.g., "/project")
   * @param nodeNames - List of node names in the directory
   * @returns Validation result
   */
  validateNodes(basePath: string, nodeNames: string[]): ValidationResult;

  /**
   * Get the inheritance chain from root to this kind.
   *
   * @param resolver - Function to resolve kind by name
   * @returns Array of KindSchema from root ancestor to this kind
   */
  getInheritanceChain(resolver?: KindResolver): KindSchema[];
}

/**
 * Function type for resolving a kind by name.
 * Used for looking up parent kinds during inheritance resolution.
 */
export type KindResolver = (name: string) => KindSchema | undefined;

// =============================================================================
// Default resolver (uses well-known kinds)
// =============================================================================

/**
 * Default kind resolver that only knows about well-known kinds.
 * Providers should supply their own resolver that includes their kinds.
 */
export const defaultKindResolver: KindResolver = (name: string) => {
  return WELL_KNOWN_KINDS_MAP.get(name);
};

// =============================================================================
// Schema cache for performance
// =============================================================================

const zodSchemaCache = new WeakMap<JSONSchema7, ZodType>();

/**
 * Convert JSON Schema to Zod schema with caching.
 */
function getZodSchema(jsonSchema: JSONSchema7): ZodType {
  let zodSchema = zodSchemaCache.get(jsonSchema);
  if (!zodSchema) {
    zodSchema = fromJSONSchema(jsonSchema as Parameters<typeof fromJSONSchema>[0]);
    zodSchemaCache.set(jsonSchema, zodSchema);
  }
  return zodSchema;
}

// =============================================================================
// defineKind implementation
// =============================================================================

/**
 * Define a new Kind with validation capabilities.
 *
 * @example
 * ```typescript
 * const projectKind = defineKind({
 *   name: "chamber:project",
 *   extends: "afs:node",
 *   description: "A project directory",
 *   meta: {
 *     type: "object",
 *     properties: {
 *       name: { type: "string" },
 *       status: { type: "string", enum: ["active", "archived"] },
 *     },
 *     required: ["name"],
 *   },
 *   nodes: {
 *     required: [{ path: "src" }],
 *     optional: [{ path: "*.md" }],
 *   },
 * });
 *
 * // Validate meta (includes parent validation)
 * const result = projectKind.validate({ name: "My Project", status: "active" });
 * ```
 */
export function defineKind(definition: KindDefinition): Kind {
  const schema: KindSchema = {
    name: definition.name,
    extends: definition.extends,
    description: definition.description,
    meta: definition.meta,
    nodes: definition.nodes,
  };

  return {
    schema,
    name: definition.name,
    extends: definition.extends,

    validate(meta: unknown, resolver: KindResolver = defaultKindResolver): ValidationResult {
      const chain = this.getInheritanceChain(resolver);
      const errors: ValidationResult["errors"] = [];

      // Validate each layer from root to leaf
      for (const kindSchema of chain) {
        if (kindSchema.meta) {
          try {
            zodParse(getZodSchema(kindSchema.meta), meta, { prefix: kindSchema.name });
          } catch (err) {
            errors.push({
              path: "",
              message: err instanceof Error ? err.message : String(err),
              code: "VALIDATION_ERROR",
            });
          }
        }
      }

      return { valid: errors.length === 0, errors };
    },

    validateNodes(basePath: string, nodeNames: string[]): ValidationResult {
      return validateNodes(basePath, nodeNames, schema.nodes);
    },

    getInheritanceChain(resolver: KindResolver = defaultKindResolver): KindSchema[] {
      return getInheritanceChain(schema, resolver);
    },
  };
}

// =============================================================================
// Inheritance helpers
// =============================================================================

/**
 * Get the inheritance chain from root ancestor to the given kind.
 *
 * @param kind - The kind to get inheritance chain for
 * @param resolver - Function to resolve kind by name
 * @returns Array of KindSchema from root to leaf (inclusive)
 * @throws Error if circular inheritance is detected or parent not found
 */
export function getInheritanceChain(
  kind: KindSchema,
  resolver: KindResolver = defaultKindResolver,
): KindSchema[] {
  const chain: KindSchema[] = [];
  const visited = new Set<string>();
  let current: KindSchema | undefined = kind;

  // Walk up the inheritance tree
  while (current) {
    if (visited.has(current.name)) {
      throw new Error(`Circular inheritance detected: ${current.name}`);
    }
    visited.add(current.name);
    chain.unshift(current); // Add to front (we're walking up)

    if (!current.extends) {
      break;
    }

    current = resolver(current.extends);
    if (!current) {
      throw new Error(`Parent kind not found: "${kind.extends}" (extended by "${kind.name}")`);
    }
  }

  return chain;
}

/**
 * Create a kind resolver that includes provider kinds and well-known kinds.
 *
 * @param providerKinds - Kinds defined by the provider
 * @returns A resolver function
 */
export function createKindResolver(providerKinds: KindSchema[]): KindResolver {
  const providerMap = new Map(providerKinds.map((k) => [k.name, k]));

  return (name: string) => {
    // Provider kinds take precedence
    const providerKind = providerMap.get(name);
    if (providerKind) {
      return providerKind;
    }
    // Fall back to well-known kinds
    return WELL_KNOWN_KINDS_MAP.get(name);
  };
}

// =============================================================================
// Utility exports
// =============================================================================

/**
 * Error thrown when kind resolution fails.
 */
export class KindError extends Error {
  constructor(
    message: string,
    public readonly kindName: string,
  ) {
    super(message);
    this.name = "KindError";
  }
}

/**
 * Resolve a kind name to its KindSchema.
 *
 * Looks up the kind in provider kinds first, then falls back to well-known kinds.
 *
 * @param kindName - The name of the kind to resolve (e.g., "afs:node", "chamber:project")
 * @param providerKinds - Optional array of kinds defined by the provider
 * @returns The resolved KindSchema, or undefined if not found
 *
 * @example
 * ```typescript
 * const nodeKind = resolveKindSchema("afs:node");
 * const projectKind = resolveKindSchema("chamber:project", providerKinds);
 * ```
 */
export function resolveKindSchema(
  kindName: string,
  providerKinds?: KindSchema[],
): KindSchema | undefined {
  const resolver = providerKinds ? createKindResolver(providerKinds) : defaultKindResolver;
  return resolver(kindName);
}
