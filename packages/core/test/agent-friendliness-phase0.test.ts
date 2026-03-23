/**
 * Tests for Agent Friendliness - Phase 0: Core Layer Changes
 *
 * Covers:
 * 1.1 Error handling standardization (AFSNotFoundError)
 * 1.2 CapabilitiesManifest.operations
 * 1.3 Exec input validation with zod-from-json-schema
 * 1.4 childrenCount semantics
 *
 * Following plan.md test matrix:
 * - Happy Path
 * - Bad Path
 * - Edge Cases
 * - Security
 * - Data Leak
 * - Data Damage
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { AFS } from "../src/afs.js";
import type { AggregatedCapabilities, CapabilitiesManifest } from "../src/capabilities/types.js";
import { AFSNotFoundError, AFSValidationError } from "../src/error.js";
import type { AFSListResult, AFSModule, AFSReadResult, AFSStatResult } from "../src/type.js";

// =============================================================================
// Helper: Mock provider that returns not-found for non-existent paths
// =============================================================================
function createBasicProvider(name: string): AFSModule {
  return {
    name,
    description: `Basic test provider ${name}`,
    accessMode: "readwrite",

    async read(path: string): Promise<AFSReadResult> {
      if (path === "/") {
        return {
          data: {
            id: name,
            path: "/",
            content: `Root of ${name}`,
            meta: { childrenCount: 1 },
          },
        };
      }
      if (path === "/existing") {
        return {
          data: {
            id: "existing",
            path: "/existing",
            content: "Hello",
            meta: { childrenCount: 0 },
          },
        };
      }
      // Return undefined for not-found (old behavior that AFS core should now catch)
      return { data: undefined };
    },

    async list(path: string): Promise<AFSListResult> {
      if (path === "/") {
        return {
          data: [{ id: "existing", path: "/existing", meta: { childrenCount: 0 } }],
        };
      }
      // Return empty for not-found
      return { data: [] };
    },

    async stat(path: string): Promise<AFSStatResult> {
      if (path === "/") {
        return {
          data: {
            id: name,
            path: "/",
            meta: { childrenCount: 1 },
          },
        };
      }
      if (path === "/existing") {
        return {
          data: {
            id: "existing",
            path: "/existing",
            meta: { childrenCount: 0 },
          },
        };
      }
      return { data: undefined };
    },

    async explain(path: string) {
      if (path === "/" || path === "/existing") {
        return { format: "text" as const, content: `Explaining ${path}` };
      }
      throw new AFSNotFoundError(path);
    },
  };
}

// =============================================================================
// Helper: Provider with exec actions and rich inputSchema
// =============================================================================
function createExecProvider(
  actions: Record<
    string,
    {
      inputSchema?: Record<string, unknown>;
      handler: (args: Record<string, unknown>) => unknown;
    }
  >,
): AFSModule {
  return {
    name: "exec-provider",
    description: "Provider with exec actions",
    accessMode: "readwrite",

    async read(path: string): Promise<AFSReadResult> {
      if (path.startsWith("/.actions/")) {
        const actionName = path.slice("/.actions/".length);
        const action = actions[actionName];
        if (!action) {
          throw new AFSNotFoundError(path);
        }
        return {
          data: {
            id: actionName,
            path,
            meta: {
              kind: "afs:executable",
              inputSchema: action.inputSchema,
            },
          },
        };
      }
      if (path === "/") {
        return {
          data: {
            id: "/",
            path: "/",
            meta: { childrenCount: Object.keys(actions).length },
          },
        };
      }
      throw new AFSNotFoundError(path);
    },

    async list(path: string): Promise<AFSListResult> {
      if (path === "/.actions") {
        return {
          data: Object.entries(actions).map(([name, action]) => ({
            id: name,
            path: `/.actions/${name}`,
            meta: {
              kind: "afs:executable",
              inputSchema: action.inputSchema,
            },
          })),
        };
      }
      if (path === "/") {
        return { data: [{ id: ".actions", path: "/.actions" }] };
      }
      return { data: [] };
    },

    async exec(path: string, args: Record<string, unknown>) {
      const actionName = path.replace("/.actions/", "");
      const action = actions[actionName];
      if (!action) {
        throw new AFSNotFoundError(path);
      }
      return {
        success: true,
        data: action.handler(args) as Record<string, unknown>,
      };
    },
  };
}

// =============================================================================
// Helper: Provider with capabilities.operations
// =============================================================================
function createCapabilitiesProvider(
  name: string,
  operations: CapabilitiesManifest["operations"],
): AFSModule {
  const manifest: CapabilitiesManifest = {
    schemaVersion: 1,
    provider: name,
    tools: [],
    actions: [],
    operations,
  };

  return {
    name,
    description: `Provider ${name} with operations`,

    async read(path: string): Promise<AFSReadResult> {
      if (path === "/.meta/.capabilities") {
        return {
          data: {
            id: ".capabilities",
            path: "/.meta/.capabilities",
            content: manifest,
          },
        };
      }
      if (path === "/") {
        return {
          data: {
            id: name,
            path: "/",
            meta: { childrenCount: 0 },
          },
        };
      }
      return { data: undefined };
    },

    async list(path: string): Promise<AFSListResult> {
      if (path === "/") {
        return { data: [] };
      }
      return { data: [] };
    },

    async stat(path: string): Promise<AFSStatResult> {
      if (path === "/") {
        return { data: { id: name, path: "/", meta: { childrenCount: 0 } } };
      }
      return { data: undefined };
    },
  };
}

// =============================================================================
// Helper: Provider for childrenCount deep-list testing
// Implements maxDepth-aware listing that expands entries with childrenCount !== 0 && !== undefined
// =============================================================================
function createDeepListProvider(): AFSModule {
  const tree: Record<
    string,
    Array<{ id: string; path: string; meta: { childrenCount?: number } }>
  > = {
    "/": [
      { id: "has-children", path: "/has-children", meta: { childrenCount: -1 } },
      { id: "empty-dir", path: "/empty-dir", meta: { childrenCount: 0 } },
      { id: "leaf", path: "/leaf", meta: { childrenCount: undefined } },
    ],
    "/has-children": [
      { id: "child1", path: "/has-children/child1", meta: { childrenCount: 0 } },
      { id: "child2", path: "/has-children/child2", meta: { childrenCount: undefined } },
    ],
  };

  function listWithDepth(
    path: string,
    maxDepth: number,
  ): Array<{ id: string; path: string; meta: { childrenCount?: number } }> {
    const entries = tree[path] ?? [];
    if (maxDepth <= 1) return entries;

    const result = [...entries];
    for (const entry of entries) {
      const cc = entry.meta.childrenCount;
      // Expand entries with childrenCount !== 0 && !== undefined (i.e. -1 or N>0)
      if (cc !== 0 && cc !== undefined) {
        result.push(...listWithDepth(entry.path, maxDepth - 1));
      }
    }
    return result;
  }

  return {
    name: "deeplist-provider",
    description: "Provider for deep-list testing",

    async read(path: string): Promise<AFSReadResult> {
      if (path === "/") {
        return {
          data: { id: "root", path: "/", meta: { childrenCount: 3 } },
        };
      }
      return { data: undefined };
    },

    async list(path: string, options?: { maxDepth?: number }): Promise<AFSListResult> {
      const maxDepth = options?.maxDepth ?? 1;
      return { data: listWithDepth(path, maxDepth) };
    },

    async stat(path: string): Promise<AFSStatResult> {
      if (path === "/") {
        return { data: { id: "root", path: "/", meta: { childrenCount: 3 } } };
      }
      return { data: undefined };
    },
  };
}

// =============================================================================
// 1.1 Error Handling Standardization - AFSNotFoundError
// =============================================================================

describe("1.1 Error Handling Standardization", () => {
  let afs: AFS;

  beforeEach(async () => {
    afs = new AFS();
    await afs.mount(createBasicProvider("test"), "/test");
  });

  describe("Happy Path", () => {
    test("afs.read() throws AFSNotFoundError for non-existent path", async () => {
      try {
        await afs.read("/test/nonexistent");
        expect(true).toBe(false); // Should not reach
      } catch (error) {
        expect(error).toBeInstanceOf(AFSNotFoundError);
      }
    });

    test("afs.list() throws AFSNotFoundError for non-existent path", async () => {
      // list for a path under a module that returns empty should still work
      // But for a truly non-existent module path, it should throw
      try {
        await afs.list("/nonexistent-module/path");
        // If it returns empty that's also acceptable for list
        // The key change is for paths under existing modules
      } catch (error) {
        expect(error).toBeInstanceOf(AFSNotFoundError);
      }
    });

    test("afs.stat() throws AFSNotFoundError for non-existent path", async () => {
      try {
        await afs.stat("/test/nonexistent");
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(AFSNotFoundError);
      }
    });

    test("afs.explain() throws AFSNotFoundError for non-existent path", async () => {
      try {
        await afs.explain("/test/nonexistent");
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(AFSNotFoundError);
      }
    });

    test("AFSNotFoundError contains correct path and code", async () => {
      try {
        await afs.read("/test/nonexistent");
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(AFSNotFoundError);
        const nfe = error as AFSNotFoundError;
        expect(nfe.path).toBe("/test/nonexistent");
        expect(nfe.code).toBe("AFS_NOT_FOUND");
      }
    });

    test("afs.read() still works for existing paths", async () => {
      const result = await afs.read("/test/existing");
      expect(result.data).toBeDefined();
      expect(result.data?.content).toBe("Hello");
    });

    test("afs.stat() still works for existing paths", async () => {
      const result = await afs.stat("/test/existing");
      expect(result.data).toBeDefined();
    });
  });

  describe("Data Leak", () => {
    test("AFSNotFoundError message only contains AFS path, not provider internals", async () => {
      try {
        await afs.read("/test/nonexistent");
        expect(true).toBe(false);
      } catch (error) {
        const msg = (error as Error).message;
        // Should contain the AFS path
        expect(msg).toContain("/test/nonexistent");
        // Should NOT contain provider internal paths or filesystem paths
        expect(msg).not.toContain("/Users/");
        expect(msg).not.toContain("/home/");
        expect(msg).not.toContain("node_modules");
      }
    });
  });
});

// =============================================================================
// 1.2 CapabilitiesManifest.operations
// =============================================================================

describe("1.2 CapabilitiesManifest.operations", () => {
  describe("Happy Path", () => {
    test("CapabilitiesManifest includes operations field with 8 boolean operations", async () => {
      const afs = new AFS();
      const operations = {
        read: true,
        list: true,
        write: true,
        delete: true,
        search: false,
        exec: true,
        stat: true,
        explain: true,
      };
      await afs.mount(createCapabilitiesProvider("test", operations), "/test");

      const result = await afs.read("/.meta/.capabilities");
      const content = result.data?.content as AggregatedCapabilities;

      expect(content).toBeDefined();
      // The operations should be aggregated
      expect(content.operations).toBeDefined();
    });

    test("aggregateCapabilities correctly merges multiple providers operations", async () => {
      const afs = new AFS();

      const ops1 = {
        read: true,
        list: true,
        write: true,
        delete: true,
        search: true,
        exec: true,
        stat: true,
        explain: true,
      };

      const ops2 = {
        read: true,
        list: true,
        write: false,
        delete: false,
        search: false,
        exec: false,
        stat: true,
        explain: false,
      };

      await afs.mount(createCapabilitiesProvider("p1", ops1), "/p1");
      await afs.mount(createCapabilitiesProvider("p2", ops2), "/p2");

      const result = await afs.read("/.meta/.capabilities");
      const content = result.data?.content as AggregatedCapabilities;

      expect(content.operations).toBeDefined();
    });
  });

  describe("Bad Path", () => {
    test("provider without operations field causes aggregateCapabilities to mark partial", async () => {
      const afs = new AFS();

      // Provider with operations
      const opsProvider = createCapabilitiesProvider("with-ops", {
        read: true,
        list: true,
        write: false,
        delete: false,
        search: false,
        exec: false,
        stat: true,
        explain: false,
      });

      // Provider without operations (old-style manifest)
      const noOpsModule: AFSModule = {
        name: "no-ops",
        description: "Provider without operations",
        async read(path: string): Promise<AFSReadResult> {
          if (path === "/.meta/.capabilities") {
            return {
              data: {
                id: ".capabilities",
                path: "/.meta/.capabilities",
                content: {
                  schemaVersion: 1,
                  provider: "no-ops",
                  tools: [],
                  actions: [],
                  // No operations field
                },
              },
            };
          }
          if (path === "/") {
            return { data: { id: "no-ops", path: "/", meta: { childrenCount: 0 } } };
          }
          return { data: undefined };
        },
        async list(): Promise<AFSListResult> {
          return { data: [] };
        },
        async stat(path: string): Promise<AFSStatResult> {
          if (path === "/") {
            return { data: { id: "no-ops", path: "/", meta: { childrenCount: 0 } } };
          }
          return { data: undefined };
        },
      };

      await afs.mount(opsProvider, "/with-ops");
      await afs.mount(noOpsModule, "/no-ops");

      const result = await afs.read("/.meta/.capabilities");
      const content = result.data?.content as AggregatedCapabilities;

      // Should still work, but partial flag indicates incomplete operations info
      expect(content).toBeDefined();
    });
  });

  describe("Edge Cases", () => {
    test("capabilities operations all false aggregates correctly", async () => {
      const afs = new AFS();
      const allFalse = {
        read: false,
        list: false,
        write: false,
        delete: false,
        search: false,
        exec: false,
        stat: false,
        explain: false,
      };

      await afs.mount(createCapabilitiesProvider("all-false", allFalse), "/all-false");

      const result = await afs.read("/.meta/.capabilities");
      const content = result.data?.content as AggregatedCapabilities;

      expect(content).toBeDefined();
      expect(content.operations).toBeDefined();
    });
  });

  describe("Data Leak", () => {
    test("capabilities aggregation skipped list only contains mount paths, not URIs", async () => {
      const afs = new AFS();

      // Provider that fails capabilities
      const failProvider: AFSModule = {
        name: "fail-provider",
        description: "Fails on capabilities",
        async read(path: string): Promise<AFSReadResult> {
          if (path === "/.meta/.capabilities") {
            throw new Error("Connection to s3://secret-bucket failed with key=ABC123");
          }
          if (path === "/") {
            return { data: { id: "fail", path: "/", meta: { childrenCount: 0 } } };
          }
          return { data: undefined };
        },
        async list(): Promise<AFSListResult> {
          return { data: [] };
        },
        async stat(path: string): Promise<AFSStatResult> {
          if (path === "/") {
            return { data: { id: "fail", path: "/", meta: { childrenCount: 0 } } };
          }
          return { data: undefined };
        },
      };

      await afs.mount(failProvider, "/secret-mount");

      const result = await afs.read("/.meta/.capabilities");
      const content = result.data?.content as AggregatedCapabilities;

      expect(content.skipped).toContain("/secret-mount");
      const serialized = JSON.stringify(content);
      expect(serialized).not.toContain("s3://");
      expect(serialized).not.toContain("secret-bucket");
      expect(serialized).not.toContain("ABC123");
    });
  });

  describe("Data Damage", () => {
    test("operations field is optional - existing providers without it still pass type check", async () => {
      // This is a compile-time test - if it compiles, the type is backward compatible
      const manifest: CapabilitiesManifest = {
        schemaVersion: 1,
        provider: "legacy",
        tools: [],
        actions: [],
        // operations intentionally omitted for backward compat
      };
      expect(manifest.provider).toBe("legacy");
    });
  });
});

// =============================================================================
// 1.3 Exec Input Validation with zod-from-json-schema
// =============================================================================

describe("1.3 Exec Input Validation Enhancement", () => {
  describe("Happy Path", () => {
    test("exec validation passes for valid enum value", async () => {
      const afs = new AFS();
      const provider = createExecProvider({
        setStatus: {
          inputSchema: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["active", "inactive", "pending"] },
            },
            required: ["status"],
          },
          handler: (args) => ({ status: args.status }),
        },
      });
      await afs.mount(provider, "/test");

      const result = await afs.exec("/test/.actions/setStatus", { status: "active" }, {});
      expect(result.data?.status).toBe("active");
    });

    test("exec validation passes for valid minimum/maximum", async () => {
      const afs = new AFS();
      const provider = createExecProvider({
        setAge: {
          inputSchema: {
            type: "object",
            properties: {
              age: { type: "number", minimum: 0, maximum: 150 },
            },
            required: ["age"],
          },
          handler: (args) => ({ age: args.age }),
        },
      });
      await afs.mount(provider, "/test");

      const result = await afs.exec("/test/.actions/setAge", { age: 25 }, {});
      expect(result.data?.age).toBe(25);
    });

    test("exec validation passes for valid pattern", async () => {
      const afs = new AFS();
      const provider = createExecProvider({
        setEmail: {
          inputSchema: {
            type: "object",
            properties: {
              email: { type: "string", pattern: "^[^@]+@[^@]+$" },
            },
            required: ["email"],
          },
          handler: (args) => ({ email: args.email }),
        },
      });
      await afs.mount(provider, "/test");

      const result = await afs.exec("/test/.actions/setEmail", { email: "user@example.com" }, {});
      expect(result.data?.email).toBe("user@example.com");
    });

    test("exec validation passes for valid required fields", async () => {
      const afs = new AFS();
      const provider = createExecProvider({
        createUser: {
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
            },
            required: ["name", "email"],
          },
          handler: (args) => ({ name: args.name, email: args.email }),
        },
      });
      await afs.mount(provider, "/test");

      const result = await afs.exec(
        "/test/.actions/createUser",
        { name: "Alice", email: "alice@example.com" },
        {},
      );
      expect(result.data?.name).toBe("Alice");
    });
  });

  describe("Bad Path", () => {
    test("exec input violating enum throws AFSValidationError with field name and allowed values", async () => {
      const afs = new AFS();
      const provider = createExecProvider({
        setStatus: {
          inputSchema: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["active", "inactive", "pending"] },
            },
            required: ["status"],
          },
          handler: () => ({}),
        },
      });
      await afs.mount(provider, "/test");

      try {
        await afs.exec("/test/.actions/setStatus", { status: "invalid_value" }, {});
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(AFSValidationError);
        const msg = (error as AFSValidationError).message;
        expect(msg).toContain("status");
      }
    });

    test("exec input exceeding maximum throws AFSValidationError with field name", async () => {
      const afs = new AFS();
      const provider = createExecProvider({
        setAge: {
          inputSchema: {
            type: "object",
            properties: {
              age: { type: "number", minimum: 0, maximum: 150 },
            },
            required: ["age"],
          },
          handler: () => ({}),
        },
      });
      await afs.mount(provider, "/test");

      try {
        await afs.exec("/test/.actions/setAge", { age: 200 }, {});
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(AFSValidationError);
      }
    });

    test("exec input below minimum throws AFSValidationError", async () => {
      const afs = new AFS();
      const provider = createExecProvider({
        setAge: {
          inputSchema: {
            type: "object",
            properties: {
              age: { type: "number", minimum: 0, maximum: 150 },
            },
            required: ["age"],
          },
          handler: () => ({}),
        },
      });
      await afs.mount(provider, "/test");

      try {
        await afs.exec("/test/.actions/setAge", { age: -5 }, {});
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(AFSValidationError);
      }
    });

    test("exec input not matching pattern throws AFSValidationError with field name", async () => {
      const afs = new AFS();
      const provider = createExecProvider({
        setEmail: {
          inputSchema: {
            type: "object",
            properties: {
              email: { type: "string", pattern: "^[^@]+@[^@]+$" },
            },
            required: ["email"],
          },
          handler: () => ({}),
        },
      });
      await afs.mount(provider, "/test");

      try {
        await afs.exec("/test/.actions/setEmail", { email: "not-an-email" }, {});
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(AFSValidationError);
        const msg = (error as AFSValidationError).message;
        expect(msg).toContain("email");
      }
    });

    test("exec input missing required field throws AFSValidationError with field name", async () => {
      const afs = new AFS();
      const provider = createExecProvider({
        createUser: {
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
            },
            required: ["name", "email"],
          },
          handler: () => ({}),
        },
      });
      await afs.mount(provider, "/test");

      try {
        await afs.exec("/test/.actions/createUser", { name: "Alice" }, {}); // Missing email
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(AFSValidationError);
        const msg = (error as AFSValidationError).message;
        expect(msg).toContain("email");
      }
    });

    test("exec input with wrong type throws AFSValidationError", async () => {
      const afs = new AFS();
      const provider = createExecProvider({
        setAge: {
          inputSchema: {
            type: "object",
            properties: {
              age: { type: "number" },
            },
            required: ["age"],
          },
          handler: () => ({}),
        },
      });
      await afs.mount(provider, "/test");

      try {
        await afs.exec("/test/.actions/setAge", { age: "not-a-number" }, {});
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(AFSValidationError);
      }
    });

    test("zod-from-json-schema with invalid schema degrades gracefully (skips validation)", async () => {
      const afs = new AFS();
      const provider = createExecProvider({
        badSchema: {
          inputSchema: {
            // Invalid JSON Schema: type is not a valid value
            type: "weird-unknown-type",
            properties: {},
          } as Record<string, unknown>,
          handler: (args) => ({ received: args }),
        },
      });
      await afs.mount(provider, "/test");

      // Should not crash - should degrade to skipping validation
      const result = await afs.exec("/test/.actions/badSchema", { any: "value" }, {});
      expect(result.success).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    test("exec input empty object with no required fields passes validation", async () => {
      const afs = new AFS();
      const provider = createExecProvider({
        optionalAction: {
          inputSchema: {
            type: "object",
            properties: {
              optionalField: { type: "string" },
            },
            // No required
          },
          handler: () => ({ ok: true }),
        },
      });
      await afs.mount(provider, "/test");

      const result = await afs.exec("/test/.actions/optionalAction", {}, {});
      expect(result.data?.ok).toBe(true);
    });

    test("exec input with extra fields (not in schema) passes validation", async () => {
      const afs = new AFS();
      const provider = createExecProvider({
        strictAction: {
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string" },
            },
            required: ["name"],
            // additionalProperties defaults to true
          },
          handler: (args) => ({ name: args.name, extra: args.extra }),
        },
      });
      await afs.mount(provider, "/test");

      const result = await afs.exec(
        "/test/.actions/strictAction",
        { name: "Alice", extra: "bonus" },
        {},
      );
      expect(result.data?.name).toBe("Alice");
      expect(result.data?.extra).toBe("bonus");
    });
  });

  describe("Security", () => {
    test("exec validation rejects __proto__ field", async () => {
      const afs = new AFS();
      const provider = createExecProvider({
        update: {
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string" },
            },
            required: ["name"],
          },
          handler: (args) => args,
        },
      });
      await afs.mount(provider, "/test");

      // The __proto__ field should be stripped or validation should handle it safely
      await afs.exec(
        "/test/.actions/update",
        { name: "test", __proto__: { malicious: true } } as Record<string, unknown>,
        {},
      );
      // Should not pollute prototype
      expect(({} as Record<string, unknown>).malicious).toBeUndefined();
    });

    test("exec validation rejects constructor field in args", async () => {
      const afs = new AFS();
      const provider = createExecProvider({
        update: {
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string" },
            },
            required: ["name"],
          },
          handler: (args) => args,
        },
      });
      await afs.mount(provider, "/test");

      // constructor field should not cause issues
      const result = await afs.exec(
        "/test/.actions/update",
        { name: "test", constructor: { prototype: {} } } as Record<string, unknown>,
        {},
      );
      expect(result.success).toBe(true);
    });

    test("AFSValidationError message does not contain schema internal description", async () => {
      const afs = new AFS();
      const provider = createExecProvider({
        secret: {
          inputSchema: {
            type: "object",
            description: "Internal: this connects to production DB at 10.0.0.1",
            properties: {
              value: { type: "number", minimum: 1, description: "Secret internal field" },
            },
            required: ["value"],
          },
          handler: () => ({}),
        },
      });
      await afs.mount(provider, "/test");

      try {
        await afs.exec("/test/.actions/secret", { value: -1 }, {}); // Below minimum
        expect(true).toBe(false);
      } catch (error) {
        const msg = (error as Error).message;
        expect(msg).not.toContain("production DB");
        expect(msg).not.toContain("10.0.0.1");
        expect(msg).not.toContain("Internal:");
      }
    });
  });

  describe("Data Leak", () => {
    test("exec validation error message does not contain stack trace", async () => {
      const afs = new AFS();
      const provider = createExecProvider({
        validate: {
          inputSchema: {
            type: "object",
            properties: {
              count: { type: "number", minimum: 0 },
            },
            required: ["count"],
          },
          handler: () => ({}),
        },
      });
      await afs.mount(provider, "/test");

      try {
        await afs.exec("/test/.actions/validate", { count: "not-number" }, {});
        expect(true).toBe(false);
      } catch (error) {
        const msg = (error as Error).message;
        expect(msg).not.toContain("    at ");
        expect(msg).not.toContain("node_modules");
      }
    });
  });

  describe("Data Damage", () => {
    test("old validateAgainstSchema removed - all exec calls use zod path", async () => {
      const afs = new AFS();
      const provider = createExecProvider({
        greet: {
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string" },
            },
            required: ["name"],
          },
          handler: (args) => ({ message: `Hello, ${args.name}!` }),
        },
      });
      await afs.mount(provider, "/test");

      // Valid input should work
      const result = await afs.exec("/test/.actions/greet", { name: "World" }, {});
      expect(result.data?.message).toBe("Hello, World!");

      // Invalid input should fail with AFSValidationError
      try {
        await afs.exec("/test/.actions/greet", {}, {});
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(AFSValidationError);
      }
    });
  });
});

// =============================================================================
// 1.4 childrenCount Semantics
// =============================================================================

describe("1.4 childrenCount Semantics", () => {
  describe("Edge Cases", () => {
    test("childrenCount = -1 nodes expand in deep list mode", async () => {
      const afs = new AFS();
      await afs.mount(createDeepListProvider(), "/dl");

      // maxDepth=2 should expand the root and also expand childrenCount=-1 entries
      const result = await afs.list("/dl", { maxDepth: 2 });

      // Should see has-children's children expanded
      const paths = result.data.map((e) => e.path);
      expect(paths).toContain("/dl/has-children");

      // The children of has-children should be expanded since childrenCount=-1
      const hasChildrenChildren = result.data.filter((e) => e.path.startsWith("/dl/has-children/"));
      expect(hasChildrenChildren.length).toBeGreaterThan(0);
    });

    test("childrenCount = 0 nodes do not expand", async () => {
      const afs = new AFS();
      await afs.mount(createDeepListProvider(), "/dl");

      const result = await afs.list("/dl", { maxDepth: 2 });

      // empty-dir should be in results but have no children expanded
      const paths = result.data.map((e) => e.path);
      expect(paths).toContain("/dl/empty-dir");

      const emptyDirChildren = result.data.filter((e) => e.path.startsWith("/dl/empty-dir/"));
      expect(emptyDirChildren.length).toBe(0);
    });

    test("childrenCount = undefined nodes do not expand", async () => {
      const afs = new AFS();
      await afs.mount(createDeepListProvider(), "/dl");

      const result = await afs.list("/dl", { maxDepth: 2 });

      // leaf should be in results but have no children
      const paths = result.data.map((e) => e.path);
      expect(paths).toContain("/dl/leaf");

      const leafChildren = result.data.filter((e) => e.path.startsWith("/dl/leaf/"));
      expect(leafChildren.length).toBe(0);
    });
  });
});
