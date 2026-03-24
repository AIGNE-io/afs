/**
 * Trust Gate — mount-time VC verification for providers.
 *
 * Verifies that a provider's credential meets the required trust level
 * before allowing it to be mounted. Uses dynamic import of @aigne/afs-trust
 * to remain optional (trust checking is only active when trust config is set).
 */

import { AFSMountError } from "./error.js";
import type { AFSModule } from "./type.js";

/**
 * Trust level hierarchy: none < conformant < verified < certified
 */
export type TrustLevel = "none" | "conformant" | "verified" | "certified";

/**
 * Trust configuration — determines required trust level per provider.
 */
export interface TrustConfig {
  default: TrustLevel;
  overrides: Record<string, TrustLevel>;
}

/**
 * Options for the trust gate check.
 */
export interface TrustGateOptions {
  config: TrustConfig;
  trustedIssuers: string[];
  /** Per-mount trust level override. Takes precedence over config defaults and overrides. */
  levelOverride?: TrustLevel;
}

/** Trust level numeric order for comparison. */
const TRUST_LEVEL_ORDER: Record<TrustLevel, number> = {
  none: 0,
  conformant: 1,
  verified: 2,
  certified: 3,
};

/**
 * Resolve the required trust level for a provider name from config.
 * Priority: exact match → glob match → default.
 */
function resolveLevel(providerName: string, config: TrustConfig): TrustLevel {
  // Exact match
  if (config.overrides[providerName]) {
    return config.overrides[providerName]!;
  }

  // Glob match (simple * wildcard)
  for (const [pattern, level] of Object.entries(config.overrides)) {
    if (pattern.includes("*")) {
      const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
      if (regex.test(providerName)) {
        return level;
      }
    }
  }

  return config.default;
}

/**
 * Check if actual trust level is sufficient for the required level.
 */
function isLevelSufficient(actual: TrustLevel, required: TrustLevel): boolean {
  return TRUST_LEVEL_ORDER[actual] >= TRUST_LEVEL_ORDER[required];
}

/** Signature of the VC verification function (from @aigne/afs-trust). */
export type VerifyFn = (params: {
  vc: Record<string, unknown>;
  ownerDid: string;
  trustedIssuers: string[];
}) => Promise<{ valid: boolean; trustLevel?: string; error?: string }>;

/**
 * Check trust gate for a module at mount time.
 *
 * Verifies the module's credential against the required trust level.
 * Throws AFSMountError if the trust requirement is not met.
 *
 * @param module - The provider module being mounted
 * @param options - Trust gate configuration (config + trusted issuers)
 * @param verifyFn - Optional verify function (defaults to dynamic import of @aigne/afs-trust)
 */
export async function checkTrustGate(
  module: AFSModule,
  options: TrustGateOptions,
  verifyFn?: VerifyFn,
): Promise<void> {
  // Per-mount override takes precedence over config
  const requiredLevel = options.levelOverride ?? resolveLevel(module.name, options.config);

  // none = no check needed
  if (requiredLevel === "none") return;

  // No credential → fail
  if (!module.credential) {
    throw new AFSMountError(
      module.name,
      "trust",
      `Trust level '${requiredLevel}' required but no credential found`,
    );
  }

  // Extract provider DID from VC (self-contained)
  const subject = module.credential.credentialSubject as Record<string, unknown> | undefined;
  const ownerDid = subject?.id as string | undefined;
  if (!ownerDid) {
    throw new AFSMountError(module.name, "trust", "Credential missing credentialSubject.id");
  }

  // Resolve verify function: injected or dynamic import
  let verify: VerifyFn;
  if (verifyFn) {
    verify = verifyFn;
  } else {
    const trustPkg = "@aigne/afs-trust";
    let trust: any;
    try {
      trust = await import(trustPkg);
    } catch {
      throw new AFSMountError(
        module.name,
        "trust",
        "Trust verification requires @aigne/afs-trust package",
      );
    }
    verify = trust.verifyVC ?? trust.verifyProviderVC;
  }

  // Verify VC signature + issuer
  // Always include ownerDid: self-signed VCs (conformant level) have signer === ownerDid
  const effectiveIssuers = options.trustedIssuers.includes(ownerDid)
    ? options.trustedIssuers
    : [...options.trustedIssuers, ownerDid];

  const result = await verify({
    vc: module.credential,
    ownerDid,
    trustedIssuers: effectiveIssuers,
  });

  if (!result.valid) {
    throw new AFSMountError(module.name, "trust", `VC verification failed: ${result.error}`);
  }

  // Check level hierarchy
  const actualLevel = (result.trustLevel ?? "conformant") as TrustLevel;
  if (!isLevelSufficient(actualLevel, requiredLevel)) {
    throw new AFSMountError(
      module.name,
      "trust",
      `Trust level '${actualLevel}' insufficient, '${requiredLevel}' required`,
    );
  }
}
