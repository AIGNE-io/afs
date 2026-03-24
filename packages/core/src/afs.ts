import { v7 } from "@aigne/uuid";
import { joinURL } from "ufo";
import { enrichData as enrichDataImpl } from "./afs-enrichment.js";
import {
  buildExplainFromStat as buildExplainFromStatImpl,
  buildVirtualDirExplain as buildVirtualDirExplainImpl,
  explainRootAction as explainRootActionImpl,
  explainRoot as explainRootImpl,
  explainRootMeta as explainRootMetaImpl,
} from "./afs-explain.js";
import {
  buildRootActions,
  execRootAction as execRootActionImpl,
  readRootAction as readRootActionImpl,
  readRootActions as readRootActionsImpl,
  readRootMeta as readRootMetaImpl,
  statRootAction as statRootActionImpl,
  statRootMeta as statRootMetaImpl,
} from "./afs-root-handlers.js";
import { createBlockletAFS } from "./blocklet/blocklet-afs.js";
import { parseBlockletManifest } from "./blocklet/parse-manifest.js";
import type { BlockletManifest } from "./blocklet/types.js";
import type {
  ActionCatalog,
  AggregatedCapabilities,
  CapabilitiesManifest,
  OperationsDeclaration,
  ToolDefinition,
} from "./capabilities/types.js";
import {
  type CapabilityEnforcer,
  type CapabilityEventHandler,
  createScopedAFSProxy,
} from "./capability-enforcer.js";
import {
  AFSAccessModeError,
  AFSError,
  AFSMountError,
  AFSNotFoundError,
  AFSReadonlyError,
  AFSSeverityError,
  AFSValidationError,
} from "./error.js";
import {
  type AFSEventCallback,
  type AFSEventFilter,
  type AFSUnsubscribe,
  createEventSink,
  EventBus,
} from "./events.js";
import { isCanonicalPath, parseCanonicalPath, validateModuleName, validatePath } from "./path.js";
import { getPlatform } from "./platform/global.js";
import { RegistryStore } from "./registry-store.js";
import { createSecretCapability, type SecretAuditSink } from "./secret-capability.js";
import { checkTrustGate, type TrustConfig, type TrustLevel } from "./trust-gate.js";
import type {
  ActionPolicy,
  ActionSeverity,
  ActionSummary,
  AFSBatchDeleteEntry,
  AFSBatchDeleteResult,
  AFSBatchWriteEntry,
  AFSBatchWriteResult,
  AFSDeleteOptions,
  AFSDeleteResult,
  AFSEntry,
  AFSExecOptions,
  AFSExecResult,
  AFSExplainOptions,
  AFSExplainResult,
  AFSListOptions,
  AFSListResult,
  AFSModule,
  AFSOperationOptions,
  AFSReadOptions,
  AFSReadResult,
  AFSRenameOptions,
  AFSRenameResult,
  AFSRoot,
  AFSSearchOptions,
  AFSSearchResult,
  AFSStatOptions,
  AFSStatResult,
  AFSWriteEntryPayload,
  AFSWriteOptions,
  AFSWriteResult,
  IsolationConfig,
  ProviderCapabilityManifest,
} from "./type.js";

/**
 * Parse a `.as/` segment from a path.
 *
 * Examples:
 * - "/doc.md/.as/"    → { basePath: "/doc.md", asValue: null }
 * - "/doc.md/.as"     → { basePath: "/doc.md", asValue: null }
 * - "/doc.md/.as/text" → { basePath: "/doc.md", asValue: "text" }
 */
function parseAsPath(path: string): { basePath: string; asValue: string | null } | null {
  const asIndex = path.indexOf("/.as/");
  if (asIndex === -1) {
    if (path.endsWith("/.as")) {
      return { basePath: path.slice(0, -4) || "/", asValue: null };
    }
    return null;
  }

  const basePath = path.slice(0, asIndex) || "/";
  const afterAs = path.slice(asIndex + 5); // skip "/.as/"

  if (!afterAs || afterAs === "/") {
    return { basePath, asValue: null };
  }

  if (afterAs.includes("..")) {
    throw new AFSValidationError("Path traversal in .as/ path is not allowed");
  }

  const slashIndex = afterAs.indexOf("/");
  const asValue = slashIndex === -1 ? afterAs : afterAs.slice(0, slashIndex);
  return { basePath, asValue };
}

const DEFAULT_MAX_DEPTH = 1;

const MODULES_ROOT_DIR = "/modules";

/**
 * Default timeout for mount check operations (10 seconds)
 */
const DEFAULT_MOUNT_TIMEOUT = 10000;

/**
 * Execute a promise with a timeout.
 * Throws an error if the promise does not resolve within the timeout.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * Get the timeout value for a provider.
 * Returns provider.timeout if set, otherwise DEFAULT_MOUNT_TIMEOUT.
 */
function getTimeout(provider: AFSModule): number {
  return provider.timeout ?? DEFAULT_MOUNT_TIMEOUT;
}

/**
 * Get error message from an error, handling timeout specially.
 */
function getMountErrorMessage(err: unknown, timeout: number): string {
  if (err instanceof Error) {
    if (err.message.includes("Timeout")) {
      return `Timeout after ${timeout}ms`;
    }
    return err.message;
  }
  return String(err);
}

/**
 * Characters forbidden in namespace names (security-sensitive)
 */
const NAMESPACE_FORBIDDEN_CHARS = [
  "/", // Path separator
  "\\", // Windows path separator
  ":", // Namespace separator (only one allowed)
  ";", // Shell metachar
  "|", // Shell pipe
  "&", // Shell background
  "`", // Shell command substitution
  "$", // Shell variable
  "(", // Shell subshell
  ")", // Shell subshell
  ">", // Shell redirect
  "<", // Shell redirect
  "\n", // Newline
  "\r", // Carriage return
  "\t", // Tab
  "\x00", // NUL
];

/**
 * Validate a namespace name for mount operations
 * @throws Error if namespace is invalid
 */
function validateNamespaceName(namespace: string): void {
  if (namespace.trim() === "") {
    throw new Error("Namespace cannot be empty or whitespace-only");
  }

  for (const char of NAMESPACE_FORBIDDEN_CHARS) {
    if (namespace.includes(char)) {
      throw new Error(`Namespace contains forbidden character: '${char}'`);
    }
  }
}

/** Mount health status */
export type MountStatus = "checking" | "ready" | "error";

/**
 * Information about a mounted module
 */
export interface MountInfo {
  /** The namespace (null for default namespace) */
  namespace: string | null;
  /** The mount path within the namespace */
  path: string;
  /** The mounted module */
  module: AFSModule;
  /** Health check status */
  status: MountStatus;
  /** Error from the async health check (only set when status is "error") */
  error?: AFSMountError;
}

/**
 * Options for mounting a module
 */
export interface MountOptions {
  /** Namespace to mount into (null/undefined for default namespace) */
  namespace?: string | null;
  /** Replace existing mount at the same path */
  replace?: boolean;
  /** When true, mount-check failures are silently skipped instead of throwing */
  lenient?: boolean;
  /** Per-mount trust level override. Takes precedence over config.toml defaults and overrides. */
  trust?: TrustLevel;
}

/**
 * Internal mount entry with composite key
 */
interface MountEntry {
  namespace: string | null;
  path: string;
  module: AFSModule;
  /** Provider's declared capabilities (resolved from static manifest at mount time) */
  capabilities?: ProviderCapabilityManifest;
  /** Per-provider capability enforcer (created when isolation > none) */
  enforcer?: CapabilityEnforcer;
  /** Health check status (async check result) */
  status: MountStatus;
  /** Promise for the async health check — await via afs.check(path) */
  checkPromise?: Promise<void>;
  /** Error from the async health check */
  error?: AFSMountError;
}

export interface AFSOptions {
  modules?: AFSModule[];
  onChange?: import("./type.js").AFSChangeListener;
  /** Isolation configuration for capability enforcement */
  isolationConfig?: IsolationConfig;
  /** Trust configuration for mount-time VC verification */
  trust?: {
    config?: TrustConfig;
    issuers?: string[];
  };
  /** Callback for capability audit/violation events */
  onCapabilityEvent?: CapabilityEventHandler;
  /** Resolve the filesystem data directory for a program. Injected by CLI layer. */
  resolveDataDir?: (programPath: string) => string;
  /** Create a data provider from a filesystem directory path. Injected by CLI layer. */
  createDataProvider?: (dataDir: string) => AFSModule | Promise<AFSModule>;
  /**
   * Read user-side mount overrides (from mounts.toml) for a program.
   * Injected by CLI layer. Used by execProgram to apply configured URIs
   * (e.g., `telegram://evan` instead of `telegram://`) before creating providers.
   */
  readMountOverrides?: (
    programPath: string,
  ) => Promise<import("./blocklet/blocklet-afs.js").MountOverride[]>;
  /**
   * Write resolved mount overrides (to mounts.toml) for a program.
   * Injected by CLI layer. Called after createBlockletAFS when URIs were
   * resolved (normalized, template vars filled) so they persist for future runs.
   */
  writeMountOverrides?: (
    programPath: string,
    overrides: import("./blocklet/blocklet-afs.js").MountOverride[],
  ) => Promise<void>;
}

export class AFS implements AFSRoot {
  name: string = "AFSRoot";

  /**
   * Injectable method for loading and mounting a provider from a URI.
   * Injected by CLI layer (afs-loader.ts) with full pipeline:
   *   1. ProviderRegistry.createProvider({ uri, path, ...options }) → provider instance
   *   2. afs.mount(provider, path)
   *
   * Used by root-level /.actions/mount action and registry mount action.
   */
  loadProvider?: (uri: string, path: string, options?: Record<string, unknown>) => Promise<void>;

  /**
   * Injectable callback for removing a provider's config on unmount.
   * Injected by CLI layer (afs-loader.ts) for persistence sync.
   */
  unloadProvider?: (path: string, options?: Record<string, unknown>) => Promise<void>;

  /**
   * Injectable callback for updating a provider's options in the config file.
   * Injected by CLI layer (afs-loader.ts) for persistence sync.
   * Used by providers to persist runtime config changes (e.g., default model selection).
   */
  updateProviderConfig?: (
    mountPath: string,
    optionUpdates: Record<string, unknown>,
  ) => Promise<void>;

  /**
   * Injectable factory for creating providers from mount configs.
   * Injected by CLI layer. Handles credential resolution + registry creation.
   * Used by createBlockletAFS as fallback when shared mount URI isn't in host AFS.
   */
  createProviderFromMount?: (mount: import("./type.js").MountConfig) => Promise<AFSModule>;

  constructor(public options: AFSOptions = {}) {
    if (options.trust?.config) this.trustConfig = options.trust.config;
    if (options.trust?.issuers) this.trustedIssuers = options.trust.issuers;

    for (const module of options?.modules ?? []) {
      // Legacy: mount with module name as path
      this.mount(module, joinURL(MODULES_ROOT_DIR, module.name));
    }
  }

  /**
   * Internal storage: Map<compositeKey, MountEntry>
   * compositeKey = `${namespace ?? ""}:${path}`
   */
  private mounts = new Map<string, MountEntry>();

  /** Event bus for provider-emitted events */
  private eventBus = new EventBus();

  /** Unsubscribe function for parent event forwarding */
  private parentEventUnsub: (() => void) | null = null;

  /** Cached knowledge index — invalidated on mount/unmount */
  private knowledgeCache: string | null = null;

  /** In-memory registry store for /registry/ virtual path */
  readonly registryStore = new RegistryStore();

  /** Trust configuration for mount-time VC verification */
  private trustConfig?: TrustConfig;

  /** Trusted issuer DIDs for VC verification */
  private trustedIssuers?: string[];

