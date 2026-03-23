import { type ZodType, z } from "zod";
import type {
  AFSEventCallback,
  AFSEventDeclaration,
  AFSEventFilter,
  AFSUnsubscribe,
} from "./events.js";
import type { AFSExplainResult, JSONSchema7 } from "./meta/type.js";

// =============================================================================
// AUTH CONTEXT TYPES
// =============================================================================

/**
 * Abstract auth context interface for collecting credentials.
 * Implementations:
 * - CLI: terminal prompt / masked input / open command
 * - MCP: elicitation form mode / URL mode
 */
export interface AuthContext {
  /** Step 2 resolved fields (env/store/config), so auth() can skip already-resolved fields */
  readonly resolved: Record<string, unknown>;

  /**
   * Collect fields from the user.
   * Implementation auto-selects secure channel based on `sensitive` markers in schema:
   * - All non-sensitive → MCP form mode / CLI prompt
   * - Contains sensitive → MCP URL mode (local HTTP form) / CLI masked input
   *
   * @param schema - JSON Schema describing fields to collect (from z.toJSONSchema() or manifest)
   * @returns collected values, or null if user declined/cancelled
   */
  collect(schema: JSONSchema7): Promise<Record<string, unknown> | null>;

  /**
   * Create a localhost callback server for OAuth redirect_uri flows.
   * Provider uses callbackURL to construct auth URL, then waitForCallback() for the result.
   */
  createCallbackServer(): Promise<CallbackServer>;

  /**
   * Request the client to open a URL (MCP: URL mode elicitation, CLI: open command).
   * Only opens — does not wait for data.
   */
  requestOpenURL(url: string, message: string): Promise<"accepted" | "declined" | "cancelled">;

  /**
   * If true, auth flows should not block waiting for user interaction.
   * Used in MCP mode where tool calls should return quickly.
   * Auth flows should start background processes and throw with instructions instead.
   */
  nonBlocking?: boolean;

  /**
   * Persist credentials to the credential store (for background auth flows).
   * Injected by the credential resolver when calling providerAuth.
   */
  persistCredentials?(credentials: Record<string, unknown>): Promise<void>;
}

/**
 * Localhost callback server for OAuth flows.
 * Created by AuthContext.createCallbackServer().
 */
export interface CallbackServer {
  /** Callback address, e.g. http://127.0.0.1:{port}/callback */
  callbackURL: string;

  /** Wait for a callback request. Returns query params, or null on timeout/cancel. */
  waitForCallback(options?: { timeout?: number }): Promise<Record<string, string> | null>;

  /** Close the callback server. Idempotent. */
  close(): void;
}

/** AFS change record — pure data, zero external dependencies */
export interface AFSChangeRecord {
  kind: "write" | "delete" | "mount" | "unmount" | "rename" | "mountError";
  path: string;
  /** Module name (for mount/unmount events) */
  moduleName?: string;
  /** Namespace (for mount/unmount events) */
  namespace?: string | null;
  timestamp: number;
  /** Optional metadata — AFS passes through without interpretation */
  meta?: Record<string, unknown>;
}

/** Change listener — injected by AOS, called by AFS */
export type AFSChangeListener = (event: AFSChangeRecord) => void;

/**
 * Access mode for AFS modules and root.
 * - "readonly": Only read operations are allowed (list, read, search)
 * - "create": Only write(mode: "create") is allowed — no overwrite, no delete, no rename, no exec
 * - "append": write(mode: "create") and write(mode: "append") are allowed — no overwrite, no delete, no rename, no exec
 * - "readwrite": All operations are allowed
 */
export type AFSAccessMode = "readonly" | "create" | "append" | "readwrite";

/**
 * Visibility mode for AFS modules.
 * - "full": All content is readable (default)
 * - "meta": read() returns meta only (no content), search() is denied
 */
export type AFSVisibility = "full" | "meta";

/**
 * Action severity classification.
 * - "ambient": Low-risk, reversible (e.g., toggle a light, honk horn)
 * - "boundary": Medium-risk, noticeable effect (e.g., lock doors, start charging)
 * - "critical": High-risk, hard to reverse (e.g., unlock vehicle, remote start)
 *
 * Unknown actions default to "boundary" (safe-by-default).
 */
export type ActionSeverity = "ambient" | "boundary" | "critical";

