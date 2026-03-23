import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import {
  type AFSAccessMode,
  type AFSDeleteOptions,
  type AFSEntry,
  type AFSEntryMetadata,
  type AFSExecResult,
  type AFSExplainOptions,
  type AFSExplainResult,
  type AFSListResult,
  type AFSModuleClass,
  type AFSModuleLoadParams,
  AFSNotFoundError,
  type AFSRenameOptions,
  type AFSSearchOptions,
  type AFSStatResult,
  type AFSWriteEntryPayload,
  type CapabilitiesManifest,
  type ProviderManifest,
  type ProviderTreeSchema,
} from "@aigne/afs";
import {
  Actions,
  AFSBaseProvider,
  Delete,
  Explain,
  List,
  Meta,
  Read,
  Rename,
  type RouteContext,
  Search,
  Stat,
  Write,
} from "@aigne/afs/provider";
import { camelize, optionalize, zodParse } from "@aigne/afs/utils/zod";
import { assertPathWithinRoot, getMimeType, isBinaryFile } from "@aigne/afs-provider-utils";
import { type SimpleGit, simpleGit } from "simple-git";
import { z } from "zod";

const LIST_MAX_LIMIT = 1000;

const execFileAsync = promisify(execFile);

export interface AFSGitOptions {
  name?: string;
  /**
   * Local path to git repository.
   * If remoteUrl is provided and repoPath doesn't exist, will clone to this path.
   * If remoteUrl is provided and repoPath is not specified, clones to temp directory.
   */
  repoPath?: string;
  /**
   * Remote repository URL (https or git protocol).
   * If provided, will clone the repository if repoPath doesn't exist.
   * Examples:
   * - https://github.com/user/repo.git
   * - git@github.com:user/repo.git
   */
  remoteUrl?: string;
  description?: string;
  /**
   * List of branches to expose/access.
   * Also used for clone optimization when cloning from remoteUrl:
   * - Single branch (e.g., ['main']): Uses --single-branch for faster clone
   * - Multiple branches: Clones all branches, filters access to specified ones
   * - Not specified: All branches are accessible
   */
  branches?: string[];
  /**
   * Access mode for this module.
   * - "readonly": Only read operations are allowed, uses git commands (no worktree)
   * - "readwrite": All operations are allowed, creates worktrees as needed
   * @default "readonly"
   */
  accessMode?: AFSAccessMode;
  /**
   * Automatically commit changes after write operations
   * @default false
   */
  autoCommit?: boolean;
  /**
   * Author information for commits when autoCommit is enabled
   */
  commitAuthor?: {
    name: string;
    email: string;
  };
  /**
   * Clone depth for shallow clone (only used when cloning from remoteUrl)
   * @default 1
   */
  depth?: number;
  /**
   * Automatically clean up cloned repository on cleanup()
   * Only applies when repository was auto-cloned to temp directory
   * @default true
   */
  autoCleanup?: boolean;
  /**
   * Git clone options (only used when cloning from remoteUrl)
   */
  cloneOptions?: {
    /**
     * Authentication credentials for private repositories
     */
    auth?: {
      username?: string;
      password?: string;
    };
  };
}

const afsGitOptionsSchema = camelize(
  z
    .object({
      name: optionalize(z.string()),
      repoPath: optionalize(z.string().describe("The path to the git repository")),
      remoteUrl: optionalize(z.string().describe("Remote repository URL (https or git protocol)")),
      description: optionalize(z.string().describe("A description of the repository")),
      branches: optionalize(z.array(z.string()).describe("List of branches to expose")),
      accessMode: optionalize(
        z.enum(["readonly", "readwrite"]).describe("Access mode for this module"),
      ),
      autoCommit: optionalize(
        z.boolean().describe("Automatically commit changes after write operations"),
      ),
      commitAuthor: optionalize(
        z.object({
          name: z.string(),
          email: z.string(),
        }),
      ),
      depth: optionalize(z.number().describe("Clone depth for shallow clone")),
      autoCleanup: optionalize(
        z.boolean().describe("Automatically clean up cloned repository on cleanup()"),
      ),
      cloneOptions: optionalize(
        z.object({
          auth: optionalize(
            z.object({
              username: optionalize(z.string()),
              password: optionalize(z.string()),
            }),
          ),
        }),
      ),
    })
    .refine((data) => data.repoPath || data.remoteUrl, {
      message: "Either repoPath or remoteUrl must be provided",
    }),
);

export class AFSGit extends AFSBaseProvider {
  static schema() {
    return afsGitOptionsSchema;
  }

  static manifest(): ProviderManifest {
    return {
      name: "git",
      description:
        "Git repository browser with branch-based access.\n- Browse branches, read files at any ref, search across repository\n- Exec actions (readwrite): `diff`, `create-branch`, `commit`, `merge`\n- Virtual `.log/` tree exposes commit history per branch\n- Path structure: `/{branch}/{file-path}` (branch `/` encoded as `~`)",
      uriTemplate: "git://{localPath+}",
      category: "vcs",
      schema: z.object({
        localPath: z.string(),
        branch: z.string().optional(),
        remoteUrl: z.string().optional(),
      }),
      tags: ["git", "version-control"],
      capabilityTags: ["read-write", "search", "auth:none", "local"],
      security: {
        riskLevel: "local",
        resourceAccess: ["local-filesystem"],
        requires: ["git"],
        dataSensitivity: ["code"],
        notes: ["Accesses local git repositories; readwrite mode creates worktrees and can commit"],
      },
      capabilities: {
        filesystem: { read: true, write: true },
        process: { spawn: true, allowedCommands: ["git"] },
      },
    };
  }

  static treeSchema(): ProviderTreeSchema {
    return {
      operations: ["list", "read", "write", "delete", "search", "stat", "explain"],
      tree: {
        "/": { kind: "git:root", operations: ["list", "read"] },
        "/{branch}": {
          kind: "git:branch",
          operations: ["list", "read", "search"],
          actions: ["diff", "create-branch", "commit", "merge"],
        },
        "/{branch}/{path+}": {
          kind: "git:file",
          operations: ["list", "read", "write", "delete", "search"],
        },
        "/{branch}/.log": { kind: "git:log", operations: ["list"] },
        "/{branch}/.log/{index}": { kind: "git:commit", operations: ["read"] },
      },
      auth: { type: "none" },
      bestFor: ["code browsing", "version control", "branch comparison"],
      notFor: ["binary storage", "large files"],
    };
  }

  static async load({ basePath, config }: AFSModuleLoadParams = {}) {
    const valid = await AFSGit.schema().parseAsync(config);
    const instance = new AFSGit({ ...valid, cwd: basePath });
    await instance.ready();
    return instance;
  }

  readonly name: string;
  readonly description?: string;
  readonly accessMode: AFSAccessMode;

  private initPromise: Promise<void>;
  private git: SimpleGit;
  private tempBase: string;
  private worktrees: Map<string, string> = new Map();
  private repoHash: string;
  private isAutoCloned = false;
  private clonedPath?: string;
  private repoPath: string;

