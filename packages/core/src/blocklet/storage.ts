/**
 * BlockletStorage — abstract storage interface for blocklet code, data, and config.
 *
 * Implementations:
 * - LegacyFilesystemStorage: wraps existing ~/.afs-config/ filesystem layout
 * - DIDSpaceBlockletStorage: uses DID Space for unified storage
 */

import type { AFS } from "../afs.js";
import type { MountOverride } from "./blocklet-afs.js";
import type { BlockletManifest } from "./types.js";

export interface BlockletStorage {
  // ── Code management ──

  /**
   * Copy blocklet code from a source AFS path into storage.
   * Recursively copies all files under sourcePath.
   */
  writeCode(blockletDid: string, sourceAFS: AFS, sourcePath: string): Promise<void>;

  /** Read and parse blocklet.yaml from stored code. */
  readManifest(blockletDid: string): Promise<BlockletManifest>;

  /** Check if code exists for a blocklet. */
  codeExists(blockletDid: string): Promise<boolean>;

  /** Remove stored code for a blocklet. */
  removeCode(blockletDid: string): Promise<void>;

  /**
   * Get a read-only AFS scoped to the stored blocklet code.
   * Root of the returned AFS corresponds to the blocklet code root.
   */
  getCodeAFS(blockletDid: string): Promise<AFS>;

  // ── Data management ──

  /**
   * Get an AFS instance for blocklet runtime data.
   * The returned AFS provides readwrite access to the blocklet's data storage.
   */
  getDataAFS(blockletDid: string): Promise<AFS>;

  /** Remove all data for a blocklet. */
  removeData(blockletDid: string): Promise<void>;

  // ── Mount overrides ──

  /** Read per-instance mount overrides. */
  readMountOverrides(blockletDid: string): Promise<MountOverride[]>;

  /** Write per-instance mount overrides (merge semantics). */
  writeMountOverrides(blockletDid: string, overrides: MountOverride[]): Promise<void>;

  // ── Mount table ──

  /** List all blocklet mounts. */
  listMounts(): Promise<Array<{ path: string; uri: string }>>;

  /** Get mount config for a specific blocklet. */
  getMount(blockletDid: string): Promise<{ path: string; uri: string } | null>;

  /** Set mount config for a blocklet. */
  setMount(blockletDid: string, config: { path: string; uri: string }): Promise<void>;

  /** Remove mount config for a blocklet. */
  removeMount(blockletDid: string): Promise<void>;
}