/**
 * Action policy controls which severity levels are permitted.
 * - "safe": Only ambient actions allowed
 * - "standard": Ambient + boundary actions allowed
 * - "full": All actions allowed (ambient + boundary + critical)
 */
export type ActionPolicy = "safe" | "standard" | "full";

/**
 * A security profile — a named collection of security settings.
 * Providers ship multiple presets; users select + override at mount time.
 */
export interface SecurityProfile {
  /** Which severity levels are permitted */
  actionPolicy: ActionPolicy;

  /** Access mode: readonly | readwrite */
  accessMode?: AFSAccessMode;

  /** Actions explicitly blocked (regardless of severity — always wins) */
  blockedActions?: string[];

  /** Actions explicitly allowed (skips severity check, but NOT blocked check) */
  allowedActions?: string[];

  /** Fields to redact in responses */
  sensitiveFields?: string[];

  /** Sensitivity mode: "full" (no masking) | "redacted" (mask sensitiveFields) */
  sensitivity?: "full" | "redacted";
}

/**
 * User's security configuration for a provider mount.
 */
export interface SecurityConfig {
  /** Base profile name (must exist in provider's securityProfiles) */
  profile: string;

  /** Optional overrides merged on top of the base profile */
  overrides?: Partial<SecurityProfile>;
}

/**
 * Zod schema for access mode validation.
 * Can be reused across modules that support access mode configuration.
 */
export const accessModeSchema = z.enum(["readonly", "readwrite"] as const).optional();

/**
 * Typed execution context injected by AFS and passed through to providers.
 * `afs` is injected automatically by AFS.exec(); callers may set userId/sessionId.
 */
export interface AFSContext {
  /** AFS root instance — injected by AFS.exec() for cross-provider operations */
  afs?: AFSRoot;
  /** Caller's user ID (for rate limiting, audit logging) */
  userId?: string;
  /** Caller's session ID (for audit logging) */
  sessionId?: string;
  /** Request correlation ID */
  requestId?: string;
  /** Per-request structured logger */
  logger?: import("./context-logger.js").AFSLogger;
  /** Extension point — providers may read additional fields */
  [key: string]: unknown;
}

export interface AFSOperationOptions {
  context?: AFSContext;
}

export interface AFSListOptions extends AFSOperationOptions {
  filter?: {
    agentId?: string;
    userId?: string;
    sessionId?: string;
    before?: string;
    after?: string;
  };
  maxDepth?: number;
  /**
   * Number of entries to skip (pagination offset)
   * @default 0
   */
  offset?: number;
  /**
   * Maximum number of entries to return
   * @default 1000
   */
  limit?: number;
  orderBy?: [string, "asc" | "desc"][];
  maxChildren?: number;
  onOverflow?: "truncate";
  /**
   * Whether to disable .gitignore files when listing files.
   * @default false
   */
  disableGitignore?: boolean;
  /**
   * Glob pattern to filter entries by path.
   * Examples: "*.ts", "**\/*.js", "src/**\/*.{ts,tsx}"
   */
  pattern?: string;
}

export interface AFSListResult {
  data: AFSEntry[];
  message?: string;
  /**
   * Total count of entries (optional)
   * - If present: indicates complete dataset size (data may be a subset)
   * - If absent (undefined): data IS the complete result, total === data.length
   */
  total?: number;
}

export interface AFSSearchOptions extends AFSOperationOptions {
  limit?: number;
  caseSensitive?: boolean;
}

export interface AFSSearchResult {
  data: AFSEntry[];
  message?: string;
}

export interface AFSReadOptions extends AFSOperationOptions {
  filter?: AFSListOptions["filter"];
  /** Start line (1-indexed, inclusive). Defaults to 1 when endLine is set. */
  startLine?: number;
  /** End line (1-indexed, inclusive). -1 means end of file. Defaults to -1 when startLine is set. */
  endLine?: number;
  /**
   * Request an alternative representation of the content.
   * Equivalent to using the `.as/{value}` path suffix.
   * Provider must implement supportedAs() to declare supported values.
   */
  as?: string;
}

export interface AFSReadResult {
  data?: AFSEntry;
  message?: string;
}

export interface AFSDeleteOptions extends AFSOperationOptions {
  recursive?: boolean;
}

export interface AFSDeleteResult {
  message?: string;
}