  constructor(
    public options: AFSGitOptions & {
      cwd?: string;
      localPath?: string;
      branch?: string;
      uri?: string;
    },
  ) {
    super();

    // Normalize registry-passed template vars
    if ((options as any).localPath && !options.repoPath) {
      options.repoPath = (options as any).localPath;
    }
    if ((options as any).branch && !options.branches) {
      options.branches = [(options as any).branch];
    }

    zodParse(afsGitOptionsSchema, options);

    // Synchronously determine repoPath to initialize name
    let repoPath: string;
    let repoName: string;

    if (options.repoPath) {
      // Use provided repoPath
      repoPath = isAbsolute(options.repoPath)
        ? options.repoPath
        : join(options.cwd || process.cwd(), options.repoPath);
      repoName = basename(repoPath);
    } else if (options.remoteUrl) {
      // Extract repo name from URL for temporary name
      const urlParts = options.remoteUrl.split("/");
      const lastPart = urlParts[urlParts.length - 1];
      repoName = lastPart?.replace(/\.git$/, "") || "git";

      // Will be updated during async init, use temp path for now
      const repoHash = createHash("md5").update(options.remoteUrl).digest("hex").substring(0, 8);
      repoPath = join(tmpdir(), `afs-git-remote-${repoHash}`);
    } else {
      // This should never happen due to schema validation
      throw new Error("Either repoPath or remoteUrl must be provided");
    }

    // Initialize basic properties immediately
    this.repoPath = repoPath;
    this.name = options.name || repoName;
    this.description = options.description;
    this.accessMode = options.accessMode ?? "readonly";

    // Calculate hash for temp directories
    this.repoHash = createHash("md5").update(repoPath).digest("hex").substring(0, 8);
    this.tempBase = join(tmpdir(), `afs-git-${this.repoHash}`);

    // Note: git and other properties will be initialized in initialize() after cloning
    // We need to delay simpleGit() initialization until the directory exists
    this.git = null as any; // Will be set in initialize()

    // Start async initialization (cloning if needed)
    this.initPromise = this.initialize();
  }

  /**
   * Wait for async initialization to complete
   */
  async ready(): Promise<void> {
    await this.initPromise;
  }

  /**
   * Async initialization logic (runs in constructor)
   * Handles cloning remote repositories if needed
   */
  private async initialize(): Promise<void> {
    const options = this.options;

    // Auto-create local repository if it doesn't exist (skip for remoteUrl — will be cloned)
    if (options.repoPath && !options.remoteUrl) {
      const { existsSync, mkdirSync } = await import("node:fs");
      const { execSync } = await import("node:child_process");
      if (!existsSync(this.repoPath)) {
        mkdirSync(this.repoPath, { recursive: true });
      }
      if (!existsSync(join(this.repoPath, ".git"))) {
        execSync("git init -b main", { cwd: this.repoPath, stdio: "ignore" });
      }
    }

    // If remoteUrl is provided, handle cloning
    if (options.remoteUrl) {
      const targetPath = options.repoPath
        ? isAbsolute(options.repoPath)
          ? options.repoPath
          : join(options.cwd || process.cwd(), options.repoPath)
        : this.repoPath; // Use temp path set in constructor

      // Mark as auto-cloned if we're using temp directory
      if (!options.repoPath) {
        this.isAutoCloned = true;
      }

      // Check if targetPath exists and is a valid git repository
      const exists = await stat(targetPath)
        .then(() => true)
        .catch(() => false);

      let needsClone = !exists;

      // If directory exists but is not a valid git repo, clean it up and re-clone
      if (exists) {
        const tempGit = simpleGit(targetPath);
        const isValidRepo = await tempGit.checkIsRepo().catch(() => false);
        if (!isValidRepo) {
          // Remove invalid directory and re-clone
          await rm(targetPath, { recursive: true, force: true });
          needsClone = true;
        }
      }

      if (needsClone) {
        // Determine if single-branch optimization should be used
        const singleBranch = options.branches?.length === 1 ? options.branches[0] : undefined;

        await AFSGit.cloneRepository(options.remoteUrl, targetPath, {
          depth: options.depth ?? 1,
          branch: singleBranch,
          auth: options.cloneOptions?.auth,
        });
      }

      // Update properties if targetPath differs from constructor initialization
      if (targetPath !== this.repoPath) {
        this.repoPath = targetPath;
        this.repoHash = createHash("md5").update(targetPath).digest("hex").substring(0, 8);
        this.tempBase = join(tmpdir(), `afs-git-${this.repoHash}`);
      }

      this.clonedPath = this.isAutoCloned ? targetPath : undefined;
    }

    // Now that the directory exists (either it was there or we cloned it), initialize git
    this.git = simpleGit(this.repoPath);

    // Validate that the directory is actually a git repository
    const isRepo = await this.git.checkIsRepo();
    if (!isRepo) {
      throw new Error(`Not a git repository: ${this.repoPath}`);
    }
  }

  /**
   * Clone a remote repository to local path
   */
  private static async cloneRepository(
    remoteUrl: string,
    targetPath: string,
    options: {
      depth?: number;
      branch?: string;
      auth?: { username?: string; password?: string };
    } = {},
  ): Promise<void> {
    const git = simpleGit();

    // Build clone options
    const cloneArgs: string[] = [];

    if (options.depth) {
      cloneArgs.push("--depth", options.depth.toString());
    }

    if (options.branch) {
      cloneArgs.push("--branch", options.branch, "--single-branch");
    }

    // Handle authentication in URL if provided
    let cloneUrl = remoteUrl;
    if (options.auth?.username && options.auth?.password) {
      // Insert credentials into HTTPS URL
      if (remoteUrl.startsWith("https://")) {
        const url = new URL(remoteUrl);
        url.username = encodeURIComponent(options.auth.username);
        url.password = encodeURIComponent(options.auth.password);
        cloneUrl = url.toString();
      }
    }

    await git.clone(cloneUrl, targetPath, cloneArgs);
  }

  // ========== Route Handlers ==========

  /**
   * List root (branches)
   * Note: list() returns only children (branches), never the path itself (per new semantics)
   */
  @List("/", { handleDepth: true })
  async listRootHandler(ctx: RouteContext): Promise<AFSListResult & { noExpand?: string[] }> {
    await this.ready();

    const options = ctx.options as { limit?: number; maxDepth?: number };
    const maxDepth = options?.maxDepth ?? 1;
    const limit = Math.min(options?.limit || LIST_MAX_LIMIT, LIST_MAX_LIMIT);

    // maxDepth: 0 means return no children
    if (maxDepth === 0) {
      return { data: [] };
    }

    const branches = await this.getBranches();
    const entries: AFSEntry[] = [];

    for (const name of branches) {
      if (entries.length >= limit) break;

      const encodedPath = this.buildBranchPath(name);

      // Get children count for this branch
      const branchChildrenCount = await this.getChildrenCount(name, "");

      entries.push(
        this.buildEntry(encodedPath, {
          meta: { kind: "git:branch", childrenCount: branchChildrenCount },
        }),
      );

      // If maxDepth > 1, also list contents of each branch
      if (maxDepth > 1) {
        const branchResult = await this.listWithGitLsTree(name, "", {
          maxDepth: maxDepth - 1,
          limit: limit - entries.length,
        });
        entries.push(...branchResult.data);
      }
    }

    return { data: entries };
  }

  /**
   * List branch root (matches /main, /develop, etc.)
   */
  @List("/:branch", { handleDepth: true })
  async listBranchRootHandler(
    ctx: RouteContext<{ branch: string }>,
  ): Promise<AFSListResult & { noExpand?: string[] }> {
    await this.ready();

    const branch = this.decodeBranchName(ctx.params.branch);
    await this.ensureBranchExists(branch);

    return this.listWithGitLsTree(branch, "", ctx.options as { maxDepth?: number; limit?: number });
  }

  /**
   * List files in branch with subpath (matches /main/src, /main/src/foo, etc.)
   */
  @List("/:branch/:path+", { handleDepth: true })
  async listBranchHandler(
    ctx: RouteContext<{ branch: string; path: string }>,
  ): Promise<AFSListResult & { noExpand?: string[] }> {
    await this.ready();

    const branch = this.decodeBranchName(ctx.params.branch);
    await this.ensureBranchExists(branch);
    const filePath = ctx.params.path;

    return this.listWithGitLsTree(
      branch,
      filePath,
      ctx.options as { maxDepth?: number; limit?: number },
    );
  }

