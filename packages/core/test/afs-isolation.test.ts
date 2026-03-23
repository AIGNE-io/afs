/**
 * AFS Isolation Integration Tests
 *
 * Tests that IsolationConfig is properly wired into AFS mount/exec/onMount.
 */
import { describe, expect, test } from "bun:test";
import { AFS } from "../src/afs.js";
import type { CapabilityEvent } from "../src/capability-enforcer.js";
import type {
  AFSExecOptions,
  AFSListResult,
  AFSModule,
  AFSReadResult,
  AFSRoot,
  AFSStatResult,
  IsolationConfig,
  ProviderCapabilityManifest,
} from "../src/type.js";

// =============================================================================
// Mock provider that tracks onMount injection and exec context
// =============================================================================

interface MockProviderOptions {
  name: string;
  capabilities?: ProviderCapabilityManifest;
}

function createMockProvider(options: MockProviderOptions) {
  let mountedRoot: AFSRoot | null = null;
  let execContextAfs: AFSRoot | null = null;

  const provider: AFSModule & {
    getMountedRoot: () => AFSRoot | null;
    getExecContextAfs: () => AFSRoot | null;
  } = {
    name: options.name,
    description: `Mock provider ${options.name}`,
    accessMode: "readwrite",

    onMount(root: AFSRoot) {
      mountedRoot = root;
    },

    async stat(path: string): Promise<AFSStatResult> {
      return {
        data: {
          id: options.name,
          path,
          meta: { childrenCount: 0 },
        },
      };
    },

    async read(path: string): Promise<AFSReadResult> {
      return {
        data: {
          id: options.name,
          path,
          content: `content of ${path}`,
          meta: { childrenCount: 0 },
        },
      };
    },

    async list(_path: string): Promise<AFSListResult> {
      return { data: [] };
    },

    async exec(path: string, _args: Record<string, unknown>, execOptions?: AFSExecOptions) {
      execContextAfs = execOptions?.context?.afs ?? null;
      return { success: true, data: { executed: path } };
    },

    getMountedRoot: () => mountedRoot,
    getExecContextAfs: () => execContextAfs,
  };

  // Attach static manifest to the constructor for capability resolution
  const providerWithManifest = Object.create(provider);
  Object.defineProperty(providerWithManifest, "constructor", {
    value: {
      manifest: () => ({
        uriTemplate: `mock://${options.name}`,
        capabilities: options.capabilities,
      }),
    },
    configurable: true,
  });

  // Copy all properties
  for (const key of Object.keys(provider)) {
    if (key !== "constructor") {
      providerWithManifest[key] = (provider as any)[key];
    }
  }

  // Ensure methods are bound properly
  providerWithManifest.getMountedRoot = provider.getMountedRoot;
  providerWithManifest.getExecContextAfs = provider.getExecContextAfs;
  providerWithManifest.onMount = provider.onMount;
  providerWithManifest.stat = provider.stat;
  providerWithManifest.read = provider.read;
  providerWithManifest.list = provider.list;
  providerWithManifest.exec = provider.exec;

  return providerWithManifest as typeof provider;
}

// =============================================================================
// Tests
// =============================================================================

