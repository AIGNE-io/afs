/**
 * Domain lifecycle — DNS + CF Pages binding on blocklet activation (T2-5).
 */

import { describe, expect, it } from "bun:test";
import { AFS, type AFSModule, type AFSRoot, type BlockletManifest } from "@aigne/afs";
import { BlockletManager } from "../../src/program/blocklet-manager.js";

function createMockManifest(
  id: string,
  sites?: Array<{ name: string; domain?: string; port?: number }>,
): BlockletManifest {
  return { specVersion: 2, id, name: `Blocklet ${id}`, mounts: [], sites };
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

describe("Domain lifecycle (T2-5)", () => {
  it("calls onDomainBind on activation with domain", async () => {
    const binds: string[] = [];
    const unbinds: string[] = [];

    const globalAFS = await createMountableAFS();
    const mgr = new BlockletManager({
      globalAFS,
      listBlockletMounts: async () => [
        { mountPath: "/blocklets/showcase", installPath: "/tmp/showcase" },
      ],
      scanTriggers: async () => ({
        manifest: createMockManifest("showcase"),
        triggers: [
          {
            scriptPath: "main.ash",
            jobName: "main",
            trigger: { kind: "cron" as const, expression: "* * * * *" },
          },
        ],
      }),
      dataDir: (mp) => mp.replace("/blocklets/", "/data/blocklets/"),
      createBlockletAFS: async () => ({
        afs: (await createMountableAFS()) as unknown as AFSRoot,
        manifest: createMockManifest("showcase", [
          { name: "showcase", domain: "showcase.aigne.io", port: 3100 },
        ]),
        ownedProviders: [],
        resolvedOverrides: [],
      }),
      onDomainBind: async (domain) => {
        binds.push(domain);
      },
      onDomainUnbind: async (domain) => {
        unbinds.push(domain);
      },
    });

    await mgr.activate("/blocklets/showcase");
    expect(binds).toEqual(["showcase.aigne.io"]);
    expect(unbinds).toHaveLength(0);
  });

  it("calls onDomainUnbind on deactivation", async () => {
    const unbinds: string[] = [];

    const globalAFS = await createMountableAFS();
    const mgr = new BlockletManager({
      globalAFS,
      listBlockletMounts: async () => [
        { mountPath: "/blocklets/showcase", installPath: "/tmp/showcase" },
      ],
      scanTriggers: async () => ({
        manifest: createMockManifest("showcase"),
        triggers: [
          {
            scriptPath: "main.ash",
            jobName: "main",
            trigger: { kind: "cron" as const, expression: "* * * * *" },
          },
        ],
      }),
      dataDir: (mp) => mp.replace("/blocklets/", "/data/blocklets/"),
      createBlockletAFS: async () => ({
        afs: (await createMountableAFS()) as unknown as AFSRoot,
        manifest: createMockManifest("showcase", [
          { name: "showcase", domain: "showcase.aigne.io", port: 3100 },
        ]),
        ownedProviders: [],
        resolvedOverrides: [],
      }),
      onDomainUnbind: async (domain) => {
        unbinds.push(domain);
      },
    });

    await mgr.activate("/blocklets/showcase");
    await mgr.deactivate("/blocklets/showcase");
    expect(unbinds).toEqual(["showcase.aigne.io"]);
  });

  it("skips DNS for sites without domain", async () => {
    const binds: string[] = [];

    const globalAFS = await createMountableAFS();
    const mgr = new BlockletManager({
      globalAFS,
      listBlockletMounts: async () => [{ mountPath: "/blocklets/app", installPath: "/tmp/app" }],
      scanTriggers: async () => ({
        manifest: createMockManifest("app"),
        triggers: [
          {
            scriptPath: "main.ash",
            jobName: "main",
            trigger: { kind: "cron" as const, expression: "* * * * *" },
          },
        ],
      }),
      dataDir: (mp) => mp.replace("/blocklets/", "/data/blocklets/"),
      createBlockletAFS: async () => ({
        afs: (await createMountableAFS()) as unknown as AFSRoot,
        manifest: createMockManifest("app", [{ name: "dev-site" }]), // no domain
        ownedProviders: [],
        resolvedOverrides: [],
      }),
      onDomainBind: async (domain) => {
        binds.push(domain);
      },
    });

    await mgr.activate("/blocklets/app");
    expect(binds).toHaveLength(0);
  });

  it("no onDomainBind callback — activation still succeeds", async () => {
    const globalAFS = await createMountableAFS();
    const mgr = new BlockletManager({
      globalAFS,
      listBlockletMounts: async () => [
        { mountPath: "/blocklets/showcase", installPath: "/tmp/showcase" },
      ],
      scanTriggers: async () => ({
        manifest: createMockManifest("showcase"),
        triggers: [
          {
            scriptPath: "main.ash",
            jobName: "main",
            trigger: { kind: "cron" as const, expression: "* * * * *" },
          },
        ],
      }),
      dataDir: (mp) => mp.replace("/blocklets/", "/data/blocklets/"),
      createBlockletAFS: async () => ({
        afs: (await createMountableAFS()) as unknown as AFSRoot,
        manifest: createMockManifest("showcase", [
          { name: "showcase", domain: "showcase.aigne.io" },
        ]),
        ownedProviders: [],
        resolvedOverrides: [],
      }),
      // No onDomainBind/onDomainUnbind
    });

    await mgr.activate("/blocklets/showcase"); // should NOT throw
    expect(mgr.getActivatedBlocklets()).toContain("/blocklets/showcase");
  });
});
