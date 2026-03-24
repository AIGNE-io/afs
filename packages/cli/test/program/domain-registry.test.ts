/**
 * BlockletManager domainRegistry — cross-blocklet domain uniqueness (T2-3a).
 */

import { describe, expect, it } from "bun:test";
import { AFS, type AFSModule, type AFSRoot, type BlockletManifest } from "@aigne/afs";
import {
  BlockletManager,
  type BlockletManagerDeps,
  type BlockletMountInfo,
} from "../../src/program/blocklet-manager.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockManifest(
  id: string,
  sites?: Array<{ name: string; domain?: string; port?: number }>,
): BlockletManifest {
  return {
    specVersion: 2,
    id,
    name: `Blocklet ${id}`,
    mounts: [],
    sites,
  };
}

function createMockProvider(name: string): AFSModule {
  return {
    name,
    accessMode: "readwrite" as const,
    async stat() {
      return { data: { path: "/", type: "directory" as const, childrenCount: 0 } };
    },
    async list() {
      return { data: [] };
    },
    async read() {
      return { data: { path: "/", content: "" } };
    },
  } as unknown as AFSModule;
}

async function createMountableAFS(): Promise<AFS> {
  const afs = new AFS();
  await afs.mount(createMockProvider("program"), "/program");
  return afs;
}

