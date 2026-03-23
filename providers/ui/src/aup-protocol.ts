/**
 * AUP Protocol — Server-side node store and patch engine.
 *
 * Maintains the current AUP node tree for a session.
 * Validates and applies patches atomically.
 */

import type { AUPNode, AUPPatchOp } from "./aup-types.js";
import { validateNode, validatePatchOp } from "./aup-types.js";

export interface AUPRenderOptions {
  fullPage?: boolean;
  chrome?: boolean;
  /** Tone — controls typography, shape, spacing, effects */
  tone?: string;
  /** Palette — controls colors (dark + light modes) */
  palette?: string;
  locale?: string;
  title?: string;
  /** Current page name — sent to client for URL sync (?page=name). */
  page?: string;
  /** Design mode — shows placeholder hints for empty bindings instead of hiding nodes. */
  designMode?: boolean;
}

export class AUPNodeStore {
  private root: AUPNode | null = null;
  /** Flat index: id → node + parent reference for O(1) lookup */
  private index = new Map<string, { node: AUPNode; parent: AUPNode | null }>();
  /** Monotonic version counter — increments on every render or patch. */
  private _version = 0;
  /** Render options from the last aup_render call. */
  private _renderOptions: AUPRenderOptions = {};

  /** Current tree version (monotonically increasing). */
  get version(): number {
    return this._version;
  }

  /** Last render options (fullPage, tone, palette, chrome, etc.). */
  get renderOptions(): AUPRenderOptions {
    return this._renderOptions;
  }

  /** Save render options alongside the tree. */
  setRenderOptions(opts: AUPRenderOptions): void {
    this._renderOptions = opts;
  }

  /** Get the current root node (or null if no graph is active). */
  getRoot(): AUPNode | null {
    return this.root;
  }

  /** Find a node by id. */
  findNode(id: string): AUPNode | undefined {
    return this.index.get(id)?.node;
  }

  /** Find the parent of a node by id. */
  findParent(id: string): AUPNode | null | undefined {
    return this.index.get(id)?.parent;
  }

  /** Set the full node tree (replaces any existing graph). */
  setRoot(root: AUPNode): void {
    const err = validateNode(root);
    if (err) throw new Error(`Invalid AUP node: ${err}`);
    this.root = root;
    this._version++;
    this.rebuildIndex();
  }

  /** Clear the graph. */
  clear(): void {
    this.root = null;
    this.index.clear();
    this._version++;
  }

  /**
   * Apply a batch of patch operations atomically.
   * If any op fails validation, the entire batch is rejected.
   */
  applyPatch(ops: AUPPatchOp[]): void {
    if (!this.root) throw new Error("No active AUP graph — call aup_render first");

    // Validate all ops first
    for (const op of ops) {
      const err = validatePatchOp(op);
      if (err) throw new Error(`Invalid patch op: ${err}`);
    }

    // Snapshot for rollback
    const snapshot = JSON.parse(JSON.stringify(this.root)) as AUPNode;

    try {
      for (const op of ops) {
        this.applyOneOp(op);
      }
      this._version++;
    } catch (e) {
      // Rollback
      this.root = snapshot;
      this.rebuildIndex();
      throw e;
    }
  }

  // ── Internal ──

  private applyOneOp(op: AUPPatchOp): void {
    switch (op.op) {
      case "create":
        this.opCreate(op);
        break;
      case "update":
        this.opUpdate(op);
        break;
      case "remove":
        this.opRemove(op);
        break;
      case "reorder":
        this.opReorder(op);
        break;
    }
  }

  private opCreate(op: { id: string; parentId: string; node: AUPNode; index?: number }): void {
    if (this.index.has(op.id)) throw new Error(`Node already exists: ${op.id}`);

    const parentEntry = this.index.get(op.parentId);
    if (!parentEntry) throw new Error(`Parent node not found: ${op.parentId}`);
    const parent = parentEntry.node;

    if (!parent.children) parent.children = [];

    const node = { ...op.node, id: op.id };
    const err = validateNode(node);
    if (err) throw new Error(`Invalid node in create: ${err}`);

    if (op.index !== undefined) {
      if (op.index < 0 || op.index > parent.children.length) {
        throw new Error(`Index out of bounds: ${op.index}`);
      }
      parent.children.splice(op.index, 0, node);
    } else {
      parent.children.push(node);
    }

    this.indexNode(node, parent);
  }

  private opUpdate(op: {
    id: string;
    src?: string;
    props?: Record<string, unknown>;
    state?: Record<string, unknown>;
    events?: Record<string, unknown>;
    children?: AUPNode[];
  }): void {
    const entry = this.index.get(op.id);
    if (!entry) throw new Error(`Node not found: ${op.id}`);
    const node = entry.node;

    if (op.src !== undefined) {
      node.src = op.src;
    }
    if (op.props && Object.keys(op.props).length > 0) {
      node.props = { ...(node.props ?? {}), ...op.props };
    }
    if (op.state && Object.keys(op.state).length > 0) {
      node.state = { ...(node.state ?? {}), ...op.state };
    }
    if (op.events !== undefined) {
      node.events = op.events as AUPNode["events"];
    }
    if (op.children !== undefined) {
      const newChildren = op.children;
      // Re-index: remove old children from index, add new ones
      if (node.children) {
        for (const child of node.children) this.unindexNode(child);
      }
      node.children = newChildren;
      for (const child of newChildren) this.indexNode(child, node);
    }
  }