export interface AFSRenameOptions extends AFSOperationOptions {
  overwrite?: boolean;
}

export interface AFSRenameResult {
  message?: string;
}

export interface AFSPatch {
  op: "str_replace" | "insert_before" | "insert_after" | "delete";
  target: string;
  content?: string;
}

export interface AFSWriteOptions extends AFSOperationOptions {
  mode?: "replace" | "append" | "prepend" | "patch" | "create" | "update";
  /**
   * Write to an alternative representation of the content.
   * Equivalent to using the `.as/{value}` path suffix.
   * Provider must implement supportedAs() to declare supported values.
   */
  as?: string;
}

export interface AFSWriteResult {
  data: AFSEntry;
  message?: string;
}

export interface AFSWriteEntryPayload extends Omit<AFSEntry, "id" | "path"> {
  patches?: AFSPatch[];
}

// =============================================================================
// BATCH OPERATION TYPES
// =============================================================================

/** Single entry in a batch write request. */
export interface AFSBatchWriteEntry {
  path: string;
  content?: AFSWriteEntryPayload;
  mode?: AFSWriteOptions["mode"];
  patches?: AFSPatch[];
}

/** Per-entry result in a batch write response. */
export interface AFSBatchWriteEntryResult {
  path: string;
  success: boolean;
  data?: AFSEntry;
  error?: string;
}

/** Batch write result. */
export interface AFSBatchWriteResult {
  results: AFSBatchWriteEntryResult[];
  /** Count of successful writes */
  succeeded: number;
  /** Count of failed writes */
  failed: number;
}

/** Single entry in a batch delete request. */
export interface AFSBatchDeleteEntry {
  path: string;
  recursive?: boolean;
}

/** Per-entry result in a batch delete response. */
export interface AFSBatchDeleteEntryResult {
  path: string;
  success: boolean;
  error?: string;
}

/** Batch delete result. */
export interface AFSBatchDeleteResult {
  results: AFSBatchDeleteEntryResult[];
  succeeded: number;
  failed: number;
}

/** Incremental chunk emitted during exec streaming. */
export interface AFSExecChunk {
  /** Incremental text content */
  text?: string;
  /** Incremental thinking/reasoning content */
  thoughts?: string;
  /** Provider-specific additional data */
  [key: string]: unknown;
}

export interface AFSExecOptions extends AFSOperationOptions {
  /** If provided, provider MAY emit incremental chunks during execution. */
  onChunk?: (chunk: AFSExecChunk) => void;
}

export interface AFSExecResult extends AFSActionResult {}

/**
 * Summary information for an action available on a node.
 * Used in AFSEntry.actions to describe available actions.
 */
export interface ActionSummary {
  /** The action name (e.g., "refresh", "export", "delete") */
  name: string;
  /** Human-readable description of what the action does */
  description?: string;
  /** JSON Schema for input parameters */
  inputSchema?: JSONSchema7;
  /** Action severity level for exec guard policy enforcement */
  severity?: ActionSeverity;
}

/**
 * Token usage breakdown for LLM-based operations.
 */
export interface TokenUsage {
  /** Number of input tokens consumed */
  input: number;
  /** Number of output tokens produced */
  output: number;
  /** Total tokens (may differ from input + output due to internal consumption) */
  total: number;
}

/**
 * Usage metadata returned by exec operations.
 * Enables cost tracking, rate limiting, and observability.
 */
export interface UsageMetadata {
  /** Token usage breakdown (LLM providers) */
  tokens?: TokenUsage;
  /** Monetary cost of the operation */
  cost?: number;
  /** Wall-clock duration in milliseconds */
  durationMs?: number;
  /** Allow provider-specific custom fields */
  [key: string]: unknown;
}

/**
 * Result from executing an action via the Action System.
 * Actions return structured results with success/failure status.
 */
export interface AFSActionResult {
  /** Whether the action completed successfully */
  success: boolean;
  /** Data returned by the action on success */
  data?: Record<string, unknown>;
  /** Error information when success is false */
  error?: {
    /** Error code (e.g., "VALIDATION_ERROR", "NOT_FOUND") */
    code: string;
    /** Human-readable error message */
    message: string;
    /** Additional error details */
    details?: Record<string, unknown>;
  };
  /** Usage metadata (tokens, cost, duration) for exec operations */
  usage?: UsageMetadata;
}

