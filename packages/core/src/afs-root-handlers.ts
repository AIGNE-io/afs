/**
 * Root-level system path handlers for AFS.
 *
 * Handles /.actions and /.meta at the AFS root level.
 * These functions produce structured data for root system paths
 * without depending on the AFS class directly.
 */
import { AFSNotFoundError, AFSValidationError } from "./error.js";
import type {
  AFSDeleteOptions,
  AFSDeleteResult,
  AFSEntry,
  AFSExecResult,
  AFSListResult,
  AFSModule,
  AFSReadResult,
  AFSStatResult,
  AFSWriteEntryPayload,
  AFSWriteOptions,
  AFSWriteResult,
} from "./type.js";

/** Mount info needed for readRootMeta */
export interface RootMountInfo {
  path: string;
  module: AFSModule;
}

/**
 * Build the root actions list.
 * Returns mount and unmount action entries based on available capabilities.
 */
export function buildRootActions(hasLoadProvider: boolean): AFSEntry[] {
  const actions: AFSEntry[] = [];

  if (hasLoadProvider) {
    actions.push({
      id: "mount",
      path: "/.actions/mount",
      summary: "Mount a new provider",
      meta: {
        kind: "afs:executable",
        kinds: ["afs:executable", "afs:node"],
      },
      actions: [
        {
          name: "mount",
          description: "Mount a provider from URI",
          inputSchema: {
            type: "object",
            properties: {
              uri: { type: "string", description: "Provider URI" },
              path: { type: "string", description: "Mount path" },
              accessMode: {
                type: "string",
                enum: ["readonly", "readwrite"],
                description: "Access mode (default: readonly)",
              },
              auth: { type: "string", description: "Authentication token" },
              description: { type: "string", description: "Human-readable description" },
              scope: {
                type: "string",
                enum: ["cwd", "project", "user"],
                description:
                  "Where to persist the mount config. 'cwd' (default) = current directory, 'project' = project root (.git), 'user' = user home",
              },
              sensitiveArgs: {
                type: "array",
                items: { type: "string" },
                description:
                  "Field names that should be treated as sensitive credentials (stored in credentials.toml instead of config.toml)",
              },
            },
            required: ["uri", "path"],
          },
        },
      ],
    });
  }

  actions.push({
    id: "unmount",
    path: "/.actions/unmount",
    summary: "Unmount a provider",
    meta: {
      kind: "afs:executable",
      kinds: ["afs:executable", "afs:node"],
    },
    actions: [
      {
        name: "unmount",
        description: "Unmount a provider at a given path",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Path to unmount" },
            scope: {
              type: "string",
              enum: ["cwd", "project", "user"],
              description: "Config scope to remove mount from. If omitted, searches all scopes.",
            },
          },
          required: ["path"],
        },
      },
    ],
  });

  // CRUD actions — allow scripts to read/list/write/delete via root actions
  actions.push({
    id: "read",
    path: "/.actions/read",
    summary: "Read file content",
    meta: {
      kind: "afs:executable",
      kinds: ["afs:executable", "afs:node"],
    },
    actions: [
      {
        name: "read",
        description: "Read file content at a given path",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "AFS path to read" },
          },
          required: ["path"],
        },
      },
    ],
  });

  actions.push({
    id: "list",
    path: "/.actions/list",
    summary: "List directory content",
    meta: {
      kind: "afs:executable",
      kinds: ["afs:executable", "afs:node"],
    },
    actions: [
      {
        name: "list",
        description: "List directory content at a given path",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "AFS path to list" },
          },
          required: ["path"],
        },
      },
    ],
  });

  actions.push({
    id: "write",
    path: "/.actions/write",
    summary: "Write file content",
    meta: {
      kind: "afs:executable",
      kinds: ["afs:executable", "afs:node"],
    },
    actions: [
      {
        name: "write",
        description: "Write content to a file at a given path",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "AFS path to write" },
            content: { type: "string", description: "Content to write" },
          },
          required: ["path", "content"],
        },
      },
    ],
  });

  actions.push({
    id: "delete",
    path: "/.actions/delete",
    summary: "Delete file or directory",
    meta: {
      kind: "afs:executable",
      kinds: ["afs:executable", "afs:node"],
    },
    actions: [
      {
        name: "delete",
        description: "Delete a file or directory at a given path",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "AFS path to delete" },
            recursive: {
              type: "boolean",
              description: "Recursively delete directories (default: false)",
            },
          },
          required: ["path"],
        },
      },
    ],
  });

  return actions;
}

/**
 * Read a specific root action (/.actions/{name}).
 */