  // ========== Meta Handlers ==========
  // These handlers provide metadata access for all paths via .meta suffix

  /**
   * Read root metadata (introspection only, read-only)
   */
  @Meta("/")
  async readRootMetaHandler(_ctx: RouteContext): Promise<AFSEntry | undefined> {
    await this.ready();

    const branches = await this.getBranches();
    return this.buildEntry("/.meta", {
      meta: { childrenCount: branches.length, type: "root" },
    });
  }

  /**
   * Read branch root metadata (introspection only, read-only)
   */
  @Meta("/:branch")
  async readBranchMetaHandler(
    ctx: RouteContext<{ branch: string }>,
  ): Promise<AFSEntry | undefined> {
    await this.ready();

    const branch = this.decodeBranchName(ctx.params.branch);
    await this.ensureBranchExists(branch);
    const childrenCount = await this.getChildrenCount(branch, "");
    const branchPath = `/${this.encodeBranchName(branch)}`;
    const metaPath = `${branchPath}/.meta`;
    const lastCommit = await this.getLastCommit(branch);

    return this.buildEntry(metaPath, {
      meta: { childrenCount, type: "branch", lastCommit },
    });
  }

  /**
   * Read file or directory metadata in branch (introspection only, read-only)
   */
  @Meta("/:branch/:path+")
  async readPathMetaHandler(
    ctx: RouteContext<{ branch: string; path: string }>,
  ): Promise<AFSEntry | undefined> {
    await this.ready();

    const branch = this.decodeBranchName(ctx.params.branch);
    await this.ensureBranchExists(branch);
    const filePath = ctx.params.path;

    // Check if the path exists
    const objectType = await this.git
      .raw(["cat-file", "-t", `${branch}:${filePath}`])
      .then((t) => t.trim())
      .catch(() => null);

    if (objectType === null) {
      throw new AFSNotFoundError(this.buildBranchPath(branch, filePath));
    }

    const isDir = objectType === "tree";
    const metaPath = `/${this.encodeBranchName(branch)}/${filePath}/.meta`;

    let childrenCount: number | undefined;
    if (isDir) {
      childrenCount = await this.getChildrenCount(branch, filePath);
    }

    return this.buildEntry(metaPath, {
      meta: {
        childrenCount,
        type: isDir ? "directory" : "file",
        gitObjectType: objectType,
      },
    });
  }

  // ========== Regular Read Handlers ==========

  /**
   * Read root
   */
  @Read("/")
  async readRootHandler(_ctx: RouteContext): Promise<AFSEntry | undefined> {
    await this.ready();

    const branches = await this.getBranches();
    return this.buildEntry("/", {
      meta: { childrenCount: branches.length },
    });
  }

  /**
   * Read branch root
   */
  @Read("/:branch")
  async readBranchRootHandler(
    ctx: RouteContext<{ branch: string }>,
  ): Promise<AFSEntry | undefined> {
    await this.ready();

    const branch = this.decodeBranchName(ctx.params.branch);
    await this.ensureBranchExists(branch);
    const branchPath = this.buildBranchPath(branch);
    const childrenCount = await this.getChildrenCount(branch, "");
    const lastCommit = await this.getLastCommit(branch);
    return this.buildEntry(branchPath, {
      meta: { childrenCount, lastCommit },
    });
  }

  /**
   * Read file or directory in branch
   */
  @Read("/:branch/:path+")
  async readBranchHandler(
    ctx: RouteContext<{ branch: string; path: string }>,
  ): Promise<AFSEntry | undefined> {
    await this.ready();

    const branch = this.decodeBranchName(ctx.params.branch);
    await this.ensureBranchExists(branch);
    const filePath = ctx.params.path;

    // Check if there's an active worktree for this branch - read from there first
    // This handles files that were written but may be in a different state than git index
    const worktreePath = this.worktrees.get(branch);
    if (worktreePath) {
      try {
        const fullPath = join(worktreePath, filePath);
        await this.assertWithinWorktree(fullPath, worktreePath);
        const stats = await stat(fullPath);

        if (stats.isDirectory()) {
          // It's a directory - count children
          const files = await readdir(fullPath);
          const afsPath = this.buildBranchPath(branch, filePath);
          return this.buildEntry(afsPath, {
            meta: { childrenCount: files.length },
          });
        }

        // It's a file - read content
        const mimeType = getMimeType(filePath);
        const isBinary = isBinaryFile(filePath);

        let content: string;
        const meta: AFSEntryMetadata = {
          size: stats.size,
          mimeType,
        };

        if (isBinary) {
          const buffer = await readFile(fullPath);
          content = buffer.toString("base64");
          meta.contentType = "base64";
        } else {
          content = await readFile(fullPath, "utf8");
        }

        const afsPath = this.buildBranchPath(branch, filePath);
        return this.buildEntry(afsPath, {
          content,
          meta,
          createdAt: stats.birthtime,
          updatedAt: stats.mtime,
        });
      } catch (err: unknown) {
        // Re-throw security errors — only fall through for "not found" / filesystem errors
        if (
          err instanceof Error &&
          "code" in err &&
          (err as { code: string }).code === "AFS_PERMISSION_DENIED"
        ) {
          throw err;
        }
        // File doesn't exist in worktree, fall through to git
      }
    }

    // Read from git repository
    // Check if path is a blob (file) or tree (directory)
    const objectType = await this.git
      .raw(["cat-file", "-t", `${branch}:${filePath}`])
      .then((t) => t.trim())
      .catch(() => null);

    if (objectType === null) {
      // Path doesn't exist in git
      throw new AFSNotFoundError(this.buildBranchPath(branch, filePath));
    }

    if (objectType === "tree") {
      // It's a directory
      const afsPath = this.buildBranchPath(branch, filePath);
      const childrenCount = await this.getChildrenCount(branch, filePath);
      return this.buildEntry(afsPath, {
        meta: { childrenCount },
      });
    }

    // It's a file, get content
    const size = await this.git
      .raw(["cat-file", "-s", `${branch}:${filePath}`])
      .then((s) => Number.parseInt(s.trim(), 10));

    // Determine mimeType based on file extension
    const mimeType = getMimeType(filePath);
    const isBinary = isBinaryFile(filePath);

    let content: string;
    const meta: AFSEntryMetadata = {
      size,
      mimeType,
    };

    if (isBinary) {
      // For binary files, use execFileAsync to get raw buffer
      const { stdout } = await execFileAsync("git", ["cat-file", "-p", `${branch}:${filePath}`], {
        cwd: this.options.repoPath,
        encoding: "buffer",
        maxBuffer: 10 * 1024 * 1024, // 10MB max
      });
      // Store only base64 string without data URL prefix
      content = (stdout as Buffer).toString("base64");
      // Mark content as base64 in metadata
      meta.contentType = "base64";
    } else {
      // For text files, use git.show
      content = await this.git.show([`${branch}:${filePath}`]);
    }

    const afsPath = this.buildBranchPath(branch, filePath);
    return this.buildEntry(afsPath, {
      content,
      meta,
    });
  }

  /**
   * Write to root is not allowed
   */
  @Write("/")
  async writeRootHandler(): Promise<never> {
    throw new Error("Cannot write to root");
  }

  /**
   * Write to branch root is not allowed
   */
  @Write("/:branch")
  async writeBranchRootHandler(): Promise<never> {
    throw new Error("Cannot write to branch root");
  }

