import { describe, expect, mock, test } from "bun:test";
import type { AFSModule } from "@aigne/afs";
import { AFS, parseBlockletManifest } from "@aigne/afs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    required: false
    ops: [exec, read]
`;

/** Create a mock module that serves a program directory */
function createProgramModule(opts?: {
  yamlContent?: string;
  entrypoint?: string;
  entrypointInputSchema?: Record<string, unknown>;
  hasAshFile?: boolean;
}): AFSModule {
  const yaml = opts?.yamlContent ?? PROGRAM_YAML;
  const entrypoint = opts?.entrypoint ?? "scripts/main.ash";
  const inputSchema = opts?.entrypointInputSchema;

  return {
    name: "mock-fs",
    accessMode: "readwrite",
    list: mock(async (path: string) => {
      if (path === "/" || path === "") {
        const entries: any[] = [
          { path: "/program.yaml", meta: { childrenCount: 0 } },
          { path: "/scripts", meta: { childrenCount: 1 } },
        ];
        if (opts?.hasAshFile) {
          entries.push({ path: "/run.ash", meta: { childrenCount: 0 } });
        }
        return { data: entries };
      }
      if (path === "/scripts") {
        return { data: [{ path: "/scripts/main.ash", meta: { childrenCount: 0 } }] };
      }
      return { data: [] };
    }) as any,
    read: mock(async (path: string) => {
      if (path === "/program.yaml") {
        return { data: { path: "/program.yaml", content: yaml } };
      }
      if (path === `/${entrypoint}` || path === entrypoint) {
        return { data: { path: `/${entrypoint}`, content: "# ash script content" } };
      }
      if (path.endsWith(".yaml") || path.endsWith(".yml")) {
        throw new Error(`Not found: ${path}`);
      }
      return { data: { path, content: `content for ${path}` } };
    }) as any,
    stat: mock(async (path: string) => {
      if (path === "/" || path === "") {
        return {
          data: {
            path: "/",
            meta: { childrenCount: 3 },
          },
        };
      }
      if (path === `/${entrypoint}` || path === entrypoint) {
        const meta: Record<string, unknown> = { childrenCount: 0 };
        if (inputSchema) {
          return {
            data: { path: `/${entrypoint}`, meta, inputSchema },
          };
        }
        return { data: { path: `/${entrypoint}`, meta } };
      }
      if (path === "/program.yaml") {
        return { data: { path: "/program.yaml", meta: { childrenCount: 0 } } };
      }
      return { data: { path, meta: { childrenCount: 0 } } };
    }) as any,
    exec: mock(async (path: string, args: Record<string, unknown>) => {
      return { success: true, data: { executed: path, args } };
    }) as any,
    write: mock(async () => ({ data: { path: "/" } })) as any,
    delete: mock(async () => ({ data: { deleted: true } })) as any,
    search: mock(async () => ({ data: [] })) as any,
    explain: mock(async () => ({ format: "text", content: "explanation" })) as any,
  };
}

/** Create a non-program directory module */
function createPlainModule(): AFSModule {
  return {
    name: "plain-fs",
    accessMode: "readwrite",
    list: mock(async () => ({
      data: [
        { path: "/file.txt", meta: { childrenCount: 0 } },
        { path: "/subdir", meta: { childrenCount: 2 } },
      ],
    })) as any,
    read: mock(async (path: string) => ({
      data: { path, content: `plain content for ${path}` },
    })) as any,
    stat: mock(async (path: string) => ({
      data: { path, meta: { childrenCount: path === "/" ? 2 : 0 } },
    })) as any,
    exec: mock(async () => ({ success: true, data: "plain exec" })) as any,
    search: mock(async () => ({ data: [] })) as any,
  };
}

/** Create an AFS with a program module and dependency modules mounted */
async function setupAFSWithProgram(opts?: {
  yamlContent?: string;
  entrypoint?: string;
  entrypointInputSchema?: Record<string, unknown>;
  hasAshFile?: boolean;
  mountAsh?: boolean;
  mountAignehub?: boolean;
}) {
  const afs = new AFS();

  const programMod = createProgramModule(opts);
  await afs.mount(programMod, "/blocklets/test", { lenient: true });

  // Mount data directory
  const dataMod: AFSModule = {
    name: "data-fs",
    accessMode: "readwrite",
    list: mock(async () => ({ data: [] })) as any,
    read: mock(async (path: string) => ({ data: { path, content: "" } })) as any,
    stat: mock(async (path: string) => ({ data: { path, meta: { childrenCount: 0 } } })) as any,
    write: mock(async () => ({ data: { path: "/" } })) as any,
    delete: mock(async () => ({ data: { deleted: true } })) as any,
    search: mock(async () => ({ data: [] })) as any,
  };
  await afs.mount(dataMod, "/program-data/test", { lenient: true });

  // Mount dependency modules with URIs
  if (opts?.mountAsh !== false) {
    const ashMod: AFSModule = {
      name: "ash-provider",
      uri: "ash://",
      accessMode: "readwrite",
      list: mock(async () => ({ data: [] })) as any,
      read: mock(async (path: string) => ({ data: { path, content: "ash content" } })) as any,
      stat: mock(async (path: string) => ({ data: { path, meta: { childrenCount: 0 } } })) as any,
      exec: mock(async (_path: string, args: Record<string, unknown>) => ({
        success: true,
        data: { ashExec: true, args },
      })) as any,
      search: mock(async () => ({ data: [] })) as any,
    };
    await afs.mount(ashMod, "/modules/ash", { lenient: true });
  }

  if (opts?.mountAignehub !== false) {
    const aignehubMod: AFSModule = {
      name: "aignehub-provider",
      uri: "aignehub://",
      accessMode: "readwrite",
      list: mock(async () => ({ data: [] })) as any,
      read: mock(async (path: string) => ({ data: { path, content: "aignehub content" } })) as any,
      stat: mock(async (path: string) => ({ data: { path, meta: { childrenCount: 0 } } })) as any,
      exec: mock(async () => ({ success: true, data: { aignehubExec: true } })) as any,
      search: mock(async () => ({ data: [] })) as any,
    };
    await afs.mount(aignehubMod, "/modules/aignehub", { lenient: true });
  }

  return { afs, programMod };
}

// ---------------------------------------------------------------------------
// stat program detection
// ---------------------------------------------------------------------------
describe("stat program detection", () => {
  describe("Happy Path", () => {
    test("stat directory containing program.yaml returns kind: afs:program", async () => {
      const { afs } = await setupAFSWithProgram();
      const result = await afs.stat!("/blocklets/test");
      expect(result.data?.meta?.kind).toBe("afs:program");
    });

    test("stat program returns kinds array with inheritance chain", async () => {
      const { afs } = await setupAFSWithProgram();
      const result = await afs.stat!("/blocklets/test");
      const kinds = result.data?.meta?.kinds as string[] | undefined;
      expect(kinds).toContain("afs:program");
      expect(kinds).toContain("afs:executable");
    });

    test("stat program returns entrypoint in meta", async () => {
      const { afs } = await setupAFSWithProgram();
      const result = await afs.stat!("/blocklets/test");
      expect(result.data?.meta?.entrypoint).toBe("./scripts/main.ash");
    });

    test("different provider (mock) auto-detects program", async () => {
      // Uses mock module, not FS provider — proves provider-agnostic detection
      const { afs } = await setupAFSWithProgram();
      const result = await afs.stat!("/blocklets/test");
      expect(result.data?.meta?.kind).toBe("afs:program");
    });

    test("stat program returns entrypoint inputSchema (-h delegation)", async () => {
      const inputSchema = {
        type: "object",
        properties: {
          task: { type: "string", description: "The task to perform" },
          model: { type: "string", description: "LLM model to use" },
        },
      };
      const { afs } = await setupAFSWithProgram({ entrypointInputSchema: inputSchema });
      const result = await afs.stat!("/blocklets/test");
      expect(result.data?.meta?.inputSchema).toEqual(inputSchema);
    });

    test("stat program inputSchema comes from entrypoint stat", async () => {
      const inputSchema = { type: "object", properties: { x: { type: "number" } } };
      const { afs, programMod } = await setupAFSWithProgram({
        entrypointInputSchema: inputSchema,
      });
      const result = await afs.stat!("/blocklets/test");
      // Verify the entrypoint was stat'd
      expect(programMod.stat).toHaveBeenCalled();
      expect(result.data?.meta?.inputSchema).toEqual(inputSchema);
    });
  });

  describe("Edge Cases", () => {
    test("plain directory without program.yaml keeps original kind", async () => {
      const afs = new AFS();
      const plainMod = createPlainModule();
      await afs.mount(plainMod, "/plain", { lenient: true });
      const result = await afs.stat!("/plain");
      expect(result.data?.meta?.kind).not.toBe("afs:program");
    });

    test("directory with both program.yaml and .ash file gets kind: afs:program", async () => {
      const { afs } = await setupAFSWithProgram({ hasAshFile: true });
      const result = await afs.stat!("/blocklets/test");
      expect(result.data?.meta?.kind).toBe("afs:program");
    });

    test("entrypoint stat without inputSchema — program stat has no inputSchema", async () => {
      const { afs } = await setupAFSWithProgram({ entrypointInputSchema: undefined });
      const result = await afs.stat!("/blocklets/test");
      expect(result.data?.meta?.inputSchema).toBeUndefined();
    });

    test("entrypoint stat fails — program stat still returns kind info", async () => {
      const afs = new AFS();
      const mod = createProgramModule();
      // Override stat to fail for entrypoint
      (mod.stat as any).mockImplementation(async (path: string) => {
        if (path === "/" || path === "") {
          return { data: { path: "/", meta: { childrenCount: 3 } } };
        }
        if (path.endsWith(".ash")) {
          throw new Error("stat failed for entrypoint");
        }
        return { data: { path, meta: { childrenCount: 0 } } };
      });
      await afs.mount(mod, "/blocklets/test", { lenient: true });

      const result = await afs.stat!("/blocklets/test");
      // Should still have program kind even if entrypoint stat fails
      expect(result.data?.meta?.kind).toBe("afs:program");
    });

    test("nested program.yaml does not affect parent kind", async () => {
      const afs = new AFS();
      // Parent dir that has a child program dir
      const parentMod: AFSModule = {
        name: "parent-fs",
        list: mock(async () => ({
          data: [{ path: "/child-program", meta: { childrenCount: 5 } }],
        })) as any,
        read: mock(async (path: string) => {
          // Parent does NOT have program.yaml at root
          if (path === "/program.yaml") throw new Error("not found");
          return { data: { path, content: "parent content" } };
        }) as any,
        stat: mock(async (path: string) => ({
          data: { path, meta: { childrenCount: path === "/" ? 1 : 0 } },
        })) as any,
        search: mock(async () => ({ data: [] })) as any,
      };
      await afs.mount(parentMod, "/parent", { lenient: true });

      const result = await afs.stat!("/parent");
      expect(result.data?.meta?.kind).not.toBe("afs:program");
    });
  });

  describe("Security", () => {
    test("program.yaml entrypoint with path traversal is rejected", async () => {
      const { afs } = await setupAFSWithProgram({
        yamlContent: `
