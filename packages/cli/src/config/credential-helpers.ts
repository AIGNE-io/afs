/**
 * Credential Resolution Helpers
 *
 * Extracted from afs-loader.ts to separate credential resolution concerns
 * from AFS lifecycle management. All credential-related logic lives here:
 * - URI env extraction (MCP schemes)
 * - URI template variable merging
 * - Credential resolution + merge into mount config
 * - Credential persistence
 * - CLI mount add credential resolution
 */

import type { AuthContext, MountConfig } from "@aigne/afs";
import { ProviderRegistry } from "@aigne/afs";
import { parseURI } from "@aigne/afs/utils/uri";
import type { CredentialStore } from "../credential/store.js";

// ─── URI & Template Manipulation ─────────────────────────────────────────

/**
 * Extract env query params from MCP URIs for secure credential storage.
 *
 * MCP servers receive secrets via env vars (e.g., `mcp+stdio://npx?env=API_KEY=sk-xxx`).
 * This function extracts env params from the URI so they can be stored in credentials.toml
 * instead of being persisted in plaintext in config.toml.
 *
 * Only applies to MCP schemes (mcp://, mcp+stdio://, mcp+sse://).
 * Non-MCP URIs are returned unchanged.
 */
export function extractEnvFromURI(uri: string): {
  cleanUri: string;
  envRecord: Record<string, string>;
} {
  const parsed = parseURI(uri);
  const envRecord: Record<string, string> = {};

  // Only extract env for MCP schemes
  if (!parsed.scheme.startsWith("mcp")) {
    return { cleanUri: uri, envRecord };
  }

  const envValues = parsed.query.env;
  if (!envValues) return { cleanUri: uri, envRecord };

  // Parse env=KEY=VALUE format (split on first = only)
  const envList = Array.isArray(envValues) ? envValues : [envValues];
  for (const entry of envList) {
    const eqIdx = entry.indexOf("=");
    if (eqIdx > 0) {
      envRecord[entry.slice(0, eqIdx)] = entry.slice(eqIdx + 1);
    }
  }

  // Rebuild URI without env params, preserving other query params
  const queryIndex = uri.indexOf("?");
  if (queryIndex < 0) return { cleanUri: uri, envRecord };

  const rawQuery = uri.slice(queryIndex + 1);
  const params = new URLSearchParams(rawQuery);
  params.delete("env");
  const newQuery = params.toString();
  const base = uri.slice(0, queryIndex);
  const cleanUri = newQuery ? `${base}?${newQuery}` : base;

  return { cleanUri, envRecord };
}

/**
 * Extract template variables from mount.uri using the manifest's uriTemplate
 * and merge them into mount.options so the credential resolver sees them as "known".
 */
export function mergeTemplateVarsIntoMount(
  mount: MountConfig,
  manifest: import("@aigne/afs").ProviderManifest | null | undefined,
): void {
  if (!manifest?.uriTemplate) return;
  const { parseTemplate } =
    require("@aigne/afs/utils/uri-template") as typeof import("@aigne/afs/utils/uri-template");
  const parsed = parseURI(mount.uri);
  let templateVars: Record<string, string | undefined>;
  try {
    templateVars = parseTemplate(manifest.uriTemplate, parsed.body);
  } catch {
    return; // Body doesn't match template yet — nothing to merge
  }
  for (const [key, value] of Object.entries(templateVars)) {
    if (value !== undefined) {
      if (!mount.options) mount.options = {};
      if (mount.options[key] === undefined) {
        mount.options[key] = value;
      }
    }
  }
}

/**
 * After credential resolution, rebuild mount.uri from the template if the
 * current URI body is empty/incomplete and resolved options can fill template vars.
 */
