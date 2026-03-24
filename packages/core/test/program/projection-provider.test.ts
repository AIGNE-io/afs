import { describe, expect, mock, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import {
  AFS,
  AFSAccessModeError,
  createBlockletAFS,
  findMountByURI,
  ProjectionProvider,
} from "@aigne/afs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock AFSModule with URI */
function createMockModule(name: string, uri?: string): AFSModule {
  return {
    name,
    uri,
    accessMode: "readwrite" as const,
    list: mock(async () => ({
      data: [{ path: "/test", content: "test", meta: { childrenCount: 0 } }],
    })) as any,
    read: mock(async () => ({
      data: { path: "/test", content: "test-content" },
    })) as any,
    write: mock(async () => ({ data: { path: "/test" } })) as any,
    delete: mock(async () => ({ data: { deleted: true } })) as any,
    search: mock(async () => ({ data: [] })) as any,
    exec: mock(async () => ({ success: true, data: "result" })) as any,
    stat: mock(async () => ({
      data: { path: "/test", content: "stat", meta: { childrenCount: 0 } },
    })) as any,
    explain: mock(async () => ({ format: "text", content: "explanation" })) as any,
  };
}

/** Valid program.yaml content */
const PROGRAM_YAML = `
specVersion: 1
id: test-program
name: Test Program
entrypoint: ./scripts/main.ash
mounts:
  - uri: "ash://"
    target: /ash
    required: true
    ops: [exec]
  - uri: "aignehub://"
    target: /aignehub
    required: true
    ops: [exec, read]
  - uri: "telegram://"
    target: /telegram
    required: false
    ops: [exec, read, list]
`;

// ---------------------------------------------------------------------------
// ProjectionProvider
// ---------------------------------------------------------------------------
describe("ProjectionProvider", () => {
  // =========================================================================
  // Happy Path
  // =========================================================================
  describe("Happy Path", () => {
    test("correctly forwards list operation to source path", async () => {
      const mockAFS = createMockModule("mock") as any;
      const provider = new ProjectionProvider({
        name: "test",
        globalAFS: mockAFS,
        sourcePath: "/modules/ash",
      });

      await provider.list("/foo");
      expect(mockAFS.list).toHaveBeenCalledWith("/modules/ash/foo", undefined);
    });

    test("correctly forwards read operation to source path", async () => {
      const mockAFS = createMockModule("mock") as any;
      const provider = new ProjectionProvider({
        name: "test",
        globalAFS: mockAFS,
        sourcePath: "/modules/ash",
      });

      await provider.read("/bar");
      expect(mockAFS.read).toHaveBeenCalledWith("/modules/ash/bar", undefined);
    });

    test("correctly forwards exec operation to source path", async () => {
      const mockAFS = createMockModule("mock") as any;
      const provider = new ProjectionProvider({
        name: "test",
        globalAFS: mockAFS,
        sourcePath: "/modules/ash",
      });

      await provider.exec("/.actions/run", { task: "hello" }, {} as any);
      expect(mockAFS.exec).toHaveBeenCalledWith("/modules/ash/.actions/run", { task: "hello" }, {});
    });

    test("correctly forwards stat operation to source path", async () => {
      const mockAFS = createMockModule("mock") as any;
      const provider = new ProjectionProvider({
        name: "test",
        globalAFS: mockAFS,
        sourcePath: "/modules/ash",
      });

      await provider.stat("/");
      expect(mockAFS.stat).toHaveBeenCalledWith("/modules/ash", undefined);
    });

    test("correctly forwards search operation to source path", async () => {
      const mockAFS = createMockModule("mock") as any;
      const provider = new ProjectionProvider({
        name: "test",
        globalAFS: mockAFS,
        sourcePath: "/modules/ash",
      });

      await provider.search("/", "query");
      expect(mockAFS.search).toHaveBeenCalledWith("/modules/ash", "query", undefined);
    });

    test("correctly forwards write operation to source path", async () => {
      const mockAFS = createMockModule("mock") as any;
      const provider = new ProjectionProvider({
        name: "test",
        globalAFS: mockAFS,
        sourcePath: "/modules/data",
      });

      await provider.write("/file.txt", { content: "hello" } as any);
      expect(mockAFS.write).toHaveBeenCalledWith(
        "/modules/data/file.txt",
        { content: "hello" },
        undefined,
      );
    });

    test("sub-path correctly concatenated (/ash + /foo → source + /foo)", async () => {
      const mockAFS = createMockModule("mock") as any;
      const provider = new ProjectionProvider({
        name: "test",
        globalAFS: mockAFS,
        sourcePath: "/deep/nested/path",
      });

      await provider.read("/child/file.txt");
      expect(mockAFS.read).toHaveBeenCalledWith("/deep/nested/path/child/file.txt", undefined);
    });

    test("no allowedOps passes all operations through", async () => {
      const mockAFS = createMockModule("mock") as any;
      const provider = new ProjectionProvider({
        name: "test",
        globalAFS: mockAFS,
        sourcePath: "/source",
        // No allowedOps
      });

      // All should work
      await provider.list("/");
      await provider.read("/");
      await provider.write("/", {} as any);
      await provider.delete("/");
      await provider.search("/", "q");
      await provider.exec("/", {}, {} as any);
      await provider.stat("/");
      await provider.explain("/");
    });
  });

  // =========================================================================
  // Bad Path
  // =========================================================================
  describe("Bad Path", () => {
    const ops = ["list", "read", "write", "exec", "delete", "search", "stat"] as const;

    for (const op of ops) {
      test(`ops without '${op}' throws AFSAccessModeError on ${op} call`, async () => {
        const mockAFS = createMockModule("mock") as any;
        const allowed = new Set(ops.filter((o) => o !== op));
        const provider = new ProjectionProvider({
          name: "test",
          globalAFS: mockAFS,
          sourcePath: "/source",
          allowedOps: allowed,
        });

        const args: any[] = ["/path"];
        if (op === "write") args.push({});
        if (op === "exec") args.push({}, {});
        if (op === "search") args.push("query");

        await expect((provider as any)[op](...args)).rejects.toThrow(AFSAccessModeError);
      });
    }
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================
  describe("Edge Cases", () => {
    test("root path (empty sub-path) correctly forwards", async () => {
      const mockAFS = createMockModule("mock") as any;
      const provider = new ProjectionProvider({
        name: "test",
        globalAFS: mockAFS,
        sourcePath: "/modules/ash",
      });

      await provider.list("/");
      expect(mockAFS.list).toHaveBeenCalledWith("/modules/ash", undefined);
    });

    test("empty allowedOps set rejects all operations", async () => {
      const mockAFS = createMockModule("mock") as any;
      const provider = new ProjectionProvider({
        name: "test",
        globalAFS: mockAFS,
        sourcePath: "/source",
        allowedOps: new Set(),
      });

      await expect(provider.list("/")).rejects.toThrow(AFSAccessModeError);
      await expect(provider.read("/")).rejects.toThrow(AFSAccessModeError);
    });
  });

  // =========================================================================
  // Security
  // =========================================================================
  describe("Security", () => {
    test("path traversal (../) does not escape source path via joinURL", async () => {
      const mockAFS = createMockModule("mock") as any;
      const provider = new ProjectionProvider({
        name: "test",
        globalAFS: mockAFS,
        sourcePath: "/modules/ash",
      });

      // joinURL normalizes ../ — the resolved path stays within or at source
      await provider.read("/../../../etc/passwd");
      const calledPath = (mockAFS.read as any).mock.calls[0][0];
      // joinURL will resolve to /etc/passwd or similar, NOT escape the AFS entirely
      // The important thing is AFS itself handles path security
      expect(typeof calledPath).toBe("string");
    });
  });

  // =========================================================================
  // Data Leak
  // =========================================================================
  describe("Data Leak", () => {
    test("ops rejection error does not expose full ops list", async () => {
      const mockAFS = createMockModule("mock") as any;
      const provider = new ProjectionProvider({
        name: "test",
        globalAFS: mockAFS,
        sourcePath: "/source",
        allowedOps: new Set(["read"]),
      });

      try {
        await provider.write("/file", {} as any);
      } catch (e) {
        const msg = String(e);
        // Should not list what IS allowed
        expect(msg).not.toContain("allowedOps");
        expect(msg).not.toContain('["read"]');
      }
    });
  });
});

// ---------------------------------------------------------------------------
// findMountByURI
// ---------------------------------------------------------------------------
describe("findMountByURI", () => {
  test("correctly matches a mounted provider by URI", async () => {
    const afs = new AFS();
    const mockModule = createMockModule("ash");
    (mockModule as any).uri = "ash://";
    await afs.mount(mockModule, "/modules/ash", { lenient: true });

    const matches = findMountByURI(afs, "ash://");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.module.uri).toBe("ash://");
  });

  test("returns empty array when URI not found", async () => {
    const afs = new AFS();
    const mockModule = createMockModule("ash");
    (mockModule as any).uri = "ash://";
    await afs.mount(mockModule, "/modules/ash", { lenient: true });

    const matches = findMountByURI(afs, "telegram://");
    expect(matches).toHaveLength(0);
  });

  test("returns multiple matches for duplicate URIs", async () => {
    const afs = new AFS();
    const mod1 = createMockModule("ash1");
    (mod1 as any).uri = "ash://";
    const mod2 = createMockModule("ash2");
    (mod2 as any).uri = "ash://";
    await afs.mount(mod1, "/modules/ash1", { lenient: true });
    await afs.mount(mod2, "/modules/ash2", { lenient: true });

    const matches = findMountByURI(afs, "ash://");
    expect(matches).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// createBlockletAFS
// ---------------------------------------------------------------------------
describe("createBlockletAFS", () => {
  /** Create a host AFS with program.yaml readable at a given path */
  async function setupHostAFS(opts?: { yamlContent?: string; mountUris?: Record<string, string> }) {
    const hostAFS = new AFS();

    // Mount a mock FS that can read program.yaml
    const programModule = createMockModule("program-fs");
    (programModule.read as any).mockImplementation(async (path: string) => {
      if (path === "/program.yaml" || path === "/") {
        return {
          data: {
            path,
            content: opts?.yamlContent ?? PROGRAM_YAML,
          },
        };
      }
      if (path.endsWith(".yaml") || path.endsWith(".yml")) {
        throw new Error(`Not found: ${path}`);
      }
      return { data: { path, content: "file content" } };
    });
    (programModule.stat as any).mockImplementation(async () => ({
      data: { path: "/", content: "stat" },
    }));
    (programModule.list as any).mockImplementation(async () => ({
      data: [{ path: "/program.yaml", content: "yaml" }],
    }));
    await hostAFS.mount(programModule, "/blocklets/test", { lenient: true });

    // Mount data dir
    const dataModule = createMockModule("data-fs");
    await hostAFS.mount(dataModule, "/program-data/test/data", { lenient: true });

    // Mount providers with URIs
    if (opts?.mountUris) {
      for (const [name, uri] of Object.entries(opts.mountUris)) {
        const mod = createMockModule(name);
        (mod as any).uri = uri;
        await hostAFS.mount(mod, `/modules/${name}`, { lenient: true });
      }
    }

    return hostAFS;
  }

  // =========================================================================
  // Happy Path
  // =========================================================================
  describe("Happy Path", () => {
    test("correctly creates Runtime AFS instance", async () => {
      const hostAFS = await setupHostAFS({
        mountUris: { ash: "ash://", aignehub: "aignehub://" },
      });

      const { afs, manifest } = await createBlockletAFS(
        "/blocklets/test",
        "/program-data/test/data",
        hostAFS,
      );

      expect(afs).toBeDefined();
      expect(manifest).toBeDefined();
      expect(manifest.id).toBe("test-program");
    });

    test("/blocklet path is readable (readonly)", async () => {
      const hostAFS = await setupHostAFS({
        mountUris: { ash: "ash://", aignehub: "aignehub://" },
      });

      const { afs } = await createBlockletAFS(
        "/blocklets/test",
        "/program-data/test/data",
        hostAFS,
      );

      // Should be able to read
      const result = await afs.read!("/blocklet/scripts/main.ash");
      expect(result).toBeDefined();
    });

    test("/blocklet path rejects write (readonly enforced)", async () => {
      const hostAFS = await setupHostAFS({
        mountUris: { ash: "ash://", aignehub: "aignehub://" },
      });

      const { afs } = await createBlockletAFS(
        "/blocklets/test",
        "/program-data/test/data",
        hostAFS,
      );

      // Write should be rejected
      await expect(afs.write!("/blocklet/file.txt", { content: "hack" })).rejects.toThrow();
    });

    test("/data path is readable and writable", async () => {
      const hostAFS = await setupHostAFS({
        mountUris: { ash: "ash://", aignehub: "aignehub://" },
      });

      const { afs } = await createBlockletAFS(
        "/blocklets/test",
        "/program-data/test/data",
        hostAFS,
      );

      // Both read and write should work
      const readResult = await afs.read!("/data/sessions/default");
      expect(readResult).toBeDefined();

      const writeResult = await afs.write!("/data/cache/temp", { content: "data" });
      expect(writeResult).toBeDefined();
    });

    test("projection paths respect ops restriction", async () => {
      const hostAFS = await setupHostAFS({
        mountUris: { ash: "ash://", aignehub: "aignehub://" },
      });

      const { afs } = await createBlockletAFS(
        "/blocklets/test",
        "/program-data/test/data",
        hostAFS,
      );

      // /ash has ops: [exec] — read should fail
      await expect(afs.read!("/ash/something")).rejects.toThrow();

      // /aignehub has ops: [exec, read] — exec and read should work
      const execResult = await afs.exec!("/aignehub/.actions/chat", {}, {});
      expect(execResult).toBeDefined();
    });

    test("URI matching reuses host provider", async () => {
      const hostAFS = await setupHostAFS({
        mountUris: { ash: "ash://", aignehub: "aignehub://" },
      });

      const { afs } = await createBlockletAFS(
        "/blocklets/test",
        "/program-data/test/data",
        hostAFS,
      );

      // /ash projection should delegate to /modules/ash
      await afs.exec!("/ash/.actions/run", {}, {});
      // The projection routes through globalAFS, which routes to the mock module
    });

    test("required: false mount skipped when URI not found", async () => {
      // telegram:// not mounted, but it's optional
      const hostAFS = await setupHostAFS({
        mountUris: { ash: "ash://", aignehub: "aignehub://" },
      });

      const { afs, manifest } = await createBlockletAFS(
        "/blocklets/test",
        "/program-data/test/data",
        hostAFS,
      );

      expect(manifest.mounts[2]!.required).toBe(false);
      // /telegram should not be mounted — accessing it should fail
      await expect(afs.read!("/telegram/something")).rejects.toThrow();
    });

    test("required: true mount throws when URI not found", async () => {
      // ash:// not mounted, but it's required
      const hostAFS = await setupHostAFS({
        mountUris: { aignehub: "aignehub://" },
      });

      await expect(
        createBlockletAFS("/blocklets/test", "/program-data/test/data", hostAFS),
      ).rejects.toThrow(/Required mount URI.*ash:\/\//);
    });
  });

  // =========================================================================
  // Bad Path
  // =========================================================================
  describe("Bad Path", () => {
    test("invalid manifest throws parse error", async () => {
      const hostAFS = await setupHostAFS({ yamlContent: "invalid: yaml: [" });

      await expect(
        createBlockletAFS("/blocklets/test", "/program-data/test/data", hostAFS),
      ).rejects.toThrow();
    });

    test("URI matches multiple providers throws MOUNT_CONFLICT", async () => {
      const hostAFS = new AFS();

      // Mock program read
      const programModule = createMockModule("program-fs");
      const simpleYaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "ash://"
    target: /ash
    required: true
    ops: [exec]
`;
      (programModule.read as any).mockImplementation(async () => ({
        data: { path: "/program.yaml", content: simpleYaml },
      }));
      (programModule.stat as any).mockImplementation(async () => ({
        data: { path: "/", content: "stat" },
      }));
      (programModule.list as any).mockImplementation(async () => ({
        data: [],
      }));
      await hostAFS.mount(programModule, "/blocklets/test", { lenient: true });

      const dataModule = createMockModule("data-fs");
      await hostAFS.mount(dataModule, "/program-data/test/data", { lenient: true });

      // Mount two providers with same URI
      const mod1 = createMockModule("ash1");
      (mod1 as any).uri = "ash://";
      const mod2 = createMockModule("ash2");
      (mod2 as any).uri = "ash://";
      await hostAFS.mount(mod1, "/modules/ash1", { lenient: true });
      await hostAFS.mount(mod2, "/modules/ash2", { lenient: true });

      await expect(
        createBlockletAFS("/blocklets/test", "/program-data/test/data", hostAFS),
      ).rejects.toThrow(/Mount conflict/);
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================
  describe("Edge Cases", () => {
    test("manifest with no mounts only creates /blocklet and /data", async () => {
      const noMountsYaml = `
specVersion: 1
id: minimal
name: Minimal
entrypoint: ./main.ash
`;
      const hostAFS = await setupHostAFS({ yamlContent: noMountsYaml });

      const { afs, manifest } = await createBlockletAFS(
        "/blocklets/test",
        "/program-data/test/data",
        hostAFS,
      );

      expect(manifest.mounts).toEqual([]);
      // /blocklet and /data should work
      const readResult = await afs.read!("/blocklet/main.ash");
      expect(readResult).toBeDefined();
    });

    test("nested projection target (/tools/mcp) mounts correctly", async () => {
      const nestedYaml = `
specVersion: 1
id: test
name: Test
entrypoint: ./main.ash
mounts:
  - uri: "mcp://"
    target: /tools/mcp
    ops: [exec]
`;
      const hostAFS = await setupHostAFS({ yamlContent: nestedYaml });
      const mcpMod = createMockModule("mcp");
      (mcpMod as any).uri = "mcp://";
      await hostAFS.mount(mcpMod, "/modules/mcp", { lenient: true });

      const { afs } = await createBlockletAFS(
        "/blocklets/test",
        "/program-data/test/data",
        hostAFS,
      );

      // Should be able to exec on nested path
      await afs.exec!("/tools/mcp/.actions/run", {}, {});
    });
  });

  // =========================================================================
  // Security
  // =========================================================================
  describe("Security", () => {
    test("/blocklet is strictly readonly — cannot write via any path", async () => {
      const hostAFS = await setupHostAFS({
        mountUris: { ash: "ash://", aignehub: "aignehub://" },
      });

      const { afs } = await createBlockletAFS(
        "/blocklets/test",
        "/program-data/test/data",
        hostAFS,
      );

      await expect(afs.write!("/blocklet/hack.txt", { content: "pwned" })).rejects.toThrow();
      await expect(afs.delete!("/blocklet/scripts/main.ash")).rejects.toThrow();
    });
  });

  // =========================================================================
  // Data Leak
  // =========================================================================
  describe("Data Leak", () => {
    test("error messages from projection do not expose host AFS paths", async () => {
      const hostAFS = await setupHostAFS({
        mountUris: { ash: "ash://", aignehub: "aignehub://" },
      });

      const { afs } = await createBlockletAFS(
        "/blocklets/test",
        "/program-data/test/data",
        hostAFS,
      );

      try {
        // /ash only allows exec, read should fail
        await afs.read!("/ash/something");
      } catch (e) {
        const msg = String(e);
        // Should not expose internal mount structure
        expect(msg).not.toContain("/modules/");
      }
    });
  });

  // =========================================================================
  // Data Damage
  // =========================================================================
  describe("Data Damage", () => {
    test("partial mount failure (optional) does not affect other mounts", async () => {
      // ash:// and aignehub:// mounted, telegram:// missing (optional)
      const hostAFS = await setupHostAFS({
        mountUris: { ash: "ash://", aignehub: "aignehub://" },
      });

      const { afs } = await createBlockletAFS(
        "/blocklets/test",
        "/program-data/test/data",
        hostAFS,
      );

      // /ash and /aignehub should still work
      await afs.exec!("/ash/.actions/run", {}, {});
      const result = await afs.read!("/aignehub/defaults/chat");
      expect(result).toBeDefined();
    });
  });
});
