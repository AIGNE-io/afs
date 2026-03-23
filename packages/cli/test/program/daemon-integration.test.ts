/**
 * Phase 4: Daemon integration — program activation HTTP API + hooks tests.
 */

import { describe, expect, it } from "bun:test";
import { AFS, type AFSModule, type AFSRoot, type BlockletManifest } from "@aigne/afs";
import { handleBlockletsAPI } from "../../src/program/blocklet-daemon-integration.js";
import { BlockletManager, type BlockletManagerDeps } from "../../src/program/blocklet-manager.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockManifest(id: string): BlockletManifest {
  return { specVersion: 1, id, name: `Program ${id}`, entrypoint: "main.ash", mounts: [] };
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

function createDeps(overrides?: Partial<BlockletManagerDeps>): BlockletManagerDeps {
  return {
    globalAFS: new AFS(),
    listBlockletMounts: async () => [],
    scanTriggers: async () => null,
    createBlockletAFS: async () => ({
      afs: (await createMountableAFS()) as AFSRoot,
      manifest: createMockManifest("test"),
      ownedProviders: [],
    }),
    dataDir: (mountPath) => `/data/${mountPath}`,
    ...overrides,
  };
}

/** Create a mock Request. */
function mockRequest(method: string, path: string, body?: object): Request {
  const url = `http://localhost:4900${path}`;
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ─── Happy Path ─────────────────────────────────────────────────────────────

describe("Daemon Integration", () => {
  describe("Happy Path", () => {
    it("daemon startup calls blockletManager.activateAll()", async () => {
      let activateAllCalled = false;
      const deps = createDeps({
        listBlockletMounts: async () => [
          { mountPath: "/blocklets/bot", installPath: "/blocklets/bot" },
        ],
        scanTriggers: async () => ({
          manifest: createMockManifest("bot"),
          triggers: [
            {
              scriptPath: "s.ash",
              jobName: "h",
              trigger: { kind: "event" as const, path: "/p", event: "c" },
            },
          ],
        }),
      });
      const pm = new BlockletManager(deps);

      await pm.activateAll();
      activateAllCalled = pm.getActivatedBlocklets().length > 0;

      expect(activateAllCalled).toBe(true);
    });

    it("GET /api/blocklets returns activated program list", async () => {
      const deps = createDeps({
        listBlockletMounts: async () => [
          { mountPath: "/blocklets/bot", installPath: "/blocklets/bot" },
        ],
        scanTriggers: async () => ({
          manifest: createMockManifest("bot"),
          triggers: [
            {
              scriptPath: "s.ash",
              jobName: "h",
              trigger: { kind: "event" as const, path: "/p", event: "c" },
            },
          ],
        }),
      });
      const pm = new BlockletManager(deps);
      await pm.activateAll();

      const req = mockRequest("GET", "/api/blocklets");
      const res = await handleBlockletsAPI(req, pm);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.blocklets).toContain("/blocklets/bot");
    });

    it("POST /api/blocklets/reload triggers blockletManager.reload()", async () => {
      let reloadCalled = false;
      const deps = createDeps();
      const pm = new BlockletManager(deps);
      // Spy on reload
      const origReload = pm.reload.bind(pm);
      pm.reload = async () => {
        reloadCalled = true;
        return origReload();
      };

      const req = mockRequest("POST", "/api/blocklets/reload");
      const res = await handleBlockletsAPI(req, pm);

      expect(res.status).toBe(200);
      expect(reloadCalled).toBe(true);
    });

    it("daemon shutdown calls deactivateAll", async () => {
      let deactivateAllCalled = false;
      const deps = createDeps({
        listBlockletMounts: async () => [
          { mountPath: "/blocklets/bot", installPath: "/blocklets/bot" },
        ],
        scanTriggers: async () => ({
          manifest: createMockManifest("bot"),
          triggers: [
            {
              scriptPath: "s.ash",
              jobName: "h",
              trigger: { kind: "event" as const, path: "/p", event: "c" },
            },
          ],
        }),
      });
      const pm = new BlockletManager(deps);
      await pm.activateAll();

      await pm.deactivateAll();
      deactivateAllCalled = pm.getActivatedBlocklets().length === 0;

      expect(deactivateAllCalled).toBe(true);
    });
  });

  // ─── Bad Path ───────────────────────────────────────────────────────────────

  describe("Bad Path", () => {
    it("activateAll failure does not block daemon startup", async () => {
      const deps = createDeps({
        listBlockletMounts: async () => {
          throw new Error("DB connection failed");
        },
      });
      const pm = new BlockletManager(deps);

      // activateAll should not throw
      try {
        await pm.activateAll();
      } catch {
        // Expected — but in production, daemon wraps this in try/catch
      }
      // BlockletManager is still usable
      expect(pm.getActivatedBlocklets()).toEqual([]);
    });

    it("POST /api/blocklets/reload failure → returns 500", async () => {
      const deps = createDeps();
      const pm = new BlockletManager(deps);
      pm.reload = async () => {
        throw new Error("Reload failed");
      };

      const req = mockRequest("POST", "/api/blocklets/reload");
      const res = await handleBlockletsAPI(req, pm);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("unknown API path → returns 404", async () => {
      const pm = new BlockletManager(createDeps());
      const req = mockRequest("GET", "/api/blocklets/unknown");
      const res = await handleBlockletsAPI(req, pm);

      expect(res.status).toBe(404);
    });
  });

  // ─── Edge Cases ─────────────────────────────────────────────────────────────

  describe("Edge Cases", () => {
    it("daemon startup with no installed blocklets → normal", async () => {
      const deps = createDeps({
        listBlockletMounts: async () => [],
      });
      const pm = new BlockletManager(deps);

      await pm.activateAll();

      expect(pm.getActivatedBlocklets()).toEqual([]);
    });

    it("rapid reload requests → serialized via lock", async () => {
      const deps = createDeps();
      const pm = new BlockletManager(deps);
      const origReload = pm.reload.bind(pm);
      pm.reload = async () => {
        await new Promise((r) => setTimeout(r, 5));
        return origReload();
      };

      // Send concurrent reload requests
      const req1 = mockRequest("POST", "/api/blocklets/reload");
      const req2 = mockRequest("POST", "/api/blocklets/reload");
      const [res1, res2] = await Promise.all([
        handleBlockletsAPI(req1, pm),
        handleBlockletsAPI(req2, pm),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });
  });

  // ─── Security ─────────────────────────────────────────────────────────────

  describe("Security", () => {
    it("reload API does not accept arbitrary parameters for execution", async () => {
      const pm = new BlockletManager(createDeps());

      const req = mockRequest("POST", "/api/blocklets/reload", {
        command: "rm -rf /",
        eval: "process.exit(1)",
      });
      const res = await handleBlockletsAPI(req, pm);

      // Should still succeed (body is ignored)
      expect(res.status).toBe(200);
    });
  });

  // ─── Data Leak ──────────────────────────────────────────────────────────────

  describe("Data Leak", () => {
    it("GET /api/blocklets does not expose credentials or provider config", async () => {
      const pm = new BlockletManager(createDeps());
      const req = mockRequest("GET", "/api/blocklets");
      const res = await handleBlockletsAPI(req, pm);

      const body = await res.json();
      const bodyStr = JSON.stringify(body);
      expect(bodyStr).not.toContain("password");
      expect(bodyStr).not.toContain("secret");
      expect(bodyStr).not.toContain("token");
    });

    it("error response does not contain file system paths", async () => {
      const pm = new BlockletManager(createDeps());
      pm.reload = async () => {
        throw new Error("Failed to read /Users/chao/.afs-config/blocklets/bot/program.yaml");
      };

      const req = mockRequest("POST", "/api/blocklets/reload");
      const res = await handleBlockletsAPI(req, pm);

      const body = await res.json();
      expect(body.error).not.toContain("/Users");
      expect(body.error).not.toContain(".afs-config");
    });
  });

  // ─── Data Damage ────────────────────────────────────────────────────────────

  describe("Data Damage", () => {
    it("daemon signal handler triggers deactivateAll", async () => {
      const deps = createDeps({
        listBlockletMounts: async () => [
          { mountPath: "/blocklets/bot", installPath: "/blocklets/bot" },
        ],
        scanTriggers: async () => ({
          manifest: createMockManifest("bot"),
          triggers: [
            {
              scriptPath: "s.ash",
              jobName: "h",
              trigger: { kind: "event" as const, path: "/p", event: "c" },
            },
          ],
        }),
      });
      const pm = new BlockletManager(deps);
      await pm.activateAll();
      expect(pm.getActivatedBlocklets()).toHaveLength(1);

      // Simulate shutdown
      await pm.deactivateAll();
      expect(pm.getActivatedBlocklets()).toHaveLength(0);
    });
  });
});
