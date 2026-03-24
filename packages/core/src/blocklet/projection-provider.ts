/**
 * ProjectionProvider — proxy AFSModule that delegates operations to a source path
 * on a global AFS instance, with optional operation filtering.
 */

import { joinURL } from "ufo";
import { AFSAccessModeError } from "../error.js";
import type {
  AFSDeleteOptions,
  AFSDeleteResult,
  AFSExecOptions,
  AFSExecResult,
  AFSExplainOptions,
  AFSExplainResult,
  AFSListOptions,
  AFSListResult,
  AFSModule,
  AFSReadOptions,
  AFSReadResult,
  AFSRoot,
  AFSSearchOptions,
  AFSSearchResult,
  AFSStatOptions,
  AFSStatResult,
  AFSWriteEntryPayload,
  AFSWriteOptions,
  AFSWriteResult,
} from "../type.js";

export interface ProjectionProviderOptions {
  /** Projection display name */
  name: string;
  /** Global AFS instance to delegate operations to */
  globalAFS: AFSRoot;
  /** Source path in the global AFS (e.g., "/modules/ash") */
  sourcePath: string;
  /** Operation whitelist. undefined = no restriction (all ops allowed) */
  allowedOps?: Set<string>;
  /**
   * Direct source module — delegates to this module instead of globalAFS+sourcePath.
   * Avoids circular reference when the sourcePath mount in globalAFS is replaced
   * (e.g., after ProgramManager.activate() replaces the original provider with the
   * runtime AFS that contains this ProjectionProvider).
   */
  sourceModule?: AFSModule;
}

/**
 * A lightweight AFSModule that proxies operations to a specific path
 * on a global AFS instance, optionally restricting allowed operations.
 */
export class ProjectionProvider implements AFSModule {
  readonly name: string;
  readonly accessMode: "readonly" | "readwrite";
  private readonly globalAFS: AFSRoot;
  private readonly sourcePath: string;
  private readonly allowedOps?: Set<string>;
  private readonly sourceModule?: AFSModule;

  constructor(options: ProjectionProviderOptions) {
    this.name = options.name;
    this.globalAFS = options.globalAFS;
    this.sourcePath = options.sourcePath;
    this.allowedOps = options.allowedOps;
    this.sourceModule = options.sourceModule;

    // Derive accessMode: readwrite if write/delete/exec ops are allowed (or no restriction)
    const hasWriteOps =
      !options.allowedOps ||
      options.allowedOps.has("write") ||
      options.allowedOps.has("delete") ||
      options.allowedOps.has("exec");
    this.accessMode = hasWriteOps ? "readwrite" : "readonly";
  }

  private checkOp(op: string): void {
    if (this.allowedOps && !this.allowedOps.has(op)) {
      throw new AFSAccessModeError("projection", op);
    }
  }

  private resolve(path: string): string {
    return joinURL(this.sourcePath, path);
  }

  async list(path: string, options?: AFSListOptions): Promise<AFSListResult> {
    this.checkOp("list");
    if (this.sourceModule?.list) return this.sourceModule.list(path, options);
    return this.globalAFS.list(this.resolve(path), options);
  }

  async read(path: string, options?: AFSReadOptions): Promise<AFSReadResult> {
    this.checkOp("read");
    if (this.sourceModule?.read) return this.sourceModule.read(path, options);
    return this.globalAFS.read!(this.resolve(path), options);
  }

  async write(
    path: string,
    content: AFSWriteEntryPayload,
    options?: AFSWriteOptions,
  ): Promise<AFSWriteResult> {
    this.checkOp("write");
    if (this.sourceModule?.write) return this.sourceModule.write(path, content, options);
    return this.globalAFS.write!(this.resolve(path), content, options);
  }

  async delete(path: string, options?: AFSDeleteOptions): Promise<AFSDeleteResult> {
    this.checkOp("delete");
    if (this.sourceModule?.delete) return this.sourceModule.delete(path, options);
    return this.globalAFS.delete!(this.resolve(path), options);
  }

  async search(path: string, query: string, options?: AFSSearchOptions): Promise<AFSSearchResult> {
    this.checkOp("search");
    if (this.sourceModule?.search) return this.sourceModule.search(path, query, options);
    return this.globalAFS.search(this.resolve(path), query, options);
  }

  async exec(
    path: string,
    args: Record<string, unknown>,
    options: AFSExecOptions,
  ): Promise<AFSExecResult> {
    this.checkOp("exec");
    if (this.sourceModule?.exec) return this.sourceModule.exec(path, args, options);
    return this.globalAFS.exec!(this.resolve(path), args, options);
  }

  async stat(path: string, options?: AFSStatOptions): Promise<AFSStatResult> {
    this.checkOp("stat");
    if (this.sourceModule?.stat) return this.sourceModule.stat(path, options);
    return this.globalAFS.stat!(this.resolve(path), options);
  }

  async explain(path: string, options?: AFSExplainOptions): Promise<AFSExplainResult> {
    this.checkOp("explain");
    if (this.sourceModule?.explain) return this.sourceModule.explain(path, options);
    return this.globalAFS.explain!(this.resolve(path), options);
  }
}
