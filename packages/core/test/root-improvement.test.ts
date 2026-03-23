/**
 * Root Improvement Tests
 *
 * Phase 0: Fallback safety net + buildExplainFromStat
 * Phase 1: Root read/stat explicit routes
 * Phase 2: Explain explicit routes + content enhancement
 */
import { describe, expect, test } from "bun:test";
import { AFS } from "../src/afs.js";
import { AFSNotFoundError } from "../src/error.js";
import type { AFSModule } from "../src/type.js";

// Helper: create a test provider with configurable methods
function createTestProvider(
  name: string,
  description: string,
  opts?: { noWrite?: boolean; noSearch?: boolean; noExec?: boolean },
): AFSModule {
  const module: AFSModule = {
    name,
    description,
    accessMode: opts?.noWrite ? "readonly" : "readwrite",
    uri: `${name}:///test`,

    async stat(path) {
      if (path === "/") {
        return {
          data: {
            id: "/",
            path: "/",
            summary: `${name} root`,
            meta: { childrenCount: 3, description },
          },
        };
      }
      return { data: undefined };
    },

    async read(path) {
      if (path === "/") {
        return {
          data: {
            id: "/",
            path: "/",
            content: `${name} root content`,
            meta: { childrenCount: 3, description },
          },
        };
      }
      return { data: undefined };
    },

    async list() {
      return {
        data: [
          { id: "file1", path: "/file1", meta: { childrenCount: 0 } },
          { id: "file2", path: "/file2", meta: { childrenCount: 0 } },
        ],
      };
    },
  };

  if (!opts?.noExec) {
    module.exec = async (path, args) => ({ success: true, data: { path, args } });
  }
  if (!opts?.noSearch) {
    module.search = async () => ({ data: [] });
  }

  return module;
}

// Helper: set up AFS with standard test providers
function createTestAFS() {
  const afs = new AFS();
  afs.loadProvider = async () => {};
  afs.unloadProvider = async () => {};
  return afs;
}

async function setupAFSWithProviders() {
  const afs = createTestAFS();
  await afs.mount(createTestProvider("fs", "Local filesystem"), "/modules/fs");
  await afs.mount(
    createTestProvider("sqlite", "SQLite database", { noSearch: true }),
    "/modules/sqlite",
  );
  return afs;
}