export function rebuildURIFromTemplate(
  mount: MountConfig,
  manifest: import("@aigne/afs").ProviderManifest | null | undefined,
): void {
  if (!manifest?.uriTemplate) return;
  const { buildURI, getTemplateVariableNames } =
    require("@aigne/afs/utils/uri-template") as typeof import("@aigne/afs/utils/uri-template");
  const varNames = getTemplateVariableNames(manifest.uriTemplate);
  if (varNames.length === 0) return;

  const parsed = parseURI(mount.uri);
  const { parseTemplate } =
    require("@aigne/afs/utils/uri-template") as typeof import("@aigne/afs/utils/uri-template");
  let existingVars: Record<string, string | undefined>;
  try {
    existingVars = parseTemplate(manifest.uriTemplate, parsed.body);
  } catch {
    existingVars = {};
  }

  const allVars: Record<string, string | undefined> = { ...existingVars };
  for (const name of varNames) {
    if (!allVars[name] && mount.options?.[name] != null) {
      allVars[name] = String(mount.options[name]);
    }
  }

  try {
    const newURI = buildURI(manifest.uriTemplate, allVars);
    if (newURI !== mount.uri) {
      mount.uri = newURI;
    }
  } catch {
    // Still can't build a complete URI — that's OK, createProvider will handle it
  }
}

/**
 * Normalize mount URI by filling optional template variables with defaults.
 *
 * e.g., `aignehub://` → `aignehub://hub.aigne.io` when host defaults to "hub.aigne.io".
 * This ensures credential store lookups use a canonical URI regardless of
 * whether the user typed `aignehub://` or `aignehub://hub.aigne.io`.
 *
 * Default sources (in priority order):
 * 1. manifest.uriDefaults — explicit defaults declared by the provider
 * 2. schema.properties[name].default — JSON Schema defaults (may be absent
 *    if z.toJSONSchema() strips metadata in certain runtime environments)
 * 3. manifest.schema Zod internals — extracts defaultValue from Zod 4's
 *    internal _zod.def structure (fallback when JSON Schema conversion loses metadata)
 */
export function normalizeURIWithSchemaDefaults(
  mount: MountConfig,
  manifest: import("@aigne/afs").ProviderManifest | null | undefined,
  schema: any | null | undefined,
): void {
  if (!manifest?.uriTemplate) return;

  const { getTemplateVariableNames, parseTemplate, buildURI } =
    require("@aigne/afs/utils/uri-template") as typeof import("@aigne/afs/utils/uri-template");
  const varNames = getTemplateVariableNames(manifest.uriTemplate);
  if (varNames.length === 0) return;

  const parsed = parseURI(mount.uri);
  let existingVars: Record<string, string | undefined>;
  try {
    existingVars = parseTemplate(manifest.uriTemplate, parsed.body);
  } catch {
    existingVars = {};
  }

  // Fill missing template vars with defaults
  const allVars = { ...existingVars };
  let filled = false;
  const properties = (schema as any)?.properties;

  // Pre-extract Zod defaults from manifest.schema internals (Zod 4: _zod.def.shape)
  const zodShape = (manifest.schema as any)?._zod?.def?.shape;

  for (const name of varNames) {
    if (allVars[name] === undefined) {
      // Try sources in priority order
      let defaultValue: string | undefined =
        manifest.uriDefaults?.[name] ??
        (properties?.[name]?.default !== undefined ? String(properties[name].default) : undefined);

      // Fallback: extract from Zod schema internals
      if (defaultValue === undefined && zodShape?.[name]) {
        const zodDef = zodShape[name]._zod?.def;
        if (zodDef?.type === "default" && zodDef.defaultValue !== undefined) {
          defaultValue = String(zodDef.defaultValue);
        }
      }

      if (defaultValue !== undefined) {
        allVars[name] = defaultValue;
        if (!mount.options) mount.options = {};
        if (mount.options[name] === undefined) {
          mount.options[name] = defaultValue;
        }
        filled = true;
      }
    }
  }

  if (!filled) return;

  try {
    const newURI = buildURI(manifest.uriTemplate, allVars);
    if (newURI !== mount.uri) {
      mount.uri = newURI;
    }
  } catch {
    // Can't rebuild — leave as is
  }
}

