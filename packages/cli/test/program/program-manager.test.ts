/**
 * BlockletManager — activation / deactivation lifecycle tests.
 *
 * Phase 2: mount-path based discovery, Runtime AFS mount replacement.
 */

import { describe, expect, it } from "bun:test";
import { AFS, type AFSModule, type AFSRoot, type BlockletManifest } from "@aigne/afs";
import {
  BlockletManager,
  type BlockletManagerDeps,
  type BlockletMountInfo,
} from "../../src/program/blocklet-manager.js";
import type {
  BlockletTriggerInfo,
  ScriptTriggerInfo,
} from "../../src/program/blocklet-trigger-scanner.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockManifest(id: string): BlockletManifest {
  return {
    specVersion: 1,
    id,
    name: `Program ${id}`,
    entrypoint: "scripts/main.ash",
    mounts: [],
  };
}

function createMockProvider(
  name: string,
): AFSModule & { closed: boolean; close: () => Promise<void> } {
  const p = {
    name,
    accessMode: "readwrite" as const,
    closed: false,
    async close() {
      p.closed = true;
    },
    async stat() {
      return { data: { path: "/", type: "directory" as const, childrenCount: 0 } };
    },
    async list() {
      return { data: [] };
    },
    async read() {
      return { data: { path: "/", content: "" } };
    },
  } as unknown as AFSModule & { closed: boolean; close: () => Promise<void> };
  return p;
}

/**
 * Create an AFS with a minimal provider so stat("/") passes the mount health check.
 * Real Runtime AFS instances have /program, /data, etc. mounted.
 */
async function createMountableAFS(): Promise<AFS> {
  const afs = new AFS();
  await afs.mount(createMockProvider("program"), "/program");
  return afs;
}

/**
 * Create a mountable AFS with subscribe spy capability.
 * Returns both the AFS and arrays to track subscribe/unsubscribe calls.
 */
async function createSpiedAFS() {
  const afs = await createMountableAFS();
  const subscribeCalls: Array<{ path?: string }> = [];
  const unsubCalls: string[] = [];
  const origSubscribe = afs.subscribe.bind(afs);
  afs.subscribe = (filter, callback) => {
    subscribeCalls.push(filter);
    const unsub = origSubscribe(filter, callback);
    return () => {
      unsubCalls.push(filter.path ?? "");
      unsub();
    };
  };
  return { afs, subscribeCalls, unsubCalls };
}

function createTriggerInfo(blockletId: string, triggers: ScriptTriggerInfo[]): BlockletTriggerInfo {
  return {
    manifest: createMockManifest(blockletId),
    triggers,
  };
}

function eventTrigger(
  scriptPath: string,
  jobName: string,
  path: string,
  event: string,
): ScriptTriggerInfo {
  return { scriptPath, jobName, trigger: { kind: "event", path, event } };
}

/** Create default deps with all mocks. */
function createDeps(overrides?: Partial<BlockletManagerDeps>): BlockletManagerDeps {
  return {
    globalAFS: new AFS(),
    listBlockletMounts: async () => [],
    scanTriggers: async () => null,
    createBlockletAFS: async (_pp, _dp, _afs, _opts) => ({
      afs: (await createMountableAFS()) as AFSRoot,
      manifest: createMockManifest("test"),
      ownedProviders: [],
    }),
    dataDir: (mountPath: string) => `/data/${mountPath}`,
    ...overrides,
  };
}

function mp(id: string): BlockletMountInfo {
  return { mountPath: `/blocklets/${id}`, installPath: `/install/${id}` };
}

// ─── Happy Path ─────────────────────────────────────────────────────────────

