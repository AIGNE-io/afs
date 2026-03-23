/**
 * AFS CLI Interactive REPL
 *
 * Single-file REPL implementation for `afs -i` / `afs --interactive`.
 * Provides: REPL loop, cd/pwd, Tab completion, explore TUI integration.
 */

import { basename } from "node:path";
import type { Interface } from "node:readline";
import type { AFS, AFSEntry, AFSModule } from "@aigne/afs";
import { joinURL } from "ufo";
import type { MountFailure } from "./config/afs-loader.js";
import type { AFSCommandExecutor } from "./core/executor/index.js";

// ─── Types ───────────────────────────────────────────────────────────────

export interface ReplOptions {
  executor: AFSCommandExecutor;
  afs: AFS;
  version: string;
}

export interface ReplContext {
  executor: AFSCommandExecutor;
  afs: AFS;
  version: string;
  currentPath: string;
  currentNamespace: string | null;
  completionCache: Map<string, AFSEntry[]>;
}

export interface BuiltinResult {
  output?: string;
  exit?: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────

const BUILTIN_COMMANDS = ["cd", "pwd", "help", "clear", "exit", "quit"];

/** Commands that default to current path when no path argument is given in REPL */
const DEFAULT_PATH_COMMANDS = new Set(["ls", "read", "stat", "explain", "explore"]);

const ALL_COMMANDS = [
  "ls",
  "read",
  "write",
  "delete",
  "stat",
  "exec",
  "explain",
  "search",
  "mount",
  "blocklet",
  "vault",
  "service",
  "explore",
  "cd",
  "pwd",
  "help",
  "clear",
  "exit",
];

// ─── Context ─────────────────────────────────────────────────────────────

export function createReplContext(options: ReplOptions): ReplContext {
  return {
    executor: options.executor,
    afs: options.afs,
    version: options.version,
    currentPath: "/",
    currentNamespace: null,
    completionCache: new Map(),
  };
}

// ─── Prompt ──────────────────────────────────────────────────────────────

export function getPrompt(ctx: ReplContext): string {
  const dirname = ctx.currentPath === "/" ? "/" : basename(ctx.currentPath);
  const nsPrefix = ctx.currentNamespace ? `${ctx.currentNamespace}:` : "";
  return `afs ${nsPrefix}${dirname}> `;
}

// ─── Banner ──────────────────────────────────────────────────────────────

export function getBanner(ctx: ReplContext): string {
  const mountCount = ctx.afs.getMounts().length;
  const plural = mountCount === 1 ? "provider" : "providers";
  return `AFS Interactive Shell v${ctx.version} — ${mountCount} ${plural} mounted. Type "help" for commands.`;
}

// ─── Builtin Commands ────────────────────────────────────────────────────

export function isBuiltinCommand(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  const cmd = trimmed.split(/\s+/)[0]!;
  return BUILTIN_COMMANDS.includes(cmd);
}

export async function handleBuiltinCommand(
  input: string,
  ctx: ReplContext,
): Promise<BuiltinResult | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/);
  const cmd = parts[0]!;

  switch (cmd) {
    case "exit":
    case "quit":
      return { exit: true, output: "Bye!" };

    case "help":
      return { output: formatHelp() };

    case "clear":
      console.clear();
      return {};

    case "pwd":
      return handlePwd(ctx);

    case "cd":
      return handleCd(parts.slice(1).join(" "), ctx);

    default:
      return null;
  }
}

function formatHelp(): string {
  const lines = [
    "Available commands:",
    "",
    "  AFS Commands:",
    "    ls [path]               List directory contents (default: current dir)",
    "    read [path]             Read file content (default: current node)",
    "    write <path> [content]  Write content to file",
    "    delete <path>           Delete file or directory",
    "    stat [path]             Get file or directory info (default: current node)",
    "    exec <action>           Execute an action",
    "    explain [topic]         Explain AFS concepts or paths (default: current path)",
    "    search <path> <query>   Search content in a path",
    "    mount                   Mount management (add, list, remove)",
    "    blocklet                Blocklet management (install, list, uninstall)",
    "    vault                   Credential vault management",
    "    service                 Daemon service management",
    "    explore [path]          Interactive TUI explorer (default: current dir)",
    "",
    "  REPL Commands:",
    "    cd [path]               Change working directory",
    "    pwd                     Print working directory",
    "    help                    Show this help",
    "    clear                   Clear screen",
    "    exit / quit             Exit REPL",
    "",
    "  Tips:",
    "    - Commands work with or without 'afs' prefix",
    "    - Use Tab for command and path completion",
    "    - Ctrl+D to exit",
  ];
  return lines.join("\n");
}