export interface AFSStatOptions extends AFSOperationOptions {}

/**
 * Result from stat operation.
 * The data field follows AFSEntry structure but without content.
 */
export interface AFSStatResult {
  data?: Omit<AFSEntry, "content">;
  message?: string;
}

export interface AFSExplainOptions extends AFSOperationOptions {
  format?: "markdown" | "text";
}

export interface AFSModule {
  readonly name: string;

  readonly description?: string;

  /**
   * The complete source URI for this provider instance (including query params).
   * Set by ProviderRegistry factories after creating the provider.
   * Used by loadProvider injection to persist mount configuration.
   */
  readonly uri?: string;

  /**
   * Access mode for this module.
   * - "readonly": Only read operations are allowed
   * - "readwrite": All operations are allowed
   * Default behavior is implementation-specific.
   */
  readonly accessMode?: AFSAccessMode;

  /**
   * Visibility mode for this module.
   * - "full": All content is readable (default)
   * - "meta": read() returns meta only (no content), search() is denied
   */
  readonly visibility?: AFSVisibility;

  /**
   * Enable automatic agent skill scanning for this module.
   * When set to true, the system will scan this module for agent skills.
   * @default false
   */
  readonly agentSkills?: boolean;

  /**
   * Timeout in milliseconds for provider operations.
   * Currently used for mount check.
   * If not specified, uses the default value (10s).
   * Remote providers (MCP, HTTP) may need longer timeouts.
   */
  readonly timeout?: number;

  /**
   * Action policy controlling which severity levels are permitted for exec.
   * - undefined: No enforcement (backward compatible, all actions allowed)
   * - "safe": Only ambient actions
   * - "standard": Ambient + boundary actions
   * - "full": All actions including critical
   */
  readonly actionPolicy?: ActionPolicy;

  /**
   * Field names to mask when sensitivity is "redacted".
   * Provider-specific: each provider knows its own sensitive data shape.
   */
  readonly sensitiveFields?: string[];

  /**
   * Sensitivity mode for data returned by this module.
   * - "full": Return all fields unmasked
   * - "redacted": Replace sensitiveFields values with "[REDACTED]"
   * @default "redacted"
   */
  readonly sensitivity?: "full" | "redacted";

  /**
   * Risk level from provider security declaration.
   * Used to enforce a severity floor on self-attested action severities.
   * - "system"/"external" → minimum severity "high" (cannot self-declare "ambient")
   * - "local" → minimum severity "medium" (cannot self-declare "ambient")
   * - "sandboxed" → no floor (provider is trusted)
   */
  readonly riskLevel?: "sandboxed" | "external" | "local" | "system";

  /**
   * Actions explicitly blocked regardless of severity or allowedActions.
   * Security invariant: blocked always wins.
   */
  readonly blockedActions?: string[];

  /**
   * Actions explicitly allowed (skip severity check).
   * Does NOT override blockedActions — blocked always wins.
   */
  readonly allowedActions?: string[];

  /** Provider's verifiable credential (self-carried trust, injected at load time) */
  readonly credential?: Record<string, unknown>;

  /** Called after construction for async initialization */
  ready?(): Promise<void>;

  /** Called during shutdown to release resources */
  close?(): Promise<void>;

  /** Inject/clear the event sink (called on mount/unmount) */
  setEventSink?(sink: import("./events.js").AFSEventSink | null): void;

  /** Inject/clear scoped secret access (called on mount) */
  setSecretCapability?(cap: SecretCapability | null): void;

  onMount?(root: AFSRoot, mountPath?: string): void;

  symlinkToPhysical?(path: string): Promise<void>;

  list?(path: string, options?: AFSListOptions): Promise<AFSListResult>;

  read?(path: string, options?: AFSReadOptions): Promise<AFSReadResult>;

  write?(
    path: string,
    content: AFSWriteEntryPayload,
    options?: AFSWriteOptions,
  ): Promise<AFSWriteResult>;

  delete?(path: string, options?: AFSDeleteOptions): Promise<AFSDeleteResult>;

  rename?(oldPath: string, newPath: string, options?: AFSRenameOptions): Promise<AFSRenameResult>;

  search?(path: string, query: string, options?: AFSSearchOptions): Promise<AFSSearchResult>;

  exec?(path: string, args: Record<string, any>, options: AFSExecOptions): Promise<AFSExecResult>;