// ─── Credential Resolution Core ─────────────────────────────────────────

/**
 * Attempt credential resolution for a mount, merging resolved values into mount.options.
 *
 * Returns the credential result if any fields were collected interactively,
 * or null if no interactive collection was needed (or no schema/authContext).
 *
 * This function mutates mount.options and mount.auth/mount.token when credentials
 * are resolved, so the subsequent registry.createProvider(mount) receives complete values.
 */
export async function resolveAndMergeCredentials(
  mount: MountConfig,
  authContext: AuthContext | undefined,
  credentialStore: CredentialStore | undefined,
  registry: ProviderRegistry,
  opts?: { forceCollect?: boolean },
): Promise<import("../credential/resolver.js").ResolveCredentialsResult | null> {
  const info = await registry.getProviderInfo(mount.uri);
  const schema = info?.schema ?? null;
  const providerAuth = info?.auth;

  // Normalize URI before credential lookup (fills optional template vars with defaults).
  // Must run before the schema check — even without schema, manifest.uriDefaults can normalize.
  mergeTemplateVarsIntoMount(mount, info?.manifest);
  normalizeURIWithSchemaDefaults(mount, info?.manifest, schema);

  if (!schema) return null;

  const { getSensitiveFields } = await import("@aigne/afs/utils/schema");
  const sensitiveFieldsInSchema = getSensitiveFields(schema);
  const schemaProps = (schema as any).properties ?? {};
  const hasEnvFields = Object.values(schemaProps).some((p: any) => Array.isArray(p?.env));
  if (sensitiveFieldsInSchema.length === 0 && !hasEnvFields && !providerAuth) return null;

  const { resolveCredentials } = await import("../credential/resolver.js");

  const result = await resolveCredentials({
    mount,
    schema,
    authContext,
    credentialStore,
    providerAuth,
    forceCollect: opts?.forceCollect,
  });

  if (!result) {
    const fieldNames = Object.keys((schema as any).properties ?? {});
    const known = new Set<string>();
    if (mount.auth !== undefined) known.add("auth");
    if (mount.token !== undefined) known.add("token");
    if (mount.options) {
      for (const k of Object.keys(mount.options)) known.add(k);
    }
    const missing = fieldNames.filter((f) => !known.has(f));
    const fieldList = missing.length > 0 ? missing.join(", ") : fieldNames.join(", ");
    throw new Error(
      `Missing credentials: ${fieldList}. ` +
        `Retry with them as args, e.g. { "uri": "${mount.uri}", "path": "${mount.path}", ${missing.map((f) => `"${f}": "..."`).join(", ")} }`,
    );
  }

  if (Object.keys(result.values).length > 0) {
    if (result.values.token !== undefined && mount.token === undefined) {
      mount.token = String(result.values.token);
    }
    if (result.values.auth !== undefined && mount.auth === undefined) {
      mount.auth = String(result.values.auth);
    }

    const mergedOpts = mount.options ?? {};
    for (const [key, value] of Object.entries(result.values)) {
      if (key !== "token" && key !== "auth" && mergedOpts[key] === undefined) {
        mergedOpts[key] = value;
      }
    }
    if (Object.keys(mergedOpts).length > 0) {
      mount.options = mergedOpts;
    }
  }

  rebuildURIFromTemplate(mount, info?.manifest);

  return result.collected ? result : null;
}

/**
 * Persist credential resolution result (sensitive → credentials.toml).
 */
