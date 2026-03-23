/**
 * 4-Step Credential Resolution Flow
 *
 * Step 1: Determine missing fields (from provider schema vs known values)
 * Step 2: Silent resolution (config > env > credential store)
 * Step 3: Interactive collection (provider auth() or default collect())
 * Step 4: Unified persistence (sensitive → credentials.toml, non-sensitive → config options)
 */

import type { AuthContext, JSONSchema7, MountConfig } from "@aigne/afs";
import { resolveEnvFromSchema, separateSensitiveValues } from "@aigne/afs/utils/schema";
import type { CredentialStore } from "./store.js";

export interface ResolveCredentialsOptions {
  /** Mount configuration */
  mount: MountConfig;
  /** JSON Schema for this provider (from z.toJSONSchema() or manifest) */
  schema: JSONSchema7;
  /** Auth context for interactive collection (CLI or MCP) */
  authContext?: AuthContext;
  /** Credential store for reading/writing credentials */
  credentialStore?: CredentialStore;
  /** Provider class with optional auth() method */
  providerAuth?: (context: AuthContext) => Promise<Record<string, unknown> | null>;
  /** Environment variables (defaults to process.env) */
  env?: Record<string, string | undefined>;
  /** Force interactive collection even when all fields are resolved silently.
   *  Used for retry after health-check failure with stale env/store values. */
  forceCollect?: boolean;
}

export interface ResolveCredentialsResult {
  /** All resolved values (merged from all sources) */
  values: Record<string, unknown>;
  /** Values to persist as sensitive credentials */
  sensitive: Record<string, string>;
  /** Values to persist as non-sensitive config options */
  nonSensitive: Record<string, unknown>;
  /** Whether any interactive collection was needed */
  collected: boolean;
}

/**
 * Execute the 4-step credential resolution flow.
 *
 * Returns all resolved values plus their split into sensitive/non-sensitive
 * for persistence. The caller is responsible for actual persistence.
 *
 * @returns null if user declined/cancelled collection
 */