  stat?(path: string, options?: AFSStatOptions): Promise<AFSStatResult>;

  explain?(path: string, options?: AFSExplainOptions): Promise<AFSExplainResult>;

  /**
   * Declare which alternative representations this provider supports for a given path.
   * Returns an array of supported `as` values (e.g., ["text", "html", "json"]).
   * Used by `.as/` path routing to list available representations.
   */
  supportedAs?(path: string): Promise<string[]>;
}

/**
 * Parameters for loading a module from configuration.
 */
export interface AFSModuleLoadParams {
  /**
   * Base path for resolving relative paths in configuration.
   * Typically the directory containing the configuration file.
   */
  basePath?: string;
  /**
   * Parsed configuration object.
   * The caller is responsible for parsing YAML/JSON/TOML into this object.
   */
  config?: object;
}

/**
 * Mount configuration for a single provider.
 * Used by ProviderRegistry and provider factories at runtime.
 * The validated Zod schema version lives in @aigne/afs-cli (config file validation).
 */
export interface MountConfig {
  /** Mount path */
  path: string;
  /** Provider URI (e.g., fs:///path, git:///repo?branch=main) */
  uri: string;
  /** Namespace for this mount */
  namespace?: string;
  /** Human/LLM readable description */
  description?: string;
  /** Access mode: readonly or readwrite */
  access_mode?: AFSAccessMode;
  /** Authentication string */
  auth?: string;
  /** Authorization token */
  token?: string;
  /** Provider-specific options */
  options?: Record<string, unknown>;
  /**
   * Secret names this provider requires from the vault.
   * Used to create a scoped SecretCapability at mount time.
   */
  secrets?: string[];

  /** Cache configuration override — merges with provider manifest cache declaration */
  cache?: MountCacheConfig;
}

/**
 * Per-mount cache configuration (from config.toml [mounts.cache]).
 * Overrides or extends provider manifest cache declaration.
 */
export interface MountCacheConfig {
  /** Disable caching even if provider manifest declares it */
  disabled?: boolean;
  /** Override TTL seconds */
  ttlSeconds?: number;
  /** Override operations to cache */
  operations?: string[];
}

// =============================================================================
// SECRET CAPABILITY
// =============================================================================

/**
 * Scoped, read-only access to vault secrets.
 * Injected into providers at mount time with a fixed whitelist.
 * Providers cannot list vault contents or read outside the whitelist.
 */
export interface SecretCapability {
  /** Read current value of a whitelisted secret. Throws if denied or missing. */
  get(name: string): Promise<string>;
}

/**
 * Audit entry for secret access.
 */
export interface SecretAuditEntry {
  timestamp: number;
  /** Provider name or mount path */
  caller: string;
  /** Secret name (not value!) */
  secret: string;
  /** mount-time resolution or runtime get */
  operation: "resolve" | "get";
}

/**
 * Provider manifest — self-description of a provider's URI template, schema, and metadata.
 *
 * Declared via `static manifest()` on Provider class.
 * Schema contains ALL provider parameters (path vars + options + sensitive).
 * Parameter source is determined by rules:
 * - Field in uriTemplate {} → extracted from URI body
 * - Field with sensitive: true in schema → credential store
 * - Everything else → config/query params
 */
export interface ProviderManifest {
  /** Registry entry type: provider (has bundle), recipe (MCP config), skill (lightweight) */
  type?: "provider" | "recipe" | "skill";
  /** Provider name */
  name: string;
  /** Human-readable description */
  description: string;
  /** URI template, e.g. "s3://{bucket}/{prefix+?}" */
  uriTemplate: string;
  /** Category (storage, database, cloud, compute, integration, ...) */
  category: string;
  /** Zod schema containing ALL parameters (path vars + options + sensitive) */
  schema: ZodType;
  /** Tags for discovery (legacy — free-form) */
  tags?: string[];
  /** Controlled capability tags from standard vocabulary */
  capabilityTags?: CapabilityTag[];
  /** Use case descriptions */
  useCases?: string[];
  /** Security declaration — what resources this provider accesses and its risk level */
  security?: ProviderSecurityDeclaration;

  /** Capability declaration — what runtime capabilities this provider needs */
  capabilities?: ProviderCapabilityManifest;

