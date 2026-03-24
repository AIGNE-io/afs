/**
 * CLI Core Types
 *
 * Minimal type definitions for the core CLI layer.
 * Uses AFS native types (AFSListResult, AFSReadResult, etc.) directly.
 */

// ============================================================================
// View Types
// ============================================================================

export type ViewType = "default" | "json" | "yaml" | "llm" | "human";

// ============================================================================
// JSON Schema (for exec command parameter parsing)
// ============================================================================

/**
 * Simplified JSON Schema type for CLI parameter parsing
 */
export interface JSONSchema {
  type?: "string" | "number" | "integer" | "boolean" | "array" | "object" | "null";
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  description?: string;
  default?: unknown;
  enum?: unknown[];
  [key: string]: unknown;
}