function createDeps(
  globalAFS: AFS,
  manifests: Record<string, BlockletManifest>,
  mounts: BlockletMountInfo[],
): BlockletManagerDeps {
  return {
    globalAFS,
    listBlockletMounts: async () => mounts,
    scanTriggers: async () => ({
      manifest: createMockManifest("stub"),
      triggers: [
        {
          scriptPath: "main.ash",
          jobName: "main",
          trigger: { kind: "cron" as const, expression: "* * * * *" },
        },
      ],
    }),
    dataDir: (mp: string) => mp.replace("/blocklets/", "/data/blocklets/"),
    createBlockletAFS: async (programPath, _dataPath, _globalAFS, _options) => {
      const id = programPath.split("/").pop()!;
      const manifest = manifests[id] ?? createMockManifest(id);
      const runtimeAFS = await createMountableAFS();
      return {
        afs: runtimeAFS as unknown as AFSRoot,
        manifest,
        ownedProviders: [],
        resolvedOverrides: [],
      };
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("BlockletManager domainRegistry (T2-3a)", () => {
  it("registers domain on activation", async () => {
    const globalAFS = await createMountableAFS();
    const manifests = {
      showcase: createMockManifest("showcase", [
        { name: "showcase", domain: "showcase.aigne.io", port: 3100 },
      ]),
    };
    const mounts = [{ mountPath: "/blocklets/showcase", installPath: "/tmp/showcase" }];
    const mgr = new BlockletManager(createDeps(globalAFS, manifests, mounts));

    await mgr.activate("/blocklets/showcase");
    expect(mgr.getDomainOwner("showcase.aigne.io")).toBe("showcase");
  });

  it("rejects duplicate domain on second blocklet activation", async () => {
    const globalAFS = await createMountableAFS();
    await globalAFS.mount(createMockProvider("b"), "/blocklets/b");
    const manifests = {
      a: createMockManifest("a", [{ name: "site-a", domain: "example.com", port: 3100 }]),
      b: createMockManifest("b", [{ name: "site-b", domain: "example.com", port: 3101 }]),
    };
    const mounts = [
      { mountPath: "/blocklets/a", installPath: "/tmp/a" },
      { mountPath: "/blocklets/b", installPath: "/tmp/b" },
    ];
    const mgr = new BlockletManager(createDeps(globalAFS, manifests, mounts));

    await mgr.activate("/blocklets/a");
    await expect(mgr.activate("/blocklets/b")).rejects.toThrow(/domain.*conflict/i);
  });

  it("allows same site name across different blocklets (different domains)", async () => {
    const globalAFS = await createMountableAFS();
    await globalAFS.mount(createMockProvider("b"), "/blocklets/b");
    const manifests = {
      a: createMockManifest("a", [{ name: "default", domain: "a.example.com", port: 3100 }]),
      b: createMockManifest("b", [{ name: "default", domain: "b.example.com", port: 3101 }]),
    };
    const mounts = [
      { mountPath: "/blocklets/a", installPath: "/tmp/a" },
      { mountPath: "/blocklets/b", installPath: "/tmp/b" },
    ];
    const mgr = new BlockletManager(createDeps(globalAFS, manifests, mounts));

    await mgr.activate("/blocklets/a");
    await mgr.activate("/blocklets/b"); // should NOT throw
    expect(mgr.getDomainOwner("a.example.com")).toBe("a");
    expect(mgr.getDomainOwner("b.example.com")).toBe("b");
  });

  it("removes domain on deactivation", async () => {
    const globalAFS = await createMountableAFS();
    const manifests = {
      showcase: createMockManifest("showcase", [
        { name: "showcase", domain: "showcase.aigne.io", port: 3100 },
      ]),
    };
    const mounts = [{ mountPath: "/blocklets/showcase", installPath: "/tmp/showcase" }];
    const mgr = new BlockletManager(createDeps(globalAFS, manifests, mounts));

    await mgr.activate("/blocklets/showcase");
    expect(mgr.getDomainOwner("showcase.aigne.io")).toBe("showcase");

    await mgr.deactivate("/blocklets/showcase");
    expect(mgr.getDomainOwner("showcase.aigne.io")).toBeUndefined();
  });

  it("activates blocklet without sites normally (no domain registration)", async () => {
    const globalAFS = await createMountableAFS();
    const manifests = {
      agent: createMockManifest("agent"), // no sites
    };
    const mounts = [{ mountPath: "/blocklets/agent", installPath: "/tmp/agent" }];
    const mgr = new BlockletManager(createDeps(globalAFS, manifests, mounts));

    await mgr.activate("/blocklets/agent");
    expect(mgr.getActivatedBlocklets()).toContain("/blocklets/agent");
  });

  it("getDomainOwner returns undefined for unknown domain", async () => {
    const globalAFS = await createMountableAFS();
    const mgr = new BlockletManager(createDeps(globalAFS, {}, []));
    expect(mgr.getDomainOwner("unknown.com")).toBeUndefined();
  });

  it("findActivatedByName returns mount path and manifest", async () => {
    const globalAFS = await createMountableAFS();
    const manifests = {
      showcase: createMockManifest("showcase", [
        { name: "showcase", domain: "showcase.aigne.io", port: 3100 },
      ]),
    };
    const mounts = [{ mountPath: "/blocklets/showcase", installPath: "/tmp/showcase" }];
    const mgr = new BlockletManager(createDeps(globalAFS, manifests, mounts));

    await mgr.activate("/blocklets/showcase");
    const found = mgr.findActivatedByName("showcase");
    expect(found).toBeDefined();
    expect(found!.mountPath).toBe("/blocklets/showcase");
    expect(found!.manifest.id).toBe("showcase");
    expect(found!.runtimeAFS).toBeDefined();
  });

  it("findActivatedByName returns undefined for inactive blocklet", async () => {
    const globalAFS = await createMountableAFS();
    const mgr = new BlockletManager(createDeps(globalAFS, {}, []));
    expect(mgr.findActivatedByName("showcase")).toBeUndefined();
  });

  it("resolveBlockletFromDomain checks domainRegistry then name match", async () => {
    const globalAFS = await createMountableAFS();
    await globalAFS.mount(createMockProvider("b"), "/blocklets/blog");
    const manifests = {
      showcase: createMockManifest("showcase", [
        { name: "showcase", domain: "showcase.aigne.io", port: 3100 },
      ]),
      blog: createMockManifest("blog"),
    };
    const mounts = [
      { mountPath: "/blocklets/showcase", installPath: "/tmp/showcase" },
      { mountPath: "/blocklets/blog", installPath: "/tmp/blog" },
    ];
    const mgr = new BlockletManager(createDeps(globalAFS, manifests, mounts));

    await mgr.activate("/blocklets/showcase");
    await mgr.activate("/blocklets/blog");

    // Production domain → domainRegistry
    const byDomain = mgr.resolveBlockletFromDomain("showcase.aigne.io");
    expect(byDomain).toBeDefined();
    expect(byDomain!.manifest.id).toBe("showcase");

    // Blocklet name → direct name match
    const byName = mgr.resolveBlockletFromDomain("blog");
    expect(byName).toBeDefined();
    expect(byName!.manifest.id).toBe("blog");

    // Unknown → undefined
    expect(mgr.resolveBlockletFromDomain("unknown.com")).toBeUndefined();
  });

  // M4/M8: partial domain registration rollback on conflict
  it("does NOT leave partial domain registrations on conflict", async () => {
    const globalAFS = await createMountableAFS();
    await globalAFS.mount(createMockProvider("b"), "/blocklets/b");
    const manifests = {
      a: createMockManifest("a", [{ name: "site-a", domain: "taken.com", port: 3100 }]),
      // b has two domains: first is unique, second conflicts with a
      b: createMockManifest("b", [
        { name: "site-b1", domain: "unique.com", port: 3101 },
        { name: "site-b2", domain: "taken.com", port: 3102 },
      ]),
    };
    const mounts = [
      { mountPath: "/blocklets/a", installPath: "/tmp/a" },
      { mountPath: "/blocklets/b", installPath: "/tmp/b" },
    ];
    const mgr = new BlockletManager(createDeps(globalAFS, manifests, mounts));

    await mgr.activate("/blocklets/a");
    await expect(mgr.activate("/blocklets/b")).rejects.toThrow(/domain.*conflict/i);

    // unique.com must NOT be registered — b's activation was fully rejected
    expect(mgr.getDomainOwner("unique.com")).toBeUndefined();
    // taken.com stays with a
    expect(mgr.getDomainOwner("taken.com")).toBe("a");
  });
});