  /** Default values for optional URI template variables.
   *  Used for URI normalization: e.g., `aignehub://` → `aignehub://hub.aigne.io`
   *  when uriDefaults is `{ host: "hub.aigne.io" }`. */
  uriDefaults?: Record<string, string>;

  /** Declarative cache configuration — used by auto-wrap at mount time */
  cache?: ProviderCacheDeclaration;
}

// =============================================================================
// PROVIDER CACHE DECLARATION
// =============================================================================

/**
 * Declarative cache configuration in provider manifest.
 * Framework auto-wraps with cached() at mount time when present.
 */
export interface ProviderCacheDeclaration {
  /** Cache strategy: "ttl", "manual", or "time-window" */
  strategy: "ttl" | "manual" | "time-window";
  /** TTL in seconds (for strategy: "ttl") */
  ttlSeconds?: number;
  /** Time window granularity (for strategy: "time-window") */
  granularity?: "day";
  /** Whether to run incremental sync on mount */
  syncOnMount?: boolean;
  /** Periodic refresh interval in seconds (0 = no periodic refresh) */
  refreshInterval?: number;
  /** Which operations to cache (default: ["read", "list", "stat"]) */
  operations?: string[];
}

// =============================================================================
// PROVIDER CAPABILITY MANIFEST
// =============================================================================

/**
 * Declares what runtime capabilities a provider needs.
 * Pure declaration — enforcement is determined by user's IsolationConfig.
 *
 * Providers declare this in their static manifest() method.
 * Users choose enforcement level (none → audit → enforce → sandbox).
 * AFS enforces within the chosen level.
 */
export interface ProviderCapabilityManifest {
  /** Network capabilities */
  network?: {
    /** Provider makes outbound HTTP requests */
    egress?: boolean;
    /** Provider receives inbound connections (e.g., webhook) */
    ingress?: boolean;
    /** Domains provider needs to contact. Empty = any domain (must be explicit) */
    allowedDomains?: string[];
  };

  /** Filesystem capabilities */
  filesystem?: {
    /** Provider reads local files (beyond its own config) */
    read?: boolean;
    /** Provider writes local files */
    write?: boolean;
    /** Paths provider is allowed to access (glob patterns) */
    allowedPaths?: string[];
  };

  /** Cross-provider capabilities */
  crossProvider?: {
    /** Provider needs AFS root reference (onMount injection) */
    afsAccess?: boolean;
    /** Specific mount paths provider needs to read */
    readPaths?: string[];
    /** Specific mount paths provider needs to exec */
    execPaths?: string[];
  };

  /** Process capabilities */
  process?: {
    /** Provider spawns child processes */
    spawn?: boolean;
    /** Allowed executables (for spawn) */
    allowedCommands?: string[];
    /** Provider needs specific env vars */
    requiredEnvVars?: string[];
  };

  /** Credential requirements — feeds into vault/SecretCapability */
  secrets?: string[];
}

// =============================================================================
// ISOLATION CONFIG
// =============================================================================

/**
 * Isolation enforcement level.
 * - "none": No enforcement, everything works as today (default)
 * - "audit": Log capability violations but don't block
 * - "enforce": Block non-declared capabilities at AFS/JS level
 * - "sandbox": QuickJS WASM sandbox (existing sandbox provider pattern)
 * - "docker": Container-level isolation (future, out of scope)
 */
export type IsolationLevel = "none" | "audit" | "enforce" | "sandbox" | "docker";

/**
 * User-selected isolation configuration for capability enforcement.
 * Applied at mount time via AFS constructor or per-mount options.
 */
export interface IsolationConfig {
  /** Default isolation level for all providers */
  defaultLevel?: IsolationLevel;
  /** Per-provider overrides (keyed by provider name or mount path) */
  overrides?: Record<
    string,
    {
      level?: IsolationLevel;
      /** User-granted extra capabilities beyond manifest */
      grantedCapabilities?: Partial<ProviderCapabilityManifest>;
      /** User-denied capabilities (overrides manifest — always wins) */
      deniedCapabilities?: Partial<ProviderCapabilityManifest>;
    }
  >;
}

/**
 * Security declaration for a provider.
 * Tells users what resources the provider accesses before they mount it.
 */
export interface ProviderSecurityDeclaration {
  /** What host resources this provider accesses */
  resourceAccess: ResourceAccess[];

