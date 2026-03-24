import { describe, expect, test } from "bun:test";
import { seedRoutes } from "../../src/blocklet/route-seed.js";
import type { AFSRoot } from "../../src/type.js";

/**
 * Minimal AFSRoot mock for testing seedRoutes.
 * seedRoutes only uses list, read, write — no stat needed.
 * Cast to AFSRoot to avoid full AFSEntry type compliance in test mocks.
 */
function createMockAFS(
  programRoutes: Record<string, string> = {},
  dataRoutes: Record<string, string> = {},
): { afs: AFSRoot; dataStore: Map<string, string> } {
  const dataStore = new Map<string, string>(Object.entries(dataRoutes));

  const afs = {
    async list(path: string) {
      const normalized = path.replace(/\/+$/, "");
      if (normalized === "/blocklet/.route") {
        return {
          data: Object.keys(programRoutes).map((name) => ({
            path: `/blocklet/.route/${name}`,
            type: "file" as const,
            meta: {},
          })),
        };
      }
      if (normalized === "/data/.route") {
        return {
          data: [...dataStore.keys()].map((name) => ({
            path: `/data/.route/${name}`,
            type: "file" as const,
            meta: {},
          })),
        };
      }
      throw new Error(`Not found: ${path}`);
    },
    async read(path: string) {
      const programMatch = path.match(/^\/blocklet\/\.route\/(.+)$/);
      if (programMatch) {
        const content = programRoutes[programMatch[1]!];
        if (content) return { data: { content } };
        throw new Error(`Not found: ${path}`);
      }
      const dataMatch = path.match(/^\/data\/\.route\/(.+)$/);
      if (dataMatch) {
        const content = dataStore.get(dataMatch[1]!);
        if (content) return { data: { content } };
        throw new Error(`Not found: ${path}`);
      }
      throw new Error(`Not found: ${path}`);
    },
    async write(path: string, payload: unknown) {
      const dataMatch = path.match(/^\/data\/\.route\/(.+)$/);
      if (dataMatch) {
        const content = typeof payload === "string" ? payload : ((payload as any)?.content ?? "");
        dataStore.set(dataMatch[1]!, content);
        return { data: { success: true } };
      }
      throw new Error(`Cannot write to: ${path}`);
    },
  } as unknown as AFSRoot;

  return { afs, dataStore };
}

describe("seedRoutes (T2-1)", () => {
  test("seeds routes from /blocklet/.route/ when /data/.route/ is empty", async () => {
    const { afs, dataStore } = createMockAFS({
      blog: "site: showcase\npath: /blog\nsource: ./content/blog\nhandler: web",
      app: "site: showcase\npath: /app\nsource: .\nhandler: aup",
    });

    const seeded = await seedRoutes(afs);
    expect(seeded).toBe(2);
    expect(dataStore.get("blog")).toContain("site: showcase");
    expect(dataStore.get("blog")).toContain("path: /blog");
    expect(dataStore.get("app")).toContain("handler: aup");
  });

  test("does NOT seed when /data/.route/ already has content", async () => {
    const { afs } = createMockAFS(
      { blog: "site: showcase\npath: /blog\nsource: ./content/blog\nhandler: web" },
      { existing: "site: x\npath: /\nsource: .\nhandler: web" },
    );

    const seeded = await seedRoutes(afs);
    expect(seeded).toBe(0);
  });

  test("does NOT seed when /blocklet/.route/ does not exist", async () => {
    const { afs } = createMockAFS();

    const seeded = await seedRoutes(afs);
    expect(seeded).toBe(0);
  });

  test("validates route files during seed — skips invalid", async () => {
    const { afs, dataStore } = createMockAFS({
      valid: "site: showcase\npath: /blog\nsource: ./blog\nhandler: web",
      invalid: "this is not valid yaml route config",
    });

    const seeded = await seedRoutes(afs);
    expect(seeded).toBe(1);
    expect(dataStore.has("valid")).toBe(true);
    expect(dataStore.has("invalid")).toBe(false);
  });
});
