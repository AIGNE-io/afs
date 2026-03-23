import { beforeEach, describe, expect, test } from "bun:test";
import { AFS, type AFSModule, AFSSeverityError } from "@aigne/afs";

/**
 * Helper: create a module with configurable actionPolicy + action severity.
 * The module lists actions at /.actions with specified severity on each action entry.
 */
function createModuleWithActions(
  name: string,
  actions: Array<{ name: string; severity?: "ambient" | "boundary" | "critical" }>,
  actionPolicy?: "safe" | "standard" | "full",
  opts?: { blockedActions?: string[]; allowedActions?: string[] },
): AFSModule {
  return {
    name,
    accessMode: "readwrite",
    actionPolicy,
    blockedActions: opts?.blockedActions,
    allowedActions: opts?.allowedActions,
    stat: async (path: string) => ({
      data: { id: path.split("/").pop() || "/", path, meta: { childrenCount: 0 } },
    }),
    read: async (path: string) => {
      // Return action metadata with severity for individual action reads
      const actionName = path.match(/\.actions\/([^/]+)$/)?.[1];
      if (actionName) {
        const action = actions.find((a) => a.name === actionName);
        if (action) {
          return {
            data: {
              id: actionName,
              path,
              meta: {
                kind: "afs:executable",
                severity: action.severity,
                inputSchema: { type: "object", properties: {} },
              },
            },
          };
        }
      }
      return { data: { id: path.split("/").pop() || "/", path, content: "test" } };
    },
    list: async (path: string) => {
      if (path === "/.actions") {
        return {
          data: actions.map((a) => ({
            id: a.name,
            path: `/.actions/${a.name}`,
            meta: {
              kind: "afs:executable",
              severity: a.severity,
            },
          })),
        };
      }
      return { data: [] };
    },
    exec: async (_path: string, _args: Record<string, any>) => ({
      success: true,
      data: { executed: true },
    }),
  };
}

