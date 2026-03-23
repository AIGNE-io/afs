/**
 * CapabilityEnforcer — runtime enforcement of provider capability declarations.
 *
 * Three enforcement levels:
 * - none: no checking, no logging (default, backward compatible)
 * - audit: log all capability uses and violations, but never block
 * - enforce: block undeclared capabilities, throw on violation
 */

import type { AFSRoot, IsolationLevel, ProviderCapabilityManifest } from "./type.js";

// =============================================================================
// Types
// =============================================================================

/** Capability check result */
export interface CapabilityCheckResult {
  allowed: boolean;
  reason?: string;
}

/** Event emitted by the enforcer for audit/monitoring */
export interface CapabilityEvent {
  /** "capability-use" = declared and used, "capability-violation" = undeclared use */
  type: "capability-use" | "capability-violation";
  /** Provider name or mount path */
  provider: string;
  /** Capability category being checked */
  capability: string;
  /** Details about the access */
  detail: Record<string, unknown>;
  /** Timestamp */
  timestamp: number;
}

export type CapabilityEventHandler = (event: CapabilityEvent) => void;

/** Options for creating a CapabilityEnforcer */
export interface CapabilityEnforcerOptions {
  level?: IsolationLevel;
  onEvent?: CapabilityEventHandler;
  /** User-granted extra capabilities beyond manifest */
  grantedCapabilities?: Partial<ProviderCapabilityManifest>;
  /** User-denied capabilities (always wins) */
  deniedCapabilities?: Partial<ProviderCapabilityManifest>;
}

// =============================================================================
// Domain matching
// =============================================================================

/**
 * Check if a domain matches an allowed domain pattern.
 * Supports wildcards: "*.amazonaws.com" matches "s3.us-east-1.amazonaws.com"
 */
function domainMatches(domain: string, pattern: string): boolean {
  if (pattern === domain) return true;

  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1); // ".amazonaws.com"
    return domain.endsWith(suffix) && domain.length > suffix.length;
  }

  return false;
}

// =============================================================================
// Path matching for crossProvider readPaths/execPaths
// =============================================================================

/**
 * Check if a path matches an allowed path pattern.
 * Supports trailing wildcard: "/modules/vault/*" matches "/modules/vault/secret"
 */
function pathMatches(path: string, pattern: string): boolean {
  if (pattern === path) return true;

  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -1); // "/modules/vault/"
    return path.startsWith(prefix);
  }

  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -2); // "/modules/vault/"
    return path.startsWith(prefix);
  }

  return false;
}

// =============================================================================
// CapabilityEnforcer
// =============================================================================

export class CapabilityEnforcer {
  readonly level: IsolationLevel;
  private onEvent?: CapabilityEventHandler;
  private grantedCapabilities?: Partial<ProviderCapabilityManifest>;
  private deniedCapabilities?: Partial<ProviderCapabilityManifest>;

  constructor(options?: CapabilityEnforcerOptions) {
    this.level = options?.level ?? "none";
    this.onEvent = options?.onEvent;
    this.grantedCapabilities = options?.grantedCapabilities;
    this.deniedCapabilities = options?.deniedCapabilities;
  }

  /**
   * Check if a capability use is allowed.
   *
   * @param provider - Provider name or mount path
   * @param manifest - Provider's declared capabilities
   * @param capability - Capability category ("network", "crossProvider", "process", "filesystem")
   * @param detail - Access details (varies by category)
   */
  check(
    provider: string,
    manifest: ProviderCapabilityManifest,
    capability: string,
    detail: Record<string, unknown>,
  ): CapabilityCheckResult {
    // Level "none" — no checking at all
    if (this.level === "none") {
      return { allowed: true };
    }

    // Check user denials first (always wins)
    const denialResult = this.checkDenied(capability, detail);
    if (denialResult) {
      this.emit("capability-violation", provider, capability, detail);
      if (this.level === "enforce") {
        return { allowed: false, reason: denialResult };
      }
      return { allowed: true }; // audit = allow
    }

    // Merge manifest with grantedCapabilities
    const effectiveManifest = this.mergeGranted(manifest);

    // Category-specific checks
    const result = this.checkCapability(effectiveManifest, capability, detail);

    if (result.allowed) {
      this.emit("capability-use", provider, capability, detail);
    } else {
      this.emit("capability-violation", provider, capability, detail);
      if (this.level === "audit") {
        // Audit mode: allow but log
        return { allowed: true };
      }
    }

    return result;
  }

  private checkCapability(
    manifest: ProviderCapabilityManifest,
    capability: string,
    detail: Record<string, unknown>,
  ): CapabilityCheckResult {
    switch (capability) {
      case "network":
        return this.checkNetwork(manifest, detail);
      case "crossProvider":
        return this.checkCrossProvider(manifest, detail);
      case "process":
        return this.checkProcess(manifest, detail);
      case "filesystem":
        return this.checkFilesystem(manifest, detail);
      default:
        return { allowed: true };
    }
  }

  private checkNetwork(
    manifest: ProviderCapabilityManifest,
    detail: Record<string, unknown>,
  ): CapabilityCheckResult {
    if (!manifest.network?.egress) {
      return { allowed: false, reason: "Network egress not declared in capability manifest" };
    }

    const domain = detail.domain as string | undefined;
    if (domain && manifest.network.allowedDomains?.length) {
      const allowed = manifest.network.allowedDomains.some((pattern) =>
        domainMatches(domain, pattern),
      );
      if (!allowed) {
        return {
          allowed: false,
          reason: `Domain ${domain} not in allowedDomains: ${manifest.network.allowedDomains.join(", ")}`,
        };
      }
    }

    return { allowed: true };
  }