  /**
   * Risk level — how much damage a misconfigured instance can cause.
   * Use the highest applicable level.
   * - sandboxed: no host access, fully isolated (afs-json, afs-sandbox)
   * - external:  only accesses remote/cloud resources (afs-s3, afs-gcs)
   * - local:     reads/writes local filesystem or network (afs-fs, afs-git)
   * - system:    can execute processes or modify system state (afs-mcp, afs-ash)
   */
  riskLevel: "sandboxed" | "external" | "local" | "system";

  /** External runtime dependencies */
  requires?: ExternalDependency[];

  /**
   * What categories of sensitive data this provider handles.
   * Different from sensitiveFields (runtime field masking).
   * This tells users what's at stake before mounting.
   */
  dataSensitivity?: DataSensitivity[];

  /** Human-readable security notes */
  notes?: string[];
}

export type ResourceAccess =
  | "local-filesystem"
  | "local-network"
  | "internet"
  | "cloud-api"
  | "process-spawn"
  | "docker"
  | "system-config";

export type ExternalDependency = "docker" | "git" | "sqlite" | "cloud-credentials";

export type DataSensitivity =
  | "credentials"
  | "personal-data"
  | "system-config"
  | "financial"
  | "media"
  | "code";

// =============================================================================
// PROVIDER TREE SCHEMA
// =============================================================================

/**
 * Declares the path structure and operations of a provider before mount time.
 * Declared via `static treeSchema()` on Provider class.
 * Used by registry for L1 progressive disclosure and by conformance tests.
 */
export interface ProviderTreeSchema {
  /** Top-level operations this provider supports */
  operations: ("list" | "read" | "write" | "delete" | "search" | "exec" | "stat" | "explain")[];
  /** Path pattern → node schema mapping (e.g., "/{table}/{pk}" → TreeNodeSchema) */
  tree: Record<string, TreeNodeSchema>;
  /** Authentication requirements summary */
  auth?: { type: "none" | "token" | "aws" | "gcp" | "oauth" | "custom"; env?: string[] };
  /** What this provider is best suited for (max 3 items, max 20 chars each) */
  bestFor?: string[];
  /** What this provider is NOT suited for (max 3 items, max 20 chars each) */
  notFor?: string[];
}

/** Describes a single node pattern in the provider's tree */
export interface TreeNodeSchema {
  /** Kind identifier (e.g., "database:table", "issue", "file") */
  kind: string;
  /** Operations supported at this path (subset of provider-level operations) */
  operations?: ("list" | "read" | "write" | "delete" | "search" | "exec")[];
  /** Action names available on this node */
  actions?: string[];
  /** Destructive (irreversible) action names */
  destructive?: string[];
}

// =============================================================================
// CONTROLLED VOCABULARY
// =============================================================================

/** Provider categories — controlled, single-select, <15 entries */
export const AFS_CATEGORIES = [
  "storage",
  "database",
  "structured-data",
  "compute",
  "network",
  "vcs",
  "devops",
  "messaging",
  "ai",
  "bridge",
  "composite",
  "iot",
  "security",
  "device",
  "browser",
] as const;

export type AFSCategory = (typeof AFS_CATEGORIES)[number];

/** Capability tags — controlled, multi-select vocabulary */
export const CAPABILITY_TAGS = [
  // Data operations
  "read-write",
  "read-only",
  "crud",
  "search",
  "query",
  "sql",
  "streaming",
  // Auth
  "auth:token",
  "auth:aws",
  "auth:gcp",
  "auth:oauth",
  "auth:none",
  // Features
  "real-time",
  "batch",
  "destructive",
  "idempotent",
  "rate-limited",
  // Access
  "local",
  "remote",
  "cloud",
  "on-premise",
  // Protocol
  "http",
  "websocket",
  "stdio",
  "grpc",
] as const;

export type CapabilityTag = (typeof CAPABILITY_TAGS)[number];

/**
 * Interface for module classes that support schema validation and loading from configuration.
 * This describes the static part of a module class.
 *
 * @example
 * ```typescript
 * class MyModule implements AFSModule {
 *   static schema() { return mySchema; }
 *   static async load(params: AFSModuleLoadParams) { ... }
 *   // ...
 * }
 *
 * // Type check
 * const _check: AFSModuleClass<MyModule, MyModuleOptions> = MyModule;
 * ```
 */
