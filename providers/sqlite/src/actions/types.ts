import type { SqliteDatabase } from "../database/init.js";
import type { SchemaService } from "../schema/service.js";
import type { TableSchema } from "../schema/types.js";

/**
 * Context provided to action handlers
 */
export interface ActionContext {
  /** Database instance */
  db: SqliteDatabase;
  /** Schema service for querying table schemas on-demand */
  schemaService: SchemaService;
  /** Table this action is being executed on */
  table: string;
  /** Primary key of the row (if row-level action) */
  pk?: string;
  /** The row data (if available) */
  row?: Record<string, unknown>;
  /** Reference to the parent module for advanced operations */
  module: {
    exportTable(table: string, format: string): Promise<unknown>;
  };
}

/**
 * Context for generating dynamic input schemas
 */
export interface SchemaGeneratorContext {
  /** Table schema (for table/row-level actions) */
  tableSchema?: TableSchema;
  /** Table name */
  tableName?: string;
  /** Schema service for querying schemas */
  schemaService: SchemaService;
}

/**
 * Function that generates input schema dynamically based on context
 */
export type InputSchemaGenerator = (ctx: SchemaGeneratorContext) => Record<string, unknown>;

/**
 * Action handler function signature
 */
export type ActionHandler = (
  ctx: ActionContext,
  params: Record<string, unknown>,
) => Promise<ActionResult>;

/**
 * Error codes for SQLite actions
 *
 * Simplified to 3 core codes. Specific error types are distinguished via message.
 */
export enum SQLiteActionErrorCode {
  /** Input parameters invalid (schema, type, format errors) */
  INVALID_INPUT = 1001,
  /** Table, column, index, or row not found */
  NOT_FOUND = 2001,
  /** Constraint violation (unique, foreign key, not null, etc.) */
  CONSTRAINT_VIOLATION = 3001,
}

/**
 * Error details for failed actions
 */
export interface ActionError {
  code: SQLiteActionErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Result from an action execution
 */
export interface ActionResult {
  success: boolean;
  data?: unknown;
  message?: string;
  error?: ActionError;
}

/**
 * Helper to create an error result
 */
export function errorResult(
  code: SQLiteActionErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ActionResult {
  return {
    success: false,
    error: { code, message, details },
  };
}

/**
 * Action definition with metadata
 */
export interface ActionDefinition {
  /** Action name */
  name: string;
  /** Description of what the action does */
  description?: string;
  /** Whether this action is available at root level (database operations) */
  rootLevel?: boolean;
  /** Whether this action is available at table level (vs row level) */
  tableLevel?: boolean;
  /** Whether this action is available at row level */
  rowLevel?: boolean;
  /** Static input schema for the action parameters */
  inputSchema?: Record<string, unknown>;
  /** Dynamic input schema generator (takes precedence over static inputSchema) */
  inputSchemaGenerator?: InputSchemaGenerator;
  /** The handler function */
  handler: ActionHandler;
}
