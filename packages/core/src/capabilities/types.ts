/**
 * AFS Capabilities Manifest Types
 *
 * Defines the types for the /.meta/.capabilities endpoint,
 * enabling AI models to discover available tools and actions.
 */

import type { JSONSchema7 } from "../meta/type.js";

/**
 * Tool definition for global callable tools.
 * Tools are not bound to specific nodes and can be invoked directly.
 */
export interface ToolDefinition {
  /** Tool name (unique within provider, without provider prefix) */
  name: string;
  /** Tool description */
  description?: string;
  /** Path to executable node (must point to afs:executable) */
  path: string;
  /** Input parameters schema */
  inputSchema?: JSONSchema7;
  /** Output result schema (optional) */
  outputSchema?: JSONSchema7;
}

/**
 * Action definition within a catalog.
 * Actions are node-level operations that require targeting a specific node.
 */
export interface ActionDefinition {
  /** Action name */
  name: string;
  /** Action description */
  description?: string;
  /** Input parameters schema (optional) */
  inputSchema?: JSONSchema7;
  /** Output result schema (optional) */
  outputSchema?: JSONSchema7;
}

/**
 * Action catalog describing available actions for a kind of node.
 */
export interface ActionCatalog {
  /** Kind name (optional, e.g., "sqlite:row", "ec2:instance") */
  kind?: string;
  /** Description (when no kind, describes the applicable scenario) */
  description?: string;
  /** List of possible actions (catalog/documentation) */
  catalog: ActionDefinition[];
  /** Discovery information for finding actual available actions */
  discovery: {
    /**
     * Path template for node-level .actions
     * - Must start with / (relative to provider root)
     * - Uses :param syntax for path parameters (e.g., /:table/:pk/.actions)
     * - Core aggregation adds mount path prefix
     */
    pathTemplate: string;
    /** Optional note (e.g., "List to confirm availability") */
    note?: string;
  };
}

/**
 * Declares which AFS operations a provider supports.
 */
export interface OperationsDeclaration {
  read: boolean;
  list: boolean;
  write: boolean;
  delete: boolean;
  search: boolean;
  exec: boolean;
  stat: boolean;
  explain: boolean;
  /** Whether batch write (multiple entries in one call) is supported. Auto-derived from write. */
  batchWrite?: boolean;
  /** Whether batch delete (multiple entries in one call) is supported. Auto-derived from delete. */
  batchDelete?: boolean;
}

/**
 * Declares a specific operation capability at a path pattern.
 */
export interface ProviderCap {
  /** Operation type */
  op: "read" | "write" | "exec";
  /** Path pattern (e.g., "/models/*", "/data/:id") */
  path: string;
  /** Human-readable description */
  description?: string;
}

/**
 * Per-operation pricing information.
 */
export interface OperationPricing {
  /** Cost per API call */
  perCall?: number;
  /** Cost per input token (LLM providers) */
  perInputToken?: number;
  /** Cost per output token (LLM providers) */
  perOutputToken?: number;
}

/**
 * Provider pricing declaration.
 */
export interface ProviderPricing {
  /** Currency unit (e.g., "USD", "credits") */
  currency?: string;
  /** Pricing for exec operations */
  exec?: OperationPricing;
  /** Pricing for read operations */
  read?: OperationPricing;
  /** Pricing for write operations */
  write?: OperationPricing;
}

/**
 * Provider rate and capacity limits.
 */
export interface ProviderLimits {
  /** Requests per minute */
  rpm?: number;
  /** Requests per day */
  rpd?: number;
  /** Maximum tokens per single request */
  maxTokensPerRequest?: number;
  /** Maximum concurrent requests */
  maxConcurrency?: number;
}

/**
 * Provider resource declaration — caps, pricing, and limits.
 */
export interface ProviderResources {
  /** Fine-grained operation capabilities */
  caps?: ProviderCap[];
  /** Pricing information */
  pricing?: ProviderPricing;
  /** Rate and capacity limits */
  limits?: ProviderLimits;
}

/**
 * Capabilities manifest returned by a provider.
 */
export interface CapabilitiesManifest {
  /** Schema version for evolution compatibility */
  schemaVersion: 1;
  /** Provider name */
  provider: string;
  /** Provider version */
  version?: string;
  /** Provider description */
  description?: string;
  /** Global tools list */
  tools: ToolDefinition[];
  /** Action catalogs list */
  actions: ActionCatalog[];
  /** Declares which AFS operations this provider supports (optional during transition) */
  operations?: OperationsDeclaration;
  /** Resource declaration — caps, pricing, and limits */
  resources?: ProviderResources;
}

/**
 * Aggregated capabilities from all mounted providers.
 * Extends CapabilitiesManifest with aggregation metadata.
 */
export interface AggregatedCapabilities extends CapabilitiesManifest {
  /** True if some providers were skipped (partial result) */
  partial?: boolean;
  /** List of skipped mount paths (for debugging) */
  skipped?: string[];
  /** Per-provider resource declarations, keyed by mount path */
  providerResources?: Record<string, ProviderResources>;
}
