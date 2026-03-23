/**
 * In-memory platform adapter — pure-JS implementation with zero node: dependencies.
 *
 * Used for non-Node runtimes (Workers, Browser, QuickJS) and testing.
 * All filesystem operations are backed by in-memory Maps.
 * Path operations are pure string manipulation.
 * Crypto uses Web Crypto API (globalThis.crypto).
 */

import type {
  PlatformAdapter,
  PlatformCapability,
  PlatformCrypto,
  PlatformFS,
  PlatformPath,
} from "./types.js";
import { AFSFileNotFoundError } from "./types.js";

// ─── In-memory filesystem ─────────────────────────────────────────────────

export class MemoryFS implements PlatformFS {
  private files = new Map<string, Uint8Array>();
  private dirs = new Set<string>(["/"]); // root always exists

  async readFile(path: string): Promise<Uint8Array> {
    const data = this.files.get(path);
    if (!data) throw new AFSFileNotFoundError(path);
    return data;
  }

  async readTextFile(path: string): Promise<string> {
    const data = await this.readFile(path);
    return new TextDecoder().decode(data);
  }

  async writeFile(path: string, data: Uint8Array | string): Promise<void> {
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    this.files.set(path, bytes);
    // Ensure parent directories exist
    const dir = this.dirname(path);
    if (dir && dir !== path) {
      this.dirs.add(dir);
    }
  }

  async appendFile(path: string, data: string): Promise<void> {
    const existing = this.files.get(path);
    const append = new TextEncoder().encode(data);
    if (existing) {
      const merged = new Uint8Array(existing.length + append.length);
      merged.set(existing);
      merged.set(append, existing.length);
      this.files.set(path, merged);
    } else {
      this.files.set(path, append);
    }
  }

  async readdir(path: string): Promise<string[]> {
    const prefix = path.endsWith("/") ? path : `${path}/`;
    const entries = new Set<string>();
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length);
        const firstSeg = rest.split("/")[0];
        if (firstSeg) entries.add(firstSeg);
      }
    }
    for (const dir of this.dirs) {
      if (dir.startsWith(prefix) && dir !== path) {
        const rest = dir.slice(prefix.length);
        const firstSeg = rest.split("/")[0];
        if (firstSeg) entries.add(firstSeg);
      }
    }
    return [...entries];
  }

  async stat(path: string): Promise<{
    isFile: boolean;
    isDirectory: boolean;
    size: number;
    mtime: number;
  }> {
    if (this.files.has(path)) {
      return {
        isFile: true,
        isDirectory: false,
        size: this.files.get(path)!.length,
        mtime: Date.now(),
      };
    }
    if (this.dirs.has(path)) {
      return { isFile: false, isDirectory: true, size: 0, mtime: Date.now() };
    }
    throw new AFSFileNotFoundError(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path);
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    this.dirs.add(path);
    if (options?.recursive) {
      const segments = path.split("/").filter(Boolean);
      let current = "";
      for (const seg of segments) {
        current += `/${seg}`;
        this.dirs.add(current);
      }
    }
  }

  async rm(path: string, options?: { recursive?: boolean }): Promise<void> {
    if (this.files.has(path)) {
      this.files.delete(path);
      return;
    }
    if (options?.recursive) {
      const prefix = path.endsWith("/") ? path : `${path}/`;
      for (const key of [...this.files.keys()]) {
        if (key.startsWith(prefix)) this.files.delete(key);
      }
      for (const dir of [...this.dirs]) {
        if (dir === path || dir.startsWith(prefix)) this.dirs.delete(dir);
      }
    }
  }

  async copyFile(src: string, dest: string): Promise<void> {
    const data = this.files.get(src);
    if (!data) throw new AFSFileNotFoundError(src);
    this.files.set(dest, new Uint8Array(data));
  }

  private dirname(p: string): string {
    const i = p.lastIndexOf("/");
    return i <= 0 ? "/" : p.slice(0, i);
  }
}

// ─── Pure-JS path (no node:path) ──────────────────────────────────────────

export const memoryPath: PlatformPath = {
  join(...segments: string[]): string {
    const parts = segments
      .join("/")
      .split("/")
      .filter((s) => s && s !== ".");
    const resolved: string[] = [];
    for (const part of parts) {
      if (part === "..") resolved.pop();
      else resolved.push(part);
    }
    return `/${resolved.join("/")}`;
  },
  dirname(path: string): string {
    const i = path.lastIndexOf("/");
    return i <= 0 ? "/" : path.slice(0, i);
  },
  basename(path: string): string {
    const i = path.lastIndexOf("/");
    return i < 0 ? path : path.slice(i + 1);
  },
  extname(path: string): string {
    const base = memoryPath.basename(path);
    const i = base.lastIndexOf(".");
    return i <= 0 ? "" : base.slice(i);
  },
  isAbsolute(path: string): boolean {
    return path.startsWith("/");
  },
  resolve(...segments: string[]): string {
    return memoryPath.join(...segments);
  },
};

// ─── Minimal crypto (Web Crypto API) ─────────────────────────────────────

export const memoryCrypto: PlatformCrypto = {
  randomBytes(n: number): Uint8Array {
    const bytes = new Uint8Array(n);
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  },
  randomUUID(): string {
    return globalThis.crypto.randomUUID();
  },
  async hash(algo: string, data: Uint8Array): Promise<Uint8Array> {
    const algoMap: Record<string, string> = {
      sha256: "SHA-256",
      sha384: "SHA-384",
      sha512: "SHA-512",
    };
    const webAlgo = algoMap[algo] || algo;
    const digest = await globalThis.crypto.subtle.digest(webAlgo, new Uint8Array(data));
    return new Uint8Array(digest);
  },
};

// ─── Factory ─────────────────────────────────────────────────────────────

export function createMemoryAdapter(options?: { env?: Record<string, string> }): PlatformAdapter {
  const capabilities: PlatformCapability[] = [
    "fs.read",
    "fs.write",
    "fs.list",
    "fs.stat",
    "crypto.random",
    "crypto.hash",
  ];

  const envMap = options?.env ?? {};

  return {
    name: "memory",
    capabilities: new Set(capabilities),
    fs: new MemoryFS(),
    path: memoryPath,
    crypto: memoryCrypto,
    env: {
      get(key: string): string | undefined {
        return envMap[key];
      },
    },
  };
}
