import { describe, expect, mock, test } from "bun:test";
import { type ProviderFactory, ProviderRegistry } from "../src/registry.js";

describe("ProviderRegistry", () => {
  describe("register() + has()", () => {
    test("register makes has() return true", () => {
      const registry = new ProviderRegistry();
      const factory: ProviderFactory = mock(async () => ({}) as any);
      registry.register("custom", factory);
      expect(registry.has("custom")).toBe(true);
    });

    test("has() returns false for unregistered scheme", () => {
      const registry = new ProviderRegistry();
      expect(registry.has("nonexistent")).toBe(false);
    });
  });

  describe("createProvider()", () => {
    test("calls the correct factory and returns provider", async () => {
      const registry = new ProviderRegistry();
      const fakeProvider = { name: "test-provider" } as any;
      const factory: ProviderFactory = mock(async (_mount, _parsed) => fakeProvider);

      registry.register("fs", factory);

      const result = await registry.createProvider({
        path: "/test",
        uri: "fs:///tmp/test",
      });

      expect(result).toBe(fakeProvider);
      expect(factory).toHaveBeenCalledTimes(1);
    });

    test("factory receives (mount, parsed) with correct parsed scheme/path/params", async () => {
      const registry = new ProviderRegistry();
      let receivedMount: any;
      let receivedParsed: any;

      const factory: ProviderFactory = async (mount, parsed) => {
        receivedMount = mount;
        receivedParsed = parsed;
        return {} as any;
      };

      registry.register("fs", factory);

      const mount = { path: "/data", uri: "fs:///my/path?key=value" };
      await registry.createProvider(mount);

      expect(receivedMount).toBe(mount);
      expect(receivedParsed.scheme).toBe("fs");
      expect(receivedParsed.body).toBe("/my/path");
      expect(receivedParsed.query).toEqual({ key: "value" });
    });
  });

  describe("Bad Path", () => {
    test("registered factory error is propagated (not masked by auto-load)", async () => {
      const registry = new ProviderRegistry();
      registry.register("broken", async () => {
        throw new Error("provider creation failed");
      });
      await expect(registry.createProvider({ path: "/x", uri: "broken://foo" })).rejects.toThrow(
        "provider creation failed",
      );
    });

    test("throws for empty URI", async () => {
      const registry = new ProviderRegistry();
      await expect(registry.createProvider({ path: "/x", uri: "" })).rejects.toThrow();
    });

    test("throws for invalid URI format", async () => {
      const registry = new ProviderRegistry();
      await expect(registry.createProvider({ path: "/x", uri: "invalid" })).rejects.toThrow();
    });

    test("factory exception is propagated (not swallowed)", async () => {
      const registry = new ProviderRegistry();
      const factory: ProviderFactory = async () => {
        throw new Error("factory boom");
      };
      registry.register("fs", factory);

      await expect(registry.createProvider({ path: "/x", uri: "fs:///test" })).rejects.toThrow(
        "factory boom",
      );
    });
  });

  describe("Edge Cases", () => {
    test("duplicate register overwrites previous factory", async () => {
      const registry = new ProviderRegistry();
      const first: ProviderFactory = mock(async () => ({ v: 1 }) as any);
      const second: ProviderFactory = mock(async () => ({ v: 2 }) as any);

      registry.register("fs", first);
      registry.register("fs", second);

      const result = await registry.createProvider({ path: "/x", uri: "fs:///test" });
      expect((result as any).v).toBe(2);
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });

    test("scheme is case-insensitive: register('FS') → has('fs') returns true", () => {
      const registry = new ProviderRegistry();
      registry.register(
        "FS",
        mock(async () => ({}) as any),
      );
      expect(registry.has("fs")).toBe(true);
      expect(registry.has("FS")).toBe(true);
    });

    test("multiple registry instances are independent", () => {
      const a = new ProviderRegistry();
      const b = new ProviderRegistry();

      a.register(
        "custom",
        mock(async () => ({}) as any),
      );

      expect(a.has("custom")).toBe(true);
      expect(b.has("custom")).toBe(false);
    });

    test("factory returning Promise.reject propagates correctly", async () => {
      const registry = new ProviderRegistry();
      registry.register("fs", () => Promise.reject(new Error("rejected")));

      await expect(registry.createProvider({ path: "/x", uri: "fs:///test" })).rejects.toThrow(
        "rejected",
      );
    });
  });

  describe("Security", () => {
    test("public API surface includes register/has/createProvider", () => {
      const publicMethods = ["register", "has", "createProvider"];
      for (const method of publicMethods) {
        expect(typeof (ProviderRegistry.prototype as any)[method]).toBe("function");
      }
      // factories map exists but is not accessible via any public method
      const instance = new ProviderRegistry();
      expect((instance as any).factories).toBeInstanceOf(Map);
    });

    test("malicious URI does not crash parseURI (delegated validation)", async () => {
      const registry = new ProviderRegistry();
      registry.register(
        "fs",
        mock(async () => ({}) as any),
      );
      await expect(registry.createProvider({ path: "/x", uri: "://no-scheme" })).rejects.toThrow();
      await expect(
        registry.createProvider({ path: "/x", uri: "a".repeat(10000) }),
      ).rejects.toThrow();
    });
  });

  describe("Data Leak", () => {
    test("registered factory error does not leak other schemes", async () => {
      const registry = new ProviderRegistry();
      registry.register(
        "fs",
        mock(async () => ({}) as any),
      );
      registry.register("custom", async () => {
        throw new Error("custom provider failed");
      });

      try {
        await registry.createProvider({ path: "/x", uri: "custom://foo" });
        expect.unreachable("should have thrown");
      } catch (e: any) {
        expect(e.message).toContain("custom provider failed");
        // Should not leak other registered scheme names
        expect(e.message).not.toContain('"fs"');
      }
    });
  });

  describe("Data Damage", () => {
    test("registering does not affect already-created provider instances", async () => {
      const registry = new ProviderRegistry();
      const provider1 = { name: "p1" } as any;
      registry.register("fs", async () => provider1);

      const created = await registry.createProvider({ path: "/x", uri: "fs:///test" });

      registry.register("fs", async () => ({ name: "p2" }) as any);

      expect(created.name).toBe("p1");
    });

    test("concurrent createProvider calls do not interfere", async () => {
      const registry = new ProviderRegistry();
      let counter = 0;
      registry.register("fs", async () => {
        const id = ++counter;
        await new Promise((r) => setTimeout(r, 10));
        return { id } as any;
      });

      const [a, b, c] = await Promise.all([
        registry.createProvider({ path: "/a", uri: "fs:///a" }),
        registry.createProvider({ path: "/b", uri: "fs:///b" }),
        registry.createProvider({ path: "/c", uri: "fs:///c" }),
      ]);

      const ids = [(a as any).id, (b as any).id, (c as any).id].sort();
      expect(ids).toEqual([1, 2, 3]);
    });
  });
});