  private checkCrossProvider(
    manifest: ProviderCapabilityManifest,
    detail: Record<string, unknown>,
  ): CapabilityCheckResult {
    if (!manifest.crossProvider?.afsAccess) {
      return {
        allowed: false,
        reason: "Cross-provider AFS access not declared in capability manifest",
      };
    }

    const op = detail.op as string | undefined;
    const path = detail.path as string | undefined;

    if (path && op === "read" && manifest.crossProvider.readPaths?.length) {
      const allowed = manifest.crossProvider.readPaths.some((pattern) =>
        pathMatches(path, pattern),
      );
      if (!allowed) {
        return {
          allowed: false,
          reason: `Cross-provider read to ${path} not in readPaths`,
        };
      }
    }

    if (path && op === "exec" && manifest.crossProvider.execPaths?.length) {
      const allowed = manifest.crossProvider.execPaths.some((pattern) =>
        pathMatches(path, pattern),
      );
      if (!allowed) {
        return {
          allowed: false,
          reason: `Cross-provider exec to ${path} not in execPaths`,
        };
      }
    }

    return { allowed: true };
  }

  private checkProcess(
    manifest: ProviderCapabilityManifest,
    detail: Record<string, unknown>,
  ): CapabilityCheckResult {
    if (!manifest.process?.spawn) {
      return { allowed: false, reason: "Process spawn not declared in capability manifest" };
    }

    const command = detail.command as string | undefined;
    if (command && manifest.process.allowedCommands?.length) {
      const allowed = manifest.process.allowedCommands.includes(command);
      if (!allowed) {
        return {
          allowed: false,
          reason: `Command ${command} not in allowedCommands: ${manifest.process.allowedCommands.join(", ")}`,
        };
      }
    }

    return { allowed: true };
  }

  private checkFilesystem(
    manifest: ProviderCapabilityManifest,
    detail: Record<string, unknown>,
  ): CapabilityCheckResult {
    const isWrite = detail.write === true;

    if (isWrite && !manifest.filesystem?.write) {
      return { allowed: false, reason: "Filesystem write not declared in capability manifest" };
    }

    if (!isWrite && !manifest.filesystem?.read) {
      return { allowed: false, reason: "Filesystem read not declared in capability manifest" };
    }

    return { allowed: true };
  }

  private checkDenied(capability: string, _detail: Record<string, unknown>): string | null {
    if (!this.deniedCapabilities) return null;

    const denied = this.deniedCapabilities as Record<string, unknown>;
    const capValue = denied[capability];

    if (!capValue) return null;

    // Simple check: if the capability category is denied at all, block it
    if (typeof capValue === "object" && capValue !== null) {
      const cap = capValue as Record<string, unknown>;
      // For network: check if egress is denied
      if (capability === "network" && cap.egress) {
        return `Capability '${capability}' denied by user configuration`;
      }
      // For crossProvider: check if afsAccess is denied
      if (capability === "crossProvider" && cap.afsAccess) {
        return `Capability '${capability}' denied by user configuration`;
      }
      // For process: check if spawn is denied
      if (capability === "process" && cap.spawn) {
        return `Capability '${capability}' denied by user configuration`;
      }
      // For filesystem: check if read/write is denied
      if (capability === "filesystem" && (cap.read || cap.write)) {
        return `Capability '${capability}' denied by user configuration`;
      }
    }

    return null;
  }

  private mergeGranted(manifest: ProviderCapabilityManifest): ProviderCapabilityManifest {
    if (!this.grantedCapabilities) return manifest;

    const result = { ...manifest };
    const granted = this.grantedCapabilities;

    // Merge each capability category
    if (granted.network && !result.network) {
      result.network = granted.network;
    }
    if (granted.crossProvider && !result.crossProvider) {
      result.crossProvider = granted.crossProvider;
    }
    if (granted.process && !result.process) {
      result.process = granted.process;
    }
    if (granted.filesystem && !result.filesystem) {
      result.filesystem = granted.filesystem;
    }

    return result;
  }

  private emit(
    type: "capability-use" | "capability-violation",
    provider: string,
    capability: string,
    detail: Record<string, unknown>,
  ): void {
    this.onEvent?.({
      type,
      provider,
      capability,
      detail,
      timestamp: Date.now(),
    });
  }
}

// =============================================================================
// Scoped AFS Proxy
// =============================================================================

/**
 * Create a Proxy around AFSRoot that intercepts read/list/exec/search calls
 * for capability enforcement.
 *
 * Used in exec() context injection and onMount() to scope cross-provider access.
 */
export function createScopedAFSProxy(
  afs: AFSRoot,
  manifest: ProviderCapabilityManifest,
  enforcer: CapabilityEnforcer,
  callerIdentity: string,
): AFSRoot {
  const interceptedOps = new Set(["read", "list", "exec", "search"]);

  return new Proxy(afs, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && interceptedOps.has(prop)) {
        const originalFn = Reflect.get(target, prop, receiver);
        if (typeof originalFn !== "function") return originalFn;

        return (path: string, ...args: unknown[]) => {
          const result = enforcer.check(callerIdentity, manifest, "crossProvider", {
            op: prop,
            path,
          });

          if (!result.allowed) {
            throw new Error(
              `Capability violation: ${callerIdentity} attempted ${prop}("${path}") — ${result.reason}`,
            );
          }

          return originalFn.call(target, path, ...args);
        };
      }

      return Reflect.get(target, prop, receiver);
    },
  });
}