  /**
   * Write file in branch
   */
  @Write("/:branch/:path+")
  async writeHandler(
    ctx: RouteContext<{ branch: string; path: string }>,
    payload: AFSWriteEntryPayload,
  ): Promise<{ data: AFSEntry }> {
    await this.ready();

    const branch = this.decodeBranchName(ctx.params.branch);
    const filePath = ctx.params.path;
    // Create worktree for write operations
    const worktreePath = await this.ensureWorktree(branch);
    const fullPath = join(worktreePath, filePath);
    await this.assertWithinWorktree(fullPath, worktreePath);

    // Ensure parent directory exists
    const parentDir = dirname(fullPath);
    await mkdir(parentDir, { recursive: true });

    // Write content (only "replace" mode reaches here; append/prepend handled by BaseProvider)
    if (payload.content !== undefined) {
      let contentToWrite: string;
      if (typeof payload.content === "string") {
        contentToWrite = payload.content;
      } else {
        contentToWrite = JSON.stringify(payload.content, null, 2);
      }
      await writeFile(fullPath, contentToWrite, { encoding: "utf8" });
    }

    // Auto commit if enabled
    if (this.options.autoCommit) {
      const gitInstance = simpleGit(worktreePath);
      await gitInstance.add(filePath);

      if (this.options.commitAuthor) {
        await gitInstance.addConfig(
          "user.name",
          this.options.commitAuthor.name,
          undefined,
          "local",
        );
        await gitInstance.addConfig(
          "user.email",
          this.options.commitAuthor.email,
          undefined,
          "local",
        );
      }

      await gitInstance.commit(`Update ${filePath}`);
    }

    // Get file stats
    const stats = await stat(fullPath);

    const afsPath = this.buildBranchPath(branch, filePath);
    const writtenEntry: AFSEntry = {
      id: afsPath,
      path: afsPath,
      content: payload.content,
      summary: payload.summary,
      createdAt: stats.birthtime,
      updatedAt: stats.mtime,
      meta: {
        ...payload.meta,
        size: stats.size,
      } as AFSEntryMetadata,
      userId: payload.userId,
      sessionId: payload.sessionId,
      linkTo: payload.linkTo,
    };

    return { data: writtenEntry };
  }

  /**
   * Delete root is not allowed
   */
  @Delete("/")
  async deleteRootHandler(): Promise<never> {
    throw new Error("Cannot delete root");
  }

  /**
   * Delete branch root is not allowed
   */
  @Delete("/:branch")
  async deleteBranchRootHandler(ctx: RouteContext<{ branch: string }>): Promise<never> {
    await this.ready();
    const branch = this.decodeBranchName(ctx.params.branch);
    await this.ensureBranchExists(branch);
    throw new Error("Cannot delete branch root");
  }

  /**
   * Delete file in branch
   */
  @Delete("/:branch/:path+")
  async deleteHandler(
    ctx: RouteContext<{ branch: string; path: string }>,
  ): Promise<{ message: string }> {
    await this.ready();

    const branch = this.decodeBranchName(ctx.params.branch);
    const filePath = ctx.params.path;
    const options = ctx.options as AFSDeleteOptions | undefined;
    const recursive = options?.recursive ?? false;

    // Create worktree for delete operations
    const worktreePath = await this.ensureWorktree(branch);
    const fullPath = join(worktreePath, filePath);
    await this.assertWithinWorktree(fullPath, worktreePath);

    let stats: Awaited<ReturnType<typeof stat>>;
    try {
      stats = await stat(fullPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new AFSNotFoundError(this.buildBranchPath(branch, filePath));
      }
      throw error;
    }

    if (stats.isDirectory() && !recursive) {
      throw new Error(
        `Cannot delete directory '/${ctx.params.branch}/${filePath}' without recursive option. Set recursive: true to delete directories.`,
      );
    }

    await rm(fullPath, { recursive, force: true });

    // Auto commit if enabled
    if (this.options.autoCommit) {
      const gitInstance = simpleGit(worktreePath);
      await gitInstance.add(filePath);

      if (this.options.commitAuthor) {
        await gitInstance.addConfig(
          "user.name",
          this.options.commitAuthor.name,
          undefined,
          "local",
        );
        await gitInstance.addConfig(
          "user.email",
          this.options.commitAuthor.email,
          undefined,
          "local",
        );
      }

      await gitInstance.commit(`Delete ${filePath}`);
    }

    return { message: `Successfully deleted: /${ctx.params.branch}/${filePath}` };
  }

