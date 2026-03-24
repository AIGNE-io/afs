/**
 * Platform abstraction types for runtime portability.
 *
 * AFS core code should NEVER directly import node:fs, node:path, node:crypto etc.
 * Instead, it should use the PlatformAdapter interface to access platform-specific
 * functionality. This enables AFS to run on Node/Bun, Workers, Browser, and QuickJS.
 */

// ─── Capability system ─────────────────────────────────────────────────────

/**
 * Fine-grained platform capabilities.
 *
 * Matching is capability-based, not platform-name-based:
 * - "Workers+R2" has fs.read, "Workers bare" does not
 * - "Browser+OPFS" has fs.read, "Browser bare" does not
 */
export type PlatformCapability =
  // Filesystem
  | "fs.read"
  | "fs.write"
  | "fs.list"
  | "fs.stat"
  | "fs.temp"
  | "fs.stream"
  // Process
  | "process.spawn"
  | "process.env"
  // Crypto
  | "crypto.random"
  | "crypto.hash"
  | "crypto.encrypt"
  // Network
  | "net.fetch"
  | "net.http-serve"
  | "net.ws-serve"
  // Module
  | "module.dynamic-import"
  | "module.require";

// ─── Error types ────────────────────────────────────────────────────────────

/**
 * Base error for all platform-level errors.
 * Adapters normalize platform-specific errors into these types.
 */
export class AFSPlatformError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AFSPlatformError";
  }
}

export class AFSFileNotFoundError extends AFSPlatformError {
  constructor(
    public readonly path: string,
    cause?: unknown,
  ) {
    super(`File not found: ${path}`, cause);
    this.name = "AFSFileNotFoundError";
  }
}

export class AFSPermissionError extends AFSPlatformError {
  constructor(
    public readonly path: string,
    cause?: unknown,
  ) {
    super(`Permission denied: ${path}`, cause);
    this.name = "AFSPermissionError";
  }
}

export class AFSIOError extends AFSPlatformError {
  constructor(
    public readonly path: string,
    cause?: unknown,
  ) {
    super(`I/O error: ${path}`, cause);
    this.name = "AFSIOError";
  }
}

// ─── Platform sub-interfaces ────────────────────────────────────────────────

export interface PlatformFS {
  readFile(path: string): Promise<Uint8Array>;
  readTextFile(path: string): Promise<string>;
  writeFile(path: string, data: Uint8Array | string): Promise<void>;
  appendFile(path: string, data: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<{
    isFile: boolean;
    isDirectory: boolean;
    size: number;
    mtime: number;
    birthtime?: number;
  }>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  rm(path: string, options?: { recursive?: boolean }): Promise<void>;
  copyFile(src: string, dest: string): Promise<void>;
  // Optional: stream I/O (fs.stream capability)
  readStream?(path: string): ReadableStream<Uint8Array>;
  writeStream?(path: string): WritableStream<Uint8Array>;
  // Optional: temp directory (fs.temp capability)
  createTempDir?(prefix: string): Promise<string>;
  cleanupTempDir?(path: string): Promise<void>;
}

export interface PlatformPath {
  join(...segments: string[]): string;
  dirname(path: string): string;
  basename(path: string): string;
  extname(path: string): string;
  isAbsolute(path: string): boolean;
  resolve(...segments: string[]): string;
}

export interface PlatformCrypto {
  randomBytes(n: number): Uint8Array;
  randomUUID(): string;
  hash?(algo: string, data: Uint8Array): Promise<Uint8Array>;
  timingSafeEqual?(a: Uint8Array, b: Uint8Array): boolean;
}

export interface PlatformProcess {
  spawn?(
    cmd: string,
    args: string[],
    options?: { timeout?: number },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  cwd?(): string;
}

export interface PlatformModule {
  dynamicImport?(specifier: string): Promise<unknown>;
}

// ─── Main adapter interface ─────────────────────────────────────────────────

/**
 * Platform adapter — the single abstraction point between AFS and the runtime.
 *
 * Each runtime provides one adapter:
 * - Node/Bun: NodeAdapter (full capabilities, auto-detected)
 * - Workers: WorkersAdapter (R2/KV bindings → fs capabilities)
 * - Browser: BrowserAdapter (OPFS → fs capabilities)
 * - QuickJS: QuickJSAdapter (std/os → fs capabilities)
 *
 * Capabilities are dynamic — a Workers adapter without R2 binding
 * won't declare fs.read, and providers requiring fs.read will be
 * rejected at registration time.
 */
export interface PlatformAdapter {
  /** For logging/debugging only — never use for matching. */
  readonly name: string;

  /** Declared capabilities. Providers check these at registration. */
  readonly capabilities: ReadonlySet<PlatformCapability>;

  // Optional sub-interfaces — present when corresponding capabilities are declared
  fs?: PlatformFS;
  path: PlatformPath;
  process?: PlatformProcess;
  crypto?: PlatformCrypto;
  module?: PlatformModule;

  /** Environment variable access (all adapters must provide). */
  env: {
    get(key: string): string | undefined;
  };
}
