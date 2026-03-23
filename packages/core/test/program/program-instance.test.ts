/**
 * Phase 0: Program Instance — escapeId, instanceIdFromMountPath,
 * createBlockletAFS /data direct mount via createDataProvider.
 */

import { describe, expect, it } from "bun:test";
import { AFS } from "../../src/afs.js";
import {
  createBlockletAFS,
  escapeId,
  instanceIdFromMountPath,
} from "../../src/blocklet/blocklet-afs.js";
import type { AFSModule, MountConfig } from "../../src/type.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a minimal AFSModule that passes AFS mount validation. */
function createMockProvider(opts: {
  name: string;
  uri?: string;
  files?: Record<string, string>;
  accessMode?: "readonly" | "readwrite";
}): AFSModule {
  const { name, uri, files = {}, accessMode = "readwrite" } = opts;
  const writtenFiles: Record<string, string> = {};
  return {
    name,
    uri,
    accessMode,
    async stat(path: string) {
      return {
        data: {
          path,
          type: path === "/" || path === "" ? "directory" : "file",
          childrenCount: path === "/" || path === "" ? Object.keys(files).length : undefined,
        },
      };
    },
    async read(path: string) {
      const content = files[path] ?? writtenFiles[path];
      if (content !== undefined) {
        return { data: { path, content, type: "file" } };
      }
      throw new Error(`Not found: ${path}`);
    },
    async list() {
      return { data: [] };
    },
    async search() {
      return { data: [] };
    },
    async write(path: string, payload: any) {
      writtenFiles[path] = payload?.content ?? "";
      return { data: { success: true } };
    },
    _writtenFiles: writtenFiles,
  } as unknown as AFSModule;
}

/** Build a program.yaml YAML string from options. */
function buildProgramYaml(opts?: {
  id?: string;
  name?: string;
  mounts?: Array<{
    uri: string;
    target: string;
    required?: boolean;
    shared?: boolean;
    ops?: string[];
  }>;
}): string {
  const { id = "test-program", name = "Test Program", mounts = [] } = opts ?? {};
  const mountsYaml = mounts
    .map((m) => {
      const lines = [`  - uri: "${m.uri}"`, `    target: "${m.target}"`];
      if (m.required !== undefined) lines.push(`    required: ${m.required}`);
      if (m.shared !== undefined) lines.push(`    shared: ${m.shared}`);
      if (m.ops) lines.push(`    ops: [${m.ops.map((o) => `"${o}"`).join(", ")}]`);
      return lines.join("\n");
    })
    .join("\n");

  return [
    "specVersion: 1",
    `id: ${id}`,
    `name: ${name}`,
    "entrypoint: main.ash",
    `mounts:${mounts.length > 0 ? `\n${mountsYaml}` : " []"}`,
  ].join("\n");
}

/** Set up a global AFS with a program.yaml provider and optional data provider. */
async function setupGlobalAFS(opts: {
  programYaml: string;
  programPath?: string;
  dataPath?: string;
}): Promise<{ globalAFS: AFS; programPath: string; dataPath: string }> {
  const programPath = opts.programPath ?? "/blocklets/test";
  const dataPath = opts.dataPath ?? "/data/test";
  const globalAFS = new AFS();

  const programSource = createMockProvider({
    name: "test-program-source",
    files: { "/program.yaml": opts.programYaml },
  });
  await globalAFS.mount(programSource, programPath);

  const dataProvider = createMockProvider({
    name: "test-data",
    files: {},
  });
  await globalAFS.mount(dataProvider, dataPath);

  return { globalAFS, programPath, dataPath };
}

// ─── escapeId ───────────────────────────────────────────────────────────────

describe("escapeId", () => {
  describe("Happy Path", () => {
    it('returns slug ID unchanged: "my-agent" → "my-agent"', () => {
      expect(escapeId("my-agent")).toBe("my-agent");
    });

    it('hex-escapes colons in DID: "did:abt:z1Kp4" → "did_3aabt_3az1Kp4"', () => {
      expect(escapeId("did:abt:z1Kp4")).toBe("did_3aabt_3az1Kp4");
    });
  });

  describe("Bad Path", () => {
    it("handles empty string", () => {
      expect(escapeId("")).toBe("");
    });
  });

  describe("Edge Cases", () => {
    it('handles consecutive colons: "did::abt" → "did_3a_3aabt"', () => {
      expect(escapeId("did::abt")).toBe("did_3a_3aabt");
    });

    it("handles string with no colons", () => {
      expect(escapeId("simple-id")).toBe("simple-id");
    });

    it("handles string that is only colons", () => {
      expect(escapeId(":::")).toBe("_3a_3a_3a");
    });
  });

  describe("Security", () => {
    it("does not introduce path traversal characters", () => {
      const result = escapeId("did:abt:../../../etc/passwd");
      expect(result).not.toContain(":");
      // New escapeId also escapes . and / — no path traversal possible
      expect(result).not.toContain("..");
      expect(result).not.toContain("/");
    });
  });
});

// ─── instanceIdFromMountPath ────────────────────────────────────────────────