  /**
   * Rename file in branch
   */
  @Rename("/:branch/:path+")
  async renameHandler(
    ctx: RouteContext<{ branch: string; path: string }>,
    newPath: string,
  ): Promise<{ message: string }> {
    await this.ready();

    const oldBranch = this.decodeBranchName(ctx.params.branch);
    const oldFilePath = ctx.params.path;

    // Parse new path
    const { branch: newBranch, filePath: newFilePath } = this.parsePath(newPath);
    const options = ctx.options as AFSRenameOptions | undefined;
    const overwrite = options?.overwrite ?? false;

    if (!newBranch || !newFilePath) {
      throw new Error("Cannot rename to root or branch root");
    }

    if (oldBranch !== newBranch) {
      throw new Error("Cannot rename across branches");
    }

    // Create worktree for rename operations
    const worktreePath = await this.ensureWorktree(oldBranch);
    const oldFullPath = join(worktreePath, oldFilePath);
    const newFullPath = join(worktreePath, newFilePath);
    await this.assertWithinWorktree(oldFullPath, worktreePath);
    await this.assertWithinWorktree(newFullPath, worktreePath);

    // Check if source exists
    try {
      await stat(oldFullPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new AFSNotFoundError(this.buildBranchPath(oldBranch, oldFilePath));
      }
      throw error;
    }

    // Check if destination exists
    try {
      await stat(newFullPath);
      if (!overwrite) {
        throw new Error(
          `Destination '${newPath}' already exists. Set overwrite: true to replace it.`,
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    // Ensure parent directory exists
    const newParentDir = dirname(newFullPath);
    await mkdir(newParentDir, { recursive: true });

    // Perform rename
    await rename(oldFullPath, newFullPath);

    // Auto commit if enabled
    if (this.options.autoCommit) {
      const gitInstance = simpleGit(worktreePath);
      await gitInstance.add([oldFilePath, newFilePath]);

      if (this.options.commitAuthor) {
        await gitInstance.addConfig(
          "user.name",
          this.options.commitAuthor.name,
          undefined,
          "local",
        );
        await gitInstance.addConfig(
          "user.email",
          this.options.commitAuthor.email,
          undefined,
          "local",
        );
      }

      await gitInstance.commit(`Rename ${oldFilePath} to ${newFilePath}`);
    }

    return {
      message: `Successfully renamed '/${ctx.params.branch}/${oldFilePath}' to '${newPath}'`,
    };
  }

  /**
   * Search files in branch root
   */
  @Search("/:branch")
  async searchBranchRootHandler(
    ctx: RouteContext<{ branch: string }>,
    query: string,
    options?: AFSSearchOptions,
  ): Promise<{ data: AFSEntry[]; message?: string }> {
    return this.searchInBranch(ctx.params.branch, "", query, options);
  }

  /**
   * Search files in branch path
   */
  @Search("/:branch/:path+")
  async searchHandler(
    ctx: RouteContext<{ branch: string; path: string }>,
    query: string,
    options?: AFSSearchOptions,
  ): Promise<{ data: AFSEntry[]; message?: string }> {
    return this.searchInBranch(ctx.params.branch, ctx.params.path, query, options);
  }

  /**
   * Internal search implementation
   */
  private async searchInBranch(
    encodedBranch: string,
    filePath: string,
    query: string,
    options?: AFSSearchOptions,
  ): Promise<{ data: AFSEntry[]; message?: string }> {
    await this.ready();

    const branch = this.decodeBranchName(encodedBranch);
    const limit = Math.min(options?.limit || LIST_MAX_LIMIT, LIST_MAX_LIMIT);

    try {
      // Use git grep for searching (no worktree needed)
      const args = ["grep", "-n", "-I"]; // -n for line numbers, -I to skip binary files

      if (options?.caseSensitive === false) {
        args.push("-i");
      }

      args.push(query, branch);

      // Add path filter if specified
      if (filePath) {
        args.push("--", filePath);
      }

      const output = await this.git.raw(args);
      const lines = output.split("\n").filter((line) => line.trim());

      const entries: AFSEntry[] = [];
      const processedFiles = new Set<string>();

      for (const line of lines) {
        // Format when searching in branch: branch:path:linenum:content
        // Try the format with branch prefix first
        let matchPath: string;
        let lineNum: string;
        let content: string;

        const matchWithBranch = line.match(/^[^:]+:([^:]+):(\d+):(.+)$/);
        if (matchWithBranch) {
          matchPath = matchWithBranch[1]!;
          lineNum = matchWithBranch[2]!;
          content = matchWithBranch[3]!;
        } else {
          // Try format without branch: path:linenum:content
          const matchNoBranch = line.match(/^([^:]+):(\d+):(.+)$/);
          if (!matchNoBranch) continue;
          matchPath = matchNoBranch[1]!;
          lineNum = matchNoBranch[2]!;
          content = matchNoBranch[3]!;
        }

        const afsPath = this.buildBranchPath(branch, matchPath);

        if (processedFiles.has(afsPath)) continue;
        processedFiles.add(afsPath);

        const entry = this.buildEntry(afsPath);
        entry.summary = `Line ${lineNum}: ${content}`;
        entries.push(entry);

        if (entries.length >= limit) {
          break;
        }
      }

      return {
        data: entries,
        message: entries.length >= limit ? `Results truncated to limit ${limit}` : undefined,
      };
    } catch (error) {
      // git grep returns exit code 1 if no matches found
      if ((error as Error).message.includes("did not match any file(s)")) {
        return { data: [] };
      }
      return { data: [], message: (error as Error).message };
    }
  }

  /**
   * Stat root
   */
  @Stat("/")
  async statRootHandler(_ctx: RouteContext): Promise<AFSStatResult> {
    const entry = await this.readRootHandler(_ctx);
    if (!entry) {
      return { data: undefined };
    }
    // Return entry without content
    const { content: _content, ...rest } = entry;
    return { data: rest };
  }

  /**
   * Stat branch root
   */
  @Stat("/:branch")
  async statBranchRootHandler(ctx: RouteContext<{ branch: string }>): Promise<AFSStatResult> {
    const entry = await this.readBranchRootHandler(ctx);
    if (!entry) {
      return { data: undefined };
    }
    // Return entry without content
    const { content: _content, ...rest } = entry;
    return { data: rest };
  }

  /**
   * Stat file or directory in branch
   */
  @Stat("/:branch/:path+")
  async statHandler(ctx: RouteContext<{ branch: string; path: string }>): Promise<AFSStatResult> {
    const entry = await this.readBranchHandler(ctx);
    if (!entry) {
      return { data: undefined };
    }
    // Return entry without content
    const { content: _content, ...rest } = entry;
    return { data: rest };
  }

  // ========== Explain Handlers ==========

  /**
   * Explain root → repo info, branch list, default branch
   */
  @Explain("/")
  async explainRootHandler(_ctx: RouteContext): Promise<AFSExplainResult> {
    await this.ready();

    const format = (_ctx.options as AFSExplainOptions)?.format || "markdown";
    const branches = await this.getBranches();
    const currentBranch = await this.git.revparse(["--abbrev-ref", "HEAD"]).then((b) => b.trim());

    let remoteUrl: string | undefined;
    try {
      remoteUrl = await this.git.remote(["get-url", "origin"]).then((u) => u?.trim());
    } catch {
      // No remote configured
    }

    const lines: string[] = [];
    lines.push("# Git Repository");
    lines.push("");
    lines.push(`**Provider:** ${this.name}`);
    if (this.description) {
      lines.push(`**Description:** ${this.description}`);
    }
    lines.push(`**Default Branch:** ${currentBranch}`);
    if (remoteUrl) {
      lines.push(`**Remote:** ${remoteUrl}`);
    }
    lines.push(`**Branches:** ${branches.length}`);
    lines.push("");
    lines.push("## Branches");
    lines.push("");
    for (const branch of branches) {
      lines.push(`- ${branch}`);
    }

    return { content: lines.join("\n"), format };
  }

  /**
   * Explain branch → branch name, HEAD commit, file count
   */
  @Explain("/:branch")
  async explainBranchHandler(ctx: RouteContext<{ branch: string }>): Promise<AFSExplainResult> {
    await this.ready();

    const format = (ctx.options as AFSExplainOptions)?.format || "markdown";
    const branch = this.decodeBranchName(ctx.params.branch);
    await this.ensureBranchExists(branch);

    const lastCommit = await this.getLastCommit(branch);
    const fileCount = await this.getTreeFileCount(branch, "");

    const lines: string[] = [];
    lines.push(`# Branch: ${branch}`);
    lines.push("");
    lines.push(`**HEAD Commit:** ${lastCommit.shortHash} - ${lastCommit.message}`);
    lines.push(`**Author:** ${lastCommit.author}`);
    lines.push(`**Date:** ${lastCommit.date}`);
    lines.push(`**Files:** ${fileCount} entries in tree`);

    return { content: lines.join("\n"), format };
  }

  /**
   * Explain file or directory → path, size, last modified commit
   */
  @Explain("/:branch/:path+")
  async explainPathHandler(
    ctx: RouteContext<{ branch: string; path: string }>,
  ): Promise<AFSExplainResult> {
    await this.ready();

    const format = (ctx.options as AFSExplainOptions)?.format || "markdown";
    const branch = this.decodeBranchName(ctx.params.branch);
    await this.ensureBranchExists(branch);
    const filePath = ctx.params.path;

    const objectType = await this.git
      .raw(["cat-file", "-t", `${branch}:${filePath}`])
      .then((t) => t.trim())
      .catch(() => null);

    if (objectType === null) {
      throw new AFSNotFoundError(this.buildBranchPath(branch, filePath));
    }

    const isDir = objectType === "tree";
    const lines: string[] = [];

    lines.push(`# ${basename(filePath)}`);
    lines.push("");
    lines.push(`**Path:** ${filePath}`);
    lines.push(`**Type:** ${isDir ? "directory" : "file"}`);

    if (!isDir) {
      const size = await this.git
        .raw(["cat-file", "-s", `${branch}:${filePath}`])
        .then((s) => Number.parseInt(s.trim(), 10));
      lines.push(`**Size:** ${size} bytes`);
    }

    // Get last commit that modified this path
    try {
      const logOutput = await this.git.raw([
        "log",
        "-1",
        "--format=%H%n%h%n%an%n%aI%n%s",
        branch,
        "--",
        filePath,
      ]);
      const logLines = logOutput.trim().split("\n");
      if (logLines.length >= 5) {
        lines.push("");
        lines.push("## Last Modified");
        lines.push(`**Commit:** ${logLines[1]} - ${logLines[4]}`);
        lines.push(`**Author:** ${logLines[2]}`);
        lines.push(`**Date:** ${logLines[3]}`);
      }
    } catch {
      // Ignore log errors
    }

    return { content: lines.join("\n"), format };
  }

  // ========== Capabilities ==========

  @Read("/.meta/.capabilities")
  async readCapabilitiesHandler(_ctx: RouteContext): Promise<AFSEntry | undefined> {
    const operations = ["list", "read", "stat", "explain", "search"];
    if (this.accessMode === "readwrite") {
      operations.push("write", "delete", "rename");
    }

    const actionCatalogs: CapabilitiesManifest["actions"] = [];

    // diff is available in both modes conceptually, but exec() enforces readwrite
    // Include all actions in readwrite mode
    if (this.accessMode === "readwrite") {
      actionCatalogs.push({
        description: "Git workflow actions",
        catalog: [
          {
            name: "diff",
            description: "Compare two branches or refs",
            inputSchema: {
              type: "object",
              properties: {
                from: { type: "string", description: "Source ref" },
                to: { type: "string", description: "Target ref" },
                path: { type: "string", description: "Optional path filter" },
              },
              required: ["from", "to"],
            },
          },
          {
            name: "create-branch",
            description: "Create a new branch",
            inputSchema: {
              type: "object",
              properties: {
                name: { type: "string", description: "New branch name" },
                from: { type: "string", description: "Source ref (defaults to current HEAD)" },
              },
              required: ["name"],
            },
          },
          {
            name: "commit",
            description: "Commit staged changes",
            inputSchema: {
              type: "object",
              properties: {
                message: { type: "string", description: "Commit message" },
                author: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    email: { type: "string" },
                  },
                },
              },
              required: ["message"],
            },
          },
          {
            name: "merge",
            description: "Merge a branch into the current branch",
            inputSchema: {
              type: "object",
              properties: {
                branch: { type: "string", description: "Branch to merge" },
                message: { type: "string", description: "Custom merge message" },
              },
              required: ["branch"],
            },
          },
        ],
        discovery: {
          pathTemplate: "/:branch/.actions",
          note: "Git workflow actions (readwrite mode only)",
        },
      });
    }

    const manifest: CapabilitiesManifest = {
      schemaVersion: 1,
      provider: this.name,
      description: this.description || "Git repository provider",
      tools: [],
      actions: actionCatalogs,
      operations: this.getOperationsDeclaration(),
    };

    return {
      id: "/.meta/.capabilities",
      path: "/.meta/.capabilities",
      content: manifest,
      meta: { kind: "afs:capabilities", operations },
    };
  }

  // ========== Git Actions ==========

  /**
   * List available actions for a branch
   */
  @Actions("/:branch")
  async listBranchActions(ctx: RouteContext<{ branch: string }>): Promise<AFSListResult> {
    if (this.accessMode !== "readwrite") {
      return { data: [] };
    }

    const basePath = `/${ctx.params.branch}/.actions`;
    return {
      data: [
        {
          id: "diff",
          path: `${basePath}/diff`,
          summary: "Compare two branches or refs",
          meta: {
            kind: "afs:executable",
            kinds: ["afs:executable", "afs:node"],
            inputSchema: {
              type: "object",
              properties: {
                from: { type: "string", description: "Source ref" },
                to: { type: "string", description: "Target ref" },
                path: { type: "string", description: "Optional path filter" },
              },
              required: ["from", "to"],
            },
          },
        },
        {
          id: "create-branch",
          path: `${basePath}/create-branch`,
          summary: "Create a new branch from this ref",
          meta: {
            kind: "afs:executable",
            kinds: ["afs:executable", "afs:node"],
            inputSchema: {
              type: "object",
              properties: {
                name: { type: "string", description: "New branch name" },
                from: { type: "string", description: "Source ref (defaults to current HEAD)" },
              },
              required: ["name"],
            },
          },
        },
        {
          id: "commit",
          path: `${basePath}/commit`,
          summary: "Commit staged changes",
          meta: {
            kind: "afs:executable",
            kinds: ["afs:executable", "afs:node"],
            inputSchema: {
              type: "object",
              properties: {
                message: { type: "string", description: "Commit message" },
                author: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    email: { type: "string" },
                  },
                },
              },
              required: ["message"],
            },
          },
        },
        {
          id: "merge",
          path: `${basePath}/merge`,
          summary: "Merge another branch into this branch",
          meta: {
            kind: "afs:executable",
            kinds: ["afs:executable", "afs:node"],
            inputSchema: {
              type: "object",
              properties: {
                branch: { type: "string", description: "Branch to merge" },
                message: { type: "string", description: "Custom merge message" },
              },
              required: ["branch"],
            },
          },
        },
      ],
    };
  }

  /**
   * diff action — compare two branches or refs
   */
  @Actions.Exec("/:branch", "diff")
  async diffAction(
    _ctx: RouteContext<{ branch: string }>,
    args: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    await this.ready();

    const from = args.from as string;
    const to = args.to as string;
    const pathFilter = args.path as string | undefined;

    if (!from || !to) {
      return {
        success: false,
        error: { code: "INVALID_ARGS", message: "from and to are required" },
      };
    }

    try {
      // Get diff stat
      const diffArgs = ["diff", "--stat", "--name-only", `${from}...${to}`];
      if (pathFilter) {
        diffArgs.push("--", pathFilter);
      }
      const statOutput = await this.git.raw(diffArgs);
      const fileLines = statOutput
        .trim()
        .split("\n")
        .filter((l) => l.trim());
      const files = fileLines.map((path) => ({ path }));

      // Get diff patch
      const patchArgs = ["diff", `${from}...${to}`];
      if (pathFilter) {
        patchArgs.push("--", pathFilter);
      }
      const patch = await this.git.raw(patchArgs);

      return {
        success: true,
        data: {
          from,
          to,
          files,
          patch,
          filesChanged: files.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "DIFF_FAILED",
          message: (error as Error).message.replace(this.repoPath, "<repo>"),
        },
      };
    }
  }

  /**
   * create-branch action — create a new branch
   */
  @Actions.Exec("/:branch", "create-branch")
  async createBranchAction(
    _ctx: RouteContext<{ branch: string }>,
    args: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    await this.ready();

    const name = args.name as string;
    const from = args.from as string | undefined;

    if (!name) {
      return { success: false, error: { code: "INVALID_ARGS", message: "name is required" } };
    }

    // Validate branch name - reject path traversal
    if (name.includes("..")) {
      return {
        success: false,
        error: { code: "INVALID_NAME", message: "Branch name contains invalid characters" },
      };
    }

    try {
      if (from) {
        await this.git.raw(["branch", name, from]);
      } else {
        await this.git.raw(["branch", name]);
      }

      // Get the hash of the new branch
      const hash = await this.git.revparse([name]).then((h) => h.trim());

      return {
        success: true,
        data: { branch: name, hash },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "CREATE_BRANCH_FAILED",
          message: (error as Error).message.replace(this.repoPath, "<repo>"),
        },
      };
    }
  }

  /**
   * commit action — commit staged changes
   */
  @Actions.Exec("/:branch", "commit")
  async commitAction(
    _ctx: RouteContext<{ branch: string }>,
    args: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    await this.ready();

    const message = args.message as string;
    if (!message) {
      return { success: false, error: { code: "INVALID_ARGS", message: "message is required" } };
    }

    const author = args.author as { name?: string; email?: string } | undefined;

    try {
      const git = simpleGit(this.repoPath);

      // Check for staged changes
      const status = await git.status();
      if (
        status.staged.length === 0 &&
        status.files.filter((f) => f.index !== " " && f.index !== "?").length === 0
      ) {
        return {
          success: false,
          error: { code: "NO_CHANGES", message: "No staged changes to commit" },
        };
      }

      // Configure author if provided
      if (author?.name) {
        await git.addConfig("user.name", author.name, undefined, "local");
      }
      if (author?.email) {
        await git.addConfig("user.email", author.email, undefined, "local");
      }

      const result = await git.commit(message);

      return {
        success: true,
        data: {
          hash: result.commit || "",
          message,
          filesChanged: result.summary.changes,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "COMMIT_FAILED",
          message: (error as Error).message.replace(this.repoPath, "<repo>"),
        },
      };
    }
  }

  /**
   * merge action — merge a branch into current branch
   */
  @Actions.Exec("/:branch", "merge")
  async mergeAction(
    _ctx: RouteContext<{ branch: string }>,
    args: Record<string, unknown>,
  ): Promise<AFSExecResult> {
    await this.ready();

    const branch = args.branch as string;
    if (!branch) {
      return { success: false, error: { code: "INVALID_ARGS", message: "branch is required" } };
    }

    const customMessage = args.message as string | undefined;

    try {
      const git = simpleGit(this.repoPath);

      // Verify the branch exists
      const branches = await git.branchLocal();
      if (!branches.all.includes(branch)) {
        return {
          success: false,
          error: { code: "BRANCH_NOT_FOUND", message: `Branch '${branch}' not found` },
        };
      }

      const mergeArgs = [branch];
      if (customMessage) {
        mergeArgs.push("-m", customMessage);
      }

      const result = await git.merge(mergeArgs);

      // Get the resulting commit hash
      const hash = await git.revparse(["HEAD"]).then((h) => h.trim());

      return {
        success: true,
        data: {
          hash,
          merged: branch,
          conflicts: result.conflicts || [],
        },
      };
    } catch (error) {
      // Abort merge if there was a conflict
      try {
        const git = simpleGit(this.repoPath);
        await git.merge(["--abort"]);
      } catch {
        // Ignore abort errors
      }

      return {
        success: false,
        error: {
          code: "MERGE_FAILED",
          message: (error as Error).message.replace(this.repoPath, "<repo>"),
        },
      };
    }
  }

  // ========== .log/ Virtual Tree ==========

  /**
   * List .log/ → commit list with pagination
   */
  @List("/:branch/.log")
  async listLogHandler(ctx: RouteContext<{ branch: string }>): Promise<AFSListResult> {
    await this.ready();

    const branch = this.decodeBranchName(ctx.params.branch);
    await this.ensureBranchExists(branch);

    const options = ctx.options as { limit?: number; offset?: number };
    const limit = Math.min(options?.limit || LIST_MAX_LIMIT, LIST_MAX_LIMIT);
    const offset = options?.offset || 0;

    const commits = await this.getCommitList(branch, limit, offset);
    const branchEncoded = this.encodeBranchName(branch);

    const entries: AFSEntry[] = commits.map((commit, i) =>
      this.buildEntry(`/${branchEncoded}/.log/${offset + i}`, {
        meta: {
          hash: commit.hash,
          shortHash: commit.shortHash,
          author: commit.author,
          date: commit.date,
          message: commit.message,
        },
      }),
    );

    return { data: entries };
  }

  /**
   * Read .log/{index} → commit diff/patch content
   */
  @Read("/:branch/.log/:index")
  async readLogEntryHandler(
    ctx: RouteContext<{ branch: string; index: string }>,
  ): Promise<AFSEntry | undefined> {
    await this.ready();

    const branch = this.decodeBranchName(ctx.params.branch);
    await this.ensureBranchExists(branch);
    const index = Number.parseInt(ctx.params.index, 10);

    if (Number.isNaN(index) || index < 0) {
      throw new AFSNotFoundError(`/${this.encodeBranchName(branch)}/.log/${ctx.params.index}`);
    }

    const commits = await this.getCommitList(branch, 1, index);
    if (commits.length === 0) {
      throw new AFSNotFoundError(`/${this.encodeBranchName(branch)}/.log/${index}`);
    }

    const commit = commits[0]!;

    // Get diff for this commit
    let diff: string;
    try {
      diff = await this.git.raw(["show", "--stat", "--patch", commit.hash]);
    } catch {
      diff = "";
    }

    const branchEncoded = this.encodeBranchName(branch);
    return this.buildEntry(`/${branchEncoded}/.log/${index}`, {
      content: diff,
      meta: {
        hash: commit.hash,
        shortHash: commit.shortHash,
        author: commit.author,
        date: commit.date,
        message: commit.message,
      },
    });
  }

  /**
   * Read .log/{index}/.meta → commit metadata only (no diff)
   */
  @Read("/:branch/.log/:index/.meta")
  async readLogEntryMetaHandler(
    ctx: RouteContext<{ branch: string; index: string }>,
  ): Promise<AFSEntry | undefined> {
    await this.ready();

    const branch = this.decodeBranchName(ctx.params.branch);
    await this.ensureBranchExists(branch);
    const index = Number.parseInt(ctx.params.index, 10);

    if (Number.isNaN(index) || index < 0) {
      throw new AFSNotFoundError(
        `/${this.encodeBranchName(branch)}/.log/${ctx.params.index}/.meta`,
      );
    }

    const commits = await this.getCommitList(branch, 1, index);
    if (commits.length === 0) {
      throw new AFSNotFoundError(`/${this.encodeBranchName(branch)}/.log/${index}/.meta`);
    }

    const commit = commits[0]!;
    const branchEncoded = this.encodeBranchName(branch);
    return this.buildEntry(`/${branchEncoded}/.log/${index}/.meta`, {
      meta: {
        hash: commit.hash,
        shortHash: commit.shortHash,
        author: commit.author,
        date: commit.date,
        message: commit.message,
      },
    });
  }

  // ========== Private Helper Methods ==========

  /**
   * Decode branch name (replace ~ with /)
   */
  private async assertWithinWorktree(fullPath: string, worktreeRoot: string): Promise<void> {
    return assertPathWithinRoot(fullPath, worktreeRoot);
  }

  private decodeBranchName(encoded: string): string {
    return encoded.replace(/~/g, "/");
  }

  /**
   * Encode branch name (replace / with ~)
   */
  private encodeBranchName(branch: string): string {
    return branch.replace(/\//g, "~");
  }

  /**
   * Parse AFS path into branch and file path
   * Branch names may contain slashes and are encoded with ~ in paths
   */
  private parsePath(path: string): { branch?: string; filePath: string } {
    const normalized = join("/", path); // Ensure leading slash
    const segments = normalized.split("/").filter(Boolean);

    if (segments.length === 0) {
      return { branch: undefined, filePath: "" };
    }

    // Decode branch name (first segment): replace ~ with /
    const branch = segments[0]!.replace(/~/g, "/");
    const filePath = segments.slice(1).join("/");

    return { branch, filePath };
  }

  /**
   * Build AFS path with encoded branch name
   * Branch names with slashes are encoded by replacing / with ~
   */
  private buildBranchPath(branch: string, filePath?: string): string {
    const encodedBranch = this.encodeBranchName(branch);
    if (!filePath) {
      return `/${encodedBranch}`;
    }
    return `/${encodedBranch}/${filePath}`;
  }

  /**
   * Get list of available branches
   */
  private async getBranches(): Promise<string[]> {
    const branchSummary = await this.git.branchLocal();
    const allBranches = branchSummary.all;

    // Filter by allowed branches if specified
    if (this.options.branches && this.options.branches.length > 0) {
      return allBranches.filter((branch) => this.options.branches!.includes(branch));
    }

    return allBranches;
  }

  /**
   * Check if a branch exists, throw AFSNotFoundError if not
   */
  private async ensureBranchExists(branch: string): Promise<void> {
    const branches = await this.getBranches();
    if (!branches.includes(branch)) {
      throw new AFSNotFoundError(this.buildBranchPath(branch));
    }
  }

  /**
   * Get the number of children for a tree (directory) in git
   */
  private async getChildrenCount(branch: string, path: string): Promise<number> {
    try {
      const treeish = path ? `${branch}:${path}` : branch;
      const output = await this.git.raw(["ls-tree", treeish]);
      const lines = output.split("\n").filter((line) => line.trim());
      return lines.length;
    } catch {
      return 0;
    }
  }

  /**
   * Get the last commit on a branch
   */
  private async getLastCommit(
    branch: string,
  ): Promise<{ hash: string; shortHash: string; author: string; date: string; message: string }> {
    const output = await this.git.raw(["log", "-1", "--format=%H%n%h%n%an%n%aI%n%s", branch]);
    const lines = output.trim().split("\n");
    return {
      hash: lines[0] || "",
      shortHash: lines[1] || "",
      author: lines[2] || "",
      date: lines[3] || "",
      message: lines[4] || "",
    };
  }

  /**
   * Count total files in a tree (recursively)
   */
  private async getTreeFileCount(branch: string, path: string): Promise<number> {
    try {
      const treeish = path ? `${branch}:${path}` : branch;
      const output = await this.git.raw(["ls-tree", "-r", treeish]);
      const lines = output.split("\n").filter((line) => line.trim());
      return lines.length;
    } catch {
      return 0;
    }
  }

  /**
   * Get a list of commits on a branch with limit/offset
   */
  private async getCommitList(
    branch: string,
    limit: number,
    offset: number,
  ): Promise<{ hash: string; shortHash: string; author: string; date: string; message: string }[]> {
    try {
      const args = [
        "log",
        `--skip=${offset}`,
        `-${limit}`,
        "--format=%H%n%h%n%an%n%aI%n%s%n---COMMIT_SEP---",
        branch,
      ];
      const output = await this.git.raw(args);
      const blocks = output.split("---COMMIT_SEP---").filter((b) => b.trim());

      return blocks.map((block) => {
        const lines = block.trim().split("\n");
        return {
          hash: lines[0] || "",
          shortHash: lines[1] || "",
          author: lines[2] || "",
          date: lines[3] || "",
          message: lines[4] || "",
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Ensure worktree exists for a branch (lazy creation)
   */
  private async ensureWorktree(branch: string): Promise<string> {
    if (this.worktrees.has(branch)) {
      return this.worktrees.get(branch)!;
    }

    // Check if this is the current branch in the main repo
    const currentBranch = await this.git.revparse(["--abbrev-ref", "HEAD"]);
    if (currentBranch.trim() === branch) {
      // Use the main repo path for the current branch
      this.worktrees.set(branch, this.repoPath);
      return this.repoPath;
    }

    const worktreePath = join(this.tempBase, branch);

    // Check if worktree directory already exists
    const exists = await stat(worktreePath)
      .then(() => true)
      .catch(() => false);

    if (!exists) {
      await mkdir(this.tempBase, { recursive: true });
      await this.git.raw(["worktree", "add", worktreePath, branch]);
    }

    this.worktrees.set(branch, worktreePath);
    return worktreePath;
  }

  /**
   * List files using git ls-tree (no worktree needed)
   * Note: list() returns only children, never the path itself (per new semantics)
   */
  private async listWithGitLsTree(
    branch: string,
    path: string,
    options?: { maxDepth?: number; limit?: number },
  ): Promise<AFSListResult> {
    const maxDepth = options?.maxDepth ?? 1;
    const limit = Math.min(options?.limit || LIST_MAX_LIMIT, LIST_MAX_LIMIT);

    const entries: AFSEntry[] = [];
    const targetPath = path || "";
    const treeish = targetPath ? `${branch}:${targetPath}` : branch;

    try {
      // Check if the path exists and is a directory
      const pathType = await this.git
        .raw(["cat-file", "-t", treeish])
        .then((t) => t.trim())
        .catch(() => null);

      if (pathType === null) {
        // Path doesn't exist
        throw new AFSNotFoundError(this.buildBranchPath(branch, path));
      }

      // If it's a file (blob), it has no children
      if (pathType === "blob") {
        return { data: [] };
      }

      // It's a directory
      // maxDepth: 0 means return no children
      if (maxDepth === 0) {
        return { data: [] };
      }

      // List directory contents via BFS
      interface QueueItem {
        path: string;
        depth: number;
      }

      const queue: QueueItem[] = [{ path: targetPath, depth: 0 }];

      while (queue.length > 0) {
        const item = queue.shift()!;
        const { path: itemPath, depth } = item;

        // List directory contents
        const itemTreeish = itemPath ? `${branch}:${itemPath}` : branch;
        const output = await this.git.raw(["ls-tree", "-l", itemTreeish]);

        const lines = output
          .split("\n")
          .filter((line) => line.trim())
          .slice(0, limit - entries.length);

        for (const line of lines) {
          // Format: <mode> <type> <hash> <size (with padding)> <name>
          const match = line.match(/^(\d+)\s+(blob|tree)\s+(\w+)\s+(-|\d+)\s+(.+)$/);
          if (!match) continue;

          const type = match[2]!;
          const sizeStr = match[4]!;
          const name = match[5]!;
          const isDirectory = type === "tree";
          const size = sizeStr === "-" ? undefined : Number.parseInt(sizeStr, 10);

          const fullPath = itemPath ? `${itemPath}/${name}` : name;
          const afsPath = this.buildBranchPath(branch, fullPath);

          // For directories, get children count
          const childrenCount = isDirectory
            ? await this.getChildrenCount(branch, fullPath)
            : undefined;

          entries.push(
            this.buildEntry(afsPath, {
              meta: { kind: isDirectory ? "git:directory" : "git:file", size, childrenCount },
            }),
          );

          // Add to queue if it's a directory and we haven't reached max depth
          if (isDirectory && depth + 1 < maxDepth) {
            queue.push({ path: fullPath, depth: depth + 1 });
          }

          // Check limit
          if (entries.length >= limit) {
            return { data: entries };
          }
        }
      }

      return { data: entries };
    } catch (error) {
      // Re-throw AFSNotFoundError as-is
      if (error instanceof AFSNotFoundError) {
        throw error;
      }
      throw new Error(`Failed to list: ${(error as Error).message}`);
    }
  }

  // ========== Public Git Operations ==========

  /**
   * Fetch latest changes from remote
   */
  async fetch(): Promise<void> {
    await this.ready();
    await this.git.fetch();
  }

  /**
   * Pull latest changes from remote for current branch
   */
  async pull(): Promise<void> {
    await this.ready();
    await this.git.pull();
  }

  /**
   * Push local changes to remote
   */
  async push(branch?: string): Promise<void> {
    await this.ready();
    if (branch) {
      await this.git.push("origin", branch);
    } else {
      await this.git.push();
    }
  }

  /**
   * Cleanup all worktrees (useful when unmounting)
   */
  async cleanup(): Promise<void> {
    await this.ready();
    for (const [_branch, worktreePath] of this.worktrees) {
      try {
        await this.git.raw(["worktree", "remove", worktreePath, "--force"]);
      } catch (_error) {
        // Ignore errors during cleanup
      }
    }
    this.worktrees.clear();

    // Remove temp directory
    try {
      await rm(this.tempBase, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }

    // Cleanup cloned repository if auto-cloned and autoCleanup enabled
    const autoCleanup = this.options.autoCleanup ?? true;
    if (this.isAutoCloned && autoCleanup && this.clonedPath) {
      try {
        await rm(this.clonedPath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

const _typeCheck: AFSModuleClass<AFSGit, AFSGitOptions> = AFSGit;

export default AFSGit;