describe("BlockletManager", () => {
  describe("Happy Path", () => {
    it("discovers mounts via /blocklets/ prefix filtering", async () => {
      const scanDirs: string[] = [];
      const deps = createDeps({
        listBlockletMounts: async () => [mp("bot-a"), mp("bot-b")],
        scanTriggers: async (dir) => {
          scanDirs.push(dir);
          return createTriggerInfo("x", [eventTrigger("s.ash", "h", "/p", "c")]);
        },
      });
      const pm = new BlockletManager(deps);

      await pm.activateAll();

      expect(scanDirs.sort()).toEqual(["/install/bot-a", "/install/bot-b"]);
      expect(pm.getActivatedBlocklets().sort()).toEqual(["/blocklets/bot-a", "/blocklets/bot-b"]);
    });

    it("same code, two mounts → two independent instances", async () => {
      const createAFSCalls: string[] = [];
      const deps = createDeps({
        listBlockletMounts: async () => [
          { mountPath: "/blocklets/bot-work", installPath: "/install/shared-bot" },
          { mountPath: "/blocklets/bot-personal", installPath: "/install/shared-bot" },
        ],
        scanTriggers: async () => createTriggerInfo("bot", [eventTrigger("s.ash", "h", "/p", "c")]),
        createBlockletAFS: async (pp) => {
          createAFSCalls.push(pp);
          return {
            afs: (await createMountableAFS()) as AFSRoot,
            manifest: createMockManifest("bot"),
            ownedProviders: [],
          };
        },
      });
      const pm = new BlockletManager(deps);

      await pm.activateAll();

      expect(createAFSCalls.sort()).toEqual(["/blocklets/bot-personal", "/blocklets/bot-work"]);
      expect(pm.getActivatedBlocklets()).toHaveLength(2);
    });

    it("each instance uses independent dataDir derived from mountPath", async () => {
      const dataDirCalls: string[] = [];
      const deps = createDeps({
        listBlockletMounts: async () => [mp("bot-a"), mp("bot-b")],
        scanTriggers: async () => createTriggerInfo("x", [eventTrigger("s.ash", "h", "/p", "c")]),
        dataDir: (mountPath: string) => {
          dataDirCalls.push(mountPath);
          return `/data/${mountPath}`;
        },
      });
      const pm = new BlockletManager(deps);

      await pm.activateAll();

      expect(dataDirCalls.sort()).toEqual(["/blocklets/bot-a", "/blocklets/bot-b"]);
    });

    it("activate() creates Runtime AFS and replaces global mount", async () => {
      const globalAFS = new AFS();
      const originalProvider = createMockProvider("original");
      await globalAFS.mount(originalProvider, "/blocklets/bot");

      const runtimeAFS = await createMountableAFS();
      const deps = createDeps({
        globalAFS,
        listBlockletMounts: async () => [mp("bot")],
        scanTriggers: async () => createTriggerInfo("bot", [eventTrigger("s.ash", "h", "/p", "c")]),
        createBlockletAFS: async () => ({
          afs: runtimeAFS as AFSRoot,
          manifest: createMockManifest("bot"),
          ownedProviders: [],
        }),
      });
      const pm = new BlockletManager(deps);

      await pm.activate("/blocklets/bot");

      // Global AFS mount should now be the Runtime AFS, not the original
      const mounts = globalAFS.getMounts();
      const botMount = mounts.find((m) => m.path === "/blocklets/bot");
      expect(botMount).toBeDefined();
      expect(botMount!.module).toBe(runtimeAFS as unknown as AFSModule);
      expect(botMount!.module).not.toBe(originalProvider);
    });

    it("activate() stores instance in activated Map keyed by mountPath", async () => {
      const deps = createDeps({
        listBlockletMounts: async () => [mp("bot")],
        scanTriggers: async () =>
          createTriggerInfo("bot", [eventTrigger("scripts/w.ash", "handler", "/inbox", "created")]),
      });
      const pm = new BlockletManager(deps);

      await pm.activate("/blocklets/bot");

      expect(pm.getActivatedBlocklets()).toContain("/blocklets/bot");
    });

    it("deactivate() closes all owned providers", async () => {
      const provider1 = createMockProvider("owned-1");
      const provider2 = createMockProvider("owned-2");
      const deps = createDeps({
        listBlockletMounts: async () => [mp("bot")],
        scanTriggers: async () =>
          createTriggerInfo("bot", [eventTrigger("scripts/w.ash", "handler", "/inbox", "created")]),
        createBlockletAFS: async () => ({
          afs: (await createMountableAFS()) as AFSRoot,
          manifest: createMockManifest("bot"),
          ownedProviders: [provider1, provider2],
        }),
      });
      const pm = new BlockletManager(deps);

      await pm.activate("/blocklets/bot");
      await pm.deactivate("/blocklets/bot");

      expect(provider1.closed).toBe(true);
      expect(provider2.closed).toBe(true);
    });

    it("deactivate() removes from activated Map", async () => {
      const deps = createDeps({
        listBlockletMounts: async () => [mp("bot")],
        scanTriggers: async () =>
          createTriggerInfo("bot", [eventTrigger("scripts/w.ash", "handler", "/inbox", "created")]),
      });
      const pm = new BlockletManager(deps);

      await pm.activate("/blocklets/bot");
      expect(pm.getActivatedBlocklets()).toContain("/blocklets/bot");

      await pm.deactivate("/blocklets/bot");
      expect(pm.getActivatedBlocklets()).not.toContain("/blocklets/bot");
    });

    it("activateAll() scans and activates all program mounts", async () => {
      const deps = createDeps({
        listBlockletMounts: async () => [mp("bot-a"), mp("bot-b")],
        scanTriggers: async (dir) => {
          if (dir.includes("bot-a")) {
            return createTriggerInfo("bot-a", [
              eventTrigger("scripts/w.ash", "handler", "/inbox-a", "created"),
            ]);
          }
          if (dir.includes("bot-b")) {
            return createTriggerInfo("bot-b", [
              eventTrigger("scripts/t.ash", "tick", "/inbox-b", "created"),
            ]);
          }
          return null;
        },
      });
      const pm = new BlockletManager(deps);

      await pm.activateAll();

      expect(pm.getActivatedBlocklets().sort()).toEqual(["/blocklets/bot-a", "/blocklets/bot-b"]);
    });

    it("activateAll() skips mounts with no triggers", async () => {
      const deps = createDeps({
        listBlockletMounts: async () => [
          { mountPath: "/blocklets/has", installPath: "/install/has" },
          { mountPath: "/blocklets/no", installPath: "/install/no" },
        ],
        scanTriggers: async (dir) => {
          if (dir.includes("has")) {
            return createTriggerInfo("has-trigger", [
              eventTrigger("scripts/w.ash", "handler", "/inbox", "created"),
            ]);
          }
          return null;
        },
      });
      const pm = new BlockletManager(deps);

      await pm.activateAll();

      expect(pm.getActivatedBlocklets()).toEqual(["/blocklets/has"]);
    });

    it("getActivatedBlocklets() returns list of activated mount paths", async () => {
      const deps = createDeps({
        listBlockletMounts: async () => [mp("a"), mp("b")],
        scanTriggers: async () => createTriggerInfo("x", [eventTrigger("s.ash", "h", "/p", "c")]),
      });
      const pm = new BlockletManager(deps);

      await pm.activateAll();

      const activated = pm.getActivatedBlocklets();
      expect(activated).toHaveLength(2);
      expect(activated.sort()).toEqual(["/blocklets/a", "/blocklets/b"]);
    });

    it("reload re-discovers and activates all instances", async () => {
      const ops: string[] = [];
      const deps = createDeps({
        listBlockletMounts: async () => [mp("bot")],
        scanTriggers: async () => {
          ops.push("scan");
          return createTriggerInfo("bot", [eventTrigger("s.ash", "h", "/p", "c")]);
        },
        createBlockletAFS: async () => {
          ops.push("create");
          return {
            afs: (await createMountableAFS()) as AFSRoot,
            manifest: createMockManifest("bot"),
            ownedProviders: [],
          };
        },
      });
      const pm = new BlockletManager(deps);

      await pm.activate("/blocklets/bot");
      ops.length = 0;

      await pm.reload();

      expect(ops).toContain("scan");
      expect(ops).toContain("create");
      expect(pm.getActivatedBlocklets()).toContain("/blocklets/bot");
    });
  });

  // ─── Bad Path ───────────────────────────────────────────────────────────────

  describe("Bad Path", () => {
    it("activate() mount not found → throws", async () => {
      const deps = createDeps({
        listBlockletMounts: async () => [],
      });
      const pm = new BlockletManager(deps);

      await expect(pm.activate("/blocklets/nonexistent")).rejects.toThrow(/not found/i);
    });

    it("program.yaml invalid (scanTriggers throws) → skip and log warning", async () => {
      let scanCount = 0;
      const deps = createDeps({
        listBlockletMounts: async () => [mp("bad"), mp("good")],
        scanTriggers: async (dir) => {
          scanCount++;
          if (dir.includes("bad")) throw new Error("Invalid program.yaml");
          return createTriggerInfo("good", [eventTrigger("s.ash", "h", "/p", "c")]);
        },
      });
      const pm = new BlockletManager(deps);

      await pm.activateAll();

      expect(scanCount).toBe(2);
      expect(pm.getActivatedBlocklets()).toEqual(["/blocklets/good"]);
    });

    it("activate() createBlockletAFS failure → does not affect others", async () => {
      const deps = createDeps({
        listBlockletMounts: async () => [mp("bad"), mp("good")],
        scanTriggers: async () => createTriggerInfo("x", [eventTrigger("s.ash", "h", "/p", "c")]),
        createBlockletAFS: async (pp) => {
          if (pp === "/blocklets/bad") throw new Error("AFS creation failed");
          return {
            afs: (await createMountableAFS()) as AFSRoot,
            manifest: createMockManifest("good"),
            ownedProviders: [],
          };
        },
      });
      const pm = new BlockletManager(deps);

      await pm.activateAll();

      expect(pm.getActivatedBlocklets()).toEqual(["/blocklets/good"]);
    });

    it("mount with options.enabled = false → skip activation", async () => {
      const deps = createDeps({
        listBlockletMounts: async () => [
          {
            mountPath: "/blocklets/disabled",
            installPath: "/install/d",
            options: { enabled: false },
          },
          mp("enabled"),
        ],
        scanTriggers: async () => createTriggerInfo("x", [eventTrigger("s.ash", "h", "/p", "c")]),
      });
      const pm = new BlockletManager(deps);

      await pm.activateAll();

      expect(pm.getActivatedBlocklets()).toEqual(["/blocklets/enabled"]);
    });

    it("activate() duplicate → deactivates first then re-activates", async () => {
      const deps = createDeps({
        listBlockletMounts: async () => [mp("bot")],
        scanTriggers: async () =>
          createTriggerInfo("bot", [eventTrigger("scripts/w.ash", "handler", "/inbox", "created")]),
      });
      const pm = new BlockletManager(deps);

      await pm.activate("/blocklets/bot");
      await pm.activate("/blocklets/bot"); // re-activate

      // Program should still be activated
      expect(pm.getActivatedBlocklets()).toContain("/blocklets/bot");
    });

    it("deactivate() non-activated mount → silent no-op", async () => {
      const pm = new BlockletManager(createDeps());

      await pm.deactivate("/blocklets/nonexistent");
    });
  });

  // ─── Edge Cases ─────────────────────────────────────────────────────────────

  describe("Edge Cases", () => {
    it("zero program mounts → activateAll completes normally", async () => {
      const deps = createDeps({
        listBlockletMounts: async () => [],
      });
      const pm = new BlockletManager(deps);

      await pm.activateAll();

      expect(pm.getActivatedBlocklets()).toEqual([]);
    });

    it("mount removed during activateAll → no crash", async () => {
      let callCount = 0;
      const deps = createDeps({
        listBlockletMounts: async () => [mp("a"), mp("b")],
        scanTriggers: async () => {
          callCount++;
          if (callCount === 1) throw new Error("Mount removed");
          return createTriggerInfo("b", [eventTrigger("s.ash", "h", "/p", "c")]);
        },
      });
      const pm = new BlockletManager(deps);

      await pm.activateAll();

      expect(pm.getActivatedBlocklets()).toEqual(["/blocklets/b"]);
    });

    it("same blockletId two instances → each gets register-triggers with correct namespace", async () => {
      const registerCalls: Array<{ namespace: string }> = [];

      // Create runtime AFS instances that track exec calls
      async function createTrackedAFS() {
        const afs = await createMountableAFS();
        const origExec = afs.exec?.bind(afs);
        (afs as any).exec = async (path: string, args: Record<string, unknown>, opts?: unknown) => {
          if (path === "/ash/.actions/register-triggers") {
            registerCalls.push({ namespace: args.namespace as string });
            return { data: {} };
          }
          return origExec?.(path, args, opts as undefined) ?? { data: {} };
        };
        return afs;
      }

      const runtimeA = await createTrackedAFS();
      const runtimeB = await createTrackedAFS();

      const deps = createDeps({
        listBlockletMounts: async () => [
          { mountPath: "/blocklets/bot-work", installPath: "/install/shared" },
          { mountPath: "/blocklets/bot-personal", installPath: "/install/shared" },
        ],
        scanTriggers: async () =>
          createTriggerInfo("bot", [eventTrigger("s.ash", "handler", "/inbox", "created")]),
        createBlockletAFS: async (pp) => {
          const rt = pp.includes("work") ? runtimeA : runtimeB;
          return {
            afs: rt as AFSRoot,
            manifest: createMockManifest("bot"),
            ownedProviders: [],
          };
        },
      });
      const pm = new BlockletManager(deps);

      await pm.activateAll();

      // Each instance should get its own register-triggers call with distinct namespace
      expect(registerCalls).toHaveLength(2);
      const namespaces = registerCalls.map((c) => c.namespace).sort();
      expect(namespaces).toEqual(["/blocklets/bot-personal", "/blocklets/bot-work"]);
    });

    it("deactivated instance → data directory preserved (no cleanup)", async () => {
      let dataDirUsed = "";
      const deps = createDeps({
        listBlockletMounts: async () => [mp("bot")],
        scanTriggers: async () => createTriggerInfo("bot", [eventTrigger("s.ash", "h", "/p", "c")]),
        dataDir: (mountPath: string) => {
          dataDirUsed = `/data/${mountPath}`;
          return dataDirUsed;
        },
      });
      const pm = new BlockletManager(deps);

      await pm.activate("/blocklets/bot");
      await pm.deactivate("/blocklets/bot");

      // dataDir was computed but deactivate does NOT delete it
      expect(dataDirUsed).toBe("/data//blocklets/bot");
      expect(pm.getActivatedBlocklets()).not.toContain("/blocklets/bot");
    });

    it("all blocklets have no triggers → no activations", async () => {
      const deps = createDeps({
        listBlockletMounts: async () => [mp("a"), mp("b")],
        scanTriggers: async () => null,
      });
      const pm = new BlockletManager(deps);

      await pm.activateAll();

      expect(pm.getActivatedBlocklets()).toEqual([]);
    });

    it("deactivate then re-activate → new instance works", async () => {
      let createCount = 0;
      const deps = createDeps({
        listBlockletMounts: async () => [mp("bot")],
        scanTriggers: async () =>
          createTriggerInfo("bot", [eventTrigger("scripts/w.ash", "handler", "/inbox", "created")]),
        createBlockletAFS: async () => {
          createCount++;
          return {
            afs: (await createMountableAFS()) as AFSRoot,
            manifest: createMockManifest("bot"),
            ownedProviders: [],
          };
        },
      });
      const pm = new BlockletManager(deps);

      await pm.activate("/blocklets/bot");
      await pm.deactivate("/blocklets/bot");
      await pm.activate("/blocklets/bot");

      expect(createCount).toBe(2);
      expect(pm.getActivatedBlocklets()).toContain("/blocklets/bot");
    });

    it("reload() = deactivateAll + activateAll", async () => {
      const ops: string[] = [];
      const deps = createDeps({
        listBlockletMounts: async () => [mp("bot")],
        scanTriggers: async () => {
          ops.push("scan");
          return createTriggerInfo("bot", [eventTrigger("s.ash", "h", "/p", "c")]);
        },
        createBlockletAFS: async () => {
          ops.push("create");
          return {
            afs: (await createMountableAFS()) as AFSRoot,
            manifest: createMockManifest("bot"),
            ownedProviders: [],
          };
        },
      });
      const pm = new BlockletManager(deps);

      await pm.activate("/blocklets/bot");
      ops.length = 0;

      await pm.reload();

      expect(ops).toContain("scan");
      expect(ops).toContain("create");
      expect(pm.getActivatedBlocklets()).toContain("/blocklets/bot");
    });

    it("non-/blocklets/ prefix mount not in listBlockletMounts → not activated", async () => {
      const deps = createDeps({
        // Only /blocklets/ prefix mounts returned
        listBlockletMounts: async () => [mp("bot")],
        scanTriggers: async () => createTriggerInfo("x", [eventTrigger("s.ash", "h", "/p", "c")]),
      });
      const pm = new BlockletManager(deps);

      // Can't activate non-/blocklets/ path
      await expect(pm.activate("/modules/some-provider")).rejects.toThrow(/not found/i);
    });
  });

  // ─── Security ─────────────────────────────────────────────────────────────

  describe("Security", () => {
    it("Runtime AFS is isolated from global AFS", async () => {
      const runtimeAFS = await createMountableAFS();
      const deps = createDeps({
        listBlockletMounts: async () => [mp("bot")],
        scanTriggers: async () => createTriggerInfo("bot", [eventTrigger("s.ash", "h", "/p", "c")]),
        createBlockletAFS: async () => ({
          afs: runtimeAFS as AFSRoot,
          manifest: createMockManifest("bot"),
          ownedProviders: [],
        }),
      });
      const pm = new BlockletManager(deps);

      await pm.activate("/blocklets/bot");

      expect(runtimeAFS).not.toBe(deps.globalAFS);
    });

    it("instance A cannot access instance B's /data — separate dataDirs", async () => {
      const dataDirCalls: Array<{ mountPath: string; result: string }> = [];
      const deps = createDeps({
        listBlockletMounts: async () => [mp("bot-a"), mp("bot-b")],
        scanTriggers: async () => createTriggerInfo("x", [eventTrigger("s.ash", "h", "/p", "c")]),
        dataDir: (mountPath: string) => {
          const dir = `/data/${mountPath.replace(/\//g, "_")}`;
          dataDirCalls.push({ mountPath, result: dir });
          return dir;
        },
      });
      const pm = new BlockletManager(deps);

      await pm.activateAll();

      expect(dataDirCalls).toHaveLength(2);
      const dirA = dataDirCalls.find((d) => d.mountPath === "/blocklets/bot-a")!.result;
      const dirB = dataDirCalls.find((d) => d.mountPath === "/blocklets/bot-b")!.result;
      expect(dirA).not.toBe(dirB);
    });

    it("program event subscriptions are isolated per instance (each gets own namespace)", async () => {
      const registerCalls: Array<{ namespace: string; runtimeId: string }> = [];

      async function createTrackedAFS(runtimeId: string) {
        const afs = await createMountableAFS();
        const origExec = afs.exec?.bind(afs);
        (afs as any).exec = async (path: string, args: Record<string, unknown>, opts?: unknown) => {
          if (path === "/ash/.actions/register-triggers") {
            registerCalls.push({ namespace: args.namespace as string, runtimeId });
            return { data: {} };
          }
          return origExec?.(path, args, opts as undefined) ?? { data: {} };
        };
        return afs;
      }

      const runtimeA = await createTrackedAFS("rt-a");
      const runtimeB = await createTrackedAFS("rt-b");

      const deps = createDeps({
        listBlockletMounts: async () => [mp("bot-a"), mp("bot-b")],
        scanTriggers: async (dir) => {
          if (dir.includes("bot-a")) {
            return createTriggerInfo("bot-a", [
              eventTrigger("scripts/a.ash", "handler-a", "/path-a", "created"),
            ]);
          }
          return createTriggerInfo("bot-b", [
            eventTrigger("scripts/b.ash", "handler-b", "/path-b", "created"),
          ]);
        },
        createBlockletAFS: async (pp) => {
          const rt = pp.includes("bot-a") ? runtimeA : runtimeB;
          const id = pp.includes("bot-a") ? "bot-a" : "bot-b";
          return { afs: rt as AFSRoot, manifest: createMockManifest(id), ownedProviders: [] };
        },
      });
      const pm = new BlockletManager(deps);

      await pm.activateAll();

      // Each instance registered triggers with its own namespace
      expect(registerCalls).toHaveLength(2);
      const nsA = registerCalls.find((c) => c.runtimeId === "rt-a");
      const nsB = registerCalls.find((c) => c.runtimeId === "rt-b");
      expect(nsA?.namespace).toBe("/blocklets/bot-a");
      expect(nsB?.namespace).toBe("/blocklets/bot-b");
    });
  });

  // ─── Data Leak ──────────────────────────────────────────────────────────────

  describe("Data Leak", () => {
    it("activation failure error does not contain credentials", async () => {
      const deps = createDeps({
        listBlockletMounts: async () => [mp("bot")],
        scanTriggers: async () => createTriggerInfo("bot", [eventTrigger("s.ash", "h", "/p", "c")]),
        createBlockletAFS: async () => {
          throw new Error("Connection refused");
        },
      });
      const pm = new BlockletManager(deps);

      try {
        await pm.activate("/blocklets/bot");
      } catch (err: any) {
        expect(err.message).not.toContain("password");
        expect(err.message).not.toContain("secret");
        expect(err.message).not.toContain("token");
      }
    });

    it("getActivatedBlocklets() returns only mount paths, not internal state", async () => {
      const deps = createDeps({
        listBlockletMounts: async () => [mp("bot")],
        scanTriggers: async () => createTriggerInfo("bot", [eventTrigger("s.ash", "h", "/p", "c")]),
      });
      const pm = new BlockletManager(deps);

      await pm.activate("/blocklets/bot");

      const result = pm.getActivatedBlocklets();
      expect(result).toBeInstanceOf(Array);
      expect(typeof result[0]).toBe("string");
    });

    it("error messages do not contain mounts.toml content", async () => {
      const deps = createDeps({
        listBlockletMounts: async () => [],
      });
      const pm = new BlockletManager(deps);

      try {
        await pm.activate("/blocklets/bot");
      } catch (err: any) {
        expect(err.message).not.toContain("mounts.toml");
        expect(err.message).not.toContain("token");
      }
    });
  });

  // ─── Data Damage ────────────────────────────────────────────────────────────

  describe("Data Damage", () => {
    it("reload: deactivateAll first then activateAll — no lost events", async () => {
      const ops: string[] = [];
      const { afs: runtimeAFS, unsubCalls: _ } = await createSpiedAFS();
      // Use a fresh spy for tracking order
      const origSubscribe = runtimeAFS.subscribe.bind(runtimeAFS);
      runtimeAFS.subscribe = (filter, callback) => {
        const unsub = origSubscribe(filter, callback);
        return () => {
          ops.push("unsub");
          unsub();
        };
      };

      const deps = createDeps({
        listBlockletMounts: async () => [mp("bot")],
        scanTriggers: async () => createTriggerInfo("bot", [eventTrigger("s.ash", "h", "/p", "c")]),
        createBlockletAFS: async () => {
          ops.push("create");
          return {
            afs: runtimeAFS as AFSRoot,
            manifest: createMockManifest("bot"),
            ownedProviders: [],
          };
        },
      });
      const pm = new BlockletManager(deps);

      await pm.activate("/blocklets/bot");
      ops.length = 0;

      await pm.reload();

      // Should deactivate (unsub) before activating (create)
      const unsubIdx = ops.indexOf("unsub");
      const createIdx = ops.indexOf("create");
      expect(unsubIdx).toBeLessThan(createIdx);
    });

    it("concurrent reload requests are serialized", async () => {
      let _activateCount = 0;
      const deps = createDeps({
        listBlockletMounts: async () => [mp("bot")],
        scanTriggers: async () => {
          await new Promise((r) => setTimeout(r, 5));
          return createTriggerInfo("bot", [eventTrigger("s.ash", "h", "/p", "c")]);
        },
        createBlockletAFS: async () => {
          _activateCount++;
          return {
            afs: (await createMountableAFS()) as AFSRoot,
            manifest: createMockManifest("bot"),
            ownedProviders: [],
          };
        },
      });
      const pm = new BlockletManager(deps);

      await Promise.all([pm.reload(), pm.reload()]);

      expect(pm.getActivatedBlocklets()).toHaveLength(1);
    });

    it("activation failure preserves original mount (rollback)", async () => {
      const globalAFS = new AFS();
      const originalProvider = createMockProvider("original");
      await globalAFS.mount(originalProvider, "/blocklets/bot");

      const deps = createDeps({
        globalAFS,
        listBlockletMounts: async () => [mp("bot")],
        scanTriggers: async () => createTriggerInfo("bot", [eventTrigger("s.ash", "h", "/p", "c")]),
        createBlockletAFS: async () => {
          throw new Error("Runtime AFS creation failed");
        },
      });
      const pm = new BlockletManager(deps);

      // activateAll should skip the failing program
      await pm.activateAll();

      // Original mount should still be in place
      const mounts = globalAFS.getMounts();
      const botMount = mounts.find((m) => m.path === "/blocklets/bot");
      expect(botMount).toBeDefined();
      expect(botMount!.module).toBe(originalProvider);
    });

    it("deactivate: one provider close failure does not prevent other cleanup", async () => {
      const provider1 = createMockProvider("owned-1");
      (provider1 as any).close = async () => {
        throw new Error("Close failed");
      };
      const provider2 = createMockProvider("owned-2");

      const deps = createDeps({
        listBlockletMounts: async () => [mp("bot")],
        scanTriggers: async () => createTriggerInfo("bot", [eventTrigger("s.ash", "h", "/p", "c")]),
        createBlockletAFS: async () => ({
          afs: (await createMountableAFS()) as AFSRoot,
          manifest: createMockManifest("bot"),
          ownedProviders: [provider1, provider2],
        }),
      });
      const pm = new BlockletManager(deps);

      await pm.activate("/blocklets/bot");
      await pm.deactivate("/blocklets/bot");

      expect(provider2.closed).toBe(true);
      expect(pm.getActivatedBlocklets()).not.toContain("/blocklets/bot");
    });
  });
});
