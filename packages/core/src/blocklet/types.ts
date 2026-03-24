/**
 * Blocklet manifest types for AFS Blocklet system.
 */

/**
 * A mount declaration in blocklet.yaml — declares a dependency on a provider.
 */
export interface MountDeclaration {
  /** Provider URI (e.g., "ash://", "telegram://my-bot") */
  uri: string;
  /** Mount target path in Runtime AFS namespace (absolute, e.g., "/ash") */
  target: string;
  /** Whether this mount is required (true = fail if not found, false = skip) */
  required: boolean;
  /** Allowed operations whitelist. undefined = no restriction */
  ops?: string[];
  /**
   * Whether this mount shares a global provider instance (default) or creates its own.
   * - undefined / true — ProjectionProvider wrapping global AFS provider (shared)
   * - false — ProviderRegistry creates an independent provider instance (owned)
   */
  shared?: boolean;
}

/**
 * A site declaration in blocklet.yaml — defines a named site with optional domain and dev port.
 * Routes are defined separately in `.route/` files, not in blocklet.yaml.
 */
export interface SiteDeclaration {
  /** Site name (unique within this blocklet) */
  name: string;
  /** Production domain (e.g., "showcase.aigne.io") */
  domain?: string;
  /** Fixed dev port — deterministic, not random */
  port?: number;
  /** Domain aliases that 301-redirect to the primary domain */
  aliases?: string[];
}

/**
 * Parsed blocklet manifest (blocklet.yaml or program.yaml).
 *
 * Blocklet is a packaging/mount/permission unit — it is NOT tied to UI.
 * UI definitions live in `.aup/app.json` (AUP layer concern).
 *
 * specVersion 1: requires `entrypoint` (ASH/JS script path)
 * specVersion 2: pure packaging — mounts, blocklets, system deps
 */
export interface BlockletManifest {
  /** Manifest format version */
  specVersion: number;
  /** Blocklet unique identifier */
  id: string;
  /** Human-readable blocklet name */
  name: string;
  /** Optional description */
  description?: string;
  /** Entrypoint script path relative to blocklet root (specVersion 1, optional in v2 for ASH) */
  entrypoint?: string;
  /** Dependency mount declarations */
  mounts: MountDeclaration[];
  /** Sub-blocklets to compose */
  blocklets?: string[];
  /** System service dependencies */
  system?: string[];
  /** Site declarations — name + domain + dev port (specVersion 2 only) */
  sites?: SiteDeclaration[];
}

/** @deprecated Use BlockletManifest instead */
export type ProgramManifest = BlockletManifest;
