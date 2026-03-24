/**
 * Node.js / Bun platform adapter.
 *
 * Full capabilities — this is the default adapter when running on Node or Bun.
 * All platform operations map directly to node: built-in modules.
 */

import type {
  PlatformAdapter,
  PlatformCapability,
  PlatformCrypto,
  PlatformFS,
  PlatformModule,
  PlatformPath,
  PlatformProcess,
} from "./types.js";
import { AFSFileNotFoundError, AFSIOError, AFSPermissionError } from "./types.js";

function isNodeError(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && "code" in e;
}

function normalizeError(path: string, e: unknown): never {
  if (isNodeError(e)) {
    if (e.code === "ENOENT") throw new AFSFileNotFoundError(path, e);
    if (e.code === "EACCES" || e.code === "EPERM") throw new AFSPermissionError(path, e);
  }
  throw new AFSIOError(path, e);
}

// Lazy-loaded node modules (avoids top-level import for tree-shaking)
let _fs: typeof import("node:fs/promises") | undefined;
let _path: typeof import("node:path") | undefined;
let _crypto: typeof import("node:crypto") | undefined;

async function getFs() {
  if (!_fs) _fs = await import("node:fs/promises");
  return _fs;
}
function getPathSync() {
  if (!_path) _path = require("node:path") as typeof import("node:path");
  return _path;
}
function getCryptoSync() {
  if (!_crypto) _crypto = require("node:crypto") as typeof import("node:crypto");
  return _crypto;
}

const nodePlatformFS: PlatformFS = {
  async readFile(path: string): Promise<Uint8Array> {
    try {
      const fs = await getFs();
      const buf = await fs.readFile(path);
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch (e) {
      normalizeError(path, e);
    }
  },
  async readTextFile(path: string): Promise<string> {
    try {
      const fs = await getFs();
      return await fs.readFile(path, "utf-8");
    } catch (e) {
      normalizeError(path, e);
    }
  },
  async writeFile(path: string, data: Uint8Array | string): Promise<void> {
    try {
      const fs = await getFs();
      await fs.writeFile(path, data);
    } catch (e) {
      normalizeError(path, e);
    }
  },
  async appendFile(path: string, data: string): Promise<void> {
    try {
      const fs = await getFs();
      await fs.appendFile(path, data);
    } catch (e) {
      normalizeError(path, e);
    }
  },
  async readdir(path: string): Promise<string[]> {
    try {
      const fs = await getFs();
      return await fs.readdir(path);
    } catch (e) {
      normalizeError(path, e);
    }
  },
  async stat(path: string) {
    try {
      const fs = await getFs();
      const s = await fs.stat(path);
      return {
        isFile: s.isFile(),
        isDirectory: s.isDirectory(),
        size: s.size,
        mtime: s.mtimeMs,
        birthtime: s.birthtimeMs,
      };
    } catch (e) {
      normalizeError(path, e);
    }
  },
  async exists(path: string): Promise<boolean> {
    try {
      const fs = await getFs();
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  },
  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    try {
      const fs = await getFs();
      await fs.mkdir(path, options);
    } catch (e) {
      normalizeError(path, e);
    }
  },
  async rm(path: string, options?: { recursive?: boolean }): Promise<void> {
    try {
      const fs = await getFs();
      await fs.rm(path, options);
    } catch (e) {
      normalizeError(path, e);
    }
  },
  async copyFile(src: string, dest: string): Promise<void> {
    try {
      const fs = await getFs();
      await fs.copyFile(src, dest);
    } catch (e) {
      normalizeError(src, e);
    }
  },
  async createTempDir(prefix: string): Promise<string> {
    const fs = await getFs();
    const os = await import("node:os");
    const p = getPathSync();
    return await fs.mkdtemp(p.join(os.tmpdir(), prefix));
  },
  async cleanupTempDir(path: string): Promise<void> {
    try {
      const fs = await getFs();
      await fs.rm(path, { recursive: true });
    } catch {
      // cleanup is best-effort
    }
  },
};

const nodePlatformPath: PlatformPath = {
  join: (...segments) => getPathSync().join(...segments),
  dirname: (p) => getPathSync().dirname(p),
  basename: (p) => getPathSync().basename(p),
  extname: (p) => getPathSync().extname(p),
  isAbsolute: (p) => getPathSync().isAbsolute(p),
  resolve: (...segments) => getPathSync().resolve(...segments),
};

const nodePlatformCrypto: PlatformCrypto = {
  randomBytes(n: number): Uint8Array {
    const c = getCryptoSync();
    const buf = c.randomBytes(n);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  },
  randomUUID(): string {
    return getCryptoSync().randomUUID();
  },
  async hash(algo: string, data: Uint8Array): Promise<Uint8Array> {
    const c = getCryptoSync();
    const hash = c.createHash(algo).update(data).digest();
    return new Uint8Array(hash.buffer, hash.byteOffset, hash.byteLength);
  },
  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
    return getCryptoSync().timingSafeEqual(a, b);
  },
};

const nodePlatformProcess: PlatformProcess = {
  async spawn(cmd: string, args: string[], options?: { timeout?: number }) {
    const { execFile } = await import("node:child_process");
    return new Promise((resolve, reject) => {
      execFile(cmd, args, { timeout: options?.timeout }, (error, stdout, stderr) => {
        if (error && !("code" in error)) {
          reject(error);
          return;
        }
        resolve({
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          exitCode: (error as NodeJS.ErrnoException & { code?: number })?.code ?? 0,
        });
      });
    });
  },
  cwd() {
    return process.cwd();
  },
};

const nodePlatformModule: PlatformModule = {
  async dynamicImport(specifier: string): Promise<unknown> {
    return import(specifier);
  },
};

const ALL_CAPABILITIES: PlatformCapability[] = [
  "fs.read",
  "fs.write",
  "fs.list",
  "fs.stat",
  "fs.temp",
  "process.spawn",
  "process.env",
  "crypto.random",
  "crypto.hash",
  "crypto.encrypt",
  "net.fetch",
  "net.http-serve",
  "net.ws-serve",
  "module.dynamic-import",
  "module.require",
];

/**
 * Create a Node.js/Bun platform adapter with full capabilities.
 */
export function createNodeAdapter(): PlatformAdapter {
  return {
    name: "node",
    capabilities: new Set(ALL_CAPABILITIES),
    fs: nodePlatformFS,
    path: nodePlatformPath,
    crypto: nodePlatformCrypto,
    process: nodePlatformProcess,
    module: nodePlatformModule,
    env: {
      get(key: string) {
        return process.env[key];
      },
    },
  };
}