// ─── cd / pwd ────────────────────────────────────────────────────────────

function handlePwd(ctx: ReplContext): BuiltinResult {
  if (ctx.currentNamespace) {
    return { output: `@${ctx.currentNamespace}${ctx.currentPath}` };
  }
  return { output: ctx.currentPath };
}

async function handleCd(target: string, ctx: ReplContext): Promise<BuiltinResult> {
  if (!target || target.trim() === "") {
    // cd with no args → go to root
    ctx.currentPath = "/";
    return {};
  }

  const trimmed = target.trim();

  // Handle @default → reset namespace
  if (trimmed === "@default") {
    ctx.currentNamespace = null;
    ctx.currentPath = "/";
    return {};
  }

  // Handle @namespace syntax
  if (trimmed.startsWith("@")) {
    const rest = trimmed.slice(1);
    const slashIdx = rest.indexOf("/");
    if (slashIdx === -1) {
      // @namespace only → switch to namespace root
      const ns = rest;
      if (!ns) return { output: "cd: invalid namespace" };
      // Validate by calling stat on namespace root
      try {
        const canonicalPath = `$afs:${ns}/`;
        await ctx.afs.stat(canonicalPath);
        ctx.currentNamespace = ns;
        ctx.currentPath = "/";
        return {};
      } catch {
        return { output: `cd: no such path: @${ns}/` };
      }
    }
    const ns = rest.slice(0, slashIdx);
    const path = rest.slice(slashIdx) || "/";
    if (!ns) return { output: "cd: invalid namespace" };
    try {
      const canonicalPath = `$afs:${ns}${path}`;
      await ctx.afs.stat(canonicalPath);
      ctx.currentNamespace = ns;
      ctx.currentPath = path;
      return {};
    } catch {
      return { output: `cd: no such path: @${ns}${path}` };
    }
  }

  // Handle absolute path
  if (trimmed.startsWith("/")) {
    const resolved = normalizePath(trimmed);
    try {
      const canonicalPath = ctx.currentNamespace
        ? `$afs:${ctx.currentNamespace}${resolved}`
        : resolved;
      await ctx.afs.stat(canonicalPath);
      ctx.currentPath = resolved;
      return {};
    } catch {
      return { output: `cd: no such path: ${trimmed}` };
    }
  }

  // Handle relative path (including ..)
  const resolved = normalizePath(joinURL(ctx.currentPath, trimmed));
  try {
    const canonicalPath = ctx.currentNamespace
      ? `$afs:${ctx.currentNamespace}${resolved}`
      : resolved;
    await ctx.afs.stat(canonicalPath);
    ctx.currentPath = resolved;
    return {};
  } catch {
    return { output: `cd: no such path: ${trimmed}` };
  }
}

function normalizePath(path: string): string {
  // Split into segments, resolve .., remove empty segments
  const parts = path.split("/").filter(Boolean);
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === "..") {
      resolved.pop();
    } else if (part !== ".") {
      resolved.push(part);
    }
  }
  return `/${resolved.join("/")}`;
}

// ─── Argv Path Preprocessing ─────────────────────────────────────────────