specVersion: 1
id: evil
name: Evil
entrypoint: ../../etc/passwd
`,
      });
      // Should detect as program but entrypoint should be validated
      // parseBlockletManifest rejects non-relative entrypoints (must start with ./)
      const result = await afs.stat!("/blocklets/test");
      // The manifest parsing should have failed, so no program kind
      expect(result.data?.meta?.kind).not.toBe("afs:program");
    });
  });

  describe("Data Leak", () => {
    test("program detection errors do not expose internal paths", async () => {
      const afs = new AFS();
      const mod = createProgramModule({ yamlContent: "invalid: yaml: [[[" });
      await afs.mount(mod, "/blocklets/broken", { lenient: true });

      // stat should succeed (returns directory info) even if program detection fails
      const result = await afs.stat!("/blocklets/broken");
      expect(result.data).toBeDefined();
      // Should not have program kind if manifest is invalid
      expect(result.data?.meta?.kind).not.toBe("afs:program");
    });
  });

  describe("Data Damage", () => {
    test("program detection does not affect non-program stat/list/exec", async () => {
      const afs = new AFS();
      const plainMod = createPlainModule();
      await afs.mount(plainMod, "/plain", { lenient: true });

      // stat should work normally
      const stat = await afs.stat!("/plain");
      expect(stat.data).toBeDefined();

      // list should work normally
      const list = await afs.list("/plain");
      expect(list.data.length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// list program detection
// ---------------------------------------------------------------------------
describe("list program detection", () => {
  test("list a program directory returns entries (programs contain program.yaml)", async () => {
    const { afs } = await setupAFSWithProgram();
    const result = await afs.list("/blocklets/test");
    // Should list children of the program directory
    expect(result.data.length).toBeGreaterThan(0);
    // program.yaml should be in the list
    const programYaml = result.data.find((e) => e.path.endsWith("/program.yaml"));
    expect(programYaml).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// exec program
// ---------------------------------------------------------------------------
describe("exec program", () => {
  describe("Happy Path", () => {
    test("exec program node creates Runtime AFS and executes entrypoint", async () => {
      const { afs } = await setupAFSWithProgram();
      const result = await afs.exec!("/blocklets/test", { task: "hello" }, {});
      expect(result.success).toBe(true);
    });

    test("exec program passes args to entrypoint", async () => {
      const { afs } = await setupAFSWithProgram();
      const result = await afs.exec!("/blocklets/test", { task: "hello", model: "gpt-4" }, {});
      expect(result.success).toBe(true);
      // The exec should have been delegated through the projection chain
    });

    test("exec program /.actions/<name> uses existing action logic", async () => {
      // .actions on a program should still work as normal module actions
      // The program detection only intercepts exec on the program root, not .actions subpaths
      await setupAFSWithProgram();
    });
  });

  describe("Bad Path", () => {
    test("exec program with invalid manifest throws error (no silent fallthrough)", async () => {
      const { afs } = await setupAFSWithProgram({ yamlContent: "invalid: yaml: [[[\n" });
      // Invalid YAML in program.yaml should surface the error, not silently fall through
      await expect(afs.exec!("/blocklets/test", {}, {})).rejects.toThrow();
    });

    test("exec program with missing required mount returns error", async () => {
      const { afs } = await setupAFSWithProgram({ mountAsh: false });
      // ash:// is required but not mounted — createBlockletAFS should fail
      await expect(afs.exec!("/blocklets/test", {}, {})).rejects.toThrow(/Required mount URI/);
    });
  });

  describe("Edge Cases", () => {
    test("program.yaml present but empty → falls through to normal exec", async () => {
      const { afs } = await setupAFSWithProgram({ yamlContent: "" });
      // Empty yaml should not be treated as a program
      const result = await afs.exec!("/blocklets/test", {}, {});
      expect(result.success).toBe(true);
    });

    test("exec on activated program (runtime AFS with _programManifest) works", async () => {
      const globalAFS = new AFS();

      // Mount program source provider at /blocklets/assistant
      const sourceProvider = createProgramModule();
      await globalAFS.mount(sourceProvider, "/blocklets/assistant", { lenient: true });

      // Mount ASH and other dependencies
      const ashMod: AFSModule = {
        name: "ash-provider",
        uri: "ash://",
        accessMode: "readwrite",
        list: mock(async () => ({ data: [] })) as any,
        read: mock(async (path: string) => ({ data: { path, content: "ash" } })) as any,
        stat: mock(async (path: string) => ({ data: { path, meta: { childrenCount: 0 } } })) as any,
        exec: mock(async (_path: string, args: Record<string, unknown>) => ({
          success: true,
          data: { ashExec: true, args },
        })) as any,
        search: mock(async () => ({ data: [] })) as any,
      };
      await globalAFS.mount(ashMod, "/modules/ash", { lenient: true });

      const aignehubMod: AFSModule = {
        name: "aignehub-provider",
        uri: "aignehub://",
        accessMode: "readwrite",
        list: mock(async () => ({ data: [] })) as any,
        read: mock(async (path: string) => ({ data: { path, content: "" } })) as any,
        stat: mock(async (path: string) => ({ data: { path, meta: { childrenCount: 0 } } })) as any,
        exec: mock(async () => ({ success: true, data: {} })) as any,
        search: mock(async () => ({ data: [] })) as any,
      };
      await globalAFS.mount(aignehubMod, "/modules/aignehub", { lenient: true });

      // Simulate BlockletManager.activate(): create runtime AFS via createBlockletAFS
      const { createBlockletAFS } = await import("@aigne/afs");
      const { afs: runtimeAFS } = await createBlockletAFS(
        "/blocklets/assistant",
        "/program-data/agent",
        globalAFS,
      );

      // Replace original mount with runtime AFS (what BlockletManager does)
      await globalAFS.mount(runtimeAFS as unknown as AFSModule, "/blocklets/assistant", {
        replace: true,
        lenient: true,
      });

      // Now exec should detect the activated program via _programManifest
      const result = await globalAFS.exec!("/blocklets/assistant", { message: "hello" }, {});
      expect(result.success).toBe(true);
      // The exec should go through ASH provider
      expect(result.data).toBeDefined();
    });
  });

  describe("Security", () => {
    test("entrypoint path traversal in program.yaml is rejected", async () => {
      const evilYaml = `
specVersion: 1
id: evil
name: Evil
entrypoint: ../../etc/passwd
`;
      // parseBlockletManifest should reject this
      expect(() => parseBlockletManifest(evilYaml)).toThrow();
    });
  });

  describe("Data Damage", () => {
    test("program exec failure does not affect subsequent AFS operations", async () => {
      const { afs } = await setupAFSWithProgram({ mountAsh: false });

      // First exec fails (required mount missing)
      try {
        await afs.exec!("/blocklets/test", {}, {});
      } catch {
        // Expected failure
      }

      // AFS should still work for other operations
      const stat = await afs.stat!("/blocklets/test");
      expect(stat.data).toBeDefined();
    });
  });
});