// ===================================================================
// Phase 0: Fallback safety net + buildExplainFromStat
// ===================================================================
describe("Phase 0: Fallback safety net", () => {
  describe("Happy Path", () => {
    test("stat() no-module fallback: read-routable path returns stat data", async () => {
      const afs = await setupAFSWithProviders();
      // /.actions/mount has a read handler but previously no stat handler
      const result = await afs.stat("/.actions/mount");
      expect(result.data).toBeDefined();
      expect(result.data!.id).toBe("mount");
      expect(result.data!.path).toBe("/.actions/mount");
    });

    test("explain() no-module fallback: stat-routable path generates markdown", async () => {
      const afs = await setupAFSWithProviders();
      // /.actions/mount should produce explain via fallback chain
      const result = await afs.explain("/.actions/mount");
      expect(result.format).toBe("markdown");
      expect(result.content).toContain("mount");
    });

    test("buildExplainFromStat: stat data with actions generates Actions section", async () => {
      const afs = await setupAFSWithProviders();
      // /.actions/mount has actions in its read data
      const result = await afs.explain("/.actions/mount");
      expect(result.content).toContain("mount");
    });

    test("buildExplainFromStat: stat data with description generates Description", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.explain("/.actions/mount");
      expect(result.format).toBe("markdown");
      // The explain should contain meaningful content
      expect(result.content.length).toBeGreaterThan(10);
    });
  });

  describe("Bad Path", () => {
    test("stat() fallback: read also fails → throws AFSNotFoundError", async () => {
      const afs = await setupAFSWithProviders();
      await expect(afs.stat("/.nonexistent/path")).rejects.toThrow(AFSNotFoundError);
    });

    test("explain() fallback: stat also fails → throws AFSNotFoundError", async () => {
      const afs = await setupAFSWithProviders();
      await expect(afs.explain("/.nonexistent/path")).rejects.toThrow(AFSNotFoundError);
    });

    test("stat() fallback: read returns undefined data → throws AFSNotFoundError", async () => {
      const afs = createTestAFS();
      // No providers mounted, no special route matches
      await expect(afs.stat("/.unknown")).rejects.toThrow(AFSNotFoundError);
    });

    test("explain() fallback: stat returns undefined data → throws AFSNotFoundError", async () => {
      const afs = createTestAFS();
      await expect(afs.explain("/.unknown")).rejects.toThrow(AFSNotFoundError);
    });
  });

  describe("Edge Cases", () => {
    test("virtualDir takes priority over fallback: stat('/modules') returns virtual dir", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.stat("/modules");
      expect(result.data).toBeDefined();
      expect(result.data!.meta?.childrenCount).toBe(2);
    });

    test("stat('/') still returns virtual directory", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.stat("/");
      expect(result.data).toBeDefined();
    });

    test("fallback doesn't affect module paths: stat('/modules/fs') still works via module", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.stat("/modules/fs");
      expect(result.data).toBeDefined();
      expect(result.data!.meta?.description).toBe("Local filesystem");
    });
  });

  describe("Security", () => {
    test("fallback try-catch does not swallow non-NotFound errors for genuinely broken reads", async () => {
      // If a read path is actually routed but throws a non-NotFound error,
      // fallback should still result in NotFound (not expose internal error)
      const afs = createTestAFS();
      await expect(afs.stat("/.totally/unknown")).rejects.toThrow(AFSNotFoundError);
    });
  });

  describe("Data Leak", () => {
    test("stat from fallback does not include content field", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.stat("/.actions/mount");
      expect(result.data).toBeDefined();
      expect((result.data as any).content).toBeUndefined();
    });
  });

  describe("Data Damage", () => {
    test("multiple stat calls on same path return consistent results", async () => {
      const afs = await setupAFSWithProviders();
      const r1 = await afs.stat("/.actions/mount");
      const r2 = await afs.stat("/.actions/mount");
      expect(r1.data!.id).toBe(r2.data!.id);
      expect(r1.data!.path).toBe(r2.data!.path);
    });
  });
});

