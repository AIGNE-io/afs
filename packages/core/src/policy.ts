import type { SecurityConfig, SecurityProfile } from "./type.js";

/**
 * Resolve an effective security profile by merging a base profile with user overrides.
 *
 * Merge rules:
 * - blockedActions: union (user can only add, not remove provider defaults)
 * - sensitiveFields: union (user can only add fields to mask)
 * - allowedActions: replace (user's whitelist overrides base entirely)
 * - All other fields: user override wins
 */
export function resolveEffectivePolicy(
  profiles: Record<string, SecurityProfile>,
  config: SecurityConfig | string,
): SecurityProfile {
  const profileName = typeof config === "string" ? config : config.profile;
  const base = profiles[profileName];
  if (!base) throw new Error(`Unknown security profile: ${profileName}`);

  if (typeof config === "string" || !config.overrides) return base;

  const overrides = config.overrides;

  // Short-circuit if overrides is empty
  if (Object.keys(overrides).length === 0) return base;

  return {
    ...base,
    ...overrides,
    // Array fields: union (user adds to provider defaults)
    blockedActions: unique([...(base.blockedActions ?? []), ...(overrides.blockedActions ?? [])]),
    sensitiveFields: unique([
      ...(base.sensitiveFields ?? []),
      ...(overrides.sensitiveFields ?? []),
    ]),
    // allowedActions: user override replaces base (not merged)
    ...(overrides.allowedActions !== undefined
      ? { allowedActions: overrides.allowedActions }
      : base.allowedActions !== undefined
        ? { allowedActions: base.allowedActions }
        : {}),
  };
}

function unique(arr: string[]): string[] {
  return [...new Set(arr)];
}
