/**
 * CredentialStore — TOML-based credential storage.
 *
 * Stores sensitive credentials in ~/.afs-config/credentials.toml.
 * Keys are composite: "configDir#mountPath" for per-project scoping.
 * File permissions are set to 600 on creation.
 * Writes use atomic rename to prevent corruption.
 */

import { chmod, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parse, stringify } from "smol-toml";

/** Credential values — all string key-value pairs */
export type Credentials = Record<string, string>;

export interface CredentialStore {
  /** Get credentials by key. Returns undefined if not found or file doesn't exist. */
  get(key: string): Promise<Credentials | undefined>;

  /** Set credentials by key. Creates file with 600 permissions if needed. */
  set(key: string, credentials: Credentials): Promise<void>;

  /** Delete credentials by key. Returns true if deleted, false if not found. */
  delete(key: string): Promise<boolean>;
}

export interface CredentialStoreOptions {
  /** Path to credentials.toml. Defaults to ~/.afs-config/credentials.toml */
  path?: string;
}

const DEFAULT_DIR = ".afs-config";
const DEFAULT_FILE = "credentials.toml";
const FILE_MODE = 0o600;

/**
 * Create a CredentialStore backed by a TOML file.
 */
export function createCredentialStore(options?: CredentialStoreOptions): CredentialStore {
  const filePath = options?.path ?? join(homedir(), DEFAULT_DIR, DEFAULT_FILE);

  return {
    async get(key: string): Promise<Credentials | undefined> {
      validateKey(key);
      const data = await readTOML(filePath);
      if (!data) return undefined;
      const section = data[key];
      if (section === undefined || section === null) return undefined;
      if (typeof section !== "object" || Array.isArray(section)) {
        throw new Error(`Invalid credentials format for URI: values must be key-value pairs`);
      }
      return validateCredentialValues(section as Record<string, unknown>);
    },

    async set(key: string, credentials: Credentials): Promise<void> {
      validateKey(key);
      validateCredentialValues(credentials);
      const data = (await readTOML(filePath)) ?? {};
      data[key] = credentials;
      await writeTOMLAtomic(filePath, data);
    },

    async delete(key: string): Promise<boolean> {
      validateKey(key);
      const data = await readTOML(filePath);
      if (!data || !(key in data)) return false;
      delete data[key];
      await writeTOMLAtomic(filePath, data);
      return true;
    },
  };
}

function validateKey(key: string): void {
  if (!key || key.trim() === "") {
    throw new Error("Credential key must not be empty");
  }
}

function validateCredentialValues(values: Record<string, unknown>): Credentials {
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== "string") {
      throw new Error(`Credential value for key "${key}" must be a string, got ${typeof value}`);
    }
  }
  return values as Credentials;
}

/**
 * Read and parse the TOML credential file.
 * Returns null if file does not exist. Throws on parse errors.
 */
async function readTOML(filePath: string): Promise<Record<string, any> | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    return parse(content) as Record<string, any>;
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    if (err?.code === "EACCES") {
      throw new Error(`Permission denied reading credentials file: ${filePath}`);
    }
    // smol-toml parse errors
    if (err instanceof Error && !("code" in err)) {
      throw new Error(`Corrupted credentials file: ${err.message}`);
    }
    throw err;
  }
}

/**
 * Write TOML data atomically using write-to-temp + rename.
 * Creates parent directory if needed. Sets file permissions to 600 on first creation.
 */
async function writeTOMLAtomic(filePath: string, data: Record<string, any>): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });

  const isNew = !(await fileExists(filePath));
  const content = stringify(data);
  const tmpPath = `${filePath}.tmp.${process.pid}`;

  try {
    await writeFile(tmpPath, content, { encoding: "utf-8", mode: FILE_MODE });
    await rename(tmpPath, filePath);
  } catch (err: any) {
    // Clean up temp file on failure
    try {
      await unlink(tmpPath);
    } catch {
      // ignore cleanup errors
    }
    if (err?.code === "EACCES") {
      throw new Error(`Permission denied writing credentials file: ${filePath}`);
    }
    throw err;
  }

  // Set permissions on first creation only
  if (isNew) {
    await chmod(filePath, FILE_MODE);
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