export function resolveArgvPath(input: string, ctx: ReplContext): string[] {
  const tokens = tokenize(input);
  if (tokens.length === 0) return tokens;

  // Find the command name (skip optional 'afs' prefix)
  let cmdIdx = 0;
  if (tokens[0] === "afs" && tokens.length > 1) cmdIdx = 1;
  const cmd = tokens[cmdIdx];
  if (!cmd) return tokens;

  // Commands with subcommands manage their own arguments — skip path resolution entirely.
  // Their positional args are IDs, URIs, or sources — not AFS paths.
  const SUBCOMMAND_CMDS = new Set(["blocklet", "vault", "service", "mount"]);
  if (SUBCOMMAND_CMDS.has(cmd)) return tokens;

  // Find first positional argument (non-option) after the command
  let argIdx = -1;
  for (let i = cmdIdx + 1; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (!token.startsWith("-") || /^-\d/.test(token)) {
      argIdx = i;
      break;
    }
    // Skip --option value pairs
    if (token.startsWith("--") && !token.includes("=") && i + 1 < tokens.length) {
      i++; // skip the value
    }
  }

  if (argIdx === -1) {
    // No positional arg found — inject current path for safe commands
    if (DEFAULT_PATH_COMMANDS.has(cmd)) {
      const currentFullPath = ctx.currentNamespace
        ? `@${ctx.currentNamespace}${ctx.currentPath}`
        : ctx.currentPath;
      tokens.push(currentFullPath);
    }
    return tokens;
  }

  const arg = tokens[argIdx]!;

  // Don't resolve if already absolute, canonical, or namespace-prefixed
  if (arg.startsWith("/") || arg.startsWith("@") || arg.startsWith("$afs")) {
    return tokens;
  }

  // Resolve relative path
  const resolved = normalizePath(joinURL(ctx.currentPath, arg));

  // Add namespace prefix if in a non-default namespace
  const finalPath = ctx.currentNamespace ? `@${ctx.currentNamespace}${resolved}` : resolved;

  // Replace the token in the original input
  tokens[argIdx] = finalPath;
  return tokens;
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    if (inQuote) {
      if (char === quoteChar) {
        inQuote = false;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuote = true;
      quoteChar = char;
    } else if (char === " " || char === "\t") {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

// ─── Explore Detection ───────────────────────────────────────────────────

export function isExploreCommand(cmd: string): boolean {
  const normalized = cmd.replace(/^afs\s+/, "").trim();
  return normalized === "explore" || normalized.startsWith("explore ");
}

interface ExploreArgs {
  path: string;
  web: boolean;
  port: number;
}

function parseExploreArgs(cmd: string, ctx: ReplContext): ExploreArgs {
  const normalized = cmd.replace(/^afs\s+/, "").trim();
  const parts = normalized.split(/\s+/).slice(1); // drop "explore"

  let web = false;
  let port = 0;
  const pathParts: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (part === "--web") {
      web = true;
    } else if (part === "--port" && i + 1 < parts.length) {
      port = Number(parts[++i]) || 0;
    } else if (part.startsWith("--port=")) {
      port = Number(part.slice(7)) || 0;
    } else if (!part.startsWith("-")) {
      pathParts.push(part);
    }
  }

  let path = pathParts[0];
  if (!path) {
    path = ctx.currentNamespace
      ? `$afs:${ctx.currentNamespace}${ctx.currentPath}`
      : ctx.currentPath;
  } else if (!path.startsWith("/") && !path.startsWith("@") && !path.startsWith("$afs")) {
    const resolved = normalizePath(joinURL(ctx.currentPath, path));
    path = ctx.currentNamespace ? `$afs:${ctx.currentNamespace}${resolved}` : resolved;
  }

  return { path, web, port };
}

// ─── Tab Completion ──────────────────────────────────────────────────────

export function createCompleter(ctx: ReplContext) {
  return function completer(
    line: string,
    callback: (err: Error | null, result: [string[], string]) => void,
  ): void {
    const trimmed = line.trimStart();
    const tokens = trimmed.split(/\s+/);

    // Command completion: first token
    if (tokens.length <= 1) {
      const partial = tokens[0] || "";
      const matches = ALL_COMMANDS.filter((c) => c.startsWith(partial));
      callback(null, [matches, partial]);
      return;
    }

    // Path completion: after command name
    // Find the last token as the path being completed
    const lastToken = tokens[tokens.length - 1]!;

    // Don't complete option flags (but allow negative numeric paths like -1001311135887)
    if (lastToken.startsWith("-") && !/^-\d/.test(lastToken)) {
      callback(null, [[], lastToken]);
      return;
    }

    // Determine parent dir and prefix for completion
    let parentDir: string;
    let prefix: string;

    if (lastToken.includes("/")) {
      const lastSlash = lastToken.lastIndexOf("/");
      const parentPart = lastToken.slice(0, lastSlash + 1) || "/";
      prefix = lastToken.slice(lastSlash + 1);
      // Resolve parent relative to current path
      if (
        parentPart.startsWith("/") ||
        parentPart.startsWith("@") ||
        parentPart.startsWith("$afs")
      ) {
        parentDir = parentPart;
      } else {
        parentDir = joinURL(ctx.currentPath, parentPart);
      }
    } else {
      parentDir = ctx.currentPath;
      prefix = lastToken;
    }

    // Add namespace if needed
    const queryPath =
      ctx.currentNamespace && !parentDir.startsWith("@") && !parentDir.startsWith("$afs")
        ? `$afs:${ctx.currentNamespace}${parentDir}`
        : parentDir;

    // Check cache
    const cacheKey = queryPath;
    const cached = ctx.completionCache.get(cacheKey);
    if (cached) {
      const completions = buildCompletions(cached, prefix, lastToken);
      callback(null, [completions, lastToken]);
      return;
    }

    // Query AFS
    ctx.afs
      .list(queryPath)
      .then((result) => {
        const entries = result.data || [];
        ctx.completionCache.set(cacheKey, entries);
        const completions = buildCompletions(entries, prefix, lastToken);
        callback(null, [completions, lastToken]);
      })
      .catch(() => {
        callback(null, [[], lastToken]);
      });
  };
}

function buildCompletions(entries: AFSEntry[], prefix: string, lastToken: string): string[] {
  const matches = entries.filter((e) => {
    const name = basename(e.path);
    return name.startsWith(prefix);
  });

  return matches.map((e) => {
    const name = basename(e.path);
    const isDir = typeof e.meta?.childrenCount === "number";
    const suffix = isDir ? "/" : " ";
    // Build the completion to replace lastToken
    if (lastToken.includes("/")) {
      const lastSlash = lastToken.lastIndexOf("/");
      return lastToken.slice(0, lastSlash + 1) + name + suffix;
    }
    return name + suffix;
  });
}

// ─── Blessed Cleanup ─────────────────────────────────────────────────────

function cleanupStdinAfterBlessed(): void {
  const stdin = process.stdin as NodeJS.ReadStream & {
    _blessedInput?: unknown;
    _keypressHandler?: unknown;
    _dataHandler?: unknown;
    _keypressDecoder?: unknown;
    _kpiListener?: unknown;
    _readableState?: { flowing: unknown; reading: boolean };
    setRawMode?: (mode: boolean) => void;
  };

  stdin.removeAllListeners("keypress");
  stdin.removeAllListeners("data");

  delete stdin._blessedInput;
  delete stdin._keypressHandler;
  delete stdin._dataHandler;
  delete stdin._keypressDecoder;
  delete stdin._kpiListener;

  if (stdin.setRawMode) {
    stdin.setRawMode(false);
  }

  if (stdin._readableState) {
    stdin._readableState.flowing = null;
    stdin._readableState.reading = false;
  }
}

// ─── Spinner ──────────────────────────────────────────────────────────────

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;

function createSpinner() {
  let frameIdx = 0;
  let text = "";
  let timer: ReturnType<typeof setInterval> | null = null;

  return {
    start(initialText: string) {
      text = initialText;
      timer = setInterval(() => {
        const frame = SPINNER_FRAMES[frameIdx % SPINNER_FRAMES.length]!;
        process.stderr.write(`\r${frame} ${text}`);
        frameIdx++;
      }, SPINNER_INTERVAL_MS);
    },
    update(newText: string) {
      text = newText;
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      process.stderr.write("\r\x1b[K");
    },
  };
}

// ─── Main REPL ───────────────────────────────────────────────────────────

export async function startRepl(options: {
  cwd: string;
  version: string;
  onExit?: () => Promise<void>;
  /** Pre-created providers to mount directly (e.g. mock-based providers that can't be recreated from URI) */
  extraProviders?: Array<{ provider: AFSModule; mountPath: string }>;
}): Promise<void> {
  const { cwd, version, onExit, extraProviders } = options;

  // Lazy-load heavy deps that aren't available in non-Node environments
  const { createInterface } = await import("node:readline");
  const { loadAFS } = await import("./config/afs-loader.js");
  const { AFSCommandExecutor } = await import("./core/executor/index.js");
  const { createCLIAuthContext } = await import("./credential/cli-auth-context.js");
  const { createCredentialStore } = await import("./credential/store.js");

  // Load AFS with progress spinner
  const spinner = createSpinner();
  spinner.start("Mounting providers...");

  let failures: MountFailure[] = [];
  const {
    afs,
    failures: mountFailures,
    blockletMounts,
  } = await loadAFS(cwd, {
    authContext: createCLIAuthContext(),
    credentialStore: createCredentialStore(),
    onProgress({ total, completed, failed }) {
      spinner.update(
        `Mounting providers... (${completed}/${total}${failed > 0 ? `, ${failed} failed` : ""})`,
      );
    },
  });
  failures = mountFailures;

  // Mount extra providers (mock-based or pre-created)
  if (extraProviders) {
    for (const { provider, mountPath } of extraProviders) {
      try {
        await afs.mount(provider, mountPath);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        failures.push({ path: mountPath, reason: msg });
      }
    }
  }

  spinner.stop();

  // Print failure warnings if any
  if (failures.length > 0) {
    const noun = failures.length === 1 ? "mount" : "mounts";
    console.warn(`⚠ ${failures.length} ${noun} failed:`);
    for (const f of failures) {
      console.warn(`  - ${f.path}: ${f.reason}`);
    }
  }

  // Activate blocklets with event triggers (best-effort)
  let blockletManager: import("./program/blocklet-manager.js").BlockletManager | undefined;
  try {
    const { BlockletManager } = await import("./program/blocklet-manager.js");
    const { scanBlockletTriggers } = await import("./program/blocklet-trigger-scanner.js");
    const { join: joinRP } = await import("node:path");
    const { homedir: getHD } = await import("node:os");
    const { existsSync: exRP, readFileSync: rdRP, mkdirSync: mkRP } = await import("node:fs");
    const { instanceIdFromMountPath: instIdRP } = await import("@aigne/afs");
    const userConfigDir = joinRP(getHD(), ".afs-config");
    const replDataRoot = joinRP(userConfigDir, "data");
    const resolveDataDir = (mountPath: string) => joinRP(replDataRoot, instIdRP(mountPath));
    let ashCompile: import("./program/blocklet-trigger-scanner.js").CompileFn | null = null;
    try {
      const ashModule = "@aigne/ash";
      const mod = await import(/* webpackIgnore: true */ ashModule);
      ashCompile = mod.compileSource;
    } catch {
      // @aigne/ash not available — use regex fallback
    }
    blockletManager = new BlockletManager({
      globalAFS: afs,
      createProvider: afs.createProviderFromMount,
      listBlockletMounts: async () => blockletMounts,
      compile: ashCompile ?? undefined,
      scanTriggers: async (blockletDir: string) => {
        return scanBlockletTriggers(blockletDir, ashCompile);
      },
      dataDir: (mountPath: string) => resolveDataDir(mountPath),
      createDataProvider: afs.options.createDataProvider,
      readMountOverrides: async (instanceId) => {
        const mountsPath = joinRP(replDataRoot, instanceId, "mounts.toml");
        if (!exRP(mountsPath)) return [];
        try {
          const { parse } = await import("smol-toml");
          const parsed = parse(rdRP(mountsPath, "utf-8")) as {
            mounts?: Array<{ path?: string; uri?: string; options?: Record<string, unknown> }>;
          };
          return (parsed.mounts ?? [])
            .filter(
              (m): m is { path: string; uri: string; options?: Record<string, unknown> } =>
                !!m.path && !!m.uri,
            )
            .map((m) => ({ target: m.path, uri: m.uri, options: m.options }));
        } catch {
          return [];
        }
      },
      writeMountOverrides: async (instanceId, overrides) => {
        const mountsDir = joinRP(replDataRoot, instanceId);
        if (!exRP(mountsDir)) mkRP(mountsDir, { recursive: true });
        const { writeFileSync: wrRP } = await import("node:fs");
        const lines = overrides.map((o) => {
          let s = `[[mounts]]\npath = "${o.target}"\nuri = "${o.uri}"\n`;
          if (o.options)
            s += `\n[mounts.options]\n${Object.entries(o.options)
              .map(([k, v]) => `${k} = ${JSON.stringify(v)}`)
              .join("\n")}\n`;
          return s;
        });
        wrRP(joinRP(mountsDir, "mounts.toml"), lines.join("\n"), "utf-8");
      },
    });

    await blockletManager.activateAll();
    const activated = blockletManager.getActivatedBlocklets();
    if (activated.length > 0) {
      console.log(`Activated ${activated.length} blocklet(s): ${activated.join(", ")}`);
    }
  } catch (err) {
    console.error(`[PM] Blocklet activation error:`, err instanceof Error ? err.message : err);
  }

  // Create executor
  const executor = new AFSCommandExecutor(afs, {
    cwd,
    tty: true,
    version,
  });

  const ctx = createReplContext({ executor, afs, version });

  // Print banner
  console.log(getBanner(ctx));

  let closed = false;
  let rl: Interface;
  let originalDataHandler: ((...args: unknown[]) => void) | null = null;
  let activeWebExplorer: { port: number; url: string; stop: () => void } | null = null;

  function startReplLoop() {
    const stdin = process.stdin as NodeJS.ReadStream & {
      _readableState?: { flowing: unknown; reading: boolean };
    };

    if (stdin._readableState) {
      stdin._readableState.flowing = null;
      stdin._readableState.reading = false;
    }

    rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: getPrompt(ctx),
      historySize: 100,
      completer: createCompleter(ctx),
    });

    // Save the original data handler from first successful createInterface
    if (!originalDataHandler && stdin.listenerCount("data") > 0) {
      const listeners = stdin.listeners("data") as ((...args: unknown[]) => void)[];
      originalDataHandler = listeners[0] ?? null;
    }

    // If createInterface failed to attach data listener, reattach the saved one
    if (stdin.listenerCount("data") === 0 && originalDataHandler) {
      stdin.on("data", originalDataHandler);
      stdin.resume();
    }

    rl.on("line", async (line: string) => {
      const trimmed = line.trim();

      if (!trimmed) {
        if (!closed) rl.prompt();
        return;
      }

      // Check explore command (needs special handling for blessed TUI)
      if (isExploreCommand(trimmed)) {
        await handleExplore(trimmed, ctx);
        return;
      }

      // Check builtin commands
      const builtinResult = await handleBuiltinCommand(trimmed, ctx);
      if (builtinResult) {
        if (builtinResult.output) {
          console.log(builtinResult.output);
        }
        if (builtinResult.exit) {
          closed = true;
          rl.close();
          return;
        }
        if (!closed) {
          rl.setPrompt(getPrompt(ctx));
          rl.prompt();
        }
        return;
      }

      // Resolve relative paths in argv
      const resolved = resolveArgvPath(trimmed, ctx);

      // Execute via AFSCommandExecutor
      try {
        const result = await executor.execute(resolved);
        if (result.formatted) {
          console.log(result.formatted);
        }
        if (!result.success && result.error) {
          if (!result.formatted.includes(result.error.message)) {
            console.error(result.error.message);
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`Error: ${msg}`);
      }

      // Clear completion cache after each command
      ctx.completionCache.clear();

      if (!closed) rl.prompt();
    });

    rl.on("close", () => {
      if (!closed) {
        closed = true;
        if (activeWebExplorer) {
          activeWebExplorer.stop();
          activeWebExplorer = null;
        }
        console.log("\nBye!");
      }
    });

    rl.prompt();
  }

  async function handleExplore(trimmed: string, ctx: ReplContext) {
    const args = parseExploreArgs(trimmed, ctx);

    if (args.web) {
      await handleExploreWeb(args, ctx);
      return;
    }

    // TUI mode — takes over terminal, returns to REPL after exit
    rl.removeAllListeners("line");
    rl.removeAllListeners("close");
    rl.close();

    cleanupStdinAfterBlessed();

    try {
      const { createExplorerScreen } = await import("./explorer/screen.js");
      await createExplorerScreen({
        afs: ctx.afs,
        startPath: args.path,
        version: ctx.version,
        onExit: () => {},
      });
    } catch {
      // ignore errors from explore
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    cleanupStdinAfterBlessed();

    process.stdout.write("\x1b[?1049l"); // Exit alternate screen
    process.stdout.write("\x1b[?25h"); // Show cursor

    console.log("");

    if (!closed) {
      startReplLoop();
    }
  }

  async function handleExploreWeb(args: ExploreArgs, ctx: ReplContext) {
    // Stop previous web explorer if running
    if (activeWebExplorer) {
      activeWebExplorer.stop();
      console.log("Stopped previous web explorer.");
      activeWebExplorer = null;
    }

    try {
      const { resolve } = await import("node:path");
      const { startExplorer } = await import("@aigne/afs-explorer");

      // Locate web assets
      let webRoot: string | undefined;
      try {
        const { createRequire } = await import("node:module");
        const req = createRequire(import.meta.url);
        const explorerPkg = req.resolve("@aigne/afs-explorer/package.json");
        webRoot = resolve(explorerPkg, "..", "web");
      } catch {
        // Fallback — embedded assets may be used
      }

      const info = await startExplorer(ctx.afs, {
        port: args.port,
        host: "localhost",
        webRoot,
        open: true,
      });

      activeWebExplorer = info;
      console.log(`Web explorer running at ${info.url}`);
      console.log('Type "explore --web" again to restart, or continue using REPL.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Failed to start web explorer: ${msg}`);
    }

    if (!closed) rl.prompt();
  }

  startReplLoop();

  // Return promise that resolves when REPL exits
  return new Promise((resolve) => {
    const checkClosed = setInterval(() => {
      if (closed) {
        clearInterval(checkClosed);
        const cleanup = async () => {
          if (blockletManager) {
            await blockletManager.deactivateAll().catch(() => {});
          }
          if (onExit) {
            await onExit().catch(() => {});
          }
        };
        cleanup().then(resolve);
      }
    }, 100);
  });
}