export interface AFSModuleClass<T extends AFSModule = AFSModule, O extends object = object> {
  /**
   * Returns the Zod schema for validating module configuration.
   * @deprecated Use `manifest()` instead — the manifest includes the schema
   * along with URI template, category, and tags for unified provider loading.
   */
  schema(): ZodType<O>;

  /**
   * Returns provider manifest(s) describing URI template, schema, and metadata.
   * Single manifest for most providers; array for multi-scheme providers (e.g., MCP).
   */
  manifest?(): ProviderManifest | ProviderManifest[];

  /** Loads a module instance from configuration file path and parsed config */
  load(params: AFSModuleLoadParams): Promise<T>;

  /**
   * Optional: Custom authentication flow for this provider.
   * When present, called instead of the default schema-based collection.
   * The context provides resolved fields and primitives (collect, createCallbackServer, requestOpenURL).
   *
   * @returns all collected fields (both sensitive and non-sensitive), or null if user declined
   */
  auth?(context: AuthContext): Promise<Record<string, unknown> | null>;

  /** Constructor */
  new (options: O): T;
}

export interface AFSRoot extends AFSModule {
  list(path: string, options?: AFSListOptions): Promise<AFSListResult>;

  search(path: string, query: string, options?: AFSSearchOptions): Promise<AFSSearchResult>;

  /** Subscribe to provider events. Optional — may be absent in test mocks. */
  subscribe?(filter: AFSEventFilter, callback: AFSEventCallback): AFSUnsubscribe;

  initializePhysicalPath(): Promise<string>;

  cleanupPhysicalPath(): Promise<void>;
}

export interface AFSEntryMetadata extends Record<string, any> {
  /** Kind identifier (e.g., "afs:node", "chamber:project") */
  kind?: string;
  /**
   * Kind inheritance chain, from most specific to most general.
   * First element should match the `kind` field.
   *
   * Example: MCP tool has `kinds: ["mcp:tool", "afs:executable", "afs:node"]`
   * Use for capability detection: `kinds.includes("afs:executable")`
   *
   * @example
   * ```typescript
   * // Check if node is executable
   * const isExecutable = metadata.kinds?.includes("afs:executable") ?? false;
   * ```
   */
  kinds?: string[];
  /**
   * Number of children this node has.
   * - undefined: leaf node / file (no children possible)
   * - 0: directory with no children (empty container)
   * - N (N > 0): directory with exactly N children
   * - -1: directory with children, but count unknown (lazy loading)
   *
   * Note: This is a runtime value computed by Provider. There is no file/directory
   * distinction in AFS — all nodes can potentially have children.
   *
   * Design: undefined defaults to "leaf" for safety — if a developer forgets
   * to set childrenCount, the node is treated as a leaf (safe failure).
   * Directory nodes whose children count is not yet known should use -1.
   */
  childrenCount?: number;
  /** File size in bytes (for content nodes) */
  size?: number;
  /** Human-readable description */
  description?: string;
  /** Event types this provider can emit (declared in .meta) */
  events?: AFSEventDeclaration[];
  // User-defined meta fields from .afs/meta.yaml are spread directly into this object
}

export interface AFSEntry<T = any> {
  id: string;
  createdAt?: Date;
  updatedAt?: Date;
  path: string;
  agentId?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  summary?: string | null;
  meta?: AFSEntryMetadata | null;
  linkTo?: string | null;
  content?: T;
  /**
   * Available actions for this entry.
   * Actions can be executed via the `/.actions/<action-name>` path.
   * Each action uses `afs:executable` kind.
   */
  actions?: ActionSummary[];
}

/**
 * Zod schema for ActionSummary validation.
 */
export const actionSummarySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.any()).optional(),
  severity: z.enum(["ambient", "boundary", "critical"]).optional(),
});

export const afsEntrySchema: ZodType<AFSEntry> = z.object({
  id: z.string(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  path: z.string(),
  userId: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  meta: z.record(z.string(), z.any()).nullable().optional(),
  linkTo: z.string().nullable().optional(),
  content: z.any().optional(),
  actions: z.array(actionSummarySchema).optional(),
});

// Re-export meta types for backward compatibility
export type {
  AFSExplainResult,
  JSONSchema7,
  KindSchema,
  MetaPathInfo,
  NodeConstraint,
  NodesConstraints,
  ValidationError,
  ValidationResult,
} from "./meta/type.js";