describe("exec guard — action policy enforcement", () => {
  describe("safe policy", () => {
    let afs: AFS;

    beforeEach(async () => {
      const module = createModuleWithActions(
        "safe-mod",
        [
          { name: "ambient-action", severity: "ambient" },
          { name: "boundary-action", severity: "boundary" },
          { name: "critical-action", severity: "critical" },
          { name: "no-severity-action" }, // defaults to "boundary"
        ],
        "safe",
      );
      afs = new AFS();
      await afs.mount(module, "/safe");
    });

    test("allows ambient actions", async () => {
      const result = await afs.exec("/safe/.actions/ambient-action", {}, {});
      expect(result.success).toBe(true);
    });

    test("blocks boundary actions", async () => {
      try {
        await afs.exec("/safe/.actions/boundary-action", {}, {});
        expect.unreachable("Should have thrown AFSSeverityError");
      } catch (error) {
        expect(error).toBeInstanceOf(AFSSeverityError);
        expect((error as AFSSeverityError).code).toBe("AFS_SEVERITY_DENIED");
        expect((error as AFSSeverityError).actionName).toBe("boundary-action");
        expect((error as AFSSeverityError).severity).toBe("boundary");
        expect((error as AFSSeverityError).policy).toBe("safe");
      }
    });

    test("blocks critical actions", async () => {
      try {
        await afs.exec("/safe/.actions/critical-action", {}, {});
        expect.unreachable("Should have thrown AFSSeverityError");
      } catch (error) {
        expect(error).toBeInstanceOf(AFSSeverityError);
        expect((error as AFSSeverityError).severity).toBe("critical");
      }
    });

    test("blocks actions without severity (defaults to boundary)", async () => {
      try {
        await afs.exec("/safe/.actions/no-severity-action", {}, {});
        expect.unreachable("Should have thrown AFSSeverityError");
      } catch (error) {
        expect(error).toBeInstanceOf(AFSSeverityError);
        expect((error as AFSSeverityError).severity).toBe("boundary");
      }
    });
  });

  describe("standard policy", () => {
    let afs: AFS;

    beforeEach(async () => {
      const module = createModuleWithActions(
        "standard-mod",
        [
          { name: "ambient-action", severity: "ambient" },
          { name: "boundary-action", severity: "boundary" },
          { name: "critical-action", severity: "critical" },
        ],
        "standard",
      );
      afs = new AFS();
      await afs.mount(module, "/standard");
    });

    test("allows ambient actions", async () => {
      const result = await afs.exec("/standard/.actions/ambient-action", {}, {});
      expect(result.success).toBe(true);
    });

    test("allows boundary actions", async () => {
      const result = await afs.exec("/standard/.actions/boundary-action", {}, {});
      expect(result.success).toBe(true);
    });

    test("blocks critical actions", async () => {
      try {
        await afs.exec("/standard/.actions/critical-action", {}, {});
        expect.unreachable("Should have thrown AFSSeverityError");
      } catch (error) {
        expect(error).toBeInstanceOf(AFSSeverityError);
        expect((error as AFSSeverityError).code).toBe("AFS_SEVERITY_DENIED");
        expect((error as AFSSeverityError).severity).toBe("critical");
        expect((error as AFSSeverityError).policy).toBe("standard");
      }
    });
  });

  describe("full policy", () => {
    let afs: AFS;

    beforeEach(async () => {
      const module = createModuleWithActions(
        "full-mod",
        [
          { name: "ambient-action", severity: "ambient" },
          { name: "boundary-action", severity: "boundary" },
          { name: "critical-action", severity: "critical" },
        ],
        "full",
      );
      afs = new AFS();
      await afs.mount(module, "/full");
    });

    test("allows ambient actions", async () => {
      const result = await afs.exec("/full/.actions/ambient-action", {}, {});
      expect(result.success).toBe(true);
    });

    test("allows boundary actions", async () => {
      const result = await afs.exec("/full/.actions/boundary-action", {}, {});
      expect(result.success).toBe(true);
    });

    test("allows critical actions", async () => {
      const result = await afs.exec("/full/.actions/critical-action", {}, {});
      expect(result.success).toBe(true);
    });
  });

  describe("policy check ordering", () => {
    test("readonly check happens before severity check", async () => {
      let execCalled = false;
      const module: AFSModule = {
        name: "ro-sev-mod",
        accessMode: "readonly",
        actionPolicy: "full",
        stat: async (path: string) => ({
          data: { id: path.split("/").pop() || "/", path, meta: { childrenCount: 0 } },
        }),
        read: async (path: string) => ({
          data: { id: path.split("/").pop() || "/", path, content: "test" },
        }),
        exec: async () => {
          execCalled = true;
          return { success: true, data: {} };
        },
      };

      const afs = new AFS();
      await afs.mount(module, "/ro");

      try {
        await afs.exec("/ro/.actions/test", {}, {});
        expect.unreachable("Should have thrown");
      } catch (error) {
        // Should be AFSReadonlyError, not AFSSeverityError
        expect((error as any).code).toBe("AFS_READONLY");
      }
      expect(execCalled).toBe(false);
    });

    test("severity check happens before args validation", async () => {
      let execCalled = false;
      const module = createModuleWithActions(
        "order-mod",
        [{ name: "critical-action", severity: "critical" }],
        "safe", // blocks critical
      );
      // Override exec to track calls
      module.exec = async () => {
        execCalled = true;
        return { success: true, data: {} };
      };

      const afs = new AFS();
      await afs.mount(module, "/order");

      try {
        await afs.exec("/order/.actions/critical-action", { invalid: "args" }, {});
        expect.unreachable("Should have thrown AFSSeverityError");
      } catch (error) {
        expect(error).toBeInstanceOf(AFSSeverityError);
      }
      expect(execCalled).toBe(false);
    });
  });

  describe("error message format", () => {
    test("includes action name, severity, and policy in message", async () => {
      const module = createModuleWithActions(
        "msg-mod",
        [{ name: "unlock", severity: "critical" }],
        "standard",
      );
      const afs = new AFS();
      await afs.mount(module, "/msg");

      try {
        await afs.exec("/msg/.actions/unlock", {}, {});
        expect.unreachable("Should have thrown AFSSeverityError");
      } catch (error) {
        const e = error as AFSSeverityError;
        expect(e.message).toContain("unlock");
        expect(e.message).toContain("critical");
        expect(e.message).toContain("standard");
      }
    });
  });

  describe("modules without actionPolicy", () => {
    test("no enforcement when actionPolicy is undefined (backward compatible)", async () => {
      const module = createModuleWithActions("default-mod", [
        { name: "boundary-action", severity: "boundary" },
        { name: "critical-action", severity: "critical" },
      ]);
      // actionPolicy not set → no enforcement
      const afs = new AFS();
      await afs.mount(module, "/default");

      // All actions should be allowed
      const r1 = await afs.exec("/default/.actions/boundary-action", {}, {});
      expect(r1.success).toBe(true);

      const r2 = await afs.exec("/default/.actions/critical-action", {}, {});
      expect(r2.success).toBe(true);
    });
  });

  describe("blockedActions", () => {
    test("blocks action even when severity would allow it", async () => {
      const module = createModuleWithActions(
        "blocked-mod",
        [{ name: "unlock", severity: "ambient" }],
        "full", // full policy would allow everything
        { blockedActions: ["unlock"] },
      );
      const afs = new AFS();
      await afs.mount(module, "/blocked");

      try {
        await afs.exec("/blocked/.actions/unlock", {}, {});
        expect.unreachable("Should have thrown AFSSeverityError");
      } catch (error) {
        expect(error).toBeInstanceOf(AFSSeverityError);
        expect((error as AFSSeverityError).actionName).toBe("unlock");
        expect((error as AFSSeverityError).severity).toBe("blocked-by-policy");
      }
    });

    test("blocks action even when allowedActions includes it (blocked wins)", async () => {
      const module = createModuleWithActions(
        "blocked-wins-mod",
        [{ name: "unlock", severity: "ambient" }],
        "full",
        { blockedActions: ["unlock"], allowedActions: ["unlock"] },
      );
      const afs = new AFS();
      await afs.mount(module, "/bw");

      try {
        await afs.exec("/bw/.actions/unlock", {}, {});
        expect.unreachable("Should have thrown AFSSeverityError");
      } catch (error) {
        expect(error).toBeInstanceOf(AFSSeverityError);
        expect((error as AFSSeverityError).actionName).toBe("unlock");
      }
    });

    test("allows non-blocked actions normally", async () => {
      const module = createModuleWithActions(
        "partial-block-mod",
        [
          { name: "lock", severity: "ambient" },
          { name: "unlock", severity: "ambient" },
        ],
        "safe",
        { blockedActions: ["unlock"] },
      );
      const afs = new AFS();
      await afs.mount(module, "/pb");

      const result = await afs.exec("/pb/.actions/lock", {}, {});
      expect(result.success).toBe(true);
    });

    test("blocks action even without actionPolicy set", async () => {
      const module = createModuleWithActions(
        "no-policy-blocked",
        [{ name: "unlock", severity: "ambient" }],
        undefined, // no policy
        { blockedActions: ["unlock"] },
      );
      const afs = new AFS();
      await afs.mount(module, "/npb");

      try {
        await afs.exec("/npb/.actions/unlock", {}, {});
        expect.unreachable("Should have thrown AFSSeverityError");
      } catch (error) {
        expect(error).toBeInstanceOf(AFSSeverityError);
      }
    });
  });

  describe("allowedActions", () => {
    test("allows action that severity would block", async () => {
      const module = createModuleWithActions(
        "allowed-mod",
        [{ name: "critical-action", severity: "critical" }],
        "safe", // safe blocks critical
        { allowedActions: ["critical-action"] },
      );
      const afs = new AFS();
      await afs.mount(module, "/allowed");

      const result = await afs.exec("/allowed/.actions/critical-action", {}, {});
      expect(result.success).toBe(true);
    });

    test("does not affect non-listed actions (severity still enforced)", async () => {
      const module = createModuleWithActions(
        "partial-allow-mod",
        [
          { name: "allowed-one", severity: "critical" },
          { name: "not-allowed", severity: "critical" },
        ],
        "safe",
        { allowedActions: ["allowed-one"] },
      );
      const afs = new AFS();
      await afs.mount(module, "/pa");

      const result = await afs.exec("/pa/.actions/allowed-one", {}, {});
      expect(result.success).toBe(true);

      try {
        await afs.exec("/pa/.actions/not-allowed", {}, {});
        expect.unreachable("Should have thrown AFSSeverityError");
      } catch (error) {
        expect(error).toBeInstanceOf(AFSSeverityError);
      }
    });
  });

  describe("severity floor from riskLevel (M5)", () => {
    test("system-risk provider with self-declared ambient action gets floor to boundary", async () => {
      const module = createModuleWithActions(
        "system-risk-mod",
        [{ name: "ambient-action", severity: "ambient" }],
        "safe", // safe only allows ambient — but floor lifts it to boundary
      );
      (module as any).riskLevel = "system";

      const afs = new AFS();
      await afs.mount(module, "/sysrisk");

      try {
        await afs.exec("/sysrisk/.actions/ambient-action", {}, {});
        expect.unreachable("Should have thrown AFSSeverityError — floor lifted to boundary");
      } catch (error) {
        expect(error).toBeInstanceOf(AFSSeverityError);
      }
    });

    test("external-risk provider with self-declared ambient action gets floor to boundary", async () => {
      const module = createModuleWithActions(
        "ext-risk-mod",
        [{ name: "ambient-action", severity: "ambient" }],
        "safe",
      );
      (module as any).riskLevel = "external";

      const afs = new AFS();
      await afs.mount(module, "/extrisk");

      try {
        await afs.exec("/extrisk/.actions/ambient-action", {}, {});
        expect.unreachable("Should have thrown AFSSeverityError — floor lifted to boundary");
      } catch (error) {
        expect(error).toBeInstanceOf(AFSSeverityError);
      }
    });

    test("sandboxed-risk provider allows self-declared ambient action", async () => {
      const module = createModuleWithActions(
        "sandbox-mod",
        [{ name: "ambient-action", severity: "ambient" }],
        "safe",
      );
      (module as any).riskLevel = "sandboxed";

      const afs = new AFS();
      await afs.mount(module, "/sandbox");

      const result = await afs.exec("/sandbox/.actions/ambient-action", {}, {});
      expect(result.success).toBe(true);
    });

    test("system-risk provider with standard policy allows boundary actions", async () => {
      const module = createModuleWithActions(
        "sys-boundary",
        [{ name: "boundary-action", severity: "boundary" }],
        "standard", // allows ambient + boundary
      );
      (module as any).riskLevel = "system";

      const afs = new AFS();
      await afs.mount(module, "/sysb");

      // boundary is already >= floor(boundary), so this should pass
      const result = await afs.exec("/sysb/.actions/boundary-action", {}, {});
      expect(result.success).toBe(true);
    });

    test("no riskLevel = no floor enforcement (backward compatible)", async () => {
      const module = createModuleWithActions(
        "norisk-mod",
        [{ name: "ambient-action", severity: "ambient" }],
        "safe",
      );
      // No riskLevel set

      const afs = new AFS();
      await afs.mount(module, "/norisk");

      const result = await afs.exec("/norisk/.actions/ambient-action", {}, {});
      expect(result.success).toBe(true);
    });
  });

  describe("nested action paths", () => {
    test("extracts action name from nested path", async () => {
      // Create a module that handles nested action paths
      const module: AFSModule = {
        name: "nested-mod",
        accessMode: "readwrite",
        actionPolicy: "safe",
        stat: async (path: string) => ({
          data: { id: path.split("/").pop() || "/", path, meta: { childrenCount: 0 } },
        }),
        read: async (path: string) => {
          if (path.includes("/.actions/critical-action")) {
            return {
              data: {
                id: "critical-action",
                path,
                meta: {
                  kind: "afs:executable",
                  severity: "critical",
                },
              },
            };
          }
          return { data: { id: path.split("/").pop() || "/", path, content: "test" } };
        },
        exec: async (_path: string, _args: Record<string, any>) => ({
          success: true,
          data: { executed: true },
        }),
      };

      const afs = new AFS();
      await afs.mount(module, "/nested");

      try {
        await afs.exec("/nested/sub/path/.actions/critical-action", {}, {});
        expect.unreachable("Should have thrown AFSSeverityError");
      } catch (error) {
        expect(error).toBeInstanceOf(AFSSeverityError);
        expect((error as AFSSeverityError).actionName).toBe("critical-action");
      }
    });
  });
});