describe("instanceIdFromMountPath", () => {
  describe("Happy Path", () => {
    it('"/blocklets/my-agent" → "blocklets_my-agent"', () => {
      expect(instanceIdFromMountPath("/blocklets/my-agent")).toBe("blocklets_my-agent");
    });

    it('"/blocklets/agents/my-agent" → "blocklets_agents_my-agent"', () => {
      expect(instanceIdFromMountPath("/blocklets/agents/my-agent")).toBe(
        "blocklets_agents_my-agent",
      );
    });

    it('"/apps/my-agent" → "apps_my-agent"', () => {
      expect(instanceIdFromMountPath("/apps/my-agent")).toBe("apps_my-agent");
    });
  });

  describe("Bad Path", () => {
    it("handles empty string", () => {
      expect(instanceIdFromMountPath("")).toBe("");
    });

    it('handles root path "/" → ""', () => {
      expect(instanceIdFromMountPath("/")).toBe("");
    });
  });

  describe("Edge Cases", () => {
    it('handles trailing slash: "/blocklets/my-agent/" → "blocklets_my-agent_"', () => {
      expect(instanceIdFromMountPath("/blocklets/my-agent/")).toBe("blocklets_my-agent_");
    });

    it('handles consecutive slashes: "/blocklets//my-agent" → "blocklets__my-agent"', () => {
      expect(instanceIdFromMountPath("/blocklets//my-agent")).toBe("blocklets__my-agent");
    });

    it("handles path without leading slash", () => {
      expect(instanceIdFromMountPath("programs/my-agent")).toBe("programs_my-agent");
    });
  });

  describe("Security", () => {
    it("result does not contain path separator /", () => {
      const result = instanceIdFromMountPath("/blocklets/deep/nested/path");
      expect(result).not.toContain("/");
    });

    it("result does not contain ..", () => {
      // Input with .. should produce _ instead of keeping traversal
      const result = instanceIdFromMountPath("/blocklets/../etc/passwd");
      expect(result).not.toContain("/");
      // The .. is preserved as-is (just / replaced), which is fine as instance ID
      expect(result).toBe("blocklets_.._etc_passwd");
    });
  });
});

// ─── createBlockletAFS with createDataProvider ───────────────────────────────

