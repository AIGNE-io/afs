import type { AFSRoot } from "../type.js";

export interface PersistenceConfig<TSnapshot> {
  /** AFS path for storing snapshot data */
  storagePath: string | undefined;
  /** Return current state as a snapshot */
  getSnapshot: () => TSnapshot;
  /** Apply a restored snapshot. Throw to reject invalid data. */
  applySnapshot: (data: TSnapshot, now: number) => void;
  /** Expected snapshot version number */
  snapshotVersion: number;
  /** Optional: validate raw JSON before applying. Should throw on invalid data. */
  validateSnapshot?: (raw: unknown) => TSnapshot;
}

/**
 * Shared persistence logic for providers that store/restore state via AFS.
 *
 * Handles:
 * - Lazy restore on mount (via readyPromise)
 * - Coalesced writes (dirty flag + writeChain)
 * - Error handling (NOT_FOUND = start fresh, other errors = start fresh)
 * - Optional Zod validation of restored snapshots
 *
 * Usage:
 * ```typescript
 * private persistence = new PersistenceHelper<MySnapshot>({
 *   storagePath: options.storagePath,
 *   getSnapshot: () => this.store.snapshot(),
 *   applySnapshot: (data, now) => this.store.restore(data, now),
 *   snapshotVersion: 1,
 *   validateSnapshot: (raw) => MySnapshotSchema.parse(raw),
 * });
 * ```
 */
export class PersistenceHelper<TSnapshot> {
  private root?: AFSRoot;
  private readyPromise: Promise<void> | null = null;
  private dirty = false;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private config: PersistenceConfig<TSnapshot>) {}

  /** Call from provider's onMount to set the AFS root and start restore */
  attachRoot(root: AFSRoot): void {
    this.root = root;
    if (this.config.storagePath) {
      this.readyPromise = this.restoreFromStorage();
    }
  }

  /** Await before any read/list to ensure restore is complete */
  async ensureReady(): Promise<void> {
    if (this.readyPromise) {
      await this.readyPromise;
      this.readyPromise = null;
    }
  }

  /** Schedule a coalesced write of the current snapshot */
  schedulePersist(): void {
    if (!this.config.storagePath || !this.root?.write) return;
    this.dirty = true;
    this.writeChain = this.writeChain.then(async () => {
      if (!this.dirty) return;
      this.dirty = false;
      try {
        await this.root!.write!(this.config.storagePath!, {
          content: JSON.stringify(this.config.getSnapshot()),
        });
      } catch {
        // Best-effort persistence (proper logging TBD)
      }
    });
  }

  private async restoreFromStorage(): Promise<void> {
    if (!this.config.storagePath || !this.root?.read) return;
    try {
      const result = await this.root.read(this.config.storagePath);
      if (result.data?.content != null) {
        const raw = result.data.content;
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;

        // Version check
        if (parsed.version !== this.config.snapshotVersion) return;

        // Optional validation (throws on invalid → caught below → start fresh)
        const snapshot = this.config.validateSnapshot
          ? this.config.validateSnapshot(parsed)
          : (parsed as TSnapshot);

        this.config.applySnapshot(snapshot, Date.now());
      }
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "AFS_NOT_FOUND" || code === "ENOENT") return;
      // Other errors (validation failures, JSON parse errors): start fresh
    }
  }
}