export function readRootAction(path: string, actions: AFSEntry[]): AFSReadResult {
  const actionName = path.slice("/.actions/".length);
  const entry = actions.find((a) => a.id === actionName);
  if (!entry) {
    throw new AFSNotFoundError(path, `Root action not found: ${actionName}`);
  }

  const action = entry.actions?.[0];
  return {
    data: {
      ...entry,
      content: {
        description: action?.description,
        inputSchema: action?.inputSchema,
      },
      meta: {
        ...entry.meta,
        description: action?.description,
        inputSchema: action?.inputSchema,
      },
    },
  };
}

/**
 * Read root metadata (/.meta).
 */
export function readRootMeta(mounts: RootMountInfo[], actions: AFSEntry[]): AFSReadResult {
  const mountedProviders = mounts.map((m) => {
    const mod = m.module;
    const isReadWrite = mod.accessMode === "readwrite";
    const operations: string[] = [];
    if (mod.read) operations.push("read");
    if (mod.list) operations.push("list");
    if (mod.stat) operations.push("stat");
    if (mod.write && isReadWrite) operations.push("write");
    if (mod.delete && isReadWrite) operations.push("delete");
    if (mod.search) operations.push("search");
    if (mod.exec) operations.push("exec");
    if (mod.explain) operations.push("explain");
    if (mod.rename && isReadWrite) operations.push("rename");
    return {
      name: mod.name,
      path: m.path,
      description: mod.description,
      operations,
    };
  });

  const rootActions = actions.map((a) => ({
    name: a.id,
    description: a.actions?.[0]?.description || a.summary || "",
  }));

  return {
    data: {
      id: ".meta",
      path: "/.meta",
      content: {
        description: "AFS root metadata",
        childrenCount: mounts.length,
        mountedProviders,
        rootActions,
      },
      meta: {
        kind: "afs:meta",
      },
    },
  };
}

/**
 * Read root actions directory (/.actions).
 */
export function readRootActions(actions: AFSEntry[]): AFSReadResult {
  return {
    data: {
      id: ".actions",
      path: "/.actions",
      content: {
        actions: actions.map((a) => ({
          name: a.id,
          path: a.path,
          description: a.actions?.[0]?.description || a.summary || "",
        })),
      },
      meta: {
        kind: "afs:directory",
        childrenCount: actions.length,
      },
    },
  };
}

/**
 * Stat a root action path (/.actions or /.actions/{name}).
 */
export function statRootAction(path: string, actions: AFSEntry[]): AFSStatResult {
  if (path === "/.actions") {
    return {
      data: {
        id: ".actions",
        path: "/.actions",
        meta: {
          kind: "afs:directory",
          childrenCount: actions.length,
        },
      },
    };
  }

  // /.actions/{name} — delegate to readRootAction and strip content
  const readResult = readRootAction(path, actions);
  if (readResult.data) {
    const { content: _content, ...statData } = readResult.data;
    return { data: statData };
  }

  throw new AFSNotFoundError(path);
}

/**
 * Stat a root meta path (/.meta or /.meta/{subpath}).
 */
export function statRootMeta(path: string): AFSStatResult {
  if (path === "/.meta") {
    return {
      data: {
        id: ".meta",
        path: "/.meta",
        meta: {
          kind: "afs:meta",
          childrenCount: 1, // .capabilities
        },
      },
    };
  }

  if (path === "/.meta/.capabilities") {
    return {
      data: {
        id: ".capabilities",
        path: "/.meta/.capabilities",
        meta: {
          kind: "afs:capabilities",
        },
      },
    };
  }

  throw new AFSNotFoundError(path);
}

/** Callbacks for root action execution */
export interface RootActionCallbacks {
  loadProvider?: (uri: string, path: string, options?: Record<string, unknown>) => Promise<void>;
  unmount: (path: string) => boolean;
  unloadProvider?: (path: string, options?: Record<string, unknown>) => Promise<void>;
  read: (path: string) => Promise<AFSReadResult>;
  list: (path: string, options?: Record<string, any>) => Promise<AFSListResult>;
  write: (
    path: string,
    content: AFSWriteEntryPayload,
    options?: AFSWriteOptions,
  ) => Promise<AFSWriteResult>;
  delete: (path: string, options?: AFSDeleteOptions) => Promise<AFSDeleteResult>;
}

/**
 * Route root action execution to mount, unmount, read, list, write, or delete.
 */
export async function execRootAction(
  path: string,
  args: Record<string, any>,
  callbacks: RootActionCallbacks,
): Promise<AFSExecResult> {
  const actionName = path.slice("/.actions/".length);

  if (actionName === "mount") {
    return await execRootMountAction(args, callbacks.loadProvider);
  }

  if (actionName === "unmount") {
    return await execRootUnmountAction(args, callbacks.unmount, callbacks.unloadProvider);
  }

  if (actionName === "read") {
    return await execRootReadAction(args, callbacks.read);
  }

  if (actionName === "list") {
    return await execRootListAction(args, callbacks.list);
  }

  if (actionName === "write") {
    return await execRootWriteAction(args, callbacks.write);
  }

  if (actionName === "delete") {
    return await execRootDeleteAction(args, callbacks.delete);
  }

  throw new AFSNotFoundError(path, `Root action not found: ${actionName}`);
}

