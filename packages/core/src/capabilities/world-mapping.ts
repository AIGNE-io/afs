/**
 * World Mapping Capability
 *
 * Provider capability for declarative path-to-API mapping.
 * DSL is stored as data in AFS, execution happens at the provider boundary.
 *
 * Core principle:
 * - DSL is data (living in AFS)
 * - Execution is capability (living in provider)
 *
 * @see intent/specs/world-mapping-capability.md
 */

import type { AFSEntry, AFSModule } from "../type.js";

/**
 * Status information for loaded mapping configuration
 */
export interface MappingStatus {
  /** Whether mapping is loaded */
  loaded: boolean;
  /** Time when mapping was last loaded */
  loadedAt?: Date;
  /** Path to the mapping configuration */
  mappingPath?: string;
  /** Whether mapping is successfully compiled */
  compiled: boolean;
  /** Error message if loading/compilation failed */
  error?: string;
  /** Statistics about the loaded mapping */
  stats?: {
    /** Number of route templates */
    routes: number;
    /** Number of supported operations */
    operations: number;
  };
}

/**
 * Reference to an external system resource
 */
export interface ExternalRef {
  /** Type of external system */
  type: "http" | "graphql" | "mcp-tool" | "custom";
  /** HTTP: URL, GraphQL: query, MCP: tool name */
  target: string;
  /** HTTP method or operation type */
  method?: string;
  /** Bound parameters */
  params?: Record<string, unknown>;
  /** Headers or metadata */
  headers?: Record<string, string>;
}

/**
 * Context for projecting external data to AFS entries
 */
export interface ProjectionContext {
  /** Original AFS path */
  path: string;
  /** Matched path template */
  template: string;
  /** Extracted path parameters */
  pathParams: Record<string, string>;
  /** Current mapping rule (opaque to core, interpreted by provider) */
  rule: unknown;
}

/**
 * Types of mutation actions
 */
export type MutateAction = "create" | "update" | "delete" | "exec";

/**
 * Result of a mutation operation
 */
export interface MutateResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Result data from the operation */
  data?: unknown;
  /** Error message if operation failed */
  error?: string;
}

/**
 * World Mapping Capability Interface
 *
 * Providers implement this interface to support declarative path-to-API mapping.
 * The mapping DSL defines how AFS paths map to external API calls.
 *
 * @example
 * ```typescript
 * class AFSGitHub implements AFSModule, AFSWorldMappingCapable {
 *   async loadMapping(mappingPath: string): Promise<void> {
 *     // Load and compile mapping from AFS
 *   }
 *
 *   resolve(path: string): ExternalRef | null {
 *     // Match path against compiled routes
 *   }
 *
 *   project(data: unknown, ctx: ProjectionContext): AFSEntry[] {
 *     // Transform API response to AFS entries
 *   }
 * }
 * ```
 */
export interface AFSWorldMappingCapable {
  /**
   * Load mapping configuration from AFS path
   * @param mappingPath AFS path to mapping configuration file or directory
   */
  loadMapping(mappingPath: string): Promise<void>;

  /**
   * Reload mapping configuration (hot-reload)
   * Should rollback to previous valid configuration on failure
   */
  reloadMapping(): Promise<void>;

  /**
   * Get current mapping status
   */
  getMappingStatus(): MappingStatus;

  /**
   * Resolve AFS path to external reference
   * @param path AFS internal path
   * @returns External system reference, or null if path doesn't match any route
   */
  resolve(path: string): ExternalRef | null;

  /**
   * Project external data to AFS entries
   * @param externalData Data returned from external API
   * @param context Resolution context (path, template, params, rule)
   * @returns Array of AFS entries
   */
  project(externalData: unknown, context: ProjectionContext): AFSEntry[];

  /**
   * Execute mutation operation
   * @param path AFS path
   * @param action Mutation type
   * @param payload Operation parameters
   */
  mutate(path: string, action: MutateAction, payload: unknown): Promise<MutateResult>;
}

/**
 * Type guard to check if a module implements World Mapping capability
 *
 * @example
 * ```typescript
 * if (isWorldMappingCapable(provider)) {
 *   await provider.loadMapping("/config/mapping/github.yaml");
 * }
 * ```
 */
export function isWorldMappingCapable(
  module: AFSModule | null | undefined,
): module is AFSModule & AFSWorldMappingCapable {
  if (!module) return false;

  const m = module as unknown as Partial<AFSWorldMappingCapable>;
  return (
    typeof m.loadMapping === "function" &&
    typeof m.reloadMapping === "function" &&
    typeof m.getMappingStatus === "function" &&
    typeof m.resolve === "function" &&
    typeof m.project === "function" &&
    typeof m.mutate === "function"
  );
}