  private opRemove(op: { id: string }): void {
    // Removing root clears the entire graph
    if (this.root && op.id === this.root.id) {
      this.clear();
      return;
    }

    const entry = this.index.get(op.id);
    if (!entry) throw new Error(`Node not found: ${op.id}`);
    const parent = entry.parent;
    if (!parent || !parent.children) throw new Error(`Cannot remove node: no parent`);

    const idx = parent.children.findIndex((c) => c.id === op.id);
    if (idx < 0) throw new Error(`Node not found in parent's children: ${op.id}`);

    // Remove from parent
    const [removed] = parent.children.splice(idx, 1);

    // Unindex the removed subtree
    this.unindexNode(removed!);
  }

  private opReorder(op: { id: string; parentId: string; index: number }): void {
    const entry = this.index.get(op.id);
    if (!entry) throw new Error(`Node not found: ${op.id}`);

    const parentEntry = this.index.get(op.parentId);
    if (!parentEntry) throw new Error(`Parent node not found: ${op.parentId}`);
    const parent = parentEntry.node;

    if (!parent.children) throw new Error(`Parent has no children`);

    const currentIdx = parent.children.findIndex((c) => c.id === op.id);
    if (currentIdx < 0) throw new Error(`Node not in specified parent: ${op.id}`);

    if (op.index < 0 || op.index >= parent.children.length) {
      throw new Error(`Reorder index out of bounds: ${op.index}`);
    }

    // Remove and re-insert
    const [node] = parent.children.splice(currentIdx, 1);
    parent.children.splice(op.index, 0, node!);
  }

  private rebuildIndex(): void {
    this.index.clear();
    if (this.root) {
      this.indexNode(this.root, null);
    }
  }

  private indexNode(node: AUPNode, parent: AUPNode | null): void {
    this.index.set(node.id, { node, parent });
    if (node.children) {
      for (const child of node.children) {
        this.indexNode(child, node);
      }
    }
  }

  private unindexNode(node: AUPNode): void {
    this.index.delete(node.id);
    if (node.children) {
      for (const child of node.children) {
        this.unindexNode(child);
      }
    }
  }
}

// ── Scene Manager (Preview/Program dual buffer) ──

export class AUPSceneManager {
  private scenes = new Map<string, AUPNodeStore>();
  private accessOrder: string[] = []; // LRU tracking (oldest first)
  private _activeSceneId: string | null = null;
  private maxScenes: number;

  constructor(opts?: { maxScenes?: number }) {
    this.maxScenes = opts?.maxScenes ?? 3;
  }

  get activeSceneId(): string | null {
    return this._activeSceneId;
  }

  /** Stage a scene (pre-render). Creates or updates the scene's store. */
  stage(sceneId: string, root: AUPNode, opts?: AUPRenderOptions): AUPNodeStore {
    let store = this.scenes.get(sceneId);
    if (!store) {
      store = new AUPNodeStore();
      this.scenes.set(sceneId, store);
    }
    store.setRoot(root);
    if (opts) store.setRenderOptions(opts);
    this.touch(sceneId);
    this.evictIfNeeded();
    return store;
  }

  /** Take a staged scene live. */
  take(sceneId: string): AUPNodeStore {
    const store = this.scenes.get(sceneId);
    if (!store) throw new Error(`Scene not found/not staged: ${sceneId}`);
    this._activeSceneId = sceneId;
    this.touch(sceneId);
    return store;
  }

  /** Release a scene's resources. Cannot release the active scene. */
  release(sceneId: string): void {
    if (this._activeSceneId === sceneId) {
      throw new Error(`Cannot release active/live scene: ${sceneId}`);
    }
    this.scenes.delete(sceneId);
    this.accessOrder = this.accessOrder.filter((id) => id !== sceneId);
  }

  /** Get a scene's store by ID. */
  getScene(sceneId: string): AUPNodeStore | undefined {
    return this.scenes.get(sceneId);
  }

  /** Get the active (live) scene. */
  getActiveScene(): { sceneId: string; store: AUPNodeStore } | null {
    if (!this._activeSceneId) return null;
    const store = this.scenes.get(this._activeSceneId);
    if (!store) return null;
    return { sceneId: this._activeSceneId, store };
  }

  /** Apply patches to a staged scene. */
  applyPatch(sceneId: string, ops: AUPPatchOp[]): void {
    const store = this.scenes.get(sceneId);
    if (!store) throw new Error(`Scene not found: ${sceneId}`);
    store.applyPatch(ops);
    this.touch(sceneId);
  }

  /** Touch LRU — move sceneId to end (most recent). */
  private touch(sceneId: string): void {
    this.accessOrder = this.accessOrder.filter((id) => id !== sceneId);
    this.accessOrder.push(sceneId);
  }

  /** Evict oldest non-active scenes if over limit. */
  private evictIfNeeded(): void {
    while (this.scenes.size > this.maxScenes) {
      const victim = this.accessOrder.find(
        (id) => id !== this._activeSceneId && this.scenes.has(id),
      );
      if (!victim) break; // all remaining are active — can't evict
      this.scenes.delete(victim);
      this.accessOrder = this.accessOrder.filter((id) => id !== victim);
    }
  }
}