async function execRootMountAction(
  args: Record<string, any>,
  loadProvider?: (uri: string, path: string, options?: Record<string, unknown>) => Promise<void>,
): Promise<AFSExecResult> {
  if (typeof args.uri !== "string" || args.uri === "") {
    throw new AFSValidationError("Input validation failed: uri: must be a non-empty string");
  }
  if (typeof args.path !== "string" || args.path === "") {
    throw new AFSValidationError("Input validation failed: path: must be a non-empty string");
  }

  if (!loadProvider) {
    throw new Error("loadProvider not configured");
  }

  const { uri, path, sensitiveArgs, ...options } = args;
  if (Array.isArray(sensitiveArgs) && sensitiveArgs.length > 0) {
    options._sensitiveArgs = sensitiveArgs;
  }
  await loadProvider(uri, path, Object.keys(options).length > 0 ? options : undefined);

  return {
    success: true,
    data: { uri, path },
  };
}

async function execRootUnmountAction(
  args: Record<string, any>,
  unmount: (path: string) => boolean,
  unloadProvider?: (path: string, options?: Record<string, unknown>) => Promise<void>,
): Promise<AFSExecResult> {
  if (typeof args.path !== "string" || args.path === "") {
    throw new AFSValidationError("Input validation failed: path: must be a non-empty string");
  }

  const success = unmount(args.path);
  if (!success) {
    return {
      success: false,
      error: {
        code: "NOT_FOUND",
        message: `No provider mounted at ${args.path}`,
      },
    };
  }

  if (unloadProvider) {
    try {
      const { path: _path, ...options } = args;
      await unloadProvider(args.path, Object.keys(options).length > 0 ? options : undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[unmount] config persistence failed: ${msg}`);
    }
  }

  return {
    success: true,
    data: { path: args.path },
  };
}

async function execRootReadAction(
  args: Record<string, any>,
  read: (path: string) => Promise<AFSReadResult>,
): Promise<AFSExecResult> {
  if (typeof args.path !== "string" || args.path === "") {
    throw new AFSValidationError("Input validation failed: path: must be a non-empty string");
  }

  try {
    const result = await read(args.path);
    return {
      success: true,
      data: result.data as Record<string, unknown> | undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: {
        code: err instanceof AFSNotFoundError ? "NOT_FOUND" : "READ_ERROR",
        message,
      },
    };
  }
}

async function execRootListAction(
  args: Record<string, any>,
  list: (path: string, options?: Record<string, any>) => Promise<AFSListResult>,
): Promise<AFSExecResult> {
  if (typeof args.path !== "string" || args.path === "") {
    throw new AFSValidationError("Input validation failed: path: must be a non-empty string");
  }

  try {
    const result = await list(args.path);
    return {
      success: true,
      data: result.data as unknown as Record<string, unknown>,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: {
        code: "LIST_ERROR",
        message,
      },
    };
  }
}

async function execRootWriteAction(
  args: Record<string, any>,
  write: (
    path: string,
    content: AFSWriteEntryPayload,
    options?: AFSWriteOptions,
  ) => Promise<AFSWriteResult>,
): Promise<AFSExecResult> {
  if (typeof args.path !== "string" || args.path === "") {
    throw new AFSValidationError("Input validation failed: path: must be a non-empty string");
  }
  if (args.content === undefined || args.content === null) {
    throw new AFSValidationError("Input validation failed: content: is required");
  }

  try {
    const result = await write(args.path, { content: args.content });
    return {
      success: true,
      data: result.data as unknown as Record<string, unknown>,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: {
        code: "WRITE_ERROR",
        message,
      },
    };
  }
}

async function execRootDeleteAction(
  args: Record<string, any>,
  del: (path: string, options?: AFSDeleteOptions) => Promise<AFSDeleteResult>,
): Promise<AFSExecResult> {
  if (typeof args.path !== "string" || args.path === "") {
    throw new AFSValidationError("Input validation failed: path: must be a non-empty string");
  }

  try {
    const options: AFSDeleteOptions = {};
    if (args.recursive) {
      options.recursive = true;
    }
    await del(args.path, options);
    return {
      success: true,
      data: { path: args.path },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: {
        code: err instanceof AFSNotFoundError ? "NOT_FOUND" : "DELETE_ERROR",
        message,
      },
    };
  }
}