export async function resolveCredentials(
  options: ResolveCredentialsOptions,
): Promise<ResolveCredentialsResult | null> {
  const { mount, schema, authContext, credentialStore, providerAuth, env = process.env } = options;

  const properties = (schema as any).properties;
  if (!properties || typeof properties !== "object" || Object.keys(properties).length === 0) {
    // No fields to resolve
    return { values: {}, sensitive: {}, nonSensitive: {}, collected: false };
  }

  const allFields = Object.keys(properties);
  const requiredFields = ((schema as any).required ?? []) as string[];

  // Only required fields without a schema default truly block silent resolution —
  // optional fields and fields with defaults should not trigger interactive auth.
  const requiredWithoutDefault = requiredFields.filter(
    (f) => properties[f] && properties[f].default === undefined,
  );

  // ─── Step 1: Determine known values from mount config ─────────────────
  const known: Record<string, unknown> = {};

  // Extract values from mount.auth, mount.token, mount.options
  if (mount.auth !== undefined) known.auth = mount.auth;
  if (mount.token !== undefined) known.token = mount.token;
  if (mount.options) {
    for (const [k, v] of Object.entries(mount.options)) {
      if (v !== undefined) known[k] = v;
    }
  }

  // Check which fields are still missing — allFields for Step 1 optimization,
  // requiredWithoutDefault for the Step 2→3 decision on interactive auth.
  const getAllMissing = (resolved: Record<string, unknown>) =>
    allFields.filter((f) => resolved[f] === undefined);
  const getRequiredMissing = (resolved: Record<string, unknown>) =>
    requiredWithoutDefault.filter((f) => resolved[f] === undefined);

  let missing = getAllMissing(known);
  if (missing.length === 0) {
    // All fields already provided via config — short circuit
    const { sensitive, nonSensitive } = separateSensitiveValues(schema, known);
    return { values: { ...known }, sensitive, nonSensitive, collected: false };
  }

  // ─── Step 2: Silent resolution ────────────────────────────────────────
  const resolved: Record<string, unknown> = { ...known };

  // 2a. Environment variables from schema env declarations
  const envResolved = resolveEnvFromSchema(schema, env as Record<string, string | undefined>);
  for (const [field, value] of Object.entries(envResolved)) {
    if (resolved[field] === undefined) {
      resolved[field] = value;
    }
  }

  // 2b. Credential store — keyed by URI (credentials belong to the resource, not the path)
  const storeResolved: Record<string, unknown> = {};
  if (credentialStore) {
    try {
      const stored = await credentialStore.get(mount.uri);
      if (stored) {
        for (const [field, value] of Object.entries(stored)) {
          if (field.startsWith("env:")) {
            // Reconstruct env Record from flattened env:KEY credential entries
            if (resolved.env === undefined) resolved.env = {};
            (resolved.env as Record<string, string>)[field.slice(4)] = value;
            if (storeResolved.env === undefined) storeResolved.env = {};
            (storeResolved.env as Record<string, string>)[field.slice(4)] = value;
          } else {
            if (resolved[field] === undefined) {
              resolved[field] = value;
            }
            storeResolved[field] = value;
          }
        }
      }
    } catch {
      // Credential store read failure is non-fatal
    }
  }

  missing = getRequiredMissing(resolved);
  if (missing.length === 0 && !options.forceCollect) {
    // All required fields resolved silently — skip interactive collection.
    // Optional unfilled fields (e.g., chats) stay empty; users can run
    // `afs program configure` to fill them explicitly.
    const { sensitive, nonSensitive } = separateSensitiveValues(schema, resolved);
    return { values: { ...resolved }, sensitive, nonSensitive, collected: false };
  }

  // ─── Step 3: Interactive collection ───────────────────────────────────
  if (!authContext) {
    // No auth context available — can't collect. Return what we have.
    // Caller should attempt mount with partial values and let the provider error if needed.
    const { sensitive, nonSensitive } = separateSensitiveValues(schema, resolved);
    return { values: { ...resolved }, sensitive, nonSensitive, collected: false };
  }

  let collected: Record<string, unknown> | null = null;

  if (providerAuth) {
    // Provider has custom auth() — delegate to it.
    // Inject persistCredentials so non-blocking auth flows can store
    // credentials in the background (e.g., MCP browser auth).
    collected = await providerAuth({
      ...authContext,
      get resolved() {
        return { ...resolved };
      },
      persistCredentials: credentialStore
        ? async (creds: Record<string, unknown>) => {
            const { sensitive: bgSensitive } = separateSensitiveValues(schema, creds);
            if (Object.keys(bgSensitive).length > 0) {
              await credentialStore.set(mount.uri, bgSensitive);
            }
          }
        : undefined,
    });
  } else {
    // When forceCollect: show ALL fields with current values as defaults.
    // Otherwise: show only fields not already provided via config/CLI args.
    const fieldsForForm = options.forceCollect
      ? allFields
      : allFields.filter((f) => known[f] === undefined);
    const defaults: Record<string, unknown> = {};
    if (options.forceCollect) {
      for (const [f, v] of Object.entries(known)) {
        if (v !== undefined) defaults[f] = v;
      }
    }
    for (const [f, v] of Object.entries(envResolved)) {
      if (defaults[f] === undefined) defaults[f] = v;
    }
    for (const [f, v] of Object.entries(storeResolved)) {
      if (defaults[f] === undefined) defaults[f] = v;
    }
    const missingSchema = buildMissingFieldsSchema(schema, fieldsForForm, defaults);
    collected = await authContext.collect(missingSchema);
  }

  if (collected === null) {
    // User declined/cancelled
    return null;
  }

  // Merge collected values
  for (const [field, value] of Object.entries(collected)) {
    if (value !== undefined) {
      resolved[field] = value;
    }
  }

  // ─── Step 4: Split for persistence ────────────────────────────────────
  // Only split the newly collected values (not the ones from config/env/store)
  const { sensitive, nonSensitive } = separateSensitiveValues(schema, collected);

  return { values: { ...resolved }, sensitive, nonSensitive, collected: true };
}

/**
 * Build a JSON Schema containing only the specified fields from the original schema.
 * Fields with env-resolved values get a `default` so the collection form can pre-fill them.
 */
function buildMissingFieldsSchema(
  schema: JSONSchema7,
  fields: string[],
  envDefaults?: Record<string, unknown>,
): JSONSchema7 {
  const properties = (schema as any).properties ?? {};
  const required = ((schema as any).required ?? []) as string[];

  const fieldProperties: Record<string, unknown> = {};
  const fieldRequired: string[] = [];

  for (const field of fields) {
    if (properties[field]) {
      let prop = properties[field];
      // Pre-fill with env value so user can see and override
      if (envDefaults?.[field] !== undefined && prop.default === undefined) {
        prop = { ...prop, default: envDefaults[field] };
      }
      fieldProperties[field] = prop;
      if (required.includes(field)) {
        fieldRequired.push(field);
      }
    }
  }

  return {
    type: "object",
    properties: fieldProperties,
    ...(fieldRequired.length > 0 ? { required: fieldRequired } : {}),
  } as JSONSchema7;
}