describe("AFS Isolation Integration", () => {
  describe("backward compatibility", () => {
    test("no isolationConfig means no enforcement (default)", async () => {
      const afs = new AFS();
      const provider = createMockProvider({
        name: "test-provider",
        capabilities: { crossProvider: { afsAccess: true } },
      });

      await afs.mount(provider, "/modules/test-provider");

      // onMount should receive the real AFS instance
      const mountedRoot = provider.getMountedRoot();
      expect(mountedRoot).toBeTruthy();
      expect(mountedRoot!.name).toBe("AFSRoot");
    });

    test("isolationConfig with level=none means no enforcement", async () => {
      const config: IsolationConfig = { defaultLevel: "none" };
      const afs = new AFS({ isolationConfig: config });
      const provider = createMockProvider({
        name: "test-none",
        capabilities: {},
      });

      await afs.mount(provider, "/modules/test-none");

      // onMount should receive real AFS instance (no proxy)
      const mountedRoot = provider.getMountedRoot();
      expect(mountedRoot).toBeTruthy();
      expect(mountedRoot!.name).toBe("AFSRoot");
    });
  });

  describe("audit level", () => {
    test("onMount receives scoped proxy at audit level", async () => {
      const config: IsolationConfig = { defaultLevel: "audit" };
      const afs = new AFS({ isolationConfig: config });
      const provider = createMockProvider({
        name: "test-audit",
        capabilities: { crossProvider: { afsAccess: true } },
      });

      await afs.mount(provider, "/modules/test-audit");

      const mountedRoot = provider.getMountedRoot();
      expect(mountedRoot).toBeTruthy();
      // Scoped proxy should still have AFSRoot name (proxy preserves properties)
      expect(mountedRoot!.name).toBe("AFSRoot");
      // But it should be a proxy (not the same reference)
      expect(mountedRoot).not.toBe(afs);
    });

    test("exec injects scoped proxy in context at audit level", async () => {
      const config: IsolationConfig = { defaultLevel: "audit" };
      const afs = new AFS({ isolationConfig: config });
      const provider = createMockProvider({
        name: "test-exec-audit",
        capabilities: { crossProvider: { afsAccess: true } },
      });

      await afs.mount(provider, "/modules/test-exec-audit");
      await afs.exec("/modules/test-exec-audit/.actions/test", {});

      const contextAfs = provider.getExecContextAfs();
      expect(contextAfs).toBeTruthy();
      // Should be a proxy, not the raw AFS instance
      expect(contextAfs).not.toBe(afs);
      expect(contextAfs!.name).toBe("AFSRoot");
    });

    test("audit level logs events but allows all access", async () => {
      const events: CapabilityEvent[] = [];
      const config: IsolationConfig = { defaultLevel: "audit" };
      const afs = new AFS({
        isolationConfig: config,
        onCapabilityEvent: (e) => events.push(e),
      });
      const provider = createMockProvider({
        name: "test-audit-log",
        capabilities: {}, // no crossProvider declared
      });

      await afs.mount(provider, "/modules/test-audit-log");

      // onMount should still receive a proxy (audit logs but allows)
      const mountedRoot = provider.getMountedRoot();
      expect(mountedRoot).toBeTruthy();

      // Access through proxy should work (audit doesn't block)
      const result = await mountedRoot!.read!("/modules/test-audit-log/something");
      expect(result.data).toBeTruthy();

      // Events should have been logged
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe("enforce level", () => {
    test("onMount receives scoped proxy at enforce level", async () => {
      const config: IsolationConfig = { defaultLevel: "enforce" };
      const afs = new AFS({ isolationConfig: config });
      const provider = createMockProvider({
        name: "test-enforce",
        capabilities: { crossProvider: { afsAccess: true } },
      });

      await afs.mount(provider, "/modules/test-enforce");

      const mountedRoot = provider.getMountedRoot();
      expect(mountedRoot).toBeTruthy();
      expect(mountedRoot).not.toBe(afs);
    });

    test("enforce level blocks undeclared cross-provider access via onMount proxy", async () => {
      const config: IsolationConfig = { defaultLevel: "enforce" };
      const afs = new AFS({ isolationConfig: config });

      // Provider WITHOUT crossProvider capability
      const provider = createMockProvider({
        name: "test-enforce-block",
        capabilities: {}, // no crossProvider
      });

      await afs.mount(provider, "/modules/test-enforce-block");

      const mountedRoot = provider.getMountedRoot();
      expect(mountedRoot).toBeTruthy();

      // Access through proxy should throw because crossProvider not declared
      expect(() => mountedRoot!.read!("/modules/other/data")).toThrow("Capability violation");
    });

    test("enforce level allows declared cross-provider access", async () => {
      const config: IsolationConfig = { defaultLevel: "enforce" };
      const afs = new AFS({ isolationConfig: config });

      // Provider WITH crossProvider capability
      const provider = createMockProvider({
        name: "test-enforce-allow",
        capabilities: { crossProvider: { afsAccess: true } },
      });

      // Mount a second provider to read from
      const targetProvider = createMockProvider({
        name: "target",
        capabilities: {},
      });

      await afs.mount(targetProvider, "/modules/target");
      await afs.mount(provider, "/modules/test-enforce-allow");

      const mountedRoot = provider.getMountedRoot();
      expect(mountedRoot).toBeTruthy();

      // Access should succeed because crossProvider is declared
      const result = await mountedRoot!.read!("/modules/target/data");
      expect(result.data).toBeTruthy();
    });
  });

  describe("per-provider overrides", () => {
    test("per-provider override sets different level than default", async () => {
      const config: IsolationConfig = {
        defaultLevel: "none",
        overrides: {
          "test-override": {
            level: "enforce",
          },
        },
      };
      const afs = new AFS({ isolationConfig: config });
      const provider = createMockProvider({
        name: "test-override",
        capabilities: {}, // no crossProvider
      });

      await afs.mount(provider, "/modules/test-override");

      const mountedRoot = provider.getMountedRoot();
      expect(mountedRoot).toBeTruthy();

      // Should be enforced (not "none" like default) because of per-provider override
      expect(() => mountedRoot!.read!("/modules/other/data")).toThrow("Capability violation");
    });

    test("per-provider deniedCapabilities blocks even if manifest declares it", async () => {
      const config: IsolationConfig = {
        defaultLevel: "enforce",
        overrides: {
          "test-denied": {
            deniedCapabilities: {
              crossProvider: { afsAccess: true },
            },
          },
        },
      };
      const afs = new AFS({ isolationConfig: config });
      const provider = createMockProvider({
        name: "test-denied",
        capabilities: { crossProvider: { afsAccess: true } }, // declared but user denies
      });

      await afs.mount(provider, "/modules/test-denied");

      const mountedRoot = provider.getMountedRoot();
      expect(mountedRoot).toBeTruthy();

      // Should be blocked because user denied crossProvider
      expect(() => mountedRoot!.read!("/modules/other/data")).toThrow("Capability violation");
    });

    test("per-provider grantedCapabilities expands manifest", async () => {
      const config: IsolationConfig = {
        defaultLevel: "enforce",
        overrides: {
          "test-granted": {
            grantedCapabilities: {
              crossProvider: { afsAccess: true },
            },
          },
        },
      };
      const afs = new AFS({ isolationConfig: config });
      const provider = createMockProvider({
        name: "test-granted",
        capabilities: {}, // no crossProvider in manifest
      });

      // Mount a target provider
      const target = createMockProvider({ name: "target2", capabilities: {} });
      await afs.mount(target, "/modules/target2");
      await afs.mount(provider, "/modules/test-granted");

      const mountedRoot = provider.getMountedRoot();
      expect(mountedRoot).toBeTruthy();

      // Should be allowed because user granted crossProvider
      const result = await mountedRoot!.read!("/modules/target2/data");
      expect(result.data).toBeTruthy();
    });

    test("per-mount-path override takes precedence over per-name override", async () => {
      const config: IsolationConfig = {
        defaultLevel: "none",
        overrides: {
          "precedence-test": {
            level: "audit", // by name
          },
          "/modules/precedence-test": {
            level: "enforce", // by path — should win
          },
        },
      };
      const afs = new AFS({ isolationConfig: config });
      const provider = createMockProvider({
        name: "precedence-test",
        capabilities: {}, // no crossProvider
      });

      await afs.mount(provider, "/modules/precedence-test");

      const mountedRoot = provider.getMountedRoot();
      expect(mountedRoot).toBeTruthy();

      // Should be enforced (mount path override wins)
      expect(() => mountedRoot!.read!("/modules/other/data")).toThrow("Capability violation");
    });
  });
});