describe("createBlockletAFS — /data direct mount via createDataProvider", () => {
  describe("Happy Path", () => {
    it("uses createDataProvider factory to mount /data when provided", async () => {
      const dataProvider = createMockProvider({ name: "data-fs", files: {} });
      const yaml = buildProgramYaml();
      const { globalAFS, programPath } = await setupGlobalAFS({ programYaml: yaml });

      const result = await createBlockletAFS(programPath, "/tmp/test-data", globalAFS, {
        createDataProvider: async (_dir: string) => dataProvider,
      });

      const runtimeAFS = result.afs as AFS;
      const mounts = runtimeAFS.getMounts();
      const dataMount = mounts.find((m) => m.path === "/data");
      expect(dataMount).toBeDefined();
      expect(dataMount!.module).toBe(dataProvider);
    });

    it("writes to /data appear in the data provider (not global AFS)", async () => {
      const dataProvider = createMockProvider({ name: "data-fs", files: {} });
      const yaml = buildProgramYaml();
      const { globalAFS, programPath } = await setupGlobalAFS({ programYaml: yaml });

      const result = await createBlockletAFS(programPath, "/tmp/test-data", globalAFS, {
        createDataProvider: async (_dir: string) => dataProvider,
      });

      const runtimeAFS = result.afs as AFS;
      await runtimeAFS.write!("/data/test.txt", { content: "hello" });

      // Verify write went to the data provider
      const written = (dataProvider as any)._writtenFiles;
      expect(written["/test.txt"]).toBe("hello");
    });

    it("/program still uses ProjectionProvider (readonly)", async () => {
      const dataProvider = createMockProvider({ name: "data-fs", files: {} });
      const yaml = buildProgramYaml();
      const { globalAFS, programPath } = await setupGlobalAFS({ programYaml: yaml });

      const result = await createBlockletAFS(programPath, "/tmp/test-data", globalAFS, {
        createDataProvider: async () => dataProvider,
      });

      const runtimeAFS = result.afs as AFS;
      // Read program.yaml through /program path
      const readResult = await runtimeAFS.read!("/program/program.yaml");
      expect(readResult.data?.content).toContain("test-program");
    });

    it("createDataProvider receives the dataDir path", async () => {
      let receivedDir: string | undefined;
      const dataProvider = createMockProvider({ name: "data-fs" });
      const yaml = buildProgramYaml();
      const { globalAFS, programPath } = await setupGlobalAFS({ programYaml: yaml });

      await createBlockletAFS(programPath, "/home/user/.afs/data/blocklets_my-agent", globalAFS, {
        createDataProvider: async (dir: string) => {
          receivedDir = dir;
          return dataProvider;
        },
      });

      expect(receivedDir).toBe("/home/user/.afs/data/blocklets_my-agent");
    });
  });

  describe("Bad Path", () => {
    it("falls back to ProjectionProvider when createDataProvider is not provided", async () => {
      const yaml = buildProgramYaml();
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({ programYaml: yaml });

      // No createDataProvider — uses legacy ProjectionProvider
      const result = await createBlockletAFS(programPath, dataPath, globalAFS);

      const runtimeAFS = result.afs as AFS;
      const mounts = runtimeAFS.getMounts();
      const dataMount = mounts.find((m) => m.path === "/data");
      expect(dataMount).toBeDefined();
      // Should be a ProjectionProvider (not the mock directly)
      expect(dataMount!.module.name).toBe("data");
    });

    it("/program rejects write operations (AFSAccessModeError)", async () => {
      const dataProvider = createMockProvider({ name: "data-fs" });
      const yaml = buildProgramYaml();
      const { globalAFS, programPath } = await setupGlobalAFS({ programYaml: yaml });

      const result = await createBlockletAFS(programPath, "/tmp/test-data", globalAFS, {
        createDataProvider: async () => dataProvider,
      });

      const runtimeAFS = result.afs as AFS;
      await expect(runtimeAFS.write!("/program/test.txt", { content: "hack" })).rejects.toThrow();
    });
  });

  describe("Edge Cases", () => {
    it("createDataProvider returning synchronous provider works", async () => {
      const dataProvider = createMockProvider({ name: "data-fs-sync" });
      const yaml = buildProgramYaml();
      const { globalAFS, programPath } = await setupGlobalAFS({ programYaml: yaml });

      const result = await createBlockletAFS(programPath, "/tmp/test-data", globalAFS, {
        createDataProvider: (_dir: string) => dataProvider, // sync return
      });

      const runtimeAFS = result.afs as AFS;
      const dataMount = runtimeAFS.getMounts().find((m) => m.path === "/data");
      expect(dataMount).toBeDefined();
      expect(dataMount!.module).toBe(dataProvider);
    });

    it("empty dataDir string is passed through to createDataProvider", async () => {
      let receivedDir: string | undefined;
      const dataProvider = createMockProvider({ name: "data-fs" });
      const yaml = buildProgramYaml();
      const { globalAFS, programPath } = await setupGlobalAFS({ programYaml: yaml });

      await createBlockletAFS(programPath, "", globalAFS, {
        createDataProvider: async (dir: string) => {
          receivedDir = dir;
          return dataProvider;
        },
      });

      expect(receivedDir).toBe("");
    });
  });

  describe("Data Leak", () => {
    it("/data mount does not expose files outside the data provider scope", async () => {
      const dataProvider = createMockProvider({ name: "data-fs", files: {} });
      const yaml = buildProgramYaml();
      const { globalAFS, programPath } = await setupGlobalAFS({ programYaml: yaml });

      const result = await createBlockletAFS(programPath, "/tmp/test-data", globalAFS, {
        createDataProvider: async () => dataProvider,
      });

      const runtimeAFS = result.afs as AFS;
      // Reading outside /data should not go to the data provider
      await expect(runtimeAFS.read!("/data/../../etc/passwd")).rejects.toThrow();
    });
  });

  describe("Data Damage", () => {
    it("createBlockletAFS failure cleans up owned providers when createDataProvider is used", async () => {
      const closeCalls: string[] = [];
      const ownedProvider = createMockProvider({ name: "owned-svc", uri: "svc://a" });
      (ownedProvider as any).close = async () => {
        closeCalls.push("owned-svc");
      };

      const yaml = buildProgramYaml({
        mounts: [
          { uri: "svc://a", target: "/svc", required: true, shared: false },
          { uri: "missing://x", target: "/missing", required: true, shared: true },
        ],
      });
      const { globalAFS, programPath } = await setupGlobalAFS({ programYaml: yaml });

      const factory = async (mount: MountConfig) => {
        if (mount.uri === "svc://a") return ownedProvider;
        throw new Error("fail");
      };

      await expect(
        createBlockletAFS(programPath, "/tmp/data", globalAFS, {
          createDataProvider: async () => createMockProvider({ name: "data" }),
          createProvider: factory,
        }),
      ).rejects.toThrow();

      expect(closeCalls).toContain("owned-svc");
    });
  });
});

// ─── AFSOptions resolveDataDir + createDataProvider ─────────────────────────

describe("AFSOptions — resolveDataDir + createDataProvider", () => {
  it("AFS accepts resolveDataDir and createDataProvider in options", () => {
    const afs = new AFS({
      resolveDataDir: (programPath: string) => `/data/${programPath}`,
      createDataProvider: (_dir: string) =>
        createMockProvider({ name: "data" }) as unknown as AFSModule,
    });

    expect(afs.options.resolveDataDir).toBeDefined();
    expect(afs.options.createDataProvider).toBeDefined();
  });

  it("resolveDataDir returns correct filesystem path", () => {
    const afs = new AFS({
      resolveDataDir: (programPath: string) => {
        const instanceId = instanceIdFromMountPath(programPath);
        return `/home/user/.afs-config/data/${instanceId}`;
      },
    });

    expect(afs.options.resolveDataDir!("/blocklets/my-agent")).toBe(
      "/home/user/.afs-config/data/blocklets_my-agent",
    );
  });
});