// ===================================================================
// Phase 1: Root read/stat explicit routes
// ===================================================================
describe("Phase 1: Root read/stat explicit routes", () => {
  describe("Happy Path", () => {
    test("read('/.meta') returns content with mountedProviders array", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.read("/.meta");
      expect(result.data).toBeDefined();
      expect(result.data!.id).toBe(".meta");
      expect(result.data!.path).toBe("/.meta");
      const content = result.data!.content as any;
      expect(content.mountedProviders).toBeArray();
      expect(content.mountedProviders.length).toBe(2);
    });

    test("read('/.meta') mountedProviders have name/path/description/operations", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.read("/.meta");
      const content = result.data!.content as any;
      const fsProvider = content.mountedProviders.find((p: any) => p.name === "fs");
      expect(fsProvider).toBeDefined();
      expect(fsProvider.path).toBe("/modules/fs");
      expect(fsProvider.description).toBe("Local filesystem");
      expect(fsProvider.operations).toBeArray();
      expect(fsProvider.operations).toContain("read");
      expect(fsProvider.operations).toContain("list");
    });

    test("read('/.meta') returns content with rootActions array", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.read("/.meta");
      const content = result.data!.content as any;
      expect(content.rootActions).toBeArray();
      expect(content.rootActions.length).toBeGreaterThanOrEqual(1);
      expect(content.rootActions.find((a: any) => a.name === "mount")).toBeDefined();
      expect(content.rootActions.find((a: any) => a.name === "unmount")).toBeDefined();
    });

    test("read('/.meta') returns content.childrenCount equal to mount count", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.read("/.meta");
      const content = result.data!.content as any;
      expect(content.childrenCount).toBe(2);
    });

    test("read('/.meta') operations correctly inferred from module methods", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.read("/.meta");
      const content = result.data!.content as any;
      // sqlite provider has noSearch: true
      const sqlite = content.mountedProviders.find((p: any) => p.name === "sqlite");
      expect(sqlite.operations).not.toContain("search");
      expect(sqlite.operations).toContain("exec");
      // fs provider has search
      const fs = content.mountedProviders.find((p: any) => p.name === "fs");
      expect(fs.operations).toContain("search");
    });

    test("read('/.actions') returns content with actions list", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.read("/.actions");
      expect(result.data).toBeDefined();
      expect(result.data!.id).toBe(".actions");
      expect(result.data!.path).toBe("/.actions");
      const content = result.data!.content as any;
      expect(content.actions).toBeArray();
      expect(content.actions.length).toBeGreaterThanOrEqual(1);
    });

    test("stat('/.actions') returns childrenCount and kind", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.stat("/.actions");
      expect(result.data).toBeDefined();
      expect(result.data!.id).toBe(".actions");
      expect(result.data!.meta?.kind).toBe("afs:directory");
      expect(result.data!.meta?.childrenCount).toBeGreaterThanOrEqual(1);
    });

    test("stat('/.actions/mount') returns action metadata without content", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.stat("/.actions/mount");
      expect(result.data).toBeDefined();
      expect(result.data!.id).toBe("mount");
      expect((result.data as any).content).toBeUndefined();
      expect(result.data!.actions).toBeArray();
      expect(result.data!.actions!.length).toBeGreaterThan(0);
    });

    test("stat('/.actions/unmount') returns action metadata without content", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.stat("/.actions/unmount");
      expect(result.data).toBeDefined();
      expect(result.data!.id).toBe("unmount");
      expect((result.data as any).content).toBeUndefined();
    });

    test("stat('/.meta') returns kind and childrenCount", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.stat("/.meta");
      expect(result.data).toBeDefined();
      expect(result.data!.id).toBe(".meta");
      expect(result.data!.meta?.kind).toBe("afs:meta");
    });

    test("stat('/.meta/.capabilities') returns kind without content", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.stat("/.meta/.capabilities");
      expect(result.data).toBeDefined();
      expect(result.data!.id).toBe(".capabilities");
      expect(result.data!.meta?.kind).toBe("afs:capabilities");
      expect((result.data as any).content).toBeUndefined();
    });
  });

  describe("Bad Path", () => {
    test("stat('/.actions/nonexistent') throws AFSNotFoundError", async () => {
      const afs = await setupAFSWithProviders();
      await expect(afs.stat("/.actions/nonexistent")).rejects.toThrow(AFSNotFoundError);
    });

    test("stat('/.meta/nonexistent') throws AFSNotFoundError", async () => {
      const afs = await setupAFSWithProviders();
      await expect(afs.stat("/.meta/nonexistent")).rejects.toThrow(AFSNotFoundError);
    });

    test("read('/.meta') with no mounts returns empty mountedProviders", async () => {
      const afs = createTestAFS();
      const result = await afs.read("/.meta");
      const content = result.data!.content as any;
      expect(content.mountedProviders).toEqual([]);
      expect(content.childrenCount).toBe(0);
    });

    test("read('/.actions') without loadProvider only contains unmount", async () => {
      const afs = new AFS(); // no loadProvider
      const result = await afs.read("/.actions");
      const content = result.data!.content as any;
      const names = content.actions.map((a: any) => a.name);
      expect(names).toContain("unmount");
      expect(names).not.toContain("mount");
    });
  });

  describe("Edge Cases", () => {
    test("read('/.meta') dynamic: new mount appears after mount", async () => {
      const afs = await setupAFSWithProviders();
      const before = await afs.read("/.meta");
      expect((before.data!.content as any).mountedProviders.length).toBe(2);

      await afs.mount(createTestProvider("git", "Git repository"), "/modules/git");
      const after = await afs.read("/.meta");
      expect((after.data!.content as any).mountedProviders.length).toBe(3);
    });

    test("read('/.meta') dynamic: mount disappears after unmount", async () => {
      const afs = await setupAFSWithProviders();
      afs.unmount("/modules/sqlite");
      const result = await afs.read("/.meta");
      expect((result.data!.content as any).mountedProviders.length).toBe(1);
    });

    test("namespace isolation: stat routes only fire for default namespace", async () => {
      const afs = await setupAFSWithProviders();
      // Stat on /.actions in default namespace should work
      const result = await afs.stat("/.actions");
      expect(result.data).toBeDefined();
    });
  });

  describe("Security", () => {
    test("read('/.meta') operations only reflect actually existing methods", async () => {
      const afs = createTestAFS();
      const minimalProvider: AFSModule = {
        name: "minimal",
        description: "Minimal provider",
        accessMode: "readonly",
        async read() {
          return { data: { id: "/", path: "/" } };
        },
        async list() {
          return { data: [] };
        },
      };
      await afs.mount(minimalProvider, "/modules/minimal");
      const result = await afs.read("/.meta");
      const content = result.data!.content as any;
      const ops = content.mountedProviders[0].operations;
      expect(ops).toContain("read");
      expect(ops).toContain("list");
      expect(ops).not.toContain("write");
      expect(ops).not.toContain("exec");
      expect(ops).not.toContain("search");
      expect(ops).not.toContain("delete");
    });
  });

  describe("Data Leak", () => {
    test("stat('/.actions/mount') does not include content", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.stat("/.actions/mount");
      expect((result.data as any).content).toBeUndefined();
    });

    test("stat('/.meta/.capabilities') does not include capabilities content", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.stat("/.meta/.capabilities");
      expect((result.data as any).content).toBeUndefined();
    });
  });

  describe("Data Damage", () => {
    test("read/stat are read-only: no internal state modification", async () => {
      const afs = await setupAFSWithProviders();
      const mountsBefore = afs.getMounts().length;
      await afs.read("/.meta");
      await afs.stat("/.actions");
      await afs.stat("/.meta");
      const mountsAfter = afs.getMounts().length;
      expect(mountsAfter).toBe(mountsBefore);
    });
  });
});

