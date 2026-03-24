/**
 * Phase 1: createBlockletAFS — owned mount support tests.
 *
 * Tests the extension of createBlockletAFS() to handle `shared: false` mounts
 * via ProviderRegistry, returning ownedProviders for lifecycle management.
 */

import { describe, expect, it } from "bun:test";
import { AFS } from "../../src/afs.js";
import { createBlockletAFS } from "../../src/blocklet/blocklet-afs.js";
import type { AFSModule, MountConfig } from "../../src/type.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a minimal AFSModule that passes AFS mount validation. */
function createMockProvider(opts: {
  name: string;
  uri?: string;
  files?: Record<string, string>;
}): AFSModule {
  const { name, uri, files = {} } = opts;
  return {
    name,
    uri,
    accessMode: "readwrite" as const,
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
      const content = files[path];
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
    async write() {
      return { data: { success: true } };
    },
  } as unknown as AFSModule;
}

/** Build a program.yaml YAML string from options. */
function buildProgramYaml(opts: {
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
  const { id = "test-program", name = "Test Program", mounts = [] } = opts;
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

/** Set up a global AFS with a program.yaml provider and optional dependency providers. */
async function setupGlobalAFS(opts: {
  programYaml: string;
  programPath?: string;
  dataPath?: string;
  dependencyProviders?: Array<{ path: string; uri: string }>;
}): Promise<{ globalAFS: AFS; programPath: string; dataPath: string }> {
  const programPath = opts.programPath ?? "/blocklets/test";
  const dataPath = opts.dataPath ?? "/data/test";
  const globalAFS = new AFS();

  // Mount program source provider
  const programSource = createMockProvider({
    name: "test-program-source",
    files: { "/program.yaml": opts.programYaml },
  });
  await globalAFS.mount(programSource, programPath);

  // Mount data provider
  const dataProvider = createMockProvider({
    name: "test-data",
    files: {},
  });
  await globalAFS.mount(dataProvider, dataPath);

  // Mount dependency providers (for shared mount lookup)
  for (const dep of opts.dependencyProviders ?? []) {
    const provider = createMockProvider({
      name: dep.path.slice(1).replace(/\//g, "-"),
      uri: dep.uri,
    });
    await globalAFS.mount(provider, dep.path);
  }

  return { globalAFS, programPath, dataPath };
}

/** Create a mock createProvider factory. */
function createMockFactory(config?: {
  providers?: Map<string, () => AFSModule>;
  failForUri?: Set<string>;
}): ((mount: MountConfig) => Promise<AFSModule>) & { calls: MountConfig[] } {
  const calls: MountConfig[] = [];
  const factory = async (mount: MountConfig) => {
    calls.push(mount);
    if (config?.failForUri?.has(mount.uri)) {
      throw new Error(`Failed to create provider for URI: ${mount.uri}`);
    }
    const userFactory = config?.providers?.get(mount.uri);
    if (userFactory) return userFactory();
    // Default: create a simple provider
    return createMockProvider({
      name: `owned-${mount.path.slice(1)}`,
      uri: mount.uri,
    });
  };
  factory.calls = calls;
  return factory as ((mount: MountConfig) => Promise<AFSModule>) & { calls: MountConfig[] };
}

// ─── Happy Path ─────────────────────────────────────────────────────────────

describe("createBlockletAFS — owned mount support", () => {
  describe("Happy Path", () => {
    it("shared: false mount uses registry.createProvider() to create independent instance", async () => {
      const yaml = buildProgramYaml({
        mounts: [{ uri: "telegram://my-bot", target: "/telegram", required: true, shared: false }],
      });
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({
        programYaml: yaml,
      });
      const factory = createMockFactory();

      await createBlockletAFS(programPath, dataPath, globalAFS, {
        createProvider: factory,
      });

      // Registry should have been called with the correct mount config
      expect(factory.calls).toHaveLength(1);
      expect(factory.calls[0]!.uri).toBe("telegram://my-bot");
      expect(factory.calls[0]!.path).toBe("/telegram");
    });

    it("owned provider is directly mounted to Runtime AFS (not ProjectionProvider)", async () => {
      const ownedProvider = createMockProvider({
        name: "owned-telegram",
        uri: "telegram://my-bot",
      });
      const yaml = buildProgramYaml({
        mounts: [{ uri: "telegram://my-bot", target: "/telegram", required: true, shared: false }],
      });
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({
        programYaml: yaml,
      });
      const factory = createMockFactory({
        providers: new Map([["telegram://my-bot", () => ownedProvider]]),
      });

      const result = await createBlockletAFS(programPath, dataPath, globalAFS, {
        createProvider: factory,
      });
      const runtimeAFS = result.afs as AFS;
      const mounts = runtimeAFS.getMounts();

      // Find the /telegram mount
      const telegramMount = mounts.find((m) => m.path === "/telegram");
      expect(telegramMount).toBeDefined();
      // Should be the owned provider directly, not a ProjectionProvider
      expect(telegramMount!.module).toBe(ownedProvider);
    });

    it("return value includes ownedProviders array with created provider", async () => {
      const ownedProvider = createMockProvider({
        name: "owned-telegram",
        uri: "telegram://my-bot",
      });
      const yaml = buildProgramYaml({
        mounts: [{ uri: "telegram://my-bot", target: "/telegram", required: true, shared: false }],
      });
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({
        programYaml: yaml,
      });
      const factory = createMockFactory({
        providers: new Map([["telegram://my-bot", () => ownedProvider]]),
      });

      const result = await createBlockletAFS(programPath, dataPath, globalAFS, {
        createProvider: factory,
      });

      expect(result.ownedProviders).toBeInstanceOf(Array);
      expect(result.ownedProviders).toHaveLength(1);
      expect(result.ownedProviders[0]).toBe(ownedProvider);
    });

    it("mixed shared/owned mounts both correctly mounted", async () => {
      const ownedProvider = createMockProvider({ name: "owned-storage", uri: "fs:///data" });
      const yaml = buildProgramYaml({
        mounts: [
          { uri: "telegram://my-bot", target: "/telegram", required: true, shared: true },
          { uri: "fs:///data", target: "/storage", required: true, shared: false },
        ],
      });
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({
        programYaml: yaml,
        dependencyProviders: [{ path: "/modules/telegram", uri: "telegram://my-bot" }],
      });
      const factory = createMockFactory({
        providers: new Map([["fs:///data", () => ownedProvider]]),
      });

      const result = await createBlockletAFS(programPath, dataPath, globalAFS, {
        createProvider: factory,
      });
      const runtimeAFS = result.afs as AFS;
      const mounts = runtimeAFS.getMounts();

      // Shared mount via ProjectionProvider
      const telegramMount = mounts.find((m) => m.path === "/telegram");
      expect(telegramMount).toBeDefined();
      expect(telegramMount!.module).not.toBe(ownedProvider);

      // Owned mount is the direct provider
      const storageMount = mounts.find((m) => m.path === "/storage");
      expect(storageMount).toBeDefined();
      expect(storageMount!.module).toBe(ownedProvider);

      // ownedProviders only contains the owned one
      expect(result.ownedProviders).toHaveLength(1);
      expect(result.ownedProviders[0]).toBe(ownedProvider);
    });

    it("omitting options (no registry) behaves same as before — only shared mounts", async () => {
      const yaml = buildProgramYaml({
        mounts: [{ uri: "telegram://my-bot", target: "/telegram", required: true }],
      });
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({
        programYaml: yaml,
        dependencyProviders: [{ path: "/modules/telegram", uri: "telegram://my-bot" }],
      });

      // No registry passed — original behavior
      const result = await createBlockletAFS(programPath, dataPath, globalAFS);

      expect(result.ownedProviders).toBeInstanceOf(Array);
      expect(result.ownedProviders).toHaveLength(0);
      expect(result.manifest.id).toBe("test-program");

      // Shared mount should still work
      const runtimeAFS = result.afs as AFS;
      const mounts = runtimeAFS.getMounts();
      expect(mounts.find((m) => m.path === "/telegram")).toBeDefined();
    });
  });

  // ─── Bad Path ───────────────────────────────────────────────────────────────

  describe("Bad Path", () => {
    it("shared: false with no registry → required mount throws error", async () => {
      const yaml = buildProgramYaml({
        mounts: [{ uri: "telegram://my-bot", target: "/telegram", required: true, shared: false }],
      });
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({
        programYaml: yaml,
      });

      // No registry provided
      await expect(createBlockletAFS(programPath, dataPath, globalAFS)).rejects.toThrow(/factory/i);
    });

    it("shared: false with no registry → optional mount skips silently", async () => {
      const yaml = buildProgramYaml({
        mounts: [{ uri: "telegram://my-bot", target: "/telegram", required: false, shared: false }],
      });
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({
        programYaml: yaml,
      });

      // No registry provided — optional mount should be skipped
      const result = await createBlockletAFS(programPath, dataPath, globalAFS);
      expect(result.ownedProviders).toHaveLength(0);
      const runtimeAFS = result.afs as AFS;
      const mounts = runtimeAFS.getMounts();
      expect(mounts.find((m) => m.path === "/telegram")).toBeUndefined();
    });

    it("registry.createProvider() failure → required mount throws error", async () => {
      const yaml = buildProgramYaml({
        mounts: [{ uri: "telegram://my-bot", target: "/telegram", required: true, shared: false }],
      });
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({
        programYaml: yaml,
      });
      const factory = createMockFactory({
        failForUri: new Set(["telegram://my-bot"]),
      });

      await expect(
        createBlockletAFS(programPath, dataPath, globalAFS, { createProvider: factory }),
      ).rejects.toThrow();
    });

    it("registry.createProvider() failure → optional mount skips silently", async () => {
      const yaml = buildProgramYaml({
        mounts: [{ uri: "telegram://my-bot", target: "/telegram", required: false, shared: false }],
      });
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({
        programYaml: yaml,
      });
      const factory = createMockFactory({
        failForUri: new Set(["telegram://my-bot"]),
      });

      const result = await createBlockletAFS(programPath, dataPath, globalAFS, {
        createProvider: factory,
      });
      expect(result.ownedProviders).toHaveLength(0);
    });

    it("owned mount URI error message is descriptive", async () => {
      const yaml = buildProgramYaml({
        mounts: [{ uri: "unknown://foo", target: "/foo", required: true, shared: false }],
      });
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({
        programYaml: yaml,
      });
      const factory = createMockFactory({
        failForUri: new Set(["unknown://foo"]),
      });

      try {
        await createBlockletAFS(programPath, dataPath, globalAFS, { createProvider: factory });
        expect(true).toBe(false); // Should not reach here
      } catch (err: any) {
        expect(err.message).toContain("unknown://foo");
      }
    });
  });

  // ─── Edge Cases ─────────────────────────────────────────────────────────────

  describe("Edge Cases", () => {
    it("all mounts shared: false → all created via registry", async () => {
      const yaml = buildProgramYaml({
        mounts: [
          { uri: "telegram://my-bot", target: "/telegram", required: true, shared: false },
          { uri: "fs:///data", target: "/storage", required: true, shared: false },
        ],
      });
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({
        programYaml: yaml,
      });
      const factory = createMockFactory();

      const result = await createBlockletAFS(programPath, dataPath, globalAFS, {
        createProvider: factory,
      });

      expect(factory.calls).toHaveLength(2);
      expect(result.ownedProviders).toHaveLength(2);
    });

    it("same URI with shared and owned mounts coexist (different targets)", async () => {
      const yaml = buildProgramYaml({
        mounts: [
          { uri: "telegram://my-bot", target: "/telegram-shared", required: true, shared: true },
          { uri: "telegram://my-bot", target: "/telegram-owned", required: true, shared: false },
        ],
      });
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({
        programYaml: yaml,
        dependencyProviders: [{ path: "/modules/telegram", uri: "telegram://my-bot" }],
      });
      const factory = createMockFactory();

      const result = await createBlockletAFS(programPath, dataPath, globalAFS, {
        createProvider: factory,
      });
      const runtimeAFS = result.afs as AFS;
      const mounts = runtimeAFS.getMounts();

      // Both should be mounted
      expect(mounts.find((m) => m.path === "/telegram-shared")).toBeDefined();
      expect(mounts.find((m) => m.path === "/telegram-owned")).toBeDefined();
      // Only the owned one in ownedProviders
      expect(result.ownedProviders).toHaveLength(1);
    });

    it("ownedProviders is empty array when no owned mounts", async () => {
      const yaml = buildProgramYaml({
        mounts: [{ uri: "telegram://my-bot", target: "/telegram", required: true }],
      });
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({
        programYaml: yaml,
        dependencyProviders: [{ path: "/modules/telegram", uri: "telegram://my-bot" }],
      });

      const result = await createBlockletAFS(programPath, dataPath, globalAFS);

      expect(result.ownedProviders).toBeInstanceOf(Array);
      expect(result.ownedProviders).toHaveLength(0);
    });
  });

  // ─── Security ─────────────────────────────────────────────────────────────

  describe("Security", () => {
    it("owned provider creation bypasses global AFS lookup (isolation)", async () => {
      const yaml = buildProgramYaml({
        mounts: [{ uri: "telegram://my-bot", target: "/telegram", required: true, shared: false }],
      });
      // Intentionally mount a provider in globalAFS with matching URI
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({
        programYaml: yaml,
        dependencyProviders: [{ path: "/modules/telegram", uri: "telegram://my-bot" }],
      });
      const ownedProvider = createMockProvider({
        name: "owned-telegram",
        uri: "telegram://my-bot",
      });
      const factory = createMockFactory({
        providers: new Map([["telegram://my-bot", () => ownedProvider]]),
      });

      const result = await createBlockletAFS(programPath, dataPath, globalAFS, {
        createProvider: factory,
      });
      const runtimeAFS = result.afs as AFS;
      const telegramMount = runtimeAFS.getMounts().find((m) => m.path === "/telegram");

      // Should use the owned provider from registry, NOT the global one
      expect(telegramMount!.module).toBe(ownedProvider);
      expect(result.ownedProviders[0]).toBe(ownedProvider);
    });

    it("owned provider EventBus is bound to Runtime AFS, not global", async () => {
      const yaml = buildProgramYaml({
        mounts: [{ uri: "telegram://my-bot", target: "/telegram", required: true, shared: false }],
      });
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({
        programYaml: yaml,
      });
      const factory = createMockFactory();

      const result = await createBlockletAFS(programPath, dataPath, globalAFS, {
        createProvider: factory,
      });
      const runtimeAFS = result.afs as AFS;

      // Verify the owned provider is mounted on runtimeAFS, not globalAFS
      const runtimeMounts = runtimeAFS.getMounts();
      const globalMounts = globalAFS.getMounts();

      expect(runtimeMounts.find((m) => m.path === "/telegram")).toBeDefined();
      // Global AFS should NOT have a /telegram mount
      expect(globalMounts.find((m) => m.path === "/telegram")).toBeUndefined();
    });
  });

  // ─── Data Leak ──────────────────────────────────────────────────────────────

  describe("Data Leak", () => {
    it("registry.createProvider() failure error does not contain credentials", async () => {
      const yaml = buildProgramYaml({
        mounts: [
          {
            uri: "telegram://my-bot?token=secret123&apiKey=sk-abcdef",
            target: "/telegram",
            required: true,
            shared: false,
          },
        ],
      });
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({
        programYaml: yaml,
      });
      const factory = async () => {
        throw new Error("Connection refused");
      };

      try {
        await createBlockletAFS(programPath, dataPath, globalAFS, {
          createProvider: factory as any,
        });
        expect(true).toBe(false);
      } catch (err: any) {
        // Error should not contain credentials from the URI
        expect(err.message).not.toContain("secret123");
        expect(err.message).not.toContain("sk-abcdef");
      }
    });
  });

  // ─── Data Damage ────────────────────────────────────────────────────────────

  describe("Data Damage", () => {
    it("owned provider creation failure cleans up already-created providers", async () => {
      const closeCalls: string[] = [];
      const provider1 = createMockProvider({ name: "owned-telegram", uri: "telegram://my-bot" });
      (provider1 as any).close = async () => {
        closeCalls.push("telegram");
      };

      const yaml = buildProgramYaml({
        mounts: [
          { uri: "telegram://my-bot", target: "/telegram", required: true, shared: false },
          { uri: "fs:///fail", target: "/storage", required: true, shared: false },
        ],
      });
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({
        programYaml: yaml,
      });
      const factory = createMockFactory({
        providers: new Map([["telegram://my-bot", () => provider1]]),
        failForUri: new Set(["fs:///fail"]),
      });

      await expect(
        createBlockletAFS(programPath, dataPath, globalAFS, { createProvider: factory }),
      ).rejects.toThrow();

      // First provider should have been cleaned up
      expect(closeCalls).toContain("telegram");
    });

    it("createBlockletAFS failure after owned providers created destroys all", async () => {
      const closeCalls: string[] = [];
      const makeTrackedProvider = (name: string, uri: string) => {
        const p = createMockProvider({ name, uri });
        (p as any).close = async () => {
          closeCalls.push(name);
        };
        return p;
      };

      const provider1 = makeTrackedProvider("owned-a", "svc-a://host");
      const provider2 = makeTrackedProvider("owned-b", "svc-b://host");

      // Create a manifest with two owned mounts and one required shared mount that will fail
      const yaml = buildProgramYaml({
        mounts: [
          { uri: "svc-a://host", target: "/svc-a", required: true, shared: false },
          { uri: "svc-b://host", target: "/svc-b", required: true, shared: false },
          // This shared mount is required but not available in global AFS → will fail
          { uri: "missing://provider", target: "/missing", required: true, shared: true },
        ],
      });
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({
        programYaml: yaml,
      });
      const factory = createMockFactory({
        providers: new Map([
          ["svc-a://host", () => provider1],
          ["svc-b://host", () => provider2],
        ]),
        // Registry fallback must also fail for missing://provider to test cleanup
        failForUri: new Set(["missing://provider"]),
      });

      await expect(
        createBlockletAFS(programPath, dataPath, globalAFS, { createProvider: factory }),
      ).rejects.toThrow();

      // Both owned providers should be cleaned up
      expect(closeCalls).toContain("owned-a");
      expect(closeCalls).toContain("owned-b");
    });
  });

  // ─── Mount Overrides ─────────────────────────────────────────────────────

  describe("Mount Overrides (mounts.toml)", () => {
    it("override replaces placeholder URI for owned mount", async () => {
      const yaml = buildProgramYaml({
        mounts: [{ uri: "telegram://", target: "/telegram", required: true, shared: false }],
      });
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({
        programYaml: yaml,
      });
      const factory = createMockFactory();

      await createBlockletAFS(programPath, dataPath, globalAFS, {
        createProvider: factory,
        mountOverrides: [{ target: "/telegram", uri: "telegram://my-bot" }],
      });

      expect(factory.calls).toHaveLength(1);
      expect(factory.calls[0]!.uri).toBe("telegram://my-bot");
    });

    it("no override falls back to program.yaml URI", async () => {
      const yaml = buildProgramYaml({
        mounts: [{ uri: "telegram://default", target: "/telegram", required: true, shared: false }],
      });
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({
        programYaml: yaml,
      });
      const factory = createMockFactory();

      await createBlockletAFS(programPath, dataPath, globalAFS, {
        createProvider: factory,
        mountOverrides: [], // empty overrides
      });

      expect(factory.calls).toHaveLength(1);
      expect(factory.calls[0]!.uri).toBe("telegram://default");
    });

    it("override preserves required/shared/ops from program.yaml", async () => {
      const yaml = buildProgramYaml({
        mounts: [
          {
            uri: "telegram://",
            target: "/telegram",
            required: true,
            shared: false,
            ops: ["read", "list"],
          },
        ],
      });
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({
        programYaml: yaml,
      });
      const factory = createMockFactory();

      // Override only changes URI, not required/shared/ops
      const result = await createBlockletAFS(programPath, dataPath, globalAFS, {
        createProvider: factory,
        mountOverrides: [{ target: "/telegram", uri: "telegram://my-bot" }],
      });

      // Mount was created (required=true was honored)
      expect(factory.calls).toHaveLength(1);
      expect(result.ownedProviders).toHaveLength(1);
      // URI was overridden
      expect(factory.calls[0]!.uri).toBe("telegram://my-bot");
    });

    it("override options are merged into mount config", async () => {
      const yaml = buildProgramYaml({
        mounts: [{ uri: "telegram://my-bot", target: "/telegram", required: true, shared: false }],
      });
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({
        programYaml: yaml,
      });
      const factory = createMockFactory();

      await createBlockletAFS(programPath, dataPath, globalAFS, {
        createProvider: factory,
        mountOverrides: [
          {
            target: "/telegram",
            uri: "telegram://my-bot",
            options: { webhookUrl: "https://example.com/hook" },
          },
        ],
      });

      expect(factory.calls).toHaveLength(1);
      expect(factory.calls[0]!.options).toEqual({ webhookUrl: "https://example.com/hook" });
    });

    it("extra overrides not declared in blocklet.yaml are restored as dynamic mounts", async () => {
      const yaml = buildProgramYaml({
        mounts: [{ uri: "telegram://my-bot", target: "/telegram", required: true, shared: false }],
      });
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({
        programYaml: yaml,
      });
      const factory = createMockFactory();

      await createBlockletAFS(programPath, dataPath, globalAFS, {
        createProvider: factory,
        mountOverrides: [
          { target: "/telegram", uri: "telegram://my-bot" },
          { target: "/nonexistent", uri: "slack://workspace" }, // not in blocklet.yaml — restored as dynamic mount
        ],
      });

      // Both telegram (declared) and slack (dynamic restore from mounts.toml) are created
      expect(factory.calls).toHaveLength(2);
      expect(factory.calls[0]!.uri).toBe("telegram://my-bot");
      expect(factory.calls[1]!.uri).toBe("slack://workspace");
    });

    it("override applies to shared mount URI lookup", async () => {
      const yaml = buildProgramYaml({
        mounts: [{ uri: "telegram://", target: "/telegram", required: true, shared: true }],
      });
      // Mount a provider with the overridden URI, not the placeholder
      const { globalAFS, programPath, dataPath } = await setupGlobalAFS({
        programYaml: yaml,
        dependencyProviders: [{ path: "/modules/telegram", uri: "telegram://my-bot" }],
      });

      const result = await createBlockletAFS(programPath, dataPath, globalAFS, {
        mountOverrides: [{ target: "/telegram", uri: "telegram://my-bot" }],
      });

      // Should find the shared provider using the overridden URI
      const runtimeAFS = result.afs as AFS;
      const mounts = runtimeAFS.getMounts();
      expect(mounts.find((m) => m.path === "/telegram")).toBeDefined();
    });
  });
});
