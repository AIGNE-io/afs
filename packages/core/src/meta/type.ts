// =============================================================================
// META SYSTEM TYPES
// =============================================================================

import type { JSONSchema7 } from "json-schema";

/**
 * Re-export JSON Schema type for convenience.
 */
export type { JSONSchema7 };

/**
 * Constraint for a single node (file or directory) within a Kind.
 * Supports exact paths, wildcards, and glob patterns.
 */
export interface NodeConstraint {
  /**
   * Node name or path pattern.
   * - Exact: "src", "README.md"
   * - Wildcard: "*.md", "*.test.ts"
   * - Glob: "test/**", "src/**\/*.tsx"
   */
  path: string;
  /** Kind that this node must conform to (optional) */
  kind?: string;
  /** Nested constraints for child nodes (recursive) */
  nodes?: NodesConstraints;
}

/**
 * Constraints for child nodes within a directory.
 */
export interface NodesConstraints {
  /** Nodes that must exist */
  required?: NodeConstraint[];
  /** Nodes that may exist (validated if present) */
  optional?: NodeConstraint[];
  /** Whether to allow nodes not listed in required/optional (default: true) */
  allowOther?: boolean;
}

/**
 * Kind Schema definition.
 * Uses JSON Schema for meta validation.
 */
export interface KindSchema {
  /** Unique name in format "provider:kind" (e.g., "afs:node", "chamber:project") */
  name: string;
  /** Parent kind name for inheritance (single inheritance) */
  extends?: string;
  /** Human-readable description */
  description?: string;
  /** Meta schema in JSON Schema format */
  meta?: JSONSchema7;
  /** Child node structure constraints */
  nodes?: NodesConstraints;
}

/**
 * Result of validating a node against its Kind Schema.
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** List of validation errors (empty if valid) */
  errors: ValidationError[];
}

/**
 * A single validation error.
 */
export interface ValidationError {
  /** Path to the invalid property or node */
  path: string;
  /** Human-readable error message */
  message: string;
  /** Error code for programmatic handling */
  code?: string;
  /** Expected value or constraint */
  expected?: unknown;
  /** Actual value found */
  actual?: unknown;
}

/**
 * Parsed information about a .meta virtual path.
 */
export interface MetaPathInfo {
  /** Path to the node (without .meta suffix) */
  nodePath: string;
  /** Resource path within .meta (e.g., "icon.png"), null for meta itself */
  resourcePath: string | null;
  /** Whether this is a .meta/.kinds path */
  isKindsPath: boolean;
  /** Specific kind name if accessing .meta/.kinds/{name} */
  kindName: string | null;
}

/**
 * Result of explain() operation - LLM-friendly node description.
 */
export interface AFSExplainResult {
  /** Output format */
  format: "markdown" | "text";
  /** Human/LLM readable description */
  content: string;
}
