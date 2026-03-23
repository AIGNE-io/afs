import { describe, expect, test } from "bun:test";
import { seedBlockletData } from "../../src/blocklet/data-seed.js";
import type { AFSRoot } from "../../src/type.js";

/**
 * Minimal AFSRoot mock for testing seedBlockletData.
 * Simulates /program/seed/ (read-only source) and /data/ (writable target).
 */
function createMockAFS(
  seedFiles: Record<string, string> = {},
  dataFiles: Record<string, string> = {},
): { afs: AFSRoot; dataStore: Map<string, string> } {
  const dataStore = new Map<string, string>(Object.entries(dataFiles));

  /** Derive directory entries from a flat file map for a given prefix. */
  function listDir(fileMap: Record<string, string> | Map<string, string>, prefix: string) {
    const entries = new Map<string, "file" | "directory">();
    const keys = fileMap instanceof Map ? [...fileMap.keys()] : Object.keys(fileMap);
    for (const key of keys) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      const firstSegment = rest.split("/")[0]!;
      if (!firstSegment || entries.has(firstSegment)) continue;
      entries.set(firstSegment, rest.includes("/") ? "directory" : "file");
    }
    return [...entries.entries()].map(([name, type]) => ({
      id: `${prefix}${name}`,
      path: `${prefix}${name}`,
      type,
      meta: type === "directory" ? { childrenCount: 1 } : {},
    }));
  }

  const afs = {
    async list(path: string) {
      const normalized = path.endsWith("/") ? path : `${path}/`;
      if (normalized.startsWith("/program/seed/")) {
        return { data: listDir(seedFiles, normalized.replace("/program/seed/", "/")) };
      }
      if (normalized === "/program/seed/") {
        return { data: listDir(seedFiles, "/") };
      }
      if (normalized.startsWith("/data/")) {
        return { data: listDir(dataStore, normalized.replace("/data/", "/")) };
      }
      if (normalized === "/data/") {
        return { data: listDir(dataStore, "/") };
      }
      throw new Error(`Not found: ${path}`);
    },
    async read(path: string) {
      const seedMatch = path.replace(/^\/program\/seed/, "");
      if (seedMatch !== path && seedFiles[seedMatch] !== undefined) {
        return { data: { content: seedFiles[seedMatch] } };
      }
      const dataMatch = path.replace(/^\/data/, "");
      if (dataMatch !== path && dataStore.has(dataMatch)) {
        return { data: { content: dataStore.get(dataMatch) } };
      }
      throw new Error(`Not found: ${path}`);
    },
    async write(path: string, payload: unknown) {
      const dataMatch = path.replace(/^\/data/, "");
      if (dataMatch !== path) {
        const content = typeof payload === "string" ? payload : ((payload as any)?.content ?? "");
        dataStore.set(dataMatch, content);
        return { data: { success: true } };
      }
      throw new Error(`Cannot write to: ${path}`);
    },
    async stat(path: string) {
      const dataMatch = path.replace(/^\/data/, "");
      if (dataMatch !== path && dataStore.has(dataMatch)) {
        return { data: { id: path, path } };
      }
      throw new Error(`Not found: ${path}`);
    },
  } as unknown as AFSRoot;

  return { afs, dataStore };
}

describe("seedBlockletData", () => {
  test("seeds files from /program/seed/ to /data/", async () => {
    const { afs, dataStore } = createMockAFS({
      "/persona.md": "# My Persona",
    });

    const seeded = await seedBlockletData(afs);
    expect(seeded).toBe(1);
    expect(dataStore.get("/persona.md")).toBe("# My Persona");
  });

  test("seeds multiple files including subdirectories", async () => {
    const { afs, dataStore } = createMockAFS({
      "/persona.md": "# Persona",
      "/prompts/chat.md": "You are a helpful assistant",
    });

    const seeded = await seedBlockletData(afs);
    expect(seeded).toBe(2);
    expect(dataStore.get("/persona.md")).toBe("# Persona");
    expect(dataStore.get("/prompts/chat.md")).toBe("You are a helpful assistant");
  });

  test("does NOT overwrite existing files in /data", async () => {
    const { afs, dataStore } = createMockAFS(
      { "/persona.md": "seed version" },
      { "/persona.md": "user-modified version" },
    );

    const seeded = await seedBlockletData(afs);
    expect(seeded).toBe(0);
    expect(dataStore.get("/persona.md")).toBe("user-modified version");
  });

  test("seeds only missing files when some already exist", async () => {
    const { afs, dataStore } = createMockAFS(
      {
        "/persona.md": "seed persona",
        "/prompts/chat.md": "seed chat",
      },
      { "/persona.md": "user persona" },
    );

    const seeded = await seedBlockletData(afs);
    expect(seeded).toBe(1);
    expect(dataStore.get("/persona.md")).toBe("user persona");
    expect(dataStore.get("/prompts/chat.md")).toBe("seed chat");
  });

  test("returns 0 when no seed/ directory exists", async () => {
    const noSeedAfs = {
      async list(path: string) {
        if (path === "/data" || path === "/data/") return { data: [] };
        throw new Error(`Not found: ${path}`);
      },
      async read() {
        throw new Error("Not found");
      },
      async write() {
        return { data: { success: true } };
      },
      async stat() {
        throw new Error("Not found");
      },
    } as unknown as AFSRoot;

    const seeded = await seedBlockletData(noSeedAfs);
    expect(seeded).toBe(0);
  });

  test("returns 0 when no /data mount exists", async () => {
    const noDataAfs = {
      async list() {
        throw new Error("Not found");
      },
      async read() {
        throw new Error("Not found");
      },
      async write() {
        throw new Error("Cannot write");
      },
      async stat() {
        throw new Error("Not found");
      },
    } as unknown as AFSRoot;

    const seeded = await seedBlockletData(noDataAfs);
    expect(seeded).toBe(0);
  });

  test("returns 0 when AFS lacks required operations", async () => {
    const seeded = await seedBlockletData({} as AFSRoot);
    expect(seeded).toBe(0);
  });
});