  /**
   * Called by parent AFS when this AFS instance is mounted as a module.
   * Enables event bubbling: internal provider events are forwarded to the parent.
   */
  setEventSink(sink: import("./events.js").AFSEventSink | null): void {
    // Tear down previous forwarding
    this.parentEventUnsub?.();
    this.parentEventUnsub = null;

    if (sink) {
      // Forward all internal events to the parent event sink
      this.parentEventUnsub = this.eventBus.subscribe({}, (event) => {
        sink({ type: event.type, path: event.path, data: event.data });
      });
    }
  }

  /**
   * Subscribe to provider events.
   * Returns an unsubscribe function.
   */
  subscribe(filter: AFSEventFilter, callback: AFSEventCallback): AFSUnsubscribe {
    return this.eventBus.subscribe(filter, callback);
  }

  // =========================================================================
  // Trust configuration
  // =========================================================================

  /** Set trust configuration for mount-time VC verification. */
  setTrustConfig(config: TrustConfig): void {
    this.trustConfig = config;
  }

  /** Set trusted issuer DIDs for VC verification. */
  setTrustedIssuers(issuers: string[]): void {
    this.trustedIssuers = issuers;
  }

  // =========================================================================
  // Isolation helpers
  // =========================================================================

  /**
   * Resolve the isolation level for a provider at a given mount path.
   * Priority: mount-path override > provider-name override > default level.
   */
  private getIsolationLevel(
    mountPath: string,
    providerName: string,
  ): import("./type.js").IsolationLevel {
    const config = this.options.isolationConfig;
    if (!config) return "none";

    // Mount-path override has highest priority
    const pathOverride = config.overrides?.[mountPath];
    if (pathOverride?.level) return pathOverride.level;

    // Provider-name override
    const nameOverride = config.overrides?.[providerName];
    if (nameOverride?.level) return nameOverride.level;

    return config.defaultLevel ?? "none";
  }

  /**
   * Resolve the per-provider isolation overrides (granted/denied capabilities).
   * Priority: mount-path override > provider-name override.
   */
  private getIsolationOverrides(mountPath: string, providerName: string) {
    const config = this.options.isolationConfig;
    if (!config?.overrides) return undefined;

    // Mount-path override has highest priority
    const pathOverride = config.overrides[mountPath];
    if (pathOverride) return pathOverride;

    // Provider-name override
    return config.overrides[providerName];
  }

  /**
   * Resolve capabilities from a provider's static manifest() method.
   * Returns empty object if no manifest or capabilities declared.
   */
  private resolveCapabilities(module: AFSModule): ProviderCapabilityManifest {
    try {
      type ManifestLike = { capabilities?: ProviderCapabilityManifest };
      const ctor = module.constructor as { manifest?: () => ManifestLike | ManifestLike[] };
      if (typeof ctor?.manifest !== "function") return {};

      const result = ctor.manifest();
      if (!result) return {};

      // manifest() can return a single manifest or an array
      if (Array.isArray(result)) {
        // Use first manifest with capabilities
        for (const m of result) {
          if (m.capabilities) return m.capabilities;
        }
        return {};
      }

      return result.capabilities ?? {};
    } catch {
      return {};
    }
  }

  /**
   * Create a CapabilityEnforcer for a provider if isolation is active.
   * Returns undefined if isolation level is "none".
   */
  private async createEnforcerForMount(
    mountPath: string,
    providerName: string,
  ): Promise<CapabilityEnforcer | undefined> {
    const level = this.getIsolationLevel(mountPath, providerName);
    if (level === "none") return undefined;

    const overrides = this.getIsolationOverrides(mountPath, providerName);

    // Lazy import to avoid circular dependency when isolation is not used
    const { CapabilityEnforcer: EnforcerClass } = await import("./capability-enforcer.js");

    return new EnforcerClass({
      level,
      onEvent: this.options.onCapabilityEvent,
      grantedCapabilities: overrides?.grantedCapabilities,
      deniedCapabilities: overrides?.deniedCapabilities,
    });
  }

  /**
   * Legacy compatibility: Map<path, AFSModule> for modules mounted via old API
   * This is used internally by findModules for backward compatibility
   */
  private get modules(): Map<string, AFSModule> {
    const map = new Map<string, AFSModule>();
    for (const entry of this.mounts.values()) {
      if (entry.namespace === null) {
        map.set(entry.path, entry.module);
      }
    }
    return map;
  }

  /**
   * Create composite key for mount storage
   */
  private makeKey(namespace: string | null, path: string): string {
    return `${namespace ?? ""}:${path}`;
  }

  /**
   * Check if write operations are allowed for the given module.
   * Throws AFSReadonlyError if not allowed.
   */
  /** Fire-and-forget change notification — also bridges to EventBus */
  private notifyChange(record: import("./type.js").AFSChangeRecord): void {
    // Invalidate knowledge cache on mount topology changes
    if (record.kind === "mount" || record.kind === "unmount") {
      this.knowledgeCache = null;
    }

    try {
      this.options.onChange?.(record);
    } catch {
      // INV-CE-2: listener failure MUST NOT affect AFS operation
    }

    // Bridge: dispatch as AFSEvent so subscribe() consumers receive it too
    this.eventBus.dispatch({
      type: `afs:${record.kind}`,
      path: record.path,
      source: record.moduleName ?? "",
      timestamp: record.timestamp,
      data: record.meta,
    });
  }

  private checkWritePermission(
    module: AFSModule,
    operation: string,
    path: string,
    writeMode?: string,
  ): void {
    const accessMode = module.accessMode;

    // Backward compatible: undefined or "readonly" → deny all writes
    if (!accessMode || accessMode === "readonly") {
      throw new AFSReadonlyError(
        `Module '${module.name}' is readonly, cannot perform ${operation} to ${path}`,
      );
    }

    // readwrite → allow everything
    if (accessMode === "readwrite") return;

    // For non-write operations (delete, rename, exec): only readwrite allows these
    if (operation !== "write") {
      throw new AFSAccessModeError(accessMode, operation);
    }

    // For write operations: check write mode against access mode
    const mode = writeMode ?? "replace";

    if (accessMode === "create") {
      if (mode !== "create") {
        throw new AFSAccessModeError("create", mode);
      }
    } else if (accessMode === "append") {
      if (mode !== "create" && mode !== "append") {
        throw new AFSAccessModeError("append", mode);
      }
    }
  }

  /**
   * Check if a .aup/ sub-path overlay mount is allowed.
   *
   * Allows mounting at `/.aup/{name}` sub-paths of an existing mount
   * (supplementary providers), with the restriction that `.aup/default`
   * cannot be overridden if the parent provider already owns that path.
   *
   * @param newPath - The normalized path of the new mount
   * @param existingPath - The path of the existing (parent) mount
   * @returns true if the overlay mount should be allowed (sync check only)
   */
  private isAupOverlayPath(newPath: string, existingPath: string): boolean {
    // The sub-path relative to the parent mount
    const relativePath = newPath.slice(existingPath.length);

    // Must contain /.aup/{name} — allowed at any depth within the parent mount
    // e.g. /.aup/default, /transactions/.aup/default, /deep/path/.aup/view
    return /(?:\/[^/]+)*\/\.aup\/[^/]+\/?$/.test(relativePath);
  }

  /**
   * Extract the .aup/ view name from a mount path relative to its parent.
   * Returns null if the path is not a valid .aup/ overlay path.
   */
  private getAupViewName(newPath: string, existingPath: string): string | null {
    const relativePath = newPath.slice(existingPath.length);
    const match = relativePath.match(/\/\.aup\/([^/]+)\/?$/);
    return match ? match[1]! : null;
  }

  /**
   * Check if .aup/default is already owned by a parent provider.
   * Uses the provider's read method to probe for /.aup/default.
   */
  private async parentOwnsAupDefault(module: AFSModule): Promise<boolean> {
    if (!module.read) return false;
    try {
      const result = await module.read("/.aup/default");
      return !!result?.data;
    } catch {
      return false;
    }
  }

  /**
   * Policy matrix for action severity enforcement.
   * Maps policy → set of allowed severity levels.
   */
  private static readonly POLICY_ALLOWED: Record<ActionPolicy, Set<ActionSeverity>> = {
    safe: new Set(["ambient"]),
    standard: new Set(["ambient", "boundary"]),
    full: new Set(["ambient", "boundary", "critical"]),
  };

  /**
   * Severity ordering for floor enforcement.
   */
  private static readonly SEVERITY_ORDER: Record<ActionSeverity, number> = {
    ambient: 0,
    boundary: 1,
    critical: 2,
  };

  /**
   * Severity floor by risk level.
   * Prevents self-attested bypass: a remote provider cannot declare its actions as "ambient".
   */
  private static readonly RISK_SEVERITY_FLOOR: Record<string, ActionSeverity> = {
    system: "boundary",
    external: "boundary",
    local: "boundary",
    sandboxed: "ambient", // no floor
  };

  /**
   * Apply severity floor based on provider risk level.
   * Returns the higher of the two severities.
   */
  static applySeverityFloor(
    severity: ActionSeverity,
    riskLevel?: "sandboxed" | "external" | "local" | "system",
  ): ActionSeverity {
    if (!riskLevel) return severity;
    const floor = AFS.RISK_SEVERITY_FLOOR[riskLevel] ?? "ambient";
    const severityOrder = AFS.SEVERITY_ORDER[severity] ?? 0;
    const floorOrder = AFS.SEVERITY_ORDER[floor] ?? 0;
    return severityOrder >= floorOrder ? severity : floor;
  }

