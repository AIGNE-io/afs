import { AFSPathError, validatePath } from "@aigne/afs";
import { z } from "zod";

/**
 * Characters forbidden in namespace names (security-sensitive)
 */
const NAMESPACE_FORBIDDEN_CHARS = [
  "/", // Path separator
  "\\", // Windows path separator
  ":", // Namespace separator
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
 * Validate namespace name
 */
function validateNamespace(namespace: string): string {
  if (!namespace || namespace.trim() === "") {
    throw new Error("Namespace cannot be empty or whitespace-only");
  }

  for (const char of NAMESPACE_FORBIDDEN_CHARS) {
    if (namespace.includes(char)) {
      throw new Error(`Namespace contains forbidden character: '${char}'`);
    }
  }

  return namespace;
}

/**
 * Mount configuration schema
 */
export const MountSchema = z.object({
  /** Mount path (must follow Unix path semantics) */
  path: z.string().transform((val, ctx) => {
    try {
      return validatePath(val);
    } catch (e) {
      const message = e instanceof AFSPathError ? e.message : "Invalid path";
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message,
      });
      return z.NEVER;
    }
  }),

  /** Provider URI (e.g., fs:///path, git:///repo?branch=main) */
  uri: z.string().min(1, "URI is required"),

  /** Namespace for this mount (optional, defaults to default namespace) */
  namespace: z
    .string()
    .transform((val, ctx) => {
      try {
        return validateNamespace(val);
      } catch (e) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: e instanceof Error ? e.message : "Invalid namespace",
        });
        return z.NEVER;
      }
    })
    .optional(),

  /** Human/LLM readable description */
  description: z.string().optional(),

  /** Access mode: readonly or readwrite */
  access_mode: z.enum(["readonly", "readwrite"]).optional(),

  /** Authentication string (supports ${ENV_VAR} references) */
  auth: z.string().optional(),

  /** Authorization token for HTTP providers (supports ${ENV_VAR} references) */
  token: z.string().optional(),

  /** Provider-specific options (passed through to provider) */
  options: z.record(z.string(), z.unknown()).optional(),

  /** Cache configuration (overrides provider manifest cache declaration) */
  cache: z
    .object({
      /** Disable caching even if provider manifest declares it */
      disabled: z.boolean().optional(),
      /** Override TTL in seconds */
      ttlSeconds: z.number().int().positive().optional(),
      /** Override operations to cache */
      operations: z.array(z.string()).optional(),
    })
    .optional(),
});

/**
 * Serve configuration schema
 */
export const ServeSchema = z.object({
  /** Host address to listen on */
  host: z.string().default("localhost"),

  /** Port to listen on */
  port: z.number().int().positive().default(3000),

  /** Base path for the server */
  path: z.string().default("/afs"),

  /** Run in readonly mode (disable write operations) */
  readonly: z.boolean().default(false),

  /** Enable CORS support */
  cors: z.boolean().default(false),

  /** Maximum request body size in bytes */
  max_body_size: z
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024), // 10MB

  /** Bearer token for authorization (supports ${ENV_VAR} references) */
  token: z.string().optional(),

  /** Enable /sites portal for web-device declared sites */
  sites: z.boolean().default(true),
});

/**
 * Registry configuration schema
 */
export const RegistrySchema = z.object({
  /** Enable/disable auto-mounting the official registry (default: true) */
  enabled: z.boolean().default(true),

  /** Static provider manifests (for offline/testing use) */
  providers: z.array(z.record(z.string(), z.unknown())).optional(),
});

/**
 * Trust configuration schema for [trust] section in config.toml
 */
export const TrustSchema = z.object({
  /** Default trust level for all providers */
  default: z.enum(["none", "conformant", "verified", "certified"]).default("none"),

  /** Per-provider trust level overrides (supports glob patterns) */
  overrides: z
    .record(z.string(), z.enum(["none", "conformant", "verified", "certified"]))
    .default({}),
});

/**
 * DID Space configuration schema for [did_space] section.
 * When present, blocklet storage uses DID Space instead of filesystem.
 */
export const DIDSpaceSchema = z.object({
  /** Root directory for DID Space storage (e.g., ~/.afs/spaces) */
  root_path: z.string(),

  /** Owner DID of this space */
  user_did: z.string(),
});

/**
 * Root configuration schema for afs.toml
 */
export const ConfigSchema = z.object({
  /** List of mount configurations */
  mounts: z.array(MountSchema).default([]),

  /** HTTP server configuration */
  serve: ServeSchema.optional(),

  /** Provider registry configuration */
  registry: RegistrySchema.optional(),

  /** Trust gate configuration */
  trust: TrustSchema.optional(),

  /** DID Space configuration — enables unified blocklet storage */
  did_space: DIDSpaceSchema.optional(),
});

/** Type for a single mount configuration */
export type MountConfig = z.infer<typeof MountSchema>;

/** Type for serve configuration */
export type ServeConfig = z.infer<typeof ServeSchema>;

/** Type for trust gate configuration */
export type TrustConfig = z.infer<typeof TrustSchema>;

/** Type for DID Space configuration */
export type DIDSpaceConfig = z.infer<typeof DIDSpaceSchema>;

/** Type for the root AFS configuration */
export type AFSConfig = z.infer<typeof ConfigSchema>;