export async function persistCredentialResult(
  mount: MountConfig,
  result: import("../credential/resolver.js").ResolveCredentialsResult,
): Promise<void> {
  if (Object.keys(result.sensitive).length > 0) {
    try {
      const { createCredentialStore } = await import("../credential/store.js");
      const store = createCredentialStore();
      await store.set(mount.uri, result.sensitive);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[mount] credential persistence failed: ${msg}`);
    }
  }
}

/**
 * Load stored credentials and merge into mount options during startup.
 */
export async function mergeStoredCredentials(
  mounts: MountConfig[],
  _mountSources: Map<string, string>,
  store: CredentialStore,
): Promise<void> {
  for (const mount of mounts) {
    try {
      const stored = await store.get(mount.uri);
      if (stored) {
        const opts = mount.options ?? {};
        for (const [key, value] of Object.entries(stored)) {
          if (key.startsWith("env:")) {
            if (!opts.env) opts.env = {};
            (opts.env as Record<string, string>)[key.slice(4)] = value;
          } else if (opts[key] === undefined) {
            opts[key] = value;
          }
        }
        if (Object.keys(opts).length > 0) {
          mount.options = opts;
        }
      }
    } catch {
      // Credential lookup failure is non-fatal
    }
  }
}

// ─── Exported Credential Resolution for CLI mount add ───────────────────────

export interface ResolveCredentialsForMountOptions {
  cwd: string;
  uri: string;
  mountPath: string;
  authContext?: AuthContext;
  credentialStore?: CredentialStore;
  extraOptions?: Record<string, unknown>;
  sensitiveArgs?: string[];
  registry?: ProviderRegistry;
  forceCollect?: boolean;
}

export interface ResolveCredentialsForMountResult {
  collected: boolean;
  nonSensitive: Record<string, unknown>;
  allValues: Record<string, unknown>;
  persistCredentials: () => Promise<void>;
  sensitiveFields: string[];
  configUri?: string;
  /** URI after template rebuild with resolved values (may differ from input URI) */
  resolvedUri?: string;
}

/**
 * Resolve and persist credentials for a mount configuration.
 *
 * Used by `mount add` CLI command to trigger credential collection
 * at add-time rather than deferring to AFS creation.
 */
export async function resolveCredentialsForMount(
  options: ResolveCredentialsForMountOptions,
): Promise<ResolveCredentialsForMountResult | null> {
  const { uri, mountPath, authContext, credentialStore, extraOptions, sensitiveArgs } = options;

  const { cleanUri: configUri, envRecord } = extractEnvFromURI(uri);
  const hasExtractedEnv = Object.keys(envRecord).length > 0;

  const registry = options.registry ?? new ProviderRegistry();
  const info = await registry.getProviderInfo(uri);
  let schema = info?.schema ?? null;
  const providerAuth = info?.auth;

  if (!schema && extraOptions && Object.keys(extraOptions).length > 0) {
    const { buildAdHocSchema } = await import("@aigne/afs/utils/schema");
    schema = buildAdHocSchema(extraOptions, sensitiveArgs ?? []);
  }

  const envOnlyResult = (): ResolveCredentialsForMountResult | null => {
    if (!hasExtractedEnv) return null;
    return {
      collected: false,
      nonSensitive: {},
      allValues: {},
      persistCredentials: async () => {
        const toStore: Record<string, string> = {};
        for (const [key, val] of Object.entries(envRecord)) {
          toStore[`env:${key}`] = val;
        }
        if (credentialStore) {
          try {
            await credentialStore.set(configUri, toStore);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[mount add] credential persistence failed: ${msg}`);
          }
        }
      },
      sensitiveFields: [],
      configUri,
    };
  };

  if (!schema) return envOnlyResult();

  const properties = (schema as any).properties;
  if (!properties || Object.keys(properties).length === 0) return envOnlyResult();

  if (sensitiveArgs && sensitiveArgs.length > 0) {
    const mergedProps = { ...properties };
    let changed = false;
    for (const field of sensitiveArgs) {
      if (mergedProps[field]) {
        mergedProps[field] = { ...mergedProps[field], sensitive: true };
        changed = true;
      } else if (extraOptions?.[field] !== undefined) {
        const value = extraOptions[field];
        mergedProps[field] = {
          type:
            typeof value === "number"
              ? "number"
              : typeof value === "boolean"
                ? "boolean"
                : "string",
          sensitive: true,
        };
        changed = true;
      }
    }
    if (changed) {
      schema = { ...schema, properties: mergedProps } as typeof schema;
    }
  }

  const { getSensitiveFields } = await import("@aigne/afs/utils/schema");
  const sensitiveFieldsInSchema = getSensitiveFields(schema);
  const schemaProps = (schema as any).properties;
  const hasEnvFields = Object.values(schemaProps).some((p: any) => Array.isArray(p?.env));
  if (sensitiveFieldsInSchema.length === 0 && !hasEnvFields && !extraOptions)
    return envOnlyResult();

  const mount: MountConfig = { uri, path: mountPath };

  if (extraOptions && Object.keys(extraOptions).length > 0) {
    mount.options = { ...(mount.options ?? {}), ...extraOptions };
  }

  mergeTemplateVarsIntoMount(mount, info?.manifest);
  normalizeURIWithSchemaDefaults(mount, info?.manifest, schema);

  const { resolveCredentials } = await import("../credential/resolver.js");

  const result = await resolveCredentials({
    mount,
    schema,
    authContext,
    credentialStore,
    providerAuth,
    forceCollect: options.forceCollect,
  });

  if (!result) {
    const fieldNames = Object.keys(properties);
    throw new Error(
      `Missing credentials: ${fieldNames.join(", ")}. ` +
        `Retry with them as args, e.g. { "uri": "${uri}", "path": "${mountPath}", ${fieldNames.map((f) => `"${f}": "..."`).join(", ")} }`,
    );
  }

  // Merge resolved values into mount.options so rebuildURIFromTemplate can
  // fill template variables (e.g. bot name collected via form → URI body).
  if (Object.keys(result.values).length > 0) {
    const opts = mount.options ?? {};
    for (const [key, value] of Object.entries(result.values)) {
      if (key === "token" || key === "auth") continue;
      // When user collected new values (forceCollect), allow overwriting existing
      if (result.collected || opts[key] === undefined) {
        opts[key] = value;
      }
    }
    if (Object.keys(opts).length > 0) {
      mount.options = opts;
    }
  }

  // Rebuild URI from template with all resolved values (may change mount.uri)
  rebuildURIFromTemplate(mount, info?.manifest);
  const resolvedUri = mount.uri !== uri ? mount.uri : undefined;

  // Credential store key: use rebuilt URI if available, otherwise cleaned original
  const storeKey = resolvedUri ?? configUri;

  const sensitiveFieldSet = new Set(sensitiveFieldsInSchema);

  const flatSensitive: Record<string, string> = {};
  for (const field of sensitiveFieldsInSchema) {
    const val = result.values[field];
    if (val === undefined) continue;
    if (field === "env" && typeof val === "object" && val !== null) {
      for (const [envKey, envVal] of Object.entries(val as Record<string, string>)) {
        flatSensitive[`env:${envKey}`] = String(envVal);
      }
    } else {
      flatSensitive[field] = String(val);
    }
  }

  const nonSensitive: Record<string, unknown> = result.collected
    ? result.nonSensitive
    : extraOptions
      ? Object.fromEntries(Object.entries(extraOptions).filter(([k]) => !sensitiveFieldSet.has(k)))
      : {};

  const persistCredentials = async () => {
    const toStore = { ...flatSensitive };
    for (const [key, val] of Object.entries(envRecord)) {
      toStore[`env:${key}`] = val;
    }
    if (Object.keys(toStore).length > 0 && credentialStore) {
      try {
        await credentialStore.set(storeKey, toStore);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[mount add] credential persistence failed: ${msg}`);
      }
    }
  };

  return {
    collected: result.collected,
    nonSensitive,
    allValues: result.values,
    persistCredentials,
    sensitiveFields: sensitiveFieldsInSchema,
    configUri: hasExtractedEnv ? configUri : undefined,
    resolvedUri,
  };
}