  /**
   * Recursively mask sensitive fields in an AFSEntry.
   * Replaces values of matching field names with "[REDACTED]" in content and meta.
   */
  private static maskSensitiveFields(entry: AFSEntry, fields: string[]): AFSEntry {
    const fieldSet = new Set(fields);
    const mask = (obj: unknown): unknown => {
      if (obj === null || obj === undefined || typeof obj !== "object") return obj;
      if (Array.isArray(obj)) return obj.map(mask);
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (fieldSet.has(key) && value !== undefined && value !== null) {
          result[key] = "[REDACTED]";
        } else if (typeof value === "object" && value !== null) {
          result[key] = mask(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    };

    return {
      ...entry,
      content: mask(entry.content),
      meta: entry.meta ? (mask(entry.meta) as AFSEntry["meta"]) : entry.meta,
    };
  }

  /**
   * Check if an action's severity is permitted under the module's action policy.
   * Throws AFSSeverityError if the action is blocked.
   *
   * @param module - The module being executed against
   * @param subpath - The subpath within the module (e.g., "/.actions/unlock")
   */
  private async checkActionPolicy(module: AFSModule, subpath: string): Promise<void> {
    const policy = module.actionPolicy;

    // Extract action name from subpath (e.g., "/.actions/unlock" or "/vehicles/VIN/.actions/unlock")
    const actionMatch = subpath.match(/\.actions\/([^/]+)$/);
    if (!actionMatch) return; // Not an action path, skip

    const actionName = actionMatch[1]!;

    // Security invariant: blockedActions always wins, even over allowedActions
    if (module.blockedActions?.includes(actionName)) {
      throw new AFSSeverityError(actionName, "blocked-by-policy", "blocked");
    }

    // allowedActions: explicitly allowed, skip severity check
    if (module.allowedActions?.includes(actionName)) {
      return;
    }

    // No policy set → no enforcement (backward compatible)
    if (!policy) return;

    // Full policy allows everything — skip the lookup
    if (policy === "full") return;

    // Look up severity from the action's metadata via read()
    let severity: ActionSeverity = "boundary"; // safe-by-default: unknown = boundary

    if (module.read) {
      try {
        const result = await module.read(subpath);
        const metaSeverity = result?.data?.meta?.severity as string | undefined;
        if (
          metaSeverity === "ambient" ||
          metaSeverity === "boundary" ||
          metaSeverity === "critical"
        ) {
          severity = metaSeverity;
        }
      } catch {
        // read failed, use default severity (boundary)
      }
    }

    // Apply severity floor from provider riskLevel (prevents self-attested bypass)
    // A remote/system provider cannot self-declare its actions as "ambient"
    severity = AFS.applySeverityFloor(severity, module.riskLevel);

    const allowed = AFS.POLICY_ALLOWED[policy];
    if (!allowed.has(severity)) {
      throw new AFSSeverityError(actionName, severity, policy);
    }
  }

  /**
   * Check provider availability on mount.
   * Validates that the provider can successfully respond to stat/read
   * and list (if childrenCount indicates children exist).
   *
   * @throws AFSMountError if validation fails
   */
  private async checkProviderOnMount(provider: AFSModule): Promise<void> {
    const timeout = getTimeout(provider);
    const name = provider.name;

    // Step 1: Try stat or read
    let rootData: { path: string; meta?: Record<string, unknown> | null } | undefined;

    if (provider.stat) {
      try {
        const result = await withTimeout(provider.stat("/"), timeout);
        rootData = result.data;
      } catch (err) {
        throw new AFSMountError(name, "stat", getMountErrorMessage(err, timeout));
      }
    } else if (provider.read) {
      try {
        const result = await withTimeout(provider.read("/"), timeout);
        if (result.data) {
          rootData = {
            path: result.data.path,
            meta: result.data.meta ?? undefined,
          };
        }
      } catch (err) {
        throw new AFSMountError(name, "read", getMountErrorMessage(err, timeout));
      }
    } else {
      throw new AFSMountError(name, "read", "Provider has no stat or read method");
    }

    // Step 2: Validate data is not undefined
    if (!rootData) {
      const step = provider.stat ? "stat" : "read";
      throw new AFSMountError(name, step, "Root path returned undefined data");
    }

    // Step 3: If childrenCount indicates children, validate list
    const childrenCount = rootData.meta?.childrenCount as number | undefined;
    const needsListCheck =
      childrenCount === -1 || (typeof childrenCount === "number" && childrenCount > 0);

    if (needsListCheck) {
      if (!provider.list) {
        throw new AFSMountError(name, "list", "Provider has childrenCount but no list method");
      }

      try {
        const listResult = await withTimeout(provider.list("/"), timeout);
        if (!listResult.data || listResult.data.length === 0) {
          throw new AFSMountError(
            name,
            "list",
            "childrenCount indicates children but list returned empty",
          );
        }
      } catch (err) {
        if (err instanceof AFSMountError) throw err;
        throw new AFSMountError(name, "list", getMountErrorMessage(err, timeout));
      }
    }
  }

  /**
   * Mount a module at a path in a namespace
   *
   * @param module - The module to mount
   * @param path - The path to mount at (optional, defaults to /modules/{module.name} for backward compatibility)
   * @param options - Mount options (namespace, replace)
   */
  async mount(module: AFSModule, path?: string, options?: MountOptions): Promise<this> {
    // Validate module name
    validateModuleName(module.name);

    // If path not provided, use legacy path pattern for backward compatibility
    const mountPath = path ?? joinURL(MODULES_ROOT_DIR, module.name);

    // Validate and normalize path
    const normalizedPath = validatePath(mountPath);

    // Check for reserved paths
    const RESERVED_PREFIXES = ["/registry", "/.actions", "/.meta", "/.as"];
    for (const reserved of RESERVED_PREFIXES) {
      if (normalizedPath === reserved || normalizedPath.startsWith(`${reserved}/`)) {
        throw new AFSValidationError(
          `Cannot mount at reserved path '${normalizedPath}' — '${reserved}' is a core virtual path`,
        );
      }
    }

    // Determine namespace (null for default, or explicit string)
    const namespace = options?.namespace === undefined ? null : options.namespace;

    // Validate namespace if provided
    if (namespace !== null) {
      if (namespace === "") {
        throw new Error("Namespace cannot be empty or whitespace-only");
      }
      validateNamespaceName(namespace);
    }

    const key = this.makeKey(namespace, normalizedPath);

    // Check for exact path conflict
    if (this.mounts.has(key)) {
      if (options?.replace) {
        // Replace existing mount
        this.mounts.delete(key);
      } else {
        throw new Error(
          `Mount conflict: path '${normalizedPath}' already mounted in namespace '${namespace ?? "default"}'`,
        );
      }
    }

    // Check for parent-child path conflicts within the same namespace
    for (const entry of this.mounts.values()) {
      if (entry.namespace !== namespace) continue;

      const existingPath = entry.path;

      // Root "/" conflicts with everything
      if (normalizedPath === "/" || existingPath === "/") {
        throw new Error(
          `Mount conflict: path '${normalizedPath}' conflicts with existing mount '${existingPath}' in namespace '${namespace ?? "default"}'`,
        );
      }

      // Check if new path is parent of existing (or same)
      if (
        existingPath.startsWith(normalizedPath) &&
        (existingPath === normalizedPath ||
          existingPath.length === normalizedPath.length ||
          existingPath[normalizedPath.length] === "/")
      ) {
        throw new Error(
          `Mount conflict: path '${normalizedPath}' conflicts with existing mount '${existingPath}' in namespace '${namespace ?? "default"}'`,
        );
      }

      // Check if existing path is parent of new (or same)
      if (
        normalizedPath.startsWith(existingPath) &&
        (normalizedPath === existingPath ||
          normalizedPath.length === existingPath.length ||
          normalizedPath[existingPath.length] === "/")
      ) {
        // Exception: allow .aup/ sub-path overlay mounts (supplementary providers).
        // The new path must match /.aup/{name} pattern relative to the parent mount.
        // Block mounting at .aup/default if the parent provider already owns that path.
        if (this.isAupOverlayPath(normalizedPath, existingPath)) {
          const viewName = this.getAupViewName(normalizedPath, existingPath);
          if (viewName === "default") {
            const parentOwns = await this.parentOwnsAupDefault(entry.module);
            if (parentOwns) {
              throw new Error(
                `Mount conflict: cannot mount at '${normalizedPath}' — parent provider already owns .aup/default`,
              );
            }
          }
          continue;
        }

        throw new Error(
          `Mount conflict: path '${normalizedPath}' conflicts with existing mount '${existingPath}' in namespace '${namespace ?? "default"}'`,
        );
      }
    }

    // Resolve capabilities and create enforcer if isolation is active
    const capabilities = this.resolveCapabilities(module);
    const enforcer = await this.createEnforcerForMount(normalizedPath, module.name);

    // Store mount immediately — async health check runs in background
    const entry: MountEntry = {
      namespace,
      path: normalizedPath,
      module,
      capabilities,
      enforcer,
      status: "checking",
    };
    this.mounts.set(key, entry);

    // Fire-and-forget async health check + trust gate
    entry.checkPromise = this.runAsyncMountCheck(entry, module, options ?? {});

    // Inject event sink for providers that support it
    module.setEventSink?.(createEventSink(this.eventBus, module.name, normalizedPath));

    // onMount: inject scoped proxy when isolation is active
    if (enforcer) {
      const proxy = createScopedAFSProxy(this, capabilities, enforcer, module.name);
      module.onMount?.(proxy, normalizedPath);
    } else {
      module.onMount?.(this, normalizedPath);
    }

    // Inject SecretCapability if provider declares secrets and vault is available
    this.injectSecretCapability(module, capabilities);

    this.notifyChange({
      kind: "mount",
      path: normalizedPath,
      moduleName: module.name,
      namespace,
      timestamp: Date.now(),
    });
    return this;
  }

  /**
   * Run async health check + trust gate for a mount entry.
   * Updates entry.status and entry.error; emits mountError on failure.
   * Never throws — errors are captured in the entry.
   */
  private async runAsyncMountCheck(
    entry: MountEntry,
    module: AFSModule,
    options: MountOptions,
  ): Promise<void> {
    try {
      await this.checkProviderOnMount(module);
    } catch (err) {
      if (err instanceof AFSMountError) {
        entry.status = "error";
        entry.error = err;
        this.notifyChange({
          kind: "mountError",
          path: entry.path,
          moduleName: module.name,
          namespace: entry.namespace,
          timestamp: Date.now(),
          meta: { error: err.message },
        });
        return;
      }
      // Non-mount errors (shouldn't happen) — still mark as error
      entry.status = "error";
      entry.error = new AFSMountError(module.name, "stat", String(err));
      return;
    }

    // Trust gate: verify provider credential meets required trust level
    if (this.trustConfig || options?.trust) {
      try {
        await checkTrustGate(module, {
          config: this.trustConfig ?? { default: "none", overrides: {} },
          trustedIssuers: this.trustedIssuers ?? [],
          levelOverride: options?.trust,
        });
      } catch (err) {
        if (err instanceof AFSMountError) {
          entry.status = "error";
          entry.error = err;
          this.notifyChange({
            kind: "mountError",
            path: entry.path,
            moduleName: module.name,
            namespace: entry.namespace,
            timestamp: Date.now(),
            meta: { error: err.message },
          });
          return;
        }
      }
    }

    entry.status = "ready";
  }

  /**
   * Explicitly wait for the async health check of a mounted provider.
   * Throws AFSMountError if the check failed.
   *
   * Use this when you need fail-fast semantics (e.g., credential retry on failure).
   *
   * @param path - The mount path to check
   * @param namespace - The namespace (undefined/null for default namespace)
   */
  async check(path: string, namespace?: string | null): Promise<void> {
    const normalizedPath = validatePath(path);
    const ns = namespace === undefined ? null : namespace;
    const key = this.makeKey(ns, normalizedPath);
    const entry = this.mounts.get(key);
    if (!entry) {
      throw new AFSNotFoundError(path, `No provider mounted at '${path}'`);
    }
    if (entry.checkPromise) {
      await entry.checkPromise;
    }
    if (entry.status === "error" && entry.error) {
      throw entry.error;
    }
  }

  /**
   * Find a mounted vault module (by name convention: "vault").
   * Returns undefined if no vault is mounted.
   */
  private findVaultModule(): AFSModule | undefined {
    for (const entry of this.mounts.values()) {
      if (entry.module.name === "vault") return entry.module;
    }
    return undefined;
  }

  /**
   * Inject SecretCapability into a provider if it declares secrets and vault is available.
   */
  private injectSecretCapability(
    module: AFSModule,
    capabilities: ProviderCapabilityManifest,
  ): void {
    const secrets = capabilities.secrets;
    if (!secrets?.length) return;

    // Check if module supports secret capability injection
    if (!module.setSecretCapability) return;

    const vault = this.findVaultModule();
    if (!vault) return;

    // Bridge secret audit events to capability event handler if configured
    let auditSink: SecretAuditSink | undefined;
    if (this.options.onCapabilityEvent) {
      const handler = this.options.onCapabilityEvent;
      const providerName = module.name;
      auditSink = (entry) => {
        handler({
          type: "capability-use",
          provider: providerName,
          capability: "secrets",
          detail: { secret: entry.secret, operation: entry.operation },
          timestamp: entry.timestamp,
        });
      };
    }

    const cap = createSecretCapability(vault, secrets, module.name, auditSink);

    module.setSecretCapability(cap);
  }

  /**
   * Get all mounts, optionally filtered by namespace
   *
   * @param namespace - Filter by namespace (undefined = all, null = default only)
   */
  getMounts(namespace?: string | null): MountInfo[] {
    const result: MountInfo[] = [];

    for (const entry of this.mounts.values()) {
      if (namespace === undefined || entry.namespace === namespace) {
        result.push({
          namespace: entry.namespace,
          path: entry.path,
          module: entry.module,
          status: entry.status,
          error: entry.error,
        });
      }
    }

    return result;
  }

  /**
   * Get all unique namespaces that have mounts
   */
  getNamespaces(): (string | null)[] {
    const namespaces = new Set<string | null>();
    for (const entry of this.mounts.values()) {
      namespaces.add(entry.namespace);
    }
    return Array.from(namespaces);
  }

  /**
   * Unmount a module at a path in a namespace
   *
   * @param path - The path to unmount
   * @param namespace - The namespace (undefined/null for default namespace)
   * @returns true if unmounted, false if not found
   */
  unmount(path: string, namespace?: string | null): boolean {
    const normalizedPath = validatePath(path);
    const ns = namespace === undefined ? null : namespace;
    const key = this.makeKey(ns, normalizedPath);

    const entry = this.mounts.get(key);
    if (entry) {
      // Clear event sink on unmount
      entry.module.setEventSink?.(null);
      this.mounts.delete(key);
      this.notifyChange({
        kind: "unmount",
        path: normalizedPath,
        moduleName: entry.module.name,
        namespace: entry.namespace,
        timestamp: Date.now(),
      });
      return true;
    }
    return false;
  }

  /**
   * Check if a path is mounted in a namespace
   *
   * @param path - The path to check
   * @param namespace - The namespace (undefined/null for default namespace)
   */
  isMounted(path: string, namespace?: string | null): boolean {
    const normalizedPath = validatePath(path);
    const ns = namespace === undefined ? null : namespace;
    const key = this.makeKey(ns, normalizedPath);
    return this.mounts.has(key);
  }

  async listModules(): Promise<
    {
      name: string;
      path: string;
      namespace: string | null;
      description?: string;
      module: AFSModule;
    }[]
  > {
    return Array.from(this.mounts.values()).map((entry) => ({
      path: entry.path,
      namespace: entry.namespace,
      name: entry.module.name,
      description:
        entry.module.description ??
        (entry.module.constructor as { manifest?: () => { description?: string } }).manifest?.()
          ?.description,
      module: entry.module,
    }));
  }

  /**
   * Parse a path and extract namespace if it's a canonical path
   * Returns the namespace and the path within the namespace
   */
  private parsePathWithNamespace(inputPath: string): { namespace: string | null; path: string } {
    if (isCanonicalPath(inputPath)) {
      const parsed = parseCanonicalPath(inputPath);
      return { namespace: parsed.namespace, path: parsed.path };
    }
    // Non-canonical path defaults to default namespace
    return { namespace: null, path: validatePath(inputPath) };
  }

  /**
   * Find modules that can handle a path in a specific namespace
   */
  private findModulesInNamespace(
    path: string,
    namespace: string | null,
    options?: { maxDepth?: number; exactMatch?: boolean },
  ): {
    module: AFSModule;
    modulePath: string;
    maxDepth: number;
    subpath: string;
    remainedModulePath: string;
  }[] {
    const maxDepth = Math.max(options?.maxDepth ?? DEFAULT_MAX_DEPTH, 1);
    const matched: ReturnType<typeof this.findModulesInNamespace> = [];

    for (const entry of this.mounts.values()) {
      // Only consider mounts in the specified namespace
      if (entry.namespace !== namespace) continue;

      const modulePath = entry.path;
      const module = entry.module;

      const pathSegments = path.split("/").filter(Boolean);
      const modulePathSegments = modulePath.split("/").filter(Boolean);

      let newMaxDepth: number;
      let subpath: string;
      let remainedModulePath: string;

      // Check if modulePath is under path (modulePath starts with path)
      // Must be exact segment match: /github/ArcBlock/afs should NOT match /github/ArcBlock/afsd
      const moduleUnderPath =
        !options?.exactMatch &&
        modulePath.startsWith(path) &&
        (modulePath === path || path === "/" || modulePath[path.length] === "/");

      // Check if path is under modulePath (path starts with modulePath)
      // Must be exact segment match
      const pathUnderModule =
        path.startsWith(modulePath) &&
        (path === modulePath || modulePath === "/" || path[modulePath.length] === "/");

      if (moduleUnderPath) {
        newMaxDepth = Math.max(0, maxDepth - (modulePathSegments.length - pathSegments.length));
        subpath = "/";
        remainedModulePath = joinURL(
          "/",
          ...modulePathSegments.slice(pathSegments.length).slice(0, maxDepth),
        );
      } else if (pathUnderModule) {
        newMaxDepth = maxDepth;
        subpath = joinURL("/", ...pathSegments.slice(modulePathSegments.length));
        remainedModulePath = "/";
      } else {
        continue;
      }

      if (newMaxDepth < 0) continue;

      matched.push({
        module,
        modulePath,
        maxDepth: newMaxDepth,
        subpath,
        remainedModulePath,
      });
    }

    // Sort by mount path length descending — longest prefix match first.
    // This ensures that more specific mounts (e.g., .aup/ overlay mounts)
    // are tried before their parent mounts when resolving reads.
    matched.sort((a, b) => b.modulePath.length - a.modulePath.length);

    return matched;
  }

  async list(path: string, options: AFSListOptions = {}): Promise<AFSListResult> {
    // Parse path with potential namespace
    const { namespace, path: normalizedPath } = this.parsePathWithNamespace(path);

    // Handle root-level /.actions listing
    if (normalizedPath === "/.actions" && namespace === null) {
      return this.listRootActions();
    }

    // Handle /.knowledge listing
    if (normalizedPath === "/.knowledge" && namespace === null) {
      return this.listKnowledge();
    }

    // Handle /registry/ virtual path
    if (normalizedPath.startsWith("/registry") && namespace === null) {
      const subpath = normalizedPath.replace(/^\/registry/, "") || "/";
      return this.registryStore.list(subpath);
    }

    // Handle .as/ path routing for list
    const asParsed = parseAsPath(normalizedPath);
    if (asParsed) {
      if (asParsed.asValue) return { data: [] }; // .as/ values are leaf nodes
      return this.listSupportedAs(asParsed.basePath, namespace);
    }

    return await this._list(normalizedPath, namespace, options);
  }

  private async _list(
    path: string,
    namespace: string | null,
    options: AFSListOptions = {},
  ): Promise<AFSListResult> {
    // maxDepth=0: return empty array (no children levels to expand)
    if (options?.maxDepth === 0) {
      return { data: [] };
    }

    const results: AFSEntry[] = [];
    let providerTotal: number | undefined;

    const matches = this.findModulesInNamespace(path, namespace, options);

    // If no modules match, return empty results (consistent with filesystem semantics)
    if (matches.length === 0) {
      return { data: results };
    }

    // Track virtual intermediate directories to deduplicate
    const virtualDirs = new Map<string, number>();

    for (const matched of matches) {
      if (matched.maxDepth === 0) {
        // Compute the depth-truncated path
        const truncatedPath = joinURL(path, matched.remainedModulePath);

        if (truncatedPath === matched.modulePath) {
          // Mount point is within depth budget, show as-is
          const moduleDesc =
            matched.module.description ??
            (
              matched.module.constructor as { manifest?: () => { description?: string } }
            ).manifest?.()?.description;
          const moduleEntry: AFSEntry = {
            id: matched.module.name,
            path: matched.modulePath,
            summary: moduleDesc,
            meta: {
              childrenCount: -1, // Unknown, may have children
              description: moduleDesc,
            },
          };
          results.push(moduleEntry);
        } else {
          // Mount point is deeper than depth allows — record virtual dir
          virtualDirs.set(truncatedPath, (virtualDirs.get(truncatedPath) ?? 0) + 1);
        }
        continue;
      }

      if (!matched.module.list) {
        // Fallback: Provider has no list method
        // Use childrenCount from read() to determine behavior
        if (matched.module.read) {
          try {
            const readResult = await matched.module.read(matched.subpath);
            const childrenCount = readResult.data?.meta?.childrenCount;

            // If childrenCount is undefined or 0, return empty array (leaf node)
            if (childrenCount === undefined || childrenCount === 0) {
              // Leaf node, no children to list
              continue;
            }

            // If childrenCount > 0 or -1, provider must implement list()
            throw new Error(
              `Provider '${matched.module.name}' has childrenCount=${childrenCount} but does not implement list(). ` +
                `Providers with children must implement the list() method.`,
            );
          } catch (error) {
            // Re-throw if it's our own error about missing list
            if (error instanceof Error && error.message.includes("does not implement list")) {
              throw error;
            }
            // read() failed, skip this module
            continue;
          }
        }
        continue;
      }

      try {
        const result = await matched.module.list(matched.subpath, {
          ...options,
          maxDepth: matched.maxDepth,
        });

        const children = result.data.map((entry) => {
          let mapped = {
            ...entry,
            path: joinURL(matched.modulePath, entry.path),
          };
          // Apply sensitive field masking to list results (same as read)
          if (matched.module.sensitiveFields?.length && matched.module.sensitivity !== "full") {
            mapped = AFS.maskSensitiveFields(mapped, matched.module.sensitiveFields);
          }
          return mapped;
        });

        // Always include all nodes (including the current path itself)
        // This ensures consistent behavior across all listing scenarios
        results.push(...children);

        // Propagate total from provider (meaningful for single-provider pagination)
        if (result.total != null) {
          providerTotal = result.total;
        }

        // If provider returned a message (e.g., error or warning), surface it
        if (result.message && children.length === 0) {
          return { data: results, message: result.message, total: providerTotal };
        }
      } catch (error) {
        throw new Error(`Error listing from module at ${matched.modulePath}: ${error.message}`);
      }
    }

    // Emit deduplicated virtual intermediate directory entries
    for (const [dirPath] of virtualDirs) {
      const dirName = dirPath.split("/").filter(Boolean).pop() || "";
      results.push({
        id: dirName,
        path: dirPath,
        meta: {
          childrenCount: -1,
        },
      });
    }

    return { data: results, total: providerTotal };
  }

  /** List supported `.as/` values for a given path. */
  private async listSupportedAs(
    basePath: string,
    namespace: string | null,
  ): Promise<AFSListResult> {
    const match = this.findModulesInNamespace(basePath, namespace, { exactMatch: true })[0];
    if (!match) throw new AFSNotFoundError(joinURL(basePath, ".as"));

    const { module, modulePath, subpath } = match;
    if (!module.supportedAs) {
      throw new AFSNotFoundError(joinURL(modulePath, subpath, ".as"));
    }

    const supported = await module.supportedAs(subpath);
    const asPath = joinURL(modulePath, subpath, ".as");
    const entries: AFSEntry[] = supported.map((asValue) => ({
      id: asValue,
      path: joinURL(asPath, asValue),
      meta: { kind: "afs:as-representation" },
    }));

    return { data: entries };
  }

  private async enrichData<
    T extends { path: string; actions?: ActionSummary[]; meta?: Record<string, unknown> | null },
  >(data: T, module: AFSModule, subpath: string): Promise<T> {
    return enrichDataImpl(data, module, subpath);
  }

  async read(path: string, _options?: AFSReadOptions): Promise<AFSReadResult> {
    // Parse path with potential namespace
    const { namespace, path: normalizedPath } = this.parsePathWithNamespace(path);

    // Handle .as/ path routing — resolve before other special paths
    const asParsed = parseAsPath(normalizedPath);
    if (asParsed) {
      if (!asParsed.asValue) throw new AFSNotFoundError(path);
      const resolvedPath = namespace ? `${namespace}:${asParsed.basePath}` : asParsed.basePath;
      return this.read(resolvedPath, { ..._options, as: asParsed.asValue });
    }

    // Special handling for root system paths
    if (namespace === null) {
      if (normalizedPath.startsWith("/.actions/")) {
        return this.readRootAction(normalizedPath);
      }
      if (normalizedPath === "/.actions") {
        return this.readRootActions();
      }
      if (normalizedPath === "/.meta") {
        return this.readRootMeta();
      }
    }

    // Special handling for /.knowledge/ paths
    if (namespace === null && normalizedPath.startsWith("/.knowledge")) {
      return this.readKnowledge(normalizedPath);
    }

    // Handle /registry/ virtual path reads
    if (namespace === null && normalizedPath.startsWith("/registry")) {
      const subpath = normalizedPath.replace(/^\/registry/, "") || "/";
      const result = this.registryStore.read(subpath);
      if (result) return result;
      throw new AFSNotFoundError(path);
    }

    // Special handling for /.meta/.capabilities
    if (normalizedPath === "/.meta/.capabilities") {
      const capabilities = await this.aggregateCapabilities(namespace);
      return {
        data: {
          id: ".capabilities",
          path: "/.meta/.capabilities",
          content: capabilities,
          meta: {
            kind: "afs:capabilities",
          },
        },
      };
    }

    const modules = this.findModulesInNamespace(normalizedPath, namespace, { exactMatch: true });

    for (const { module, modulePath, subpath } of modules) {
      // .did convention: intercept before provider delegation
      if (subpath === "/.did" || subpath === "/.did/") {
        const subject = module.credential?.credentialSubject as Record<string, unknown> | undefined;
        return {
          data: {
            id: ".did",
            path: joinURL(modulePath, ".did"),
            content: JSON.stringify({
              did: subject?.id,
              name:
                (subject as any)?.provider?.name ?? (subject as any)?.blocklet?.name ?? module.name,
            }),
            meta: { kind: "afs:did" },
          },
        };
      }
      if (subpath === "/.did/vc") {
        if (!module.credential) throw new AFSNotFoundError(path);
        return {
          data: {
            id: "vc",
            path: joinURL(modulePath, ".did/vc"),
            content: JSON.stringify(module.credential),
            meta: { kind: "afs:credential" },
          },
        };
      }
      if (subpath.startsWith("/.did")) {
        throw new AFSNotFoundError(path);
      }

      if (_options?.as && !module.supportedAs) {
        throw new AFSNotFoundError(
          `Provider '${module.name}' does not support alternative representations (.as/)`,
        );
      }

      const res = await module.read?.(subpath, _options);

      if (res?.data) {
        // Enrich entry with actions and meta if not present
        let enrichedData = await this.enrichData(res.data, module, subpath);

        // Apply sensitive field masking
        if (module.sensitiveFields?.length && module.sensitivity !== "full") {
          enrichedData = AFS.maskSensitiveFields(enrichedData, module.sensitiveFields);
        }

        const resultData = {
          ...enrichedData,
          path: joinURL(modulePath, res.data.path),
        };

        // Visibility enforcement: strip content when meta-only
        if (module.visibility === "meta") {
          const { content: _stripped, ...metaOnly } = resultData;
          return { ...res, data: metaOnly };
        }

        return { ...res, data: resultData };
      }
    }

    // Check if path is a virtual intermediate directory (parent of mount paths)
    const virtualDir = this.resolveVirtualDirectory(normalizedPath, namespace);
    if (virtualDir) {
      return virtualDir;
    }

    throw new AFSNotFoundError(path);
  }

  /**
   * Check if a path is a virtual intermediate directory.
   * Returns a read result if the path is a parent of one or more mount paths.
   */
  private resolveVirtualDirectory(path: string, namespace: string | null): AFSReadResult | null {
    const pathSegments = path.split("/").filter(Boolean);
    const childNames = new Set<string>();

    for (const entry of this.mounts.values()) {
      if (entry.namespace !== namespace) continue;

      const moduleSegments = entry.path.split("/").filter(Boolean);

      // Mount must be deeper than the query path
      if (moduleSegments.length <= pathSegments.length) continue;

      // Check segment-by-segment prefix match
      let match = true;
      for (let i = 0; i < pathSegments.length; i++) {
        if (moduleSegments[i] !== pathSegments[i]) {
          match = false;
          break;
        }
      }

      if (match) {
        childNames.add(moduleSegments[pathSegments.length]!);
      }
    }

    if (childNames.size === 0) return null;

    const dirName = pathSegments[pathSegments.length - 1] || "/";
    return {
      data: {
        id: dirName,
        path,
        meta: {
          childrenCount: childNames.size,
        },
      },
    };
  }

  /**
   * Aggregate capabilities from all mounted providers.
   *
   * For each provider:
   * - Read /.meta/.capabilities
   * - Merge tools with provider prefix and mount path prefix
   * - Merge actions with mount path prefix on discovery.pathTemplate
   * - Silently skip providers that fail or don't implement capabilities
   */
  private async aggregateCapabilities(namespace: string | null): Promise<AggregatedCapabilities> {
    const allTools: ToolDefinition[] = [];
    const allActions: ActionCatalog[] = [];
    const skipped: string[] = [];
    const allOperations: OperationsDeclaration[] = [];
    const providerResources: Record<string, import("./capabilities/types.js").ProviderResources> =
      {};

    // Get all mounts in the specified namespace
    const mounts = this.getMounts(namespace);

    for (const mount of mounts) {
      const { path: mountPath, module: provider } = mount;

      try {
        // Try to read provider's capabilities
        const result = await provider.read?.("/.meta/.capabilities");
        const content = result?.data?.content;

        if (!content) {
          // Provider doesn't implement capabilities, skip silently
          continue;
        }

        const manifest = content as CapabilitiesManifest;

        // Merge tools with provider prefix and mount path prefix
        for (const tool of manifest.tools ?? []) {
          allTools.push({
            ...tool,
            name: `${manifest.provider}.${tool.name}`,
            path: joinURL(mountPath, tool.path),
          });
        }

        // Merge actions with mount path prefix on pathTemplate
        for (const actionCatalog of manifest.actions ?? []) {
          allActions.push({
            ...actionCatalog,
            discovery: {
              ...actionCatalog.discovery,
              pathTemplate: joinURL(mountPath, actionCatalog.discovery.pathTemplate),
            },
          });
        }

        // Collect operations declarations
        if (manifest.operations) {
          allOperations.push(manifest.operations);
        }

        // Pass through resources (per-provider, not merged)
        if (manifest.resources) {
          providerResources[mountPath] = manifest.resources;
        }
      } catch {
        // Record skipped mount path (don't expose error details)
        skipped.push(mountPath);
      }
    }

    const result: AggregatedCapabilities = {
      schemaVersion: 1,
      provider: "afs",
      description: "AFS aggregated capabilities",
      tools: allTools,
      actions: allActions,
    };

    // Merge operations: OR across all providers (if any provider supports an op, it's available)
    if (allOperations.length > 0) {
      const write = allOperations.some((o) => o.write);
      const del = allOperations.some((o) => o.delete);
      result.operations = {
        read: allOperations.some((o) => o.read),
        list: allOperations.some((o) => o.list),
        write,
        delete: del,
        search: allOperations.some((o) => o.search),
        exec: allOperations.some((o) => o.exec),
        stat: allOperations.some((o) => o.stat),
        explain: allOperations.some((o) => o.explain),
        batchWrite: write,
        batchDelete: del,
      };
    }

    // Add per-provider resources if any declared
    if (Object.keys(providerResources).length > 0) {
      result.providerResources = providerResources;
    }

    // Add partial/skipped fields if any providers were skipped
    if (skipped.length > 0) {
      result.partial = true;
      result.skipped = skipped;
    }

    return result;
  }

  async write(
    path: string,
    content: AFSWriteEntryPayload,
    options?: AFSWriteOptions,
  ): Promise<AFSWriteResult> {
    // Parse path with potential namespace
    const { namespace, path: normalizedPath } = this.parsePathWithNamespace(path);

    // Handle .as/ path routing
    const asParsed = parseAsPath(normalizedPath);
    if (asParsed) {
      if (!asParsed.asValue)
        throw new AFSValidationError("Cannot write to .as/ without specifying a format");
      const resolvedPath = namespace ? `${namespace}:${asParsed.basePath}` : asParsed.basePath;
      return this.write(resolvedPath, content, { ...options, as: asParsed.asValue });
    }

    const module = this.findModulesInNamespace(normalizedPath, namespace, { exactMatch: true })[0];
    if (!module?.module.write)
      throw new Error(
        `No module found for path: ${normalizedPath} in namespace '${namespace ?? "default"}'`,
      );

    this.checkWritePermission(module.module, "write", path, options?.mode);

    if (options?.as && !module.module.supportedAs) {
      throw new AFSNotFoundError(
        `Provider '${module.module.name}' does not support alternative representations (.as/)`,
      );
    }

    const res = await module.module.write(module.subpath, content, options);

    const result = {
      ...res,
      data: {
        ...res.data,
        path: joinURL(module.modulePath, res.data.path),
      },
    };
    this.notifyChange({
      kind: "write",
      path: result.data.path,
      moduleName: module.module.name,
      timestamp: Date.now(),
    });
    return result;
  }

  async delete(path: string, options?: AFSDeleteOptions): Promise<AFSDeleteResult> {
    // Parse path with potential namespace
    const { namespace, path: normalizedPath } = this.parsePathWithNamespace(path);

    const module = this.findModulesInNamespace(normalizedPath, namespace, { exactMatch: true })[0];
    if (!module?.module.delete)
      throw new Error(
        `No module found for path: ${normalizedPath} in namespace '${namespace ?? "default"}'`,
      );

    this.checkWritePermission(module.module, "delete", path);

    const result = await module.module.delete(module.subpath, options);
    this.notifyChange({
      kind: "delete",
      path: joinURL(module.modulePath, module.subpath),
      moduleName: module.module.name,
      timestamp: Date.now(),
    });
    return result;
  }

  /**
   * Batch write multiple entries. Each entry is independent — failure of one
   * does not abort others. Entries are processed sequentially.
   */
  async batchWrite(
    entries: AFSBatchWriteEntry[],
    _options?: AFSOperationOptions,
  ): Promise<AFSBatchWriteResult> {
    const results: AFSBatchWriteResult["results"] = [];
    let succeeded = 0;
    let failed = 0;

    for (const entry of entries) {
      try {
        const payload: AFSWriteEntryPayload = entry.content ?? {};
        if (entry.patches) payload.patches = entry.patches;
        const res = await this.write(entry.path, payload, { mode: entry.mode });
        results.push({ path: entry.path, success: true, data: res.data });
        succeeded++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ path: entry.path, success: false, error: message });
        failed++;
      }
    }

    return { results, succeeded, failed };
  }