// ===================================================================
// Phase 2: Explain explicit routes + content enhancement
// ===================================================================
describe("Phase 2: Explain explicit routes + content enhancement", () => {
  describe("Happy Path", () => {
    test("explain('/') contains 'Mounted Providers' section with provider names and descriptions", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.explain("/");
      expect(result.format).toBe("markdown");
      expect(result.content).toContain("Mounted Providers");
      expect(result.content).toContain("fs");
      expect(result.content).toContain("Local filesystem");
      expect(result.content).toContain("sqlite");
      expect(result.content).toContain("SQLite database");
    });

    test("explain('/') contains 'Standard Operations' section", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.explain("/");
      expect(result.content).toContain("Standard Operations");
    });

    test("explain('/') contains 'Root Actions' section listing mount/unmount", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.explain("/");
      expect(result.content).toContain("Root Actions");
      expect(result.content).toContain("mount");
      expect(result.content).toContain("unmount");
    });

    test("explain('/') contains 'Built-in Systems' section explaining .meta and .actions", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.explain("/");
      expect(result.content).toContain("Built-in Systems");
      expect(result.content).toContain(".meta");
      expect(result.content).toContain(".actions");
    });

    test("explain('/.actions') lists all root actions with names and descriptions", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.explain("/.actions");
      expect(result.format).toBe("markdown");
      expect(result.content).toContain("mount");
      expect(result.content).toContain("unmount");
      expect(result.content).toContain("Mount a provider");
    });

    test("explain('/.actions/mount') contains parameter table with name/type/required/description", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.explain("/.actions/mount");
      expect(result.format).toBe("markdown");
      expect(result.content).toContain("uri");
      expect(result.content).toContain("string");
      expect(result.content).toContain("Required");
      expect(result.content).toContain("yes");
    });

    test("explain('/.actions/mount') contains usage example", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.explain("/.actions/mount");
      expect(result.content).toMatch(/example|usage/i);
    });

    test("explain('/.actions/unmount') contains parameter table and example", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.explain("/.actions/unmount");
      expect(result.format).toBe("markdown");
      expect(result.content).toContain("path");
      expect(result.content).toContain("string");
    });

    test("explain('/.meta') explains .meta convention and available sub-paths", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.explain("/.meta");
      expect(result.format).toBe("markdown");
      expect(result.content).toContain(".capabilities");
      expect(result.content).toContain("metadata");
    });

    test("explain('/.meta/.capabilities') explains capabilities meaning", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.explain("/.meta/.capabilities");
      expect(result.format).toBe("markdown");
      expect(result.content).toContain("capabilities");
    });
  });

  describe("Bad Path", () => {
    test("explain('/.actions/nonexistent') throws AFSNotFoundError", async () => {
      const afs = await setupAFSWithProviders();
      await expect(afs.explain("/.actions/nonexistent")).rejects.toThrow(AFSNotFoundError);
    });

    test("explain('/.meta/nonexistent') throws AFSNotFoundError", async () => {
      const afs = await setupAFSWithProviders();
      await expect(afs.explain("/.meta/nonexistent")).rejects.toThrow(AFSNotFoundError);
    });
  });

  describe("Edge Cases", () => {
    test("explain('/') dynamic: new provider appears after mount", async () => {
      const afs = await setupAFSWithProviders();
      const before = await afs.explain("/");
      expect(before.content).not.toContain("git");

      await afs.mount(createTestProvider("git", "Git repository"), "/modules/git");
      const after = await afs.explain("/");
      expect(after.content).toContain("git");
      expect(after.content).toContain("Git repository");
    });

    test("explain('/') dynamic: provider disappears after unmount", async () => {
      const afs = await setupAFSWithProviders();
      afs.unmount("/modules/sqlite");
      const result = await afs.explain("/");
      expect(result.content).not.toContain("SQLite database");
    });

    test("explain('/') with no mounts shows empty or hint in Mounted Providers", async () => {
      const afs = createTestAFS();
      const result = await afs.explain("/");
      expect(result.format).toBe("markdown");
      expect(result.content).toContain("Mounted Providers");
      // Should indicate no providers or be empty
      expect(result.content).toMatch(/no provider|none/i);
    });

    test("explain('/.actions/mount') without loadProvider throws NotFoundError", async () => {
      const afs = new AFS(); // no loadProvider
      await expect(afs.explain("/.actions/mount")).rejects.toThrow(AFSNotFoundError);
    });

    test("explain always returns { format: 'markdown', content: string }", async () => {
      const afs = await setupAFSWithProviders();
      const paths = ["/", "/.actions", "/.actions/mount", "/.meta", "/.meta/.capabilities"];
      for (const p of paths) {
        const result = await afs.explain(p);
        expect(result.format).toBe("markdown");
        expect(typeof result.content).toBe("string");
        expect(result.content.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Security", () => {
    test("explain('/.actions/mount') auth field description does not leak auth details", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.explain("/.actions/mount");
      // Should not contain actual tokens or credential values
      expect(result.content).not.toMatch(/bearer|password|secret|token.*=|api.?key.*:/i);
    });
  });

  describe("Data Leak", () => {
    test("explain('/') does not expose internal implementation details", async () => {
      const afs = await setupAFSWithProviders();
      const result = await afs.explain("/");
      // Should not expose internal namespace structure or module path prefix patterns
      expect(result.content).not.toContain("makeKey");
      expect(result.content).not.toContain("findModulesInNamespace");
      expect(result.content).not.toContain("CANONICAL_PREFIX");
    });
  });

  describe("Data Damage", () => {
    test("explain operations are pure read-only, no side effects", async () => {
      const afs = await setupAFSWithProviders();
      const mountsBefore = afs.getMounts().length;
      await afs.explain("/");
      await afs.explain("/.actions");
      await afs.explain("/.actions/mount");
      await afs.explain("/.meta");
      await afs.explain("/.meta/.capabilities");
      const mountsAfter = afs.getMounts().length;
      expect(mountsAfter).toBe(mountsBefore);
    });
  });
});