  /**
   * Batch delete multiple entries. Each entry is independent — failure of one
   * does not abort others. Entries are processed sequentially.
   */
  async batchDelete(
    entries: AFSBatchDeleteEntry[],
    _options?: AFSOperationOptions,
  ): Promise<AFSBatchDeleteResult> {
    const results: AFSBatchDeleteResult["results"] = [];
    let succeeded = 0;
    let failed = 0;

    for (const entry of entries) {
      try {
        await this.delete(entry.path, { recursive: entry.recursive });
        results.push({ path: entry.path, success: true });
        succeeded++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ path: entry.path, success: false, error: message });
        failed++;
      }
    }

    return { results, succeeded, failed };
  }

  async rename(
    oldPath: string,
    newPath: string,
    options?: AFSRenameOptions,
  ): Promise<AFSRenameResult> {
    // Parse paths with potential namespaces
    const { namespace: oldNamespace, path: normalizedOldPath } =
      this.parsePathWithNamespace(oldPath);
    const { namespace: newNamespace, path: normalizedNewPath } =
      this.parsePathWithNamespace(newPath);

    // Both paths must be in the same namespace
    if (oldNamespace !== newNamespace) {
      throw new Error(`Cannot rename across different namespaces.`);
    }

    const oldModule = this.findModulesInNamespace(normalizedOldPath, oldNamespace, {
      exactMatch: true,
    })[0];
    const newModule = this.findModulesInNamespace(normalizedNewPath, newNamespace, {
      exactMatch: true,
    })[0];

    // Both paths must be in the same module
    if (!oldModule || !newModule || oldModule.modulePath !== newModule.modulePath) {
      throw new Error(
        `Cannot rename across different modules. Both paths must be in the same module.`,
      );
    }

    if (!oldModule.module.rename) {
      throw new Error(`Module does not support rename operation: ${oldModule.modulePath}`);
    }

    this.checkWritePermission(oldModule.module, "rename", oldPath);

    const result = await oldModule.module.rename(oldModule.subpath, newModule.subpath, options);
    this.notifyChange({
      kind: "rename",
      path: joinURL(oldModule.modulePath, oldModule.subpath),
      moduleName: oldModule.module.name,
      namespace: oldNamespace,
      meta: { newPath: joinURL(newModule.modulePath, newModule.subpath) },
      timestamp: Date.now(),
    });
    return result;
  }

  async search(
    path: string,
    query: string,
    options: AFSSearchOptions = {},
  ): Promise<AFSSearchResult> {
    // Parse path with potential namespace
    const { namespace, path: normalizedPath } = this.parsePathWithNamespace(path);

    // Handle /registry/ virtual path search
    if (normalizedPath.startsWith("/registry") && namespace === null) {
      return this.registryStore.search(query);
    }

    return await this._search(normalizedPath, namespace, query, options);
  }

  private async _search(
    path: string,
    namespace: string | null,
    query: string,
    options?: AFSSearchOptions,
  ): Promise<AFSSearchResult> {
    const results: AFSEntry[] = [];
    const messages: string[] = [];

    for (const { module, modulePath, subpath } of this.findModulesInNamespace(path, namespace)) {
      if (!module.search) continue;

      // Visibility enforcement: deny search on meta-only modules
      if (module.visibility === "meta") {
        throw new Error(
          `Search denied — module '${module.name}' has visibility "meta" (content not accessible)`,
        );
      }

      try {
        const { data, message } = await module.search(subpath, query, options);

        results.push(
          ...data.map((entry) => ({
            ...entry,
            path: joinURL(modulePath, entry.path),
          })),
        );
        if (message) messages.push(message);
      } catch (error) {
        throw new Error(`Error searching in module at ${modulePath}: ${error.message}`);
      }
    }

    return { data: results, message: messages.join("; ") };
  }

  async exec(
    path: string,
    args: Record<string, any>,
    options: AFSExecOptions = {},
  ): Promise<AFSExecResult> {
    // Parse path with potential namespace
    const { namespace, path: normalizedPath } = this.parsePathWithNamespace(path);

    // Handle root-level actions (/.actions/*)
    if (normalizedPath.startsWith("/.actions/")) {
      return await this.execRootAction(normalizedPath, args);
    }

    const module = this.findModulesInNamespace(normalizedPath, namespace)[0];
    if (!module?.module.exec)
      throw new Error(
        `No module found for path: ${normalizedPath} in namespace '${namespace ?? "default"}'`,
      );

    // Blocklet detection: if exec targets a module root (subpath is "/"), check for blocklet
    if (module.subpath === "/" && module.module.read) {
      let yamlContent: string | undefined;
      // Try blocklet.yaml first, then program.yaml for backward compatibility
      for (const filename of ["blocklet.yaml", "program.yaml"]) {
        try {
          const yamlResult = await module.module.read(joinURL(module.subpath, filename));
          const content = String(yamlResult?.data?.content ?? "");
          if (content.trim()) {
            yamlContent = content;
            break;
          }
        } catch {
          // Read failed — try next filename
        }
      }

      if (yamlContent?.trim()) {
        // blocklet.yaml/program.yaml exists and is non-empty — parse it. Errors are always surfaced
        // (corrupt/invalid manifests should not silently fall through to normal exec).
        parseBlockletManifest(yamlContent);
        return this.execProgram(normalizedPath, module.module, module.subpath, args, options);
      }

      // Fallback: already-activated program — runtime AFS (mounted by ProgramManager)
      // stores parsed manifest as _programManifest property.
      const cachedManifest = (module.module as any)._programManifest as
        | BlockletManifest
        | undefined;
      if (!yamlContent?.trim() && cachedManifest) {
        return this.execActivatedProgram(
          normalizedPath,
          module.module,
          cachedManifest,
          args,
          options,
        );
      }
    }

    this.checkWritePermission(module.module, "exec", path);

    // Check action severity against module's action policy
    await this.checkActionPolicy(module.module, module.subpath);

    // Validate args against inputSchema if available
    await this.validateExecInput(module.module, module.subpath, args);

    // Inject AFS instance into context so providers can perform cross-provider operations
    // When isolation is active, inject a scoped proxy instead of the raw AFS reference
    const mountKey = this.makeKey(namespace, module.modulePath);
    const mountEntry = this.mounts.get(mountKey);
    let contextAfs: AFSRoot = this;

    if (mountEntry?.enforcer) {
      contextAfs = createScopedAFSProxy(
        this,
        mountEntry.capabilities ?? {},
        mountEntry.enforcer,
        module.module.name,
      );
    }

    const enhancedOptions: AFSExecOptions = {
      ...options,
      context: { ...options?.context, afs: contextAfs },
    };

    return await module.module.exec(module.subpath, args, enhancedOptions);
  }

  /**
   * Read a root-level action entry (/.actions/mount, /.actions/unmount).
   * Returns the action entry with metadata including inputSchema.
   */
  private async readRootAction(path: string): Promise<AFSReadResult> {
    const actions = buildRootActions(!!this.loadProvider);
    return readRootActionImpl(path, actions);
  }

  private async readRootMeta(): Promise<AFSReadResult> {
    const mounts = this.getMounts(null);
    const actions = buildRootActions(!!this.loadProvider);
    return readRootMetaImpl(mounts, actions);
  }

  private async readRootActions(): Promise<AFSReadResult> {
    const actions = buildRootActions(!!this.loadProvider);
    return readRootActionsImpl(actions);
  }

  private async statRootAction(path: string): Promise<AFSStatResult> {
    const actions = buildRootActions(!!this.loadProvider);
    return statRootActionImpl(path, actions);
  }

  private async statRootMeta(path: string): Promise<AFSStatResult> {
    return statRootMetaImpl(path);
  }

  private async listRootActions(): Promise<AFSListResult> {
    return { data: buildRootActions(!!this.loadProvider) };
  }

  private async execRootAction(path: string, args: Record<string, any>): Promise<AFSExecResult> {
    return execRootActionImpl(path, args, {
      loadProvider: this.loadProvider,
      unmount: (p) => this.unmount(p),
      unloadProvider: this.unloadProvider,
      read: (p) => this.read(p),
      list: (p, opts) => this.list(p, opts),
      write: (p, content, opts) => this.write(p, content, opts),
      delete: (p, opts) => this.delete(p, opts),
    });
  }

  /**
   * Validate exec input args against inputSchema.
   * Throws AFSValidationError if validation fails.
   * Uses zod built-in fromJSONSchema for full JSON Schema validation.
   */
  private async validateExecInput(
    module: AFSModule,
    subpath: string,
    args: Record<string, unknown>,
  ): Promise<void> {
    // Try to get inputSchema from the action's metadata
    let inputSchema: Record<string, unknown> | undefined;

    if (module.read) {
      try {
        const readResult = await module.read(subpath);
        inputSchema = readResult.data?.meta?.inputSchema as Record<string, unknown> | undefined;
      } catch {
        // If read fails, skip validation
        return;
      }
    }

    // If no inputSchema, skip validation
    if (!inputSchema) {
      return;
    }

    // Convert JSON Schema to Zod schema and validate
    try {
      const { fromJSONSchema } = await import("zod");
      const zodSchema = fromJSONSchema(inputSchema as Parameters<typeof fromJSONSchema>[0]);

      // Check if schema is a valid, usable schema (not z.never() from invalid JSON Schema)
      // z.never() has no properties/type info and always rejects - indicates invalid source schema
      const testResult = zodSchema.safeParse(args);
      if (!testResult.success) {
        // Check if it's a "never" type (invalid schema was converted to z.never())
        const hasNeverIssue = testResult.error.issues.some(
          (issue) =>
            issue.message === "Invalid input: expected never, received object" ||
            issue.message.startsWith("Invalid input: expected never"),
        );
        if (hasNeverIssue) {
          // Invalid source schema - degrade gracefully, skip validation
          return;
        }
        // Real validation errors - extract field-level messages
        const messages = testResult.error.issues.map((issue) => {
          const path = issue.path.join(".");
          return path ? `${path}: ${issue.message}` : issue.message;
        });
        throw new AFSValidationError(`Input validation failed: ${messages.join("; ")}`);
      }
    } catch (error) {
      if (error instanceof AFSValidationError) {
        throw error;
      }
      // Non-Zod errors (e.g. schema conversion failure) → skip validation
    }
  }

  // ---------------------------------------------------------------------------
  // Program detection helpers
  // ---------------------------------------------------------------------------

  /**
   * Detect if a directory is a blocklet by reading blocklet.yaml or program.yaml.
   * Returns enriched data with kind: "afs:program" and entrypoint metadata if detected.
   * Returns original data unchanged if not a blocklet.
   */
  private async detectProgramKind<
    T extends { path: string; meta?: Record<string, unknown> | null },
  >(data: T, module: AFSModule, subpath: string): Promise<T> {
    // Skip if kind already set
    if (data.meta?.kind) return data;

    // Skip if not a directory (no children)
    const childrenCount = data.meta?.childrenCount as number | undefined;
    if (childrenCount === 0) return data;

    // Try to read blocklet.yaml or program.yaml from the directory
    let manifest: BlockletManifest;
    try {
      let yamlContent = "";
      for (const filename of ["blocklet.yaml", "program.yaml"]) {
        try {
          const yamlPath = joinURL(subpath, filename);
          const result = await module.read?.(yamlPath);
          const content = String(result?.data?.content ?? "");
          if (content.trim()) {
            yamlContent = content;
            break;
          }
        } catch {
          // Try next filename
        }
      }
      if (!yamlContent.trim()) return data;
      manifest = parseBlockletManifest(yamlContent);
    } catch {
      // Not a blocklet, or manifest is invalid
      return data;
    }

    // Enrich with program metadata
    const programMeta: Record<string, unknown> = {
      ...data.meta,
      kind: "afs:program",
      kinds: ["afs:program", "afs:executable", "afs:node"],
      entrypoint: manifest.entrypoint,
      programId: manifest.id,
      programName: manifest.name,
    };

    // -h delegation: stat the entrypoint to get its inputSchema
    try {
      if (!manifest.entrypoint) throw new Error("no entrypoint");
      const entrypointPath = joinURL(subpath, manifest.entrypoint);
      const entrypointStat = await module.stat?.(entrypointPath);
      const epInputSchema =
        (entrypointStat?.data as any)?.inputSchema ??
        (entrypointStat?.data?.meta as any)?.inputSchema;
      if (epInputSchema) {
        programMeta.inputSchema = epInputSchema;
      }
    } catch {
      // Entrypoint stat failed — graceful degradation, still return program kind
    }

    return { ...data, meta: programMeta };
  }

  /**
   * Execute a program: read manifest, create Runtime AFS, exec entrypoint.
   */
  private async execProgram(
    programPath: string,
    module: AFSModule,
    subpath: string,
    args: Record<string, unknown>,
    options: AFSExecOptions,
  ): Promise<AFSExecResult> {
    // 1. Read blocklet.yaml or program.yaml
    let yamlContent = "";
    for (const filename of ["blocklet.yaml", "program.yaml"]) {
      try {
        const yamlPath = joinURL(subpath, filename);
        const readResult = await module.read?.(yamlPath);
        const content = String(readResult?.data?.content ?? "");
        if (content.trim()) {
          yamlContent = content;
          break;
        }
      } catch {
        // Try next filename
      }
    }
    if (!yamlContent.trim()) {
      throw new Error(`blocklet.yaml at ${programPath} is empty or not readable`);
    }
    const manifest = parseBlockletManifest(yamlContent);

    // 2. Determine data directory
    const dataDir = this.options.resolveDataDir?.(programPath) ?? joinURL("/.data", manifest.id);

    // 2b. Ensure data directory exists (only for legacy /.data path)
    if (!this.options.resolveDataDir) {
      try {
        await this.write!(joinURL(dataDir, ".keep"), { content: "" });
      } catch {
        // Data directory may not be writable — /data mount will fail gracefully
      }
    }

    // 3. Load mount overrides from mounts.toml (if available)
    const mountOverrides = await this.options.readMountOverrides?.(programPath);

    // 4. Create Runtime AFS
    const { afs: runtimeAFS, resolvedOverrides } = await createBlockletAFS(
      programPath,
      dataDir,
      this,
      {
        createProvider: this.createProviderFromMount,
        createDataProvider: this.options.createDataProvider,
        mountOverrides: mountOverrides?.length ? mountOverrides : undefined,
      },
    );

    // 4b. Persist resolved mount overrides so future runs use correct URIs
    if (resolvedOverrides.length > 0 && this.options.writeMountOverrides) {
      try {
        await this.options.writeMountOverrides(programPath, resolvedOverrides);
      } catch {
        // Persistence failure is non-fatal — program can still run
      }
    }

    // 5. Read entrypoint source directly (avoid exec through projection which leaks context)
    if (!manifest.entrypoint) {
      throw new Error(
        `Program ${manifest.id} has no entrypoint — declarative blocklets (specVersion 2) are not executable`,
      );
    }
    const entrypointSubpath = joinURL(subpath, manifest.entrypoint);
    const sourceResult = await module.read?.(entrypointSubpath);
    const source = String(sourceResult?.data?.content ?? "");
    if (!source.trim()) {
      throw new Error(
        `Entrypoint ${manifest.entrypoint} at ${programPath} is empty or not readable`,
      );
    }

    // 6. Find ASH mount target in manifest and exec run action on runtimeAFS.
    //    Pass _runtime_afs so ASH uses runtimeAFS (not globalAFS) for path resolution.
    const ashMount = manifest.mounts.find((m) => m.uri.startsWith("ash://"));
    if (!ashMount) {
      throw new Error(
        `Program ${manifest.id} has no ash:// mount declared — cannot execute ASH entrypoint`,
      );
    }
    const ashRunPath = joinURL(ashMount.target, ".actions", "run");
    return runtimeAFS.exec!(ashRunPath, { ...args, source, _runtime_afs: runtimeAFS }, options);
  }

  /**
   * Execute an already-activated program.
   *
   * When a program is activated, its runtime AFS is mounted in place of the
   * original provider. The runtime AFS has the program source at /program
   * (not at root), so the standard execProgram() detection path fails.
   * This method reuses the existing runtime AFS instead of creating a new one.
   */
  private async execActivatedProgram(
    programPath: string,
    runtimeAFS: AFSModule,
    manifest: BlockletManifest,
    args: Record<string, unknown>,
    options: AFSExecOptions,
  ): Promise<AFSExecResult> {
    // Read entrypoint source from /blocklet mount (runtime AFS convention).
    // The ProjectionProvider at /blocklet uses sourceModule (the original provider)
    // to avoid circular reference after mount replacement.
    if (!manifest.entrypoint) {
      throw new Error(
        `Program ${manifest.id} has no entrypoint — declarative blocklets (specVersion 2) are not executable`,
      );
    }
    const entrypointPath = joinURL("/blocklet", manifest.entrypoint);
    const sourceResult = await runtimeAFS.read!(entrypointPath);
    const source = String(sourceResult?.data?.content ?? "");
    if (!source.trim()) {
      throw new Error(
        `Entrypoint ${manifest.entrypoint} at ${programPath} is empty or not readable`,
      );
    }

    // Find ASH mount target in manifest and exec via the runtime AFS
    const ashMount = manifest.mounts.find((m) => m.uri.startsWith("ash://"));
    if (!ashMount) {
      throw new Error(
        `Program ${manifest.id} has no ash:// mount declared — cannot execute ASH entrypoint`,
      );
    }
    const ashRunPath = joinURL(ashMount.target, ".actions", "run");
    const afsRoot = runtimeAFS as unknown as AFSRoot;
    return afsRoot.exec!(ashRunPath, { ...args, source, _runtime_afs: afsRoot }, options);
  }

  /**
   * Get stat information for a path
   *
   * Resolution order:
   * 1. Provider's stat() method (if implemented)
   * 2. Fallback to read() - extracts stat data from AFSEntry
   *
   * This allows providers to implement only read() while stat() still works.
   */
  async stat(path: string, options?: AFSStatOptions): Promise<AFSStatResult> {
    // Parse path with potential namespace
    const { namespace, path: normalizedPath } = this.parsePathWithNamespace(path);

    // Handle .as/ path routing for stat
    const asParsed = parseAsPath(normalizedPath);
    if (asParsed) {
      if (asParsed.asValue) {
        const readResult = await this.read(path);
        if (!readResult.data) throw new AFSNotFoundError(path);
        const { content: _content, ...statData } = readResult.data;
        return { data: statData };
      }
      return {
        data: {
          id: ".as",
          path: joinURL(asParsed.basePath, ".as"),
          meta: { kind: "afs:virtual-dir", childrenCount: -1 },
        },
      };
    }

    // Explicit routes for root system paths (before module lookup)
    if (namespace === null) {
      if (normalizedPath === "/.actions" || normalizedPath.startsWith("/.actions/")) {
        return this.statRootAction(normalizedPath);
      }
      if (normalizedPath === "/.meta" || normalizedPath.startsWith("/.meta/")) {
        return this.statRootMeta(normalizedPath);
      }
      // Handle /registry/ virtual path stat
      if (normalizedPath.startsWith("/registry")) {
        const subpath = normalizedPath.replace(/^\/registry/, "") || "/";
        const result = this.registryStore.stat(subpath);
        if (result) return result;
        throw new AFSNotFoundError(path);
      }
    }

    const module = this.findModulesInNamespace(normalizedPath, namespace)[0];
    if (!module) {
      // No match at all — check for virtual intermediate directory
      const virtualDir = this.resolveVirtualDirectory(normalizedPath, namespace);
      if (virtualDir?.data) {
        return { data: virtualDir.data };
      }

      // Safety net: fallback to this.read() for paths with read handlers (e.g. /.actions/*)
      try {
        const readResult = await this.read(path);
        if (readResult.data) {
          const { content: _content, ...statData } = readResult.data;
          return { data: statData };
        }
      } catch {
        /* read also failed, throw original error */
      }

      throw new AFSNotFoundError(path);
    }

    // If the path is a parent of the mount (virtual intermediate directory),
    // return virtual directory data instead of delegating to the provider
    if (module.remainedModulePath !== "/") {
      const virtualDir = this.resolveVirtualDirectory(normalizedPath, namespace);
      if (virtualDir?.data) {
        return { data: virtualDir.data };
      }
    }

    // .did convention: delegate to read() which handles .did paths
    if (
      module.subpath === "/.did" ||
      module.subpath === "/.did/" ||
      module.subpath === "/.did/vc" ||
      module.subpath.startsWith("/.did/")
    ) {
      const readResult = await this.read(path);
      if (readResult.data) {
        const { content: _content, ...statData } = readResult.data;
        return { data: statData };
      }
    }

    // Try provider's stat() first
    if (module.module.stat) {
      try {
        const result = await module.module.stat(module.subpath, options);

        // Enrich data with actions and meta if present and not already set
        if (result.data) {
          let enrichedData = await this.enrichData(result.data, module.module, module.subpath);
          // Blocklet detection: check if directory contains blocklet.yaml/program.yaml
          enrichedData = await this.detectProgramKind(enrichedData, module.module, module.subpath);
          return {
            ...result,
            data: {
              ...enrichedData,
              path: joinURL(module.modulePath, result.data.path),
            },
          };
        }

        // stat returned undefined data - path not found
        throw new AFSNotFoundError(path);
      } catch (error) {
        // Only fallthrough to read() for "not found" scenarios.
        // Re-throw permission errors, internal errors, etc.
        if (error instanceof AFSNotFoundError) {
          // Expected: provider has no handler for this subpath — try read() fallback
        } else if (error instanceof AFSError) {
          throw error; // Permission denied, readonly, severity, etc.
        }
        // Non-AFS errors (e.g. network, runtime) — also try fallback
      }
    }

    // Fallback to read() - extract stat data from AFSEntry (exclude content)
    if (module.module.read) {
      const readResult = await module.module.read(module.subpath, options);
      if (readResult.data) {
        const { content: _content, ...statData } = readResult.data;
        let enrichedData = await this.enrichData(statData, module.module, module.subpath);
        // Program detection: check if directory contains program.yaml
        enrichedData = await this.detectProgramKind(enrichedData, module.module, module.subpath);
        return {
          data: {
            ...enrichedData,
            path: joinURL(module.modulePath, readResult.data.path),
          },
        };
      }
    }

    throw new AFSNotFoundError(path);
  }

  /**
   * Get human-readable explanation for a path
   *
   * Resolution order:
   * 1. Provider's explain() method (if implemented)
   * 2. Fallback to stat() - builds explanation from metadata
   *
   * This allows providers to skip implementing explain() while it still works.
   */
  async explain(path: string, options?: AFSExplainOptions): Promise<AFSExplainResult> {
    // Parse path with potential namespace
    const { namespace, path: normalizedPath } = this.parsePathWithNamespace(path);

    // Handle .as/ path routing for explain
    const asParsed = parseAsPath(normalizedPath);
    if (asParsed) {
      if (asParsed.asValue) {
        return {
          format: "markdown",
          content: `Alternative representation \`${asParsed.asValue}\` of \`${asParsed.basePath}\``,
        };
      }
      try {
        const supported = await this.listSupportedAs(asParsed.basePath, namespace);
        const values = supported.data.map((e) => e.id).join(", ");
        return {
          format: "markdown",
          content: `Available representations for \`${asParsed.basePath}\`: ${values}`,
        };
      } catch {
        throw new AFSNotFoundError(path);
      }
    }

    // Explicit routes for root system paths (before module lookup)
    if (namespace === null) {
      if (normalizedPath === "/") {
        return this.explainRoot();
      }
      if (normalizedPath === "/.actions" || normalizedPath.startsWith("/.actions/")) {
        return this.explainRootAction(normalizedPath);
      }
      if (normalizedPath === "/.meta" || normalizedPath.startsWith("/.meta/")) {
        return this.explainRootMeta(normalizedPath);
      }
      if (normalizedPath === "/.knowledge" || normalizedPath.startsWith("/.knowledge/")) {
        return this.explainKnowledge(normalizedPath);
      }
    }

    const module = this.findModulesInNamespace(normalizedPath, namespace)[0];
    if (!module) {
      // Check for virtual intermediate directory
      const virtualDir = this.resolveVirtualDirectory(normalizedPath, namespace);
      if (virtualDir?.data) {
        return this.buildVirtualDirExplain(normalizedPath, virtualDir.data);
      }

      // Safety net: fallback to this.stat() for paths with stat/read handlers
      try {
        const statResult = await this.stat(path);
        if (statResult.data) {
          return this.buildExplainFromStat(normalizedPath, statResult.data);
        }
      } catch {
        /* stat also failed, throw original error */
      }

      throw new AFSNotFoundError(path);
    }

    // If the path is a parent of the mount (virtual intermediate directory),
    // return virtual directory explanation
    if (module.remainedModulePath !== "/") {
      const virtualDir = this.resolveVirtualDirectory(normalizedPath, namespace);
      if (virtualDir?.data) {
        return this.buildVirtualDirExplain(normalizedPath, virtualDir.data);
      }
    }

    // Try provider's explain() first
    let result: AFSExplainResult | undefined;
    if (module.module.explain) {
      try {
        result = await module.module.explain(module.subpath, options);
      } catch (error) {
        // Only fallthrough to stat() for "not found" scenarios.
        if (error instanceof AFSNotFoundError) {
          // Expected: provider has no handler for this subpath — try stat() fallback
        } else if (error instanceof AFSError) {
          throw error; // Permission denied, readonly, severity, etc.
        }
        // Non-AFS errors — also try fallback
      }
    }

    // .afs/README.md fallback: if provider explain didn't produce a result,
    // try reading .afs/README.md at this path before falling back to stat()
    if (!result) {
      try {
        const readmePath =
          normalizedPath === "/" ? "/.afs/README.md" : `${normalizedPath}/.afs/README.md`;
        const readme = await this.read(readmePath);
        if (readme.data?.content && typeof readme.data.content === "string") {
          result = { format: "markdown", content: readme.data.content };
        }
      } catch {
        /* no .afs/README.md — continue to stat fallback */
      }
    }

    // Fallback to stat() - build explanation from metadata
    if (!result) {
      const statResult = await this.stat(path, options);
      if (statResult.data) {
        result = this.buildExplainFromStat(normalizedPath, statResult.data);
      }
    }

    if (!result) {
      throw new Error(
        `No explain or stat handler for path: ${normalizedPath} in namespace '${namespace ?? "default"}'`,
      );
    }

    // .afs/skills/ discovery: append available skills to explain output
    return this.appendSkillsToExplain(result, normalizedPath);
  }

  /**
   * Format bytes to human-readable string
   */
  private buildVirtualDirExplain(path: string, data: AFSEntry): AFSExplainResult {
    return buildVirtualDirExplainImpl(path, data);
  }

  private async explainRoot(): Promise<AFSExplainResult> {
    // Resolve descriptions: prefer instance description, fallback to static manifest
    const mounts = this.getMounts(null).map((m) => ({
      path: m.path,
      module: {
        name: m.module.name,
        description:
          m.module.description ??
          (m.module.constructor as { manifest?: () => { description?: string } }).manifest?.()
            ?.description,
      },
    }));
    return explainRootImpl(mounts, () => this.listRootActions());
  }

  private async explainRootAction(path: string): Promise<AFSExplainResult> {
    const result = await explainRootActionImpl(path, () => this.listRootActions());
    if (!result.content) {
      // explainRootActionImpl returns empty content when action not found
      const actionName = path.slice("/.actions/".length);
      throw new AFSNotFoundError(path, `Root action not found: ${actionName}`);
    }
    return result;
  }

  private async explainRootMeta(path: string): Promise<AFSExplainResult> {
    const result = explainRootMetaImpl(path);
    if (!result) {
      throw new AFSNotFoundError(path);
    }
    return result;
  }

  // ── /.knowledge/ system ──

  /** Duck-type check: call summarize() on providers that implement it */
  private tryProviderSummarize(
    mod: AFSModule,
  ): { actions?: Array<{ pattern: string; description: string }>; docs?: string[] } | null {
    const fn = (mod as unknown as { summarize?: () => unknown }).summarize;
    if (typeof fn === "function") {
      return fn.call(mod) as {
        actions?: Array<{ pattern: string; description: string }>;
        docs?: string[];
      };
    }
    return null;
  }

  /**
   * Build the knowledge index from all mounted providers.
   * Cached and invalidated on mount/unmount.
   */
  private buildKnowledgeIndex(): string {
    if (this.knowledgeCache) return this.knowledgeCache;

    const lines: string[] = [];
    lines.push("# AFS Capability Index");
    lines.push("");
    lines.push("One-shot reference of all mounted providers and their capabilities.");
    lines.push("Read `/.knowledge/{provider-name}` for detailed documentation.");
    lines.push("");

    const mounts = this.getMounts(null); // default namespace

    for (const m of mounts) {
      const mod = m.module;
      lines.push(`## ${mod.name} (\`${m.path}\`)`);
      if (mod.description) {
        lines.push(mod.description.split("\n")[0]!);
      }
      lines.push("");

      const summary = this.tryProviderSummarize(mod);

      if (summary?.actions?.length) {
        lines.push("**Actions:**");
        for (const a of summary.actions) {
          const desc = typeof a.description === "string" ? a.description.split(".")[0] : "";
          lines.push(`- \`${m.path}${a.pattern}\` — ${desc}`);
        }
        lines.push("");
      }

      if (summary?.docs?.length) {
        lines.push(`**Docs:** ${summary.docs.map((d) => `\`explain ${m.path}${d}\``).join(", ")}`);
        lines.push("");
      }

      if (!summary) {
        lines.push(`Use \`explain ${m.path}\` and \`list ${m.path}/.actions\` to explore.`);
        lines.push("");
      }
    }

    this.knowledgeCache = lines.join("\n");
    return this.knowledgeCache;
  }

  private readKnowledge(path: string): AFSReadResult {
    if (path === "/.knowledge" || path === "/.knowledge/capabilities") {
      const content = this.buildKnowledgeIndex();
      return {
        data: {
          id: path === "/.knowledge" ? "knowledge" : "capabilities",
          path,
          content,
          meta: { kind: "afs:knowledge" },
        },
      };
    }

    // /.knowledge/{provider-name} — provider-specific detail
    const providerName = path.slice("/.knowledge/".length);
    if (!providerName || providerName.includes("/")) {
      throw new AFSNotFoundError(path);
    }

    const mounts = this.getMounts(null);
    const mount = mounts.find((m) => m.module.name === providerName);
    if (!mount) {
      throw new AFSNotFoundError(path, `No mounted provider named "${providerName}"`);
    }

    const mod = mount.module;
    const summary = this.tryProviderSummarize(mod);

    const lines: string[] = [];
    lines.push(`# ${mod.name}`);
    lines.push(`Mount: \`${mount.path}\``);
    if (mod.description) {
      lines.push("");
      lines.push(mod.description);
    }
    lines.push("");

    if (summary?.actions?.length) {
      lines.push("## Actions");
      lines.push("");
      for (const a of summary.actions) {
        lines.push(`### \`${mount.path}${a.pattern}\``);
        lines.push(a.description);
        lines.push("");
      }
    }

    if (summary?.docs?.length) {
      lines.push("## Documentation Paths");
      lines.push("");
      for (const d of summary.docs) {
        lines.push(`- \`explain ${mount.path}${d}\``);
      }
      lines.push("");
    }

    if (!summary) {
      lines.push(`Use \`explain ${mount.path}\` for full documentation.`);
      lines.push("");
    }

    return {
      data: {
        id: providerName,
        path,
        content: lines.join("\n"),
        meta: { kind: "afs:knowledge" },
      },
    };
  }

  private listKnowledge(): AFSListResult {
    const entries: AFSEntry[] = [
      {
        id: "capabilities",
        path: "/.knowledge/capabilities",
        summary: "Complete AFS capability index — all providers, actions, and docs",
        meta: { kind: "afs:knowledge" },
      },
    ];

    // Add one entry per mounted provider
    const mounts = this.getMounts(null);
    for (const m of mounts) {
      entries.push({
        id: m.module.name,
        path: `/.knowledge/${m.module.name}`,
        summary: m.module.description?.split("\n")[0] ?? m.module.name,
        meta: { kind: "afs:knowledge" },
      });
    }

    return { data: entries };
  }

  private explainKnowledge(path: string): AFSExplainResult {
    if (path === "/.knowledge") {
      return {
        format: "markdown",
        content: [
          "# /.knowledge/ — AFS Knowledge Index",
          "",
          "Auto-generated capability index for efficient LLM discovery.",
          "Rebuilt automatically when providers are mounted or unmounted.",
          "",
          "## Usage",
          "",
          "- `read /.knowledge` — Full capability index (all providers, actions, docs in one read)",
          "- `read /.knowledge/{provider}` — Detailed documentation for a specific provider",
          "- `list /.knowledge` — List all available knowledge entries",
          "",
          "## Design",
          "",
          "**Tier 0** — `read /.knowledge`: One read gives the LLM 80% of what it needs.",
          "**Tier 1** — `read /.knowledge/{provider}`: Drill into a specific provider for full action descriptions.",
          "**Tier 2** — `explain {mount-path}`: Use standard explain for deepest detail.",
        ].join("\n"),
      };
    }

    // For sub-paths, read the knowledge entry and return as explain
    try {
      const readResult = this.readKnowledge(path);
      const content = readResult.data?.content;
      return {
        format: "markdown",
        content: typeof content === "string" ? content : JSON.stringify(content, null, 2),
      };
    } catch {
      throw new AFSNotFoundError(path);
    }
  }

  /**
   * Append .afs/skills/ discovery to explain output.
   * Tries to list {path}/.afs/skills/ and appends skill entries if found.
   * Best-effort: silently returns original result if skills directory doesn't exist.
   */
  private async appendSkillsToExplain(
    result: AFSExplainResult,
    path: string,
  ): Promise<AFSExplainResult> {
    try {
      const skillsPath = path === "/" ? "/.afs/skills" : `${path}/.afs/skills`;
      const skills = await this.list(skillsPath);
      if (skills.data.length > 0) {
        const lines: string[] = ["", "## Available Skills", ""];
        for (const skill of skills.data) {
          const name = skill.summary || skill.id.replace(/\.md$/, "");
          const desc = skill.meta?.description;
          lines.push(`- **${name}**${desc ? ` — ${desc}` : ""}`);
        }
        lines.push("");
        lines.push(`Use \`read ${path}/.afs/skills/{name}.md\` for details.`);
        return {
          ...result,
          content: result.content + lines.join("\n"),
        };
      }
    } catch {
      /* no .afs/skills/ directory — return original result */
    }
    return result;
  }

  private buildExplainFromStat(path: string, data: Omit<AFSEntry, "content">): AFSExplainResult {
    return buildExplainFromStatImpl(path, data);
  }

  private physicalPath?: Promise<string>;

  async initializePhysicalPath(): Promise<string> {
    this.physicalPath ??= (async () => {
      const platform = getPlatform();

      let rootDir: string;
      if (platform.fs?.createTempDir) {
        rootDir = await platform.fs.createTempDir("afs-physical-");
      } else {
        // Adapters without createTempDir: use /tmp + unique ID
        rootDir = platform.path.join("/tmp", `afs-physical-${v7()}`);
        await platform.fs!.mkdir(rootDir, { recursive: true });
      }

      for (const entry of this.mounts.values()) {
        // Create physical path incorporating namespace
        const namespacePart = entry.namespace ?? "_default";
        const physicalModulePath = platform.path.join(rootDir, namespacePart, entry.path);
        await platform.fs!.mkdir(platform.path.dirname(physicalModulePath), { recursive: true });
        await entry.module.symlinkToPhysical?.(physicalModulePath);
      }

      return rootDir;
    })();

    return this.physicalPath;
  }

  async cleanupPhysicalPath(): Promise<void> {
    if (this.physicalPath) {
      const platform = getPlatform();
      const dir = await this.physicalPath;
      if (platform.fs?.cleanupTempDir) {
        await platform.fs.cleanupTempDir(dir);
      } else {
        await platform.fs!.rm(dir, { recursive: true });
      }
      this.physicalPath = undefined;
    }
  }
}
